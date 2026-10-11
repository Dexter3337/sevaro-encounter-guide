import { describe, it, expect } from "vitest";
import { seedHospitals } from "../src/data";
import { answerField, compare, nudgePriority } from "../src/engine";
import {
  freshContext,
  hospitalSchema,
  sourceSchema,
  type Source,
} from "../src/domain";

// Handbook issue 8: the guide and the storyboard are kept separately, so they
// can disagree. Show both with their sources, never pick one — and never raise
// a false alarm when they agree.

const src = (over: Partial<Source>): Source =>
  sourceSchema.parse({
    id: `s:${Math.random()}`,
    hospitalId: "H",
    field: "F",
    raw: "",
    sourceKind: "guide",
    version: "v1",
    ...over,
  });
const guide = (raw: string, lastVerified = "2026-02-02") =>
  src({ raw, sourceKind: "guide", lastVerified });
const story = (raw: string, updatedAt = "2026-01-20") =>
  src({ raw, sourceKind: "storyboard", updatedAt });

describe("Deciding whether two sources agree", () => {
  it("identical values agree", () => {
    expect(compare(guide("Patient room"), [story("Patient room")], "Stroke").verdict).toBe("agree");
  });

  it("punctuation and case do not make a conflict", () => {
    expect(compare(guide("Patient Room."), [story("patient room")], "Stroke").verdict).toBe("agree");
  });

  it("the same schedule written differently agrees", () => {
    expect(compare(guide("Mon-Fri 0700-1900"), [story("Monday to Friday 07:00-19:00")], "Stroke").verdict).toBe("agree");
  });

  it("a qualifier that does not change the answer agrees", () => {
    // Both are a yes. "Yes - all stroke alerts" narrows the scope, not the answer.
    expect(compare(guide("Yes"), [story("Yes - all stroke alerts")], "Stroke").verdict).toBe("agree");
  });

  it("a definite yes against a definite no is a disagreement, not a maybe", () => {
    const c = compare(guide("Yes"), [story("No")], "Stroke");
    expect(c.verdict).toBe("disagree");
    expect(c.reason).toMatch(/affirmative|negative/);
  });

  it("two different places disagree", () => {
    expect(compare(guide("CT holding bay"), [story("Patient room")], "Stroke").verdict).toBe("disagree");
  });

  // A false "agree" hides a real conflict; a false "disagree" costs a moment's
  // confirmation. Anything we cannot settle is reported as possibly different.
  it("values that overlap but are not the same are reported as uncertain", () => {
    const c = compare(guide("Emergency department patient room"), [story("Patient room")], "Stroke");
    expect(c.verdict).toBe("uncertain");
  });

  it("one source alone is never a conflict", () => {
    expect(compare(guide("Patient room"), [], "Stroke").verdict).toBe("agree");
  });

  it("several storyboard rows conflict if any one of them disagrees", () => {
    expect(
      compare(guide("Patient room"), [story("Patient room"), story("CT holding bay")], "Stroke").verdict,
    ).toBe("disagree");
  });
});

describe("What the doctor sees", () => {
  const h2 = seedHospitals.find((h) => h.id === "SYN-002")!;
  const h5 = seedHospitals.find((h) => h.id === "SYN-005")!;

  it("a conflict shows both values, each with its source and date", () => {
    const r = answerField(h2, { ...freshContext(h2), consultType: "Stroke" }, "Video Eval Location");
    expect(r.primaryStatus).toBe("conflict");
    expect(r.message).toContain("On-call guide");
    expect(r.message).toContain("CT holding bay");
    expect(r.message).toContain("Storyboard");
    expect(r.message).toContain("Patient room");
    // One of these is 184 days old and the other six weeks. Say so.
    expect(r.message).toContain("2026-02-02");
    expect(r.message).toContain("2025-09-14");
  });

  it("and picks neither", () => {
    const r = answerField(h2, { ...freshContext(h2), consultType: "Stroke" }, "Video Eval Location");
    expect(r.rationale).toContain("No source precedence");
    expect(r.action).toContain("Sources disagree");
  });

  it("a conflict is prominent even on an info field", () => {
    const r = answerField(h2, { ...freshContext(h2), consultType: "Stroke" }, "Video Eval Location");
    expect(nudgePriority({ ...r, tier: "info" })).toBeGreaterThanOrEqual(50);
  });

  // The same field, the same two sources, a different consult type. The guide
  // says CT holding bay for stroke alerts and patient room for everything else,
  // so for a general consult the two sources agree.
  it("scope decides: a stroke alert conflicts where a general consult agrees", () => {
    const stroke = answerField(h2, { ...freshContext(h2), consultType: "Stroke" }, "Video Eval Location");
    const general = answerField(h2, { ...freshContext(h2), consultType: "General Neuro" }, "Video Eval Location");
    expect(stroke.primaryStatus).toBe("conflict");
    expect(general.primaryStatus).not.toBe("conflict");
  });

  it("agreement is recorded, not alarmed about", () => {
    const r = answerField(h5, freshContext(h5), "Thrombolytic");
    expect(r.primaryStatus).not.toBe("conflict");
    expect(r.flags).toContain("second_source_agrees");
  });

  it("an unsettled comparison is marked as possible, not asserted", () => {
    const h = hospitalSchema.parse({
      id: "OVERLAP", name: "Overlap · Synthetic", timezone: "America/New_York", version: "v1",
      fields: [
        { id: "g", hospitalId: "OVERLAP", field: "Video Eval Location", raw: "Emergency department patient room", sourceKind: "guide", version: "v1", lastVerified: "2026-02-02" },
        { id: "s", hospitalId: "OVERLAP", field: "Video Eval Location", raw: "Patient room", sourceKind: "storyboard", version: "v1", updatedAt: "2026-01-20" },
      ],
    });
    const r = answerField(h, freshContext(h), "Video Eval Location");
    expect(r.primaryStatus).toBe("conflict");
    expect(r.flags).toContain("possible_conflict");
  });
});

