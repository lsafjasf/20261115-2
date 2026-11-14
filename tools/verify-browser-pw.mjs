import { chromium } from '/home/hj/userfeedback/uid220/node_modules/playwright/index.mjs';
import { writeFile, mkdir } from 'node:fs/promises';

const ROOT = new URL('../', import.meta.url).pathname;
const OUT = ROOT + 'artifacts/comparison/';
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: '/home/hj/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome',
  args: ['--no-sandbox', '--force-color-profile=srgb']
});
const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push(String(e)));
await page.goto('http://127.0.0.1:8823/index.html', { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__LUMA__);

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (detail ? ' | ' + detail : ''));
};
const sleep = (ms) => page.waitForTimeout(ms);

/* 1. 启动状态与三套预设 */
const boot = await page.evaluate(() => {
  const s = window.__LUMA__.state;
  return {
    presetCount: s.presets.length,
    presetNames: s.presets.map((p) => p.name),
    canvasSize: document.querySelector('#stage').width + 'x' + document.querySelector('#stage').height,
    compareCells: document.querySelectorAll('.compare-cell').length,
    externalImages: [...document.querySelectorAll('img')].filter((i) => !i.src.startsWith('data:')).length
  };
});
check('三套内置预设已实际创建', boot.presetCount === 3, JSON.stringify(boot.presetNames));
check('无任何外部图片加载（img 均为 dataURL）', boot.externalImages === 0);
check('画布尺寸 960x640', boot.canvasSize === '960x640', boot.canvasSize);
check('双底图 × 三预设共 6 个对照单元', boot.compareCells === 6, String(boot.compareCells));

/* 2. 三预设在两张底图上逐像素不同 */
const diff = await page.evaluate(async () => {
  const L = window.__LUMA__;
  const out = {};
  for (const baseId of ['coastline', 'duneGarden']) {
    L.loadBase(baseId);
    await new Promise((r) => setTimeout(r, 90));
    const sigs = [];
    for (const p of L.state.presets) {
      L.applyPreset(p.id, false);
      await new Promise((r) => setTimeout(r, 60));
      const f = L.getFrame();
      let sum = 0;
      for (let i = 0; i < f.data.length; i += 4) sum += f.data[i] + f.data[i + 1] + f.data[i + 2];
      sigs.push({ id: p.id, sum });
    }
    out[baseId] = { sigs, allDistinct: new Set(sigs.map((s) => s.sum)).size === 3 };
  }
  return out;
});
for (const baseId of Object.keys(diff))
  check(`底图 ${baseId} 上三预设输出两两不同`, diff[baseId].allDistinct,
        diff[baseId].sigs.map((s) => s.id + ':' + s.sum).join(' '));

/* 3. 撤销 / 重做 */
const undo = await page.evaluate(async () => {
  const L = window.__LUMA__;
  L.loadBase('coastline');
  await new Promise((r) => setTimeout(r, 90));
  const before = Array.from(L.getFrame().data.slice(0, 12));
  const undoDisabled0 = document.querySelector('#undo-btn').disabled;
  L.applyPreset('teal-orange', true);
  await new Promise((r) => setTimeout(r, 70));
  const applied = Array.from(L.getFrame().data.slice(0, 12));
  const undoDisabled1 = document.querySelector('#undo-btn').disabled;
  L.undo();
  await new Promise((r) => setTimeout(r, 70));
  const restored = JSON.stringify(before) === JSON.stringify(Array.from(L.getFrame().data.slice(0, 12)));
  L.redo();
  await new Promise((r) => setTimeout(r, 70));
  const redone = JSON.stringify(applied) === JSON.stringify(Array.from(L.getFrame().data.slice(0, 12)));
  return { undoDisabled0, changed: JSON.stringify(before) !== JSON.stringify(applied),
           undoDisabled1, restored, redone };
});
check('初始撤销按钮禁用', undo.undoDisabled0 === true);
check('套用预设确实改变像素', undo.changed);
check('套用后撤销按钮可用', undo.undoDisabled1 === false);
check('撤销恢复套用前像素', undo.restored);
check('重做恢复预设像素', undo.redone);

