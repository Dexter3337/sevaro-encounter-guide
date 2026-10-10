# Sevaro team handoff

This repository is the complete working prototype and supplied research handoff for Challenge 1: hospital-specific workflow guidance as an addition to Sevaro Synapse. All encounters and hospital policies are fictional. It is not connected to Sevaro, hospital EHRs or real consultation transcripts.

## Links to share

- Source and team contributions: https://github.com/Dexter3337/sevaro-encounter-guide
- Live synthetic demo: https://dynamic-cat-513c19.netlify.app/
- Animated mentor presentation with embedded demo: https://dynamic-cat-513c19.netlify.app/presentation.html
- Detailed app workflow: https://dynamic-cat-513c19.netlify.app/workflow.html
- Sevaro integration/privacy/gap review: https://dynamic-cat-513c19.netlify.app/integration-review.html
- Printable mentor deck: https://dynamic-cat-513c19.netlify.app/mentor-presentation.pdf

## Start locally

Install Node.js 24 and pnpm 11.25.0 first. The application is at the repository root, not inside another encounter-guide subfolder.

```sh
git clone https://github.com/Dexter3337/sevaro-encounter-guide.git
cd sevaro-encounter-guide
pnpm install --frozen-lockfile
pnpm dev
```

Open the localhost URL printed by Vite. No paid service, account, API key or `.env` is required. For a production preview, run `pnpm build` then `pnpm preview`.

## What is included

| Location | Contents |
|---|---|
| `src/`, `data/`, `tests/` | Working React/TypeScript app, original-source reconstruction, sponsor fixtures and additional synthetic tests |
| `public/` | Animated presentation, workflow, integration review, printable PDF and synthetic demo downloads |
| `docs/`, `reports/` | Decisions, data contract, mentor/demo scripts, setup/deployment notes, actual verification and latency evidence |
| `Sevaro_Challenge_1_Standalone_Build_Plan.md` | Complete original build plan and sponsor brief appendix |
| `Sevaro Track.zip` | Original user-supplied challenge archive containing the two sponsor PDFs |
| `research/` | Original extraction, research scripts, raw tables, batch log and source PDFs |
| `outputs/01a124a6/` | Foundation workbook, research package ZIP, 23 table collections, JSON/CSV exports, previews, frozen input/oracle files and validation records |
| `reports/team-source-manifest.json` | SHA-256 hashes proving the copied research/source files match the original workspace |
| `.github/workflows/verify.yml` | Typecheck, unit tests and build on pushes to main and pull requests |

Source files were preserved. `node_modules`, package caches, local Git internals, temporary browser traces and regenerated application `dist/` are excluded from Git. The ZIP under outputs is an original research deliverable, not a dependency cache.

## Reproducible demo

1. Use Reset demo in Demo controls if you want a clean synthetic encounter.
2. Open Imaging at Highland Valley / SYN-006, Tuesday 19:30 Central. Set LVO to Yes. Guidance cites that hospital's outside-coverage transfer pathway.
3. Open Recommendation. Order permission guidance appears before focus and remains after unrelated edits.
4. Choose Simulate transcript drafts. Approve individual synthetic facts; unapproved fields stay unchanged. No live meeting is accessed, and completion prerequisites cannot be filled from speech.
5. Launch N5 or N7 and show the incomplete charge or provider-confirmation gate, then record the required synthetic fact and retry.
6. Import an unfamiliar hospital JSON/CSV, preview and activate it, then select it. Source-backed answers remain hospital-scoped.
7. Open Evaluation, run the 29 sponsor cases and inspect/export evidence.

See `docs/DEMO_SCRIPT.md` and `docs/MENTOR_PRESENTATION.md` for the longer mentor walkthrough. The embedded presentation demo uses the same live app and its browser-local state.

## Verification and limits

```sh
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
pnpm evaluate
pnpm verify:presentation
```

Browser tests use installed Chrome by default. `PW_CHANNEL` can select another installed Playwright channel; see playwright.config.ts. Current evidence: 79 unit checks and all 29 sponsor examples pass. The alignment browser run passed 10/12 initially; the two failed paths were addressed/retried, and the focused run passed 3/3. Twelve unique browser paths were verified across those runs. Completed local latency run: 120 field edits, p95 30.7 ms, maximum 35 ms, using a documented paint-readiness approximation.

The research's 101 development + 30 held-out scenarios are specifications with independently authored expected outputs, not a claim that the app executed all 131 cases. See `reports/research-scenario-review.csv`. No independent clinician adjudication, production interface, real transcript connector, PHI hosting assessment or clinical outcome study has occurred. Follow the limitations in `docs/SEVARO_ALIGNMENT_REVIEW.md` when presenting this work.

## Rebuild source and written artifacts

The app's normalized data is already checked in. Optional provenance verification now uses the included research/source files:

```sh
python -m pip install pdfplumber
python scripts/prepare_sources.py
node scripts/build_alignment_review.mjs
python scripts/build_workflow.py
```

The original research scripts are retained unchanged. Most use relative paths; `research/build_workbook.mjs` originally used an absolute author-machine output path and the bundled `@oai/artifact-tool` library. The generated workbook, previews and all exported data are included; regenerating that original workbook requires adapting its path and obtaining the appropriate artifact runtime. Ordinary app builds and contribution checks do not require that tool.

## Contribute with the team

Fork the repository and open a pull request, or create a feature branch if the owner has granted write access. Suggested work areas: native Synapse adapter, transcript provenance/extraction, exact research-suite runner, guide-owner review and clinician usability evaluation. `CONTRIBUTING.md` maps features to code files and explains checks. Do not commit real patient information, API keys, recordings or production credentials.

The repository owner can invite named GitHub accounts under Settings → Collaborators for direct write access. Fork pull requests do not require invitations. Live cases/imports are local to each visitor's browser; the shared site does not synchronize clinical state.

## Deployment

Netlify currently uses a manual upload to the existing project; GitHub continuous deployment is not connected. Merging a pull request does not automatically change the live site in this configuration. Build with `pnpm build`, ZIP the contents of `dist/` with index.html at ZIP root, then upload to the existing Netlify project. `netlify.toml` supplies build/publish settings for a future authorized Git connection.

