# Combined delivery review — 10 October 2026

Audited product commit: `c778f2655d3547a1f91c2573923b61cbf6ca1b76` on `sprint/demo`, pulled into `sprint/m3-ui`. This supersedes the earlier Machine 3 readiness snapshot. No product implementation was changed in this review.

**Decision: M1 and M2 deliveries are present; M3 is not complete and the promised sprint demo is not ready to freeze.** The current prototype works, including the newly delivered two-file import screen. The largest remaining job is connecting the delivered components into the doctor's actual workflow, followed by integration verification and rehearsal.

## What is delivered

| Owner / scope | Evidence and current state |
|---|---|
| M1 B1–B8 | Engine wording/actions, value interpretation, hospital-zone schedules, conflict handling, priority/auto-expand, completion gates and unbound fields are implemented. Existing tests pass. Schedule defects below remain. |
| M2 tasks 1–5 | Storyboard import in either file order; held rows; atomic bundle preview; alias/alien-shape tolerance; contacts import; generated seeds are present. Seeds contain 7 hospitals, 162 guide fields, 2 storyboard rows and 21 contacts. |
| M2 task 6 | SYN-108 Phoenix fixture: 24 guide fields, 3 storyboard rows, deliberately misleading note. Present and covered by tests. |
| M2 tasks 7–9 | ChatPanel, ContactsSheet and StoryboardCard are implemented. Nine isolated browser interaction checks pass. None is mounted in the main app yet. |
| M3 task 1: skeleton | Partial. Some components exist, but ContextHeader, FieldRow, CompleteBar, EncounterProvider and the planned admin split are missing. |
| M3 task 2: extraction/removal | Voice/transcript code removed. Main app remains monolithic; context/admin extraction and obsolete voice copy remain. |
| M3 task 3: dock | Reducer and components exist; 13 reducer tests. Dock and field markers are not mounted or styled. Focus does not drive the required behavior; no complete Escape/blur wiring. |
| M3 task 4: cards | New NudgeCard has action and evidence sections, but the app still renders its older card. Required provenance/conflict presentation is not complete in the live workflow. |
| M3 task 5: completion | Existing N5/N7 gates block correctly. New GateBanner and its release/reason/audit flow are not integrated. |
| M3 task 6: layout/accessibility/resilience | Partial. Old two-column screen/right ask rail remains; no integrated chat/contacts/storyboard, persistent context clock or isolated guidance error boundary. |
| M3 task 7: import | Core delivered in c778f26: multi-file drop/selection, per-file diagnostics, preview including held rows, atomic activation and three new browser tests. Uploaded unfamiliar CSV mapping has a regression; see below. |

## Verification performed

| Check | Result |
|---|---|
| Unit tests | 356 / 356, across 16 files |
| Sponsor evaluation | 29 / 29 (20 questions, 9 nudges) |
| Typecheck and production build | Pass |
| Full browser workflows after latest import commit | 14 / 14 |
| Additional deliverable probes | 11 / 13 pass; two reproducible failures below |
| Presentation navigation/layout/control checks | 63 pass, 12 slides; no observed page errors. PDF/screenshot export skipped in this navigation-only rerun. |
| Tracked-file inventory | 230 files inventoried at audited commit; text/data/source and integration review, JSON/JSONL parsing |
| Preserved source integrity | 84 / 84 manifest hashes match |
| Production desktop/mobile probe | No observed page errors; 390px viewport has no horizontal overflow |
| Browser latency, 120 committed edits | p50 22.5ms, p95 31.3ms, maximum 32.6ms |
| Browser latency, all 230 required events | p95 30.6ms, maximum 32.6ms |

Latency is the Vite development-server browser run on Chrome 154 / Windows / Node 24.20.0, single worker, 1440x1000. It measures adapter evaluation through React commit plus two animation frames, not actual pixel tracing. It does not measure the unmounted dock. Production UI probes used port 4173 separately.

The passing browser suite covers imports, N2 edits/time changes, N5/N7 blocking, conflicts/missing evidence, N8 silence, simulated outage, hospital isolation, mapping/version pinning, persistence, offline operation after load and timing. Passing these does not prove the new sprint interactions exist.

Scope limits: inventory/hashes are not a page-by-page re-review of every binary/PDF, nor a fresh replay of all historical research. No current hosted deployment, regenerated PDF, manual screen-reader run or clinical validation was verified.

## Findings, in completion order

### P0 — Finish the actual M3 workflow (M3)

`src/main.tsx` does not mount NudgeDock, FieldMarker, GateBanner, ChatPanel, ContactsSheet or StoryboardCard. Production DOM checks find zero new dock/card/marker/gate/storyboard elements. Focus on LVO leaves the guidance revision unchanged; main evaluation does not supply prior results for the new change-sensitive behavior.

Wire the shared encounter state, dock's four states, eligible auto-expansion, focus/blur/Escape behavior, field markers, contextual chat, contacts escalation, storyboard conflicts and completion release reasons. Give the caselog the intended space and add component styles. Implement a guidance-only error boundary so a thrown guidance failure cannot take down the caselog. The existing simulated-outage test does not exercise that failure boundary.

