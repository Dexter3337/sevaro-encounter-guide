import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  workers: 1,
  use: {
    baseURL: process.env.DEMO_URL || "http://127.0.0.1:5173",
    channel: process.env.PW_CHANNEL || "chrome",
    headless: true,
    // The doctor's own clock in these tests; the hospital's comes from its guide.
    timezoneId: "America/New_York",
    viewport: { width: 1440, height: 1000 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  reporter: [["list"], ["json", { outputFile: "reports/browser-tests.json" }]],
  webServer: process.env.DEMO_URL
    ? undefined
    : {
        command: "node node_modules/vite/bin/vite.js --host 127.0.0.1",
        url: "http://127.0.0.1:5173",
        reuseExistingServer: true,
      },
});
