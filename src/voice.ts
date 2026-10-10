import { registry, type Step } from "./domain";

export type VoiceChange = {
  fieldId: string;
  value: string | boolean;
  quote: string;
};
export type VoiceIntent =
  | { kind: "wake" | "undo" | "help" | "stop" }
  | { kind: "question"; question: string }
  | { kind: "navigate"; step: Step }
  | { kind: "changes"; changes: VoiceChange[]; explicit: boolean }
  | { kind: "none" | "rejected"; message: string };

// Deliberately finite extraction: source text is never executable instructions.
// Ambient facts and addressed commands are separate. No gate or administration
// state can be inferred from speech, even when a speaker says "Bot".
const aliases: [string, RegExp][] = [
  ["last_known_well_status", /^(?:last known well(?: status)?|lkw)(?:\s|$)/i],
  ["cta_done", /^(?:cta(?: done| completed)?)(?:\s|$)/i],
  [
    "lvo_present",
    /^(?:lvo(?: present)?|large vessel occlusion(?: present)?)(?:\s|$)/i,
  ],
  ["allergies", /^allergies(?:\s|$)/i],
  ["reason_for_consult", /^(?:reason for consult|consult reason)(?:\s|$)/i],
  [
    "assessment_plan",
    /^(?:assessment(?: and|\s*\/)? plan|assessment|plan)(?:\s|$)/i,
  ],
  ["note_title", /^note title(?:\s|$)/i],
  ["note_body", /^(?:note body|note)(?:\s|$)/i],
  ["rounding_order_intent", /^rounding order intent(?:\s|$)/i],
];
const uncertain =
  /\b(possible|possibly|maybe|suspect(?:ed)?|uncertain|unsure|might|could|if|whether|history of|historical|previous(?:ly)?|prior|yesterday|last week|not sure|rule out|cannot exclude)\b/i;
