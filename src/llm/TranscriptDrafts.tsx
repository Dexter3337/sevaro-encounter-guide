import { useEffect, useRef, useState } from "react";
import { value, type Context, type Hospital } from "../domain";
import type { Segment } from "../stt/protocol";
import { buildLlmInput, requestLlm } from "./client";
import { draftLabels, transcriptIdentity, type Suggestion, type Evidence } from "./contracts";
import "./llm.css";

export function EvidenceList({ evidence, transcript }: {evidence: Evidence[]; transcript: Segment[]}) {
  return <details className="llm-evidence"><summary>Basis · {evidence.length} source excerpt{evidence.length !== 1 ? "s" : ""}</summary>
    {evidence.map((e,i) => <blockquote key={i}>
      <small>{e.kind === "transcript" ? `Transcript line ${e.id}` : `Guide source ${e.id}`}
        {e.kind === "transcript" && transcript.find(s => String(s.id) === e.id)?.at &&
          ` · ${new Date(transcript.find(s => String(s.id) === e.id)!.at).toLocaleTimeString()}`}</small>
      <p>{e.quote}</p>
    </blockquote>)}
  </details>;
}

/** Opt-in, debounced extraction of committed phrases only. Never writes fields. */
export function TranscriptDrafts({hospital, context, transcript, accessCode, onAccessCode, onApply}: {
  hospital: Hospital; context: Context; transcript: Segment[];
  accessCode: string; onAccessCode: (code: string) => void;
  onApply: (field: string, text: string) => void;
}) {
  const [enabled,setEnabled] = useState(false);
  const [retry,setRetry] = useState(0);
  const [pending,setPending] = useState(false);
  const [error,setError] = useState("");
  const [result,setResult] = useState<{key:string; drafts:Suggestion[]; baseline:Record<string,string>; ms:number; questions:string[]} >();
  const [replacements,setReplacements] = useState<string[]>([]);
  const [applied,setApplied] = useState<string[]>([]);
  const key = transcriptIdentity(hospital,context,transcript);
  const current = useRef({key,hospital,context,transcript});
  current.current = {key,hospital,context,transcript};
  const ticket = useRef(0);
  useEffect(() => {
    const request = ++ticket.current;
    const controller = new AbortController();
    setPending(false); setError(""); setReplacements([]); setApplied([]);
    if (!enabled || !transcript.length) return;
    setPending(true);
    const timer = setTimeout(async () => {
      try {
        const snapshot = current.current;
        const input = buildLlmInput("suggest",snapshot.hospital,snapshot.context,snapshot.transcript);
        const reply = await requestLlm(input,controller.signal,accessCode);
        if (request !== ticket.current || current.current.key !== key) return;
        setResult({key,drafts:reply.suggestions, baseline: input.context.values, ms:reply.latencyMs,questions:reply.questions});
      } catch (e) {
        if (!controller.signal.aborted && request === ticket.current)
          setError(e instanceof Error ? e.message : "Drafts are unavailable. Continue manually.");
      } finally { if (request === ticket.current) setPending(false); }
    },1500);
    return () => {clearTimeout(timer);controller.abort();ticket.current++;};
  },[enabled,key,retry,accessCode]);
  const shown = enabled && result?.key === key ? result : undefined;
  return <section className="transcript-drafts" aria-label="Transcript field suggestions" data-testid="transcript-drafts">
    <header><div><strong>Draft from the conversation</strong><p>Review the transcript evidence, then choose what to fill.</p></div>
      <label className="llm-toggle"><input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} />Suggest from transcript</label>
    </header>
    <small>Enabling suggestions sends the committed transcript to the AI provider. Synthetic conversations only.</small>
    {enabled && <>
      <label className="llm-code">AI access code (if configured)<input type="password" autoComplete="off" value={accessCode} onChange={e => onAccessCode(e.target.value)} /></label>
      <p role="status">{pending ? "Reading the latest transcript…" : error || (!transcript.length ? "Waiting for committed transcript lines." : shown ? `Drafts ready · AI response ${shown.ms} ms` : "Ready to generate drafts.")}</p>
      {transcript.length > 0 && <button className="link" disabled={pending} onClick={() => setRetry(r => r+1)}>Refresh suggestions</button>}
      {shown && !shown.drafts.length && <p>No supported field suggestions yet. Continue the conversation or enter details manually.</p>}
      <div className="llm-draft-grid">{shown?.drafts.map(s => {
        const recorded = String(value(context,s.field) ?? "");
        const changed = recorded !== (shown.baseline[s.field] || "");
        const replacing = !!recorded && recorded !== s.value;
        const done = applied.includes(s.field) && recorded === s.value;
        return <article className="llm-draft" key={s.field}>
          <h3>{draftLabels[s.field]}</h3><p className="llm-draft-value">{s.value}</p><p>{s.basis}</p>
          <EvidenceList evidence={s.evidence} transcript={transcript} />
          {changed && !done && <small>The field was edited after this draft was requested. Review before replacing it.</small>}
          {replacing && <label><input type="checkbox" checked={replacements.includes(s.field)} onChange={e => setReplacements(xs => e.target.checked ? [...xs,s.field] : xs.filter(x => x !== s.field))} />Replace the current {draftLabels[s.field].toLowerCase()}</label>}
          <button className="secondary" disabled={done || (replacing && !replacements.includes(s.field))} onClick={() => {
            if (current.current.key !== shown.key) return;
            onApply(s.field,s.value);setApplied(xs => [...xs,s.field]);
          }}>{done ? "Applied" : `Fill ${draftLabels[s.field]}`}</button>
        </article>;
      })}</div>
      {shown?.questions.length ? <div className="llm-questions"><strong>Questions to clarify</strong><ul>{shown.questions.map((q,i) => <li key={i}>{q}</li>)}</ul></div> : null}
    </>}
  </section>;
}
