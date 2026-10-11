import { describe, it, expect, vi } from "vitest";
import { seedHospitals } from "../src/data";
import { freshContext } from "../src/domain";
import {
  answerChat,
  replyIsCurrent,
  type QuestionInterpreter,
} from "../src/chat/adapter";
import { askQuestions, normalizeQuestion } from "../src/chat/questions";
import { challengeFixtures } from "../src/fixtures";
import { fixtureContext } from "../src/evaluation";
import { ask } from "../src/engine";
import { createChatSession } from "../src/chat/session";
const h = seedHospitals.find((h) => h.id === "SYN-001")!;
const c = freshContext(h, "2026-03-17T15:00");
const interpreter = (field: string, extra = {}): QuestionInterpreter => ({
  interpret: async (request) => ({
    intents: [{ start: 0, end: request.question.length, field, ...extra }],
  }),
});

describe("Local robust question interpretation", () => {
  it("corrects a unique long-word typo and exposes its interpretation", () => {
    const turn = askQuestions(h, c, "PLS lvo protcol??", 1)[0];
    expect(turn.result?.title).toBe("LVO Protocol");
    expect(turn.interpreted).toContain("protcol");
  });
  it("handles separate questions, newlines and conjunctions", () => {
    expect(
      askQuestions(h, c, "EEG and MRI?\nWho mixes TNK?", 1).map(
        (t) => t.result?.title,
      ),
    ).toEqual(["EEG", "MRI", "Thrombolytic Mix Model"]);
  });
  it("handles dotted acronyms and underscores", () => {
    expect(
      askQuestions(h, c, "E.E.G availability; order_set_name", 1).map(
        (t) => t.result?.title,
      ),
    ).toEqual(["EEG", "Order Set Name"]);
  });
  it("keeps alternatives as clarification", () => {
    expect(askQuestions(h, c, "EEG or MRI?", 1)[0].result).toBeUndefined();
    expect(askQuestions(h, c, "EEG or MRI?", 1)[0].candidates).toEqual(
      expect.arrayContaining(["EEG", "MRI"]),
    );
  });
  it("clarifies CTA versus MRI without favoring the CTA acronym", () => {
    expect(askQuestions(h, c, "CTA or MRI?", 1)[0].candidates).toEqual([
      "CTA Head/Neck",
      "MRI",
    ]);
  });
  it("reports missing CTA documentation without inventing a capability", () => {
    const hospital = seedHospitals.find((h) => h.id === "SYN-006")!;
    expect(
      askQuestions(hospital, freshContext(hospital), "CTA available?", 1)[0]
        .result?.primaryStatus,
    ).toBe("not_in_guide");
  });
  it("does not fuzzy-correct acronyms or alter numbers/negation", () => {
    const out = normalizeQuestion("not EGG at 19:30", h).text;
    expect(out).toBe("not EGG at 19:30");
  });
  it("answers a supported topic follow-up without treating it as a new field", () => {
    const turn = askQuestions(h, c, "what about at 7pm tomorrow?", 1, "EEG")[0];
    expect(turn.result?.title).toBe("EEG");
    expect(turn.result?.effectiveLocal).toContain("19:00");
  });
  for (const question of [
    "MRI at 7:99pm?",
    "EEG at 13pm?",
    "EEG at 25:00?",
    "EEG on 03/04/26?",
    "EEG tonight?",
  ])
    it(`clarifies unsupported time: ${question}`, () => {
      const turn = askQuestions(h, c, question, 1)[0];
      expect(turn.result).toBeUndefined();
      expect(turn.clarification).toBeTruthy();
    });
  it("refuses to mix hospital identities or recommend a dose", () => {
    for (const question of [
      "EEG at SYN-002?",
      "what dose of TNK should I give?",
    ])
      expect(askQuestions(h, c, question, 1)[0].result).toBeUndefined();
  });
  it("does not lose an unresolved second question", () => {
    const turns = askQuestions(h, c, "EEG? can you predict the weather?", 1);
    expect(turns).toHaveLength(2);
    expect(turns[1].clarification).toBeTruthy();
  });
  it("preserves an unresolved question joined with and", () => {
    const turns = askQuestions(h, c, "EEG and can you predict the weather?", 1);
    expect(turns).toHaveLength(2);
    expect(turns[1].result).toBeUndefined();
  });
  for (const fixture of challengeFixtures.filter((f) => f.kind === "question"))
    it(`preserves sponsor ${fixture.id}`, () => {
      const hospital = seedHospitals.find((h) => h.id === fixture.hospital)!;
      const context = fixtureContext(hospital, fixture);
      const expected = ask(hospital, context, fixture.question!).result;
      const actual = askQuestions(hospital, context, fixture.question!, 1)[0]
        .result;
      expect(actual?.message).toBe(expected?.message);
      expect(actual?.primaryStatus).toBe(expected?.primaryStatus);
    });
});

