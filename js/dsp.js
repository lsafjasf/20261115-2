/* dsp.js — 确定性合成素材与数学工具（不加载任何音频文件） */
(function (global) {
  'use strict';

  const DURATION = 180; // 三分钟

  // mulberry32：种子化 PRNG，保证实时与离线生成完全相同的事件
  function makeRng(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // 线性插值 + 端点钳制；关键帧按 time 升序
  function valueAt(keyframes, t) {
    if (keyframes.length === 0) return 0;
    if (t <= keyframes[0].time) return keyframes[0].value;
    const last = keyframes[keyframes.length - 1];
    if (t >= last.time) return last.value;
    for (let i = 0; i < keyframes.length - 1; i++) {
      const a = keyframes[i], b = keyframes[i + 1];
      if (t >= a.time && t <= b.time) {
        if (b.time === a.time) return b.value;
        const k = (t - a.time) / (b.time - a.time);
        return a.value + (b.value - a.value) * k;
      }
    }
    return last.value;
  }

  // 生成立体声白噪声 AudioBuffer（可无缝循环）
  function makeNoiseBuffer(ctx, seconds, seed) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    const rng = makeRng(seed);
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) data[i] = rng() * 2 - 1;
    }
    return buf;
  }

  // 简单一阶低通，用于把白噪声整成棕噪声
  function brownFromWhite(ctx, whiteBuf, alpha) {
    const out = ctx.createBuffer(2, whiteBuf.length, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const src = whiteBuf.getChannelData(ch);
      const dst = out.getChannelData(ch);
      let last = 0;
      for (let i = 0; i < src.length; i++) {
        last = alpha * last + (1 - alpha) * src[i];
        dst[i] = last * 3.2;
      }
    }
    return out;
  }

  // 生成一段短瞬态缓冲：指数衰减正弦 + 点击噪声（施工敲击/人群音节）
  function makeTransient(ctx, opt) {
    const sr = ctx.sampleRate;
    const len = Math.max(1, Math.floor(sr * opt.dur));
    const buf = ctx.createBuffer(1, len, sr);
    const d = buf.getChannelData(0);
    const rng = makeRng(opt.seed);
    const decay = Math.exp(-1 / (sr * opt.decayTau));
    let env = 1, phase = 0;
    for (let i = 0; i < len; i++) {
      const noise = (rng() * 2 - 1) * (opt.noiseMix || 0);
      const tone = Math.sin(phase) * (opt.toneMix == null ? 1 : opt.toneMix);
      d[i] = (tone + noise) * env;
      phase += 2 * Math.PI * opt.freq / sr;
      env *= decay;
    }
    return buf;
  }

  // 引擎嗡鸣：两个失谐正弦叠加（机动车持续声源）
  function makeEngineHum(ctx, seconds, f0, f1) {
    const sr = ctx.sampleRate;
    const len = Math.floor(sr * seconds);
    const buf = ctx.createBuffer(1, len, sr);
    const d = buf.getChannelData(0);
    let p0 = 0, p1 = 0;
    for (let i = 0; i < len; i++) {
      d[i] = 0.6 * Math.sin(p0) + 0.4 * Math.sin(p1);
      p0 += 2 * Math.PI * f0 / sr;
      p1 += 2 * Math.PI * f1 / sr;
    }
    return buf;
  }

  // 非齐次泊松稀疏（thinning）：按密度函数 d(t)∈[0,1] 生成事件
  function poissonEvents(rng, duration, maxRate, densityFn, build) {
    const events = [];
    let t = -Math.log(1 - rng()) / maxRate;
    while (t < duration) {
      if (rng() < densityFn(t)) events.push(build(t, rng));
      t += -Math.log(1 - rng()) / maxRate;
    }
    return events;
  }

  global.DSP = {
    DURATION, makeRng, valueAt, makeNoiseBuffer, brownFromWhite,
    makeTransient, makeEngineHum, poissonEvents
  };
})(window);
