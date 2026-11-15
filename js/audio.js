/* Procedural Web Audio: brush rumble + pump whine, driven by sim params. */
(function () {
  'use strict';

  function CleanerAudio() {
    this.ctx = null;
    this.enabled = true;
    this.started = false;
  }

  CleanerAudio.prototype.ensure = function () {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();

    const master = this.ctx.createGain();
    master.gain.value = 0.0;
    master.connect(this.ctx.destination);
    this.master = master;

    // White-noise buffer for the brush.
    const len = this.ctx.sampleRate * 1;
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;
    const noiseFilter = this.ctx.createBiquadFilter();
    noiseFilter.type = 'lowpass';
    noiseFilter.frequency.value = 500;
    const noiseGain = this.ctx.createGain();
    noiseGain.gain.value = 0.5;
    noise.connect(noiseFilter).connect(noiseGain).connect(master);
    noise.start();
    this.noiseFilter = noiseFilter;
    this.noiseGain = noiseGain;

    // Oscillator for the pump motor.
    const pump = this.ctx.createOscillator();
    pump.type = 'sawtooth';
    pump.frequency.value = 90;
    const pumpGain = this.ctx.createGain();
    pumpGain.gain.value = 0.0;
    pump.connect(pumpGain).connect(master);
    pump.start();
    this.pump = pump;
    this.pumpGain = pumpGain;

    // A second higher oscillator gives the brush spin whine.
    const whine = this.ctx.createOscillator();
    whine.type = 'triangle';
    whine.frequency.value = 220;
    const whineGain = this.ctx.createGain();
    whineGain.gain.value = 0.0;
    whine.connect(whineGain).connect(master);
    whine.start();
    this.whine = whine;
    this.whineGain = whineGain;
  };

  CleanerAudio.prototype.resume = function () {
    this.ensure();
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    this.started = true;
  };

  CleanerAudio.prototype.update = function (state) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const active = state.running && !state.finished;
    const p = state.params;

    this.master.gain.setTargetAtTime(active ? 0.5 : 0.0, t, 0.08);

    // Brush: louder/ brighter with pressure and travel speed.
    const speedN = (p.speed - 0.4) / 2.1;
    const pressureN = p.pressure / 100;
    const brushLevel = active ? 0.25 + pressureN * 0.35 : 0;
    this.noiseGain.gain.setTargetAtTime(brushLevel, t, 0.1);
    this.noiseFilter.frequency.setTargetAtTime(350 + speedN * 700 + pressureN * 300, t, 0.1);
    this.whine.frequency.setTargetAtTime(180 + speedN * 260, t, 0.1);
    this.whineGain.gain.setTargetAtTime(active ? 0.12 + pressureN * 0.1 : 0, t, 0.1);

    // Pump: pitch and volume follow water flow; silent when the tank is dry.
    const pumpN = state.tank > 0 ? p.flow / 5 : 0;
    this.pump.frequency.setTargetAtTime(70 + pumpN * 160, t, 0.08);
    this.pumpGain.gain.setTargetAtTime(active ? pumpN * 0.32 : 0, t, 0.08);
  };

  CleanerAudio.prototype.toggle = function () {
    this.enabled = !this.enabled;
    if (this.ctx) this.master.gain.setTargetAtTime(this.enabled ? 0.5 : 0, this.ctx.currentTime, 0.05);
    return this.enabled;
  };

  window.CleanerAudio = CleanerAudio;
})();
