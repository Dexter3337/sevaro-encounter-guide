# EncounterGuide — production project plan

| | |
|---|---|
| Product | EncounterGuide: hospital-rule companion for Sevaro teleneurology (Rutgers Health Hack, Sevaro Challenge 1) |
| Document | Production project plan, v1.0 |
| Date | 2026-10-10 |
| Status | Draft for approval |
| Baseline | Branch `feature/anticipatory-guidance`, commit `968fca4` |
| Inputs | `PRODUCTION_BUILD_PROMPT.md`; Challenge 1 Handbook; kit data; original brief v2; current code and tests |
| Delivery | Five modules (§25), each buildable and demoable on its own |

All hospitals, rules, people and phone numbers in this project are synthetic. Nothing here is
clinical guidance.

---

## Contents

**Part I — Product**
1. Summary · 2. Problem · 3. Users · 4. Goals, non-goals, success metrics · 5. Scope at a glance

**Part II — Requirements**
6. Functional requirements · 7. Non-functional requirements · 8. Traceability to the handbook

**Part III — Current state**
9. Baseline · 10. Verified gaps

**Part IV — Solution design**
11. Architecture · 12. Technology stack · 13. Repository structure · 14. Data model and contracts ·
15. Rules engine · 16. Frontend · 17. Backend · 18. AI components · 19. Synapse integration

**Part V — Guardrails, security, operations**
20. Guardrails catalogue · 21. Security and privacy · 22. Observability and SLOs · 23. Environments,
CI/CD and operations

**Part VI — Quality**
24. Test strategy and release gates

**Part VII — Delivery**
25. Module plan (M1–M5) · 26. Timeline and critical path · 27. Migration from the current repo ·
28. Risk register · 29. Decisions D1–D13 · 30. Open questions for Sevaro

**Appendices**
A. Kit hospital facts · B. Sponsor scenarios · C. Demo script · D. Glossary

---

# Part I — Product

## 1. Summary

Sevaro's teleneurologists cover 200+ hospitals over live video. During each call they fill in the
caselog. Every hospital runs its own way, and today the doctor either stops to search that
hospital's guide or works from memory, which is often wrong. Mistakes surface after the case,
when a quality team has to chase them.

EncounterGuide sits inside the caselog and shows **this hospital's rule, at this step, at this
hospital-local time**, without being asked. It also answers typed questions from the same guide,
and when the guide can't answer it hands the doctor the right person to call.

The prototype already has a strong deterministic rules engine (29/29 sponsor cases, ~32 ms p95
latency). Production work: fix two sponsor-compliance defects that would fail judging, rebuild the
guidance surface as a field-aware floating dock with chat and contacts, turn hard-coded rules into
data, add a real backend (persistence, auth, audit, live hospital status), and add an LLM layer
that improves coverage of unseen guides without ever sitting on the nudge path.

## 2. Problem

| Today | Consequence |
|---|---|
| Doctor stops the case to open the hospital guide, find the section, come back | Minutes lost mid-stroke-case |
| Or goes from memory | Wrong order set, wrong note title, missed charge, wrong escalation path |
| Errors found after the case closes | Quality team, doctor and sometimes hospital follow-up |
| Guides vary per hospital, per field, sometimes per time of day | Memory can't keep up across 200+ sites |
| Guide and storyboard can disagree; fields go out of date | Silent wrong answers |

The handbook's test: hand the tool a hospital it has never seen and check that it nudges and
answers correctly, with source and status, without a code change.

## 3. Users

| Persona | Context | Needs from EncounterGuide |
|---|---|---|
| **Teleneurologist** (primary) | On live video, filling the caselog, often in a different time zone, under time pressure | The one rule that matters now, in hospital time, with source; silence otherwise; a fast way to ask; a person to call |
| **Guide administrator** (Sevaro clinical operations) | Maintains hospital guides, contacts, mappings | Import, validate, version, review mappings, see staleness |
| **Quality reviewer / auditor** | Reviews closed cases | Which nudges were shown, ignored, acted on; gate history |
| **Hospital liaison** | Hospital-side staff | Publishes operational status (CT down, diversion); keeps contacts current |
| **On-call engineer** | Runs the service | Health, alerts, runbooks, safe rollbacks |

Key journeys:

1. **Stroke case, imaging step.** Doctor arrives at imaging → dock shows this hospital's imaging
   capability. Doctor sets "LVO present = Yes" at 19:30 hospital time → advisory auto-expands:
   outside thrombectomy window, ED provider initiates transfer. Source and status shown.
2. **Sign-off.** Doctor clicks Complete → blocked at the button: "Record the encounter charge."
3. **Question.** Doctor clicks a nudge → chat opens on that rule → "Who mixes the TNK?" → answer
   is time-dependent and stale, with both branches → offers the nursing-in-charge contact.
4. **New hospital.** Admin drops the new hospital's guide and storyboard files → preview →
   activate → the doctor selects it and gets correct nudges, including a conflict.

## 4. Goals, non-goals, success metrics

### Goals

- G-1 Proactive, field-aware nudges for the right field, step and hospital-local time.
- G-2 Grounded answers to typed questions, single-hospital, with source and status.
- G-3 Honest uncertainty: stale, conflicting, missing and time-dependent information shown openly.
- G-4 Adding a hospital or field is a data change.
- G-5 Never in the doctor's way: fast, quiet by default, caselog works if guidance fails.
- G-6 Production-grade platform: persistence, auth, audit, observability, deployability.

### Non-goals

- Voice capture, transcription, auto-filling the caselog.
- Clinical decision support: dosing, diagnosis, scan reading, treatment choice.
- Changing guides from the clinician UI.
- Real Synapse integration, real hospitals or real patient data in this build.
- Challenge 2 (operations command center).

### Success metrics

| Metric | Target | When measured |
|---|---|---|
| Sponsor cases V01–V20, N1–N9 (sponsor wording) | 29/29 | Every PR |
| Unseen-hospital drop test (guide + storyboard) | Pass, no code change | Every PR |
| Field change → visible nudge | p95 ≤ 100 ms; max < 500 ms | Every PR (browser) |
| Pack load at case open | p95 < 1 s | Staging |
| Cross-hospital citations | 0 | Tests and AI evals |
| Info nudges that auto-expand | 0 | Tests |
| WCAG 2.2 AA serious violations (axe) | 0 | Every PR |
| Nudge acted-on / acknowledged rate | Baseline, then trend up | Production |
| Nudge dismiss-without-read rate (fatigue proxy) | Baseline, then trend down | Production |
| Post-case QA corrections for wrong order set, note title, missed charge, wrong escalation | Baseline from QA team, then down | Production |

## 5. Scope at a glance

| Module | Outcome | Architecture |
|---|---|---|
| **M1 Sponsor fidelity** | Judges' new-hospital test passes; sponsor-exact wording; storyboard card; doctor time; "what to do" on every nudge | Current client-only app |
| **M2 Clinician experience** | Floating field-aware dock, field markers, gate at Complete, chat from nudge, contacts; voice/transcript removed | Current client-only app |
| **M3 Rules as data** | Trigger map, value semantics, cascades, gates, full conflict matrix, compiled packs; engine as a package | pnpm workspace; still runs client-only |
| **M4 Production platform** | API, Postgres, auth, audit, live status, observability, CI/CD, deployment | Web + API + DB |
| **M5 AI augmentation** | LLM interpretation of unseen guide fields, storyboard equivalence, question resolution, evals, PHI controls | API-side, behind flags |

---

# Part II — Requirements

IDs are referenced by modules (§25) and tests (§24).

## 6. Functional requirements

### 6.1 Ingestion — FR-ING

| ID | Requirement |
|---|---|
| FR-ING-01 | Import the sponsor guide format (`hospital_guides.json`) and the existing internal JSON/CSV formats. |
| FR-ING-02 | Import the sponsor storyboard format (`storyboard_notes.json`, and CSV) **alone or with guides, in either order**. Match rows to hospitals by `hospital_id`. Never read the `note` column. |
| FR-ING-03 | Import contacts (JSON/CSV) and status snapshots (admin). |
| FR-ING-04 | Multi-file drop: classify each file by shape, preview per-file diagnostics, activate atomically; a contradictory bundle is rejected whole and the active data is untouched. |
| FR-ING-05 | Storyboard rows for a hospital not yet loaded are held in the import session with a diagnostic, not dropped. |
| FR-ING-06 | Every activation creates an immutable version. Open encounters stay pinned to their version until the doctor explicitly refreshes. |
| FR-ING-07 | Unknown field names and unknown columns are preserved and answerable. |
| FR-ING-08 | Input bounds (file size, rows, nesting, value length) and inert rendering of all imported text. |

### 6.2 Rules engine — FR-ENG

| ID | Requirement |
|---|---|
| FR-ENG-01 | Evaluate on step arrival, field focus, field value change and Complete. |
| FR-ENG-02 | Every result carries exactly one primary status: answered, not in guide, time-dependent, stale, conflict, hard stop. Overlapping flags allowed. |
| FR-ENG-03 | All time logic in the hospital's IANA zone; doctor's zone for display. |
| FR-ENG-04 | Stale = last verified more than `stale_after_days` (180) before the encounter reference date, computed every evaluation, for any source. |
| FR-ENG-05 | Hours the guide doesn't define → state what is unknown and give both branches. |
| FR-ENG-06 | Scope branches ("for stroke alerts; … for other consults") resolved by consult type. |
| FR-ENG-07 | Value semantics: affirmative / negative / not applicable / scheduled / conditional / descriptive, from a data lexicon. |
| FR-ENG-08 | Cascades from data: a rule can suppress or replace another. |
| FR-ENG-09 | Gates from data with a release policy per gate: fix-only or acknowledge-with-reason. |
| FR-ENG-10 | Guide / storyboard / live-status merge per the conflict matrix (§15.9). |
| FR-ENG-11 | Live status overlays results for mapped fields; never rewrites guide values. |
| FR-ENG-12 | Priority ranking and an `autoExpand` flag on each result. |
| FR-ENG-13 | Pure and deterministic: same pack + context + event + overlay → same output. Engine version stamped on every result. |

### 6.3 Nudges — FR-NUD

| ID | Requirement |
|---|---|
| FR-NUD-01 | Floating dock bottom-right with hidden / pill / peek / panel states (§16.4). |
| FR-NUD-02 | On field focus, the dock puts that field's guidance first under "For: <field>". |
| FR-NUD-03 | Auto-expand only for critical results (hard stop, advisory, conflict, recorded-value contradiction, live-status alert). Info never interrupts. |
| FR-NUD-04 | Tier marker beside the affected field's label, linking to the dock entry (D1). |
| FR-NUD-05 | Card content: answer · source (hospital, field, version, date) · status · what to do · whether completion is blocked. |
| FR-NUD-06 | Acknowledge an advisory for this encounter; "Why am I seeing this?" shows the trigger. |
| FR-NUD-07 | Hard stops enforced at the Complete button with what is missing and how to resolve. |
| FR-NUD-08 | Silence when nothing applies — no badge, no pop. |
| FR-NUD-09 | "Guidance unavailable" state; the caselog stays fully usable. |
| FR-NUD-10 | "Report a problem with this nudge" → audit event and admin queue. |

### 6.4 Chat — FR-CHAT

| ID | Requirement |
|---|---|
| FR-CHAT-01 | Opens from a nudge (seeded with hospital, field, status, source; 2–3 suggested questions) or from the dock header. |
| FR-CHAT-02 | Answers only from the active hospital and version, with source, status and what to do. |
| FR-CHAT-03 | Missing → exactly "Not available in this hospital's guide." first. |
| FR-CHAT-04 | Time questions (weekday, clock time, relative) evaluated in hospital time; doctor's time also shown when it differs. |
| FR-CHAT-05 | Ambiguous concept → clarification with candidate fields. |
| FR-CHAT-06 | Escalation to contacts offered on not in guide, conflict, interpretation review, live-status alert. |
| FR-CHAT-07 | Typed only. 2,000-character limit. Warning not to include patient identifiers. |

### 6.5 Contacts — FR-CON

| ID | Requirement |
|---|---|
| FR-CON-01 | Roles per hospital: Technical lead, Nursing in charge, Administrator; extensible as data. |
| FR-CON-02 | Availability text parsed with the schedule grammar; "available now" in hospital time. |
| FR-CON-03 | Last-verified date and staleness shown. |
| FR-CON-04 | Missing → "No contact on file for this hospital." Never another hospital's contact. |
| FR-CON-05 | Tap-to-call links and copy. |

### 6.6 Live status — FR-STAT

| ID | Requirement |
|---|---|
| FR-STAT-01 | Adapter interface: mock feed, manual admin entry, signed webhook, optional poller. |
| FR-STAT-02 | Resource → guide-field mapping as data. |
| FR-STAT-03 | Push to open encounters (SSE) without reload. |
| FR-STAT-04 | Time-to-live per report; expired → "not current". No report → "No live status reported", never "operational". |
| FR-STAT-05 | Hospital-wide states (diversion, internal disaster) → header banner and advisory. |

### 6.7 Encounter context — FR-CTX

| ID | Requirement |
|---|---|
| FR-CTX-01 | Header: hospital name and ID; hospital-local time and zone; doctor's time and zone; consult and encounter type; guide version and load state; live status. |
| FR-CTX-02 | Storyboard card at the top of the caselog, rows marked where they disagree with the guide. |
| FR-CTX-03 | Encounter-context adapter compatible with `encounter_context_example.json` (Synapse seam). |