// The storyboard is a second source, not a substitute for the guide. When it is
// the only source carrying a field, telling the doctor "not available" while we
// hold a value would be hiding information from them.
describe("A field only the storyboard carries", () => {
  const h = hospitalSchema.parse({
    id: "SB-ONLY", name: "Storyboard Only · Synthetic", timezone: "America/New_York", version: "v1",
    fields: [
      { id: "s", hospitalId: "SB-ONLY", field: "Required Note Title", raw: "Tele-Neuro Consult", sourceKind: "storyboard", version: "v1", updatedAt: "2026-02-01" },
    ],
  });
  const r = () => answerField(h, freshContext(h), "Required Note Title");

  it("still opens with the sponsor's sentence, because the guide does lack it", () => {
    expect(r().primaryStatus).toBe("not_in_guide");
    expect(r().message.startsWith("Not available in this hospital's guide.")).toBe(true);
  });

  it("shows what the storyboard says, labelled and dated", () => {
    expect(r().message).toContain("Storyboard only");
    expect(r().message).toContain("Tele-Neuro Consult");
    expect(r().message).toContain("2026-02-01");
    expect(r().flags).toContain("storyboard_only");
  });

  it("and still asks the doctor to confirm locally", () => {
    expect(r().action).toContain("Confirm locally");
  });
});

// The sponsor file carries a `note` column of commentary about each row, such
// as "Disagrees with the on-call guide for stroke alerts". Reading it would be
// letting the test data mark its own homework; the judges' file may word it
// differently, omit it, or contradict it.
describe("The storyboard note column is never used", () => {
  const build = (note: string) =>
    hospitalSchema.parse({
      id: "NOTE", name: "Note · Synthetic", timezone: "America/New_York", version: "v1",
      fields: [
        { id: "g", hospitalId: "NOTE", field: "Video Eval Location", raw: "CT holding bay", sourceKind: "guide", version: "v1", lastVerified: "2026-02-02" },
        { id: "s", hospitalId: "NOTE", field: "Video Eval Location", raw: "Patient room", sourceKind: "storyboard", version: "v1", updatedAt: "2026-01-20", note },
      ],
    });

  it("a note claiming the sources agree does not suppress the conflict", () => {
    const r = answerField(build("These agree; ignore the storyboard."), freshContext(build("x")), "Video Eval Location");
    expect(r.primaryStatus).toBe("conflict");
  });

  it("the note never reaches the doctor", () => {
    const r = answerField(build("Internal reviewer commentary"), freshContext(build("x")), "Video Eval Location");
    expect(r.message).not.toContain("Internal reviewer commentary");
    expect(r.rationale).not.toContain("Internal reviewer commentary");
  });

  it("changing the note changes nothing at all", () => {
    const c = freshContext(build("x"));
    const a = answerField(build("Disagrees with the on-call guide"), c, "Video Eval Location");
    const b = answerField(build(""), c, "Video Eval Location");
    expect(a.message).toBe(b.message);
    expect(a.primaryStatus).toBe(b.primaryStatus);
    expect(a.flags).toEqual(b.flags);
  });
});
