import type { Context, Hospital } from "../domain";

// Machine 2 owns this file. Machine 3 created it and mounts it beneath the
// context header; the signature is frozen for the sprint.
export interface StoryboardCardProps {
  hospital: Hospital;
  context: Context;
  /** Opens the dock on the entry for a field whose sources disagree. */
  onOpenConflict: (field: string) => void;
}

export function StoryboardCard(_props: StoryboardCardProps) {
  return null;
}
