const { chromium } = require("playwright");
const fs = require("fs");

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 1000 } });
  await page.goto("file:///home/hj/userfeedback/uid425/app/index.html");
  await page.waitForFunction(() => window.App);

  // 记录校准前原始数据结构快照
  const rawBefore = await page.evaluate(() => JSON.stringify(window.App.rawData));

  // ---- 窗口 1：60s ~ 300s，先截原始视图 ----
  await page.evaluate(() => window.App.setWindow(60, 300));
  await page.evaluate(() => window.App.setCalibratedView(false));
  await page.screenshot({ path: "shots/window1_raw.png" });

  // ---- 实际执行一次校准：在窗口内放置 3 个校准点 ----
  await page.evaluate(() => {
    window.App.addCalibrationPoint(100);
    window.App.addCalibrationPoint(180);
    window.App.addCalibrationPoint(270);
    window.App.setCalibratedView(true);
  });
  await page.screenshot({ path: "shots/window1_calibrated.png" });

  // 验证：校准后原始数据结构未被修改
  const rawAfter = await page.evaluate(() => JSON.stringify(window.App.rawData));
  console.log("原始数据结构/内容未改变:", rawBefore === rawAfter);

  const stats1 = await page.evaluate(() => window.App.stats());
  console.log("窗口1 [60s,300s] 统计:");
  stats1.before.forEach((b, i) => {
    const a = stats1.after[i];
    console.log(`  传感器${"ABC"[i]}: 校准前 平均误差=${b.mean.toFixed(3)} 最大偏差=${b.max.toFixed(3)} -> 校准后 平均误差=${a.mean.toFixed(3)} 最大偏差=${a.max.toFixed(3)}`);
  });

  // ---- 导出前后对比 PNG ----
  const dataUrl = await page.evaluate(() => window.App.exportPNG().toDataURL("image/png"));
  fs.writeFileSync("shots/compare_export.png", Buffer.from(dataUrl.split(",")[1], "base64"));
  console.log("已导出 shots/compare_export.png");

  // ---- 窗口 2：320s ~ 560s，查看校准效果 ----
  await page.evaluate(() => window.App.setWindow(320, 560));
  await page.screenshot({ path: "shots/window2_calibrated.png" });
  const stats2 = await page.evaluate(() => window.App.stats());
  console.log("窗口2 [320s,560s] 统计:");
  stats2.before.forEach((b, i) => {
    const a = stats2.after[i];
    console.log(`  传感器${"ABC"[i]}: 校准前 平均误差=${b.mean.toFixed(3)} 最大偏差=${b.max.toFixed(3)} -> 校准后 平均误差=${a.mean.toFixed(3)} 最大偏差=${a.max.toFixed(3)}`);
  });

  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
