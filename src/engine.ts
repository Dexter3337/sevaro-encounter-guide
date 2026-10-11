import { Temporal } from "@js-temporal/polyfill";
import {
  type Context,
  type Event,
  type Hospital,
  type Result,
  type Source,
  type Tier,
  value,
  localTime,
  predicate,
} from "./domain";
import {
  getSources,
  clean,
  scoped,
  interpretation,
  resolveConcept,
  meansNo,
  meansYes,
  semantics,
  normalize,
  conceptName,
} from "./knowledge";
import {
  ageDays,
  windows,
  matchWindow,
  daySet,
  untilOpen,
  queryInstant,
  scheduleNotes,
} from "./time";
export const engineVersion = "1.0";
// The handbook asks four things of every nudge: the answer, where it came
// from, how sure it is, and what the doctor should do. These derive the fourth.
//
// Directives are lifted from the result's own message rather than the raw guide
// text, because the message has already had the applicable branch chosen. At a
// hospital that is outside its thrombectomy window, the message holds only the
// outside-coverage sentence, so the action cannot suggest activating a team
// that is not on duty.
const ACTOR =
  /\b(tele-?neurologist|teleneurology|ED provider|ED physician|ED nurse|hospital provider|primary provider|pharmacy|pharmacist|nursing|nurse|charge nurse|unit clerk|house supervisor|hospitalist|courier)\b/i;
const DIRECTIVE_VERB =
  /\b(activates?|initiates?|contacts?|calls?|communicates?|places?|uses?|alerts?|informs?|notifies?|prepares?|mixes?|delivers?|verifies?|sends?|schedules?|administers?|requests?|confirms?|co-signs?)\b/i;
// A prohibition is not an instruction. "No medication orders entered by
// teleneurologist" tells the doctor what not to do; the useful action is the
// clause that follows it, naming who does place the orders.
const PROHIBITION = /^no\b|\bdoes not\b|\bmay not\b|\bnot permitted\b|\bonly\b/i;
export function directiveClauses(message: string): string[] {
  return message
    .split(/(?<=[.;:])\s+/)
    .map((s) => s.trim())
    .filter(
      (s) =>
        s.length > 10 &&
        ACTOR.test(s) &&
        DIRECTIVE_VERB.test(s) &&
        !PROHIBITION.test(s),
    )
    .map((s) => (/[.!?]$/.test(s) ? s : `${s}.`))
    .slice(0, 3);
}
// Called wherever a result is finished or re-tiered. Idempotent by design: the
// callers re-tier results after answerField returns, so this runs more than once
// for the same result and must always agree with the result's final state.
export function deriveAction(r: Result, h: Hospital): string {
  const stale = r.flags.includes("stale")
    ? ` Last verified ${r.citations.find((s) => s.sourceKind === "guide")?.lastVerified ?? "unknown"} — may be out of date.`
    : "";
  const core = () => {
    if (r.blocksCompletion)
      return r.release === "acknowledge_with_reason"
        ? `${r.message.split(".")[0]}, or acknowledge with a reason.`
        : `${r.message.split(".")[0]}.`;
    if (r.primaryStatus === "conflict")
      return `Sources disagree. Confirm with ${h.name} which applies.`;
    if (r.primaryStatus === "not_in_guide")
      return "Not in this hospital's guide. Confirm locally.";
    if (r.flags.includes("schedule_unknown"))
      return "The guide doesn't define these hours. Confirm which applies now.";
    const directives = directiveClauses(r.message);
    if (directives.length) return directives.join(" ");
    // A time-dependent answer is only true for the hospital's clock right now.
    // "No action needed" would be actively misleading when the answer is that
    // something is unavailable at this hour and may need arranging elsewhere.
    if (r.primaryStatus === "time_dependent")
      return "This depends on the hospital's local time. Re-check if the timing changes.";
    if (r.tier === "info") return "For reference — no action needed.";
    return "Review this before you proceed.";
  };
  return `${core()}${stale}`;
}
// The guide and the storyboard are kept separately, so they can disagree. The
// handbook is firm about what to do: show both with their sources and never
// pick one — and, just as firmly, do not raise a false alarm when they agree.
//
// Getting this wrong in either direction has a cost, but they are not equal.
// A false "agree" hides a real conflict and the doctor acts on one of two
// values without knowing the other exists. A false "disagree" costs them a
// moment's confirmation. So anything we cannot settle is reported as a
// possible difference rather than quietly treated as agreement.
export type Verdict = "agree" | "disagree" | "uncertain";
const STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "via",
  "per",
  "all",
  "any",
  "are",
  "use",
  "used",
  "uses",
  "see",
  "this",
  "that",
]);
const normalise = (raw: string, consultType: string) =>
  scoped(clean(raw), consultType)
    .toLowerCase()
    // Scope qualifiers describe which branch applies, not what the value is.
    .replace(
      /\bfor (?:other consults|inpatient consults|stroke alerts|stroke activation)\b/g,
      "",
    )
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const significantWords = (text: string) =>
  new Set(text.split(" ").filter((w) => w.length >= 3 && !STOPWORDS.has(w)));
