import { describe, expect, it, vi } from "vitest";
import { handleLlm, INSTRUCTIONS } from "../src/llm/server";
import { buildLlmInput, requestLlm } from "../src/llm/client";
import { validateOutput } from "../src/llm/contracts";
import { seedHospitals } from "../src/data";
import { freshContext } from "../src/domain";

const h = seedHospitals[5], c = freshContext(h);
const transcript = [{id:1,text:"I have left arm weakness. I am allergic to penicillin.",at:"2026-10-11T12:00:00Z"}];
const input = () => buildLlmInput("suggest",h,c,transcript);
const good = () => ({suggestions:[{field:"reason_for_consult",value:"Reported left arm weakness",basis:"The patient reports weakness.",evidence:[{kind:"transcript",id:"1",quote:"I have left arm weakness."}]}],answer:"",evidence:[],questions:[]});
const req = (body:unknown = input(), headers:Record<string,string> = {}) => new Request("http://localhost/api/llm", {method:"POST",headers:{"content-type":"application/json",origin:"http://localhost",...headers},body:JSON.stringify(body)});
const response = (out:unknown) => new Response(JSON.stringify({status:"completed",output:[{type:"message",content:[{type:"output_text",text:JSON.stringify(out)}]}]}));
const opts = {apiKey:"sk-private-test-secret",allowedOrigins:["http://localhost"]};

describe("LLM extraction and server boundary", () => {
  it("uses a compact request ID even for a long transcript", () => {
    const data = buildLlmInput("suggest",h,c,[{...transcript[0],text:"phrase ".repeat(1600)}]);
    expect(data.identity.length).toBeLessThan(100);
  });
  it("accepts exact transcript evidence and restricts fields to the four requested", () => {
    expect(validateOutput(good(),input()).suggestions[0].field).toBe("reason_for_consult");
    expect(() => validateOutput({...good(),suggestions:[{...good().suggestions[0],field:"thrombolytic_given"}]},input())).toThrow();
  });
  it.each(["invented quote", "wrong segment", "guide draft evidence", "duplicate draft"])("rejects %s", kind => {
    const out = good();
    if (kind === "invented quote") out.suggestions[0].evidence[0].quote = "No allergies.";
    if (kind === "wrong segment") out.suggestions[0].evidence[0].id = "2";
    if (kind === "guide draft evidence") out.suggestions[0].evidence[0].kind = "guide";
    if (kind === "duplicate draft") out.suggestions.push(out.suggestions[0]);
    expect(() => validateOutput(out,input())).toThrow();
  });
  it("preserves uncertainties, negation and corrections in input and defines conservative instructions", () => {
    const text = "Any allergies? Not sure. My mother has penicillin allergy, not me. Correction: my allergy is latex.";
    expect(buildLlmInput("suggest",h,c,[{...transcript[0],text}]).transcript[0].text).toBe(text);
    expect(INSTRUCTIONS).toContain("Do not infer 'no allergies' from silence");
    expect(INSTRUCTIONS).toContain("another person's condition");
    // This checks prompt/input contracts, not a claim that every model preserves meaning.
  });
  it("returns a structured draft using a server-only key and store:false", async () => {
    let sent:any; const fetchImpl = vi.fn(async (_url:any,init:any) => {sent=init;return response(good());});
    const result = await handleLlm(req(),{...opts,fetchImpl});
    expect(result.status).toBe(200);
    expect(sent.headers.authorization).toBe(`Bearer ${opts.apiKey}`);
    const body = JSON.parse(sent.body);
    expect(body.store).toBe(false);expect(body.text.format.strict).toBe(true);
    expect(body.text.format.schema.additionalProperties).toBe(false);
    expect(await result.text()).not.toContain(opts.apiKey);
  });
  it("refuses a wrong origin, method and access code before contacting the provider", async () => {
    const fetchImpl = vi.fn();
    expect((await handleLlm(req(input(),{origin:"https://attacker.test"}),{...opts,fetchImpl})).status).toBe(403);
    expect((await handleLlm(req(),{...opts,accessCode:"private-code",fetchImpl})).status).toBe(401);
    expect((await handleLlm(new Request("http://localhost/api/llm"),{...opts,fetchImpl})).status).toBe(405);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it("fails cleanly when the key is absent, without exposing configuration", async () => {
    const r = await handleLlm(req(),{allowedOrigins:[]});
    expect(r.status).toBe(503);expect((await r.json()).code).toBe("not_configured");
  });
  it("bounds chunked request bodies and rejects duplicate transcript IDs", async () => {
    expect((await handleLlm(req({...input(),question:"x".repeat(120001)}),opts)).status).toBe(413);
    expect((await handleLlm(req({...input(),transcript:[transcript[0],transcript[0]]}),opts)).status).toBe(400);
  });
  it("never forwards error bodies, exceptions, either secret or invalid evidence", async () => {
    for (const fetchImpl of [
      vi.fn(async () => new Response(opts.apiKey,{status:401})),
      vi.fn(async () => {throw Error(opts.apiKey);}),
      vi.fn(async () => response({...good(),questions:[opts.apiKey]})),
      vi.fn(async () => response({...good(),questions:["eleven-secret"]})),
      vi.fn(async () => response({...good(),suggestions:[{...good().suggestions[0],evidence:[{kind:"transcript",id:"9",quote:"No allergies"}]}]})),
    ]) {
      const r = await handleLlm(req(),{...opts,maskedSecrets:["eleven-secret"],fetchImpl});
      expect(r.status).toBe(502); const text=await r.text();
      expect(text).not.toContain(opts.apiKey);expect(text).not.toContain("eleven-secret");
    }
  });
  it("handles provider rate limits, refusal and incomplete output", async () => {
    expect((await handleLlm(req(),{...opts,fetchImpl:vi.fn(async () => new Response("",{status:429}))})).status).toBe(429);
    expect((await handleLlm(req(),{...opts,fetchImpl:vi.fn(async () => new Response(JSON.stringify({status:"incomplete",output:[]})))})).status).toBe(502);
  });
  it("chat includes bounded history and resolved guidance from only the selected hospital", async () => {
    const chat = buildLlmInput("chat",h,c,transcript,"What symptoms did they report?",[{role:"user",text:"Summarize this conversation"}]);
    expect(chat.history).toHaveLength(1);expect(chat.hospital.id).toBe(h.id);
    const allowed = new Set(h.fields.map(s=>s.id));
    expect(chat.guide.flatMap(g=>g.evidence).every(s=>allowed.has(s.id))).toBe(true);
    const answer = {...good(),suggestions:[],answer:"The patient reported left arm weakness.",evidence:good().suggestions[0].evidence};
    expect((await handleLlm(req(chat),{...opts,fetchImpl:vi.fn(async () => response(answer))})).status).toBe(200);
    answer.evidence[0].id="999";expect(()=>validateOutput(answer,chat)).toThrow();
  });
  it("rejects a client response bound to another request", async () => {
    vi.stubGlobal("fetch",vi.fn(async () => new Response(JSON.stringify({...good(),identity:"another-request"}))));
    try {await expect(requestLlm(input(),new AbortController().signal)).rejects.toThrow("Stale");}
    finally {vi.unstubAllGlobals();}
  });
});
