# Machine C — Nudge dock and caselog shell

> Paste this whole file into Claude Code opened at `sevaro-encounter-guide`.

## Who you are

You own **what the judges watch**. The caselog is the doctor's working surface; your floating dock
is the product. Two rules decide whether it reads as thoughtful or annoying: it must be impossible
to miss when something matters, and invisible when nothing does.

**You own:** `src/main.tsx`, `src/encounter/**` (except `StoryboardCard.tsx`), `src/guidance/**`,
`src/styles/**`, `src/workspace.css`, `src/style.css`.

**You must not touch:** `src/engine.ts`, `src/time.ts`, `src/knowledge.ts`, `src/domain.ts`,
`src/imports.ts`, `src/chat/**`, `src/contacts/**`, `tests/e2e/**`.

**Branch:** `sprint/c-dock` off `sprint/demo` — after Kickoff 2 (below), which you push directly
to `sprint/demo`.

## Read first

1. `docs/sprint/SPRINT_PLAN.md` §6 contracts, §8 guardrails, §9 demo script
2. `C:\Users\harsh\Downloads\Challenge_1_Handbook.pdf` — chapter 2 issue 3 (staying quiet), issue
   10 (when to block), chapter 3 (the three tiers)
3. `docs/PRODUCTION_PLAN.md` §16 — the full UI spec you are implementing a subset of
4. `src/main.tsx` as it stands (1,841 lines — you are going to break it up)

## Non-negotiables

- Silence when nothing applies: no badge, no pill, nothing.
- Info never auto-expands. Only hard stop, advisory, conflict, a recorded value contradicting the
  guide, or a live-status alert may open the panel.
- Never show a nudge without hospital, guide field, version, date, status and the "Do:" line.
- Guidance failure must never stop the caselog. Wrap guidance in an error boundary.
- Keyboard reachable; 390 px wide without horizontal scroll.

---

## Kickoff 2 — the skeleton (first 20 minutes, push to `sprint/demo`)

Machine D cannot start until this lands. Create these files as **stubs that typecheck and render
nothing**, with the exact prop signatures from `SPRINT_PLAN.md` §6, and mount them in
`src/main.tsx`:

```
src/encounter/ContextHeader.tsx
src/encounter/FieldRow.tsx
src/encounter/CompleteBar.tsx
src/encounter/StoryboardCard.tsx     ← stub only. D owns the contents. Do not implement it.
src/guidance/NudgeDock.tsx
src/guidance/NudgeCard.tsx
src/guidance/ReferenceRow.tsx
src/guidance/FieldMarker.tsx
src/guidance/dockMachine.ts
src/chat/ChatPanel.tsx               ← stub only. D owns the contents.
src/contacts/ContactsSheet.tsx       ← stub only. D owns the contents.
src/status/statusFeed.ts             ← stub: `export const useLiveStatus = () => []`. E owns it.
```

Push, say "skeleton is on sprint/demo", then branch.

---

## C1 — Decompose `main.tsx` (P0)

1,841 lines holding the clinician UI, the guide library, the importer and the evaluation workbench
is the main reason five people cannot work in parallel. Move, do not rewrite:

- Clinician screen → `src/encounter/**` + `src/guidance/**`
- Guide library / import / evaluation / demo controls → `src/admin/**` (Machine E takes these over
  once moved — move them, then leave them alone)
- Shared encounter state (`reduceEvent`, `evaluate` call, latency measurement) → an
  `EncounterProvider` context in `src/encounter/EncounterProvider.tsx`

`main.tsx` ends up as routing and providers. **Behaviour must not change** — run `pnpm test` and
`pnpm test:e2e` after the move and before anything else. Commit the move on its own so a revert is
cheap.

---

## C2 — Remove voice, transcript and the demo hero (P0)

Scope decision from the user: this is not a voice or transcript product and that UI distracts from
the actual deliverable.

Delete: `src/VoiceCopilot.tsx`, `src/voice.ts`, `src/useMicrophone.ts`, `src/transcript.ts`,
`src/TranscriptReview.tsx`, `tests/voice.test.ts`, `tests/transcript.test.ts`,
`tests/e2e/voice.spec.ts`, `docs/VOICE_WORKFLOW.md`. Remove the "You focus on the conversation"
hero, "Start listening", "Test a phrase", "Simulate transcript drafts" and the three-step
Listen/Understand/Anticipate strip.

Move "Demo controls & scenario launcher" into `src/admin/DemoTools.tsx`. **Keep the clock override**
— the demo depends on it for the 19:30 → 17:00 moment.

Git history keeps everything; nothing is lost.

---

## C3 — Field-aware floating dock (P0 — the centrepiece)

Bottom-right, above the fold, never covering the field in focus.

**States**, driven by a pure `dockMachine.ts` you unit-test:

