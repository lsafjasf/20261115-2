import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 75_000,
  expect: {
    timeout: 8_000,
  },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:43713",
    headless: true,
    viewport: { width: 1440, height: 1080 },
    launchOptions: {
      args: ["--autoplay-policy=no-user-gesture-required"],
    },
  },
  webServer: {
    command: "npm run dev -- --port 43713 --strictPort",
    url: "http://127.0.0.1:43713",
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
