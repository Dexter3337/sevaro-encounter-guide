import React, { useEffect, useRef, useState } from "react";
import { type Context, type Result, registry } from "./domain";
import { parseVoice, type VoiceIntent } from "./voice";
import { useMicrophone } from "./useMicrophone";
import { Icon } from "./Icon";

export type VoiceOutcome = { message: string; changed?: number };
type Entry = {
  id: number;
  text: string;
  message: string;
  kind: string;
  time: string;
  source: string;
};
export function VoiceCopilot({
  context,
  onAction,
  filled,
  canUndo,
  guidance,
  reviewReason,
}: {
  context: Context;
  onAction: (intent: VoiceIntent, revision: number) => VoiceOutcome;
  filled: number;
  canUndo: boolean;
  guidance?: Result;
  // Why a proposed change deserves a second look, shown before it is applied.
  reviewReason?: (intent: VoiceIntent) => string | undefined;
}) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [autoFill, setAutoFill] = useState(true);
  const [readAloud, setReadAloud] = useState(true);
  const [input, setInput] = useState("");
  const [reply, setReply] = useState(
    "Ready when you are. Start listening, then speak naturally.",
  );
  const [pending, setPending] = useState<{
    intent: VoiceIntent;
    revision: number;
    text: string;
  } | null>(null);
  const [armed, setArmed] = useState(false);
  const awakeUntil = useRef(0);
  const sequence = useRef(0);
  const clock = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const microphone = useMicrophone((text, confidence) =>
    process(text, "Microphone", confidence),
  );
  const active = microphone.status !== "off";
  function record(text: string, message: string, kind: string, source: string) {
    setEntries((prev) =>
      [
        ...prev,
        {
          id: ++sequence.current,
          text,
          message,
          kind,
          source,
          time: new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
        },
      ].slice(-30),
    );
    setReply(message);
  }
  function respond(message: string, speak: boolean) {
    setReply(message);
    if (speak && readAloud) microphone.speak(message);
  }
  function process(text: string, source: string, confidence = 1) {
    const intent = parseVoice(text, Date.now() < awakeUntil.current);
    awakeUntil.current = 0;
    setArmed(false);
    clearTimeout(clock.current);
    if (intent.kind === "stop") {
      microphone.stop();
      record(text, "Microphone stopped.", "stop", source);
      return;
    }
    if (intent.kind === "wake") {
      awakeUntil.current = Date.now() + 20000;
      setArmed(true);
      clock.current = setTimeout(() => {
        awakeUntil.current = 0;
        setArmed(false);
      }, 20000);
      record(
        text,
        "I'm listening. Ask about this hospital or name a field to fill.",
        "wake",
        source,
      );
      respond(
        "I'm listening. What would you like to know or fill?",
        source === "Microphone",
      );
      return;
    }
    if (intent.kind === "help") {
      const message =
        "Say Bot, followed by a hospital question, fill a named field, open a step, or undo. Clear current LKW, CTA and LVO findings can fill automatically.";
      record(text, message, "help", source);
      respond(message, source === "Microphone");
      return;
    }
    if (intent.kind === "none" || intent.kind === "rejected") {
      record(text, intent.message, intent.kind, source);
      return;
    }
    if (
      intent.kind === "changes" &&
      ((!autoFill && !intent.explicit) || (confidence > 0 && confidence < 0.65))
    ) {
      setPending({ intent, revision: context.revision, text });
      record(
        text,
        "Draft ready for review. No fields changed yet.",
        "review",
        source,
      );
      return;
    }
    const outcome = onAction(intent, context.revision);
    record(text, outcome.message, intent.kind, source);
    if (intent.kind === "question")
      respond(outcome.message, source === "Microphone");
  }
  useEffect(
    () => () => {
      clearTimeout(clock.current);
    },
    [],
  );
  return (
    <section
      className={`voice-studio ${active ? "is-live" : ""}`}
      aria-label="Proactive voice companion"
    >
      <div className="voice-intro">
        <div className="voice-kicker">
          <span className="live-dot" /> YOUR PROACTIVE COMPANION{" "}
          <span className="new-pill">VOICE</span>
        </div>
        <h2>
          You focus on the conversation.
          <br />
          <em>We keep up with the details.</em>
        </h2>
        <p>
          Speak a finding. Watch the encounter update and the right hospital
          guidance arrive — without a question.
        </p>
        <div className="voice-actions">
          <button
            className={`mic-button ${active ? "recording" : ""}`}
            onClick={() => (active ? microphone.stop() : microphone.start())}
            aria-pressed={active}
          >
            <Icon name={active ? "stop" : "mic"} />
            {active ? "Stop listening" : "Start listening"}
          </button>
          <span className="voice-status" role="status">
            <span className={active ? "live-dot" : "idle-dot"} />
            {microphone.status === "speaking"
              ? "Bot is speaking"
              : microphone.status === "starting"
                ? "Connecting microphone…"
                : microphone.status === "listening"
                  ? "Listening to your microphone"
                  : "Microphone is off"}
          </span>
        </div>
        <p className="mic-disclosure">
          Synthetic demo only. Browser speech may process audio online. Start
          listening enables your microphone; no call audio is captured.
        </p>
        {!microphone.supported && (
          <p className="voice-warning">
            Live speech is unavailable in this browser. Try Chrome, or use Test
            a phrase below.
          </p>
        )}
        {microphone.error && (
          <p className="voice-warning" role="alert">
            {microphone.error}
          </p>
        )}
        <div className="voice-preferences">
          <label>
            <input
              type="checkbox"
              checked={autoFill}
              onChange={(e) => setAutoFill(e.target.checked)}
            />
            Auto-fill clear findings
          </label>
          <label>
            <input
              type="checkbox"
              checked={readAloud}
              onChange={(e) => setReadAloud(e.target.checked)}
            />
            Read Bot answers aloud
          </label>
        </div>
      </div>
      <div className="conversation-card">
        <div className="conversation-head">
          <span>
            <Icon name="spark" size={17} /> Conversation → action
          </span>
          <span className="source-pill">{filled} fields filled</span>
        </div>
        <div
          className={`waveform ${microphone.status === "listening" ? "animate" : ""}`}
          aria-hidden="true"
        >
          {Array.from({ length: 42 }, (_, i) => (
            <i
              key={i}
              style={{
                height: `${8 + ((i * 17 + 11) % 41)}px`,
                animationDelay: `${i * 0.035}s`,
              }}
            />
          ))}
        </div>
        <div className="voice-live-text" aria-live="polite">
          <span>
            {microphone.interim
              ? "HEARING · NOT APPLIED"
              : armed
                ? "BOT IS READY FOR YOUR NEXT PHRASE"
                : "COMPANION"}
          </span>
          <p>{microphone.interim || reply}</p>
        </div>
        {filled > 0 && guidance && (
          <div className="voice-nudge" aria-live="polite">
            <span>
              <Icon name="spark" size={13} /> PROACTIVE HOSPITAL GUIDANCE
            </span>
            <strong>{guidance.title}</strong>
            <p>{guidance.message}</p>
            <details>
              <summary>
                Source · {guidance.hospitalId} ·{" "}
                {guidance.citations[0]?.field || "missing field"}
              </summary>
              {guidance.citations.map((s) => (
                <p key={s.id}>
                  {s.raw}
                  <small>
                    {s.version} ·{" "}
                    {s.lastVerified
                      ? `Verified ${s.lastVerified}`
                      : "Verification unknown"}
                  </small>
                </p>
              ))}
            </details>
            <a href="#encounter-workspace">
              Review updated encounter <Icon name="arrow" size={13} />
            </a>
          </div>
        )}
        <div className="conversation-footer">
          <span>
            <Icon name="shield" size={14} /> Hospital-specific. Source-backed.
          </span>
          <button
            className="undo-voice"
            disabled={!canUndo}
            onClick={() => {
              const result = onAction({ kind: "undo" }, context.revision);
              record(
                "Undo last voice update",
                result.message,
                "undo",
                "Review",
              );
            }}
          >
            <Icon name="undo" size={14} /> Undo
          </button>
        </div>
      </div>
      <div className="voice-bottom">
        <div className="try-phrases">
          <span>TRY SAYING</span>
          <code>“CTA is completed. LVO is present.”</code>
          <code>“Bot, what is the LVO pathway?”</code>
          <code>“Bot, fill note body with…”</code>
        </div>
        <details className="voice-test">
          <summary>
            Test a phrase <span>No microphone needed</span>
          </summary>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (input.trim()) {
                process(input, "Typed test");
                setInput("");
              }
            }}
          >
            <label htmlFor="voice-test-input">
              Synthetic transcript or Bot command
            </label>
            <div>
              <input
                id="voice-test-input"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="CTA is completed. LVO is present."
                maxLength={3000}
              />
              <button type="submit" disabled={!input.trim()}>
                Process phrase <Icon name="arrow" size={16} />
              </button>
            </div>
          </form>
          <p>
            Uses the same interpretation and field-update path as a final
            microphone transcript.
          </p>
        </details>
        {pending && (
          <div className="voice-review" role="status">
            <strong>Review detected findings</strong>
            <p>{pending.text}</p>
            {pending.intent.kind === "changes" && (
              <div>
                {pending.intent.changes.map((x) => (
                  <span className="fact-chip" key={x.fieldId}>
                    {registry.find((f) => f.id === x.fieldId)?.label}:{" "}
                    {String(x.value)}
                  </span>
                ))}
              </div>
            )}
            {reviewReason?.(pending.intent) && (
              <p className="voice-review-reason">
                {reviewReason(pending.intent)}
              </p>
            )}
            <button
              disabled={pending.revision !== context.revision}
              onClick={() => {
                const result = onAction(pending.intent, pending.revision);
                record(
                  pending.text,
                  result.message,
                  "changes",
                  "Reviewed draft",
                );
                setPending(null);
              }}
            >
              Apply reviewed findings
            </button>
            <button onClick={() => setPending(null)}>Discard</button>
            {pending.revision !== context.revision && (
              <p>
                Encounter changed. Discard this draft and repeat the finding.
              </p>
            )}
          </div>
        )}
        {entries.length > 0 && (
          <details className="voice-history">
            <summary>
              Activity trail{" "}
              <span>{entries.length} phrases · this session only</span>
            </summary>
            <ol>
              {[...entries].reverse().map((entry) => (
                <li key={entry.id}>
                  <div>
                    <span>
                      {entry.source} · {entry.time}
                    </span>
                    <b>
                      {entry.kind === "changes"
                        ? "Field update"
                        : entry.kind === "question"
                          ? "Guide question"
                          : "Companion"}
                    </b>
                  </div>
                  <blockquote>{entry.text}</blockquote>
                  <p>{entry.message}</p>
                </li>
              ))}
            </ol>
            <button
              onClick={() => {
                setEntries([]);
                setReply("Activity cleared. Ready for your next phrase.");
              }}
            >
              Clear transcript activity
            </button>
          </details>
        )}
      </div>
    </section>
  );
}
