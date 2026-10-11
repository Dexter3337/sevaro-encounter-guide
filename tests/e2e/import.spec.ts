import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";

// The judges hand over two files for a hospital we have never seen and we load
// them live. This is that gesture, through the real screen.
const guide = "data/fixtures/syn-108/hospital_guides.json";
const storyboard = "data/fixtures/syn-108/storyboard_notes.json";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Guide library" }).click();
});

test("two files for an unseen hospital, in one drop, become one hospital with its conflict", async ({
  page,
}) => {
  await page.getByLabel("Choose import files").setInputFiles([storyboard, guide]);
  await expect(page.locator(".drop-files li")).toHaveCount(2);
  await page.getByRole("button", { name: "Preview & validate" }).click();
  const preview = page.locator(".preview");
  await expect(preview).toContainText("1 hospital(s) ready");
  await expect(page.getByTestId("preview-files")).toContainText(
    "storyboard_notes.json · 3 storyboard row(s)",
  );
  await expect(page.getByTestId("preview-files")).toContainText(
    "hospital_guides.json · 1 guide(s)",
  );
  await expect(preview).toContainText(
    "Riverbend Community Hospital: 24 guide fields + 3 storyboard rows; 1 conflict.",
  );
  await page.getByRole("button", { name: "Activate validated bundle" }).click();
  await page
    .getByRole("button", { name: "Open Riverbend Community Hospital in an encounter" })
    .click();
  await expect(page.locator(".context-strip")).toContainText("America/Phoenix");
  await expect(page.getByLabel("Hospital", { exact: true })).toHaveValue("SYN-108");
});

test("storyboard first is held, then attaches when the guide arrives", async ({ page }) => {
  await page.getByLabel("Choose import files").setInputFiles([storyboard]);
  await page.getByRole("button", { name: "Preview & validate" }).click();
  await expect(page.locator(".preview")).toContainText("held");
  await page.getByRole("button", { name: "Hold rows for later" }).click();
  await expect(page.getByTestId("held-rows")).toContainText(
    "3 storyboard row(s) for SYN-108",
  );
  // Survives a reload.
  await page.reload();
  await page.getByRole("button", { name: "Guide library" }).click();
  await expect(page.getByTestId("held-rows")).toBeVisible();
  await page.getByLabel("Choose import files").setInputFiles([guide]);
  await page.getByRole("button", { name: "Preview & validate" }).click();
  await expect(page.locator(".preview")).toContainText(
    "24 guide fields + 3 storyboard rows; 1 conflict.",
  );
  await page.getByRole("button", { name: "Activate validated bundle" }).click();
  await expect(page.getByTestId("held-rows")).toHaveCount(0);
});

test("an uploaded CSV with unfamiliar headers is mapped on screen, not guessed", async ({
  page,
}) => {
  await page
    .getByLabel("Choose import files")
    .setInputFiles(["data/holdout/mapped-import.csv"]);
  const name = "mapped-import.csv";
  // Nothing matches "Site Code" automatically, so the mapper is open and empty.
  await expect(page.getByLabel(`${name} hospitalId`, { exact: true })).toHaveValue("");
  const map = {
    hospitalId: "Site Code",
    name: "Site Name",
    timezone: "Zone",
    field: "Rule Label",
    raw: "Original Text",
    lastVerified: "Checked",
    version: "Revision",
  };
  for (const [key, v] of Object.entries(map))
    await page.getByLabel(`${name} ${key}`, { exact: true }).selectOption(v);
  await page.getByRole("button", { name: "Preview & validate" }).click();
  await expect(page.locator(".preview")).toContainText("1 hospital(s) ready");
  await page.getByRole("button", { name: "Activate validated bundle" }).click();
  await expect(
    page.getByLabel("Hospital", { exact: true }).locator("option"),
  ).toHaveCount(8);
});

test("one broken file rejects the whole drop and names the file", async ({ page }) => {
  await page.getByLabel("Choose import files").setInputFiles([
    { name: "hospital_guides.json", mimeType: "application/json", buffer: readFileSync(guide) },
    { name: "broken.json", mimeType: "application/json", buffer: Buffer.from('[{"hospital_id":') },
  ]);
  await page.getByRole("button", { name: "Preview & validate" }).click();
  await expect(page.locator(".preview")).toContainText("Import rejected");
  await expect(page.locator(".preview")).toContainText("broken.json is not valid JSON");
  await expect(page.getByRole("button", { name: "Activate validated bundle" })).toBeDisabled();
  await expect(
    page.getByLabel("Hospital", { exact: true }).locator("option"),
  ).toHaveCount(7);
});
