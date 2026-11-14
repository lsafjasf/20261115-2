import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto("http://127.0.0.1:8403/index.html");
await page.waitForTimeout(300);

// 截图：调整曲线后的编辑器界面
await page.screenshot({ path: "artifacts/editor-screenshot.png" });

// 触发 8 秒视频导出并等待下载
const downloadPromise = page.waitForEvent("download", { timeout: 20000 });
await page.locator("#export").click();
const download = await downloadPromise;
const path = await download.path();
const { statSync } = await import("node:fs");
const size = statSync(path).size;
console.log(`下载文件: ${download.suggestedFilename()}, 大小 ${size} 字节`);
console.log(size > 10000 ? "PASS  8 秒视频导出成功" : "FAIL  视频文件过小");
await page.screenshot({ path: "artifacts/editor-after-export.png" });
await browser.close();
process.exit(size > 10000 ? 0 : 1);
