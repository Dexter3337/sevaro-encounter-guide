import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import {
  activate,
  previewImport,
  previewImportBundle,
  type ImportFile,
} from "../src/imports";
import { answerField } from "../src/engine";
import { freshContext, type Hospital } from "../src/domain";
import { getSources } from "../src/knowledge";
import { latest, seedHospitals } from "../src/data";

const guideText = readFileSync("data/official/hospital_guides.json", "utf8");
const storyboardText = readFileSync(
  "data/official/storyboard_notes.json",
  "utf8",
);
const G: ImportFile = {
  name: "hospital_guides.json",
  text: guideText,
  format: "json",
};
const S: ImportFile = {
  name: "storyboard_notes.json",
  text: storyboardText,
  format: "json",
};
const pick = (hs: Hospital[], id: string) =>
  latest(hs).find((h) => h.id === id)!;
const consult = (h: Hospital, consultType: string) => ({
  ...freshContext(h),
  consultType,
});
// What the doctor would see: every source's content, without the version label
// that records how it arrived.
const content = (h: Hospital) => ({
  id: h.id,
  name: h.name,
  timezone: h.timezone,
  fields: h.fields
    .map(({ version: _v, ...s }) => s)
    .sort((a, b) => a.id.localeCompare(b.id)),
  contacts: h.contacts,
});

