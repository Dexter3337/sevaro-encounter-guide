import type { Result } from "../domain";
import { nudgePriority } from "../engine";

// A chip on the field's own label: there is guidance for this field. Clicking
// it opens that rule in the guide column, every time.
export function FieldMarker({
  results,
  fieldLabel,
  onOpen,
  acknowledged = () => false,
}: {
  results: Result[];
  fieldLabel: string;
  onOpen: (resultId: string) => void;
  acknowledged?: (r: Result) => boolean;
}) {
  if (!results.length) return null;
  const top = results[0];
  const tier = top.blocksCompletion
    ? "hard_stop"
    : nudgePriority(top) >= 50
      ? "advisory"
      : "info";
  const noted = tier !== "hard_stop" && results.every(acknowledged);
  const stale = results.some(
    (r) => r.primaryStatus === "stale" || r.flags.includes("stale"),
  );
  const word = top.blocksCompletion
    ? "Required"
    : tier === "advisory"
      ? "Advisory"
      : "Info";
  return (
    <button
      type="button"
      className={`field-marker ${tier}${noted ? " noted" : ""}${stale ? " stale" : ""}`}
      data-testid="field-marker"
      // Keep the field's focus handlers from treating this click as a blur.
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => onOpen(top.id)}
      aria-label={`${word} guidance for ${fieldLabel}. ${results.length} item${results.length > 1 ? "s" : ""}. Shows it in the guide panel.`}
    >
      <span className="field-marker-dot" aria-hidden="true" />
      {noted ? "✓ " : ""}
      {word}
      {results.length > 1 && (
        <span className="field-marker-count">{results.length}</span>
      )}
    </button>
  );
}
