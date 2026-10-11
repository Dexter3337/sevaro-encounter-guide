import { describe, it, expect } from "vitest";
import { downsample, floatTo16, pcm16ToBase64 } from "../src/stt/pcm";
import {
  applyMessage,
  audioChunkMessage,
  emptyTranscript,
  parseServerMessage,
  realtimeUrl,
  transcriptText,
} from "../src/stt/protocol";
import { DEFAULT_STT_MODEL, mintSttToken } from "../src/stt/token";

describe("Audio conversion", () => {
  it("maps floats to 16-bit PCM and clamps", () => {
    expect([...floatTo16(new Float32Array([0, 1, -1, 2, -2, 0.5]))]).toEqual([
      0, 32767, -32768, 32767, -32768, 16384,
    ]);
  });
  it("encodes little-endian base64", () => {
    // 1 → 01 00, -1 → ff ff
    expect(pcm16ToBase64(new Int16Array([1, -1]))).toBe(btoa("\x01\x00\xff\xff"));
  });
  it("encodes long buffers without overflowing the call stack", () => {
    const b64 = pcm16ToBase64(new Int16Array(48000));
    expect(atob(b64).length).toBe(96000);
  });
  it("downsamples by averaging, and never upsamples", () => {
    const out = downsample(new Float32Array([1, 3, 5, 7]), 32000, 16000);
    expect([...out]).toEqual([2, 6]);
    const same = new Float32Array([1, 2]);
    expect(downsample(same, 16000, 48000)).toBe(same);
  });
});

describe("Realtime protocol", () => {
  it("builds the WebSocket URL with the token, model and audio format", () => {
    const u = new URL(realtimeUrl({ token: "sutkn_x", modelId: "scribe_v2_realtime", sampleRate: 16000 }));
    expect(u.origin + u.pathname).toBe("wss://api.elevenlabs.io/v1/speech-to-text/realtime");
    expect(Object.fromEntries(u.searchParams)).toEqual({
      model_id: "scribe_v2_realtime",
      token: "sutkn_x",
      audio_format: "pcm_16000",
      commit_strategy: "vad",
    });
    expect(
      new URL(realtimeUrl({ token: "t", modelId: "m", sampleRate: 48000, languageCode: "en" })).searchParams.get("language_code"),
    ).toBe("en");
  });

  it("shapes audio chunks exactly as the API documents", () => {
    expect(JSON.parse(audioChunkMessage("AAAA", 16000))).toEqual({
      message_type: "input_audio_chunk",
      audio_base_64: "AAAA",
      commit: false,
      sample_rate: 16000,
    });
    expect(JSON.parse(audioChunkMessage("AAAA", 16000, true)).commit).toBe(true);
  });

  it("reads server messages", () => {
    expect(
      parseServerMessage(
        JSON.stringify({ message_type: "session_started", session_id: "s1", config: { model_id: "scribe_v2_realtime" } }),
      ),
    ).toEqual({ kind: "session_started", sessionId: "s1", modelId: "scribe_v2_realtime" });
    expect(parseServerMessage('{"message_type":"partial_transcript","text":"the pa"}')).toEqual({
      kind: "partial",
      text: "the pa",
    });
    expect(parseServerMessage('{"message_type":"committed_transcript","text":"The patient is awake."}')).toEqual({
      kind: "committed",
      text: "The patient is awake.",
    });
    expect(parseServerMessage("not json")).toEqual({ kind: "ignored" });
    expect(parseServerMessage('{"message_type":"something_new"}')).toEqual({ kind: "ignored" });
  });

  it("turns errors into words a doctor can act on", () => {
    const quota = parseServerMessage('{"message_type":"quota_exceeded","error":"x"}');
    expect(quota).toMatchObject({ kind: "error", type: "quota_exceeded" });
    expect(quota.kind === "error" && quota.message).toContain("quota");
    const other = parseServerMessage('{"message_type":"transcriber_error","error":"boom"}');
    expect(other.kind === "error" && other.message).toContain("boom");
  });
});

