import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

async function waitForServer(url) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Server did not start at ${url}`);
}

const port = await freePort();
const origin = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ["server.mjs"], {
  cwd: process.cwd(),
  env: { ...process.env, PORT: String(port) },
  stdio: ["ignore", "pipe", "pipe"]
});

let browser;
try {
  await waitForServer(origin);
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => errors.push(`page: ${error.message}`));

  await page.goto(origin, { waitUntil: "networkidle" });
  await page.click("#diveButton");
  await page.waitForTimeout(450);
  const initial = await page.evaluate(() => window.__blackwater.snapshot);
  const contacts = [];

  for (const [index, target] of initial.targets.entries()) {
    const state = await page.evaluate(() => window.__blackwater.snapshot);
    const bearing = (
      Math.atan2(target.x - state.listener.x, -(target.y - state.listener.y)) * 180 / Math.PI + 360
    ) % 360;

    await page.locator("#angleSlider").evaluate((element, value) => {
      element.value = String(value);
      element.dispatchEvent(new Event("input", { bubbles: true }));
    }, bearing);
    await page.click("#pingButton");
    await page.waitForTimeout(1500);

    const echoes = await page.evaluate(() => window.__blackwater.snapshot.echoes);
    const echo = echoes.find((candidate) => candidate.targetId === target.id);
    if (!echo) throw new Error(`No return heard for ${target.id} at bearing ${bearing}`);

    await page.click(`.signature-btn[data-signature="${echo.kind}"]`);
    const box = await page.locator("#scopeCanvas").boundingBox();
    const radius = Math.min(box.width, box.height) * 0.405;
    const radians = echo.bearing * Math.PI / 180;
    const x = box.x + box.width / 2 + Math.sin(radians) * echo.range / 48 * radius;
    const y = box.y + box.height / 2 - Math.cos(radians) * echo.range / 48 * radius;
    await page.mouse.click(x, y);
    await page.waitForTimeout(250);

    const plotted = await page.evaluate(() => window.__blackwater.snapshot);
    if (!plotted.claimed.includes(target.id)) {
      throw new Error(`Plot did not confirm ${target.id}: ${JSON.stringify(plotted.markers.at(-1))}`);
    }
    contacts.push({
      id: target.id,
      kind: echo.kind,
      bearing: Number(echo.bearing.toFixed(2)),
      range: Number(echo.range.toFixed(2)),
      delay: Number(echo.delay.toFixed(3)),
      pan: Number(echo.pan.toFixed(3))
    });
    console.log(`FIXED ${target.id.padEnd(7)} ${echo.kind.padEnd(8)} range ${echo.range.toFixed(2)}m · delay ${echo.delay.toFixed(2)}s`);

    if (index === 2) {
      await page.screenshot({ path: "artifacts/sonar-traces.png" });
    }
  }

  await page.locator("#successScreen:not([hidden])").waitFor({ timeout: 3000 });
  const finalState = await page.evaluate(() => window.__blackwater.snapshot);
  if (new Set(finalState.claimed).size !== 4) throw new Error("Survey did not resolve all four contacts");
  if (errors.length) throw new Error(errors.join("\n"));

  await mkdir("artifacts", { recursive: true });
  await page.screenshot({ path: "artifacts/sonar-solved.png" });
  await writeFile("artifacts/solve-result.json", JSON.stringify({
    success: true,
    contacts,
    transmissionsUsed: 24 - finalState.pingsLeft,
    consoleErrors: errors
  }, null, 2));
  console.log("LOCALIZATION CONFIRMED · 3 obstacles + 1 beacon · success screen visible");
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}
