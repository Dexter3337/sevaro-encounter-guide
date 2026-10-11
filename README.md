# Sevaro Encounter Guide

A synthetic teleneurology workflow prototype: large consultation video, compact captions, contextual hospital guidance, completion gates, and a conversational assistant.

**Try it live:** https://dynamic-cat-513c19.netlify.app/

AI runs on the deployed site with the key held server-side; local runs need `GEMINI_API_KEY` in ignored `.env.local` (see [docs/LLM_SETUP.md](docs/LLM_SETUP.md)).

- **Mentor presentation:** https://dynamic-cat-513c19.netlify.app/presentation.html
- **Repository:** https://github.com/Dexter3337/sevaro-encounter-guide

## Run locally

Requires Node 22.12+ and pnpm 11.25.0.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open http://127.0.0.1:5173. The hospital and doctor clocks use the current time. Demo scenarios explicitly pin their own reference time. No API key is needed for the hospital guidance engine, imports, evaluation, recorded video, scripted captions or local guide questions.

## Gemini and ElevenLabs

See [AI setup](docs/LLM_SETUP.md). Keys belong only in ignored `.env.local` or Netlify environment variables, never `VITE_*` variables. The server-side Gemini adapter supports transcript-grounded suggestions for Reason for Consult, Allergies, Note title and Note body, plus conversational chat. Each draft requires a doctor's explicit click and cites transcript excerpts. Existing field text is protected by a replacement confirmation.

Open **Open transcript** below the video. Choose **Live ? ElevenLabs** for microphone transcription, or **Use scripted example for AI drafts** for a reproducible synthetic demonstration. Expand **Transcript & AI field suggestions**, then enable suggestions. The floating **Ask the Guide** button opens chat; transcript sharing is a separate choice.

## Verify and deploy

```sh
pnpm typecheck
pnpm test
pnpm evaluate
pnpm build
pnpm test:e2e
pnpm verify:ai-secrets
```

Browser checks use installed Chrome by default; CI uses Playwright Chromium. Set `DEMO_URL` to test a running preview or deployment. Netlify builds with `pnpm build`, publishes `dist`, and deploys the bundled `netlify/functions` endpoints. Deploy the functions as well as the assets; a static ZIP alone does not supply AI endpoints.

## Submission contents

`src/` application and rules; `functions-src/` server-only API handlers; `data/` synthetic hospital fixtures and sponsor validation data; `tests/` unit and browser checks; `public/` recorded demo and presentation; `docs/` maintained implementation notes. Research archives, source PDFs, original problem statements, sprint coordination notes and generated reports are excluded from the submission tree. Git history is preserved.

## Limitations

Synthetic demonstration only. The recorded video is not a connected consultation. Scripted captions are illustrative, not extracted from its audio. Live AI needs configured provider keys and account access; mocked integration tests do not measure model quality or live latency. Exact quote validation verifies provenance, not clinical correctness. There is no production Sevaro/EHR connection, clinical sign-off, patient authentication or production privacy assessment. Do not use real patient data. The core remains usable if AI is unavailable.

See [validation](docs/VALIDATION.md) and [contributing](CONTRIBUTING.md).
