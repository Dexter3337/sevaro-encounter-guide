# Sevaro Challenge 1 decision brief

As of October 10, 2026. Research foundation and unofficial synthetic test contract. No patient data or production access used.

## Recommended prototype

Build a mock Synapse caselog that preloads an immutable guide at encounter opening, receives typed field and workflow events, evaluates validated local rules, and shows cited guidance or silence. Before completion, evaluate the latest charge and plan-confirmation state. Add on-demand questions through the same hospital-scoped rule and evidence layer.

Keep language-model extraction outside the field-event path. Use it to draft mappings and structured rules from unfamiliar prose, then validate the draft. Automatically handle approved aliases, new literal values and known rule operators. Preserve unfamiliar source text for review when its meaning, actor, scope, prerequisite or schedule cannot be established. A new hospital should require data import; a genuinely new clinical decision operator requires review and an explicitly supported evaluator.

Public [Sevaro product materials](https://sevaro.com/synapse-ai/) advertise integrated EHR, imaging, video, PACS, single sign-on and AI documentation. They do not establish a public form-event API, transcript entitlement, deployment architecture or completion-interception contract. The prototype can demonstrate those events in its own mock. Production access remains an integration dependency.

## What is traced

The supplied ZIP contains Challenge 1 and Challenge 2 PDFs, but none of the six JSON/CSV files listed in Challenge 1. The reconstruction therefore preserves PDF values and dates in an **unofficial schema**. Challenge 2 was outside this research scope. No attached Library item was edited.

The knowledge base contains:

- All seven supplied hospital configurations and 169 supplied hospital-field records.
- All 34 distinct guide fields, all seven context-table rows (nine names when combined labels are separated), and every trigger-map row.
- V01–V20, N1–N9, and both storyboard examples, with supplied expectations preserved.
- 62 requirement records: 11 triggers, 20 validation examples, nine nudge examples and 22 functional/nonfunctional or clarification records.
- 16 inventoried rule families. They include supported information, schedule, permission, handoff and gate patterns, as well as metadata and an explicit unsupported-meaning boundary. This is a design inventory, not proof of runtime support.
- 101 development and 30 held-out scenarios with separate expected outputs. Seven added fictional hospitals include six coherent configurations and one deliberately malformed guide.
- 21 source records: two supplied sources, 18 external primary sources, and one labeled design/fixture source.
- 599 normalized trace links, plus row-level source IDs and source locators.

Coverage means **a source concept and test specification are linked**. It does not mean the implementation passed, a clinician validated it, or the sampled public workflows represent all hospitals.

## Decisions that matter

**Hospital identity comes first.** Select the guide by exact hospital identifier, bind it to the encounter, and invalidate prior cards on hospital switch. Never answer missing values from another hospital. The storyboard is a separate source: show both values when applicable meanings disagree; agreement is not a conflict.

**Documentation time may follow the clinical action.** A “thrombolytic given” field can be entered after preparation and ordering. That trigger may identify a discrepancy but cannot prove that it prevented the earlier action. Preserve action, documentation and receipt timestamps. Use the order-field display trigger for earlier permissions guidance. [WakeMed’s local algorithm](https://www.wakemed.org/sites/default/files/hg_features/mercury_standard_layout/eba079a37807b6d7f2a1bc2c14ac3172.pdf) illustrates distinct phone, chart, video, verbal-order and signature stages; it is pattern evidence, not an imported treatment protocol.

**A status is not severity or permission to block.** Keep relevance, evidence quality, primary answer status, additional quality flags, nudge tier and gate authorization separate. V18 has a time-dependent primary status plus stale and undefined-hours flags. V04 expects “not in guide” for Friday availability even though a stale Tue/Thu EEG record exists. Do not reduce either example to a single Boolean.

**Unknown hours stay unknown.** SYN-001 does not define staffed neurointerventional coverage. SYN-006 does not define staffed pharmacy hours. Its EVT schedule cannot substitute for pharmacy hours. Preserve both branches and state the missing condition. An incomplete schedule is different from an explicit exclusive schedule such as V16’s Mon–Fri CT perfusion.

**Gate release needs evidence.** The tier definition permits “acknowledges or fixes,” but N5/N7 say completion waits for a required charge or plan confirmation. Proposed behavior: acknowledgement records that the notice was read; only satisfying the condition or an explicitly authorized override releases the gate. Organizer clarification is needed. Production override and emergency pathways require local governance. An [original randomized trial](https://pubmed.ncbi.nlm.nih.gov/20876410/) found treatment delays from a nearly hard-stop alert, supporting evaluation of unintended workflow effects.

**Time boundaries need an explicit contract.** Use the hospital’s IANA region and a dated instant whenever possible. Preserve provider time as a display conversion. Validate nonexistent or repeated local times, overnight day ownership and missing zones. The fixtures propose start-inclusive/end-exclusive intervals and hospital-local calendar-day staleness; exact endpoints and date arithmetic are not specified in the challenge and need confirmation. Exactly 180 days is not stale; more than 180 is stale. [IANA](https://www.iana.org/time-zones) documents that zone rules change, so record the time-zone database version.

**Guide failure is visible and nonblocking for caselog operation.** Do not reuse the prior hospital guide or invent a new guide-derived gate when loading fails. Host-owned requirements remain a separate concern. “Guidance unavailable,” malformed data and unsupported interpretation need diagnostics; their mapping to the challenge’s six answer statuses is a proposed extension, not a supplied organizer rule.

**Documents are untrusted inputs.** Keep source text immutable, retain citations/spans, allow only validated rule operators, and enforce authorization outside the model. Do not execute code, tool calls, retrieval instructions or policy overrides found in guides. [OWASP’s guidance](https://cheatsheetseries.owasp.org/cheatsheets/LLM_Prompt_Injection_Prevention_Cheat_Sheet.html) supports layered controls; it does not establish guaranteed prevention.

## Integration choice

| Option | Useful access | Critical limitation | Recommendation |
|---|---|---|---|
| Native mock / approved native application callbacks | Exact open, display, change, save and completion-attempt events | Production Sevaro contract unknown | Prototype first; obtain real contract next |
| [CDS Hooks](https://cds-hooks.org/specification/current/) | Host-supported workflow hooks, context, prefetch and sourced cards | Hook availability is host-specific; card urgency does not grant blocking authority | Negotiate supported hooks and measure event-to-paint latency |
| [FHIR R5 subscriptions](https://hl7.org/fhir/subscription.html) | Notifications for supported topics/resource events | Do not establish unsaved edits, focus or pre-action interception | Reconciliation and saved-state updates where supported |
| [SMART launch](https://hl7.org/fhir/smart-app-launch/STU2.2/scopes-and-launch-context.html) | Negotiated encounter context and resource authorization | Not a generic form-event bus | Use alongside approved native events |
| [Browser extension](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts) | Authorized DOM observation and UI augmentation | DOM drift and hidden app state; completion bypass paths | Controlled prototype only until host contract verified |
| Screen observation | Potential assistive observation | Ambiguous/occluded state and no authoritative completion evidence | Never rely on it alone for a completion gate |

For the 500ms requirement, compile/preload guide rules at encounter opening and evaluate the relevant rule locally. PERF-01 specifies trigger dispatch to visible correctly cited card, not engine execution time alone. Record maximum and percentiles, device/browser, samples, burst load and failures. PERF-02 checks that warm field events require no guide fetch. Neither benchmark has been executed.

## How to use the evaluation data

Develop with challenge fixtures and DEV-101–103. Freeze held-out hospitals HOLD-201–203 and malformed HOLD-901, their unfamiliar wording and event sequences. HOLD-SCOPE and HOLD-APPOINTMENT deliberately reuse two challenge hospitals for separately labeled stress tests. The split manifest records this limitation and hashes the inputs and oracles.

Give the tested system only the selected guide and input event sequence. Keep `expected_outputs.jsonl` out of parser prompts, retrieval and training examples. Compare semantic facts, actor, pathway, scope, missing-information behavior, primary status, flags, tier, silence, source hospital/field/version and forbidden outputs. Do not grade only exact wording. A silent case succeeds when no active nudge exists; an internal audit decision is allowed. Repeated, corrected or reordered events need stateful assertions.

The expected outcomes were specified manually from the source or explicit fictional rule, separately from any runtime evaluator. They have not been independently adjudicated by clinicians. Held-out here means reserved from future implementation development; it does not mean a blinded external test has already occurred.

## Implementation order and remaining dependencies

1. Load immutable guides and storyboard records through a replaceable schema adapter, retaining hospital, source field, version and verification date.
2. Implement the mock caselog event lifecycle and encounter revision binding.
3. Implement the finite rule families, local-time evaluation and independent quality flags; preserve unsupported meanings.
4. Render cited info/advisory cards with relevance, deduplication and retraction, then implement host completion checks.
5. Route questions through the same scoped evidence layer.
6. Execute V01–V20, N1–N9, the additional development cases, and then frozen held-out cases. Run real-browser latency and preload/failure tests.
7. Resolve organizer schema, endpoint, multi-status and acknowledgement semantics before claiming complete hackathon conformance.

Production additionally needs current controlled hospital guides and owners; clinical review of rule interpretation; site privileges and access scope; authoritative charge/plan confirmation state; validated native/EHR interfaces; data-flow/security/privacy assessment and applicable contracts; deployment, audit, retention, resilience and incident procedures; clinician simulation, usability, shadow mode and prospective pilot evaluation; monitored false/missed alerts and completion delay; explicit overrides and rollback authority; and function-specific intended-use/regulatory review. [OHSU’s onboarding description](https://www.ohsu.edu/telemedicine/acute-care-telemedicine-services-inpatient) includes privileges, secure setup, workflow documentation and simulations. [HHS security guidance](https://www.hhs.gov/hipaa/for-professionals/security/laws-regulations/index.html) and [FDA’s January 2026 CDS guidance](https://www.fda.gov/regulatory-information/search-fda-guidance-documents/clinical-decision-support-software) inform these assessment needs; neither proves this system is compliant or production ready.

## Research stopping point

Three research batches were saved and deduplicated by source URL and stable record IDs. The new evidence changed integration, timing, permission and interpretation decisions. Remaining high-priority questions depend on organizer clarification, proprietary integration details, current local policy owners, independent clinical evaluation or running the companion. Additional near-duplicate public hospital pages would not resolve those questions. The workbook’s Unknowns and Decisions table retains their owners, priorities and next validation steps.

The Sources table is the annotated primary-source bibliography. Each factual finding links to its source classification, applicability, date and limitations. Historical and public workflow examples remain separate from fictional executable fixtures.
