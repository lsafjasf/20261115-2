import puppeteer from 'puppeteer';
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const exe = resolve(root, '.browser/chrome-headless-shell-linux64/chrome-headless-shell');

const browser = await puppeteer.launch({
  executablePath: exe,
  headless: 'shell',
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
});
const page = await browser.newPage();
await page.goto('http://127.0.0.1:8765/index.html', { waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, 300));

// 收紧行宽制造超限标红，再生成检查图
const data = await page.evaluate(async () => {
  const mw = document.getElementById('maxWidth');
  mw.value = '430';
  mw.dispatchEvent(new Event('input', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 100));
  const { buildContactSheet } = await import('/js/render.js');
  const { buildCues } = await import('/js/cues.js');
  const { layoutText, DEFAULT_NO_START, DEFAULT_NO_END } = await import('/js/layout.js');
  const measureCtx = document.createElement('canvas').getContext('2d');
  measureCtx.font = '500 34px "PingFang SC","Noto Sans SC",sans-serif';
  const opts = { maxWidth: 430, wordIntact: true, kinsoku: true,
    noStart: DEFAULT_NO_START, noEnd: DEFAULT_NO_END };
  const cues = buildCues();
  const layouts = cues.map((c) =>
    layoutText(c.text, (t) => measureCtx.measureText(t).width, opts));
  const sheet = buildContactSheet(document.getElementById('stage'), cues, layouts,
    { fontSize: 34, showSafe: true });
  return sheet.toDataURL('image/png').split(',')[1];
});

writeFileSync(resolve(root, 'artifacts/subtitle-checksheet.png'),
  Buffer.from(data, 'base64'));
await browser.close();
console.log('检查图已生成');
