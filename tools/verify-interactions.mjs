import { chromium } from '/home/hj/userfeedback/uid220/node_modules/playwright/index.mjs';

const browser = await chromium.launch({
  executablePath: '/home/hj/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome',
  args: ['--no-sandbox', '--force-color-profile=srgb']
});
const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto('http://127.0.0.1:8823/index.html', { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__LUMA__);

const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (detail ? ' | ' + detail : ''));
};

/* 真实拖动色温滑杆，读数与引擎参数同步 */
const tempBefore = await page.evaluate(() => window.__LUMA__.state.params.temperature);
await page.locator('#ctl-temperature').fill('7200');
await page.waitForTimeout(120);
const tempAfter = await page.evaluate(() => ({
  param: window.__LUMA__.state.params.temperature,
  readout: document.querySelector('#val-temperature').textContent,
  card: document.querySelector('#readout-temp').textContent
}));
check('色温滑杆驱动参数与两侧读数', tempBefore === 5600 && tempAfter.param === 7200 &&
      tempAfter.readout === '7200 K' && tempAfter.card === '7200 K', JSON.stringify(tempAfter));

/* 键盘 Ctrl+Z 撤销滑杆调整 */
await page.keyboard.press('Control+z');
await page.waitForTimeout(120);
const tempUndone = await page.evaluate(() => window.__LUMA__.state.params.temperature);
check('Ctrl+Z 键盘撤销滑杆调整', tempUndone === 5600, String(tempUndone));
await page.keyboard.press('Control+y');
await page.waitForTimeout(120);
const tempRedone = await page.evaluate(() => window.__LUMA__.state.params.temperature);
check('Ctrl+Y 键盘重做', tempRedone === 7200, String(tempRedone));

/* 滑杆调整后原预设高亮应取消 */
const activeCleared = await page.evaluate(() =>
  document.querySelectorAll('.preset-card.active').length === 0);
check('手动调整后预设高亮取消', activeCleared);

/* 多步撤销栈：曝光再调整后连续两次撤销 */
await page.locator('#ctl-exposure').fill('1.25');
await page.waitForTimeout(100);
await page.locator('#ctl-contrast').fill('45');
await page.waitForTimeout(100);
await page.evaluate(() => window.__LUMA__.undo());
await page.waitForTimeout(80);
const c1 = await page.evaluate(() => window.__LUMA__.state.params.contrast);
await page.evaluate(() => window.__LUMA__.undo());
await page.waitForTimeout(80);
const e1 = await page.evaluate(() => window.__LUMA__.state.params.exposure);
check('多步撤销按栈顺序回退', c1 === 0 && Math.abs(e1 - 0) <= 0.001, `contrast=${c1} exposure=${e1}`);

/* 同一次滑杆拖拽的连续输入合并为单条撤销记录 */
const coalesce = await page.evaluate(async () => {
  const L = window.__LUMA__;
  const before = L.state.undoStack.length;
  const el = document.querySelector('#ctl-temperature');
  el.focus();
  for (const v of [5800, 6200, 6600, 7000]) {
    el.value = v;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }
  el.dispatchEvent(new Event('change', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 80));
  const pushed = L.state.undoStack.length - before;
  L.undo();
  await new Promise((r) => setTimeout(r, 60));
  return { pushed, restoredTemp: L.state.params.temperature };
});
check('滑杆拖拽撤销合并为一条且可完整回退',
      coalesce.pushed === 1 && coalesce.restoredTemp === 7200, JSON.stringify(coalesce));

/* 按住看原图：按下显示未处理底图，松开恢复 */
const processed = await page.evaluate(() => Array.from(window.__LUMA__.getFrame().data.slice(0, 4)));
await page.locator('#hold-original').hover();
await page.mouse.down();
await page.waitForTimeout(60);
const held = await page.evaluate(() => {
  const c = document.querySelector('#stage');
  return Array.from(c.getContext('2d').getImageData(0, 0, 1, 1).data);
});
await page.mouse.up();
await page.waitForTimeout(80);
const restored = await page.evaluate(() => Array.from(window.__LUMA__.getFrame().data.slice(0, 4)));
check('按住看原图 / 松开恢复', JSON.stringify(held) !== JSON.stringify(processed) &&
      JSON.stringify(restored) === JSON.stringify(processed));

/* 点击底部对照单元会切换底图并套用预设 */
await page.locator('.compare-cell').nth(4).click();
await page.waitForTimeout(200);
const loaded = await page.evaluate(() => ({
  base: window.__LUMA__.state.baseId,
  preset: window.__LUMA__.state.activePresetId
}));
check('对照条点击载入 沙丘花园 + 青橙公路',
      loaded.base === 'duneGarden' && loaded.preset === 'teal-orange', JSON.stringify(loaded));

/* 底图角标随切换更新 */
const badge = await page.locator('#frame-badge').textContent();
check('角标随底图切换为 02 / 02', badge === '02 / 02', badge);

/* 直方图 canvas 已实际绘制（非空白） */
const histoPainted = await page.evaluate(() => {
  const c = document.querySelector('#histo');
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let nonBg = 0;
  for (let i = 0; i < d.length; i += 4)
    if (Math.abs(d[i] - 16) + Math.abs(d[i + 1] - 20) + Math.abs(d[i + 2] - 15) > 30) nonBg++;
  return nonBg;
});
check('直方图实际绘制了通道曲线', histoPainted > 500, String(histoPainted));

/* 导出按钮触发 PNG 下载 */
const [download] = await Promise.all([
  page.waitForEvent('download'),
  page.locator('#export-btn').click()
]);
check('导出按钮生成 PNG 下载', download.suggestedFilename().endsWith('.png'),
      download.suggestedFilename());

check('交互全程无页面异常', errors.length === 0, errors.join('; '));
const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} interaction checks passed`);
await browser.close();
process.exit(failed ? 1 : 0);