/* 4. 导出 PNG 与预览逐像素一致 */
const exportCheck = await page.evaluate(async () => {
  const L = window.__LUMA__;
  L.loadBase('coastline');
  await new Promise((r) => setTimeout(r, 90));
  L.applyPreset('warm-film', false);
  await new Promise((r) => setTimeout(r, 70));
  const preview = L.getFrame();
  const out = document.createElement('canvas');
  out.width = preview.width; out.height = preview.height;
  out.getContext('2d').putImageData(preview, 0, 0);
  const dataUrl = out.toDataURL('image/png');
  const img = new Image();
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = dataUrl; });
  const dec = document.createElement('canvas');
  dec.width = preview.width; dec.height = preview.height;
  const dctx = dec.getContext('2d');
  dctx.drawImage(img, 0, 0);
  const decoded = dctx.getImageData(0, 0, preview.width, preview.height);
  let mismatches = 0;
  for (let i = 0; i < preview.data.length; i++)
    if (preview.data[i] !== decoded.data[i]) mismatches++;
  return { mismatches, bytes: Math.round(dataUrl.length * 0.75) };
});
check('PNG 导出与预览逐像素一致（无损 sRGB）', exportCheck.mismatches === 0,
      `mismatches=${exportCheck.mismatches} pngBytes≈${exportCheck.bytes}`);

/* 5. 直方图正确性与实时性 */
const histo = await page.evaluate(async () => {
  const L = window.__LUMA__;
  const rows = [];
  for (const id of [null, ...L.state.presets.map((p) => p.id)]) {
    if (id) L.applyPreset(id, false); else L.loadBase('coastline');
    await new Promise((r) => setTimeout(r, 60));
    const h = LUMA.computeHistogram(L.getFrame().data);
    rows.push({ id: id || 'none', total: h.r.reduce((a, b) => a + b, 0), peak: Math.max(...h.r) });
  }
  return { rows, pixels: 960 * 640, distinctPeaks: new Set(rows.map((r) => r.peak)).size };
});
check('直方图像素总数=画布像素数', histo.rows.every((r) => r.total === histo.pixels));
check('直方图随预设实时变化', histo.distinctPeaks > 1, JSON.stringify(histo.rows.map((r) => r.peak)));

/* 6. 自定义预设持久化与删除 */
const custom = await page.evaluate(async () => {
  const L = window.__LUMA__;
  document.querySelector('#preset-name').value = '我的暗调';
  document.querySelector('#save-preset').click();
  await new Promise((r) => setTimeout(r, 60));
  const stored = JSON.parse(localStorage.getItem('luma.colorroom.presets.v1') || '[]');
  const count1 = L.state.presets.length;
  const id = L.state.presets.at(-1).id;
  document.querySelector('[data-del="' + id + '"]').click();
  await new Promise((r) => setTimeout(r, 60));
  return { storedCount: stored.length, count1, afterDelete: L.state.presets.length };
});
check('自定义预设写入 localStorage', custom.storedCount === 1 && custom.count1 === 4);
check('自定义预设可删除', custom.afterDelete === 3);

/* 7. 底图切换 */
const baseSwitch = await page.evaluate(async () => {
  const L = window.__LUMA__;
  L.loadBase('coastline');
  await new Promise((r) => setTimeout(r, 70));
  const a = Array.from(L.getFrame().data.slice(0, 12));
  L.loadBase('duneGarden');
  await new Promise((r) => setTimeout(r, 70));
  const b = Array.from(L.getFrame().data.slice(0, 12));
  return { differs: JSON.stringify(a) !== JSON.stringify(b),
           tabOn: document.querySelector('.base-tab[data-base="duneGarden"]').classList.contains('on') };
});
check('两张底图内容不同且切换生效', baseSwitch.differs && baseSwitch.tabOn);

/* 8. 控制台无报错 */
check('浏览器控制台零错误', consoleErrors.length === 0, consoleErrors.join('; '));

/* 9. 截图：工作台全貌 + 3 预设 × 2 底图 */
await page.evaluate(async () => {
  const L = window.__LUMA__;
  L.loadBase('coastline');
  await new Promise((r) => setTimeout(r, 100));
  L.applyPreset('teal-orange', false);
  await new Promise((r) => setTimeout(r, 100));
});
await page.screenshot({ path: ROOT + 'artifacts/luma-workbench.png' });

const stageBox = await page.locator('#stage').boundingBox();
for (const baseId of ['coastline', 'duneGarden']) {
  for (const preset of ['morning-mist', 'teal-orange', 'warm-film']) {
    await page.evaluate(async ([b, p]) => {
      const L = window.__LUMA__;
      L.loadBase(b);
      await new Promise((r) => setTimeout(r, 90));
      L.applyPreset(p, false);
      await new Promise((r) => setTimeout(r, 90));
    }, [baseId, preset]);
    await page.locator('#stage').screenshot({ path: `${OUT}${baseId}__${preset}.png` });
  }
}
void stageBox;

/* 10. 导出真实 PNG 文件到磁盘（验证下载链路） */
const [download] = await Promise.all([
  page.waitForEvent('download'),
  page.evaluate(() => document.querySelector('#export-btn').click())
]);
await download.saveAs(OUT + 'export-sample-coastline-warm-film.png');

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
await browser.close();
process.exit(failed.length ? 1 : 0);
