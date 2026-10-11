# Machine A — Alien data ingestion

> Paste this whole file into Claude Code opened at `sevaro-encounter-guide`.

## Who you are

You own **whether we pass judging**. Tomorrow the judges hand us two files for a hospital we have
never seen — `hospital_guides.json` and `storyboard_notes.json` — and we drop them in live. Right
now the storyboard file is **rejected** and guide imports attach **zero** storyboard sources, so a
new hospital's conflicts would be invisible. Everything else in this sprint is cosmetic next to
this.

**You own:** `src/imports.ts`, `data/fixtures/**`, `data/seeds/contacts.json`,
`scripts/build-seeds.mjs`, `tests/imports.test.ts`, `tests/alien.test.ts`.

**You must not touch:** `src/engine.ts`, `src/time.ts`, `src/knowledge.ts`, `src/main.tsx`, or any
UI folder. `src/domain.ts` is owned by Machine B — if you need a schema change, message B.

**Branch:** `sprint/a-ingestion` off `sprint/demo`, after B and C have pushed their kickoff
commits.

## Read first

1. `docs/sprint/SPRINT_PLAN.md` — especially §8 guardrails
2. `C:\Users\harsh\Downloads\Challenge_1_Handbook.pdf` — chapter 4 (the test) and issues 1, 6, 8, 12
3. `data/official/hospital_guides.json`, `data/official/storyboard_notes.json` — the exact formats
4. `src/imports.ts` in full, and `src/domain.ts` (`sourceSchema`, `hospitalSchema`, `activate`)
5. `data/official/README.md`

## Non-negotiables

