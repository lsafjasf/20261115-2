const { chromium } = require("playwright");
const http = require("http");
const fs = require("fs");
const path = require("path");
const assert = require("assert");

const ROOT = path.join(__dirname, "..");
const APP_DIR = path.join(ROOT, "app");
const ARTIFACT_DIR = path.join(ROOT, "artifacts");
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".woff2": "font/woff2",
  ".png": "image/png"
};

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((request, response) => {
      const pathname = request.url === "/" ? "/index.html" : request.url.split("?")[0];
      const file = path.join(APP_DIR, decodeURIComponent(pathname));
      fs.readFile(file, (error, buffer) => {
        if (error) {
          response.writeHead(404);
          response.end("not found");
          return;
        }
        response.writeHead(200, {
          "Content-Type": MIME[path.extname(file)] || "text/plain"
        });
        response.end(buffer);
      });
    });
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

async function setRange(page, selector, value) {
  await page.$eval(
    selector,
    (input, nextValue) => {
      input.value = String(nextValue);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    },
    value
  );
}

async function waitForResult(page, expectedId) {
  await page.waitForFunction(
    (profileId) => {
      const snapshot = window.TunnelApp.snapshot();
      return snapshot.status === "result" && snapshot.profile.id === profileId;
    },
    expectedId,
    { timeout: 20000 }
  );
  return page.evaluate(() => window.TunnelApp.snapshot());
}

function collectErrors(page) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  return errors;
}

