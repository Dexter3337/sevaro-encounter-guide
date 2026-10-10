import React, { useEffect, useRef, useState } from "react";
import { type Context, type Known, registry, value } from "./domain";
import { type TranscriptBatch } from "./transcript";
export function TranscriptReview({
  batch,
  context,
  close,
  approve,
}: {
  batch: TranscriptBatch;
  context: Context;
  close: () => void;
  approve: (selected: string[]) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [selected, setSelected] = useState<string[]>([]);
  useEffect(() => {
    dialog.current?.showModal();
    return () => {
      dialog.current?.close();
    };
  }, []);
  const stale =
    context.id !== batch.encounterId ||
    context.revision !== batch.revision ||
    context.hospitalId !== batch.hospitalId ||
    context.guideVersion !== batch.guideVersion;
  return (
    <dialog
      ref={dialog}
      className="transcript-dialog"
      onCancel={close}
      aria-labelledby="transcript-title"
    >
      <h2 id="transcript-title">Review transcript drafts</h2>
      <p>
        Scripted synthetic handoff · {batch.hospitalId}. This simulates an
        approved Sevaro feed; no meeting is being recorded or accessed.
      </p>
      <p>
        Choose each fact you have verified. Existing values are shown before any
        replacement. Drafts never release completion gates.
      </p>
      {stale && (
        <p role="alert">
          Encounter changed. Close this review and request fresh drafts.
        </p>
      )}
      {batch.candidates.map((x) => (
        <section className="transcript-candidate" key={x.id}>
          <label>
            <input
              type="checkbox"
              checked={selected.includes(x.id)}
              disabled={stale}
              onChange={(e) =>
                setSelected((prev) =>
                  e.target.checked
                    ? [...prev, x.id]
                    : prev.filter((id) => id !== x.id),
                )
              }
            />{" "}
            Approve {registry.find((f) => f.id === x.fieldId)?.label}:{" "}
            {String(x.value)}
          </label>
          <blockquote>{x.quote}</blockquote>
          <small>
            {x.speaker.replaceAll("_", " ")} · action time {x.occurredAt} ·
            source {batch.sourceId}
          </small>
          <p>
            Current:{" "}
            {context.values[x.fieldId]?.state === "known"
              ? String(value(context, x.fieldId))
              : context.values[x.fieldId]?.state || "Not recorded"}{" "}
            → proposed: {String(x.value)}
          </p>
        </section>
      ))}
      <p className="muted">
        No patient identity, dose, order, charge or plan-confirmation fields can
        be filled by this demonstration. Transcript quotes are held in memory;
        approved synthetic values follow the normal draft storage.
      </p>
      <div className="transcript-actions">
        <button onClick={close}>Discard drafts</button>
        <button
          className="primary"
          disabled={stale || !selected.length}
          onClick={() => approve(selected)}
        >
          Apply approved drafts
        </button>
      </div>
    </dialog>
  );
}
