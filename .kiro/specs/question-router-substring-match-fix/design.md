# Question Router Substring-Match Fix — Bugfix Design

## Overview

The free-text question router `resolveConcept` in `src/knowledge.ts` decides which guide
field a clinician's natural-language question is about. It builds a per-field alias list,
normalizes each alias, and scores a field whenever any of its aliases is **contained** in the
normalized question (`n.includes(x)`). Because containment is a raw substring test, a short
alias matches the *interior* of an unrelated word: the alias `"ai"` is found inside
`"available"`, so **"Is EVT available?"** at hospital **SYN-006** scores the `AI` field,
selects it as the single top match, and the engine answers `not_in_guide` ("AI is absent") —
a confidently wrong answer to a question that was never about AI.

The fix is a single, surgical change to how a match is **detected** inside the alias scoring
loop: replace substring containment with a **whole-token (word-boundary) match** that still
supports multi-word alias phrases. Operationally this is
`(" " + n + " ").includes(" " + x + " ")`, which treats `x` as matched only when it appears
as a contiguous run of complete, space-delimited tokens in `n`.

Everything else stays exactly as it is: the scoring metric (alias character length via
`Math.max`), the highest-score selection, the top-score-tie → clarification semantics
(`field` left `undefined`), and the three post-loop regex shortcuts (order set, rounding
orders, who-mixes). No other files change.

## Glossary

- **Bug_Condition (C)**: An input `(question, hospital)` where some alias matches the
  normalized question only as an interior substring of a longer word — i.e. a substring match
  that is NOT a whole-token match — and therefore scores a field it should not.
- **Property (P)**: The desired behavior for inputs in C — the fixed router must not score a
  field solely because one of its aliases is an interior-substring (non-whole-token) match.
- **Preservation**: For every input NOT in C, the fixed router must produce the identical
  result (same `field`, same `candidates`) as the current router.
- **`resolveConcept(q, h)`**: The function in `src/knowledge.ts` that maps a free-text
  question `q` at hospital `h` to `{ field?, candidates }`. The subject of this fix.
- **`normalize(s)`**: Helper in `src/knowledge.ts` that lowercases `s`, replaces every run of
  non-alphanumeric characters with a single space, and trims. Guarantees tokens are separated
  by exactly one space and that trailing punctuation (`"available?"`) is stripped
  (`"available"`). The whole-token fix depends on this single-space, punctuation-stripped
  invariant.
- **`n`**: `normalize(q)` — the normalized question.
- **`x`**: `normalize(alias)` — a normalized alias (may be a single token like `"ai"` or a
  multi-word phrase like `"ct perfusion"`).
- **Whole-token match**: `x` appears in `n` as a contiguous sequence of complete tokens, with
  a token boundary (string start/end or a space) on both sides.
- **F / F'**: The original (substring) and fixed (whole-token) versions of `resolveConcept`.

## Bug Details

### Bug Condition

The bug manifests when a short alias token (or multi-word phrase) is found inside the
normalized question only as part of a longer word, not as a standalone token sequence. The
scoring loop uses `n.includes(x)`, which cannot distinguish `"ai"` as a word from `"ai"`
inside `"available"`. When such a spurious substring match produces the single highest score,
the router returns that unrelated field as an unambiguous answer instead of asking for
clarification.

**Formal Specification:**
```
FUNCTION isBugCondition(Q, H)
  INPUT:  Q question string, H hospital
  OUTPUT: boolean

  n <- normalize(Q)
  FOR EACH field IN candidateFields(H) DO           // Object.keys(concepts) ∪ H.fields
    FOR EACH alias IN aliasesOf(field, H) DO        // [field, ...concepts[field], ...importedAliases]
      x <- normalize(alias)
      // substring match that is NOT a whole-token match
      IF substringContains(n, x) AND NOT wholeTokenContains(n, x) THEN
        RETURN true
      END IF
    END FOR
  END FOR
  RETURN false
END FUNCTION

// Operational definition of the whole-token test the fix introduces.
FUNCTION wholeTokenContains(n, x)
  RETURN (" " + n + " ").includes(" " + x + " ")    // relies on single-space normalize tokens
END FUNCTION
```

### Examples

- **"Is EVT available?" at SYN-006** → `n = "is evt available"`; alias `x = "ai"`.
  `"is evt available".includes("ai")` is **true** (inside "available") but
  `" is evt available ".includes(" ai ")` is **false**. Today: `AI` is scored, wins as the
  single top match, and the engine answers `not_in_guide` ("AI is absent"). Expected: `AI`
  must not be scored; the router asks for clarification or routes to a legitimate field.
