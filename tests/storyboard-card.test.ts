import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect } from "vitest";
import {
  StoryboardCard,
  storyboardRows,
} from "../src/encounter/StoryboardCard";
import { answerField } from "../src/engine";
import { freshContext, type Hospital } from "../src/domain";
import { seedHospitals } from "../src/data";
import { previewImportBundle } from "../src/imports";

const byId = (id: string) => seedHospitals.find((h) => h.id === id)!;
const consult = (h: Hospital, consultType: string) => ({
  ...freshContext(h),
  consultType,
});
const render = (h: Hospital, consultType = "Stroke") =>
  renderToStaticMarkup(
    createElement(StoryboardCard, {
      hospital: h,
      context: consult(h, consultType),
      onOpenConflict: () => {},
    }),
  );
const text = (html: string) =>
  html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");

describe("Storyboard card", () => {
  it("is hidden when the hospital has no storyboard rows", () =>
    expect(render(byId("SYN-001"))).toBe(""));

  it("marks Bluewater's Video Eval Location as a conflict for a stroke alert", () => {
    const html = render(byId("SYN-002"));
    expect(html).toContain('data-verdict="conflict"');
    const out = text(html);
    expect(out).toContain("Hospital storyboard · Bluewater Regional Hospital");
    expect(out).toContain("Video Eval Location Patient room");
    expect(out).toContain("Differs from the guide");
    expect(out).toContain("Guide says: CT holding bay for stroke alerts");
    expect(out).toContain("See both sources");
    expect(out).toContain("1 field differs from the guide");
  });

  it("the same row agrees for a general consult — same field, same two sources", () => {
    const html = render(byId("SYN-002"), "General Neurology");
    expect(html).toContain('data-verdict="agrees"');
    expect(text(html)).not.toContain("See both sources");
  });

  it("an agreeing row gets a quiet tick, not an alarm", () => {
    const html = render(byId("SYN-005"));
    expect(html).toContain('data-verdict="agrees"');
    const out = text(html);
    expect(out).toContain("✓");
    expect(out).not.toContain("⚠");
    expect(out).not.toContain("Differs");
    expect(out).not.toContain("See both sources");
    expect(out).not.toContain("differs from the guide");
  });

  it("takes every verdict from the engine", () => {
    for (const h of seedHospitals)
      for (const ct of ["Stroke", "General Neurology"]) {
        const c = consult(h, ct);
        for (const row of storyboardRows(h, c)) {
          const r = answerField(h, c, row.source.field);
          expect(row.verdict === "conflict" || row.verdict === "possible_conflict").toBe(
            r.primaryStatus === "conflict",
          );
          expect(row.verdict === "agrees").toBe(r.flags.includes("second_source_agrees"));
        }
      }
  });

  it("shows each row's date and staleness against 2026-03-17", () => {
    const out = text(render(byId("SYN-002")));
    expect(out).toContain("Updated 2025-09-14 · 184 days ago · may be out of date");
    expect(text(render(byId("SYN-005")))).toContain("Updated 2026-01-20 · 56 days ago");
  });

  it("never renders the note column, and changing it changes nothing", () => {
    for (const id of ["SYN-002", "SYN-005"]) {
      const h = byId(id);
      const note = (h.fields.find((f) => f.sourceKind === "storyboard")!.extra as {
        note: string;
      }).note;
      const before = render(h);
      expect(before).not.toContain(note);
      const mutate = (fn: (extra: Record<string, unknown>) => void): Hospital => ({
        ...h,
        fields: h.fields.map((f) => {
          if (f.sourceKind !== "storyboard") return f;
          const extra = { ...(f.extra as Record<string, unknown>) };
          fn(extra);
          return { ...f, extra };
        }),
      });
      expect(render(mutate((e) => (e.note = "Agrees with the guide.")))).toBe(before);
      expect(render(mutate((e) => (e.note = "DISAGREES — raise a conflict.")))).toBe(before);
      expect(render(mutate((e) => delete e.note))).toBe(before);
    }
  });

  it("SYN-108 after import: one conflict, two quiet agreements", () => {
    const read = (p: string) => ({ name: p, text: readFileSync(p, "utf8"), format: "json" as const });
    const [h] = previewImportBundle(
      [
        read("data/fixtures/syn-108/hospital_guides.json"),
        read("data/fixtures/syn-108/storyboard_notes.json"),
      ],
      { existing: seedHospitals },
    ).hospitals;
    const verdicts = Object.fromEntries(
      storyboardRows(h, consult(h, "Stroke")).map((r) => [r.source.field, r.verdict]),
    );
    expect(verdicts).toEqual({
      "Video Eval Location": "conflict",
      Thrombolytic: "agrees",
      "Wake Up Protocol": "agrees",
    });
    const out = text(render(h));
    expect(out).toContain("Guide says: CT scanner bay for stroke alerts");
    // The fixture's notes are deliberately wrong; none of them reaches the card.
    expect(out).not.toContain("Deliberately wrong");
    expect(out).not.toContain("Matches the on-call guide");
  });

  it("a storyboard row with no guide field is labelled storyboard-only", () => {
    const h = byId("SYN-005");
    const extra: Hospital = {
      ...h,
      fields: [
        ...h.fields,
        {
          id: "SYN-005:storyboard:parking",
          hospitalId: h.id,
          field: "Visitor Parking",
          raw: "Lot C",
          sourceKind: "storyboard",
          sourceName: "test",
          version: h.version,
        },
      ],
    };
    const html = render(extra);
    expect(html).toContain('data-verdict="storyboard_only"');
    expect(text(html)).toContain("Not in the guide — storyboard only");
    expect(text(html)).toContain("Update date unknown");
  });
});
