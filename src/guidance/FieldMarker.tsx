import type { Result } from "../domain";
import { nudgePriority } from "../engine";

const label = (s: string) =>
  s.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());

// The dock sits in a corner, which is easy to overlook when your eyes are on
// the form. This marker sits on the field's own label and says, quietly, that
// there is something here — and takes the doctor straight to it.
export function FieldMarker({
  results,
  fieldLabel,
  onOpen,
}: {
  results: Result[];
  fieldLabel: string;
  onOpen: (resultId: string) => void;
}) {
  if (!results.length) return null;
  const top = results[0];
  const tier = top.blocksCompletion
    ? "hard_stop"
    : nudgePriority(top) >= 50
      ? "advisory"
      : "info";
  const word = top.blocksCompletion
    ? "Required"
    : tier === "advisory"
      ? "Advisory"
      : "Info";
  return (
    <button
      type="button"
      className={`field-marker ${tier}`}
      data-testid="field-marker"
      onClick={() => onOpen(top.id)}
      aria-label={`${word} guidance for ${fieldLabel}. ${results.length} item${results.length > 1 ? "s" : ""}. Opens the guidance panel.`}
    >
      <span className="field-marker-dot" aria-hidden="true" />
      {word}
      {results.length > 1 && <span className="field-marker-count">{results.length}</span>}
    </button>
  );
}
