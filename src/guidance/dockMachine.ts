import type { Result } from "../domain";
import { nudgePriority, resultSignature } from "../engine";

// Nudge fatigue is the main design risk the brief names: with 80+ rules per
// hospital, showing everything trains doctors to ignore all of it. This decides
// how much of the dock is on screen, and it is deliberately reluctant to open
// itself. Kept apart from React so the rules can be tested directly.

export type DockState = "hidden" | "pill" | "peek" | "panel";

export type DockModel = {
  state: DockState;
  /** Signatures the doctor has already had on screen in an open panel. */
  seen: string[];
  /** Set when the doctor closes the panel; cleared when something new arrives. */
  collapsedByDoctor: boolean;
  /** Scroll the panel to this result when it next renders. */
  focusResultId?: string;
};

export type DockEvent =
  | { type: "RESULTS"; results: Result[] }
  | { type: "FIELD_FOCUS"; results: Result[] }
  | { type: "FIELD_BLUR" }
  | { type: "TOGGLE" }
  | { type: "COLLAPSE" }
  | { type: "OPEN"; resultId?: string };

export const initialDock: DockModel = {
  state: "hidden",
  seen: [],
  collapsedByDoctor: false,
};

const isCard = (r: Result) => nudgePriority(r) >= 50;

export function dockReducer(model: DockModel, event: DockEvent): DockModel {
  switch (event.type) {
    case "RESULTS": {
      if (!event.results.length)
        return { ...model, state: "hidden", focusResultId: undefined };

      // The engine marks at most one result per event as worth opening for,
      // and never an info one. We additionally require that the doctor has not
      // already seen it in an open panel, so re-evaluating the same encounter
      // does not keep reopening the same card while they type.
      const opener = event.results.find(
        (r) => r.autoExpand && !model.seen.includes(resultSignature(r)),
      );

      if (opener)
        return {
          state: "panel",
          seen: [...model.seen, ...openSignatures(event.results)],
          collapsedByDoctor: false,
          focusResultId: opener.id,
        };

      // Nothing new enough to interrupt. Keep whatever is on screen, but never
      // drop back below a pill while results exist.
      return {
        ...model,
        state: model.state === "hidden" ? "pill" : model.state,
        seen:
          model.state === "panel"
            ? [...model.seen, ...openSignatures(event.results)]
            : model.seen,
        focusResultId: undefined,
      };
    }

    case "FIELD_FOCUS": {
      if (!event.results.length)
        return { ...model, state: model.state === "panel" ? "panel" : "hidden" };
      // Focusing a field is the doctor looking, not the system interrupting.
      // Anything needing action opens; reference material only peeks.
      const actionable = event.results.some(isCard);
      if (model.state === "panel") return model;
      if (actionable && !model.collapsedByDoctor)
        return {
          ...model,
          state: "panel",
          seen: [...model.seen, ...openSignatures(event.results)],
        };
      return { ...model, state: "peek" };
    }

    case "FIELD_BLUR":
      return model.state === "peek" ? { ...model, state: "pill" } : model;

    case "TOGGLE":
      return model.state === "panel"
        ? { ...model, state: "pill", collapsedByDoctor: true }
        : { ...model, state: "panel", collapsedByDoctor: false };

    case "COLLAPSE":
      return model.state === "panel"
        ? { ...model, state: "pill", collapsedByDoctor: true, focusResultId: undefined }
        : model;

    case "OPEN":
      return {
        ...model,
        state: "panel",
        collapsedByDoctor: false,
        focusResultId: event.resultId,
      };
  }
}

const openSignatures = (results: Result[]) => results.map(resultSignature);

/** What the collapsed pill says. Counts, and the loudest tier present. */
export function pillSummary(results: Result[]) {
  const hardStop = results.filter((r) => r.blocksCompletion).length;
  const advisory = results.filter(
    (r) => !r.blocksCompletion && isCard(r),
  ).length;
  const info = results.length - hardStop - advisory;
  const tier = hardStop ? "hard_stop" : advisory ? "advisory" : "info";
  const parts = [
    hardStop && `${hardStop} required`,
    advisory && `${advisory} advisory`,
    info && `${info} for reference`,
  ].filter(Boolean) as string[];
  return { tier, label: parts.join(" · "), count: results.length };
}

/**
 * The focused field's guidance first, then everything else in the engine's
 * order. The doctor is looking at one field; that field's rules are what they
 * need, and burying them under a higher-priority rule for a different field
 * would be answering a question they did not ask.
 */
export function orderForField(results: Result[], focusedFieldId?: string) {
  if (!focusedFieldId) return results;
  const mine = results.filter((r) => r.anchor === focusedFieldId);
  return mine.length ? [...mine, ...results.filter((r) => !mine.includes(r))] : results;
}