### 6.8 Administration — FR-ADM

| ID | Requirement |
|---|---|
| FR-ADM-01 | Hospitals and versions: list, diff, activate, retire, staleness summary. |
| FR-ADM-02 | Import (FR-ING). |
| FR-ADM-03 | Bindings: view per hospital; add a binding for an unseen field through a form (data change); review LLM proposals (M5). |
| FR-ADM-04 | Trigger map editor, versioned, with validation. |
| FR-ADM-05 | Contacts editor. |
| FR-ADM-06 | Live status console. |
| FR-ADM-07 | Audit viewer with filters and CSV export. |
| FR-ADM-08 | Evaluation workbench (sponsor cases, holdout, eval reports). |
| FR-ADM-09 | Demo tools: clock override, scenario launcher (admin only). |

### 6.9 Audit — FR-AUD

| ID | Requirement |
|---|---|
| FR-AUD-01 | Record nudge shown, peeked, expanded, acknowledged, ignored, acted on, reported; gates hit and resolved; chat metadata; imports; approvals; status changes; admin actions. |
| FR-AUD-02 | Append-only; no free text or PHI; allowlisted metadata keys. |
| FR-AUD-03 | Quality metrics derived from audit (§22.3). |

### 6.10 Identity and access — FR-AUTH

| ID | Requirement |
|---|---|
| FR-AUTH-01 | OIDC single sign-on. |
| FR-AUTH-02 | Roles: clinician, guide_admin, auditor, ops. |
| FR-AUTH-03 | Hospital scoping on every read. |
| FR-AUTH-04 | Idle session timeout (default 15 minutes); re-auth for admin actions. |

### 6.11 AI — FR-AI

| ID | Requirement |
|---|---|
| FR-AI-01 | Ingest interpreter proposes bindings and value semantics for unbound fields. |
| FR-AI-02 | Equivalence judge for guide-vs-storyboard pairs the deterministic comparison can't settle. |
| FR-AI-03 | Question resolver maps unresolved questions to guide fields, time and scope. |
| FR-AI-04 | Per-capability kill switches; full functionality with all AI off. |
| FR-AI-05 | Offline eval suite with release thresholds. |

## 7. Non-functional requirements

| ID | Requirement | Target |
|---|---|---|
| NFR-01 | Field change → nudge painted | p95 ≤ 100 ms; max < 500 ms |
| NFR-02 | Pack load at case open | p95 < 1 s; cached thereafter |
| NFR-03 | Caselog availability | Unaffected by any companion failure |
| NFR-04 | API availability (production) | 99.9% monthly |
| NFR-05 | Offline standalone mode | Full engine, import, nudges and chat (deterministic) without network |
| NFR-06 | Accessibility | WCAG 2.2 AA; keyboard-only; screen reader |
| NFR-07 | Responsive | 390 px and up, no horizontal scroll |
| NFR-08 | Security | OWASP ASVS level 2 controls |
| NFR-09 | Privacy | HIPAA Security Rule controls in place before any PHI (§21) |
| NFR-10 | Auditability | Append-only audit; retention default 6 years, confirm with compliance |
| NFR-11 | Data, not code | No hospital or guide-field name in engine code (enforced by test) |
| NFR-12 | Determinism | Engine pure; snapshot-tested |
| NFR-13 | Bundle budget | Initial JS ≤ 250 KB gzip (today ≈ 180 KB) |
| NFR-14 | Browsers | Latest two versions of Chrome, Edge, Safari, Firefox |
| NFR-15 | Language | English; times formatted for locale |
| NFR-16 | Maintainability | TypeScript strict; lint clean; engine line coverage ≥ 90% |
| NFR-17 | AI latency (when enabled) | Question resolution p95 < 6 s, with deterministic answer shown first |

## 8. Traceability to the handbook

| Handbook item | Requirements | Module | Tests |
|---|---|---|---|
| Issue 1 — every hospital is different | FR-CHAT-02, FR-CON-04, GR-08 | M1, M3 | Cross-hospital isolation suite |
| Issue 2 — when a rule is needed | FR-ENG-01, FR-ADM-04, NFR-11 | M3 | Trigger-map parity snapshot |
| Issue 3 — knowing when to stay quiet | FR-NUD-03, FR-NUD-08, GR-14 | M2 | N8; info-never-expands |
| Issue 4 — hospital local time | FR-ENG-03, FR-CTX-01 | M1 | N2, V06, V09, V17; DST property tests |
| Issue 5 — times written in words | FR-ENG-05, FR-ENG-07 | M3 | Schedule grammar suite; unseen phrasings |
| Issue 6 — information that isn't there | FR-CHAT-03, GR-09 | M1 | V14, V20 exact phrase |
| Issue 7 — out of date | FR-ENG-04 | M1, M3 | V13, V18; storyboard staleness |
| Issue 8 — two sources disagree | FR-ING-02, FR-ENG-10, FR-CTX-02 | M1, M3 | V12; conflict matrix suite |
| Issue 9 — rules that leave something out | FR-ENG-05 | M3 | V08, V18 |
| Issue 10 — when to block | FR-ENG-09, FR-NUD-07 | M2, M3 | N5, N7, V10; gate policy suite |
| Issue 11 — one rule switches another off | FR-ENG-07, FR-ENG-08 | M3 | N4, V07; negative-in-words suite |
| Issue 12 — new hospitals and fields | FR-ING, FR-ADM-03, FR-AI-01 | M1, M3, M5 | Unseen-hospital drop test |
| Issue 13 — guide can't be reached | FR-NUD-09, NFR-03 | M2, M4 | Outage e2e |
| Six statuses | FR-ENG-02 | M1 | Status suite |
| Fast / never in the way / read-only / data not code | NFR-01, NFR-03, GR-03, NFR-11 | All | Latency, outage, grep test |
| Brief asks 1 — nudges N1–N9 incl. N8 silence | FR-NUD | M2 | Sponsor oracle |
| Brief asks 2 — answers V01–V20 | FR-CHAT | M1 | Sponsor oracle |
| Brief asks 3 — local time incl. doctor elsewhere | FR-ENG-03, FR-CTX-01 | M1 | V17 |
| Brief asks 4 — stale/conflict/missing shown openly | FR-ENG-02/04/10 | M1, M3 | Status and conflict suites |
| Brief asks 5 — new hospital during demo | FR-ING, FR-ADM | M1 | Drop test |
| Going further — record of nudges | FR-AUD | M4 | Audit suite |
| Going further — fitting into Synapse | FR-CTX-03, §19 | M4 | Adapter contract tests |
| Going further — quality, keeping current, safety, privacy, cost | §22.3, FR-ADM-01, FR-NUD-10, §21, §18.8 | M4, M5 | Dashboards, reviews |

---

# Part III — Current state

## 9. Baseline

**Stack today:** React 19, TypeScript 5.9, Vite 7, Zod 4, `@js-temporal/polyfill`, Papa Parse;
Vitest 3, Playwright 1.56; pnpm 11; Node 24. Static site on Netlify. Browser-only: no backend, no
auth; persistence in `localStorage` (`src/data.ts`, key `encounter-guide:v1`). CI:
`.github/workflows/verify.yml`.

**Keep:**

| Asset | Where | Why |
|---|---|---|
| Deterministic engine | `src/engine.ts` | Passes all 29 sponsor cases; hospital-scoped; status logic |
| Time and schedules | `src/time.ts` | Temporal, IANA zones, schedule grammar, staleness, DST handling |
| Concept resolution | `src/knowledge.ts` | Labels, aliases, interpretation diagnostics |
| Domain contracts | `src/domain.ts` | Zod schemas, context, events, registry, tri-state predicates |
| Importer | `src/imports.ts` | Bounded, atomic, versioned, preserves originals |
| Encounter adapter | `src/adapter.ts` | Validates the sponsor encounter envelope |
| Tests | `tests/` | 110 unit + 19 Playwright; sponsor oracle in `src/fixtures.ts` |
| Holdout data | `data/holdout/unfamiliar-hospitals.json` | 4 small unseen hospitals (4–5 fields each) |

**Remove from the clinician UI (user decision):** voice copilot (`src/VoiceCopilot.tsx`,
`src/voice.ts`, `src/useMicrophone.ts`, `docs/VOICE_WORKFLOW.md`, `tests/voice.test.ts`,
`tests/e2e/voice.spec.ts`); transcript drafts (`src/transcript.ts`, `src/TranscriptReview.tsx`,
`tests/transcript.test.ts`). Move "Demo controls & scenario launcher" to admin.

**Supersede:** inline-above-field guidance (commit `968fca4`) → floating dock (M2).

## 10. Verified gaps

All gaps from the build prompt were re-checked against the code on 2026-10-10.

| ID | Gap | Evidence | Severity | Module |
|---|---|---|---|---|
| G1 | Sponsor `storyboard_notes.json` cannot be imported; guide import attaches no storyboard | `src/imports.ts:111` throws `Row 1: field and text value required.`; reproduced: storyboard import → 0 hospitals; guide import → 0 storyboard sources. Kit storyboard exists only in `src/data/seeds.json` | **Critical** — fails judges' test | M1 |
| G2 | "Not in guide" wording diverges from sponsor; oracle edited to match | `src/engine.ts:68`; `src/fixtures.ts:196–198`, `:254–256` (V14, V20). Sponsor: "Not available in this hospital's guide." | **High** | M1 |
| G3 | Trigger map hard-coded | `evaluate()` from `src/engine.ts:352` calls `add("<Guide Field>", …)` for 14 guide fields | High | M3 |
| G4 | Unseen fields never nudged without hand-written `mappings` | Only data path: `src/engine.ts:488`; `mappingSchema` (`src/domain.ts`) allows info/advisory only, no cascades or gates | High | M3, M5 |
| G5 | Cascades/gates/phrasing hard-coded | `src/engine.ts:113` (Order Entry), `:121–135` (LVO phrasing), `:145` (staffed hours), `:184` (negation), `:247–248` (Charge Entry `^Yes`, completion-rule regex) | High | M3 |
| G6 | No storyboard card | Storyboard only rendered as evidence (`src/main.tsx:101`) | Medium | M1 |
| G7 | Doctor's time not shown | `providerZone` in `src/domain.ts:34`; header shows hospital clock only (`src/main.tsx:884`) | Medium | M1 |
| G8 | Storyboard freshness undefined | SYN-002 storyboard updated 2025-09-14 = 184 days before 2026-03-17; `docs/DECISIONS.md` #4 | Medium | M1 (D6) |
| G9 | No contacts | 33 distinct guide field names; none are contacts | Medium | M2 |
| G10 | No live status | — | Medium | M4 |
| G11 | No backend, auth, server audit | `package.json` has no server dependencies; `src/data.ts:12,27` localStorage | High (production) | M4 |
| G12 | No "what to do" on nudges | `Result` (`src/domain.ts:119`) has no action field; `Card` renders `message` only | Medium | M1 |
| G13 | Hard-stop release differs from handbook | Handbook: blocks "until the doctor fixes it or acknowledges it". `complete()` (`src/main.tsx:643`) re-runs `gates()`; acknowledgement only hides cards (`:331`, `:369`) | Medium | M2, M3 (D13) |
| N1 (new) | Clinician, admin and evaluation UI in one file | `src/main.tsx` is 1,841 lines | Medium | M2 |
| N2 (new) | Sponsor storyboard `note` column contains answer hints | e.g. "Disagrees with the on-call guide for stroke alerts" | Guardrail | M1 |
| N3 (new) | Holdout hospitals too small to represent the judges' file | 4–5 fields each vs 21–25 in the kit | Test gap | M1 |

---

# Part IV — Solution design

## 11. Architecture

### 11.1 Principles

1. **One engine, two modes.** The same pure TypeScript engine runs in the browser (standalone and
   connected) and on the server (compile, ask). Behaviour is identical by construction.
2. **Compile once, evaluate locally.** Hospital data compiles into an immutable pack when imported;
   the client loads it at case open and evaluates every field event locally. This is how NFR-01
   and the handbook's "load at open, not per field" hold.
3. **Deterministic on the hot path.** No network or LLM between a field change and a nudge.
4. **Sources are never merged silently.** Guide, storyboard and live status stay separate records;
   the engine decides what to show per the conflict matrix.
5. **Data, not code.** Triggers, cascades, gates, value lexicon and status mappings are versioned
   data.
6. **Fail open for the doctor, closed for data.** Guidance failures never block the caselog;
   invalid imports never activate.

### 11.2 System context

```
                 ┌───────────────────────────── Synapse (future host) ─────────────────────────────┐
                 │  Video call │ Caselog ── encounter events (step, field, value, Complete) ──┐     │
                 └──────────────────────────────────────────────────────────────────────────┼─────┘
                                                                                            ▼
 Teleneurologist ──► EncounterGuide Web (caselog stand-in + dock + chat + contacts) ◄── pack, status (SSE)
                                │                 ▲
                         audit, ask│                 │ packs, contacts, status
                                ▼                 │
 Guide admin ─────────► EncounterGuide API ───────┴───► PostgreSQL · object storage
 Auditor ─────────────►      │         │
                             │         └────► LLM provider (ingest interpretation, equivalence, question resolution)
 Hospital status systems ──► │  (signed webhook / poller / manual)
 Identity provider (OIDC) ◄──┘
```

### 11.3 Containers

