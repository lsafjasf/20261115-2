import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const PORT = 4211;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const artifacts = new URL("../artifacts/", import.meta.url);
const report = {
  generatedAt: new Date().toISOString(),
  url: BASE_URL,
  viewport: { width: 1440, height: 900 },
  cases: [],
  consoleErrors: [],
};

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(BASE_URL);
      if (response.ok) return;
    } catch {
      // Server is still starting.
    }
    await delay(100);
  }
  throw new Error("Preview server did not start");
}

async function setRange(page, selector, value) {
  await page.locator(selector).evaluate((element, nextValue) => {
    element.value = String(nextValue);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  }, value);
}

async function gameState(page) {
  return page.evaluate(() => window.__repairGame.getState());
}

async function waitForPhase(page, phase, timeout = 7000) {
  await page.waitForFunction(
    (expected) => window.__repairGame.getState().phase === expected,
    phase,
    { timeout },
  );
}

async function openScene(page) {
  await page.goto(BASE_URL, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(250);
}

async function testCompleteRepair(page) {
  const started = Date.now();
  await openScene(page);
  await page.locator("#audioBtn").click();
  await page.waitForFunction(() => window.__repairGame.audioStats().ready);

  const initialAudio = await page.evaluate(() => window.__repairGame.audioStats());
  assert.equal(initialAudio.contextState, "running", "Web Audio did not start");
  assert.ok(initialAudio.windGain > 0, "Wind audio gain should follow wind speed");

  await setRange(page, "#boatRange", 82);
  assert.equal((await gameState(page)).boatAligned, true);
  await page.locator("#dockBtn").click();
  await waitForPhase(page, "tower");

  await setRange(page, "#liftRange", 70);
  await page.waitForTimeout(480);
  const liftAudio = await page.evaluate(() => window.__repairGame.audioStats());
  assert.ok(liftAudio.motorGain > 0, "Motor gain should rise while the lift moves");
  assert.ok(liftAudio.motorFrequency > 42, "Motor pitch should change with motor speed");

  await page.waitForFunction(() => {
    const state = window.__repairGame.getState();
    return Math.abs(state.lift - 70) < 0.2 && Math.abs(state.sway) <= state.lockAngle;
  }, null, { timeout: 6000 });

  assert.equal(await page.locator("#lockBtn").isEnabled(), true);
  await page.locator("#lockBtn").click();
  assert.equal((await gameState(page)).locked, true);

  await page.locator("#repairBtn").hover();
  await page.mouse.down();
  await page.waitForFunction(() => window.__repairGame.getState().repairProgress >= 0.24, null, { timeout: 3000 });
  await page.screenshot({ path: new URL("e2e-repair-in-progress.png", artifacts).pathname });
  await waitForPhase(page, "retreat", 6000);
  await page.mouse.up();

  const repaired = await gameState(page);
  assert.equal(repaired.repaired, true);
  assert.equal(repaired.repairProgress, 1);
  await page.screenshot({ path: new URL("e2e-repair-verified.png", artifacts).pathname });

  await page.locator("#lowerBtn").click();
  await page.waitForFunction(() => window.__repairGame.getState().lift < 2, null, { timeout: 6000 });
  await page.waitForFunction(() => !document.querySelector("#returnBtn").disabled);
  assert.equal(await page.locator("#returnBtn").isEnabled(), true);
  await page.locator("#returnBtn").click();
  await waitForPhase(page, "returnReady");
  await page.locator("#returnBtn").click();
  await waitForPhase(page, "success");
  await page.waitForTimeout(650);

  const finalState = await gameState(page);
  assert.equal(finalState.result, "success");
  assert.equal(finalState.crewOnBoat, true);
  assert.equal(await page.locator("#resultLayer").getAttribute("aria-hidden"), "false");
  assert.match(await page.locator("#resultTitle").textContent(), /叶尖修复完成/);
  await page.screenshot({ path: new URL("e2e-repair-complete.png", artifacts).pathname });

  return {
    name: "complete-repair-and-safe-return",
    passed: true,
    durationMs: Date.now() - started,
    finalState,
    audio: { initial: initialAudio, lift: liftAudio },
  };
}

async function testWindWindowClosure(page) {
  const started = Date.now();
  await openScene(page);
  await page.locator('[data-limit="8"]').click();
  await page.evaluate(() => window.__repairGame.setClock(11.2));
  await page.waitForTimeout(450);

  const closed = await gameState(page);
  assert.ok(closed.wind > 8, "Modeled wind should exceed the selected 8 m/s limit");
  assert.equal(closed.windowOpen, false);
  assert.match(await page.locator("#windState").textContent(), /风窗关闭/);
  assert.match(await page.locator("#eventText").textContent(), /风窗关闭/);

  await setRange(page, "#boatRange", 82);
  assert.equal((await gameState(page)).boatAligned, true);
  assert.equal(await page.locator("#dockBtn").isDisabled(), true);
  await page.locator("#dockBtn").click({ force: true });
  assert.equal((await gameState(page)).phase, "approach");
  await page.waitForTimeout(600);
  await page.screenshot({ path: new URL("e2e-wind-window-closed.png", artifacts).pathname });

  return {
    name: "wind-window-closes-at-limit",
    passed: true,
    durationMs: Date.now() - started,
    selectedLimit: 8,
    observedWind: closed.wind,
    dockBlocked: true,
  };
}

async function testStormAbort(page) {
  const started = Date.now();
  await page.evaluate(() => window.__repairGame.restart());
  await setRange(page, "#boatRange", 82);
  await page.locator("#dockBtn").click();
  await waitForPhase(page, "tower");
  await page.evaluate(() => window.__repairGame.setClock(19.1));
  await waitForPhase(page, "failed", 5000);
  await page.waitForTimeout(650);

  const failed = await gameState(page);
  assert.equal(failed.result, "failed");
  assert.ok(failed.wind >= 19);
  assert.match(await page.locator("#resultTitle").textContent(), /强风中止任务/);
  await page.screenshot({ path: new URL("e2e-storm-abort.png", artifacts).pathname });

  return {
    name: "storm-aborts-exposed-work",
    passed: true,
    durationMs: Date.now() - started,
    observedWind: failed.wind,
    exposureSeconds: failed.stormExposure,
  };
}

let server;
let browser;
try {
  await mkdir(artifacts, { recursive: true });
  server = spawn(process.execPath, ["server.js"], {
    cwd: new URL("..", import.meta.url),
    env: { ...process.env, PORT: String(PORT) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  await waitForServer();

  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
  browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox"],
    ...(executablePath ? { executablePath } : {}),
  });
  const page = await browser.newPage({ viewport: report.viewport });
  page.on("console", (message) => {
    if (message.type() === "error") report.consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => report.consoleErrors.push(error.message));

  report.cases.push(await testCompleteRepair(page));
  report.cases.push(await testWindWindowClosure(page));
  report.cases.push(await testStormAbort(page));
  assert.deepEqual(report.consoleErrors, [], "Browser console contains errors");

  await writeFile(new URL("validation-report.json", artifacts), `${JSON.stringify(report, null, 2)}\n`);
  console.log("PASS complete repair: success after safe return");
  console.log("PASS wind window: operation blocked above selected limit");
  console.log("PASS storm abort: exposed crew aborted at high wind");
  console.log(`Report: ${new URL("validation-report.json", artifacts).pathname}`);
} catch (error) {
  report.cases.push({ name: "validation-failure", passed: false, error: error.message });
  await mkdir(artifacts, { recursive: true });
  await writeFile(new URL("validation-report.json", artifacts), `${JSON.stringify(report, null, 2)}\n`);
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser?.close();
  server?.kill("SIGTERM");
}
