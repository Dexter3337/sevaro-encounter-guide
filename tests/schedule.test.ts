import { describe, it, expect } from "vitest";
import { Temporal } from "@js-temporal/polyfill";
import { windows, daySet, matchWindow, scheduleNotes } from "../src/time";

// Handbook issue 5: hours and days in the guides are written as text, in many
// different styles, and we will meet styles we have not seen. Issue 4: all of
// it is evaluated in the hospital's own time zone.

const w = (raw: string) => windows(raw, undefined);
const span = (raw: string) =>
  w(raw).map((x) => `${x.days.join("")}:${x.start}-${x.end}`);

describe("Days", () => {
  const cases: [string, number[]][] = [
    ["Mon-Fri", [1, 2, 3, 4, 5]],
    ["Mon–Fri", [1, 2, 3, 4, 5]],
    ["Monday to Friday", [1, 2, 3, 4, 5]],
    ["Mon through Fri", [1, 2, 3, 4, 5]],
    ["Mon thru Fri", [1, 2, 3, 4, 5]],
    ["Weekdays", [1, 2, 3, 4, 5]],
    ["Weekends", [6, 7]],
    ["Daily", [1, 2, 3, 4, 5, 6, 7]],
    ["24/7", [1, 2, 3, 4, 5, 6, 7]],
    ["Tue/Thu", [2, 4]],
    ["Mon, Wed, Fri", [1, 3, 5]],
    ["Tuesday, Thursday, Saturday", [2, 4, 6]],
    ["Mon-Sat", [1, 2, 3, 4, 5, 6]],
  ];
  for (const [raw, days] of cases)
    it(`"${raw}"`, () => expect(daySet(raw)?.sort()).toEqual(days.sort()));

  // "Mon thru Fri" read as Monday and Friday would tell a doctor the service is
  // shut on the Wednesday it is open.
  it("a range written with 'thru' is a range, not two days", () => {
    expect(daySet("Mon thru Fri")).toHaveLength(5);
  });
});

describe("Times", () => {
  const cases: [string, string][] = [
    ["Mon-Fri 0700-1900", "12345:420-1140"],
    ["Mon-Fri 07:00-19:00", "12345:420-1140"],
    ["Mon-Fri 7am-7pm", "12345:420-1140"],
    ["Mon-Fri 7 AM - 7 PM", "12345:420-1140"],
    ["Mon-Fri 7 a.m.-7 p.m.", "12345:420-1140"],
    ["Mon-Fri 8:00am-4:00pm", "12345:480-960"],
    ["Mon-Fri 0800 to 1600", "12345:480-960"],
    ["Weekdays 7a-5p", "12345:420-1020"],
    ["Daily 7a-7p", "1234567:420-1140"],
  ];
  for (const [raw, expected] of cases)
    it(`"${raw}"`, () => expect(span(raw)).toEqual([expected]));

  it("rejects impossible clock times rather than coercing them", () => {
    expect(w("Mon-Fri 2575-2600")).toEqual([]);
    expect(w("Mon-Fri 13pm-14pm")).toEqual([]);
  });
});

// "Mon-Fri 0700-1900 and Sat 0800-1200" read as one set of days would claim
// Saturday opens at 0700, an hour before it does.
describe("Several windows in one sentence", () => {
  it("each window keeps the days written in front of it", () => {
    expect(span("Mon-Fri 0700-1900 and Sat 0800-1200")).toEqual([
      "12345:420-1140",
      "6:480-720",
    ]);
  });

  it("a shared day list still applies to its single window", () => {
    expect(span("Mon, Wed, Fri 0800-1600")).toEqual(["135:480-960"]);
  });

  it("semicolons separate clauses", () => {
    expect(span("Mon-Fri 0500-2300; weekend 0700-1900")).toEqual([
      "12345:300-1380",
      "67:420-1140",
    ]);
  });
});