describe("Transcript", () => {
  const at = "2026-10-11T14:00:00.000Z";
  it("shows the partial line, then replaces it with the committed one", () => {
    let t = applyMessage(emptyTranscript, { kind: "partial", text: "Last known" }, at);
    expect(t.partial).toBe("Last known");
    t = applyMessage(t, { kind: "committed", text: " Last known well at nine. " }, at);
    expect(t.partial).toBe("");
    expect(t.segments).toEqual([{ id: 1, text: "Last known well at nine.", at }]);
  });
  it("ignores empty commits and non-transcript messages", () => {
    let t = applyMessage(emptyTranscript, { kind: "committed", text: "  " }, at);
    t = applyMessage(t, { kind: "warning", message: "x" }, at);
    expect(t.segments).toEqual([]);
  });
  it("produces timestamped plain text", () => {
    const t = applyMessage(emptyTranscript, { kind: "committed", text: "Hello." }, at);
    expect(transcriptText(t, "UTC")).toBe("[14:00:00] Hello.");
  });
});

describe("Token issuing (server side)", () => {
  const ok = (async () =>
    new Response(JSON.stringify({ token: "sutkn_1" }), { status: 200 })) as unknown as typeof fetch;

  it("says plainly when no key is configured", async () => {
    const r = await mintSttToken({ allowedOrigins: [] });
    expect(r.status).toBe(503);
    expect(r.body.code).toBe("not_configured");
  });

  it("calls ElevenLabs with the key in the header and returns only the token", async () => {
    let seen: { url: string; init?: RequestInit } | undefined;
    const spy = (async (url: string, init?: RequestInit) => {
      seen = { url, init };
      return new Response(JSON.stringify({ token: "sutkn_1" }), { status: 200 });
    }) as unknown as typeof fetch;
    const r = await mintSttToken({ apiKey: "sk_secret", allowedOrigins: [], fetchImpl: spy });
    expect(seen!.url).toBe("https://api.elevenlabs.io/v1/single-use-token/realtime_scribe");
    expect(seen!.init?.method).toBe("POST");
    expect((seen!.init?.headers as Record<string, string>)["xi-api-key"]).toBe("sk_secret");
    expect(r).toEqual({ status: 200, body: { token: "sutkn_1", modelId: DEFAULT_STT_MODEL } });
    expect(JSON.stringify(r)).not.toContain("sk_secret");
  });

  it("uses the configured model", async () => {
    const r = await mintSttToken({ apiKey: "k", model: "scribe_v2_realtime_turbo", allowedOrigins: [], fetchImpl: ok });
    expect(r.body.modelId).toBe("scribe_v2_realtime_turbo");
  });

  it("issues tokens to this site only, when origins are configured", async () => {
    const base = { apiKey: "k", allowedOrigins: ["https://demo.example"], fetchImpl: ok };
    expect((await mintSttToken({ ...base, origin: "https://evil.example" })).status).toBe(403);
    expect((await mintSttToken({ ...base, origin: null })).status).toBe(403);
    expect((await mintSttToken({ ...base, origin: "https://demo.example" })).status).toBe(200);
  });

  it("requires the access code when one is set", async () => {
    const base = { apiKey: "k", accessCode: "ward-7", allowedOrigins: [], fetchImpl: ok };
    expect((await mintSttToken({ ...base, providedCode: null })).body.code).toBe("access_code_required");
    expect((await mintSttToken({ ...base, providedCode: "wrong" })).status).toBe(401);
    expect((await mintSttToken({ ...base, providedCode: "ward-7" })).status).toBe(200);
  });

  it("reports an upstream refusal without leaking the key", async () => {
    const refused = (async () => new Response("bad key", { status: 401 })) as unknown as typeof fetch;
    const r = await mintSttToken({ apiKey: "sk_secret", allowedOrigins: [], fetchImpl: refused });
    expect(r.status).toBe(502);
    expect(r.body.error).toContain("HTTP 401");
    expect(JSON.stringify(r)).not.toContain("sk_secret");
    const down = (async () => {
      throw new Error("network");
    }) as unknown as typeof fetch;
    expect((await mintSttToken({ apiKey: "k", allowedOrigins: [], fetchImpl: down })).body.code).toBe(
      "upstream_unreachable",
    );
  });
});
