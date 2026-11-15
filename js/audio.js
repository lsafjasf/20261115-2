/* audio.js — Web Audio：张力（应力比）驱动音调、低通与音量；阵风加噪声呼吸。 */
(function (root) {
  'use strict';

  function BridgeAudio() {
    this.ctx = null;
    this.muted = false;
  }

  BridgeAudio.prototype.ensure = function () {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = AC.call ? new AC() : new AC();
    this.ctx = ctx;

    const master = ctx.createGain();
    master.gain.value = 0.0001;
    master.connect(ctx.destination);

    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 70;

    const osc2 = ctx.createOscillator();
    osc2.type = 'triangle';
    osc2.frequency.value = 140;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 320;
    filter.Q.value = 6;

    const oscGain = ctx.createGain();
    oscGain.gain.value = 0.5;
    osc.connect(oscGain);
    osc2.connect(oscGain);
    oscGain.connect(filter);
    filter.connect(master);

    // 风噪声：缓冲白噪声 + 带通，增益随风速
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    noise.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 480;
    band.Q.value = 0.8;
    const windGain = ctx.createGain();
    windGain.gain.value = 0.0;
    noise.connect(band);
    band.connect(windGain);
    windGain.connect(master);

    osc.start();
    osc2.start();
    noise.start();
    Object.assign(this, { master, osc, osc2, filter, windGain, band });
  };

  BridgeAudio.prototype.update = function (stress, wind, running) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const s = Math.max(0, Math.min(1.15, stress));
    // 张力越高，基频越高、滤波器越开、音量越大
    const freq = 60 + 150 * s;
    this.osc.frequency.setTargetAtTime(freq, t, 0.08);
    this.osc2.frequency.setTargetAtTime(freq * 2.01, t, 0.08);
    this.filter.frequency.setTargetAtTime(280 + 1400 * s, t, 0.1);
    const targetGain = running ? 0.05 + 0.13 * s : 0.02;
    this.master.gain.setTargetAtTime(targetGain, t, 0.15);
    const w = Math.max(0, wind - 1.2) / 11;
    this.windGain.gain.setTargetAtTime(0.02 + 0.16 * w, t, 0.2);
    this.band.frequency.setTargetAtTime(400 + 900 * w, t, 0.2);
  };

  BridgeAudio.prototype.fail = function () {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    this.osc.type = 'square';
    this.osc.frequency.cancelScheduledValues(t);
    this.osc.frequency.setValueAtTime(220, t);
    this.osc.frequency.exponentialRampToValueAtTime(38, t + 1.1);
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(0.28, t);
    this.master.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
  };

  BridgeAudio.prototype.win = function () {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    [523.25, 659.25, 783.99].forEach((f, i) => {
      const o = ctx.createOscillator();
      const gn = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      gn.gain.setValueAtTime(0.0001, t + i * 0.14);
      gn.gain.exponentialRampToValueAtTime(0.18, t + i * 0.14 + 0.03);
      gn.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.14 + 0.5);
      o.connect(gn);
      gn.connect(ctx.destination);
      o.start(t + i * 0.14);
      o.stop(t + i * 0.14 + 0.55);
    });
  };

  BridgeAudio.prototype.toggleMute = function () {
    this.muted = !this.muted;
    if (this.ctx && this.muted) {
      this.master.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.05);
    }
    return this.muted;
  };

  root.BridgeAudio = BridgeAudio;
})(window);
