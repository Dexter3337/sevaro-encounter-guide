import { test, expect } from "@playwright/test";
import { pinClock, openChatTab } from "./helpers";

test.beforeEach(async ({ page }) => {
  await pinClock(page);
  await page.goto("/");
});

type Box = { x: number; y: number; width: number; height: number };
const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

test("one screen: video, caselog and guide side by side, nothing covering the form", async ({
  page,
}) => {
  const video = page.getByTestId("consultation-pane");
  const form = page.locator(".eg-case");
  const guide = page.locator(".eg-guide");
  const [v, f, g] = [
    (await video.boundingBox())!,
    (await form.boundingBox())!,
    (await guide.boundingBox())!,
  ];
  expect(v.x + v.width).toBeLessThan(f.x);
  expect(f.x + f.width).toBeLessThan(g.x);
  await expect(video).toContainText("No live Sevaro call is connected");
  // The page itself does not scroll on a laptop screen.
  expect(
    await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight + 1),
  ).toBe(true);
  await page.screenshot({ path: "reports/consultation-desktop.png" });

  await page.getByRole("button", { name: "Imaging", exact: false }).click();
  await page.getByLabel("CTA done", { exact: true }).focus();
  // Looking at a field shows its guidance, and only its guidance, opened.
  await expect(page.getByTestId("nudge-dock")).toHaveAttribute("data-state", "peek");
  await expect(page.getByTestId("dock-peek")).toContainText("CTA Head/Neck");
  await expect(page.getByTestId("dock-peek")).toContainText("For CTA done");
  await expect(page.getByTestId("dock-peek").getByTestId("nudge-card")).toHaveCount(1);
  await expect(page.getByLabel("CTA done", { exact: true })).toHaveValue("");

  const lvo = page.getByLabel("Large vessel occlusion present", { exact: true });
  await lvo.focus();
  await lvo.selectOption("yes");
  await expect(page.getByTestId("nudge-dock")).toHaveAttribute("data-state", "panel");
  const panel = (await page.getByTestId("dock-panel").boundingBox())!;
  expect(overlaps(panel, (await form.boundingBox())!)).toBe(false);
  expect(overlaps(panel, (await lvo.boundingBox())!)).toBe(false);
  // Exactly one rule is open at a time.
  await expect(page.getByTestId("nudge-dock").getByTestId("nudge-card")).toHaveCount(1);
  await page.screenshot({ path: "reports/consultation-guidance.png" });
  await page.getByRole("button", { name: "Close LVO Protocol" }).click();
  await expect(page.getByTestId("nudge-dock")).toHaveAttribute("data-state", "pill");
  await expect(page.getByTestId("nudge-card")).toHaveCount(0);
});

test("connected chat answers multiple questions and exposes typo correction", async ({
  page,
}) => {
  await openChatTab(page);
  const chat = page.getByTestId("chat-panel");
  await chat.getByRole("textbox").fill("lvo protcol? EEG and MRI?");
  await chat.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(chat.getByTestId("chat-turn")).toHaveCount(3);
  await expect(chat).toContainText("Interpreted as:");
  await expect(chat).toContainText("Local guide answers");
  // The answers scroll inside the column; the page does not grow.
  expect(
    await page.evaluate(
      () =>
        document.body.scrollHeight -
        document.getElementById("root")!.getBoundingClientRect().height,
    ),
  ).toBeLessThan(2);
  await expect(chat.getByRole("button", { name: "Ask", exact: true })).toBeInViewport();
  await page.screenshot({ path: "reports/consultation-chat.png" });
  await chat.getByRole("textbox").press("Escape");
  await expect(chat).toHaveCount(0);
});

test("390px layout keeps video folded and all surfaces within the viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.getByRole("button", { name: "Show video" })).toBeVisible();
  await expect(page.locator(".video-stage")).toHaveCount(0);
  await page.getByRole("button", { name: "Imaging", exact: false }).click();
  await page.getByLabel("CTA done", { exact: true }).focus();
  await expect(page.getByTestId("dock-peek")).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.screenshot({
    path: "reports/consultation-mobile.png",
    fullPage: true,
  });
});

