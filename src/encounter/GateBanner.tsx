import { useState } from "react";
import type { Result } from "../domain";

// A hard stop belongs at the button it blocks, not in a corner panel. The
// doctor clicked Complete; the answer to "why didn't that work?" has to be in
// the place they are looking.
export function GateBanner({
  gates,
  onGoToField,
  onAcknowledge,
}: {
  gates: Result[];
  onGoToField: (fieldId: string) => void;
  /** Clearing a gate the doctor cannot satisfy themselves. Reason is recorded. */
  onAcknowledge: (r: Result, reason: string) => void;
}) {
  const [reasons, setReasons] = useState<Record<string, string>>({});
  if (!gates.length) return null;

  return (
    <div className="gate-banner" role="alert" data-testid="gate-banner">
      <p className="gate-headline">
        {gates.length === 1
          ? "Completion is blocked by one of this hospital's rules."
          : `Completion is blocked by ${gates.length} of this hospital's rules.`}
      </p>
      {gates.map((g) => (
        <div key={g.id} className="gate-item" data-field={g.missingRequirements[0]}>
          <strong>{g.title}</strong>
          <p>{g.message}</p>
          <p className="card-action">
            <span>Do</span>
            {g.action}
          </p>
          <small>
            {g.hospitalId} · {g.version}
          </small>
          <div className="gate-actions">
            {g.missingRequirements[0] && (
              <button
                className="link"
                onClick={() => onGoToField(g.missingRequirements[0])}
              >
                Go to the field →
              </button>
            )}
            {/* Some requirements are not the doctor's to satisfy. A hospital
                provider confirming a plan is one of them; blocking the
                encounter until someone else acts would be the wrong trade. */}
            {g.release === "acknowledge_with_reason" && (
              <div className="gate-acknowledge">
                <label htmlFor={`reason-${g.id}`}>
                  Acknowledge with a reason
                </label>
                <input
                  id={`reason-${g.id}`}
                  value={reasons[g.id] ?? ""}
                  placeholder="e.g. plan confirmed verbally with Dr Okafor"
                  onChange={(e) =>
                    setReasons((p) => ({ ...p, [g.id]: e.target.value }))
                  }
                />
                <button
                  className="secondary"
                  disabled={(reasons[g.id] ?? "").trim().length < 4}
                  onClick={() => onAcknowledge(g, reasons[g.id].trim())}
                >
                  Acknowledge and complete
                </button>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
