import type { Context, Hospital, Result } from "../domain";
import { answerField, ask } from "../engine";
import type { LlmReply } from "../llm/contracts";
import type { Segment } from "../stt/protocol";

export type Turn = {
  id: number;
  question: string;
  result?: Result;
  clarification?: string;
  /** Guide fields `ask()` could not choose between. Each re-asks by exact name. */
  candidates?: string[];
  ai?: LlmReply;
  transcript?: Segment[];
};
// A thread belongs to one hospital, one guide version and one encounter. It is
// looked up by that identity on every render rather than cleared afterwards, so
// a previous hospital's answer cannot stay on screen for even one frame.
export type Thread = { key: string; turns: Turn[] };
export const threadKey = (h: Hospital, c: Context) =>
  [h.id, h.version, c.id].join("\u0000");
export const threadFor = (t: Thread | undefined, key: string): Thread =>
  t && t.key === key ? t : { key, turns: [] };
export const MAX_TURNS = 20;
export function withTurn(t: Thread | undefined, key: string, turn: Turn): Thread {
  return { key, turns: [...threadFor(t, key).turns, turn].slice(-MAX_TURNS) };
}
// Every answer comes from the engine for the active hospital and version. This
// never writes an answer of its own.
export function askGuide(
  h: Hospital,
  c: Context,
  question: string,
  id: number,
): Turn {
  const q = question.trim();
  try {
    const r = ask(h, c, q);
    return {
      id,
      question: q,
      result: r.result,
      clarification: r.clarification,
      candidates: r.candidates?.length ? r.candidates : undefined,
    };
  } catch {
    // Guidance failing must never stop the caselog working.
    return {
      id,
      question: q,
      clarification:
        "The guide could not be searched just now. Confirm this with the hospital.",
    };
  }
}
// A clarification chip is the doctor naming the exact field. It is re-asked by
// that name; if the resolver still cannot choose (a field label can collide
// with another field's alias — "When Do We Round?"), the engine answers the
// named field directly rather than offering the same chips again.
export function askField(
  h: Hospital,
  c: Context,
  field: string,
  id: number,
): Turn {
  const t = askGuide(h, c, field, id);
  if (t.result || !t.candidates?.includes(field)) return t;
  try {
    return { id, question: field, result: answerField(h, c, field) };
  } catch {
    return t;
  }
}
// A nudge from another hospital or guide version is never carried into this one.
export const seedFits = (seed: Result | undefined, h: Hospital) =>
  !!seed && seed.hospitalId === h.id && seed.version === h.version;
// When the guide cannot settle the question, the next rung is a person. The
// reason travels to the contacts sheet so they know why they are calling.
export function escalationReason(r: Result): string | undefined {
  const field = r.missingEvidence?.field ?? r.title;
  const live = r.liveStatus?.find((s) => s.state !== "operational");
  if (live) return `${r.title}: ${live.state} reported`;
  if (r.primaryStatus === "not_in_guide") return `Guide doesn't cover ${field}`;
  if (r.primaryStatus === "conflict")
    return `Guide and storyboard disagree on ${r.title}`;
  if (r.flags.includes("schedule_unknown"))
    return `Guide doesn't define the hours for ${r.title}`;
  if (r.flags.includes("uncertain_requirement"))
    return `Guide's ${r.title} requirement is unclear`;
  if (r.flags.includes("interpretation_review"))
    return `${r.title} needs confirming with the hospital`;
  return undefined;
}
