# Encounter Guide

A working local Sevaro Challenge 1 prototype: interactive caselog, proactive hospital guidance, grounded free-text questions, explicit hospital/provider time zones, source-quality flags, completion gates, dynamic JSON/CSV imports, and an evaluation workbench. **Illustrative Synapse workflow companion · Synthetic demo.** All hospitals, rules, destinations and encounter information are fictional.

## Run

From `C:\Users\rohit\Sevaro\encounter-guide`, on this machine:

```powershell
.\start-demo.ps1
```

Open [the local demo](http://127.0.0.1:5173). The application starts at Highland Valley, Tuesday March 17, 2026, 19:30 Central. Select **Imaging**, then **Large vessel occlusion present → Yes**. Guidance should identify the ED transfer branch and its source. No account, `.env`, API key, hospital access or paid service is required.

For a fresh checkout on another computer, install Node 22.12+ (tested with 24.19.0) and pnpm 11.25.0, then:

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Dependencies are downloaded during setup. Runtime uses bundled data and local computation. The loaded application works with the network disabled. Offline reload is not promised: there is no service worker. Guides/drafts are stored only under `encounter-guide:v1` in this browser's localStorage. Use synthetic data only; Reset demo clears this prototype key, imported versions, drafts and session reports. Storage is tied to the origin (5173 and 4173 have separate state).

```sh
pnpm typecheck
pnpm test                  # sponsor, unfamiliar-hospital and edge tests
pnpm test:acceptance       # N1–N9 and V01–V20 only
pnpm evaluate             # reports/acceptance.json
pnpm build                # typecheck + production assets in dist/
pnpm preview              # http://127.0.0.1:4173
pnpm test:e2e             # real browser workflows and latency
```

Browser tests use installed Google Chrome by default and a fresh isolated browser context; they do not use your personal profile. Set `PW_CHANNEL=msedge` for installed Edge. Alternatively install Playwright Chromium and change the channel in `playwright.config.ts`. The tests automatically start the dev server if needed. To test production:

```powershell
$env:DEMO_URL = 'http://127.0.0.1:4173'
pnpm test:e2e
```

In this Codex environment `npm` is absent and Node's process/user APIs are restricted in the sandbox. The bundled pnpm works; tests/build/server were run with sandbox escalation. The equivalent direct pnpm command on this host is:

```powershell
& "$env:USERPROFILE/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback/pnpm.cmd" test
```

## Demonstrate

Follow [docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md) for a rehearsable five-minute walkthrough. All 29 source scenarios are launchable from Demo controls and from evaluation results. A launch is visibly a fixture, not a fake precomputed answer; form edits, clock changes and completion clicks run the same engine.

Import [data/holdout/unfamiliar-hospitals.json](data/holdout/unfamiliar-hospitals.json) in **Guide library**, preview, then activate. Four new hospitals appear immediately. `ORBIT-91` has different hours/actors, a new searchable **Interpreter connection procedure**, a new declarative form field, and a deliberately unsupported conditional field. [data/holdout/mapped-import.csv](data/holdout/mapped-import.csv) exercises the column mapper.

**Evaluation** runs a separate sponsor oracle against the actual engine and exports actual responses, status/flag/source assertions, failures, engine timings, browser measurements and encounter audit JSON/CSV. Its pass counts start empty and are calculated on demand. Browser measurements come from actual interactions, not fixture constants.

## Source and architecture

The original plan, research package and ZIP remain untouched in the parent folder. Both archive PDF checksums match the existing source folder. All **169 guide fields** match every extracted Challenge 1 PDF table row: site counts 25, 22, 26, 25, 23, 24, 24. Two storyboard records are preserved separately. Default/overridden verification dates and deliberate missing fields are retained. See [data/raw/seed_provenance.json](data/raw/seed_provenance.json).

- `src/domain.ts`: runtime schemas, tri-state values, revision-checked reducer and field registry.
- `src/time.ts`: IANA zones, DST rejection, schedules, weekdays, overnight windows and calendar-day freshness.
- `src/knowledge.ts`: label/alias index, scoped meanings and interpretation diagnostics.
- `src/engine.ts`: hospital-bound guidance, shared question/source evaluation and explicit gates. No known-hospital ID branches.
- `src/imports.ts`: bounded JSON/CSV adapters, column mapping, runtime validation, preserved originals and atomic immutable activation.
- `src/adapter.ts`: illustrative external-context boundary with offset/local-zone consistency checks; no production SDK integration.
- `src/main.tsx`: interactive workflow, library/importer, workbench, source drawers, local persistence and browser latency instrumentation.
- `src/fixtures.ts` and `tests/`: independent sponsor assertions and unfamiliar configurations. Product evaluation code never reads expected answers.

The core uses React/TypeScript/Vite, Zod, Temporal polyfill and Papa Parse. Versions are pinned by `pnpm-lock.yaml`. Runtime requirements were checked against [Vite's official guide](https://vite.dev/guide/); time handling follows the [Temporal model](https://tc39.es/proposal-temporal/docs/).

Read [docs/DATA_CONTRACT.md](docs/DATA_CONTRACT.md) for accepted shapes and grammar, [docs/DECISIONS.md](docs/DECISIONS.md) for assumptions and source boundaries, [reports/TEST_RESULTS.md](reports/TEST_RESULTS.md) for measured results, and [docs/IMPLEMENTATION_STATUS.md](docs/IMPLEMENTATION_STATUS.md) for milestone completion.

## Remaining limitations

- This is a synthetic workflow prototype, without clinical validation or a real Synapse connection. Recording completion posts no hospital charge and signs no clinical note.
- Supported concept aliases/schedule grammar are finite. Arbitrary clinical policies, holiday exceptions, complex temporal phrases, DST-disambiguated wall-time questions and every possible judging schema are not automatically understood. Unknown conditional text is quoted with review flags; no branch or executable policy is invented.
- No LLM/provider, live speech, live transcript connector, PDF-upload interpreter or production access is implemented. A scripted synthetic transcript-candidate popup demonstrates clinician review and safe field application. These optional features were deferred in favor of working deterministic behavior.
- Source conflict equivalence is conservative (known context qualifiers, normalized wording); sophisticated semantic reconciliation still needs review. Missing verification is shown explicitly; storyboard update dates are not treated as verification dates.
- Stale/conflicting/unsupported mandatory facts are shown as uncertain without introducing a new gate; unavailable guides allow mock completion labeled unverified. These are documented prototype policies, not production safety rules.
- Browser latency is handler-to-commit plus two animation frames, a paint-readiness approximation. Tests measure this computer and browser; they establish no universal hardware/network performance guarantee.
- Storage/audit are browser-local and bounded, without encryption, authentication, collaboration or tamper resistance. No real patient information belongs here.
- Keyboard, evidence and narrow-screen paths were inspected, but no formal accessibility or clinician usability certification was performed.

## Team review and mentor presentation

Open `/presentation.html` for the animated 12-slide mentor presentation, `/workflow.html` for the detailed visual workflow, and [docs/APP_WORKFLOW.md](docs/APP_WORKFLOW.md) for the written specification. [docs/MENTOR_PRESENTATION.md](docs/MENTOR_PRESENTATION.md) gives the talk track and rehearsal sequence. The deck has speaker notes, keyboard navigation, a real embedded demo, reduced-motion support and print/PDF export.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the feature-branch / pull-request workflow. Vercel configuration (`vercel.json`) uses Vite, `pnpm build` and `dist`; Netlify configuration remains available as an alternative. The GitHub workflow checks typecheck, unit tests and production build. Visual workflow HTML and public evidence are checked in; after changing their source docs run `python scripts/build_workflow.py` to regenerate them. Ordinary application builds do not require Python.

## Sevaro integration and transcript review

See [docs/SEVARO_ALIGNMENT_REVIEW.md](docs/SEVARO_ALIGNMENT_REVIEW.md) or `/integration-review.html` for the sponsor alignment audit, missing integration contracts, privacy research and complete popup specification. In Encounter, choose **Simulate transcript drafts**, approve individual facts, then **Apply approved drafts**. No meeting or patient data is accessed. Existing values are shown; stale or wrong-encounter batches are rejected. Gate fields cannot be filled from transcripts. The ordinary hospital guidance runs after approved values are applied.

Order guidance now remains present while the order field is displayed, including after unrelated edits. Manual EEG plan relevance uses conservative finite grammar, with explicit limits in the review. The source/oracle inventory is in `reports/research-review-inventory.json`; all 131 research scenario expectations are exported in `reports/research-scenario-review.csv`, without claiming those exact scenarios were run. To regenerate this review from its source and the original adjacent research package, run `node scripts/build_alignment_review.mjs`. The checked-in review and normal app build do not require the research package.

## Complete team handoff

Start with [TEAM_HANDOFF.md](TEAM_HANDOFF.md). This repository now includes the original build plan, challenge ZIP/PDFs, all research scripts, the foundation workbook/CSV/JSON exports and previews, development/held-out inputs, and independent expected outputs. `research/` and `outputs/` are copied from the original Sevaro workspace; the application remains at the repository root. Ordinary setup needs Node/pnpm only. Research-rebuild dependencies and limitations are documented in the handoff. Dependencies, caches, Git internals, browser trace archives and generated `dist/` are excluded; rebuild them locally.
