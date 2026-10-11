import { test, expect } from "@playwright/test";

// Live transcription through the real browser path — microphone, AudioWorklet,
// PCM chunks, WebSocket — with Chrome's fake microphone and a stand-in for the
// ElevenLabs realtime endpoint. No credits are spent and no audio leaves the
// machine.
test.use({
  launchOptions: {
    args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
  },
  permissions: ["microphone"],
});

const ELEVEN = "wss://api.elevenlabs.io/v1/speech-to-text/realtime**";

test.beforeEach(async ({ page }) => {
  // Record every track the page opens, to prove they are all stopped.
  await page.addInitScript(() => {
    (window as any).__micTracks = [];
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (c) => {
      const s = await original(c);
      (window as any).__micTracks.push(...s.getTracks());
      return s;
    };
  });
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button",{name:"Open transcript"}).click();
  await page.getByLabel("Transcript source").selectOption("live");
});

test("consent first, then live partial and committed lines, then a clean stop", async ({ page }) => {
  let tokenCalls = 0;
  await page.route("**/api/stt-token", (route) => {
    tokenCalls++;
    return route.fulfill({ json: { token: "sutkn_test", modelId: "scribe_v2_realtime" } });
  });
  const seen = { url: "", chunks: 0, rates: new Set<number>(), commits: 0, badChunks: 0 };
  await page.routeWebSocket(ELEVEN, (ws) => {
    seen.url = ws.url();
    ws.send(JSON.stringify({ message_type: "session_started", session_id: "s1", config: { model_id: "scribe_v2_realtime" } }));
    ws.onMessage((raw) => {
      const m = JSON.parse(String(raw));
      if (
        m.message_type !== "input_audio_chunk" ||
        typeof m.audio_base_64 !== "string" ||
        !m.audio_base_64.length ||
        typeof m.commit !== "boolean"
      )
        seen.badChunks++;
      seen.rates.add(m.sample_rate);
      seen.chunks++;
      if (seen.chunks === 3)
        ws.send(JSON.stringify({ message_type: "partial_transcript", text: "Last known well" }));
      if (seen.chunks === 6)
        ws.send(JSON.stringify({ message_type: "committed_transcript", text: "Last known well at nine this morning." }));
      if (m.commit) {
        seen.commits++;
        ws.send(JSON.stringify({ message_type: "committed_transcript", text: "No blood thinners." }));
      }
    });
  });

  const panel = page.getByTestId("live-transcript");
  const start = panel.getByRole("button", { name: "Start transcription" });
  // No microphone, no token, until the patient's agreement is recorded.
  await expect(start).toBeDisabled();
  expect(tokenCalls).toBe(0);
  await panel.getByLabel("The patient has agreed to this conversation being transcribed.").check();
  await start.click();

  await expect(panel.getByRole("status")).toContainText("Listening");
  await expect(panel).toContainText("Last known well at nine this morning.");
  const url = new URL(seen.url);
  expect(url.searchParams.get("token")).toBe("sutkn_test");
  expect(url.searchParams.get("model_id")).toBe("scribe_v2_realtime");
  expect(url.searchParams.get("audio_format")).toMatch(/^pcm_(16000|48000|44100)$/);
  expect(seen.badChunks).toBe(0);
  expect([...seen.rates]).toEqual([Number(url.searchParams.get("audio_format")!.slice(4))]);

  await panel.getByRole("button", { name: "Stop" }).click();
  // The last phrase is committed and arrives before the session closes.
  await expect(panel).toContainText("No blood thinners.");
  await expect(panel.getByRole("status")).toContainText("Transcription stopped");
  expect(seen.commits).toBe(1);
  // The microphone is released: every track it opened has ended.
  const tracks = await page.evaluate(() =>
    ((window as any).__micTracks as MediaStreamTrack[]).map((t) => [t.kind, t.readyState]),
  );
  expect(tracks.length).toBeGreaterThan(0);
  expect(tracks.every(([kind, state]) => kind === "audio" && state === "ended")).toBe(true);
  await expect(panel.getByRole("button", { name: "Copy transcript" })).toBeVisible();
});

test("an unconfigured server says so, without asking for the microphone", async ({ page }) => {
  await page.addInitScript(() => {
    (window as any).__micRequests = 0;
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = (c) => {
      (window as any).__micRequests++;
      return original(c);
    };
  });
  await page.reload();
  await page.getByRole("button",{name:"Open transcript"}).click();
  await page.getByLabel("Transcript source").selectOption("live");
  await page.route("**/api/stt-token", (route) =>
    route.fulfill({
      status: 503,
      json: {
        code: "not_configured",
        error: "Live transcription is not configured. Set ELEVENLABS_API_KEY on the server.",
      },
    }),
  );
  const panel = page.getByTestId("live-transcript");
  await panel.getByLabel("The patient has agreed to this conversation being transcribed.").check();
  await panel.getByRole("button", { name: "Start transcription" }).click();
  await expect(panel.getByRole("alert")).toContainText("ELEVENLABS_API_KEY");
  expect(await page.evaluate(() => (window as any).__micRequests)).toBe(0);
});

test("an ElevenLabs error is shown in plain words and stops the session", async ({ page }) => {
  await page.route("**/api/stt-token", (route) =>
    route.fulfill({ json: { token: "sutkn_test", modelId: "scribe_v2_realtime" } }),
  );
  await page.routeWebSocket(ELEVEN, (ws) => {
    ws.send(JSON.stringify({ message_type: "session_started", session_id: "s1", config: {} }));
    ws.onMessage(() => ws.send(JSON.stringify({ message_type: "quota_exceeded", error: "limit" })));
  });
  const panel = page.getByTestId("live-transcript");
  await panel.getByLabel("The patient has agreed to this conversation being transcribed.").check();
  await panel.getByRole("button", { name: "Start transcription" }).click();
  await expect(panel.getByRole("alert")).toContainText("quota is used up");
  await expect(panel.getByRole("button", { name: "Start transcription" })).toBeVisible();
});

test("a new encounter starts with an empty transcript", async ({ page }) => {
  await page.route("**/api/stt-token", (route) =>
    route.fulfill({ json: { token: "sutkn_test", modelId: "scribe_v2_realtime" } }),
  );
  await page.routeWebSocket(ELEVEN, (ws) => {
    ws.send(JSON.stringify({ message_type: "session_started", session_id: "s1", config: {} }));
    let sent = false;
    ws.onMessage(() => {
      if (!sent) ws.send(JSON.stringify({ message_type: "committed_transcript", text: "Synthetic line one." }));
      sent = true;
    });
  });
  const panel = page.getByTestId("live-transcript");
  await panel.getByLabel("The patient has agreed to this conversation being transcribed.").check();
  await panel.getByRole("button", { name: "Start transcription" }).click();
  await expect(panel).toContainText("Synthetic line one.");
  await page.getByRole("button",{name:"Close transcript"}).click();
  await page.getByLabel("Hospital", { exact: true }).selectOption("SYN-002");
  await page.getByRole("button",{name:"Open transcript"}).click();
  await page.getByLabel("Transcript source").selectOption("live");
  await expect(page.getByTestId("live-transcript")).not.toContainText("Synthetic line one.");
  await expect(page.getByTestId("live-transcript").getByRole("status")).toContainText("Not transcribing");
});
