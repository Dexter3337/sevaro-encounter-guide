import { expect, it } from "vitest";
import { seedHospitals } from "../src/data";
import { evaluate, answerField } from "../src/engine";
import { ask, gates } from "../src/engine";
import { freshContext, makeEvent, known } from "../src/domain";
import { importEncounterContext } from "../src/adapter";
it("T01 opening presents two scoped facts", () => {
  const h = seedHospitals[2],
    c = freshContext(h);
  expect(
    evaluate(h, c, makeEvent(c, "encounter_opened")).map((r) => r.title),
  ).toEqual(["Video Eval Location", "Wake Up Protocol"]);
});
it("T03 positive relevant allergy, negative/unrelated allergies stay quiet", () => {
  const h = seedHospitals[0],
    c = { ...freshContext(h), step: "history" as const };
  for (const a of [
    "none",
    "penicillin allergy",
    "no alteplase allergy",
    "denies alteplase allergy",
  ])
    expect(
      evaluate(
        h,
        { ...c, values: { allergies: known(a) } },
        makeEvent(c, "field_changed", "allergies"),
      ),
    ).toHaveLength(0);
  expect(
    evaluate(
      h,
      { ...c, values: { allergies: known("alteplase allergy") } },
      makeEvent(c, "field_changed", "allergies"),
    )[0].title,
  ).toBe("Thrombolytic");
});
it("T07 focuses permission guidance without asserting order fact", () => {
  const h = seedHospitals[2],
    c = { ...freshContext(h), step: "recommendation" as const };
  const rs = evaluate(
    h,
    c,
    makeEvent(c, "field_focused", "thrombolytic_order_placed"),
  );
  // Action guidance at this step is the permission pair; the rest of the step
  // is capability context, which must not be mistaken for something to do.
  expect(rs.filter((r) => r.tier === "advisory").map((r) => r.title)).toEqual([
    "Order Entry",
    "Order Set Name",
  ]);
  expect(c.values).toEqual({});
});
it("T08 EEG mentioned in assessment invokes source availability", () => {
  const h = seedHospitals[3],
    c = {
      ...freshContext(h, "2026-03-19T10:00"),
      step: "recommendation" as const,
      values: {
        assessment_plan: known("Request EEG for synthetic seizure evaluation"),
      },
    };
  expect(
    evaluate(h, c, makeEvent(c, "field_changed", "assessment_plan")).find(
      (r) => r.title === "EEG",
    )!.primaryStatus,
  ).toBe("stale");
});
it("order guidance is proactive on display and survives unrelated edits", () => {
  const h = seedHospitals[2];
  const c = { ...freshContext(h), step: "recommendation" as const };
  for (const event of [
    makeEvent(c, "step_changed"),
    makeEvent(c, "field_changed", "assessment_plan", known("Observe")),
    makeEvent(c, "clock_changed"),
  ]) {
    expect(
      evaluate(h, c, event)
        .filter((r) => r.anchor === "thrombolytic_order_placed")
        .map((r) => r.title),
    ).toEqual(["Order Entry", "Order Set Name"]);
  }
  expect(
    evaluate(h, { ...c, step: "history" }, makeEvent(c, "step_changed")).some(
      (r) => r.anchor === "thrombolytic_order_placed",
    ),
  ).toBe(false);
});
it("T09 creates note-title guidance even before typing", () => {
  const h = seedHospitals[2],
    c = { ...freshContext(h), step: "note" as const };
  expect(evaluate(h, c, makeEvent(c, "step_changed"))[0].message).toContain(
    "Neurology Consult - Remote",
  );
});
it("adapter rejects offset/zone-local disagreement", () => {
  const h = seedHospitals[5];
  expect(() =>
    importEncounterContext(
      {
        hospital_id: h.id,
        local_time: "2026-03-17T19:30",
        local_timezone: h.timezone,
        instant: "2026-03-17T19:30:00Z",
      },
      h,
    ),
  ).toThrow("disagree");
  expect(
    importEncounterContext(
      {
        hospital_id: h.id,
        local_time: "2026-03-17T19:30",
        instant: "2026-03-18T00:30:00Z",
      },
      h,
    ).instant,
  ).toBe("2026-03-18T00:30:00Z");
});
it("conditional new gate stays quoted/reviewable without execution", () => {
  const h = {
    ...seedHospitals[6],
    fields: seedHospitals[6].fields.map((s) =>
      s.field === "Charge Entry"
        ? { ...s, raw: "Yes if patient requests a printed copy" }
        : s,
    ),
  };
  const c = { ...freshContext(h), step: "sign_off" as const };
  expect(
    evaluate(h, c, makeEvent(c, "completion_requested")).some(
      (r) => r.blocksCompletion,
    ),
  ).toBe(false);
  expect(answerField(h, c, "Charge Entry").flags).toContain(
    "interpretation_review",
  );
});
it("renamed source fields reuse documented aliases while preserving labels", () => {
  const h = {
    ...seedHospitals[5],
    fields: seedHospitals[5].fields.map((s) =>
      s.field === "LVO Protocol" ? { ...s, field: "LVO Pathway" } : s,
    ),
  };
  const r = answerField(h, freshContext(h, "2026-03-17T19:30"), "LVO Protocol");
  expect(r.message).toContain("ED provider initiates transfer");
  expect(r.citations[0].field).toBe("LVO Pathway");
});
it("a non-required guide fact conflicting with required storyboard is visible at completion", () => {
  const h = {
    ...seedHospitals[0],
    fields: [
      ...seedHospitals[0].fields,
      {
        ...seedHospitals[0].fields.find((s) => s.field === "Charge Entry")!,
        id: "second-charge-source",
        sourceKind: "storyboard" as const,
        raw: "Yes",
      },
    ],
  };
  const c = freshContext(h);
  const rs = gates(h, c);
  expect(rs[0].primaryStatus).toBe("conflict");
  expect(rs[0].blocksCompletion).toBe(false);
  const r = ask(h, c, "Can I sign off now?").result!;
  expect(r.message).toContain("cannot be fully verified");
  expect(r.message).not.toContain("recorded as satisfied");
  expect(r.citations).toHaveLength(2);
});
it("satisfied plan answer cites the plan requirement rather than only the charge field", () => {
  const h = seedHospitals[3],
    c = freshContext(h);
  c.values.plan_confirmed = known(true);
  const r = ask(h, c, "Can I sign off now?").result!;
  expect(r.message).toContain("recorded as satisfied");
  expect(r.citations.some((s) => s.field === "Consult Completion Rule")).toBe(
    true,
  );
});
it("current EEG guidance suppresses negated, historical and question-only text", () => {
  const h = seedHospitals[3];
  const c = { ...freshContext(h), step: "recommendation" as const };
  for (const text of [
    "No seizure concern and no EEG planned",
    "Should EEG be obtained?",
    "History of seizure yesterday",
    "No EEG planned. Obtain routine EEG now for current seizure concern",
  ]) {
    const rs = evaluate(
      h,
      { ...c, values: { assessment_plan: known(text) } },
      makeEvent(c, "field_changed", "assessment_plan"),
    );
    expect(rs.some((r) => r.title === "EEG")).toBe(
      text.startsWith("No EEG planned."),
    );
  }
});
it("an undocumented capability is named on arrival but never once a value exists", () => {
  // SYN-006 documents no CTA row at all.
  const h = seedHospitals[5];
  const c = { ...freshContext(h), step: "imaging" as const };
  const onArrival = evaluate(h, c, makeEvent(c, "step_changed"));
  const cta = onArrival.find((r) => r.title === "CTA Head/Neck")!;
  expect(cta.primaryStatus).toBe("not_in_guide");
  expect(cta.tier).toBe("info");
  expect(cta.message).toContain("Confirm locally");
  expect(cta.citations).toHaveLength(0);
  expect(cta.missingEvidence?.absent).toBe(true);
  // A recorded observation outranks an omission; the row must not argue with it.
  for (const recorded of [known(true), known(false)])
    expect(
      evaluate(
        h,
        { ...c, values: { cta_done: recorded } },
        makeEvent(c, "field_changed", "cta_done"),
      ).some((r) => r.title === "CTA Head/Neck"),
    ).toBe(false);
});
