// 无头端到端验证：旋律演奏、温度->音高、裂杯失败，并导出 WAV 与截图。
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { firstNoteFreq } from './pitch.mjs';

const ROOT = join(import.meta.dirname, '..');
const OUT = join(ROOT, 'artifacts');
await mkdir(OUT, { recursive: true });

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.wav': 'audio/wav', '.png': 'image/png',
};
const server = createServer(async (req, res) => {
  try {
    const path = req.url === '/' ? '/index.html' : req.url.split('?')[0];
    const buf = await readFile(join(ROOT, path));
    res.writeHead(200, { 'Content-Type': MIME[extname(path)] || 'application/octet-stream' });
    res.end(buf);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
});
await new Promise((r) => server.listen(8137, r));

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 980 } });
page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message));
await page.goto('http://localhost:8137/');
await page.waitForFunction('window.__glassHarp !== undefined');
await page.evaluate(() => {
  window.__toB64 = (buf) => {
    let bin = '';
    for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
    return btoa(bin);
  };
});

try {
  // 1) 温度升高 -> 共振频率下降
  const cold = await page.evaluate(() => {
    const g = window.__glassHarp.getState().glasses[2];
    return { temp: g.temperature, freq: g.freq, cents: g.cents };
  });
  const hot = await page.evaluate(() => window.__glassHarp.rubGlass(2, 6, 1));
  check('摩擦后温度显著升高', hot.temperature - cold.temp > 25,
    `${cold.temp.toFixed(1)} C -> ${hot.temperature.toFixed(1)} C`);
  check('温度升高导致音高下降', hot.freq < cold.freq,
    `${cold.freq.toFixed(2)} Hz -> ${hot.freq.toFixed(2)} Hz`);
  check('音高偏移为负且超过 -100 cent', hot.cents < -60, `${hot.cents.toFixed(1)} cent`);
  await page.screenshot({ path: join(OUT, '1-heated-glass.png') });

  // 2) 自动演奏完整 12 音旋律且无破损
  await page.evaluate(() => window.__glassHarp.reset());
  await page.evaluate(() => window.__glassHarp.autoPlay());
  await page.waitForFunction(
    'window.__glassHarp.getState().finished === true', null, { timeout: 10000 });
  const state = await page.evaluate(() => window.__glassHarp.getState());
  check('完成全部 12 个音符', state.progress === 12, `progress=${state.progress}`);
  check('无杯子破损', state.brokenCount === 0, `broken=${state.brokenCount}`);
  await page.screenshot({ path: join(OUT, '2-melody-complete.png') });

  // 3) 过强敲击 -> 裂杯 -> 失败
  await page.evaluate(() => window.__glassHarp.reset());
  await page.evaluate(() => window.__glassHarp.strikeHard(0));
  const broken = await page.evaluate(() => window.__glassHarp.getState());
  check('过强敲击导致裂杯', broken.brokenCount === 1 && broken.finished === true,
    `broken=${broken.brokenCount}`);
  await page.screenshot({ path: join(OUT, '3-cracked-glass.png') });

  // 4) 离线渲染冷态/热态旋律 WAV
  const coldB64 = await page.evaluate(async () => {
    const { wav } = await window.__glassHarp.renderMelodyWav({ heated: false });
    const buf = new Uint8Array(await wav.arrayBuffer());
    return window.__toB64(buf);
  });
  await writeFile(join(OUT, 'melody-cold.wav'), Buffer.from(coldB64, 'base64'));

  const heated = await page.evaluate(async () => {
    const { wav, glasses } = await window.__glassHarp.renderMelodyWav({ heated: true });
    const buf = new Uint8Array(await wav.arrayBuffer());
    return {
      b64: window.__toB64(buf),
      heatedTemp: glasses[2].temperature,
      heatedFreq: window.__glassHarp.physics.resonantFreq(glasses[2]),
      coldFreq: window.__glassHarp.physics.coldFreq(glasses[2]),
    };
  });
  await writeFile(join(OUT, 'melody-heated.wav'), Buffer.from(heated.b64, 'base64'));
  check('热态渲染中 E4 杯子被加热', heated.heatedTemp > 45,
    `${heated.heatedTemp.toFixed(1)} C`);
  check('热态 E4 模型频率低于冷态', heated.heatedFreq < heated.coldFreq,
    `${heated.coldFreq.toFixed(2)} -> ${heated.heatedFreq.toFixed(2)} Hz`);

  // 5) 对导出 WAV 做基频检测，直接验证音频中的音高变化
  const coldPitch = await firstNoteFreq(join(OUT, 'melody-cold.wav'));
  const hotPitch = await firstNoteFreq(join(OUT, 'melody-heated.wav'));
  const expectedE4 = 329.63 * (1 - 0.075 * 0.6);
  check('冷态 WAV 首音基频接近 E4',
    Math.abs(coldPitch - expectedE4) / expectedE4 < 0.03,
    `measured=${coldPitch.toFixed(2)} Hz expected~${expectedE4.toFixed(2)} Hz`);
  check('热态 WAV 首音基频低于冷态',
    hotPitch < coldPitch * 0.98,
    `${coldPitch.toFixed(2)} -> ${hotPitch.toFixed(2)} Hz`);
} catch (err) {
  console.error('TEST CRASH:', err);
  results.push({ name: 'test harness', ok: false, detail: err.message });
} finally {
  await browser.close();
  server.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
}
