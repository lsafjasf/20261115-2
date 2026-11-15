import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  use: {
    baseURL: "http://127.0.0.1:54991",
    viewport: { width: 1600, height: 1005 },
  },
  webServer: {
    command: "npm run dev -- --port 54991 --strictPort",
    url: "http://127.0.0.1:54991",
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
