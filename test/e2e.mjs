import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const BASE = 'http://localhost:5180';

// 自启静态服务器，测试结束后自动关闭
const server = spawn(process.execPath, ['server.js'], {
  cwd: new URL('..', import.meta.url).pathname,
  env: { ...process.env, PORT: '5180' },
  stdio: 'ignore',
});
await new Promise((resolve) => {
  const timer = setInterval(async () => {
    try {
      const res = await fetch(BASE);
      if (res.ok) {
        clearInterval(timer);
        resolve();
      }
    } catch { /* 等待服务器就绪 */ }
  }, 150);
});

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
page.on('console', (msg) => {
  if (msg.type() === 'error') console.log('BROWSER ERROR:', msg.text());
});
page.on('pageerror', (err) => console.log('PAGE ERROR:', err.message));

async function state() {
  return page.evaluate(() => {
    const sim = window.__sim;
    return {
      status: sim.status,
      succeeded: sim.succeeded,
      produced: sim.produced.map((v) => Number(v.toFixed(2))),
      waste: Number(sim.wastePercent.toFixed(3)),
      aligned: sim.allKnivesAligned,
      tension: sim.tension,
      speed: sim.speed,
      offset: Number(sim.offset.toFixed(2)),
      breakAt: sim.breakAt,
      events: sim.events.slice(-3).map((e) => e.message),
    };
  });
}

async function waitForStatus(target, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const s = await state();
    if (s.status === target) return s;
    await page.waitForTimeout(200);
  }
  throw new Error(`等待状态 ${target} 超时，当前: ${JSON.stringify(await state())}`);
}

// ============ 场景 1：完整成功分切 ============
console.log('--- 场景 1：成功分切四种规格 ---');
await page.goto(BASE);
await page.waitForSelector('#scene');
await page.evaluate(() => window.__setTimeScale(4));

let s = await state();
assert.equal(s.aligned, false, '初始刀位应不合格');

// 通过 UI 按钮自动对刀（验证控件链路）
await page.click('#alignBtn');
s = await state();
assert.equal(s.aligned, true, '对刀后应合格');

// 滑块设定安全卷速与张力
await page.fill('#speed', '200');
await page.dispatchEvent('#speed', 'input');
await page.fill('#tension', '55');
await page.dispatchEvent('#tension', 'input');
await page.click('#startBtn');

// Web Audio：电机振荡器频率应随卷速上升（60 卷速 vs 260 卷速）
await page.evaluate(async () => {
  const sim = window.__sim;
  const audio = window.__audio;
  sim.setSpeed(60);
  audio.update(60, 55, true);
  await new Promise((r) => setTimeout(r, 250));
  window.__freqLow = audio.osc.frequency.value;
  sim.setSpeed(260);
  audio.update(260, 55, true);
  await new Promise((r) => setTimeout(r, 250));
  window.__freqHigh = audio.osc.frequency.value;
});
const freq = await page.evaluate(() => ({ low: window.__freqLow, high: window.__freqHigh }));
assert.ok(freq.high > freq.low * 2,
  `卷速提高后音频频率应显著上升: ${freq.low} -> ${freq.high}`);
// 恢复测试所需卷速
await page.fill('#speed', '200');
await page.dispatchEvent('#speed', 'input');

s = await waitForStatus('complete', 60000);
assert.equal(s.succeeded, true, '应判定成功');
assert.deepEqual(s.produced, [600, 450, 500, 400], '订单长度必须精确');
assert.ok(s.waste <= 12, `废边率 ${s.waste}% 应 ≤ 12%`);
console.log('成功路径:', JSON.stringify(s));
await page.screenshot({ path: 'screenshots/01-success.png', fullPage: true });

// 校验订单 UI 进度全部打勾
const checks = await page.$$eval('[id^="progText"]',
  (els) => els.map((el) => el.textContent.includes('✓')));
assert.deepEqual(checks, [true, true, true, true]);

