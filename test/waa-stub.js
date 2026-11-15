/* 极简 Web Audio 桩：离线渲染确定性 DSP，用于 Node 下逐样本一致性测试 */
'use strict';

let SRC_ID = 1;
let CTX_ID = 1;

class AudioParam {
  constructor(initial) {
    this.value = initial; this._events = []; this._curve = null;
    this.id = SRC_ID++; this._fn = null; this._timeMap = null;
  }
  setValueAtTime(v, t) { this._events.push({ t, v, type: 'set' }); return this; }
  linearRampToValueAtTime(v, t) { this._events.push({ t, v, type: 'ramp' }); return this; }
  setValueCurveAtTime(values, start, dur) { this._curve = { values, start, dur }; return this; }
  // 测试专用：绑定逐样本求值函数，timeMap 把上下文时间映射到虚拟时间
  bindFn(fn, timeMap) { this._fn = fn; this._timeMap = timeMap; return this; }
  valueAt(t) {
    if (this._fn) {
      const vt = this._timeMap ? this._timeMap(t) : t;
      return this._fn(vt);
    }
    if (this._curve && t >= this._curve.start && t <= this._curve.start + this._curve.dur) {
      const c = this._curve;
      // 渲染在样本网格 t=i/sr 上步进，直接取整数样本索引，避免亚样本漂移
      const p = (t - c.start) * c.values.length / c.dur;
      const i = Math.min(c.values.length - 1, Math.max(0, Math.round(p)));
      return c.values[i];
    }
    const ev = this._events;
    if (!ev.length) return this.value;
    if (t <= ev[0].t) return ev[0].v;
    if (t >= ev[ev.length - 1].t) return ev[ev.length - 1].v;
    let lo = 0, hi = ev.length - 1; // 二分定位事件区间
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (ev[mid].t <= t) lo = mid; else hi = mid;
    }
    const a = ev[lo], b = ev[hi];
    if (b.t === a.t || b.type === 'set') return b.v;
    const k = (t - a.t) / (b.t - a.t);
    return a.v + (b.v - a.v) * k;
  }
}

class AudioNode {
  constructor(ctx) {
    this.ctx = ctx; this.inputs = []; this.id = SRC_ID++;
    this._tick = -1; this._ptick = -1; this._pkey = '';
  }
  connect(node) {
    if (node instanceof AudioNode) node.inputs.push(this);
    return node;
  }
  disconnect() { /* 测试图简单重建，无需精细断开 */ }
  process(t, ch) {
    const tick = this.ctx.id + ':' + this.ctx._sampleTick;
    if (this._tick !== tick) { this._tick = tick; this._cache = [this._eval(0), this._eval(1)]; }
    return this._cache[ch];
  }
  paramAt(param) {
    return param.valueAt(this.ctx._sampleTime);
  }
  _eval() { throw new Error('override'); }
}

class BufferSource extends AudioNode {
  constructor(ctx) {
    super(ctx);
    this.buffer = null; this.loop = false; this.playbackRate = new AudioParam(1);
    this._startAt = 0; this._offset = 0;
  }
 start(when, offset) { this._startAt = when || 0; this._offset = offset || 0; this.ctx._sources.push(this); }
  sampleAt(t, ch) {
    if (!this.buffer || t < this._startAt) return 0;
    const sr = this.buffer.sampleRate;
    let idx = ((t - this._startAt) * this.playbackRate.value) * sr + this._offset * sr;
    const len = this.buffer.length;
    if (this.loop) idx = idx % len;
    else if (idx >= len) return 0;
    const i0 = Math.floor(idx);
    const data = this.buffer._data[ch % this.buffer.numberOfChannels];
    const a = data[i0 % len] || 0;
    const b = data[(i0 + 1) % len] || 0;
    return a + (b - a) * (idx - i0);
  }
  _eval(ch) { return this.sampleAt(this.ctx._sampleTime, ch); }
}

class Gain extends AudioNode {
  constructor(ctx) { super(ctx); this.gain = new AudioParam(1); }
  _eval(ch) { return this.paramAt(this.gain) * sumInputs(this, this.ctx._sampleTime, ch); }
}

