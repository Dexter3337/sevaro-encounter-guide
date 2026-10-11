# Machine 3 and demo readiness review

Reviewed 10 October 2026, America/New_York. The checkout initially used the older `main` (`eee509d`). During shipping, Machine 2 task 5 (`6236458`) arrived. Machine 3's existing `5154469` was rebased onto it as `2eb9eed`; the first review checkpoint shipped to both `sprint/m3-ui` and `sprint/demo` as `167d771`. This report includes task 5 and fresh checks of that combined work. This is a checkpoint review, not a declaration that the sprint is finished.

**Verdict: the existing prototype can be demonstrated; the new sprint presentation is not ready yet.** The deterministic engine and import APIs work. Most remaining work is connecting the new UI components, delivering Machine 2's remaining screens, and rehearsing the exact judge-file workflow. Passing the old browser paths does not prove the unmounted dock works.

## What was reviewed

- Inventoried all 213 files tracked at the start of this review and reran the inventory after shipping and integrating task 5 (219 tracked files). This covers application code, tests, data, build/deployment configuration, sprint plans, scripts and preserved research artifacts. JSON/JSONL files parse successfully. Binary assets were inventoried; this is not a page-by-page visual review of every workbook/PDF or every research preview.
- Checked all 84 originals listed in `team-source-manifest.json` against their SHA-256 hashes: zero mismatches. Research/source files remain unchanged.
- Read `docs/sprint/MACHINE_3.md`, the three-machine ownership plan, dock requirements, integration contracts and Machine 2/engine requirements. Read the sponsor handbook, particularly silence, hard stops, the four answer requirements and the live new-hospital test.
- Inspected the actual production preview at 1440 x 1000 and 390 x 844, plus the browser workflows. There were no page errors in the production audit.
- Fresh inventory and production DOM evidence: [machine3-audit.json](machine3-audit.json). Screenshots: [desktop](machine3-desktop.png), [mobile](machine3-mobile.png). Reproduce after building and starting a preview with `node scripts/audit_machine3.mjs`.

## Fresh verification

| Check | Result |
|---|---|
| Frozen-lockfile install | Passed, Node 24.20.0 / pnpm 11.25.0 |
| Typecheck and production build (`pnpm build`) | Passed |
| Unit/integration tests | 295 passed across 13 files |
| Sponsor evaluation | N1-N9 and V01-V20: 29/29 passed |
| Browser suite | 11/11 passed, single Chrome worker |
| Field-change latency | 120 committed edits: p95 31.4 ms, maximum 32.5 ms |
| All required measured events | 230 committed events: p95 30.5 ms, maximum 35.8 ms; below 500 ms |
| Production audit | No page errors; document width 390 px at a 390 px viewport |
| Preserved source hashes | 84/84 matched |

Latency is the existing engine-to-React-commit plus two animation frames approximation on this Windows machine (Chrome 154.0.8037.98). It does not measure the unmounted new dock or guarantee performance on other machines. Browser workflows ran against Vite development; the separate DOM/screenshot audit ran against the production preview.

The browser suite initially failed during collection: importing the app evaluation module pulled JSON into Playwright's Node loader without import attributes. The harness now computes statistics directly from the live UI's exported samples, retaining the sample-count and 500 ms assertions. The obsolete transcript popup test was removed to match the already-approved scope removal, and the latency report records the actual Node version. Task 5 also changed provenance from the original PDF reconstruction to the official importer; the N2 evidence assertion now verifies `hospital_guides.json · LVO Protocol` and its verification date. No clinical engine or Machine 2 component was changed for this review.

## Machine 3 checklist

