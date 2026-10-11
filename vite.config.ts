import { defineConfig, loadEnv, type Connect, type Plugin } from "vite";
import { mintSttToken } from "./src/stt/token";
import { handleLlm } from "./src/llm/server";

function llmDevServer(): Plugin {
  const handler = (env: Record<string,string>): Connect.NextHandleFunction => async (req,res) => {
    const headers = new Headers();
    for (const [k,v] of Object.entries(req.headers)) if (v) headers.set(k, Array.isArray(v) ? v[0] : v);
    const origin = `http://${req.headers.host}`;
    const controller = new AbortController();
    res.on("close", () => { if (!res.writableEnded) controller.abort(); });
    // Bound local requests too, before copying them into a Fetch Request.
    const chunks: Buffer[] = []; let bytes = 0;
    for await (const chunk of req) {
      bytes += chunk.length;
      if (bytes > 120_000) { res.writeHead(413, {"content-type":"application/json"}); res.end(JSON.stringify({code:"too_large"})); return; }
      chunks.push(Buffer.from(chunk));
    }
    const request = new Request(`${origin}/api/llm`, {method:req.method,headers, signal:controller.signal,
      ...(req.method === "POST" ? {body:Buffer.concat(chunks)} : {}), });
    const response = await handleLlm(request, {apiKey:env.OPENAI_API_KEY,model:env.OPENAI_MODEL,
      gemini:{apiKey:env.GEMINI_API_KEY,model:env.GEMINI_MODEL}, provider:env.LLM_PROVIDER,
      maskedSecrets:[env.ELEVENLABS_API_KEY || ""],
      accessCode:env.LLM_ACCESS_CODE || env.STT_ACCESS_CODE,allowedOrigins:[origin]});
    res.statusCode = response.status;
    response.headers.forEach((v,k) => res.setHeader(k,v));
    res.end(await response.text());
  };
  return {name:"llm-dev-server", configureServer(server) {
    server.middlewares.use("/api/llm", handler(loadEnv(server.config.mode, process.cwd(), "")));
  }, configurePreviewServer(server) {
    server.middlewares.use("/api/llm", handler(loadEnv("production", process.cwd(), "")));
  }};
}

// Local stand-in for the /api/stt-token Netlify Function, so live
// transcription works under `pnpm dev` and `pnpm preview`. Reads
// ELEVENLABS_API_KEY from .env.local (never prefixed VITE_, so it is never
// bundled into the browser code).
function sttTokenDevServer(): Plugin {
  const handler =
    (env: Record<string, string>): Connect.NextHandleFunction =>
    async (req, res) => {
      if (req.method !== "POST") {
        res.statusCode = 405;
        res.end();
        return;
      }
      const header = (name: string) => {
        const v = req.headers[name];
        return Array.isArray(v) ? v[0] : (v ?? null);
      };
      const { status, body } = await mintSttToken({
        apiKey: env.ELEVENLABS_API_KEY,
        model: env.ELEVENLABS_STT_MODEL,
        accessCode: env.STT_ACCESS_CODE,
        providedCode: header("x-stt-access"),
        origin: header("origin"),
        allowedOrigins: [],
      });
      res.statusCode = status;
      res.setHeader("content-type", "application/json");
      res.setHeader("cache-control", "no-store");
      res.end(JSON.stringify(body));
    };
  return {
    name: "stt-token-dev-server",
    configureServer(server) {
      const env = loadEnv(server.config.mode, process.cwd(), "");
      server.middlewares.use("/api/stt-token", handler(env));
    },
    configurePreviewServer(server) {
      const env = loadEnv("production", process.cwd(), "");
      server.middlewares.use("/api/stt-token", handler(env));
    },
  };
}

export default defineConfig({
  plugins: [sttTokenDevServer(), llmDevServer()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom/client"],
          temporal: ["@js-temporal/polyfill"],
          validation: ["zod"],
        },
      },
    },
  },
});
