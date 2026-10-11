import type { Context, Hospital } from "../domain";
import { concepts, normalize, resolveConcept } from "../knowledge";
import { askGuide, type Turn } from "./thread";
import { answerField } from "../engine";
import { queryInstant } from "../time";

// Normalize presentation, never numbers, negation or short medical acronyms.
// A correction must have one close match in the active guide's vocabulary.
export function normalizeQuestion(raw: string, h: Hospital) {
  const vocabulary = new Set(
    [
      ...Object.keys(concepts),
      ...Object.values(concepts).flat(),
      ...h.fields.flatMap((s) => [s.field, ...(s.aliases || [])]),
      "available availability hospital protocol pharmacy preparation confirmation",
    ]
      .flatMap((s) => normalize(s).split(" "))
      .filter((s) => s.length >= 5),
  );
  const corrections: string[] = [];
  const formatted = raw
    .normalize("NFKC")
    .replace(/[_]+/g, " ")
    .replace(/\b(?:pls|plz)\b/gi, "please")
    .replace(/\bu\b/gi, "you")
    .replace(/\b(?:c\s*\.\s*t\s*\.\s*a|c\s+t\s+a)\b/gi, "CTA")
    .replace(/\b(?:e\s*\.\s*e\s*\.\s*g|e\s+e\s+g)\b/gi, "EEG")
    .replace(/\b(?:m\s*\.\s*r\s*\.\s*i|m\s+r\s+i)\b/gi, "MRI");
  const text = formatted.replace(/[a-zA-Z]{5,}/g, (word) => {
    const lower = word.toLowerCase();
    if (vocabulary.has(lower)) return word;
    const matches = [...vocabulary].filter((v) => distance(lower, v) <= 1);
    if (matches.length !== 1) return word;
    corrections.push(`${word} → ${matches[0]}`);
    return matches[0];
  });
  return {
    text: text
      .replace(/\b(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m\.?\b/gi, "$1:$2$3m")
      .replace(/:(?=[ap]m\b)/gi, ":00"),
    corrections,
  };
}

function distance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i ? (j ? 0 : i) : j)),
  );
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  return d[a.length][b.length];
}

export type QuestionTurn = Turn & { interpreted?: string };
export function questionIssue(raw: string, h: Hospital): string | undefined {
  if (raw.length > 2000)
    return "Please shorten the question to 2,000 characters.";
  const ids = raw.match(/\bSYN[- ]?\d+\b/gi) || [];
  if (
    ids.some((id) => id.toUpperCase().replace(" ", "-") !== h.id.toUpperCase())
  )
    return "This chat answers only for the selected hospital. Switch hospitals before asking about another guide.";
  if (
    /\b(dos(?:e|age|ing)|diagnos\w*|should (?:i|we) (?:give|administer|treat)|recommend (?:a )?treatment)\b/i.test(
      raw,
    )
  )
    return "I can explain this hospital's documented workflows, but cannot recommend treatment, dosing or a diagnosis. Ask about a guide field or confirm with the clinical team.";
  if (/\b(tonight|this evening|later|next week)\b/i.test(raw))
    return "Please give a specific day and time in the hospital's time zone.";
  if (
    [...raw.matchAll(/\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g)].some(
      (m) => m[0] !== "24/7",
    )
  )
    return "Please use an unambiguous date (YYYY-MM-DD) and hospital-local time.";
  if (
    /\bat\s+\d{1,2}\b(?![:\d]|\s*(?:am|pm)\b)/i.test(raw) ||
    /\d{4}-\d{2}-\d{2}T|\b(?:UTC|GMT|EST|EDT|CST|CDT|PST|PDT)\b/i.test(raw)
  )
    return "Please specify a time such as 19:30 or 7:30pm in the hospital's time zone.";
  for (const m of raw.matchAll(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/gi))
    if (+m[1] < 1 || +m[1] > 12 || +(m[2] || 0) > 59)
      return "That time is invalid. Use a valid hospital-local time, such as 19:30 or 7:30pm.";
  for (const m of raw.matchAll(/\b(\d{1,2}):(\d{2})\b/g))
    if (+m[1] > 23 || +m[2] > 59)
      return "That time is invalid. Use a valid hospital-local time, such as 19:30 or 7:30pm.";
}

