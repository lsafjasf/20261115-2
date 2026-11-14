const puppeteer = require('puppeteer');
const assert = require('assert');
const EXE = process.env.HOME + '/.cache/puppeteer/chrome/157.0.8103.50/chrome-linux64/chrome';
(async () => {
  const browser = await puppeteer.launch({
    headless: true, executablePath: EXE,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto('file:///home/hj/userfeedback/uid419/index.html');
  await page.evaluate(() => { window.__PM.state.playing = true; window.__PM.state.hour = 23; });
  await new Promise(r => setTimeout(r, 2400));
  const wrapped = await page.evaluate(() => ({
    hour: window.__PM.state.hour,
    label: document.getElementById('timeLabel').innerText,
    badge: document.getElementById('sliceBadge').innerText
  }));
  console.log('播放后:', JSON.stringify(wrapped));
  assert.strictEqual(wrapped.hour, 0); // 23 -> 0 回绕
  assert.ok(wrapped.label === '00:00');

  // 垂直切片拖动（水平方向鼠标）
  const box = await page.evaluate(() => {
    const r = document.getElementById('scene').getBoundingClientRect();
    return { l: r.left, t: r.top, w: r.width, h: r.height };
  });
  const vx = box.l + box.w * 0.5, vy = box.t + box.h * 0.45;
  await page.mouse.move(vx, vy);
  const y0 = await page.evaluate(() => window.__PM.state.yIndex);
  await page.mouse.down();
  await page.mouse.move(vx + 150, vy, { steps: 8 });
  await page.mouse.up();
  const y1 = await page.evaluate(() => window.__PM.state.yIndex);
  const vLabel = await page.evaluate(() => document.getElementById('vLabel').innerText);
  console.log('垂直切片 Y:', y0, '->', y1, '|', vLabel);
  assert.notStrictEqual(y0, y1);
  console.log('\nTIME/VERTICAL TEST PASSED');
  await browser.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
