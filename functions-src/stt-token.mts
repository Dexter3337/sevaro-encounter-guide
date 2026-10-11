import { mintSttToken } from "../src/stt/token";

// POST /api/stt-token → { token, modelId }
//
// Issues an ElevenLabs single-use realtime Scribe token (valid 15 minutes,
// consumed on use) so the browser can stream audio without holding the API
// key. Configure in Netlify → Site configuration → Environment variables:
//   ELEVENLABS_API_KEY   (required)
//   ELEVENLABS_STT_MODEL (optional, default scribe_v2_realtime)
//   STT_ACCESS_CODE      (optional; protects the account's credits)
export default async (req: Request) => {
  if (req.method !== "POST")
    return new Response(JSON.stringify({ error: "Method not allowed." }), {
      status: 405,
      headers: { "content-type": "application/json" },
    });
  const env = process.env;
  // Netlify sets these to the production and deploy-preview origins.
  const allowedOrigins = [env.URL, env.DEPLOY_PRIME_URL, env.DEPLOY_URL].filter(
    (x): x is string => !!x,
  );
  const { status, body } = await mintSttToken({
    apiKey: env.ELEVENLABS_API_KEY,
    model: env.ELEVENLABS_STT_MODEL,
    accessCode: env.STT_ACCESS_CODE,
    providedCode: req.headers.get("x-stt-access"),
    origin: req.headers.get("origin"),
    allowedOrigins,
  });
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
};