export function fieldForQuestion(
  q: string,
  h: Hospital,
): { field?: string; candidates: string[] } {
  const alternatives = q.split(/\s+or\s+/i);
  if (alternatives.length > 1) {
    const candidates = [
      ...new Set(
        alternatives
          .map((x) => fieldForQuestion(x, h).field)
          .filter((x): x is string => !!x),
      ),
    ];
    if (candidates.length > 1) return { field: undefined, candidates };
  }
  if (/\bcta\b/i.test(q)) return { field: "CTA Head/Neck", candidates: [] };
  if (/\bmri\b/i.test(q) && !/\beeg\b/i.test(q))
    return { field: "MRI", candidates: [] };
  return resolveConcept(q, h);
}

export function answerQuestion(
  h: Hospital,
  c: Context,
  query: string,
  id: number,
  field?: string,
): QuestionTurn {
  const issue = questionIssue(query, h);
  if (issue) return { id, question: query, clarification: issue };
  // Preserve every original time expression; formatting only makes it readable
  // by the engine's hospital-local clock parser.
  const timed = query.replace(
    /\b(\d{1,2}:\d{2}\s*(?:am|pm)?|\d{1,2}\s*(?:am|pm))\b/gi,
    (match, _, offset) =>
      /\bat\s+$/i.test(query.slice(0, offset)) ? match : `at ${match}`,
  );
  if (
    !field ||
    /sign off|sign-off|complete consult|can i complete/i.test(query)
  )
    return askGuide(h, c, timed, id);
  try {
    return {
      id,
      question: query,
      result: answerField(
        h,
        c,
        field,
        queryInstant(timed, c.instant, h.timezone),
      ),
    };
  } catch {
    return {
      id,
      question: query,
      clarification:
        "The requested date/time is invalid or ambiguous. Specify a valid date and hospital-local time.",
    };
  }
}

export function askQuestions(
  h: Hospital,
  c: Context,
  raw: string,
  firstId: number,
  followUpField?: string,
): QuestionTurn[] {
  const issue = questionIssue(raw, h);
  if (issue) return [{ id: firstId, question: raw, clarification: issue }];
  const { text, corrections } = normalizeQuestion(raw, h);
  // Keep alternatives ("EEG or MRI?") together for clarification. Only split
  // conjunctions when both sides independently identify a guide concept.
  const pieces = text
    .split(/[?;\n]+|\.(?=\s+[a-z])/i)
    .flatMap((part) => {
      const halves = part.split(/\s+(?:and|also|&)\s+|,\s*/i);
      return halves.length > 1 &&
        halves.every(
          (x) =>
            fieldForQuestion(x, h).field ||
            /^(?:can|could|what|where|when|who|why|how|is|are)\b/i.test(
              x.trim(),
            ),
        )
        ? halves
        : [part];
    })
    .map((p) => p.replace(/^\s*\d+[.)]\s*/, "").trim())
    .filter(Boolean);
  if (pieces.length > 6)
    return [
      {
        id: firstId,
        question: raw,
        clarification:
          "Please ask up to six questions at a time so each answer stays clear.",
      },
    ];
  return pieces.map((piece, i) => {
    let query = piece;
    const resolved = fieldForQuestion(query, h);
    if (
      !resolved.field &&
      !resolved.candidates.length &&
      followUpField &&
      /^(?:and\s+)?(?:what about|how about|is it available|when is it available)\b/i.test(
        query,
      )
    )
      query = `${followUpField}: ${query}`;
    // Multiple equal concepts are alternatives, never an arbitrary answer.
    const match = fieldForQuestion(query, h);
    const turn =
      match.candidates.length > 1
        ? {
            id: firstId + i,
            question: query,
            clarification: "Which guide field do you mean?",
            candidates: match.candidates,
          }
        : answerQuestion(h, c, query, firstId + i, match.field);
    return {
      ...turn,
      question: pieces.length === 1 ? raw : piece,
      interpreted:
        corrections.length || query !== piece
          ? `Interpreted as: ${query}${corrections.length ? ` (${corrections.join(", ")})` : ""}`
          : undefined,
    };
  });
}
