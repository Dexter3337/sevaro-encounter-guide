import type { Result } from "../domain";

export type ReportReason =
  | "outdated"
  | "wrong_field"
  | "wrong_time"
  | "not_applicable"
  | "other";

export type GuideMode = "guidance" | "chat" | "contacts";

// The contract between the guide column and the page around it.
export interface GuidePanelProps {
  /** Already ranked by the engine, most important first. */
  results: Result[];
  /** Signatures the doctor acknowledged for this encounter. Still shown. */
  acknowledged: string[];
  /** Results the doctor reported as looking wrong, by id. */
  reported: string[];
  /** The caselog field the doctor is in, if any. Its guidance is shown first. */
  focusedFieldId?: string;
  fieldLabels: Record<string, string>;
  hospitalName: string;
  /** Opens the chat seeded with this nudge. */
  onAsk: (r: Result) => void;
  onAcknowledge: (r: Result) => void;
  onUndoAcknowledge: (r: Result) => void;
  /** Opens the contacts view; the reason is shown as context. */
  onContacts: (reason: string) => void;
  /** The doctor says this nudge looks wrong, and why. */
  onReport: (r: Result, reason: ReportReason, comment: string) => void;
  /** Guidance could not be loaded; the caselog still works. */
  unavailable?: boolean;
  /** A field marker or the storyboard asked to show a result. New nonce, new request. */
  openRequest?: { resultId?: string; nonce: number };
  /** Shown above the guidance list. */
  storyboard?: React.ReactNode;
}

export interface NudgeCardProps {
  r: Result;
  onAsk: (r: Result) => void;
  onAcknowledge?: (r: Result) => void;
  onUndoAcknowledge?: (r: Result) => void;
  acknowledged?: boolean;
  onContacts?: (reason: string) => void;
  onReport?: (r: Result, reason: ReportReason, comment: string) => void;
  reported?: boolean;
  /** Folds the card back into the list. */
  onClose?: () => void;
}
