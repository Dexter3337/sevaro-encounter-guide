# Proactive voice workspace

Implemented locally on October 10, 2026. Synthetic hackathon demonstration. The microphone integration is real browser speech recognition; field interpretation is a finite deterministic parser, not a general clinical language model. This update does not connect to Synapse or a video-call service.

## The USP

**The conversation becomes the trigger.** A doctor says a supported current finding; the encounter fills and the correct hospital-specific rule appears immediately, before a question is asked. The product loop is listen → fill → guide. “Bot” questions are a secondary, hands-free way to inspect the same hospital sources.

The redesigned workspace uses a calm mint/teal palette, a persistent hospital context strip, a prominent voice companion, visible field provenance, source-backed guidance and responsive layouts. The voice panel previews the applicable rule immediately so a doctor need not scroll down to discover the response.

## Two-minute demonstration

1. Start the local app with `./start-demo.ps1`. Use Chrome on localhost or HTTPS. The default hospital is Highland Valley, Tuesday March 17, 2026 at 19:30 Central.
2. Select **Start listening**, allow the microphone, and say: **“CTA is completed. LVO is present.”** Both fields fill, the app opens Imaging, and the outside-coverage transfer pathway appears in the voice panel with its source. No “Bot” or question is required for these supported facts.
3. Say **“Bot”**, pause for the response, then **“What is the LVO pathway?”** Or say it in one phrase: **“Bot, what is the LVO pathway?”** The existing hospital question engine answers with citations. The read-aloud toggle controls spoken replies.
4. Say **“Bot, fill note body with Synthetic consultation reviewed.”** The note field updates. Say **“Bot, undo”** to reverse the last voice update if no later edit has superseded it.
5. Say **“Bot, stop listening.”** The microphone stops. It also stops when leaving Encounter or switching encounter/hospital/guide version.
6. If speech recognition is unavailable, expand **Test a phrase** and submit the same text. This is explicitly a typed transcript test, using the same parser and update path; it is not represented as measured audio transcription.

## Supported interactions

| Interaction | Examples | Result |
|---|---|---|
| Ambient current facts | “Last known well is unknown”; “CTA is completed”; “LVO is present”; “No LVO” | Supported facts fill automatically when Auto-fill clear findings is enabled |
| Addressed question | “Bot, who mixes the TNK?”; “Bot, which order set should I use?” | Existing hospital-scoped resolver and evidence engine |
| Dictation | “Bot, fill allergies with none”; “Bot, fill assessment plan with Request EEG”; “Bot, fill note title with Remote consult” | Exact dictated value goes to the named allowlisted field |
| Structured command | “Bot, set CTA to yes”; “Bot, set LVO to no”; “Bot, set last known well to unknown” | Validated Boolean/status value |
| Navigation | “Bot, open imaging”; “Bot, go to sign off” | Opens the named step; Rounding requires a rounding encounter |
| Undo | “Bot, undo”; Undo button | Restores the previous values/step only if no subsequent revision occurred |
| Microphone control | “Bot, stop listening”; Stop listening button | Stops capture and any active spoken response |

Explicit text dictation supports allergies, reason for consult, assessment plan, note title, note body and rounding order intent. Natural speech outside the supported patterns remains visible in the activity trail but does not invent facts. Questions, uncertainty, historical/future statements and conflicting facts are conservatively excluded from automatic filling. Complex language may still be missed or misinterpreted; review the visible values.

With Auto-fill off, ambient findings become a review card. Reported recognition confidence between 0 and 0.65 also requires review; zero means unavailable confidence and is not a calibrated probability. A draft cannot apply after the encounter revision changes. Transcript history is limited to the current mounted voice session and is not saved to localStorage; accepted field values follow the existing browser-local encounter storage. Field-change audit records label voice origin without copying raw transcript quotes into the exported audit.

## Boundaries and lifecycle

- No recording begins on page load. Starting recognition requires the user's microphone action and browser permission.
- Uses the browser's `SpeechRecognition`/`webkitSpeechRecognition` and speech synthesis APIs. Support varies; recognition may process audio through the browser provider's online service. No offline or browser-local transcription claim is made. Synthetic speech only.
- Captures the doctor's microphone, not both sides of a meeting, screen audio, video, or a call participant feed. There is no speaker diarization.
- Interim transcripts are display-only. Each final result index is processed once. Final segments in a single event are combined into one interpretation.
- Recognition is suspended during spoken Bot replies, then resumed, to avoid interpreting the Bot's own answer. Failed/denied service access produces a visible stopped state and retry path.
- Silence/disconnection restarts are bounded. Changing the encounter/hospital/version or leaving the workspace aborts capture and cancels speech. Stale draft approval and undo cannot overwrite later edits.
- Speech cannot mark medication administration, orders, charge posting, provider plan confirmation, patient identity or completion as performed. Those stay on the explicit manual workflow. Dictating a sentence into a note never releases a completion gate.
- Existing guide availability, unknown-hours, stale-source and conflict behavior still applies. Unverified guidance is not upgraded by the transcript.
- Speech-to-text accuracy and audio-to-guidance latency have not been measured with a physical microphone in automated tests. Mocked speech callbacks verify application behavior, not the browser's transcription service or clinical accuracy.

## Developer-kit compatibility fixes

The six files from the user-supplied developer-kit ZIP are preserved in `data/official/`. Nested hospital objects now accept `local_timezone` and `time_zone`, as well as `timezone`. The original sponsor hospital file imports without pre-editing: seven hospitals and 162 guide fields. The runtime PDF reconstruction has seven additional timezone fields; values and verification dates agree after removing two inline verification annotations.

The external context adapter now applies `caselog_step`, `field_event`, `provider_timezone`, `charge_entered` and `plan_confirmed`, validates field types/options, and respects explicit offsets, including DST folds. The official Imaging/LVO example produces the outside-hours pathway through the real engine. This remains a local adapter, not an established host event API.

## Code and validation

- `src/voice.ts`: bounded intent and fact parser; no model or network call.
- `src/useMicrophone.ts`: capture lifecycle, final/interim handling, speech output and echo suppression.
- `src/VoiceCopilot.tsx`: microphone controls, wake-word session, review, transcript test and activity trail.
- `src/main.tsx`: ordinary encounter event path, voice-origin labeling, revision-bound undo and current-hospital questions.
- `src/workspace.css`, `src/Icon.tsx`: responsive workspace design.
- `tests/voice.test.ts`, `tests/official-kit.test.ts`, `tests/e2e/voice.spec.ts`: parser boundaries, exact source format, envelope replay, application interaction and mocked speech lifecycle.

Run `pnpm test`, `pnpm build`, and `pnpm test:e2e`. Updated verification is recorded separately in `reports/PROACTIVE_VOICE_RESULTS.md` so historical handoff measurements remain intact.

Browser API references: [Speech recognition](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition), [using Web Speech](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API/Using_the_Web_Speech_API), and [on-device processing limitations](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition/processLocally).
