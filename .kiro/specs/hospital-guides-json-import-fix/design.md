# Hospital Guides JSON Import Fix — Bugfix Design

## Overview

The official hospital guides file (`data/raw/hospital_guides.json`) and any hospital
submitted in the "same format as above" fail to import through `previewImport`. The import
rejects the file with an error originating from the timezone being `undefined` or
non-IANA when `Temporal.Now.zonedDateTimeISO(h.timezone)` is called in `previewImport`.

The root cause is in `adaptHospital(raw)` in `src/imports.ts`. When a single hospital
**object** (or an array of such objects) is adapted, `adaptHospital` hand-maps `id`,
`name`, and `version` from their aliases but **never maps a timezone alias and never
normalizes a human-readable timezone label** such as `"Central (America/Chicago)"`. The
field survives only when the raw object happens to carry a literal `timezone` key with a
clean IANA value — which the official file does not (it carries a labeled value), and which
an alias such as `local_timezone` does not satisfy at all.

The fix is minimal and scoped to the import adaptation path: introduce a single shared
`normalizeTimezone` helper that (a) resolves the timezone from its known aliases
(`timezone`, `time_zone`, `local_timezone`) and (b) extracts the IANA identifier from a
`"Label (IANA/Zone)"` value. `adaptHospital` sets a normalized `timezone` on every adapted
hospital object, and the existing reconstructed-bundle branch reuses the same helper
instead of its inline regex so the two paths cannot diverge.

**Acceptance target:** importing `data/raw/hospital_guides.json` yields 7 hospitals,
159 supported fields, and 0 errors. The 159 figure is an interpretation-dependent count
(169 total field records across 7 hospitals, classified by `interpretation()` in
`src/knowledge.ts`) and MUST be confirmed empirically by the verification plan rather than
derived by hand.

## Glossary

- **Bug_Condition (C)**: The input condition that triggers the bug — a hospital object is
  adapted via `adaptHospital` while carrying its timezone only under a non-canonical alias
  (`local_timezone` / `time_zone`) and/or as a human-readable label like
  `"Central (America/Chicago)"`, so the adapted hospital has no valid IANA `timezone`.
- **Property (P)**: The desired behavior for buggy inputs — the adapted hospital SHALL
  carry a valid IANA `timezone` string accepted by `Temporal.Now.zonedDateTimeISO`, so the
  hospital imports successfully with its fields retained.
- **Preservation**: Inputs that already produce a valid IANA timezone (e.g. the holdout
  object form with `timezone: "America/Los_Angeles"`, the reconstructed-bundle path, and
  the CSV path) MUST import with byte-for-byte identical results.
- **`adaptHospital`**: The function in `src/imports.ts` (around line 143) that converts a
  raw hospital object/array-element into the shape consumed by `hospitalSchema.parse`. It
  hand-maps `id`, `name`, `version`, and `fields`.
- **`previewImport`**: The entry point in `src/imports.ts` that parses, adapts, validates
  (`hospitalSchema.parse`), and calls `Temporal.Now.zonedDateTimeISO(h.timezone)` per
  hospital. This Temporal call is where the undefined/invalid timezone surfaces as an error.
- **Reconstructed-bundle path**: The `Array.isArray(x.hospitals) && Array.isArray(x.fields)`
  branch of `previewImport` (around lines 236–238) that already extracts the IANA zone from
  the parenthetical using `String(h.timezone).match(/\((.*?)\)/)?.[1] || h.timezone`.
- **`timezone` alias set**: `["timezone", "time_zone", "local_timezone"]`, already declared
  in the `aliases` map and already honored on the CSV path via `mapRecord`.

## Bug Details

### Bug Condition

The bug manifests when a hospital **object** is passed through `adaptHospital` (the single
object path `else items = [adaptHospital(x)]`, or the array-of-objects path
`parsed.map(adaptHospital)`, or the `x.hospitals`-only path `x.hospitals.map(adaptHospital)`)
and that object expresses its timezone either under a non-canonical alias
(`local_timezone` / `time_zone`) or as a human-readable label such as
`"Central (America/Chicago)"`. `adaptHospital` spreads `...raw` and overrides `id`, `name`,
`version` but leaves `timezone` untouched, so the adapted hospital has no clean IANA
timezone. `hospitalSchema` accepts `timezone` as any string, so validation passes, and the
failure surfaces one line later at `Temporal.Now.zonedDateTimeISO(h.timezone)`.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type RawHospitalObject (routed through adaptHospital)
  OUTPUT: boolean

  rawZone := input.timezone OR input.time_zone OR input.local_timezone
  RETURN adaptedVia(input) = adaptHospital
         AND (
              input.timezone is undefined           // zone only under an alias
              OR NOT isValidIanaZone(input.timezone) // zone is a human-readable label
         )
         AND isValidIanaZone(extractIana(rawZone))   // a correct zone IS recoverable
