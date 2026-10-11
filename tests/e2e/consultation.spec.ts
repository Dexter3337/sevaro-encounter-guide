import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("consultation split, anticipatory CTA preview and expanded guidance never cover the form", async ({
  page,
}) => {
  const video = page.getByTestId("consultation-pane");
  const form = page.locator(".caselog");
  const left = await video.boundingBox(),
    right = await form.boundingBox();
  expect(left!.x + left!.width).toBeLessThan(right!.x);
  expect(Math.abs(left!.width - right!.width)).toBeLessThan(2);
  await expect(video).toContainText("No live Sevaro call is connected");
  await page.screenshot({
    path: "reports/consultation-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Imaging", exact: false }).click();
  await page.getByLabel("CTA done", { exact: true }).focus();
  await expect(page.getByTestId("nudge-dock")).toHaveAttribute(
    "data-state",
    "peek",
  );
  await expect(page.getByLabel("CTA done", { exact: true })).toHaveValue("");
  await expect(page.getByTestId("dock-peek")).toContainText("CTA Head/Neck");
  await page
    .getByLabel("Large vessel occlusion present", { exact: true })
    .focus();
  await page
    .getByLabel("Large vessel occlusion present", { exact: true })
    .selectOption("yes");
  await expect(page.getByTestId("nudge-dock")).toHaveAttribute(
    "data-state",
    "panel",
  );
  const panel = await page.getByTestId("dock-panel").boundingBox(),
    body = await form.boundingBox();
  expect(body!.y + body!.height).toBeLessThanOrEqual(panel!.y);
  const active = await page
    .getByLabel("Large vessel occlusion present", { exact: true })
    .boundingBox();
  expect(active!.y + active!.height).toBeLessThanOrEqual(panel!.y);
  await page.screenshot({
    path: "reports/consultation-guidance.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Collapse guidance" }).click();
  await expect(page.getByTestId("dock-pill")).toBeFocused();
});

test("connected chat answers multiple questions and exposes typo correction", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Ask this hospital’s guide" }).click();
  const chat = page.getByTestId("chat-panel");
  await chat.getByRole("textbox").fill("lvo protcol? EEG and MRI?");
  await chat.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(chat.getByTestId("chat-turn")).toHaveCount(3);
  await expect(chat).toContainText("Interpreted as:");
  await expect(chat).toContainText("Local guide answers");
  // Off-screen accessible labels must stay within the scrolling thread.
  expect(
    await page.evaluate(
      () =>
        document.body.scrollHeight -
        document.getElementById("root")!.getBoundingClientRect().height,
    ),
  ).toBeLessThan(2);
  await page.screenshot({
    path: "reports/consultation-chat.png",
    fullPage: true,
  });
  await chat.getByRole("textbox").press("Escape");
  await expect(chat).toHaveCount(0);
});

test("390px layout keeps video compact and all surfaces within the viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("button", { name: "Show video workspace" }),
  ).toBeVisible();
  await expect(page.locator(".video-stage")).not.toBeVisible();
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
        const paint = window.setInterval(
          () => canvas.getContext("2d")!.fillRect(0, 0, 64, 64),
          50,
        );
        window.setTimeout(() => window.clearInterval(paint), 10000);
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

test("wheel scrolls the form first, then hands off to the page at both edges", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Imaging", exact: false }).click();
  const form = page.locator(".caselog");
  await form.evaluate((e) => {
    e.scrollTop = 0;
  });
  await page.evaluate(() => window.scrollTo(0, 0));
  const box = (await form.boundingBox())!;
  await page.mouse.move(box.x + box.width - 35, box.y + 120);
  await page.mouse.wheel(0, 100);
  await expect.poll(() => form.evaluate((e) => e.scrollTop)).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await form.evaluate((e) => {
    e.scrollTop = e.scrollHeight;
  });
  await page.mouse.wheel(0, 180);
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeGreaterThan(0);
  await form.evaluate((e) => {
    e.scrollTop = 0;
  });
  const pageY = await page.evaluate(() => window.scrollY);
  const moved = (await form.boundingBox())!;
  await page.mouse.move(
    moved.x + moved.width - 35,
    Math.max(80, moved.y + 120),
  );
  await page.mouse.wheel(0, -100);
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeLessThan(pageY);
});

test("companion opens usable chat on every step, with or without guidance", async ({
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
    await page
      .getByRole("button", { name: "Open guide companion", exact: true })
      .click();
    const chat = page.getByTestId("chat-panel");
    await expect(chat.getByRole("textbox")).toBeFocused();
    await expect(chat.getByRole("textbox")).toBeInViewport();
    await chat.getByRole("textbox").fill("EEG?");
    await chat.getByRole("button", { name: "Ask", exact: true }).click();
    await expect(chat.getByTestId("chat-turn").last()).toContainText("EEG");
    await chat.getByRole("button", { name: "Close the guide chat" }).click();
  }
  await page.getByRole("button", { name: "Imaging", exact: false }).click();
  await page.getByRole("button", { name: "Review hospital guidance" }).click();
  await expect(page.getByTestId("dock-panel")).toBeVisible();
  await page
    .getByRole("button", { name: "Open guide companion", exact: true })
    .click();
  await expect(
    page.getByTestId("chat-panel").getByRole("textbox"),
  ).toBeFocused();
});
