# One-day sprint to the demo — coordination plan

5 machines · 1 day · demo tomorrow · all data synthetic

---

## 1. Read this first

**What the judges actually test.** They hand you two files for a hospital you have never seen —
`hospital_guides.json` and `storyboard_notes.json` — you drop them in, and the tool must show the
right nudges and answer questions, each with its source and status, with no code change.

**Right now that test fails.** `src/imports.ts:111` rejects the sponsor's storyboard file
(`Row 1: field and text value required.`), and importing the guide file attaches **zero**
storyboard sources. The seven kit hospitals only show storyboard conflicts because that data is
baked into `src/data/seeds.json`. On an unseen hospital, conflicts would be invisible.

**So: Machine A's first task outranks everything else in this sprint.** If the day goes badly and
only one thing ships, it is that.

**What we are not building today.** No server, no database, no login, no server-side audit, no
LLM. You cannot build those well in a day, and the judges do not test them. We show production
readiness through the written design (`docs/PRODUCTION_PLAN.md`), the guardrail test suite, and an
architecture page — not through a half-built backend. Live hospital status ships as a local mock
feed, which is real functionality and demos the escalation story.

Say this plainly on stage: *"The rules engine, the guardrails and the data contracts are
production-shaped. Persistence, SSO and audit are specified in the plan and are the next module."*
That scores better than a backend that falls over.

---

## 2. Prerequisites (do these before anyone starts coding — 10 minutes)

1. **Repo access.** Everyone works on `Dexter3337/sevaro-encounter-guide` directly. Rohit adds all
   five of us as collaborators (Settings → Collaborators); accept the emailed invitation before
   you try to push. This is the team's single source of truth — the earlier fork is no longer
   used.
2. **Integration branch.** From `feature/anticipatory-guidance`, create and push `sprint/demo`.
   This is the branch we demo from.
3. **Everyone:** clone, `pnpm install --frozen-lockfile`, `pnpm test`, `pnpm dev`. Confirm 110
   unit tests pass before you change anything. If they don't, stop and fix the environment first.
4. **Node 24, pnpm 11.**

---

## 3. Branch and merge protocol

| | |
|---|---|
| Base branch | `sprint/demo` |
| Your branch | `sprint/a-ingestion`, `sprint/b-engine`, `sprint/c-dock`, `sprint/d-chat`, `sprint/e-guardrails` |
| Commit cadence | Small, every 20–30 minutes, pushed |
| Merge | PR into `sprint/demo`; **Machine E merges** at each checkpoint |
| Before every push | `pnpm typecheck && pnpm test` must pass |
| Conflicts | You own your files (§4). If you need a change in someone else's file, message the owner — do not edit it |

Rebase on `sprint/demo` at every checkpoint: `git fetch && git rebase origin/sprint/demo`.

---

## 4. File ownership — do not edit files you do not own

| Machine | Owns | Must not touch |
|---|---|---|
| **A** Ingestion | `src/imports.ts`, `data/fixtures/**`, `data/seeds/contacts.json`, `scripts/build-seeds.mjs`, `tests/imports.test.ts` | `src/engine.ts`, `src/main.tsx`, any UI folder |
| **B** Engine | `src/engine.ts`, `src/time.ts`, `src/knowledge.ts`, `src/domain.ts`, `src/fixtures.ts`, `src/evaluation.ts`, `tests/acceptance.test.ts`, `tests/triggers.test.ts`, `tests/holdout.test.ts` | `src/imports.ts`, `src/main.tsx`, UI folders |
| **C** Dock + shell | `src/main.tsx`, `src/encounter/**`, `src/guidance/**`, `src/styles/**` | `src/engine.ts`, `src/imports.ts`, `src/chat/**`, `src/contacts/**` |
| **D** Chat + contacts | `src/chat/**`, `src/contacts/**`, `src/encounter/StoryboardCard.tsx` | `src/main.tsx`, `src/guidance/**`, `src/engine.ts` |
| **E** Guardrails + demo | `tests/e2e/**`, `src/status/**`, `src/admin/**`, `docs/**`, `.github/workflows/**` | all `src/` except `status/` and `admin/` |

Exception: the **kickoff commits** in §5 deliberately touch shared files, and happen before anyone
else starts.

---

## 5. Kickoff (first 30 minutes — do these two first, everything else waits)

### Kickoff 1 — B lands the contracts (15 min, push immediately)

