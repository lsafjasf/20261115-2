import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:4337",
    viewport: { width: 1440, height: 900 },
    screenshot: "only-on-failure",
    launchOptions: process.env.CHROMIUM_PATH
      ? { executablePath: process.env.CHROMIUM_PATH }
      : {},
  },
  webServer: {
    command: "python3 -m http.server 4337 --bind 127.0.0.1",
    port: 4337,
    reuseExistingServer: true,
  },
});
