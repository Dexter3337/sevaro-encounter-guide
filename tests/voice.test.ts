import { describe, it, expect } from "vitest";
import { parseVoice } from "../src/voice";

describe("Voice intent and finite current-fact extraction", () => {
  it("does not confuse contracted questions or another completed task with CTA completion", () => {
    expect(parseVoice("Isn't CTA done").kind).toBe("none");
    expect(parseVoice("Don't record LVO is present").kind).toBe("none");
    expect(parseVoice("CTA ordered, note completed.").kind).toBe("none");
    expect(parseVoice("CTA is completed, LVO is present.")).toMatchObject({
      kind: "changes",
      changes: [
        { fieldId: "cta_done", value: true },
        { fieldId: "lvo_present", value: true },
      ],
    });
  });
  it("extracts multiple current findings without a Bot command", () => {
    const result = parseVoice(
      "Last known well is unknown. CTA is completed. LVO is present.",
    );
    expect(result.kind).toBe("changes");
    if (result.kind === "changes") {
      expect(result.explicit).toBe(false);
      expect(result.changes.map((x) => [x.fieldId, x.value])).toEqual([
        ["last_known_well_status", "Unknown"],
        ["cta_done", true],
        ["lvo_present", true],
      ]);
    }
  });
  it("preserves explicit negation and extracts LVO from a CTA finding", () => {
    expect(parseVoice("No LVO. CTA is not completed.")).toMatchObject({
      kind: "changes",
      changes: [
        { fieldId: "lvo_present", value: false },
        { fieldId: "cta_done", value: false },
      ],
    });
    expect(parseVoice("The CTA shows a large vessel occlusion.")).toMatchObject(
      { kind: "changes", changes: [{ fieldId: "lvo_present", value: true }] },
    );
  });
  it.each([
    "CTA isn't done.",
    "CTA hasn't been completed.",
    "CTA is not yet completed.",
    "No CTA was performed.",
  ])("handles common spoken CTA negatives: %s", (text) => {
    expect(parseVoice(text)).toMatchObject({
      kind: "changes",
      changes: [{ fieldId: "cta_done", value: false }],
    });
  });
  it.each([
    "LVO isn't present.",
    "There is not a large vessel occlusion present.",
    "The patient doesn't have LVO.",
  ])("handles spoken LVO negatives: %s", (text) => {
    expect(parseVoice(text)).toMatchObject({
      kind: "changes",
      changes: [{ fieldId: "lvo_present", value: false }],
    });
  });
  it("handles unpunctuated speech questions and stop commands", () => {
    expect(parseVoice("Bot which order set should I use")).toMatchObject({
      kind: "question",
    });
    expect(parseVoice("Bot tell me the LVO protocol")).toMatchObject({
      kind: "question",
    });
    expect(parseVoice("Bot stop listening")).toEqual({ kind: "stop" });
  });
  it.each([
    "Is LVO present?",
    "LVO was present yesterday.",
    "Possible LVO is present.",
    "CTA will be completed.",
    "History of large vessel occlusion.",
    "LVO is not negative.",
    "Last known well is not unknown.",
  ])(
    "does not fill questions, uncertain/history/future/double-negative phrasing: %s",
    (text) => {
      expect(parseVoice(text).kind).toBe("none");
    },
  );
  it("rejects contradictory findings without partial writes", () => {
    expect(parseVoice("LVO is present. No LVO.").kind).toBe("rejected");
  });
  it("routes addressed questions separately from narrative content", () => {
    expect(parseVoice("Bot, what is the LVO pathway?")).toEqual({
      kind: "question",
      question: "what is the LVO pathway?",
    });
    expect(parseVoice("Hey Bot")).toEqual({ kind: "wake" });
    expect(parseVoice("Who mixes the TNK?", true)).toEqual({
      kind: "question",
      question: "Who mixes the TNK?",
    });
    expect(parseVoice("Who mixes the TNK?").kind).toBe("none");
  });
  it("supports named-field commands with exact dictated text", () => {
    expect(
      parseVoice("Bot fill note body with Synthetic consult. CTA reviewed."),
    ).toMatchObject({
      kind: "changes",
      explicit: true,
      changes: [
        { fieldId: "note_body", value: "Synthetic consult. CTA reviewed." },
      ],
    });
    expect(parseVoice("Bot set LVO to no")).toMatchObject({
      kind: "changes",
      changes: [{ fieldId: "lvo_present", value: false }],
    });
    expect(parseVoice("Bot fill CTA with maybe").kind).toBe("rejected");
  });
  it.each([
    "Bot fill charge entered with yes",
    "Bot set plan confirmed to yes",
    "Bot fill thrombolytic given with yes",
    "Bot set hospital to SYN-001",
  ])("does not permit gate, identity or administration changes: %s", (text) =>
    expect(parseVoice(text).kind).toBe("rejected"),
  );
  it("supports navigation and undo only when addressed", () => {
    expect(parseVoice("Bot open imaging")).toEqual({
      kind: "navigate",
      step: "imaging",
    });
    expect(parseVoice("Bot go to sign off")).toEqual({
      kind: "navigate",
      step: "sign_off",
    });
    expect(parseVoice("Bot undo that")).toEqual({ kind: "undo" });
    expect(parseVoice("undo that").kind).toBe("none");
  });
});
