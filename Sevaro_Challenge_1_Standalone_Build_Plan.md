# Sevaro Challenge 1 — Standalone Prototype Build Plan

Prepared for Dr. Rohit Motwani's Rutgers Health Hackathon team. Version 1.0, 10 October 2026.

## 0. Instructions for the coding agent receiving this file

Build the working prototype described here in this VS Code project. This file is a handoff specification, not a request for another plan. Read it completely, inspect the existing project and its instructions, then implement in milestones. Reuse a viable existing stack rather than replacing it unnecessarily. If the repository is empty, use the default stack below. Preserve existing user work.

Start with the smallest working encounter-to-nudge-to-sign-off loop, then complete the required acceptance suite. Keep a short implementation status file documenting decisions, tests, and unresolved limits. Do not wait for exhaustive external research, a production API, an LLM key, or the judges' dataset. Do not claim the actual Synapse product has been integrated. Implement the mock adapter and clearly show synthetic demo labeling.

Everything necessary to understand the challenge is included here. Appendix A contains the complete extracted text of the sponsor's Challenge 1 v2 brief, including seven hospital guides, 20 question examples, and nine nudge scenarios. Use that appendix as the authoritative seed source. PDF figures are not reproduced; the sponsor permits a different caselog design. No previous chat is required.

Priority order: correct behavior and source fidelity; unfamiliar data handling; usable clinical workflow; fast field-event response; reproducible demonstration; optional AI and speech features. Complete each milestone's exit conditions before optional scope.

### Goal to set in Codex

> Implement and verify a complete local-first Sevaro Challenge 1 prototype in this repository using this build plan and the attached Sevaro folder/ZIP. Deliver an interactive caselog, proactive source-cited hospital guidance, grounded free-text questions, dynamic guide import, time/data-quality handling, completion gates, and a reproducible evaluation suite covering all sponsor examples plus unfamiliar synthetic data. Keep the core runnable without paid services or production access. Continue through implementation, debugging, build, tests, UI inspection, and a rehearsable demo; do not stop at planning or scaffolding. Report actual measured results and remaining limits honestly.

### First actions in the target VS Code workspace

1. Read applicable repository instructions (including AGENTS.md), inspect existing code and package manager, and locate the supplied Sevaro folder/ZIP using workspace file search.
2. Inspect archive entries before extraction; reject path traversal or executable content. Extract PDFs and JSON/CSV only into a task-specific source directory. Do not execute anything inside the archive. If the folder and ZIP duplicate the same files, deduplicate by checksum.
3. Read the complete Challenge 1 brief. The known ZIP contains two PDFs, not the machine-readable dataset; absence of JSON/CSV is expected and is not a blocker. Use Appendix A or the actual PDF tables to reconstruct seeds. If the attached brief is a newer version, record the differences and follow its explicit requirements over this plan's proposals.
4. If no Sevaro files can be found, continue using Appendix A and clearly record that fallback. Do not ask the user to repeat the entire conversation.
5. Create a short task checklist in IMPLEMENTATION_STATUS.md, inspect runtime compatibility, and begin Milestone 1. Use the existing viable stack, or scaffold the default stack in an empty project without overwriting user files.
6. Treat the goal as permission to create and test local project files. Do not infer permission to publish the app, send messages, access hospital accounts, incur charges, or deploy publicly.

## 1. Product objective and evidence boundary

Build a hospital-specific workflow companion embedded in an illustrative remote neurology consultation form. As a clinician opens an encounter, changes a field, moves between workflow steps, or attempts completion, display the applicable instruction from the correct hospital guide. Stay quiet when no rule applies. Every surfaced answer or nudge must identify its hospital and supporting field.

The actual problem is a physician having to interrupt documentation, open a hospital guide, find a rule, and return. Different hospitals have different locations, service hours, order permissions, note titles, escalation responsibilities, and completion requirements. The software should bring the relevant documented instruction into the encounter workflow.

The team has selected Challenge 1 only. Do not build the Challenge 2 staffing dashboard, routing optimization, split-shift offers, or workforce forecast.

Facts versus proposals:

- Sponsor requirement: primary proactive nudges, secondary on-demand questions; 500 ms nudge delivery; read-only guides; graceful guide failure; new hospitals and fields added through data; supplied scenarios and validation examples.
- Organizer clarification supplied by the user: judging data arrives at judging. Development uses synthetic examples. The exact machine-readable judging schema has not been provided.
- Public company description: Synapse supports consultation/documentation workflows. This is not evidence of an accessible developer SDK, live transcript API, specific hosting topology, or per-field production event feed.
- Proposed in this document: React form, local event adapter, canonical schema, rule compiler, dynamic renderer, structured answer resolver, optional server-side language-model adapter, and import mapping UI.
- The real guide's 80+ fields are guide fields, not a confirmed 80-field caselog. The seven supplied synthetic guides expose a smaller set. Do not invent a giant clinical form to match the number 80.
- All supplied hospital names, systems, procedures, destinations, and rules are synthetic. The prototype organizes and cites those rules; it does not decide treatment eligibility, doses, or medical care.

Working product name: **Encounter Guide**. Header subtitle: **Illustrative Synapse workflow companion · Synthetic demo**. This is a prototype name, not an official Sevaro product.

## 2. What the completed prototype must demonstrate

1. Open an active encounter with hospital, consult/encounter type, and an explicit clock; preload that hospital's guide.
2. Render caselog steps and fields from a field registry; emit structured context changes through one adapter.
3. Match relevant guide rules, resolve time-dependent branches, assess source quality, and display the appropriate tier with citations.
4. Support answered, not-in-guide, time-dependent, stale, conflict, and hard-stop primary statuses. Preserve overlapping quality flags.
5. Pass N1–N9, including silence for N8; pass V01–V20 with expected meaning, status, and source. These are automated acceptance fixtures, not hard-coded answer strings used by the product.
6. Block synthetic encounter completion when known required charge/plan-confirmation conditions are incomplete, then allow completion when satisfied.
7. Ask a free-text hospital-guide question, resolve it to a concept and relevant date/time, and answer from that hospital only.
8. Import an unfamiliar hospital and new guide field without rebuilding or restarting. Show the source record, mapping/interpretation diagnostics, and supported behavior.
9. Demonstrate guide unavailable, stale data, missing fields, conflicting sources, and undefined coverage hours visibly.
10. Export an evidence-rich evaluation report and show actual measured field-to-guidance latency.

Mandatory actions happen inside the mock form. Do not require screen recording, a meeting bot, a browser extension, or a real hospital login for the main demonstration.

## 3. Scope and delivery priorities

| Priority | Deliverable | Exit condition |
|---|---|---|
| P0 | Domain types, source-preserving guide loader, seeded fixtures | Source values, omissions, dates, and all required IDs are reproduced faithfully. |
| P0 | Encounter form, context events, local rule evaluator | A real field change causes a source-backed message; changing context changes the result. |
| P0 | Time and quality handling | Undefined hours, staleness, conflicts, and cross-zone cases pass. |
| P0 | Completion gates | N5 and N7 block and subsequently resolve; no arbitrary dismiss bypass. |
| P0 | Question resolver | V01–V20 pass; unrelated/missing questions do not borrow answers. |
| P0 | Import and unfamiliar-data handling | New hospital and a new guide field appear and work without code changes. |
| P0 | Evaluation and demo flow | Full challenge suite, integration smoke tests, and latency report work. |
| P1 | Guided import of unfamiliar text/schema | Preview, diagnostics, validated interpretation, partial unsupported records handled clearly. |
| P1 | Clinician usability and accessibility polish | Clear layout, keyboard operation, restrained alerts, inspectable evidence. |
| P2 | Optional model-assisted interpretation and question parsing | Provider-off fallback works; invalid model output cannot change rule behavior. |
| P2 | Optional scripted speech intent stream | Clearly labeled simulation, uses same engine, does not bypass form acceptance suite. |
| Later | Production Synapse adapter, authenticated deployment, clinical validation | Requires verified interfaces, controls, and separate validation; not a hackathon claim. |

## 4. Recommended stack and project shape

For a new repository, use React + TypeScript + Vite. Use a compatible supported Node runtime, inspect current package requirements during setup, and pin the working versions in the lockfile. Avoid brittle version numbers copied from this document. Use Zod or an equivalent runtime schema validator at every import boundary. Use an IANA-zone-aware date library such as Temporal with a compatible polyfill; do not assume all target browsers provide Temporal natively.

Use ordinary accessible components and CSS/design tokens; a component library is optional. Use React reducer/context for encounter state unless the existing project already uses a suitable state library. Use Vitest or the project's existing test runner for domain tests, and Playwright for a small number of end-to-end paths. These tools are choices, not sponsor requirements.

Default runtime: local-first web app. Seed guides ship with the app. Imported synthetic guides and encounter drafts may persist in IndexedDB behind a storage adapter. Add a reset-demo command. Do not store real patient data. No database account or paid service should be necessary to run the core.

If a real LLM API is added, place it behind a small server route. API keys must remain server-side; never put them in a browser bundle or VITE-prefixed environment variable. This service is optional and cannot sit on the per-field 500 ms path.

Suggested structure (adapt to the existing repository):

```text
src/
  app/                 # navigation, layout, demo mode, error boundary
  domain/              # types, schemas, tri-state predicates, IDs
  data/                # source records, seeds, guide versions, storage adapter
  imports/             # JSON/CSV adapters, column mapper, preview, diagnostics
  knowledge/           # concepts, aliases, source spans, rule compilation
  engine/              # relevance, schedules, quality flags, gates, templates
  encounter/           # reducer, event adapter, workflow/field registry
  questions/           # concept resolver, temporal query parser, grounded answers
  components/          # form fields, nudge cards, evidence drawer, status badges
  evaluation/          # scenario runner, result export, latency instrumentation
  optional-ai/         # provider interface, schema validation, safe fallback
data/
  raw/                 # original synthetic values preserved verbatim
  normalized/          # reviewed, versioned canonical seed bundle
  fixtures/            # challenge questions/scenarios and independent expected outcomes
  holdout/             # extra synthetic hospitals/scenarios
docs/
  IMPLEMENTATION_STATUS.md
  DECISIONS.md
  DATA_CONTRACT.md
  DEMO_SCRIPT.md
tests/
  domain/
  acceptance/
  e2e/
```

