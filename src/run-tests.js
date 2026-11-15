'use strict';

const fs = require('fs');
const path = require('path');
const { Metronome, TARGET_BPM, G } = require('./metronome.js');
const { autoCalibrate, targetLength } = require('./calibrator.js');
const { renderOffline, encodeWav, SR } = require('./audio.js');
const { dominantFrequency } = require('./fft.js');

let passed = 0;
let failed = 0;
function assert(cond, msg) {
  if (cond) {
    passed += 1;
    console.log('  PASS', msg);
  } else {
    failed += 1;
    console.error('  FAIL', msg);
  }
}

const artifacts = path.join(__dirname, '..', 'artifacts');

console.log('\n=== 测试 1：完整自动校准（连续稳定 20s 成功）===');
const cal = autoCalibrate({ seed: 11 });
console.log('调整步数:', cal.adjustments.length);
for (const a of cal.adjustments) {
  const c = Object.entries(a.changes).map(([k, v]) => `${k}=${v.toFixed(3)}`).join(', ') || '验证';
  console.log(`  #${a.iter} ${c} — ${a.rationale.join('；')}`);
}
console.log('最终参数:', cal.metrics.finalParams);
assert(cal.metrics.succeeded === true, '引擎判定 20s 连续稳定成功');
assert(Math.abs(cal.metrics.meanBpm - TARGET_BPM) <= 1, `平均 BPM=${cal.metrics.meanBpm.toFixed(2)} 在 90±1 内`);
assert(cal.metrics.bpmSd <= 1.0, `BPM 标准差=${cal.metrics.bpmSd.toFixed(2)} ≤ 1.0`);
assert(cal.metrics.maxAbsDev <= 1.5, `最大偏差=${cal.metrics.maxAbsDev.toFixed(2)} ≤ 1.5`);
assert(cal.metrics.misses === 0, '校准后无漏拍');
assert(cal.metrics.squeals === 0, '校准后无金属尖响');
assert(cal.metrics.knocks === 0, '校准后无撞限位');
assert(cal.metrics.stableFor >= 20, `稳定时长=${cal.metrics.stableFor.toFixed(1)}s ≥ 20s`);

// 校准成功状态的音频（正常机械 click，无尖响）
{
  const m = new Metronome({ seed: 23, ...cal.metrics.finalParams });
  m.run(6);
  const pcm = renderOffline(m.flushEvents(), 6, SR);
  fs.writeFileSync(path.join(artifacts, 'calibrated-ticks.wav'), encodeWav(pcm, SR));
  const rms = Math.sqrt(pcm.reduce((a, x) => a + x * x, 0) / pcm.length);
  assert(rms > 0.01, `正常节拍 WAV 有可闻能量 RMS=${rms.toFixed(4)}`);
  console.log('  写出 artifacts/calibrated-ticks.wav');
}

console.log('\n=== 测试 2：过紧（张力拉满 + 阻尼为零）异常金属尖响 ===');
{
  const Lstar = targetLength();
  const m = new Metronome({ seed: 23, length: Lstar, tension: 1.0, damping: 0.0 });
  m.run(8);
  const status = m.getStatus();
  const events = m.flushEvents();
  const squeals = events.filter((e) => e.type === 'squeal');
  console.log(`摆幅=${status.amp.toFixed(3)} tick=${status.tickCount} 尖响事件=${squeals.length} 撞限位=${status.knockCount}`);
  assert(squeals.length >= 2, `过紧产生 ${squeals.length} 次金属尖响事件`);
  assert(status.amp >= 0.38, `过紧摆幅 ${status.amp.toFixed(3)} 超过尖响门限 0.38`);

  const pcm = renderOffline(events, 8, SR);
  fs.writeFileSync(path.join(artifacts, 'overtight-squeal.wav'), encodeWav(pcm, SR));
  console.log('  写出 artifacts/overtight-squeal.wav');

  const { top, frameEnergy } = dominantFrequency(pcm, SR);
  console.log('  尖响帧能量=', frameEnergy.toFixed(2));
  console.log('  主频峰值:', top.slice(0, 4).map((x) => `${x.freq.toFixed(0)}Hz`).join(', '));
  const highFreqEnergy = top.filter((x) => x.freq >= 3000 && x.freq <= 10000);
  assert(highFreqEnergy.length >= 2, '频谱在 3–10kHz 金属尖响频段存在多个强分音');
  assert(top[0].freq >= 2500, `主峰频率 ${top[0].freq.toFixed(0)}Hz 位于高频区`);

  // 对照：正常 tick 的频谱能量应集中在低频
  const m2 = new Metronome({ seed: 23, ...cal.metrics.finalParams });
  m2.run(8);
  const pcm2 = renderOffline(m2.flushEvents(), 8, SR);
  const ref = dominantFrequency(pcm2, SR);
  console.log('  正常 tick 主峰:', ref.top.slice(0, 3).map((x) => `${x.freq.toFixed(0)}Hz`).join(', '));
  assert(ref.top[0].freq < 2000, `正常 tick 主峰 ${ref.top[0].freq.toFixed(0)}Hz 低于 2kHz`);
  assert(top[0].freq > ref.top[0].freq, '尖响主峰显著高于正常 tick 主峰');
}

console.log('\n=== 测试 3：过松/高阻尼漏拍 ===');
{
  const m = new Metronome({ seed: 23, length: targetLength(), tension: 0.0, damping: 1.0 });
  m.theta = 0.12; // 旧发条 + 高阻尼：摆能被阻尼耗尽
  m.run(12);
  const s = m.getStatus();
  console.log(`漏拍=${s.missCount} 有效 tick=${s.tickCount} 摆幅=${s.amp.toFixed(3)}`);
  assert(s.missCount >= 2, `过松设置出现 ${s.missCount} 次漏拍`);
  assert(s.squealCount === 0, '过松不会产生尖响');
}

console.log(`\n结果: ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