| Task in MACHINE_3.md | Status | Evidence / remaining work |
|---|---|---|
| 1. Skeleton and frozen props | Partial | Shared types, dock reducer and chat/contacts/storyboard stubs exist. `ContextHeader`, `FieldRow`, `CompleteBar` and standalone `ReferenceRow` files are absent; the new dock and Machine 2 stubs are not mounted in `main.tsx`. |
| 2. Decompose main and remove voice | Partial | Voice/transcript code, dedicated tests and voice document were removed. `main.tsx` still contains 1,533 lines with state, clinical form and admin UI. No `EncounterProvider`, `src/admin/`, or `DemoTools.tsx`. Clock override is retained. Ask-panel voice copy still remains. |
| 3. Floating dock | Built, not integrated | `NudgeDock.tsx` and the four-state reducer exist; 13 reducer tests pass. Production DOM contains zero dock instances. LVO focus leaves encounter revision unchanged; `focus()` only dispatches for order placement. `evaluate()` calls omit previous results. No dock-specific CSS, Escape handling or 1.5-second blur timer exists. |
| 4. Card content | Partial, not integrated | New cards contain action and disclosure controls, but the screen still renders the old local `Card` and `ReferenceRow`, omitting the separate action line. Conflict values/dates are inside the evidence disclosure, not side-by-side on the card. New cards lack the tier icon and always-visible verification/stale line. `WhyShown` does not use `triggerId`. |
| 5. Hard stop at Complete | Built, not integrated | `GateBanner.tsx` exists but is never rendered. Charge and plan-confirmation blocks work through the old paths. Actual completion feedback has `role="status"`, not `alert`. The reason-based release and audit callbacks are not connected. |
| 6. Layout, header, resilience, accessibility | Partial | Existing narrow layout has no horizontal overflow. The right ask rail and two-column grid remain: caselog 655 px of a 1,182 px workspace. Provider clock is inside collapsed demo controls; absent from the visible header. No storyboard or markers are mounted. Error boundary wraps the whole application rather than isolating guidance. Nine measured visible buttons are smaller than the sprint's 44 px target. |
| 7. Multi-file admin import | Not integrated | Machine 2's `previewImportBundle(files, options)` works in tests. UI still reads only `files[0]`, has no `multiple` attribute or drop zone, and calls `previewImport` without existing hospitals. No per-file preview or held-row persistence/retry path is exposed. |

## Other machines

**Machine 1:** B1-B8 engine work is present on `sprint/demo`: sponsor-oriented wording, actions, value lexicon, schedule parsing, source comparisons, ranking/auto-expand, completion rules and unbound fields. Fresh tests cover these. This does not establish universal policy interpretation or production integration.

**Machine 2:** tasks 1-5 are shipped: storyboard import and both file orders, atomic multi-file bundle API, alien shapes/aliases, contacts import/directory and seeds generated through the importer. `pnpm seeds` now rebuilds seven hospitals with 162 guide fields, two storyboard rows and three contacts per hospital. Tasks 6-9 remain: the full SYN-108 fixture, chat, contacts sheet and storyboard card. The directory includes SYN-108 contacts but the full `data/fixtures/syn-108/` guide/storyboard fixture is absent. Runtime loads the generated `src/data/seeds.json`. `ChatPanel`, `ContactsSheet` and `StoryboardCard` currently return `null`.

**Optional:** live status is an empty stub; server/SSO/production Synapse integration remain outside this sprint. Do not spend the remaining demo window implementing those before the required paths work.

## Findings that affect the demo