Expected scripts by delivery: `dev`, `build`, `typecheck`, `test`, `test:acceptance`, `test:e2e`, and `evaluate`. Use the repository's package manager. Document exact working commands and any required environment values in README. The core must work without `.env`.

## 5. User experience and screens

### 5.1 Clinician workspace

At desktop size use a readable two-column encounter layout: main form and narrower contextual guidance panel. Put inline guidance next to the relevant field where practical. On narrow screens, guidance follows its field in reading order. Show the active hospital, encounter type, hospital-local time, and guide version prominently enough to prevent context confusion.

A small demo-control area lets the evaluator select an example encounter, adjust the simulated instant, select provider time zone, and simulate guide outage. Keep technical diagnostics out of the main clinical flow. Do not create a mandatory login screen or decorative landing page.

Workflow steps: Intake, History, Imaging, Recommendation, Note, Sign-off; Rounding is a distinct encounter workflow with relevant fields. Preserve form values on navigation. A future-step nudge should not interrupt the current step unless the source rule and configured trigger justify it.

Opening a case is the proposed Phase 1. Display only a few applicable opening facts, not every high-stakes rule at once. Use source-supported Video Eval Location/Wake Up Protocol info for the seeded intake mapping. Ambiguous or conflicting opening information gets a visible uncertainty badge rather than a guessed instruction. Do not assume a 30–60 second preparation window.

### 5.2 Guidance card

Each card contains: short title; one actionable or informational sentence; tier label; primary status; additional flags; hospital; source field; verification date when present; and an expandable original source excerpt. Time-dependent cards show the relevant local time and schedule branch. Conflict cards show both sources. Avoid medication imagery or medical advice beyond the synthetic source wording.

Info: quiet inline hint or panel item, also accessible without hover. Advisory: visible beside the field, nonblocking. Hard stop: focused inline completion error listing what is missing and where to fix it. Red is reserved for an actual completion block; amber for warnings/uncertainty; blue for information; green for resolved status. Always include text/icons; do not rely on color alone.

Advisory dismissal/acknowledgement is encounter-local and logged. It does not edit guide data and does not silently disable future changed-context guidance. Required completion gates have explicit satisfaction predicates; a generic acknowledgement cannot stand in for an entered charge or a confirmed patient plan.

### 5.3 Ask the guide

A compact panel accepts free text and uses the current hospital by default. Show the hospital next to the input. Resolve concepts and any date/time in the question, then evaluate the same source data as proactive nudges. Ask a focused clarification when a question's date/time or concept cannot be determined. A guided field picker is an accessible fallback, not a replacement for the required free-text questions.

### 5.4 Guide explorer/importer

Separate navigation from the encounter. Browse the current source records, source type, last-verified date, interpretation state, and hospital. Allow upload/paste of synthetic JSON and CSV, preview mapped records, review diagnostics, and activate a validated bundle. The clinician workspace cannot edit the guide. An importer creates a new immutable version; it does not modify the original raw file.

### 5.5 Evaluation workbench

Load challenge fixtures, run them through the real domain engine, show expected versus actual outcomes and source IDs, and export JSON/CSV. Include one-click scenario launch into the encounter workspace. Keep pass/fail computation independent from the rendering under test. Never show a hard-coded 100% badge or simulated latency as measured output.

## 6. Domain contracts: proposed internal schema

These contracts are intentionally independent of the unknown judging format. Build adapters into them. Exact property names below are ours, not Sevaro APIs. All times/dates in tests are injected; do not use the wall clock by default for sponsor fixtures.

```ts
type KnownValue<T> =
  | { state: 'known'; value: T }
  | { state: 'unknown' }
  | { state: 'not_applicable'; reason?: string };

type Step = 'intake' | 'history' | 'imaging' | 'recommendation'
  | 'note' | 'sign_off' | 'rounding';
type Tier = 'info' | 'advisory' | 'hard_stop';
type AnswerStatus = 'answered' | 'not_in_guide' | 'time_dependent'
  | 'stale' | 'conflict' | 'hard_stop';

interface EncounterContext {
  encounterId: string;
  hospitalId: string;
  consultType: string;        // e.g. Stroke or General Neuro
  encounterType: string;      // e.g. Acute or Rounding; keep concepts distinct
  step: Step;
  instant: string;            // ISO instant/offset timestamp, unambiguous
  hospitalTimeZone: string;   // IANA zone, e.g. America/Chicago
  providerTimeZone: string;
  phase: 'pre_assessment' | 'active' | 'documentation' | 'sign_off';
  values: Record<string, KnownValue<unknown>>;
  guideVersion: string;
  revision: number;
}

interface EncounterEvent {
  id: string;
  encounterId: string;
  type: 'encounter_opened' | 'step_changed' | 'field_changed'
    | 'field_focused' | 'completion_requested' | 'clock_changed'
    | 'guide_changed' | 'hospital_changed';
  fieldId?: string;
  value?: KnownValue<unknown>;
  occurredAt: string;
  revision: number;
}

interface SourceField {
  id: string;
  hospitalId: string;
  sourceKind: 'guide' | 'storyboard';
  sourceName: string;
  sourceVersion: string;
  originalFieldName: string;
  conceptId?: string;
  rawValue: string;
  lastVerified?: string;      // YYYY-MM-DD; absent is unknown, never invented
  updatedAt?: string;         // distinct from verification
  locator?: string;           // file/page/JSON pointer/CSV row
  interpretation: 'supported' | 'partial' | 'needs_review' | 'unsupported';
}

interface FieldDefinition {
  id: string;
  label: string;
  step: Step;
  inputType: 'text' | 'textarea' | 'select' | 'tri_state' | 'datetime';
  options?: Array<{ value: string; label: string }>;
  aliases: string[];
  conceptIds: string[];
  encounterTypes?: string[];
}

interface Citation {
  sourceFieldId: string;
  hospitalId: string;
  fieldName: string;
  sourceKind: 'guide' | 'storyboard';
  sourceVersion: string;
  rawExcerpt: string;
  lastVerified?: string;
  locator?: string;
}

interface GuidanceResult {
  id: string;
  hospitalId: string;
  ruleId: string;
  anchorFieldId?: string;
  tier: Tier;
  primaryStatus: AnswerStatus;
  flags: Array<'stale' | 'conflict' | 'time_dependent'
    | 'verification_unknown' | 'schedule_unknown' | 'interpretation_review'>;
  title: string;
  message: string;
  citations: Citation[];
  rationale: string;
  effectiveInstant: string;
  blocksCompletion: boolean;
  missingRequirements: string[];
}
```

Additional contract rules:

- Keep `consultType` and `encounterType` separate, but adapt fixtures that use a combined label. Do not require metadata the source does not provide unless a rule actually needs it.
- `phase`, `plan_confirmed`, action-state markers, audit IDs, and revisions are proposed prototype extensions, not supplied sponsor context fields. Document them as such.
- Unknown, false, missing, and not applicable must not collapse into JavaScript truthiness.
- A literal field value `No` is a known negative. A missing EEG Friday schedule can be unknown even if other weekdays are listed; see V04. Source semantics determine this.
- For not-in-guide answers, cite the queried hospital, requested field/concept, and guide version searched; mark the field absent. Do not fabricate a SourceField or a quote that does not exist. Support this via a separate MissingFieldEvidence type in the implementation.
- Guidance unavailable is a system-health state, not a seventh sponsor answer status. Keep it separate from a missing field in an otherwise loaded guide.
- Retain all raw imported fields, including those not recognized. Schema validation must not strip unfamiliar keys silently.
- Guides, compiled rules, field registry, and trigger mappings must have explicit versions. An async answer response must be discarded if its encounter/hospital/revision no longer matches.

## 7. Data model for rules and triggers

Separate three layers: immutable source facts, validated interpretations, and trigger mappings. A new hospital mainly changes facts. New field definitions and mappings are configuration. The engine supports a finite documented vocabulary of conditions and effects.

Use a declarative predicate AST with allowlisted operators such as equals, in, exists, all, any, not, schedule_match, and required_state. Evaluate predicates with TRUE/FALSE/UNKNOWN semantics. Do not execute strings from imported data, `eval`, arbitrary JavaScript, or model-written functions.

A compiled rule includes: ruleId, hospitalId, sourceFieldIds, conceptId, scope, trigger references, condition AST, optional schedule branches, effect/template key, default tier, interpretation state, and version. An effect can show a source-grounded fact, select a documented workflow branch, expose a conflict, or gate encounter completion against explicit requirements. It cannot prescribe new treatment.

Keep response text templates generic. Templates insert values/actors/destinations from the current hospital's data. Never branch runtime logic on `SYN-006` or any other known hospital ID. Known hospital IDs belong only in fixtures and source bundles.

To support new guide fields: register the field as searchable/displayable immediately; preserve raw text and source. If it maps to an existing concept/rule family, reuse the generic evaluator. If it introduces a new supported trigger mapping, load that configuration as data. If its semantics cannot be compiled, show the source with interpretation uncertainty and require review; do not pretend to invent a new safe executable behavior. Be honest about this boundary during judging.

Both new fields and new hospitals must be accepted without application source edits. Unlimited interpretation of arbitrary new clinical rule types is not a defensible promise. The importer and generic field explorer are required even when a new field has no proactive trigger yet.

## 8. Rule engine sequence and time handling

On every relevant event:

1. Validate event/encounter identity and apply the state update in a reducer.
2. Resolve the exact hospital, guide version, and field/concept aliases.
3. Select trigger mappings applicable to event, step, consult type, and encounter type.
4. Retrieve only that hospital's mapped source records and relevant storyboard records.
5. Evaluate predicates and schedules, retaining UNKNOWN instead of guessing.
6. Assess missing data, staleness, semantic disagreement, and interpretation limits.
7. Build source-backed guidance objects or an empty list.
8. Reconcile active cards: update changed messages, remove no-longer-relevant guidance, deduplicate repeated events.
9. Render at the field and record event-to-render latency. Log structured rationale for diagnostics.

Use source-supported branch evaluation, not an LLM deciding every nudge. The user-visible explanation can be templated from the evaluated rule. The optional model may interpret text at import or resolve a question to a concept, but runtime critical behavior uses validated structured data.

### Time rules

