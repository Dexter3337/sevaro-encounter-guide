import { useEffect, useReducer, useRef } from "react";
import { AssistantOrb } from "./AssistantOrb";
import { nudgePriority } from "../engine";
import { NudgeCard, ReferenceRow } from "./NudgeCard";
import {
  dockReducer,
  initialDock,
  pillSummary,
  orderForField,
} from "./dockMachine";
import type { NudgeDockProps } from "./types";

// The companion's whole surface. It sits in the corner of the caselog and is
// deliberately hard to provoke: a corner panel that opened on every keystroke
// would be trained away inside a day.

export function NudgeDock({
  results,
  focusedFieldId,
  fieldLabels,
  onAsk,
  onAcknowledge,
  onContacts,
  onReport,
  unavailable,
  openRequest,
}: NudgeDockProps) {
  const [dock, dispatch] = useReducer(dockReducer, initialDock);
  const panelRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (openRequest) dispatch({ type: "OPEN", resultId: openRequest.resultId });
  }, [openRequest]);

  // Esc collapses the panel back to the pill, wherever focus is.
  useEffect(() => {
    if (dock.state !== "panel") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dispatch({ type: "COLLAPSE" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dock.state]);

  useEffect(() => {
    dispatch({ type: "RESULTS", results });
  }, [results]);

  useEffect(() => {
    if (focusedFieldId)
      dispatch({
        type: "FIELD_FOCUS",
        results: results.filter((r) => r.anchor === focusedFieldId),
      });
    else dispatch({ type: "FIELD_BLUR" });
  }, [focusedFieldId, results]);

  // Scroll a newly opened nudge into view, but never steal the keyboard: the
  // doctor is usually mid-sentence in a field when this fires.
  useEffect(() => {
    if (dock.state !== "panel" || !dock.focusResultId) return;
    panelRef.current
      ?.querySelector(`[data-result="${CSS.escape(dock.focusResultId)}"]`)
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [dock.state, dock.focusResultId]);

  // Reserve space in layout and keep the focused field inside its scroll area.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const active = document.activeElement;
      const form = active?.closest(".caselog");
      if (!(active instanceof HTMLElement) || !(form instanceof HTMLElement))
        return;
      const a = active.getBoundingClientRect(),
        box = form.getBoundingClientRect();
      if (a.bottom > box.bottom - 16)
        form.scrollTop += a.bottom - box.bottom + 20;
      else if (a.top < box.top + 16) form.scrollTop -= box.top - a.top + 20;
    });
    return () => cancelAnimationFrame(frame);
  }, [dock.state, focusedFieldId]);

  if (unavailable)
    return (
      <aside className="nudge-dock" data-state="pill" data-testid="nudge-dock">
        <div className="dock-pill unavailable" role="status">
          Guidance unavailable — the caselog still works
        </div>
      </aside>
    );

  if (dock.state === "hidden") return null;

  const ordered = orderForField(results, focusedFieldId);
  const summary = pillSummary(results);
  const focusedLabel = focusedFieldId ? fieldLabels[focusedFieldId] : undefined;
  const peeked = focusedFieldId
    ? ordered.filter((r) => r.anchor === focusedFieldId)
    : [];

  return (
    <aside
      className="nudge-dock"
      data-state={dock.state}
      data-testid="nudge-dock"
      role="region"
      aria-label="Hospital guidance"
    >
      {dock.state === "peek" && peeked.length > 0 && (
        <div className="dock-peek" data-testid="dock-peek">
          <span className="dock-peek-for">For {focusedLabel}</span>
          <span className="dock-peek-line">
            {peeked.map((r) => `${r.title}: ${r.message}`).join(" · ")}
          </span>
        </div>
      )}

      {dock.state === "panel" ? (
        <section className="dock-panel" data-testid="dock-panel">
          <header className="dock-header">
            <div className="dock-title-group">
              <AssistantOrb small />
              <div>
                <p className="eyebrow">
                  <span className="live-dot" /> HOSPITAL GUIDANCE ·{" "}
                  {summary.count}
                </p>
                <h2>
                  {focusedLabel ? `For ${focusedLabel}` : "Hospital guidance"}
                </h2>
                <span className="dock-subtitle">
                  Guide companion ? {summary.label}
                </span>
              </div>
            </div>
            <button
              className="dock-collapse"
              onClick={() => {
                dispatch({ type: "COLLAPSE" });
                requestAnimationFrame(() => pillRef.current?.focus());
              }}
              aria-label="Collapse guidance"
            >
              Hide
            </button>
          </header>
          <div
            className="dock-list"
            ref={panelRef}
            aria-live="polite"
            aria-atomic="false"
          >
            {ordered.map((r) => (
              <div key={r.id} data-result={r.id}>
                {nudgePriority(r) >= 50 ? (
                  <NudgeCard
                    r={r}
                    onAsk={onAsk}
                    onAcknowledge={onAcknowledge}
                    onContacts={onContacts}
                    onReport={onReport}
                  />
                ) : (
                  <ReferenceRow r={r} onAsk={onAsk} />
                )}
              </div>
            ))}
          </div>
        </section>
      ) : (
        <button
          ref={pillRef}
          className={`dock-pill ${summary.tier}`}
          onClick={() => dispatch({ type: "TOGGLE" })}
          data-testid="dock-pill"
          aria-expanded={false}
        >
          <AssistantOrb />
          <span className="dock-pill-count">{summary.count}</span>
          {/* Tier is said in words as well as shown in colour. */}
          <span className="dock-pill-copy">
            <strong>Guide companion</strong>
            <span className="dock-pill-label">{summary.label}</span>
          </span>
        </button>
      )}
    </aside>
  );
}
