import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { userInfo } from "node:os";
import { chromium } from "playwright-core";

function findChromium() {
  if (process.env.CHROMIUM_PATH && existsSync(process.env.CHROMIUM_PATH)) {
    return process.env.CHROMIUM_PATH;
  }

  const cacheRoots = [
    process.env.PLAYWRIGHT_BROWSERS_PATH,
    join(userInfo().homedir, ".cache/ms-playwright"),
    join(process.env.HOME || "", ".cache/ms-playwright")
  ].filter(Boolean);

  for (const cacheRoot of cacheRoots) {
    if (!existsSync(cacheRoot)) continue;
    const candidates = readdirSync(cacheRoot)
      .filter((name) => /^chromium-\d+$/.test(name))
      .sort((a, b) => Number(b.split("-")[1]) - Number(a.split("-")[1]));
    for (const directory of candidates) {
      const executable = join(cacheRoot, directory, "chrome-linux64", "chrome");
      if (existsSync(executable)) return executable;
    }
  }
  return null;
}

export async function launchBrowser() {
  const executablePath = findChromium();
  return chromium.launch({
    executablePath: executablePath || undefined,
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--autoplay-policy=no-user-gesture-required"
    ]
  });
}
