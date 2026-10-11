// Server side only. Mints an ElevenLabs single-use token for realtime Scribe,
// so the browser can open the transcription WebSocket without ever seeing the
// API key. Shared by the Netlify Function (production) and the Vite dev
// server (local development).
//
// Docs: POST https://api.elevenlabs.io/v1/single-use-token/realtime_scribe
// returns { token }, single use, expires after 15 minutes.

export const DEFAULT_STT_MODEL = "scribe_v2_realtime";
const TOKEN_URL = "https://api.elevenlabs.io/v1/single-use-token/realtime_scribe";

export type TokenResponse = {
  status: number;
  body: { token?: string; modelId?: string; error?: string; code?: string };
};

export async function mintSttToken(opts: {
  apiKey?: string;
  model?: string;
  /** If set, callers must send the same value; protects the account's credits. */
  accessCode?: string;
  providedCode?: string | null;
  /** Browser origin of the request. */
  origin?: string | null;
  /** Origins allowed to request tokens. Empty means any (local development). */
  allowedOrigins: string[];
  fetchImpl?: typeof fetch;
}): Promise<TokenResponse> {
  if (!opts.apiKey)
    return {
      status: 503,
      body: {
        code: "not_configured",
        error:
          "Live transcription is not configured. Set ELEVENLABS_API_KEY on the server.",
      },
    };
  if (opts.allowedOrigins.length && !opts.allowedOrigins.includes(opts.origin ?? ""))
    return {
      status: 403,
      body: { code: "origin_rejected", error: "Transcription tokens are issued to this site only." },
    };
  if (opts.accessCode && opts.providedCode !== opts.accessCode)
    return {
      status: 401,
      body: {
        code: "access_code_required",
        error: "Enter the transcription access code to continue.",
      },
    };
  try {
    const r = await (opts.fetchImpl ?? fetch)(TOKEN_URL, {
      method: "POST",
      headers: { "xi-api-key": opts.apiKey },
    });
    if (!r.ok)
      return {
        status: 502,
        body: {
          code: "upstream_refused",
          error: `ElevenLabs refused the token request (HTTP ${r.status}). Check the API key and plan.`,
        },
      };
    const data = (await r.json()) as { token?: unknown };
    if (typeof data.token !== "string")
      return {
        status: 502,
        body: { code: "upstream_invalid", error: "ElevenLabs returned no token." },
      };
    return {
      status: 200,
      body: { token: data.token, modelId: opts.model || DEFAULT_STT_MODEL },
    };
  } catch {
    return {
      status: 502,
      body: { code: "upstream_unreachable", error: "ElevenLabs could not be reached." },
    };
  }
}
