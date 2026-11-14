const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: process.env.HOME + '/.cache/puppeteer/chrome/157.0.8103.50/chrome-linux64/chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });
  const page = await browser.newPage();
  await page.goto('file:///home/hj/userfeedback/uid419/index.html');
  await new Promise(r => setTimeout(r, 1500));
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  const info = await page.evaluate(() => ({
    hasPM: !!window.__PM,
    state: window.__PM && window.__PM.state,
    selftest: window.__PM && window.__PM.lastSelfTest &&
      window.__PM.lastSelfTest.map(r => ({name: r.name, ok: r.ok}))
  }));
  console.log(JSON.stringify(info, null, 1));
  console.log('PAGE_ERRORS:', errs);
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
