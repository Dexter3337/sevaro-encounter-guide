import { describe, it, expect } from "vitest";
import { seedHospitals } from "../src/data";
import {
  gates,
  blocksUntilConfirmed,
  unboundFields,
  boundFields,
  completionChecklist,
} from "../src/engine";
import { freshContext, known, hospitalSchema, type Context } from "../src/domain";

// Handbook issue 10: a hard stop blocks the doctor until they fix something or
// acknowledge it. Used too often it gets in the way; used too rarely, mistakes
// slip through. Only block where the guide truly requires it, and explain why.

const h = (id: string) => seedHospitals.find((x) => x.id === id)!;
const ctx = (id: string, over: Partial<Context> = {}): Context => ({
  ...freshContext(h(id)),
  ...over,
});

describe("Blocking only where the guide requires it", () => {
  it("a hospital that requires a charge blocks until one is recorded", () => {
    const g = gates(h("SYN-007"), ctx("SYN-007")).find((r) => r.blocksCompletion)!;
    expect(g.title).toBe("Charge Entry");
    expect(g.release).toBe("fix_only");
  });

  it("recording it clears the block", () => {
    const g = gates(
      h("SYN-007"),
      ctx("SYN-007", { values: { charge_entered: known(true) } }),
    ).find((r) => r.blocksCompletion);
    expect(g).toBeUndefined();
  });

  it("hospitals that do not require a charge are never blocked for one", () => {
    // SYN-004 is in this list: its guide requires no charge. It does block on
    // its own completion rule, which is a different requirement.
    for (const id of ["SYN-001", "SYN-003", "SYN-004", "SYN-006"])
      expect(
        gates(h(id), ctx(id)).some(
          (r) => r.blocksCompletion && r.title === "Charge Entry",
        ),
        `${id} blocked on a charge it does not require`,
      ).toBe(false);
  });

  it("a hospital with neither requirement completes straight away", () => {
    for (const id of ["SYN-001", "SYN-003", "SYN-006"])
      expect(
        gates(h(id), ctx(id)).some((r) => r.blocksCompletion),
        `${id} blocked`,
      ).toBe(false);
  });

  // Unknown, No and Not applicable are all "not recorded". Only an explicit
  // yes satisfies a requirement.
  it("only an explicit yes satisfies the requirement", () => {
    for (const v of [known(false), { state: "unknown" } as const, { state: "not_applicable" } as const])
      expect(
        gates(h("SYN-007"), ctx("SYN-007", { values: { charge_entered: v } })).some(
          (r) => r.blocksCompletion,
        ),
      ).toBe(true);
  });

  it("the plan-confirmation gate can be acknowledged, since the doctor cannot force it", () => {
    const g = gates(
      h("SYN-004"),
      ctx("SYN-004", { consultType: "General Neuro" }),
    ).find((r) => r.blocksCompletion)!;
    expect(g.title).toBe("Consult Completion Rule");
    expect(g.release).toBe("acknowledge_with_reason");
    expect(g.action).toContain("acknowledge with a reason");
  });
});

// Hospitals word the same rule differently. Tying the gate to one sentence
// meant an unfamiliar guide's requirement would pass unnoticed.
describe("Recognising a completion rule however it is written", () => {
  const holds = [
    "Do not complete the consult in Synapse until the hospital provider confirms the patient plan",
    "Consult may not be closed before attending sign-off",
    "Encounter must not be finalized until provider confirmation",
    "Encounter must not be finalised until provider confirmation",
    "Do not sign off until the hospitalist verifies the plan",
    "Do not submit the consult until the attending approves",
    "Hold completion pending provider confirmation",
    "Completion is blocked until the attending approves",
  ];
  for (const raw of holds)
    it(`holds: "${raw.slice(0, 52)}…"`, () =>
      expect(blocksUntilConfirmed(raw)).toBe(true));

  const doesNot = [
    "Complete the consult once the exam is documented",
    "Teleneurologist completes the consult",
    "Do not complete the note in the EHR", // a prohibition, but nothing releases it
    "No completion requirement",
  ];
  for (const raw of doesNot)
    it(`does not hold: "${raw.slice(0, 52)}"`, () =>
      expect(blocksUntilConfirmed(raw)).toBe(false));
});

