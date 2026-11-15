/* engine.js — 同一套图构建逻辑同时驱动实时与离线渲染 */
(function (global) {
  'use strict';
  const { DURATION, makeRng, valueAt, makeNoiseBuffer, brownFromWhite,
    makeTransient, makeEngineHum, poissonEvents } = global.DSP;

  // 8 条参数轨道：四组声源，每组两个独立参数
  const PARAMS = [
    { id: 'trafficLevel',   group: '机动车', name: '车流音量', color: '#4a90e2' },
    { id: 'trafficDensity', group: '机动车', name: '经过密度', color: '#7fb0f0' },
    { id: 'constructionLevel', group: '施工', name: '施工音量', color: '#f5a623' },
    { id: 'constructionRate',  group: '施工', name: '敲击频率', color: '#f7c46c' },
    { id: 'windLevel', group: '风', name: '风音量', color: '#7ed6c2' },
    { id: 'windGust',  group: '风', name: '阵风强度', color: '#a8e6d8' },
    { id: 'crowdLevel',   group: '人群', name: '人群音量', color: '#d96cd1' },
    { id: 'crowdDensity', group: '人群', name: '人声密度', color: '#e89ee2' }
  ];

  // 早高峰(0s) → 日间施工(45s) → 午后街区(90s) → 晚风(135s) → 夜间(180s)
  // 深夜(165s)后回到清晨起点(180s)，首尾同值保证无缝循环
  function defaultKeyframes() {
    const T = [0, 45, 90, 135, 165, 180];
    const curves = {
      trafficLevel:      [0.85, 0.55, 0.60, 0.30, 0.12, 0.85],
      trafficDensity:    [0.95, 0.50, 0.55, 0.25, 0.08, 0.95],
      constructionLevel: [0.00, 0.85, 0.70, 0.25, 0.00, 0.00],
      constructionRate:  [0.00, 0.90, 0.65, 0.20, 0.00, 0.00],
      windLevel:         [0.20, 0.25, 0.35, 0.65, 0.45, 0.20],
      windGust:          [0.10, 0.15, 0.30, 0.85, 0.40, 0.10],
      crowdLevel:        [0.60, 0.45, 0.80, 0.55, 0.15, 0.60],
      crowdDensity:      [0.70, 0.40, 0.90, 0.45, 0.10, 0.70]
    };
    const out = {};
    for (const p of PARAMS) {
      out[p.id] = T.map((t, i) => ({ time: t, value: curves[p.id][i] }));
    }
    return out;
  }

  function paramSampler(keyframes) {
    return function (t) {
      const o = {};
      for (const p of PARAMS) o[p.id] = valueAt(keyframes[p.id], t);
      return o;
    };
  }

  // 所有事件由固定种子生成，实时/离线逐次一致
  function generateEvents(sample) {
    const rng = makeRng(20261115);
    const cars = poissonEvents(rng, DURATION, 1.6,
      t => sample(t).trafficDensity,
      (t, r) => ({
        t, dur: 2.2 + r() * 2.4, pan: r() * 1.6 - 0.8,
        speed: 0.5 + r() * 0.8, pitch: 70 + r() * 60
      }));
    const strikes = poissonEvents(rng, DURATION, 2.2,
      t => sample(t).constructionRate * 0.85,
      (t, r) => ({
        t, pan: r() * 1.2 - 0.6, freq: 90 + r() * 260,
        dur: 0.18 + r() * 0.22, seed: Math.floor(r() * 1e9)
      }));
    const gusts = poissonEvents(rng, DURATION, 0.22,
      t => 0.25 + sample(t).windGust * 0.75,
      (t, r) => ({ t, dur: 4 + r() * 5, amp: 0.5 + r() * 0.5 }));
    const syllables = poissonEvents(rng, DURATION, 3.2,
      t => sample(t).crowdDensity,
      (t, r) => ({
        t, pan: r() * 1.4 - 0.7, freq: 140 + r() * 220,
        dur: 0.12 + r() * 0.22, seed: Math.floor(r() * 1e9)
      }));
    return { cars, strikes, gusts, syllables };
  }

  global.Scape = {
    DURATION, PARAMS, defaultKeyframes, paramSampler, generateEvents
  };
})(window);
