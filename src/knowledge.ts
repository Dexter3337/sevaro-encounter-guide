import type { Hospital, Source } from "./domain";
import { windows } from "./time";
export const concepts: Record<string, string[]> = {
  "Video Eval Location": [
    "video eval",
    "video evaluation",
    "video location",
    "perform the video",
    "video consult",
    "video evaluation location",
  ],
  "LVO Protocol": [
    "lvo",
    "large vessel",
    "thrombectomy",
    "evt team",
    "transfer pathway",
    "lvo pathway",
    "large vessel occlusion workflow",
  ],
  "Wake Up Protocol": ["wake up", "wake-up", "unknown last known well"],
  "Thrombolytic Mix Model": [
    "mixes",
    "mix tnk",
    "mix model",
    "prepares",
    "preparation",
    "who mixes",
    "drug preparation responsibility",
  ],
  Thrombolytic: ["thrombolytic", "which tnk"],
  "Order Set Name": ["order set", "search for"],
  "Order Entry": [
    "order entry",
    "enter orders",
    "place orders",
    "medication orders",
    "medication order permissions",
  ],
  "Rounding Orders": [
    "rounding orders",
    "orders during rounding",
    "during rounding",
    "inpatient neurology orders",
  ],
  "Rounding Timing": [
    "rounding window",
    "rounding time",
    "when do we round",
    "rounds",
    "rounding schedule",
  ],
  EEG: ["eeg", "seizure", "eeg availability"],
  "CT Perfusion": ["ct perfusion", "perfusion", "ctp"],
  "Required Note Title": ["note title", "title the note", "title is required"],
  "Pediatric Neurology": ["pediatric", "paediatric"],
  "Charge Entry": [
    "charge",
    "sign off",
    "sign-off",
    "complete consult",
    "can i complete",
  ],
  "Consult Completion Rule": ["plan confirmation", "completion rule"],
  AI: ["ai software", "artificial intelligence"],
};
export const normalize = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
export function conceptName(field: string) {
  const n = normalize(field);
  if (n === "when do we round") return "When Do We Round?";
  return (
    Object.keys(concepts).find((k) => normalize(k) === n) ||
    Object.entries(concepts).find(([, a]) =>
      a.some((x) => normalize(x) === n),
    )?.[0] ||
    field
  );
}
export function getSources(h: Hospital, field: string) {
  const n = normalize(conceptName(field));
  return h.fields.filter((s) => normalize(conceptName(s.field)) === n);
}
export function clean(s: string) {
  return s.replace(/\s*\[last verified[^\]]+\]/gi, "").trim();
}
export function scoped(s: string, consult: string) {
  if (!/;/.test(s) || !/stroke (?:alerts|activation)/i.test(s)) return s;
  const parts = s.split(";").map((x) => x.trim());
  return /stroke/i.test(consult)
    ? parts.find((x) => /stroke/i.test(x)) || s
    : parts.find((x) => !/stroke/i.test(x)) || s;
}
export function interpretation(
  s: Source,
): "supported" | "partial" | "needs_review" | "unsupported" {
  const c = conceptName(s.field),
    raw = clean(s.raw);
  if (c === "LVO Protocol") {
    if (
      /^not thrombectomy capable/i.test(raw) ||
      /thrombectomy capable 24\/7/i.test(raw)
    )
      return "supported";
    if (
      /thrombectomy capable/i.test(raw) &&
      windows(raw).length &&
      /outside coverage/i.test(raw) &&
      /during coverage/i.test(raw)
    )
      return "supported";
    if (/staffed neurointerventional coverage/i.test(raw)) return "partial";
    return "needs_review";
  }
  if (c === "Thrombolytic Mix Model" && /staffed hours/i.test(raw))
    return "partial";
  if (c === "Rounding Timing")
    return windows(raw, [1, 2, 3, 4, 5, 6, 7]).length
      ? "supported"
      : "needs_review"; // Syntax only; actual days come from the linked source.
  if (["EEG", "CT Perfusion", "MRI"].includes(c))
    return windows(raw).length || /^(no|none|not applicable)\b/i.test(raw)
      ? "supported"
      : "needs_review";
  if (c === "Charge Entry")
    return /^(yes|no)\b/i.test(raw) &&
      !/\b(if|unless|except|only when)\b/i.test(raw)
      ? "supported"
      : "needs_review";
  if (c === "Consult Completion Rule")
    return /do not complete.*until.*hospital provider confirms.*plan/i.test(
      raw,
    ) && !/\b(if|unless|except)\b/i.test(raw)
      ? "supported"
      : "needs_review";
  if (
    !Object.hasOwn(concepts, c) &&
    /\b(if|unless|when|except|after|before)\b/i.test(raw)
  )
    return "needs_review";
  return "supported";
}
export function resolveConcept(
  q: string,
  h: Hospital,
): { field?: string; candidates: string[] } {
  const n = normalize(q);
  let ranked: { field: string; score: number }[] = [];
  const labels = new Set([
    ...Object.keys(concepts),
    ...h.fields.map((s) => s.field),
  ]);
  for (const field of labels) {
    const aliases = [
      field,
      ...(concepts[field] || []),
      ...h.fields
        .filter((s) => s.field === field)
        .flatMap((s) => s.aliases || []),
    ];
    let score = 0;
    for (const a of aliases) {
      const x = normalize(a);
      if ((" " + n + " ").includes(" " + x + " "))
        score = Math.max(score, x.length);
    }
    if (score) ranked.push({ field: conceptName(field), score });
  }
  if (/order set/i.test(q)) return { field: "Order Set Name", candidates: [] };
  if (/rounding/i.test(q) && /orders?|antiplatelet|medication|change/i.test(q))
    return { field: "Rounding Orders", candidates: [] };
  if (/who.*mix|who.*prepar/i.test(q))
    return { field: "Thrombolytic Mix Model", candidates: [] };
  ranked = ranked.sort((a, b) => b.score - a.score);
  const top = ranked[0];
  const candidates = [
    ...new Set(
      ranked.filter((r) => r.score === top?.score).map((r) => r.field),
    ),
  ];
  return { field: candidates.length === 1 ? top.field : undefined, candidates };
}
