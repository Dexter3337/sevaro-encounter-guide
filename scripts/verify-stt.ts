// End-to-end check of live transcription against the real ElevenLabs service,
// without a microphone: streams a WAV file (16-bit PCM, mono) through the same
// token and protocol code the app uses, and prints what comes back.
//
//   pnpm exec tsx scripts/verify-stt.ts <file.wav>
//
// Reads ELEVENLABS_API_KEY (and optional ELEVENLABS_STT_MODEL) from .env.local.
// Uses a few seconds of transcription credit.
import { readFileSync } from "node:fs";
import { loadEnv } from "vite";
import { mintSttToken } from "../src/stt/token";
import {
  applyMessage,
  audioChunkMessage,
  emptyTranscript,
  parseServerMessage,
  realtimeUrl,
} from "../src/stt/protocol";

function readWav(path: string) {
  const b = readFileSync(path);
  if (b.toString("ascii", 0, 4) !== "RIFF" || b.toString("ascii", 8, 12) !== "WAVE")
    throw new Error(`${path} is not a WAV file.`);
  let o = 12,
    rate = 0,
    bits = 0,
    channels = 0;
  while (o + 8 <= b.length) {
    const id = b.toString("ascii", o, o + 4),
      size = b.readUInt32LE(o + 4);
    if (id === "fmt ") {
      channels = b.readUInt16LE(o + 10);
      rate = b.readUInt32LE(o + 12);
      bits = b.readUInt16LE(o + 22);
    }
    if (id === "data") {
      if (bits !== 16 || channels !== 1)
        throw new Error(`Expected 16-bit mono PCM, got ${bits}-bit ${channels}-channel.`);
      return { rate, pcm: b.subarray(o + 8, o + 8 + size) };
    }
    o += 8 + size + (size % 2);
  }
  throw new Error("No audio data in the WAV file.");
}

const file = process.argv[2];
if (!file) {
  console.error("Usage: pnpm exec tsx scripts/verify-stt.ts <file.wav>");
  process.exit(2);
}
const env = loadEnv("development", process.cwd(), "");
const { rate, pcm } = readWav(file);
console.log(`Audio: ${(pcm.length / 2 / rate).toFixed(1)} s at ${rate} Hz`);

const grant = await mintSttToken({
  apiKey: env.ELEVENLABS_API_KEY,
  model: env.ELEVENLABS_STT_MODEL,
  allowedOrigins: [],
});
if (grant.status !== 200) {
  console.error(`✗ Token: ${grant.body.error}`);
  process.exit(1);
}
console.log(`✓ Token issued for model ${grant.body.modelId}`);

const ws = new WebSocket(
  realtimeUrl({ token: grant.body.token!, modelId: grant.body.modelId!, sampleRate: rate, languageCode: "en" }),
);
let transcript = emptyTranscript;
let finished: () => void;
const done = new Promise<void>((r) => (finished = r));
const timeout = setTimeout(() => finished(), 20_000);

ws.onmessage = (e) => {
  const m = parseServerMessage(e.data);
  if (m.kind === "session_started") console.log(`✓ Session ${m.sessionId} (${m.modelId})`);
  if (m.kind === "partial") process.stdout.write(`  … ${m.text}\n`);
  if (m.kind === "committed" && m.text.trim()) console.log(`  ✓ ${m.text}`);
  if (m.kind === "error") {
    console.error(`✗ ${m.type}: ${m.message}`);
    finished();
  }
  transcript = applyMessage(transcript, m, new Date().toISOString());
};
ws.onerror = () => {
  console.error("✗ WebSocket error");
  finished();
};
ws.onopen = async () => {
  // Stream in 100 ms chunks at twice real time, then commit the remainder.
  const step = Math.round(rate * 0.1) * 2;
  for (let i = 0; i < pcm.length; i += step) {
    const last = i + step >= pcm.length;
    ws.send(audioChunkMessage(pcm.subarray(i, i + step).toString("base64"), rate, last));
    await new Promise((r) => setTimeout(r, 50));
  }
  // Give the final commit time to come back.
  setTimeout(() => finished(), 6000);
};

await done;
clearTimeout(timeout);
ws.close();
const text = transcript.segments.map((s) => s.text).join(" ");
console.log(text ? `\nTranscript: ${text}` : "\n✗ No committed transcript received.");
process.exit(text ? 0 : 1);
