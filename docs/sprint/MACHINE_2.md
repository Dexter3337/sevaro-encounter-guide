# Machine 2 — data in, then chat and contacts

> In Claude Code, opened at the repository root, send:
> **"Read `docs/sprint/MACHINE_2.md` and follow it. Start with task 1."**

## Who you are

You own **whether we pass judging**, and then the doctor's escalation path.

Tomorrow the judges hand us two files for a hospital we have never seen —
`hospital_guides.json` and `storyboard_notes.json` — and we drop them in live. Right now the
storyboard file is **rejected** by the importer (`src/imports.ts:111`), and importing the guide
file attaches **zero** storyboard sources. A new hospital's conflicts would be invisible. Nothing
else in this sprint matters as much as fixing that.

Once data is coming in cleanly you build the second and third rungs of the doctor's ladder: ask
the guide, then call a person.

**You own:** `src/imports.ts`, `data/**`, `src/chat/**`, `src/contacts/**`,
`src/encounter/StoryboardCard.tsx`, and your own tests.

**You must not touch:** `src/engine.ts`, `src/time.ts`, `src/knowledge.ts`, `src/domain.ts`
(Machine 1); `src/main.tsx`, `src/guidance/**`, `src/encounter/**` other than StoryboardCard, any
CSS (Machine 3).

**Branch:** `sprint/m2-data`

```bash
pnpm sync
git checkout -b sprint/m2-data
```

## Read first

1. `docs/sprint/THREE_MACHINES.md` — ownership and the ship rhythm
2. `docs/sources/Challenge_1_Handbook.pdf` — chapter 4 (the test), issues 1, 6, 8, 12
3. `data/official/hospital_guides.json` and `storyboard_notes.json` — the exact formats
4. `src/imports.ts` in full

## How you work

Before each task: `pnpm sync`. When a task works: `pnpm ship "what you did"`, then one line in the
group chat. Ship after every task, not at the end.

---

## Task 1 — Storyboard import (do this first, before anything else)

Full detail in **`MACHINE_A_INGESTION.md` section A1**. In short:

`fromRecords` expects `hospitalId` / `field` / `raw`. The sponsor storyboard uses `hospital_id`,
`field`, `storyboard_value`, `storyboard_updated`, and carries no hospital name or time zone, so
it fails twice over. It also has to **merge into an existing hospital** rather than create a new
one.

Three cases, all of which must work:

- guide and storyboard in the same drop → attach before activation, one hospital with both kinds
- storyboard alone for a hospital already loaded → clone it, append, new immutable version
- storyboard for a hospital we do not have → hold it with a clear diagnostic, do not drop it

Either file order must end in the same state.

Match the record shape already used in `src/data/seeds.json` (search `"sourceKind":"storyboard"`)
so Machine 1's engine reads your records with no change. Storyboard rows carry `updatedAt`, never
`lastVerified`.

**Never read the `note` column.** It is sponsor commentary about the row — "Disagrees with the
on-call guide for stroke alerts" — and letting it influence anything is letting the test data mark
its own homework. The judges' file may word it differently, omit it, or contradict it. Keep it in
`extra` so it round-trips.

**Done when:** `previewImport(storyboard_notes.json)` returns no errors, and after importing both
official files into an empty workspace, SYN-002's Video Eval Location comes back as a conflict.

---

## Task 2 — Multi-file drop

`MACHINE_A_INGESTION.md` section A2. One gesture, several files: classify each by shape, one
combined preview with per-file diagnostics, activate atomically so a failure leaves the current
data untouched.

Expose `previewImportBundle(files: {name, text, format}[]): Preview` and **tell Machine 3 the
signature as soon as it exists** — they wire the drop zone.

---

## Task 3 — Alien-data tolerance

`MACHINE_A_INGESTION.md` section A3. Their file will not look exactly like ours.

Tolerate: key aliases, `fields` as an array or an object map, a bare array or a single hospital
object at the top level, field-name variants (case, spacing, `&`↔`and`), unknown extra keys, CSV
with unfamiliar headers.

Never: invent a time zone, default a missing verification date to today, silently drop a row you
cannot read, or force a field-name match you are not sure of. A name that matches nothing is kept
verbatim and reported — it stays answerable.

