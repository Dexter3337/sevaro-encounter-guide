import { describe, it, expect } from "vitest";
import {
  dockReducer,
  initialDock,
  pillSummary,
  orderForField,
  type DockModel,
} from "../src/guidance/dockMachine";
import { seedHospitals } from "../src/data";
import { evaluate } from "../src/engine";
import { freshContext, known, makeEvent, type Context, type Result } from "../src/domain";

// Nudge fatigue is the main design risk the brief names. These check the dock
// is reluctant to interrupt, and that when it does it has a reason.

const h = (id: string) => seedHospitals.find((x) => x.id === id)!;
const results = (id: string, over: Partial<Context>, previous: Result[] = []) => {
  const c = { ...freshContext(h(id)), ...over } as Context;
  // Completion gates are only evaluated when the doctor tries to complete.
  const type =
    c.step === "sign_off"
      ? "completion_requested"
      : over.values
        ? "field_changed"
        : "step_changed";
  return evaluate(h(id), c, makeEvent(c, type), previous);
};
const run = (events: Parameters<typeof dockReducer>[1][], from: DockModel = initialDock) =>
  events.reduce(dockReducer, from);

describe("The dock stays out of the way", () => {
  it("is not on screen at all when nothing applies", () => {
    const m = run([{ type: "RESULTS", results: [] }]);
    expect(m.state).toBe("hidden");
  });

  it("shows only a pill when guidance applies but nothing is new", () => {
    const info = results("SYN-006", { step: "imaging", consultType: "Stroke" });
    expect(info.every((r) => r.tier === "info")).toBe(true);
    expect(run([{ type: "RESULTS", results: info }]).state).toBe("pill");
  });

  it("never opens itself for reference material", () => {
    const info = results("SYN-006", { step: "imaging", consultType: "Stroke" });
    for (const r of info) expect(r.autoExpand ?? false).toBe(false);
    expect(run([{ type: "RESULTS", results: info }]).state).not.toBe("panel");
  });

  it("opens when a recorded value produces something that needs action", () => {
    const before = results("SYN-006", { step: "imaging", consultType: "Stroke" });
    const after = results(
      "SYN-006",
      { step: "imaging", consultType: "Stroke", values: { lvo_present: known(true) } },
      before,
    );
    const m = run([
      { type: "RESULTS", results: before },
      { type: "RESULTS", results: after },
    ]);
    expect(m.state).toBe("panel");
    expect(m.focusResultId).toBe(after.find((r) => r.autoExpand)!.id);
  });

  it("does not open again for a nudge the doctor has already had on screen", () => {
    const before = results("SYN-006", { step: "imaging", consultType: "Stroke" });
    const after = results(
      "SYN-006",
      { step: "imaging", consultType: "Stroke", values: { lvo_present: known(true) } },
      before,
    );
    const opened = run([
      { type: "RESULTS", results: before },
      { type: "RESULTS", results: after },
    ]);
    const collapsed = dockReducer(opened, { type: "COLLAPSE" });
    expect(collapsed.state).toBe("pill");
    // Same results arriving again must not reopen it.
    expect(dockReducer(collapsed, { type: "RESULTS", results: after }).state).toBe("pill");
  });

  it("respects a doctor who closed it", () => {
    const m = run([{ type: "TOGGLE" }, { type: "COLLAPSE" }]);
    expect(m.collapsedByDoctor).toBe(true);
    expect(m.state).toBe("pill");
  });
});

describe("Focusing a field", () => {
  it("peeks for reference material rather than taking over", () => {
    const info = results("SYN-006", { step: "imaging", consultType: "Stroke" });
    const m = run([
      { type: "RESULTS", results: info },
      { type: "FIELD_FOCUS", results: info },
    ]);
    expect(m.state).toBe("peek");
  });

  it("opens for something that needs action, because the doctor is looking", () => {
    const actionable = results("SYN-006", {
      step: "imaging",
      consultType: "Stroke",
      values: { lvo_present: known(true) },
    });
    const m = dockReducer(
      { ...initialDock, state: "pill" },
      { type: "FIELD_FOCUS", results: actionable },
    );
    expect(m.state).toBe("panel");
  });

  it("falls back to a pill when the doctor leaves the field", () => {
    const m = run([{ type: "FIELD_FOCUS", results: [] }, { type: "FIELD_BLUR" }]);
    expect(m.state).not.toBe("peek");
  });

  it("puts that field's guidance first, even below a louder rule elsewhere", () => {
    const rs = results("SYN-005", {
      step: "imaging",
      consultType: "Stroke",
      values: { cta_done: known(true) },
    });
    const ordered = orderForField(rs, "cta_done");
    expect(ordered[0].anchor).toBe("cta_done");
  });

  it("leaves the engine's order alone when no field is focused", () => {
    const rs = results("SYN-005", { step: "imaging", consultType: "Stroke" });
    expect(orderForField(rs, undefined)).toEqual(rs);
  });
});

describe("What the pill says", () => {
  it("names the loudest thing present, in words", () => {
    const gate = results("SYN-007", { step: "sign_off" });
    const s = pillSummary(gate);
    expect(s.tier).toBe("hard_stop");
    expect(s.label).toContain("required");
  });

  it("reads as reference when only reference applies", () => {
    const info = results("SYN-006", { step: "imaging", consultType: "Stroke" });
    const s = pillSummary(info);
    expect(s.tier).toBe("info");
    expect(s.label).toContain("for reference");
    expect(s.count).toBe(info.length);
  });
});

describe("Focusing a field with no guidance of its own", () => {
  it("keeps the pill for the rest of the step", () => {
    const m = dockReducer({ ...initialDock, state: "pill" }, { type: "FIELD_FOCUS", results: [] });
    expect(m.state).toBe("pill");
  });
  it("folds a peek for another field back to the pill", () => {
    const m = dockReducer({ ...initialDock, state: "peek" }, { type: "FIELD_FOCUS", results: [] });
    expect(m.state).toBe("pill");
  });
  it("leaves an open panel open", () => {
    const m = dockReducer({ ...initialDock, state: "panel" }, { type: "FIELD_FOCUS", results: [] });
    expect(m.state).toBe("panel");
  });
});
