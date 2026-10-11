import { useEffect, useId, useRef, useState } from "react";
import type { Context, Hospital, Result } from "../domain";
import { NudgeCard } from "../guidance/NudgeCard";
import { suggestionsFor } from "./suggestions";
import {
  askField,
  askGuide,
  escalationReason,
  seedFits,
  threadFor,
  threadKey,
  withTurn,
  type Thread,
  type Turn,
} from "./thread";

// Machine 2 owns this file. Machine 3 created it so the mount point and the
// prop signature exist; the signature is frozen for the sprint.
export interface ChatPanelProps {
  open: boolean;
  hospital: Hospital;
  context: Context;
  /** The nudge the doctor clicked, if they arrived from one. */
  seed?: Result;
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
      <p className="card-action">
        <span>Do</span>
        {seed.action}
      </p>
    </div>
  );
}

export function TurnView({
  turn,
  onAsk,
  onPick,
  onContacts,
}: {
  turn: Turn;
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
  onClose,
  onContacts,
}: ChatPanelProps) {
  const key = threadKey(hospital, context);
  const [stored, setStored] = useState<Thread>();
  const [draft, setDraft] = useState({ key, text: "" });
  const thread = threadFor(stored, key);
  const text = draft.key === key ? draft.text : "";
  const nextId = useRef(1);
  const input = useRef<HTMLTextAreaElement>(null);
  const inputId = useId();
  const shownSeed = seedFits(seed, hospital) ? seed : undefined;

  useEffect(() => {
    if (open) input.current?.focus();
  }, [open, key]);

  if (!open) return null;

  const submit = (q: string) => {
    if (!q.trim()) return;
    const turn = askGuide(hospital, context, q, nextId.current++);
    setStored((t) => withTurn(t, key, turn));
    setDraft({ key, text: "" });
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
        <div>
          <p className="eyebrow">Ask the guide · {hospital.id}</p>
          <h2>{hospital.name}</h2>
          <small className="muted">
            Guide {hospital.version} · answers come only from this hospital's
            guide
          </small>
        </div>
        <button
          type="button"
          className="link chat-close"
          onClick={onClose}
          aria-label="Close the guide chat"
        >
          Close
        </button>
      </header>
      {shownSeed && <SeedContext seed={shownSeed} />}
      {!thread.turns.length && (
        <div className="try-phrases chat-suggestions">
          <p>Try asking:</p>
          <ul>
            {suggestionsFor(shownSeed?.title).map((s) => (
              <li key={s}>
                <button type="button" className="link" onClick={() => submit(s)}>
                  {s}
                </button>
              </li>
            ))}
          </ul>
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
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit(text);
            }
          }}
        />
        <small className="muted">Don't include patient names or identifiers.</small>
        <button className="secondary" type="submit" disabled={!text.trim()}>
          Ask
        </button>
      </form>
    </section>
  );
}