- **"tee" inside "guarantee"** → a question containing `"guarantee"` scores the `TEE` field
  today because `"...guarantee...".includes("tee")` is true; `" ... guarantee ... ".includes(" tee ")`
  is false. Expected: `TEE` is not scored.
- **"eeg"/"evt"/"ct" embedded in a longer word** → any question word that merely *contains*
  one of these short aliases scores the associated field today; expected: not scored.
- **Edge case — standalone token "What is the AI software?"** → `n` contains `"ai"` as a whole
  token (and `"ai software"` as a phrase). This is NOT a bug input; `AI` must still be scored
  exactly as today.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- A question that legitimately contains an alias as a whole token or whole-token phrase SHALL
  resolve to the same field it resolves to today (Requirement 3.1).
- The post-loop regex shortcuts SHALL be unaffected: `/order set/` → `Order Set Name`;
  `/rounding/` with `orders?|antiplatelet|medication|change` → `Rounding Orders`;
  `/who.*mix|who.*prepar/` → `Thrombolytic Mix Model` (Requirement 3.2).
- A top-score tie SHALL still return `field: undefined` with the tied fields as `candidates`
  (Requirement 3.3).
- When no alias matches, the result SHALL still drive the existing "No unambiguous guide
  concept matched" clarification path (Requirement 3.4).
- The scoring metric (alias character length via `Math.max`), the highest-score selection,
  and the candidate-set construction SHALL remain identical (Requirement 2.5).

**Scope:**
All inputs that do NOT involve an interior-substring-only alias match should be completely
unaffected by this fix. This includes:
- Questions where every scored alias already matches as a whole token (the existing
  correctly-routed questions, including fixtures V01–V20 and N1–N9 in `src/fixtures.ts`).
- Questions that are resolved by one of the three post-loop regex shortcuts.
- Multi-word alias phrases (`"ct perfusion"`, `"eeg availability"`, `"lvo pathway"`,
  `"evt team"`) that appear as a contiguous sequence of whole tokens — these must continue to
  match and score by their full character length.

**Note:** The expected *correct* behavior for bug inputs is defined in the Correctness
Properties section (Property 1). This section records what must NOT change.

## Hypothesized Root Cause

The bug description and the verified code point to one precise cause:

1. **Substring containment instead of boundary-aware matching** (confirmed root cause): the
   single line `if (n.includes(x)) score = Math.max(score, x.length);` uses raw substring
   containment. `String.includes` has no notion of word boundaries, so any alias that is a
   substring of a word in `n` matches. Short aliases (`"ai"`, `"tee"`, `"ct"`, `"eeg"`,
   `"evt"`) are the ones that collide with common English words.

2. **Not a normalization problem**: `normalize` already strips punctuation and collapses
   whitespace to single spaces, so `"available?"` becomes `"available"`. The tokens are clean;
   the matcher just ignores token boundaries. The fix therefore belongs in the matcher, not in
   `normalize`.

3. **Not a scoring problem**: alias character length and `Math.max` behave correctly once the
   match set is correct. The spurious score only exists because a non-matching alias is treated
   as matching. Fixing detection removes the spurious score without touching the metric.

4. **Not a shortcut problem**: the three regex shortcuts run after the loop and short-circuit
   with explicit fields; they never consult the alias scores, so they are unaffected.

Because multi-word aliases exist (`"ct perfusion"`, `"eeg availability"`,
`"large vessel occlusion workflow"`, `"evt team"`), the replacement must match a contiguous
run of tokens, not a single token — which the pad-and-space test
`(" " + n + " ").includes(" " + x + " ")` handles naturally.

## Correctness Properties

Property 1: Bug Condition — Interior-substring aliases must not score

_For any_ input `(Q, H)` where the bug condition holds (`isBugCondition` returns true — i.e.
some alias matches `normalize(Q)` only as an interior substring of a longer word), the fixed
`resolveConcept` SHALL NOT attribute any score to a field solely because one of its aliases is
a non-whole-token substring match. Concretely, `resolveConcept'("Is EVT available?", SYN-006).field`
SHALL NOT be `"AI"`, and `ask'(SYN-006, ctx, "Is EVT available?")` SHALL yield a clarification
(or a legitimately matching field), not a `not_in_guide` "AI is absent" answer.

**Validates: Requirements 2.1, 2.2**

Property 2: Preservation — Non-bug inputs behave identically

