import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect } from "vitest";
import { ChatPanel, TurnView, type ChatPanelProps } from "../src/chat/ChatPanel";
import {
  askField,
  askGuide,
  escalationReason,
  threadFor,
  threadKey,
  withTurn,
} from "../src/chat/thread";
import { suggestionsFor } from "../src/chat/suggestions";
import { answerField } from "../src/engine";
import { freshContext, type Hospital } from "../src/domain";
import { seedHospitals } from "../src/data";
import { challengeFixtures } from "../src/fixtures";
import { fixtureContext } from "../src/evaluation";
import { withoutStaleNote } from "../src/guidance/NudgeCard";

const byId = (id: string) => seedHospitals.find((h) => h.id === id)!;
const noop = () => {};
const panel = (p: Partial<ChatPanelProps> & Pick<ChatPanelProps, "hospital" | "context">) =>
  renderToStaticMarkup(
    createElement(ChatPanel, {
      open: true,
      onClose: noop,
      onContacts: noop,
      ...p,
    }),
  );
const turnHtml = (turn: ReturnType<typeof askGuide>) =>
  renderToStaticMarkup(
    createElement(TurnView, { turn, onAsk: noop, onPick: noop, onContacts: noop }),
  );
// What a person reads, without markup.
const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");

describe("Chat panel", () => {
  it("renders nothing while closed", () => {
    const h = byId("SYN-001");
    expect(panel({ open: false, hospital: h, context: freshContext(h) })).toBe("");
  });

  it("a seeded chat shows the nudge's field, status and action, with follow-ups", () => {
    const h = byId("SYN-006");
    const c = freshContext(h, "2026-03-17T19:30");
    const seed = answerField(h, c, "LVO Protocol");
    const out = text(panel({ hospital: h, context: c, seed }));
    expect(out).toContain("About LVO Protocol · SYN-006");
    expect(out).toContain("Time Dependent");
    expect(out).toContain(seed.message);
    expect(out).toContain(`Next step ${seed.action}`);
    expect(out).toContain("Try asking:");
    expect(out).toContain("What are the thrombectomy coverage hours?");
    expect(out).toContain("Don't include patient names or identifiers.");
  });

  it("never carries a nudge from another hospital into this one", () => {
    const other = byId("SYN-006");
    const seed = answerField(other, freshContext(other), "LVO Protocol");
    const h = byId("SYN-001");
    const out = text(panel({ hospital: h, context: freshContext(h), seed }));
    expect(out).not.toContain("SYN-006");
    expect(out).not.toContain(seed.message);
  });

  it("is a labelled region with a live answer area and a visible close", () => {
    const h = byId("SYN-002");
    const html = panel({ hospital: h, context: freshContext(h) });
    expect(html).toContain('role="region"');
    expect(html).toContain(`aria-label="Ask Bluewater Regional Hospital&#x27;s guide"`);
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('maxLength="2000"');
    expect(text(html)).toContain("Close");
  });
});

describe("Answers for the sponsor's validation questions", () => {
  const cases: [string, string, string][] = [
    ["V01", "answered", "Video Eval Location"],
    ["V06", "time_dependent", "LVO Protocol"],
    ["V10", "hard_stop", "Charge Entry"],
    ["V12", "conflict", "Video Eval Location"],
    ["V13", "stale", "EEG"],
    ["V14", "not_in_guide", "Pediatric Neurology"],
  ];
  for (const [id, status, field] of cases)
    it(`${id} renders as ${status}, citing ${field}, with a Next step line`, () => {
      const f = challengeFixtures.find((x) => x.id === id)!;
      const h = byId(f.hospital);
      const turn = askGuide(h, fixtureContext(h, f), f.question!, 1);
      const r = turn.result!;
      expect(r.primaryStatus).toBe(status);
      const html = turnHtml(turn);
      expect(html).toContain(`data-status="${status}"`);
      const out = text(html);
      expect(out).toContain(f.question!);
      expect(out).toContain(field);
      expect(r.action.length).toBeGreaterThan(0);
      // A stale rule says how old it is once, in the Verify line, rather than
      // repeating it inside the action.
      expect(out).toContain(`Next step ${withoutStaleNote(r.action)}`);
      if (status === "stale") expect(out).toContain("Verify before relying on it.");
      expect(r.citations.every((s) => s.hospitalId === h.id)).toBe(true);
    });

  it("a missing field leads with the sponsor sentence and offers a person", () => {
    const f = challengeFixtures.find((x) => x.id === "V14")!;
    const h = byId(f.hospital);
    const turn = askGuide(h, fixtureContext(h, f), f.question!, 1);
    expect(turn.result!.message.startsWith("Not available in this hospital's guide.")).toBe(true);
    expect(text(turnHtml(turn))).toContain(
      "Call someone · Guide doesn't cover Pediatric Neurology",
    );
  });

  it("a plain answer does not offer a person", () => {
    const f = challengeFixtures.find((x) => x.id === "V01")!;
    const h = byId(f.hospital);
    const turn = askGuide(h, fixtureContext(h, f), f.question!, 1);
    expect(escalationReason(turn.result!)).toBeUndefined();
    expect(text(turnHtml(turn))).not.toContain("Call someone");
  });

  it("a conflict offers a person, naming the disagreement", () => {
    const f = challengeFixtures.find((x) => x.id === "V12")!;
    const h = byId(f.hospital);
    const turn = askGuide(h, fixtureContext(h, f), f.question!, 1);
    expect(escalationReason(turn.result!)).toBe(
      "Guide and storyboard disagree on Video Eval Location",
    );
  });
});

