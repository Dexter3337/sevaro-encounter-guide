# Sevaro Workflow Companion — production build: planning prompt

> Paste this whole file into a new Claude Code session opened at
> the repository root. It asks for a plan, not code.

---

## 0. Your task in this session

You are **planning, not building**. Produce a complete, sequenced plan for taking the existing
EncounterGuide prototype to a production-ready Sevaro Challenge 1 workflow companion, then stop
and ask for approval.

- Do **not** change application code, tests, data, dependencies or git state in this session.
- Write the plan to `sevaro-encounter-guide/docs/PRODUCTION_PLAN.md` in the format of §15.
- Then reply with a short summary and the decisions that need the user's sign-off (§14).

Before planning, read every source in §2 and **re-verify every gap in §4 against the code**. They
were recorded at commit `968fca4`; treat them as leads, not facts. If something here is wrong,
say so in the plan with evidence (`file:line`).

---

## 1. What we are building

Sevaro's teleneurologists treat patients at 200+ hospitals over live video. While on the call
they fill in the **caselog** in Synapse: intake → history → imaging → recommendation → note →
sign-off, plus rounding visits. Every hospital has its own **guide** (80+ rules in reality): which
thrombolytic, who mixes it, where the video exam happens, how an LVO is escalated, what to title
the note, whether a charge is required. Today the doctor stops, opens the guide, searches, comes
back — or goes from memory, which is often wrong for that hospital. A quality team catches the
mistakes after the case closes.

We build a **companion that sits inside the caselog** and puts *this hospital's* rule in front of
the doctor at the moment it matters, without being asked. It only reads guides, never changes
them, and never stops the caselog working.

The doctor's escalation ladder:

1. **Proactive nudge** — the primary deliverable.
2. **Ask the guide** — typed questions answered only from this hospital's sources. Secondary
   deliverable. Opened by clicking a nudge.
3. **Call a person** — the hospital's technical lead, nursing in charge, or administrator — when
   the guide can't answer, sources disagree, or live status says something is wrong.

### In scope

- The mock caselog as the doctor's working surface (stand-in for Synapse).
- Floating nudge dock, chat, contacts.
- Hospital guides, storyboard, contacts directory, live operational status feed.
- Loading an unseen hospital (guide + storyboard files) during a live demo without restart or
  code change.
- A production backend: persistence, versioned hospital packs, auth, audit, observability,
  deployment.

### Out of scope — do not plan work for these

- Voice capture, speech-to-text, transcript drafting, auto-filling the caselog from the
  conversation. The user has ruled this out. Existing code for it leaves the clinician UI (§3).
- Simulators presented as product features. Scenario launchers stay as admin/test tooling only.
- Clinical decisions: dose calculation (e.g. TNK dose by weight), diagnosis, scan reading,
  treatment recommendations. The Gemini transcript in §2 suggests some of these; they are out.
- Real Synapse integration, real hospitals, real patients, real phone numbers. All data is
  synthetic.
- Challenge 2 (operations command center).

---

## 2. Sources — read all of them, in this order of authority

| # | Source | Path | Authority |
|---|---|---|---|
| 1 | Challenge 1 Handbook (newest sponsor document) | `docs/sources/Challenge_1_Handbook.pdf` | Highest. Wins any conflict. |
| 2 | Kit data (6 files) | `developer-kit/Sevaro_Rutgers_Health_Hack_Developer_Kit/Challenge_1_Guided_Workflow/data/` (identical copies in `sevaro-encounter-guide/data/official/`) | Authoritative for file formats and expected behaviour: `validation_set.csv` (V01–V20), `nudge_scenarios.json` (N1–N9). |
| 3 | Original brief v2 | `developer-kit/.../Challenge_1_Guided_Workflow/Sevaro_Rutgers_Health_Hack_Challenge_1_Guided_Workflow.pdf`; extracted text at `sevaro-encounter-guide/research/challenge1.txt` | Authoritative where the handbook is silent. |
| 4 | User's research conversation with Gemini | `docs/sources/Sevaro_research_conversation_Gemini.pdf` | Context for intent only. Not a spec. It proposes things outside the brief (dose calculation, airlift recommendations, an "Order CTA" checkbox, a right-hand sidebar). This prompt's decisions supersede it. |
| 5 | Repo docs | `sevaro-encounter-guide/README.md`, `TEAM_HANDOFF.md`, `docs/*.md` (especially `DECISIONS.md`, `DATA_CONTRACT.md`, `SEVARO_ALIGNMENT_REVIEW.md`), workspace-root `PROJECT_CONTEXT.md`, `Sevaro_Challenge_1_Standalone_Build_Plan.md` (prior plan, 1,220 lines — skim §§6–12) | Describes the current system. May be stale. |
| 6 | Code and tests | `sevaro-encounter-guide/src/`, `tests/` | Ground truth for current behaviour. |

