import { describe, it, expect } from "vitest";
import { resolveConcept } from "../src/knowledge";
import { ask } from "../src/engine";
import { freshContext } from "../src/domain";
import { seedHospitals } from "../src/data";

const SYN006 = seedHospitals.find((h) => h.id === "SYN-006")!;

describe("Question router whole-token matching (bug reproduction)", () => {
  it("does not misroute 'Is EVT available?' to the AI field", () => {
    // "ai" is a substring of "available"; a whole-token matcher must not score AI.
    const r = resolveConcept("Is EVT available?", SYN006);
    expect(r.field).not.toBe("AI");
  });

  it("does not answer the EVT question with a wrong AI 'not in guide' result", () => {
    const c = freshContext(SYN006);
    const res = ask(SYN006, c, "Is EVT available?");
    // Must not confidently answer about AI, which SYN-006 does not define.
    expect(res.result?.message ?? "").not.toContain("AI");
    // Expected: clarification (or a legitimately matching field), not a wrong answer.
    const clarified = Boolean(res.clarification);
    const routedElsewhere = res.result !== undefined && res.result.title !== "AI";
    expect(clarified || routedElsewhere).toBe(true);
  });

  it("does not match 'tee' inside the word 'guarantee'", () => {
    const r = resolveConcept("Can you guarantee a bed is open?", SYN006);
    expect(r.field).not.toBe("TEE");
    expect(r.candidates).not.toContain("TEE");
  });

  it("does not match 'ct'/'eeg' embedded inside unrelated words", () => {
    // "contract" embeds "ct"; "peg" / "keenness" do not embed eeg, so use "feege"-like filler.
    const r1 = resolveConcept("What does the contract say?", SYN006);
    expect(r1.field).not.toBe("CT Perfusion");
    const r2 = resolveConcept("Describe the sieege workflow", SYN006);
    expect(r2.field).not.toBe("EEG");
  });
});

describe("Question router preservation (whole-token matches still work)", () => {
  it("still routes a standalone AI question to AI", () => {
    const r = resolveConcept("What is the AI software?", SYN006);
    expect(r.field).toBe("AI");
  });

  it("still routes a multi-word 'CT perfusion' question", () => {
    const r = resolveConcept("Do you have CT perfusion?", SYN006);
    expect(r.field).toBe("CT Perfusion");
  });

  it("still routes an EEG question to EEG", () => {
    const r = resolveConcept("Is EEG available today?", SYN006);
    expect(r.field).toBe("EEG");
  });

  it("preserves the order-set shortcut", () => {
    const r = resolveConcept("Which order set should I use?", SYN006);
    expect(r.field).toBe("Order Set Name");
  });

  it("preserves the who-mixes shortcut", () => {
    const r = resolveConcept("Who mixes the TNK?", SYN006);
    expect(r.field).toBe("Thrombolytic Mix Model");
  });
});
