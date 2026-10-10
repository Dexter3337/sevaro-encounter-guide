import {
  freshContext,
  makeEvent,
  known,
  type Hospital,
  type Result,
} from "./domain";
import { ask, evaluate } from "./engine";
import { challengeFixtures, type Fixture } from "./fixtures";
export function fixtureContext(h: Hospital, f: Fixture) {
  const c = freshContext(h, f.local);
  c.step = f.step || "intake";
  c.consultType = f.consult || "Stroke";
  c.encounterType = f.encounter || "Acute";
  if (f.field) c.values[f.field] = known(f.val);
  if (f.id === "V10") c.values.charge_entered = known(false);
  return c;
}
export function runFixture(hs: Hospital[], f: Fixture) {
  const h = hs.find((h) => h.id === f.hospital)!;
  const c = fixtureContext(h, f);
  const start = performance.now();
  const results =
    f.kind === "question"
      ? ([ask(h, c, f.question!).result].filter(Boolean) as Result[])
      : evaluate(
          h,
          c,
          makeEvent(c, f.event || "field_changed", f.field, known(f.val)),
        );
  const engineMs = performance.now() - start;
  const message = results.map((r) => r.message).join(" ");
  const errors: string[] = [];
  if (f.silence) {
    if (results.length) errors.push("Expected silence");
  } else {
    if (!results.length) errors.push("No guidance");
    if (f.status && !results.some((r) => r.primaryStatus === f.status))
      errors.push(`Status expected ${f.status}`);
    if (f.tier && !results.every((r) => r.tier === f.tier))
      errors.push(`Tier expected ${f.tier}`);
    for (const s of f.contains)
      if (!message.toLowerCase().includes(s.toLowerCase()))
        errors.push(`Missing meaning: ${s}`);
    for (const s of f.forbidden || [])
      if (message.toLowerCase().includes(s.toLowerCase()))
        errors.push(`Forbidden meaning: ${s}`);
    for (const s of f.sources)
      if (!results.some((r) => r.citations.some((c) => c.field === s)))
        errors.push(`Missing source ${s}`);
    for (const s of f.flags || [])
      if (!results.some((r) => r.flags.includes(s)))
        errors.push(`Missing flag ${s}`);
    if (f.block && !results.some((r) => r.blocksCompletion))
      errors.push("Gate not blocking");
  }
  for (const r of results) {
    if (r.hospitalId !== h.id || r.citations.some((s) => s.hospitalId !== h.id))
      errors.push("Hospital evidence contamination");
    if (!r.citations.length && !r.missingEvidence)
      errors.push("Missing evidence");
  }
  return {
    id: f.id,
    pass: errors.length === 0,
    expected: f,
    actual: results,
    errors,
    engineMs,
  };
}
export function runEvaluation(hs: Hospital[], fixtures = challengeFixtures) {
  const cases = fixtures.map((f) => runFixture(hs, f));
  return {
    generatedAt: new Date().toISOString(),
    method:
      "Real deterministic engine; fixture semantic/status/source oracle is separate. engineMs excludes render/paint.",
    cases,
    summary: {
      nudge: cases.filter((c) => c.id.startsWith("N") && c.pass).length,
      questions: cases.filter((c) => c.id.startsWith("V") && c.pass).length,
      total: cases.length,
      passed: cases.filter((c) => c.pass).length,
    },
  };
}
export function percentiles(samples: number[]) {
  const sorted = [...samples].sort((a, b) => a - b);
  const p = (n: number) =>
    sorted[Math.max(0, Math.ceil(sorted.length * n) - 1)] || 0;
  return {
    count: sorted.length,
    p50: p(0.5),
    p95: p(0.95),
    max: sorted.at(-1) || 0,
  };
}
