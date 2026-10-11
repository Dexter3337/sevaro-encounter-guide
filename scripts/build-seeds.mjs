#!/usr/bin/env node
// Regenerate src/data/seeds.json from the sponsor's own files, through the same
// importer a judge's file goes through. The thing we demo is the thing we
// import: if a sponsor case breaks after this runs, the importer is wrong.
//
//   pnpm seeds
//
// Inputs: data/official/hospital_guides.json, data/official/storyboard_notes.json
// and data/seeds/contacts.json. Contacts for hospitals that are not in the kit
// (SYN-108, which is only ever imported) are held by the importer and left out.

import { readFileSync, writeFileSync } from "node:fs";
import { tsImport } from "tsx/esm/api";

const { previewImportBundle } = await tsImport("../src/imports.ts", import.meta.url);

const KIT_VERSION = "Challenge v2";
const OUT = "src/data/seeds.json";
const read = (path) => ({
  name: path.split("/").pop(),
  text: readFileSync(path, "utf8"),
  format: "json",
});

const p = previewImportBundle(
  [
    read("data/official/hospital_guides.json"),
    read("data/official/storyboard_notes.json"),
    read("data/seeds/contacts.json"),
  ],
  { version: KIT_VERSION },
);

if (p.errors.length) {
  console.error(`✗ The importer rejected the official files:\n  ${p.errors.join("\n  ")}`);
  process.exit(1);
}
const strayStoryboard = p.held.filter((h) => h.storyboard.length);
if (strayStoryboard.length) {
  console.error(
    `✗ Storyboard rows for hospitals not in the kit: ${strayStoryboard.map((h) => h.hospitalId).join(", ")}`,
  );
  process.exit(1);
}

writeFileSync(OUT, `${JSON.stringify(p.hospitals, null, 2)}\n`);
const count = (pred) => p.hospitals.reduce((n, h) => n + h.fields.filter(pred).length, 0);
console.log(
  `✓ ${OUT}: ${p.hospitals.length} hospitals, ${count((f) => f.sourceKind === "guide")} guide fields, ` +
    `${count((f) => f.sourceKind === "storyboard")} storyboard rows, ` +
    `${p.hospitals.reduce((n, h) => n + (h.contacts?.length ?? 0), 0)} contacts.`,
);
if (p.held.length)
  console.log(`  Held for hospitals outside the kit: ${p.held.map((h) => h.hospitalId).join(", ")}`);
