// Web Audio 合成：玻璃敲击的衰荡音与摩擦杯口的持续噪声。
// 同时支持实时 AudioContext 与离线 OfflineAudioContext（用于自动测试/导出）。

import { resonantFreq } from './physics.js';

export class GlassAudio {
  constructor(ctx) {
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    // 轻混响，增强玻璃感
    this.verb = ctx.createConvolver();
    this.verb.buffer = this._impulse(1.4, 2.2);
    this.verbGain = ctx.createGain();
    this.verbGain.gain.value = 0.35;
    this.master.connect(ctx.destination);
    this.master.connect(this.verb);
    this.verb.connect(this.verbGain);
    this.verbGain.connect(ctx.destination);
    this.rubNodes = new Map();
  }

  _impulse(duration, decay) {
    const rate = this.ctx.sampleRate;
    const len = Math.floor(rate * duration);
    const buf = this.ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return buf;
  }

  // 敲击：基频 + 两个非谐波分音，指数衰荡
  strike(glass, force, when = this.ctx.currentTime) {
    const f = resonantFreq(glass);
    const partials = [
      { ratio: 1, gain: 1.0, decay: 1.8 },
      { ratio: 2.08, gain: 0.32, decay: 1.1 },
      { ratio: 3.32, gain: 0.14, decay: 0.7 },
    ];
    const out = this.ctx.createGain();
    out.gain.value = 0.5 * Math.min(1.2, force);
    out.connect(this.master);
    for (const p of partials) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = f * p.ratio;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(p.gain, when);
      g.gain.exponentialRampToValueAtTime(0.0001, when + p.decay);
      osc.connect(g).connect(out);
      osc.start(when);
      osc.stop(when + p.decay + 0.05);
    }
  }

  // 裂杯：高频噪声爆发 + 低频闷响
  crack(when = this.ctx.currentTime) {
    const dur = 0.5;
    const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate * dur, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 2);
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 3200;
    bp.Q.value = 0.8;
    const g = this.ctx.createGain();
    g.gain.value = 0.8;
    src.connect(bp).connect(g).connect(this.master);
    src.start(when);

    const osc = this.ctx.createOscillator();
    osc.frequency.setValueAtTime(180, when);
    osc.frequency.exponentialRampToValueAtTime(50, when + 0.4);
    const og = this.ctx.createGain();
    og.gain.setValueAtTime(0.6, when);
    og.gain.exponentialRampToValueAtTime(0.001, when + 0.45);
    osc.connect(og).connect(this.master);
    osc.start(when);
    osc.stop(when + 0.5);
  }

  // 开始摩擦：带通噪声，中心频率跟随共振频率
  startRub(glass) {
    if (this.rubNodes.has(glass.id) || glass.cracked) return;
    const len = this.ctx.sampleRate * 2;
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = resonantFreq(glass);
    bp.Q.value = 12;
    const g = this.ctx.createGain();
    g.gain.value = 0;
    src.connect(bp).connect(g).connect(this.master);
    src.start();
    this.rubNodes.set(glass.id, { src, bp, g, glass });
  }

  // 每帧更新摩擦强度与随温度变化的中心频率
  updateRub(glass, intensity) {
    const node = this.rubNodes.get(glass.id);
    if (!node) return;
    const t = this.ctx.currentTime;
    node.g.gain.setTargetAtTime(0.16 * intensity, t, 0.05);
    node.bp.frequency.setTargetAtTime(resonantFreq(glass), t, 0.05);
  }

  stopRub(glass) {
    const node = this.rubNodes.get(glass.id);
    if (!node) return;
    const t = this.ctx.currentTime;
    node.g.gain.setTargetAtTime(0, t, 0.04);
    node.src.stop(t + 0.3);
    this.rubNodes.delete(glass.id);
  }
}

// 将 AudioBuffer 编码为 16-bit PCM WAV
export function encodeWav(buffer) {
    const channels = buffer.numberOfChannels;
    const rate = buffer.sampleRate;
    const frames = buffer.length;
    const dataSize = frames * channels * 2;
    const out = new ArrayBuffer(44 + dataSize);
    const view = new DataView(out);
    const writeStr = (offset, str) => {
      for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
    };
    writeStr(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeStr(8, 'WAVE');
    writeStr(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, channels, true);
    view.setUint32(24, rate, true);
    view.setUint32(28, rate * channels * 2, true);
    view.setUint16(32, channels * 2, true);
    view.setUint16(34, 16, true);
    writeStr(36, 'data');
    view.setUint32(40, dataSize, true);
    let offset = 44;
    const chans = [];
    for (let c = 0; c < channels; c++) chans.push(buffer.getChannelData(c));
    for (let i = 0; i < frames; i++) {
      for (let c = 0; c < channels; c++) {
        const sample = Math.max(-1, Math.min(1, chans[c][i]));
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
        offset += 2;
      }
    }
    return new Blob([out], { type: 'audio/wav' });
  }