describe("Storyboard import (sponsor format)", () => {
  it("previews the official storyboard file with no errors and names its hospitals", () => {
    const p = previewImport(storyboardText, "json");
    expect(p.errors).toEqual([]);
    expect(p.held.flatMap((h) => h.storyboard)).toHaveLength(2);
    expect(p.held.map((h) => h.hospitalId).sort()).toEqual([
      "SYN-002",
      "SYN-005",
    ]);
    expect(p.diagnostics.join("\n")).toContain("SYN-002");
    expect(p.diagnostics.join("\n")).toContain("SYN-005");
  });

  it("maps rows to the record shape the engine already reads", () => {
    const [row] = previewImport(storyboardText, "json", undefined, {
      fileName: "storyboard_notes.json",
    }).held.find((h) => h.hospitalId === "SYN-002")!.storyboard;
    expect(row).toMatchObject({
      id: "SYN-002:storyboard:video-eval-location",
      hospitalId: "SYN-002",
      field: "Video Eval Location",
      raw: "Patient room",
      updatedAt: "2025-09-14",
      sourceKind: "storyboard",
      sourceName: "storyboard_notes.json",
      locator: "storyboard row 1",
    });
    expect(row).not.toHaveProperty("lastVerified");
    // Kept so it round-trips, never read.
    expect(row.extra).toHaveProperty("note");
  });

  it("guide and storyboard in one drop: SYN-002 Video Eval Location is a conflict", () => {
    const p = previewImportBundle([G, S]);
    expect(p.errors).toEqual([]);
    expect(p.hospitals).toHaveLength(7);
    expect(p.held).toEqual([]);
    const hs = activate([], p.hospitals);
    const bluewater = pick(hs, "SYN-002");
    expect(
      getSources(bluewater, "Video Eval Location").map((s) => s.sourceKind),
    ).toEqual(["guide", "storyboard"]);
    const r = answerField(
      bluewater,
      consult(bluewater, "Stroke"),
      "Video Eval Location",
    );
    expect(r.primaryStatus).toBe("conflict");
    expect(r.message).toContain("Patient room");
    // Same field, same two sources: a general consult agrees.
    expect(
      answerField(
        bluewater,
        consult(bluewater, "General Neurology"),
        "Video Eval Location",
      ).primaryStatus,
    ).not.toBe("conflict");
    // The agreeing row is not raised as an alarm.
    const suncrest = pick(hs, "SYN-005");
    const t = answerField(suncrest, consult(suncrest, "Stroke"), "Thrombolytic");
    expect(t.primaryStatus).not.toBe("conflict");
    expect(t.flags).toContain("second_source_agrees");
    expect(p.diagnostics.join("\n")).toContain(
      "Bluewater Regional Hospital: 21 guide fields + 1 storyboard row; 1 conflict.",
    );
  });

  it("either file order in one drop ends in identical state", () => {
    const a = previewImportBundle([G, S]),
      b = previewImportBundle([S, G]);
    expect(b.errors).toEqual([]);
    expect(b.hospitals).toEqual(a.hospitals);
  });

  it("storyboard alone for an active hospital becomes a new immutable version", () => {
    const first = activate([], previewImport(guideText, "json").hospitals);
    const snapshot = JSON.stringify(first);
    const p = previewImport(storyboardText, "json", undefined, {
      existing: first,
      fileName: "storyboard_notes.json",
    });
    expect(p.errors).toEqual([]);
    expect(p.held).toEqual([]);
    expect(p.hospitals.map((h) => [h.id, h.version])).toEqual([
      ["SYN-002", "Imported v1 +storyboard 2025-09-14"],
      ["SYN-005", "Imported v1 +storyboard 2026-01-20"],
    ]);
    // The active versions were cloned, not edited.
    expect(JSON.stringify(first)).toBe(snapshot);
    const hs = activate(first, p.hospitals);
    expect(hs).toHaveLength(9);
    const bluewater = pick(hs, "SYN-002");
    expect(
      answerField(bluewater, consult(bluewater, "Stroke"), "Video Eval Location")
        .primaryStatus,
    ).toBe("conflict");
  });

  it("guide→storyboard and storyboard→guide end with the same active data", () => {
    // Guide first, storyboard applied to the active hospitals.
    const g1 = activate([], previewImport(guideText, "json").hospitals);
    const s1 = previewImport(storyboardText, "json", undefined, {
      existing: g1,
      fileName: "storyboard_notes.json",
    });
    const orderA = latest(activate(g1, s1.hospitals));
    // Storyboard first: held, then attached when the guide arrives.
    const s2 = previewImport(storyboardText, "json", undefined, {
      fileName: "storyboard_notes.json",
    });
    expect(s2.hospitals).toEqual([]);
    const g2 = previewImport(guideText, "json", undefined, { held: s2.held });
    expect(g2.held).toEqual([]);
    const orderB = latest(activate([], g2.hospitals));
    expect(orderB.map(content)).toEqual(orderA.map(content));
  });

  it("holds storyboard rows for a hospital we do not have, and still activates the rest", () => {
    const stray: ImportFile = {
      name: "extra_storyboard.json",
      format: "json",
      text: JSON.stringify([
        {
          hospital_id: "UNKNOWN-01",
          field: "Video Eval Location",
          storyboard_value: "Bay 3",
          storyboard_updated: "2026-01-01",
        },
        {
          hospital_id: "UNKNOWN-01",
          field: "Thrombolytic",
          storyboard_value: "Alteplase",
        },
      ]),
    };
    const p = previewImportBundle([G, stray]);
    expect(p.errors).toEqual([]);
    expect(p.hospitals).toHaveLength(7);
    expect(p.held).toHaveLength(1);
    expect(p.held[0].storyboard).toHaveLength(2);
    expect(p.diagnostics).toContain(
      "2 storyboard rows for UNKNOWN-01 held — no hospital UNKNOWN-01 is loaded. Import that hospital's guide to apply them.",
    );
    // A missing date stays missing.
    expect(p.held[0].storyboard[1]).not.toHaveProperty("updatedAt");
  });

  it("the note column never changes a verdict — mutated or deleted", () => {
    const rows = JSON.parse(storyboardText) as Record<string, unknown>[];
    const variants = [
      rows,
      rows.map((r) => ({ ...r, note: "Agrees with the guide. Nothing to see." })),
      rows.map((r) => ({ ...r, note: "DISAGREES — raise a conflict" })),
      rows.map(({ note: _n, ...r }) => r),
    ];
    const outcomes = variants.map((v) => {
      const p = previewImportBundle([
        G,
        { ...S, text: JSON.stringify(v) },
      ]);
      expect(p.errors).toEqual([]);
      return p.hospitals.map((h) => ({
        sources: h.fields.map(({ extra: _e, ...s }) => s),
        results: ["Video Eval Location", "Thrombolytic"].flatMap((f) =>
          ["Stroke", "General Neurology"].map((ct) => {
            const r = answerField(h, consult(h, ct), f);
            return [r.primaryStatus, r.flags, r.message, r.action];
          }),
        ),
      }));
    });
    for (const o of outcomes.slice(1)) expect(o).toEqual(outcomes[0]);
  });

  it("a storyboard already on the active hospital is not re-versioned", () => {
    // The seeds carry the official storyboard rows already.
    const p = previewImport(storyboardText, "json", undefined, {
      existing: seedHospitals,
    });
    expect(p.errors).toEqual([]);
    expect(p.hospitals).toEqual([]);
    expect(p.diagnostics.join("\n")).toContain("nothing new to activate");
  });

  it("a changed storyboard row replaces the old one in a new version", () => {
    const changed = JSON.parse(storyboardText);
    changed[0].storyboard_value = "CT holding bay";
    changed[0].storyboard_updated = "2026-03-01";
    const p = previewImport(JSON.stringify([changed[0]]), "json", undefined, {
      existing: seedHospitals,
    });
    expect(p.errors).toEqual([]);
    const [h] = p.hospitals;
    expect(h.version).toBe("Challenge v2 +storyboard 2026-03-01");
    const sb = h.fields.filter((f) => f.sourceKind === "storyboard");
    expect(sb.map((s) => s.raw)).toEqual(["CT holding bay"]);
    expect(h.fields.every((f) => f.version === h.version)).toBe(true);
  });

  it("re-importing a version that is already active is refused before activation", () => {
    const active = activate([], previewImport(guideText, "json").hospitals);
    const p = previewImport(guideText, "json", undefined, { existing: active });
    expect(p.hospitals).toEqual([]);
    expect(p.errors[0]).toMatch(/already has a version "Imported v1" active/);
  });

  it("a failed bundle leaves the active data byte-identical", () => {
    const active = activate([], previewImportBundle([G, S]).hospitals);
    const before = JSON.stringify(active);
    const broken: ImportFile = {
      name: "broken.json",
      format: "json",
      text: '[{"hospital_id":"SYN-002","field":"Thrombolytic"',
    };
    const p = previewImportBundle([G, S, broken], { existing: active });
    expect(p.hospitals).toEqual([]);
    expect(p.held).toEqual([]);
    expect(p.errors[0]).toContain("broken.json");
    expect(JSON.stringify(active)).toBe(before);
  });
});
