// ElevenLabs realtime speech-to-text (Scribe) WebSocket protocol, kept pure so
// it can be tested without a browser or a network.
//
// Docs: wss://api.elevenlabs.io/v1/speech-to-text/realtime
// Client sends {message_type: "input_audio_chunk", audio_base_64, commit,
// sample_rate}. Server sends session_started, partial_transcript,
// committed_transcript and typed errors.

export const REALTIME_URL = "wss://api.elevenlabs.io/v1/speech-to-text/realtime";
/** PCM rates the endpoint accepts directly (audio_format pcm_<rate>). */
export const PCM_RATES = [8000, 16000, 22050, 24000, 44100, 48000] as const;

export function realtimeUrl(opts: {
  token: string;
  modelId: string;
  sampleRate: number;
  languageCode?: string;
}) {
  const q = new URLSearchParams({
    model_id: opts.modelId,
    token: opts.token,
    audio_format: `pcm_${opts.sampleRate}`,
    // The server decides when a phrase is finished (voice activity detection),
    // so committed lines arrive while the conversation carries on.
    commit_strategy: "vad",
  });
  if (opts.languageCode) q.set("language_code", opts.languageCode);
  return `${REALTIME_URL}?${q}`;
}

export function audioChunkMessage(audioBase64: string, sampleRate: number, commit = false) {
  return JSON.stringify({
    message_type: "input_audio_chunk",
    audio_base_64: audioBase64,
    commit,
    sample_rate: sampleRate,
  });
}

export type ServerMessage =
  | { kind: "session_started"; sessionId: string; modelId?: string }
  | { kind: "partial"; text: string }
  | { kind: "committed"; text: string }
  | { kind: "warning"; message: string }
  | { kind: "error"; type: string; message: string }
  | { kind: "ignored" };

const ERROR_TYPES = new Set([
  "error",
  "auth_error",
  "quota_exceeded",
  "commit_throttled",
  "unaccepted_terms",
  "rate_limited",
  "queue_overflow",
  "resource_exhausted",
  "session_time_limit_exceeded",
  "input_error",
  "invalid_request",
  "chunk_size_exceeded",
  "insufficient_audio_activity",
  "transcriber_error",
]);

// What the doctor reads when something goes wrong. Plain words, and what to do.
const ERROR_TEXT: Record<string, string> = {
  auth_error: "ElevenLabs did not accept the session token. Start again.",
  quota_exceeded: "The ElevenLabs transcription quota is used up for this plan.",
  rate_limited: "ElevenLabs is rate-limiting requests. Wait a moment and start again.",
  session_time_limit_exceeded:
    "The transcription session reached its time limit. Start again to continue; earlier lines are kept.",
  unaccepted_terms: "The ElevenLabs account must accept the speech-to-text terms first.",
  insufficient_audio_activity: "No speech was heard. Check the microphone.",
};

export function parseServerMessage(raw: unknown): ServerMessage {
  let m: Record<string, unknown>;
  try {
    m = typeof raw === "string" ? JSON.parse(raw) : (raw as Record<string, unknown>);
  } catch {
    return { kind: "ignored" };
  }
  if (!m || typeof m !== "object") return { kind: "ignored" };
  const type = String(m.message_type ?? "");
  const text = typeof m.text === "string" ? m.text : "";
  if (type === "session_started")
    return {
      kind: "session_started",
      sessionId: String(m.session_id ?? ""),
      modelId:
        m.config && typeof m.config === "object"
          ? String((m.config as Record<string, unknown>).model_id ?? "")
          : undefined,
    };
  if (type === "partial_transcript") return { kind: "partial", text };
  if (type === "committed_transcript") return { kind: "committed", text };
  if (type === "warning") return { kind: "warning", message: String(m.warning ?? "") };
  if (ERROR_TYPES.has(type))
    return {
      kind: "error",
      type,
      message: ERROR_TEXT[type] ?? `Transcription error (${type}): ${String(m.error ?? "")}`.trim(),
    };
  return { kind: "ignored" };
}

export type Segment = { id: number; text: string; at: string };
export type Transcript = { segments: Segment[]; partial: string; nextId: number };
export const emptyTranscript: Transcript = { segments: [], partial: "", nextId: 1 };

/** Fold one server message into the transcript. `at` is when it arrived. */
export function applyMessage(t: Transcript, m: ServerMessage, at: string): Transcript {
  if (m.kind === "partial") return { ...t, partial: m.text };
  if (m.kind === "committed") {
    const text = m.text.trim();
    if (!text) return { ...t, partial: "" };
    return {
      segments: [...t.segments, { id: t.nextId, text, at }],
      partial: "",
      nextId: t.nextId + 1,
    };
  }
  return t;
}

/** Plain text for copying, and for the recommendation step that follows. */
export function transcriptText(t: Pick<Transcript, "segments">, timeZone?: string) {
  return t.segments
    .map((s) => {
      const time = new Date(s.at).toLocaleTimeString("en-GB", { timeZone, hour12: false });
      return `[${time}] ${s.text}`;
    })
    .join("\n");
}
