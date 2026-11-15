'use strict';

// 浏览器实时音频后端：Web Audio 按物理时间调度机械 click / 尖响 / 撞限 / 漏拍
class MetronomeAudio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this._baseSimTime = null;
    this._baseCtxTime = 0;
  }

  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.8;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  resetClock(firstSimTime) {
    this._baseSimTime = firstSimTime;
    this._baseCtxTime = this.ctx.currentTime + 0.08;
  }

  _at(simTime) {
    return this._baseCtxTime + (simTime - this._baseSimTime);
  }

  _tone(freq, t, dur, type, gain) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.03);
  }

  schedule(ev) {
    if (this.muted || !this.ctx) return;
    if (this._baseSimTime == null) this.resetClock(ev.time);
    const t = this._at(ev.time);
    if (t < this.ctx.currentTime - 0.05) return; // 过期事件丢弃

    if (ev.type === 'tick') {
      this._tone(680, t, 0.05, 'triangle', 0.5);
      this._tone(1240, t, 0.03, 'sine', 0.22);
    } else if (ev.type === 'squeal') {
      const k = ev.intensity ?? 0.7;
      [3400, 5180, 7260, 9310].forEach((f, i) =>
        this._tone(f, t, 0.4, 'sawtooth', (0.12 * k) / (i + 1)),
      );
    } else if (ev.type === 'knock') {
      this._tone(160, t, 0.15, 'sine', 0.6);
    } else if (ev.type === 'miss') {
      this._tone(220, t, 0.04, 'sine', 0.05);
    }
  }
}

window.MetronomeAudio = MetronomeAudio;