(async () => {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  const server = await startServer();
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}/`;
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = collectErrors(page);
  const results = { campaign: [], audio: {}, fault: {}, consoleErrors: 0 };

  await page.goto(baseUrl);
  await page.waitForFunction(() => window.TunnelApp && window.CryoEngine);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, "initial-line.png"), fullPage: true });

  const batches = [
    { id: "strawberry", damper: 46, gap: 30, speed: 1.5 },
    { id: "dumpling", damper: 64, gap: 22, speed: 1.2 },
    { id: "beef", damper: 82, gap: 15, speed: 1.0 }
  ];

  for (let index = 0; index < batches.length; index += 1) {
    const recipe = batches[index];
    await setRange(page, "#damperSlider", recipe.damper);
    await setRange(page, "#gapSlider", recipe.gap);
    await setRange(page, "#speedSlider", recipe.speed);

    const controls = await page.evaluate(() => window.TunnelApp.snapshot().controls);
    assert.ok(Math.abs(controls.damper - recipe.damper / 100) < 1e-9, "风门滑杆应写入工艺值");
    assert.strictEqual(controls.gap, recipe.gap, "托盘间距滑杆应写入工艺值");
    assert.ok(Math.abs(controls.speed - recipe.speed) < 1e-9, "传送带滑杆应写入工艺值");

    await page.click("#startBtn");
    await page.waitForFunction(() => window.TunnelApp.snapshot().status === "running");
    if (index === 0) {
      await page.waitForTimeout(1800);
      const runningAudio = await page.evaluate(() => window.TunnelApp.audioState);
      assert.strictEqual(runningAudio.enabled, true, "启动批次时应启用风机声音");
      assert.strictEqual(runningAudio.mode, "fanning", "正常运行时声音应为风机模式");
      assert.ok(runningAudio.frequency > 50, "风机声音频率应随转速升高");
      results.audio.normalFanFrequency = runningAudio.frequency;
    }

    const snapshot = await waitForResult(page, recipe.id);
    assert.strictEqual(snapshot.result.pass, true, `${recipe.id} 应合格: ${snapshot.result.reasons.join("；")}`);
    assert.ok(snapshot.result.temp <= -18, `${recipe.id} 中心温度应不高于 -18°C`);
    assert.ok(snapshot.result.drift < 100, `${recipe.id} 不应发生飘移`);
    await page.waitForSelector("#resultModal.open", { timeout: 2500 });

    results.campaign.push({
      batch: index + 1,
      profile: recipe.id,
      controls: recipe,
      coreTemp: snapshot.result.temp,
      dwellMinutes: snapshot.result.minutes,
      batchEnergyKwh: snapshot.result.energy,
      cumulativeEnergyKwh: snapshot.result.energyTotal,
      drift: snapshot.result.drift,
      pass: snapshot.result.pass
    });

    if (index < batches.length - 1) {
      await page.click("#modalPrimary");
      await page.waitForFunction(
        (nextIndex) => {
          const snapshot = window.TunnelApp.snapshot();
          return snapshot.status === "idle" && snapshot.batchIndex === nextIndex;
        },
        index + 1
      );
    }
  }

  const finalSnapshot = await page.evaluate(() => window.TunnelApp.snapshot());
  assert.strictEqual(finalSnapshot.campaignComplete, true, "三批完成后产线应结束");
  assert.strictEqual(finalSnapshot.campaignSuccess, true, "三批合格且能耗达标应通关");
  assert.ok(finalSnapshot.energyTotal <= finalSnapshot.energyLimit, "累计能耗不得超限");
  assert.match(await page.textContent("#resultTitle"), /全线通关/, "结果弹层应显示全线通关");

  const canvasStats = await page.evaluate(() => {
    const canvas = document.getElementById("tunnelCanvas");
    const context = canvas.getContext("2d");
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let brightPixels = 0;
    for (let index = 0; index < data.length; index += 40) {
      if (data[index] + data[index + 1] + data[index + 2] > 90) brightPixels += 1;
    }
    return {
      width: canvas.width,
      height: canvas.height,
      brightPixels,
      dataUrlLength: canvas.toDataURL().length
    };
  });
  assert.ok(canvasStats.width === 1180 && canvasStats.height === 620, "Canvas 尺寸应为隧道剖面画布");
  assert.ok(canvasStats.brightPixels > 500, "Canvas 应实际绘制隧道、冷气与食品");
  results.canvas = canvasStats;

  await page.screenshot({ path: path.join(ARTIFACT_DIR, "campaign-success.png"), fullPage: true });
  await page.close();

  const faultPage = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const faultErrors = collectErrors(faultPage);
  await faultPage.goto(baseUrl);
  await faultPage.waitForFunction(() => window.TunnelApp && window.CryoEngine);
  await faultPage.evaluate(() => document.fonts.ready);
  await faultPage.bringToFront();
  await faultPage.click("#startBtn");
  await faultPage.waitForFunction(() => window.TunnelApp.snapshot().status === "running");
  await faultPage.waitForTimeout(1800);

  const normal = await faultPage.evaluate(() => {
    const snapshot = window.TunnelApp.snapshot();
    return {
      rpm: snapshot.rpm,
      effectiveAir: snapshot.effectiveAir,
      airVelocity: snapshot.airVelocity,
      temp: snapshot.temp,
      audio: window.TunnelApp.audioState
    };
  });
  assert.ok(normal.rpm > 1000, "正常运行风机应高转速");
  assert.strictEqual(normal.audio.mode, "fanning", "堵塞前声音应为风机模式");

  await faultPage.waitForTimeout(900);
  const tempAtBlock = await faultPage.evaluate(() => window.TunnelApp.snapshot().temp);
  const normalCoolingRate = (normal.temp - tempAtBlock) / 0.9;

  await faultPage.click("#blockBtn");
  await faultPage.waitForFunction(() => window.TunnelApp.snapshot().blockage === true);
  await faultPage.waitForTimeout(1200);
  const blocked = await faultPage.evaluate(() => {
    const snapshot = window.TunnelApp.snapshot();
    return {
      rpm: snapshot.rpm,
      effectiveAir: snapshot.effectiveAir,
      airVelocity: snapshot.airVelocity,
      temp: snapshot.temp,
      audio: window.TunnelApp.audioState,
      alarmVisible: document.getElementById("alarmBanner").classList.contains("visible"),
      batchStatus: document.getElementById("batchStatus").textContent,
      events: snapshot.events.map((event) => event.message)
    };
  });
  assert.ok(blocked.rpm < normal.rpm * 0.25, "堵塞后风机转速应大幅下降");
  assert.ok(blocked.effectiveAir < normal.effectiveAir * 0.2, "堵塞后有效冷气流量应骤降");
  assert.ok(blocked.airVelocity < 1, "堵塞后冷气速度应低于 1 m/s");
  assert.strictEqual(blocked.audio.mode, "blocked", "堵塞后声音应切换为阻塞模式");
  assert.ok(blocked.audio.frequency < normal.audio.frequency, "堵塞后风机声频应降低");
  assert.ok(blocked.audio.noiseLevel < normal.audio.noiseLevel, "堵塞后风噪应降低");
  assert.strictEqual(blocked.alarmVisible, true, "堵塞时应显示 E-03 报警");
  assert.match(blocked.batchStatus, /堵塞/, "批次状态应显示堵塞");
  assert.ok(
    blocked.events.some((event) => /E-03/.test(event)),
    "事件记录应写入堵塞故障"
  );
  const blockedCoolingRate = (tempAtBlock - blocked.temp) / 1.2;
  assert.ok(
    blockedCoolingRate < normalCoolingRate * 0.65,
    `堵塞后降温速率应显著下降：${normalCoolingRate.toFixed(2)} -> ${blockedCoolingRate.toFixed(2)} °C/s`
  );

  await faultPage.screenshot({ path: path.join(ARTIFACT_DIR, "fan-blockage.png"), fullPage: true });

  await faultPage.click("#blockBtn");
  await faultPage.waitForFunction(() => window.TunnelApp.snapshot().blockage === false);
  await faultPage.waitForTimeout(700);
  const recovered = await faultPage.evaluate(() => {
    const snapshot = window.TunnelApp.snapshot();
    return {
      rpm: snapshot.rpm,
      effectiveAir: snapshot.effectiveAir,
      audio: window.TunnelApp.audioState,
      alarmVisible: document.getElementById("alarmBanner").classList.contains("visible"),
      events: snapshot.events.map((event) => event.message)
    };
  });
  assert.ok(recovered.rpm > blocked.rpm * 3, "清理后风机转速应恢复");
  assert.ok(recovered.effectiveAir > blocked.effectiveAir * 5, "清理后冷气流量应恢复");
  assert.strictEqual(recovered.audio.mode, "fanning", "清理后声音应恢复正常风机模式");
  assert.ok(recovered.audio.frequency > blocked.audio.frequency, "清理后声频应回升");
  assert.strictEqual(recovered.alarmVisible, false, "清理后报警应消失");
  assert.ok(
    recovered.events.some((event) => /清理完成/.test(event)),
    "事件记录应写入恢复"
  );
  normal.coolingRate = Number(normalCoolingRate.toFixed(3));
  blocked.coolingRate = Number(blockedCoolingRate.toFixed(3));
  results.fault = { normal, blocked, recovered, screenshot: "fan-blockage.png" };

  errors.push(...faultErrors);
  assert.strictEqual(errors.length, 0, `页面不应有控制台错误: ${errors.join(" | ")}`);
  results.consoleErrors = 0;
  results.completedAt = new Date().toISOString();
  results.baseUrl = "http://127.0.0.1:<ephemeral-port>/";

  fs.writeFileSync(
    path.join(ARTIFACT_DIR, "verification.json"),
    JSON.stringify(results, null, 2)
  );

  const tempRemoved = results.campaign.length;
  console.log("ALL CHECKS PASSED");
  console.log(`CAMPAIGN: ${tempRemoved}/3 batches passed, ${finalSnapshot.energyTotal.toFixed(2)} / ${finalSnapshot.energyLimit} kWh`);
  console.log(`FAULT: E-03 ${normal.rpm} -> ${blocked.rpm} rpm, ${normal.audio.frequency} -> ${blocked.audio.frequency} Hz, recovered ${recovered.rpm} rpm`);
  console.log(`ARTIFACTS: ${path.relative(ROOT, path.join(ARTIFACT_DIR, "verification.json"))}, campaign-success.png, fan-blockage.png`);

  await browser.close();
  server.close();
})().catch((error) => {
  console.error("VERIFICATION FAILED:", error);
  process.exit(1);
});
