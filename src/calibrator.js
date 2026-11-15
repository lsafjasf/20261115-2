'use strict';

const { Metronome, TARGET_BPM, G, L_MIN, L_MAX } = require('./metronome.js');

// 由目标 BPM 反推理论摆长（小角近似）
function targetLength(bpm = TARGET_BPM) {
  const w = (2 * Math.PI * bpm) / 60;
  return Math.min(L_MAX, Math.max(L_MIN, G / (w * w)));
}

// 自动校准：模拟玩家观察 BPM 曲线与听感，迭代调节三个滑块
// 返回 { adjustments, metrics, succeeded, status }
function autoCalibrate(opts = {}) {
  const seed = opts.seed ?? 11;
  const observeSeconds = opts.observeSeconds ?? 3;
  const maxIterations = opts.maxIterations ?? 24;

  // 典型“旧节拍器”初始状态：摆长偏短、发条偏松、阻尼偏小
  const m = new Metronome({
    seed,
    length: opts.initLength ?? 0.09,
    tension: opts.initTension ?? 0.25,
    damping: opts.initDamping ?? 0.05,
  });

  const log = [];
  const lStar = targetLength();

  for (let iter = 0; iter < maxIterations; iter++) {
    m.reset();
    m.run(observeSeconds);
    const before = m.getStatus();
    const samples = m.bpmWindow.filter((s) => s.time >= m.t - 1.5);
    const windowMean =
      samples.length > 0 ? samples.reduce((a, x) => a + x.bpm, 0) / samples.length : before.bpm;
    const windowSd =
      samples.length > 1
        ? Math.sqrt(samples.reduce((a, x) => a + (x.bpm - windowMean) ** 2, 0) / samples.length)
        : 0;
    const adjustment = { iter, time: m.t, from: { ...m.params }, changes: {}, rationale: [] };

    // 1) 先消除漏拍：张力不足或阻尼过大都会饿死摆幅
    if (before.missCount > 0 || before.amp < 0.1) {
      if (before.params.damping > 0.55) {
        const nd = Math.max(0.2, before.params.damping - 0.2);
        m.setParams({ damping: nd });
        adjustment.changes.damping = nd;
        adjustment.rationale.push('阻尼过大导致漏拍，降低阻尼');
      } else if (before.params.tension < 0.9) {
        const nt = Math.min(0.9, before.params.tension + 0.15);
        m.setParams({ tension: nt });
        adjustment.changes.tension = nt;
        adjustment.rationale.push('摆幅不足/漏拍，收紧发条');
      }
    }

    // 2) 消除过紧尖响与撞限位
    if (before.squealCount > 0 || before.knockCount > 0 || before.amp > 0.34) {
      if (before.params.tension > 0.5) {
        const nt = Math.max(0.45, before.params.tension - 0.12);
        m.setParams({ tension: nt });
        adjustment.changes.tension = nt;
        adjustment.rationale.push('金属尖响/撞限位，放松发条');
      }
      if (before.params.damping < 0.5) {
        const nd = Math.min(0.6, before.params.damping + 0.15);
        m.setParams({ damping: nd });
        adjustment.changes.damping = nd;
        adjustment.rationale.push('增加阻尼抑制大摆幅尖响');
      }
    }

    // 3) 摆幅健康后，按 BPM 偏差调摆长（摆长越长 BPM 越低）
    if (
      before.missCount === 0 &&
      before.squealCount === 0 &&
      before.knockCount === 0 &&
      windowMean != null
    ) {
      const err = windowMean - TARGET_BPM;
      if (Math.abs(err) > 1.2) {
        // 二分逼近理论长度，再叠加经验修正
        const cur = before.params.length;
        let nl = cur + (lStar - cur) * 0.6;
        nl = Math.min(L_MAX, Math.max(L_MIN, nl));
        m.setParams({ length: nl });
        adjustment.changes.length = nl;
        adjustment.rationale.push(`BPM ${err > 0 ? '偏快' : '偏慢'} ${Math.abs(err).toFixed(1)}，${err > 0 ? '加长' : '缩短'}摆锤`);
      } else if (windowSd > 0.6 && before.params.damping < 0.5) {
        // BPM 均值已准但抖动大，适度加阻尼稳定
        const nd = Math.min(0.5, before.params.damping + 0.1);
        m.setParams({ damping: nd });
        adjustment.changes.damping = nd;
        adjustment.rationale.push(`走时抖动 sd=${windowSd.toFixed(2)}，增加阻尼稳定`);
      }
    }

    if (Object.keys(adjustment.changes).length === 0) {
      adjustment.rationale.push('各项指标已在容差内，进入 20s 稳定性验证');
    }
    log.push(adjustment);

    if (Object.keys(adjustment.changes).length === 0) break;
  }

  // 最终 20 秒以上连续稳定性验证
  m.reset();
  m.run(43);
  const finalStatus = m.getStatus();
  const recent = m.bpmWindow.filter((s) => s.time >= m.t - 20);
  const mean = recent.reduce((a, x) => a + x.bpm, 0) / recent.length;
  const sd = Math.sqrt(recent.reduce((a, x) => a + (x.bpm - mean) ** 2, 0) / recent.length);
  const spread = Math.max(...recent.map((x) => Math.abs(x.bpm - mean)));

  const metrics = {
    meanBpm: mean,
    bpmSd: sd,
    maxAbsDev: spread,
    ticks: finalStatus.tickCount,
    misses: finalStatus.missCount,
    squeals: finalStatus.squealCount,
    knocks: finalStatus.knockCount,
    stableFor: finalStatus.stableFor,
    succeeded: finalStatus.succeeded,
    finalParams: { ...m.params },
  };

  return { adjustments: log, metrics, status: finalStatus, metronome: m };
}

module.exports = { autoCalibrate, targetLength };
