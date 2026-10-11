# SYN-108 — the unseen-hospital fixture

Riverbend Community Hospital, a synthetic hospital that is **never** in the seeds. It exists to be
imported, the way the judges' files will be: drop `hospital_guides.json` and `storyboard_notes.json`
(and optionally `data/seeds/contacts.json`, which carries SYN-108's contacts) on the import panel.

`America/Phoenix` has no daylight saving, which catches time-zone bugs that hide elsewhere.

| Handbook issue | Where it is exercised |
|---|---|
| Alias field name | `CTA head and neck` reads as `CTA Head/Neck` |
| Brand-new field | `Interpreter Line` — kept as written, answerable by asking |
| Unseen schedule phrasing | `EEG`: "Weekdays 7a–5p"; `LVO Protocol`: "Tue/Thu 0800-1600; otherwise …" |
| Missing field | no `Required Note Title`, no `CT Perfusion` |
| Stale field | `Thrombolytic Mix Model` last verified 2025-07-01 |
| Undefined hours | `Rounding Timing`: "During hospitalist hours" |
| Affirmative in words | `Charge Entry`: "Required before sign-off" |
| Negative in words | `Order Entry`: "Teleneurologist does not place orders" |
| Storyboard disagrees | `Video Eval Location`: "Patient room" vs CT scanner bay for stroke alerts |
| Storyboard agrees | `Thrombolytic`: Tenecteplase on both |
| False-alarm trap | `Wake Up Protocol`: storyboard "Yes" vs guide "Yes - all stroke alerts" |

The storyboard `note` column is deliberately wrong on two rows (it calls the disagreeing row a match
and the agreeing row a conflict). Nothing may read it; the tests prove nothing does.