const sameSchedule = (a: string, b: string) => {
  const wa = windows(a),
    wb = windows(b);
  if (!wa.length || !wb.length) return false;
  const key = (ws: typeof wa) =>
    ws
      .map((w) => `${[...w.days].sort().join("")}:${w.start}-${w.end}`)
      .sort()
      .join("|");
  return key(wa) === key(wb);
};
const DEFINITE = ["affirmative", "negative", "not_applicable"] as const;
export function compare(
  guide: Source,
  others: Source[],
  consultType: string,
): { verdict: Verdict; reason: string } {
  if (!others.length) return { verdict: "agree", reason: "Only one source." };
  const g = normalise(guide.raw, consultType);
  for (const other of others) {
    const o = normalise(other.raw, consultType);
    if (g === o) continue;
    if (sameSchedule(guide.raw, other.raw)) continue;
    const kg = semantics(guide.raw).kind,
      ko = semantics(other.raw).kind;
    const definite =
      (DEFINITE as readonly string[]).includes(kg) &&
      (DEFINITE as readonly string[]).includes(ko);
    // "Yes" and "Yes - all stroke alerts" are the same answer with a qualifier.
    if (definite && kg === ko) continue;
    if (definite)
      return {
        verdict: "disagree",
        reason: `The guide reads as ${kg}; the storyboard reads as ${ko}.`,
      };
    const wg = significantWords(g),
      wo = significantWords(o);
    const shared = [...wg].filter((w) => wo.has(w));
    if (!shared.length)
      return {
        verdict: "disagree",
        reason: "The two sources describe different things.",
      };
    // They overlap, so one may be a rewording of the other. We cannot tell.
    return {
      verdict: "uncertain",
      reason: "The sources overlap but are not the same; this may be a rewording.",
    };
  }
  return { verdict: "agree", reason: "Sources carry the same answer." };
}
function base(h: Hospital, c: Context, field: string, ss: Source[]): Result {
  const flags = new Set<string>();
  for (const s of ss) {
    if (s.sourceKind === "guide") {
      if (!s.lastVerified) flags.add("verification_unknown");
      else if (ageDays(s.lastVerified, c.instant, h.timezone) > 180)
        flags.add("stale");
    }
    if (interpretation(s) !== "supported") flags.add("interpretation_review");
  }
  return {
    id: `${h.id}:${h.version}:${field}`,
    hospitalId: h.id,
    version: h.version,
    title: field,
    message: "",
    // Kickoff 1 placeholder. B2 derives this from status, tier and the guide's
    // own directive sentence; an empty action is a defect, not a valid result.
    action: "",
    primaryStatus: flags.has("stale") ? "stale" : "answered",
    flags: [...flags],
    tier: "info",
    citations: ss,
    rationale: "Retrieved only from the selected hospital/version.",
    effectiveInstant: c.instant,
    blocksCompletion: false,
    missingRequirements: [],
  };
}
export function answerField(
  h: Hospital,
  c: Context,
  field: string,
  instant = c.instant,
): Result {
  const r = resolveField(h, c, field, instant);
  r.action = deriveAction(r, h);
  return r;
}
// The resolution logic has several exit points; keeping the action derivation
// in the wrapper above means no branch can return a result without one.
function resolveField(
  h: Hospital,
  c: Context,
  field: string,
  instant = c.instant,
): Result {
  const ss = getSources(h, field),
    r = base(h, c, field, ss),
    guide = ss.filter((s) => s.sourceKind === "guide");
  r.effectiveInstant = instant;
  r.effectiveLocal = `${localTime(instant, h.timezone).toPlainDate()} ${localTime(instant, h.timezone).toPlainTime().toString({ smallestUnit: "minute" })} · ${h.timezone}`;
  if (!guide.length) {
    r.primaryStatus = "not_in_guide";
    // The sponsor's sentence leads, verbatim; the clarification follows it.
    // An absent field means the guide has no record, not that the hospital
    // lacks the capability — and no other hospital is ever consulted.
    r.message = `Not available in this hospital's guide. This does not mean ${h.name} lacks it — the field is absent from the guide, and no other hospital was searched.`;
    // The storyboard is a second source, not a substitute for the guide. When
    // it is the only source carrying this field, the doctor still needs to see
    // what it says — withholding it would be hiding information we hold — but
    // it is labelled so they know it has not been confirmed against the guide.
    const only = ss.filter((s) => s.sourceKind === "storyboard");
    if (only.length) {
      r.flags.push("storyboard_only");
      r.message += ` Storyboard only (${only[0].updatedAt ? `updated ${only[0].updatedAt}` : "date unknown"}): ${only.map((s) => scoped(clean(s.raw), c.consultType)).join(" · ")}.`;
    }
    r.missingEvidence = {
      hospitalId: h.id,
      version: h.version,
      field,
      absent: true,
    };
    return r;
  }
  let text = scoped(clean(guide[0].raw), c.consultType);
  r.message = text;
  const second = ss.filter((s) => s.sourceKind !== "guide");
  const { verdict, reason } = compare(guide[0], second, c.consultType);
  if (verdict !== "agree") {
    r.primaryStatus = "conflict";
    r.flags.push("conflict");
    // An unsettled comparison is marked as such. The doctor sees both values
    // either way; this tells them whether we are sure the two differ.
    if (verdict === "uncertain") r.flags.push("possible_conflict");
    r.message = ss
      .map(
        (s) =>
          `${s.sourceKind === "guide" ? "On-call guide" : "Storyboard"} (${s.lastVerified ? `verified ${s.lastVerified}` : s.updatedAt ? `updated ${s.updatedAt}` : "date unknown"}): ${scoped(clean(s.raw), c.consultType)}`,
      )
      .join(" · ");
    r.rationale = `${reason} No source precedence applied.`;
    return r;
  }
  // Agreement is worth recording. A second source that confirms the guide is
  // reassurance; the handbook warns specifically against treating it as alarm.
  if (second.length) r.flags.push("second_source_agrees");
  const timeDependent = (message: string, unknown = false) => {
    r.message = message;
    r.primaryStatus = "time_dependent";
    r.flags.push("time_dependent");
    if (unknown) r.flags.push("schedule_unknown");
  };
  if (field === "Order Set Name") {
    const permission = getSources(h, "Order Entry").find(
      (s) => s.sourceKind === "guide",
    );
    // Where the teleneurologist may not place orders, the order-set name is
    // useless to them; the guide's permission rule is what they need to see.
    // Read by meaning, not by phrasing, so "Teleneurologist does not place
    // orders" is understood as well as "No orders entered by teleneurologist".
    if (permission && meansNo(permission.raw)) {
      r.citations.push(permission);
      r.message = `${text}. ${clean(permission.raw)}.`;
    }
  }
  if (field === "LVO Protocol") {
    if (
      /^Not thrombectomy capable/i.test(text) ||
      /thrombectomy capable 24\/7/i.test(text)
    )
      return r;
    const ws = windows(text);
    const outside = text.match(/Outside coverage(?: hours)?,?\s*(.+)$/i)?.[1];
    if (ws.length && outside && /During coverage/i.test(text)) {
      const inside = text.match(
        /During coverage,?\s*(.+?)(?=\s*Outside coverage)/i,
      )?.[1];
      if (inside)
        timeDependent(
          `${matchWindow(ws, instant, h.timezone) ? "Within coverage" : "Outside coverage"} (${ws.map((w) => w.raw).join("; ")}): ${matchWindow(ws, instant, h.timezone) ? inside : outside}`,
        );
    } else if (/staffed|coverage/i.test(text))
      timeDependent(
        `${text} Coverage hours are not defined in this guide; the applicable branch is unknown.`,
        true,
      );
    else {
      r.flags.push("interpretation_review");
      r.message = `${text} Interpretation requires review; no current branch inferred.`;
    }
  }
  if (field === "Thrombolytic Mix Model" && /staffed hours/i.test(text))
    timeDependent(
      `${text}. Staffed pharmacy hours are not defined; do not infer an overnight cutoff.`,
      true,
    );
  if (field === "Rounding Timing") {
    const ds = getSources(h, "When Do We Round?").filter(
      (s) => s.sourceKind === "guide",
    );
    r.citations.push(...ds);
    const days = ds[0] && daySet(ds[0].raw);
    const ws = windows(text, days);
    const now = localTime(instant, h.timezone);
    if (ds[0] && /as scheduled/i.test(ds[0].raw))
      timeDependent(
        `${ds[0].raw}; ${text}. A scheduled encounter date is not supplied; check the rounding schedule.`,
        true,
      );
    else if (ws.length && days) {
      const open = matchWindow(ws, instant, h.timezone),
        minutes = untilOpen(ws, instant, h.timezone);
      const provider =
        minutes !== undefined
          ? localTime(
              Temporal.Instant.from(instant).add({ minutes }).toString(),
              c.providerZone,
            )
          : undefined;
      timeDependent(
        `${open ? "Rounding window open" : "Rounding window closed"}. ${ds[0].raw}; ${text}.${!days.includes(now.dayOfWeek) ? " Check why a rounding encounter exists outside the listed days." : ""}${minutes !== undefined ? ` Opens in ${minutes} minutes (${provider!.toPlainTime().toString({ smallestUnit: "minute" })} ${c.providerZone}).` : ""}`,
      );
    } else
      timeDependent(
        `${text}. Rounding days or hours are not fully defined.`,
        true,
      );
  }
  // A flat "No" needs no schedule evaluation. A value that merely mentions
  // something being unavailable in a trailing clause is not a flat no:
  // "Daily 0700-1900; continuous EEG unavailable" is a schedule.
  if (["EEG", "CT Perfusion", "MRI"].includes(field) && !meansNo(text)) {
    const ws = windows(text);
    const now = localTime(instant, h.timezone);
    if (ws.length && !/24\/7/.test(text)) {
      if (matchWindow(ws, instant, h.timezone)) {
        r.message = `Listed availability at ${now.toPlainDate()} ${now.toPlainTime().toString({ smallestUnit: "minute" })} ${h.timezone}: ${text}.`;
        if (!r.flags.includes("stale")) {
          r.primaryStatus = "time_dependent";
          r.flags.push("time_dependent");
        }
      } else if (
        field === "EEG" &&
        /Tue\/Thu/i.test(text) &&
        ![2, 4].includes(now.dayOfWeek)
      ) {
        r.primaryStatus = "not_in_guide";
        r.message = `${text}. ${["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][now.dayOfWeek - 1]} availability is not provided. Do not assume.`;
        r.missingEvidence = {
          hospitalId: h.id,
          version: h.version,
          field: `${field} on requested weekday`,
          absent: false,
        };
      } else if (scheduleNotes(text).includes("conditional_cover"))
        // The listed window has closed, but the guide offers cover outside it
        // without saying when — "weekend on-call", "weekends on request".
        // Reporting this as simply unavailable would be wrong.
        timeDependent(
          `${text}. Outside the listed staffed window; the guide offers cover outside it without stating hours, so this requires confirmation.`,
          true,
        );
      else
        timeDependent(
          `Not available in the listed window at this hospital-local time. ${text}.`,
        );
    } else if (!ws.length) {
      timeDependent(
        `${text}. Availability cannot be resolved from the listed schedule.`,
        true,
      );
    }
  }
  // A guide that excludes holidays is telling us its own window is wrong on
  // days it does not identify. We have no holiday calendar, so the honest
  // answer is to say the window holds except on a day we cannot determine.
  if (scheduleNotes(text).includes("holidays_unknown")) {
    r.flags.push("holidays_unknown");
    r.message +=
      " The guide excludes holidays but does not list them; confirm whether today is one.";
  }
  if (r.flags.includes("stale"))
    r.message += ` Possibly out of date (last verified ${guide[0].lastVerified}).`;
  if (
    r.flags.includes("interpretation_review") &&
    !r.flags.includes("schedule_unknown") &&
    interpretation(guide[0]) === "needs_review"
  )
    r.message +=
      " Interpretation requires review; no unsupported branch was inferred.";
  r.rationale = `${field} evaluated at ${localTime(instant, h.timezone).toString()}; freshness reference ${localTime(c.instant, h.timezone).toPlainDate()}.`;
  return r;
}
// Every guide field this engine can raise a nudge for. A hospital's guide may
// carry anything at all, so this list is how we tell the difference between a
// field we will surface unprompted and one that is only reachable by asking.
export const boundFields = [
  "Video Eval Location",
  "Wake Up Protocol",
  "Thrombolytic",
  "Thrombolytic Mix Model",
  "CTA Head/Neck",
  "CT Perfusion",
  "AI",
  "LVO Protocol",
  "Order Entry",
  "Order Set Name",
  "EEG",
  "Required Note Title",
  "Charge Entry",
  "Consult Completion Rule",
  "Rounding Timing",
  "Rounding Orders",
  "When Do We Round?",
] as const;
// Fields this hospital documents that no trigger covers. They never produce an
// unprompted nudge — we have no basis for choosing a step or a tier for them —
// but the doctor can still ask, and an administrator can see what is going
// unused. Adding a hospital or a field stays a data change: an unrecognised
// field is carried, answered and reported, never dropped.
export function unboundFields(h: Hospital): string[] {
  const bound = new Set<string>(
    boundFields.map((f) => normalize(conceptName(f))),
  );
  for (const m of h.mappings || []) bound.add(normalize(conceptName(m.sourceField)));
  const seen = new Map<string, string>();
  for (const s of h.fields) {
    const key = normalize(conceptName(s.field));
    if (!bound.has(key) && !seen.has(key)) seen.set(key, s.field);
  }
  return [...seen.values()].sort();
}
// A completion rule is a gate when it says the consult must not be finished
// until someone else has done something. Hospitals word that differently —
// "do not complete until the hospital provider confirms the plan", "consult may
// not be closed before attending sign-off", "hold completion pending provider
// confirmation" — so this looks for the shape rather than one phrasing: a
// prohibition on completing, and a condition that releases it.
const HOLD =
  /\b(?:do not|don't|never|must not|may not|cannot|can't|should not)\s+(?:\w+\s+){0,3}(?:complete[ds]?|close[ds]?|finish(?:e[ds])?|finali[sz]e?[ds]?|submit(?:ted)?|sign(?:ed)?\s*off)\b|\bhold\s+(?:the\s+)?(?:consult\s+)?completion\b|\bcompletion\s+is\s+(?:blocked|held|withheld)\b/i;