| State | Appearance |
|---|---|
| `hidden` | Nothing at all (no applicable results) |
| `pill` | Small pill: count + highest tier as a word ("1 advisory · 3 info") |
| `peek` | One line above the pill: `For CTA done — CTA 24/7 · CT perfusion No · AI ClarityLVO` |
| `panel` | Card stack, max 40% viewport height (desktop) / 60vh bottom sheet (mobile), scrollable |

**Transitions:**

| Event | Result |
|---|---|
| results empty | `hidden` |
| results contain a **new** result with `autoExpand` | `panel`, scrolled to it, announced politely. **Do not move keyboard focus** — the doctor is typing |
| results change, info only | stay; update the count |
| field focused, critical results for it | `panel`, that field's results first under "For: <label>" |
| field focused, info only | `peek` (if currently `pill`/`hidden`) |
| blur | `peek` → `pill` after 1.5 s |
| user collapses | remember; do not auto-expand again until a result with a new signature appears |
| `Esc` | `panel` → `pill` |
| card clicked | call `onAsk(result)` — D's chat opens |

**Ordering:** focused field's results first, then by `priority` descending (Machine B sets it).
Results with `priority ≥ 50` render as `NudgeCard`; below that as `ReferenceRow` (one line,
expandable).

**Anticipatory behaviour is the demo's wow moment:** focusing a field shows that field's guidance
*before* a value is chosen. The engine already evaluates on `field_focused` — make sure
`EncounterProvider` dispatches that event on focus, and that it is cheap (no re-fetch).

---

## C4 — Card content (P0)

Every `NudgeCard`:

```
┌────────────────────────────────────────┐
│ ADVISORY · TIME-DEPENDENT              │   tier + status, words not just colour
│ LVO Protocol                           │   guide field name
│ Outside the thrombectomy window        │   the answer
│ (Mon–Fri 07:00–19:00 CST).             │
│ Do: ED provider initiates transfer.    │   ← result.action, always present
│ SYN-006 · LVO Protocol · Challenge v2  │   hospital · field · version
│ Verified 2026-02-02                    │   date (+ "may be out of date" if stale)
│ ▸ View source evidence                 │   raw text, locator, instants
│ ▸ Why am I seeing this?                │   result.triggerId in plain words
│ [Ask about this] [Acknowledge]         │
└────────────────────────────────────────┘
```

Conflicts render **both** sources side by side with their dates and no visual winner. Stale shows
"Last verified <date> — may be out of date." Not-in-guide leads with Machine B's sponsor sentence.

Tier is colour **and** a text label **and** an icon — never colour alone.

---

## C5 — Field markers (P1)

Beside each caselog field's label, a small marker when that field has results: a dot plus a word
("Advisory", "Info", "Required"). Clicking it opens the dock scrolled to that field's entry. This
is what stops a corner dock being missed. `aria-label`: "Advisory guidance for Large vessel
occlusion present".

---

## C6 — Hard stop at the Complete button (P0)

A corner dock is the wrong place for a block. When `completion_requested` returns a result with
`blocksCompletion`:

- A banner appears **at the Complete button**, `role="alert"`: what is missing, which hospital
  rule requires it, and a link that focuses the field to fix.
- `release: "fix_only"` → the only route is recording the value.
- `release: "acknowledge_with_reason"` → an "Acknowledge and complete" control that requires a
  short reason before it enables. Emit the acknowledgement for E's audit.
- Never block silently, and never release silently.

N5 (charge) and N7 (plan confirmation) must demo cleanly.

---

## C7 — Layout and context header (P0)

Remove the right-hand guidance rail; the caselog takes the full width.

Header shows: hospital name and ID · **hospital-local time and zone** · **the doctor's time and
zone** · consult and encounter type · guide version and load state · a slot for E's live-status
summary. The two clocks side by side are what make "19:30 there, 20:30 for you" land on stage.

Mount `StoryboardCard` (D's component) directly beneath the header.

---

## C8 — Resilience and accessibility (P0)

- Error boundary around all guidance. If it throws, the caselog keeps working and the dock reads
  "Guidance unavailable".
- Explicit states: pack loading, guidance unavailable, newer guide version available.
- `aria-live="polite"` for new advisories and info; `assertive` only for the Complete-button
  banner.
- Dock is a landmark `region` labelled "Hospital guidance"; panel is non-modal; `Esc` collapses.
- 44 px targets, visible focus rings, WCAG AA contrast, `prefers-reduced-motion`.
- 390 px: dock becomes a bottom sheet; no horizontal scroll anywhere.

## Tests you own

`src/guidance/dockMachine.test.ts` — every transition in C3, especially: info never reaches
`panel` by itself; user-collapse is remembered; a new critical result overrides it.

## Verify before every push

```bash
pnpm typecheck && pnpm test && pnpm build
```

Machine E owns `tests/e2e/**` — tell E as soon as a selector changes so they can repoint. Use
stable hooks: `data-testid="nudge-dock"`, `"nudge-card"`, `"field-marker"`, `"gate-banner"`,
`"storyboard-card"`.

## Report at each checkpoint

What landed, the current dock states, any selector changes E must know about, and whether D's
components are mounted and receiving props.
