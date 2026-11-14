const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: process.env.HOME + '/.cache/puppeteer/chrome/157.0.8103.50/chrome-linux64/chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });
  const page = await browser.newPage();
  page.on('console', m => console.log('CONSOLE', m.type(), m.text()));
  page.on('pageerror', e => console.log('PAGEERROR', e.message));
  await page.goto('file:///home/hj/userfeedback/uid419/index.html');
  await new Promise(r => setTimeout(r, 1200));
  const info = await page.evaluate(() => ({
    pm: typeof window.__PM,
    model: typeof window.PMModel,
    canvas: !!document.getElementById('scene'),
    rect: (() => { const c = document.getElementById('scene'); const r = c.getBoundingClientRect(); return [r.width, r.height]; })()
  }));
  console.log(JSON.stringify(info));
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