test("video and navigation fold away to give the form room, and come back", async ({
  page,
}) => {
  const before = (await page.locator(".eg-case").boundingBox())!;
  await page.getByRole("button", { name: "Hide video" }).click();
  await page.getByRole("button", { name: "Hide navigation" }).click();
  const after = (await page.locator(".eg-case").boundingBox())!;
  expect(after.width).toBeGreaterThan(before.width + 200);
  expect(after.x).toBeLessThan(before.x);
  // Remembered on this device.
  await page.reload();
  await expect(page.getByRole("button", { name: "Show video" })).toBeVisible();
  await page.getByRole("button", { name: "Show video" }).click();
  await page.getByRole("button", { name: "Show navigation" }).click();
  await expect(page.getByTestId("consultation-pane")).toBeVisible();
  await expect(page.getByRole("button", { name: "Guide library" })).toBeVisible();
});

test("camera permission failure is recoverable without blocking documentation", async ({
  page,
}) => {
  await page.evaluate(() =>
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      value: async () => {
        throw new DOMException("Denied", "NotAllowedError");
      },
      configurable: true,
    }),
  );
  await page.getByRole("button", { name: "Preview camera" }).click();
  await expect(page.getByTestId("consultation-pane")).toContainText(
    "Camera preview is unavailable",
  );
  await expect(
    page.getByRole("button", { name: "Preview camera" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Imaging", exact: false }).click();
  await page.getByLabel("CTA done", { exact: true }).selectOption("no");
  await expect(page.getByLabel("CTA done", { exact: true })).toHaveValue("no");
});

test("local preview requests no microphone and stops tracks on stop and navigation", async ({
  page,
}) => {
  await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    canvas.getContext("2d")!.fillRect(0, 0, 64, 64);
    const streams: MediaStream[] = [];
    const requests: MediaStreamConstraints[] = [];
    Object.assign(window, {
      previewStreams: streams,
      previewRequests: requests,
    });
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      configurable: true,
      value: async (constraints: MediaStreamConstraints) => {
        requests.push(constraints);
        const stream = canvas.captureStream(10);
        streams.push(stream);
        return stream;
      },
    });
  });
  expect(
    await page.evaluate(() => (window as any).previewRequests.length),
  ).toBe(0);
  await page.getByRole("button", { name: "Preview camera" }).click();
  await expect(
    page.getByRole("button", { name: "Stop preview" }),
  ).toBeEnabled();
  expect(await page.evaluate(() => (window as any).previewRequests)).toEqual([
    { video: true, audio: false },
  ]);
  await page.getByRole("button", { name: "Stop preview" }).click();
  expect(
    await page.evaluate(
      () => (window as any).previewStreams[0].getTracks()[0].readyState,
    ),
  ).toBe("ended");
  await page.getByRole("button", { name: "Preview camera" }).click();
  await expect(
    page.getByRole("button", { name: "Stop preview" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: /Guide library/ }).click();
  expect(
    await page.evaluate(
      () => (window as any).previewStreams[1].getTracks()[0].readyState,
    ),
  ).toBe("ended");
});

test("the form scrolls on its own and the page never moves", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 640 });
  await page.getByRole("button", { name: "Recommendation", exact: false }).click();
  const body = page.locator(".eg-case-body");
  await expect
    .poll(() => body.evaluate((e) => e.scrollHeight > e.clientHeight))
    .toBe(true);
  const box = (await body.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, 200);
  await expect.poll(() => body.evaluate((e) => e.scrollTop)).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  // The step buttons and Next stay on screen while the form scrolls.
  await expect(page.getByRole("button", { name: /Next: Note/ })).toBeInViewport();
  await expect(page.getByRole("button", { name: "Imaging", exact: false })).toBeInViewport();
});

test("the guide chat works on every step, with or without guidance", async ({
  page,
}) => {
  for (const step of [
    "Intake",
    "History",
    "Imaging",
    "Recommendation",
    "Note",
    "Sign Off",
  ]) {
    await page
      .getByRole("button", { name: new RegExp(step, "i") })
      .first()
      .click();
    await openChatTab(page);
    const chat = page.getByTestId("chat-panel");
    await expect(chat.getByRole("textbox")).toBeFocused();
    await expect(chat.getByRole("textbox")).toBeInViewport();
    await chat.getByRole("textbox").fill("EEG?");
    await chat.getByRole("button", { name: "Ask", exact: true }).click();
    await expect(chat.getByTestId("chat-turn").last()).toContainText("EEG");
    await chat.getByRole("button", { name: "Close the guide chat" }).click();
  }
  await page.getByRole("button", { name: "Imaging", exact: false }).click();
  await page
    .locator('[data-field="cta_done"]')
    .getByTestId("field-marker")
    .click();
  await expect(page.getByTestId("dock-panel")).toBeVisible();
  await openChatTab(page);
  await expect(
    page.getByTestId("chat-panel").getByRole("textbox"),
  ).toBeFocused();
});
