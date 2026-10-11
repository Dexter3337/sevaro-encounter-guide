import type { Context, Hospital, Result } from "../domain";

// Machine 2 owns this file. Machine 3 created it so the mount point and the
// prop signature exist; the signature is frozen for the sprint.
export interface ChatPanelProps {
  open: boolean;
  hospital: Hospital;
  context: Context;
  /** The nudge the doctor clicked, if they arrived from one. */
  seed?: Result;
  onClose: () => void;
  onContacts: (reason: string) => void;
}

export function ChatPanel(_props: ChatPanelProps) {
  return null;
}
