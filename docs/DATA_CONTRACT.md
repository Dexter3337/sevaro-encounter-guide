# Import contract and supported interpretation

All inputs must be synthetic. JSON/CSV validation occurs before activation; a failed bundle leaves the current one untouched. The exact official judging schema is unknown. These are documented adapters, not Sevaro API contracts.

## Shapes

A hospital object, `{ "hospitals": [ ... ] }`, an array of hospital objects, `{ "records": [ ... ] }`, or a per-field record array is accepted. Also supported: a reconstructed bundle with separate `hospitals` metadata and `fields` records. Values must be text, including `"No"`, rather than missing/false/zero shortcuts.

```json
{
  "id": "NEW-SYNTHETIC",
  "name": "Fictional Site",
  "timezone": "America/Chicago",
  "version": "reviewed-v1",
  "fields": {
    "CT Perfusion": {"value": "No", "lastVerified": "2026-02-02"},
    "Interpreter connection procedure": "Call fictional language desk SYN-555"
  }
}
```

`fields` may also be a list of canonical source records:

```json
{"id":"NEW-SYNTHETIC:guide:ctp","hospitalId":"NEW-SYNTHETIC","field":"CT Perfusion","raw":"No","sourceKind":"guide","version":"reviewed-v1","lastVerified":"2026-02-02","sourceName":"Synthetic upload","locator":"row 1","aliases":["CTP availability"]}
```

Metadata aliases include `hospital_id`, `hospital_name`, `guide_version`. Record aliases include `field_name`, `value`, `last_verified`, `source_kind`. Per-field arrays/CSV need hospitalId/name/timezone/field/raw; version defaults visibly to Imported v1 if absent. Verification dates are never defaulted for imported data. Dates are real calendar dates in YYYY-MM-DD. IANA timezone is required; contradictory hospital metadata, duplicate identities/source fields or cross-hospital/version records reject the entire bundle. Original keys are preserved, including unrecognized columns.

CSV has a real quoted-cell parser, header suggestions and explicit column mapping. The sample mapper file deliberately has unfamiliar headers. A hospital version cannot silently overwrite an existing id/version. Different guide versions coexist, with explicit refresh of the active encounter. Storyboard records use `sourceKind: "storyboard"` and `updatedAt`, not invented verification dates.

## Additional proactive mapping

An imported hospital may contain a `mappings` array. New field definitions appear at the chosen step; mapping effects show cited source facts only. New fields currently render as text inputs.

```json
{
  "id":"interpreter-hint",
  "fieldId":"interpreter_needed",
  "label":"Interpreter needed (enter Yes)",
  "step":"intake",
  "sourceField":"Interpreter connection procedure",
  "condition":{"op":"equals","field":"interpreter_needed","value":"Yes"},
  "tier":"info"
}
```

Allowlisted predicates: equals, in, exists, all, any, not, with tri-state unknown propagation. A mapping can use info/advisory tiers and an existing same-hospital source field. It cannot create a completion gate or run code. New gate families require reviewed implementation. Built-in trigger vocabulary/version is documented in `data/normalized/caselog_field_map.csv` and `src/engine.ts`.

## Schedules and question interpretation

Supported schedules: 24/7, Daily, weekdays/weekends, weekday lists/ranges, Mon-Fri/Mon–Fri/Monday through Friday, Tue/Thu, 0700-1900, 07:00-19:00, 7 am to 7 pm, semicolon-separated windows, overnight ranges and on-call qualifiers. Rounding Timing links to When Do We Round?. As scheduled and undefined staffed hours cannot establish a current branch. On-call does not mean continuously staffed.

Supported LVO branching requires documented capability plus an explicit window and recognizable During coverage / Outside coverage sentences. Unfamiliar LVO wording remains partial/reviewable rather than guessed. A non-capable static workflow and a 24/7 capable workflow are supported as source facts. Pharmacy staffed hours never borrow another service's hours.

Free-text concept resolution uses labels, curated synonyms, imported aliases and scope qualifiers. Exact question IDs/answer strings are never runtime switches. Supported temporal questions include ISO calendar dates, weekday names (next occurrence including today), tomorrow/yesterday, and `at HH:mm`/`at 7 pm`. Fixtures provide explicit reference instants for their relative text. Complex phrases such as “next week after lunch,” every before/after phrase, and arbitrary clinical qualifiers are outside automatic parsing; use explicit demo clock/field selection. Clarification is used for unresolved concepts. Specialized service subtypes require source inspection; this is not universal clinical language understanding.

Conflict comparison scopes supported stroke/other-consult location branches and normalizes punctuation/case. It cannot reconcile all natural-language equivalents. The conservative result is inspectable uncertainty, never silent source precedence.

## Bounds and diagnostics

1 MB input/file, 20 nesting levels, 50 hospitals per bundle, 500 fields per hospital, 2,000 record/CSV rows, 12,000 characters per value, 50 mappings per hospital. No executable strings or network calls are interpreted. React escapes displayed text. Partial/review records remain searchable with original source and diagnostics. Import coverage counts refer to record interpretation capability; supported records with time/source uncertainty do not imply available/current service.

Normalized exports are generated by `node node_modules/tsx/dist/cli.mjs scripts/export_contracts.ts`. Source verification can be reproduced with the bundled Python and pdfplumber using `scripts/prepare_sources.py`; Python is unnecessary to run the shipped app. The runtime reads `src/data/seeds.json`; `data/raw` and `data/normalized` retain provenance/contracts for review.