The isolated chat, contacts and storyboard checks prove useful component behavior, including hospital/version thread reset, clarification, escalation callbacks and keyboard closing. They do not establish usable navigation or appearance in the app.

### P1 — Uploaded unfamiliar CSV cannot select its headers (M3)

Reproduction: choose `data/holdout/mapped-import.csv` in the new file picker, choose CSV format, inspect the hospitalId mapper. It contains only `Unmapped`, rather than the file's `Site Code` column. The uploaded bundle consequently reports no hospital ID. Pasting the CSV into the existing text area can still map it.

Cause: uploaded files are retained without a column map; `previewNow` applies mapping to pasted input, and mapper options are derived from `csvHeaders(importText)`. Provide a per-file map and feed uploaded headers/mapping into preview. Preserve atomic activation and add a browser regression for the upload path, not only pasted CSV.

### P1 — Schedule uncertainty can become false certainty (M1 / M2)

The following direct module probes reproduce on the audited code; they are outside the currently passing suite:

| Input / function | Observed | Required correction |
|---|---|---|
| `windows("Mon-Fri 7:99am-5pm")` | Produces a window starting at minute 519 (08:39) | Reject malformed minutes instead of inventing a valid schedule. `src/time.ts` validates AM/PM hours but not minutes. |
| `availabilityAt("Not available 24/7; call for hours", "2026-03-17T15:00:00Z", "America/Chicago")` | `available`, `Available now` | Negated/uncertain 24/7 text must not imply continuous coverage. `windows` matches 24/7 without qualification. |
| `availabilityAt("Mon-Fri 0700-1900 except holidays", same instant/zone)` | `available`, `Available now`, no holiday caveat | Preserve the holiday exception/unknown calendar. This probe demonstrates a dropped caveat, not that March 17 is a known holiday. |

M1 owns the schedule parser; M2 owns the contacts availability label. Coordinate the fix and add malformed/negated/conditional cases before relying on unfamiliar data in the demo.

### P1 — Complete integrated accessibility and behavior verification (M3)

The new surfaces have no end-to-end app coverage because they are not mounted. After integration, exercise all four dock states, Info silence, auto-expand transitions, keyboard focus/return/Escape, contacts routing, hospital switching with open overlays, conflict evidence, blocker release auditing, and actual thrown guidance failure while editing continues.

Existing controls also include measured targets below 44px (e.g. 38px launch controls and a 25px acknowledge control). Run automated accessibility checks and manual keyboard/screen-reader verification on the final surfaces. The current mobile overflow pass does not establish these requirements.

### P2 — Align presentation, instructions and release evidence (M3 / release owner)

- `scripts/verify_embedded_demo.mjs` expects `.guidance-panel .card > p`, which matches nothing. The real embedded app works through `.field-guidance .card`; fix the stale verification selector and rerun the official script.
- README and `public/TEAM_HANDOFF.md` still describe removed transcript/voice gestures; `public/presentation.html` also describes transcript review and old 79-test counts. Historical `reports/TEST_RESULTS.md` is not today's test result. This report supersedes those counts, but the presentation copy still needs correction.
- Distinguish the historical 169 reconstructed PDF rows from the current official seed's 162 guide fields. They are different artifacts, not interchangeable completion counts.
- `.github/workflows/verify.yml` covers main pushes and type/unit/build checks; it does not establish a sprint/demo browser/accessibility/latency release gate.
- Rehearse two genuinely unfamiliar guide/storyboard bundles, both file orders, reload/held rows and an unfamiliar CSV. Freeze the tested revision, verify the hosted revision, regenerate final presentation artifacts and record a fallback demo.

## How far from completion?

The deterministic engine/data foundation and M2 component work have landed. This is not a backend rewrite or a new importer project. It is **one substantial M3 integration phase, targeted defect correction, then a final verification/rehearsal/deployment phase**. Counting every machine as one third would hide the remaining screen work; a precise percentage or delivery time is not supported by this review.

Freeze criteria: all promised surfaces reachable in the main app; correct dock and gate behavior; no false schedule certainty in reproduced cases; upload mapping working; integrated browser/accessibility checks passing; presentation and handoff matching the deployed revision. Optional production services, authentication, live EHR/speech and clinical validation remain outside this synthetic-demo sprint.

## Reproducible evidence

- `reports/machine3-audit.json`: audited SHA, tracked inventory, source hashes and production DOM probes.
- `reports/machine3-desktop.png`, `reports/machine3-mobile.png`: current production screen.
- `reports/DELIVERABLE_INTERACTIONS.json`: 13 additional probes with exact failures.
- Normal verification: `pnpm test`, `pnpm evaluate`, `pnpm build`, `pnpm test:e2e`. Browser runner emits `reports/browser-latency.json`; generated runner files may be ignored by Git.