describe("What the guide leaves out", () => {
  it("hours it never gives produce no window, rather than a guess", () => {
    for (const raw of [
      "By arrangement",
      "On request",
      "During hospitalist hours",
      "As scheduled",
      "During staffed hours",
    ])
      expect(w(raw), raw).toEqual([]);
  });

  it("cover offered without hours is flagged, not treated as closed", () => {
    for (const raw of [
      "Mon-Fri 0800-1800; weekend on-call",
      "Weekdays 7a-5p, weekends on request",
      "Daily 0600-2300; overnight on-call",
      "Mon-Fri 0900-1700, otherwise by arrangement",
    ])
      expect(scheduleNotes(raw), raw).toContain("conditional_cover");
  });

  it("an excluded-holidays clause is flagged, because we have no calendar", () => {
    expect(scheduleNotes("Mon-Fri 0700-1900 except holidays")).toContain("holidays_unknown");
    expect(scheduleNotes("Mon-Fri 0700-1900, holidays excluded")).toContain("holidays_unknown");
  });

  it("a plain schedule carries no caveats", () => {
    expect(scheduleNotes("Mon-Fri 0700-1900")).toEqual([]);
    expect(scheduleNotes("24/7")).toEqual([]);
  });
});

// The doctor is usually in a different time zone from the hospital, and twice a
// year one of them changes and the other does not.
describe("Hospital-local time, across daylight saving", () => {
  const ZONES = [
    "America/Chicago",
    "America/New_York",
    "America/Los_Angeles",
    "America/Denver",
    "America/Phoenix", // never changes
    "Europe/London", // changes on different dates from the US
  ];
  const ws = w("Mon-Fri 0700-1900");

  it("a window means the same wall-clock hours in every zone, all year", () => {
    for (const zone of ZONES)
      for (const date of ["2026-01-14", "2026-03-11", "2026-07-15", "2026-11-04"]) {
        const inside = Temporal.PlainDateTime.from(`${date}T09:00`)
          .toZonedDateTime(zone)
          .toInstant()
          .toString();
        const outside = Temporal.PlainDateTime.from(`${date}T21:00`)
          .toZonedDateTime(zone)
          .toInstant()
          .toString();
        expect(matchWindow(ws, inside, zone), `${zone} ${date} 09:00`).toBe(true);
        expect(matchWindow(ws, outside, zone), `${zone} ${date} 21:00`).toBe(false);
      }
  });

  it("the boundary is inclusive at the start and exclusive at the end", () => {
    const zone = "America/Chicago";
    const at = (t: string) =>
      Temporal.PlainDateTime.from(`2026-03-17T${t}`).toZonedDateTime(zone).toInstant().toString();
    expect(matchWindow(ws, at("07:00"), zone)).toBe(true);
    expect(matchWindow(ws, at("18:59"), zone)).toBe(true);
    expect(matchWindow(ws, at("19:00"), zone)).toBe(false);
  });

  it("the same instant can be inside the window for one zone and outside for another", () => {
    // 20:30 in New York is 19:30 in Chicago: closed there, and the hospital's
    // clock is the one that counts.
    const instant = Temporal.PlainDateTime.from("2026-03-17T19:30")
      .toZonedDateTime("America/Chicago")
      .toInstant()
      .toString();
    expect(matchWindow(ws, instant, "America/Chicago")).toBe(false);
    expect(matchWindow(ws, instant, "America/Los_Angeles")).toBe(true);
  });

  it("an overnight window belongs to the day it starts on", () => {
    const overnight = w("Mon-Fri 2200-0600");
    const zone = "America/New_York";
    const at = (date: string, t: string) =>
      Temporal.PlainDateTime.from(`${date}T${t}`).toZonedDateTime(zone).toInstant().toString();
    // Tuesday 23:00 is inside; so is the Wednesday 02:00 that follows it.
    expect(matchWindow(overnight, at("2026-03-17", "23:00"), zone)).toBe(true);
    expect(matchWindow(overnight, at("2026-03-18", "02:00"), zone)).toBe(true);
    // Sunday 02:00 follows a Saturday, which is not in the list.
    expect(matchWindow(overnight, at("2026-03-22", "02:00"), zone)).toBe(false);
  });

  it("the hour that does not exist on a spring-forward morning is rejected, not moved", () => {
    // 02:30 on 8 March 2026 never happens in New York.
    expect(() =>
      Temporal.PlainDateTime.from("2026-03-08T02:30").toZonedDateTime("America/New_York", {
        disambiguation: "reject",
      }),
    ).toThrow();
  });

  it("the hour that happens twice on a autumn morning is rejected, not picked", () => {
    expect(() =>
      Temporal.PlainDateTime.from("2026-11-01T01:30").toZonedDateTime("America/New_York", {
        disambiguation: "reject",
      }),
    ).toThrow();
  });
});
