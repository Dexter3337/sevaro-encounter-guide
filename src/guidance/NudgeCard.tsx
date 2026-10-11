import type { Result } from "../domain";
import type { NudgeCardProps } from "./types";

const label = (s: string) =>
  s.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());

// The handbook asks four things of every nudge: what the rule is, where it came
// from, how sure we are, and what the doctor should do. All four are on the
// card, and none of them is behind a disclosure.

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
        <small>Evaluated instant {r.effectiveInstant}</small>
      </div>
    </details>
  );
}

// Why this nudge is on screen at all. A doctor who disagrees with a nudge
// should be able to see what triggered it rather than guess.
function WhyShown({ r }: { r: Result }) {
  const source = r.citations[0];
  return (
    <details className="why-shown">
      <summary>Why am I seeing this?</summary>
      <p>
        {r.anchor
          ? `This hospital's "${r.title}" rule applies to the field you are on.`
          : `This hospital's "${r.title}" rule applies at this step.`}{" "}
        {source
          ? `Taken from ${source.hospitalId}'s guide, ${source.field}, ${source.lastVerified ? `verified ${source.lastVerified}` : source.updatedAt ? `updated ${source.updatedAt}` : "date unknown"}.`
          : "No source record carries this field for this hospital."}
      </p>
    </details>
  );
}

const needsAPerson = (r: Result) =>
  r.primaryStatus === "not_in_guide" ||
  r.primaryStatus === "conflict" ||
  r.flags.includes("schedule_unknown") ||
  r.flags.includes("interpretation_review") ||
  r.flags.includes("uncertain_requirement");

export function NudgeCard({
  r,
  onAsk,
  onAcknowledge,
  onContacts,
  onReport,
}: NudgeCardProps) {
  return (
    <article
      className={`card ${r.tier} ${r.primaryStatus}`}
      data-testid="nudge-card"
      data-field={r.anchor}
      data-status={r.primaryStatus}
    >
      <div className="card-meta">
        <span>{label(r.tier)}</span>
        <span className="status">{label(r.primaryStatus)}</span>
      </div>
      <h3>{r.title}</h3>
      <p className="card-answer">{r.message}</p>
      {/* The fourth question. Never hidden, never optional. */}
      <p className="card-action">
        <span>Do</span>
        {r.action}
      </p>
      <div className="flags">
        {r.flags
          .filter((x) => x !== r.primaryStatus)
          .map((f) => (
            <span key={f}>{label(f)}</span>
          ))}
      </div>
      <small>
        {r.hospitalId} · {r.version}
      </small>
      <small className="evaluated-time">
        Evaluated {r.effectiveLocal || r.effectiveInstant}
      </small>
      <Evidence r={r} />
      <WhyShown r={r} />
      <div className="card-actions">
        <button className="link" onClick={() => onAsk(r)}>
          Ask about this
        </button>
        {needsAPerson(r) && onContacts && (
          <button
            className="link"
            onClick={() => onContacts(`${r.title} — ${label(r.primaryStatus)}`)}
          >
            Call someone
          </button>
        )}
        {/* A hard stop is cleared at the Complete button, not here. */}
        {!r.blocksCompletion && r.tier === "advisory" && onAcknowledge && (
          <button className="link" onClick={() => onAcknowledge(r)}>
            Acknowledge for this encounter
          </button>
        )}
        {onReport && (
          <button className="link subtle" onClick={() => onReport(r)}>
            This looks wrong
          </button>
        )}
      </div>
    </article>
  );
}

// Reference material: one line until the doctor opens it. Caveats that change
// how the line should be read stay visible on the closed row.
const caveats = [
  "stale",
  "time_dependent",
  "interpretation_review",
  "schedule_unknown",
  "holidays_unknown",
  "possible_conflict",
  "storyboard_only",
];

export function ReferenceRow({ r, onAsk }: { r: Result; onAsk: (r: Result) => void }) {
  const shown = [
    ...(r.primaryStatus === "not_in_guide" ? ["not_documented"] : []),
    ...r.flags.filter((f) => caveats.includes(f)),
  ];
  return (
    <details className="reference-row" data-testid="reference-row" data-field={r.anchor}>
      <summary>
        <span className="reference-head">
          <span className="reference-title">{r.title}</span>
          {shown.map((f) => (
            <span key={f} className={`reference-flag ${f}`}>
              {label(f)}
            </span>
          ))}
        </span>
        <span className="reference-line">{r.message}</span>
      </summary>
      <div className="reference-body">
        <p>{r.message}</p>
        <p className="card-action">
          <span>Do</span>
          {r.action}
        </p>
        <small>
          {r.hospitalId} · {r.version} · Evaluated{" "}
          {r.effectiveLocal || r.effectiveInstant}
        </small>
        <Evidence r={r} />
        <button className="link" onClick={() => onAsk(r)}>
          Ask about this
        </button>
      </div>
    </details>
  );
}
