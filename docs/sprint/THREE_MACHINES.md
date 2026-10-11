# Three machines — who does what, and how we stay in step

> Historical checkpoint: current delivery status and verification counts are in the
> [combined review](../../reports/SPRINT_COMPLETION_REVIEW.md) (10 October 2026, product commit `c778f26`).


This replaces the five-machine split in `SPRINT_PLAN.md`. The detailed task lists in the
`MACHINE_*.md` files still apply; this says who owns which of them now.

---

## Already done — do not redo it

Machine 1 has landed and shipped to `sprint/demo`:

- **Kickoff 1** — the shared types every machine builds against (`action`, `triggerId`,
  `autoExpand`, `release`, `liveStatus` on `Result`; storyboard, contact and live-status schemas;
  `contacts` on `Hospital`).
- **B1** sponsor wording · **B2** "what to do" on every result · **B3** value lexicon ·
  **B5** conflict matrix · **B6** ranking and auto-expand.

**203 tests pass.** `sprint/demo` is the team branch and is current.

**Kickoff 2 has not been done.** It is Machine 3's first task and Machine 2 does not depend on it.

---

## Who owns what

| | Machine 1 | Machine 2 | Machine 3 |
|---|---|---|---|
| **Role** | Engine and guardrails | Data in, then chat and contacts | The screen |
| **Prompt** | `MACHINE_B_ENGINE.md` (B4, B7, B8) | `MACHINE_2.md` | `MACHINE_3.md` |
| **Branch** | `sprint/b-engine` | `sprint/m2-data` | `sprint/m3-ui` |
| **Owns** | `src/engine.ts`, `time.ts`, `knowledge.ts`, `domain.ts`, `fixtures.ts`, `evaluation.ts`, `src/data/*.json`, `tests/*.test.ts` | `src/imports.ts`, `data/**`, `src/chat/**`, `src/contacts/**`, `src/encounter/StoryboardCard.tsx` | `src/main.tsx`, `src/encounter/**` *(except StoryboardCard)*, `src/guidance/**`, `src/admin/**`, `src/status/**`, all CSS, `tests/e2e/**` |

Nobody edits a file another machine owns. If you need a change in one, ask in the group chat.

`src/encounter/StoryboardCard.tsx` is the one carve-out: Machine 3 creates it as an empty
placeholder in Kickoff 2 and never touches it again; Machine 2 fills it in.

---

## Order of play

```
now        M3: Kickoff 2 (skeleton + prop signatures)  ── 20 min, ship immediately
           M2: storyboard import                       ── start now, no dependency
           M1: B4 schedules

after      M3: dock, field markers, hard stop at Complete
Kickoff 2  M2: multi-file drop, alien tolerance, contacts data
           M1: B7 gates, B8 unbound fields

then       M2: chat panel, contacts sheet, storyboard card   (needs M3's skeleton)
           M3: layout, accessibility, admin import screen
           M1: guardrail tests, alien-data dry run
```

**Machine 3's Kickoff 2 blocks Machine 2's second half.** Ship it first, before anything else.

---

## Staying in step

Two commands. Both are safe — neither can publish broken work.

### Before you start a task

```bash
pnpm sync
```

Pulls in what the others have shipped and re-runs the tests. Starting on top of work that is an
hour old is how two people solve the same problem twice.

### When a task works

```bash
pnpm ship "short description of what you did"
```

It typechecks and tests your work, commits it, pulls in the other machines' work, **tests it again
alongside theirs**, pushes your branch, and puts it on `sprint/demo`.

That second test run is the one that matters. Your change passing on its own says nothing about
whether it still passes next to the other two machines' changes.

If anything fails, **nothing is pushed** and it tells you what to do. If another machine ships
while yours is running, it says so — run it again.

### Then say so in the group chat

> **M2 shipped:** storyboard import accepts the sponsor format, both file orders.

One line. It is how the other two know to run `pnpm sync`.

### Rhythm

Ship after **each task**, not at the end of the day. Three or four times an hour is right. Small
and often means a bad merge costs twenty minutes, not the evening.

---

## If a rebase conflicts

Tell Claude Code:

> I have a rebase conflict. Show me both sides and help me resolve it.

To back out and think: `git rebase --abort`. Nothing is lost either way.

Conflicts should be rare, because file ownership barely overlaps. If you hit one in a file you do
not own, you are editing someone else's file — stop and ask them.

---

## Non-negotiables, for all three machines

1. Never answer from another hospital's guide.
2. A field the guide lacks → exactly **"Not available in this hospital's guide."** first. Never
   guess, never borrow.
3. Every nudge and answer shows hospital, guide field, date, status, and what to do.
4. Guide and storyboard disagree → show both with sources, pick neither. Never read the
   storyboard `note` column.
5. All schedule logic in the hospital's own time zone; the doctor's zone is display only.
6. Hours the guide does not define → say so, give both branches, invent nothing.
7. Stale = more than 180 days before 2026-03-17, recomputed every time.
8. Silence when nothing applies. Info never opens the panel by itself.
9. Block only where the guide truly requires it, and say why.
10. Guidance failing must never stop the caselog working.
11. Adding a hospital or a field is a data change, never a code change.
12. Everything synthetic. Fictional phone numbers (555-01xx).

---

## The one thing that decides tomorrow

The judges hand us two files for a hospital we have never seen and we load them live. **The
storyboard file is currently rejected by the importer**, so a new hospital's conflicts would be
invisible.

That is Machine 2's first task. If the day goes badly and only one thing ships, it is that one.
