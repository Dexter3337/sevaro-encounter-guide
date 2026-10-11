import type { LiveStatusReport } from "../domain";

// Live operational status from the hospital — CT scanner down, ED on
// diversion. Not wired up in this sprint: an empty list means "no report",
// which the engine must never read as "operational".
export function useLiveStatus(_hospitalId: string): LiveStatusReport[] {
  return [];
}
