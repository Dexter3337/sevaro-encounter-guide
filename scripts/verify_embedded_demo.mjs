import { chromium, expect } from "@playwright/test";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  reducedMotion: "reduce",
});
await page.goto("http://127.0.0.1:4173/presentation.html#slide-8");
const demo = page.frameLocator("#demoFrame");
await expect(
  demo.getByRole("heading", { name: "Intake details", exact: true }),
).toBeVisible();
await demo.getByRole("button", { name: "Imaging", exact: false }).click();
await demo
  .getByLabel("Large vessel occlusion present", { exact: true })
  .selectOption("yes");
await expect(demo.locator(".guidance-panel .card > p")).toContainText(
  "ED provider initiates transfer",
);
await page.screenshot({ path: "reports/mentor-live-demo.png", fullPage: true });
console.log(
  "Embedded demo automatically loads; actual LVO edit produces expected transfer guidance.",
);
await browser.close();
