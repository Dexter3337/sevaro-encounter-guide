import { describe, expect, it, vi } from "vitest";
import { DEFAULT_GEMINI_MODEL, handleLlm, INSTRUCTIONS } from "../src/llm/server";
import { buildLlmInput } from "../src/llm/client";
import { seedHospitals } from "../src/data";
import { freshContext } from "../src/domain";

const h = seedHospitals[5], c = freshContext(h);
const transcript = [{ id: 1, text: "I have left arm weakness. I am allergic to penicillin.", at: "2026-10-11T12:00:00Z" }];
const input = () => buildLlmInput("suggest", h, c, transcript);
const good = () => ({
  suggestions: [{ field: "reason_for_consult", value: "Reported left arm weakness", basis: "The patient reports weakness.",
    evidence: [{ kind: "transcript", id: "1", quote: "I have left arm weakness." }] }],
  answer: "", evidence: [], questions: [],
});
const req = () => new Request("http://localhost/api/llm", {
  method: "POST", headers: { "content-type": "application/json", origin: "http://localhost" }, body: JSON.stringify(input()),
});
const gemini = (out: unknown, finishReason = "STOP", extra: Record<string, unknown> = {}) =>
  new Response(JSON.stringify({ candidates: [{ finishReason, content: { role: "model",
    parts: [{ text: "internal reasoning", thought: true }, { text: JSON.stringify(out) }] } }], ...extra }));
const openai = (out: unknown) => new Response(JSON.stringify({ status: "completed",
  output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(out) }] }] }));
const G = { apiKey: "gemini-private-test-secret-0123456789", model: undefined as string | undefined };
const base = { allowedOrigins: ["http://localhost"] };

describe("Gemini provider", () => {
  it("calls generateContent with the key in a header, never the URL, and structured JSON output", async () => {
    let url = "", init: any;
    const fetchImpl = vi.fn(async (u: any, i: any) => { url = String(u); init = i; return gemini(good()); });
    const r = await handleLlm(req(), { ...base, gemini: G, fetchImpl });
    expect(r.status).toBe(200);
    expect(url).toBe(`https://generativelanguage.googleapis.com/v1beta/models/${DEFAULT_GEMINI_MODEL}:generateContent`);
    expect(url).not.toContain(G.apiKey);
    expect(init.headers["x-goog-api-key"]).toBe(G.apiKey);
    const body = JSON.parse(init.body);
    expect(body.systemInstruction.parts[0].text).toBe(INSTRUCTIONS);
    expect(body.generationConfig.responseMimeType).toBe("application/json");
    const schema = JSON.stringify(body.generationConfig.responseJsonSchema);
    expect(schema).toContain('"suggestions"');
    expect(schema).not.toMatch(/maxLength|minLength|\$schema/);
    const out = await r.json();
    expect(out.model).toBe(DEFAULT_GEMINI_MODEL);
    expect(out.suggestions[0].field).toBe("reason_for_consult");
    expect(JSON.stringify(out)).not.toContain(G.apiKey);
    // Thought parts are never treated as the answer.
    expect(JSON.stringify(out)).not.toContain("internal reasoning");
  });

  it("uses the configured model", async () => {
    let url = "";
    await handleLlm(req(), { ...base, gemini: { ...G, model: "gemini-3.5-flash-lite" },
      fetchImpl: vi.fn(async (u: any) => { url = String(u); return gemini(good()); }) });
    expect(url).toContain("/models/gemini-3.5-flash-lite:generateContent");
  });

  it.each([["truncated", "MAX_TOKENS"], ["blocked", "SAFETY"], ["other", "OTHER"]])(
    "refuses a %s reply", async (_k, reason) => {
      const r = await handleLlm(req(), { ...base, gemini: G, fetchImpl: vi.fn(async () => gemini(good(), reason)) });
      expect(r.status).toBe(502);
    });

  it("refuses a blocked prompt and invented evidence", async () => {
    const blocked = await handleLlm(req(), { ...base, gemini: G,
      fetchImpl: vi.fn(async () => gemini(good(), "STOP", { promptFeedback: { blockReason: "SAFETY" } })) });
    expect(blocked.status).toBe(502);
    const out = good(); out.suggestions[0].evidence[0].quote = "No allergies.";
    expect((await handleLlm(req(), { ...base, gemini: G, fetchImpl: vi.fn(async () => gemini(out)) })).status).toBe(502);
  });

  it("maps rate limits and never forwards the provider's error body", async () => {
    const r = await handleLlm(req(), { ...base, gemini: G, fetchImpl: vi.fn(async () => new Response(G.apiKey, { status: 429 })) });
    expect(r.status).toBe(429);
    expect(await r.text()).not.toContain(G.apiKey);
  });

  it("masks every configured secret, whichever provider answered", async () => {
    const leaky = { ...good(), questions: ["sk-openai-private-secret"] };
    const r = await handleLlm(req(), { ...base, apiKey: "sk-openai-private-secret", gemini: G, provider: "gemini",
      fetchImpl: vi.fn(async (u: any) => String(u).includes("googleapis") ? gemini(leaky) : openai(leaky)) });
    expect(r.status).toBe(502);
    expect(await r.text()).not.toContain("sk-openai-private-secret");
  });
});

describe("Provider order and fallback", () => {
  const calls: string[] = [];
  const both = (geminiResponse: () => Response, openaiResponse: () => Response) => vi.fn(async (u: any) => {
    const isGemini = String(u).includes("googleapis");
    calls.push(isGemini ? "gemini" : "openai");
    return isGemini ? geminiResponse() : openaiResponse();
  });

  it("LLM_PROVIDER=gemini goes to Gemini first", async () => {
    calls.length = 0;
    const r = await handleLlm(req(), { ...base, apiKey: "sk-x", gemini: G, provider: "gemini",
      fetchImpl: both(() => gemini(good()), () => openai(good())) });
    expect((await r.json()).model).toBe(DEFAULT_GEMINI_MODEL);
    expect(calls).toEqual(["gemini"]);
  });

  it("falls back to the other provider when the first fails", async () => {
    calls.length = 0;
    const r = await handleLlm(req(), { ...base, apiKey: "sk-x", gemini: G, provider: "gemini",
      fetchImpl: both(() => new Response("", { status: 500 }), () => openai(good())) });
    expect(r.status).toBe(200);
    expect((await r.json()).model).toBe("gpt-4.1-mini");
    expect(calls).toEqual(["gemini", "openai"]);
  });

  it("keeps OpenAI first when no provider is named, as before", async () => {
    calls.length = 0;
    await handleLlm(req(), { ...base, apiKey: "sk-x", gemini: G, fetchImpl: both(() => gemini(good()), () => openai(good())) });
    expect(calls).toEqual(["openai"]);
  });

  it("works with Gemini alone, and says both key names when neither is set", async () => {
    expect((await handleLlm(req(), { ...base, gemini: G, fetchImpl: vi.fn(async () => gemini(good())) })).status).toBe(200);
    const none = await handleLlm(req(), base);
    expect(none.status).toBe(503);
    expect((await none.json()).error).toContain("GEMINI_API_KEY");
  });
});
