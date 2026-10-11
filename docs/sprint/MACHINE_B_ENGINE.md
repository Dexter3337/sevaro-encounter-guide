# Machine B — Rules engine

> Paste this whole file into Claude Code opened at `sevaro-encounter-guide`.

## Who you are

You own the part the judges score hardest: **the right rule, for this hospital, at this hospital's
local time, with an honest status — and silence otherwise.** The engine already passes all 29
sponsor cases. Your job today is to make it survive a guide written by someone who has never seen
our code, and to restore one sponsor-exact sentence we broke.

**You own:** `src/engine.ts`, `src/time.ts`, `src/knowledge.ts`, `src/domain.ts`,
`src/fixtures.ts`, `src/evaluation.ts`, and the unit tests `tests/acceptance.test.ts`,
`tests/triggers.test.ts`, `tests/holdout.test.ts`.

**You must not touch:** `src/imports.ts` (Machine A), `src/main.tsx` or any UI folder (C/D),
`tests/e2e/**` (E).

**Branch:** `sprint/b-engine` off `sprint/demo` — but do Kickoff 1 (below) directly on
`sprint/demo` first.

## Read first

1. `docs/sprint/SPRINT_PLAN.md` §6 contracts and §8 guardrails
2. `docs/sources/Challenge_1_Handbook.pdf` — chapter 2 (all 13 issues), chapter 5 (six
   statuses, "How it should behave")
3. `data/official/validation_set.csv` (V01–V20) and `nudge_scenarios.json` (N1–N9) — the oracle
4. `src/engine.ts`, `src/time.ts`, `src/knowledge.ts` in full

## Non-negotiables

- Pure and deterministic. No network, no LLM, no clock reads inside `evaluate` — time comes from
  the context instant.
- One hospital per evaluation. Throw if the context and the hospital disagree.
- Never invent hours, values or dates.
- Never let acknowledgement silently release a gate, and never block silently.

---

## Kickoff 1 — contracts (first 15 minutes, push to `sprint/demo` immediately)

Everyone else is blocked on this. Add to `src/domain.ts` exactly as written in
`docs/sprint/SPRINT_PLAN.md` §5: `action`, `triggerId`, `autoExpand`, `liveStatus`, `release` on
`Result`; `storyboardRecordSchema`; `contactSchema`/`Contact`; `liveStatusSchema`/
`LiveStatusReport`; `contacts?: Contact[]` on `Hospital`.

Set `action: ""` in `base()` so it typechecks, run `pnpm typecheck && pnpm test`, push. Then tell
the team it has landed and start your branch.

---

## B1 — Restore the sponsor's missing-field sentence (P0, first task on your branch)

**What happened.** `src/engine.ts:68` was changed to *"<Field> is not documented in <Hospital>'s
guide. Availability is unknown…"*, and the independent oracle in `src/fixtures.ts` (V14 at :196,
V20 at :254) was edited to accept the new wording. Tests pass while the product disagrees with the
sponsor. The handbook says the doctor sees **"Not available in the hospital guide."** and
`validation_set.csv` expects **"Not available in this hospital's guide."**

**Fix:**