Field-name aliases go in `data/field-aliases.json`, as data.

Every rejection names the file, the row and the reason, in words a presenter can read aloud.

---

## Task 4 — Contacts data

`MACHINE_A_INGESTION.md` section A4. Three roles per hospital: `technical_lead`,
`nursing_in_charge`, `administrator`. Import path plus `data/seeds/contacts.json` covering all
seven kit hospitals.

Vary it on purpose: one `24/7`, one `Mon-Fri 0700-1900`, and one with a `last_verified` older than
180 days so staleness shows on screen. Phone numbers in the 555-01xx range, names obviously
synthetic.

Tell Machine 3 when `hospital.contacts` is populated.

---

## Task 5 — Rebuild the seeds through your own importer

`MACHINE_A_INGESTION.md` section A5. `src/data/seeds.json` hard-codes the two storyboard rows.
Generate it instead, from `data/official/` through your importer, so the thing we demo is the
thing we import — which is also the strongest proof task 1 works.

All 29 sponsor cases must stay green. If one breaks, the importer is wrong; fix the importer.

---

## Task 6 — The unseen-hospital fixture

`MACHINE_A_INGESTION.md` section A6. `data/fixtures/syn-108/`, Riverbend Community Hospital,
`America/Phoenix` (no daylight saving, which catches bugs that hide elsewhere). Roughly 24 fields
exercising every handbook issue: an alias field name, a brand-new field, a stale field, a missing
field, undefined hours, a negative written in words, a charge requirement written as an
instruction, and a storyboard with one row that disagrees and one that agrees.

---

## Task 7 — Chat panel *(needs Machine 3's skeleton)*

Full detail in **`MACHINE_D_CHAT.md` section D1**. Prop signature is frozen in
`SPRINT_PLAN.md` §6 — build to it exactly; Machine 3 is already mounting a placeholder.

Answers come from `ask()` in the engine. You never write an answer, never summarise across
hospitals, never guess. Missing → `"Not available in this hospital's guide."` first.

Two things that matter more than they look:

- **Clear the thread when the hospital or guide version changes.** A stale answer from the
  previous hospital left on screen is the worst thing that can happen in this product. Test it.
- **The clarification path.** When `ask()` cannot resolve a question it returns candidate fields —
  render them as clickable chips that re-ask with the exact name. That turns a miss into two
  clicks, which demos far better than an apology.

---

## Task 8 — Contacts sheet

`MACHINE_D_CHAT.md` section D2. Availability evaluated in **hospital** time using the engine's
`windows` / `matchWindow` — import them, do not re-implement. "Available now", "Opens in 15
minutes", or "Hours not listed — call to check" when the text is undefined. Never guess.

Missing role → "No `<role>` on file for this hospital." Never another hospital's contact; test
that.

---

## Task 9 — Storyboard card

`MACHINE_D_CHAT.md` section D3. The hospital's storyboard values at the top of the caselog, each
with its date and staleness.

**Ask the engine for the verdict — do not compute agreement yourself.** Machine 1's `compare()`
handles it, including scope: Bluewater's Video Eval Location conflicts for a stroke alert and
agrees for a general consult, same field, same two sources. Read `r.flags` for
`second_source_agrees`, `possible_conflict` and `storyboard_only`.

A row that agrees gets a quiet tick. The handbook warns specifically against raising a false alarm
when the sources agree.

Never render the `note` column.

---

## Tests you own

`tests/imports.test.ts`, `tests/alien.test.ts`, and component tests for chat, contacts and the
storyboard card. The full list is in `MACHINE_A_INGESTION.md` section A7 and
`MACHINE_D_CHAT.md`. The ones that matter most:

- the official storyboard file imports with no errors
- both file orders end in identical state
- mutating or deleting the `note` column changes nothing
- a missing `last_verified` stays missing, never defaulted
- a failed bundle leaves the previously active data byte-identical
- after importing SYN-108, a question about a field only SYN-001 has returns the sponsor sentence
- changing hospital clears the chat thread
- contacts never cross hospitals

## Report after each ship

What landed, the `previewImportBundle` signature once it exists, whether `hospital.contacts` is
populated, and anything you need from Machine 1 (record shapes) or Machine 3 (mounting).