B adds to `src/domain.ts` and pushes straight to `sprint/demo`:

```ts
// Result gains the handbook's fourth question: "what should the doctor do?"
export type Result = {
  /* …existing fields… */
  action: string;                       // required; "" is not acceptable
  triggerId?: string;                   // "why am I seeing this?"
  autoExpand?: boolean;                 // C reads this
  liveStatus?: LiveStatusReport[];      // E populates
  release?: "fix_only" | "acknowledge_with_reason";
};

export const storyboardRecordSchema = z.object({
  hospital_id: z.string().min(1),
  field: z.string().min(1).max(200),
  storyboard_value: z.string().max(12000),
  storyboard_updated: z.string().optional(),
  note: z.string().optional(),          // NEVER read by engine or UI
}).passthrough();

export const contactSchema = z.object({
  id: z.string(), hospitalId: z.string(), role: z.string(), name: z.string(),
  title: z.string().optional(), phone: z.string(),
  altChannel: z.string().optional(), availability: z.string().optional(),
  lastVerified: z.string().optional(), source: z.string().default("Synthetic directory"),
});
export type Contact = z.infer<typeof contactSchema>;

export const liveStatusSchema = z.object({
  id: z.string(), hospitalId: z.string(), resource: z.string(),
  state: z.enum(["operational","degraded","down","diverting","unknown"]),
  message: z.string().max(500).optional(),
  reportedAt: z.string(), expiresAt: z.string(), source: z.string(),
});
export type LiveStatusReport = z.infer<typeof liveStatusSchema>;
```

Also extend `Hospital` with `contacts?: Contact[]`. Then `pnpm typecheck` (it will fail where
`action` is missing — set `action: ""` temporarily in `base()` only, and fill it properly in B2),
`pnpm test`, push.

### Kickoff 2 — C lands the UI skeleton (20 min, push immediately)

C creates the folders and **stub** components with the exact prop signatures in §6, mounts them in
`src/main.tsx`, and pushes. Stubs render nothing but must typecheck. This is what lets D work
without touching `main.tsx`.

```
src/encounter/{ContextHeader,FieldRow,CompleteBar,StoryboardCard}.tsx
src/guidance/{NudgeDock,NudgeCard,ReferenceRow,FieldMarker,dockMachine}.ts(x)
src/chat/ChatPanel.tsx        ← stub only; D fills it
src/contacts/ContactsSheet.tsx ← stub only; D fills it
src/status/statusFeed.ts       ← stub only; E fills it
```

**Everyone pulls `sprint/demo` after Kickoff 2 before branching.**

---

## 6. Integration contracts (frozen — changing one needs both owners to agree)

```ts
// src/guidance/NudgeDock.tsx — C owns
export interface NudgeDockProps {
  results: Result[];                 // already ranked by engine
  focusedFieldId?: string;
  fieldLabels: Record<string, string>;
  onAsk: (r: Result) => void;        // opens D's chat seeded with r
  onAcknowledge: (r: Result) => void;
  onContacts: (reason: string) => void;
  onReport: (r: Result) => void;
}

// src/chat/ChatPanel.tsx — D owns
export interface ChatPanelProps {
  open: boolean;
  hospital: Hospital;
  context: Context;
  seed?: Result;                     // nudge the doctor clicked
  onClose: () => void;
  onContacts: (reason: string) => void;
}

// src/contacts/ContactsSheet.tsx — D owns
export interface ContactsSheetProps {
  open: boolean;
  hospitalId: string;
  contacts: Contact[];
  instant: string;                   // ISO
  timezone: string;                  // hospital IANA zone
  reason?: string;
  onClose: () => void;
}

// src/encounter/StoryboardCard.tsx — D owns, C mounts
export interface StoryboardCardProps {
  hospital: Hospital;
  context: Context;
  onOpenConflict: (field: string) => void;
}

// src/status/statusFeed.ts — E owns
export function useLiveStatus(hospitalId: string): LiveStatusReport[];
```

---

## 7. Timetable and checkpoints

