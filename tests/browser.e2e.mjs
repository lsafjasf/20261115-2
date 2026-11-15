import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';

const candidates = [
  process.env.CHROME_EXECUTABLE,
  '/home/hj/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome',
  '/home/hj/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome',
  '/home/hj/.cache/pw/chrome-headless-shell-linux64/chrome-headless-shell',
].filter(Boolean);
const executablePath = candidates.find((path) => existsSync(path));
const url = process.env.APP_URL || 'http://localhost:5173/';

const browser = await chromium.launch({
  headless: true,
  executablePath,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 940 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  await page.goto(url, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  assert.ok(await page.locator('#scene'));
  assert.equal(await page.locator('.crop-row').count(), 3);
  assert.equal(await page.locator('.event-item').count(), 2);

  await page.locator('#ventilation').fill('82');
  await page.locator('#shade').fill('72');
  await page.locator('#releaseGrid [data-zone="center"]').click();
  await page.locator('#speedBtn').click();
  await page.locator('#speedBtn').click();
  await page.locator('#startBtn').click();
  await page.waitForFunction(
    () => !document.querySelector('#resultCard').classList.contains('hidden'),
    { timeout: 50000 },
  );

  const successState = await page.evaluate(() => ({
    status: window.__greenhouse.game.status,
    fruit: window.__greenhouse.game.fruitCount,
    colonyMin: window.__greenhouse.game.colonyMinSeen,
    crops: window.__greenhouse.game.crops.map((crop) => crop.ripe),
    audioState: window.__greenhouse.audio.ctx?.state,
    fanGain: window.__greenhouse.audio.fanGain?.gain.value,
    buzzGain: window.__greenhouse.audio.buzzGain?.gain.value,
  }));
  assert.equal(successState.status, 'success');
  assert.equal(successState.fruit, 3);
  assert.ok(successState.crops.every(Boolean));
  assert.ok(successState.colonyMin >= 40);
  assert.equal(successState.audioState, 'running');
  assert.ok(successState.fanGain > 0 && successState.buzzGain > 0);
  assert.match(await page.locator('#resultTitle').textContent(), /全部坐果/);
  assert.match(await page.locator('#resultBody').textContent(), /完整授粉周期/);
  await page.screenshot({ path: 'artifacts/pollination-success.png', fullPage: true });

  await page.locator('#closeResultBtn').click();
  await page.locator('#heatScenarioBtn').click();
  await page.waitForFunction(
    () => window.__greenhouse.game.colonyMinSeen < 40,
    { timeout: 30000 },
  );
  await page.screenshot({ path: 'artifacts/ventilation-collapse-mid.png', fullPage: true });
  await page.waitForFunction(
    () => !document.querySelector('#resultCard').classList.contains('hidden'),
    { timeout: 40000 },
  );

  const failureState = await page.evaluate(() => ({
    status: window.__greenhouse.game.status,
    colony: window.__greenhouse.game.colony,
    colonyMin: window.__greenhouse.game.colonyMinSeen,
    fruit: window.__greenhouse.game.fruitCount,
    hotEvent: window.__greenhouse.game.events.some((event) => /热应激/.test(event.text)),
  }));
  assert.equal(failureState.status, 'failed');
  assert.ok(failureState.colony < 56);
  assert.ok(failureState.colonyMin < 40);
  assert.ok(failureState.fruit < 3);
  assert.equal(failureState.hotEvent, true);
  assert.match(await page.locator('#resultTitle').textContent(), /未达标/);
  assert.match(await page.locator('#resultBody').textContent(), /跌破下限/);
  assert.equal(await page.locator('#colonyTag').textContent(), '跌破下限');
  await page.screenshot({ path: 'artifacts/ventilation-failure.png', fullPage: true });

  assert.equal(errors.length, 0, `浏览器错误：${errors.join(' | ')}`);
  console.log('E2E 通过：完成一次三作物授粉周期；低通风场景出现热应激、农残滞留及蜂群跌破下限。');
} finally {
  await browser.close();
}
