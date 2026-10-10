import { writeFileSync, mkdirSync } from "node:fs";
import { registry, freshContext } from "../src/domain";
import { seedHospitals } from "../src/data";
import { challengeFixtures } from "../src/fixtures";
import Papa from "papaparse";
mkdirSync("data/normalized", { recursive: true });
const json = (name: string, v: unknown) =>
  writeFileSync(`data/normalized/${name}.json`, JSON.stringify(v, null, 2));
json("hospital_guides", {
  hospitals: seedHospitals.map((h) => ({
    ...h,
    fields: h.fields.filter((s) => s.sourceKind === "guide"),
  })),
});
json(
  "storyboard_notes",
  seedHospitals.flatMap((h) =>
    h.fields.filter((s) => s.sourceKind === "storyboard"),
  ),
);
json("field_registry", { version: "1.0", fields: registry });
json(
  "encounter_context_example",
  freshContext(seedHospitals[5], "2026-03-17T19:30"),
);
json(
  "nudge_scenarios",
  challengeFixtures.filter((f) => f.kind === "nudge"),
);
json(
  "validation_set",
  challengeFixtures.filter((f) => f.kind === "question"),
);
writeFileSync(
  "data/normalized/validation_set.csv",
  Papa.unparse(
    challengeFixtures
      .filter((f) => f.kind === "question")
      .map((f) => ({
        ...f,
        contains: f.contains.join(" | "),
        sources: f.sources.join(" | "),
        flags: (f.flags || []).join(" | "),
      })),
  ),
);
const map = [
  [
    "T01",
    "intake",
    "encounter_opened",
    "Video Eval Location; Wake Up Protocol",
    "info",
  ],
  [
    "T02",
    "history",
    "last_known_well_status = Unknown",
    "Wake Up Protocol",
    "advisory",
  ],
  [
    "T03",
    "history",
    "relevant positive thrombolytic allergy",
    "Thrombolytic",
    "advisory",
  ],
  ["T04", "imaging", "cta_done = true", "CT Perfusion; AI", "info"],
  ["T05", "imaging", "lvo_present = true", "LVO Protocol", "advisory"],
  [
    "T06",
    "recommendation",
    "thrombolytic_given = true",
    "Thrombolytic; Thrombolytic Mix Model; Order Entry; Order Set Name",
    "advisory",
  ],
  [
    "T07",
    "recommendation",
    "order field displayed/focused",
    "Order Entry; Order Set Name",
    "advisory",
  ],
  ["T08", "recommendation", "EEG or seizure in assessment_plan", "EEG", "info"],
  ["T09", "note", "note created/displayed", "Required Note Title", "advisory"],
  [
    "T10",
    "sign_off",
    "completion_requested",
    "Charge Entry; Consult Completion Rule",
    "hard_stop",
  ],
  [
    "T11",
    "rounding",
    "encounter opened",
    "When Do We Round?; Rounding Timing; Rounding Orders",
    "info",
  ],
];
writeFileSync(
  "data/normalized/caselog_field_map.csv",
  Papa.unparse({
    fields: ["id", "step", "trigger", "source_fields", "tier"],
    data: map,
  }),
);
console.log(
  "Exported documented reconstruction contracts. Runtime uses validated src/data/seeds.json.",
);
