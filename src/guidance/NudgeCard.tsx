import { useState } from "react";
import { Temporal } from "@js-temporal/polyfill";
import type { Result } from "../domain";
import type { NudgeCardProps, ReportReason } from "./types";
import { Icon } from "../Icon";

const label = (s: string) =>
  s.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());

// Words a doctor reads at a glance. Colour repeats these; it never replaces them.
export const tierWord = (r: Result) =>
  r.blocksCompletion
    ? "Required"
    : r.tier === "advisory" || r.tier === "hard_stop"
      ? "Advisory"
      : "For reference";
export const statusWord: Record<string, string> = {
  answered: "From the guide",
  not_in_guide: "Not in the guide",
  time_dependent: "Depends on the time",
  stale: "Possibly out of date",
  conflict: "Sources disagree",
  hard_stop: "Blocks completion",
};
const isStale = (r: Result) =>
  r.primaryStatus === "stale" || r.flags.includes("stale");
// The engine appends "possibly out of date" to the message and the action so
// that every surface carries it. On a card the dated "Verify" line says it
// once, in its own colour, so the repeats are taken out of the prose here.
export const withoutStaleNote = (text: string) =>
  text
    .replace(/\s*Possibly out of date \(last verified [^)]*\)\.?/g, "")
    .replace(/\s*Last verified [0-9-]+ — may be out of date\.?/g, "")
    .trim();

