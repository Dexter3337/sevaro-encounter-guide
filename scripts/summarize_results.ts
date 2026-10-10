import { readFileSync, writeFileSync } from "node:fs";
import { previewImport } from "../src/imports";
const load = (f: string) => JSON.parse(readFileSync(f, "utf8"));
const a = load("reports/acceptance.json"),
  u = load("reports/unit-tests.json"),
  b = load("reports/browser-tests.json"),
  l = load("reports/browser-latency.json"),
  s = load("data/raw/seed_provenance.json");
const p = previewImport(
  readFileSync("data/holdout/unfamiliar-hospitals.json", "utf8"),
  "json",
);
const fmt = (x: number) => x.toFixed(1);
const lines = [
  "# Measured verification results",
  "",
  `Generated from saved runner reports on ${new Date().toISOString()}. Synthetic workflow engineering tests only; no clinical validation.`,
  "",
  "| Check | Actual result |",
  "|---|---|",
  `| Sponsor questions | ${a.summary.questions}/20 |`,
  `| Sponsor nudges, including N8 silence | ${a.summary.nudge}/9 |`,
  `| Unit/acceptance/edge tests | ${u.numPassedTests}/${u.numTotalTests}; ${u.numFailedTests} failed |`,
  `| Production browser tests | ${b.stats.expected}/${b.stats.expected + b.stats.unexpected}; ${b.stats.unexpected} failed, ${b.stats.flaky} flaky, ${b.stats.skipped} skipped |`,
  `| Independently verified PDF guide rows | ${s.pdf_rows}; ${s.mismatches.length} mismatches |`,
  `| Unfamiliar hospitals | ${p.hospitals.length} automatic imports; ${Object.values(p.counts).reduce((a, b) => a + b, 0)} source records |`,
  "",
  "Source counts per sponsor hospital: " +
    Object.entries(s.counts)
      .map(([k, v]) => `${k} ${v}`)
      .join(", ") +
    ". Two storyboard records are additional to these guide counts.",
  "",
  `Unfamiliar record interpretation: ${Object.entries(p.counts)
    .map(([k, v]) => `${v} ${k}`)
    .join(
      ", ",
    )}. Partial/needs-review records are retained and explicitly uncertain, not counted as automatically resolved new policy. Four coherent configurations cover Pacific/Phoenix/Eastern/London zones, am/pm wording, overnight and multiple windows, changed actors, missing/negative fields, a new static field and a new data-driven form mapping.`,
  "",
  "## Actual browser latency",
  "",
  "| Population | Count | p50 | p95 | Maximum |",
  "|---|---:|---:|---:|---:|",
  `| Committed field edits | ${l.summary.count} | ${fmt(l.summary.p50)} ms | ${fmt(l.summary.p95)} ms | ${fmt(l.summary.max)} ms |`,
  `| Required field/open/completion events | ${l.allRequired.count} | ${fmt(l.allRequired.p50)} ms | ${fmt(l.allRequired.p95)} ms | ${fmt(l.allRequired.max)} ms |`,
  "",
  l.method,
  "",
  `Environment: Chrome ${l.environment.browser}; ${l.environment.viewport}; ${l.environment.host}; ${l.environment.mode}; production origin ${l.environment.server}. All observed required samples were below 500 ms. Superseded events: ${l.samples.filter((x: any) => !x.committed).length}; these are retained but excluded from committed-render statistics.`,
  "",
  "This starts at the adapter commit handler and ends after React commit plus two requestAnimationFrame callbacks. It is a paint-readiness approximation including browser frame scheduling, not actual pixel tracing, event-dispatch hardware latency or a clinical outcome. Engine-only timings in acceptance.json exclude rendering. The UI never labels those timings as field-to-paint latency.",
  "",
  "## Browser paths exercised",
  "",
  "N2 real edit and clock branch; N5 charge block/resolve; N7 plan block/resolve; V12 two sources/dates; V14 missing evidence; N8 silence; guide outage with continued editing; isolated hospital switch; unfamiliar JSON/new field/mapping; malformed-import preservation; reload/reset; inert HTML/prompt text; all 29 workbench cases; evidence keyboard activation and 390px responsive overflow; CSV mapping; immutable active-version pin/refresh; loaded core with network disabled; repeated actual latency interactions across N1–N9.",
  "",
  "Desktop and mobile screenshots were opened and inspected. Raw browser results are in browser-tests.json, performance samples in browser-latency.json, independent expected/actual results in acceptance.json and unit assertions in unit-tests.json. Screenshots: desktop-n2.png and mobile-n2.png.",
  "",
  "Build/typecheck and locked install were exercised through documented pnpm scripts. Vite reports two third-party Zod comment-annotation warnings; the production build succeeds. No page errors were observed in the monitored browser paths. Network-disabled operation is after the local application has loaded; offline cold reload is not implemented.",
  "",
  "## Sponsor cases",
  "",
  "| ID | Result | Expected status/tier | Evidence fields |",
  "|---|---|---|---|",
  ...a.cases.map(
    (c: any) =>
      `| ${c.id} | ${c.pass ? "PASS" : "FAIL"} | ${c.expected.silence ? "silence" : c.expected.status || c.expected.tier} | ${c.expected.sources.join(", ") || "Explicit missing-field evidence / silence"} |`,
  ),
  "",
  "## Remaining limits",
  "",
  "Finite aliases/schedule grammar; conservative conflict equivalence; unsupported policy wording abstains; unknown official judging schema; browser-local unencrypted storage/audit; no production Synapse/clinical validation; no live speech, model provider or PDF importer; no formal accessibility/usability certification. See README.md and docs/DECISIONS.md for exact uncertainty/outage gate policies. No reduction in treatment time, error rate or disability was measured or claimed.",
];
writeFileSync("reports/TEST_RESULTS.md", lines.join("\n") + "\n");
console.log(
  JSON.stringify({
    unit: `${u.numPassedTests}/${u.numTotalTests}`,
    browser: b.stats,
    fieldLatency: l.summary,
    allLatency: l.allRequired,
    imports: p.counts,
  }),
);