- Use one explicit encounter instant and the hospital's IANA zone. Derive displayed hospital/provider local times from that instant. Never compare provider wall time directly with a hospital schedule.
- Parse calendar dates as calendar dates; do not accidentally shift last-verified dates through UTC conversion. Staleness uses calendar-day age against the encounter date at the hospital; strictly greater than 180 days is stale. At exactly 180, it is not stale under this rule.
- Sponsor baseline: 17 March 2026, with specific V-case dates overriding it. Most guide fields last verified 2 February 2026 unless marked otherwise. Do not use October 2026 as the automatic demo date: that would make many expected-current fields stale.
- Normalize weekday names/ranges, daily, 24/7, multiple windows, overnight windows, and on-call qualifiers. An on-call service is not equivalent to an always-staffed service.
- Proposed boundary convention: start-inclusive, end-exclusive for explicit ranges. Document and flag for sponsor confirmation. Avoid claiming exact endpoint behavior was specified by the brief.
- `staffed hours` without hours is unresolved. Never borrow the LVO coverage window as pharmacy coverage, even at the same hospital.
- If an imported timestamp offset and stated local time/zone disagree, report it. Do not silently choose the interpretation convenient for the test.
- Ambiguous/nonexistent daylight-saving local times require an offset or explicit disambiguation. Do not silently coerce them.
- A query can ask about a different date from the encounter. Evaluate availability for the queried time; assess guide staleness relative to the encounter/reference date and document that distinction. Sponsor fixture dates serve as their encounter/reference times where supplied.
- Default demo clock is paused/reproducible. Optional ticking mode must reevaluate active time-sensitive guidance at relevant boundaries without a field edit. Never repeatedly re-alert unchanged content each second.

### Primary status and overlapping flags

Do not implement a single unconditional precedence list that erases meaning. Answer the question being asked, then preserve additional flags. V18 is time-dependent with stale flag; V13 is stale with the known listed Thursday window; V12 is conflict even if one source is older; V04 is not-in-guide for Friday, with the EEG record's age available as additional evidence.

For actual completion attempts with a confirmed incomplete mandatory condition, primary status is hard_stop. The gate comes from a validated explicit requirement, not model tone or confidence. Any condition based solely on stale/conflicting/unsupported source data needs visible uncertainty and a documented handling policy. Do not invent a clinical override workflow. The sponsor brief does not resolve every gate/quality overlap; record that as a limitation and test the chosen prototype policy separately from required scenarios.

For demo defaults: activate gates only from supported, unambiguous applicable requirements; otherwise show uncertainty and do not introduce a new synthetic gate. Existing host-app validation is outside this companion and must never be disabled. This choice must be labeled a prototype policy, not a production safety rule.

## 9. Required field registry and trigger map

Start with the following form fields. Labels are understandable to a clinician; internal IDs are stable concepts. Include an explicit unknown/unset option for fields where absence is meaningful. Do not build a diagnosis engine, dosage calculator, or complete EHR.

| Step | Proposed field IDs | Purpose |
|---|---|---|
| Intake | hospital_id, consult_type, encounter_type, reason_for_consult | Establish encounter context. |
| History | last_known_well_status, last_known_well_time, allergies | Reproduce unknown-history and allergy triggers. |
| Imaging | cta_done, lvo_present | Reproduce CTA availability and LVO workflow triggers. |
| Recommendation | thrombolytic_given, thrombolytic_order_placed, assessment_plan | Reproduce source-defined preparation/order guidance and EEG mention. |
| Note | note_title, note_body | Required title and draft preview; no auto-signing. |
| Sign-off | charge_entered, plan_confirmed | Charge and local-provider confirmation conditions. |
| Rounding | rounding_encounter_opened, rounding_order_intent | Show schedule and order-permission guidance. |

`plan_confirmed` is an explicit prototype extension needed to resolve N7. It represents confirmation recorded by the user, not automatic proof that the hospital provider agreed. When initially unknown, ask for confirmation before completion where required.

Trigger configuration must cover the sponsor's eleven rows:

| Row | Trigger | Source fields | Default tier |
|---|---|---|---|
| T01 | Encounter opens at Intake | Video Eval Location; Wake Up Protocol | Info |
| T02 | Last known well set to Unknown | Wake Up Protocol | Advisory |
| T03 | Relevant thrombolytic allergy entered | Thrombolytic | Advisory |
| T04 | CTA result entry/CTA done Yes | CT Perfusion; AI | Info |
| T05 | LVO present set to Yes | LVO Protocol, evaluated at local time | Advisory |
| T06 | Thrombolytic given set to Yes | Thrombolytic; Mix Model; Order Entry; Order Set Name | Advisory |
| T07 | Order-entry field displayed/focused | Order Entry; Order Set Name | Advisory |
| T08 | Seizure or EEG mentioned in assessment/plan | EEG availability at relevant local time | Info |
| T09 | Note created | Required Note Title | Advisory |
| T10 | Complete attempted | Charge Entry; Consult Completion Rule | Hard stop where a requirement is unmet |
| T11 | Rounding encounter opened | Rounding Timing; When Do We Round?; Rounding Orders | Info |

The original trigger table names Rounding Timing/Rounding Orders. Use When Do We Round? as a linked source to correctly implement N9; preserve original names and document the alias/relationship. Similarly, the form field allergy extraction should distinguish `none` from a positive relevant allergy. Avoid inferring allergy severity or recommending medication substitutions.

T06 is explicitly triggered by a recorded `given` field. That can occur after administration. Label source guidance as workflow information/review at that point; do not claim that the nudge prevented an already-completed action. Support a proposed phase/action-state hint to distinguish intent from completion without changing the required input path.

N4 requires suppression of an order-set-name nudge when the remote physician cannot enter the medication orders. Show the permission/responsibility message, not an instruction for the remote physician to select a named local order set. Do not generalize SYN-004's restriction to every type of order; preserve the source's medication-order wording.

Focusing/hovering should never establish a clinical fact. Use focus/display for T07 and quiet help only. Use committed field edits for T02–T06. If text analysis is debounced, keep relevant seeded field-change latency within the required limit; expensive model calls cannot be on this path.

## 10. Source reconstruction and import workflow

### Seed data

Reconstruct all seven supplied hospitals from Appendix A or the PDF, including all guide fields, omissions, the two storyboard records, dates, and exact synthetic order-set strings. Do not populate a missing required-note-title field from another site. Do not add a field because every other site has it.

All guide fields default to lastVerified=2026-02-02 only for this specific sponsor seed set. Overrides: SYN-004 EEG=2025-06-10; SYN-006 Thrombolytic Mix Model=2025-08-15. Storyboard updated dates are not interchangeable with last-verified dates. The SYN-002 storyboard is old, but the brief defines stale behavior for guide fields; expose storyboard date without inventing a required stale classification. Document this ambiguity.

Canonical files to create (our reconstruction, not an official sponsor machine schema):

- hospital_guides.json
- storyboard_notes.json
- caselog_field_map.csv
- encounter_context_example.json
- validation_set.csv
- nudge_scenarios.json
- field_registry.json
- seed_provenance.json

Source extraction should preserve exact text alongside normalized values. Before declaring seeds complete, compare the reconstructed field inventory against every PDF table row and show per-hospital counts. Compute counts instead of assuming a previously reported total is correct. Keep source-to-normalized-record links.

### Import flow

1. Accept synthetic JSON/CSV through a file input or paste area. For demo simplicity, importing PDF directly is optional; conversion of the attached source PDF can happen during development.
2. Inspect top-level shape and parse safely. Support a documented canonical bundle, a list of per-field records, and a hospital object containing a field map. CSV uses a header mapper. The exact official schema remains unknown.
3. Offer mapping for hospital ID/name, timezone, guide field name, value, verification date, source type, and source version. Show sample rows. Do not silently guess timezone or freshness.
4. Normalize benign naming differences and aliases while preserving originals. Preserve unknown fields. Reject cross-hospital record contamination or duplicate identities that silently overwrite records.
5. Compile supported semantics using reusable parsers/concept templates; mark ambiguous records partial or needs_review. Optional model assistance returns schema-constrained drafts with source spans, not executable code.
6. Show a preview: hospitals, fields, schedules, conflicts, unsupported items, and parse errors. Well-formed canonical data with supported meanings should load without manual per-field editing. Use manual mapping/review only for genuinely unknown formats/semantics.
7. Validate internally and activate atomically. If activation fails, retain the previous known-good bundle. Store original raw import and diagnostics.
8. Add the hospital to the encounter selector immediately. Invalidate stale cached answers by hospital/version. No rebuild or restart.
9. If updating an existing hospital, keep the active encounter pinned to its version until the evaluator explicitly refreshes it in demo mode; show that a newer version exists. This is a proposed reproducibility policy, not a sponsor requirement.

Do not disguise authoring rules during the live test as automatic interpretation. A review action should be explicit in diagnostics. Demonstrate at least one unseen hospital with standard supported semantics loading and operating directly.

### Unknown field behavior

For a new static field `Interpreter connection procedure`, store and expose its exact source value and allow free-text lookup using its label/aliases. It may be Answered if retrieval is unambiguous and needs no unsupported interpretation. If it contains conditional text the parser cannot evaluate, quote the supported source and flag interpretation uncertainty; do not invent the branch that applies now. A new proactive field mapping can be added through declarative configuration only when it fits supported conditions/effects.

## 11. On-demand question resolver

The no-key baseline must handle all V examples with general concept aliases and question intent parsing, not question-ID switches. Useful concepts include video location, LVO pathway, rounding permission/window, EEG availability, CT perfusion, order set, sign-off, required note title, preparation responsibility, and pediatric neurology coverage.

Pipeline:

1. Bind to current hospital and encounter revision.
2. Extract candidate field concepts, encounter qualifier (e.g. stroke versus general), intent (fact, availability, permission, completion), and temporal reference.
3. Rank candidate concepts using labels, synonyms, and source field names. Include unfamiliar imported static fields in this index.
4. If ambiguous, request a concise clarification or show candidate source fields; do not make an unsupported selection.
5. Evaluate the matched source using the same time/quality engine.
6. Return a concise result, original source excerpt(s), applicable time, primary status, flags, and any missing detail.

