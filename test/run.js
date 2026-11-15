/* Node 端验证：离线整段 vs 分段渲染逐样本一致性、事件确定性、峰值安全 */
'use strict';
const fs = require('fs');
const path = require('path');
require('./waa-stub');

for (const f of ['dsp.js', 'engine.js', 'render.js']) {
  const code = fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8');
  new Function(code).call(global); // 触发 (function(global){...})(window)
}

const { defaultKeyframes, paramSampler, generateEvents, DURATION } = window.Scape;
const { renderOffline, renderSegmented, compareBuffers, encodeWav } = window.Render;

let failures = 0;
function check(name, cond, detail) {
  console.log((cond ? '  ✓ ' : '  ✗ ') + name + (detail ? ' — ' + detail : ''));
  if (!cond) failures++;
}

(async () => {
  const SR = 8000; // 测试用低采样率加速，图构建逻辑与浏览器 48k 完全相同
  const TD = 30;   // 测试只渲染前 30s（早高峰段），事件密度最高
  window.__TEST_DURATION__ = TD;
  const kf = defaultKeyframes();
  const sample = paramSampler(kf);
  const ev1 = generateEvents(sample);
  const ev2 = generateEvents(paramSampler(defaultKeyframes()));

  console.log('事件确定性:');
  check('车辆事件两次生成一致', JSON.stringify(ev1.cars) === JSON.stringify(ev2.cars),
    ev1.cars.length + ' cars');
  check('四类事件均非空',
    ev1.cars.length && ev1.strikes.length && ev1.gusts.length && ev1.syllables.length,
    `${ev1.cars.length}/${ev1.strikes.length}/${ev1.gusts.length}/${ev1.syllables.length}`);

  console.log('参数循环（首尾同值，无缝循环）:');
  let loopOk = true;
  for (const id of Object.keys(kf)) {
    const arr = kf[id].slice().sort((x, y) => x.time - y.time);
    const a = arr[0].value, b = arr[arr.length - 1].value;
    if (Math.abs(a - b) > 1e-9) loopOk = false;
  }
  check('8 条轨道首尾关键帧值相同', loopOk);

  console.log('离线渲染（整段 vs 分段，分段点模拟暂停）:');
  const full = await renderOffline(sample, ev1, SR);
  const seg = await renderSegmented(sample, ev1, SR, [7.4, 15.0, 22.7], 0.15);
  check('缓冲长度一致', full.length === seg.length, full.length + ' samples');
  const cmp = compareBuffers(full, seg);
  check('逐样本最大差异 < 1e-6', cmp.maxDiff < 1e-6,
    'maxDiff=' + cmp.maxDiff.toExponential(3) + ' @ ' + cmp.atTime.toFixed(3) + 's');
  check('RMS 差异 < 1e-7', cmp.rms < 1e-7, 'rms=' + cmp.rms.toExponential(3));

  console.log('换一组分段点（含不同 margin）:');
  const seg2 = await renderSegmented(sample, ev1, SR, [3.3, 11.5, 19.0, 26.2], 0.25);
  const cmp2 = compareBuffers(full, seg2);
  check('任意分段点结果一致', cmp2.maxDiff < 1e-6, 'maxDiff=' + cmp2.maxDiff.toExponential(3));

  console.log('电平安全（无爆音/削顶）:');
  let peak = 0, clicks = 0;
  const d0 = full.getChannelData(0), d1 = full.getChannelData(1);
  for (let i = 0; i < full.length; i++) {
    peak = Math.max(peak, Math.abs(d0[i]), Math.abs(d1[i]));
    if (i > 0 && Math.abs(d0[i] - d0[i - 1]) > 0.9) clicks++;
  }
  check('峰值 ≤ 1.0（软限幅内）', peak <= 1.0, 'peak=' + peak.toFixed(4));
  check('无样本间跳变 > 0.9（无爆音）', clicks === 0, clicks + ' clicks');

  console.log('非静音 sanity:');
  let energy = 0;
  for (let i = 0; i < full.length; i += 97) energy += d0[i] * d0[i];
  check('整体能量 > 0', energy > 1, 'E=' + energy.toFixed(1));

  console.log('WAV 编码:');
  const blob = encodeWav(full);
  check('Blob 类型 audio/wav', blob.type === 'audio/wav');
  const expectBytes = 44 + full.length * 2 * 2;
  check('WAV 字节数 = 44 头 + 16bit 立体声数据', blob.size === expectBytes,
    blob.size + ' / ' + expectBytes);

  console.log('\n' + (failures ? failures + ' 项失败' : '全部通过 ✅'));
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
