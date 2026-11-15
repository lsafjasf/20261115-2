// 无头盲听：驱动 Chromium 渲染真实 Web Audio，仅通过 PCM 声学特征推断答案，
// 然后在页面上实际提交，验证“全部正确才通关”，并确认 Canvas 提交前隐藏、提交后显示。
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

const root = join(import.meta.dirname, '..');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

const server = createServer(async (req, res) => {
  const path = req.url === '/' ? '/index.html' : req.url.split('?')[0];
  try {
    const data = await readFile(join(root, path));
    res.writeHead(200, { 'content-type': mime[extname(path)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch();
const page = await browser.newPage();
page.on('console', (msg) => {
  if (msg.type() === 'error') console.log('[browser error]', msg.text());
});
page.on('pageerror', (err) => console.log('[page error]', err.message));

// 1) 真正“盲听”：探针页里只有 PCM，没有任何声源真值
await page.goto(`${base}/test/harness.html`);
await page.waitForFunction(() => window.__ready === true);
const blind = await page.evaluate(() => window.__runBlind());
console.log('盲听推断结果：');
  for (const e of blind.events) {
  console.log(
    `  t=${e.onset}s 识别=${e.type.padEnd(6)} 方向=${e.direction} `
      + `证据=${JSON.stringify(e.evidence)}`,
  );
}
console.log('  推断发生顺序:', blind.order.join(' → '));
console.log('  推断方向:', JSON.stringify(blind.directions));

// 2) 打开游戏页实际提交
await page.goto(`${base}/`);
const canvasHiddenBefore = await page.$eval('#measure-canvas', (c) => c.classList.contains('hidden'));
await page.click('#start-btn');
await page.waitForTimeout(400);

for (const [type, direction] of Object.entries(blind.directions)) {
  await page.selectOption(`#dir-selects select[data-type="${type}"]`, direction);
}
await page.$$eval('.order-slot', (slots, order) => {
  slots.forEach((slot, i) => {
    slot.value = order[i];
    slot.dispatchEvent(new Event('change', { bubbles: true }));
  });
}, blind.order);

await page.click('button[type="submit"]');
await page.waitForTimeout(300);
const resultText = await page.$eval('#result', (el) => el.textContent);
const resultClass = await page.$eval('#result', (el) => el.className);
const canvasVisibleAfter = await page.$eval('#measure-canvas', (c) => !c.classList.contains('hidden'));

// 3) 真值对照（仅在推断完成后才由页面模块计算，用于报告，不参与推断）
const truth = await page.evaluate(async () => {
  const { buildWorld, relativeGeometry, WORLD } = await import('/js/world.js');
  const world = buildWorld();
  const directions = {};
  for (const s of world.sources) {
    directions[s.id] = relativeGeometry(s, { x: WORLD.startListenerX, y: 0 }).directionId;
  }
  return { order: world.order, directions };
});
console.log('\n真值（推断后才读取，仅用于核对）：');
console.log('  真值发生顺序:', truth.order.join(' → '));
console.log('  真值方向:', JSON.stringify(truth.directions));

const orderMatch = blind.order.every((id, i) => id === truth.order[i]);
const dirMatch = Object.entries(truth.directions).every(([k, v]) => blind.directions[k] === v);
const passed = orderMatch && dirMatch && resultClass.includes('pass')
  && canvasHiddenBefore && canvasVisibleAfter;

console.log('\n页面反馈:', resultText);
console.log(`Canvas 提交前隐藏=${canvasHiddenBefore}，提交后显示=${canvasVisibleAfter}`);
console.log(`方向盲判${dirMatch ? '正确' : '错误'}，顺序盲判${orderMatch ? '正确' : '错误'}，通关状态=${resultClass.includes('pass')}`);

// 4) 反例验证：故意提交错误答案，必须不能通关，且不显示 pass
await page.selectOption('#dir-selects select[data-type="reed"]', blind.directions.reed === 'fl' ? 'fr' : 'fl');
await page.click('button[type="submit"]');
await page.waitForTimeout(200);
const wrongClass = await page.$eval('#result', (el) => el.className);
console.log('错误答案反馈 class =', wrongClass, '(预期 fail)');

await browser.close();
server.close();

if (!passed || !wrongClass.includes('fail')) {
  console.error('\n盲听测试未通过');
  process.exit(1);
}
console.log('\n✅ 一次完整盲听完成：方向与顺序全部盲判正确，页面通关，Canvas 行为符合要求。');
