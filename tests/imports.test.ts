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

  it("reads the sponsor storyboard as CSV too", () => {
    const csv = [
      "hospital_id,field,storyboard_value,storyboard_updated,note",
      'SYN-002,Video Eval Location,Patient room,2025-09-14,"Disagrees with the guide"',
    ].join("\n");
    const p = previewImportBundle([
      G,
      { name: "storyboard.csv", text: csv, format: "csv" },
    ]);
    expect(p.errors).toEqual([]);
    expect(p.files[1].kinds).toEqual(["storyboard"]);
    const h = pick(p.hospitals, "SYN-002");
    expect(
      answerField(h, consult(h, "Stroke"), "Video Eval Location").primaryStatus,
    ).toBe("conflict");
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

describe("Seeds come from the importer", () => {
  it("src/data/seeds.json is exactly what `pnpm seeds` makes of the official files", () => {
    const p = previewImportBundle(
      [
        G,
        S,
        {
          name: "contacts.json",
          text: readFileSync("data/seeds/contacts.json", "utf8"),
          format: "json",
        },
      ],
      { version: "Challenge v2" },
    );
    expect(p.errors).toEqual([]);
    const seeds = JSON.parse(readFileSync("src/data/seeds.json", "utf8"));
    expect(JSON.parse(JSON.stringify(p.hospitals))).toEqual(seeds);
    // The kit's two storyboard rows arrive through the real import path.
    expect(
      seedHospitals.flatMap((h) =>
        h.fields.filter((f) => f.sourceKind === "storyboard").map((f) => f.id),
      ),
    ).toEqual([
      "SYN-002:storyboard:video-eval-location",
      "SYN-005:storyboard:thrombolytic",
    ]);
    expect(seedHospitals.every((h) => h.contacts?.length === 3)).toBe(true);
  });
});

describe("Contacts", () => {
  const directory = readFileSync("data/seeds/contacts.json", "utf8");
  const ROLES = ["administrator", "nursing_in_charge", "technical_lead"];

  it("the seed directory covers three roles at every kit hospital and SYN-108", () => {
    const p = previewImport(directory, "json", undefined, {
      fileName: "contacts.json",
    });
    expect(p.errors).toEqual([]);
    const all = p.held.flatMap((h) => h.contacts);
    const ids = [
      ...["001", "002", "003", "004", "005", "006", "007"].map((n) => `SYN-${n}`),
      "SYN-108",
    ];
    for (const id of ids)
      expect(
        all.filter((c) => c.hospitalId === id).map((c) => c.role).sort(),
      ).toEqual(ROLES);
    // Fictional numbers only, and nothing warned about.
    expect(all.every((c) => /^\+1-555-01\d\d$/.test(c.phone))).toBe(true);
    expect(p.diagnostics.join("\n")).not.toContain("555-01xx");
    expect(all.every((c) => c.name.endsWith("(synthetic)"))).toBe(true);
    // Varied on purpose, so the sheet has something to show.
    const hours = all.map((c) => c.availability);
    expect(hours).toContain("24/7");
    expect(hours).toContain("Mon-Fri 0700-1900");
    expect(hours).toContain("As scheduled");
    expect(
      all.some((c) => c.lastVerified && c.lastVerified < "2025-09-18"),
    ).toBe(true);
  });

  it("attaches to active hospitals as a new version and holds the rest", () => {
    const bare = seedHospitals.map(({ contacts: _c, ...h }) => h as Hospital);
    const p = previewImport(directory, "json", undefined, {
      existing: bare,
      fileName: "contacts.json",
    });
    expect(p.errors).toEqual([]);
    expect(p.hospitals).toHaveLength(7);
    const highland = pick(p.hospitals, "SYN-006");
    expect(highland.version).toBe("Challenge v2 +contacts 2026-02-02");
    expect(highland.contacts?.find((c) => c.role === "technical_lead")).toMatchObject({
      id: "SYN-006:contact:technical_lead",
      hospitalId: "SYN-006",
      name: "Priya Raman (synthetic)",
      phone: "+1-555-0177",
      altChannel: "Teams: hvh-telehealth",
      availability: "Mon-Fri 0700-1900",
      lastVerified: "2026-02-02",
      source: "contacts.json",
    });
    // Each hospital carries only its own people.
    for (const h of p.hospitals)
      expect(h.contacts!.every((c) => c.hospitalId === h.id)).toBe(true);
    expect(p.held.map((h) => h.hospitalId)).toEqual(["SYN-108"]);
  });

  it("reads contacts from CSV, and replaces a role rather than duplicating it", () => {
    const csv = [
      "Hospital ID,Role,Name,Phone,Availability,Last Verified",
      "SYN-006,Technical Lead,Robin Example (synthetic),555-0190,24/7,2026-03-01",
    ].join("\n");
    const base = previewImport(directory, "json", undefined, {
      existing: seedHospitals.map(({ contacts: _c, ...h }) => h as Hospital),
    }).hospitals;
    const p = previewImport(csv, "csv", undefined, {
      existing: base,
      fileName: "update.csv",
    });
    expect(p.errors).toEqual([]);
    const [h] = p.hospitals;
    expect(h.version).toBe("Challenge v2 +contacts 2026-03-01");
    expect(h.contacts!.filter((c) => c.role === "technical_lead")).toHaveLength(1);
    expect(h.contacts!.find((c) => c.role === "technical_lead")?.name).toBe(
      "Robin Example (synthetic)",
    );
    expect(h.contacts).toHaveLength(3);
  });

  it("refuses a contact without a phone, naming the row", () => {
    const p = previewImport(
      JSON.stringify({
        contacts: [{ hospital_id: "SYN-006", role: "administrator", name: "No Phone", phone: "" }],
      }),
      "json",
      undefined,
      { fileName: "contacts.json" },
    );
    expect(p.errors).toEqual(["contacts.json, contact 1: No Phone has no phone number."]);
  });
});

describe("Multi-file drop", () => {
  const contacts: ImportFile = {
    name: "directory.json",
    format: "json",
    text: JSON.stringify({
      contacts: [
        {
          hospital_id: "SYN-002",
          role: "technical_lead",
          name: "Tess Example (synthetic)",
          phone: "+1-555-0142",
          availability: "24/7",
          last_verified: "2026-02-02",
        },
      ],
    }),
  };

  it("classifies each file by shape, whatever it is called", () => {
    const p = previewImportBundle([
      { ...S, name: "a.json" },
      { ...contacts, name: "b.json" },
      { ...G, name: "c.json" },
    ]);
    expect(p.errors).toEqual([]);
    expect(p.files.map((f) => [f.name, f.kinds])).toEqual([
      ["a.json", ["storyboard"]],
      ["b.json", ["contacts"]],
      ["c.json", ["guide"]],
    ]);
    expect(p.files.map((f) => [f.hospitals, f.storyboardRows, f.contacts])).toEqual([
      [0, 2, 0],
      [0, 0, 1],
      [7, 0, 0],
    ]);
    const h = pick(p.hospitals, "SYN-002");
    expect(h.contacts?.map((c) => c.name)).toEqual(["Tess Example (synthetic)"]);
    expect(p.diagnostics).toContain(
      "Bluewater Regional Hospital: 21 guide fields + 1 storyboard row + 1 contact; 1 conflict.",
    );
  });

  it("keeps every file's original bytes", () => {
    const p = previewImportBundle([G, S]);
    expect(JSON.parse(p.raw)).toEqual([
      { name: G.name, format: "json", text: guideText },
      { name: S.name, format: "json", text: storyboardText },
    ]);
  });

  it("reports each file's error against that file, and activates nothing", () => {
    const bad: ImportFile = {
      name: "judges_storyboard.json",
      format: "json",
      text: JSON.stringify([
        { hospital_id: "SYN-002", field: "Thrombolytic", storyboard_value: "TNK" },
        { hospital_id: "SYN-002", field: "EEG" },
      ]),
    };
    const p = previewImportBundle([G, bad]);
    expect(p.hospitals).toEqual([]);
    expect(p.files[0].errors).toEqual([]);
    expect(p.files[1].errors).toEqual([
      'judges_storyboard.json, storyboard row 2: no storyboard_value for "EEG". Empty rows are not skipped silently — fill it in or remove the row.',
    ]);
  });

  it("refuses the same hospital's guide in two files", () => {
    const p = previewImportBundle([G, { ...G, name: "copy.json" }]);
    expect(p.hospitals).toEqual([]);
    expect(p.errors[0]).toBe(
      "SYN-001 appears in both hospital_guides.json and copy.json. Import one guide per hospital.",
    );
  });

  it("keeps the existing bounds", () => {
    expect(previewImportBundle([]).errors).toEqual(["No files to import."]);
    expect(
      previewImportBundle(Array.from({ length: 11 }, () => S)).errors,
    ).toEqual(["Import at most 10 files at once."]);
    expect(
      previewImportBundle([{ ...S, text: " ".repeat(1_000_001) }]).errors[0],
    ).toContain("1 MB");
  });
});
