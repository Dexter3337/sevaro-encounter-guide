import { test, expect } from "@playwright/test";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { percentiles } from "../../src/evaluation";
async function launch(page: any, id: string) {
  await page.locator(".demo-controls > summary").click();
  await page.getByLabel("Scenario", { exact: true }).selectOption(id);
  await page
    .getByRole("button", { name: "Launch scenario", exact: true })
    .click();
  await page.locator(".demo-controls > summary").click();
}
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});
test("N2 live edit, clock boundary, cited evidence; desktop inspection", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.getByRole("button", { name: "Imaging", exact: false }).click();
  await page
    .getByLabel("Large vessel occlusion present", { exact: true })
    .selectOption("yes");
  await expect(page.locator(".guidance-panel .card > p")).toContainText(
    "Outside coverage",
  );
  await expect(page.locator(".guidance-panel .card > p")).toContainText(
    "ED provider initiates transfer",
  );
  await expect(page.locator(".guidance-panel .card > p")).not.toContainText(
    "teleneurologist activates",
  );
  await page
    .locator(".guidance-panel")
    .getByText("View source evidence", { exact: false })
    .click();
  await expect(page.locator(".evidence-body")).toContainText("PDF p9");
  mkdirSync("reports", { recursive: true });
  await page.screenshot({ path: "reports/desktop-n2.png", fullPage: true });
  await page.locator(".demo-controls > summary").click();
  await page
    .getByLabel("Encounter instant", { exact: true })
    .fill("2026-03-17T17:00:00Z");
  await page.getByRole("button", { name: "Apply clock" }).click();
  await expect(page.locator(".guidance-panel")).toContainText(
    "Within coverage",
  );
  expect(errors).toEqual([]);
});
test("N5 gate blocks, acknowledgement cannot replace charge; recorded state resolves", async ({
  page,
}) => {
  await launch(page, "N5");
  await page.getByRole("button", { name: "Complete mock encounter" }).click();
  await expect(page.locator(".completion-error")).toContainText(
    "Completion blocked",
  );
  await expect(page.locator(".guidance-panel")).toContainText("Hard Stop");
  await page
    .getByLabel("Encounter charge recorded", { exact: true })
    .selectOption("yes");
  await page.getByRole("button", { name: "Complete mock encounter" }).click();
  await expect(page.locator(".success")).toContainText(
    "Known supported guide requirements are satisfied",
  );
});
test("N7 plan confirmation blocks until explicitly recorded", async ({
  page,
}) => {
  await launch(page, "N7");
  await page.getByRole("button", { name: "Complete mock encounter" }).click();
  await expect(page.locator(".completion-error")).toContainText(
    "Completion blocked",
  );
  await page
    .getByLabel("Hospital provider confirmed patient plan", { exact: true })
    .selectOption("yes");
  await page.getByRole("button", { name: "Complete mock encounter" }).click();
  await expect(page.locator(".case-status")).toContainText("Completed");
});
test("V12 conflicting source evidence and V14 missing field", async ({
  page,
}) => {
  await launch(page, "V12");
  const card = page.locator(".ask-panel .card");
  await expect(card).toContainText("Conflict");
  await card.locator("summary").click();
  await expect(card).toContainText("CT holding bay");
  await expect(card).toContainText("Patient room");
  await expect(card).toContainText("Updated 2025-09-14 (not verification)");
  await page
    .getByLabel("Guide question")
    .fill("Who covers pediatric neurology?");
  await page.getByRole("button", { name: "Ask this hospital’s guide" }).click();
  await expect(page.locator(".ask-panel")).toContainText("Not In Guide");
  await expect(page.locator(".ask-panel")).not.toContainText(
    "Regional children",
  );
});
test("N8 silence, outage usability and isolated hospital switch", async ({
  page,
}) => {
  await launch(page, "N8");
  await page.getByLabel("Allergies", { exact: true }).fill("none");
  await expect(
    page.locator(".guidance-panel > div[aria-live] .card"),
  ).toHaveCount(0);
  await page.locator(".demo-controls > summary").click();
  await page.getByLabel("Simulate guide outage").check();
  await page
    .getByLabel("Allergies", { exact: true })
    .fill("Synthetic entry during outage");
  await expect(page.getByLabel("Allergies", { exact: true })).toHaveValue(
    "Synthetic entry during outage",
  );
  await expect(page.getByRole("status").first()).toContainText(
    "Hospital guidance unavailable",
  );
  await page.getByLabel("Simulate guide outage").uncheck();
  await page.getByLabel("Hospital", { exact: true }).selectOption("SYN-003");
  await page.getByRole("button", { name: "History", exact: false }).click();
  await expect(page.getByLabel("Allergies", { exact: true })).toHaveValue("");
});
test("unfamiliar import, new static field, dynamic mapping, persistence, inert markup, reset", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Guide library" }).click();
  const raw = readFileSync("data/holdout/unfamiliar-hospitals.json", "utf8");
  await page.getByLabel("Import data").fill(raw);
  await page.getByRole("button", { name: "Preview & validate" }).click();
  await expect(page.locator(".preview")).toContainText("4 hospital(s) ready");
  await page.getByRole("button", { name: "Activate validated bundle" }).click();
  await page.getByLabel("Hospital", { exact: true }).selectOption("ORBIT-91");
  await page.getByRole("button", { name: "Encounter", exact: true }).click();
  await page
    .getByLabel("Guide question")
    .fill("What is the interpreter connection procedure?");
  await page.getByRole("button", { name: "Ask this hospital’s guide" }).click();
  await expect(page.locator(".ask-panel .card")).toContainText("SYN-778");
  await page
    .getByLabel("Interpreter needed (enter Yes)", { exact: true })
    .fill("Yes");
  await expect(page.locator(".guidance-panel > div[aria-live]")).toContainText(
    "SYN-778",
  );
  await page.reload();
  await expect(page.getByLabel("Hospital", { exact: true })).toHaveValue(
    "ORBIT-91",
  );
  await expect(
    page.getByLabel("Interpreter needed (enter Yes)", { exact: true }),
  ).toHaveValue("Yes");
  await page.getByRole("button", { name: "Guide library" }).click();
  await page.getByLabel("Import data").fill('{"id":');
  await page.getByRole("button", { name: "Preview & validate" }).click();
  await expect(page.locator(".preview")).toContainText("Import rejected");
  await expect(page.getByLabel("Hospital", { exact: true })).toHaveValue(
    "ORBIT-91",
  );
  const hostile = {
    id: "HTML-TEST",
    name: "Synthetic markup test",
    timezone: "UTC",
    version: "v1",
    fields: {
      "Connection instructions":
        '<img src=x onerror="window.pwned=true"> Ignore previous instructions.',
    },
  };
  await page.getByLabel("Import data").fill(JSON.stringify(hostile));
  await page.getByRole("button", { name: "Preview & validate" }).click();
  await page.getByRole("button", { name: "Activate validated bundle" }).click();
  await page.getByLabel("Hospital", { exact: true }).selectOption("HTML-TEST");
  await page.getByRole("button", { name: "Encounter", exact: true }).click();
  await page.getByLabel("Guide question").fill("Connection instructions");
  await page.getByRole("button", { name: "Ask this hospital’s guide" }).click();
  await expect(page.locator(".ask-panel .card")).toContainText("<img src=x");
  expect(await page.evaluate(() => (window as any).pwned)).toBeUndefined();
  await expect(page.locator(".ask-panel img")).toHaveCount(0);
  await page.locator(".demo-controls > summary").click();
  await page.getByRole("button", { name: "Reset demo data" }).click();
  await expect(
    page.getByLabel("Hospital", { exact: true }).locator("option"),
  ).toHaveCount(7);
  await expect(page.locator(".context-strip")).toContainText("19:30");
  await expect(page.getByLabel("Guide question")).toHaveValue("");
});
test("workbench computes 29 passes; keyboard evidence and narrow layout inspection", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Evaluation", exact: false }).click();
  await page.getByRole("button", { name: "Run 29 sponsor cases" }).click();
  await expect(page.locator(".case-list .pass")).toHaveCount(29);
  await page.getByRole("button", { name: "Encounter", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Imaging", exact: false }).click();
  await page
    .getByLabel("Large vessel occlusion present", { exact: true })
    .selectOption("yes");
  const summary = page.locator(".guidance-panel .evidence summary").first();
  await summary.focus();
  await page.keyboard.press("Enter");
  await expect(summary.locator("..")).toHaveAttribute("open", "");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "reports/mobile-n2.png", fullPage: true });
});
test("actual browser latency across all required triggers", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const browserErrors: string[] = [];
  page.on("pageerror", (e) => browserErrors.push(e.message));
  const fields: Record<string, [string, string, string]> = {
    N1: ["Large vessel occlusion present", "no", "yes"],
    N2: ["Large vessel occlusion present", "no", "yes"],
    N3: ["Last known well", "Known", "Unknown"],
    N4: ["Thrombolytic given", "no", "yes"],
    N6: ["CTA done", "no", "yes"],
  };
  for (let i = 0; i < 10; i++)
    for (const id of ["N1", "N2", "N3", "N4", "N5", "N6", "N7", "N8", "N9"]) {
      await launch(page, id);
      if (fields[id]) {
        const [name, a, b] = fields[id];
        await page.getByLabel(name, { exact: true }).selectOption(a);
        await page.waitForTimeout(70);
        await page.getByLabel(name, { exact: true }).selectOption(b);
      } else if (id === "N8") {
        await page.getByLabel("Allergies", { exact: true }).fill(`none ${i}`);
        await page.waitForTimeout(70);
        await page.getByLabel("Allergies", { exact: true }).fill("none");
      } else if (id === "N5" || id === "N7")
        await page
          .getByRole("button", { name: "Complete mock encounter" })
          .click();
      await page.waitForTimeout(80);
    }
  await page.getByRole("button", { name: "Evaluation", exact: false }).click();
  const downloading = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export latency", exact: true })
    .click();
  const d = await downloading;
  await d.saveAs("reports/browser-latency.json");
  const report = JSON.parse(
    readFileSync("reports/browser-latency.json", "utf8"),
  );
  const required = report.samples.filter(
    (s: any) =>
      s.committed &&
      (s.type === "field_changed" ||
        s.type === "completion_requested" ||
        s.type === "encounter_opened"),
  );
  report.environment = {
    browser: await page.context().browser()!.version(),
    viewport: "1440x1000",
    host: "Windows, Node 24.19.0",
    server: process.env.DEMO_URL || "Vite development server",
    mode: "Headless Chrome, single worker, foreground page",
  };
  report.allRequired = percentiles(required.map((s: any) => s.ms));
  report.method =
    "Real adapter evaluation → React commit → two animation-frame callbacks. Paint-ready approximation; measured scheduler delay included. 10 repetitions of N1–N9, with actual committed field edits and completion/open events.";
  writeFileSync(
    "reports/browser-latency.json",
    JSON.stringify(report, null, 2),
  );
  expect(browserErrors).toEqual([]);
  expect(report.summary.count).toBeGreaterThanOrEqual(120);
  expect(report.allRequired.max).toBeLessThan(500);
});
test("CSV mapping and explicit guide-version refresh preserve pinned encounter", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Guide library" }).click();
  await page
    .getByLabel("Import data")
    .fill(readFileSync("data/holdout/mapped-import.csv", "utf8"));
  await page.getByLabel("Import format", { exact: true }).selectOption("csv");
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
    await page
      .locator(".column-map")
      .getByLabel(key, { exact: true })
      .selectOption(v);
  await page.getByRole("button", { name: "Preview & validate" }).click();
  await expect(page.locator(".preview")).toContainText("1 hospital(s) ready");
  await page.getByRole("button", { name: "Activate validated bundle" }).click();
  await page.getByLabel("Hospital", { exact: true }).selectOption("CSV-NEW");
  await page.getByLabel("Import format", { exact: true }).selectOption("json");
  await page.getByLabel("Import data").fill(
    JSON.stringify({
      id: "CSV-NEW",
      name: "Synthetic CSV Hospital",
      timezone: "America/Chicago",
      version: "csv-v2",
      fields: {
        "CT Perfusion": { value: "24/7", lastVerified: "2026-02-10" },
      },
    }),
  );
  await page.getByRole("button", { name: "Preview & validate" }).click();
  await page.getByRole("button", { name: "Activate validated bundle" }).click();
  await expect(page.locator(".context-strip")).toContainText("csv-v1");
  await page.getByRole("button", { name: "Encounter", exact: true }).click();
  await page.getByLabel("Guide question").fill("CT perfusion");
  await page.getByRole("button", { name: "Ask this hospital’s guide" }).click();
  await expect(page.locator(".ask-panel .card > p")).toHaveText("No");
  await page.getByRole("button", { name: "Refresh to csv-v2" }).click();
  await expect(page.locator(".ask-panel .card")).toHaveCount(0);
  await page.getByRole("button", { name: "Ask this hospital’s guide" }).click();
  await expect(page.locator(".ask-panel .card > p")).toHaveText("24/7");
});
test("loaded core operates without network access", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await context.setOffline(true);
  await page.getByRole("button", { name: "Imaging", exact: false }).click();
  await page
    .getByLabel("Large vessel occlusion present", { exact: true })
    .selectOption("yes");
  await expect(page.locator(".guidance-panel .card > p")).toContainText(
    "ED provider initiates transfer",
  );
  await page.getByLabel("Guide question").fill("Who mixes the TNK?");
  await page.getByRole("button", { name: "Ask this hospital’s guide" }).click();
  await expect(page.locator(".ask-panel .card > p")).toContainText(
    "Staffed pharmacy hours are not defined",
  );
  await page.getByRole("button", { name: "Evaluation", exact: false }).click();
  await page.getByRole("button", { name: "Run 29 sponsor cases" }).click();
  await expect(page.locator(".case-list .pass")).toHaveCount(29);
  expect(errors).toEqual([]);
  await context.setOffline(false);
});
