import type { Contact } from "../domain";

// Machine 2 owns this file. Machine 3 created it so the mount point and the
// prop signature exist; the signature is frozen for the sprint.
export interface ContactsSheetProps {
  open: boolean;
  hospitalId: string;
  contacts: Contact[];
  /** ISO instant, for working out who is available now. */
  instant: string;
  /** The hospital's IANA zone. Availability is read in its time, not ours. */
  timezone: string;
  /** Why the doctor was sent here, e.g. "Guide doesn't cover note title". */
  reason?: string;
  onClose: () => void;
}

export function ContactsSheet(_props: ContactsSheetProps) {
  return null;
}
