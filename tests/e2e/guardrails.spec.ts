import { test, expect } from "@playwright/test";
import { pinClock, launch, openChatTab, hospitalZone } from "./helpers";

// The guardrails a judge sees on screen. Each test is named for the guardrail
// it protects (numbering follows MACHINE_E_GUARDRAILS.md, E1).
test.beforeEach(async ({ page }) => {
  await pinClock(page);
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test("G5 a disagreement shows both sources, with no visual winner", async ({ page }) => {
  await page.getByLabel("Hospital", { exact: true }).selectOption("SYN-002");
  const card = page.getByTestId("storyboard-card");
  await expect(card).toContainText("Differs from the guide");
  await expect(card).toContainText("Guide says: CT holding bay for stroke alerts");
  await expect(card).toContainText("Patient room");
  await card.getByRole("button", { name: "See both sources" }).click();
  const seen = page.getByTestId("nudge-dock").or(page.getByTestId("chat-panel"));
  await expect(seen.first()).toContainText("CT holding bay");
  await expect(seen.first()).toContainText("Patient room");
});

test("G6 no false alarm when the sources agree", async ({ page }) => {
  await page.getByLabel("Hospital", { exact: true }).selectOption("SYN-005");
  const card = page.getByTestId("storyboard-card");
  await expect(card.locator('[data-verdict="agrees"]')).toHaveCount(1);
  await expect(card).not.toContainText("Differs");
  await expect(page.locator('[data-status="conflict"]')).toHaveCount(0);
});

test("G7 silence when nothing applies", async ({ page }) => {
  await launch(page, "N8");
  await page.getByLabel("Allergies", { exact: true }).fill("none");
  await expect(page.getByTestId("nudge-dock")).toHaveCount(0);
  await expect(page.getByTestId("field-marker")).toHaveCount(0);
});

test("G8 information never opens the panel by itself", async ({ page }) => {
  await page.getByLabel("Hospital", { exact: true }).selectOption("SYN-002");
  const dock = page.getByTestId("nudge-dock");
  await expect(dock).toHaveAttribute("data-state", "pill");
  await page.getByLabel("Reason for consult", { exact: true }).fill("Synthetic stroke alert");
  await expect(dock).toHaveAttribute("data-state", "pill");
});

test("G14 the caselog survives a guidance failure", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/?guidance-fail");
  await page.getByRole("button", { name: "Imaging", exact: false }).click();
  const lvo = page.getByLabel("Large vessel occlusion present", { exact: true });
  await lvo.selectOption("yes");
  await expect(lvo).toHaveValue("yes");
  await expect(page.getByTestId("nudge-dock")).toContainText("Guidance unavailable");
  await page.getByRole("button", { name: "History", exact: false }).click();
  await page.getByLabel("Allergies", { exact: true }).fill("Still editable");
  await expect(page.getByLabel("Allergies", { exact: true })).toHaveValue("Still editable");
  expect(errors).toEqual([]);
});

test("alien dry run: two unfamiliar hospitals load live and behave", async ({ page }) => {
  await page.getByRole("button", { name: "Guide library" }).click();
  await page
    .getByLabel("Choose import files")
    .setInputFiles([
      "tests/fixtures/alien/st-aubin_storyboard.json",
      "tests/fixtures/alien/st-aubin_guides.json",
      "tests/fixtures/alien/nordhaven_guides.json",
      "tests/fixtures/alien/nordhaven_storyboard.json",
    ]);
  await page.getByRole("button", { name: "Preview & validate" }).click();
  await expect(page.locator(".preview")).toContainText("2 hospital(s) ready");
  await page.getByRole("button", { name: "Activate validated bundle" }).click();
  await page
    .getByRole("button", { name: "Open Nordhaven Medical (synthetic) in an encounter" })
    .click();
  await expect(hospitalZone(page)).toHaveAttribute("title", "Europe/London");
  // Three storyboard rows for one field, two disagreeing: one conflict, all rows shown.
  await expect(page.getByTestId("storyboard-row")).toHaveCount(3);
  await expect(page.getByTestId("storyboard-card")).toContainText("Ward side room");
  // Hostile text is shown as text.
  await openChatTab(page);
  const chat = page.getByTestId("chat-panel");
  await chat.getByPlaceholder("Ask about this hospital's guide…").fill("Connection instructions");
  await chat.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(chat).toContainText("<img src=x");
  await expect(chat.locator("img")).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).pwned)).toBeUndefined();
  // The other hospital answers from its own guide only.
  await page.getByLabel("Hospital", { exact: true }).selectOption("ALN-001");
  await chat.getByPlaceholder("Ask about this hospital's guide…").fill("What should I title the note?");
  await chat.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(chat).toContainText("Telestroke Consultation - Remote");
  await expect(chat).not.toContainText("<img src=x");
});