```ts
r.message = `Not available in this hospital's guide. This does not mean ${h.name} lacks it — the field is absent from the guide, and no other hospital was searched.`;
```

Lead with the sponsor sentence; the clarification follows. Restore V14 and V20 in `src/fixtures.ts`
to expect `["Not available in this hospital's guide."]` and add an **exact-substring** assertion so
this cannot drift again.

Keep the distinction the team agreed: a field absent from the guide produces no unsolicited nudge,
except CTA and LVO on arrival before a value is recorded — and those now use this sentence plus
"Confirm locally."

---

## B2 — "What to do" on every result (P0)

The handbook's per-nudge contract has four parts: the answer, where it came from, how sure it is,
**and what the doctor should do, including whether they are blocked.** We have the first three.

Populate `action` on every result. Derive it, do not hand-write it per hospital:

| Case | Action text |
|---|---|
| Hard stop | "Record <requirement> before completing." / "Confirm <requirement>, or acknowledge with a reason." |
| Advisory where the guide text is directive | The guide's own directive sentence for the applicable branch (e.g. "ED provider initiates transfer to a regional comprehensive stroke center.") |
| Info | "For reference — no action needed." |
| Conflict | "Sources disagree. Confirm with the hospital which applies." |
| Not in guide | "Not in this hospital's guide. Confirm locally." |
| Time-dependent, hours undefined | "Coverage hours aren't in the guide. Confirm which applies now." |
| Stale (any status) | Append " Last verified <date> — may be out of date." |

Extracting the directive sentence: pick the clause containing an actor and an action verb
(teleneurologist / ED provider / hospital provider / pharmacy / nursing + activates, initiates,
contacts, calls, communicates, places, uses) for the branch that applies. If you cannot extract
one confidently, fall back to the tier default — never paraphrase the guide into something it does
not say.

Also set `triggerId` (so C can render "Why am I seeing this?") and `autoExpand` per B6.

**Test:** every result from every sponsor case has a non-empty `action`; N2's action says the ED
provider initiates transfer and never mentions activating the EVT team.

---

## B3 — Value semantics as data (P0 — this is how we survive an unseen guide)

Today, meaning is hard-coded to specific phrasings: `src/engine.ts:113` (Order Entry),
`:184` (negation), `:247–248` (Charge Entry `^Yes`, completion-rule regex). A hospital that writes
"Teleneurologist does not place orders" or "Required before sign-off" is read wrongly.

Create `src/data/value-lexicon.json` and a `semantics(raw)` function in `src/knowledge.ts`
returning one of:

| Kind | Patterns (extend generously) |
|---|---|
| `negative` | `no`, `none`, `not available`, `unavailable`, `not capable`, `not thrombectomy capable`, `does not`, `no … entered by teleneurologist`, `not permitted` |
| `not_applicable` | `not applicable`, `n/a`, `hospital provider uses`, `local … order set` |
| `affirmative` | `yes`, `yes - …`, `required`, `permitted`, `capable`, `24/7` |
| `scheduled` | anything the schedule grammar parses into windows |
| `conditional` | contains branch markers: `during coverage` / `outside coverage`, `otherwise`, `for stroke alerts; … for other consults`, `during staffed …` |
| `descriptive` | everything else (names, procedures, order-set strings) |

Rules: the lexicon is ordered, first match wins; matching is on the cleaned, lowercased value;
anything unmatched is `descriptive` with `review: true`. **A `descriptive`/review value may be
shown and answered but must never drive a cascade or a gate** — uncertainty must not block or
unblock anyone.

Replace the three hard-coded regex sites with lexicon calls. The sponsor oracle must stay green.

---

## B4 — Unseen schedule phrasings (P0)

`src/time.ts` already handles `24/7`, `Daily`, `Mon-Fri`, `Tue/Thu`, `0700-1900`, `07:00-19:00`,
`7 am to 7 pm`, semicolon lists, overnight ranges and on-call qualifiers. Add, with tests:

- `Weekdays` / `Weekends` as day sets; `Weekdays 7a-5p`, `7a`/`5p` compact meridiem
- `Mon–Fri` en-dash and `Monday to Friday`
- `Mon, Wed, Fri` comma lists
- `0800 to 1600`, `8:00am-4:00pm`
- `Except holidays` → parse the window, add a `holidays_unknown` flag and say so (we have no
  holiday calendar — do not guess)
- `By arrangement`, `On request`, `During hospitalist hours`, `As scheduled` → **undefined hours**:
  no current branch can be established; state what is unknown and give both branches

Keep the existing conventions: start inclusive, end exclusive; overnight windows belong to their
starting weekday; ambiguous or nonexistent DST wall times are rejected, never coerced.

Add property tests across DST boundaries for `America/Chicago`, `America/New_York`,
`America/Los_Angeles`, `America/Denver`, `America/Phoenix` (no DST) and `Europe/London`.

---

## B5 — The conflict matrix (P0)

Implement all of these in a dedicated `compare()` in `src/engine.ts`, with one test each:

| # | Situation | Status | Shown |
|---|---|---|---|
| C1 | Guide only | per guide | Guide value |
| C2 | Guide ≡ storyboard | guide's | Guide value; evidence notes "Storyboard agrees" |
| C3 | Guide ≠ storyboard | `conflict` | Both values, each with source and date, no precedence |
| C4 | Equivalence uncertain | `conflict` + `possible` flag | Both, labelled "may differ — confirm" |
| C5 | Guide has scope branches | compare only the branch for this consult type | SYN-002 stroke → C3; General Neuro → C2 |
| C6 | Storyboard only | `not_in_guide` | Sponsor sentence **plus** the storyboard value labelled "Storyboard only" |
| C7 | Conflict with a stale side | `conflict` + `stale` | Both ages |
| C8 | Conflict on a gating field | no silent block or release | Advisory at Complete requiring acknowledgement that names both values |
| C11 | Several storyboard rows for one field | `conflict` if any disagree | All rows |

Equivalence order: normalise (case, punctuation, whitespace) → canonicalise schedules (`24/7` ≡
"24 hours a day, 7 days a week") → lexicon synonyms (`Yes` ≡ `Yes - all stroke alerts` where the
qualifier does not change the meaning) → otherwise **uncertain**, which renders as a possible
conflict. A false "agree" hides a real conflict; a false "disagree" only costs a confirmation.
Bias to `uncertain`.

**Never read the storyboard `note` field.** Add a test that mutates it and asserts no output
changes.

---

## B6 — Ranking and auto-expand (P0 — Machine C consumes this)

```
priority = tierBase + boosts + ruleBoost
tierBase: hard_stop 100 · advisory 50 · info 10
boosts:   recorded value contradicts guide capability +30
          live-status alert on a field in play        +25
          conflict                                    +20
          LVO protocol with a recorded LVO            +20
