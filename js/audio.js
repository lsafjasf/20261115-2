 (function (root) {
  'use strict';

  function AudioEngine() {
    this.ctx = null;
    this.master = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.tensionOsc = null;
    this.tensionGain = null;
    this.started = false;
    this.lastCollision = 0;
  }

  AudioEngine.prototype.ensure = function () {
    if (this.started) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(this.ctx.destination);

    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0.0;
    const engineFilter = this.ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 420;
    this.engineOsc.connect(engineFilter);
    engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc.start();

    this.tensionOsc = this.ctx.createOscillator();
    this.tensionOsc.type = 'triangle';
    this.tensionOsc.frequency.value = 220;
    this.tensionGain = this.ctx.createGain();
    this.tensionGain.gain.value = 0;
    this.tensionOsc.connect(this.tensionGain);
    this.tensionGain.connect(this.master);
    this.tensionOsc.start();

    this.started = true;
  };

  AudioEngine.prototype.update = function (sim, throttleEff) {
    if (!this.started) return;
    const now = this.ctx.currentTime;
    const speed = Math.hypot(sim.tug.vx, sim.tug.vy);
    const rpm = 48 + Math.abs(throttleEff || 0) * 90 + speed * 0.55;
    this.engineOsc.frequency.setTargetAtTime(rpm, now, 0.08);
    this.engineGain.gain.setTargetAtTime(0.05 + Math.abs(throttleEff || 0) * 0.07, now, 0.1);

    const strain = Math.max(0, Math.min(1, sim.maxTension / 1200));
    this.tensionOsc.frequency.setTargetAtTime(180 + strain * 520, now, 0.06);
    this.tensionGain.gain.setTargetAtTime(strain * 0.085, now, 0.08);
  };

  AudioEngine.prototype.blip = function (freq, duration, type, volume) {
    if (!this.started) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type || 'square';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(volume || 0.18, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start();
    osc.stop(this.ctx.currentTime + duration);
  };

  AudioEngine.prototype.collision = function (strength) {
    if (!this.started) return;
    if (this.ctx.currentTime - this.lastCollision < 0.08) return;
    this.lastCollision = this.ctx.currentTime;
    this.blip(70 + Math.min(120, strength), 0.22, 'sawtooth', 0.25);
  };

  AudioEngine.prototype.bridgeThud = function () {
    this.blip(52, 0.45, 'sawtooth', 0.35);
  };

  AudioEngine.prototype.success = function () {
    if (!this.started) return;
    [523, 659, 784].forEach((f, i) =>
      setTimeout(() => this.blip(f, 0.35, 'triangle', 0.22), i * 180));
  };

  AudioEngine.prototype.failure = function () {
    if (!this.started) return;
    [330, 247, 165].forEach((f, i) =>
      setTimeout(() => this.blip(f, 0.4, 'sawtooth', 0.2), i * 200));
  };

  root.TugAudio = AudioEngine;
})(typeof self !== 'undefined' ? self : this);