class Biquad extends AudioNode {
  constructor(ctx, type) {
    super(ctx); this.type = type;
    this.frequency = new AudioParam(350); this.Q = new AudioParam(1);
    this._z = [0, 0]; ctx._biquads.push(this);
  }
  // 分段渲染预热：把滤波器状态推进到虚拟时间 start，模拟 IIR 历史
  preRoll(start) {
    const sr = this.ctx.sampleRate;
    const n = Math.floor(start * sr);
    for (let i = 0; i < n; i++) {
      this.ctx._sampleTick = i;
      this.ctx._sampleTime = this.ctx._sampleTick / sr;
      this._tick = -1;
      for (let ch = 0; ch < 2; ch++) this._eval(ch);
    }
  }
  _eval(ch) {
    const t = this.ctx._sampleTime;
    const x = sumInputs(this, t, ch);
    // 一阶近似：低通/高通做平滑，带通做弱带通（仅验证确定性与增益结构）
    const f = this.paramAt(this.frequency);
    const alpha = Math.min(0.999, 1 / (1 + this.ctx.sampleRate / (2 * Math.PI * f)));
    const lp = this._z[ch] = this._z[ch] + (1 - alpha) * (x - this._z[ch]);
    if (this.type === 'lowpass') return lp;
    if (this.type === 'highpass') return x - lp;
    return (x - lp) * 0.5 + lp * 0.2;
  }
}

class Panner extends AudioNode {
  constructor(ctx) { super(ctx); this.pan = new AudioParam(0); }
  _eval(ch) {
    const x = sumInputs(this, this.ctx._sampleTime, ch);
    const p = this.paramAt(this.pan);
    return ch === 0 ? x * (1 - Math.max(0, p)) : x * (1 + Math.min(0, p));
  }
}

class Shaper extends AudioNode {
  constructor(ctx) { super(ctx); this.curve = null; }
  _eval(ch) {
    const x = sumInputs(this, this.ctx._sampleTime, ch);
    if (!this.curve) return x;
    const n = this.curve.length;
    const k = Math.max(0, Math.min(n - 1, Math.floor((x + 1) / 2 * n)));
    return this.curve[k];
  }
}

function sumInputs(node, t, ch) {
  let s = 0;
  for (const inp of node.inputs) s += inp.process(t, ch);
  return s;
}

class AudioBuffer {
  constructor({ length, numberOfChannels, sampleRate }) {
    this.length = length; this.numberOfChannels = numberOfChannels; this.sampleRate = sampleRate;
    this.duration = length / sampleRate;
    this._data = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
  }
  getChannelData(ch) { return this._data[ch]; }
  copyToChannel(arr, ch, start) { this._data[ch].set(arr, start); }
}

class OfflineAudioContext {
  constructor(channels, length, sampleRate) {
    this.id = CTX_ID++;
    this.numberOfChannels = channels; this.length = length; this.sampleRate = sampleRate;
    this._sources = [];
    this._biquads = [];
    this.destination = new Gain(this);
  }
  createBuffer(ch, len, sr) { return new AudioBuffer({ length: len, numberOfChannels: ch, sampleRate: sr }); }
  createBufferSource() { return new BufferSource(this); }
  createGain() { return new Gain(this); }
  createBiquadFilter() { return new Biquad(this); }
  createStereoPanner() { return new Panner(this); }
  createWaveShaper() { return new Shaper(this); }
  preRollFilters(start) { for (const b of this._biquads) b.preRoll(start); }
  async startRendering() {
    const buf = new AudioBuffer({ length: this.length, numberOfChannels: 2, sampleRate: this.sampleRate });
    for (let ch = 0; ch < 2; ch++) {
      const out = buf.getChannelData(ch);
      for (let i = 0; i < this.length; i++) {
        this._sampleTick = i;
        this._sampleTime = this._sampleTick / this.sampleRate;
        out[i] = this.destination.process(this._sampleTime, ch);
      }
    }
    return buf;
  }
}

global.window = global;
global.OfflineAudioContext = OfflineAudioContext;
global.AudioBuffer = AudioBuffer;
global.Blob = class Blob {
  constructor(parts, opts) {
    this._buf = Buffer.concat(parts.map(p => Buffer.from(p.buffer || p)));
    this.size = this._buf.length;
    this.type = (opts && opts.type) || '';
  }
};
module.exports = { OfflineAudioContext, AudioBuffer };
