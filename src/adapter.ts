import { Temporal } from "@js-temporal/polyfill";
import {
  localTime,
  localInstant,
  type Hospital,
  type Context,
  freshContext,
} from "./domain";
export const adapterVersion = "mock-1.0";
// Boundary adapter for external synthetic encounter contexts. Never a production Synapse claim.
export function importEncounterContext(
  raw: Record<string, unknown>,
  h: Hospital,
): Context {
  if (raw.hospital_id !== h.id)
    throw new Error("External encounter hospital does not match guide.");
  const zone = String(raw.local_timezone || h.timezone);
  if (zone !== h.timezone)
    throw new Error("Context zone differs from hospital guide.");
  const local = typeof raw.local_time === "string" ? raw.local_time : undefined;
  let instant =
    typeof raw.instant === "string"
      ? Temporal.Instant.from(raw.instant).toString()
      : local
        ? localInstant(local, zone)
        : undefined;
  if (!instant)
    throw new Error(
      "Explicit instant or unambiguous local date/time required.",
    );
  if (
    local &&
    localTime(instant, zone).toPlainDateTime().toString() !==
      Temporal.PlainDateTime.from(local).toString()
  )
    throw new Error(
      "Supplied offset instant and stated hospital-local time disagree.",
    );
  const c = freshContext(h);
  c.instant = instant;
  c.consultType = String(raw.consult_type || "Stroke");
  c.encounterType = String(raw.encounter_type || "Acute");
  return c;
}