For V-case testing, fixtures supply the date/time and encounter context; do not require parsing an omitted date from the question itself. For ordinary user questions such as “on Friday,” use an explicit contextual date resolution policy, display the interpreted date, and ask if more than one plausible interpretation matters. Future tests can pass explicit questionReferenceInstant.

Permission questions must account for scope: medication changes during rounding are different from acute stroke order entry. A question about a missing note title must not match general note text by loose similarity. “Who mixes TNK?” maps to preparation responsibility, not a treatment recommendation.

A model-enhanced resolver is optional: it returns only concept IDs, qualifiers, and structured temporal intent. Validate those against available fields and allowed concepts. The model cannot supply missing facts, choose between conflicting sources, or claim a guide is current without metadata. Preserve an offline fallback and timeout UI.

## 12. Hard stops, failures, and state consistency

On Complete, synchronously evaluate applicable source-backed gates against the latest encounter revision. Disable/reject completion in the mock while a supported mandatory condition is false or unknown. Explain the exact requirement and navigate to its field. On resolution, reevaluate and allow completion. Repeated Complete clicks must not create duplicate logs or bypass the gate.

Charge rule: when the synthetic guide explicitly requires charge before sign-off, `charge_entered=true` is needed. A checkbox in the prototype records that statement; it does not create a real hospital charge.

Plan rule: SYN-004's source requires confirmation from the hospital provider; `plan_confirmed=true` resolves the prototype gate. Do not infer agreement merely from text saying the recommendation was written.

Guide outage: the companion reports “Hospital guidance unavailable” and the caselog continues working, as required. A missing entire guide is not equivalent to a loaded guide saying no charge is required. Document that the prototype cannot establish guide-based completion requirements while unavailable; do not claim verified compliant completion. Do not leave an invisible stale block from a previous hospital or disable unrelated host-app validation. If the simulated guide cache remains available, show cache/version state rather than pretending the evaluator has no source.

Hospital switch: clear incompatible encounter values, source cards, dismissals, cached answers, and gate state, or ask the user to create a new encounter. For the demo, prefer a new encounter per hospital switch so clinical values are not silently reused. Maintain scenario-loader behavior explicitly.

Quality of input: invalid timestamps, malformed rules, or broken imports result in diagnostics and a safe fallback; they do not crash the form. Escape all imported text before rendering. Bound upload sizes, row counts, nesting, and regex work so malicious or malformed fixtures cannot freeze the UI. Use a worker for expensive import/normalization if needed; do not put slow ingestion into field handlers.

Audit for this prototype is an encounter-local append-only event list with event ID, hospital, guide version, trigger, result, source IDs, primary status/flags, dismissal/resolution, and measurement. It is useful debugging evidence, not a tamper-proof compliance audit.

## 13. Required acceptance cases

Fixture expected outputs must be authored from the source, not generated by the same parser under test. Compare semantics, actors, sources, tier, status, flags, and blocking behavior; do not require one exact prose string. Appendix A includes original wording and times.

### Nine proactive scenarios

| ID | Context and event | Minimum expected result |
|---|---|---|
| N1 | SYN-002; Stroke; Imaging; LVO Yes; Tue 14:00 Mountain | Advisory: no thrombectomy capability; tell ED provider, who activates transfer center; synthetic preferred destination Metro Neuroscience Institute. |
| N2 | SYN-006; Stroke; Imaging; LVO Yes; Tue 19:30 Central | Advisory: outside Mon–Fri 07:00–19:00; ED provider initiates transfer; do not instruct activation of EVT team. |
| N3 | SYN-003; Stroke; History; last known well Unknown; Tue 03:10 Pacific | Advisory: wake-up protocol is in use. Do not add treatment eligibility instructions. |
| N4 | SYN-004; Stroke; Recommendation; thrombolytic given Yes; Tue 16:00 Eastern | Advisory: remote neurologist does not enter medication orders; hospital provider uses local set; suppress order-set-name nudge. |
| N5 | SYN-007; Stroke; Complete clicked; charge false; Tue 14:00 Eastern | Hard stop until required encounter charge is recorded; cite Charge Entry. |
| N6 | SYN-005; Stroke; Imaging; CTA done Yes; Tue 14:00 Eastern | Info: CT perfusion unavailable; AI field is ClarityLVO, synthetic. |
| N7 | SYN-004; General Neuro; Complete clicked; plan not confirmed; Tue 15:00 Eastern | Hard stop until hospital provider confirms plan; cite Consult Completion Rule. |
| N8 | SYN-002; General Neuro; History; allergies none; Tue 14:00 Mountain | No new nudge from this event. Clear previous event-specific cards when irrelevant. |
| N9 | SYN-001; Rounding opened; Sun 08:00 Central | Info: rounding is Monday–Friday; check why Sunday encounter exists. |

Use Tuesday 17 March 2026 for Tuesday nudge fixtures and Sunday 22 March 2026 for N9 as an explicit inferred fixture date. The PDF provides weekday/time without dates for N scenarios; record that choice in provenance. It must not be represented as sponsor-provided.

### Twenty on-demand cases

| ID | Hospital and question intent | Expected status/meaning |
|---|---|---|
| V01 | SYN-001 video location | Answered: ED patient room. |
| V02 | SYN-002 LVO workflow | Answered: ED activates transfer center; named synthetic preferred destination. |
| V03 | SYN-003 rounding orders | Answered: inpatient neurology orders permitted per synthetic guide. |
| V04 | SYN-004 EEG Friday 20 Mar 10:00 | Not in guide: only Tue/Thu listed; do not infer Friday availability or nonavailability. |
| V05 | SYN-005 CT perfusion | Answered: No; not missing. |
| V06 | SYN-006 weekday LVO after 19:00, Tue 19:30 | Time-dependent: listed staffed window ended; ED initiates transfer. |
| V07 | SYN-007 order set | Answered: not applicable; remote neurologist does not enter orders. |
| V08 | SYN-001 LVO Tue 22:30 | Time-dependent: coverage hours unspecified; show both documented branches and unknown hours. |
| V09 | SYN-006 LVO Sat 21 Mar 10:00 | Time-dependent: weekday-only coverage; ED transfer pathway. |
| V10 | SYN-007 sign-off, charge incomplete | Hard stop: required charge first. Fixture must explicitly model charge state. |
| V11 | SYN-005 rounding medication changes | Answered: hospitalist co-sign required. No medication advice. |
| V12 | SYN-002 stroke video location | Conflict: guide CT holding bay versus storyboard patient room; show both. |
| V13 | SYN-004 EEG Thu 19 Mar 10:00 | Stale: listed Thu 08:00–15:00, last verified 10 Jun 2025; flag possibly outdated. |
| V14 | SYN-002 pediatric neurology | Not in guide; no cross-hospital fallback. |
| V15 | SYN-005 thrombolytic order set | Answered: preserve exact search string and synthetic identifier from source. |
| V16 | SYN-007 CT perfusion Sat 21 Mar 11:00 | Time-dependent: explicit Mon–Fri-only window, unavailable Saturday per source. |
| V17 | SYN-002 rounding, 08:15 Mountain/10:15 Eastern | Time-dependent: opens 08:30 Mountain/10:30 Eastern, in 15 minutes. |
| V18 | SYN-006 preparation Wed 18 Mar 20:00 | Time-dependent plus stale: staffed pharmacy hours undefined; source verified 15 Aug 2025; do not infer cutoff. |
| V19 | SYN-003 note title | Answered: Neurology Consult - Remote. |
| V20 | SYN-005 note title | Not in guide. |

Use the full source dates/times in Appendix A, not generic “today.” Nudge severity is not the same thing as question answer status. For V10, the answer says a completion gate applies; actual blocking occurs when Complete is attempted, not merely because the user asked a question.

## 14. Meaningful additional tests and coverage

The sponsor examples are a baseline, not proof of generalization. Add a small independently specified holdout set with synthetic IDs that appear nowhere in evaluator code. Target at least four additional coherent hospital configurations and 20–30 focused edge scenarios; these counts are proposed scope targets, not sponsor requirements. Prioritize new failure modes over mass-generated duplicates.

| Test family | Required property |
|---|---|
| Hospital identity | Changing one hospital's rule affects only that hospital. Randomizing IDs/names while preserving facts leaves semantics unchanged. |
| Time boundary | One minute before/opening/closing/after a supported window selects the documented branch under the chosen boundary convention. |
| Provider zone | Changing only provider display zone cannot change a hospital-local availability decision for the same instant. |
| Missing/negative | Deleting a field yields not-in-guide; replacing its value with No yields a known negative, not missing. |
| Freshness | Exactly 180 days versus 181 days changes stale flag only at the specified threshold. Missing verification date stays unknown. |
| Undefined hours | Undefined staffed hours never become guessed hours, even if another field/site has a schedule. |
| Conflict | Matching guide/storyboard values do not produce conflict; materially contradictory applicable values do. Compare encounter-specific meanings, not raw string inequality alone. |
| Context qualifier | Stroke CT holding bay and general patient room can both be valid branches; they are not automatically a conflict. |
| Repeated edits | Repeating the same state does not stack duplicate cards; reversing LVO Yes to No removes its event-specific guidance. |
| Completion | Acknowledging an advisory does not satisfy charge/plan gate; resolving the required field does. |
| Import | New hospital/new static field appears without restart; malformed import preserves existing bundle. |
| Async race | Delayed question/model output from hospital A is discarded after switching to B. |
| Persistence | Reload restores imported synthetic data and selected demo state predictably; reset clears only prototype-owned state. |
| Guide outage | Form remains usable, guidance-unavailable banner visible, no fictitious source answers. |
| Injection | Imported text cannot run script, change system instructions, make network requests, or create executable rules. |
| Timing of care | A retrospective action entry displays appropriate review wording rather than a false prevention claim. |
| Unknown new semantics | Unsupported rule is retained and inspectable; no invented execution behavior. |

For unfamiliar wording, change phrasing as well as values (e.g. weekdays 07:00–19:00 versus Monday through Friday, 7 am to 7 pm). If a form is not supported by the parser, the correct result is visible review/uncertainty rather than a silent wrong branch. Do not count all unsupported cases as success; report supported automatic interpretation coverage separately from safe abstention.

Use table-driven unit tests for time, source-quality, predicates, and gates; acceptance tests call the real engine and question resolver with independent expectations. End-to-end browser tests should cover: N2 live form behavior, N5 block/resolve, V12 conflict drawer, N8 silence, and unfamiliar hospital import. Avoid unit tests that simply call the same helper to derive both actual and expected answers.

