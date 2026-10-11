// Read-only repository and production-preview evidence for the Machine 3 review.
// Run after `pnpm build` and `pnpm preview`: node scripts/audit_machine3.mjs
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chromium } from "@playwright/test";

const root = path.resolve(import.meta.dirname, "..");
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" })
  .split("\0").filter(Boolean);
const inventory = tracked.map((name) => {
  const bytes = fs.readFileSync(path.join(root, name));
  const text = /\.(?:tsx?|mjs|py|md|css|html|jsonl?|csv|ya?ml|toml|ps1)$/.test(name);
  if (name.endsWith(".json")) JSON.parse(bytes.toString("utf8"));
  if (name.endsWith(".jsonl")) {
    for (const line of bytes.toString("utf8").split(/\r?\n/).filter((s) => s.trim())) JSON.parse(line);
  }
  return { path: name, bytes: bytes.length, sha256: sha(bytes), kind: text ? "text" : "binary-or-config" };
});
const manifest = JSON.parse(fs.readFileSync(path.join(root, "reports/team-source-manifest.json"), "utf8"));
const sourceMismatches = manifest.entries.filter((e) => {
  const file = path.join(root, e.path);
  return !fs.existsSync(file) || sha(fs.readFileSync(file)) !== e.sha256;
}).map((e) => e.path);
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const base = process.env.DEMO_URL || "http://127.0.0.1:4173";
try {
  await page.goto(base);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  const header = await page.locator(".context-strip").innerText();
  await page.getByRole("button", { name: "Imaging", exact: false }).click();
  const lvo = page.getByLabel("Large vessel occlusion present", { exact: true });
  const revision = () => page.locator(".form-footer").innerText();
  const beforeFocus = await revision();
  await lvo.focus();
  const afterFocus = await revision();
  await lvo.selectOption("yes");
  await page.locator(".field-guidance .card").first().waitFor();
  const visibleGuidance = await page.locator(".field-guidance").allTextContents();
  const mounted = {};
  for (const id of ["nudge-dock", "nudge-card", "field-marker", "gate-banner", "storyboard-card"]) {
    mounted[id] = await page.getByTestId(id).count();
  }
  const layout = await page.evaluate(() => ({
    workspace: document.querySelector(".workspace").getBoundingClientRect().width,
    caselog: document.querySelector(".caselog").getBoundingClientRect().width,
    columns: getComputedStyle(document.querySelector(".workspace")).gridTemplateColumns,
  }));
  await page.screenshot({ path: path.join(root, "reports/machine3-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  const mobile = await page.evaluate(() => ({
    viewport: innerWidth, documentWidth: document.documentElement.scrollWidth,
    undersizedButtons: [...document.querySelectorAll("button")].filter((b) => {
      const r = b.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && (r.width < 44 || r.height < 44);
    }).map((b) => ({ label: b.textContent.trim(), height: b.getBoundingClientRect().height })),
  }));
  await page.screenshot({ path: path.join(root, "reports/machine3-mobile.png"), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator(".demo-controls > summary").click();
  await page.getByLabel("Scenario", { exact: true }).selectOption("N5");
  await page.getByRole("button", { name: "Launch scenario", exact: true }).click();
  await page.locator(".demo-controls > summary").click();
  await page.getByRole("button", { name: "Complete mock encounter" }).click();
  const completion = {
    text: await page.locator(".completion-error").innerText(),
    role: await page.locator(".completion-error").getAttribute("role"),
    gateBannerCount: await page.getByTestId("gate-banner").count(),
  };
  await page.getByRole("button", { name: "Guide library", exact: true }).click();
  const importer = { multiple: await page.locator('input[type="file"]').getAttribute("multiple") !== null };
  const evidence = {
    reviewedAt: new Date().toISOString(),
    branch: execFileSync("git", ["branch", "--show-current"], { cwd: root, encoding: "utf8" }).trim(),
    commit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
    environment: { node: process.version, browser: browser.version(), url: base },
    inventory, originalSources: { checked: manifest.entries.length, mismatches: sourceMismatches },
    browser: { header, beforeFocus, afterFocus, visibleGuidance, mounted, layout, mobile, completion, importer, errors },
  };
  fs.writeFileSync(path.join(root, "reports/machine3-audit.json"), JSON.stringify(evidence, null, 2) + "\n");
  console.log(JSON.stringify({ trackedFiles: inventory.length, originalSources: evidence.originalSources, browser: evidence.browser }, null, 2));
} finally {
  await browser.close();
}