// Blocking on a requirement that may not exist stops a doctor finishing a case
// for no reason. Waving it through lets a real requirement past in silence.
describe("When we cannot tell whether the step is required", () => {
  const uncertain = (raw: string, extra: Record<string, unknown> = {}) =>
    hospitalSchema.parse({
      id: "UNSURE",
      name: "Unsure Regional · Synthetic",
      timezone: "America/New_York",
      version: "v1",
      fields: [
        {
          id: "g",
          hospitalId: "UNSURE",
          field: "Charge Entry",
          raw,
          sourceKind: "guide",
          version: "v1",
          lastVerified: "2026-02-02",
          ...extra,
        },
      ],
    });

  // A requirement that may be out of date is still the guide's latest word.
  // Letting it stop blocking would let the rule it describes slip through;
  // the doctor, who may know it has changed, can release it with a reason.
  it("a stale requirement still blocks, and can be released with a reason", () => {
    const hosp = uncertain("Yes", { lastVerified: "2025-01-01" });
    const g = gates(hosp, freshContext(hosp))[0];
    expect(g.blocksCompletion).toBe(true);
    expect(g.flags).toContain("uncertain_requirement");
    expect(g.release).toBe("acknowledge_with_reason");
  });

  it("recording it clears a stale requirement like any other", () => {
    const hosp = uncertain("Yes", { lastVerified: "2025-01-01" });
    const c = { ...freshContext(hosp), values: { charge_entered: known(true) } };
    expect(gates(hosp, c).some((r) => r.blocksCompletion)).toBe(false);
  });

  it("it says what may have changed, in words a doctor can act on", () => {
    const hosp = uncertain("Yes", { lastVerified: "2025-01-01" });
    const g = gates(hosp, freshContext(hosp))[0];
    expect(g.message).toContain("may not be current");
    expect(g.message).toContain("2025-01-01");
    expect(g.action).toContain("Unsure Regional");
    expect(g.action).toContain("acknowledge with a reason");
    // Not the internal vocabulary we used to show.
    expect(g.message).not.toMatch(/prototype policy|no new completion gate/i);
  });

  // Old, and requiring nothing, is still the guide saying nothing is
  // required. Raising it at every sign-off would only be noise.
  it("a stale rule that requires nothing raises no gate", () => {
    const hosp = uncertain("No", { lastVerified: "2025-01-01" });
    expect(gates(hosp, freshContext(hosp))).toEqual([]);
  });

  it("but the checklist says it was last checked long ago", () => {
    const hosp = uncertain("No", { lastVerified: "2025-01-01" });
    const i = completionChecklist(hosp, freshContext(hosp))[0];
    expect(i.state).toBe("not_required");
    expect(i.text).toContain("Last checked 2025-01-01");
  });

  it("a requirement we cannot read raises no gate", () => {
    const hosp = uncertain("Charge entry is handled per departmental agreement");
    const g = gates(hosp, freshContext(hosp))[0];
    expect(g?.blocksCompletion ?? false).toBe(false);
  });
});

// Handbook issue 12: a new hospital's guide arrives with a field none of the
// others have. Adding a field must stay a data change.
describe("Fields no trigger covers", () => {
  it("are listed per hospital, not silently dropped", () => {
    for (const hosp of seedHospitals) {
      const unbound = unboundFields(hosp);
      expect(unbound.length, hosp.id).toBeGreaterThan(0);
      for (const f of unbound)
        expect(hosp.fields.some((s) => s.field === f), `${hosp.id} ${f}`).toBe(true);
    }
  });

  it("never include a field the engine already nudges on", () => {
    for (const hosp of seedHospitals)
      for (const f of unboundFields(hosp))
        expect(boundFields as readonly string[], `${hosp.id} ${f}`).not.toContain(f);
  });

  it("a brand-new field name appears there", () => {
    const hosp = hospitalSchema.parse({
      id: "NEWFIELD",
      name: "New Field · Synthetic",
      timezone: "America/New_York",
      version: "v1",
      fields: [
        { id: "a", hospitalId: "NEWFIELD", field: "Interpreter Line", raw: "Ext 4821", sourceKind: "guide", version: "v1", lastVerified: "2026-02-02" },
        { id: "b", hospitalId: "NEWFIELD", field: "Charge Entry", raw: "Yes", sourceKind: "guide", version: "v1", lastVerified: "2026-02-02" },
      ],
    });
    expect(unboundFields(hosp)).toEqual(["Interpreter Line"]);
  });

  it("a field an imported mapping covers is not unbound", () => {
    const hosp = hospitalSchema.parse({
      id: "MAPPED",
      name: "Mapped · Synthetic",
      timezone: "America/New_York",
      version: "v1",
      fields: [
        { id: "a", hospitalId: "MAPPED", field: "Interpreter Line", raw: "Ext 4821", sourceKind: "guide", version: "v1", lastVerified: "2026-02-02" },
      ],
      mappings: [
        {
          id: "m1",
          fieldId: "interpreter_needed",
          label: "Interpreter needed",
          step: "intake",
          sourceField: "Interpreter Line",
          condition: { op: "equals", field: "interpreter_needed", value: "Yes" },
          tier: "info",
        },
      ],
    });
    expect(unboundFields(hosp)).toEqual([]);
  });
});

// A doctor who records "No" and is allowed to complete should see why. The
// sign-off checklist says where this hospital stands on every completion rule,
// including the ones it does not have.
describe("The sign-off checklist", () => {
  const item = (id: string, field: string, over: Partial<Context> = {}) =>
    completionChecklist(h(id), ctx(id, over)).find((i) => i.field === field)!;

  it("says a charge is not required where the guide says No", () => {
    const i = item("SYN-006", "Charge Entry", { values: { charge_entered: known(false) } });
    expect(i.state).toBe("not_required");
    expect(i.text).toContain("Not required by Highland Valley Hospital");
  });

  it("says a charge is missing where the guide requires one", () => {
    const i = item("SYN-007", "Charge Entry", { values: { charge_entered: known(false) } });
    expect(i.state).toBe("missing");
    expect(i.result?.blocksCompletion).toBe(true);
  });

  it("says it is satisfied once recorded", () => {
    expect(
      item("SYN-007", "Charge Entry", { values: { charge_entered: known(true) } }).state,
    ).toBe("satisfied");
  });

  it("says when the guide is silent rather than implying no requirement", () => {
    expect(item("SYN-001", "Consult Completion Rule").state).toBe("not_in_guide");
  });
});
