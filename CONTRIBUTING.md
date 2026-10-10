# Contributing

All encounters and hospital examples must be synthetic. Please keep sources and independent expected results distinct. Do not add patient information, API keys or production credentials.

## Start

Install Node 24 and pnpm 11.25.0. Clone this repository, run `pnpm install --frozen-lockfile`, then `pnpm dev`. See [README](README.md) for setup and [workflow](docs/APP_WORKFLOW.md) for the behavior specification. The visual workflow is served at `/workflow.html`.

## Make a change

1. Fork the repository, or use a feature branch if the owner has granted you repository access.
2. Create a branch such as `feature/guide-import-feedback`.
3. Implement a focused change; preserve unrelated work and immutable source versions.
4. Run `pnpm typecheck`, `pnpm test` and `pnpm build`. For workflow changes also run `pnpm test:e2e` (installed Chrome by default).
5. Open a pull request describing the changed behavior, validation and limitations. Include before/after screenshots for interface changes and unfamiliar synthetic cases for new interpretation rules.

Merging to `main` publishes through Netlify when continuous deployment is connected. Each visitor's encounter and imports are stored only in their own browser; sharing the demo URL does not share case state. Contributors can submit fork pull requests without receiving write access. The owner must invite named GitHub accounts separately for direct branch access.

## Where to work

| Area                        | Files                                               |
| --------------------------- | --------------------------------------------------- |
| Interface                   | `src/main.tsx`, `src/style.css`                     |
| Context / events / fields   | `src/domain.ts`, `src/adapter.ts`                   |
| Guidance / grounded answers | `src/engine.ts`, `src/knowledge.ts`                 |
| Time grammar and quality    | `src/time.ts`                                       |
| Data import                 | `src/imports.ts`, `data/holdout/`                   |
| Evaluation                  | `src/evaluation.ts`, `src/fixtures.ts`, `tests/`    |
| Visual workflow generation  | `scripts/build_workflow.py`, `docs/APP_WORKFLOW.md` |

The repository includes normalized source data and provenance. `scripts/prepare_sources.py` is the original local archive verification utility and requires the original sibling research/ZIP files; ordinary setup, build, evaluation and tests use checked-in data and do not require those files.