- A hospital's answer never comes from another hospital.
- The storyboard `note` column is sponsor commentary (e.g. "Disagrees with the on-call guide for
  stroke alerts"). **Never parse it, never show it, never let it affect a verdict.** Their file may
  omit or change it.
- A failed import leaves the active data completely untouched.
- Versions are immutable. Preserve original uploaded bytes and unknown keys.
- Synthetic data only; phone numbers in the 555-01xx range.

---

## A1 — Storyboard import (P0, target: merged by 13:00)

**Problem.** `fromRecords` (`src/imports.ts:92`) requires `hospitalId`, `field` and `raw`, and
rejects anything else at line 111. The sponsor storyboard uses `hospital_id`, `field`,
`storyboard_value`, `storyboard_updated`, and carries no hospital name or time zone — so it fails
twice over. It must also **merge into an existing hospital**, not create a new one.

**Build:**

1. **Classify** the parsed JSON/CSV before routing it. Detect a storyboard payload by shape: an
   array (or `{storyboard: []}` / `{records: []}`) whose rows have `hospital_id` plus any of
   `storyboard_value`, `storyboard_updated`, or `kind: "storyboard"`. Guides keep their existing
   path.

2. **Map** each row to the internal source record:

   ```ts
   {
     id: `${hospitalId}:storyboard:${slug(field)}`,
     hospitalId, field,
     raw: storyboard_value,            // aliases: value, storyboardValue
     sourceKind: "storyboard",
     updatedAt: storyboard_updated,    // aliases: updated, updated_at, storyboardUpdated
     version: <target hospital version>,
     sourceName: <uploaded filename>,
     locator: `storyboard row ${i + 1}`,
     extra: { ...unknown keys, including note }   // retained, never read
   }
   ```

   Note the shape in `src/data/seeds.json` (search `"sourceKind":"storyboard"`) — match it exactly
   so the engine reads your records with no change. Storyboard rows carry `updatedAt`, never
   `lastVerified`.

3. **Merge, three cases:**
   - *Same bundle as guides:* attach rows to the matching hospital before `activate`, producing
     one `Hospital` per id carrying both source kinds.
   - *Storyboard alone, hospital already active:* clone the active hospital, append the storyboard
     sources, and create a **new immutable version** labelled `<version> +storyboard <date>`.
     `activate` rejects a duplicate id+version, so the new label is required.
   - *Hospital unknown:* do not drop the rows. Hold them in the preview with a clear diagnostic
     ("3 storyboard rows for UNKNOWN-01 — import that hospital's guide to apply them") and let the
     user activate the rest.

4. **Order independence.** Guide-then-storyboard and storyboard-then-guide must both end with the
   same active data. Test both.

**Acceptance:**

```ts
previewImport(readFileSync("data/official/storyboard_notes.json","utf8"), "json")
// → errors: [], 2 storyboard rows mapped, diagnostics name the hospitals
```
After importing both official files into an empty workspace, `getSources(h, "Video Eval Location")`
for SYN-002 returns a guide record **and** a storyboard record, and the engine reports a conflict.

---

## A2 — Multi-file drop (P0)

The judges hand over two files. Make that one gesture.

- Accept multiple files from the file input and from drag-and-drop onto the import panel.
- Classify each independently: guide, storyboard, contacts, unknown.
- One combined preview: per-file row counts and diagnostics, and a cross-file summary
  ("Harbor Lantern: 23 guide fields + 2 storyboard rows; 1 conflict").
- Activate **atomically** — any error in any file and nothing activates.
- Keep the existing bounds (1 MB per file, 2,000 rows, nesting depth) and the preserved-originals
  behaviour.

Expose the API as `previewImportBundle(files: {name, text, format}[]): Preview` so Machine C can
wire the UI with one call. Tell C the signature as soon as it exists.

---

## A3 — Alien-data tolerance (P0)

Their file will not look exactly like ours. Harden without guessing.

| Tolerate | Do not tolerate |
|---|---|
| Key aliases: `hospital_id`/`hospitalId`/`id`, `hospital_name`/`name`, `local_timezone`/`timezone`/`tz`, `last_verified`/`lastVerified`/`verified`, `value`/`storyboard_value` | Inventing a time zone or a verification date |
| `fields` as an array of `{field, value}` **or** an object map `{"CT Head": "24/7"}` **or** `{"CT Head": {value, last_verified}}` | Defaulting a missing `last_verified` to today |
| Top-level `{hospitals: []}`, a bare array, or a single hospital object | Silently dropping unreadable rows |
| Field-name variants: case, extra spaces, `&`↔`and`, `/`↔` / `, trailing punctuation | Fuzzy-matching a name you are not sure about |
| Extra unknown keys and columns | Discarding them |
| CSV with unfamiliar headers (existing mapper) | Guessing a column mapping without showing it |
| Dates as `YYYY-MM-DD` | Accepting ambiguous `03/04/2026` — reject with a clear message |

Field-name normalisation belongs in a **data file** you create, `data/field-aliases.json`:

```json
{ "CTA Head/Neck": ["cta head and neck", "cta head/neck", "ctahead neck", "cta (head & neck)"],
  "CT Perfusion": ["ctp", "ct perfusion (ctp)"],
  "Required Note Title": ["note title", "required note title"] }
```

Normalise by lowercasing, collapsing whitespace, mapping `&`→`and`, and stripping punctuation
except `/`. A name that matches nothing is **kept verbatim and preserved** — it stays answerable
and appears in diagnostics as "not mapped to a caselog trigger". Never force a doubtful match.

Every rejection must name the file, the row and the reason, in plain words a presenter can read
aloud.

---

## A4 — Contacts (P1)

New data source: the doctor's third escalation step. Format:

```json
{ "contacts": [
  { "hospital_id": "SYN-006", "role": "technical_lead", "name": "Priya Raman (synthetic)",
    "title": "Telemedicine technical lead", "phone": "+1-555-0177",
    "alt_channel": "Teams: hvh-telehealth", "availability": "Mon-Fri 0700-1900",
    "last_verified": "2026-02-02" } ] }
```

- Roles exactly: `technical_lead`, `nursing_in_charge`, `administrator`. Schema allows more.
- Import path (JSON + CSV) attaching to the hospital like storyboard rows.
- Write `data/seeds/contacts.json` with all three roles for all seven kit hospitals **plus your
  SYN-108 fixture**. Vary availability on purpose: one `24/7`, one `Mon-Fri 0700-1900`, one with a
  `last_verified` older than 180 days so staleness shows.
- Phone numbers must be 555-01xx. Names clearly synthetic.

Machine D consumes `hospital.contacts` — tell D the moment it lands.

---

## A5 — Rebuild the seeds from official files (P1)

`src/data/seeds.json` currently hard-codes the two storyboard rows. Replace it with a generated
artefact so that **the thing we demo is the thing we import**.

Write `scripts/build-seeds.mjs` that reads `data/official/hospital_guides.json` +
`storyboard_notes.json` + `data/seeds/contacts.json` through *your own importer* and writes
`src/data/seeds.json`. Add `"seeds": "node scripts/build-seeds.mjs"` to package.json scripts.

Verify the regenerated seeds keep all 29 sponsor cases green (`pnpm test`). If a case breaks, the
importer is wrong — fix the importer, not the test. **This proves A1 works**, because the kit's
storyboard conflicts now come through the real import path.

---

## A6 — The unseen-hospital fixture (P1, Machine E needs it)

Create `data/fixtures/syn-108/` with `hospital_guides.json` and `storyboard_notes.json` for
**Riverbend Community Hospital (SYN-108)**, zone `America/Phoenix` (no daylight saving — catches
bugs that hide elsewhere), ~24 fields in sponsor format. Exercise every handbook issue:

| Must include | Why |
|---|---|
| `CTA head and neck` (alias spelling) and a brand-new field `Interpreter Line` | Issues 2, 12 |
| `LVO Protocol`: "Thrombectomy capable Tue/Thu 0800-1600; otherwise ED provider initiates transfer." | Issues 4, 5 |
| `EEG`: "Weekdays 7a–5p" | Unseen schedule phrasing |
| No `Required Note Title`, no `CT Perfusion` | Issue 6 |
| `Thrombolytic Mix Model` last verified `2025-07-01` | Issue 7 |
| Storyboard: `Video Eval Location` **disagrees**; `Thrombolytic` **agrees**; `Wake Up Protocol` "Yes" vs guide "Yes - all stroke alerts" | Issue 8 + the false-alarm trap |
| `Rounding Timing`: "During hospitalist hours" | Issue 9 |
| `Charge Entry`: "Required before sign-off" | Issue 10, affirmative in words |
| `Order Entry`: "Teleneurologist does not place orders" | Issue 11, negative in words |

Keep SYN-108 out of the seeds — it is only ever imported.

---

## A7 — Tests (P0, write as you go)

`tests/imports.test.ts` and a new `tests/alien.test.ts`:

- Official storyboard file imports with zero errors.
- Both orders (guide→storyboard, storyboard→guide) produce identical active data.
- Storyboard for an unknown hospital → held with a diagnostic, not dropped, rest activates.
- Mutating or deleting the `note` column changes nothing in the output. *(Guardrail 4.)*
- Object-map `fields`, bare array, single hospital object all import.
- Alias field names map; an unmatched name is preserved verbatim and reported.
- Missing `last_verified` stays missing — never defaulted.
- Ambiguous date format is rejected with a readable message.
- Failed bundle leaves previously active hospitals byte-identical.
- SYN-108 imports and yields: a conflict on Video Eval, agreement on Thrombolytic, and
  `not_in_guide` for Required Note Title.
- Cross-hospital: after importing SYN-108, a question about a field only SYN-001 has returns
  "Not available in this hospital's guide."

## Verify before every push

```bash
pnpm typecheck && pnpm test && pnpm test tests/alien.test.ts
```

## Report at each checkpoint

One message: what landed, the `previewImportBundle` signature, whether `pnpm seeds` regenerates
clean, and anything you need from B (schemas) or C (UI wiring).
