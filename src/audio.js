'use strict';

// 同一套合成参数，两种后端：
//  - Web Audio：浏览器实时播放（AudioContext + 调度）
//  - Offline：纯 JS 累加 PCM，用于 Node 无头测试与 WAV 导出

const SR = 22050;

function expEnv(t, start, decay) {
  return t >= start ? Math.exp(-(t - start) / decay) : 0;
}

// 单个事件的渲染核：把该事件对采样缓冲的贡献累加进去
function renderEvent(buf, ev, sampleRate) {
  const startIdx = Math.max(0, Math.floor(ev.time * sampleRate));
  const dur =
    ev.type === 'squeal' ? 0.45 : ev.type === 'knock' ? 0.2 : ev.type === 'miss' ? 0.08 : 0.12;
  const n = Math.min(buf.length - startIdx, Math.ceil(dur * sampleRate));
  if (n <= 0) return;

  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    let s = 0;

    if (ev.type === 'tick') {
      // 木质机械 click：短噪声脉冲 + 两个快速衰减的共振峰
      const noise = (Math.random() * 2 - 1) * Math.exp(-t / 0.004);
      const body =
        0.55 * Math.sin(2 * Math.PI * 680 * t) * Math.exp(-t / 0.012) +
        0.3 * Math.sin(2 * Math.PI * 1240 * t) * Math.exp(-t / 0.008);
      s = 0.5 * (noise * 0.5 + body);
    } else if (ev.type === 'squeal') {
      // 金属尖响：高频非谐和分音 + 慢衰减 + 轻微颤音，明显异于 tick
      const k = ev.intensity ?? 0.7;
      const vib = 1 + 0.004 * Math.sin(2 * Math.PI * 28 * t);
      const partials = [3400, 5180, 7260, 9310];
      let tone = 0;
      partials.forEach((f, idx) => {
        tone +=
          (1 / (idx + 1)) * Math.sin(2 * Math.PI * f * vib * t + idx * 0.7);
      });
      s = 0.4 * k * tone * Math.exp(-t / 0.18);
    } else if (ev.type === 'knock') {
      // 撞限位：低频闷响
      s =
        0.7 *
        (Math.sin(2 * Math.PI * 160 * t) * 0.8 +
          (Math.random() * 2 - 1) * 0.3 * Math.exp(-t / 0.01)) *
        Math.exp(-t / 0.06);
    } else if (ev.type === 'miss') {
      // 漏拍：极轻的齿轮空程声
      s = 0.08 * (Math.random() * 2 - 1) * Math.exp(-t / 0.006);
    }

    buf[startIdx + i] += s;
  }
}

// 离线渲染：输入事件数组，输出 Float32 PCM（单声道）
function renderOffline(events, seconds, sampleRate = SR) {
  const buf = new Float32Array(Math.ceil(seconds * sampleRate));
  for (const ev of events) renderEvent(buf, ev, sampleRate);
  // 轻微软限幅
  for (let i = 0; i < buf.length; i++) {
    buf[i] = Math.tanh(buf[i]);
  }
  return buf;
}

function encodeWav(pcm, sampleRate = SR) {
  const numChannels = 1;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = pcm.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const writeStr = (off, str) => {
    for (let i = 0; i < str.length; i++) view.setUint8(off + i, str.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);
  let off = 44;
  for (let i = 0; i < pcm.length; i++, off += 2) {
    const v = Math.max(-1, Math.min(1, pcm[i]));
    view.setInt16(off, v < 0 ? v * 0x8000 : v * 0x7fff, true);
  }
  return Buffer.from(buffer);
}

// 浏览器实时播放后端：用 AudioContext 按事件时间调度
class WebAudioSink {
  constructor(ctx) {
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.8;
    this.master.connect(ctx.destination);
  }

  schedule(ev) {
    const t0 = this.ctx.currentTime + 0.05 + Math.max(0, ev.time - (this._t0 ?? ev.time));
    if (this._t0 == null) this._t0 = ev.time;
    const at = this.ctx.currentTime + 0.05 + (ev.time - this._t0);
    if (ev.type === 'tick') this._click(at);
    else if (ev.type === 'squeal') this._squeal(at, ev.intensity ?? 0.7);
    else if (ev.type === 'knock') this._knock(at);
    else if (ev.type === 'miss') this._whiff(at);
  }

  _osc(freq, t, dur, type, gain) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  _click(t) {
    this._osc(680, t, 0.05, 'triangle', 0.5);
    this._osc(1240, t, 0.03, 'sine', 0.25);
  }

  _squeal(t, k) {
    [3400, 5180, 7260, 9310].forEach((f, i) =>
      this._osc(f, t, 0.4, 'sawtooth', 0.12 * k / (i + 1)),
    );
  }

  _knock(t) {
    this._osc(160, t, 0.15, 'sine', 0.6);
  }

  _whiff(t) {
    this._osc(220, t, 0.04, 'sine', 0.05);
  }
}

module.exports = { renderOffline, encodeWav, WebAudioSink, SR, renderEvent };