Metrics:

- Required scenario pass rate: correct N cases / 9; correct V cases / 20. Show per-case details. Treat all required cases as the delivery gate, not an aspirational percentage.
- Supported import coverage: supported, partial, needs_review, unsupported records, with denominators.
- Citation integrity: every material displayed claim traces to same-hospital source fields or explicit missing-field evidence.
- Alert behavior: emitted unique cards, repeat suppression, silent events, resolved gates. Do not infer clinical benefit from a low alert count alone.
- Latency: field-event receipt to committed/paint-ready guidance in the browser; record method, environment, sample count, p50/p95/max. All measured required field-trigger cases should satisfy <500 ms; an under-500 p95 does not excuse observed slow required cases. Treat paint approximation honestly and include browser tracing for a suspicious result.
- No invented outcomes: do not claim reduced stroke disability, treatment time, or error rate from synthetic tests.

## 15. Optional AI integration and speech extension

Implement the core without a paid model dependency. If a key is supplied later, add a provider interface with strict schema validation, bounded inputs/outputs, timeouts, and a clear disabled state. Do not request a key before finishing deterministic core functionality.

Allowed model tasks: propose concept mappings for unfamiliar guide labels; extract a schedule/condition draft from source text; resolve a free-text question to available concepts; paraphrase already-grounded evidence without adding facts. Each draft references raw source spans and must pass deterministic validation. Unsupported concepts/conditions are rejected or left for review.

A model must not independently: select treatment, invent local rules, infer unspecified staffed hours, retrieve another hospital as fallback, decide a completion gate from emotional language, execute code, silently overwrite a guide, or mark a critical missing state complete. Self-reported model confidence alone is not validation. Compiling JSON successfully proves syntax, not clinical/semantic correctness.

For production-bound interpretation, human review of consequential new policies is a separate required workflow. The hackathon can demonstrate validated known rule families and transparent abstention. Do not present that as universal safe interpretation.

Optional speech demo only after P0 acceptance:

- Use a scripted synthetic transcript replay first. Label it clearly.
- Emit candidate intents containing speaker role, assertion/question, negation, temporality, source transcript span, and confidence.
- Route confirmed/mapped intents to the same rule evaluator; do not auto-populate confirmed clinical fields or satisfy completion gates from uncertain speech.
- A speech suggestion may appear before documentation, but its latency is reported separately from field-event latency.
- Live microphone access is optional and requires explicit browser permission; do not make judges depend on it in a noisy venue.
- No claim of access to Synapse's existing transcript stream. Recording/consent/privacy requirements remain production questions, not solved by deleting audio after processing.

## 16. Milestone execution plan

Treat these as ordered dependency gates, not a promise about hours. For a hackathon, allocate roughly the first third of remaining build time to the core vertical slice and data correctness, the next third to full requirements and import, and the final third to integration, UI, testing, and demo rehearsal. Do not consume the entire build window on research or framework choices.

### Milestone 1 — Repository, data, and domain contract

Tasks: inspect existing repo; load source brief; scaffold only if needed; define schemas; extract all source records; author field registry and trigger configuration; create explicit-clock fixtures; add source provenance and immutable guide versions.

Exit: app runs; source inventory is readable; all seven hospitals selectable in a simple explorer; missing fields remain missing; stale dates/storyboards preserved; no fabricated data. Validate seed reconstruction against Appendix A/PDF, not against an assumed record count.

### Milestone 2 — First complete vertical slice

Tasks: create mock encounter opening; hospital-local clock; Imaging step; LVO field; event adapter; pure evaluator; N2 time-dependent guidance; source drawer; Sign-off with N5 charge gate and resolution.

Exit: an actual user field edit changes actual guidance; changing the clock changes a supported branch; Complete is blocked and then allowed after required state change. The app is functional before optional AI.

### Milestone 3 — Complete trigger behavior and quality engine

Tasks: implement remaining caselog fields/triggers; source quality flags; conflict comparison; no-order permission suppression; rounding schedule; quiet behavior; stale/undefined-time results; guide-outage state; deduplication and context reset.

Exit: N1–N9 pass through engine and representative UI paths; neither N8 nor repeated edits produce spurious cards; all messages have evidence.

### Milestone 4 — Grounded questions

Tasks: concept index and aliases; natural-language intent/time handling; guided ambiguity resolution; answer templates; evidence drawer; stale/conflict/missing status composition; revision-aware async cancellation if applicable.

Exit: V01–V20 pass using real resolution/evaluation; rephrased questions for several concepts pass; changing source values changes answers; no exact-question switch statements.

### Milestone 5 — Dynamic import and unseen data

Tasks: JSON/CSV import; schema/column mapping; supported text parsing; source preview; validation diagnostics; atomic activation; unknown-field preservation; search index refresh; new hospital selector; version/cache invalidation.

Exit: import a new, independently authored hospital with changed names, timezone, schedule, and permissions; its guidance changes appropriately without code edits/restart. Import a new static field and ask about it. Demonstrate unsupported conditional wording honestly. Canonical known-format supported data must not require manual per-field editing.

### Milestone 6 — Integration, polish, and performance

Tasks: connect evaluation workbench; add persistence/reset/export; keyboard/focus/contrast review; responsive layout; error states; browser-level latency measurement; build/typecheck; target concrete failures uncovered by tests.

Exit: clean production build; all required tests pass; core works with external network unavailable after local app loads; no runtime console errors in demo paths; measured latency report and limits available.

### Milestone 7 — Demo and handoff

Tasks: rehearse the demo below from clean state; verify imported data survival/reset; write README, architecture notes, supported grammar, sample import contracts, source provenance, known limitations, and test report; capture screenshots or a short local recording if tooling permits.

Exit: another teammate can start the project and reproduce the demo using README alone. Report completed and deferred functionality. Do not mark tasks complete based only on code existing; exercise the actual user path.

### Milestone 8 — Optional enhancements

Only if P0 is complete: improve flexible language interpretation, add server model provider, scripted speech, or additional source-quality analytics. Cut these first if time is short. Do not cut missing-data handling, time zones, source citations, new-hospital import, or N8 silence to make room for speech.

Suggested team responsibilities: clinician owns trigger wording, useful timing, and source fidelity; one developer owns data/import/engine; one owns form/integration/UI; one owns fixtures/evaluation/demo. Combine roles as team size requires. This is a responsibility map, not a requirement to create multiple AI agents.

## 17. Five-minute demonstrable story

1. **Open an encounter:** choose a synthetic hospital, show local time and loaded guide. Explain that the same clinician works across hospitals with different instructions.
2. **Useful guidance:** set LVO Yes for SYN-006 at Tuesday 19:30 Central. Show correct after-hours branch, responsible actor, and source. Change the clock to a supported weekday time to demonstrate the source-driven branch change.
3. **Trust and restraint:** run N8 and show no irrelevant alert. Open V12 and show both conflicting sources; ask a missing-field question and show not-in-guide.
4. **Catch unfinished work:** attempt N5 sign-off; show charge gate. Record the required state; complete successfully. Explain that the prototype checkbox records completion rather than posting a real charge.
5. **Adapt live:** import a fresh synthetic hospital bundle. Demonstrate changed hours/order permissions and query a new static guide field. No restart or source-code edit.
6. **Show evidence:** open evaluation results and actual measured latency, identify unsupported interpretation behavior, and state the production integration remains a future adapter.

Use the required fixtures as honest reproducible demonstrations; do not fake live parsing through precomputed answers. A backup prerecorded clip may help the team present if the venue fails, but it must be labeled as a recording.

## 18. Decisions to take now versus questions to retain

| Topic | Prototype decision | Production/mentor question |
|---|---|---|
| Entry point | Open an active mock encounter with known hospital context. | Which assignment/notification event opens the actual caselog, with what data? |
| Form integration | Native event handlers in our mock. | Which Synapse event/UI extension interfaces exist? |
| Guide source | Attached synthetic brief plus imported synthetic bundles. | Exact judging schema; who owns/verifies guide updates in production? |
| Timing | Explicit encounter clock; allow phase-aware wording. | Which fields are entered before action versus retrospectively? |
| New semantics | Preserve, expose, compile supported concepts; flag others. | What is the expected boundary for arbitrary new fields/rule types? |
| Gate conditions | Explicit known charge/confirmation predicates. | Which gates permit acknowledgement/override, and by whom? |
| Source conflict | Show both applicable sources; no silent precedence. | Is there an authorized reconciliation workflow? |
| Undefined hours | Show branches and missing hours. | How are staffed hours obtained in production? |
| Exact time endpoints | Start-inclusive/end-exclusive convention in our tests. | Boundary conventions and holiday exceptions? |
| Guide outage | Keep caselog usable; show unavailable and unverified checks. | How should host completion and cached rules interact during outages? |
| Storyboard age | Show updated date separately from guide verification. | Does 180-day stale policy also apply to storyboard data? |
| Transcript | Optional scripted adapter only. | Is a real stream accessible, with what authorization and semantics? |

Do not block development waiting for these answers. Put the chosen prototype behavior in DECISIONS.md; revise when authoritative information arrives.

## 19. Definition of done and honest handoff

The working version is done when:

- [ ] An actual interactive caselog emits structured events and displays results from the real engine.
- [ ] Seven source hospitals are faithfully represented, including deliberately absent fields and storyboard values.
- [ ] All eleven trigger families are implemented or any justified re-tiering/departure is explicitly documented; all mandatory examples still pass.
- [ ] N1–N9 and V01–V20 pass, with meaningful assertions about sources, statuses, tier, actors, and completion conditions.
- [ ] Hospital and provider time zones, reference dates, staleness, undefined hours, and conflicts are handled visibly.
- [ ] Guidance includes same-hospital evidence, with explicit missing-field evidence rather than fabricated citations.
- [ ] Core paths run without LLM credentials or external APIs.
- [ ] New supported hospital data and a new static field can be imported and used without source edits/restart.
- [ ] Unsupported interpretations are visible; importer cannot create arbitrary executable code or silent hard stops.
- [ ] Required measured field-to-guidance cases meet 500 ms on the demo machine, with measurement method and actual results recorded.
- [ ] Guide failure leaves the mock encounter usable and communicates the limitation.
- [ ] Completion gates resolve correctly and cannot be bypassed by dismissing a card.
- [ ] At least one independent unfamiliar-hospital path and the key browser paths have been exercised.
- [ ] Keyboard navigation, evidence expansion, source conflict view, empty states, errors, and narrow-screen layout have been reviewed.
- [ ] Build/typecheck/test commands and clean-start instructions work.
- [ ] README states synthetic-only scope, integration assumptions, supported parsing grammar, fixture provenance, and remaining limits.

