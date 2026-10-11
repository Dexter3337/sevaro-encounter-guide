import { useState } from "react";
import type { Context, Hospital, Source } from "../domain";
import { answerField } from "../engine";
import { clean, scoped } from "../knowledge";
import { ageDays } from "../time";

// Machine 2 owns this file. Machine 3 created it and mounts it beneath the
// context header; the signature is frozen for the sprint.
export interface StoryboardCardProps {
  hospital: Hospital;
  context: Context;
  /** Opens the dock on the entry for a field whose sources disagree. */
  onOpenConflict: (field: string) => void;
}

export type StoryboardVerdict =
  | "conflict"
  | "possible_conflict"
  | "agrees"
  | "storyboard_only"
  | "unavailable";
export type StoryboardRow = {
  source: Source;
  verdict: StoryboardVerdict;
  /** The guide's value for this consult, shown beside a disagreement. */
  guide?: string;
  age?: number;
  stale: boolean;
};
// The verdict is the engine's, read from the result it already gives the dock:
// the same comparison, the same scope rules (Bluewater's Video Eval Location
// conflicts for a stroke alert and agrees for a general consult). Nothing here
// compares values. The storyboard's own `note` column is never read.
export function storyboardRows(h: Hospital, c: Context): StoryboardRow[] {
  return h.fields
    .filter((s) => s.sourceKind === "storyboard")
    .map((source) => {
      const age = source.updatedAt
        ? ageDays(source.updatedAt, c.instant, h.timezone)
        : undefined;
      const stale = age === undefined || age > 180;
      try {
        const r = answerField(h, c, source.field);
        const guide = r.citations.find((s) => s.sourceKind === "guide");
        const verdict: StoryboardVerdict =
          r.primaryStatus === "conflict"
            ? r.flags.includes("possible_conflict")
              ? "possible_conflict"
              : "conflict"
            : r.flags.includes("storyboard_only")
              ? "storyboard_only"
              : r.flags.includes("second_source_agrees")
                ? "agrees"
                : "unavailable";
        return {
          source,
          verdict,
          guide: guide && scoped(clean(guide.raw), c.consultType),
          age,
          stale,
        };
      } catch {
        // A failure here must never take the caselog with it.
        return { source, verdict: "unavailable" as const, age, stale };
      }
    });
}
const updated = (row: StoryboardRow) =>
  row.source.updatedAt
    ? `Updated ${row.source.updatedAt} · ${row.age} days ago${row.stale ? " · may be out of date" : ""}`
    : "Update date unknown";

function Row({
  row,
  onOpenConflict,
}: {
  row: StoryboardRow;
  onOpenConflict: (field: string) => void;
}) {
  const { source, verdict } = row;
  const differs = verdict === "conflict" || verdict === "possible_conflict";
  return (
    <li
      className={`storyboard-row ${verdict}`}
      data-testid="storyboard-row"
      data-field={source.field}
      data-verdict={verdict}
    >
      <div className="storyboard-line">
        <span className="storyboard-field">{source.field}</span>
        <span className="storyboard-value">{source.raw}</span>
        <span className="storyboard-mark">
          {differs ? (
            <span aria-hidden="true">⚠</span>
          ) : verdict === "agrees" ? (
            <span aria-hidden="true">✓</span>
          ) : null}
          <span className={verdict === "agrees" ? "sr-only" : "storyboard-verdict"}>
            {verdict === "conflict"
              ? "Differs from the guide"
              : verdict === "possible_conflict"
                ? "May differ from the guide"
                : verdict === "agrees"
                  ? "Matches the guide"
                  : verdict === "storyboard_only"
                    ? "Not in the guide — storyboard only"
                    : "Not checked"}
          </span>
        </span>
      </div>
      {differs && (
        <div className="storyboard-conflict">
          <p>Guide says: {row.guide}</p>
          <button
            type="button"
            className="link"
            onClick={() => onOpenConflict(source.field)}
          >
            See both sources
          </button>
        </div>
      )}
      <small className={row.stale ? "storyboard-stale" : "muted"}>
        {updated(row)}
      </small>
    </li>
  );
}

export function StoryboardCard({
  hospital,
  context,
  onOpenConflict,
}: StoryboardCardProps) {
  // Folded to one line unless a field disagrees with the guide: the doctor
  // needs to see a disagreement, not a list of notes that agree. Their choice
  // is remembered for this encounter only.
  const [fold, setFold] = useState<{ key: string; collapsed?: boolean }>({
    key: context.id,
  });
  const rows = storyboardRows(hospital, context);
  if (!rows.length) return null;
  const newest = rows
    .filter((r) => r.source.updatedAt)
    .sort((a, b) => (a.age ?? 0) - (b.age ?? 0))[0];
  const differing = rows.filter(
    (r) => r.verdict === "conflict" || r.verdict === "possible_conflict",
  ).length;
  const collapsed =
    fold.key === context.id && fold.collapsed !== undefined
      ? fold.collapsed
      : differing === 0;
  return (
    <section
      className="storyboard-card"
      aria-label={`Hospital storyboard for ${hospital.name}`}
      data-testid="storyboard-card"
    >
      <header className="storyboard-head">
        <div>
          <p className="eyebrow">Storyboard notes · {rows.length}</p>
          <small className={newest?.stale ? "storyboard-stale" : "muted"}>
            {newest ? updated(newest) : "Update date unknown"}
            {differing
              ? ` · ${differing} ${differing === 1 ? "field differs" : "fields differ"} from the guide`
              : ""}
          </small>
        </div>
        <button
          type="button"
          className="link"
          aria-expanded={!collapsed}
          onClick={() => setFold({ key: context.id, collapsed: !collapsed })}
        >
          {collapsed ? "Show" : "Hide"}
        </button>
      </header>
      <ul className="storyboard-rows" hidden={collapsed}>
        {rows.map((row) => (
          <Row key={row.source.id} row={row} onOpenConflict={onOpenConflict} />
        ))}
      </ul>
    </section>
  );
}
