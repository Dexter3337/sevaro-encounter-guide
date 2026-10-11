# Chat interpretation adapter — 11 October 2026

The initial delivery covered AI/chatbot logic only. The user's subsequent UI request authorized the consultation redesign and ChatPanel integration, now delivered on `sprint/consultation-ui`. Provider selection remains deferred at the user's request.

## Delivered

- `src/chat/questions.ts`: local question normalization, conservative long-word typo correction, dotted acronyms/underscores, multiple questions (up to six), explicit alternative clarification, simple topic follow-ups, and invalid/ambiguous-time clarification. Corrected interpretations remain visible in the returned turn.
- `src/chat/adapter.ts`: optional provider-neutral intent interpreter. The model chooses guide concepts; the existing deterministic engine supplies answers, actions, statuses and citations. The model cannot supply answer prose or source citations through this contract.
- `src/chat/session.ts`: cancel previous requests, suppress late replies, reject responses after hospital/version/encounter/revision/clock changes, and clean up on unmount.
- `tests/chat-adapter.test.ts`: sponsor parity, typo/format/multiple-question cases, model contract rejection, timeout/failure fallback and request-race cases.

No provider, credentials, SDK, paid request or external network call is configured. This is an adapter and tested local fallback, not a claim of live LLM performance or broad natural-language coverage. ChatPanel now uses this session API, renders all returned turns and corrected interpretations, and shows local/fallback mode. Browser coverage verifies a misspelled three-part submission.

## Integration pattern (now mounted in ChatPanel)

Create one session per mounted chat, with a callback that reads the latest hospital and encounter from refs:

```ts
import { createChatSession } from "../chat/session";

const session = createChatSession(() => ({
  hospital: latestHospital.current,
  context: latestContext.current,
})); // no interpreter: local mode

const reply = await session.submit(question, lastAnsweredField);
if (reply) {
  // Append every reply.turns entry, not just the first answer.
  // Render question, interpreted (when present), result via NudgeCard,
  // and clarification/candidates when unresolved.
  // Show reply.mode; a fallback must not be labelled a model answer.
}

// On close/unmount/context switch:
session.dispose();
```

Keep loading/error state in the component. Disable duplicate submissions or allow a new submission to cancel the previous one. The session already suppresses stale results, but clear the visible thread, draft and lastAnsweredField when hospital, version or encounter changes. A prior field from another hospital must not seed a new conversation. Do not persist chat text. Topic continuity is limited to the last explicit field; the local fallback is not full conversational memory.

`reply.turns` uses the existing Turn shape plus optional `interpreted`. All turns receive distinct IDs within a session. Existing clarification chips can continue calling `askField`; retain source/date/status/action rendering and contacts escalation. Preserve the user's original submission alongside split turns if the UI groups a multi-question message.

## Future provider contract

Implement `QuestionInterpreter.interpret(request, signal)` on the server and inject an implementation into the session. The request contains the current question, an allowed field-label list, instructions and optional previous field. It does not automatically include encounter values, raw guide contents or previous messages. The question itself is user-entered text: this adapter does not claim to anonymize it. Settle permitted data and deploy server-side credentials before connecting a live provider.

Return an object (parse provider JSON on the server):

```json
{ "intents": [{ "start": 0, "end": 4, "field": "EEG", "candidates": [] }] }
```

Offsets refer to the exact original question using JavaScript UTF-16 indices. Up to six ordered, non-overlapping spans must cover all substantive input. Ambiguity returns `field: null` and allowed candidates. Unknown subjects return null and no candidates. Extra answer/citation fields, unknown field labels, skipped questions and invalid spans are rejected. Time expressions stay in the original span and are interpreted by the existing hospital-zone engine; the model cannot invent an instant.

A timeout (8 seconds by default), malformed response or provider error falls back to local interpretation and supplies a typed fallback reason. Cancellation returns no visible reply through the session. No raw provider error or credential is returned to the UI.

## Evaluation before selecting/activating a model

The contract tests use an injected test interpreter; they do not evaluate a real provider. After selection, measure intent accuracy and latency on sponsor cases, unseen hospital fields, noisy spelling, multi-part questions, pronoun follow-ups, ambiguous times, out-of-scope requests and prompt-injection attempts. A schema-valid intent can still identify the wrong field; show its interpretation and require clarification when uncertain. Keyword-based local scope checks are conservative helpers, not a comprehensive clinical safety classifier.

Run `pnpm exec vitest run tests/chat-adapter.test.ts`, then the full unit suite and build. See `docs/PRODUCTION_PROGRESS_REVIEW.md` for the subsequent UI integration and browser validation.
