import type { Result } from "../domain";

// The contract between the dock and everything around it. Frozen for the
// sprint: Machine 2 builds the chat and contacts panels against these, so a
// change here needs both owners to agree.

export interface NudgeDockProps {
  /** Already ranked by the engine, most important first. */
  results: Result[];
  /** The caselog field the doctor is in, if any. Its guidance is shown first. */
  focusedFieldId?: string;
  fieldLabels: Record<string, string>;
  /** Opens the chat panel seeded with this nudge. */
  onAsk: (r: Result) => void;
  /** Hides an advisory for the rest of this encounter. */
  onAcknowledge: (r: Result) => void;
  /** Opens the contacts sheet; the reason is shown as context. */
  onContacts: (reason: string) => void;
  /** The doctor says this nudge looks wrong. */
  onReport: (r: Result) => void;
  /** Guidance could not be loaded; the caselog still works. */
  unavailable?: boolean;
}

export interface NudgeCardProps {
  r: Result;
  onAsk: (r: Result) => void;
  onAcknowledge?: (r: Result) => void;
  onContacts?: (reason: string) => void;
  onReport?: (r: Result) => void;
}
