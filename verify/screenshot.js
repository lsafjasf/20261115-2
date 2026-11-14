const puppeteer = require('puppeteer');
const EXE = process.env.HOME + '/.cache/puppeteer/chrome/157.0.8103.50/chrome-linux64/chrome';
(async () => {
  const browser = await puppeteer.launch({
    headless: true, executablePath: EXE,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto('file:///home/hj/userfeedback/uid419/index.html');
  await new Promise(r => setTimeout(r, 600));
  const st = await page.evaluate(() => window.__PM.lastSelfTest.map(r => r.ok + ' ' + r.name));
  console.log(st.join('\n'));
  await page.screenshot({ path: '/home/hj/userfeedback/uid419/verify/shot-25m.png' });
  // 切到 100m 再截一张
  await page.evaluate(() => {
    const h = document.getElementById('hSlider');
    h.value = 4; h.dispatchEvent(new Event('input'));
  });
  await new Promise(r => setTimeout(r, 300));
  await page.screenshot({ path: '/home/hj/userfeedback/uid419/verify/shot-100m.png' });
  await browser.close();
  console.log('screenshots done');
})().catch(e => { console.error(e); process.exit(1); });
