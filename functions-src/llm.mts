import { handleLlm } from "../src/llm/server";
export default (req: Request) => handleLlm(req, {
  apiKey: process.env.OPENAI_API_KEY, model: process.env.OPENAI_MODEL,
  gemini: { apiKey: process.env.GEMINI_API_KEY, model: process.env.GEMINI_MODEL },
  provider: process.env.LLM_PROVIDER,
  maskedSecrets: [process.env.ELEVENLABS_API_KEY || ""],
  accessCode: process.env.LLM_ACCESS_CODE || process.env.STT_ACCESS_CODE,
  allowedOrigins: [process.env.URL, process.env.DEPLOY_PRIME_URL, process.env.DEPLOY_URL].filter((x): x is string => !!x),
});
