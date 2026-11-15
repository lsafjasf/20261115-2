import { chromium } from "playwright";
import http from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import assert from "node:assert/strict";

const ROOT = resolve(import.meta.dirname, "..");
const APP_DIR = join(ROOT, "app");
const ARTIFACT_DIR = join(ROOT, "artifacts");
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".woff2": "font/woff2",
  ".svg": "image/svg+xml",
};

function startServer() {
  return new Promise((resolveServer) => {
    const server = http.createServer(async (request, response) => {
      const pathname = request.url === "/" ? "/index.html" : request.url.split("?")[0];
      const relative = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, "");
      const file = join(APP_DIR, relative);
      try {
        const body = await readFile(file);
        response.writeHead(200, { "Content-Type": MIME[extname(file)] || "application/octet-stream" });
        response.end(body);
      } catch {
        response.writeHead(404);
        response.end("not found");
      }
    });
    server.listen(0, "127.0.0.1", () => resolveServer(server));
  });
}

const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

async function setRange(page, selector, value) {
  await page.$eval(
    selector,
    (element, nextValue) => {
      element.value = String(nextValue);
      element.dispatchEvent(new Event("input", { bubbles: true }));
    },
    value,
  );
}

async function readState(page) {
  return page.evaluate(() => window.RecoveryGame.getSnapshot());
}

async function runSuccess(page, results) {
  const initial = await readState(page);
  assert.equal(initial.phase, "rig");
  assert.equal(initial.anchor.deployed, false);
  assert.equal(initial.front.safe, false);
  assert.equal(initial.rear.safe, false);
  assert.ok(await page.locator("#resultOverlay").evaluate((node) => node.classList.contains("hidden")));
  assert.equal(await page.evaluate(() => document.fonts.check('12px "Noto Sans SC"', "双车救援")), true);

  await setRange(page, "#winchSlider", 55);
  await sleep(450);
  const unanchored = await readState(page);
  assert.equal(unanchored.phase, "rig");
  assert.ok(unanchored.front.x <= 459, "未固定地锚时前车不应被拖动");
  await setRange(page, "#winchSlider", 0);

  await setRange(page, "#angleSlider", 67);
  await page.click("#deployBtn");
  await sleep(180);
  let state = await readState(page);
  assert.equal(state.phase, "front");
  assert.equal(state.anchor.deployed, true);
  assert.ok(state.anchor.quality > 0.98);
  const audioStart = await page.evaluate(() => {
    const current = window.RecoveryGame.audio;
    return {
      context: current.context?.state || null,
      frequency: current.motor?.frequency.value || 0,
    };
  });
  assert.equal(audioStart.context, "running", "用户操作后 Web Audio 应已启动");

  await setRange(page, "#winchSlider", 62);
  let sawReanchor = false;
  let audioChecked = false;
  let maxTension = 0;
  let maxSlip = 0;
  const started = Date.now();

  for (let attempt = 0; attempt < 360; attempt += 1) {
    state = await readState(page);
    maxTension = Math.max(maxTension, state.tension);
    maxSlip = Math.max(maxSlip, state.rescue.slip);
    if (!audioChecked && state.tension > 45) {
      const audioNow = await page.evaluate(() => ({
        context: window.RecoveryGame.audio.context?.state || null,
        tension: window.RecoveryGame.audio.currentTension,
        frequency: window.RecoveryGame.audio.motor?.frequency.value || 0,
        gain: window.RecoveryGame.audio.motorGain?.gain.value || 0,
      }));
      assert.equal(audioNow.context, "running");
      assert.ok(audioNow.tension > 40);
      assert.ok(audioNow.frequency > audioStart.frequency + 18, "绞盘声音应随张力升高");
      assert.ok(audioNow.gain > 0.012);
      results.audio = {
        ...audioNow,
        baselineFrequency: audioStart.frequency,
      };
      audioChecked = true;
    }
    if (state.status === "won") break;
    assert.equal(state.status, "running", `救援意外失败：${state.finishReason} ${state.alert}`);

    if (state.phase === "reanchor") {
      sawReanchor = true;
      assert.equal(state.front.safe, true);
      assert.equal(state.anchor.deployed, false, "前车脱困后必须先收锚、重新固定");
      await setRange(page, "#winchSlider", 0);
      await sleep(450);
      await setRange(page, "#angleSlider", 64);
      await page.click("#deployBtn");
      await sleep(150);
      continue;
    }

    if (state.active) {
      const car = state[state.active];
      const steer = Math.max(
        -0.9,
        Math.min(0.9, 0.21 + (car.y - state.activeTargetY) * 0.018 + car.vy * 0.014),
      );
      await setRange(page, "#steerSlider", Math.round(steer * 100));
      await setRange(page, "#winchSlider", 62);
    }
    await sleep(70);
  }

  state = await readState(page);
  assert.equal(state.status, "won", `双车救援未完成：${state.finishReason} ${state.alert}`);
  assert.equal(state.finishReason, "both-safe");
  assert.equal(state.front.safe, true);
  assert.equal(state.rear.safe, true);
  assert.equal(sawReanchor, true, "应经过重新布置锚点阶段");
  assert.ok(state.rescue.slip < 10, `救援车不应滑落，实际滑移 ${state.rescue.slip}`);
  assert.ok(maxTension <= 84, `正常救援不应过载，实际峰值 ${maxTension}`);
  await page.waitForSelector("#resultOverlay:not(.hidden)");
  assert.match(await page.textContent("#resultTitle"), /双车救援成功/);
  await sleep(550);

  results.success = {
    status: state.status,
    reason: state.finishReason,
    timeSeconds: Number(state.time.toFixed(2)),
    wallSeconds: Number(((Date.now() - started) / 1000).toFixed(2)),
    frontSafe: state.front.safe,
    rearSafe: state.rear.safe,
    reanchorRequired: sawReanchor,
    rescueSlip: Number(state.rescue.slip.toFixed(1)),
    peakTension: Number(maxTension.toFixed(1)),
    maxSlip: Number(maxSlip.toFixed(1)),
  };
  await page.screenshot({ path: join(ARTIFACT_DIR, "dual-recovery-success.png"), fullPage: true });
}

