// Web Audio 合成：无外部音频文件，振动盘与剔除机构声音全部实时合成。
export class SoundBoard {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.hum = null;
    this.humGain = null;
    this.muted = false;
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(this.ctx.destination);

    // 振动盘嗡鸣：两个锯齿波叠加 + 低频 LFO 调制，持续运行
    const osc1 = this.ctx.createOscillator();
    osc1.type = 'sawtooth';
    osc1.frequency.value = 70;
    const osc2 = this.ctx.createOscillator();
    osc2.type = 'square';
    osc2.frequency.value = 107;
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 6;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 4;
    lfo.connect(lfoGain).connect(osc1.frequency);
    this.humGain = this.ctx.createGain();
    this.humGain.gain.value = 0;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(this.humGain).connect(this.master);
    osc1.start();
    osc2.start();
    lfo.start();
    this.hum = { osc1, osc2 };
  }

  setMuted(m) {
    this.muted = m;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(m ? 0 : 0.5, this.ctx.currentTime, 0.02);
    }
  }

  // freq：1-5 档；running：正在运行的料斗数量
  updateHum(freq, running) {
    if (!this.ctx || !this.hum) return;
    const t = this.ctx.currentTime;
    const base = 55 + freq * 14;
    this.hum.osc1.frequency.setTargetAtTime(base, t, 0.1);
    this.hum.osc2.frequency.setTargetAtTime(base * 1.53, t, 0.1);
    this.humGain.gain.setTargetAtTime(running ? 0.05 + freq * 0.012 : 0, t, 0.15);
  }

  _tone({ freq = 440, endFreq, type = 'sine', dur = 0.12, gain = 0.3, delay = 0 }) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (endFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t0 + dur);
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(g).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  _noise({ dur = 0.1, gain = 0.25, delay = 0, filterFreq = 1800 }) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = filterFreq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(filter).connect(g).connect(this.master);
    src.start(t0);
  }

  divert() { this._noise({ dur: 0.07, gain: 0.3, filterFreq: 2600 }); } // 剔除机构咔哒
  fill() { this._tone({ freq: 320, endFreq: 220, type: 'triangle', dur: 0.06, gain: 0.12 }); }
  rejectBottle() { // 不良瓶闷响 + 机械碰撞
    this._tone({ freq: 140, endFreq: 60, dur: 0.28, gain: 0.4 });
    this._noise({ dur: 0.12, gain: 0.25, filterFreq: 500, delay: 0.05 });
  }
  clear() { // 清缓存：从高到低的气流扫频
    this._tone({ freq: 900, endFreq: 180, type: 'sawtooth', dur: 0.45, gain: 0.18 });
    this._noise({ dur: 0.4, gain: 0.15, filterFreq: 1200 });
  }
  batch() { // 换批提示双音
    this._tone({ freq: 520, dur: 0.1, gain: 0.25 });
    this._tone({ freq: 780, dur: 0.16, gain: 0.25, delay: 0.12 });
  }
  win() {
    [523, 659, 784, 1047].forEach((f, i) =>
      this._tone({ freq: f, dur: 0.22, gain: 0.28, type: 'triangle', delay: i * 0.13 }));
  }
  lose() {
    [392, 330, 262, 196].forEach((f, i) =>
      this._tone({ freq: f, endFreq: f * 0.9, dur: 0.3, gain: 0.28, type: 'sawtooth', delay: i * 0.16 }));
  }
}
