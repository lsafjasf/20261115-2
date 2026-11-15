(function (root) {
  'use strict';

  function SoundEngine() {
    this.ctx = null;
    this.muted = false;
    this.master = null;
    this.windGain = null;
    this.windFilter = null;
    this.altOsc = null;
    this.altGain = null;
  }

  SoundEngine.prototype.ensure = function () {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9;
    this.master.connect(this.ctx.destination);

    const len = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const noise = this.ctx.createBufferSource();
    noise.buffer = buf; noise.loop = true;
    this.windFilter = this.ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 500;
    this.windFilter.Q.value = 0.7;
    this.windGain = this.ctx.createGain();
    this.windGain.gain.value = 0.0;
    noise.connect(this.windFilter).connect(this.windGain).connect(this.master);
    noise.start();

    this.altOsc = this.ctx.createOscillator();
    this.altOsc.type = 'sine';
    this.altOsc.frequency.value = 220;
    this.altGain = this.ctx.createGain();
    this.altGain.gain.value = 0.0;
    this.altOsc.connect(this.altGain).connect(this.master);
    this.altOsc.start();
  };

  SoundEngine.prototype.setMuted = function (m) {
    this.muted = m;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.05);
    }
  };

  SoundEngine.prototype.updateWind = function (speed) {
    if (!this.ctx) return;
    const s = Math.min(1, Math.abs(speed) / 24);
    this.windFilter.frequency.setTargetAtTime(320 + s * 760, this.ctx.currentTime, 0.15);
    this.windGain.gain.setTargetAtTime(0.025 + s * 0.16, this.ctx.currentTime, 0.2);
  };

  SoundEngine.prototype.updateAltitude = function (alt, maxAlt) {
    if (!this.ctx) return;
    const r = Math.max(0, Math.min(1, alt / maxAlt));
    this.altOsc.frequency.setTargetAtTime(160 + r * 520, this.ctx.currentTime, 0.12);
    this.altGain.gain.setTargetAtTime(0.012 + r * 0.03, this.ctx.currentTime, 0.15);
  };

  SoundEngine.prototype.silence = function () {
    if (!this.ctx) return;
    this.windGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.2);
    this.altGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.2);
  };

  function tone(engine, freq, dur, type, vol, slideTo) {
    if (!engine.ctx) return;
    const t0 = engine.ctx.currentTime;
    const osc = engine.ctx.createOscillator();
    const g = engine.ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(engine.master);
    osc.start(t0); osc.stop(t0 + dur + 0.02);
  }

  SoundEngine.prototype.parachute = function () { tone(this, 900, 0.5, 'sawtooth', 0.12, 240); };
  SoundEngine.prototype.thud = function () { tone(this, 130, 0.35, 'sine', 0.35, 42); };
  SoundEngine.prototype.damage = function () { tone(this, 210, 0.5, 'square', 0.22, 60); };
  SoundEngine.prototype.success = function () {
    tone(this, 660, 0.18, 'sine', 0.2);
    setTimeout(() => tone(this, 990, 0.28, 'sine', 0.2), 150);
  };

  root.SoundEngine = SoundEngine;
})(typeof self !== 'undefined' ? self : this);
