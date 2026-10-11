import type { Page } from "@playwright/test";

// The app runs on the real clock. Browser tests pin it to the sponsor's
// reference evening — Tuesday 17 March 2026, 19:30 at Highland Valley
// (Chicago) — so coverage windows and freshness are the same on every run.
export const REFERENCE_INSTANT = "2026-03-18T00:30:00Z";
export async function pinClock(page: Page, at = REFERENCE_INSTANT) {
  await page.clock.setFixedTime(new Date(at));
}

export async function launch(page: Page, id: string) {
  await page.locator(".demo-controls > summary").click();
  await page.getByLabel("Scenario", { exact: true }).selectOption(id);
  await page.getByRole("button", { name: "Launch scenario", exact: true }).click();
  await page.locator(".demo-controls > summary").click();
}

// The guide column's three views.
export const openChatTab = (page: Page) =>
  page.getByRole("tab", { name: /Ask the guide/ }).click();
export const openContactsTab = (page: Page) =>
  page.getByRole("tab", { name: /Who to call/ }).click();
export const openGuidanceTab = (page: Page) =>
  page.getByRole("tab", { name: /Guidance/ }).click();

// The hospital zone is on the hospital clock, as its tooltip.
export const hospitalZone = (page: Page) =>
  page.getByTestId("hospital-clock").locator("small");
