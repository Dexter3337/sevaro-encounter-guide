import type { Contact } from "../domain";
import { localTime } from "../domain";
import { ageDays, matchWindow, scheduleNotes, untilOpen, windows } from "../time";

// The three people a teleneurologist calls when the guide runs out, in the
// order they are shown. A hospital may list more roles; those follow.
export const ROLES = [
  ["technical_lead", "Technical lead"],
  ["nursing_in_charge", "Nursing in charge"],
  ["administrator", "Administrator"],
] as const;
export const roleLabel = (role: string) =>
  ROLES.find(([r]) => r === role)?.[1] ??
  role.replaceAll("_", " ").replace(/^\w/, (c) => c.toUpperCase());

// Only this hospital's people, ever — even if the caller hands over more.
export const contactsFor = (hospitalId: string, contacts: Contact[]) =>
  contacts.filter((c) => c.hospitalId === hospitalId);

export type Availability = {
  state: "available" | "opens_later" | "closed" | "unknown";
  label: string;
};
const duration = (m: number) =>
  m < 60
    ? `${m} minute${m === 1 ? "" : "s"}`
    : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}`;
// Read in the hospital's time, with the same schedule reader the engine uses.
// Hours the directory does not define are never guessed at.
export function availabilityAt(
  text: string | undefined,
  instant: string,
  zone: string,
): Availability {
  const ws = text ? windows(text) : [];
  if (!ws.length)
    return { state: "unknown", label: "Hours not listed — call to check" };
  // We have no holiday calendar, so "except holidays" stays a stated unknown.
  const holidays = scheduleNotes(text!).includes("holidays_unknown")
    ? " — except holidays, which aren't listed; call to check on one"
    : "";
  if (matchWindow(ws, instant, zone))
    return { state: "available", label: `Available now${holidays}` };
  const m = untilOpen(ws, instant, zone);
  if (m !== undefined) {
    const opens = localTime(instant, zone)
      .add({ minutes: m })
      .toPlainTime()
      .toString({ smallestUnit: "minute" });
    return {
      state: "opens_later",
      label: `Opens in ${duration(m)} (${opens} ${zoneName(instant, zone)})${holidays}`,
    };
  }
  if (scheduleNotes(text!).includes("conditional_cover"))
    return {
      state: "unknown",
      label: "Outside listed hours; other cover is not defined — call to check",
    };
  return { state: "closed", label: "Outside listed hours" };
}
export function zoneName(instant: string, zone: string) {
  try {
    return (
      new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "short" })
        .formatToParts(new Date(instant))
        .find((p) => p.type === "timeZoneName")?.value ?? zone
    );
  } catch {
    return zone;
  }
}
// Same rule as every guide source: more than 180 days old is out of date.
export function verification(
  lastVerified: string | undefined,
  instant: string,
  zone: string,
): { stale: boolean; label: string } {
  if (!lastVerified)
    return { stale: true, label: "Verification date unknown — confirm the number" };
  return ageDays(lastVerified, instant, zone) > 180
    ? {
        stale: true,
        label: `Contact details may be out of date (verified ${lastVerified})`,
      }
    : { stale: false, label: `Verified ${lastVerified}` };
}