_For any_ input `(Q, H)` where the bug condition does NOT hold (`isBugCondition` returns
false), the fixed `resolveConcept'` SHALL produce the same result as the original
`resolveConcept` — the same resolved `field` and the same `candidates` — preserving the
scoring metric, the highest-score selection, whole-token and whole-phrase matches, the
tie → clarification semantics, and the three post-loop regex shortcuts.

**Validates: Requirements 2.3, 2.4, 2.5, 3.1, 3.2, 3.3, 3.4, 3.5**

## Fix Implementation

### Changes Required

A single-line change inside the alias scoring loop. No other files, no change to `normalize`,
no change to the scoring metric, no change to the shortcuts or the tie logic.

**File**: `src/knowledge.ts`

**Function**: `resolveConcept` (alias scoring loop, ~lines 146–184)

**Specific Changes**:
1. **Replace substring detection with whole-token detection**: in the inner loop over
   `aliases`, change the match test only:
   ```ts
   // before
   for (const a of aliases) {
     const x = normalize(a);
     if (n.includes(x)) score = Math.max(score, x.length);
   }

   // after
   for (const a of aliases) {
     const x = normalize(a);
     if ((" " + n + " ").includes(" " + x + " ")) score = Math.max(score, x.length);
   }
   ```
2. **Rely on the `normalize` invariant**: because `normalize` collapses non-alphanumeric runs
   to single spaces and trims, padding both sides with a single space makes the test a true
   whole-token / whole-phrase boundary check. Multi-word aliases (`"ct perfusion"`) match only
   when the full phrase appears as adjacent tokens.
3. **Leave the scoring metric untouched**: still `score = Math.max(score, x.length)`.
4. **Leave selection and tie logic untouched**: the `ranked` sort, `top`, `candidates`
   de-duplication, and `candidates.length === 1 ? top.field : undefined` return are unchanged.
5. **Leave the three post-loop regex shortcuts untouched**: `/order set/i`, the rounding
   branch, and `/who.*mix|who.*prepar/i` keep their current order and behavior.

**Guard against the empty-alias edge case**: an empty normalized alias `x = ""` would make
`" " + n + " "` contain `"  "`-style matches only if `n` is empty; in practice aliases are
non-empty, and an empty `x` scores length 0 (no effect) exactly as it did under `includes`.
No additional handling is required, but preservation tests cover it.

## Testing Strategy

### Validation Approach

Two phases. First, surface counterexamples that demonstrate the bug on the **unfixed** code so
the root cause is confirmed, not assumed. Then verify the fix satisfies Property 1 (fix
checking) and Property 2 (preservation), with preservation driven by property-based testing
over the existing routing corpus plus the fixture- and trigger-backed regression suites.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix, and
confirm the substring-containment root cause. If a counterexample does not reproduce, the
hypothesis is refuted and must be re-examined.

**Test Plan**: Call `resolveConcept` directly (and `ask` for the end-to-end instance) on the
UNFIXED code and assert the buggy outcome, so the tests go red once the fix lands — proving
they exercise the defect.

**Test Cases**:
1. **EVT → AI misroute at SYN-006** (primary acceptance): `resolveConcept("Is EVT available?", SYN-006).field === "AI"` on unfixed code (will fail / flip after fix).
2. **End-to-end wrong answer**: `ask(SYN-006, ctx, "Is EVT available?")` returns a
   `not_in_guide` "AI is absent" answer on unfixed code (will fail after fix).
3. **"tee" inside "guarantee"**: a question containing the word "guarantee" scores the `TEE`
   field via alias `"tee"` on unfixed code (will fail after fix).
4. **Short alias embedded in a longer word**: a question embedding `"eeg"`/`"evt"`/`"ct"`
   inside an unrelated word scores the associated field on unfixed code (will fail after fix).

**Expected Counterexamples**:
- Fields are scored because an alias is an interior substring of a longer word in
  `normalize(q)`.
- Confirmed cause: `n.includes(x)` ignores token boundaries.

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed function does not
score a field via an interior-substring-only alias (Property 1).

**Pseudocode:**
```
FOR ALL (Q, H) WHERE isBugCondition(Q, H) DO
  result := resolveConcept_fixed(Q, H)
  ASSERT result does NOT attribute score to any field whose only match for Q
         is a non-whole-token substring alias
END FOR

// Specific acceptance instance
ASSERT resolveConcept_fixed("Is EVT available?", SYN-006).field != "AI"
ASSERT ask_fixed(SYN-006, ctx, "Is EVT available?") yields a clarification
       (or a legitimately matching field), NOT a not_in_guide "AI is absent" answer
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed function
returns the identical result as the original (Property 2).

**Pseudocode:**
```
FOR ALL (Q, H) WHERE NOT isBugCondition(Q, H) DO
  ASSERT resolveConcept_original(Q, H) = resolveConcept_fixed(Q, H)   // same field, same candidates