const RELEASE =
  /\b(?:until|before|pending|unless|once|after)\b[\s\S]{0,80}?\b(?:confirm|confirms|confirmed|confirmation|sign[-\s]?off|signs?\s+off|approv|acknowledg|verif)/i;
export function blocksUntilConfirmed(raw: string): boolean {
  return HOLD.test(raw) && RELEASE.test(raw);
}
export function gates(h: Hospital, c: Context): Result[] {
  const out: Result[] = [];
  for (const [field, requirement] of [
    ["Charge Entry", "charge_entered"],
    ["Consult Completion Rule", "plan_confirmed"],
  ] as const) {
    const ss = getSources(h, field).filter((s) => s.sourceKind === "guide");
    if (!ss.length) continue;
    const raw = clean(ss[0].raw),
      // A hospital may write the charge requirement as "Yes", "Yes - encounter
      // charge before sign-off" or "Required prior to sign-off". All three mean
      // the same thing to the doctor. A value the lexicon cannot read stays
      // under review and raises no gate: uncertainty must not block anyone.
      required =
        field === "Charge Entry" ? meansYes(raw) : blocksUntilConfirmed(raw);
    const r = answerField(h, c, field);
    // We cannot tell whether this hospital requires the step. Blocking on a
    // requirement that may not exist would stop a doctor finishing a case for
    // no reason; waving it through would let a real requirement past in
    // silence. So neither: the doctor is told exactly what is unclear and
    // completes by acknowledging it, which is recorded.
    if (
      r.primaryStatus === "conflict" ||
      r.flags.includes("stale") ||
      r.flags.includes("interpretation_review")
    ) {
      const why =
        r.primaryStatus === "conflict"
          ? "the guide and the storyboard disagree about it"
          : r.flags.includes("stale")
            ? `it was last verified ${ss[0].lastVerified ?? "on an unknown date"} and may have changed`
            : "the guide's wording cannot be read with confidence";
      r.message += ` Whether ${h.name} requires this before completion is unclear, because ${why}. Completion is not blocked; confirm with the hospital if it matters for this case.`;
      r.tier = "advisory";
      r.release = "acknowledge_with_reason";
      r.flags.push("uncertain_requirement");
      r.action = `Confirm with ${h.name} whether this is required, then acknowledge to complete.`;
      out.push(r);
      continue;
    }
    if (!required) continue;
    if (value(c, requirement) !== true) {
      r.primaryStatus = "hard_stop";
      r.tier = "hard_stop";
      r.blocksCompletion = true;
      r.missingRequirements = [requirement];
      r.anchor = requirement;
      // D13: the doctor can record a charge themselves, so that gate clears
      // only by doing it. They cannot make a hospital provider confirm a plan,
      // so that one can be acknowledged with a reason instead of blocking the
      // encounter indefinitely.
      r.release =
        field === "Charge Entry" ? "fix_only" : "acknowledge_with_reason";
      r.message = `${field === "Charge Entry" ? "Record the required encounter charge before sign-off" : "Record confirmation of the patient plan from the hospital provider before completion"}. Guide: ${raw}.`;
    } else {
      r.message = `Requirement recorded as satisfied. Guide: ${raw}.`;
      r.flags.push("resolved");
    }
    r.action = deriveAction(r, h);
    out.push(r);
  }
  return out;
}
export function ask(
  h: Hospital,
  c: Context,
  q: string,
): { result?: Result; clarification?: string; candidates?: string[] } {
  if (q.length > 2000)
    return {
      clarification: "Please shorten the question to 2,000 characters.",
    };
  const { field, candidates } = resolveConcept(q, h);
  if (!field)
    return {
      clarification: candidates.length
        ? "Which guide field do you mean?"
        : "No unambiguous guide concept matched. Choose a field or use its label.",
      candidates,
    };
  let instant: string;
  try {
    instant = queryInstant(q, c.instant, h.timezone);
  } catch {
    return {
      clarification:
        "The requested date/time is invalid or ambiguous. Use an explicit ISO instant in demo controls.",
    };
  }
  if (/sign off|sign-off|complete consult|can i complete/i.test(q)) {
    const rs = gates(h, c);
    const gate = rs.find((r) => r.blocksCompletion);
    if (gate) return { result: gate };
    if (rs.length) {
      const uncertain = rs.find(
        (r) =>
          r.primaryStatus === "conflict" ||
          r.flags.some((f) => ["stale", "interpretation_review"].includes(f)),
      );
      const r = {
        ...(uncertain || rs[0]),
        title: "Completion requirements",
        citations: rs.flatMap((r) => r.citations),
        flags: [...new Set(rs.flatMap((r) => r.flags))],
      };
      r.message =
        (uncertain
          ? "Completion requirements cannot be fully verified from current source data. "
          : "Known guide completion requirements are recorded as satisfied. ") +
        rs.map((r) => r.message).join(" ");
      // The composite carries a spread copy of one gate's action, which no
      // longer describes the combined message.
      r.action = deriveAction(r, h);
      return { result: r };
    }
    const r = answerField(h, c, field, instant);
    if (r.primaryStatus !== "not_in_guide") {
      r.message =
        "No supported guide-based charge or plan requirement is incomplete in the recorded state. Guide: " +
        r.message;
      r.action = deriveAction(r, h);
    }
    return { result: r };
  }
  return { result: answerField(h, c, field, instant) };
}
// Conservative finite grammar for manual plan text; not a clinical NLP model.
export function currentEEGConcern(text: string): boolean {
  return text.split(/[.!?;\n]+/).some((clause) => {
    if (!/\b(eeg|seizure)\b/i.test(clause)) return false;
    if (
      /\b(no|not|denies|denied|without|ruled out|historical|history of|yesterday|previous|prior|should|could|whether)\b/i.test(
        clause,
      )
    )
      return false;
    return /\b(request|obtain|order|plan|evaluate|evaluation|concern|suspect|suspected|current|ongoing)\b/i.test(
      clause,
    );
  });
}
// `previous` is the result set from the last evaluation of this encounter. It
// is passed in rather than remembered so the engine stays a pure function of
// its inputs: the same pack, context, event and previous set always produce the
// same output, which is what makes the behaviour testable and replayable.
export function evaluate(
  h: Hospital,
  c: Context,
  e: Event,
  previous: Result[] = [],
): Result[] {
  if (c.hospitalId !== h.id || c.guideVersion !== h.version)
    throw new Error("Hospital/version mismatch");
  const out: Result[] = [];
  const add = (f: string, tier: Tier, anchor?: string, prefix = "") => {
    const r = answerField(h, c, f);
    // Missing documentation is not a hospital capability or an unsolicited task.
    // Explicit questions still return the missing-source explanation via ask().
    if (r.primaryStatus === "not_in_guide" && r.missingEvidence?.absent) return;
    r.tier = tier;
    r.anchor = anchor;
    if (prefix) r.message = prefix + r.message;
    // Tier and prefix are applied after resolution, so the action is re-derived
    // against the result the clinician will actually see.
    r.action = deriveAction(r, h);
    out.push(r);
  };
  // Capability and schedule facts are shown on arrival at the step, before any
  // value is recorded, so the clinician decides with them rather than being
  // corrected after. They are state-based, not event-gated: an unrelated edit
  // never clears them. A recorded value can promote one into an action nudge.
  if (c.step === "intake") {
    add("Video Eval Location", "info");
    add("Wake Up Protocol", "info");
  }
  if (c.step === "history" && /stroke/i.test(c.consultType)) {
    if (value(c, "last_known_well_status") === "Unknown")
      add(
        "Wake Up Protocol",
        "advisory",
        "last_known_well_status",
        "Hospital wake-up workflow: ",
      );
    const allergy = String(value(c, "allergies") || "");
    const drug = getSources(h, "Thrombolytic").find(
      (s) => s.sourceKind === "guide",
    );
    if (
      drug &&
      !/^\s*(none|no|unknown|n\/a)\s*$/i.test(allergy) &&
      !/\b(denies|not allergic|no .*allerg\w*|no known|without .*allerg\w*)\b/i.test(
        allergy,
      ) &&
      /allerg|alteplase|tenecteplase|tnk|tpa|thrombolytic/i.test(allergy) &&
      (/thrombolytic|tnk|tpa/i.test(allergy) ||
        allergy.toLowerCase().includes(clean(drug.raw).toLowerCase()))
    )
      add(
        "Thrombolytic",
        "advisory",
        "allergies",
        "Review recorded allergy against the synthetic hospital field: ",
      );
  }
  if (c.step === "imaging" && /stroke/i.test(c.consultType)) {
    // Before anything is recorded, the two capabilities that drive the imaging
    // decision are named even when the guide omits them, so the clinician
    // confirms locally instead of assuming. Once a value exists the omission is
    // dropped: an absent guide row must never argue with what was observed.
    const untouched =
      value(c, "cta_done") === undefined &&
      value(c, "lvo_present") === undefined;
    const capability = (field: string, anchor: string) => {
      const r = answerField(h, c, field);
      if (r.primaryStatus === "not_in_guide" && r.missingEvidence?.absent) {
        if (!untouched) return;
        r.message += " Confirm locally before relying on it.";
      }
      r.tier = "info";
      r.anchor = anchor;
      out.push(r);
    };
    // What this hospital can image, and when, before either field is answered.
    capability("CTA Head/Neck", "cta_done");
    add("CT Perfusion", "info", "cta_done");
    add("AI", "info", "cta_done");
    capability("LVO Protocol", "lvo_present");
    // A recorded value turns the matching capability into an action nudge.
    if (value(c, "lvo_present") === true)
      add("LVO Protocol", "advisory", "lvo_present");
    if (value(c, "cta_done") === true) {
      const concern = ctaConcern(h, c);
      if (concern) out.push(concern);
    }
  }
  if (c.step === "recommendation") {
    // Which agent this hospital stocks and who prepares it is decision support
    // only until it has been given; afterwards it is noise, so it stops.
    if (/stroke/i.test(c.consultType) && value(c, "thrombolytic_given") !== true) {
      add("Thrombolytic", "info", "thrombolytic_given");
      add("Thrombolytic Mix Model", "info", "thrombolytic_given");
    }
    // The mock renders this field throughout Recommendation. Display-triggered
    // guidance remains applicable after unrelated edits; focus is not required.
    if (/stroke/i.test(c.consultType) && value(c, "thrombolytic_order_placed") !== true) {
      add("Order Entry", "advisory", "thrombolytic_order_placed");
      const permission = getSources(h, "Order Entry").find(
        (s) => s.sourceKind === "guide",
      );
      // Handbook issue 11: one rule switches another off. Showing an order-set
      // name to a doctor who is not permitted to place orders would be wrong.
      if (permission && !meansNo(permission.raw))
        add("Order Set Name", "advisory", "thrombolytic_order_placed");
      else if (permission && meansNo(permission.raw)) {
        const hospitalSet = getSources(h, "Order Set Name").find(
          (s) => s.sourceKind === "guide",
        );
        if (hospitalSet) {
          const permissionResult = out.find((r) => r.title === "Order Entry");
          if (permissionResult) {
            permissionResult.message += `. ${clean(hospitalSet.raw)}.`;
            permissionResult.citations.push(hospitalSet);
            // The appended clause names who does place the orders, which is
            // the only actionable part of a rule that otherwise says "not you".
            permissionResult.action = deriveAction(permissionResult, h);
          }
        }
      }
    }
    if (currentEEGConcern(String(value(c, "assessment_plan") || "")))
      add("EEG", "info", "assessment_plan");
  }
  if (c.step === "note") {
    const required = getSources(h, "Required Note Title").find(s => s.sourceKind === "guide");
    if (!required || String(value(c, "note_title") || "").trim() !== clean(required.raw).trim())
      add("Required Note Title", "advisory", "note_title");
  }
  if (
    c.step === "rounding" ||
    (c.encounterType === "Rounding" && e.type === "encounter_opened")
  ) {
    add("Rounding Timing", "info");
    add("Rounding Orders", "info", "rounding_order_intent");
  }
  if (
    c.step === "sign_off" &&
    (e.type === "completion_requested" ||
      e.fieldId === "charge_entered" ||
      e.fieldId === "plan_confirmed")
  )
    out.push(...gates(h, c));
  for (const m of h.mappings || []) {
    if (c.step === m.step && predicate(m.condition, c) === true)
      add(m.sourceField, m.tier, m.fieldId);
  }
  const ranked = [...new Map(out.map((r) => [r.id, r])).values()]
    .filter((r) => !r.flags.includes("resolved"))
    .sort((a, b) => nudgePriority(b) - nudgePriority(a));
  // Which result, if any, may open the panel on its own. Three conditions, and
  // all of them have to hold.
  //
  // Info never interrupts, whatever its score: the handbook is explicit that
  // info is "available if the doctor looks for it".
  //
  // It has to be new. A rule that was already on screen before this keystroke
  // has had its chance to be read; re-opening the panel for it would punish
  // the doctor for carrying on typing.
  //
  // Only one per event, so the panel settles on the most important thing
  // instead of jumping between several.
  const seen = new Set(previous.map(resultSignature));
  const candidate = ranked.find(
    (r) =>
      r.tier !== "info" &&
      nudgePriority(r) >= TIER_BASE.advisory &&
      !seen.has(resultSignature(r)),
  );
  for (const r of ranked) r.autoExpand = r === candidate;
  return ranked;
}

