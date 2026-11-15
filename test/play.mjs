import { chromium } from "playwright";

const url = "file:///home/hj/userfeedback/uid361/index.html?speed=16&seed=20261115";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.on("console", m => { if (m.type() === "error") console.log("[page-error]", m.text()); });
await page.goto(url);

// 玩家操作:设置传感器权重与告警阈值
await page.locator("#wVib").fill("1.0");
await page.locator("#wGas").fill("1.0");
await page.locator("#wInf").fill("1.0");
await page.locator("#thr").fill("55");

// 开始监测
await page.locator("#btnStart").click();

// 等待模拟结束(16x 下约 25 秒,留足余量)
await page.waitForFunction(() => window.__game.finished, null, { timeout: 120000 });

const result = await page.evaluate(() => ({
  text: document.getElementById("result").textContent,
  cls: document.getElementById("result").className,
  statFalse: window.__game.statFalse,
  statMiss: window.__game.statMiss,
  statGood: window.__game.statGood,
  correctAlarmMin: window.__game.correctAlarmMin,
  logAfterGood: window.__game.logAfterGood,
  logCount: window.__game.log.length,
}));
console.log(JSON.stringify(result, null, 2));

await page.screenshot({ path: "artifacts/judgment-result.png", fullPage: true });
await browser.close();

if (result.cls !== "win" || result.statGood < 1 || result.logAfterGood < 3) {
  console.error("判定失败:未完成正确预警+后续观察");
  process.exit(1);
}
console.log("判定成功:任务完成");
