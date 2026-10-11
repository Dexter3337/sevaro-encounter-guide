import { useEffect, useId, useRef, useState, useMemo } from "react";
import { createChatSession } from "./session";
import type { QuestionInterpreter } from "./adapter";
import type { QuestionTurn } from "./questions";
import type { Context, Hospital, Result } from "../domain";
import { Evidence, NudgeCard } from "../guidance/NudgeCard";
import { suggestionsFor } from "./suggestions";
import { buildLlmInput, requestLlm, LlmError } from "../llm/client";
import { transcriptIdentity } from "../llm/contracts";
import { EvidenceList } from "../llm/TranscriptDrafts";
import type { Segment } from "../stt/protocol";
import {
  askField,
  escalationReason,
  seedFits,
  threadFor,
  threadKey,
  withTurn,
  type Thread,
} from "./thread";

// Machine 2 owns this file. Machine 3 created it so the mount point and the
// prop signature exist; the signature is frozen for the sprint.
export interface ChatPanelProps {
  open: boolean;
  hospital: Hospital;
  context: Context;
  /** The nudge the doctor clicked, if they arrived from one. */
  seed?: Result;
  interpreter?: QuestionInterpreter;
  transcript?: Segment[];
  accessCode?: string;
  onAccessCode?: (code: string) => void;
  onClose: () => void;
  onContacts: (reason: string) => void;
}

const label = (s: string) =>
  s.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
const dated = (r: Result) => {
  const s = r.citations[0];
  return s?.lastVerified
    ? `verified ${s.lastVerified}`
    : s?.updatedAt
      ? `updated ${s.updatedAt}`
      : "date unknown";
};

// The nudge the doctor came from, restated so the question has its context.
export function SeedContext({ seed }: { seed: Result }) {
  return (
    <div className="chat-seed" data-testid="chat-seed">
      <p className="chat-about">
        <span className="eyebrow">About</span> <strong>{seed.title}</strong> ·{" "}
        {seed.hospitalId}
        <br />
        <small>
          {label(seed.primaryStatus)} · {dated(seed)}
        </small>
      </p>
      <p className="card-answer">{seed.message}</p>
      <p className="card-action gp-next">
        <span>Next step</span>
        {seed.action}
      </p>
      <Evidence r={seed} />
    </div>
  );
}

