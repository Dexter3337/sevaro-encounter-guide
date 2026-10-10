# Research and test-data package

Start with `decision_brief.md` and `Sevaro_Challenge_1_Foundation.xlsx`.

The workbook has linked research tables with stable IDs, source IDs and locators, synthetic labels, explicit unknowns, test specifications and expected outputs. `Trace Links` contains one relationship per row. Search/filter an ID to follow a requirement to its test and expected outcome. `Coverage` describes specification coverage, not measured implementation passes.

`knowledge_base.json` is the authoritative combined research snapshot. `tables/` contains UTF-8-with-BOM CSV exports suitable for Excel, one per table. Long cells retain source text and lists; normalized joins are in `Trace_Links.csv`. Dates in CSV/JSON are ISO text, and date-only workbook columns are typed Excel dates. Local event timestamps retain timezone/offset text to prevent Excel from silently changing their meaning.

`hospital_guides_reconstructed.json` and `storyboard_notes_reconstructed.json` preserve the supplied PDF fixtures in an unofficial schema. They are not the missing organizer JSON files. All seven supplied sites are fictional. The actual challenge encounter reference date is March 17, 2026; do not use today's date for these baseline tests.

`development_guides.json` contains supplied challenge and newly authored development rule records. `held_out_guides.json` contains held-out hospital rules plus separately labeled baseline stress-test sites. These exports retain original wording and draft normalization; they are research inputs, not an implemented executable engine. New/renamed fields and malformed cases are carried as explicit per-scenario patches.

`development_inputs.jsonl` and `held_out_inputs.jsonl` contain context and ordered events in an unofficial schema. The scenario's `hospital_id` resolves the corresponding guide. Apply any `guide_patch`, `guide_extra`, rename, storyboard patch, version or source-state fixture in context before replay. `source_local_time` / `source_event_text` retain challenge labels where normalized. “Unspecified” means the source did not supply that fact. Treat completion state assumptions as documented in the matching oracle.

`expected_outputs.jsonl` is a separate oracle file. Never expose it to the tested companion. Expected semantic content, statuses, quality flags, tiers, silence and forbidden outputs are independently authored from source/fixture rules; they are not model-execution results. No clinician adjudication or runtime benchmark has occurred. `split_manifest.json` freezes the split and checksums the input/oracle files.

All statuses outside the six challenge labels are diagnostic flags or test-only “None” outcomes. Missing verification, unavailable guides, unsupported semantics and same-source conflicts need the proposed presentation extensions documented in the decision brief. Exact schedule endpoints use a proposed half-open interval policy, pending organizer clarification.

`validation_report.json` records source reconstruction and linked-data checks. It does not measure guidance correctness, latency, clinical safety or production readiness. `research_batch_log.md` records saved batches, new evidence, gaps and stopping rationale.

Rebuild order for maintainers: baseline extraction, research expansion, test generation, data finalization, workbook generation. Keep existing stable IDs. Add new meaningful patterns and tests before changing coverage. Record evidence access date, source scope and open ambiguities. Preserve original wording. Clinical treatment instructions from public sources must not become fictional-site rules.
