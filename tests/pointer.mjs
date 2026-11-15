// 验证真实鼠标交互：在杯身处按下并拖动 -> 摩擦升温；在杯沿重击 -> 裂杯。
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = createServer(async (req, res) => {
  const path = req.url === '/' ? '/index.html' : req.url.split('?')[0];
  const buf = await readFile(join(ROOT, path));
  res.writeHead(200, { 'Content-Type': MIME[extname(path)] || 'application/octet-stream' });
  res.end(buf);
});
await new Promise((r) => server.listen(8138, r));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 980 } });
page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message));
await page.goto('http://localhost:8138/');
await page.waitForFunction('window.__glassHarp !== undefined');

const box = await page.locator('#stage').boundingBox();
const scaleX = box.width / 1120;
const scaleY = box.height / 520;
const cupCx = 100 + 92 / 2 + 2 * 126; // E4（第 3 个杯）中心
const rubX = box.x + cupCx * scaleX;
const rubY = box.y + 260 * scaleY; // 杯身中部，forceAt 温和不裂杯

// 沿杯身快速来回拖动模拟摩擦
await page.mouse.move(rubX, rubY);
await page.mouse.down();
for (let i = 0; i < 24; i++) {
  await page.mouse.move(rubX + (i % 2 ? 34 : -34), rubY, { steps: 3 });
}
await page.mouse.up();
await page.waitForTimeout(300);
const rubbed = await page.evaluate(() => window.__glassHarp.getState().glasses[2]);
console.log(`拖动摩擦后 E4: ${rubbed.temperature.toFixed(1)} C, ${rubbed.freq.toFixed(2)} Hz, ${rubbed.cents.toFixed(1)} cent`);
const heated = rubbed.temperature > 26 && rubbed.cents < -5;

// 换用 C4 杯（第 1 个），在杯沿最上端重击触发裂杯
const c4rimX = box.x + (100 + 46) * scaleX;
const c4rimY = box.y + 92 * scaleY;
await page.mouse.click(c4rimX, c4rimY);
const state = await page.evaluate(() => window.__glassHarp.getState());
const cracked = state.brokenCount === 1;
console.log(`杯沿重击后破损数: ${state.brokenCount}`);

await browser.close();
server.close();
console.log(heated && cracked ? 'POINTER TESTS PASSED' : 'POINTER TESTS FAILED');
process.exit(heated && cracked ? 0 : 1);
