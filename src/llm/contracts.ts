import { z } from "zod";
import type { Context, Hospital } from "../domain";
import type { Segment } from "../stt/protocol";

export const draftFields = ["reason_for_consult", "allergies", "note_title", "note_body"] as const;
export const draftLabels: Record<(typeof draftFields)[number], string> = {
  reason_for_consult: "Reason for Consult", allergies: "Allergies",
  note_title: "Note title", note_body: "Note body",
};
export const evidenceSchema = z.object({
  kind: z.enum(["transcript", "guide"]),
  id: z.string().min(1).max(200), quote: z.string().min(1).max(4000),
}).strict();
export const suggestionSchema = z.object({
  field: z.enum(draftFields), value: z.string().min(1).max(6000),
  basis: z.string().min(1).max(1000),
  evidence: z.array(evidenceSchema).min(1).max(12),
}).strict();
export const outputSchema = z.object({
  suggestions: z.array(suggestionSchema).max(4),
  answer: z.string().max(8000),
  evidence: z.array(evidenceSchema).max(20),
  questions: z.array(z.string().min(1).max(500)).max(6),
}).strict();
export type LlmOutput = z.infer<typeof outputSchema>;
export type Suggestion = z.infer<typeof suggestionSchema>;
export type Evidence = z.infer<typeof evidenceSchema>;

export const inputSchema = z.object({
  task: z.enum(["suggest", "chat"]), identity: z.string().min(1).max(1000),
  transcript: z.array(z.object({
    id: z.number().int().positive(), text: z.string().min(1).max(12000), at: z.string().max(100),
  }).strict()).max(400),
  hospital: z.object({
    id: z.string().min(1).max(100), name: z.string().min(1).max(200),
    version: z.string().min(1).max(100), timezone: z.string().max(100),
  }).strict(),
  context: z.object({ consultType: z.string().max(100), encounterType: z.string().max(100),
    step: z.string().max(100), instant: z.string().max(100),
    values: z.record(z.string().max(100), z.string().max(6000)),
  }).strict(),
  guide: z.array(z.object({ id: z.string().min(1).max(200), field: z.string().max(200),
    message: z.string().max(12000), action: z.string().max(2000), status: z.string().max(100),
    evidence: z.array(z.object({id: z.string().max(200), raw: z.string().max(12000),
      sourceName: z.string().max(300), locator: z.string().max(500),
    }).strict()).max(10),
  }).strict()).max(60),
  question: z.string().max(2000),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().max(8000) }).strict()).max(12),
}).strict();
export type LlmInput = z.infer<typeof inputSchema>;
export type LlmReply = LlmOutput & { identity: string; latencyMs: number; model: string };
export const transcriptIdentity = (h: Hospital, c: Context, t: Segment[]) =>
  JSON.stringify([h.id, h.version, c.id, t.map(s => [s.id, s.text, s.at])]);

/** Exact provenance is validated again in the browser. Quotes prove location,
 * not clinical truth: every draft still needs the doctor's review. */
export function validateOutput(data: unknown, input: LlmInput): LlmOutput {
  const out = outputSchema.parse(data);
  const ids = new Set<string>();
  for (const s of out.suggestions) {
    if (ids.has(s.field) || s.evidence.some(e => e.kind !== "transcript")) throw Error("Invalid draft evidence");
    ids.add(s.field);
  }
  for (const e of [...out.evidence, ...out.suggestions.flatMap(s => s.evidence)]) {
    const raw = e.kind === "transcript"
      ? input.transcript.find(s => String(s.id) === e.id)?.text
      : input.guide.flatMap(g => g.evidence).find(s => s.id === e.id)?.raw;
    if (!raw?.includes(e.quote)) throw Error("Invalid citation");
  }
  if (input.task === "suggest" && out.answer) throw Error("Unexpected answer");
  if (input.task === "chat" && (!out.answer.trim() || out.suggestions.length)) throw Error("Invalid chat answer");
  return out;
}
