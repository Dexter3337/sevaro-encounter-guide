import { test, expect, type Page } from "@playwright/test";
async function phrase(page: Page, text: string) {
  const details = page.locator(".voice-test");
  if ((await details.getAttribute("open")) === null)
    await details.locator("summary").click();
  await page.getByLabel("Synthetic transcript or Bot command").fill(text);
  await page.getByRole("button", { name: "Process phrase" }).click();
}
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});
test("ambient findings fill form, surface cited guidance immediately, and undo as one update", async ({
  page,
}) => {
  await phrase(
    page,
    "Last known well is unknown. CTA is completed. LVO is present.",
  );
  await expect(page.getByLabel("CTA done", { exact: true })).toHaveValue("yes");
  await expect(
    page.getByLabel("Large vessel occlusion present", { exact: true }),
  ).toHaveValue("yes");
  await expect(page.locator(".voice-nudge")).toContainText(
    "ED provider initiates transfer",
  );
  await expect(page.locator(".source-pill")).toHaveText("3 fields filled");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  const state = await page.evaluate(
    () => JSON.parse(localStorage.getItem("encounter-guide:v1")!).context,
  );
  expect(state.values).toEqual({});
  await expect(page.locator(".voice-nudge")).toHaveCount(0);
});
test("wake word question, named-field dictation and explicit correction share the real engine", async ({
  page,
}) => {
  await phrase(page, "Bot");
  await expect(page.locator(".voice-live-text")).toContainText("BOT IS READY");
  await phrase(page, "What is the LVO pathway?");
  await expect(page.locator(".ask-panel .card")).toContainText(
    "Outside coverage",
  );
  await phrase(page, "Bot fill note body with Synthetic handoff reviewed.");
  await expect(page.getByLabel("Note body", { exact: true })).toHaveValue(
    "Synthetic handoff reviewed.",
  );
  await phrase(page, "Bot set LVO to yes");
  await phrase(page, "Bot set LVO to no");
  await expect(
    page.getByLabel("Large vessel occlusion present", { exact: true }),
  ).toHaveValue("no");
  await expect(page.locator(".field-guidance .card")).toHaveCount(0);
});
test("review mode rejects stale drafts and voice cannot satisfy completion gates", async ({
  page,
}) => {
  await page.getByLabel("Auto-fill clear findings").uncheck();
  await phrase(page, "CTA is completed. LVO is present.");
  await expect(page.locator(".voice-review")).toContainText(
    "Review detected findings",
  );
  await page.getByRole("button", { name: "Imaging", exact: false }).click();
  await expect(
    page.getByRole("button", { name: "Apply reviewed findings" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Discard", exact: true }).click();
  await phrase(page, "CTA is completed.");
  await page.getByRole("button", { name: "Apply reviewed findings" }).click();
  await expect(page.getByLabel("CTA done", { exact: true })).toHaveValue("yes");
  await phrase(page, "Bot fill charge entered with yes");
  const state = await page.evaluate(
    () => JSON.parse(localStorage.getItem("encounter-guide:v1")!).context,
  );
  expect(state.values.charge_entered).toBeUndefined();
  await expect(page.locator(".voice-live-text")).toContainText("manual entry");
});
test("manual edits invalidate undo without overwriting newer field values", async ({
  page,
}) => {
  await phrase(page, "LVO is present.");
  await page
    .getByLabel("Large vessel occlusion present", { exact: true })
    .selectOption("no");
  await expect(
    page.getByRole("button", { name: "Undo", exact: true }),
  ).toBeDisabled();
  await phrase(page, "Bot undo");
  await expect(
    page.getByLabel("Large vessel occlusion present", { exact: true }),
  ).toHaveValue("no");
});

async function installSpeechMock(page: Page) {
  await page.addInitScript(() => {
    const w = window as any;
    w.__speechInstances = [];
    class Recognition {
      onresult: any;
      onstart: any;
      onend: any;
      onerror: any;
      aborted = false;
      constructor() {
        w.__speechInstances.push(this);
      }
      start() {
        this.onstart?.();
      }
      abort() {
        this.aborted = true;
      }
      emit(text: string, final = true, confidence = 0.95) {
        this.onresult?.({
          resultIndex: 0,
          results: [{ isFinal: final, 0: { transcript: text, confidence } }],
        });
      }
    }
    w.SpeechRecognition = Recognition;
  });
  await page.reload();
}
test("microphone final events apply once; interim text does not write; changing hospital aborts capture", async ({
  page,
}) => {
  await installSpeechMock(page);
  await page.getByRole("button", { name: "Start listening" }).click();
  await page.evaluate(() =>
    (window as any).__speechInstances.at(-1).emit("LVO is present", false),
  );
  await expect(page.locator(".voice-live-text")).toContainText(
    "HEARING · NOT APPLIED",
  );
  await expect(page.locator(".source-pill")).toHaveText("0 fields filled");
  await page.evaluate(() =>
    (window as any).__speechInstances.at(-1).emit("LVO is present", true),
  );
  await expect(
    page.getByLabel("Large vessel occlusion present", { exact: true }),
  ).toHaveValue("yes");
  const revision = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("encounter-guide:v1")!).context.revision,
  );
  await page.evaluate(() =>
    (window as any).__speechInstances.at(-1).emit("LVO is present", true),
  );
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("encounter-guide:v1")!).context
          .revision,
    ),
  ).toBe(revision);
  await page.getByLabel("Hospital", { exact: true }).selectOption("SYN-001");
  expect(
    await page.evaluate(() => (window as any).__speechInstances.at(-1).aborted),
  ).toBe(true);
  await expect(
    page.getByRole("button", { name: "Start listening" }),
  ).toBeVisible();
  await page.evaluate(() =>
    (window as any).__speechInstances.at(-1).emit("LVO is present", true),
  );
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("encounter-guide:v1")!).context.values,
    ),
  ).toEqual({});
});
test("low confidence microphone findings need review; permission failure recovers to stopped state", async ({
  page,
}) => {
  await installSpeechMock(page);
  await page.getByRole("button", { name: "Start listening" }).click();
  await page.evaluate(() =>
    (window as any).__speechInstances.at(-1).emit("LVO is present", true, 0.3),
  );
  await expect(page.locator(".voice-review")).toBeVisible();
  await expect(page.locator(".source-pill")).toHaveText("0 fields filled");
  await page.evaluate(() =>
    (window as any).__speechInstances
      .at(-1)
      .onerror?.({ error: "not-allowed" }),
  );
  await expect(page.getByRole("alert")).toContainText("permission was denied");
  await expect(
    page.getByRole("button", { name: "Start listening" }),
  ).toBeVisible();
});
test("Bot wake and spoken answers pause capture to prevent echo, then resume; voice can stop the microphone", async ({
  page,
}) => {
  await installSpeechMock(page);
  await page.evaluate(() => {
    const w = window as any;
    w.__utterances = [];
    Object.defineProperty(window, "speechSynthesis", {
      value: {
        cancel() {},
        speak(u: any) {
          w.__utterances.push(u);
        },
      },
      configurable: true,
    });
  });
  await page.getByRole("button", { name: "Start listening" }).click();
  await page.evaluate(() =>
    (window as any).__speechInstances.at(-1).emit("Bot"),
  );
  await expect(page.locator(".voice-status")).toContainText("Bot is speaking");
  expect(
    await page.evaluate(() => (window as any).__speechInstances.at(-1).aborted),
  ).toBe(true);
  await page.evaluate(() => (window as any).__utterances.at(-1).onend());
  await expect(page.locator(".voice-status")).toContainText(
    "Listening to your microphone",
  );
  await page.evaluate(() =>
    (window as any).__speechInstances.at(-1).emit("What is the LVO pathway?"),
  );
  await expect(page.locator(".ask-panel .card")).toContainText(
    "Outside coverage",
  );
  await expect(page.locator(".voice-status")).toContainText("Bot is speaking");
  await page.evaluate(() => (window as any).__utterances[0].onend());
  await expect(page.locator(".voice-status")).toContainText("Bot is speaking");
  await page.evaluate(() => (window as any).__utterances.at(-1).onend());
  await expect(page.locator(".voice-status")).toContainText(
    "Listening to your microphone",
  );
  await page.evaluate(() =>
    (window as any).__speechInstances.at(-1).emit("Bot stop listening"),
  );
  await expect(
    page.getByRole("button", { name: "Start listening" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("encounter-guide:v1")!).context.values,
    ),
  ).toEqual({});
});