| Time | What |
|---|---|
| 09:00 | Prerequisites (§2) · Kickoff 1 and 2 (§5) · everyone pulls |
| 09:30 | **Block 1** — all machines on their P0 tasks |
| 13:00 | **Checkpoint 1** — E merges everything, runs full suite, 15-min standup. A's storyboard import must be merged by now |
| 14:00 | **Block 2** |
| 17:30 | **Checkpoint 2 — alien-data dry run.** E springs two unseen hospitals nobody has seen on the team. Whatever breaks is the only thing anyone works on next |
| 18:30 | **Block 3** — fix what the dry run broke; polish |
| 20:00 | **Freeze.** No new features. E runs the full suite, builds, deploys the demo, and the team rehearses §9 twice |
| 21:00 | Done |

**Cut list if you are behind, in this order:** live status mock (E) → "report a problem" → the
admin bindings form → field markers → storyboard staleness. **Never cut:** storyboard import,
sponsor wording, the dock, hard stop at Complete, contacts.

---

## 8. Non-negotiable guardrails (every machine, every PR)

| # | Rule |
|---|---|
| 1 | Never answer from another hospital's guide. One pack, one hospital, always. |
| 2 | Missing field → the exact sentence **"Not available in this hospital's guide."** first. Never guess, never borrow. |
| 3 | Every nudge and answer shows: hospital, guide field, version, date, status, and what to do. |
| 4 | Guide and storyboard disagree → show both with sources. Never pick one. Never read the storyboard `note` column. |
| 5 | All schedule logic in the hospital's own time zone. The doctor's zone is display only. |
| 6 | Hours the guide doesn't define → say what is unknown and give both branches. Never invent a window. |
| 7 | Stale = more than 180 days before 2026-03-17, recomputed every time, for every source. |
| 8 | Silence when nothing applies. Info never auto-expands. |
| 9 | Block only where the guide truly requires it; explain why; never block silently. |
| 10 | Read-only: the tool never modifies guide data. |
| 11 | Guidance failure never stops the caselog. |
| 12 | Adding a hospital or field is a data change, never a code change. |
| 13 | Everything synthetic. Fictional phone numbers (555-01xx). No real patient, hospital or Sevaro data. |

---

## 9. Demo script (rehearse twice before freeze — 5 minutes)

1. **Silence first.** SYN-002, General Neuro, History → type allergies "none" → nothing pops.
   *"It stays quiet unless a rule for this hospital applies."*
2. **The wow moment.** SYN-006, Stroke, clock Tue 19:30 Central (doctor 20:30 Eastern) → Imaging →
   focus "Large vessel occlusion present" → dock peeks the LVO protocol **before** answering →
   set Yes → advisory expands: outside the window, ED provider initiates transfer, never "activate
   EVT". Source, status `time-dependent`, "Do:" line. Roll the clock to 17:00 → it flips to within
   coverage.
3. **Honest uncertainty.** Switch to SYN-002 Stroke intake → storyboard card shows Video Eval
   Location conflict → open it → both values, both sources, both dates, no winner.
4. **Hard stop.** SYN-007 → Sign off → Complete → blocked at the button with what is missing →
   record the charge → completes.
5. **Ask and escalate.** Click a nudge → chat opens on that rule → "Who mixes the TNK?" at SYN-006
   → time-dependent **and** stale **and** staffed hours not in the guide → both branches → "Call
   someone" → nursing in charge, available now in hospital time.
6. **The judges' test.** Hand over their two files → drop both → preview → activate → select the
   new hospital → nudges, a conflict, and "Not available in this hospital's guide." for a field
   they left out. **No code change, no restart.**
7. **Close on production.** One page: architecture, the 13 guardrails, what ships next.

Record a screen capture of the full run before freeze as a fallback.

---

## 10. Per-machine prompts

Each machine opens Claude Code in `sevaro-encounter-guide` and pastes its own file:

| Machine | Prompt | Focus |
|---|---|---|
| A | `docs/sprint/MACHINE_A_INGESTION.md` | Storyboard import, multi-file drop, alien-data tolerance, contacts data, test fixtures |
| B | `docs/sprint/MACHINE_B_ENGINE.md` | Sponsor wording, "what to do", value lexicon, conflict matrix, unseen schedules, gates |
| C | `docs/sprint/MACHINE_C_DOCK.md` | Floating field-aware dock, field markers, hard stop at Complete, layout, a11y |
| D | `docs/sprint/MACHINE_D_CHAT.md` | Chat from nudge, contacts sheet, storyboard card |
| E | `docs/sprint/MACHINE_E_GUARDRAILS.md` | Guardrail tests, alien-data dry run, live status mock, admin, integration, deploy |