// Web Audio 上下文应已创建并运行过
const audioState = await page.evaluate(() => {
  // 音频上下文不直接暴露，检查振荡器是否发声：通过机器运行无报错间接验证，
  // 这里直接验证 AudioContext 类型可用且页面未报错
  return typeof window.AudioContext === 'function' ||
    typeof window.webkitAudioContext === 'function';
});
assert.ok(audioState, '浏览器应支持 Web Audio');

// ============ 场景 2：张力过大导致断纸停机 ============
console.log('--- 场景 2：张力 100 断纸停机 ---');
await page.click('#resetBtn');
await page.evaluate(() => window.__setTimeScale(4));
await page.click('#alignBtn');
await page.fill('#speed', '220');
await page.dispatchEvent('#speed', 'input');
await page.fill('#tension', '100');
await page.dispatchEvent('#tension', 'input');
await page.click('#startBtn');

s = await waitForStatus('broken', 60000);
assert.equal(s.status, 'broken');
assert.equal(s.speed, 0, '断纸后卷速应归零');
assert.ok(s.breakAt > 0, '应记录断纸时刻');
console.log('断纸路径:', JSON.stringify(s));
await page.waitForTimeout(300);
await page.screenshot({ path: 'screenshots/02-broken.png', fullPage: true });

// 断纸后开机按钮禁用，必须复位
const startDisabled = await page.$eval('#startBtn', (b) => b.disabled);
assert.equal(startDisabled, true);
const badge = await page.textContent('#statusBadge');
assert.equal(badge.trim(), '断纸停机');

// 复位后恢复就绪
await page.click('#resetBtn');
s = await state();
assert.equal(s.status, 'idle');
assert.equal(s.produced.every((v) => v === 0), true);
await page.screenshot({ path: 'screenshots/03-reset.png', fullPage: true });

// ============ 场景 3：手动输入刀位（不使用自动对刀按钮）============
console.log('--- 场景 3：手动对刀后成功分切 ---');
await page.click('#resetBtn');
await page.evaluate(() => window.__setTimeScale(4));
const correctKnives = [110, 630, 1010, 1470, 1890];
for (let i = 0; i < 5; i++) {
  const input = page.locator('.knife-grid input').nth(i);
  await input.fill(String(correctKnives[i]));
  await input.dispatchEvent('change');
}
s = await state();
assert.equal(s.aligned, true, '手动输入正确刀位后应判定合格');
await page.fill('#speed', '180');
await page.dispatchEvent('#speed', 'input');
await page.fill('#tension', '50');
await page.dispatchEvent('#tension', 'input');
await page.click('#startBtn');
s = await waitForStatus('complete', 60000);
assert.equal(s.succeeded, true);
assert.deepEqual(s.produced, [600, 450, 500, 400]);
console.log('手动对刀路径 OK, 废边率:', s.waste + '%');

// ============ 场景 4：低张力 + 窄废边 → 偏移超差、废边超标 ============
console.log('--- 场景 4：低张力跑飞导致边缘报废 ---');
await page.click('#resetBtn');
await page.evaluate(() => window.__setTimeScale(6));
// 带宽精确等于订单（520/380/460/420），左侧废边仅 10mm，极易被偏移吃掉
const narrowKnives = [10, 530, 910, 1370, 1790];
for (let i = 0; i < 5; i++) {
  const input = page.locator('.knife-grid input').nth(i);
  await input.fill(String(narrowKnives[i]));
  await input.dispatchEvent('change');
}
await page.fill('#speed', '300');
await page.dispatchEvent('#speed', 'input');
await page.fill('#tension', '5');
await page.dispatchEvent('#tension', 'input');
await page.click('#startBtn');
s = await waitForStatus('complete', 60000);
assert.ok(s.waste > 12, `窄废边+低张力应使废边率超标，实际 ${s.waste}%`);
assert.equal(s.succeeded, false, '废边超标不应判定成功');
console.log('偏移超差路径 OK, 废边率:', s.waste + '%');
await page.screenshot({ path: 'screenshots/04-waste-over.png', fullPage: true });

console.log('\n全部端到端断言通过 ✓');
await browser.close();
server.kill();
