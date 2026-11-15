import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

const step = (name) => console.log(`→ ${name}`);

async function startServer() {
  const child = spawn(process.execPath, ["scripts/serve.mjs"], {
    env: { ...process.env, PORT: "0" },
    stdio: ["ignore", "pipe", "pipe"]
  });
  const url = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("server startup timed out")), 8000);
    child.stdout.on("data", (chunk) => {
      const match = String(chunk).match(/http:\/\/127\.0\.0\.1:\d+/);
      if (match) {
        clearTimeout(timer);
        resolve(match[0]);
      }
    });
    child.on("error", reject);
  });
  return { child, url };
}

async function state(page) {
  return page.evaluate(() => window.__nightPress.getState());
}

async function advance(page, seconds) {
  await page.evaluate((value) => window.__nightPress.advance(value), seconds);
}

async function selectOrder(page, jobId) {
  await page.locator(`[data-job-id="${jobId}"]`).click();
}

async function configure(page, jobId, layout, ink) {
  await selectOrder(page, jobId);
  await page.locator(`[data-layout-id="${layout}"]`).click();
  await page.locator(`[data-ink-id="${ink}"]`).click();
}

async function printSideToDry(page, jobId, seconds) {
  await page.locator(`[data-job-id="${jobId}"]`).click();
  await page.click("#startBtn");
  await advance(page, seconds);
}

async function printSideB(page, jobId, seconds) {
  await page.locator(`[data-job-id="${jobId}"]`).click();
  await page.click("#startBtn");
  await advance(page, seconds);
}

async function main() {
  mkdirSync("artifacts", { recursive: true });
  const server = await startServer();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 920 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.stack || error.message));

  try {
    step("加载夜班界面并接班");
    await page.goto(server.url, { waitUntil: "networkidle" });
    assert.equal(await page.title(), "午夜印厂 · Night Press");
    await page.click("#modalAction");
    await page.waitForTimeout(250);
    assert.equal(await page.locator("#soundToggle").getAttribute("aria-pressed"), "true");

    step("第一单：午夜快讯，双栏 + 午夜青");
    await configure(page, "midnight", "columns", "cyan");
    await page.locator('[data-speed="1"]').click();
    await page.click("#startBtn");
    await page.waitForTimeout(350);
    const slowAudio = await page.evaluate(() => window.__nightPress.getAudio());
    await page.locator('[data-speed="3"]').click();
    await page.waitForTimeout(350);
    const fastAudio = await page.evaluate(() => window.__nightPress.getAudio());
    assert.ok(fastAudio.humFrequency > slowAudio.humFrequency + 15, "roller audio should rise with speed");
    assert.equal(fastAudio.pressState, "printing");
    await page.locator('[data-speed="2"]').click();
    await advance(page, 3.2);
    let current = await state(page);
    assert.equal(current.jobs.find((job) => job.id === "midnight").stage, "drying");
    assert.equal(current.roll.main, 3);

    step("第二单自然耗尽主纸卷并验证急停");
    await configure(page, "neon", "poster", "magenta");
    await page.click("#startBtn");
    await advance(page, 3.0);
    current = await state(page);
    assert.equal(current.pressState, "out_of_paper");
    assert.equal(current.roll.main, 0);
    assert.equal(current.roll.active, "main");
    assert.equal(current.waste, 0);
    assert.ok((await page.locator("#paperAlert").isVisible()), "paper outage alert should be visible");
    const stoppedProgress = current.run.progress;
    await advance(page, 0.6);
    current = await state(page);
    assert.equal(current.run.progress, stoppedProgress, "press progress must stay frozen during paper outage");
    await page.screenshot({ path: "artifacts/paper-outage.png", fullPage: true });

    step("切换备用纸卷并恢复滚筒");
    await page.click("#switchPaperBtn");
    current = await state(page);
    assert.equal(current.roll.active, "backup");
    assert.equal(current.pressState, "printing");
    assert.equal(current.waste, 1);
    assert.equal(current.run.jobId, "neon");
    await advance(page, 2.0);
    current = await state(page);
    assert.equal(current.jobs.find((job) => job.id === "neon").stage, "drying");
    assert.equal(current.roll.backup, 12);

    step("第三单：末班车票，票根 + 末班金");
    await configure(page, "lastbus", "ticket", "gold");
    await page.click("#startBtn");
    await advance(page, 4.6);
    current = await state(page);
    assert.equal(
      current.jobs.find((job) => job.id === "lastbus").stage,
      "drying",
      JSON.stringify(current)
    );

    step("等待三批 A 面干透并逐个翻面");
    await advance(page, 7);
    current = await state(page);
    assert.ok(current.jobs.every((job) => job.stage === "ready_flip"));
    for (const jobId of ["midnight", "neon", "lastbus"]) {
      await page.locator(`[data-flip-id="${jobId}"]`).click();
    }
    current = await state(page);
    assert.ok(current.jobs.every((job) => job.stage === "ready_b"));

    step("依次完成三单 B 面");
    await printSideB(page, "midnight", 5);
    await printSideB(page, "neon", 5);
    await printSideB(page, "lastbus", 5);
    current = await state(page);
    assert.equal(current.gameState, "won");
    assert.equal(current.completed, 3);
    assert.equal(current.waste, 1);
    assert.ok(current.waste <= current.wasteLimit);
    assert.equal(await page.locator("#modalTitle").textContent(), "天亮前，全部交单。");
    await page.screenshot({ path: "artifacts/full-round-success.png", fullPage: true });

    const report = {
      completedAt: new Date().toISOString(),
      result: current.gameState,
      completedOrders: current.completed,
      waste: current.waste,
      wasteLimit: current.wasteLimit,
      paperOutage: {
        job: "neon",
        stoppedWithMainRollAt: 0,
        pressState: "out_of_paper",
        switchedToBackup: current.roll.active === "backup"
      },
      audio: {
        slowSpeed: slowAudio,
        fastSpeed: fastAudio
      },
      consoleErrors: errors
    };
    writeFileSync("artifacts/e2e-result.json", `${JSON.stringify(report, null, 2)}\n`);
    assert.equal(errors.length, 0, `unexpected browser errors: ${errors.join("\n")}`);
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await browser.close();
    server.child.kill("SIGTERM");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
