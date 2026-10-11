# Machine D — Ask the guide, contacts, storyboard card

> Paste this whole file into Claude Code opened at `sevaro-encounter-guide`.

## Who you are

You own the doctor's **escalation ladder**: nudge → ask → call a person. The nudge is Machine C's.
Steps two and three are yours, plus the storyboard card the handbook puts at the top of the
caselog.

Chat is the secondary deliverable and the handbook is blunt about it: *"A chat assistant on its own
will not place highly."* Yours must look like part of the caselog, opened from a nudge, grounded in
one hospital's guide — not a general chatbot bolted on.

**You own:** `src/chat/**`, `src/contacts/**`, `src/encounter/StoryboardCard.tsx`.

**You must not touch:** `src/main.tsx` (C mounts you), `src/guidance/**`, `src/engine.ts`,
`src/imports.ts`, `tests/e2e/**`.

**Branch:** `sprint/d-chat` off `sprint/demo`, **after Machine C pushes the skeleton** (Kickoff 2).
Until then, read the sources below.

## Read first

1. `docs/sprint/SPRINT_PLAN.md` §6 contracts (your prop signatures are frozen there), §8 guardrails
2. `C:\Users\harsh\Downloads\Challenge_1_Handbook.pdf` — chapter 3 ("every nudge and answer must
   show"), chapter 5 (six statuses)
3. `data/official/validation_set.csv` — all 20 questions and expected answers; these are what chat
   must handle
4. `src/engine.ts` → `ask()` (line 279) and `src/knowledge.ts` → `resolveConcept` — the existing
   grounded resolver you are building a UI for. **Read it; do not modify it** (Machine B owns it)

## Non-negotiables

- Answers come from `ask()` for the **active hospital and version only**. You never write an
  answer, never summarise across hospitals, never guess.
- Missing → Machine B's exact sentence, "Not available in this hospital's guide.", first.
- Every answer shows source field, status and the "Do:" line, exactly like a nudge card.
- Contacts are per hospital. Never show another hospital's contact.
- No LLM today. If `ask()` cannot resolve a question, show the clarification and the candidate
  fields it returns — that is the honest behaviour, and it demos well.
- Nothing you build persists question text anywhere.

---

## D1 — Chat panel (P0)

Signature is frozen in `SPRINT_PLAN.md` §6. Build to it exactly; C is already mounting the stub.

**Opening.** Two routes: Machine C calls `onAsk(result)` when a nudge card is clicked (you receive
it as `seed`), or the doctor opens it from the dock header (no seed).

**Seeded state** — this is the moment that proves nudge and chat are one product:

```
┌─────────────────────────────────────────────┐
│ About: LVO Protocol · SYN-006               │  ← context chip from seed
│        Time-dependent · verified 2026-02-02 │
├─────────────────────────────────────────────┤
│ Outside the thrombectomy window             │  ← the nudge's answer, restated
│ (Mon–Fri 07:00–19:00 CST).                  │
│ Do: ED provider initiates transfer.         │
│                                             │
│ Try asking:                                 │
│  • What are the coverage hours?             │  ← suggested questions
│  • Who do I call for transfer?              │
│  • What if the patient arrives at 06:00?    │
├─────────────────────────────────────────────┤
│ [ Ask about this hospital's guide…      ]   │
│ Don't include patient names or identifiers. │
└─────────────────────────────────────────────┘
```

Suggested questions: derive 2–3 from the seed's guide field — not hard-coded per hospital. A small
map from guide field → question templates in `src/chat/suggestions.ts` is fine (e.g. LVO Protocol →
coverage hours, who to call, outside-hours branch). Fall back to generic ones.

**Answer rendering.** Reuse Machine C's `NudgeCard` look (import it; do not fork it) so an answer
and a nudge are visually the same object. Show status badge, source line, "Do:" line, evidence
drawer.

**Behaviours:**
- Deterministic answers in well under a second — keep it synchronous, no spinner theatre.
- Clarification path: when `ask()` returns `clarification` + `candidates`, render the candidates
  as clickable chips that re-ask with the exact field name. This turns a miss into a two-click hit
  and is far better on stage than an apology.
- Clear the thread when the hospital, guide version or encounter changes — a stale answer from the
  previous hospital on screen is the single worst thing that can happen. Add a test for this.
- History lives in component state for this encounter only.
- 2,000-character limit on input, matching `ask()`.
- Desktop: 400 px drawer in the dock column. Mobile (< 768 px): full-screen sheet, `Esc` and a
  visible close.

**Escalate.** When the answer's status is `not_in_guide`, `conflict`, carries an interpretation
review flag, or has a live-status alert, append a "Call someone" button that calls
`onContacts(reason)` with a short reason string ("Guide doesn't cover note title").

**Test against V01–V20.** Pick six that cover every status — V01 answered, V06 time-dependent,
V10 hard stop, V12 conflict, V13 stale, V14 not in guide — and assert the rendered card shows the
right status, source field and "Do:" line.

---

## D2 — Contacts sheet (P0)

Escalation step three: when the guide cannot answer, the doctor needs a person, not a dead end.

Signature frozen in §6. Data arrives as `hospital.contacts` (Machine A is building the importer
and `data/seeds/contacts.json` — ask A for the shape the moment you start; if it has not landed,
build against a local fixture and swap).

```
┌──────────────────────────────────────────────┐
│ Who to call at Highland Valley Hospital      │
│ Guide doesn't cover note title               │  ← reason, when provided
├──────────────────────────────────────────────┤
│ TECHNICAL LEAD                               │
│ Priya Raman (synthetic)                      │
│ Telemedicine technical lead                  │
│ +1-555-0177    [Call] [Copy]                 │
│ Teams: hvh-telehealth                        │
│ ● Available now (Mon–Fri 07:00–19:00 CST)    │  ← evaluated in HOSPITAL time
│ Verified 2026-02-02                          │
├──────────────────────────────────────────────┤
│ NURSING IN CHARGE   …                        │
│ ADMINISTRATOR ON DUTY   …                    │
└──────────────────────────────────────────────┘
```

Rules:
- **Availability in hospital-local time.** Reuse the engine's schedule helpers from `src/time.ts`
  (`windows`, `matchWindow`) — import them, do not re-implement. Show "Available now", "Opens in
  15 minutes", or "Outside listed hours". If the availability text is undefined (`As scheduled`,
  `During hospitalist hours`), say "Hours not listed — call to check". Never guess.
