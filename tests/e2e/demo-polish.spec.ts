import { test, expect } from "@playwright/test";
import { launch, pinClock } from "./helpers";

for (const size of [{ width: 1366, height: 768 }, { width: 1440, height: 900 }]) {
  test(`recorded demo, keywords and fullscreen preserve documentation at ${size.width}`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.goto("/");
    const reason = page.getByLabel("Reason for consult", { exact: true });
    await reason.fill("Synthetic weakness — keep this draft");
    const video = page.getByLabel("Recorded consultation demo", { exact: true });
    await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.readyState)).toBeGreaterThanOrEqual(2);
    expect(await video.evaluate((v: HTMLVideoElement) => v.muted && v.paused)).toBe(true);
    await page.getByRole("button", { name: "Play demo", exact: true }).click();
    await expect(page.getByRole("button", { name: "Pause demo", exact: true })).toBeVisible();
    await video.evaluate((v: HTMLVideoElement) => { v.currentTime = 12; });
    await expect(page.locator(".captured-keywords")).toContainText("Penicillin allergy");
    await page.getByRole("button", { name: "Pause demo", exact: true }).click();
    await page.getByRole("button", { name: "Fullscreen", exact: true }).click();
    await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);
    await page.evaluate(() => document.exitFullscreen());
    await expect(reason).toHaveValue("Synthetic weakness — keep this draft");
    await page.getByRole("button", { name: "History", exact: false }).click();
    await page.getByLabel("Allergies", { exact: true }).fill("Synthetic allergy");
    await page.getByRole("button", { name: "Intake", exact: false }).click();
    await expect(reason).toHaveValue("Synthetic weakness — keep this draft");
    await expect(page.getByRole("button", { name: "Ask the Guide", exact: true })).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1 && document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.getByRole("button", { name: "Preview camera", exact: true })).toBeInViewport();
    await page.screenshot({ path: `reports/polished-${size.width}.png` });
    const hospital = await page.getByLabel("Hospital", { exact: true }).inputValue();
    await page.getByRole("button", { name: "New encounter", exact: true }).click();
    await expect(reason).toHaveValue("");
    await expect(page.getByLabel("Hospital", { exact: true })).toHaveValue(hospital);
    await page.getByRole("button", { name: "History", exact: false }).click();
    await expect(page.getByLabel("Allergies", { exact: true })).toHaveValue("");
  });
}

test("failed feedback delivery says local only, never delivered", async ({ page }) => {
  await pinClock(page);
  await page.route("**/api/feedback", (route) => route.abort());
  await page.goto("/");
  await page.getByRole("button", { name: "Imaging", exact: false }).click();
  await page.getByLabel("Large vessel occlusion present", { exact: true }).selectOption("yes");
  const card = page.getByTestId("nudge-card");
  await card.getByRole("button", { name: "This looks wrong" }).click();
  await card.getByLabel("Information is out of date").check();
  await card.getByRole("textbox").fill("Synthetic test: coverage needs review.");
  await card.getByRole("button", { name: "Send report" }).click();
  await expect(card).toContainText("Saved on this device only");
  await expect(card).toContainText("not delivered");
  await expect(card).not.toContainText("Reported to the guide owner");
});

test("No charge blocks completion; an incomplete draft stays incomplete", async ({ page }) => {
  await pinClock(page);
  await page.goto("/");
  await launch(page, "N5");
  await page.getByLabel("Encounter charge recorded", { exact: true }).selectOption("no");
  await page.getByRole("button", { name: "Complete encounter", exact: true }).click();
  await expect(page.getByTestId("gate-banner")).toContainText("Charge Entry");
  await expect(page.locator(".case-status")).not.toContainText("Completed");
});
