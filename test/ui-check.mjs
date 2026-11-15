import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

const root = join(import.meta.dirname, '..');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = createServer(async (req, res) => {
  try {
    const path = req.url === '/' ? '/index.html' : req.url.split('?')[0];
    const data = await readFile(join(root, path));
    res.writeHead(200, { 'content-type': mime[extname(path)] || 'application/octet-stream' });
    res.end(data);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 920, height: 1100 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${base}/`);

// 初始：Canvas 必须隐藏
const hiddenBefore = await page.$eval('#measure-canvas', (c) => c.classList.contains('hidden'));
await page.screenshot({ path: join(root, 'artifacts/01-before-submit.png') });

await page.click('#start-btn');
await page.waitForTimeout(300);
// 移动监听点
await page.$eval('#listener-x', (el) => {
  el.value = '25';
  el.dispatchEvent(new Event('input', { bubbles: true }));
});
const posText = await page.$eval('#listener-pos', (el) => el.textContent);
await page.click('#replay-btn');
await page.waitForTimeout(300);

// 提交正确答案（真值仅在此处由 world 模块读出用于填表，模拟已通关玩家）
const truth = await page.evaluate(async () => {
  const { buildWorld, relativeGeometry, WORLD } = await import('/js/world.js');
  const w = buildWorld();
  const directions = {};
  for (const s of w.sources) directions[s.id] = relativeGeometry(s, { x: WORLD.startListenerX, y: 0 }).directionId;
  return { directions, order: w.order };
});
for (const [type, dir] of Object.entries(truth.directions)) {
  await page.selectOption(`#dir-selects select[data-type="${type}"]`, dir);
}
await page.$$eval('.order-slot', (slots, order) => {
  slots.forEach((slot, i) => { slot.value = order[i]; });
}, truth.order);
await page.click('button[type="submit"]');
await page.waitForTimeout(400);
const shownAfter = await page.$eval('#measure-canvas', (c) => !c.classList.contains('hidden'));
const resultClass = await page.$eval('#result', (el) => el.className);
await page.screenshot({ path: join(root, 'artifacts/02-after-submit.png') });

console.log(JSON.stringify({
  hiddenBefore,
  shownAfter,
  posText,
  resultClass,
  errors,
}, null, 2));
await browser.close();
server.close();
if (errors.length || !hiddenBefore || !shownAfter || !resultClass.includes('pass')) process.exit(1);
