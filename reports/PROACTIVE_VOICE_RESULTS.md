# Proactive voice workspace verification

Verified locally October 10, 2026 on branch `feature/proactive-voice-workspace`, based on `eee509d`. No hosted deployment or GitHub push was performed.

| Check | Result |
|---|---|
| TypeScript + production Vite build | Passed; two existing nonfatal third-party Zod annotation warnings |
| Unit tests | 109/109 across six files |
| Sponsor acceptance examples | 29/29, included in unit tests |
| Initial complete browser run | 18/18: all 12 existing workflows and six new voice paths |
| Final focused voice run | 7/7, including added spoken-answer echo suppression and voice stop |
| Unique browser paths verified | 19 across the complete and focused runs |
| Desktop/mobile visual review | Opened and inspected 1440px desktop and 390px mobile screenshots |
| Overflow checks | No horizontal overflow in Encounter at 1440/390px, or Guide library/Evaluation at 1440/768/390px |
| Page exceptions during separate visual inspection | None observed |
| Supplied hospital JSON | Seven hospitals / 162 guide records import without editing the source |
| Official context replay | Imaging + LVO=true preserved; correct outside-hours transfer pathway |

Raw evidence: `proactive-voice-unit-tests.json`, `proactive-voice-browser-tests.json` (final seven focused paths), `proactive-voice-latency.json`, `proactive-voice-desktop.png`, and `proactive-voice-mobile.png`. Original baseline reports remain preserved under their original names. The complete 18-path run used the console reporter; the focused seven-path run also saved JSON.

## Timing

The existing repeated N1–N9 browser benchmark measured actual form interactions in the refreshed UI:

| Population | Count | p50 | p95 | Maximum |
|---|---:|---:|---:|---:|
| Committed field edits | 120 | 25.6 ms | 34.6 ms | 46.7 ms |
| Required field/open/completion events | 230 | 25.8 ms | 36.1 ms | 68.8 ms |

Chrome 154.0.8037.92, Windows, Node 24.14.0, Vite development server, headless single worker, 1440×1000. This measures adapter → React commit → two animation frames, a paint-readiness approximation. It does **not** measure microphone capture, network transcription, speech recognition accuracy or clinical outcomes. Those remain unmeasured.

## Voice behavior exercised

Ambient multi-field extraction, negation/contractions, uncertainty/history/future suppression, contradictory-fact rejection, Bot wake followed by a question, named-field dictation, corrections and guidance retraction, revision-bound undo, manual-edit preservation, review mode, stale-draft rejection, gate exclusion, interim-versus-final speech events, final-result deduplication, low-confidence review, microphone permission failure, encounter-switch cancellation, synthesized-response echo suppression, recognition resumption and voice stop.

Live speech lifecycle tests inject a controlled browser recognition provider and synthesis callbacks. They verify our capture-to-parser-to-encounter integration; no physical microphone or real browser transcription-service accuracy was tested. A manual microphone rehearsal is still needed on the presentation computer.

## Reproduce

```sh
pnpm test
pnpm build
pnpm test:e2e
```

On this checkout, pnpm is available through `npx --yes pnpm@11.25.0`. See `docs/VOICE_WORKFLOW.md` for the microphone demo, support boundaries and source-format fixes.
