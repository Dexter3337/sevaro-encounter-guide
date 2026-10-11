# Start here — one-day sprint to the demo

Five developers, five machines, demo tomorrow.

> **New to this? Read [`HOW_TO_START.md`](HOW_TO_START.md) instead.** It walks through every step
> in plain language: getting access, cloning, which file to point Claude at, and the order to do
> things in. The rest of this page is the short version for people who already know the setup.

## 1. Set up (10 minutes)

```bash
git clone https://github.com/hsa70-ui/sevaro-encounter-guide.git
cd sevaro-encounter-guide
corepack enable           # if `pnpm` is not found; otherwise: npm i -g pnpm@11
git checkout sprint/demo
pnpm install --frozen-lockfile
pnpm test                 # must show 110 passing before you change anything
pnpm dev                  # http://127.0.0.1:5173
```

If `pnpm test` does not pass, stop and fix your environment first. Node 24, pnpm 11.
Playwright browsers for e2e: `pnpm exec playwright install chromium` (Machine E needs this).

## 2. Read the plan

[`SPRINT_PLAN.md`](SPRINT_PLAN.md) — everyone reads this. It has the timetable, the file-ownership
table, the frozen integration contracts, the 13 guardrails and the demo script.

## 3. Point Claude Code at your prompt

Open Claude Code inside the `sevaro-encounter-guide` folder and send it one line, using your own
machine's filename:

> Read `docs/sprint/MACHINE_A_INGESTION.md` and follow it. Start with the first task.

You do not need to copy the file's contents — it is already in the repo.

| Machine | Prompt | You own |
|---|---|---|
| **A** | [`MACHINE_A_INGESTION.md`](MACHINE_A_INGESTION.md) | Storyboard import, multi-file drop, alien-data tolerance, contacts data, test fixtures |
| **B** | [`MACHINE_B_ENGINE.md`](MACHINE_B_ENGINE.md) | Sponsor wording, "what to do", value lexicon, schedules, conflict matrix, gates |
| **C** | [`MACHINE_C_DOCK.md`](MACHINE_C_DOCK.md) | Floating field-aware nudge dock, field markers, hard stop at Complete, layout |
| **D** | [`MACHINE_D_CHAT.md`](MACHINE_D_CHAT.md) | Chat opened from a nudge, hospital contacts, storyboard card |
| **E** | [`MACHINE_E_GUARDRAILS.md`](MACHINE_E_GUARDRAILS.md) | Guardrail tests, alien-data dry run, live status, admin, integration, deploy |

## 4. Order of operations — do not skip this

Two commits go to `sprint/demo` **before anyone branches**:

1. **Machine B** lands the shared types (`SPRINT_PLAN.md` §5, Kickoff 1) — 15 minutes.
2. **Machine C** lands the UI skeleton with frozen prop signatures (Kickoff 2) — 20 minutes.

Then everyone pulls `sprint/demo` and creates their own branch. Machine D is blocked until C's
skeleton exists.

## 5. The one thing that decides whether we pass

The judges hand us two files for a hospital we have never seen and we drop them in live. **Right
now the storyboard file is rejected** (`src/imports.ts:111`) and guide imports attach zero
storyboard sources, so a new hospital's conflicts would be invisible.

That is Machine A's first task, due merged by 13:00. If the day goes badly and only one thing
ships, it is that one.

## Sources in this repo

| File | What it is |
|---|---|
| [`../sources/Challenge_1_Handbook.pdf`](../sources/Challenge_1_Handbook.pdf) | The sponsor's newest brief. **Highest authority — it wins any conflict with these prompts.** |
| [`../sources/Sevaro_research_conversation_Gemini.pdf`](../sources/Sevaro_research_conversation_Gemini.pdf) | Background research. Context only, not a spec; it proposes things outside the brief. |
| `../../data/official/` | The six kit data files: guides, storyboard, field map, encounter example, V01–V20, N1–N9 |
| [`../PRODUCTION_PLAN.md`](../PRODUCTION_PLAN.md) | The full production plan these prompts are the first day of |

All data is synthetic. Nothing here is clinical guidance.