describe("Clarification", () => {
  const h = byId("SYN-001");
  const c = freshContext(h);

  it("renders the candidate fields as chips", () => {
    const turn = askGuide(h, c, "eeg or mri", 1);
    expect(turn.result).toBeUndefined();
    expect(turn.candidates).toEqual(["EEG", "MRI"]);
    const html = turnHtml(turn);
    expect(html).toContain('role="status"');
    expect(text(html)).toContain("Which guide field do you mean?");
    expect(html.match(/class="fact-chip"/g)).toHaveLength(2);
  });

  it("a chip re-asks by the exact name and gets an answer", () => {
    const turn = askField(h, c, "MRI", 2);
    expect(turn.result?.title).toBe("MRI");
    expect(turn.clarification).toBeUndefined();
  });

  it("every field label of every hospital resolves from its chip — no loops", () => {
    for (const hh of seedHospitals)
      for (const f of hh.fields) {
        const turn = askField(hh, freshContext(hh), f.field, 1);
        expect(turn.result, `${hh.id} · ${f.field}`).toBeDefined();
        expect(turn.result!.hospitalId).toBe(hh.id);
      }
  });

  it("asks for a shorter question past 2,000 characters", () => {
    expect(askGuide(h, c, "x".repeat(2001), 1).clarification).toBe(
      "Please shorten the question to 2,000 characters.",
    );
  });
});

describe("The thread belongs to one hospital, version and encounter", () => {
  const a = byId("SYN-001"),
    b = byId("SYN-002");
  const ca = freshContext(a);
  const turn = askGuide(a, ca, "Where should I perform the video evaluation?", 1);
  const thread = withTurn(undefined, threadKey(a, ca), turn);

  it("keeps the thread while nothing changes", () =>
    expect(threadFor(thread, threadKey(a, ca)).turns).toEqual([turn]));

  it("changing hospital clears it", () =>
    expect(threadFor(thread, threadKey(b, { ...ca, hospitalId: b.id })).turns).toEqual([]));

  it("a new guide version clears it", () => {
    const next: Hospital = { ...a, version: "Challenge v2 +storyboard 2026-03-01" };
    expect(threadFor(thread, threadKey(next, ca)).turns).toEqual([]);
  });

  it("a new encounter clears it", () =>
    expect(threadFor(thread, threadKey(a, freshContext(a))).turns).toEqual([]));

  it("a new turn for another hospital starts a fresh thread", () => {
    const cb = freshContext(b);
    const t2 = askGuide(b, cb, "Where should I perform the video evaluation?", 2);
    const next = withTurn(thread, threadKey(b, cb), t2);
    expect(next.turns).toEqual([t2]);
  });

  it("the panel for the new hospital shows none of the old answer", () => {
    const out = text(panel({ hospital: b, context: freshContext(b) }));
    expect(out).not.toContain(turn.result!.message);
    expect(out).not.toContain("SYN-001");
  });
});

describe("Suggestions", () => {
  it("are derived from the seed's field, with a generic fallback", () => {
    expect(suggestionsFor("EEG")[0]).toBe("Is EEG available now?");
    expect(suggestionsFor("Interpreter Line")[0]).toBe(
      "What does the guide say about Interpreter Line?",
    );
    expect(suggestionsFor()).toHaveLength(3);
  });

  it("every suggestion resolves to a guide field at every kit hospital", () => {
    const fields = [
      undefined,
      "LVO Protocol",
      "Video Eval Location",
      "Thrombolytic",
      "Thrombolytic Mix Model",
      "Wake Up Protocol",
      "Order Entry",
      "Order Set Name",
      "Charge Entry",
      "Consult Completion Rule",
      "Required Note Title",
      "Rounding Timing",
      "When Do We Round?",
      "Rounding Orders",
      "EEG",
      "CT Perfusion",
      "CTA Head/Neck",
      "MRI",
    ];
    for (const field of fields)
      for (const q of suggestionsFor(field))
        for (const h of seedHospitals)
          expect(
            askGuide(h, freshContext(h), q, 1).result,
            `${h.id}: "${q}"`,
          ).toBeDefined();
  });
});
