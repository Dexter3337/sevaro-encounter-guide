# Bugfix Requirements Document

## Introduction

The free-text question router in `resolveConcept` (`src/knowledge.ts`) matches concept
aliases against the user's question using a plain substring containment test
(`n.includes(x)`, where `n = normalize(question)` and `x = normalize(alias)`). Because the
test is substring-based rather than token/word-boundary-based, short aliases match the
*interior of unrelated words*. The reported case: at hospital **SYN-006** (Highland Valley
Hospital), the question **"Is EVT available?"** is routed to the **AI** field because the
alias `"ai"` is contained inside the word `"available"`. SYN-006 has no `AI` field in its
guide, so the engine answers `not_in_guide` ("AI is absent") — a confidently wrong answer
to a question that was never about AI.

The same failure mode applies to any short label or alias that happens to be a substring of
a longer English word: `"tee"` inside `"guarantee"`, `"eeg"`, `"evt"`, `"ct"`, and similar.

The fix is confined to **how an alias match is detected** inside `resolveConcept`: switch
from raw substring containment to **whole-token (word-boundary) matching**, while preserving
multi-word alias phrases (e.g. `"ct perfusion"`, `"eeg availability"`), the existing
character-length scoring, the highest-score selection, and the tie → clarification
semantics. The hard-coded regex shortcuts that run after the alias loop (order set, rounding
orders, who-mixes) are out of scope and must be left untouched.

### Scope boundary

- **In scope:** the alias-matching detection inside the `resolveConcept` scoring loop in
  `src/knowledge.ts`.
- **Out of scope:** the three post-loop regex shortcuts (`/order set/`, rounding orders,
  who-mixes), the `scoring` metric itself (alias character length), downstream behavior in
  `ask`/`answerField` (`src/engine.ts`), and the `normalize` helper's definition.

### Relevant facts verified in the code

- `normalize(s)` lowercases the string, replaces every run of non-alphanumeric characters
  with a single space, and trims. Result: tokens are separated by exactly one space and
  trailing punctuation (e.g. `"available?"`) is stripped to `"available"`.
- `resolveConcept` builds, per candidate field, `aliases = [field, ...concepts[field],
  ...importedAliases]`, normalizes each alias to `x`, and does
  `if (n.includes(x)) score = Math.max(score, x.length)`. The field with the highest score
  wins; fields sharing the top score become clarification candidates and `field` is left
  `undefined`.
- Aliases may be multi-word (`"ct perfusion"`, `"eeg availability"`, `"rounding schedule"`,
  `"large vessel occlusion workflow"`), so a whole-token match must match a contiguous
  sequence of tokens, not a single token.
- SYN-006's guide defines `EEG` and `TEE` fields but no `AI` field; the `AI` concept exists
  only in the global `concepts` map, which is why the misroute surfaces as
  `not_in_guide`/"AI is absent".

## Bug Analysis

### Current Behavior (Defect)

The alias scoring loop uses substring containment, so a short alias matches inside a longer,
unrelated word in the normalized question.

1.1 WHEN the question "Is EVT available?" is asked at hospital SYN-006 THEN the router matches the alias "ai" inside the word "available", scores the AI field, selects AI as the single top match, and the engine answers `not_in_guide` ("AI is absent")

1.2 WHEN a question contains a word that merely *contains* a short alias as a substring (e.g. "guarantee" containing "tee", "available" containing "ai", or any word embedding "eeg"/"evt"/"ct") THEN the router scores the corresponding field even though no standalone matching token is present in the question

1.3 WHEN such a spurious substring match produces the single highest score THEN the router returns that unrelated field as an unambiguous answer instead of asking for clarification

### Expected Behavior (Correct)

Alias matching considers a whole-token (word-boundary) match: an alias matches only when its
normalized token sequence appears as one or more complete, contiguous, space-delimited tokens
in the normalized question.

2.1 WHEN the question "Is EVT available?" is asked at hospital SYN-006 THEN the router SHALL NOT match the AI field via the alias "ai" inside "available", and SHALL respond with a clarification request (or route to a legitimately matching field) rather than returning the wrong AI "not in guide" answer

2.2 WHEN a short alias (e.g. "ai", "tee", "eeg", "evt", "ct") appears only as a substring inside a longer word in the question THEN the router SHALL NOT score the field associated with that alias

