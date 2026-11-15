import { CABLE_BREAK } from './sim.js';

// Web Audio：发动机循环音 + 缆绳张力嗡鸣 + 风噪声 + 事件音效
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.engine = null;
    this.engineGain = null;
    this.tensionOsc = null;
    this.tensionGain = null;
    this.windNoise = null;
    this.windGain = null;
    this.started = false;
  }

  start() {
    if (this.started) {
      this.ctx.resume();
      return;
    }
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AudioCtx();
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.7;
    this.master.connect(ctx.destination);

    // 发动机：锯齿波 + 低通，随油门变调
    this.engine = ctx.createOscillator();
    this.engine.type = 'sawtooth';
    this.engine.frequency.value = 55;
    const engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 320;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0.0;
    this.engine.connect(engineFilter).connect(this.engineGain).connect(this.master);
    this.engine.start();

    // 张力：正弦嗡鸣，频率/音量随张力上升
    this.tensionOsc = ctx.createOscillator();
    this.tensionOsc.type = 'sine';
    this.tensionOsc.frequency.value = 120;
    this.tensionGain = ctx.createGain();
    this.tensionGain.gain.value = 0;
    this.tensionOsc.connect(this.tensionGain).connect(this.master);
    this.tensionOsc.start();

    // 风：白噪声经带通滤波，阵风时起伏
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    this.windNoise = ctx.createBufferSource();
    this.windNoise.buffer = buffer;
    this.windNoise.loop = true;
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 480;
    windFilter.Q.value = 0.6;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0.05;
    this.windNoise.connect(windFilter).connect(this.windGain).connect(this.master);
    this.windNoise.start();

    this.started = true;
  }

  update(world) {
    if (!this.started) return;
    const t = this.ctx.currentTime;
    const throttle = Math.abs(world.boat.throttle);
    const speed = Math.hypot(world.boat.vx, world.boat.vy);
    const towed = world.cable.attached ? 1 : 0;
    this.engine.frequency.setTargetAtTime(48 + throttle * 90 + speed * 0.25, t, 0.08);
    this.engineGain.gain.setTargetAtTime(0.035 + throttle * 0.07, t, 0.1);

    const ratio = Math.min(1, world.cable.tension / CABLE_BREAK);
    this.tensionOsc.frequency.setTargetAtTime(110 + ratio * 320, t, 0.05);
    this.tensionGain.gain.setTargetAtTime(ratio * 0.16, t, 0.05);

    const gust = world.wind ? 0.03 + Math.min(0.12, world.wind.base / 900) : 0.05;
    this.windGain.gain.setTargetAtTime(gust, t, 0.3);
  }

  playEvent(type) {
    if (!this.started) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const blip = (freq, dur, gainValue, wave = 'triangle', slideTo = null) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = wave;
      osc.frequency.setValueAtTime(freq, now);
      if (slideTo !== null) osc.frequency.exponentialRampToValueAtTime(slideTo, now + dur);
      g.gain.setValueAtTime(gainValue, now);
      g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
      osc.connect(g).connect(this.master);
      osc.start(now);
      osc.stop(now + dur + 0.02);
    };
    switch (type) {
      case 'attach':
        blip(300, 0.12, 0.18, 'square', 420);
        break;
      case 'detach':
        blip(420, 0.1, 0.12, 'square', 260);
        break;
      case 'snag':
        blip(180, 0.35, 0.25, 'sawtooth', 70);
        break;
      case 'unsnag':
        blip(240, 0.2, 0.16, 'triangle', 520);
        break;
      case 'dock':
        blip(520, 0.18, 0.2, 'triangle', 780);
        setTimeout(() => blip(780, 0.22, 0.18, 'triangle', 1040), 120);
        break;
      case 'break':
        blip(420, 0.6, 0.3, 'sawtooth', 60);
        break;
      case 'win':
        [523, 659, 784, 1046].forEach((f, i) =>
          setTimeout(() => blip(f, 0.25, 0.2, 'triangle'), i * 150));
        break;
      default:
        break;
    }
  }
}
