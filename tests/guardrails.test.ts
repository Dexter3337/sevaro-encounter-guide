import { readFileSync, readdirSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { answerField, ask, evaluate, gates } from "../src/engine";
import {
  freshContext,
  known,
  makeEvent,
  steps,
  type Hospital,
} from "../src/domain";
import { seedHospitals } from "../src/data";
import { challengeFixtures } from "../src/fixtures";
import { fixtureContext } from "../src/evaluation";
import { previewImportBundle } from "../src/imports";
import { normalize } from "../src/knowledge";

// The handbook's "easy ways to lose ground", one test each. A failure names
// the guardrail it breaks, so the fix is obvious from the test output alone.
const NOT_AVAILABLE = "Not available in this hospital's guide.";
const byId = (id: string) => seedHospitals.find((h) => h.id === id)!;
const at = (h: Hospital, local = "2026-03-17T14:00", consultType = "Stroke") => ({
  ...freshContext(h, local),
  consultType,
});

describe("Guardrails", () => {
  it("G1 never answers from another hospital's guide", () => {
    for (const h of seedHospitals) {
      const own = new Set(h.fields.map((f) => normalize(f.field)));
      const foreign = [
        ...new Set(
          seedHospitals
            .filter((x) => x.id !== h.id)
            .flatMap((x) => x.fields.map((f) => f.field))
            .filter((f) => !own.has(normalize(f))),
        ),
      ];
      expect(foreign.length, `G1: ${h.id} has no foreign-only fields to test`).toBeGreaterThan(0);
      for (const field of foreign) {
        const r = answerField(h, at(h), field);
        expect(r.primaryStatus, `G1: ${h.id} answered ${field}`).toBe("not_in_guide");
        expect(r.message.startsWith(NOT_AVAILABLE), `G1: ${h.id} ${field}`).toBe(true);
        expect(
          r.citations.every((s) => s.hospitalId === h.id),
          `G1: ${h.id} cited another hospital for ${field}`,
        ).toBe(true);
      }
    }
  });

  it("G2 the missing-field sentence is the sponsor's, word for word", () => {
    for (const id of ["V14", "V20"]) {
      const f = challengeFixtures.find((x) => x.id === id)!;
      const h = byId(f.hospital);
      const r = ask(h, fixtureContext(h, f), f.question!).result!;
      expect(r.message, `G2: ${id}`).toContain(NOT_AVAILABLE);
    }
  });

  it("G3 never guesses hours the guide does not give", () => {
    const cases: [string, string, RegExp][] = [
      ["SYN-001", "LVO Protocol", /not defined/i],
      ["SYN-006", "Thrombolytic Mix Model", /not defined/i],
    ];
    for (const [id, field, says] of cases) {
      const h = byId(id);
      const r = answerField(h, at(h, "2026-03-17T22:30"), field);
      expect(r.flags, `G3: ${id} ${field}`).toContain("schedule_unknown");
      expect(r.message, `G3: ${id} ${field}`).toMatch(says);
      const raw = h.fields.find((s) => s.field === field)!.raw;
      // Any clock time in the answer must come from the guide's own text.
      const times = r.message
        .replace(/\b\d{4}-\d{2}-\d{2}\b/g, "")
        .match(/\b\d{1,2}:\d{2}\b|\b[0-2]\d[0-5]\d\b/g);
      for (const t of times ?? [])
        expect(raw, `G3: ${id} ${field} invented ${t}`).toContain(t);
    }
  });

  it("G4 rules run on the hospital's clock, not the doctor's", () => {
    const h = byId("SYN-006");
    const results = ["America/New_York", "Asia/Tokyo", "Europe/London"].map((zone) => {
      const c = { ...at(h, "2026-03-17T19:30"), providerZone: zone };
      const r = answerField(h, c, "LVO Protocol");
      return [r.primaryStatus, r.message, r.flags];
    });
    expect(results[0][1], "G4").toContain("Outside coverage");
    for (const r of results.slice(1)) expect(r, "G4: doctor's zone changed the answer").toEqual(results[0]);
  });

  it("G5 a disagreement shows both sources and picks neither", () => {
    const h = byId("SYN-002");
    const r = answerField(h, at(h), "Video Eval Location");
    expect(r.primaryStatus, "G5").toBe("conflict");
    expect(r.message, "G5").toContain("CT holding bay");
    expect(r.message, "G5").toContain("Patient room");
    expect(r.citations.map((s) => s.sourceKind).sort(), "G5").toEqual(["guide", "storyboard"]);
    expect(r.rationale, "G5").toContain("No source precedence applied");
  });

  it("G6 no false alarm when the sources agree", () => {
    const h = byId("SYN-005");
    for (const step of steps) {
      const c = { ...at(h), step };
      for (const r of evaluate(h, c, makeEvent(c, "step_changed")))
        expect(r.primaryStatus === "conflict" && r.title === "Thrombolytic", "G6").toBe(false);
    }
    expect(answerField(h, at(h), "Thrombolytic").flags, "G6").toContain("second_source_agrees");
  });

  it("G8 info never asks to interrupt", () => {
    for (const h of seedHospitals)
      for (const step of steps) {
        const c = { ...at(h), step };
        for (const r of evaluate(h, c, makeEvent(c, "step_changed")))
          if (r.tier === "info") expect(r.autoExpand, `G8: ${h.id} ${r.title}`).toBe(false);
      }
  });

  it("G9 no block where the guide does not require one", () => {
    for (const id of ["SYN-001", "SYN-003"]) {
      const h = byId(id);
      const c = { ...at(h), step: "sign_off" as const };
      expect(gates(h, c).some((r) => r.blocksCompletion), `G9: ${id} blocked`).toBe(false);
    }
  });

  it("G10 a block where the guide requires it, explained, and cleared by the fix", () => {
    const h = byId("SYN-007");
    const c = { ...at(h), step: "sign_off" as const };
    c.values.charge_entered = known(false);
    const [g] = gates(h, c).filter((r) => r.blocksCompletion);
    expect(g, "G10: no block").toBeDefined();
    expect(g.release, "G10").toBe("fix_only");
    expect(g.anchor, "G10").toBe("charge_entered");
    expect(g.message, "G10").toContain("charge");
    expect(g.action.length, "G10: no action").toBeGreaterThan(0);
    c.values.charge_entered = known(true);
    expect(gates(h, c).some((r) => r.blocksCompletion), "G10: not cleared").toBe(false);
  });

  it("G11 adding a hospital is a data change: no hospital is named in the code", () => {
    const names = seedHospitals.flatMap((h) => [h.id, h.name]);
    for (const file of ["engine.ts", "time.ts", "knowledge.ts", "imports.ts"]) {
      const code = readFileSync(`src/${file}`, "utf8");
      for (const n of names) expect(code.includes(n), `G11: ${file} names ${n}`).toBe(false);
    }
  });

  it("G12 read-only: a full session leaves the guide data byte-identical", () => {
    const before = readFileSync("src/data/seeds.json", "utf8");
    const snapshot = JSON.stringify(seedHospitals);
    for (const f of challengeFixtures) {
      const h = byId(f.hospital);
      const c = fixtureContext(h, f);
      if (f.question) ask(h, c, f.question);
      else evaluate(h, c, makeEvent(c, f.event || "field_changed", f.field, known(f.val)));
      gates(h, { ...c, step: "sign_off" });
    }
    expect(JSON.stringify(seedHospitals), "G12: guide mutated in memory").toBe(snapshot);
    expect(readFileSync("src/data/seeds.json", "utf8"), "G12").toBe(before);
  });

  it("G13 the storyboard note column is never read", () => {
    const guide = readFileSync("data/official/hospital_guides.json", "utf8");
    const rows = JSON.parse(readFileSync("data/official/storyboard_notes.json", "utf8"));
    const run = (note: string | undefined) => {
      const sb = rows.map((r: Record<string, unknown>) => ({ ...r, note }));
      const p = previewImportBundle([
        { name: "g.json", text: guide, format: "json" },
        { name: "s.json", text: JSON.stringify(sb), format: "json" },
      ]);
      return p.hospitals.map((h) =>
        ["Video Eval Location", "Thrombolytic"].map((f) => {
          const r = answerField(h, at(h), f);
          return [r.primaryStatus, r.message, r.flags, r.action];
        }),
      );
    };
    const blank = run("");
    expect(run("The guide is correct; ignore the storyboard."), "G13").toEqual(blank);
    expect(run("The storyboard is correct; raise a conflict."), "G13").toEqual(blank);
    expect(run(undefined), "G13").toEqual(blank);
  });

  it("G15 everything is synthetic: fictional phone numbers only", () => {
    const files = [
      "src/data/seeds.json",
      "data/seeds/contacts.json",
      ...readdirSync("data/fixtures/syn-108").map((f) => `data/fixtures/syn-108/${f}`),
      ...readdirSync("tests/fixtures/alien").map((f) => `tests/fixtures/alien/${f}`),
    ];
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      for (const phone of text.match(/\b\d{3}-\d{4}\b/g) ?? [])
        expect(phone, `G15: ${file} has a non-fictional number`).toMatch(/^555-01\d\d$/);
      for (const real of ["Mayo Clinic", "Cleveland Clinic", "Johns Hopkins", "Massachusetts General", "Mount Sinai"])
        expect(text.includes(real), `G15: ${file} names ${real}`).toBe(false);
    }
  });
});