---

## 3. Current state (snapshot)

Repo `sevaro-encounter-guide/`, branch `feature/anticipatory-guidance`, commit `968fca4`.
Open PR #1 to `Dexter3337/sevaro-encounter-guide` from fork `hsa70-ui/sevaro-encounter-guide`
(the user's account has read-only access upstream).

**Stack:** React, TypeScript, Vite, Zod, Temporal polyfill, Papa Parse; Vitest, Playwright; pnpm.
Browser-only: no backend, no auth, persistence in `localStorage` key `encounter-guide:v1`. Static
deploy on Netlify.

### Keep — strong foundations

- Deterministic engine `src/engine.ts` (`evaluate`, `answerField`, `ask`, `gates`,
  `nudgePriority`, `ctaConcern`); time `src/time.ts` (IANA zones via Temporal, schedule grammar,
  staleness); `src/knowledge.ts` (labels, aliases, interpretation diagnostics); `src/domain.ts`
  (Zod contracts, context, field registry, tri-state predicates); `src/imports.ts` (bounded,
  atomic, versioned, preserves originals); `src/adapter.ts` (encounter-context envelope).
- Already tested: hospital-scoped answers with no cross-hospital fill; staleness > 180 days;
  time-dependent with `schedule_unknown`; conflict detection; Order Entry → Order Set Name
  cascade; completion gates; outage mode; HTML-inert rendering.
- 110 unit tests (including all 29 sponsor cases V01–V20, N1–N9) and 19 Playwright tests pass.
  Field-trigger latency p95 ≈ 32 ms in a real browser.
- The caselog field registry covers every row of `caselog_field_map.csv`.

### Behaviour decisions the user made in the previous session

- One ranking function (`nudgePriority`) decides prominence: cards for action, one-line
  expandable rows for context.
- Capability facts appear **on arrival at a step**, before a value is chosen. A recorded value
  promotes the matching capability into an action nudge instead of adding a second entry.
- Fields absent from a guide never produce an unsolicited nudge, except CTA and LVO, which show a
  "not documented — confirm locally" row on arrival, only until a value is recorded.
- Thrombolytic and Thrombolytic Mix Model guidance shows **before** administration and stops once
  "thrombolytic given = Yes". This deviates from field-map row 6; N4 still passes.
- Guidance currently renders inline above its field. **Superseded by the floating dock in §5.**

### Remove from the clinician UI (user decision)

- Voice copilot hero ("You focus on the conversation…", Start listening, Test a phrase):
  `src/VoiceCopilot.tsx`, `src/voice.ts`, `src/useMicrophone.ts`, `docs/VOICE_WORKFLOW.md`,
  `tests/voice.test.ts`, `tests/e2e/voice.spec.ts`.
- "Simulate transcript drafts": `src/transcript.ts`, `src/TranscriptReview.tsx`,
  `tests/transcript.test.ts`.
- "Demo controls & scenario launcher": move to an admin/test surface. The clock override is
  still needed to demonstrate time-dependent rules.

Recommend delete versus feature-flag (decision D2).

---

## 4. Gaps against the handbook — re-verify each

**G1 — Critical, would fail the judges' test.** The sponsor's `storyboard_notes.json` cannot be
imported. `previewImport` rejects it with `Row 1: field and text value required.` because it
expects `value` and the file uses `storyboard_value` / `storyboard_updated`. Importing
`hospital_guides.json` attaches zero storyboard sources. The seven kit hospitals only show
storyboard data because it is baked into `src/data/seeds.json`. In the handbook's test ("we will
give you two files … you drop them into your tool"), a new hospital's conflicts would never
surface. (Handbook ch. 4; issue 8.)

**G2 — Wrong "not in guide" wording; a regression from the last session.** The engine now says
"<Field> is not documented in <Hospital>'s guide. Availability is unknown…". The handbook says the
doctor sees "Not available in the hospital guide."; V14 and V20 expect "Not available in this
hospital's guide." The local oracle in `src/fixtures.ts` was edited to accept the new wording, so
tests pass while diverging from the sponsor. Fix: lead with the sponsor sentence; a clarifying
second sentence ("This does not mean the hospital lacks it. No other hospital was searched.") is
fine. Restore the fixtures to sponsor wording.

**G3 — The trigger map is code, not data.** `evaluate()` in `src/engine.ts` hard-codes more than a
dozen `add("<Guide Field>", …)` bindings. Handbook issue 2: "Keep the link between caselog fields
and guide fields as data you can change." Only imported `mappings` are data, and they cannot
express cascades, promotion or gates.

**G4 — Unseen fields are never nudged.** A new hospital's field gets a proactive nudge only if
someone hand-writes a `mappings` JSON. The judges' files will not contain one. Unseen field names
are reachable only through chat.

**G5 — Cascades and gates are hard-coded to field names and phrasings:** an Order Entry regex, a
Charge Entry `^Yes` check, a Consult Completion Rule regex. Handbook issue 11 warns about values
that mean "no" or "not applicable" in words; issue 10 says block only when the guide truly
requires it.

**G6 — No storyboard card.** Handbook ch. 1: the caselog shows "the hospital's storyboard card …
at the top." The app uses storyboard rows only as citation sources.

**G7 — The doctor's time is not shown.** Context holds `providerZone`, but the header shows only
the hospital-local clock. V17 expects "opens in 15 minutes (10:30 ET)".

**G8 — Storyboard freshness is undefined.** SYN-002's storyboard row was updated 2025-09-14, 184
days before the 2026-03-17 reference date. Current policy shows the date with no stale
classification (`docs/DECISIONS.md` #4). Needs a decision (D6).

**G9 — No contacts.** None of the 33 distinct guide field names in the kit is a contact.

**G10 — No live operational status integration.**

**G11 — No backend**, auth, server-side audit or multi-user persistence. Audit exists client-side
only.

**G12 — No explicit "what to do" line on nudges.** The handbook's per-nudge contract is: the answer,
where it came from, how sure (status), and what the doctor should do, including whether they are
blocked.

**G13 — Hard-stop release semantics differ from the handbook.** The handbook defines a hard stop as
blocking "until the doctor fixes it **or acknowledges it**." The prototype policy is that
acknowledgement never releases a gate. Decide per gate (D13).

Also check: the storyboard file's `note` column is sponsor commentary (e.g. "Disagrees with the
on-call guide for stroke alerts"). The engine must never use it to decide agreement — test files
may omit or change it.

---

## 5. Clinician experience

### 5.1 Layout

- The caselog is the working surface and takes the width the right-hand rail used to take.
- **Context header:** hospital name and ID; hospital-local time and zone; the doctor's time and
  zone; consult and encounter type; guide version and load state; live status summary (§6.5).
- **Storyboard card** at the top of the caselog: the hospital's storyboard values, each with its
  updated date. Any field where storyboard and guide disagree is visibly marked.
- No right-hand guidance rail.

### 5.2 Floating nudge dock, bottom-right — the primary deliverable

States:

- **Collapsed pill** with a count of applicable items for the current step and the highest tier
  present, shown by label as well as colour. Info-only shows a quiet pill.
- **Expanded** compact card stack, at most ~40% of viewport height, scrollable, keyboard
  reachable, collapsible back to the pill.

Field awareness:

- When the doctor focuses or hovers a caselog field, the dock shows that field's guidance first,
  headed "For: <field label>" — **before any value is chosen**. Focusing "CTA done" shows this
  hospital's CTA, CT perfusion and AI capability. Focusing "Large vessel occlusion present" shows
  the LVO protocol evaluated at hospital-local time.
- After a value is recorded, re-evaluate within 500 ms. If the change produces new critical
  information (hard stop, advisory, conflict, a recorded value contradicting the guide, a
  live-status alert), the dock **auto-expands** to that nudge. Info never auto-expands — the
  handbook says info "doesn't interrupt".
- A small tier marker beside the affected field's label links to its dock entry, so the nudge is
  visibly tied to the right field even though the dock sits in a corner (recommended; D1).
- Nothing applies → no badge, no pop. Silence is deliberate and must be demonstrable (N8).

Every nudge card shows:

- the answer in plain words;
- its source: hospital ID and guide field, or storyboard, or live status — with dates;
- its status: exactly one of answered, not in guide, time-dependent, stale, conflict, hard stop;
- **what to do**, including whether completion is blocked;
- Acknowledge (for advisories) and an evidence drill-down.

**Hard stops are enforced at the Complete action itself**, not only in the dock. The blocking
message appears at the button and names what is missing. A corner dock alone can be missed.

Clicking any nudge opens chat (§5.3), pre-scoped to that nudge.

### 5.3 Ask the guide — the secondary deliverable

- Opens from a nudge — seeded with hospital, field, status and cited source, offering two or three
  follow-up questions — or from the dock header.
- Answers only from the active hospital and guide version. Every answer carries source field(s),
  status and what to do.
- Missing → "Not available in this hospital's guide." Never another hospital's answer. Never
  guessed hours.
- When the answer is not in guide, a conflict, under interpretation review, or contradicted by live
  status → offer step 3 (contacts) inline.
- Typed only.

### 5.4 Contacts — escalation step 3

- Per hospital: **Technical lead** (telemedicine/IT), **Nursing in charge** (charge nurse /
  nursing station), **Administrator** (administrator on duty). Roles are data and extensible
  (D11).
- Reachable from the dock, inline in chat when escalation is suggested, and from the header.
- Each contact shows role, name, phone or extension, alternate channel, availability text
  (parsed with the same schedule grammar, so "available now?" is answered in hospital time), and
  last-verified date with staleness.
- Missing → "No contact on file for this hospital." Never another hospital's contact. Synthetic
  data only (555-01xx-style numbers).

### 5.5 Admin surfaces — not shown to clinicians during a case

- Guide library and import: drop `hospital_guides.json` and `storyboard_notes.json` together, plus
  optional contacts and status files, in any order; preview, diagnostics, activate; versioned;
  active cases stay pinned until explicit refresh.
- Mapping review: proposed bindings for unseen fields (§9); approve or reject.
- Live status console: manual entry and feed health.
- Contacts directory editor.
- Audit log viewer; evaluation workbench (29 sponsor cases plus holdout); clock override for demos.

### 5.6 Resilience and accessibility

- Guide unavailable at case open → the caselog stays fully usable and the dock says "Guidance
  unavailable" plainly.
- Keyboard-only use; screen reader announcements (`aria-live="polite"` for info and advisories,
  assertive only for hard stops); WCAG AA contrast; 390 px width without horizontal scroll;
  reduced motion.

---

## 6. Data sources and contracts

### 6.1 Hospital guide — sponsor format

```json
{ "encounter_reference_date": "2026-03-17", "stale_after_days": 180,
  "hospitals": [{ "hospital_id": "SYN-006", "hospital_name": "…", "local_timezone": "America/Chicago",
                  "fields": [{ "field": "LVO Protocol", "value": "…", "last_verified": "2026-02-02" }] }] }
```

Seven hospitals, 21–25 fields each, 33 distinct field names, fields deliberately missing. Values
are free text in many styles: `24/7`, `Mon-Fri 0700-1900`, `Tue/Thu 0800-1500`,
`Daily 0700-1900; continuous EEG unavailable`, `As scheduled`, `No`, `None`, `Not applicable`,
`Yes - tele-neurology encounter charge before sign-off`. Expect unseen names and phrasings.

### 6.2 Storyboard — sponsor format

The storyboard is **a per-hospital, per-field summary card shown at the top of the caselog — not
a summary of the patient's case.**

```json
[{ "hospital_id": "SYN-002", "field": "Video Eval Location", "storyboard_value": "Patient room",
   "storyboard_updated": "2025-09-14", "note": "…" }]
```

Kit rows: SYN-002 Video Eval Location "Patient room" (disagrees with the guide for stroke alerts);
SYN-005 Thrombolytic "Tenecteplase" (agrees — must not raise a conflict). Must import on its own
or alongside guides, in either order (G1).

### 6.3 Caselog field map → declarative trigger map

`caselog_field_map.csv` has 11 rows: step, caselog field, trigger, guide fields, default tier. It
seeds a **declarative trigger map**, editable as data (G3), that also expresses:

- anticipatory (on step arrival or field focus) versus reactive (on value) bindings;
- promotion: a recorded value turns a context row into an action nudge;
- cascades: rule A suppresses or replaces rule B when A's value means "no" or "not applicable";
- gates: hard stop on Complete, with fix-only or acknowledgeable release (D13);
- consult-type and encounter-type scope;
- hospital-local time evaluation.

### 6.4 Contacts — new

Propose a JSON and CSV format mirroring the guide:
`hospital_id, role, name, title, phone, alt_channel, availability, last_verified, source`.
Synthetic seed for the seven kit hospitals. The importer accepts it alongside guide and storyboard.

### 6.5 Live operational status — new

US hospitals post current operational state to external systems — regional status boards such as
EMResource track ED diversion and resource availability. Design an **adapter interface** with a
synthetic mock feed, manual admin entry, and a pluggable webhook or poll connector. No real
integration in this build.

Record: `hospital_id`, `resource` (e.g. `ct_scanner`, `mri`, `cath_lab_evt`, `ed_diversion`,
`internal_disaster`, `ehr_downtime`), `state` (`operational`, `degraded`, `down`, `diverting`,
`unknown`), `message`, `reported_at`, `source`, `expires_at`.

- Resources map to guide fields as data (e.g. `ct_scanner` → CT Head, CTA Head/Neck, CT Perfusion).
- Updates push to open cases (SSE or WebSocket) without a reload.
- No report means "No live status reported", never "operational". Expired reports show as stale.
- Hospital-wide states (diversion, internal disaster) show as a header banner and an advisory.

### 6.6 Compiled hospital pack

When a hospital is imported, and when a case opens for it, compile guide + storyboard + contacts +
approved mappings + trigger map into an **immutable, versioned pack**:

- normalized source records with provenance;
- per-field interpretation — schedule, capability (yes / no / not applicable), gating requirement,
  cascade relation, scope branches — with confidence and review flags;
- per-field guide-versus-storyboard comparison result;
- field-to-trigger bindings.

Live status overlays the pack at runtime; it is not compiled in. The client loads the pack once
at case open and evaluates locally (handbook: load at open, not per field change). For this
version, "case open" means selecting a hospital.

---

## 7. Rules engine requirements — deterministic, no LLM on this path

- Six statuses exactly: answered, not in guide, time-dependent, stale, conflict, hard stop.
  Overlapping flags are allowed (V18 is time-dependent and stale; V04 is not in guide with stale
  evidence).
- Hospital-scoped always. Never fill a gap from another hospital.
- Hospital-local time via IANA zones (Temporal); the doctor's zone is for display. Keep or justify
  the existing conventions: inclusive start, exclusive end; overnight windows belong to their
  starting day; ambiguous DST times reject.
- Stale = last verified more than 180 days before the encounter reference date, computed every
  time, for any field at any hospital.
- Undefined hours ("staffed hours", "staffed neurointerventional coverage", "As scheduled") → say
  what is unknown and give both branches. Never invent a window (V08, V18).
- Scope branches ("… for stroke alerts; … for other consults") are resolved by consult type
  before comparing or answering.
- Cascades, promotion and gates come from the trigger map (§6.3), not field-name code.
- Field change → visible nudge in under 500 ms, measured in a real browser as now.
- Read-only: nothing the doctor does changes a guide.

---

## 8. Conflict and merge policy — finalize this matrix in the plan

Principle (handbook issue 8): check every field that has a storyboard entry. When the sources
disagree, show both with their sources and never pick one. When they agree, raise no alarm.

Recommended defaults — confirm or improve:

| Situation | Status | What the doctor sees |
|---|---|---|
| Guide only | per guide (answered, stale or time-dependent) | Guide value. |
| Guide = storyboard (semantic, scope-aware) | guide's status | Guide value; evidence notes "storyboard agrees" (SYN-005 Thrombolytic). |
| Guide ≠ storyboard | conflict | Both values, each with source and date; no precedence (V12). |
| Equivalence uncertain | conflict, flagged "possible — review" | Both values. Never claim agreement on an uncertain match. |
| Guide has scope branches | compare the branch for this consult type | SYN-002: stroke alert → conflict (CT holding bay vs patient room); General Neuro → agree (patient room). |
| Storyboard only (guide lacks the field) | not in guide | "Not available in this hospital's guide." plus the storyboard value, labelled storyboard-only. |
| Conflict + stale (either side) | conflict, with stale flag | The age of both sides. |
| Conflict on a gating field (e.g. Charge Entry) | decision D5 | Never block silently; never release silently. |
| Guide vs live status (guide: CTA 24/7; status: CT down since 14:05) | guide's status plus live-status alert | Both: guide capability with verified date; status with source and age. Status never rewrites the guide. |
| Live status expired or feed down | as guide | "Live status not current (last report …)". |
| Several storyboard rows for one field | conflict if any disagree | All rows. |

Comparison pipeline: deterministic normalization first (case, punctuation, schedule
canonicalization so `24/7` ≡ "24 hours a day, 7 days a week", synonyms), then an optional
ingest-time LLM equivalence judgment for what remains (§9), stored in the pack with its rationale.
Never read the storyboard `note` column.

---

## 9. LLM usage — where it is allowed, and how

The system must work **fully with the LLM switched off**. The judges' new-hospital test must pass
on the deterministic path alone.

### Allowed — ingest time and chat only

1. **Interpreting unseen guide fields when a hospital is loaded** ("prior to the call"). Output
   proposed bindings (caselog field and step, trigger, tier, condition), schedule parse,
   capability semantics and cascade relations. Each proposal cites its exact source record with
   confidence and rationale; it is schema-validated, then checked deterministically. Info-tier
   proposals may auto-activate above a confidence threshold (D7). Advisory proposals need admin
   approval. The LLM may never create or remove a hard stop.
2. **Semantic equivalence** for guide-versus-storyboard comparison (agree / disagree / uncertain).
3. **Chat:** resolve the question to guide concepts and a time. Facts and status come from the
   engine; the model may phrase but may not add facts. The server rejects any answer citing a
   record ID that is not in the active pack. The deterministic resolver stays as the fallback.

### Forbidden

The field-change nudge path; deciding to block; retrieval across hospitals; inventing hours,
contacts or statuses; clinical recommendations.

### Implementation notes (checked against current Claude API documentation, October 2026)

- Official TypeScript SDK, `@anthropic-ai/sdk`. Model `claude-opus-5-5`. Propose a different model
  only with measured evidence and the user's approval.
- Thinking cannot be disabled on this model. Control depth with `output_config.effort` and set it
  explicitly — the default here is `medium`.
- Schema-valid JSON through structured outputs (`output_config.format` / `client.messages.parse()`)
  or `strict: true` tools. Forced `tool_choice` (`any` or `tool`) returns a 400 on this model.
- The API's document-citations feature cannot be combined with structured outputs. Cite your own
  source record IDs and validate them server-side.
- Prompt-cache the per-hospital pack: stable system prompt and pack first, the question last.
  Verify with `usage.cache_read_input_tokens`.
- Handle `stop_reason: "refusal"`. Enable server-side fallbacks (`fallbacks: "default"` with beta
  `server-side-fallback-2026-07-01`) or document why not.
- Timeouts, retries and typed errors. Any LLM failure degrades to deterministic behaviour and never
  blocks the caselog.
- **PHI:** case details are patient information under HIPAA. No patient-entered values go to an
  LLM unless a business associate agreement with the vendor is in place and the user approves.
  Chat sends the scrubbed question and guide excerpts only. Settle data retention and inference
  location with the user (D10).
- Build an eval set before tuning prompts: V01–V20, N1–N9, the holdout hospitals, and adversarial
  cases (cross-hospital bait, undefined hours, conflicting sources, unseen phrasings).

---

## 10. Backend — production

Recommended default; justify any change:

- **pnpm monorepo:** `packages/contracts` (Zod), `packages/engine` (pure TypeScript — today's
  engine, time, knowledge and domain modules, no DOM), `apps/web` (React/Vite), `apps/api` (Node,
  TypeScript; Fastify or equivalent).
- **Postgres** with migrations (SQLite acceptable for local development). Original uploads stored
  immutably with checksums.
- **Endpoints (sketch):** hospital list; compiled pack by hospital and version (ETag); import
  preview and activate (guides, storyboard, contacts, status); live status stream (SSE) and ingest
  webhook; ask; contacts; audit events; mapping review; health.
- **Integration seam:** keep the `adapter.ts` envelope compatible with
  `encounter_context_example.json`, so a real Synapse host could post events (embedded iframe or
  web component with `postMessage`, or server events). The mock caselog remains the stand-in.
- **Auth:** OIDC single sign-on; roles clinician, guide admin, auditor; access scoped by hospital.
- **Audit** (append-only, no PHI in free text): nudges shown, expanded, acknowledged, ignored and
  acted on; gates hit and resolved; chat question metadata; imports and approvals; status changes.
- **Observability:** structured logs without PHI; metrics for nudge latency, pack compile errors,
  LLM latency, errors and refusals, and feed lag; tracing.
- **Security:** keep the existing input bounds and HTML-inert rendering test; add CSP, secrets
  management, rate limits, dependency audit.
- **Deployment:** containerized API plus static web; environment configuration; migrations;
  backups. The static demo must still run offline for the hackathon (client-side engine and local
  import). Decide how the two modes coexist.

---

## 11. Non-functional acceptance

- Field change → nudge: p95 under 500 ms in a real browser (target 100 ms or less), measured.
- Case open including pack load under 1 s on a local network; a cached pack is reused.
- Guide, API, LLM or status-feed outage → the caselog keeps working and says so plainly.
- 390 px width, keyboard-only and screen-reader paths tested.

---

## 12. Testing

- All 29 sponsor cases pass against **sponsor wording** (fix the G2 fixtures).
- **New-hospital drop test, end to end in a browser:** load unseen guide and storyboard files,
  select the hospital, and see correct nudges (including a conflict) and answers with source and
  status. Use `data/holdout/`, and write at least one new unseen hospital that exercises every
  handbook issue: new field name, missing fields, a stale field, a conflict, undefined hours, a
  cascade "no" in words, a gate, new schedule phrasing.
- Conflict matrix: one test per row of §8.
- Dock: focus shows anticipatory content; a value change auto-expands only for critical items;
  info never interrupts; N8 stays silent; the hard stop appears at Complete.
- Chat: grounding validation rejects foreign record IDs; LLM-off parity.
- Contacts and status: missing, stale, expired, cross-hospital isolation.
- Latency, offline and outage, accessibility (axe), security (inert markup).

---

## 13. Sequencing constraints

- The app stays demoable after every module, and the full test suite passes at each merge.
- **First — demo-critical fixes on the current client-only architecture:** G1 storyboard import,
  G2 wording, floating dock with chat from a nudge, removing voice/transcript/simulator from the
  clinician UI, storyboard card, doctor's time, static synthetic contacts, the new-hospital drop
  test.
- Then triggers, cascades and gates as data (G3–G5) and the full conflict matrix.
- Then backend, auth, audit, packs, status feed.
- Then LLM ingest interpretation and chat grounding with admin review.
- Then hardening and deployment.

Estimate each module and mark what fits before the demo deadline (D12).

---

## 14. Decisions to put to the user — give a recommendation for each

- **D1** Tier marker beside the field label, linking to the dock entry (recommend: on).
- **D2** Voice/transcript code: delete now, or disable behind a flag until after the demo.
- **D3** Keep thrombolytic guidance before administration (deviation from field-map row 6), or
  restore the sponsor's "after given" trigger.
- **D4** Keep the "not documented — confirm locally" row for absent CTA/LVO on arrival, worded to
  the sponsor sentence.
- **D5** Conflict on a gating field: block; warn with a mandatory acknowledgement naming both
  values; or no gate.
- **D6** Storyboard staleness: apply the 180-day rule to `storyboard_updated`, show age only, or
  something else.
- **D7** Auto-activate info-tier LLM mappings during a live demo, or require approval for all.
- **D8** Live-status time-to-live defaults and which resources map to which guide fields.
- **D9** Hosting, database, SSO provider.
- **D10** LLM vendor agreement (BAA), data retention, inference location, and whether the LLM is
  on during the demo.
- **D11** The exact three contact roles and their labels.
- **D12** Demo date, and what must be done before it.
- **D13** Hard-stop release per gate: fix-only (e.g. charge must be recorded) or acknowledgeable
  with a reason captured in audit, as the handbook allows.

---

## 15. Format of `docs/PRODUCTION_PLAN.md`

1. Executive summary — one page at most.
2. Verification of the §4 gaps: confirmed, refuted or new, each with `file:line` evidence.
3. Requirements traceability: handbook issues 1–13, the six statuses, "How it should behave",
   "What the brief asks you to show" items 1–5, and the "Going further" items → requirement IDs →
   modules → tests.
4. Architecture (Mermaid or ASCII) and data flow for: case open, field focus, field change,
   Complete, ask, import, status update.
5. Data contracts (Zod level) for guide, storyboard, contacts, status, trigger map, compiled pack,
   nudge, answer, audit event.
6. The final conflict and merge matrix.
7. UI specification: dock states, field marker, chat, contacts, storyboard card, header, admin;
   empty, error and outage states; ASCII wireframes.
8. LLM specification: purpose of each prompt, schemas, guardrails, evals, fallbacks, cost and
   latency estimate.
9. Module breakdown. For each module: goal, files created or touched, dependencies, acceptance
   criteria, tests, estimate, risk. Each module must be executable on its own in a later session.
10. Migration path from the current repo: what moves, what is deleted, data compatibility, and
    PR strategy given that PR #1 is open from a fork.
11. Risks and mitigations.
12. Decisions D1–D13 with recommendations.

---

## 16. Working rules

- Planning only — no code, test, data, dependency or git changes in this session.
- Verify before you assert, and cite `file:line`.
- If this prompt conflicts with the handbook, the handbook wins; flag the conflict.
- Be direct when an idea conflicts with the brief or with patient safety. Recommend; don't just
  list options.
- Synthetic data only.
- Finish the whole plan under stated assumptions first, then put D1–D13 to the user.