// How loudly a result should be shown. The tier sets the floor and the
// circumstances raise it, so a rule that is ordinarily reference material can
// still rise above one that is ordinarily advisory when the encounter calls
// for it. 50 and above is a card; below that is a one-line row.
const TIER_BASE: Record<Tier, number> = {
  hard_stop: 100,
  advisory: 50,
  info: 10,
};
export function nudgePriority(r: Result): number {
  let p = TIER_BASE[r.tier];
  // A recorded observation that the guide contradicts is the sharpest case:
  // one of the two is wrong and only the doctor can say which.
  if (r.flags.includes("recorded_capability_conflict")) p += 30;
  // Something the hospital says is down right now, on a field in play.
  if (r.liveStatus?.length) p += 25;
  if (r.primaryStatus === "conflict") p += 20;
  // Loud once an LVO is recorded; until then it is capability context.
  if (r.title === "LVO Protocol" && r.tier !== "info") p += 20;
  // Sources that disagree always reach card level, whatever the tier. A
  // doctor acting on the wrong one of two values is the harm the handbook
  // asks us to prevent, and a collapsed row is too easy to pass over.
  if (r.primaryStatus === "conflict") p = Math.max(p, TIER_BASE.advisory);
  return p;
}
// Identifies a result across evaluations, so the dock can tell a genuinely new
// nudge from the same one still applying. Message and status are included
// because a time-dependent rule keeps its id while its answer changes, and tier
// because the same rule changes meaning when a recorded value promotes it: the
// LVO protocol shown as context before an LVO is recorded, and as an advisory
// once one is, is the same field saying two different things to the doctor.
export function resultSignature(r: Result): string {
  return `${r.id}:${r.tier}:${r.primaryStatus}:${r.message}`;
}

// Capability and encounter facts are separate. A scan may have been performed
// elsewhere; never silently turn a recorded Yes into No based on a guide.
export function ctaConcern(h: Hospital, c: Context): Result | undefined {
  const r = answerField(h, c, "CTA Head/Neck");
  if (r.primaryStatus === "conflict") {
    r.message = `CTA capability sources disagree. Confirm where the scan was performed. ${r.message}`;
  } else if (r.primaryStatus !== "not_in_guide" && /^\s*(?:no\b|none\b|not available\b|unavailable\b)/i.test(r.message)) {
    r.message = `CTA is recorded as completed, but this hospital's guide lists it as unavailable. Confirm whether it was performed elsewhere or correct the field. Guide: ${r.message}`;
  } else return undefined;
  r.tier = "advisory";
  r.anchor = "cta_done";
  r.flags.push("recorded_capability_conflict");
  // A recorded observation outranks the guide here: the scan may have happened
  // elsewhere. The action asks the doctor to reconcile, never to change a
  // clinical fact to match a document.
  r.action =
    "Confirm where the scan was performed, or correct the recorded value.";
  return r;
}
