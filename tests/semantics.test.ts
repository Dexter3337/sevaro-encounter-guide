import { describe, it, expect } from "vitest";
import { semantics, meansNo, meansYes } from "../src/knowledge";
import { seedHospitals } from "../src/data";
import { evaluate, gates } from "../src/engine";
import { freshContext, known, makeEvent, hospitalSchema } from "../src/domain";

// Handbook issue 11: one rule switches another off, and the value that does the
// switching may be written in words. Issue 12: a hospital we have never seen
// will phrase things its own way. These check we read meaning, not phrasing.

describe("The lexicon reads meaning, not phrasing", () => {
  const cases: [string, string][] = [
    // flat no
    ["No", "negative"],
    ["None", "negative"],
    ["No routine orders", "negative"],
    ["No medication orders entered by teleneurologist", "negative"],
    ["Not available", "negative"],
    ["Not thrombectomy capable. Teleneurologist communicates.", "negative"],
    ["Not EVT capable. ED arranges transfer.", "negative"],
    ["Teleneurologist does not place orders", "negative"],
    ["Teleneurologist may not enter any orders", "negative"],
    // not applicable
    ["Not applicable", "not_applicable"],
    ["N/A", "not_applicable"],
    // yes, however it is written
    ["Yes", "affirmative"],
    ["Yes - tele-neurology encounter charge before sign-off", "affirmative"],
    ["Yes - all stroke alerts", "affirmative"],
    ["Required before sign-off", "affirmative"],
    ["Required prior to sign-off", "affirmative"],
    ["24/7", "affirmative"],
    ["Full acute stroke order set permitted", "affirmative"],
    // schedules
    ["Mon-Fri 0700-1900", "scheduled"],
    ["Tue/Thu 0800-1500", "scheduled"],
    ["Weekdays 7a-5p", "scheduled"],
    ["Daily 0600-2300; overnight on-call", "scheduled"],
    // branches
    ["Thrombectomy capable Mon-Fri 0700-1900. During coverage, X. Outside coverage, Y.", "conditional"],
    ["Thrombectomy capable Tue/Thu 0800-1600; otherwise ED provider initiates transfer.", "conditional"],
  ];
  for (const [raw, kind] of cases)
    it(`"${raw.slice(0, 48)}" is ${kind}`, () => {
      expect(semantics(raw).kind).toBe(kind);
    });

  it("a trailing exception does not turn a schedule into a no", () => {
    // Routine EEG is available daily here; only continuous EEG is not.
    expect(semantics("Daily 0700-1900; continuous EEG unavailable").kind).toBe(
      "scheduled",
    );
    expect(meansNo("Daily 0700-1900; continuous EEG unavailable")).toBe(false);
  });

  it("an unreadable value is flagged for review, not guessed", () => {
    const s = semantics("By arrangement");
    expect(s.kind).toBe("descriptive");
    expect(s.review).toBe(true);
  });

  it("a value under review neither suppresses guidance nor raises a gate", () => {
    for (const raw of ["By arrangement", "During hospitalist hours", "Ask"]) {
      expect(semantics(raw).review).toBe(true);
      expect(meansNo(raw)).toBe(false);
      expect(meansYes(raw)).toBe(false);
    }
  });
});

describe("The seven kit hospitals read as they always did", () => {
  it("charge requirements are unchanged", () => {
    const required = seedHospitals
      .filter((h) => {
        const g = h.fields.find(
          (s) => s.field === "Charge Entry" && s.sourceKind === "guide",
        );
        return g && meansYes(g.raw);
      })
      .map((h) => h.id);
    expect(required).toEqual(["SYN-002", "SYN-005", "SYN-007"]);
  });

  it("order-entry prohibitions are unchanged", () => {
    const prohibited = seedHospitals
      .filter((h) => {
        const g = h.fields.find(
          (s) => s.field === "Order Entry" && s.sourceKind === "guide",
        );
        return g && meansNo(g.raw);
      })
      .map((h) => h.id);
    expect(prohibited).toEqual(["SYN-004", "SYN-007"]);
  });
});

// A hospital whose guide says the same things in words our seeds never use.
// Nothing about it is in the engine; it arrives purely as data.
const alien = hospitalSchema.parse({
  id: "ALIEN-1",
  name: "St. Aubin Regional · Synthetic",
  timezone: "America/Phoenix",
  version: "alien-v1",
  fields: [
    {
      id: "ALIEN-1:guide:charge",
      hospitalId: "ALIEN-1",
      field: "Charge Entry",
      raw: "Required prior to sign-off",
      sourceKind: "guide",
      version: "alien-v1",
      lastVerified: "2026-02-10",
    },
    {
      id: "ALIEN-1:guide:order-entry",
      hospitalId: "ALIEN-1",
      field: "Order Entry",
      raw: "Teleneurologist does not place orders",
      sourceKind: "guide",
      version: "alien-v1",
      lastVerified: "2026-02-10",
    },
    {
      id: "ALIEN-1:guide:order-set",
      hospitalId: "ALIEN-1",
      field: "Order Set Name",
      raw: 'Search "Aubin Stroke" - "Acute Ischemic Stroke [SYN-99001]"',
      sourceKind: "guide",
      version: "alien-v1",
      lastVerified: "2026-02-10",
    },
    {
      id: "ALIEN-1:guide:ctp",
      hospitalId: "ALIEN-1",
      field: "CT Perfusion",
      raw: "Not currently available",
      sourceKind: "guide",
      version: "alien-v1",
      lastVerified: "2026-02-10",
    },
  ],
});

describe("A hospital that phrases things its own way still reads correctly", () => {
  const context = (over: Partial<ReturnType<typeof freshContext>> = {}) => ({
    ...freshContext(alien),
    ...over,
  });

  it('"Required prior to sign-off" raises the charge gate', () => {
    const gate = gates(alien, context()).find((r) => r.blocksCompletion);
    expect(gate?.title).toBe("Charge Entry");
    expect(gate?.release).toBe("fix_only");
    expect(gate?.action).toBeTruthy();
  });

  it("recording the charge clears it", () => {
    const g = gates(
      alien,
      context({ values: { charge_entered: known(true) } }),
    ).find((r) => r.blocksCompletion);
    expect(g).toBeUndefined();
  });

  it('"does not place orders" hides the order-set name', () => {
    const c = context({
      step: "recommendation" as const,
      consultType: "Stroke",
    });
    const titles = evaluate(
      alien,
      c,
      makeEvent(c, "step_changed"),
    ).map((r) => r.title);
    expect(titles).toContain("Order Entry");
    expect(titles).not.toContain("Order Set Name");
  });

  it("the order-set name is still answerable when asked for directly", () => {
    // Suppressing a proactive nudge is not the same as hiding the record.
    const c = context();
    const entry = evaluate(alien, c, makeEvent(c, "step_changed"));
    expect(entry.every((r) => r.hospitalId === "ALIEN-1")).toBe(true);
    expect(
      alien.fields.some((s) => s.field === "Order Set Name"),
    ).toBe(true);
  });

  it('"Not currently available" is read as a no, with no schedule invented', () => {
    expect(meansNo("Not currently available")).toBe(true);
    const c = context({ step: "imaging" as const, consultType: "Stroke" });
    const ctp = evaluate(alien, c, makeEvent(c, "step_changed")).find(
      (r) => r.title === "CT Perfusion",
    );
    expect(ctp?.message).not.toMatch(/\b\d{3,4}\s*-\s*\d{3,4}\b/);
    expect(ctp?.flags).not.toContain("time_dependent");
  });
});
