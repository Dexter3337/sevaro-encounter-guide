import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { previewImportBundle, type ImportFile } from "../src/imports";
import { answerField, ask, evaluate, gates } from "../src/engine";
import { freshContext, known, makeEvent, type Hospital } from "../src/domain";
import { seedHospitals } from "../src/data";

// The alien-data dry run: two hospitals written to the guardrails spec, not to
// our importer. St. Aubin is plausible but differently worded; Nordhaven is
// hostile at the edges. Each assertion is what a judge would expect to see.
const file = (name: string): ImportFile => ({
  name,
  text: readFileSync(`tests/fixtures/alien/${name}`, "utf8"),
  format: "json",
});
const load = (a: string, b: string) => {
  const p = previewImportBundle([file(a), file(b)], { existing: seedHospitals });
  return { p, h: p.hospitals[0] as Hospital };
};
const at = (h: Hospital, local = "2026-03-17T10:00", consultType = "Stroke") => ({
  ...freshContext(h, local),
  consultType,
});

describe("ALIEN-1 St. Aubin Regional", () => {
  const { p, h } = load("st-aubin_guides.json", "st-aubin_storyboard.json");

  it("imports, in Anchorage time, with both storyboard rows attached", () => {
    expect(p.errors).toEqual([]);
    expect(h.timezone).toBe("America/Anchorage");
    expect(h.fields.filter((f) => f.sourceKind === "storyboard")).toHaveLength(2);
  });

  it("reads its differently worded field names", () => {
    const names = h.fields.map((f) => f.field);
    expect(names).toContain("CTA Head/Neck");
    expect(names).toContain("Required Note Title");
    expect(names).toContain("Charge Entry");
    expect(names).toContain("Language Line");
  });

  it("answers the note title and charge questions from its own guide", () => {
    expect(
      ask(h, at(h), "What should I title the note?").result!.message,
    ).toContain("Telestroke Consultation - Remote");
    const c = at(h);
    c.values.charge_entered = known(false);
    expect(gates(h, c).some((r) => r.blocksCompletion)).toBe(true);
  });

  it("'Not EVT capable' is read as not thrombectomy capable, with the transfer action", () => {
    const r = answerField(h, at(h), "LVO Protocol");
    expect(r.flags).not.toContain("interpretation_review");
    expect(r.message).toContain("ED arranges transfer");
  });

  it("EEG weekends on request is not reported as unavailable", () => {
    // Saturday 21 March, 11:00 Anchorage.
    const r = answerField(h, at(h, "2026-03-21T11:00"), "EEG");
    expect(r.message).not.toMatch(/^Not available in the listed window/);
    expect(r.flags).toContain("schedule_unknown");
  });

  it("'By arrangement' rounding hours are undefined, not invented", () =>
    expect(answerField(h, at(h), "Rounding Timing").flags).toContain(
      "schedule_unknown",
    ));

  it("fields with no verification date say so", () =>
    expect(answerField(h, at(h), "Thrombolytic").flags).toContain(
      "verification_unknown",
    ));

  it("Video Eval disagrees for a stroke alert; Thrombolytic agrees quietly", () => {
    expect(answerField(h, at(h), "Video Eval Location").primaryStatus).toBe(
      "conflict",
    );
    const t = answerField(h, at(h), "Thrombolytic");
    expect(t.primaryStatus).not.toBe("conflict");
    expect(t.flags).toContain("second_source_agrees");
  });

  it("the new field is answerable and never nudges", () => {
    expect(ask(h, at(h), "language line").result!.message).toContain("555-0170");
    const c = at(h);
    for (const step of ["intake", "history", "imaging", "recommendation", "note", "sign_off"] as const) {
      const rs = evaluate(h, { ...c, step }, makeEvent({ ...c, step }, "step_changed"));
      expect(rs.some((r) => r.title === "Language Line")).toBe(false);
    }
  });
});

describe("ALIEN-2 Nordhaven Medical", () => {
  const { p, h } = load("nordhaven_guides.json", "nordhaven_storyboard.json");

  it("imports a bare array in London time with all three storyboard rows", () => {
    expect(p.errors).toEqual([]);
    expect(h.timezone).toBe("Europe/London");
    expect(
      h.fields.filter((f) => f.sourceKind === "storyboard" && f.field === "Video Eval Location"),
    ).toHaveLength(3);
  });

  it("three storyboard rows, two disagreeing: a conflict showing every row", () => {
    const r = answerField(h, at(h), "Video Eval Location");
    expect(r.primaryStatus).toBe("conflict");
    for (const v of ["Resus room 2", "Ward side room", "CT control room"])
      expect(r.message).toContain(v);
  });

  it("'may not enter any orders' is a no, and the N/A order set is suppressed", () => {
    const c = { ...at(h), step: "recommendation" as const };
    const rs = evaluate(h, c, makeEvent(c, "step_changed"));
    expect(rs.some((r) => r.title === "Order Set Name")).toBe(false);
    const entry = rs.find((r) => r.title === "Order Entry")!;
    expect(entry.message).toContain("may not enter any orders");
    expect(entry.message).not.toMatch(/\bN\/A\b/);
  });

  it("'Required prior to sign-off' blocks until the charge is recorded", () => {
    const c = at(h);
    c.values.charge_entered = known(false);
    expect(gates(h, c).some((r) => r.blocksCompletion)).toBe(true);
  });

  it("the mix model is both stale and undefined hours", () => {
    const r = answerField(h, at(h), "Thrombolytic Mix Model");
    expect(r.flags).toContain("stale");
    expect(r.flags).toContain("schedule_unknown");
  });

  it("an oddly written field name still binds", () =>
    expect(h.fields.some((f) => f.field === "CTA Head/Neck")).toBe(true));

  it("hostile text stays inert text, and does not change any other answer", () => {
    const r = ask(h, at(h), "Connection instructions").result!;
    expect(r.message).toContain("<img src=x");
    expect(answerField(h, at(h), "CT Perfusion").primaryStatus).toBe("not_in_guide");
  });

  it("schedules follow London's clocks, not America's", () => {
    // 2026-03-23 is a Monday: the UK is still on GMT, the US already on EDT.
    // 08:30 London is inside Mon-Fri 0800-1800.
    const r = answerField(h, at(h, "2026-03-23T08:30"), "CTA Head/Neck");
    expect(r.primaryStatus).not.toBe("not_in_guide");
    expect(r.message).toContain("Mon-Fri 0800-1800");
  });
});
