import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "browser.spec.mjs",
  timeout: 45000,
  fullyParallel: false,
  reporter: "line",
  use: {
    baseURL: "http://127.0.0.1:4783",
    trace: "retain-on-failure",
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 1,
    screenshot: "only-on-failure"
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ],
  webServer: {
    command: "node server.mjs",
    url: "http://127.0.0.1:4783",
    reuseExistingServer: false,
    timeout: 10000
  }
});
