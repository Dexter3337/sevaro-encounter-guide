# Machine 3 — the screen

> In Claude Code, opened at the repository root, send:
> **"Read `docs/sprint/MACHINE_3.md` and follow it. Start with task 1."**

## Who you are

You own **what the judges watch**. The caselog is the doctor's working surface and your floating
dock is the product. Two rules decide whether it reads as thoughtful or as nagging: it must be
impossible to miss when something matters, and invisible when nothing does.

The engine already gives you everything you need — a ranked list, and a flag on the one result
that may open the panel. You do not have to decide any of that yourself.

**You own:** `src/main.tsx`, `src/encounter/**` *(except `StoryboardCard.tsx`)*,
`src/guidance/**`, `src/admin/**`, `src/status/**`, all CSS, `tests/e2e/**`.

**You must not touch:** `src/engine.ts`, `src/time.ts`, `src/knowledge.ts`, `src/domain.ts`,
`src/imports.ts`, `src/chat/**`, `src/contacts/**`, `src/encounter/StoryboardCard.tsx`.

**Branch:** `sprint/m3-ui`

```bash
pnpm sync
git checkout -b sprint/m3-ui
```

## Read first

1. `docs/sprint/THREE_MACHINES.md` — ownership and the ship rhythm
2. `docs/sources/Challenge_1_Handbook.pdf` — chapter 2 issue 3 (staying quiet), issue 10 (when to
   block), chapter 3 (the three tiers)
3. `docs/sprint/MACHINE_C_DOCK.md` — your detailed task list
4. `src/main.tsx` as it stands — 1,841 lines, and you are about to break it up

## How you work

Before each task: `pnpm sync`. When a task works: `pnpm ship "what you did"`, then one line in the
group chat. Ship after every task.

## What the engine already gives you

```ts
const results = evaluate(hospital, context, event, previousResults);
```

- **`nudgePriority(r) >= 50`** → card. Below → one-line row.
- **`r.autoExpand`** → this result, and at most this one, may open the panel. Info never has it.
  Do not write your own rule for this; just read the flag.
- **`r.action`** → the "Do:" line. Always present.
- **`r.triggerId`** → for "Why am I seeing this?"
- **`r.release`** → `"fix_only"` or `"acknowledge_with_reason"` on hard stops.
- **`resultSignature(r)`** → stable identity, for remembering a collapse.

Pass `previousResults` in. Without it every result looks new and the panel opens on every
keystroke.

---

## Task 1 — Kickoff 2: the skeleton (do this first, ship within the hour)

**Machine 2 is blocked on this.** Create the folders and **empty placeholder** components with the
exact prop signatures in `SPRINT_PLAN.md` §6, mount them in `src/main.tsx`, and ship. They must
typecheck and render nothing.

```
src/encounter/{ContextHeader,FieldRow,CompleteBar,StoryboardCard}.tsx
src/guidance/{NudgeDock,NudgeCard,ReferenceRow,FieldMarker,dockMachine}.ts(x)
src/chat/ChatPanel.tsx            ← placeholder only. Machine 2 fills it.
src/contacts/ContactsSheet.tsx    ← placeholder only. Machine 2 fills it.
src/status/statusFeed.ts          ← `export const useLiveStatus = () => []`
```

`StoryboardCard.tsx` is Machine 2's from the moment you create it. Create it empty, mount it,
never touch it again.

`pnpm ship "UI skeleton and prop signatures"`, then say so in the chat.

---

## Task 2 — Break up `main.tsx`, and remove voice and transcript

`MACHINE_C_DOCK.md` sections C1 and C2.

Move, do not rewrite: the clinician screen into `encounter/` and `guidance/`, the guide library,
importer, evaluation workbench and demo controls into `admin/`, and the shared encounter state
into an `EncounterProvider`. Run the tests before and after; commit the move on its own so a
revert is cheap.

Then delete the voice and transcript feature — it is out of scope and it distracts from the actual
deliverable: `VoiceCopilot.tsx`, `voice.ts`, `useMicrophone.ts`, `transcript.ts`,
`TranscriptReview.tsx`, their tests, `docs/VOICE_WORKFLOW.md`, and the "You focus on the
conversation" hero.

**Keep the clock override** — move it into `admin/DemoTools.tsx`. The demo depends on it for the
19:30 → 17:00 moment.

---

## Task 3 — The floating dock

`MACHINE_C_DOCK.md` section C3. Bottom-right, four states driven by a pure `dockMachine.ts` you
unit-test: `hidden`, `pill`, `peek`, `panel`.

The behaviour that sells the product: **focusing a field shows that field's guidance before a
value is chosen.** Dispatch `field_focused` on focus and put that field's results first under
"For: `<label>`".

Opening rules, all from the engine:

- a result arrives with `autoExpand` → open the panel, scroll to it, announce politely, **do not
  move keyboard focus** (the doctor is typing)
- info only → `peek` at most
- the doctor collapses it → remember that, and do not re-open until a result with a new signature
  appears

---

## Task 4 — Card content

`MACHINE_C_DOCK.md` section C4. Every card: tier and status as **words**, the guide field name,
the answer, the **"Do:" line from `r.action`**, hospital · field · version, the verification date
with "may be out of date" when stale, an evidence drawer, and "Why am I seeing this?".

A conflict shows both values side by side with their dates and no visual winner. Tier is colour
**and** a label **and** an icon — never colour alone.

---

## Task 5 — The hard stop at the Complete button

`MACHINE_C_DOCK.md` section C6. A corner dock is the wrong place for a block.

When a result has `blocksCompletion`, a banner appears **at the Complete button** with
`role="alert"`: what is missing, which hospital rule requires it, and a link that focuses the
field to fix it.

`release: "fix_only"` → the only route is recording the value. `release:
"acknowledge_with_reason"` → an "Acknowledge and complete" control that requires a short reason
before it enables.

Never block silently; never release silently.

---

## Task 6 — Layout, header, resilience, accessibility

`MACHINE_C_DOCK.md` sections C5, C7, C8.

Remove the right-hand rail; the caselog takes the full width. The header shows the hospital, **its
local time and zone**, and **the doctor's time and zone** side by side — that is what makes "19:30
there, 20:30 for you" land on stage. Mount Machine 2's `StoryboardCard` beneath it.

Field markers beside each label when that field has results, linking to the dock entry. An error
boundary around all guidance, so the caselog keeps working if it throws. `aria-live="polite"` for
new advisories, `assertive` only for the Complete banner. 390 px with no horizontal scroll.

---

## Task 7 — Admin import screen

The screen you will stand in front of tomorrow when the judges hand over their files. Wire
Machine 2's `previewImportBundle` to a drop zone that takes several files at once, shows per-file
diagnostics, and has one Activate button. Calm and obvious beats clever.

---

## Tests you own

`src/guidance/dockMachine.test.ts` — every transition, especially that info never reaches `panel`
by itself and that a user collapse is remembered until something genuinely new arrives.

`tests/e2e/**` — you now own these. Repoint the existing selectors as you move things, and use
stable hooks: `data-testid="nudge-dock"`, `"nudge-card"`, `"field-marker"`, `"gate-banner"`,
`"storyboard-card"`.

Keep the latency gate honest: a field change must paint a nudge inside 500 ms, and we are at
about 32 ms today. If the suite gets noisy under load, run it serially rather than relaxing the
threshold.

## Report after each ship

What landed, which dock states work, any `data-testid` changes, and whether Machine 2's
components are mounted and receiving real props.
