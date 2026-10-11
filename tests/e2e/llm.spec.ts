import { test, expect, type Page } from "@playwright/test";
import { writeFileSync } from "node:fs";

test.use({launchOptions:{args:["--use-fake-device-for-media-stream","--use-fake-ui-for-media-stream"]},permissions:["microphone"]});
const TEXT = "I have left arm weakness and trouble speaking. I am allergic to penicillin; it causes a rash.";
const drafts = (data:any) => ({identity:data.identity,latencyMs:42,model:"test-model",answer:"",questions:[],evidence:[],
  suggestions:[
    {field:"reason_for_consult",value:"Left arm weakness and difficulty speaking",basis:"Symptoms reported in the conversation."},
    {field:"allergies",value:"Penicillin — rash",basis:"The transcript explicitly names the allergen and reaction."},
    {field:"note_title",value:"Neurology consultation for weakness and speech difficulty",basis:"Descriptive title based on reported symptoms."},
    {field:"note_body",value:"Reported left arm weakness and difficulty speaking. Penicillin allergy with rash. Findings require clinician review.",basis:"Summary of the patient's reported symptoms and allergy."},
  ].map(s => ({...s,evidence:[{kind:"transcript",id:String(data.transcript[0]?.id || 1),quote:TEXT}]})),
});
async function live(page:Page) {
  await page.route("**/api/stt-token",r => r.fulfill({json:{token:"sutkn_synthetic",modelId:"scribe_v2_realtime"}}));
  await page.routeWebSocket("wss://api.elevenlabs.io/v1/speech-to-text/realtime**",ws => {
    ws.send(JSON.stringify({message_type:"session_started",session_id:"llm-test",config:{}}));
    let sent=false;
    ws.onMessage(() => {if (!sent) ws.send(JSON.stringify({message_type:"committed_transcript",text:TEXT}));sent=true;});
  });
  await page.getByRole("button",{name:"Open transcript"}).click();
  await page.getByLabel("Transcript source").selectOption("live");
  const p=page.getByTestId("live-transcript");
  await p.getByLabel("The patient has agreed to this conversation being transcribed.").check();
  await p.getByRole("button",{name:"Start transcription"}).click();
  await expect(p).toContainText(TEXT);
  await page.getByRole("button",{name:"Close transcript"}).click();
  await page.locator(".ai-drafting-tools > summary").click();
}
test.beforeEach(async ({page}) => {
  await page.goto("/");await page.evaluate(()=>localStorage.clear());await page.reload();
});
test("committed ElevenLabs transcript produces four evidence-backed buttons, and applies each field",async ({page}) => {
  const browserErrors:string[]=[];page.on("pageerror",e=>browserErrors.push(e.message));
  let calls=0;
  await page.route("**/api/llm",r=>{calls++;return r.fulfill({json:drafts(r.request().postDataJSON())});});
  await live(page);
  await page.getByRole("navigation",{name:"Caselog steps"}).getByRole("button",{name:"Intake"}).click();
  expect(calls).toBe(0);
  const p=page.getByTestId("transcript-drafts");const start=performance.now();
  await p.getByLabel("Suggest from transcript").check();
  await expect(p.getByRole("button",{name:"Fill Reason for Consult",exact:true})).toBeVisible();
  const ms=performance.now()-start;
  writeFileSync("reports/llm-browser-latency.json",JSON.stringify({measuredAt:new Date().toISOString(),mode:"mock provider through browser; includes 1500ms debounce",draftReadyMs:Math.round(ms)},null,2));
  await expect(page.locator("#field-reason_for_consult")).toHaveValue("");
  await p.locator("summary").first().click();await expect(p.locator("blockquote").first()).toContainText(TEXT);
  await p.getByRole("button",{name:"Fill Reason for Consult",exact:true}).click();
  await expect(page.locator("#field-reason_for_consult")).toHaveValue("Left arm weakness and difficulty speaking");
  await p.getByRole("button",{name:"Fill Allergies",exact:true}).click();
  await page.getByRole("navigation",{name:"Caselog steps"}).getByRole("button",{name:"History"}).click();
  await expect(page.locator("#field-allergies")).toHaveValue("Penicillin — rash");
  await p.getByRole("button",{name:"Fill Note title",exact:true}).click();
  await p.getByRole("button",{name:"Fill Note body",exact:true}).click();
  await page.getByRole("navigation",{name:"Caselog steps"}).getByRole("button",{name:/Note$/}).click();
  await expect(page.locator("#field-note_title")).toHaveValue("Neurology consultation for weakness and speech difficulty");
  await expect(page.locator("#field-note_body")).toHaveValue(/Reported left arm weakness/);
  await page.screenshot({path:"reports/llm-drafts-desktop.png",fullPage:true});
  expect(browserErrors).toEqual([]);
});
test("manual edits require review and an explicit replacement choice",async ({page})=>{
  await page.route("**/api/llm",r=>r.fulfill({json:drafts(r.request().postDataJSON())}));
  await live(page);
  await page.getByRole("navigation",{name:"Caselog steps"}).getByRole("button",{name:"Intake"}).click();
  const p=page.getByTestId("transcript-drafts");await p.getByLabel("Suggest from transcript").check();
  const fill=p.getByRole("button",{name:"Fill Reason for Consult",exact:true});await expect(fill).toBeEnabled();
  await page.locator("#field-reason_for_consult").fill("Doctor's edited description");
  await expect(fill).toBeDisabled();await expect(p).toContainText("edited after this draft");
  await p.getByLabel("Replace the current reason for consult").check();await fill.click();
  await expect(page.locator("#field-reason_for_consult")).toHaveValue("Left arm weakness and difficulty speaking");
});
test("AI chat receives the opted-in transcript and follow-up history",async ({page})=>{
  const requests:any[]=[];
  await page.route("**/api/llm",r=>{
    const data=r.request().postDataJSON();requests.push(data);
    return r.fulfill({json:{...drafts(data),suggestions:[],answer:requests.length===1 ? "The patient reports left arm weakness and trouble speaking." : "The transcript states a penicillin allergy with rash.",
      evidence:[{kind:"transcript",id:String(data.transcript[0].id),quote:TEXT}],questions:[]}});
  });
  await live(page);await page.getByRole("button",{name:"Ask the Guide",exact:true}).click();
  const p=page.getByTestId("chat-panel");
  await p.getByText("Transcript sharing & access",{exact:true}).click();
  await p.getByLabel(/Share this encounter's transcript/).check();
  await p.getByPlaceholder("Ask about this hospital's guide…").fill("What symptoms did they report?");
  await p.getByRole("button",{name:"Ask",exact:true}).click();await expect(p).toContainText("The patient reports left arm weakness");
  await p.getByPlaceholder("Ask about this hospital's guide…").fill("And what about allergies?");
  await p.getByRole("button",{name:"Ask",exact:true}).click();await expect(p).toContainText("penicillin allergy with rash");
  expect(requests[1].history[0].text).toBe("What symptoms did they report?");
  expect(requests[1].history[1].text).toContain("left arm weakness");
  expect(requests[1].transcript[0].text).toBe(TEXT);
  expect(requests[1].hospital.id).toBe("SYN-006");
  expect(JSON.stringify(requests)).not.toContain("API_KEY");
  await p.locator("summary").last().click();await page.screenshot({path:"reports/llm-chat-desktop.png",fullPage:true});
  await page.setViewportSize({width:390,height:844});
  await expect(p.getByRole("button",{name:"Ask",exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.screenshot({path:"reports/llm-chat-mobile.png",fullPage:true});
});
test("late replies cannot follow the doctor into a different hospital",async ({page})=>{
  let release:()=>void=()=>{};const gate=new Promise<void>(r=>release=r);
  await page.route("**/api/llm",async r=>{const data=r.request().postDataJSON();await gate;
    await r.fulfill({json:{...drafts(data),suggestions:[],answer:"OLD ENCOUNTER ANSWER",evidence:[]}}).catch(()=>{});
  });
  await page.getByRole("button",{name:"Ask the Guide",exact:true}).click();
  const p=page.getByTestId("chat-panel");
  await p.getByPlaceholder("Ask about this hospital's guide…").fill("Summarize this encounter");
  const request=page.waitForRequest("**/api/llm");await p.getByRole("button",{name:"Ask",exact:true}).click();await request;
  await page.getByLabel("Hospital",{exact:true}).selectOption("SYN-002");release();
  await page.getByRole("button",{name:"Ask the Guide",exact:true}).click();
  await expect(page.getByTestId("chat-panel").getByTestId("chat-turn")).toHaveCount(0);
  await expect(page.getByTestId("chat-panel")).not.toContainText("OLD ENCOUNTER ANSWER");
});
test("no LLM key leaves manual fields and local guide chat working",async ({page})=>{
  await page.route("**/api/llm",r=>r.fulfill({status:503,json:{code:"not_configured"}}));
  await page.getByRole("button",{name:"Ask the Guide",exact:true}).click();const p=page.getByTestId("chat-panel");
  await p.getByPlaceholder("Ask about this hospital's guide…").fill("EEG");
  await p.getByRole("button",{name:"Ask",exact:true}).click();await expect(p).toContainText("Showing a local guide answer");
  await expect(p.getByTestId("nudge-card")).toBeVisible();
});