async function runWrongAnchor(page, results) {
  await page.click("#againBtn");
  await sleep(160);
  let state = await readState(page);
  assert.equal(state.phase, "rig");

  await setRange(page, "#angleSlider", 29);
  await page.click("#deployBtn");
  await setRange(page, "#winchSlider", 70);
  const initial = await readState(page);
  assert.equal(initial.anchor.band, "danger");
  assert.ok(initial.anchor.quality < 0.1);
  assert.equal(initial.phase, "front");

  const started = Date.now();
  for (let attempt = 0; attempt < 120; attempt += 1) {
    state = await readState(page);
    if (state.rescue.slip >= 28 || state.status !== "running") break;
    if (state.active) {
      const car = state[state.active];
      const steer = Math.max(
        -0.9,
        Math.min(0.9, 0.21 + (car.y - state.activeTargetY) * 0.018 + car.vy * 0.014),
      );
      await setRange(page, "#steerSlider", Math.round(steer * 100));
    }
    await setRange(page, "#winchSlider", 70);
    await sleep(65);
  }

  state = await readState(page);
  assert.equal(state.status, "running");
  assert.equal(state.phase, "front");
  assert.ok(state.rescue.slip >= 27, `错误锚点应触发侧滑，实际 ${state.rescue.slip}`);
  assert.ok(state.rescue.x < 868, `救援车应向坡下偏移，实际 x=${state.rescue.x}`);
  assert.ok(state.rescue.tilt > -2);
  assert.match(await page.textContent("#alertText"), /侧滑/);
  assert.ok(parseInt(await page.textContent("#slipStat"), 10) >= 25);
  assert.ok(await page.locator("#resultOverlay").evaluate((node) => node.classList.contains("hidden")));

  await page.screenshot({ path: join(ARTIFACT_DIR, "wrong-anchor-sideslip.png"), fullPage: true });
  results.wrongAnchor = {
    angle: state.anchor.angle,
    quality: Number(state.anchor.quality.toFixed(3)),
    band: state.anchor.band,
    timeSeconds: Number(state.time.toFixed(2)),
    wallSeconds: Number(((Date.now() - started) / 1000).toFixed(2)),
    rescueSlip: Number(state.rescue.slip.toFixed(1)),
    rescueOffsetX: Number((state.rescue.x - 878).toFixed(1)),
    rescueTilt: Number(state.rescue.tilt.toFixed(1)),
    alert: await page.textContent("#alertText"),
  };
}

async function runRopeBreak(page, results) {
  await page.click("#resetBtn");
  await sleep(150);
  await setRange(page, "#angleSlider", 67);
  await page.click("#deployBtn");
  await setRange(page, "#winchSlider", 100);

  await page.waitForFunction(
    () => window.RecoveryGame.getSnapshot().finishReason === "rope-break",
    null,
    { timeout: 6000 },
  );
  const state = await readState(page);
  assert.equal(state.status, "lost");
  assert.equal(state.outcome.ropeBroken, true);
  assert.match(await page.textContent("#resultTitle"), /拖索断裂/);
  await sleep(550);
  await page.screenshot({ path: join(ARTIFACT_DIR, "rope-break.png"), fullPage: true });
  results.ropeBreak = {
    status: state.status,
    reason: state.finishReason,
    peakTension: Number(state.maxTension.toFixed(1)),
    timeSeconds: Number(state.time.toFixed(2)),
  };
}

(async () => {
  const server = await startServer();
  const port = server.address().port;
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  const results = { generatedAt: new Date().toISOString() };
  try {
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });
    await page.waitForFunction(() => window.RecoveryGame);
    await runSuccess(page, results);
    await runWrongAnchor(page, results);
    await runRopeBreak(page, results);
    assert.equal(errors.length, 0, `页面不应有脚本错误：${errors.join(" | ")}`);
    results.consoleErrors = 0;
    await writeFile(join(ARTIFACT_DIR, "verification.json"), JSON.stringify(results, null, 2));
    console.log("ALL BROWSER CHECKS PASSED");
    console.log(JSON.stringify(results, null, 2));
  } finally {
    await context.close();
    await browser.close();
    server.close();
  }
})().catch((error) => {
  console.error("BROWSER VERIFICATION FAILED:", error);
  process.exitCode = 1;
});