```

Set `autoExpand = priority >= 50 && result is new or changed since the previous evaluation`.
**Info never auto-expands** — the handbook says info "doesn't interrupt". Keep results sorted by
priority descending, stable within a tier.

---

## B7 — Gates (P1)

Build gates from the value lexicon rather than regexes:

| Gate | Fires when | Release |
|---|---|---|
| Charge Entry | semantics is `affirmative` and `charge_entered ≠ true` | `fix_only` |
| Consult Completion Rule | text contains "do not complete … until … confirms" and `plan_confirmed ≠ true` | `acknowledge_with_reason` |

Set `release` on the result so Machine C renders the right control. Under uncertainty (conflict,
stale, review flag) emit an advisory at Complete that names both values and requires an
acknowledgement with a reason — never an automatic block, never an automatic release.

N5, N7 and V10 must stay green.

---

## B8 — Unbound fields (P1)

A field in an alien guide that maps to no caselog trigger must still be answerable. Expose
`unboundFields(h)` listing them. They appear in chat answers and in Machine E's admin diagnostics,
and never generate a proactive nudge. This is how we honour "adding a field is a data change".

---

## Tests

Extend `tests/acceptance.test.ts`, `tests/triggers.test.ts`, `tests/holdout.test.ts`:

- All 29 sponsor cases green against **sponsor wording** throughout.
- Exact-substring test for "Not available in this hospital's guide."
- Lexicon table test: every phrase in the table maps to the right kind.
- Schedule table test: every new phrasing, plus the undefined-hours set.
- DST property tests in six zones.
- Conflict matrix C1–C8, C11.
- `note`-mutation invariance.
- Every result has a non-empty `action`; info never has `autoExpand: true`.
- Cross-hospital isolation: evaluating hospital X never cites a record whose `hospitalId ≠ X`.

Once Machine A's SYN-108 fixture lands, add holdout tests against it: alias field binds,
`Interpreter Line` appears in `unboundFields`, `Order Entry` reads as negative, `Charge Entry`
reads as affirmative and gates, `Rounding Timing` reports undefined hours.

## Verify before every push

```bash
pnpm typecheck && pnpm test
```

## Report at each checkpoint

What landed, any sponsor-case risk, the `Result` fields C and D can rely on, and anything you need
from A (record shapes) or E (fixtures).
