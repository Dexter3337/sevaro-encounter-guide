import { useEffect, useRef, useState } from "react";
import { Icon } from "../Icon";
import {
  applyMessage,
  emptyTranscript,
  transcriptText,
  type Segment,
  type Transcript,
} from "./protocol";
import {
  TokenError,
  requestToken,
  startLiveTranscription,
  type SttStatus,
} from "./session";
import "./transcript.css";

const STATUS_TEXT: Record<SttStatus | "idle", string> = {
  idle: "Not transcribing",
  connecting: "Connecting to ElevenLabs…",
  listening: "Listening — transcribing live",
  stopping: "Finishing the last phrase…",
  stopped: "Transcription stopped",
  error: "Transcription stopped",
};
const ACCESS_KEY = "encounter-guide:stt-access";

/**
 * Live transcript of the consultation, through ElevenLabs realtime Scribe.
 * The microphone opens only when the doctor presses Start, after confirming
 * the patient has agreed. The transcript lives in memory for this encounter
 * only. The doctor can separately enable AI drafting or share it with chat.
 */
export function LiveTranscript({
  onTranscript,
}: {
  /** Every change to the committed transcript, for the recommendation step. */
  onTranscript?: (segments: Segment[]) => void;
}) {
  const [transcript, setTranscript] = useState<Transcript>(emptyTranscript);
  const [status, setStatus] = useState<SttStatus | "idle">("idle");
  const [problem, setProblem] = useState("");
  const [consent, setConsent] = useState(false);
  const [needCode, setNeedCode] = useState(false);
  const [code, setCode] = useState(() => {
    try {
      return sessionStorage.getItem(ACCESS_KEY) ?? "";
    } catch {
      return "";
    }
  });
  const [copied, setCopied] = useState(false);
  const session = useRef<{ stop: () => Promise<void> } | undefined>(undefined);
  const list = useRef<HTMLOListElement>(null);
  const live = status === "connecting" || status === "listening" || status === "stopping";

  useEffect(() => onTranscript?.(transcript.segments), [transcript.segments, onTranscript]);
  // Leaving the encounter stops the microphone.
  useEffect(() => () => void session.current?.stop(), []);
  useEffect(() => {
    list.current?.lastElementChild?.scrollIntoView({ block: "nearest" });
  }, [transcript]);

  async function start() {
    setProblem("");
    try {
      session.current = await startLiveTranscription({
        getToken: () => requestToken(code || undefined),
        onMessage: (m) =>
          setTranscript((t) => applyMessage(t, m, new Date().toISOString())),
        onStatus: (s, detail) => {
          setStatus(s);
          if (detail) setProblem(detail);
        },
      });
      try {
        if (code) sessionStorage.setItem(ACCESS_KEY, code);
      } catch {}
    } catch (e) {
      session.current = undefined;
      setStatus("error");
      if (e instanceof TokenError) {
        setNeedCode(e.code === "access_code_required");
        setProblem(e.message);
      } else if (e instanceof DOMException && e.name === "NotAllowedError")
        setProblem("Microphone access was refused. Allow the microphone and start again.");
      else if (e instanceof DOMException && e.name === "NotFoundError")
        setProblem("No microphone was found.");
      else setProblem("Transcription could not start.");
    }
  }
  async function stop() {
    await session.current?.stop();
    session.current = undefined;
  }

  return (
    <section className="live-transcript" aria-label="Live transcript" data-testid="live-transcript">
      <div className="transcript-head">
        <div>
          <strong>Live transcript</strong>
          <span className={`transcript-status ${status}`} role="status">
            {status === "listening" && <span className="rec-dot" aria-hidden="true" />}
            {STATUS_TEXT[status]}
          </span>
        </div>
        <button
          className={`transcript-control${live ? " is-on" : ""}`}
          onClick={live ? stop : start}
          disabled={(!live && !consent) || status === "stopping" || status === "connecting"}
        >
          <Icon name={live ? "stop" : "mic"} size={16} />
          {live ? "Stop" : "Start transcription"}
        </button>
      </div>
      {!live && (
        <label className="transcript-consent">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
          />
          The patient has agreed to this conversation being transcribed.
        </label>
      )}
      {needCode && !live && (
        <label className="transcript-code">
          Transcription access code
          <input
            type="password"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoComplete="off"
          />
        </label>
      )}
      {problem && (
        <p className="transcript-problem" role="alert">
          {problem}
        </p>
      )}
      <ol className="transcript-lines" ref={list} aria-live="polite">
        {transcript.segments.map((s) => (
          <li key={s.id}>
            <time dateTime={s.at}>
              {new Date(s.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </time>
            <span>{s.text}</span>
          </li>
        ))}
        {transcript.partial && (
          <li className="partial" aria-hidden="true">
            <time>…</time>
            <span>{transcript.partial}</span>
          </li>
        )}
      </ol>
      {!transcript.segments.length && !transcript.partial && (
        <p className="transcript-empty">
          Speech appears here as it is spoken. It is kept for this encounter only.
        </p>
      )}
      {transcript.segments.length > 0 && (
        <div className="transcript-actions">
          <button
            className="link"
            onClick={() => {
              void navigator.clipboard?.writeText(transcriptText(transcript)).then(() => setCopied(true));
            }}
          >
            {copied ? "Copied" : "Copy transcript"}
          </button>
          {!live && (
            <button
              className="link"
              onClick={() => {
                setTranscript(emptyTranscript);
                setCopied(false);
              }}
            >
              Clear
            </button>
          )}
        </div>
      )}
      <small className="transcript-disclosure">
        Audio is sent to ElevenLabs for transcription. Enabling AI suggestions or sharing with chat sends transcript text to the AI provider. Synthetic demo: do not use real patient conversations.
      </small>
    </section>
  );
}
