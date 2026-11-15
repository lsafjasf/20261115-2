import puppeteer from 'puppeteer';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const exe = resolve(root, '.browser/chrome-headless-shell-linux64/chrome-headless-shell');
const shots = resolve(root, 'artifacts');
mkdirSync(shots, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

const browser = await puppeteer.launch({
  executablePath: exe,
  headless: 'shell',
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
    '--use-gl=angle', '--use-angle=swiftshader']
});
const page = await browser.newPage();
await page.setViewport({ width: 1500, height: 1000, deviceScaleFactor: 1 });

const consoleErrors = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text());
});
page.on('pageerror', (err) => consoleErrors.push(String(err)));

await page.goto('http://127.0.0.1:8765/index.html', { waitUntil: 'networkidle0' });
await sleep(300);

// 1. 十条字幕渲染
const cueCount = await page.$$eval('.cue-item', (els) => els.length);
assert(cueCount === 10, `期望 10 条字幕，实际 ${cueCount}`);

// 2. Canvas 非空白
const blankCheck = await page.evaluate(() => {
  const c = document.getElementById('stage');
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let nonBg = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i] > 30 || d[i + 1] > 30 || d[i + 2] > 40) nonBg++;
  }
  return { total: d.length / 4, nonBg };
});
assert(blankCheck.nonBg > 5000, `画布内容过少: ${JSON.stringify(blankCheck)}`);

// 3. 默认规则下无超限，调小行宽后出现标红
const dangerBefore = await page.$$eval('.cue-item.danger', (els) => els.length);
await page.evaluate(() => {
  const el = document.getElementById('maxWidth');
  el.value = '360';
  el.dispatchEvent(new Event('input', { bubbles: true }));
});
await sleep(100);
const dangerAfter = await page.$$eval('.cue-item.danger', (els) => els.length);
assert(dangerAfter > dangerBefore, `行宽收紧后应出现更多超限 (${dangerBefore} -> ${dangerAfter})`);

// 4. 关闭英文完整性后长单词被切分（重排仍然成功）
await page.evaluate(() => {
  document.getElementById('wordIntact').click();
  document.getElementById('kinsoku').click();
});
await sleep(100);
const stillTen = await page.$$eval('.cue-item', (els) => els.length);
assert(stillTen === 10, '开关切换后字幕数量异常');

// 恢复默认
await page.evaluate(() => {
  document.getElementById('wordIntact').click();
  document.getElementById('kinsoku').click();
  const mw = document.getElementById('maxWidth');
  mw.value = '880';
  mw.dispatchEvent(new Event('input', { bubbles: true }));
});
await sleep(100);

// 5. 点击字幕跳转并截图
await page.evaluate(() => document.querySelectorAll('.cue-item')[1].click());
await sleep(200);
await page.screenshot({ path: `${shots}/preview-cue2.png` });

// 6. 播放 1.2 秒（驱动 requestAnimationFrame；音频在 headless 下静默失败不影响渲染）
await page.evaluate(() => document.getElementById('play').click());
await sleep(1200);
const clockText = await page.$eval('#clock', (el) => el.textContent);
assert(!clockText.startsWith('00:00'), `播放后时间应前进: ${clockText}`);
await page.evaluate(() => document.getElementById('stop').click());

// 7. WebVTT 导出内容
const vtt = await page.evaluate(async () => {
  const { buildVtt } = await import('/js/exporter.js');
  const { buildCues } = await import('/js/cues.js');
  return buildVtt(buildCues());
});
assert(vtt.startsWith('WEBVTT'), 'VTT 头缺失');
assert((vtt.match(/-->/g) || []).length === 10, 'VTT 应包含 10 条 cue');
writeFileSync(`${shots}/subtitles.vtt`, vtt);

// 8. PNG 检查图（十宫格）尺寸与非空白
const sheetInfo = await page.evaluate(async () => {
  const { buildContactSheet } = await import('/js/render.js');
  const canvas = document.getElementById('stage');
  const { buildCues } = await import('/js/cues.js');
  const { layoutText, DEFAULT_NO_START, DEFAULT_NO_END } = await import('/js/layout.js');
  const measureCtx = document.createElement('canvas').getContext('2d');
  measureCtx.font = '500 34px "PingFang SC","Microsoft YaHei",sans-serif';
  const opts = { maxWidth: 880, wordIntact: true, kinsoku: true,
    noStart: DEFAULT_NO_START, noEnd: DEFAULT_NO_END };
  const cues = buildCues();
  const layouts = cues.map((c) => layoutText(c.text, (t) => measureCtx.measureText(t).width, opts));
  const sheet = buildContactSheet(canvas, cues, layouts,
    { fontSize: 34, showSafe: true });
  const dataUrl = sheet.toDataURL('image/png');
  return { width: sheet.width, height: sheet.height, bytes: dataUrl.length };
});
assert(sheetInfo.width === 1280 && sheetInfo.height === (360 + 34) * 5,
  `检查图尺寸异常: ${JSON.stringify(sheetInfo)}`);
assert(sheetInfo.bytes > 10000, '检查图内容过小');

const framePng = await page.evaluate(() =>
  document.getElementById('stage').toDataURL('image/png').length);
assert(framePng > 10000, '当前帧 PNG 过小');
await page.screenshot({ path: `${shots}/app-overview.png` });

// 9. 控制台无错误（音频上下文 headless 限制除外）
const realErrors = consoleErrors.filter((e) => !/AudioContext|audio/i.test(e));
assert(realErrors.length === 0, `控制台错误: ${JSON.stringify(realErrors)}`);

await browser.close();
console.log('E2E 通过:', JSON.stringify({
  cueCount, dangerBefore, dangerAfter, clockText,
  sheet: `${sheetInfo.width}x${sheetInfo.height}`, vttBytes: vtt.length
}, null, 0));