| Priority | Location | Impact and next action |
|---|---|---|
| P0 | `src/main.tsx`, `src/guidance/` | The dock cannot be demonstrated. Mount it, style desktop/mobile states, pass previous results, dispatch focus for every field, preserve collapse and keyboard focus, and connect marker/open callbacks. Add browser coverage for these exact behaviours. |
| P0 | `src/main.tsx` importer | The judges' two-file gesture is unavailable even though its API passes. Use `previewImportBundle` with existing data and per-file diagnostics; retain held rows, and activate atomically. Exercise a fresh hospital's guide/storyboard files together in the browser. |
| P0 | Complete handler, `GateBanner.tsx` | Sprint gate release is disconnected. Put the banner at Complete, wire field repair and reason-based release/audit, and retain charge `fix_only`. Test both release policies in the browser. |
| P0 | Machine 2 stubs and Machine 3 mounts | The promised ask/escalate/storyboard sequence cannot run. Machine 2 finishes these components; Machine 3 mounts them with current hospital/context/version props. Validate that hospital changes clear answers and never leak contacts. |
| P1 | Local `Card`, `NudgeCard.tsx` | Four-part sponsor output is incomplete on the visible screen. Render action, hospital/field/version, dates, status and conflict sources without requiring evidence expansion; expose trigger explanation. |
| P1 | Root `ErrorBoundary`, guidance evaluation | An unexpected guidance exception currently replaces the whole application. Isolate evaluation/render failures and keep editable caselog fields available. The simulated outage test covers a separate explicit path, not an actual engine exception. |
| P1 | Header, CSS, dock events | Restore visible side-by-side clocks, Escape collapse, delayed blur and 44 px targets. Existing buttons measure 25-40 px in height on mobile. |
| P1 | README, public deck/workflow/review, status docs | They still describe removed speech/transcript features and old counts. Update the demo narrative and generated/public artifacts after integration; a passing build does not validate their claims. |
| P2 | `.github/workflows/verify.yml` | Push verification watches only `main`; `sprint/demo` has no automatic push gate. Extend branch coverage when coordinating CI ownership. Local ship checks are presently the sprint gate. |
| P2 | `scripts/ship.mjs` | Commit message construction uses shell interpolation via `JSON.stringify`. Prefer structured arguments to avoid shell interpretation in future ship messages. Current review uses a plain commit message. |
| P3 | CSS detector | Four coloured left-border findings were reported. Some are deliberate status cues; they do not establish a functional or accessibility defect and are lower priority than missing integration. |

## UI audit health

Implementation integrity fails the new sprint contract because its central components are disconnected. The incumbent form remains usable; the following scores describe that form, not a validated new dock.

| Dimension | Score | Verified evidence |
|---|---|---|
| Accessibility | 2/4 | Labelled inputs, visible focus and keyboard evidence work; small targets and missing gate alert remain. Contrast was not measured, so AA compliance is not claimed. |
| Performance | 3/4 | Fresh measured field-change p95 31.4 ms; new dock performance is unverified. |
| Responsive design | 3/4 | Desktop/mobile screenshots and 390 px overflow check pass; touch gestures/physical devices were not tested. |
| Theming | 2/4 | CSS variables exist alongside repeated literal colours; no validated dark theme. A dark theme is not a demo requirement. |
| Implementation integrity | 1/4 | Dock/gate/markers/stubs disconnected, monolithic state, contradictory voice copy. |
| Total | 11/20 | Significant integration work remains. |

Maintain the working source isolation, deterministic time handling, immutable import versions, synthetic labelling, honest absence/conflict handling, offline loaded core and independent oracle assertions.

## Shortest path to the demo

1. Machine 3 completes tasks 3, 5 and 7: dock, completion banner and two-file import. Preserve the current working tests and 500 ms gate.
2. Machine 2 finishes contacts, storyboard and seeded typed chat. Machine 3 wires those mount points and both clocks.
3. Complete required card evidence, guidance failure isolation and keyboard/mobile checks. Move state/admin components in small changes without altering engine ownership.
4. Run all sponsor and browser tests on the combined branch. Rehearse the sprint script twice with a fresh unseen hospital, including an intentional conflict, missing field and charge block.
5. Refresh presentation/docs, build and deploy the tested `sprint/demo` revision, then verify the hosted paths and record a fallback demo.

This is several focused integration tasks plus testing/rehearsal, not a deployment-only gap. A calendar estimate would depend on how quickly Machine 2's remaining components arrive; the evidence does not justify a precise completion percentage or promised demo time. The existing prototype is available as a fallback today. This review pushes repository work only; it does not update the hosted Netlify deployment.