const pretty = (iso: string) => {
  try {
    return Temporal.PlainDate.from(iso).toLocaleString("en-US", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
};
const ageInDays = (iso: string, at: string) => {
  try {
    return Temporal.PlainDate.from(iso).until(
      Temporal.Instant.from(at).toZonedDateTimeISO("UTC").toPlainDate(),
      { largestUnit: "days" },
    ).days;
  } catch {
    return undefined;
  }
};

// Where the rule came from and how current it is, in one line. A rule that may
// be out of date says so in its own colour, with the date and how old it is.
export function SourceLine({ r }: { r: Result }) {
  const s = r.citations.find((x) => x.sourceKind === "guide") ?? r.citations[0];
  const when = s?.lastVerified ?? s?.updatedAt;
  const days = when ? ageInDays(when, r.effectiveInstant) : undefined;
  if (isStale(r))
    return (
      <p className="gp-source is-stale">
        <Icon name="clock" size={15} />
        <span>
          <strong>Verify before relying on it.</strong> Last checked{" "}
          {when ? pretty(when) : "on an unknown date"}
          {days !== undefined ? ` — ${days} days ago` : ""}.
        </span>
      </p>
    );
  return (
    <p className="gp-source">
      {r.hospitalId} guide · {r.version}
      {when
        ? ` · ${s?.lastVerified ? "verified" : "updated"} ${pretty(when)}`
        : " · verification date unknown"}
    </p>
  );
}

export function Evidence({ r }: { r: Result }) {
  return (
    <details className="evidence">
      <summary>
        View source evidence · {r.citations.length || "absent field"}
      </summary>
      <div className="evidence-body">
        {r.citations.map((s, i) => (
          <div key={s.id + ":" + i} className="source">
            <strong>
              {s.hospitalId} · {s.field}
            </strong>
            <p>{s.raw}</p>
            <small>
              {s.sourceKind} · {s.version} · {s.locator || s.sourceName}
              <br />
              {s.lastVerified
                ? `Verified ${s.lastVerified}`
                : s.sourceKind === "storyboard"
                  ? `Updated ${s.updatedAt || "unknown"} (not verification)`
                  : "Verification date unknown"}
            </small>
          </div>
        ))}
        {r.missingEvidence && (
          <p>
            Searched {r.missingEvidence.hospitalId} · {r.missingEvidence.version}{" "}
            · {r.missingEvidence.field}.{" "}
            {r.missingEvidence.absent
              ? "Field absent."
              : "Requested availability not documented."}{" "}
            No fabricated source excerpt.
          </p>
        )}
        <p className="muted">{r.rationale}</p>
        <p className="muted">
          {r.anchor
            ? `Shown because this hospital's “${r.title}” rule applies to the field you are on.`
            : `Shown because this hospital's “${r.title}” rule applies at this step.`}{" "}
          Evaluated {r.effectiveLocal || r.effectiveInstant}.
        </p>
      </div>
    </details>
  );
}

export const needsAPerson = (r: Result) =>
  r.primaryStatus === "not_in_guide" ||
  r.primaryStatus === "conflict" ||
  isStale(r) ||
  r.flags.includes("schedule_unknown") ||
  r.flags.includes("interpretation_review") ||
  r.flags.includes("uncertain_requirement");

const REASONS: [ReportReason, string][] = [
  ["outdated", "Information is out of date"],
  ["wrong_field", "Wrong field or wrong hospital"],
  ["wrong_time", "Wrong hours or time window"],
  ["not_applicable", "Doesn't apply to this situation"],
  ["other", "Something else"],
];

// "This looks wrong" used to do nothing visible. It now asks what is wrong, so
// the guide owner gets something they can act on.
function ReportForm({
  r,
  onSend,
  onCancel,
}: {
  r: Result;
  onSend: (reason: ReportReason, comment: string) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState<ReportReason>();
  const [comment, setComment] = useState("");
  return (
    <form
      className="gp-report"
      aria-label={`Report a problem with ${r.title}`}
      onSubmit={(e) => {
        e.preventDefault();
        if (reason) onSend(reason, comment.trim());
      }}
    >
      <fieldset>
        <legend>What looks wrong?</legend>
        {REASONS.map(([value, text]) => (
          <label key={value} className="gp-radio">
            <input
              type="radio"
              name={`reason-${r.id}`}
              value={value}
              checked={reason === value}
              onChange={() => setReason(value)}
            />
            {text}
          </label>
        ))}
      </fieldset>
      <label className="gp-report-comment">
        Details for the guide owner (optional)
        <textarea
          rows={2}
          maxLength={500}
          value={comment}
          placeholder="e.g. Coverage ended in September. No patient details."
          onChange={(e) => setComment(e.target.value)}
        />
      </label>
      <div className="gp-report-actions">
        <button type="submit" className="gp-btn primary" disabled={!reason}>
          Send report
        </button>
        <button type="button" className="gp-btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export function NudgeCard({
  r,
  onAsk,
  onAcknowledge,
  onUndoAcknowledge,
  acknowledged,
  onContacts,
  onReport,
  reported,
  onClose,
}: NudgeCardProps) {
  const [reporting, setReporting] = useState(false);
  const [receipt, setReceipt] = useState("");
  const stale = isStale(r);
  const status =
    r.primaryStatus === "hard_stop" && r.flags.includes("uncertain_requirement")
      ? "Required · may be out of date"
      : statusWord[r.primaryStatus] ?? label(r.primaryStatus);
  return (
    <article
      className={`gp-card card ${r.tier} ${r.primaryStatus}${stale ? " is-stale" : ""}${acknowledged ? " is-acknowledged" : ""}`}
      data-testid="nudge-card"
      data-field={r.anchor}
      data-status={r.primaryStatus}
      data-result={r.id}
    >
      <header className="gp-card-head">
        <span className={`gp-tier ${r.blocksCompletion ? "hard_stop" : r.tier}`}>
          {tierWord(r)}
        </span>
        <span className={`gp-status s-${r.primaryStatus}`}>{status}</span>
        {stale && r.primaryStatus !== "stale" && !status.includes("out of date") && (
          <span className="gp-status s-stale">Possibly out of date</span>
        )}
        {acknowledged && (
          <span className="gp-ack-badge">
            <Icon name="check" size={13} /> Acknowledged
          </span>
        )}
        {onClose && (
          <button
            type="button"
            className="gp-icon-btn"
            onClick={onClose}
            aria-label={`Close ${r.title}`}
          >
            <Icon name="close" size={16} />
          </button>
        )}
      </header>
      <h3>{r.title}</h3>
      <p className="card-answer">{stale ? withoutStaleNote(r.message) : r.message}</p>
      {/* What to do. Never hidden, never optional. */}
      <p className="card-action gp-next">
        <span>Next step</span>
        {stale ? withoutStaleNote(r.action) : r.action}
      </p>
      <SourceLine r={r} />
      {reported ? (
        <p className="gp-thanks" role="status">
          <Icon name="check" size={15} /> {receipt || "Report recorded; delivery is not confirmed here."}
        </p>
      ) : reporting && onReport ? (
        <ReportForm
          r={r}
          onCancel={() => setReporting(false)}
          onSend={(reason, comment) => {
            setReceipt("Sending report…");
            void onReport(r, reason, comment).then(setReceipt).catch(() => setReceipt("Report delivery could not be confirmed. Please try again."));
            setReporting(false);
          }}
        />
      ) : null}
      <div className="gp-actions">
        <button type="button" className="gp-btn" onClick={() => onAsk(r)}>
          <Icon name="chat" size={15} /> Ask about this
        </button>
        {needsAPerson(r) && onContacts && (
          <button
            type="button"
            className="gp-btn"
            onClick={() => onContacts(`${r.title} — ${status}`)}
          >
            <Icon name="phone" size={15} /> Call someone
          </button>
        )}
        {/* A hard stop is cleared at the Complete button, not here. */}
        {!r.blocksCompletion &&
          r.tier !== "info" &&
          onAcknowledge &&
          (acknowledged ? (
            <button
              type="button"
              className="gp-btn"
              onClick={() => onUndoAcknowledge?.(r)}
            >
              <Icon name="undo" size={15} /> Undo
            </button>
          ) : (
            <button
              type="button"
              className="gp-btn"
              onClick={() => onAcknowledge(r)}
              title="Marks this as seen for this encounter. It stays here, and won't open by itself again."
            >
              <Icon name="check" size={15} /> Got it
            </button>
          ))}
        {onReport && !reported && !reporting && (
          <button
            type="button"
            className="gp-btn subtle"
            onClick={() => setReporting(true)}
          >
            <Icon name="flag" size={15} /> This looks wrong
          </button>
        )}
      </div>
      <Evidence r={r} />
    </article>
  );
}

// One line per rule in the list under the open card. Clicking opens it.
export function NudgeRow({
  r,
  acknowledged,
  onOpen,
}: {
  r: Result;
  acknowledged?: boolean;
  onOpen: (r: Result) => void;
}) {
  const stale = isStale(r);
  return (
    <button
      type="button"
      className={`gp-row ${r.blocksCompletion ? "hard_stop" : r.tier}${stale ? " is-stale" : ""}${acknowledged ? " is-acknowledged" : ""}`}
      data-testid="reference-row"
      data-field={r.anchor}
      data-status={r.primaryStatus}
      onClick={() => onOpen(r)}
    >
      <span className="gp-dot" aria-hidden="true" />
      <span className="gp-row-text">
        <span className="gp-row-title">
          {r.title}
          <span className="sr-only"> · {tierWord(r)}</span>
          {stale && <span className="gp-row-flag stale">Verify</span>}
          {r.primaryStatus === "conflict" && (
            <span className="gp-row-flag conflict">Disagree</span>
          )}
          {r.primaryStatus === "time_dependent" && (
            <span className="gp-row-flag time">Time</span>
          )}
          {r.primaryStatus === "not_in_guide" && (
            <span className="gp-row-flag absent">Not in guide</span>
          )}
          {acknowledged && <span className="gp-row-flag ack">✓ Noted</span>}
        </span>
        <span className="gp-row-line">
          {stale ? withoutStaleNote(r.message) : r.message}
        </span>
      </span>
      <Icon name="right" size={16} />
    </button>
  );
}
