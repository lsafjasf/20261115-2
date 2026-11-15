import puppeteer from 'puppeteer';
import assert from 'node:assert/strict';

const EXEC = process.env.CHROME_HEADLESS_SHELL ||
  '/home/hj/.cache/pw/chrome-headless-shell-linux64/chrome-headless-shell';
const URL = process.env.APP_URL || 'http://localhost:5173/';

const browser = await puppeteer.launch({
  executablePath: EXEC,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=swiftshader'],
});

try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (err) => errors.push(String(err)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  await page.goto(URL, { waitUntil: 'networkidle0' });

  // 页面初始渲染：三列车卡片、画布、潮汐图
  assert.equal((await page.$$('.train-card')).length, 3);
  assert.ok(await page.$('#scene'));
  assert.ok(await page.$('#tideChart'));

  // 默认成功局：开始并 4x 加速到结束
  await page.click('#speedBtn'); // 2x -> 4x
  await page.click('#speedBtn'); // 4x -> 8x
  await page.click('#startBtn');
  await page.waitForFunction(
    () => !document.getElementById('result').classList.contains('hidden'),
    { timeout: 120000 },
  );
  const resultClass = await page.$eval('#result', (el) => el.className);
  const resultTitle = await page.$eval('#result h2', (el) => el.textContent);
  assert.match(resultClass, /success/, `默认局应成功，实际 ${resultClass} / ${resultTitle}`);
  const arrived = await page.$eval('#arrived', (el) => el.textContent);
  assert.equal(arrived, '3 / 3');

  // 失败局：一键载入漏看水位教学局
  await page.click('#demoFailBtn');
  await page.click('#speedBtn');
  await page.click('#speedBtn'); // 失败局也用 8x
  await page.click('#startBtn');
  await page.waitForFunction(
    () => !document.getElementById('result').classList.contains('hidden'),
    { timeout: 120000 },
  );
  const failClass = await page.$eval('#result', (el) => el.className);
  const failText = await page.$eval('#result p', (el) => el.textContent);
  assert.match(failClass, /failed/);
  assert.match(failText, /涉水/);
  const logText = await page.$eval('#eventLog', (el) => el.textContent);
  assert.match(logText, /自动封锁/);
  assert.match(logText, /事故/);

  assert.equal(errors.length, 0, `浏览器控制台错误: ${errors.join(' | ')}`);
  console.log('E2E 通过：默认局成功，漏看水位局复现封锁涉水失败，无控制台错误');
} finally {
  await browser.close();
}