describe("Chat request lifecycle", () => {
  it("drops an older answer when another question is submitted", async () => {
    const callbacks: Array<(v: unknown) => void> = [];
    const session = createChatSession(() => ({ hospital: h, context: c }), {
      interpreter: {
        interpret: () => new Promise((resolve) => callbacks.push(resolve)),
      },
    });
    const first = session.submit("EEG?");
    const second = session.submit("MRI?");
    callbacks[1]({ intents: [{ start: 0, end: 4, field: "MRI" }] });
    expect((await second)?.turns[0].result?.title).toBe("MRI");
    callbacks[0]({ intents: [{ start: 0, end: 4, field: "EEG" }] });
    expect(await first).toBeUndefined();
    session.dispose();
  });
  it("drops a delayed response when the selected hospital changes", async () => {
    let active = { hospital: h, context: c };
    let resolve!: (v: unknown) => void;
    const session = createChatSession(() => active, {
      interpreter: { interpret: () => new Promise((r) => (resolve = r)) },
    });
    const reply = session.submit("EEG?");
    active = {
      hospital: seedHospitals.find((h) => h.id === "SYN-002")!,
      context: c,
    };
    resolve({ intents: [{ start: 0, end: 4, field: "EEG" }] });
    expect(await reply).toBeUndefined();
    session.dispose();
  });
  it("does not display a cancelled local reply", async () => {
    const session = createChatSession(() => ({ hospital: h, context: c }));
    const reply = session.submit("EEG?");
    session.dispose();
    expect(await reply).toBeUndefined();
  });
});

describe("Provider-neutral chat adapter", () => {
  it("works fully with no provider", async () => {
    const reply = await answerChat(h, c, "EEG?");
    expect(reply.mode).toBe("local");
    expect(reply.turns[0].result?.title).toBe("EEG");
  });
  it("uses the model only for intent, while answers come from the engine", async () => {
    const reply = await answerChat(h, c, "brain electrical test availability", {
      interpreter: interpreter("EEG"),
    });
    expect(reply.mode).toBe("interpreted");
    expect(reply.turns[0].result?.message).toBe(
      ask(h, c, "EEG").result?.message,
    );
    expect(reply.turns[0].question).toBe("brain electrical test availability");
  });
  it("sends no encounter values, hospital source contents or prior messages to the interpreter", async () => {
    const interpret = vi.fn(async (r) => ({
      intents: [{ start: 0, end: r.question.length, field: "EEG" }],
    }));
    await answerChat(
      h,
      {
        ...c,
        values: { note_body: { state: "known", value: "SECRET TEST NOTE" } },
      },
      "EEG?",
      { interpreter: { interpret } },
    );
    const request = interpret.mock.calls[0][0];
    const serialized = JSON.stringify(request);
    expect(serialized).not.toContain("SECRET TEST NOTE");
    expect(request).not.toHaveProperty("citations");
    expect(request).not.toHaveProperty("values");
  });
  for (const data of [
    { intents: [{ start: 0, end: 4, field: "Foreign hospital policy" }] },
    { intents: [{ start: 0, end: 4, field: "EEG", answer: "invented facts" }] },
    { intents: [{ start: 0, end: 40, field: "EEG" }] },
    { intents: [{ start: 0, end: 4, field: "EEG" }], answer: "invented" },
    { intents: [] },
  ])
    it(`rejects malformed or ungrounded model output ${JSON.stringify(data)}`, async () => {
      const reply = await answerChat(h, c, "EEG?", {
        interpreter: { interpret: async () => data },
      });
      expect(reply.mode).toBe("fallback");
      expect(reply.fallbackReason).toBe("invalid_response");
    });
  it("rejects silently omitted questions", async () => {
    const reply = await answerChat(h, c, "EEG? MRI?", {
      interpreter: {
        interpret: async () => ({
          intents: [{ start: 0, end: 4, field: "EEG" }],
        }),
      },
    });
    expect(reply.mode).toBe("fallback");
    expect(reply.turns).toHaveLength(2);
  });
  it("returns field choices when the interpreter is unsure", async () => {
    const reply = await answerChat(h, c, "brain scan?", {
      interpreter: {
        interpret: async (r) => ({
          intents: [
            {
              start: 0,
              end: r.question.length,
              field: null,
              candidates: ["MRI", "CTA Head/Neck"],
            },
          ],
        }),
      },
    });
    expect(reply.turns[0].result).toBeUndefined();
    expect(reply.turns[0].candidates).toHaveLength(2);
  });
  it("falls back on provider errors and timeouts", async () => {
    const failure = await answerChat(h, c, "EEG?", {
      interpreter: {
        interpret: async () => {
          throw Error("private provider details");
        },
      },
    });
    expect(failure.fallbackReason).toBe("provider_error");
    expect(JSON.stringify(failure)).not.toContain("private provider");
    const timeout = await answerChat(h, c, "EEG?", {
      timeoutMs: 5,
      interpreter: { interpret: () => new Promise(() => {}) },
    });
    expect(timeout.fallbackReason).toBe("timeout");
    expect(timeout.turns[0].result).toBeTruthy();
  });
  it("aborts without displaying a fallback for a cancelled request", async () => {
    const controller = new AbortController();
    const pending = answerChat(h, c, "EEG?", {
      signal: controller.signal,
      interpreter: { interpret: () => new Promise(() => {}) },
    });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });
  it("makes stale replies rejectable after hospital, revision or clock changes", async () => {
    const reply = await answerChat(h, c, "EEG?");
    expect(replyIsCurrent(reply, h, c)).toBe(true);
    expect(replyIsCurrent(reply, h, { ...c, revision: c.revision + 1 })).toBe(
      false,
    );
    expect(
      replyIsCurrent(reply, h, { ...c, instant: "2026-03-18T00:00:00Z" }),
    ).toBe(false);
    expect(replyIsCurrent(reply, { ...h, id: "SYN-002" }, c)).toBe(false);
  });
});
