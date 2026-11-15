import puppeteer from 'puppeteer';
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
await page.setViewport({ width: 1500, height: 1000 });
await page.goto('http://127.0.0.1:8765/index.html', { waitUntil: 'networkidle0' });

await page.evaluate(() => {
  const mw = document.getElementById('maxWidth');
  mw.value = '380';
  mw.dispatchEvent(new Event('input', { bubbles: true }));
  document.querySelectorAll('.cue-item')[6].click();
});
await new Promise((r) => setTimeout(r, 200));
await page.screenshot({ path: resolve(root, 'artifacts/preview-danger.png') });
await browser.close();
console.log('标红截图已生成');