- **Staleness:** `last_verified` more than 180 days before 2026-03-17 → "Contact details may be out
  of date (verified <date>)".
- **Missing role:** "No <role> on file for this hospital." Never substitute another hospital's
  contact. Add a test for cross-hospital isolation.
- `tel:` links for the phone, plus a copy button (demo laptops have no dialler).
- Reachable from three places: the dock, inline in chat, and the context header.

---

## D3 — Storyboard card (P0)

The handbook puts the hospital's storyboard card at the top of the caselog. We only use storyboard
rows as citations today — this makes the second source visible, which is what makes the conflict
story land.

Signature frozen in §6; Machine C mounts it beneath the context header.

```
┌───────────────────────────────────────────────────────────────┐
│ Hospital storyboard · Bluewater Regional          [collapse]  │
│ Updated 2025-09-14 · 184 days ago · may be out of date        │
├───────────────────────────────────────────────────────────────┤
│ Video Eval Location   Patient room                         ⚠  │
│    ⚠ Guide says: CT holding bay for stroke alerts             │
│      [See both sources]                                       │
│ Thrombolytic          Tenecteplase                         ✓  │
└───────────────────────────────────────────────────────────────┘
```

- Read storyboard rows from `hospital.fields` where `sourceKind === "storyboard"`.
- Ask the engine for the comparison verdict — **do not compute agreement yourself**. Machine B's
  `compare()` owns that logic, including scope branches (SYN-002's Video Eval conflicts for a
  stroke alert but agrees for a General Neuro consult). Call it; if B has not landed it, mark the
  row "checking" and wire it at checkpoint 1.
- A conflicting row is marked and `[See both sources]` calls `onOpenConflict(field)` so C can open
  the dock on that entry.
- An agreeing row shows a quiet tick — the handbook explicitly warns against raising a false alarm
  when the sources agree (SYN-005 Thrombolytic is the test case).
- **Never render the `note` column.** It contains sponsor commentary that would read as our
  analysis. Add a test that mutates `note` and asserts the card is unchanged.
- Staleness per `storyboard_updated` using the same 180-day rule.
- Collapsible, collapsed state remembered per encounter. Hidden entirely when the hospital has no
  storyboard rows.

---

## D4 — Polish (P1, only after D1–D3 work)

- Keyboard: `Esc` closes chat and contacts; focus trapped in the mobile sheet and returned to the
  opener on close.
- Screen reader: chat is a labelled `region` (modal `dialog` only on mobile); new answers announced
  `aria-live="polite"`.
- Copy pass: no apologies, no "I think", no hedging. State the answer, the source, the status and
  the action.
- 390 px check.

## Tests you own

`src/chat/ChatPanel.test.tsx`, `src/contacts/ContactsSheet.test.tsx`,
`src/encounter/StoryboardCard.test.tsx`:

- Seeded chat shows the nudge's field, status and action.
- Six validation questions render the right status and source.
- Changing hospital clears the thread (no stale cross-hospital answer on screen).
- `not_in_guide` answer offers contacts; `answered` does not.
- Contacts: available-now computed in hospital time; stale marked; missing role messaged; never
  another hospital's contact.
- Storyboard: conflict marked, agreement quiet, `note` mutation changes nothing, absent storyboard
  hides the card.

## Verify before every push

```bash
pnpm typecheck && pnpm test && pnpm build
```

## Report at each checkpoint

What landed, whether your components are receiving real props from C, whether A's contacts data
has arrived, and whether B's `compare()` is wired into the storyboard card.
