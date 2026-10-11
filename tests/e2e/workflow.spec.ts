import { test, expect } from "@playwright/test";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
async function launch(page: any, id: string) {
  await page.locator(".demo-controls > summary").click();
  await page.getByLabel("Scenario", { exact: true }).selectOption(id);
  await page
    .getByRole("button", { name: "Launch scenario", exact: true })
    .click();
  await page.locator(".demo-controls > summary").click();
}
// A dock card by its guide field.
const card = (page: any, title: string) =>
  page
    .getByTestId("nudge-dock")
    .getByTestId("nudge-card")
    .filter({ has: page.locator("h3", { hasText: title }) });
const chat = (page: any) => page.getByTestId("chat-panel");
async function ask(page: any, question: string) {
  if (!(await chat(page).isVisible()))
    await page
      .getByRole("button", { name: "Ask this hospital’s guide" })
      .click();
  await chat(page)
    .getByPlaceholder("Ask about this hospital's guide…")
    .fill(question);
  await chat(page).getByRole("button", { name: "Ask", exact: true }).click();
}
// The answer card for the most recent question in the chat.
const answer = (page: any) =>
  chat(page).getByTestId("chat-turn").last().getByTestId("nudge-card");
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
  // A new advisory opens the dock by itself.
  await expect(page.getByTestId("nudge-dock")).toHaveAttribute(
    "data-state",
    "panel",
  );
  const lvo = card(page, "LVO Protocol");
  await expect(lvo.locator(".card-answer")).toContainText("Outside coverage");
  await expect(lvo.locator(".card-answer")).toContainText(
    "ED provider initiates transfer",
  );
  await expect(lvo.locator(".card-answer")).not.toContainText(
    "teleneurologist activates",
  );
  await expect(lvo.locator(".card-action")).toContainText(
    "ED provider initiates transfer",
  );
  await lvo.getByText("View source evidence", { exact: false }).click();
  await expect(lvo.locator(".evidence-body")).toContainText(
    "hospital_guides.json · LVO Protocol",
  );
  await expect(lvo.locator(".evidence-body")).toContainText(
    "Verified 2026-02-02",
  );
  // The field itself says there is guidance for it.
  await expect(
    page.locator('[data-field="lvo_present"]').getByTestId("field-marker"),
  ).toContainText("Advisory");
  mkdirSync("reports", { recursive: true });
  await page.screenshot({ path: "reports/desktop-n2.png", fullPage: true });
  await page.locator(".demo-controls > summary").click();
  await page
    .getByLabel("Encounter instant", { exact: true })
    .fill("2026-03-17T17:00:00Z");
  await page.getByRole("button", { name: "Apply clock" }).click();
  await expect(lvo.locator(".card-answer")).toContainText("Within coverage");
  expect(errors).toEqual([]);
});
test("N5 gate blocks, acknowledgement cannot replace charge; recorded state resolves", async ({
  page,
}) => {
  await launch(page, "N5");
  await page.getByRole("button", { name: "Complete mock encounter" }).click();
  const gate = page.getByTestId("gate-banner");
  await expect(gate).toHaveAttribute("role", "alert");
  await expect(gate).toContainText("Charge Entry");
  // A charge is the doctor's to record: there is no acknowledge route.
  await expect(gate.getByText("Acknowledge with a reason")).toHaveCount(0);
  await page
    .getByLabel("Encounter charge recorded", { exact: true })
    .selectOption("yes");
  await expect(gate).toHaveCount(0);
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
  await expect(page.getByTestId("gate-banner")).toContainText(
    "Consult Completion Rule",
  );
  await page
    .getByLabel("Hospital provider confirmed patient plan", { exact: true })
    .selectOption("yes");
  await page.getByRole("button", { name: "Complete mock encounter" }).click();
  await expect(page.locator(".case-status")).toContainText("Completed");
});
test("N7 can be released only with a written reason, which is shown", async ({
  page,
}) => {
  await launch(page, "N7");
  await page.getByRole("button", { name: "Complete mock encounter" }).click();
  const gate = page.getByTestId("gate-banner");
  const release = gate.getByRole("button", { name: "Acknowledge and complete" });
  await expect(release).toBeDisabled();
  await gate
    .getByLabel("Acknowledge with a reason")
    .fill("Plan confirmed by phone with the synthetic ED attending");
  await release.click();
  await expect(page.locator(".case-status")).toContainText("Completed");
  await expect(page.locator(".success")).toContainText(
    "acknowledged without confirmation",
  );
});
test("V12 conflicting source evidence and V14 missing field", async ({
  page,
}) => {
  await launch(page, "V12");
  const seed = chat(page).getByTestId("chat-seed");
  await expect(seed).toContainText("Conflict");
  await expect(seed).toContainText("CT holding bay");
  await expect(seed).toContainText("Patient room");
  await seed.locator(".evidence summary").click();
  await expect(seed).toContainText("Updated 2025-09-14 (not verification)");
  await ask(page, "Who covers pediatric neurology?");
  await expect(answer(page)).toContainText("Not In Guide");
  await expect(answer(page).locator(".card-answer")).toContainText(
    "Not available in this hospital's guide.",
  );
  await expect(chat(page)).not.toContainText("Regional children");
  // The next rung: a person, with the reason carried over.
  await chat(page).getByRole("button", { name: /Call someone/ }).click();
  await expect(page.getByTestId("contacts-sheet")).toContainText(
    "Guide doesn't cover Pediatric Neurology",
  );
});
test("N8 silence, outage usability and isolated hospital switch", async ({
  page,
}) => {
  await launch(page, "N8");
  await page.getByLabel("Allergies", { exact: true }).fill("none");
  await expect(page.getByTestId("nudge-card")).toHaveCount(0);
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
  await ask(page, "What is the interpreter connection procedure?");
  await expect(answer(page)).toContainText("SYN-778");
  await chat(page).getByRole("button", { name: "Close the guide chat" }).click();
  await page
    .getByLabel("Interpreter needed (enter Yes)", { exact: true })
    .fill("Yes");
  await page
    .locator('[data-field="interpreter_needed"]')
    .getByTestId("field-marker")
    .click();
  await expect(page.getByTestId("nudge-dock")).toContainText("SYN-778");
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
  await ask(page, "Connection instructions");
  await expect(answer(page)).toContainText("<img src=x");
  expect(await page.evaluate(() => (window as any).pwned)).toBeUndefined();
  await expect(chat(page).locator("img")).toHaveCount(0);
  await page.locator(".demo-controls > summary").click();
  await page.getByRole("button", { name: "Reset demo data" }).click();
  await expect(
    page.getByLabel("Hospital", { exact: true }).locator("option"),
  ).toHaveCount(7);
  await expect(page.locator(".context-strip")).toContainText("19:30");
  await expect(chat(page)).toHaveCount(0);
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
  const summary = card(page, "LVO Protocol").locator(".evidence summary");
  await summary.focus();
  await page.keyboard.press("Enter");
  await expect(summary.locator("..")).toHaveAttribute("open", "");
  // Esc returns the panel to the pill.
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("nudge-dock")).toHaveAttribute(
    "data-state",
    "pill",
  );
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
    host: `Windows, Node ${process.versions.node}`,
    server: process.env.DEMO_URL || "Vite development server",
    mode: "Headless Chrome, single worker, foreground page",
  };
  // Keep the browser harness independent of the app engine's JSON modules.
  // These statistics describe the measured samples exported by the live UI.
  const durations = required.map((s: any) => s.ms).sort((a: number, b: number) => a - b);
  report.allRequired = {
    count: durations.length,
    p50: durations[Math.max(0, Math.ceil(durations.length * 0.5) - 1)] || 0,
    p95: durations[Math.max(0, Math.ceil(durations.length * 0.95) - 1)] || 0,
    max: durations.at(-1) || 0,
  };
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
  await ask(page, "CT perfusion");
  await expect(answer(page).locator(".card-answer")).toHaveText("No");
  // A new guide version clears the thread: no answer from the old version
  // may stay on screen.
  await page.getByRole("button", { name: "Refresh to csv-v2" }).click();
  await expect(chat(page).getByTestId("chat-turn")).toHaveCount(0);
  await ask(page, "CT perfusion");
  await expect(answer(page).locator(".card-answer")).toHaveText("24/7");
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
  await expect(card(page, "LVO Protocol").locator(".card-answer")).toContainText(
    "ED provider initiates transfer",
  );
  await ask(page, "Who mixes the TNK?");
  await expect(answer(page).locator(".card-answer")).toContainText(
    "Staffed pharmacy hours are not defined",
  );
  await page.getByRole("button", { name: "Evaluation", exact: false }).click();
  await page.getByRole("button", { name: "Run 29 sponsor cases" }).click();
  await expect(page.locator(".case-list .pass")).toHaveCount(29);
  expect(errors).toEqual([]);
  await context.setOffline(false);
});
test("order guidance exists before focus and remains after unrelated editing", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: "Recommendation", exact: false })
    .click();
  await expect(card(page, "Order Entry")).toHaveCount(1);
  await page
    .getByLabel("Assessment / plan", { exact: true })
    .fill("Observe clinically");
  await expect(card(page, "Order Entry")).toHaveCount(1);
});
