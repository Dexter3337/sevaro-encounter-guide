import { useEffect, useReducer, useRef, useState } from "react";
import type { Result } from "../domain";
import { nudgePriority, resultSignature } from "../engine";
import { NudgeCard, NudgeRow } from "./NudgeCard";
import { dockReducer, initialDock, pillSummary } from "./dockMachine";
import type { GuidePanelProps } from "./types";

// The guide column's guidance view. It lives in a fixed column beside the form,
// so it never covers what the doctor is typing, and it opens exactly one rule
// at a time: the one for the field they are in, the one they clicked, or the
// one that has just become important. Everything else is a single line below.
//
// It stays hard to provoke. Reference material never opens by itself; a rule
// already seen does not reopen; a doctor who closed a card is not overruled
// until something genuinely new arrives.
export function NudgeDock({
  results,
  acknowledged,
  reported,
  focusedFieldId,
  fieldLabels,
  hospitalName,
  onAsk,
  onAcknowledge,
  onUndoAcknowledge,
  onContacts,
  onReport,
  unavailable,
  openRequest,
  storyboard,
  onNewNudge,
}: GuidePanelProps & { onNewNudge?: () => void }) {
  const [dock, dispatch] = useReducer(dockReducer, initialDock);
  // What the doctor chose explicitly: a rule, or "nothing open".
  const [picked, setPicked] = useState<{ id?: string; closed?: boolean }>({});
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!openRequest) return;
    dispatch({ type: "OPEN", resultId: openRequest.resultId });
    setPicked({ id: openRequest.resultId });
  }, [openRequest]);

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

  // Moving to another field with guidance of its own hands the card to it.
  useEffect(() => {
    if (focusedFieldId && results.some((r) => r.anchor === focusedFieldId))
      setPicked({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedFieldId]);

  // Something new and important arrived: it takes the card, once.
  useEffect(() => {
    if (dock.state === "panel" && dock.focusResultId) {
      setPicked({ id: dock.focusResultId });
      onNewNudge?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dock.focusResultId]);

  const mine = focusedFieldId
    ? results.filter((r) => r.anchor === focusedFieldId)
    : [];
  let selected: Result | undefined;
  if (!picked.closed) {
    if (picked.id) selected = results.find((r) => r.id === picked.id);
    if (!selected && (dock.state === "peek" || dock.state === "panel") && mine.length)
      selected = mine[0];
    if (!selected && dock.state === "panel")
      selected =
        results.find((r) => r.id === dock.focusResultId) ??
        results.find((r) => nudgePriority(r) >= 50) ??
        results[0];
  }

  // Bring the open card into view without taking the keyboard: the doctor is
  // usually mid-entry in a field when this happens.
  useEffect(() => {
    cardRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selected?.id]);

  // Esc folds the open card back into the list, wherever focus is.
  const hasCard = !!selected;
  useEffect(() => {
    if (!hasCard) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      setPicked({ closed: true });
      dispatch({ type: "COLLAPSE" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hasCard]);

  if (unavailable)
    return (
      <section className="gp-guidance" data-state="pill" data-testid="nudge-dock">
        <p className="gp-unavailable" role="status">
          Guidance unavailable — the caselog still works
        </p>
      </section>
    );

  if (!results.length)
    return (
      <section className="gp-guidance is-empty">
        {storyboard}
        <div className="gp-empty">
          <p>
            <strong>Nothing from {hospitalName}'s guide at this step.</strong>
          </p>
          <p className="muted">
            Ask the guide if you need something specific.
          </p>
        </div>
      </section>
    );

  const isAck = (r: Result) => acknowledged.includes(resultSignature(r));
  const summary = pillSummary(results);
  const forField = mine.filter((r) => r !== selected);
  const rest = results.filter((r) => r !== selected && !mine.includes(r));
  const open = (r: Result) => {
    setPicked({ id: r.id });
    dispatch({ type: "OPEN", resultId: r.id });
  };
  const focusedLabel = focusedFieldId ? fieldLabels[focusedFieldId] : undefined;

  return (
    <section
      className="gp-guidance"
      data-state={dock.state}
      data-testid="nudge-dock"
      role="region"
      aria-label="Hospital guidance"
    >
      {storyboard}
      <p className={`gp-summary ${summary.tier}`} data-testid="dock-pill">
        <span className="gp-dot" aria-hidden="true" />
        {summary.label}
      </p>
      {selected && (
        <div
          ref={cardRef}
          className="gp-open"
          data-testid={dock.state === "peek" ? "dock-peek" : "dock-panel"}
          aria-live="polite"
        >
          {selected.anchor && fieldLabels[selected.anchor] && (
            <p className="gp-for">For {fieldLabels[selected.anchor]}</p>
          )}
          <NudgeCard
            r={selected}
            onAsk={onAsk}
            onAcknowledge={onAcknowledge}
            onUndoAcknowledge={onUndoAcknowledge}
            acknowledged={isAck(selected)}
            onContacts={onContacts}
            onReport={onReport}
            reported={reported.includes(selected.id)}
            onClose={() => {
              setPicked({ closed: true });
              dispatch({ type: "COLLAPSE" });
            }}
          />
        </div>
      )}
      {forField.length > 0 && (
        <div className="gp-list">
          <p className="gp-list-head">Also for {focusedLabel}</p>
          {forField.map((r) => (
            <NudgeRow key={r.id} r={r} acknowledged={isAck(r)} onOpen={open} />
          ))}
        </div>
      )}
      {rest.length > 0 && (
        <div className="gp-list">
          <p className="gp-list-head">
            {selected || forField.length ? "Also at this step" : "At this step"}
          </p>
          {rest.map((r) => (
            <NudgeRow key={r.id} r={r} acknowledged={isAck(r)} onOpen={open} />
          ))}
        </div>
      )}
    </section>
  );
}
