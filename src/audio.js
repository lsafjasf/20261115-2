// Procedural Web Audio: layered wind noise, fan hum and intake alarms.
// Everything is synthesized; no audio assets are required.

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.noiseBuffer = null;
    this.windGain = null;
    this.windFilter = null;
    this.fanOscs = [];
    this.fanGains = [];
    this.alarmOsc = null;
    this.alarmGain = null;
    this.started = false;
  }

  async start() {
    if (this.started) {
      if (this.ctx.state === "suspended") await this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) {
      this.unavailable = true;
      return; // headless or unsupported browser: simulation still runs
    }
    this.ctx = new Ctx();
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(ctx.destination);

    // Two seconds of white noise, looped, shaped into a wind bed.
    const len = ctx.sampleRate * 2;
    this.noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    const wind = ctx.createBufferSource();
    wind.buffer = this.noiseBuffer;
    wind.loop = true;
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = "bandpass";
    this.windFilter.frequency.value = 480;
    this.windFilter.Q.value = 0.6;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0.0;
    wind.connect(this.windFilter).connect(this.windGain).connect(this.master);
    wind.start();

    // One low hum per fan; gain tracks power, frequency tracks direction use.
    for (let i = 0; i < 3; i++) {
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.value = 70 + i * 18;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 320;
      osc.connect(filter).connect(gain).connect(this.master);
      osc.start();
      this.fanOscs.push(osc);
      this.fanGains.push(gain);
    }

    // Intake alarm: a slow pulsing tone that grows as efficiency drops.
    this.alarmOsc = ctx.createOscillator();
    this.alarmOsc.type = "triangle";
    this.alarmOsc.frequency.value = 220;
    this.alarmGain = ctx.createGain();
    this.alarmGain.gain.value = 0;
    this.alarmOsc.connect(this.alarmGain).connect(this.master);
    this.alarmOsc.start();

    this.started = true;
  }

  // storm: 0..1 ; fans: array of {power} ; minEfficiency: 0..1 ; time
  update({ storm, fans, minEfficiency, time }) {
    if (!this.started || this.unavailable) return;
    const t = this.ctx.currentTime;
    this.windGain.gain.setTargetAtTime(0.05 + storm * 0.32, t, 0.2);
    this.windFilter.frequency.setTargetAtTime(320 + storm * 700, t, 0.3);

    fans.forEach((fan, i) => {
      const gain = this.fanGains[i];
      if (gain) gain.gain.setTargetAtTime(fan.power * 0.05, t, 0.15);
      const osc = this.fanOscs[i];
      if (osc) {
        const load = 60 + fan.power * 90 + Math.abs(fan.angle) * 40;
        osc.frequency.setTargetAtTime(load, t, 0.2);
      }
    });

    // Alarm stays silent while clean, then pulses with the worst intake.
    const danger = Math.max(0, (0.75 - minEfficiency) / 0.75);
    const pulse = 0.5 + 0.5 * Math.sin(time * 6);
    this.alarmGain.gain.setTargetAtTime(danger * (0.04 + pulse * 0.12), t, 0.08);
    this.alarmOsc.frequency.setTargetAtTime(180 + danger * 260, t, 0.2);
  }

  stop() {
    if (this.ctx) this.ctx.close();
    this.ctx = null;
    this.started = false;
  }
}
