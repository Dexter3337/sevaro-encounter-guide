import { describe, it, expect } from "vitest";
import { matchWindow, windows } from "../src/time";
import { availabilityAt } from "../src/contacts/availability";
import { ask } from "../src/engine";
import { freshContext } from "../src/domain";
import { seedHospitals } from "../src/data";

// Uncertainty in a schedule must never come out as certainty. These are the
// cases the combined delivery review reproduced against the parser.
describe("Schedules never become more certain than the text", () => {
  it("a malformed time is no window, not a different time", () => {
    expect(windows("Mon-Fri 7:99am-5pm")).toEqual([]);
    expect(windows("Mon-Fri 7:30am-5pm")[0]).toMatchObject({
      start: 450,
      end: 1020,
    });
  });

  it("a negated 24/7 is not continuous cover", () => {
    expect(windows("Not available 24/7; call for hours")).toEqual([]);
    expect(windows("No 24/7 coverage")).toEqual([]);
    expect(
      availabilityAt(
        "Not available 24/7; call for hours",
        "2026-03-17T15:00:00Z",
        "America/Chicago",
      ),
    ).toEqual({ state: "unknown", label: "Hours not listed — call to check" });
  });

  it("a real window beside a negated 24/7 is kept", () => {
    const ws = windows("Mon-Fri 0800-1700; not 24/7");
    expect(ws).toHaveLength(1);
    expect(ws[0]).toMatchObject({ start: 480, end: 1020 });
  });

  it("every kit 24/7 value still reads as always available", () => {
    for (const h of seedHospitals)
      for (const f of h.fields.filter((x) => /24\/7/.test(x.raw)))
        expect(
          matchWindow(windows(f.raw), "2026-03-21T08:00:00Z", h.timezone),
          `${h.id} ${f.field}`,
        ).toBe(true);
  });

  it("'except holidays' keeps its caveat on a contact", () => {
    const now = availabilityAt(
      "Mon-Fri 0700-1900 except holidays",
      "2026-03-17T15:00:00Z",
      "America/Chicago",
    );
    expect(now.state).toBe("available");
    expect(now.label).toContain("except holidays");
    expect(now.label).toContain("call to check");
  });
});

describe("Asking for a field by its exact label", () => {
  it("resolves every kit field label without a clarification", () => {
    for (const h of seedHospitals)
      for (const f of h.fields) {
        const r = ask(h, freshContext(h), f.field);
        expect(r.clarification, `${h.id} · ${f.field}`).toBeUndefined();
        expect(r.result!.hospitalId).toBe(h.id);
      }
  });

  it("'When Do We Round?' is that field, not Rounding Timing", () => {
    const h = seedHospitals[0];
    expect(ask(h, freshContext(h), "When Do We Round?").result!.title).toBe(
      "When Do We Round?",
    );
  });
});
