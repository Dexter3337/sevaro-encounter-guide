import { z } from "zod";
import { Temporal } from "@js-temporal/polyfill";

export const steps = [
  "intake",
  "history",
  "imaging",
  "recommendation",
  "note",
  "sign_off",
  "rounding",
] as const;
export type Step = (typeof steps)[number];
export type Status =
  | "answered"
  | "not_in_guide"
  | "time_dependent"
  | "stale"
  | "conflict"
  | "hard_stop";
export type Tier = "info" | "advisory" | "hard_stop";
export type Known =
  | { state: "known"; value: unknown }
  | { state: "unknown" }
  | { state: "not_applicable"; reason?: string };
export type Context = {
  id: string;
  hospitalId: string;
  guideVersion: string;
  consultType: string;
  encounterType: string;
  step: Step;
  instant: string;
  providerZone: string;
  revision: number;
  values: Record<string, Known>;
};
export type Event = {
  id: string;
  encounterId: string;
  revision: number;
  type:
    | "encounter_opened"
    | "step_changed"
    | "field_changed"
    | "field_focused"
    | "completion_requested"
    | "clock_changed"
    | "guide_changed";
  fieldId?: string;
  value?: Known;
  occurredAt: string;
};
export const sourceSchema = z
  .object({
    id: z.string().min(1).max(180),
    hospitalId: z.string().min(1),
    field: z.string().min(1).max(200),
    raw: z.string().max(12000),
    sourceKind: z.enum(["guide", "storyboard"]).default("guide"),
    sourceName: z.string().default("Synthetic import"),
    version: z.string().min(1),
    lastVerified: z.string().optional(),
    updatedAt: z.string().optional(),
    locator: z.string().optional(),
    aliases: z.array(z.string().max(200)).max(20).optional(),
  })
  .passthrough();
export type Source = z.infer<typeof sourceSchema>;
export const predicateSchema: z.ZodType<Predicate> = z.lazy(() =>
  z.discriminatedUnion("op", [
    z.object({
      op: z.literal("equals"),
      field: z.string(),
      value: z.union([z.string(), z.boolean(), z.number()]),
    }),
    z.object({ op: z.literal("exists"), field: z.string() }),
    z.object({
      op: z.literal("in"),
      field: z.string(),
      values: z.array(z.union([z.string(), z.boolean(), z.number()])).max(30),
    }),
    z.object({ op: z.literal("not"), condition: predicateSchema }),
    z.object({
      op: z.enum(["all", "any"]),
      conditions: z.array(predicateSchema).max(20),
    }),
  ]),
);
export type Predicate =
  | { op: "equals"; field: string; value: string | boolean | number }
  | { op: "exists"; field: string }
  | { op: "in"; field: string; values: (string | boolean | number)[] }
  | { op: "not"; condition: Predicate }
  | { op: "all" | "any"; conditions: Predicate[] };
export const mappingSchema = z
  .object({
    id: z.string().min(1),
    fieldId: z.string().min(1),
    label: z.string().min(1),
    step: z.enum(steps),
    sourceField: z.string().min(1),
    condition: predicateSchema,
    tier: z.enum(["info", "advisory"]).default("info"),
  })
  .strict();
export type Mapping = z.infer<typeof mappingSchema>;
export const hospitalSchema = z
  .object({
    id: z.string().min(1).max(100),
    name: z.string().min(1).max(200),
    timezone: z.string(),
    version: z.string().min(1).max(100),
    fields: z.array(sourceSchema).max(500),
    mappings: z.array(mappingSchema).max(50).optional(),
  })
  .passthrough();
