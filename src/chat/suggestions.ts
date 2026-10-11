// Follow-up questions offered under a nudge, keyed by guide field. They are
// phrasings the resolver understands, not answers: whatever the doctor picks is
// still answered by the engine from this hospital's guide alone.
const byField: Record<string, string[]> = {
  "LVO Protocol": [
    "What are the thrombectomy coverage hours?",
    "What is the LVO pathway outside coverage hours?",
    "What is the transfer pathway?",
  ],
  "Video Eval Location": [
    "Where do I perform the video evaluation?",
    "Where is the video eval for other consults?",
  ],
  Thrombolytic: [
    "Which thrombolytic does this hospital use?",
    "Who mixes the thrombolytic?",
    "Which order set do I search for?",
  ],
  "Thrombolytic Mix Model": [
    "Who mixes the thrombolytic?",
    "Which thrombolytic does this hospital use?",
  ],
  "Wake Up Protocol": ["Is there a wake-up protocol?"],
  "Order Entry": ["Can I place orders?", "Which order set should I use?"],
  "Order Set Name": ["Which order set should I use?", "Can I place orders?"],
  "Charge Entry": [
    "Can I sign off now?",
    "Is an encounter charge required?",
  ],
  "Consult Completion Rule": ["Can I complete the consult?"],
  "Required Note Title": ["What should I title the note?"],
  "Rounding Timing": [
    "Is the rounding window open?",
    "What is the rounding schedule?",
    "Can I change orders during rounding?",
  ],
  "When Do We Round?": ["Is the rounding window open?", "What is the rounding schedule?"],
  "Rounding Orders": [
    "Can I change orders during rounding?",
    "Is the rounding window open?",
  ],
  EEG: ["Is EEG available now?", "Is EEG available tomorrow at 9am?"],
  "CT Perfusion": [
    "Does the hospital have CT perfusion?",
    "Can I get CT perfusion tomorrow at 9am?",
  ],
  "CTA Head/Neck": ["Is CTA head/neck available?"],
  MRI: ["Is MRI available now?"],
};
const generic = [
  "Where do I perform the video evaluation?",
  "What is the LVO pathway?",
  "Can I sign off now?",
];
export function suggestionsFor(field?: string): string[] {
  if (!field) return generic;
  return (
    byField[field] ?? [`What does the guide say about ${field}?`, ...generic]
  ).slice(0, 3);
}