2.3 WHEN a short alias appears as a standalone whole token in the question (e.g. "What is the AI software?" containing "ai") THEN the router SHALL score the associated field exactly as it does today

2.4 WHEN a multi-word alias (e.g. "ct perfusion", "eeg availability") appears as a contiguous sequence of whole tokens in the question THEN the router SHALL match it as a whole-token phrase and score it using the alias character length, preserving current scoring

2.5 WHEN alias matches are scored THEN the router SHALL CONTINUE TO use alias character length as the score, select the single highest-scoring field, and emit all fields sharing the top score as clarification candidates with `field` left undefined

### Unchanged Behavior (Regression Prevention)

3.1 WHEN a question legitimately contains an alias as a whole token or whole-token phrase (the existing correctly-routed questions) THEN the router SHALL CONTINUE TO resolve to the same field it resolves to today

3.2 WHEN the post-loop regex shortcuts apply (question matches `/order set/`, or `/rounding/` with order/medication/antiplatelet/change terms, or who-mixes/who-prepares) THEN the router SHALL CONTINUE TO return the same shortcut field, unaffected by the matching change

3.3 WHEN two or more fields tie on the top score after whole-token matching THEN the router SHALL CONTINUE TO return `field: undefined` with the tied fields as `candidates`, so the caller asks "Which guide field do you mean?"

3.4 WHEN no alias matches as a whole token THEN the router SHALL CONTINUE TO return an empty-or-no-match result that drives the existing "No unambiguous guide concept matched" clarification path

3.5 WHEN the fixture-backed routing questions in `src/fixtures.ts` and the routing assertions in `tests/holdout.test.ts` and `tests/triggers.test.ts` are run THEN they SHALL CONTINUE TO pass with the same resolved fields and statuses

## Deriving the Bug Condition

Let `n = normalize(question)` (single-space-delimited, punctuation-stripped tokens) and, for
each candidate field, let its normalized aliases be `x_1 … x_k`.

### Bug Condition

```pascal
FUNCTION isBugCondition(Q, H)
  INPUT:  Q question string, H hospital
  OUTPUT: boolean

  n <- normalize(Q)
  FOR EACH field IN candidateFields(H) DO
    FOR EACH alias IN aliasesOf(field, H) DO
      x <- normalize(alias)
      // substring match that is NOT a whole-token match
      IF substringContains(n, x) AND NOT wholeTokenContains(n, x) THEN
        RETURN true
      END IF
    END FOR
  END FOR
  RETURN false
END FUNCTION
```

Where `wholeTokenContains(n, x)` is true iff `x` appears in `n` as a contiguous run of
complete tokens — operationally `(" " + n + " ").includes(" " + x + " ")`, which relies on
`normalize` producing single-space-delimited tokens.

Concrete counterexample: `resolveConcept("Is EVT available?", SYN-006)` →
`n = "is evt available"`; alias `x = "ai"`; `"is evt available".includes("ai")` is true (inside
"available") while `" is evt available ".includes(" ai ")` is false. Today AI is scored and
wins; it must not be.

### Property — Fix Checking

```pascal
// For every input where a short alias only matches as an interior substring,
// the fixed router must not score that field via that alias.
FOR ALL (Q, H) WHERE isBugCondition(Q, H) DO
  result <- resolveConcept'(Q, H)
  ASSERT result does NOT attribute any score to a field solely because one of its
         aliases is an interior-substring (non-whole-token) match in normalize(Q)
END FOR

// Specific acceptance instance:
ASSERT resolveConcept'("Is EVT available?", SYN-006).field != "AI"
ASSERT ask'(SYN-006, ctx, "Is EVT available?") yields a clarification
       (or a legitimately matching field), NOT a not_in_guide "AI is absent" answer
```

### Property — Preservation Checking

```pascal
// For every input that does NOT trigger the bug, the fixed router behaves identically.
FOR ALL (Q, H) WHERE NOT isBugCondition(Q, H) DO
  ASSERT resolveConcept(Q, H) = resolveConcept'(Q, H)   // same field, same candidates
END FOR
```

**Definitions**

- **F** — `resolveConcept` as it exists today (substring containment).
- **F'** — `resolveConcept` after the fix (whole-token / word-boundary containment, with
  multi-word alias phrases matched as contiguous token sequences).
