import { mkdirSync, writeFileSync } from "node:fs";
import { seedHospitals } from "../src/data";
import { runEvaluation } from "../src/evaluation";
const report = runEvaluation(seedHospitals);
mkdirSync("reports", { recursive: true });
writeFileSync("reports/acceptance.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify(report.summary));
for (const c of report.cases)
  if (!c.pass)
    console.log(
      c.id,
      c.errors,
      c.actual.map((r) => r.message),
    );
if (report.summary.passed !== report.summary.total) process.exitCode = 1;