const questionStart =
  /^(?:what|which|where|when|who|why|how|is|are|was|were|do|does|did|can|could|should|would|will|tell me|explain|isn['’]t|aren['’]t|wasn['’]t|doesn['’]t|hasn['’]t|haven['’]t|didn['’]t|don['’]t|can['’]t)\b/i;
function valueFor(fieldId: string, text: string): string | boolean | undefined {
  const v = text
    .trim()
    .replace(/[.!]+$/, "")
    .toLowerCase();
  if (fieldId === "last_known_well_status") {
    if (/^(unknown|not known)$/.test(v)) return "Unknown";
    if (v === "known") return "Known";
    return;
  }
  if (["lvo_present", "cta_done"].includes(fieldId)) {
    if (/^(yes|true|present|positive|done|completed)$/.test(v)) return true;
    if (
      /^(no|false|absent|negative|not present|not done|not completed)$/.test(v)
    )
      return false;
    return;
  }
  if (text.trim() && text.length <= 2000) return text.trim();
}
export function parseVoice(text: string, awake = false): VoiceIntent {
  const quote = text.trim();
  if (!quote || quote.length > 3000)
    return {
      kind: "rejected",
      message: "Use a shorter phrase, up to 3,000 characters.",
    };
  const wake = /^(?:hey\s+|okay\s+|ok\s+)?bot\b[\s,:.!-]*/i;
  const addressed = awake || wake.test(quote);
  const body = quote.replace(wake, "").trim();
  if (addressed && !body) return { kind: "wake" };
  if (
    addressed &&
    /^(?:stop listening|pause listening|mute|stop)[.!]?$/i.test(body)
  )
    return { kind: "stop" };
  if (addressed && /^(undo|undo that|undo last(?: change)?)[.!]?$/i.test(body))
    return { kind: "undo" };
  if (addressed && /^(help|what can you do)[?.!]?$/i.test(body))
    return { kind: "help" };
  if (addressed) {
    const nav = body.match(
      /^(?:open|go to|show|switch to)\s+(intake|history|imaging|recommendation|note|sign[ -]off|rounding)(?:\s+(?:step|tab))?[.!]?$/i,
    );
    if (nav)
      return {
        kind: "navigate",
        step: nav[1].toLowerCase().replace(/[ -]/g, "_") as Step,
      };
    const command = body.match(
      /^(?:please\s+)?(?:fill(?: in)?|set|record|update|change|dictate)\s+(.+)$/i,
    );
    if (command) {
      const content = command[1];
      if (
        /^(?:charge|plan confirm|hospital provider confirm|thrombolytic given|medication admin|order placed|hospital|patient identity|complete consult)\b/i.test(
          content,
        ) ||
        /^plan confirmed\b/i.test(content)
      )
        return {
          kind: "rejected",
          message:
            "Orders, administration, identity and completion requirements need manual entry. No values changed.",
        };
      const alias = aliases.find(([, re]) => re.test(content));
      if (!alias)
        return {
          kind: "rejected",
          message:
            "Name a supported field, such as LVO, CTA, allergies, assessment plan or note body. Orders, medication administration and completion checks require manual entry.",
        };
      const [fieldId, re] = alias;
      const raw = content
        .replace(re, "")
        .replace(/^\s*(?:to|with|as|is|equals)\s+/i, "")
        .trim();
      const v = valueFor(fieldId, raw);
      if (v === undefined)
        return {
          kind: "rejected",
          message: `Specify a clear value for ${registry.find((f) => f.id === fieldId)?.label}. Nothing was changed.`,
        };
      return {
        kind: "changes",
        changes: [{ fieldId, value: v, quote }],
        explicit: true,
      };
    }
    if (questionStart.test(body) || /\?$/.test(body))
      return { kind: "question", question: body };
  }
  if (quote.includes("?") || questionStart.test(body))
    return {
      kind: "none",
      message: "Question heard. Say ‘Bot’ before a hospital-guide question.",
    };
  const changes: VoiceChange[] = [];
  for (const clause of body.split(
    /[.,;\n]+|\b(?:and|but)\s+(?=(?:the\s+)?(?:cta|lvo|large vessel|last known))/i,
  )) {
    const s = clause
      .trim()
      .replace(/[’]/g, "'")
      .replace(/\bisn't\b/gi, "is not")
      .replace(/\bwasn't\b/gi, "was not")
      .replace(/\bhasn't\b/gi, "has not")
      .replace(/\bhaven't\b/gi, "have not")
      .replace(/\bdoesn't\b/gi, "does not")
      .replace(/\bdidn't\b/gi, "did not");
    if (
      !s ||
      uncertain.test(s) ||
      /\b(not (?:unknown|negative)|never said|denies saying|said|asked|example|will|going to|plan(?:ned|ning)?|needs? to)\b/i.test(
        s,
      )
    )
      continue;
    let fieldId: string | undefined;
    let v: string | boolean | undefined;
    if (/\b(?:last known well|lkw)\b/i.test(s)) {
      fieldId = "last_known_well_status";
      if (/\b(?:is |remains? )?(?:unknown|not known)\b/i.test(s)) v = "Unknown";
      else if (/\b(?:is |was )known\b/i.test(s)) v = "Known";
      if (v !== undefined)
        changes.push({ fieldId, value: v, quote: clause.trim() });
    }
    v = undefined;
    if (/\b(?:cta|ct angiogram)\b/i.test(s)) {
      fieldId = "cta_done";
      if (
        /\b(?:(?:cta|ct angiogram)(?:\s+(?:is|was|has|have|been|still))*\s+(?:(?:not|never)(?: yet| been)? (?:done|completed|performed)|pending)|no (?:cta|ct angiogram)(?: was| is| has been)? (?:done|completed|performed))\b/i.test(
          s,
        )
      )
        v = false;
      else if (
        /\b(?:(?:cta|ct angiogram)(?:\s+(?:is|was|has|been|now|already|just|successfully))*\s+(?:done|completed|performed)|(?:completed|performed) (?:the )?(?:cta|ct angiogram))\b/i.test(
          s,
        )
      )
        v = true;
      if (v !== undefined)
        changes.push({ fieldId, value: v, quote: clause.trim() });
    }
    v = undefined;
    if (/\b(?:lvo|large vessel occlusion)\b/i.test(s)) {
      fieldId = "lvo_present";
      if (
        /\b(?:(?:no (?:evidence of (?:an? )?)?|not (?:an? )?|does not have (?:an? )?)(?:lvo|large vessel occlusion)|(?:lvo|large vessel occlusion) (?:is )?(?:absent|negative|not present))\b/i.test(
          s,
        )
      )
        v = false;
      else if (
        /\b(?:shows? (?:an? )?(?:lvo|large vessel occlusion)|(?:lvo|large vessel occlusion) (?:is )?(?:present|positive)|has (?:an? )?(?:lvo|large vessel occlusion))\b/i.test(
          s,
        )
      )
        v = true;
    }
    if (fieldId && v !== undefined)
      changes.push({ fieldId, value: v, quote: clause.trim() });
  }
  const byField = new Map<string, VoiceChange>();
  for (const change of changes) {
    if (
      byField.has(change.fieldId) &&
      byField.get(change.fieldId)!.value !== change.value
    )
      return {
        kind: "rejected",
        message:
          "Conflicting facts in this phrase. Please restate the current finding; nothing was changed.",
      };
    byField.set(change.fieldId, change);
  }
  if (byField.size)
    return { kind: "changes", changes: [...byField.values()], explicit: false };
  return {
    kind: "none",
    message: addressed
      ? "Try ‘Bot, what is the LVO workflow?’ or ‘Bot, fill note body with…’."
      : "Listening for clear current LKW, CTA and LVO facts. No supported fact detected.",
  };
}
