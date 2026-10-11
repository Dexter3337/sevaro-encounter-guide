# Gemini and ElevenLabs setup

Run `powershell -ExecutionPolicy Bypass -File scripts/configure-gemini.ps1` in the repository terminal. The prompt masks the key and writes it to ignored `.env.local`. Never paste keys into chat or source files. The private local file itself is plaintext, not encrypted.

```dotenv
LLM_PROVIDER=gemini
GEMINI_API_KEY=your-private-key
GEMINI_MODEL=gemini-3.8-flash
ELEVENLABS_API_KEY=your-private-key
ELEVENLABS_STT_MODEL=scribe_v2_realtime
```

Use `.env.example` as a template. Restart `pnpm dev` after configuring keys. Netlify needs the same variables in Project configuration ? Environment variables, followed by a deployment that includes functions. Optional `LLM_ACCESS_CODE` and `STT_ACCESS_CODE` restrict the public demo endpoints. Browser access-code fields are not API-key fields.

`POST /api/llm` serves both suggestions and chat. It calls Gemini on the server, validates JSON and exact evidence quotes, rejects stale responses and masks upstream errors. Neither service key is sent to the browser. `POST /api/stt-token` returns a temporary ElevenLabs token; the service key stays server-side. OpenAI is an optional alternate adapter, not required for Gemini.

Flow: committed ElevenLabs transcript ? encounter memory ? opt-in Gemini request ? verified evidence ? click-to-fill drafts or chatbot answer. Scripted demo text can be explicitly loaded for testing; it is not a real transcription. Nothing is filled automatically, and accepted drafts remain editable. A new encounter resets patient fields and transcript state.

Run `pnpm verify:llm` after configuring the key for three real-provider synthetic checks. This can consume provider credits. `pnpm verify:ai-secrets` scans generated assets and functions for configured secret values without printing them. Unit/browser mocks verify integration, not model accuracy or live latency.

The adapter follows [Google's structured-output API](https://ai.google.dev/gemini-api/docs/generate-content/structured-output). Use synthetic data only; no production patient-data approval is implied.
