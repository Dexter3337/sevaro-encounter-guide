import type { Context, Hospital, Result } from "../domain";
import { answerField, evaluate } from "../engine";
import { makeEvent } from "../domain";
import type { Segment } from "../stt/protocol";
import { inputSchema, validateOutput, type LlmInput, type LlmReply } from "./contracts";

export function buildLlmInput(task: LlmInput["task"], h: Hospital, c: Context,
  transcript: Segment[], question = "", history: LlmInput["history"] = []): LlmInput {
  // The LLM gets the engine's resolved status/action, not unchecked source rows.
  // Include current triggers first, then the remaining guide fields for natural chat.
  const results: Result[] = evaluate(h, c, makeEvent(c, "encounter_opened"));
  if (task === "chat") for (const field of new Set(h.fields.map(s => s.field))) {
    if (results.length >= 60) break;
    if (!results.some(r => r.title === field)) results.push(answerField(h, c, field));
  }
  return inputSchema.parse({ task,
    identity: crypto.randomUUID(),
    transcript, hospital: { id: h.id, name: h.name, version: h.version, timezone: h.timezone },
    context: { consultType: c.consultType, encounterType: c.encounterType, step: c.step, instant: c.instant,
      values: Object.fromEntries(Object.entries(c.values).filter(([,v]) => v.state === "known")
        .map(([k,v]) => [k, v.state === "known" ? String(v.value) : ""])), },
    guide: results.slice(0,60).map(r => ({id: r.id, field: r.title, message: r.message, action: r.action, status: r.primaryStatus,
      evidence: r.citations.slice(0,10).map(s => ({id:s.id,raw:s.raw,sourceName:s.sourceName,locator:s.locator || ""})),
    })), question, history: history.slice(-12),
  });
}
export class LlmError extends Error {
  constructor(public code: string, message: string) { super(message); }
}
export async function requestLlm(input: LlmInput, signal: AbortSignal, code?: string): Promise<LlmReply> {
  const r = await fetch("/api/llm", {method: "POST", signal: AbortSignal.any([signal, AbortSignal.timeout(30000)]),
    headers: {"content-type":"application/json", ...(code ? {"x-llm-access":code} : {})}, body: JSON.stringify(input),
  });
  if (!r.ok) {
    // Only known error codes have user-facing messages; no arbitrary upstream echoes.
    const data = await r.json().catch(() => ({}));
    const messages: Record<string,string> = {
      not_configured: "AI is not configured. Add GEMINI_API_KEY or OPENAI_API_KEY to the server environment.",
      access_code_required: "Enter the AI access code to continue.",
      too_large: "This transcript is too long. Use a shorter encounter transcript.",
      provider_error: "AI is unavailable. Check server configuration or retry later.",
    };
    throw new LlmError(data.code || "unavailable", messages[data.code] || "AI could not return a verified response. Continue manually or retry.");
  }
  const data = await r.json();
  if (data.identity !== input.identity) throw Error("Stale AI response");
  return {...validateOutput(data && {suggestions:data.suggestions, answer:data.answer, evidence:data.evidence, questions:data.questions}, input),
    identity: data.identity, model: String(data.model), latencyMs: Number(data.latencyMs)};
}
