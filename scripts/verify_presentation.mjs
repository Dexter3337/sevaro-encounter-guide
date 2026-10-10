import { chromium } from "@playwright/test";
import { writeFile } from "node:fs/promises";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const base = process.env.DEMO_URL || "http://127.0.0.1:4173";
const results = [];
function check(ok, name) {
  if (!ok) throw new Error(name);
  results.push(name);
}
await page.goto(base + "/presentation.html");
check((await page.locator(".slide").count()) === 12, "12 slides available");
for (let i = 0; i < 12; i++) {
  check(
    (await page.locator(".slide.active").count()) === 1,
    "One active slide " + (i + 1),
  );
  check(
    (await page.locator("#counter").innerText()).includes(
      String(i + 1).padStart(2, "0") + " / 12",
    ),
    "Counter " + (i + 1),
  );
  check(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    "No desktop overflow " + (i + 1),
  );
  if (i === 0 || i === 3) {
    await page.locator(".slide.active").evaluate(async (el) => {
      await Promise.all(
        el
          .getAnimations({ subtree: true })
          .filter((a) => a.effect.getComputedTiming().iterations !== Infinity)
          .map((a) => a.finished),
      );
    });
    await page.screenshot({
      path:
        i === 0 ? "reports/mentor-opening.png" : "reports/mentor-workflow.png",
      fullPage: true,
    });
  }
  if (i === 7) {
    await page.getByRole("button", { name: "Show interactive demo" }).click();
    await page
      .frameLocator("#demoFrame")
      .getByRole("heading", { name: "Intake details", exact: true })
      .waitFor();
    check(
      await page.locator("#demoFrame").isVisible(),
      "Embedded real app loads",
    );
    await page
      .getByRole("button", { name: "Show evidence screenshot" })
      .click();
    check(
      await page.locator("#demoShot").isVisible(),
      "Evidence fallback restores",
    );
  }
  if (i < 11)
    await page.getByRole("button", { name: "Next slide", exact: true }).click();
}
await page.getByRole("button", { name: "Speaker notes", exact: true }).click();
check(await page.locator("#notes").isVisible(), "Speaker notes toggle");
await page.getByRole("button", { name: "Motion on", exact: true }).click();
check(
  (await page.locator("body").getAttribute("class")) === "motion-off",
  "Motion can be disabled",
);
await page.keyboard.press("Home");
check(
  (await page.locator("#counter").innerText()).startsWith("01"),
  "Keyboard Home",
);
await page.keyboard.press("ArrowRight");
check(
  (await page.locator("#counter").innerText()).startsWith("02"),
  "Keyboard arrow",
);
await page.getByRole("button", { name: "Speaker notes", exact: true }).click();
await page.pdf({
  path: "public/mentor-presentation.pdf",
  format: "A4",
  landscape: true,
  printBackground: true,
});
await page.setViewportSize({ width: 390, height: 844 });
for (let i = 1; i <= 12; i++) {
  await page.goto(base + "/presentation.html#slide-" + i);
  check(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    "No mobile overflow " + i,
  );
}
await page.goto(base + "/workflow.html");
check(
  (await page.getByRole("heading", { level: 2 }).count()) === 11,
  "All 11 workflow sections rendered",
);
check(
  await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth,
  ),
  "Workflow mobile overflow absent",
);
await page.setViewportSize({ width: 1440, height: 1000 });
await page.screenshot({
  path: "reports/detailed-workflow.png",
  fullPage: true,
});
for (const asset of [
  "APP_WORKFLOW.md",
  "TEST_RESULTS.md",
  "unfamiliar-hospitals.json",
  "mapped-import.csv",
  "desktop-n2.png",
]) {
  check(
    (await page.request.get(base + "/" + asset)).ok(),
    "Public asset " + asset,
  );
}
check(errors.length === 0, "No browser script errors");
await writeFile(
  "reports/presentation-checks.json",
  JSON.stringify(
    {
      base,
      checkedAt: new Date().toISOString(),
      checks: results,
      passed: results.length,
      errors,
    },
    null,
    2,
  ),
);
console.log(JSON.stringify({ passed: results.length, errors }));
await browser.close();
