'use strict';

// 浏览器版自动校准：复用与 Node 端相同的迭代策略，逐步驱动滑块
(function () {
  const { Metronome, TARGET_BPM, G, L_MIN, L_MAX } = globalThis.MET;

  function targetLength(bpm = TARGET_BPM) {
    const w = (2 * Math.PI * bpm) / 60;
    return Math.min(L_MAX, Math.max(L_MIN, G / (w * w)));
  }

  // 给定当前引擎，观察 observeSeconds 后返回一次滑块调整（或 null 表示收敛）
  function nextAdjustment(m, observeSeconds) {
    m.reset();
    m.run(observeSeconds);
    const s = m.getStatus();
    const samples = m.bpmWindow.filter((x) => x.time >= m.t - 1.5);
    const mean =
      samples.length > 0 ? samples.reduce((a, x) => a + x.bpm, 0) / samples.length : s.bpm;
    const sd =
      samples.length > 1
        ? Math.sqrt(samples.reduce((a, x) => a + (x.bpm - mean) ** 2, 0) / samples.length)
        : 0;
    const changes = {};
    const rationale = [];

    if (s.missCount > 0 || s.amp < 0.1) {
      if (s.params.damping > 0.55) {
        changes.damping = Math.max(0.2, s.params.damping - 0.2);
        rationale.push('阻尼过大导致漏拍，降低阻尼');
      } else if (s.params.tension < 0.9) {
        changes.tension = Math.min(0.9, s.params.tension + 0.15);
        rationale.push('摆幅不足/漏拍，收紧发条');
      }
    }
    if (s.squealCount > 0 || s.knockCount > 0 || s.amp > 0.34) {
      if (s.params.tension > 0.5) {
        changes.tension = Math.max(0.45, s.params.tension - 0.12);
        rationale.push('金属尖响/撞限位，放松发条');
      }
      if (s.params.damping < 0.5) {
        changes.damping = Math.min(0.6, s.params.damping + 0.15);
        rationale.push('增加阻尼抑制大摆幅尖响');
      }
    }
    if (
      s.missCount === 0 &&
      s.squealCount === 0 &&
      s.knockCount === 0 &&
      mean != null
    ) {
      const err = mean - TARGET_BPM;
      if (Math.abs(err) > 1.2) {
        const lStar = targetLength();
        changes.length = Math.min(
          L_MAX,
          Math.max(L_MIN, s.params.length + (lStar - s.params.length) * 0.6),
        );
        rationale.push(`BPM ${err > 0 ? '偏快' : '偏慢'} ${Math.abs(err).toFixed(1)}，调节摆长`);
      } else if (sd > 0.6 && s.params.damping < 0.5) {
        changes.damping = Math.min(0.5, s.params.damping + 0.1);
        rationale.push(`走时抖动 sd=${sd.toFixed(2)}，增加阻尼`);
      }
    }
    return Object.keys(changes).length ? { changes, rationale } : null;
  }

  globalThis.Calibrator = { nextAdjustment, targetLength };
})();