Final coding-agent response should include: what works; how to run; actual tests passed/failed; actual latency results; where the demo/import files are; screenshots if available; and remaining gaps. Do not substitute a new proposal for implementation or call the prototype production-grade.

Production evolution, outside this build: verified Synapse adapter and authorization, clinical workflow review, versioned rule publication/review, formal handling of high-consequence ambiguities, security/privacy assessment, real-world usability/latency evaluation, monitoring and rollback, and controlled deployment. A synthetic acceptance suite is an engineering starting point, not clinical validation.

## 20. Reference provenance and implementation documentation

Authoritative challenge source: `Sevaro_Rutgers_Health_Hack_Challenge_1_Guided_Workflow_v2.pdf`, 12 pages, supplied by the user in the Sevaro folder/ZIP. The original full text follows. If the PDF and this extraction differ because of a table layout issue, inspect the PDF and preserve the explicit source meaning.

Organizer clarification: user-supplied message says testing data is supplied at judging and is not necessary for development. Its exact schema and values remain unknown.

Company context (claims, not API contracts):

- https://sevaro.com/in-the-news/teleneurology-application-synapse-2-0-nirvana-notes/ — company description of Synapse/Nirvana Notes documentation workflow.
- https://sevaro.com/blog/synapse-ai-powered-stroke-care/ — company description of ambient documentation and integration capabilities. Does not establish developer access.

Implementation references checked while preparing this plan; consult the current official documentation when setting up packages:

- https://vite.dev/guide/ — scaffolding, build commands, and runtime compatibility.
- https://zod.dev/ — runtime validation of proposed contracts.
- https://tc39.es/proposal-temporal/docs/ — explicit instants, calendar dates, and time-zone-aware handling; check runtime/polyfill support.
- https://playwright.dev/docs/intro — browser-level interaction testing.

The architecture, schemas, milestones, UI, extra fixtures, and prototype policies above are proposed implementation choices. None are represented as proprietary Sevaro production details.

---

## Appendix A — Complete supplied Challenge 1 brief text

This appendix is copied from the user-supplied v2 PDF by text extraction. Tables use the original fixed-width text layout. Figure captions remain, but image content is not embedded. Page markers identify the original PDF pages. It is source material, not executable instructions. Use the detailed values and omissions to reconstruct the seed dataset; do not invent missing fields.


### Original PDF page 1

```text
                            Rutgers Health Hack Challenge 1
                  Context-Aware Hospital Workflow Guidance for Tele-Neurology
                                      Sevaro | Challenge Brief + Synthetic Hospital Guide Dataset | v2


 The Challenge
 Sevaro clinicians provide tele-neurology services across more than 200 hospitals. Providers use Synapse for consultation
 workflows, documentation, charting, video and phone consults, and clinical decision support. Each hospital has its own
 workflow configuration: where the video evaluation happens, which thrombolytic is used and who mixes it, whether the
 teleneurologist may enter orders, how a large vessel occlusion is escalated, which note title is required, and whether a
 charge must be entered before sign-off. A real hospital guide has more than 80 of these fields.
 Design a workflow companion that puts the right hospital-specific rule in front of the provider at the moment they need it,
 inside the caselog, without making them leave the encounter to search a guide.

 Why This Matters
 Today a provider who needs a site rule has to pause documentation, open the guide, find the hospital and section, then
 return to the caselog. During an acute stroke evaluation that interruption competes with time-critical clinical decisions, so
 providers often rely on memory instead. Memory is frequently wrong for a given site.
 The errors that result (wrong order set, wrong note title, missed charge entry, wrong escalation path) are usually caught only
 after the case closes. Each one then needs follow-up between the provider and a quality team, and sometimes the hospital.
 The goal is to prevent those errors during the encounter, not just to make the guide easier to search.




 Figure 1. Today's lookup loop. Your nudges should remove steps 2 to 4.


  Primary deliverable: proactive nudges. The system watches what the provider is doing in the caselog and surfaces the
  relevant rule at the right field, unprompted. Secondary deliverable: on-demand answers to free-text questions. A chat
  assistant on its own, without proactive nudges, will not place highly.



 Inputs Your System Receives
 Your system is given an encounter context every time the provider moves to a new caselog step or changes a field.
 "Context-aware" means using all of it, not just the hospital ID.

 Field                                 Example                            Why it matters
 hospital_id                           SYN-006                            Which guide applies. Answers must never come from another hospital.
 consult_type / encounter_type         Stroke / Acute                     Some rules only apply to stroke alerts or to rounding
 caselog_step                          Imaging                            Where in the workflow the provider is
 field_event                           lvo_present = true                 The specific action that may trigger a nudge
 local_time + local_timezone           19:30 America/Chicago              Many rules depend on day and time at the hospital
 provider_timezone                     America/New_York                   Providers often work in a different time zone from the hospital




Sevaro | Rutgers Health Hack | Challenge 1 | v2                                                                                             Page 1
```


### Original PDF page 2

```text
 Field                                   Example                               Why it matters
 charge_entered                          false                                 Encounter state needed for sign-off checks


 Caselog Steps and Nudge Triggers
 A simplified caselog model. Each row is a point where a nudge may be useful. You may add, remove or re-tier triggers, but
 explain why.

 #       Step               Caselog field                         Trigger                       Guide fields                              Default tier
 1       Intake             Reason for consult / hospital         Encounter opened for a        Video Eval Location; Wake Up Protocol     Info
                            selected                              hospital
 2       History            Last known well = Unknown             Toggle set to Unknown         Wake Up Protocol                          Advisory
 3       History            Allergies                             Thrombolytic allergy          Thrombolytic                              Advisory
                                                                  entered
 4       Imaging            CTA done = Yes                        CTA result being entered      CT Perfusion; AI                          Info
 5       Imaging            Large vessel occlusion                Set to Yes                    LVO Protocol (evaluate against local      Advisory
                            present = Yes                                                       time)
 6       Recommendation     Thrombolytic given = Yes              Set to Yes                    Thrombolytic; Thrombolytic Mix Model;     Advisory
                                                                                                Order Entry; Order Set Name
 7       Recommendation     Thrombolytic order placed in          Field displayed               Order Entry; Order Set Name               Advisory
                            EHR?
 8       Recommendation     Assessment / plan                     Seizure or EEG                EEG (evaluate against local time)         Info
                                                                  mentioned
 9       Note               Note title                            Note being created            Required Note Title                       Advisory
 10      Sign-off           Complete consult                      Provider clicks Complete      Charge Entry; Consult Completion Rule     Hard stop
 11      Rounding           Rounding encounter opened             Encounter type =              Rounding Timing; Rounding Orders          Info
                                                                  Rounding




 Figure 2. Recreated mock of the caselog Imaging step. Pins 4 and 5 match rows 4 and 5 of the table above. The orange card is what scenario N2
 should produce. You may build your own caselog mock; it does not need to look like this.


 Nudge tiers
 Tier                 Behavior                                                               Example
 Hard stop            Blocks the action until the provider acknowledges or fixes it          Charge must be entered before sign-off
 Advisory             Visible next to the field; does not block                              This hospital is not thrombectomy capable; ED provider starts
                                                                                             the transfer
 Info                 Available on hover or in a side panel                                  CT perfusion is not available here




Sevaro | Rutgers Health Hack | Challenge 1 | v2                                                                                                       Page 2
```


### Original PDF page 3

```text
 Figure 3. One way to show the three tiers. Treatments are illustrative; the behavior is what matters.

 Nudge fatigue is the main design risk. With 80+ fields per hospital, showing everything trains providers to ignore all of it.
 Show that your system stays quiet when nothing applies, and justify each nudge that interrupts.

 Required Answer Behavior
 Every answer and every nudge must cite the hospital and the guide field it came from, and must carry one of these statuses:

 Status                  When                                                      What the provider should see
 Answered                The field exists and is current                           The value, with source field
 Not in guide            The field is missing for this hospital                    "Not available in the hospital guide." Never fill it from another
                                                                                   hospital.
 Time-dependent          The answer depends on the local day or time               The answer for now, and the rule used to decide it
 Stale                   The field was last verified more than 180 days before     The value, clearly flagged as possibly out of date
                         the encounter
 Conflict                The guide and the hospital storyboard disagree            Both values with their sources; never silently pick one
 Hard stop               A required step is incomplete                             What is missing and what to do
 If a time-dependent rule refers to hours the guide does not define (for example, "staffed hours" with no hours given), say so.
 Do not assume a window.

 Non-Functional Requirements
  • Nudges appear within 500 ms of the triggering field change. Load the hospital's guide when the encounter opens, not per
        field.
  • If guide data is unavailable, the caselog keeps working and the provider is told guidance is unavailable.
  • Read-only: nothing the provider does changes the guide.
  • Adding a hospital or a field is a data change, not a code change. Judges will add a new hospital during your demo.

 Data Package
 File                                             Contents
 hospital_guides.json                             All seven guides, one record per field with value and last-verified date
 storyboard_notes.json                            Second-source values that may agree or conflict with the guide
 caselog_field_map.csv                            Caselog steps, fields, triggers and mapped guide fields
 encounter_context_example.json                   Example of the context object your system receives
 validation_set.csv                               V01-V20 questions with expected status and answer
 nudge_scenarios.json                             N1-N9 encounter scenarios with expected nudges




Sevaro | Rutgers Health Hack | Challenge 1 | v2                                                                                                        Page 3
```


### Original PDF page 4