| Container | Responsibility | Tech |
|---|---|---|
| `apps/web` | Clinician app (`/encounter`) and admin app (`/admin`); runs engine locally; caches packs in IndexedDB | React, Vite |
| `apps/api` | Auth (BFF), imports, compile, packs, contacts, status (webhook + SSE), ask, audit, admin | Node, Fastify |
| `packages/engine` | Pure rules engine, time, value semantics, comparison, compile | TypeScript |
| `packages/contracts` | Zod schemas shared by web, API and engine | TypeScript, Zod |
| PostgreSQL | Versions, sources, packs, bindings, contacts, status, audit, users | PostgreSQL 16+ |
| Object storage | Original uploads, immutable, checksummed | S3-compatible |
| LLM provider | AI components (M5) | Anthropic API, `claude-opus-5-5` |

### 11.4 Runtime modes

| | Standalone (hackathon demo, offline) | Connected (production) |
|---|---|---|
| Hospital data | Seeds + local import, compiled in browser | Packs from API, cached in IndexedDB |
| Persistence | IndexedDB (replaces localStorage in M3) | PostgreSQL |
| Auth | None (demo banner) | OIDC |
| Audit | Local, exportable | Server, append-only |
| Live status | Mock feed + manual (local) | SSE from API |
| AI | Off | Behind flags (M5) |
| Selection | `VITE_MODE=standalone` | `VITE_MODE=connected` + `VITE_API_URL` |

Both modes run the same web build and the same e2e suite.

### 11.5 Key sequences

**Case open**

```
Doctor selects hospital ─► web: load pack(hospital, active version) ─► IndexedDB hit? use : GET /packs (ETag)
                          ─► open SSE /status/stream?hospitalId ─► evaluate(event=encounter_opened) ─► dock
                          ─► audit: encounter_opened, pack_id, latency
```

**Field focus → field change**

```
focus(field) ─► evaluate(field_focused) ─► dock: "For: <field>" first; peek (info) or expand (critical)
change(field,value) ─► reduceEvent ─► evaluate(field_changed) ─► rank ─► autoExpand? ─► paint (≤100 ms p95)
                     ─► audit batch (nudge_shown/expanded, ids only)
```

**Complete**

```
Complete ─► evaluate(completion_requested) ─► gates ─► blocked? banner at button (fix / acknowledge-with-reason)
                                                  └─► audit gate_hit / gate_resolved / gate_acknowledged
```

**Ask**

```
question ─► deterministic resolver (knowledge.ts) ─► resolved? engine.answer ─► card (≤300 ms)
                                                └─► unresolved & AI on ─► POST /ask ─► LLM resolver (fields, time, scope)
                                                       ─► validate ids ∈ pack ─► engine.answer ─► card
```

**Import**

```
files ─► classify ─► parse/validate ─► diff vs active ─► preview ─► activate (txn):
         store uploads ─► new version ─► compile pack ─► [M5: interpreter proposals] ─► publish
```

**Status update**

```
webhook (HMAC) / poller / admin ─► validate ─► status_reports ─► SSE fan-out ─► client overlay ─► re-evaluate
```

## 12. Technology stack

| Concern | Choice | Rationale |
|---|---|---|
| Language | TypeScript (strict) everywhere | One engine shared by web and API |
| Web | React 19 + Vite 7 (existing) | No migration cost |
| Web state | Existing `reduceEvent` in a React context; TanStack Query for API data (connected mode) | Keep the single state-transition function; no new global store needed |
| Styling | CSS custom-property tokens + component CSS files (split from `workspace.css`/`style.css`) | Existing look; smaller files |
| Time | `@js-temporal/polyfill` (existing) | Correct IANA/DST behaviour |
| Validation | Zod 4 (existing) | Shared contracts |
| API | Fastify (current major) + Zod type provider | Fast, schema-first |
| DB access | Drizzle ORM + drizzle-kit migrations | Type-safe SQL, plain migrations |
| DB | PostgreSQL 16+ | Transactions, JSONB, row-level security option |
| Realtime | Server-Sent Events | One-way push, proxies well, simple reconnection |
| Auth | OIDC via backend-for-frontend; httpOnly session cookie | Tokens never in browser JS |
| Offline cache | IndexedDB (`idb-keyval` or similar) | Packs exceed localStorage comfort |
| LLM | `@anthropic-ai/sdk`, model `claude-opus-5-5` | §18 |
| Testing | Vitest, Playwright, `@axe-core/playwright`, `fast-check` (property tests), Fastify inject | Existing + gaps |
| Observability | OpenTelemetry, structured JSON logs (pino) | Vendor-neutral |
| CI/CD | GitHub Actions (existing) | Existing |
| Packaging | Docker images for API; static web build | Portable hosting |
| Hosting | Demo: Netlify (static, existing). Production: HIPAA-eligible cloud with a BAA (D9) | PHI requires it |

## 13. Repository structure

Target after M3/M4 (pnpm workspace):

```
sevaro-encounter-guide/
├─ apps/
│  ├─ web/
│  │  ├─ src/
│  │  │  ├─ app/            AppShell, routes, providers (Encounter, Pack, Status, Auth)
│  │  │  ├─ encounter/      ContextHeader, StoryboardCard, Caselog, Stepper, FieldRow, CompleteBar
│  │  │  ├─ guidance/       NudgeDock, DockPill, DockPeek, DockPanel, NudgeCard, ReferenceRow, FieldMarker, dockMachine.ts
│  │  │  ├─ chat/           ChatPanel, AnswerCard, SuggestedQuestions, Composer
│  │  │  ├─ contacts/       ContactsSheet, ContactCard
│  │  │  ├─ admin/          Hospitals, Import, Bindings, TriggerMap, Contacts, StatusConsole, Audit, Evaluation, DemoTools
│  │  │  ├─ data/           packStore (IndexedDB), apiClient, standalone seeds
│  │  │  └─ styles/         tokens.css, base.css
│  │  └─ tests/e2e/
│  └─ api/
│     ├─ src/
│     │  ├─ routes/         hospitals, packs, imports, contacts, status, ask, audit, admin, auth, health
│     │  ├─ services/       importService, compileService, statusService, askService, auditService
│     │  ├─ adapters/       status/{mock,webhook,poller}, llm/{client,interpreter,equivalence,resolver}
│     │  ├─ db/             schema.ts, migrations/
│     │  └─ plugins/        auth, rbac, rateLimit, problem, telemetry
│     └─ tests/
├─ packages/
│  ├─ contracts/            guide, storyboard, contacts, status, triggerMap, pack, result, answer, audit, encounter
│  └─ engine/               evaluate, answer, gates, compare, semantics, schedule (time), compile, rank
│     └─ data/              trigger-map.v1.json, value-lexicon.v1.json, status-resource-map.v1.json, field-aliases.v1.json
├─ data/                    official/, holdout/, fixtures/ (new unseen hospital), seeds/
├─ docs/                    PRODUCTION_PLAN.md, ADRs/, runbooks/, DATA_CONTRACT.md, ...
├─ .github/workflows/       ci.yml, nightly-evals.yml, deploy.yml
└─ docker/                  compose.yml (postgres, api, web), api.Dockerfile
```

## 14. Data model and contracts

### 14.1 Input formats

**Guide (sponsor):**

```json
{ "encounter_reference_date": "2026-03-17", "stale_after_days": 180,
  "hospitals": [{ "hospital_id": "SYN-006", "hospital_name": "Highland Valley Hospital",
                  "local_timezone": "America/Chicago",
                  "fields": [{ "field": "LVO Protocol", "value": "Thrombectomy capable Mon-Fri 0700-1900. …",
                               "last_verified": "2026-02-02" }] }] }
```

**Storyboard (sponsor):** per-hospital, per-field card shown at the top of the caselog — not a case
summary.

```json
[{ "hospital_id": "SYN-002", "field": "Video Eval Location", "storyboard_value": "Patient room",
   "storyboard_updated": "2025-09-14", "note": "ignored by the engine" }]
```

Accepted aliases: `value` ↔ `storyboard_value`; `updated`/`updated_at` ↔ `storyboard_updated`;
`hospitalId` ↔ `hospital_id`. CSV with the same headers.

**Contacts (new):**

```json
{ "contacts": [{ "hospital_id": "SYN-006", "role": "nursing_in_charge", "name": "Jordan Reyes (synthetic)",
                 "title": "ED charge nurse", "phone": "+1-555-0142", "alt_channel": "Unit radio ext 42",
                 "availability": "24/7", "last_verified": "2026-02-02", "source": "Synthetic directory" }] }
```

**Status report (new):**

```json
{ "hospital_id": "SYN-006", "resource": "ct_scanner", "state": "down",
  "message": "CT 1 offline for maintenance", "reported_at": "2026-03-17T20:05:00Z",
  "expires_at": "2026-03-18T00:05:00Z", "source": "mock-feed" }
```

### 14.2 Shared contracts (`packages/contracts`, Zod sketches)

```ts
export const Status = z.enum(["answered","not_in_guide","time_dependent","stale","conflict","hard_stop"]);
export const Tier = z.enum(["info","advisory","hard_stop"]);
export const SourceKind = z.enum(["guide","storyboard","status","contact"]);

export const SourceRecord = z.object({
  id: z.string(), hospitalId: z.string(), versionId: z.string(),
  field: z.string(), raw: z.string().max(12000), kind: SourceKind,
  lastVerified: z.string().date().optional(),      // guide, contact
  updatedAt: z.string().date().optional(),          // storyboard
  uploadId: z.string(), locator: z.string().optional(),
  extra: z.record(z.string(), z.unknown()).default({}),   // preserved unknown keys (never read: storyboard `note`)
});

export const ValueSemantics = z.object({
  kind: z.enum(["affirmative","negative","not_applicable","scheduled","conditional","descriptive"]),
  windows: z.array(z.object({ days: z.array(z.number().int().min(1).max(7)), start: z.string(), end: z.string() })).optional(),
  branches: z.array(z.object({ when: z.string(), text: z.string() })).optional(),   // e.g. during/outside coverage, scope
  undefinedHours: z.boolean().default(false),
  confidence: z.number().min(0).max(1),
  origin: z.enum(["deterministic","llm","admin"]),
  review: z.enum(["none","needed","approved"]).default("none"),
});

export const TriggerRule = z.object({
  id: z.string(),
  step: z.enum(["intake","history","imaging","recommendation","note","sign_off","rounding"]),
  when: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("step_arrival") }),
    z.object({ kind: z.literal("field_focus"), fieldId: z.string() }),
    z.object({ kind: z.literal("field_value"), fieldId: z.string(), condition: Predicate }),
    z.object({ kind: z.literal("action"), action: z.literal("complete") }),
  ]),
  scope: z.object({ consultTypes: z.array(z.string()).optional(), encounterTypes: z.array(z.string()).optional() }).default({}),
  guideFields: z.array(z.string()).min(1),          // canonical names; aliases resolved at compile
  anchorFieldId: z.string().optional(),              // caselog field the result belongs to
  tier: Tier,
  promoteTo: z.object({ tier: Tier, when: Predicate }).optional(),
  until: Predicate.optional(),                       // stop showing (e.g. thrombolytic_given = true)
  suppressWhen: z.array(z.object({ guideField: z.string(), meaning: z.enum(["negative","not_applicable"]),
                                   replaceWith: z.string().optional() })).default([]),
  gate: z.object({ requires: z.string(), when: z.enum(["affirmative","pattern"]), pattern: z.string().optional(),
                   release: z.enum(["fix_only","acknowledge_with_reason"]) }).optional(),
  announceAbsent: z.object({ untilFieldsRecorded: z.array(z.string()) }).optional(),   // CTA/LVO "not documented" (D4)
  evaluateAtLocalTime: z.boolean().default(false),
  priority: z.number().int().min(0).max(30).default(0),
  action: z.string().optional(),                     // "what to do" template
  suggestedQuestions: z.array(z.string()).max(3).default([]),
  origin: z.enum(["sponsor_map","decision","admin","llm"]),
});

export const Comparison = z.object({
  field: z.string(), scope: z.string().optional(),
  guideSourceId: z.string(), storyboardSourceIds: z.array(z.string()),
  verdict: z.enum(["agree","disagree","uncertain"]),
  method: z.enum(["normalized","lexicon","llm","admin"]), rationale: z.string().max(500),
});

export const Contact = z.object({
  id: z.string(), hospitalId: z.string(), role: z.string(), name: z.string(), title: z.string().optional(),
  phone: z.string(), altChannel: z.string().optional(), availability: z.string().optional(),
  lastVerified: z.string().date().optional(), source: z.string(),
});

export const StatusReport = z.object({
  id: z.string(), hospitalId: z.string(), resource: z.string(),
  state: z.enum(["operational","degraded","down","diverting","unknown"]),
  message: z.string().max(500).optional(), reportedAt: z.string().datetime(), expiresAt: z.string().datetime(),
  source: z.string(),
});

export const CompiledPack = z.object({
  packId: z.string(), hospitalId: z.string(), hospitalName: z.string(), timezone: z.string(),
  versionId: z.string(), versionLabel: z.string(),
  referenceDate: z.string().date(), staleAfterDays: z.number().int(),
  engineVersion: z.string(), triggerMapVersion: z.string(), lexiconVersion: z.string(),
  sources: z.array(SourceRecord),
  semantics: z.record(z.string(), ValueSemantics),
  comparisons: z.array(Comparison),
  bindings: z.array(TriggerRule),                    // trigger map resolved for this hospital
  unboundFields: z.array(z.string()),                // answerable, never nudged
  contacts: z.array(Contact),
  diagnostics: z.array(z.object({ level: z.enum(["info","warn","error"]), code: z.string(), message: z.string(), field: z.string().optional() })),
  compiledAt: z.string().datetime(), checksum: z.string(),
});

export const Result = z.object({
  id: z.string(), hospitalId: z.string(), packId: z.string(),
  title: z.string(), answer: z.string(), action: z.string(),          // G12: "what to do"
  status: Status, flags: z.array(z.string()), tier: Tier,
  citations: z.array(z.string()),                    // SourceRecord ids, all in pack
  missing: z.object({ field: z.string(), absent: z.boolean() }).optional(),
  anchorFieldId: z.string().optional(), triggerId: z.string(),       // "Why am I seeing this?"
  blocksCompletion: z.boolean(), release: z.enum(["fix_only","acknowledge_with_reason"]).optional(),
  missingRequirements: z.array(z.string()),
  priority: z.number(), autoExpand: z.boolean(),
  liveStatus: z.array(z.string()).default([]),       // StatusReport ids
  effectiveInstant: z.string(), effectiveLocal: z.string(), providerLocal: z.string().optional(),
  engineVersion: z.string(),
});

export const Answer = Result.extend({
  question: z.literal(undefined).optional(),         // never echoed or stored server-side
  resolution: z.object({ fields: z.array(z.string()), method: z.enum(["deterministic","llm"]), clarification: z.string().optional() }),
  escalate: z.boolean(),
});

export const AuditEvent = z.object({
  id: z.string(), ts: z.string().datetime(), actorId: z.string(), role: z.string(),
  type: z.enum(["encounter_opened","nudge_shown","nudge_peeked","nudge_expanded","nudge_acknowledged",
                "nudge_ignored","nudge_acted","nudge_reported","gate_hit","gate_resolved","gate_acknowledged",
                "chat_asked","chat_escalated","contact_used","import_previewed","import_activated",
                "binding_approved","binding_rejected","status_received","admin_change","pack_refreshed"]),
  encounterId: z.string().optional(), hospitalId: z.string().optional(), packId: z.string().optional(),
  resultId: z.string().optional(), triggerId: z.string().optional(), fieldId: z.string().optional(),
  status: Status.optional(), tier: Tier.optional(), latencyMs: z.number().optional(),
  meta: z.record(z.enum(["reasonCode","resolutionMethod","fileKind","count","version","source"]), z.string()).default({}),
});
```