export function TurnView({
  turn,
  onAsk,
  onPick,
  onContacts,
}: {
  turn: QuestionTurn;
  onAsk: (r: Result) => void;
  onPick: (field: string) => void;
  onContacts: (reason: string) => void;
}) {
  const reason = turn.result && escalationReason(turn.result);
  return (
    <div className="chat-turn" data-testid="chat-turn">
      <p className="chat-question">
        <span className="sr-only">You asked: </span>
        {turn.question}
      </p>
      {turn.interpreted && (
        <p className="chat-interpreted">{turn.interpreted}</p>
      )}
      {turn.ai && <div className="llm-chat-answer">
        <p>{turn.ai.answer}</p>
        {!!turn.ai.evidence.length && <EvidenceList evidence={turn.ai.evidence} transcript={turn.transcript ?? []} />}
        {!!turn.ai.questions.length && <ul>{turn.ai.questions.map((q,i) => <li key={i}>{q}</li>)}</ul>}
        <small>AI draft · clinician review · {turn.ai.latencyMs} ms</small>
      </div>}
      {turn.result && <NudgeCard r={turn.result} onAsk={onAsk} />}
      {reason && (
        <button
          type="button"
          className="secondary chat-escalate"
          onClick={() => onContacts(reason)}
        >
          Call someone · {reason}
        </button>
      )}
      {turn.clarification && (
        <div className="banner chat-clarify" role="status">
          <p>{turn.clarification}</p>
          {turn.candidates && (
            <div className="chat-chips">
              {turn.candidates.map((f) => (
                <button
                  key={f}
                  type="button"
                  className="fact-chip"
                  onClick={() => onPick(f)}
                >
                  {f}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function ChatPanel({
  open,
  hospital,
  context,
  seed,
  interpreter,
  transcript = [],
  accessCode,
  onAccessCode,
  onClose,
  onContacts,
}: ChatPanelProps) {
  const key = threadKey(hospital, context);
  const [stored, setStored] = useState<Thread>();
  const [draft, setDraft] = useState({ key, text: "" });
  const thread = threadFor(stored, key);
  const text = draft.key === key ? draft.text : "";
  const nextId = useRef(1);
  const [useAi,setUseAi] = useState(true);
  const [shareTranscript,setShareTranscript] = useState(false);
  const aiController = useRef<AbortController | undefined>(undefined);
  const aiKey = `${transcriptIdentity(hospital,context,transcript)}:${JSON.stringify(context.values)}:${context.step}`;
  const latestAiKey = useRef(aiKey);latestAiKey.current = aiKey;
  const latest = useRef({ hospital, context });
  latest.current = { hospital, context };
  const session = useMemo(
    () => createChatSession(() => latest.current, { interpreter }),
    [interpreter],
  );
  const [pending, setPending] = useState(false);
  const [mode, setMode] = useState("Local guide answers");
  const [failure, setFailure] = useState("");
  const lastRequest = useRef(0);
  useEffect(() => {
    setPending(false);
    setFailure("");
    return () => {
      lastRequest.current++;
      aiController.current?.abort();
      session.dispose();
    };
  }, [session, key, open, aiKey, useAi, shareTranscript, accessCode]);
  const input = useRef<HTMLTextAreaElement>(null);
  const inputId = useId();
  const shownSeed = seedFits(seed, hospital) ? seed : undefined;

  useEffect(() => {
    if (open) input.current?.focus();
  }, [open, key]);

  if (!open) return null;

  const submit = async (q: string) => {
    if (!q.trim() || pending) return;
    const ticket = ++lastRequest.current;
    setPending(true);
    setFailure("");
    try {
      if (useAi && !interpreter) {
        aiController.current?.abort();
        const controller = new AbortController();aiController.current = controller;
        const snapshotKey = aiKey;
        try {
          const history = thread.turns.flatMap(t => [
            {role:"user" as const,text:t.question},
            {role:"assistant" as const,text:t.ai?.answer || t.result?.message || t.clarification || ""},
          ]);
          const request = buildLlmInput("chat",hospital,context,shareTranscript ? transcript : [],q,history);
          const reply = await requestLlm(request,controller.signal,accessCode);
          if (ticket !== lastRequest.current || snapshotKey !== latestAiKey.current) return;
          setStored(t => withTurn(t,key,{id:nextId.current++,question:q,ai:reply,transcript:shareTranscript ? transcript : []}));
          setDraft({key,text:""});setMode(`AI assistant · ${shareTranscript ? "transcript and " : ""}selected hospital guide`);
          return;
        } catch (e) {
          if (controller.signal.aborted || ticket !== lastRequest.current) return;
          setMode("AI unavailable; local guide answers");
          setFailure(e instanceof LlmError ? `${e.message} Showing a local guide answer.` : "AI unavailable. Showing a local guide answer.");
        }
      }
      const reply = await session.submit(
        q,
        thread.turns.at(-1)?.result?.title || shownSeed?.title,
      );
      if (!reply || ticket !== lastRequest.current) return;
      const turns = reply.turns.map((turn) => ({
        ...turn,
        id: nextId.current++,
      }));
      setStored((t) =>
        turns.reduce(
          (state, turn) => withTurn(state, key, turn),
          threadFor(t, key),
        ),
      );
      setDraft({ key, text: "" });
      setMode(
        reply.mode === "interpreted"
          ? "AI-assisted interpretation; guide-sourced answers"
          : reply.mode === "fallback"
            ? "AI unavailable; local guide answers"
            : "Local guide answers",
      );
    } catch {
      if (ticket === lastRequest.current)
        setFailure("The guide could not be searched. Please try again.");
    } finally {
      if (ticket === lastRequest.current) setPending(false);
    }
  };
  const pick = (field: string) => {
    const turn = askField(hospital, context, field, nextId.current++);
    setStored((t) => withTurn(t, key, turn));
  };
  // "Ask about this" on an answer starts a follow-up about the same field.
  const followUp = (r: Result) => {
    setDraft({ key, text: `${r.title}: ` });
    input.current?.focus();
  };

  return (
    <section
      className="ask-panel chat-panel"
      role="region"
      aria-label={`Ask ${hospital.name}'s guide`}
      data-testid="chat-panel"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <header className="chat-head">
        <p>
          <strong>Ask {hospital.name}'s guide</strong>
          <small>
            This hospital's guide and the transcript you choose to share · {hospital.version}
          </small>
        </p>
        <button
          type="button"
          className="gp-btn chat-close"
          onClick={onClose}
          aria-label="Close the guide chat"
          title="Back to guidance"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
          Close
        </button>
      </header>
      {shownSeed && <SeedContext seed={shownSeed} />}
      <div className="ai-chat-options">
        <label className="llm-toggle"><input type="checkbox" checked={useAi} onChange={e => setUseAi(e.target.checked)} />Use Gemini / AI assistant</label>
        {useAi && <details><summary>Transcript sharing & access</summary>
          <label className="llm-toggle"><input type="checkbox" checked={shareTranscript} onChange={e => setShareTranscript(e.target.checked)} />Share this encounter's transcript with AI chat ({transcript.length} lines)</label>
          {onAccessCode && <label className="llm-code">AI access code (if configured)<input type="password" autoComplete="off" value={accessCode || ""} onChange={e => onAccessCode(e.target.value)} /></label>}
        </details>}
      </div>
      {!thread.turns.length && (
        <div className="chat-suggestions">
          <p>Try asking:</p>
          <div className="chat-chips">
            {suggestionsFor(shownSeed?.title).map((s) => (
              <button
                key={s}
                type="button"
                className="fact-chip"
                onClick={() => submit(s)}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="chat-thread" aria-live="polite">
        {thread.turns.map((t) => (
          <TurnView
            key={t.id}
            turn={t}
            onAsk={followUp}
            onPick={pick}
            onContacts={onContacts}
          />
        ))}
      </div>
      <p className="chat-mode" role="status">
        {pending ? "Reading the question and checking the available evidence..." : [failure,mode].filter(Boolean).join(" ")}
      </p>
      <form
        className="chat-form"
        onSubmit={(e) => {
          e.preventDefault();
          submit(text);
        }}
      >
        <label className="sr-only" htmlFor={inputId}>
          Question for {hospital.name}'s guide
        </label>
        <textarea
          id={inputId}
          ref={input}
          value={text}
          maxLength={2000}
          rows={2}
          placeholder="Ask about this hospital's guide…"
          onChange={(e) => setDraft({ key, text: e.target.value })}
          onKeyDown={(e) => {
            if (
              e.key === "Enter" &&
              !e.shiftKey &&
              !e.nativeEvent.isComposing
            ) {
              e.preventDefault();
              submit(text);
            }
          }}
        />
        <div className="chat-form-foot">
          <small className="muted">
            Don't include patient names or identifiers.
          </small>
          <button
            className="gp-btn primary"
            type="submit"
            disabled={!text.trim() || pending}
          >
            Ask
          </button>
        </div>
      </form>
    </section>
  );
}