```text
                                     Synthetic Hospital Guides
                                      Seven fictional hospitals with intentionally different configurations

 All fields were last verified on 2026-02-02 unless marked otherwise. The reference encounter date for staleness checks is 2026-03-17. Some fields
 are deliberately missing for some hospitals.

 Cedar Ridge Medical Center (SYN-001)
 Guide Field                             Synthetic Value
 Local Time Zone                         Central (America/Chicago)
 Video Eval Location                     Emergency department patient room
 Thrombolytic                            Alteplase
 Thrombolytic Mix Model                  Pharmacy prepares and delivers to bedside
 LVO Protocol                            Thrombectomy capable during staffed neurointerventional coverage. Teleneurologist alerts ED provider
                                         and activates the synthetic neurovascular response line. Outside coverage hours, use the transfer
                                         pathway.
 Wake Up Protocol                        Yes
 Order Entry                             Thrombolytic order set and post-treatment monitoring orders only
 Order Set Name                          Search "Acute Stroke Remote" - "CRMC Acute Ischemic Stroke - Alteplase [SYN-41021]"
 Charge Entry                            No
 Required Note Title                     Tele-Neurology Consult
 Rounding Process                        Hospitalist service sends daily census to the rounding queue by 0630 Central Time
 When Do We Round?                       Monday-Friday
 Rounding Timing                         0700-1100 Central Time
 Rounding Orders                         No routine orders
 General Neurology                       Local group covers outpatient; Sevaro covers inpatient tele-neurology
 Pediatric Neurology                     Regional children's center via transfer line
 EEG                                     Mon-Sat 0700-1900
 CT Head                                 24/7
 CTA Head/Neck                           24/7
 CT Perfusion                            24/7
 MRI                                     Daily 0600-2300; overnight on-call
 AI                                      RapidView Neuro - synthetic
 EHR                                     MedAxis - synthetic
 PACS                                    NovaPACS - synthetic
 VPN                                     SecureBridge - synthetic




Sevaro | Rutgers Health Hack | Challenge 1 | v2                                                                                               Page 4
```


### Original PDF page 5

```text
 Bluewater Regional Hospital (SYN-002)
 Guide Field                             Synthetic Value
 Local Time Zone                         Mountain (America/Denver)
 Video Eval Location                     CT holding bay for stroke alerts; patient room for other consults
 Thrombolytic                            Tenecteplase
 Thrombolytic Mix Model                  ED nurse mixes from stroke kit after verification
 LVO Protocol                            Not thrombectomy capable. Teleneurologist communicates suspected LVO to ED provider. ED provider
                                         activates transfer center. Synthetic preferred destination: Metro Neuroscience Institute.
 Wake Up Protocol                        No
 Order Entry                             Thrombolytic order entry only
 Order Set Name                          Search "Neuro TNK" - "BWRH Stroke - Tenecteplase [SYN-88210]"
 Charge Entry                            Yes
 Rounding Process                        Charge nurse initiates rounding request in Synapse
 When Do We Round?                       Daily
 Rounding Timing                         0830-1200 Mountain Time
 Rounding Orders                         No
 Cardiovascular Services                 Mon-Fri 0700-1800; weekend on-call
 Carotid Ultrasound                      Daily 0800-1700
 Cardiac Monitoring                      Inpatient telemetry 24/7; outpatient monitor via cardiology clinic
 EEG                                     Mon-Fri 0700-1700
 TEE                                     Mon-Fri 0800-1600
 PT/OT/ST                                PT daily; OT Mon-Sat; ST Mon-Fri
 Specialty Labs                          ReferenceLab North - synthetic
 EHR                                     CareSphere - synthetic
 PACS                                    ImageHarbor - synthetic




Sevaro | Rutgers Health Hack | Challenge 1 | v2                                                                                       Page 5
```


### Original PDF page 6

```text
 Redwood University Medical Center (SYN-003)
 Guide Field                             Synthetic Value
 Local Time Zone                         Pacific (America/Los_Angeles)
 Video Eval Location                     Patient room
 Thrombolytic                            Tenecteplase
 Thrombolytic Mix Model                  Pharmacy verifies; ED nurse mixes and administers
 LVO Protocol                            Thrombectomy capable 24/7. Teleneurologist communicates LVO concern to ED provider and activates the
                                         synthetic Neurointerventional Hotline.
 Wake Up Protocol                        Yes
 Order Entry                             Full acute stroke order set permitted
 Order Set Name                          Search "RUMC Stroke Pathway" - "Acute Stroke / TNK / EVT Evaluation [SYN-73004]"
 Charge Entry                            No
 Required Note Title                     Neurology Consult - Remote
 Rounding Process                        Scheduled inpatient list appears automatically in Synapse
 When Do We Round?                       Daily
 Rounding Timing                         0600-1400 Pacific Time
 Rounding Orders                         Yes - inpatient neurology orders permitted
 General Neurology                       Sevaro inpatient; university faculty outpatient
 Pediatric Neurology                     In-house pediatric neurology 24/7
 EEG                                     Routine and continuous EEG 24/7
 CT Head                                 24/7
 CTA Head/Neck                           24/7
 CT Perfusion                            24/7
 MRI                                     24/7
 AI                                      NeuroSignal AI - synthetic
 EHR                                     Epic synthetic training tenant
 EHR Department Login Location           RUMC TELE NEUROLOGY
 PACS                                    VisionGrid - synthetic
 VPN                                     CloudGate Health - synthetic




Sevaro | Rutgers Health Hack | Challenge 1 | v2                                                                                        Page 6
```


### Original PDF page 7

```text
 Meadowlands Community Hospital (SYN-004)
 Guide Field                             Synthetic Value
 Local Time Zone                         Eastern (America/New_York)
 Video Eval Location                     Emergency department patient room
 Thrombolytic                            Alteplase
 Thrombolytic Mix Model                  Pharmacy mixes; courier delivers to ED
 LVO Protocol                            Not thrombectomy capable. Teleneurologist communicates LVO concern to primary provider. Primary
                                         provider contacts the synthetic Regional Transfer Hub; destination depends on bed availability.
 Wake Up Protocol                        No
 Order Entry                             No medication orders entered by teleneurologist
 Order Set Name                          Hospital provider uses local stroke order set
 Charge Entry                            No
 Required Note Title                     Neuro Tele Consult
 Consult Completion Rule                 Do not complete the consult in Synapse until the hospital provider confirms the patient plan
 Rounding Process                        House supervisor calls Sevaro operations to initiate rounding
 When Do We Round?                       Tuesday, Thursday, Saturday
 Rounding Timing                         0730-1030 Eastern Time
 Rounding Orders                         No
 General Neurology                       Sevaro is the only inpatient neurology service
 Pediatric Neurology                     Transfer to regional pediatric center
 Cardiovascular Services                 Mon-Fri 0800-1700
 Carotid Ultrasound                      Mon-Fri 0700-1600
 Cardiac Monitoring                      Inpatient telemetry; outpatient monitoring arranged after discharge
 EEG                                     Tue/Thu 0800-1500 [last verified 2025-06-10]
 TEE                                     Tue-Fri 0800-1500
 Stress Testing                          Mon-Fri 0700-1400
 PT/OT/ST                                PT daily; OT Mon-Fri; ST Mon/Wed/Fri
 Specialty Labs                          Apex Reference Labs - synthetic




Sevaro | Rutgers Health Hack | Challenge 1 | v2                                                                                         Page 7
```


### Original PDF page 8

```text
 Suncrest Medical Pavilion (SYN-005)
 Guide Field                             Synthetic Value
 Local Time Zone                         Eastern (America/New_York)
 Video Eval Location                     CT room for stroke activation; ICU or patient room for inpatient consults
 Thrombolytic                            Tenecteplase
 Thrombolytic Mix Model                  Pharmacy prepares after teleneurology recommendation
 LVO Protocol                            Not thrombectomy capable. Teleneurologist informs ED provider and then calls the synthetic Transfer
                                         Command Center. Synthetic preferred destination: Capital Neurovascular Center.
 Wake Up Protocol                        Yes
 Order Entry                             Thrombolytic and imaging orders permitted
 Order Set Name                          Search "Stroke TeleCare" - "Suncrest Acute Stroke - TNK [SYN-55190]"
 Charge Entry                            Yes
 Rounding Process                        Hospitalist coordinator schedules rounding in Synapse one day in advance
 When Do We Round?                       As scheduled
 Rounding Timing                         0700-1700 Eastern Time
 Rounding Orders                         Medication changes require hospitalist co-sign
 VPN                                     NorthPass - synthetic
 EHR                                     MedConnect One - synthetic
 EHR Department Login Location           SCMP REMOTE NEURO
 CT Head                                 24/7
 CTA Head/Neck                           24/7
 CT Perfusion                            No
 AI                                      ClarityLVO - synthetic
 MRI                                     Mon-Fri 0500-2300; weekend 0700-1900; overnight call
 PACS                                    ClearImage Enterprise - synthetic
 EEG                                     Mon-Fri 0800-1800; weekend on-call




Sevaro | Rutgers Health Hack | Challenge 1 | v2                                                                                            Page 8
```


### Original PDF page 9

```text
 Highland Valley Hospital (SYN-006)
 Guide Field                             Synthetic Value
 Local Time Zone                         Central (America/Chicago)
 Video Eval Location                     Patient room; portable cart to CT when requested
 Thrombolytic                            Tenecteplase
 Thrombolytic Mix Model                  ED pharmacist prepares during staffed hours; nursing mixes overnight [last verified 2025-08-15]
 LVO Protocol                            Thrombectomy capable Mon-Fri 0700-1900. During coverage, teleneurologist activates the synthetic EVT
                                         team. Outside coverage, ED provider initiates transfer to a regional comprehensive stroke center.
 Wake Up Protocol                        Yes
 Order Entry                             Thrombolytic order set only
 Order Set Name                          Search "HVH Telestroke" - "Acute Ischemic Stroke - Tenecteplase [SYN-66018]"
 Charge Entry                            No
 Required Note Title                     MD Progress Note - Neuro
 Rounding Process                        Unit clerk sends request through hospital workflow queue
 When Do We Round?                       Monday-Saturday
 Rounding Timing                         0800-1500 Central Time
 Rounding Orders                         No
 General Neurology                       Local neurologist until 1700; Sevaro nights and overflow
 Pediatric Neurology                     Children's specialty network; phone consultation first
 Cardiovascular Services                 Daily 0700-1900
 Carotid Ultrasound                      Mon-Sat 0700-1800
 Cardiac Monitoring                      Telemetry 24/7; outpatient patch monitor
 EEG                                     Daily 0700-1900; continuous EEG unavailable
 TEE                                     Mon-Fri 0700-1700
 Stress Testing                          Mon-Sat 0700-1500
 PT/OT/ST                                PT/OT daily; ST Mon-Sat
 Specialty Labs                          Meridian Diagnostics - synthetic




Sevaro | Rutgers Health Hack | Challenge 1 | v2                                                                                            Page 9
```


