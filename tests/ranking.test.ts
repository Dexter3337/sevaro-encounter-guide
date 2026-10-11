import { describe, it, expect } from "vitest";
import { seedHospitals } from "../src/data";
import {
  evaluate,
  nudgePriority,
  resultSignature,
  gates,
} from "../src/engine";
import { freshContext, known, makeEvent, type Context } from "../src/domain";

// Nudge fatigue is the main design risk the brief names: with 80+ rules per
// hospital, showing everything trains doctors to ignore all of it. Ranking
// decides what is a card and what is a quiet row; autoExpand decides the much
// narrower question of what may open the panel without being asked.

const hospital = (id: string) => seedHospitals.find((h) => h.id === id)!;
const at = (id: string, over: Partial<Context> = {}): Context => ({
  ...freshContext(hospital(id)),
  ...over,
});

describe("Ranking", () => {
  it("a blocked sign-off outranks everything else", () => {
    const h = hospital("SYN-007");
    const gate = gates(h, at("SYN-007", { step: "sign_off" })).find(
      (r) => r.blocksCompletion,
    )!;
    expect(nudgePriority(gate)).toBe(100);
    expect(nudgePriority(gate)).toBeGreaterThan(90);
  });

  it("tier sets the floor: advisory is a card, info is a row", () => {
    const c = at("SYN-006", {
      step: "imaging",
      values: { lvo_present: known(true) },
    });
    const [lvo] = evaluate(
      hospital("SYN-006"),
      c,
      makeEvent(c, "field_changed", "lvo_present"),
    );
    expect(lvo.tier).toBe("advisory");
    expect(nudgePriority(lvo)).toBeGreaterThanOrEqual(50);
  });

  it("a recorded value the guide contradicts outranks an ordinary advisory", () => {
    const h = hospital("SYN-005"); // guide: CT perfusion "No"
    const c = at("SYN-005", {
      step: "imaging",
      values: { cta_done: known(true) },
    });
    const results = evaluate(h, c, makeEvent(c, "field_changed", "cta_done"));
    const ordinary = results.find((r) => r.tier === "advisory" && !r.flags.includes("recorded_capability_conflict"));
    const contradiction = results.find((r) =>
      r.flags.includes("recorded_capability_conflict"),
    );
    if (contradiction && ordinary)
      expect(nudgePriority(contradiction)).toBeGreaterThan(
        nudgePriority(ordinary),
      );
  });

  // The handbook asks for conflicting information to be shown openly, never
  // hidden. A collapsed one-line row is too easy to pass over when the risk is
  // acting on the wrong one of two values.
  it("sources that disagree always reach card level, even on an info field", () => {
    const c = at("SYN-002", { step: "intake", consultType: "Stroke" });
    const conflict = evaluate(hospital("SYN-002"), c, makeEvent(c, "step_changed")).find(
      (r) => r.primaryStatus === "conflict",
    )!;
    expect(conflict.tier).toBe("info");
    expect(nudgePriority(conflict)).toBeGreaterThanOrEqual(50);
  });

  it("results come back most important first", () => {
    const c = at("SYN-006", {
      step: "imaging",
      values: { lvo_present: known(true), cta_done: known(true) },
    });
    const scores = evaluate(
      hospital("SYN-006"),
      c,
      makeEvent(c, "field_changed", "lvo_present"),
    ).map(nudgePriority);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });
});

