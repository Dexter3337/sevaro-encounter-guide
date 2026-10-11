// Optional paid-provider smoke test. Synthetic data only. Never logs credentials.
import { loadEnv } from "vite";
import { writeFileSync } from "node:fs";
import { handleLlm } from "../src/llm/server";
import { buildLlmInput } from "../src/llm/client";
import { seedHospitals } from "../src/data";
import { freshContext } from "../src/domain";
const env=loadEnv("development",process.cwd(),"");
if (!env.OPENAI_API_KEY && !env.GEMINI_API_KEY) {
  console.error("No AI key. Run scripts/configure-gemini.ps1 or scripts/configure-ai.ps1 privately, then retry.");process.exit(1);
}
const h=seedHospitals[5],c=freshContext(h);
const transcript=[{id:1,text:"I have left arm weakness and trouble speaking. I am allergic to penicillin; it causes a rash.",at:new Date().toISOString()}];
const cases=[
  buildLlmInput("suggest",h,c,transcript),
  buildLlmInput("chat",h,c,transcript,"What symptoms and allergies did they report?"),
  buildLlmInput("suggest",h,c,[{...transcript[0],text:"Any allergies? Not sure. My mother has penicillin allergy, not me. Correction: my allergy is latex."}]),
];
const results=[];
for (const input of cases) {
  const response=await handleLlm(new Request("http://localhost/api/llm",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(input)}),{
    apiKey:env.OPENAI_API_KEY,model:env.OPENAI_MODEL,
    gemini:{apiKey:env.GEMINI_API_KEY,model:env.GEMINI_MODEL},provider:env.LLM_PROVIDER,
    maskedSecrets:[env.ELEVENLABS_API_KEY || ""],allowedOrigins:[],
  });
  const out=await response.json();
  results.push({task:input.task,status:response.status,model:out.model,latencyMs:out.latencyMs,
    fields:out.suggestions?.map((s:{field:string})=>s.field),answer:out.answer,suggestions:out.suggestions,
    questions:out.questions,code:out.code});
}
writeFileSync("reports/llm-live-smoke.json",JSON.stringify({measuredAt:new Date().toISOString(),mode:"live provider; synthetic data",results},null,2));
console.log(JSON.stringify(results.map(({task,status,model,latencyMs,fields,code})=>({task,status,model,latencyMs,fields,code})),null,2));
if(results.some(r=>r.status!==200))process.exitCode=1;
