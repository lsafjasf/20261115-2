/* render.js — 图构建（实时/离线共用）、离线分段渲染、WAV 编码 */
(function (global) {
  'use strict';
  const { DURATION, makeNoiseBuffer, brownFromWhite, makeTransient, makeEngineHum } = global.DSP;
  const { PARAMS } = global.Scape;

  const FADE = 0.025; // 25ms 等功率斜坡，避免爆音

  // 预烘焙滤波床：滤波器只在此处从 t=0 连续运行一次，
  // 产出的 AudioBuffer 无状态 → 任意分段渲染与整段逐样本一致。
  async function makeAssets(ctx) {
    const dur = global.__TEST_DURATION__ || DURATION;
    const sr = ctx.sampleRate;
    // 烘焙在独立 OfflineContext 内自建噪声源，避免跨上下文缓冲兼容问题
    const bake = async (noiseSeed, brownAlpha, filterType, freq, Q) => {
      const len = Math.ceil(dur * sr);
      const oc = new OfflineAudioContext(2, len, sr);
      const noise = makeNoiseBuffer(oc, 6, noiseSeed);
      const source = brownAlpha ? brownFromWhite(oc, noise, brownAlpha) : noise;
      const src = oc.createBufferSource();
      src.buffer = source; src.loop = true;
      const f = oc.createBiquadFilter();
      f.type = filterType; f.frequency.value = freq; f.Q.value = Q || 0.8;
      src.connect(f); f.connect(oc.destination);
      src.start(0);
      const rendered = await oc.startRendering();
      // 拷贝到目标上下文创建的缓冲，避免跨上下文缓冲时间轴冲突
      const out = ctx.createBuffer(2, len, sr);
      for (let ch = 0; ch < 2; ch++) out.copyToChannel(rendered.getChannelData(ch), ch);
      return out;
    };
    const white = makeNoiseBuffer(ctx, 6, 101);
    const brown = brownFromWhite(ctx, white, 0.985);
    const [roadBed, conBed, windBed, crowdBed] = await Promise.all([
      bake(101, 0.985, 'lowpass', 480, 0.7),
      bake(101, 0.985, 'bandpass', 220, 0.8),
      bake(101, 0, 'bandpass', 500, 0.7),
      bake(101, 0.985, 'highpass', 380, 0.7)
    ]);
    return {
      white, brown, roadBed, conBed, windBed, crowdBed,
      hum: makeEngineHum(ctx, 4, 82, 123)
    };
  }

  // 每个上下文独立资产：缓冲与上下文的时间轴绑定，禁止跨上下文复用
  const assetCache = new WeakMap();
  async function getAssets(ctx) {
    if (!assetCache.has(ctx)) assetCache.set(ctx, await makeAssets(ctx));
    return assetCache.get(ctx);
  }

  // 缓冲源；virtualOffset 为上下文 t=0 对应的虚拟时间（含负 margin）。
  // 统一换算成缓冲内偏移（取模），在 t=0 正时间启动，兼容真实 Web Audio。
  function loopSrc(ctx, buffer, virtualOffset, out) {
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    // 所有床/素材均循环播放（全长床循环可正确处理负 margin 的偏移回绕）
    src.loop = true;
    const len = buffer.duration;
    let off = virtualOffset % len;
    if (off < 0) off += len;
    src.start(0, off);
    src.connect(out);
    return src;
  }

  function makeShaper(ctx) {
    const n = 1024, curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      curve[i] = Math.tanh(1.6 * x);
    }
    const shaper = ctx.createWaveShaper();
    shaper.curve = curve;
    return shaper;
  }

  // 在 [w0,w1] 区间对参数 fn(t) 做分段线性自动化（无状态、逐样本确定）
  function automate(param, fn, ctx, w0, w1, step) {
    if (typeof param.bindFn === 'function') {
      // 测试桩：timeMap 把上下文本地时间映射为绝对虚拟时间，_fn 仅做端点钳制后求值
      param.bindFn(
        vt => fn(Math.min(vt, DURATION)),
        localT => w0 + localT
      );
      return;
    }
    // ramp 锚定绝对虚拟时间网格 vt=k*step，上下文时间 ct=vt-w0。
    // 整段 w0=0 时 ct=vt；分段时整条曲线平移 -w0，
    // 渲染缓冲第 i 样本（ct=i/sr）对应相同的虚拟时间 vt=w0+i/sr，取 fn(vt)。
    const span = w1 - w0;
    param.setValueAtTime(Math.max(0, fn(Math.max(0, w0))), 0);
    const k0 = Math.ceil(w0 / step);
    const k1 = Math.floor(w1 / step);
    for (let k = k0; k <= k1; k++) {
      const vt = k * step;
      const ct = vt - w0;
      if (ct <= 0) param.setValueAtTime(Math.max(0, fn(Math.min(vt, DURATION))), 0);
      else param.linearRampToValueAtTime(Math.max(0, fn(Math.min(vt, DURATION))), ct);
    }
  }

  // 事件增益包络：所有时间为上下文绝对时间。
  // 跨左边界（when<0）时，t=0 写入该时刻真实电平，保证分段与整段包络一致。
  function eventEnvelope(audioParam, when, peak, rampUpAt, rampDownAt) {
    const levelAt = t => {
      if (t <= when || t >= rampDownAt) return 0;
      if (t <= rampUpAt) return peak * (t - when) / (rampUpAt - when);
      return peak * (rampDownAt - t) / (rampDownAt - rampUpAt);
    };
    if (when < 0) {
      audioParam.setValueAtTime(Math.max(0, levelAt(0)), 0);
    } else {
      audioParam.setValueAtTime(0, 0);
      audioParam.setValueAtTime(0, when);
    }
    if (rampUpAt > 0) audioParam.linearRampToValueAtTime(peak, rampUpAt);
    if (rampDownAt > 0) audioParam.linearRampToValueAtTime(0, rampDownAt);
  }

  function panner(ctx, pan) {
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    return p;
  }

  /* 构建完整音频图（异步：首次调用需烘焙滤波床）。
     opts: { start, end, margin } 用于分段；省略即整段 0..DURATION。
     所有节点时间均为上下文时间 = 虚拟时间 - start。 */
  async function buildGraph(ctx, sample, events, opts) {
    const seg = !!opts;
    // opts.start/end 即渲染窗口的虚拟时间边界（已含 margin）；
    // 上下文 t=0 对应虚拟时间 start。整段调用时窗口为 0..DURATION。
    const start = seg ? opts.start : 0;
    const w0 = start;
    const w1 = seg ? opts.end : DURATION;
    const A = await getAssets(ctx);
    const master = ctx.createGain();
    master.gain.value = 0.9;
    const shaper = makeShaper(ctx);
    master.connect(shaper);
    shaper.connect(ctx.destination);
    const groups = {};
    const step = 0.02; // 20ms 自动化阶梯，锚定绝对虚拟时间

    buildTraffic(ctx, A, sample, events.cars, groups, master, w0, w1, start, step);
    buildConstruction(ctx, A, sample, events.strikes, groups, master, w0, w1, start, step);
    buildWind(ctx, A, sample, events.gusts, groups, master, w0, w1, start, step);
    buildCrowd(ctx, A, sample, events.syllables, groups, master, w0, w1, start, step);
    return { master, groups };
  }

  // —— 机动车：烘焙低通路面床 + 车辆经过声像事件 ——
  function buildTraffic(ctx, A, sample, cars, groups, master, w0, w1, start, step) {
    const out = ctx.createGain(); out.gain.value = 0;
    loopSrc(ctx, A.roadBed, start, out);
    out.connect(master);
    automate(out.gain, t => 0.22 * sample(t).trafficLevel, ctx, w0, w1, step);
    groups.traffic = out;

    for (const c of cars) {
      if (c.t + c.dur < w0 || c.t > w1) continue;
      const when = c.t - start;
      const pan = panner(ctx, c.pan);
      const eg = ctx.createGain();
      const src = ctx.createBufferSource();
      src.buffer = A.hum; src.loop = true;
      src.playbackRate.value = c.speed;
      // 跨左边界的事件在上下文 t=0 启动，按虚拟经过时间计算播放偏移
      const startAt = Math.max(0, when);
      const playOffset = (Math.max(0, -when) * c.speed) % A.hum.duration;
      src.start(startAt, playOffset);
      src.connect(eg); eg.connect(pan); pan.connect(master);
      eventEnvelope(eg.gain, when, 0.32 * sample(Math.min(c.t + c.dur / 2, DURATION)).trafficLevel + 0.001,
        when + c.dur * 0.35, when + c.dur);
    }
  }

  // —— 施工：烘焙带通轰鸣床 + 周期性敲击瞬态 ——
  function buildConstruction(ctx, A, sample, strikes, groups, master, w0, w1, start, step) {
    const out = ctx.createGain(); out.gain.value = 0;
    loopSrc(ctx, A.conBed, start, out);
    out.connect(master);
    automate(out.gain, t => 0.16 * sample(t).constructionLevel, ctx, w0, w1, step);
    groups.construction = out;

    for (const s of strikes) {
      if (s.t < w0 - 0.5 || s.t > w1) continue;
      const when = s.t - start;
      const pan = panner(ctx, s.pan);
      const eg = ctx.createGain();
      const buf = makeTransient(ctx, { dur: s.dur, freq: s.freq, decayTau: 0.06, noiseMix: 0.5, seed: s.seed });
      const startAt = Math.max(0, when);
      const src0 = ctx.createBufferSource();
      src0.buffer = buf;
      src0.start(startAt, Math.max(0, -when));
      src0.connect(eg);
      eg.connect(pan); pan.connect(master);
      const peak = 0.5 * sample(s.t).constructionLevel + 0.001;
      eventEnvelope(eg.gain, when, peak, when + 0.005, when + s.dur);
    }
  }

  // —— 风：带通白噪声，阵风事件调制频率与增益 ——
  function buildWind(ctx, A, sample, gusts, groups, master, w0, w1, start, step) {
    const out = ctx.createGain(); out.gain.value = 0;
    loopSrc(ctx, A.windBed, start, out);
    out.connect(master);
    const gustAt = t => {
      let a = 0;
      for (const gu of gusts) {
        const k = (t - gu.t) / gu.dur;
        if (k >= 0 && k <= 1) a += Math.sin(Math.PI * k) * gu.amp;
      }
      return Math.min(1, a);
    };
    automate(out.gain, t => 0.10 + 0.24 * sample(t).windLevel + 0.10 * sample(t).windGust * gustAt(t),
      ctx, w0, w1, step);
    groups.wind = out;
  }

  // —— 人群：烘焙高通嘈杂床 + 随机人声音节 ——
  function buildCrowd(ctx, A, sample, syllables, groups, master, w0, w1, start, step) {
    const out = ctx.createGain(); out.gain.value = 0;
    loopSrc(ctx, A.crowdBed, start, out);
    out.connect(master);
    automate(out.gain, t => 0.14 * sample(t).crowdLevel, ctx, w0, w1, step);
    groups.crowd = out;

    for (const v of syllables) {
      if (v.t < w0 - 0.5 || v.t > w1) continue;
      const when = v.t - start;
      const pan = panner(ctx, v.pan);
      const eg = ctx.createGain();
      const buf = makeTransient(ctx, { dur: v.dur, freq: v.freq, decayTau: 0.08, noiseMix: 0.3, toneMix: 0.9, seed: v.seed });
      const startAt = Math.max(0, when);
      const src0 = ctx.createBufferSource();
      src0.buffer = buf;
      src0.start(startAt, Math.max(0, -when));
      src0.connect(eg);
      eg.connect(pan); pan.connect(master);
      const peak = 0.16 * sample(v.t).crowdLevel + 0.001;
      eventEnvelope(eg.gain, when, peak, when + 0.015, when + v.dur);
    }
  }

  function renderOffline(sample, events, sampleRate) {
    const dur = global.__TEST_DURATION__ || DURATION;
    const len = Math.ceil(dur * sampleRate);
    const ctx = new OfflineAudioContext(2, len, sampleRate);
    return buildGraph(ctx, sample, events, { start: 0, end: dur })
      .then(() => ctx.startRendering());
  }

  // 分段渲染（模拟实时暂停后继续），各段含 margin 保证滤波器瞬态收敛
  function renderSegmented(sample, events, sampleRate, cutPoints, margin) {
    margin = margin || 0.15;
    const dur = global.__TEST_DURATION__ || DURATION;
    const bounds = [0].concat(cutPoints, [dur]);
    const total = Math.ceil(dur * sampleRate);
    const merged = new AudioBuffer({ length: total, numberOfChannels: 2, sampleRate });
    const parts = [];
    let chain = Promise.resolve();
    bounds.slice(0, -1).forEach((s, i) => {
      const e = bounds[i + 1];
      chain = chain.then(() => {
        // 窗口允许负虚拟起点（首段）与超出 dur（末段），图内部按模回绕处理
        const w0 = s - margin, w1 = e + margin;
        const len = Math.round((w1 - w0) * sampleRate);
        const ctx = new OfflineAudioContext(2, len, sampleRate);
        return buildGraph(ctx, sample, events, { start: w0, end: w1, margin })
          .then(() => ctx.startRendering()).then(buf => {
          const from = Math.round((s - w0) * sampleRate);
          const n = Math.min(Math.round((e - s) * sampleRate), buf.length - from);
          parts.push({ s, e, from, n, buf });
        });
      });
    });
    return chain.then(() => {
      for (const p of parts) {
        for (let ch = 0; ch < 2; ch++) {
          merged.copyToChannel(p.buf.getChannelData(ch).subarray(p.from, p.from + p.n),
            ch, Math.round(p.s * sampleRate));
        }
      }
      return merged;
    });
  }

  function compareBuffers(a, b) {
    const n = Math.min(a.length, b.length);
    let maxDiff = 0, sumSq = 0, maxAt = 0;
    const da = a.getChannelData(0), db = b.getChannelData(0);
    for (let i = 0; i < n; i++) {
      const d = Math.abs(da[i] - db[i]);
      if (d > maxDiff) { maxDiff = d; maxAt = i; }
      sumSq += d * d;
    }
    return { maxDiff, rms: Math.sqrt(sumSq / n), atTime: maxAt / a.sampleRate, samples: n };
  }

  function encodeWav(buffer) {
    const sr = buffer.sampleRate, ch = buffer.numberOfChannels, n = buffer.length;
    const bytes = 44 + n * ch * 2;
    const view = new DataView(new ArrayBuffer(bytes));
    const ws = (off, str) => { for (let i = 0; i < str.length; i++) view.setUint8(off + i, str.charCodeAt(i)); };
    ws(0, 'RIFF'); view.setUint32(4, bytes - 8, true); ws(8, 'WAVE');
    ws(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
    view.setUint16(22, ch, true); view.setUint32(24, sr, true);
    view.setUint32(28, sr * ch * 2, true); view.setUint16(32, ch * 2, true);
    view.setUint16(34, 16, true); ws(36, 'data'); view.setUint32(40, n * ch * 2, true);
    let off = 44;
    const chans = [];
    for (let c = 0; c < ch; c++) chans.push(buffer.getChannelData(c));
    for (let i = 0; i < n; i++) {
      for (let c = 0; c < ch; c++) {
        const x = Math.max(-1, Math.min(1, chans[c][i]));
        view.setInt16(off, x < 0 ? x * 0x8000 : x * 0x7fff, true);
        off += 2;
      }
    }
    return new Blob([view.buffer], { type: 'audio/wav' });
  }

  global.Render = { DURATION, FADE, makeAssets, buildGraph, loopSrc, panner,
    automate, eventEnvelope, renderOffline, renderSegmented, compareBuffers, encodeWav };
})(window);
