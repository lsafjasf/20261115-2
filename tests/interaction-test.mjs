import { chromium } from "playwright";
import { startServer } from "./static-server.mjs";

const { server, url } = await startServer(0);
const browser = await chromium.launch({
  headless: true,
  args: ["--autoplay-policy=no-user-gesture-required"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 1400 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto(url, { waitUntil: "networkidle" });

// 1. 点击播放按钮（真实用户手势路径）
await page.click("#playBtn");
await page.waitForTimeout(900);
const playing = await page.evaluate(() => window.__drum.engine.playing);
console.log(`${playing ? "PASS" : "FAIL"}  点击播放后调度器运行`);

// 2. 步进格点击：切换 (kick, 1) 后再点回来
const before = await page.evaluate(() => window.__drum.engine.pattern.kick[1]);
const box = await page.locator("#stepCanvas").boundingBox();
const cw = (920 - 70) / 16;
const cellX = 70 + 1 * cw + cw / 2;
const cellY = 26 + 0 * 44 + 44 / 2;
const stepScaleX = box.width / 920;
const stepScaleY = box.height / 240;
await page.mouse.click(box.x + cellX * stepScaleX, box.y + cellY * stepScaleY);
const after = await page.evaluate(() => window.__drum.engine.pattern.kick[1]);
console.log(`${after !== before ? "PASS" : "FAIL"}  Canvas 步进格点击可切换触发`);

// 3. 节点图拖拽连线：从 bus 之外的声源输出拖到效果输入（clap → delay）
const gbox = await page.locator("#graphCanvas").boundingBox();
const gx = gbox.width / 920;
const gy = gbox.height / 420;
const scale = (x, y) => [gbox.x + x * gx, gbox.y + y * gy];
const [sx, sy] = scale(40 + 132, 340 + 32);       // clap 输出端口
const [tx, ty] = scale(360, 260 + 32);            // delay 输入端口
await page.mouse.move(sx, sy);
await page.mouse.down();
await page.mouse.move(tx, ty, { steps: 8 });
await page.mouse.up();
const edgeAdded = await page.evaluate(() =>
  window.__drum.engine.edges.some((e) => e.src === "clap" && e.dst === "delay"));
console.log(`${edgeAdded ? "PASS" : "FAIL"}  Canvas 拖拽可建立节点连线`);

// 4. 非法拖拽：filter 输出 → 自己的输入（自环），应被拒绝
const msg1 = await page.locator("#graphMsg").textContent();
const [fx, fy] = scale(360 + 132, 90 + 32);
const [fix, fiy] = scale(360, 90 + 32);
await page.mouse.move(fx, fy);
await page.mouse.down();
await page.mouse.move(fix, fiy, { steps: 6 });
await page.mouse.up();
const rejected = await page.evaluate(() =>
  !window.__drum.engine.edges.some((e) => e.src === "filter" && e.dst === "filter"));
const msg2 = await page.locator("#graphMsg").textContent();
console.log(`${rejected && msg2 !== msg1 ? "PASS" : "FAIL"}  自环拖拽被拒绝并显示原因（${msg2}）`);

// 5. 点击旁路按钮
await page.locator('.bypass-btn[data-id="filter"]').click();
const bypassed = await page.evaluate(() => window.__drum.engine.isBypassed("filter"));
const label = await page.locator('.bypass-btn[data-id="filter"]').textContent();
console.log(`${bypassed && label.includes("开") ? "PASS" : "FAIL"}  旁路按钮切换状态（${label.trim()}）`);

await page.click("#stopBtn");
console.log(`${errors.length === 0 ? "PASS" : "FAIL"}  交互过程无页面错误${errors.length ? "：" + errors.join("|") : ""}`);

await browser.close();
server.close();
process.exit(0);