### 14.3 Database schema (PostgreSQL)

| Table | Key columns | Notes |
|---|---|---|
| `users` | id, oidc_sub (unique), display_name, roles text[], hospital_scope text[], created_at | Scope `*` = all |
| `hospitals` | id (e.g. SYN-006), name, timezone, created_at | |
| `uploads` | id, kind (guide/storyboard/contacts/status/trigger_map), filename, sha256, size, object_key, uploaded_by, created_at | Immutable |
| `guide_versions` | id, hospital_id, label, state (draft/active/retired), reference_date, stale_after_days, created_by, activated_at, checksum | One active per hospital |
| `source_records` | id, version_id, hospital_id, field, raw, kind, last_verified, updated_at, upload_id, locator, extra jsonb | Index (version_id, field) |
| `semantics` | version_id, field, semantics jsonb, origin, review, reviewer, reviewed_at | |
| `comparisons` | version_id, field, scope, verdict, method, rationale | |
| `trigger_maps` | id, version, rules jsonb, state, created_by, created_at | Global, versioned |
| `bindings` | id, version_id, rule jsonb, origin (sponsor_map/admin/llm), state (active/proposed/rejected), confidence, reviewer | Hospital-specific additions |
| `mapping_proposals` | id, version_id, field, proposal jsonb, model, prompt_version, confidence, state, reviewer, decided_at | M5 |
| `packs` | id, hospital_id, version_id, trigger_map_id, engine_version, compiled jsonb, checksum, compiled_at | Immutable |
| `contacts` | id, hospital_id, role, name, title, phone, alt_channel, availability, last_verified, source, upload_id, active | |
| `status_reports` | id, hospital_id, resource, state, message, reported_at, received_at, expires_at, source, signature_ok | Index (hospital_id, resource, reported_at desc) |
| `status_resource_map` | resource, guide_fields text[], version | Data |
| `encounters` | id, hospital_id, pack_id, consult_type, encounter_type, opened_by, opened_at, closed_at, completed | **No caselog values, no patient identifiers** |
| `audit_events` | id, ts, actor_id, role, type, encounter_id, hospital_id, pack_id, result_id, trigger_id, field_id, status, tier, latency_ms, meta jsonb, prev_hash, hash | INSERT-only DB role; hash chain |
| `feature_flags` | key, enabled, scope, updated_by, updated_at | AI kill switches |

## 15. Rules engine

### 15.1 Pipeline

`evaluate(pack, context, event, overlay) → Result[]` — pure.

