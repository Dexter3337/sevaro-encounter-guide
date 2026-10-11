# Measured verification results

> Historical checkpoint: current delivery status and verification counts are in the
> [combined review](SPRINT_COMPLETION_REVIEW.md) (10 October 2026, product commit `c778f26`).


Generated from saved runner reports on 2026-10-10T17:43:31.665Z. Synthetic workflow engineering tests only; no clinical validation.

| Check | Actual result |
|---|---|
| Sponsor questions | 20/20 |
| Sponsor nudges, including N8 silence | 9/9 |
| Unit/acceptance/edge tests | 79/79; 0 failed |
| Current focused browser rerun | 3/3; 0 failed |
| Full alignment run and retry | Initial 10/12 passed; latency timed out and popup assertion was corrected. Focused rerun 3/3 passed, covering both failures plus order persistence. 12 unique browser paths verified across the two runs. |
| Independently verified PDF guide rows | 169; 0 mismatches |
| Unfamiliar hospitals | 4 automatic imports; 19 source records |

Source counts per sponsor hospital: SYN-001 25, SYN-002 22, SYN-003 26, SYN-004 25, SYN-005 23, SYN-006 24, SYN-007 24. Two storyboard records are additional to these guide counts.

Unfamiliar record interpretation: 17 supported, 1 partial, 1 needs_review, 0 unsupported. Partial/needs-review records are retained and explicitly uncertain, not counted as automatically resolved new policy. Four coherent configurations cover Pacific/Phoenix/Eastern/London zones, am/pm wording, overnight and multiple windows, changed actors, missing/negative fields, a new static field and a new data-driven form mapping.

## Actual browser latency

| Population | Count | p50 | p95 | Maximum |
|---|---:|---:|---:|---:|
| Committed field edits | 120 | 22.1 ms | 30.7 ms | 35.0 ms |
| Required field/open/completion events | 230 | 23.0 ms | 30.1 ms | 35.0 ms |

Real adapter evaluation → React commit → two animation-frame callbacks. Paint-ready approximation; measured scheduler delay included. 10 repetitions of N1–N9, with actual committed field edits and completion/open events.

Environment: Chrome 154.0.8037.98; 1440x1000; Windows, Node 24.19.0; Headless Chrome, single worker, foreground page; production origin http://127.0.0.1:4173. All observed required samples were below 500 ms. Superseded events: 0; these are retained but excluded from committed-render statistics.

This starts at the adapter commit handler and ends after React commit plus two requestAnimationFrame callbacks. It is a paint-readiness approximation including browser frame scheduling, not actual pixel tracing, event-dispatch hardware latency or a clinical outcome. Engine-only timings in acceptance.json exclude rendering. The UI never labels those timings as field-to-paint latency.

## Browser paths exercised

Alignment update: doctor-reviewed scripted transcript candidates, unchanged unapproved fields, wrong/stale encounter rejection, gate-field exclusion, current-plan negation/history handling, and order guidance before focus/after unrelated edits. Initial browser failure details remain in browser-tests-initial-alignment-run.json; focused rerun in browser-tests.json. The latest completed latency run replaces the interrupted attempt. Transcript capture/extraction latency is unmeasured because no live connector is implemented.

N2 real edit and clock branch; N5 charge block/resolve; N7 plan block/resolve; V12 two sources/dates; V14 missing evidence; N8 silence; guide outage with continued editing; isolated hospital switch; unfamiliar JSON/new field/mapping; malformed-import preservation; reload/reset; inert HTML/prompt text; all 29 workbench cases; evidence keyboard activation and 390px responsive overflow; CSV mapping; immutable active-version pin/refresh; loaded core with network disabled; repeated actual latency interactions across N1–N9.

Desktop and mobile screenshots were opened and inspected. Raw browser results are in browser-tests.json, performance samples in browser-latency.json, independent expected/actual results in acceptance.json and unit assertions in unit-tests.json. Screenshots: desktop-n2.png and mobile-n2.png.

Build/typecheck and locked install were exercised through documented pnpm scripts. Vite reports two third-party Zod comment-annotation warnings; the production build succeeds. No page errors were observed in the monitored browser paths. Network-disabled operation is after the local application has loaded; offline cold reload is not implemented.

## Sponsor cases

| ID | Result | Expected status/tier | Evidence fields |
|---|---|---|---|
| V01 | PASS | answered | Video Eval Location |
| V02 | PASS | answered | LVO Protocol |
| V03 | PASS | answered | Rounding Orders |
| V04 | PASS | not_in_guide | EEG |
| V05 | PASS | answered | CT Perfusion |
| V06 | PASS | time_dependent | LVO Protocol |
| V07 | PASS | answered | Order Set Name, Order Entry |
| V08 | PASS | time_dependent | LVO Protocol |
| V09 | PASS | time_dependent | LVO Protocol |
| V10 | PASS | hard_stop | Charge Entry |
| V11 | PASS | answered | Rounding Orders |
| V12 | PASS | conflict | Video Eval Location |
| V13 | PASS | stale | EEG |
| V14 | PASS | not_in_guide | Explicit missing-field evidence / silence |
| V15 | PASS | answered | Order Set Name |
| V16 | PASS | time_dependent | CT Perfusion |
| V17 | PASS | time_dependent | Rounding Timing, When Do We Round? |
| V18 | PASS | time_dependent | Thrombolytic Mix Model |
| V19 | PASS | answered | Required Note Title |
| V20 | PASS | not_in_guide | Explicit missing-field evidence / silence |
| N1 | PASS | advisory | LVO Protocol |
| N2 | PASS | advisory | LVO Protocol |
| N3 | PASS | advisory | Wake Up Protocol |
| N4 | PASS | advisory | Order Entry |
| N5 | PASS | hard_stop | Charge Entry |
| N6 | PASS | info | CT Perfusion, AI |
| N7 | PASS | hard_stop | Consult Completion Rule |
| N8 | PASS | silence | Explicit missing-field evidence / silence |
| N9 | PASS | info | Rounding Timing, When Do We Round? |

## Remaining limits

Finite aliases/schedule grammar; conservative conflict equivalence; unsupported policy wording abstains; unknown official judging schema; browser-local unencrypted storage/audit; no production Synapse/clinical validation; no live speech, model provider or PDF importer; no formal accessibility/usability certification. See README.md and docs/DECISIONS.md for exact uncertainty/outage gate policies. No reduction in treatment time, error rate or disability was measured or claimed.
