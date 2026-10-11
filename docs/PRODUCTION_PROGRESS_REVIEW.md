# Production progress and consultation redesign — 11 October 2026

The three teammate assignments are not the production plan's five modules. The team sprint built the synthetic demo foundation; it did not complete the production roadmap. This checkpoint supersedes the UI integration findings in the earlier combined audit, while retaining that audit as history.

## What distinguishes the current work

- Anticipatory guidance is tied to the active hospital, consult type, workflow step and field. CTA information appears before the value is recorded; a recorded value can promote an applicable rule into an advisory.
- Source records, hospital identity, verification dates and uncertainty remain inspectable. Conflicting guide/storyboard evidence is preserved rather than silently choosing a source.
- New hospital guide/storyboard bundles import atomically in either file order. Unknown fields and held storyboard rows remain available. The uploaded CSV mapping regression and reproduced schedule-parser defects were corrected by the team.
- Completion gates are distinguished from advisories and reference information. Acknowledgement does not bypass a fix-only requirement.
- The core works without a model or external service. An optional chat interpreter can identify intent, but cannot supply answer facts through its contract. The engine produces the cited answer.

These are demonstrated engineering capabilities, not a claim of uniqueness against competitors or clinical validation.

## Production plan alignment

| Production module | Current state | Remaining work |
|---|---|---|
| M1 — sponsor fidelity/demo readiness | Substantially delivered: official inputs, schedule semantics, conflicts, unknown fields, SYN-108 and alien fixtures, sponsor tests | Final release evidence and rehearsal against the frozen deployed revision |
| M2 — clinician experience | Dock, field markers, gate banner, chat, contacts, storyboard and guidance boundaries are integrated. This change adds the requested consultation split and connects the robust chat adapter | Complete `main.tsx` decomposition/EncounterProvider, separate admin navigation, full accessibility and clinician usability sign-off |
| M3 — rules as data | Partial: value lexicon, aliases, custom mappings and guardrails exist | Package/workspace split, fully declarative trigger/cascade/gate maps, compiled packs, IndexedDB migration, binding editor and parity/no-names release checks |
| M4 — production platform | Not delivered | API, database, shared persistence, authentication/RBAC, durable server audit, live-status transport/TTL/admin, observability, deployment/runbooks/backups, real host integration |
| M5 — AI augmentation | Provider-neutral question adapter and local fallback delivered; now connected to chat | Provider selection and server integration, live model evals, ingest interpreter, equivalence judge, proposal review, model telemetry and data-governance controls |

The plan's named model and provider-specific claims remain planning material, not verified configuration. No live model is enabled. Production completion estimates in the original plan have not been revalidated.

## UI direction delivered in this change

| Before | After | Why |
|---|---|---|
| Full-width form without a video area | Consultation pane left, documentation right on desktop | Implements the user's explicit consultation layout |
| Fixed guidance flyout over form controls | Dedicated companion area beneath the form | Expanding guidance leaves inputs accessible |
| Plain guidance pill | Luminous companion orb with explicit reference/advisory counts and state text | Gives the assistant a recognizable identity without implying listening |
| Old synchronous chat resolver | Provider-neutral chat session, local multi-question/typo/follow-up handling, cancellation and mode status | Makes the new chatbot work reachable in the application |
| Dense full video pane on phones | Collapsible consultation area and stacked form/companion | Preserves readable fields and prevents horizontal overflow |

The consultation pane offers an explicit local camera preview only. It requests camera access only after the user clicks Preview camera, never requests microphone access, stops tracks on Stop/unmount, and handles denial without disabling documentation. It is not a real Sevaro call or production video integration. The companion orb is a visual identity; it does not indicate speech capture.

Existing machine deliverables and deterministic rule behavior are preserved. The requested split layout supersedes the earlier full-width-caselog instruction in the sprint documents.

## Before calling it production-ready

Finish the platform, rules-as-data and live AI work above; validate the real host/video interfaces; complete operational/security and accessibility review; measure real provider behavior; and obtain the required product/clinical acceptance. Passing synthetic tests and an attractive UI do not satisfy those remaining production requirements.

## Verification for this delivery

- Production build and TypeScript validation passed.
- 448 unit tests passed across 20 files.
- The complete 26-check browser suite passed; the four consultation checks were rerun after the chat overflow fix. One additional camera lifecycle check passed, bringing covered browser checks to 27.
- Browser checks cover equal desktop columns, pre-selection CTA guidance, visible active fields with expanded guidance, focus return, three-part misspelled chat, 390px layout, camera denial, and camera track cleanup on stop/navigation. Camera success uses a synthetic canvas stream, not a physical camera or real call.
- Screenshots: `reports/consultation-desktop.png`, `reports/consultation-guidance.png`, `reports/consultation-chat.png`, `reports/consultation-mobile.png`.
- No live-provider evaluation, real video integration, full screen-reader/axe audit, clinician acceptance or hosted release rehearsal is claimed.

## Interaction corrections after user review

| Before | After | Why |
|---|---|---|
| Form used scroll containment | Native scroll handoff at both form edges | The form consumes scrolling first; the page continues after it reaches an edge |
| Companion opened cards when nudges existed, chat otherwise | Companion always opens chat; Review guidance opens the cards | Keeps the agent interaction consistent across all six workflow steps |
| Expanded guidance had no direct general chat launcher | Clickable orb with Ask a question | Chat remains accessible while reviewing recommendations |

Seven consultation browser checks pass, including wheel input at both scroll boundaries and actual chat submissions from all six steps. Existing CTA anticipation, form visibility, keyboard focus, mobile width and camera lifecycle checks remain passing.