1. **Guard:** `context.hospitalId === pack.hospitalId` and version matches; else throw (never
   evaluate another hospital's pack).
2. **Select rules:** bindings where step matches, scope matches consult/encounter type, trigger
   kind matches the event (arrival rules apply on every event at that step — state-based), and the
   predicate holds (tri-state; unknown never satisfies).
3. **Resolve sources** per guide field (canonical name or alias), hospital-scoped only.
4. **Absent field:** `not_in_guide`; dropped from proactive output unless `announceAbsent` and the
   listed fields are still unrecorded (D4). Always answerable through chat.
5. **Interpret** using pack semantics: evaluate schedules at the hospital-local instant; pick scope
   branch by consult type; mark `undefinedHours` → both branches + `schedule_unknown`.
6. **Freshness:** stale flag per source (guide `last_verified`; storyboard `updated_at` per D6).
7. **Compare** with storyboard per pack comparisons → conflict handling (§15.9).
8. **Cascades:** apply `suppressWhen` (e.g. Order Entry negative → hide Order Set Name, show
   "Hospital provider places orders").
9. **Promotion / until:** recorded value promotes tier; `until` predicate removes the rule.
10. **Gates** (on Complete): build hard stops from `gate`; respect release policy and uncertainty
    policy (D5).
11. **Live-status overlay:** attach unexpired reports for mapped fields; flag alerts.
12. **Status selection** (§15.2), **action text** (§15.6), **priority and autoExpand** (§15.3).
13. **Dedupe** by (hospital, version, guide field), keeping the highest-priority form.
14. Return results with `engineVersion` and evaluation time.

### 15.2 Status selection

Primary status precedence: `hard_stop` › `conflict` › `time_dependent` › `stale` › `answered`;
`not_in_guide` when the field is absent. Secondary conditions remain as flags. Existing nuances
are preserved and pinned by the sponsor oracle: V18 is `time_dependent` with a `stale` flag (hours
undefined); V13 is `stale` (schedule evaluable and satisfied); V04 is `not_in_guide` with stale
evidence.

### 15.3 Priority and auto-expand

`priority = tierBase + boosts + rule.priority`

| Component | Value |
|---|---|
| tierBase | hard_stop 100 · advisory 50 · info 10 |
| Recorded value contradicts guide capability | +30 |
| Live-status alert on a field in play | +25 |
| Conflict | +20 |
| Rule priority (data, 0–30) | e.g. LVO protocol with recorded LVO +20 |

Card when `priority ≥ 50`; compact row otherwise. `autoExpand = priority ≥ 50 && (new or changed
since last evaluation)`. Info never auto-expands (GR-14).

### 15.4 Time

Hospital-local evaluation with Temporal. Conventions kept from the prototype: start inclusive,
end exclusive; overnight windows belong to their starting day; ambiguous or nonexistent DST times
are rejected, not coerced. Provider time computed for display only. Property tests across DST
transitions in every zone used by the kit and holdout data.

### 15.5 Value semantics lexicon

Data file `value-lexicon.v1.json`, ordered patterns → kind:

| Kind | Examples |
|---|---|
| negative | `No`, `None`, `Not available`, `Not thrombectomy capable`, `No (medication )?orders entered by teleneurologist`, `continuous EEG unavailable` (partial) |
| not_applicable | `Not applicable`, `N/A`, `Hospital provider uses local …` (as replacement text) |
| affirmative | `Yes`, `Yes - …`, `24/7`, `permitted` |
| scheduled | Any parsed window (`Mon-Fri 0700-1900`, `Daily 0600-2300; overnight on-call`) |
| conditional | Text with branches (`During coverage … Outside coverage …`, `for stroke alerts; … for other consults`) |
| descriptive | Everything else (names, procedures) |

Unknown or low-confidence → `descriptive` + `review: needed`; such fields still answer in chat but
cannot drive cascades or gates.

### 15.6 "What to do" text

From the rule's `action` template when present, else derived:

| Status / tier | Default action |
|---|---|
| hard_stop | "Record <requirement> before completing." or "Confirm <requirement>, or acknowledge with a reason." |
| advisory (directive guide text) | The guide's own directive sentence for the applicable branch |
| info | "For reference — no action needed." |
| conflict | "Sources disagree. Confirm with the hospital which applies." (+ contacts) |
| not_in_guide | "Not in this hospital's guide. Confirm locally." (+ contacts) |
| time_dependent with unknown hours | "Coverage hours aren't in the guide. Confirm which applies now." (+ contacts) |
| stale | Append "Last verified <date> — may be out of date." |

### 15.7 Gates

| Gate (kit) | Trigger | Release (recommended, D13) |
|---|---|---|
| Charge Entry semantics affirmative | Complete with `charge_entered ≠ true` | fix_only |
| Consult Completion Rule present with "do not complete … until … confirms" | Complete with `plan_confirmed ≠ true` | acknowledge_with_reason |

Gate under uncertainty (conflict, stale, interpretation review): no silent block, no silent
release — advisory at the Complete button requiring acknowledgement that names both values (D5).
Acknowledgements go to audit with a reason code.

### 15.8 Unseen fields

1. Normalize the field name (case, punctuation, `&`/`and`, slashes) and match the alias table
   (`field-aliases.v1.json`, e.g. `CTA head and neck` → `CTA Head/Neck`). Matched → inherits the
   standard binding.
2. Unmatched → `unboundFields`: answerable in chat with source and status; listed in admin.
3. Admin can add a binding through a form → new pack version (data change, no deploy).
4. M5: LLM proposals (info may auto-activate per D7; advisory needs approval; never hard stop).

### 15.9 Conflict and merge matrix (final)

| # | Situation | Status | Doctor sees | Contacts offered |
|---|---|---|---|---|
| C1 | Guide only | per guide | Guide value | On not-in-guide/unknown hours |
| C2 | Guide = storyboard (normalized or lexicon or LLM "agree") | guide's | Guide value; evidence "Storyboard agrees" | No |
| C3 | Guide ≠ storyboard | conflict | Both values, each with source and date; no precedence | Yes |
| C4 | Equivalence uncertain | conflict + `possible` flag | Both values, labelled "may differ — confirm" | Yes |
| C5 | Guide has scope branches | compare applicable branch only | SYN-002 stroke → C3; SYN-002 General Neuro → C2 | per result |
| C6 | Storyboard only | not_in_guide | "Not available in this hospital's guide." + storyboard value labelled "Storyboard only" | Yes |
| C7 | C3/C4 with a stale side | conflict + stale | Both values with ages | Yes |
| C8 | Conflict on a gating field | conflict at Complete | No silent block/release; acknowledgement naming both values (D5) | Yes |
| C9 | Guide capability vs live status down/degraded | guide's + `live_status_alert` | Guide value with verified date **and** status with source and age | Yes |
| C10 | Live status expired / feed down | guide's | "Live status not current (last report …)" | No |
| C11 | Several storyboard rows for one field | conflict if any disagree | All rows | Yes |
| C12 | Hospital-wide status (diversion, internal disaster) | advisory banner | Header banner + advisory on relevant steps | Yes |

Comparison order: exact after normalization → schedule canonicalization (`24/7` ≡ "24 hours a
day, 7 days a week") → lexicon synonyms → (M5) LLM judge → else `uncertain`. The storyboard `note`
column is never read (GR-10).

## 16. Frontend

### 16.1 Information architecture

| Route | Audience | Content |
|---|---|---|
| `/encounter` | Clinician | Context header, storyboard card, caselog stepper and step form, Complete bar, nudge dock, chat, contacts |
| `/admin/hospitals` | Guide admin | Hospitals, versions, diff, staleness summary |
| `/admin/import` | Guide admin | Multi-file drop, preview, diagnostics, activate |
| `/admin/bindings` | Guide admin | Bindings per hospital, add binding, proposals review (M5) |
| `/admin/trigger-map` | Guide admin | Versioned editor with validation |
| `/admin/contacts` | Guide admin | Directory editor |
| `/admin/status` | Guide admin / ops | Manual reports, feed health |
| `/admin/audit` | Auditor | Filters, export |
| `/admin/evaluation` | Guide admin | Sponsor cases, holdout, eval reports |
| `/admin/demo` | Guide admin | Clock override, scenario launcher |

### 16.2 Clinician layout

**11 October 2026 user clarification:** The requested demo now uses video consultation on the left half, the form on the right half, and a bottom-right guide companion. This supersedes the full-width form layout below and the layout portion of M2.10. See `DESIGN.md` and `docs/PRODUCTION_PROGRESS_REVIEW.md`; production host/video integration remains pending.

```
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│ Highland Valley Hospital · SYN-006   Hospital 19:30 Tue CST · You 20:30 EST   Stroke · Acute │
│ Guide Challenge v2 · loaded            ● No live status reported                             │
├──────────────────────────────────────────────────────────────────────────────────────────────┤
│ Hospital storyboard (updated 2025-09-14 · 184 days, may be out of date)               [hide] │
│   Video Eval Location   Patient room      ⚠ Guide says: CT holding bay for stroke alerts     │
├──────────────────────────────────────────────────────────────────────────────────────────────┤
│ ① Intake ─ ② History ─ ③ Imaging ─ ④ Recommendation ─ ⑤ Note ─ ⑥ Sign off                    │
│                                                                                              │
│ CTA done                                   ● Info                                            │
│ [ Unknown / not recorded              ▾ ]                                                    │
│                                                                                              │
│ Large vessel occlusion present             ● Advisory                                        │
│ [ Yes                                 ▾ ]                                                    │
│                                                                                              │
│                                                         ┌────────────────────────────────┐   │
│                                                         │ ADVISORY · TIME-DEPENDENT      │   │
│                                                         │ LVO Protocol                   │   │
│                                                         │ Outside the thrombectomy window│   │
│                                                         │ (Mon–Fri 07:00–19:00 CST).     │   │
│                                                         │ Do: ED provider initiates      │   │
│                                                         │ transfer. Do not activate EVT. │   │
│                                                         │ SYN-006 · LVO Protocol ·       │   │
│                                                         │ verified 2026-02-02            │   │
│                                                         │ [Ask about this] [Acknowledge] │   │
│                                                         └────────────────────────────────┘   │
│ [Next step →]                                                         ( ⚠ 1 · ⓘ 3 ) ← pill   │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 16.3 Components

| Component | Responsibility |
|---|---|
| `EncounterProvider` | Wraps `reduceEvent`; dispatches step/focus/change/complete events; runs `evaluate`; measures latency |
| `PackProvider` | Loads pack (IndexedDB/API/standalone compile); version pin; refresh prompt |
| `StatusProvider` | SSE subscription, reconnection with backoff, expiry timers |
| `ContextHeader` | FR-CTX-01 |
| `StoryboardCard` | FR-CTX-02; collapsible; conflict markers link to dock |
| `FieldRow` | Label, `FieldMarker`, input, hint; emits focus/blur/change |
| `FieldMarker` | Tier dot + text label; click → dock scrolled to item |
| `CompleteBar` | Complete button; `GateBanner` with fix links and acknowledge-with-reason |
| `NudgeDock` | Hosts pill/peek/panel; driven by `dockMachine` |
| `NudgeCard` / `ReferenceRow` | Card for priority ≥ 50; compact row otherwise; evidence drawer; "Why am I seeing this?"; report |
| `ChatPanel` | Seeded context chip, suggested questions, messages, composer, escalate |
| `ContactsSheet` | Role cards, availability now, stale marker, tap-to-call |
| `GuidanceUnavailable` | Clear banner; caselog usable |

### 16.4 Dock state machine (`dockMachine.ts`, pure, unit-tested)

| State | Shows |
|---|---|
| `hidden` | Nothing (no applicable results) |
| `pill` | Count + highest tier label |
| `peek` | One-line preview above the pill: "For CTA done: CTA 24/7 · CT perfusion No · AI ClarityLVO" |
| `panel` | Card stack (≤ 40% viewport height desktop; bottom sheet 60vh mobile) |
| `chat` | Chat panel opened from a card or header |

| Event | Transition |
|---|---|
| `RESULTS(set)` empty | → `hidden` |
| `RESULTS(set)` contains new critical result (autoExpand) | → `panel`, scroll to it; announce politely; keyboard focus not moved |
| `RESULTS(set)` info-only change | stay; update count |
| `FOCUS(field)` with critical results for field | → `panel`, field's results first under "For: <label>" |
| `FOCUS(field)` with info-only results | → `peek` (if in `pill`/`hidden`) |
| `BLUR` | `peek` → `pill` after 1.5 s |
| `TOGGLE` / `Esc` | `panel` ↔ `pill` |
| `USER_COLLAPSE` | remember; don't auto-expand again until a result with a new signature appears |
| `NUDGE_CLICK(id)` | → `chat` seeded with result |
| `CHAT_CLOSE` | → `panel` |
| `COMPLETE_BLOCKED` | stay; gate banner at button is the primary signal; dock highlights gate card |

### 16.5 Chat

- Desktop: 400 px drawer above the page (dock column); mobile: full-screen sheet.
- Context chip: "About: LVO Protocol · SYN-006 · Time-dependent".
- Suggested questions from the rule's `suggestedQuestions` (data), else defaults per field family.
- Answer card = `NudgeCard` layout + "Call someone" when `escalate`.
- History lives in memory for the encounter only; nothing persisted except audit metadata.
- Warning under the composer: "Don't include patient names or identifiers."

### 16.6 States

| State | Behaviour |
|---|---|
| Pack loading | Skeleton in dock; caselog usable |
| Guidance unavailable | Banner + dock "Guidance unavailable"; no stale guesses |
| Offline (connected mode) | Cached pack used; "Offline — using guide version X"; audit queued |
| Newer version available | "Updated guide available — refresh" (pinned until clicked) |
| SSE disconnected | Header "Live status paused — reconnecting" |
| AI unavailable | Chat answers deterministically; resolver note "Exact field names work best" |

### 16.7 Visual and accessibility rules

- Tier = colour **and** text label **and** icon: hard stop (red), advisory (amber), info (teal),
  conflict (violet marker), stale (grey "may be out of date").
- WCAG 2.2 AA contrast; focus rings; 44 px targets; `prefers-reduced-motion`.
- Dock is a `region` landmark "Hospital guidance"; panel non-modal; `Esc` collapses; chat is a
  modal dialog on mobile only.
- `aria-live="polite"` for new advisories and info; `assertive` only for the gate banner on
  Complete.
- Responsive breakpoints: ≥ 1200 desktop, 768–1199 tablet, < 768 mobile.

## 17. Backend

### 17.1 Services

| Service | Responsibility |
|---|---|
| `importService` | Classify files, parse (engine parsers), validate, diff, preview, activate in one transaction |
| `compileService` | Build pack via `packages/engine` `compile()`; store; checksum; M5 hooks |
| `packService` | Serve packs with ETag; scope checks |
| `statusService` | Adapters, validation, TTL, SSE fan-out (per hospital channel) |
| `askService` | Deterministic resolution; M5 LLM resolver; answer via engine; id validation |
| `auditService` | Batch ingest, validation, hash chain, export |
| `adminService` | Bindings, trigger map, contacts, flags |

### 17.2 API (REST, `/api/v1`, JSON, RFC 9457 problem details)

| Method | Path | Role | Purpose |
|---|---|---|---|
| GET | `/health`, `/ready` | — | Liveness / readiness (DB, storage) |
| GET | `/auth/login`, `/auth/callback`, POST `/auth/logout` | — | OIDC BFF |
| GET | `/me` | any | User, roles, scope |
| GET | `/hospitals` | clinician+ | Scoped list with active version and staleness summary |
| GET | `/hospitals/:id/pack?version=` | clinician+ | Compiled pack (ETag, `Cache-Control: private`) |
| GET | `/hospitals/:id/versions` | guide_admin | Versions and diffs |
| POST | `/imports` (multipart, ≤ 5 files, ≤ 1 MB each) | guide_admin | Preview: classification, diagnostics, diff |
| POST | `/imports/:id/activate` | guide_admin | Activate atomically; returns new versions/packs |
| GET | `/hospitals/:id/contacts` | clinician+ | Contacts |
| PUT | `/hospitals/:id/contacts` | guide_admin | Replace directory (versioned) |
| GET | `/status?hospitalId=` | clinician+ | Current unexpired reports |
| GET | `/status/stream?hospitalId=` | clinician+ | SSE: `status` events, heartbeat 15 s |
| POST | `/status` | guide_admin, ops | Manual report |
| POST | `/status/ingest/:source` | signed | Webhook: HMAC-SHA256 header, timestamp ±5 min, idempotency key |
| POST | `/encounters` | clinician | Open (hospital, pack, consult/encounter type) → id |
| POST | `/encounters/:id/events` | clinician | Batched audit events (≤ 100) |
| POST | `/ask` | clinician | `{encounterId, packId, question, at?}` → `Answer` |
| GET/PUT | `/trigger-map` | guide_admin | Versioned map |
| GET/POST | `/hospitals/:id/bindings` | guide_admin | View / add binding |
| GET | `/mapping-proposals?state=` | guide_admin | M5 |
| POST | `/mapping-proposals/:id/approve` \| `/reject` | guide_admin | M5 |
| GET | `/audit?…` | auditor | Filtered audit; `?format=csv` export |
| GET/PUT | `/flags` | ops | Kill switches |

Rate limits (per user): `/ask` 30/min, `/imports` 10/min, others 300/min; webhooks per source.

### 17.3 Import pipeline

1. Receive files; size/type checks; SHA-256; store originals (immutable).
2. Classify by shape: guide (has `hospitals[].fields`), storyboard (array with `storyboard_value`
   or alias), contacts, status, trigger map, CSV variants (header sniffing + mapping UI).
3. Parse with engine parsers; Zod validate; bounds.
4. Join storyboard/contacts to hospitals in the same bundle or already active; hold unmatched with
   a diagnostic.
5. Diff against active version (added/removed/changed fields, date changes).
6. Preview → activate in one DB transaction: new version, source records, semantics, comparisons,
   pack, audit event. Any error → rollback; active data untouched.

### 17.4 Identity and access

- OIDC authorization code + PKCE at the API (BFF); httpOnly, Secure, SameSite=Strict session
  cookie; CSRF token for state-changing requests.
- RBAC middleware on every route; hospital scope enforced in queries (`WHERE hospital_id = ANY
  (:scope)`), optionally PostgreSQL row-level security.
- Idle timeout 15 minutes; absolute 12 hours; re-auth for admin activation.

### 17.5 Audit

- Client batches events (every 5 s or on `visibilitychange` via `sendBeacon`).
- Server validates against `AuditEvent`; rejects unknown keys; computes hash chain
  (`hash = sha256(prev_hash || canonical(event))`).
- DB role for the API has INSERT and SELECT only on `audit_events`; a trigger rejects UPDATE and
  DELETE.

### 17.6 Live status

```ts
interface StatusAdapter {
  id: string;
  start(emit: (r: StatusReportInput) => void): Promise<void>;
  stop(): Promise<void>;
  health(): { lastReportAt?: string; ok: boolean };
}
```

Adapters: `mock` (scripted synthetic timeline), `manual` (admin form), `webhook` (signed push),
`poller` (configurable URL + mapping; disabled by default). Default TTL 4 h for resource states,
12 h for diversion/internal disaster (D8). Resource map (data):

| Resource | Guide fields |
|---|---|
| `ct_scanner` | CT Head, CTA Head/Neck, CT Perfusion |
| `mri` | MRI |
| `cath_lab_evt` | LVO Protocol |
| `eeg` | EEG |
| `pharmacy` | Thrombolytic Mix Model |
| `ed_diversion`, `internal_disaster` | hospital-wide |
| `ehr_downtime` | EHR, Order Entry, Order Set Name |

## 18. AI components

### 18.1 Where AI is and isn't used

| Use | Allowed | Notes |
|---|---|---|
| Field-change nudge path | **No** | GR-16 |
| Deciding to block or release | **No** | GR-18 |
| Ingest interpretation of unbound fields | Yes | Proposals only, validated |
| Guide vs storyboard equivalence | Yes | Only when deterministic comparison can't settle |
| Question → fields/time/scope | Yes | Engine produces the facts |
| Writing factual answer text | **No (v1)** | GR-19 |
| Cross-hospital retrieval | **No** | GR-08 |

### 18.2 Model configuration

- SDK `@anthropic-ai/sdk`; model `claude-opus-5-5`. A cheaper model only with measured evals and
  the user's approval.
- Thinking cannot be disabled on this model; set `output_config.effort` explicitly per capability
  (default would be `medium`): interpreter `high`, equivalence `low`, resolver `low`.
- Schema-valid output via structured outputs (`output_config.format` /
  `client.messages.parse()`); forced `tool_choice` returns 400 on this model, so don't use it.
- Document citations can't be combined with structured outputs — the schema carries our own
  source record ids, validated server-side.
- Prompt caching: stable system prompt + vocabulary + pack content first, variable input last;
  monitor `usage.cache_read_input_tokens`.
- Refusals: check `stop_reason`; server-side fallbacks (`fallbacks: "default"`, beta
  `server-side-fallback-2026-07-01`) where available; any refusal, timeout (resolver 8 s,
  interpreter 60 s) or error → deterministic path.
- Streaming for the interpreter (large outputs); non-streaming for resolver/equivalence.

### 18.3 Ingest interpreter (FR-AI-01)

- **Input:** one hospital's unbound fields (name, raw value, record id); the trigger vocabulary
  (caselog fields, steps, trigger kinds, tiers allowed: info/advisory); the value-semantics kinds.
- **Output schema:** `proposals[]: { field, recordId, binding?: { step, when, anchorFieldId?, tier }, semantics: ValueSemantics, cascade?, rationale (≤ 300 chars), confidence }`.
- **Validation:** `recordId` ∈ this hospital's records; tier ∈ {info, advisory}; `anchorFieldId`
  exists; schedule windows re-parsed by the deterministic grammar and must match; otherwise
  `review: needed`.
- **Activation:** info ≥ threshold (default 0.85) auto-activates with an "auto-mapped" badge if
  D7 allows; advisory always requires approval; hard stops impossible.

### 18.4 Equivalence judge (FR-AI-02)

- Input: field, scope branch, guide value, storyboard value.
- Output: `{ verdict: agree | disagree | uncertain, rationale }`.
- Safety rule: a false "agree" hides a conflict, so evals require **zero** false agrees on the
  disagree set; any doubt → `uncertain` → shown as possible conflict.

### 18.5 Question resolver (FR-AI-03)

- Called only when the deterministic resolver returns no field or an ambiguous set.
- Input: question text (only if D10 allows), the pack's field names and aliases, hospital-local
  "now". Never caselog values.
- Output: `{ fields: string[], instant?: ISO, scope?: string, clarification?: string }`.
- Validation: every field ∈ pack (bound or unbound) or `clarification` required; instant parsed by
  Temporal in hospital zone.
- The engine then produces the answer; the LLM never writes it.

### 18.6 Prompt-injection posture

Guide text is untrusted: delivered inside delimited data blocks, described as data in the system
prompt; outputs are schema-restricted; no tools that act; nothing the model returns is executed
or rendered as HTML. Existing hostile-markup tests extended to "ignore previous instructions"
values.

### 18.7 Evals (before any prompt tuning)

| Set | Size | Metric | Release threshold |
|---|---|---|---|
| V01–V20 + 3 paraphrases each | 80 | Field resolution accuracy | ≥ 95% |
| Cross-hospital bait ("What does Cedar Ridge use?" at SYN-006) | 20 | Cross-hospital citations | 0 |
| Unseen-hospital fields (holdout + new fixture) | ≥ 40 | Proposal precision at auto-activate threshold | ≥ 90% |
| Storyboard pairs (agree / disagree / uncertain) | ≥ 40 | False agree on disagree pairs | 0 |
| Prompt injection in guide values | 15 | Any instruction followed | 0 |
| LLM-off parity | full suite | Same pass set as with LLM on | 100% |

Nightly CI job runs evals (cost-bounded); PRs touching prompts run them too.

### 18.8 Cost and latency (estimates, Opus 5.5 list prices $4 / $20 per M input/output tokens, $0.20 per M cached reads)

| Call | Tokens (approx.) | Cost each | Volume |
|---|---|---|---|
| Resolver (cached pack ~6k, 300 new in, 200 out) | — | ≈ $0.006 | Only on deterministic miss |
| Equivalence | ~600 in / 100 out | ≈ $0.005 | Per conflicting pair at import |
| Interpreter (per hospital import) | ~10k in / 3k out | ≈ $0.10 | Per import |

Latency targets: resolver p95 < 6 s; deterministic answer always shown first.

### 18.9 PHI

- Interpreter and equivalence see guide data only (not PHI).
- Resolver sees question text only when a BAA with the LLM vendor is signed and the flag is on
  (D10); otherwise AI resolution is off and chat is deterministic.
- Caselog values are never sent. Logs record token counts, latency, model, prompt version — not
  content.

## 19. Synapse integration

- **Contract:** inbound events follow `encounter_context_example.json` (`hospital_id`,
  `consult_type`, `encounter_type`, `caselog_step`, `field_event`, `local_time`,
  `local_timezone`, `provider_timezone`, `charge_entered`) plus `field_focused` and
  `completion_requested`. Validated by the existing adapter (`src/adapter.ts`).
- **Embedding options:** (a) iframe with a versioned `postMessage` protocol and origin
  allowlist; (b) web component; (c) Synapse consumes `packages/engine` natively. Recommended
  pilot: (a).
- **Identity:** SSO pass-through from Synapse to the companion's OIDC.
- **Gate integration:** the companion reports gate state; Synapse owns the actual Complete action.
- The mock caselog remains the stand-in and the test harness.

---

# Part V — Guardrails, security, operations

## 20. Guardrails catalogue

Each guardrail has an owner module and a test.

### Clinical safety

| ID | Guardrail | Enforced by | Test |
|---|---|---|---|
| GR-01 | No treatment, dosing, diagnosis or scan interpretation — only hospital operational rules with sources | Scope, review, eval | Content review checklist; AI evals |
| GR-02 | Block only on data-defined gates the guide requires; uncertainty never silently blocks or releases | Engine gates (§15.7) | Gate policy suite |
| GR-03 | Read-only: never changes guides or caselog values | Architecture | Mutation tests |
| GR-04 | Caselog always works if guidance fails | Error boundaries, outage mode | Outage e2e |
| GR-05 | Hospital-local time for every rule | Engine | Time suite, V17 |
| GR-06 | Undefined hours → state unknown, both branches | Engine | V08, V18 |

### Source fidelity

| ID | Guardrail | Enforced by | Test |
|---|---|---|---|
| GR-07 | Every nudge and answer cites hospital, field, version, date; uncited results are dropped | Engine + UI | Citation completeness test |
| GR-08 | Never answer from another hospital | Single-pack evaluate guard; scoped API; resolver validation | Isolation suite, evals |
| GR-09 | Missing field → "Not available in this hospital's guide." exactly | Engine | V14, V20 exact match |
| GR-10 | Conflicts show both sources, no precedence; storyboard `note` never read | Engine compare | Conflict matrix, `note`-mutation test |
| GR-11 | Staleness computed at evaluation for every source | Engine | V13, V18, storyboard staleness |
| GR-12 | Live status never rewrites the guide; no report ≠ operational | Overlay | C9, C10 tests |
| GR-13 | Uncertain interpretation → review flag; can't drive cascades or gates | Semantics | Lexicon tests |

### Nudge fatigue

| ID | Guardrail | Enforced by | Test |
|---|---|---|---|
| GR-14 | Silence by default; info never interrupts; auto-expand only for new critical results; one auto-expand per event; user collapse respected | Dock machine | Dock suite, N8 |
| GR-15 | Every interruptive nudge explains its trigger ("Why am I seeing this?") | Result.triggerId | UI test |

### AI

| ID | Guardrail | Enforced by | Test |
|---|---|---|---|
| GR-16 | No LLM on the nudge path | Architecture | Network-blocked latency test |
| GR-17 | LLM output schema-validated; cited ids must exist in active pack | API validation | Forged-id tests |
| GR-18 | LLM cannot create or remove hard stops; advisory bindings need approval | Validation | Proposal tests |
| GR-19 | LLM never writes factual answer text (v1) | askService | Answer provenance test |
| GR-20 | Guide text treated as untrusted data; inert rendering | Prompting + React escaping | Injection evals, hostile-markup e2e |
| GR-21 | Everything passes with AI off | Flags | LLM-off CI job |
| GR-22 | Refusal/timeout/error → deterministic fallback, never blank | askService | Fault-injection tests |

### Privacy

| ID | Guardrail | Enforced by | Test |
|---|---|---|---|
| GR-23 | No PHI to LLM without BAA + flag; caselog values never sent | askService, flags | Payload inspection tests |
| GR-24 | No PHI or free text in logs/audit; allowlisted keys | Schemas, logger redaction | Log scanning test |
| GR-25 | Synthetic data only outside production; fictional phone numbers | Seeds, review | Seed lint |

### Security and operations

| ID | Guardrail | Enforced by | Test |
|---|---|---|---|
| GR-26 | RBAC and hospital scope on every route | Middleware, queries | Authorization matrix |
| GR-27 | Imports bounded, validated, atomic; originals immutable | importService | Fuzz + rollback tests |
| GR-28 | Webhooks HMAC-signed, timestamped, idempotent | statusService | Signature/replay tests |
| GR-29 | Packs immutable and versioned; encounters pinned | Data model | Pin/refresh e2e |
| GR-30 | Kill switches for AI, auto-mapping, live status | Flags | Flag e2e |

## 21. Security and privacy

### 21.1 Data classification

| Class | Data | Handling |
|---|---|---|
| Public/synthetic | Kit guides in this build | Any environment |
| Confidential | Real hospital guides, trigger maps, contacts (staff PII) | Auth required; encrypted at rest; scoped |
| Restricted (PHI) | Encounter context, caselog values, chat text | Not persisted by the companion (encounters table holds no clinical values); never to LLM without BAA; HIPAA-eligible hosting only |

### 21.2 HIPAA Security Rule controls (required before any PHI)

| Safeguard | Control |
|---|---|
| Access control | Unique users (OIDC), RBAC, hospital scope, idle timeout, emergency access procedure |
| Audit controls | Append-only audit with hash chain; admin actions logged |
| Integrity | Checksummed uploads, immutable versions/packs |
| Authentication | SSO with MFA at the identity provider |
| Transmission security | TLS 1.2+, HSTS; SSE over TLS |
| Encryption at rest | Managed DB and storage encryption; keys in KMS |
| Minimum necessary | No caselog values stored; no PHI in logs or prompts |
| Business associates | BAAs with hosting, logging, LLM vendors before PHI |
| Contingency | Backups, PITR, restore drills |
| Risk analysis | Documented before go-live; reviewed annually |

This plan lists controls; it does not claim compliance. Compliance sign-off is a release gate for
production with PHI.

### 21.3 Threat model (summary)

| Threat | Vector | Mitigation |
|---|---|---|
| Spoofed status | Fake webhook | HMAC, timestamp window, idempotency, source allowlist |
| Malicious upload | XSS in values, oversized files, deep nesting | Bounds, Zod, inert rendering, CSP |
| Cross-hospital leakage | Scope bugs, LLM drift | Single-pack guard, scoped queries, resolver validation, evals |
| Prompt injection | Instructions in guide text | Data-only prompting, schema outputs, no acting tools |
| Privilege escalation | Admin routes | Server-side RBAC, re-auth, audit |
| Audit tampering | DB writes | INSERT-only role, trigger, hash chain |
| Abuse / DoS | `/ask`, imports | Rate limits, size limits |
| Supply chain | Dependencies | Lockfile, `pnpm audit`, Dependabot, pinned actions |
| Session theft | XSS → token theft | httpOnly cookies, strict CSP, no tokens in JS |

### 21.4 Web security headers

`Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self' <api>; frame-ancestors <synapse origins>`;
`Strict-Transport-Security`; `X-Content-Type-Options: nosniff`; `Referrer-Policy: no-referrer`;
CORS restricted to known origins.

## 22. Observability and SLOs

### 22.1 SLOs

| SLO | Target | Measurement |
|---|---|---|
| Nudge latency | 99.9% of field events < 500 ms; p95 ≤ 100 ms | Client telemetry (`performance.now`, two-frame paint) |
| Pack load | p95 < 1 s | Client telemetry |
| API availability | 99.9% monthly | Synthetic checks |
| Status delivery | p95 < 5 s ingest → client | Server + client timestamps |
| Audit durability | 100% of accepted events persisted | Write errors alert immediately |

### 22.2 Telemetry

- Structured JSON logs (pino) with request id, user id (pseudonymous), route, latency; redaction of
  bodies.
- OpenTelemetry traces across web → API → DB/LLM.
- Metrics: nudge latency histogram, results per event, auto-expand count, gate hits, conflicts
  surfaced, stale sources per hospital, import failures, SSE connections, status freshness, LLM
  calls/latency/tokens/refusals/cost, flag states.

### 22.3 Dashboards

| Dashboard | Content |
|---|---|
| Clinician experience | Latency SLOs, error rates, guidance-unavailable incidents |
| Guide quality ("keeping guides current") | Stale fields per hospital, fields approaching 180 days, unbound fields, conflicts, chat not-in-guide questions per hospital |
| Quality outcomes | Gates hit then resolved before completion; order-set and note-title nudges acted on; LVO advisories shown vs acknowledged |
| Platform | API, DB, SSE, LLM health and cost |

### 22.4 Alerts

SLO burn rate; audit write failures (page); status source silent beyond TTL; import failures;
LLM error rate > 5% for 10 minutes (auto-disable resolver via flag); DB connection saturation.

## 23. Environments, CI/CD and operations

### 23.1 Environments

| Env | Purpose | Data | Hosting |
|---|---|---|---|
| Local | Development | Synthetic | Docker Compose (Postgres, API, web) |
| CI | Tests | Synthetic | GitHub Actions |
| Demo | Hackathon judging | Synthetic | Netlify static, standalone mode |
| Staging | Integration, UAT | Synthetic | Container platform + managed Postgres |
| Production | Clinical use | PHI possible | HIPAA-eligible cloud under BAA (D9) |

### 23.2 Pipeline

`ci.yml` on every PR: install (frozen lockfile) → lint → typecheck → unit (engine, contracts, API) →
sponsor oracle → API integration (Postgres service) → Playwright e2e (standalone + connected) →
axe → latency report gate → bundle-size gate → `pnpm audit` → migration check → build images.

`nightly-evals.yml`: AI evals with thresholds; cost report.

`deploy.yml`: main → staging automatically; tag `v*` → production with manual approval;
migrations expand/contract (backward-compatible first); demo build published on release.

### 23.3 Release and versioning

- Semantic versions for apps; `engineVersion`, `triggerMapVersion`, `lexiconVersion` stamped into
  every pack and result. Engine major bump → recompile packs.
- Feature flags for AI, auto-mapping, live status, field markers.

### 23.4 Runbooks (`docs/runbooks/`)

Import failed or wrong data activated (retire version, reactivate previous); status source silent;
LLM outage (flags off); audit write failure; pack rollback; key rotation; restore from backup.

### 23.5 Backups

Daily snapshots + point-in-time recovery (7–35 days per environment); object storage versioning;
quarterly restore drill.

---

# Part VI — Quality

## 24. Test strategy and release gates

### 24.1 Layers

| Layer | Scope | Tooling |
|---|---|---|
| Unit | Engine pipeline, time, schedules, semantics, comparison, cascades, gates, ranking, dock machine, parsers | Vitest |
| Property | Time windows across DST, schedule grammar fuzz, import bounds | fast-check |
| Contract | Zod schemas; API request/response; encounter envelope | Vitest + Fastify inject |
| Sponsor oracle | V01–V20, N1–N9 with **sponsor wording** | Vitest (`tests/acceptance.test.ts`) |
| Parity snapshot | Pre-refactor engine output matrix (7 hospitals × steps × key values × times) vs data-driven engine | Vitest snapshots |
| Unseen hospital | New fixture hospital + storyboard covering handbook issues 1–13 (§24.3) | Vitest + Playwright |
| Integration | API + Postgres: import/activate/rollback, scope, audit immutability, SSE | Vitest + Docker |
| End-to-end | Clinician and admin journeys in both modes | Playwright |
| Accessibility | All clinician routes and dock states | `@axe-core/playwright` + manual screen-reader pass |
| Performance | Browser latency report; bundle size; pack load | Playwright + scripts |
| Security | Inert markup, authorization matrix, webhook signature/replay, CSP | Playwright + Vitest |
| AI evals | §18.7 | Nightly job |
| Resilience | API down, SSE drop, LLM timeout, corrupt cache | Playwright with network stubs |

### 24.2 Key end-to-end scenarios

1. Unseen-hospital drop (guide + storyboard, either order) → select → conflict shown → nudges and
   answers with source/status.
2. N2: SYN-006 Tue 19:30, LVO Yes → advisory auto-expands, "Do not activate EVT" absent from
   directives; clock 17:00 → within coverage.
3. N8: SYN-002 General Neuro, allergies "none" → hidden dock.
4. N5/N7: Complete blocked at button; fix → resolves; acknowledgeable gate → reason required.
5. Focus "CTA done" → peek (info only); focus "LVO" with recorded LVO → panel.
6. Click nudge → chat seeded → V18 question → time-dependent + stale + unknown hours → contacts.
7. V14 → exact "Not available in this hospital's guide."
8. Live status "CT down" → header + imaging alert within 5 s; expiry → "not current".
9. Guide outage → caselog usable, "Guidance unavailable".
10. Hostile guide values → inert.
11. 390 px, keyboard-only walkthrough.

### 24.3 New unseen-hospital fixture (M1)

`data/fixtures/syn-108/` — "Riverbend Community Hospital (synthetic)", `America/Phoenix` (no DST),
sponsor format, ~24 fields, with storyboard:

| Handbook issue | Fixture element |
|---|---|
| 2, 12 | Field `CTA head and neck` (alias) and a brand-new field `Interpreter Line` |
| 4, 5 | `LVO Protocol`: "Thrombectomy capable Tue/Thu 0800-1600; otherwise transfer…"; `EEG`: "Weekdays 7a–5p" (new phrasing) |
| 6 | No `Required Note Title`, no `CT Perfusion` |
| 7 | `Thrombolytic Mix Model` last verified 2025-07-01 |
| 8 | Storyboard: `Video Eval Location` disagrees; `Thrombolytic` agrees; `Wake Up Protocol` "Yes" vs guide "Yes - all stroke alerts" (lexicon agree) |
| 9 | `Rounding Timing`: "During hospitalist hours" (undefined) |
| 10 | `Charge Entry`: "Required before sign-off" (affirmative in words) |
| 11 | `Order Entry`: "Teleneurologist does not place orders" (negative in words) |

### 24.4 Release gates

| Gate | Demo release | Production release |
|---|---|---|
| Sponsor oracle 29/29 (sponsor wording) | ✓ | ✓ |
| Unseen-hospital drop test | ✓ | ✓ |
| Latency SLO in browser | ✓ | ✓ |
| axe zero serious | ✓ | ✓ |
| Guardrail tests GR-01…GR-30 | Those in M1–M3 | All |
| AI evals thresholds | n/a (AI off) | ✓ if AI enabled |
| Security review + penetration test | — | ✓ |
| HIPAA controls sign-off | — | ✓ (before PHI) |
| Runbooks + on-call | — | ✓ |

---

# Part VII — Delivery

## 25. Module plan

Every module: branch per module, PR with tests, app demoable at merge, full suite green.

### M1 — Sponsor fidelity and demo readiness

**Objective.** Pass the judges' new-hospital test with sponsor-exact behaviour on the current
client-only app.

**Requirements.** FR-ING-01/02/04/05, FR-CHAT-03, FR-CTX-01/02, FR-NUD-05 (action), FR-ENG-04
(storyboard staleness), GR-07/09/10/11.

| Task | Detail | Files |
|---|---|---|
| M1.1 Storyboard import | Parse sponsor shape and aliases (JSON + CSV); attach to hospitals in the bundle or already loaded as a new immutable version; hold unmatched rows with diagnostic; never read `note` | `src/imports.ts`, `src/domain.ts` |
| M1.2 Multi-file drop | Accept several files; classify; per-file preview; atomic activation | `src/main.tsx` (Guide library), `src/imports.ts` |
| M1.3 Sponsor wording | `src/engine.ts:68` → "Not available in this hospital's guide." + "This does not mean the hospital lacks it. No other hospital was searched."; restore V14/V20 fixtures; exact-phrase test | `src/engine.ts`, `src/fixtures.ts`, tests |
| M1.4 "What to do" | Add `action` to `Result`; derive per §15.6; render on cards | `src/domain.ts`, `src/engine.ts`, `src/main.tsx` |
| M1.5 Storyboard card | Card at top of caselog; conflict markers; age/staleness | new component |
| M1.6 Doctor's time | Header shows provider local time and zone; answers include it when zones differ | `src/main.tsx`, `src/engine.ts` |
| M1.7 Storyboard staleness (D6) | Flag rows older than 180 days as "storyboard may be out of date" | `src/engine.ts` |
| M1.8 Unseen fixture + drop e2e | `data/fixtures/syn-108/` (§24.3); Playwright drop test (both orders) | data, tests |
| M1.9 `note` guardrail test | Mutate `note` text; results unchanged | tests |

**Acceptance.** Sponsor storyboard file imports; dropping guide + storyboard for SYN-108 shows the
Video Eval conflict and agrees on Thrombolytic; V14/V20 exact; every card has a "Do:" line; header
shows both times; all tests green; latency within budget.

**Estimate.** 3–4 developer-days. **Depends on:** nothing. **Risk:** judges' file variants →
alias-tolerant parser + diagnostics.

### M2 — Clinician experience: dock, chat, contacts

**Objective.** Replace inline/rail guidance with the field-aware floating dock, gate at Complete,
chat from nudge, contacts; remove voice/transcript.

**Requirements.** FR-NUD-01…10, FR-CHAT-01…07, FR-CON-01…05, FR-ADM-09, NFR-06/07, GR-14/15,
D1, D2, D11, D13 (UI).

| Task | Detail | Files |
|---|---|---|
| M2.1 Remove voice/transcript | Delete files listed in §9 (D2); remove hero section; move demo controls to admin | `src/*`, tests, docs |
| M2.2 Split `main.tsx` | Feature folders per §13 (`encounter/`, `guidance/`, `chat/`, `contacts/`, `admin/`) inside current app | `src/` |
| M2.3 Encounter provider | Context over `reduceEvent`; dispatch `field_focused`; latency measurement kept | `src/encounter/` |
| M2.4 Dock + machine | `dockMachine.ts` (§16.4) with unit tests; pill/peek/panel; ordering by focused field; user-collapse memory | `src/guidance/` |
| M2.5 Field markers (D1) | Tier dot + label; link to dock entry | `src/encounter/FieldRow` |
| M2.6 Gate at Complete (D13) | `GateBanner` at button; fix links; acknowledge-with-reason for acknowledgeable gates; audit | `src/encounter/CompleteBar` |
| M2.7 Chat from nudge | Seeded context, suggested questions, answer cards with action, escalate | `src/chat/` |
| M2.8 Contacts | Schema, synthetic seed for 7 kit hospitals + SYN-108, importer support, sheet, availability now, stale | `src/contacts/`, `data/seeds/contacts.json`, `src/imports.ts` |
| M2.9 Report a problem | Per-card report → local audit | `src/guidance/` |
| M2.10 Layout + a11y | Remove rail; full-width caselog; responsive; axe; keyboard; screen-reader pass | CSS, tests |
| M2.11 Test migration | Repoint e2e from `.field-guidance` to dock; add dock/chat/contacts e2e | `tests/e2e/` |

**Acceptance.** Focus CTA → peek; LVO Yes → panel auto-expands ≤ 500 ms; info never auto-expands;
N8 hidden; hard stop at Complete; nudge click opens seeded chat; not-in-guide answer offers
contacts; contacts never cross hospitals; 390 px; axe zero serious; voice/transcript gone.

**Estimate.** 5–7 days. **Depends on:** M1. **Risk:** dock missed → markers, auto-expand,
Complete gate; usability check with one clinician if possible.

### M3 — Rules as data

**Objective.** Make triggers, value semantics, cascades, gates and comparisons data; compile
packs; extract the engine into a package — without behaviour regressions.

**Requirements.** FR-ENG-01…13, FR-ADM-03/04, NFR-11/12, GR-02/10/13, D3, D4, D5, D13.

| Task | Detail | Files |
|---|---|---|
| M3.1 Workspace split | pnpm workspace: `packages/contracts`, `packages/engine`, `apps/web` (current app); no behaviour change | repo |
| M3.2 Parity snapshot | Record current outputs over a matrix (7 hospitals × steps × values × 4 times) before refactor | `packages/engine/tests/parity` |
| M3.3 Trigger map v1 | `trigger-map.v1.json` from `caselog_field_map.csv` + decisions D3/D4 + anticipatory/promotion rules | `packages/engine/data` |
| M3.4 Binding interpreter | Replace hard-coded `add(...)` in `evaluate()` with rule evaluation; parity must match (intended diffs listed) | `packages/engine/src/evaluate.ts` |
| M3.5 Value lexicon | `value-lexicon.v1.json`; replace field-specific regexes (`engine.ts:113,184,247–248`) | `packages/engine/src/semantics.ts` |
| M3.6 Cascades + gates as data | `suppressWhen`, `gate`, release policy, uncertainty policy | engine |
| M3.7 Conflict matrix | §15.9 C1–C11 with normalization, schedule canonicalization, scope branches | `packages/engine/src/compare.ts` |
| M3.8 Unseen fields | Alias table, `unboundFields`, admin "Add binding" form → new version | engine, `apps/web/admin` |
| M3.9 `compile()` | Pure compile to `CompiledPack`; standalone mode compiles in browser; IndexedDB store replaces localStorage (migration from `encounter-guide:v1`) | engine, web |
| M3.10 No-names test | CI test: engine source contains no guide field or hospital names | tests |
| M3.11 Admin diagnostics | Show semantics, confidence, comparisons, unbound fields per hospital | web admin |

**Acceptance.** Parity snapshot identical except listed intended changes; sponsor oracle green;
conflict matrix tests C1–C11; SYN-108's `Interpreter Line` bound via admin form with no code
change; no field names in engine source; standalone demo still works offline.

**Estimate.** 5–7 days. **Depends on:** M1, M2. **Risk:** regressions → parity snapshot first.

### M4 — Production platform

**Objective.** Real backend with persistence, auth, audit, live status, observability, CI/CD and
deployment; standalone demo mode preserved.

**Requirements.** FR-ING (server), FR-STAT-01…05, FR-AUD-01…03, FR-AUTH-01…04, FR-CTX-03,
NFR-02/03/04/08/09/10, GR-12/24/26/27/28/29/30, §21–23.

| Task | Detail |
|---|---|
| M4.1 API scaffold | Fastify, config, problem details, request ids, health/ready, OpenTelemetry, pino |
| M4.2 Database | Drizzle schema (§14.3), migrations, synthetic seed, INSERT-only audit role + trigger |
| M4.3 Storage | Object storage for uploads (local MinIO/dev folder) |
| M4.4 Import + compile service | Server-side pipeline (§17.3) using `packages/engine` |
| M4.5 Packs API + connected web | ETag; TanStack Query; IndexedDB cache; pin/refresh; offline continuity |
| M4.6 Auth | OIDC BFF, sessions, CSRF, RBAC, hospital scope, timeouts |
| M4.7 Audit | Client batching/beacon; validation; hash chain; auditor UI; CSV export |
| M4.8 Live status | Adapters (mock, manual, webhook, poller off); TTL; SSE; header banner; overlay; admin console |
| M4.9 Ask endpoint | Deterministic server parity; LLM hook stub for M5 |
| M4.10 Security hardening | CSP, headers, CORS, rate limits, secrets, dependency audit, authorization matrix tests |
| M4.11 Observability | Metrics, dashboards (§22.3), alerts, client latency telemetry |
| M4.12 CI/CD | `ci.yml`, docker images, compose, staging deploy, prod approval, migration checks |
| M4.13 Runbooks + backups | §23.4–23.5 |
| M4.14 Synapse seam | `postMessage` protocol spec + adapter tests (§19) |

**Acceptance.** Same e2e suite passes in connected and standalone modes; authorization matrix
passes; audit UPDATE/DELETE rejected; SSE status reaches client < 5 s and expires correctly;
staging deployed via pipeline; dashboards and alerts live; restore drill done.

**Estimate.** 8–12 days. **Depends on:** M3 (packages). M4.1–M4.3 and M4.12 can start in parallel
with M3. **Risk:** hosting/BAA decisions (D9) → keep platform-neutral containers.

### M5 — AI augmentation

**Objective.** Improve coverage of unseen guides and free-text questions with an LLM, under strict
guardrails, without making the product depend on it.

**Requirements.** FR-AI-01…05, FR-ADM-03 (review), NFR-17, GR-16…23, D7, D10.

| Task | Detail |
|---|---|
| M5.1 Eval harness | Datasets and scoring (§18.7) before any prompt work |
| M5.2 LLM client | `@anthropic-ai/sdk`, `claude-opus-5-5`, explicit effort, structured outputs, caching, timeouts, retries, refusal handling + fallbacks, token/cost metrics, flags |
| M5.3 Ingest interpreter | Proposals → validation → auto-activate info (D7) or queue; admin review UI with cited record and diff |
| M5.4 Equivalence judge | In compile for unresolved pairs; stored with rationale; uncertain → possible conflict |
| M5.5 Question resolver | Deterministic first; LLM on miss; id validation; engine answers |
| M5.6 PHI controls | BAA flag gate; payload inspection tests; log content exclusion |
| M5.7 CI | LLM-off parity job; nightly evals; cost report |

**Acceptance.** Eval thresholds met (zero cross-hospital citations, zero false agrees); LLM-off
suite identical; kill switches verified; resolver p95 < 6 s; proposals never contain hard stops.

**Estimate.** 6–8 days. **Depends on:** M4 (API), M3 (bindings). M5.1 can start during M3.
**Risk:** model drift → evals gate releases; prompt versions recorded with every proposal.

## 26. Timeline and critical path

```
Week 1   M1 ███ ─► M2 ██████
Week 2   M2 ██ ─► M3 ███████        M4.1–4.3, 4.12 (parallel, second developer)
Week 3   M3 ██ ─► M4 ██████████     M5.1 evals (parallel)
Week 4   M4 ████ ─► M5 ███████
Week 5   M5 ██ ─► hardening, security review, UAT
```

- Sequential effort: ≈ 27–38 developer-days; with two developers ≈ 4–5 weeks.
- **Demo-critical path:** M1 + M2 (≈ 8–11 days).
- **If the demo is within 2–3 days (D12):** M1.1–M1.4, M1.8 and M2.4, M2.6, M2.7 only; everything
  else after the demo.

## 27. Migration from the current repo

1. **Branches.** Base on `feature/anticipatory-guidance` (PR #1 to `Dexter3337/sevaro-encounter-guide`
   from fork `hsa70-ui`). Ask the upstream owner to merge PR #1 or grant write access; until then,
   stack module branches on the fork (`module/m1-sponsor-fidelity`, …) and open PRs per module.
2. **Code moves (M3).** `src/engine.ts`, `time.ts`, `knowledge.ts`, `domain.ts` →
   `packages/engine` and `packages/contracts`; current app → `apps/web`.
3. **Deletions (M2).** Voice and transcript files (§9); `docs/VOICE_WORKFLOW.md`; related reports
   archived under `reports/archive/`.
4. **Data.** `data/official/` untouched; `src/data/seeds.json` regenerated from official kit files
   via script (guides + storyboard through the new importer, proving G1 fixed); new
   `data/fixtures/syn-108/`; `data/seeds/contacts.json`.
5. **Storage.** `localStorage` `encounter-guide:v1` → IndexedDB v2 with a one-time migration that
   re-imports preserved originals.
6. **Docs.** Update `README.md`, `DATA_CONTRACT.md` (storyboard, contacts, status, trigger map),
   `DECISIONS.md` (D1–D13 outcomes), `APP_WORKFLOW.md`; add ADRs for engine package, BFF auth,
   SSE, AI boundaries.

## 28. Risk register

| ID | Risk | L | I | Mitigation | Owner |
|---|---|---|---|---|---|
| R1 | Demo date too close for full scope | H | H | Demo-critical subset (§26); demo runs standalone | M1/M2 |
| R2 | Judges' files differ in shape | M | H | Alias-tolerant parsers, CSV mapping, diagnostics, admin add-binding | M1/M3 |
| R3 | Engine refactor regresses sponsor behaviour | M | H | Parity snapshot before refactor; oracle on every PR | M3 |
| R4 | Corner dock missed by doctors | M | M | Field markers, critical auto-expand, gate at Complete | M2 |
| R5 | Anticipatory rows cause fatigue | M | M | Info never interrupts; peek only; user collapse respected; metrics | M2 |
| R6 | LLM hallucination or cross-hospital answer | M | H | LLM never writes facts; id validation; evals; flags | M5 |
| R7 | PHI leakage to LLM or logs | L | H | BAA gate, payload tests, log redaction | M4/M5 |
| R8 | Upstream repository access | H | M | Fork PRs; request access | — |
| R9 | Scope creep into clinical decisions | M | H | Non-goals, GR-01, review checklist | All |
| R10 | Time-zone / DST bugs | L | H | Temporal, property tests, Phoenix fixture | M1/M3 |
| R11 | Live status data quality | M | M | TTL, provenance, never overrides guide | M4 |
| R12 | Backend adds nudge latency | L | M | Local evaluation; network-blocked latency test | M4 |
| R13 | Hosting/BAA decisions delay production | M | M | Platform-neutral containers; staging on synthetic data | M4 |

## 29. Decisions D1–D13

| ID | Decision | Recommendation | Why |
|---|---|---|---|
| D1 | Tier marker beside field label | **On** | A corner dock can be missed; the marker ties the nudge to the field (original brief: advisory "visible next to the field") |
| D2 | Voice/transcript code | **Delete** from the app (history keeps it) | Ruled out of scope; flags would leave dead code and demo risk |
| D3 | Thrombolytic guidance before administration | **Keep**, documented as a deliberate deviation from field-map row 6 | Preparation guidance can't change a recorded administration; handbook allows re-tiering with a reason; N4 still passes |
| D4 | "Not documented — confirm locally" for absent CTA/LVO on arrival | **Keep**, worded "Not available in this hospital's guide. Confirm locally." | Honest, actionable, never contradicts a recorded value |
| D5 | Conflict on a gating field | **Warn at Complete with mandatory acknowledgement naming both values**; no silent block or release | Handbook: block only when the guide truly requires it; conflict means that is unknown |
| D6 | Storyboard staleness | **Apply the 180-day rule** to `storyboard_updated`; flag only, status unchanged | Handbook issue 7: any field at any hospital can be stale; SYN-002's row is 184 days old |
| D7 | Auto-activate info-tier LLM mappings | **Yes above 0.85 confidence**, badged and revertible; advisory needs approval | Coverage for unseen fields without a human in the loop; low risk tier only |
| D8 | Live status TTL and mapping | **4 h resources, 12 h hospital-wide**; mapping §17.6 | Stale status is worse than none |
| D9 | Hosting, database, SSO | **Containers + managed PostgreSQL on a HIPAA-eligible cloud with BAA; OIDC provider of the organisation (e.g. Microsoft Entra ID)** | Needs your organisation's choice |
| D10 | LLM vendor agreement, retention, demo | **AI off for the demo**; enable after BAA and retention settings agreed | The deterministic path satisfies the brief; avoids PHI risk |
| D11 | Contact roles | **Technical lead · Nursing in charge · Administrator on duty** | As requested; schema extensible |
| D12 | Demo date and must-haves | **Needed from you** | Determines the demo-critical subset |
| D13 | Hard-stop release | **Charge Entry: fix only. Consult completion rule: acknowledge with reason.** | Handbook allows "fix or acknowledge"; the doctor can record a charge but can't force a hospital provider to confirm |

## 30. Open questions for Sevaro

1. Exact transport and filenames for the judges' two files; may the storyboard contain fields
   absent from the guide?
2. Is acknowledgement acceptable for "do not complete until the hospital provider confirms"?
3. Where do real contacts and hospital operational statuses live today?
4. How would a companion embed in Synapse (iframe, component, native)?
5. Which quality-team error categories are tracked today, for baselines?

---

# Appendices

## A. Kit hospital facts

| Hospital | Zone | Fields | Notable for testing |
|---|---|---|---|
| SYN-001 Cedar Ridge | America/Chicago | 24 | LVO "staffed neurointerventional coverage" with no hours (V08) |
| SYN-002 Bluewater | America/Denver | 21 | No CT/CTA/CTP/AI/MRI/note title; storyboard conflict on Video Eval (stroke); storyboard 184 days old; charge Yes; rounding window V17 |
| SYN-003 Redwood | America/Los_Angeles | 25 | 24/7 everything; rounding orders allowed; wake-up Yes (N3) |
| SYN-004 Meadowlands | America/New_York | 24 | No imaging fields; EEG stale (2025-06-10, V13); no medication orders (N4 cascade); consult completion rule (N7) |
| SYN-005 Suncrest | America/New_York | 22 | CTP No, AI ClarityLVO (N6); storyboard agrees on Thrombolytic; no note title (V20); charge Yes |
| SYN-006 Highland Valley | America/Chicago | 23 | LVO Mon–Fri 0700–1900 (N2, V06, V09); mix model stale + staffed hours undefined (V18); no CT/CTA/CTP/AI/MRI |
| SYN-007 Silver Oak | America/New_York | 23 | CTP Mon–Fri 0700–1900 (V16); AI None; no orders (V07); charge required (N5, V10) |

Reference date 2026-03-17; stale after 180 days; 33 distinct field names; no contact fields.

## B. Sponsor scenarios (expected)

| ID | Hospital | Event | Expected |
|---|---|---|---|
| N1 | SYN-002 | LVO Yes, Tue 14:00 MT | Advisory: not capable; ED activates transfer; Metro Neuroscience Institute |
| N2 | SYN-006 | LVO Yes, Tue 19:30 CT | Advisory: outside window; ED initiates transfer; never "activate EVT" |
| N3 | SYN-003 | LKW Unknown, Tue 03:10 PT | Advisory: wake-up protocol in use |
| N4 | SYN-004 | Thrombolytic given Yes | Advisory: no medication orders by teleneurologist; local order set; no order-set name |
| N5 | SYN-007 | Complete, no charge | Hard stop: encounter charge required |
| N6 | SYN-005 | CTA done Yes | Info: CTP not available; AI ClarityLVO |
| N7 | SYN-004 | Complete (General Neuro) | Hard stop: hospital provider confirms plan first |
| N8 | SYN-002 | Allergies "none" (General Neuro) | No nudge |
| N9 | SYN-001 | Rounding opened Sun 08:00 CT | Info: rounds Mon–Fri; check why a Sunday encounter exists |

V01–V20 expectations are in `data/official/validation_set.csv`; statuses: answered (V01–V03, V05,
V11, V15, V19), not in guide (V04, V14, V20), time-dependent (V06–V09, V16–V18), stale (V13),
conflict (V12), hard stop (V10).

## C. Demo script (5 minutes, standalone mode)

1. SYN-006, Stroke, Tue 19:30 CT (doctor in New York 20:30) → Imaging: dock quiet pill; focus LVO
   → peek of the LVO protocol.
2. LVO = Yes → advisory auto-expands: outside window, ED initiates transfer; source, status,
   "Do:" line. Clock → 17:00 → within coverage.
3. SYN-002 General Neuro, allergies "none" → silence (N8). Switch to stroke intake → storyboard
   card shows the Video Eval conflict; dock shows both sources.
4. SYN-007 sign-off → Complete → blocked at the button; record charge → completes.
5. Click a nudge → chat → "Who mixes the TNK?" at SYN-006 → time-dependent, stale, hours unknown →
   "Call someone" → nursing in charge.
6. Admin → drop SYN-108 guide + storyboard → activate → open SYN-108 → conflict, alias field,
   new-phrasing schedule; ask "What note title is required?" → "Not available in this hospital's
   guide."
7. Live status (mock): CT scanner down at SYN-001 → header banner + imaging alert; both guide and
   status shown.

## D. Glossary

| Term | Meaning |
|---|---|
| Caselog | Step-by-step form in Synapse where the doctor records the case |
| Guide | A hospital's rules, one field at a time, each with a last-verified date |
| Storyboard | Per-hospital summary card at the top of the caselog; a second source that can disagree |
| Pack | Immutable compiled bundle of one hospital's guide version, storyboard, contacts and bindings |
| Binding / trigger rule | Data that links a caselog event to guide fields, tier, gate or cascade |
| Nudge | A rule shown without being asked: hard stop, advisory or info |
| Gate | A hard stop on Complete defined by a binding |
| Live status | Current operational state reported by the hospital (e.g. CT down, diversion) |
| LVO / EVT | Large vessel occlusion / endovascular thrombectomy |
| BAA | Business associate agreement (HIPAA) |
| BFF | Backend-for-frontend: the API holds OIDC tokens; the browser holds only a session cookie |
| SSE | Server-Sent Events |
