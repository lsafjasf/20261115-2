"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "..");
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".woff2": "font/woff2",
  ".png": "image/png",
  ".json": "application/json"
};

function startServer() {
  const server = http.createServer((request, response) => {
    const requestPath = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    const relative = requestPath === "/" ? "index.html" : requestPath.replace(/^\/+/, "");
    const filePath = path.resolve(ROOT, relative);
    if (!filePath.startsWith(ROOT) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }
    response.writeHead(200, {
      "Content-Type": MIME[path.extname(filePath)] || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    fs.createReadStream(filePath).pipe(response);
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

async function run() {
  const server = await startServer();
  const port = server.address().port;
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  try {
    await page.goto(`http://127.0.0.1:${port}`, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: "artifacts/idle.png", fullPage: true });

    await page.locator('[data-testid="start-batch"]').click();
    await page.evaluate(() => window.__forge.pauseForTest());
    await page.evaluate(() => window.__forge.setControls({ mist: 100, air: 0 }));
    await page.waitForTimeout(350);
    const wetLevels = await page.evaluate(() => ({
      water: window.__forge.audio.nodes.waterGain.gain.value,
      fan: window.__forge.audio.nodes.fanGain.gain.value
    }));
    await page.evaluate(() => window.__forge.setControls({ mist: 0, air: 100 }));
    await page.waitForTimeout(350);
    const dryLevels = await page.evaluate(() => ({
      water: window.__forge.audio.nodes.waterGain.gain.value,
      fan: window.__forge.audio.nodes.fanGain.gain.value
    }));
    assert.ok(wetLevels.water > dryLevels.water + 0.01, "mist should raise the water noise level");
    assert.ok(dryLevels.fan > wetLevels.fan + 0.01, "airflow should raise the fan noise level");

    await page.evaluate(() => window.__forge.setControls({ mist: 48, air: 56, belt: 1 }));
    let state = await page.evaluate(() => window.__forge.advance(45, 0.1));
    assert.equal(state.status, "success");
    assert.equal(state.result.passed, true);
    assert.equal(state.parts.length, 3);
    state.parts.forEach((part) => {
      assert.ok(part.score >= 75, `${part.name} should pass`);
      assert.equal(part.cracked, false);
    });
    assert.equal(state.audio.contextState, "running");
    assert.equal(await page.locator("#resultDialog").evaluate((dialog) => dialog.open), true);
    await page.screenshot({ path: "artifacts/success.png", fullPage: true });

    await page.reload({ waitUntil: "networkidle" });
    await page.evaluate(() => window.__forge.pauseForTest());
    await page.evaluate(() => window.__forge.startBatch());
    await page.evaluate(() => window.__forge.setControls({ mist: 100, air: 0, belt: 0.8 }));
    let crackState;
    for (let tick = 0; tick < 20; tick += 1) {
      crackState = await page.evaluate(() => window.__forge.advance(1, 0.1));
      if (crackState.parts.some((part) => part.cracked)) break;
    }
    const crackedPart = crackState.parts.find((part) => part.cracked);
    assert.ok(crackedPart, "local quench should create a crack");
    assert.ok(crackedPart.crack.time < 20);
    assert.ok(crackedPart.crack.gap > 118);
    assert.equal(await page.locator(".warning-strip").evaluate((node) => node.classList.contains("is-danger")), true);
    await page.screenshot({ path: "artifacts/test-crack.png", fullPage: true });

    while (crackState.status === "running") {
      crackState = await page.evaluate(() => window.__forge.advance(5, 0.1));
    }
    assert.equal(crackState.status, "failed");
    assert.match(crackState.result.reason, /裂纹/);
    await page.screenshot({ path: "artifacts/failure.png", fullPage: true });

    assert.deepEqual(errors, []);
    console.log("Browser test passed");
    console.log(`- successful batch: ${state.parts.map((part) => part.score).join(" / ")}`);
    console.log(`- crack: ${crackedPart.name} at ${crackedPart.crack.time}s, gap ${crackedPart.crack.gap}°C`);
    console.log(`- audio: ${state.audio.contextState}, mist ${state.audio.mist}%, airflow ${state.audio.air}%`);
  } finally {
    await browser.close();
    server.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