END FUNCTION
```

Note: `isValidIanaZone(x)` means `Temporal.Now.zonedDateTimeISO(x)` does not throw.
`extractIana(x)` returns the parenthetical IANA segment of a `"Label (IANA/Zone)"` value,
or `x` unchanged when there is no parenthetical.

### Examples

- **Official bundle, labeled timezone (headline case):** A hospital object
  `{ hospital_id: "SYN-001", name: "Cedar Ridge Medical Center",
  timezone: "Central (America/Chicago)", guide_version: "Challenge v2", fields: [...] }`
  routed through `adaptHospital`. Expected: imports with `timezone` normalized to
  `America/Chicago`. Actual (unfixed): `Temporal.Now.zonedDateTimeISO("Central (America/Chicago)")`
  throws, so `previewImport` records an error and returns zero hospitals.
- **Alias-only timezone:** `{ id: "H1", name: "X", local_timezone: "America/Denver",
  fields: {...} }`. Expected: imports with `timezone` = `America/Denver`. Actual (unfixed):
  adapted hospital `timezone` is `undefined`; Temporal throws on `undefined`.
- **Snake-case alias:** `{ id: "H2", name: "Y", time_zone: "America/New_York", fields: {...} }`.
  Expected: imports with `timezone` = `America/New_York`. Actual (unfixed): `undefined`,
  Temporal throws.
- **Already-clean IANA (edge case, must stay working):**
  `{ id: "ORBIT-91", name: "Harbor Lantern · Synthetic", timezone: "America/Los_Angeles",
  fields: {...} }` (the holdout object form). Expected and actual: imports unchanged. The
  fix MUST NOT alter this.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- The holdout object-form import (`data/holdout/unfamiliar-hospitals.json`, four hospitals
  with clean IANA `timezone` and object-shaped `fields`) must import with identical
  hospitals, fields, diagnostics, counts, and zero errors — i.e. `tests/holdout.test.ts`
  must continue to pass unchanged.
- The reconstructed-bundle path (`x.hospitals` + `x.fields`) must produce the same adapted
  hospitals as before; the labeled-timezone extraction result must be identical when the
  inline regex is replaced by the shared helper.
- The CSV path (`fromRecords` / `mapRecord` / `suggestMap`) must be completely unaffected;
  its timezone handling already works and is out of scope for this change.
- All import validation and safety checks must remain intact: 1 MB / 20-level / 2,000-row /
  1–50-hospital bounds, duplicate identity detection, cross-hospital/version contamination
  checks, calendar-date validation, and inert-source-text behavior.

**Scope:**
All inputs that already yield a valid IANA timezone, and all inputs that do not reach
`adaptHospital` at all, must be completely unaffected by this fix. This includes:
- Hospital objects whose `timezone` is already a clean IANA identifier.
- The CSV import path.
- Malformed inputs that are expected to error (they must still error, for the same reasons).

The actual expected correct behavior for buggy inputs is defined in Property 1 below.

## Hypothesized Root Cause

Based on the bug description and a reading of `src/imports.ts`, the cause is confirmed to be:

1. **Missing timezone alias mapping in `adaptHospital` (primary):** `adaptHospital`
   hand-maps `id`, `name`, and `version` from their aliases but never resolves the timezone
   from `time_zone` / `local_timezone`. It depends on the raw object already having a
   literal `timezone` key via the `...raw` spread. Objects carrying only an alias lose the
   timezone entirely, producing `undefined`.

2. **No IANA extraction on the plain object path (primary):** Even when a literal
   `timezone` key is present, the official file stores it as a human-readable label
   `"Central (America/Chicago)"`. The plain `adaptHospital` object path does not extract the
   parenthetical IANA identifier, so Temporal rejects the label string. The
   reconstructed-bundle branch already handles this via `/\((.*?)\)/`, which is why that one
   path works and the plain-object path does not — the logic is duplicated and incomplete.

3. **Schema does not catch it (contributing):** `hospitalSchema.timezone` is `z.string()`
   with no IANA validation, so a bad timezone passes schema validation and only fails later
   at the Temporal call, making the error message less obvious than a schema error.

4. **Not the CSV alias map:** The `aliases.timezone` entry already lists all three aliases
   and the CSV path honors them, so the CSV path is not the gap. This rules out "add a CSV
   alias" as the fix.

## Correctness Properties

Property 1: Bug Condition - Timezone alias resolution and IANA normalization

_For any_ hospital object routed through `adaptHospital` where the bug condition holds
(`isBugCondition` returns true — the timezone is present only under an alias and/or as a
human-readable `"Label (IANA/Zone)"` value from which a valid IANA identifier is
recoverable), the fixed `adaptHospital` SHALL set the adapted hospital's `timezone` to that
valid IANA identifier, such that `Temporal.Now.zonedDateTimeISO(timezone)` succeeds and the
hospital imports with all of its fields retained.

**Validates: Requirements 2.1, 2.2**

Property 2: Preservation - Clean-timezone and non-`adaptHospital` inputs unchanged

_For any_ input where the bug condition does NOT hold (`isBugCondition` returns false — the
timezone is already a valid IANA identifier, or the input does not reach `adaptHospital`,
e.g. the CSV path), the fixed code SHALL produce exactly the same `previewImport` result as
the original code: identical hospitals, fields, diagnostics, counts, and errors.

**Validates: Requirements 3.1, 3.2, 3.3**

## Fix Implementation

### Changes Required

Assuming the root cause analysis above is correct, all changes are confined to
`src/imports.ts`. No other files change.

**File**: `src/imports.ts`

1. **Add a shared `normalizeTimezone` helper (new, single source of truth):**
   - Signature: `normalizeTimezone(raw: Record<string, unknown>): string`.
   - Resolve the raw zone value from the alias set in order of preference:
     `raw.timezone ?? raw.time_zone ?? raw.local_timezone`.
   - Coerce to string, then extract the IANA identifier: if the value matches
     `/\((.*?)\)/`, return the captured group (the parenthetical, e.g. `America/Chicago`),
     otherwise return the trimmed value unchanged (already-clean IANA like
     `America/Los_Angeles` passes through untouched).
   - Return `""` when no alias is present (so behavior for genuinely missing timezones is
     unchanged — it still fails the Temporal check, as it should).

2. **Use `normalizeTimezone` in `adaptHospital`:** In both object branches (the
   `Array.isArray(raw.fields)` branch and the `raw.fields` object branch), add
   `timezone: normalizeTimezone(raw)` to the returned object, placed after the `...raw`
   spread so it overrides any raw `timezone` key. Do not touch `id`, `name`, `version`, or
   the fields mapping.

3. **Reuse `normalizeTimezone` on the reconstructed-bundle path (de-duplicate):** Replace
   the inline `String(h.timezone).match(/\((.*?)\)/)?.[1] || h.timezone` expression in the
   `x.hospitals` + `x.fields` branch with a call that routes through the same helper, so the
   two paths cannot diverge. The computed value must be byte-for-byte identical to the
   current inline result for all current inputs.

4. **No change to `hospitalSchema`, `mapRecord`, `fromRecords`, `suggestMap`, the alias
   map, or `previewImport`'s validation/bounds logic.** The fix is purely in adaptation.

**Minimal-change guarantee:** The only behavioral delta is that `adaptHospital` now emits a
normalized IANA `timezone`. For inputs that already carried a clean IANA `timezone`,
`normalizeTimezone` returns that same string, so the output is unchanged.

## Testing Strategy

### Validation Approach

Two phases: first reproduce the failing import on the unfixed code to confirm the root
cause (timezone undefined/invalid), then verify the fix imports correctly and preserves all
existing behavior. A new test file (`tests/imports.test.ts`, Vitest, matching the existing
`tests/*.test.ts` convention) drives both phases.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix, and
confirm the root cause (timezone not resolved / not IANA-normalized on the `adaptHospital`
object path). If these tests do NOT fail on unfixed code, the root cause hypothesis is
refuted and must be re-examined.

**Test Plan**: Load `data/raw/hospital_guides.json`, call `previewImport(raw, "json")` on
the UNFIXED code, and assert the current (buggy) failure. Also construct minimal
alias-only objects and labeled-timezone objects and run them through `previewImport`.

**Test Cases**:
1. **Official bundle fails (headline):** `previewImport` of `data/raw/hospital_guides.json`
   returns `errors.length > 0` and `hospitals.length === 0` on unfixed code (will fail on
   unfixed code — i.e. demonstrates the bug).
2. **Labeled-timezone object fails:** a single object with
   `timezone: "Central (America/Chicago)"` errors on unfixed code (will fail on unfixed code).
3. **Alias-only object fails:** a single object with `local_timezone: "America/Denver"` and
   no `timezone` key errors on unfixed code (will fail on unfixed code).
4. **Snake-case alias object fails:** `time_zone: "America/New_York"` errors on unfixed code
   (may fail on unfixed code).

**Expected Counterexamples**:
- `Temporal.Now.zonedDateTimeISO` throws because `h.timezone` is `undefined` (alias-only
  cases) or a non-IANA label (labeled cases).
- Possible causes confirmed: missing alias mapping in `adaptHospital`; missing IANA
  extraction on the plain object path; schema not validating IANA.

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed
`adaptHospital` produces a hospital with a valid IANA timezone and the import succeeds.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  result := previewImport(serialize(input), "json")   // uses adaptHospital_fixed
  ASSERT result.errors = []
  ASSERT isValidIanaZone(result.hospitals[0].timezone)
  ASSERT fieldsRetained(result.hospitals[0], input)
END FOR
```

Concrete acceptance check for the headline file:
```
p := previewImport(readFile("data/raw/hospital_guides.json"), "json")
ASSERT p.errors = []
ASSERT p.hospitals.length = 7
ASSERT p.counts.supported = 159        // confirm empirically; see note below
```

**Note on the 159 figure:** the raw file has 169 field records across 7 hospitals
(SYN-001..007). "159 supported" is the count of records that `interpretation()` classifies
as `supported`; it is NOT simply 169 minus the 7 "Local Time Zone" rows. The verification
step MUST read `p.counts.supported` from the actual run and reconcile it with the target. If
the observed supported count differs from 159, that discrepancy is a finding to resolve
during implementation (either the target is restated from the measured counts, or an
interpretation gap is investigated) — it is not silently overwritten.

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed code
produces the same `previewImport` result as the original.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT previewImport_original(serialize(input)) = previewImport_fixed(serialize(input))
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation because it
generates many hospital objects across the input domain (random clean IANA zones, random
field shapes) and asserts the fixed and original outputs match, catching edge cases manual
tests would miss. Golden-value assertions complement it for the two real fixtures.

**Test Plan**: Capture behavior on the UNFIXED code first for already-working inputs (the
holdout file and the reconstructed-bundle path), then assert the fixed code reproduces it.

**Test Cases**:
1. **Holdout object form preserved:** `previewImport` of
   `data/holdout/unfamiliar-hospitals.json` yields the same 4 hospitals, same fields, same
   `errors === []` as before (the entire existing `tests/holdout.test.ts` must still pass).
2. **Clean-IANA object unchanged:** a hospital object already carrying
   `timezone: "America/Los_Angeles"` produces an identical adapted hospital before and after.
3. **CSV path unchanged:** the CSV mapping test in `tests/holdout.test.ts` continues to pass
   (CSV path never calls `adaptHospital`).
4. **Reconstructed-bundle extraction equivalence:** for the labeled timezones in the bundle,
   the helper-produced IANA value equals the previous inline-regex value.
5. **Error paths unchanged:** malformed JSON, oversized input, cross-hospital contamination,
   and invalid calendar dates still error.

### Unit Tests

- `normalizeTimezone` extracts the parenthetical IANA from `"Central (America/Chicago)"`,
  `"Mountain (America/Denver)"`, `"Pacific (America/Los_Angeles)"`,
  `"Eastern (America/New_York)"`.
- `normalizeTimezone` resolves `local_timezone` and `time_zone` aliases.
- `normalizeTimezone` passes a clean IANA value through unchanged and returns `""` when no
  alias is present.
- `adaptHospital` sets a valid IANA `timezone` for both the array-`fields` and object-`fields`
  branches while leaving `id`, `name`, `version`, and the fields mapping intact.

### Property-Based Tests

- Generate hospital objects with a random clean IANA zone drawn from a fixed set and random
  object-shaped fields; assert `previewImport` output is identical before and after the fix
  (preservation).
- Generate hospital objects whose timezone is wrapped as `"<label> (<IANA>)"` or placed under
  a random alias; assert the fixed import succeeds and the resulting `timezone` is the
  expected IANA value (fix).

### Integration Tests

- Full import of `data/raw/hospital_guides.json`: assert 7 hospitals, 0 errors, and the
  supported-field count reconciled against the 159 target.
- Full import of `data/holdout/unfamiliar-hospitals.json`: assert unchanged 4-hospital result
  (headline preservation regression guard).
- `activate(seedHospitals, imported)` behaves as before for the imported official hospitals
  (no new version collisions introduced by the fix).