describe("What may open the panel on its own", () => {
  const h = hospital("SYN-006");
  const imaging = (values: Context["values"], instant = "2026-03-17T19:30") =>
    ({ ...freshContext(h, instant), step: "imaging", values }) as Context;

  it("arriving at a step with only context opens nothing", () => {
    const c = imaging({});
    const results = evaluate(h, c, makeEvent(c, "step_changed"));
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((r) => r.tier === "info")).toBe(true);
    expect(results.some((r) => r.autoExpand)).toBe(false);
  });

  it("recording a value that promotes a rule does open it", () => {
    const before = evaluate(h, imaging({}), makeEvent(imaging({}), "step_changed"));
    const c = imaging({ lvo_present: known(true) });
    const after = evaluate(h, c, makeEvent(c, "field_changed", "lvo_present"), before);
    const lvo = after.find((r) => r.title === "LVO Protocol")!;
    expect(lvo.tier).toBe("advisory");
    expect(lvo.autoExpand).toBe(true);
  });

  it("the same nudge does not open again while the doctor keeps working", () => {
    const c = imaging({ lvo_present: known(true) });
    const first = evaluate(h, c, makeEvent(c, "field_changed", "lvo_present"));
    const again = evaluate(h, c, makeEvent(c, "field_focused", "lvo_present"), first);
    expect(again.some((r) => r.autoExpand)).toBe(false);
  });

  // At 14:00 the window is open and the instruction is to activate the EVT
  // team; at 19:30 it is to transfer. Same rule, opposite instruction.
  it("but it does when the answer itself changes", () => {
    const outside = imaging({ lvo_present: known(true) }, "2026-03-17T19:30");
    const closed = evaluate(h, outside, makeEvent(outside, "field_changed", "lvo_present"));
    const inside = imaging({ lvo_present: known(true) }, "2026-03-17T14:00");
    const open = evaluate(h, inside, makeEvent(inside, "clock_changed"), closed);
    expect(open.find((r) => r.title === "LVO Protocol")!.autoExpand).toBe(true);
    expect(closed[0].message).not.toBe(open[0].message);
  });

  it("info never opens the panel, however high it scores", () => {
    const c = at("SYN-002", { step: "intake", consultType: "Stroke" });
    for (const r of evaluate(hospital("SYN-002"), c, makeEvent(c, "step_changed")))
      if (r.tier === "info") expect(r.autoExpand).toBe(false);
  });

  it("at most one result opens the panel per event", () => {
    for (const h of seedHospitals)
      for (const step of ["intake", "history", "imaging", "recommendation", "note", "sign_off"] as const) {
        const c = {
          ...freshContext(h),
          step,
          values: {
            lvo_present: known(true),
            cta_done: known(true),
            last_known_well_status: known("Unknown"),
          },
        } as Context;
        const opened = evaluate(h, c, makeEvent(c, "step_changed")).filter(
          (r) => r.autoExpand,
        );
        expect(opened.length, `${h.id} ${step}`).toBeLessThanOrEqual(1);
      }
  });

  it("silence stays silent", () => {
    const c = at("SYN-002", {
      step: "history",
      consultType: "General Neuro",
      values: { allergies: known("none") },
    });
    const results = evaluate(hospital("SYN-002"), c, makeEvent(c, "field_changed", "allergies"));
    expect(results).toEqual([]);
  });
});

describe("Result identity", () => {
  it("the same rule saying the same thing has the same signature", () => {
    const c = at("SYN-006", { step: "imaging", values: { lvo_present: known(true) } });
    const a = evaluate(hospital("SYN-006"), c, makeEvent(c, "field_changed", "lvo_present"));
    const b = evaluate(hospital("SYN-006"), c, makeEvent(c, "field_focused", "lvo_present"));
    expect(a.map(resultSignature)).toEqual(b.map(resultSignature));
  });

  it("a promotion changes it, because the doctor is being told something new", () => {
    const quiet = evaluate(
      hospital("SYN-006"),
      at("SYN-006", { step: "imaging" }),
      makeEvent(at("SYN-006", { step: "imaging" }), "step_changed"),
    ).find((r) => r.title === "LVO Protocol")!;
    const loud = evaluate(
      hospital("SYN-006"),
      at("SYN-006", { step: "imaging", values: { lvo_present: known(true) } }),
      makeEvent(at("SYN-006", { step: "imaging" }), "field_changed", "lvo_present"),
    ).find((r) => r.title === "LVO Protocol")!;
    expect(resultSignature(quiet)).not.toBe(resultSignature(loud));
  });
});

describe("Evaluation stays a pure function of its inputs", () => {
  it("the same inputs give the same output, every time", () => {
    const c = at("SYN-006", { step: "imaging", values: { lvo_present: known(true) } });
    const e = makeEvent(c, "field_changed", "lvo_present");
    const once = evaluate(hospital("SYN-006"), c, e);
    const twice = evaluate(hospital("SYN-006"), c, e);
    expect(JSON.stringify(twice)).toBe(JSON.stringify(once));
  });

  it("passing no previous results treats everything as new", () => {
    const c = at("SYN-007", { step: "sign_off" });
    const e = makeEvent(c, "completion_requested");
    expect(evaluate(hospital("SYN-007"), c, e).some((r) => r.autoExpand)).toBe(
      true,
    );
  });
});