END FOR
```

**Testing Approach**: Property-based testing is the right tool for preservation because:
- It generates many `(question, hospital)` pairs across the input domain automatically.
- It catches boundary cases (leading/trailing spaces, phrase-vs-token, empty alias) that
  hand-written cases miss.
- It gives a strong guarantee that behavior is unchanged for every non-buggy input, not just
  the ones we thought of.

**Test Plan**: Capture the baseline on the UNFIXED code, then assert the FIXED code matches it
on non-bug inputs.
- Build a generator that draws from the known routing questions — the fixture questions in
  `src/fixtures.ts` (V01–V20, N1–N9) plus assembled whole-token and whole-phrase questions —
  and from the seeded/holdout hospitals.
- For each generated `(Q, H)` where `NOT isBugCondition(Q, H)`, assert `F(Q, H)` equals
  `F'(Q, H)` on both `field` and `candidates`.

**Test Cases**:
1. **Fixture routing parity (SYN-006 guards)**: Observe `resolveConcept` / `ask` results for
   the SYN-006 fixtures and assert they are unchanged after the fix:
   - **V06** "What is the LVO pathway after 1900 on a weekday?" → `LVO Protocol`
     (whole-token/phrase `"lvo"` / `"lvo pathway"` still matches).
   - **V09** "Patient has an LVO. Do I activate the EVT team?" → `LVO Protocol`
     (multi-word alias `"evt team"` matches as a contiguous phrase; the standalone `"ai"`
     interior match in no word here, and `"lvo"` is a whole token).
   - **V18** "Who mixes the TNK?" → `Thrombolytic Mix Model` via the `/who.*mix/` shortcut,
     unaffected by the matching change.
2. **Whole-token still matches (2.3)**: "What is the AI software?" still scores `AI` (standalone
   `"ai"` token and `"ai software"` phrase both present).
3. **Multi-word phrase still matches (2.4)**: "Does the hospital have CT perfusion?" still
   scores `CT Perfusion` via the contiguous phrase `"ct perfusion"`.
4. **Shortcut parity (3.2)**: "Which order set should I use?" → `Order Set Name`; a rounding
   order-change question → `Rounding Orders`; who-mixes/who-prepares → `Thrombolytic Mix Model`.
5. **Tie parity (3.3)** and **no-match parity (3.4)**: inputs that tie or match nothing return
   the same `candidates` / `field: undefined` as before.

### Unit Tests

- Whole-token vs interior-substring for each short alias: `"ai"`, `"tee"`, `"eeg"`, `"evt"`,
  `"ct"` — matched as a standalone token (scored) vs embedded in a longer word (not scored).
- Multi-word alias matching: `"ct perfusion"` and `"eeg availability"` match as contiguous
  phrases; a question with the two words non-adjacent or in reverse order does not match the
  phrase.
- Boundary conditions: alias at the start of the question, at the end, and surrounded by
  punctuation that `normalize` strips (`"EVT?"`, `"EVT."`).
- Scoring unchanged: when multiple aliases match, the score is still the max alias character
  length, and the single top-scoring field wins.

### Property-Based Tests

- Generate random questions composed of real alias tokens interleaved with random filler words
  and assert that only whole-token/whole-phrase alias occurrences are scored (Property 1 side).
- Generate random `(question, hospital)` pairs from the fixture corpus and seeded/holdout
  hospitals; for non-bug inputs assert `F(Q, H) === F'(Q, H)` on `field` and `candidates`
  (Property 2).
- Generate words that embed short aliases as interior substrings (e.g. append letters around
  `"ai"`/`"tee"`/`"ct"`) and assert the associated field is never scored by that alias.

### Integration Tests

- **EVT clarification (acceptance)**: `ask(SYN-006, ctx, "Is EVT available?")` resolves to a
  clarification request (or a legitimately matching field), and the response is NOT the
  `not_in_guide` "AI is absent" answer.
- **SYN-006 fixtures still green**: running the fixture harness for V06, V09, and V18 produces
  the same resolved fields and statuses as before the fix.
- **Full regression suites unchanged**: `tests/holdout.test.ts` (free-text routing such as
  "What is the interpreter connection procedure?" and "CT perfusion on Friday at 10:00") and
  `tests/triggers.test.ts` continue to pass with identical resolved fields and statuses
  (Requirement 3.5).
