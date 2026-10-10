import { Temporal } from "@js-temporal/polyfill";
import {
  localTime,
  localInstant,
  type Hospital,
  type Context,
  freshContext,
  steps,
  registry,
  known,
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
        ? /(?:Z|[+-]\d{2}:\d{2})$/i.test(local)
          ? Temporal.Instant.from(local).toString()
          : localInstant(local, zone)
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
  if (raw.provider_timezone !== undefined) {
    if (typeof raw.provider_timezone !== "string")
      throw new Error("Invalid provider timezone.");
    Temporal.Now.zonedDateTimeISO(raw.provider_timezone);
    c.providerZone = raw.provider_timezone;
  }
  if (raw.caselog_step !== undefined) {
    const step = String(raw.caselog_step).toLowerCase().replace(/[ -]+/g, "_");
    if (!steps.includes(step as Context["step"]))
      throw new Error("Unknown caselog step.");
    c.step = step as Context["step"];
  }
  for (const field of ["charge_entered", "plan_confirmed"]) {
    if (raw[field] !== undefined) {
      if (typeof raw[field] !== "boolean")
        throw new Error(`${field} must be Boolean.`);
      c.values[field] = known(raw[field]);
    }
  }
  if (raw.field_event !== undefined) {
    const event = raw.field_event as Record<string, unknown> | null;
    if (!event || typeof event !== "object" || Array.isArray(event))
      throw new Error("Invalid field event.");
    const field = registry.find((f) => f.id === event.field);
    if (!field) throw new Error("Unknown encounter field.");
    if (
      field.type === "tri"
        ? typeof event.value !== "boolean"
        : typeof event.value !== "string"
    )
      throw new Error("Invalid field event value.");
    if (field.options && !field.options.includes(String(event.value)))
      throw new Error("Invalid field option.");
    c.values[field.id] = known(event.value);
  }
  return c;
}
