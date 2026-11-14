import { existsSync } from "node:fs";
import { defineConfig } from "@playwright/test";

for (const key of ["HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy"]) {
  delete process.env[key];
}
process.env.NO_PROXY = "*";
process.env.no_proxy = "*";

const preferredChrome = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || "/tmp/chrome-linux64/chrome";
const executablePath = existsSync(preferredChrome) ? preferredChrome : undefined;

export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:4390",
    viewport: { width: 1440, height: 1100 },
    launchOptions: {
      executablePath,
      args: ["--no-sandbox"],
    },
  },
  webServer: {
    command: "PORT=4390 node server.mjs",
    url: "http://127.0.0.1:4390",
    reuseExistingServer: true,
    timeout: 15_000,
  },
});
