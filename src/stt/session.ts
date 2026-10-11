import { downsample, floatTo16, pcm16ToBase64 } from "./pcm";
import {
  PCM_RATES,
  audioChunkMessage,
  parseServerMessage,
  realtimeUrl,
  type ServerMessage,
} from "./protocol";

export type SttStatus = "connecting" | "listening" | "stopping" | "stopped" | "error";
export type TokenGrant = { token: string; modelId: string };

// Copies each render quantum off the audio thread. Inlined as a Blob URL so it
// needs no separate build entry.
const TAP = `class Tap extends AudioWorkletProcessor {
  process(inputs) { const ch = inputs[0] && inputs[0][0]; if (ch) this.port.postMessage(ch.slice(0)); return true; }
}
registerProcessor("stt-tap", Tap);`;

const CHUNK_SECONDS = 0.1;
const FINAL_WAIT_MS = 1500;

/**
 * Stream the microphone to ElevenLabs realtime Scribe. The microphone is
 * opened only here, after the doctor presses Start, and every track is
 * stopped by stop() or on any error.
 */
export async function startLiveTranscription(opts: {
  getToken: () => Promise<TokenGrant>;
  onMessage: (m: ServerMessage) => void;
  onStatus: (s: SttStatus, detail?: string) => void;
  languageCode?: string;
}): Promise<{ stop: () => Promise<void> }> {
  opts.onStatus("connecting");
  // The token comes first, so a missing configuration never prompts for the
  // microphone.
  const grant = await opts.getToken();

  const media = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });
  let ctx: AudioContext;
  try {
    ctx = new AudioContext({ sampleRate: 16000 });
  } catch {
    ctx = new AudioContext();
  }
  const native = ctx.sampleRate;
  const rate = (PCM_RATES as readonly number[]).includes(native) ? native : 16000;

  let closed = false,
    sawFinal: () => void = () => {};
  const release = () => {
    media.getTracks().forEach((t) => t.stop());
    void ctx.close().catch(() => {});
  };

  const ws = new WebSocket(
    realtimeUrl({ token: grant.token, modelId: grant.modelId, sampleRate: rate, languageCode: opts.languageCode }),
  );
  ws.onmessage = (e) => {
    const m = parseServerMessage(e.data);
    if (m.kind === "session_started") opts.onStatus("listening");
    if (m.kind === "committed") sawFinal();
    if (m.kind === "error") {
      opts.onStatus("error", m.message);
      closed = true;
      ws.close();
      release();
    }
    opts.onMessage(m);
  };
  ws.onerror = () => {
    if (closed) return;
    closed = true;
    opts.onStatus("error", "The transcription connection failed.");
    release();
  };
  ws.onclose = () => {
    if (closed) return;
    closed = true;
    opts.onStatus("error", "The transcription connection closed unexpectedly.");
    release();
  };

  try {
    const url = URL.createObjectURL(new Blob([TAP], { type: "text/javascript" }));
    await ctx.audioWorklet.addModule(url);
    URL.revokeObjectURL(url);
  } catch (e) {
    closed = true;
    ws.close();
    release();
    throw e;
  }
  const source = ctx.createMediaStreamSource(media);
  const tap = new AudioWorkletNode(ctx, "stt-tap");
  // A silent path to the output keeps the graph running in every browser.
  const mute = ctx.createGain();
  mute.gain.value = 0;
  source.connect(tap).connect(mute).connect(ctx.destination);

  let pending: Float32Array[] = [],
    pendingLength = 0;
  const target = Math.round(native * CHUNK_SECONDS);
  const flush = (commit: boolean) => {
    if (ws.readyState !== WebSocket.OPEN) return;
    // A commit always carries some audio: 10 ms of silence if nothing is left.
    if (!pendingLength) {
      pending = [new Float32Array(Math.round(native * 0.01))];
      pendingLength = pending[0].length;
    }
    const all = new Float32Array(pendingLength);
    let o = 0;
    for (const p of pending) {
      all.set(p, o);
      o += p.length;
    }
    pending = [];
    pendingLength = 0;
    const samples = rate === native ? all : downsample(all, native, rate);
    ws.send(audioChunkMessage(pcm16ToBase64(floatTo16(samples)), rate, commit));
  };
  tap.port.onmessage = (e: MessageEvent<Float32Array>) => {
    if (closed) return;
    pending.push(e.data);
    pendingLength += e.data.length;
    // Until the socket opens, keep at most the last second rather than
    // building one oversized first chunk.
    while (ws.readyState !== WebSocket.OPEN && pendingLength > native && pending.length > 1)
      pendingLength -= pending.shift()!.length;
    if (pendingLength >= target) flush(false);
  };

  return {
    async stop() {
      if (closed) return;
      opts.onStatus("stopping");
      tap.port.onmessage = null;
      // Commit what is left so the last phrase is not lost, then wait briefly
      // for its final text.
      const final = new Promise<void>((resolve) => {
        sawFinal = resolve;
        setTimeout(resolve, FINAL_WAIT_MS);
      });
      flush(true);
      release();
      await final;
      closed = true;
      ws.close();
      opts.onStatus("stopped");
    },
  };
}

/** Ask our own server for a token. The ElevenLabs key never reaches the browser. */
export async function requestToken(accessCode?: string): Promise<TokenGrant> {
  const r = await fetch("/api/stt-token", {
    method: "POST",
    headers: accessCode ? { "x-stt-access": accessCode } : {},
  }).catch(() => undefined);
  const body = (await r?.json().catch(() => undefined)) as
    | { token?: string; modelId?: string; error?: string; code?: string }
    | undefined;
  if (r?.ok && body?.token && body.modelId) return { token: body.token, modelId: body.modelId };
  throw new TokenError(
    body?.code ?? "unavailable",
    body?.error ?? "The transcription service is not available on this server.",
  );
}

export class TokenError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