export type Hospital = z.infer<typeof hospitalSchema>;
export type Result = {
  id: string;
  hospitalId: string;
  version: string;
  title: string;
  message: string;
  primaryStatus: Status;
  flags: string[];
  tier: Tier;
  citations: Source[];
  missingEvidence?: {
    hospitalId: string;
    version: string;
    field: string;
    absent: boolean;
  };
  rationale: string;
  effectiveInstant: string;
  effectiveLocal?: string;
  blocksCompletion: boolean;
  missingRequirements: string[];
  anchor?: string;
};
export type Field = {
  id: string;
  label: string;
  step: Step;
  type: "text" | "textarea" | "tri" | "select" | "datetime";
  options?: string[];
};
export const registry: Field[] = [
  {
    id: "reason_for_consult",
    label: "Reason for consult",
    step: "intake",
    type: "textarea",
  },
  {
    id: "last_known_well_status",
    label: "Last known well",
    step: "history",
    type: "select",
    options: ["Known", "Unknown"],
  },
  {
    id: "last_known_well_time",
    label: "Last known well time",
    step: "history",
    type: "datetime",
  },
  { id: "allergies", label: "Allergies", step: "history", type: "text" },
  { id: "cta_done", label: "CTA done", step: "imaging", type: "tri" },
  {
    id: "lvo_present",
    label: "Large vessel occlusion present",
    step: "imaging",
    type: "tri",
  },
  {
    id: "thrombolytic_given",
    label: "Thrombolytic given",
    step: "recommendation",
    type: "tri",
  },
  {
    id: "thrombolytic_order_placed",
    label: "Thrombolytic order placed in EHR",
    step: "recommendation",
    type: "tri",
  },
  {
    id: "assessment_plan",
    label: "Assessment / plan",
    step: "recommendation",
    type: "textarea",
  },
  { id: "note_title", label: "Note title", step: "note", type: "text" },
  { id: "note_body", label: "Note body", step: "note", type: "textarea" },
  {
    id: "charge_entered",
    label: "Encounter charge recorded",
    step: "sign_off",
    type: "tri",
  },
  {
    id: "plan_confirmed",
    label: "Hospital provider confirmed patient plan",
    step: "sign_off",
    type: "tri",
  },
  {
    id: "rounding_order_intent",
    label: "Rounding order intent",
    step: "rounding",
    type: "textarea",
  },
];
export const registryVersion = "1.0";
export const known = (value: unknown): Known => ({ state: "known", value });
export function value(c: Context, id: string) {
  const x = c.values[id];
  return x?.state === "known" ? x.value : undefined;
}
export type Truth = true | false | "unknown";
export function predicate(p: Predicate, c: Context): Truth {
  if (p.op === "not") {
    const r = predicate(p.condition, c);
    return r === "unknown" ? r : !r;
  }
  if (p.op === "all" || p.op === "any") {
    const rs = p.conditions.map((x) => predicate(x, c));
    return p.op === "all"
      ? rs.includes(false)
        ? false
        : rs.includes("unknown")
          ? "unknown"
          : true
      : rs.includes(true)
        ? true
        : rs.includes("unknown")
          ? "unknown"
          : false;
  }
  if (!("field" in p)) return "unknown";
  const v = value(c, p.field);
  if (p.op === "exists") return v !== undefined;
  if (v === undefined) return "unknown";
  if (p.op === "equals") return v === p.value;
  if (p.op === "in") return p.values.includes(v as string);
  return "unknown";
}
export function freshContext(h: Hospital, local = "2026-03-17T14:00"): Context {
  return {
    id: crypto.randomUUID(),
    hospitalId: h.id,
    guideVersion: h.version,
    consultType: "Stroke",
    encounterType: "Acute",
    step: "intake",
    instant: localInstant(local, h.timezone),
    providerZone: "America/New_York",
    revision: 0,
    values: {},
  };
}
export function localInstant(local: string, zone: string) {
  return Temporal.PlainDateTime.from(local)
    .toZonedDateTime(zone, { disambiguation: "reject" })
    .toInstant()
    .toString();
}
export function localTime(instant: string, zone: string) {
  return Temporal.Instant.from(instant).toZonedDateTimeISO(zone);
}
export function reduceEvent(c: Context, e: Event): Context {
  if (e.encounterId !== c.id || e.revision !== c.revision + 1)
    throw new Error("Rejected event: encounter/revision mismatch");
  return {
    ...c,
    revision: e.revision,
    values:
      e.type === "field_changed" && e.fieldId
        ? { ...c.values, [e.fieldId]: e.value ?? { state: "unknown" } }
        : c.values,
  };
}
export function makeEvent(
  c: Context,
  type: Event["type"],
  fieldId?: string,
  val?: Known,
): Event {
  return {
    id: crypto.randomUUID(),
    encounterId: c.id,
    revision: c.revision + 1,
    type,
    fieldId,
    value: val,
    occurredAt: c.instant,
  };
}