### Original PDF page 10

```text
 Silver Oak Health Center (SYN-007)
 Guide Field                                Synthetic Value
 Local Time Zone                            Eastern (America/New_York)
 Video Eval Location                        Patient room
 Thrombolytic                               Alteplase
 Thrombolytic Mix Model                     ED nursing prepares from pharmacy-issued kit
 LVO Protocol                               Not thrombectomy capable. Teleneurologist communicates LVO concern to ED provider; ED provider calls
                                            synthetic Statewide Transfer Access.
 Wake Up Protocol                           No
 Order Entry                                No orders entered by teleneurologist
 Order Set Name                             Not applicable
 Charge Entry                               Yes - tele-neurology encounter charge before sign-off
 Required Note Title                        Tele-Neurology Encounter
 Rounding Process                           Hospitalist sends secure message to initiate rounding
 When Do We Round?                          Monday-Friday
 Rounding Timing                            0900-1300 Eastern Time
 Rounding Orders                            No
 VPN                                        EdgeConnect Health - synthetic
 EHR                                        ClinixPro - synthetic
 EHR Department Login Location              SOHC NEUROLOGY REMOTE
 CT Head                                    24/7
 CTA Head/Neck                              24/7
 CT Perfusion                               Mon-Fri 0700-1900
 AI                                         None
 MRI                                        Daily 0700-2200; no overnight coverage
 PACS                                       RadiantView - synthetic
 EEG                                        Mon-Fri 0900-1600



 Hospital Storyboard Notes (Second Source)
 Synapse also shows a short hospital storyboard in the caselog header. It is maintained separately and can disagree with the
 guide.

 Hospital          Field                         Storyboard value         Updated            Note
 SYN-002           Video Eval Location           Patient room             2025-09-14         Hospital storyboard card shown in the caselog header.
                                                                                             Disagrees with the on-call guide for stroke alerts.
 SYN-005           Thrombolytic                  Tenecteplase             2026-01-20         Agrees with the guide. Included so teams do not flag every
                                                                                             second source as a conflict.


 Prototype Validation Examples
 Questions to test that the solution uses the correct hospital context. Encounter times are local to the hospital unless stated.
 #      Hospital       Provider question                     Local time             Status            Expected grounded response
 V01    SYN-001        Where should I perform the video      Tue 2026-03-17         answered          Emergency department patient room.
                       evaluation?                           14:00
 V02    SYN-002        What is the LVO workflow?             Tue 2026-03-17         answered          ED provider activates transfer center; synthetic preferred
                                                             14:00                                    destination is Metro Neuroscience Institute.
 V03    SYN-003        Can I place inpatient neurology       Tue 2026-03-17         answered          Yes, according to this synthetic hospital configuration.
                       orders during rounding?               09:00
 V04    SYN-004        Is EEG available on Friday?           Fri 2026-03-20         not in guide      The guide only lists Tue/Thu; Friday availability is not
                                                             10:00                                    provided. Do not assume.




Sevaro | Rutgers Health Hack | Challenge 1 | v2                                                                                                           Page 10
```


### Original PDF page 11

```text
 #      Hospital     Provider question                    Local time             Status               Expected grounded response
 V05    SYN-005      Does the hospital have CT            Tue 2026-03-17         answered             No.
                     perfusion?                           14:00
 V06    SYN-006      What is the LVO pathway after        Tue 2026-03-17         time dependent       The staffed thrombectomy window has ended; ED
                     1900 on a weekday?                   19:30                                       provider initiates transfer.
 V07    SYN-007      Which order set should I use?        Tue 2026-03-17         answered             Not applicable; the teleneurologist does not enter orders.
                                                          14:00
 V08    SYN-001      Patient has an LVO. What do I do?    Tue 2026-03-17         time dependent       Pathway depends on staffed neurointerventional
                                                          22:30                                       coverage, but the guide does not give coverage hours.
                                                                                                      State both branches and say coverage hours are not in
                                                                                                      the guide. Do not borrow hours from another hospital.
 V09    SYN-006      Patient has an LVO. Do I activate    Sat 2026-03-21         time dependent       No. Coverage is Mon-Fri only. ED provider initiates
                     the EVT team?                        10:00                                       transfer to a regional comprehensive stroke center.
 V10    SYN-007      Can I sign off now?                  Tue 2026-03-17         hard stop            Not until the tele-neurology encounter charge is entered.
                                                          14:00
 V11    SYN-005      Can I change the antiplatelet        Tue 2026-03-17         answered             Medication changes require hospitalist co-sign.
                     during rounding?                     10:00
 V12    SYN-002      Where do I do the video eval for a   Tue 2026-03-17         conflict             On-call guide: CT holding bay for stroke alerts.
                     stroke alert?                        14:00                                       Storyboard: patient room. Show both with sources; do
                                                                                                      not silently pick one.
 V13    SYN-004      Is EEG available on Thursday?        Thu 2026-03-19         stale                Guide lists Tue/Thu 0800-1500, so yes, but this field was
                                                          10:00                                       last verified 2025-06-10. Flag it as possibly out of date.
 V14    SYN-002      Who covers pediatric neurology?      Tue 2026-03-17         not in guide         Not available in this hospital's guide. Do not use another
                                                          14:00                                       hospital's answer.
 V15    SYN-005      Which thrombolytic order set do I    Tue 2026-03-17         answered             Search "Stroke TeleCare" - "Suncrest Acute Stroke -
                     search for?                          14:00                                       TNK [SYN-55190]".
 V16    SYN-007      Can I get CT perfusion on            Sat 2026-03-21         time dependent       No. CT perfusion is Mon-Fri 0700-1900 only.
                     Saturday?                            11:00
 V17    SYN-002      Is the rounding window open?         Tue 2026-03-17         time dependent       Not yet. Window is 0830-1200 Mountain; it opens in 15
                     (Provider is in Eastern time.)       08:15 local (10:15                          minutes (10:30 ET).
                                                          ET)
 V18    SYN-006      Who mixes the TNK?                   Wed 2026-03-18         time dependent       Guide says pharmacist during staffed hours, nursing
                                                          20:00                                       overnight, but staffed pharmacy hours are not defined.
                                                                                                      Field last verified 2025-08-15, so also flag it as stale. Say
                                                                                                      what is unknown; do not guess the cutoff.
 V19    SYN-003      What should I title the note?        Tue 2026-03-17         answered             Neurology Consult - Remote.
                                                          14:00
 V20    SYN-005      What note title is required?         Tue 2026-03-17         not in guide         Not available in this hospital's guide.
                                                          14:00


 Nudge Trigger Scenarios
 Encounter situations and the nudge a good solution should produce. Scenario N8 checks that the system stays quiet.
 #      Hospital     Type             Step                  Field event                  Local time           Expected nudge
 N1     SYN-002      Stroke           Imaging               LVO present = Yes            Tue 14:00            Advisory: not thrombectomy capable. Tell the ED
                                                                                         Mountain             provider; they activate the transfer center.
                                                                                                              Preferred destination: Metro Neuroscience
                                                                                                              Institute.
 N2     SYN-006      Stroke           Imaging               LVO present = Yes            Tue 19:30            Advisory: outside the EVT window (Mon-Fri
                                                                                         Central              0700-1900). ED provider initiates transfer. Must
                                                                                                              not suggest activating the EVT team.
 N3     SYN-003      Stroke           History               Last known well =            Tue 03:10            Advisory: wake-up protocol is in use at this
                                                            Unknown                      Pacific              hospital.
 N4     SYN-004      Stroke           Recommendation        Thrombolytic given =         Tue 16:00            Advisory: teleneurologist does not enter
                                                            Yes                          Eastern              medication orders; hospital provider uses the
                                                                                                              local order set. No order-set name nudge.
 N5     SYN-007      Stroke           Sign-off              Complete clicked;            Tue 14:00            Hard stop: tele-neurology encounter charge
                                                            charge not entered           Eastern              required before sign-off.
 N6     SYN-005      Stroke           Imaging               CTA done = Yes               Tue 14:00            Info: CT perfusion not available; AI is ClarityLVO.
                                                                                         Eastern




Sevaro | Rutgers Health Hack | Challenge 1 | v2                                                                                                           Page 11
```


### Original PDF page 12

```text
 #        Hospital   Type            Step           Field event               Local time   Expected nudge
 N7       SYN-004    General         Sign-off       Complete clicked          Tue 15:00    Hard stop: do not complete until the hospital
                     Neuro                                                    Eastern      provider confirms the plan.
 N8       SYN-002    General         History        Allergies entered: none   Tue 14:00    No nudge. Nothing in the guide applies; staying
                     Neuro                                                    Mountain     quiet is the correct behavior.
 N9       SYN-001    Rounding        Rounding       Encounter opened          Sun 08:00    Info: this hospital rounds Monday-Friday only;
                                                                              Central      check why a Sunday rounding encounter exists.


 What Teams Must Demonstrate
     1. Proactive nudges driven by the encounter context, covering scenarios N1-N9, including staying quiet in N8.
     2. On-demand answers that pass validation examples V01-V20, each with its source field and status.
     3. Time-aware rules evaluated in the hospital's local time, including a provider in a different time zone.
     4. Stale, conflicting and missing data handled visibly, never papered over.
     5. Live test. Judges will add a new hospital guide in the same format and run unseen questions and scenarios against it.

 Data and Confidentiality Boundary
 No real Sevaro or hospital protocols or guides will be shared. Participants use only the synthetic hospital guides in this
 package. Hospital names, systems, order sets, identifiers, transfer destinations, schedules, note titles and operational rules
 are fictional. The dataset mirrors the kinds of fields and variability a workflow solution must handle, but does not reproduce
 the real hospital guides used to shape this challenge. No patient data or production access is required. This content is for
 hackathon prototyping only and is not clinical guidance.




Sevaro | Rutgers Health Hack | Challenge 1 | v2                                                                                      Page 12
```
