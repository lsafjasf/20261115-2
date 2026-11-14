const { chromium } = require("playwright");
const http = require("http");
const fs = require("fs");
const path = require("path");
const assert = require("assert");

const ROOT = path.join(__dirname, "..");
const APP_DIR = path.join(ROOT, "app");
const ARTIFACT_DIR = path.join(ROOT, "artifacts");

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const rel = req.url === "/" ? "/index.html" : req.url.split("?")[0];
      const file = path.join(APP_DIR, decodeURIComponent(rel));
      fs.readFile(file, (err, buf) => {
        if (err) {
          res.writeHead(404);
          res.end("not found");
          return;
        }
        res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "text/plain" });
        res.end(buf);
      });
    });
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

(async () => {
  const server = await startServer();
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}/`;
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });

  const results = {};

  await page.goto(baseUrl);
  await page.waitForFunction(() => window.SyncApp && window.SYNC_DATA);

  const readRows = () =>
    page.$$eval("#tableBody tr", (trs) =>
      trs.map((tr) => ({
        index: tr.querySelector(".col-index").textContent,
        flash: tr.querySelector(".col-flash").textContent,
        beat: tr.querySelector(".col-beat").textContent,
        diff: tr.querySelector(".col-diff").textContent,
        red: tr.classList.contains("over-tolerance")
      }))
    );

  /* 1. 初始状态：节拍比闪光晚 320ms，超过 80ms 容差，12 行全部标红 */
  let rows = await readRows();
  assert.strictEqual(rows.length, 12, "应有 12 行");
  assert.ok(rows.every((r) => Math.abs(parseFloat(r.diff) - 320) < 1e-9), "初始差值应为 +320ms");
  assert.ok(rows.every((r) => r.red), "初始所有行应超容差标红");
  const avgInitial = await page.textContent("#avgDiff");
  assert.strictEqual(avgInitial.trim(), "320.0 ms");
  results.initial = { rowCount: rows.length, diffMs: 320, redRows: rows.filter((r) => r.red).length, avg: avgInitial.trim() };

  /* 2. 实际拖动“音频偏移”滑块到 -320ms（模拟真实用户输入事件） */
  await page.fill("#offsetSlider", "-320");
  await page.dispatchEvent("#offsetSlider", "input");
  const offsetLabel = await page.textContent("#offsetValue");
  assert.strictEqual(offsetLabel.trim(), "-320 ms");

  rows = await readRows();
  assert.ok(rows.every((r) => Math.abs(parseFloat(r.diff)) < 0.05), "校正后每行差值应显示 0.0ms");
  assert.ok(rows.every((r) => !r.red), "校正后不应再有标红行");
  assert.ok(
    rows.every((r) => Math.abs(parseFloat(r.beat) - parseFloat(r.flash)) < 1e-9),
    "校正后节拍时刻应等于闪光时刻"
  );
  const avgAligned = await page.textContent("#avgDiff");
  assert.strictEqual(avgAligned.trim(), "0.0 ms");
  results.aligned = { offsetMs: -320, diffs: rows.map((r) => r.diff), redRows: 0, avg: avgAligned.trim() };

  /* 2b. 容差边界：差值在容差内保持黑色，超过容差立即标红，平均差值同样标红 */
  await page.fill("#offsetSlider", "-250");
  await page.dispatchEvent("#offsetSlider", "input");
  rows = await readRows();
  assert.ok(rows.every((r) => !r.red), "70ms 差值在 80ms 容差内不应标红");
  assert.ok((await page.textContent("#avgDiff")).includes("70.0"), "平均差值应为 70ms");

  await page.fill("#toleranceInput", "60");
  await page.dispatchEvent("#toleranceInput", "input");
  rows = await readRows();
  assert.ok(rows.every((r) => r.red), "70ms 超过 60ms 容差应全部标红");
  assert.ok((await page.$eval("#avgDiff", (el) => el.classList.contains("over-tolerance"))), "平均差值超容差应标红");

  await page.fill("#toleranceInput", "80");
  await page.dispatchEvent("#toleranceInput", "input");
  await page.fill("#offsetSlider", "-320");
  await page.dispatchEvent("#offsetSlider", "input");
  results.tolerance = { within: "70ms@80ms 黑色", over: "70ms@60ms 标红" };

  /* 3. 播放/暂停/拖动播放头共用同一时间基准 */
  await page.click("#playBtn");
  await page.waitForTimeout(300);
  const playingTime1 = await page.evaluate(() => window.SyncApp.clock.currentTime());
  assert.ok(playingTime1 > 0, "播放后时钟应前进");
  await page.click("#playBtn");
  const pausedTime = await page.evaluate(() => window.SyncApp.clock.currentTime());
  await page.waitForTimeout(200);
  const stillPaused = await page.evaluate(() => window.SyncApp.clock.currentTime());
  assert.ok(Math.abs(stillPaused - pausedTime) < 1e-6, "暂停后时钟必须冻结");

  await page.fill("#scrubber", "5.2");
  await page.dispatchEvent("#scrubber", "input");
  const afterSeek = await page.evaluate(() => window.SyncApp.clock.currentTime());
  assert.ok(Math.abs(afterSeek - 5.2) < 1e-6, "拖动播放头应写入同一时钟");
  const readout = await page.textContent("#timeReadout");
  assert.ok(readout.includes("5.200"), "画面读数应跟随同一时钟");
  const transport = await page.textContent("#transportTime");
  assert.ok(transport.startsWith("5.200"), "传输栏应跟随同一时钟");
  results.clock = { pausedFrozen: true, seekTime: afterSeek, readout: readout.trim() };

  /* 4. 保存偏移并重新载入 */
  await page.click("#saveBtn");
  const savedRaw = await page.evaluate((key) => localStorage.getItem(key), "av-sync-tool:audioOffsetMs");
  assert.strictEqual(savedRaw, "-320", "localStorage 应保存 -320");
  const saveStatus = await page.textContent("#saveStatus");
  assert.ok(saveStatus.includes("-320"), "保存状态应提示 -320ms");

  await page.reload();
  await page.waitForFunction(() => window.SyncApp && window.SYNC_DATA);
  const reloadedOffset = await page.evaluate(() => window.SyncApp.offsetSec);
  assert.strictEqual(reloadedOffset, -0.32, "刷新后应自动载入保存的偏移");
  rows = await readRows();
  assert.ok(rows.every((r) => Math.abs(parseFloat(r.diff)) < 0.05), "刷新后差值仍应为 0.0ms");
  assert.ok(rows.every((r) => !r.red), "刷新后不应标红");
  const avgAfterReload = await page.textContent("#avgDiff");
  assert.strictEqual(avgAfterReload.trim(), "0.0 ms");
  const statusAfterReload = await page.textContent("#saveStatus");
  assert.ok(statusAfterReload.includes("-320"), "刷新后应显示已载入保存的偏移");
  results.reloaded = {
    localStorage: savedRaw,
    offsetSec: reloadedOffset,
    avg: avgAfterReload.trim(),
    redRows: rows.filter((r) => r.red).length,
    status: statusAfterReload.trim()
  };

  await page.screenshot({ path: path.join(ARTIFACT_DIR, "alignment-verified.png"), fullPage: true });

  assert.strictEqual(errors.length, 0, "页面不应有控制台错误: " + errors.join(" | "));
  results.consoleErrors = 0;

  await context.close();
  await browser.close();
  server.close();

  fs.writeFileSync(path.join(ARTIFACT_DIR, "verification.json"), JSON.stringify(results, null, 2));
  console.log("ALL CHECKS PASSED");
  console.log(JSON.stringify(results, null, 2));
})().catch((err) => {
  console.error("VERIFICATION FAILED:", err);
  process.exit(1);
});
