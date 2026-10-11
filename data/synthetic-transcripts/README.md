# Four synthetic Sevaro consultation transcripts

Four entirely invented patient–teleneurologist conversations for testing the hospital-specific caselog companion. No patient record, recording, or real identifying information was used.

| File | Duration | Hospital | Main testing elements |
| --- | --- | --- | --- |
| [01 — corrected timeline](01_cedar_ridge_corrected_timeline.txt) | 09:40 | Cedar Ridge / SYN-001 | Corrected last known well; contrast reaction; completed CTA with pending vessel result; undefined staffing hours |
| [02 — wake-up case](02_redwood_wake_up_unknown_lkw.txt) | 16:15 | Redwood / SYN-003 | Unknown baseline; discovery time versus text-message time; partner attribution; negative final LVO report; video interruption |
| [03 — after-hours LVO](03_highland_valley_after_hours_lvo.txt) | 12:35 | Highland Valley / SYN-006 | Positive final LVO report; Central versus Eastern clock; transfer actor; missing guide fields; stale preparation instructions |
| [04 — seizure evaluation](04_meadowlands_seizure_stale_eeg_handoff.txt) | 18:10 | Meadowlands / SYN-004 | Witness uncertainty; family versus patient history; historical imaging; current EEG plan; schedule boundary; unresolved provider-confirmation gate |

The patient and consultant speak in every file. A bedside nurse, partner, sibling or local physician contributes where a real remote consultation would need their help. Hesitations, corrections, questions, examination pauses and technical interruptions are deliberate. Headers identify the synthetic host context; only the text between `TRANSCRIPT START` and `TRANSCRIPT END` is conversation input. Bracketed timestamps identify the start of each turn, not word-level audio alignment.

## Use for testing

1. Open one `.txt` file and create a fresh encounter using its hospital, guide version and fixed March 2026 clock. Avoid inheriting facts from another case.
2. Pass the dialogue body to your transcript extraction experiment. Keep timestamps and speaker roles with the evidence; exclude the header and the answer key from model input.
3. Review suggested patient facts before applying them to caselog fields. Do not automatically fill administrative completion fields or create clinical actions from dialogue.
4. Compare the suggestions with [answer-key.json](answer-key.json). It includes evidence quotes, expected draft facts, corrections, unresolved values, hospital-source snapshots, guidance expectations and specific errors to avoid.
5. Replay relevant field changes and advance the hospital clock to test proactive guidance. In case 04, the old EEG schedule boundary passes during the call; the source remains stale on both sides.

Case 01 deliberately uses an inaccurate initial handoff followed by a correction. Case 02 must not acquire a fabricated last-known-well time. Case 03 must preserve a confirmed completed CTA even though the CTA capability field is missing from the guide. Case 04 must not close because the patient or nurse acknowledges a plan.

These files are offline text fixtures. The current app's live transcription component is not a `.txt` importer or a validated clinical extractor. You can use the files manually or in a separate extraction harness; no automatic import integration or extraction accuracy is claimed here. The answer key is not training input or a precomputed product answer.

## Reproduce the data checks

From the repository root, with Python 3.10+:

```sh
python data/synthetic-transcripts/validate.py
```

The validator checks exactly four transcript files, unique IDs, declared speakers, monotonic timestamps, durations, header/context consistency, exact evidence quotes, guide-source snapshots, intended missing fields, correction times and replay clock checkpoints. It writes [validation-results.json](validation-results.json). It checks corpus integrity and source grounding; it does not run speech recognition, judge clinical decisions, test the app's extraction accuracy, or measure latency.

The guide snapshots come from `src/data/seeds.json`, version `Challenge v2`, with no hospital-data changes. File durations and pauses are illustrative. No audio or word timings exist. Consent dialogue is fictional, not an implemented recording policy. This reduced set does not cover rounding, interpreters, newly imported hospitals, or every sponsor scenario.

All four `.txt` files, this README, the answer key and reproducible validator are also in [the ZIP](../synthetic-transcripts-4.zip).
