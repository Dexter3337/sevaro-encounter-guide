# Mentor presentation runbook

Open `/presentation.html` on the hosted demo or local production preview. The 12-slide HTML deck includes motion graphics, keyboard navigation, speaker notes, fullscreen, print/PDF and a real embedded app. Animation respects reduced-motion preferences and can be switched off. It uses no remote fonts, graphics services or paid APIs.

Suggested duration: 10–12 minutes. Use the first seven slides for problem, response, workflow, evidence, time/quality and gates (about 5 minutes). Slide 8 runs the actual interactive demo (3–5 minutes). Slides 9–12 cover imports, measured validation, contribution and mentor feedback. Each slide includes its own suggested talk track via Speaker notes or N.

## Rehearse

1. Open the hosted app in a separate tab; open Demo controls and Reset demo data. Avoid real patient data.
2. Open the presentation. Arrow keys navigate. N toggles notes. F requests fullscreen. The live app opens automatically on slide 8; Open full app is also available. Click outside the embedded app before using deck keyboard shortcuts.
3. Demonstrate default SYN-006 Imaging → LVO Yes at Tue 19:30 Central. Expand original source. Apply instant `2026-03-17T17:00:00Z` to show noon EVT activation.
4. Launch N5: Complete blocked → record charge Yes → Complete succeeds. Launch N7 to show the separate provider-confirmation gate if time allows.
5. Show V12 conflict, missing pediatric field at SYN-002, and N8 silence. Explain why uncertainty and silence are meaningful outputs.
6. Download the unfamiliar JSON from the import slide; Guide library → Preview → Activate → select ORBIT-91. Apply `2026-03-18T02:30:00Z`, set Imaging LVO Yes and show Coast Center transfer. Ask the interpreter question; set imported Interpreter needed Yes to show its mapping.
7. Evaluation → Run 29 sponsor cases → expand one case and export. Explain recorded local latency separately from hosted network loading.
8. Share repository and demo URLs. Ask mentors about prompt relevance, guide verification ownership and production integration policy.

## Fallback and export

The live slide can show a previously verified desktop screenshot when internet is unavailable. It is explicitly labeled as recorded verification, not live interaction. Start the local app before a network-dependent meeting. Print / PDF produces all 12 slides with animations disabled; browser printing provides the PDF export. The HTML deck is the primary artifact because PDF cannot retain motion or live interaction.

## Claims to keep precise

29 sponsor cases, 74 unit tests and 10 browser workflows passed in the recorded local production baseline. Field-change p95 was 30.1 ms across 120 samples on the documented Windows/Chrome environment. These are prototype measurements, not patient outcomes or a hosted-site latency guarantee. Read `reports/TEST_RESULTS.md` for details.

There is no authentication, shared database, real EHR integration, charge posting, clinical signature, LLM, speech or clinical validation. Drafts and imported guides are local to each browser/origin. Undefined schedules, missing data and conflicts remain explicit. The prototype's uncertainty policy must be reviewed separately for production.

## Reproduce presentation verification

With production preview running on port 4173, run `pnpm verify:presentation` for all slides, mobile layout, controls, embedded loading, PDF export and source downloads. Run `pnpm verify:embedded-demo` to verify an actual LVO edit and the resulting transfer guidance inside the deck. These use isolated Chrome browser contexts and save screenshots under `reports/`.
