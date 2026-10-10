import { z } from "zod";
import { type Context, type Known, known } from "./domain";

const candidateSchema = z
  .object({
    id: z.string().min(1),
    fieldId: z.enum(["last_known_well_status", "cta_done", "lvo_present"]),
    value: z.union([z.boolean(), z.literal("Unknown"), z.literal("Known")]),
    speaker: z.enum(["hospital_provider", "teleneurologist"]),
    quote: z.string().min(1).max(1000),
    assertion: z.enum(["affirmed", "negated", "explicit_unknown"]),
    occurredAt: z.string().datetime({ offset: true }),
  })
  .strict()
  .superRefine((x, ctx) => {
    const valid =
      x.fieldId === "last_known_well_status"
        ? (x.value === "Unknown" && x.assertion === "explicit_unknown") ||
          (x.value === "Known" && x.assertion === "affirmed")
        : typeof x.value === "boolean" &&
          x.assertion === (x.value ? "affirmed" : "negated");
    if (!valid)
      ctx.addIssue({
        code: "custom",
        message: "Inconsistent field value/assertion",
      });
  });
const batchSchema = z
  .object({
    encounterId: z.string().min(1),
    hospitalId: z.string().min(1),
    guideVersion: z.string().min(1),
    revision: z.number().int().nonnegative(),
    sourceId: z.string().min(1),
    receivedAt: z.string().datetime({ offset: true }),
    synthetic: z.literal(true),
    candidates: z.array(candidateSchema).min(1).max(20),
  })
  .strict();
export type TranscriptBatch = z.infer<typeof batchSchema>;
export function validateTranscriptBatch(
  input: unknown,
  c: Context,
): TranscriptBatch {
  const b = batchSchema.parse(input);
  if (
    b.encounterId !== c.id ||
    b.hospitalId !== c.hospitalId ||
    b.guideVersion !== c.guideVersion ||
    b.revision !== c.revision
  )
    throw new Error(
      "Draft is stale or belongs to another encounter. Request a fresh batch.",
    );
  if (
    new Set(b.candidates.map((x) => x.id)).size !== b.candidates.length ||
    new Set(b.candidates.map((x) => x.fieldId)).size !== b.candidates.length
  )
    throw new Error(
      "Duplicate or conflicting candidates require reconciliation.",
    );
  return b;
}
export function approvedTranscriptValues(
  input: unknown,
  c: Context,
  selected: string[],
): Record<string, Known> {
  const b = validateTranscriptBatch(input, c);
  if (
    !selected.length ||
    new Set(selected).size !== selected.length ||
    selected.some((id) => !b.candidates.some((x) => x.id === id))
  )
    throw new Error("Choose valid individual drafts to approve.");
  return Object.fromEntries(
    b.candidates
      .filter((x) => selected.includes(x.id))
      .map((x) => [x.fieldId, known(x.value)]),
  );
}
export function syntheticTranscriptBatch(c: Context): TranscriptBatch {
  return validateTranscriptBatch(
    {
      encounterId: c.id,
      hospitalId: c.hospitalId,
      guideVersion: c.guideVersion,
      revision: c.revision,
      sourceId: "scripted-handoff-001",
      receivedAt: new Date().toISOString(),
      synthetic: true,
      candidates: [
        {
          id: "lkw",
          fieldId: "last_known_well_status",
          value: "Unknown",
          speaker: "hospital_provider",
          quote: "The last known well time is unknown.",
          assertion: "explicit_unknown",
          occurredAt: c.instant,
        },
        {
          id: "cta",
          fieldId: "cta_done",
          value: true,
          speaker: "hospital_provider",
          quote: "CTA has been completed for this encounter.",
          assertion: "affirmed",
          occurredAt: c.instant,
        },
        {
          id: "lvo",
          fieldId: "lvo_present",
          value: true,
          speaker: "hospital_provider",
          quote: "The current CTA shows a large vessel occlusion.",
          assertion: "affirmed",
          occurredAt: c.instant,
        },
      ],
    },
    c,
  );
}
