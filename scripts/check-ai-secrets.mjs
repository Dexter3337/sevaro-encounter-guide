// Print counts only, never secret values or file contents.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { loadEnv } from "vite";
const env = loadEnv("production",process.cwd(),"");
const secrets = [env.ELEVENLABS_API_KEY,env.OPENAI_API_KEY,env.GEMINI_API_KEY].filter(Boolean);
let matches = 0;
function scan(dir) {
  for (const entry of readdirSync(dir,{withFileTypes:true})) {
    const path = join(dir,entry.name);
    if (entry.isDirectory()) scan(path);
    else if (secrets.some(secret=>readFileSync(path).includes(Buffer.from(secret)))) matches++;
  }
}
scan("dist");scan("netlify/functions");
console.log(JSON.stringify({configuredProviderKeys:secrets.length,secretMatchesInBuild:matches}));
if (matches) process.exitCode=1;
