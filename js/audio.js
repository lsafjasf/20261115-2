// audio.js — Web Audio：电机音调随转动速度变化，另有倾斜告警与事件反馈

export class StageAudio {
  constructor() {
    this.ctx = null;
    this.enabled = true;
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new Ctx();
    const ctx = this.ctx;

    this.master = ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(ctx.destination);

    // 电机：锯齿波 + 低通，频率映射角速度
    this.motorOsc = ctx.createOscillator();
    this.motorOsc.type = 'sawtooth';
    this.motorOsc.frequency.value = 55;
    this.motorFilter = ctx.createBiquadFilter();
    this.motorFilter.type = 'lowpass';
    this.motorFilter.frequency.value = 400;
    this.motorGain = ctx.createGain();
    this.motorGain.gain.value = 0;
    this.motorOsc.connect(this.motorFilter).connect(this.motorGain).connect(this.master);
    this.motorOsc.start();

    // 倾斜告警：方波 LFO 调制的警示音
    this.alarmOsc = ctx.createOscillator();
    this.alarmOsc.type = 'square';
    this.alarmOsc.frequency.value = 220;
    this.alarmGain = ctx.createGain();
    this.alarmGain.gain.value = 0;
    this.alarmOsc.connect(this.alarmGain).connect(this.master);
    this.alarmOsc.start();
  }

  setEnabled(on) {
    this.enabled = on;
    if (this.master) this.master.gain.value = on ? 0.5 : 0;
  }

  // omega: 当前角速度；tilt: 倾斜指标；cwMoving: 配重是否在滑动
  update(omega, tilt, tiltLimit, cwMoving) {
    if (!this.ctx || !this.enabled) return;
    const speed = Math.abs(omega);
    const now = this.ctx.currentTime;

    // 电机音量与频率：静止时近乎静音，速度越高音调越高
    const motorLevel = Math.min(0.16, speed * 0.22) + (cwMoving ? 0.03 : 0);
    this.motorGain.gain.setTargetAtTime(motorLevel, now, 0.08);
    const freq = 55 + speed * 320;
    this.motorOsc.frequency.setTargetAtTime(freq, now, 0.05);
    this.motorFilter.frequency.setTargetAtTime(300 + speed * 1400, now, 0.05);

    // 倾斜告警：接近限值时渐强，超限节奏更快
    const ratio = tilt / tiltLimit;
    const alarmLevel = ratio > 0.75 ? Math.min(0.12, (ratio - 0.75) * 0.5) : 0;
    this.alarmGain.gain.setTargetAtTime(alarmLevel, now, 0.1);
    this.alarmOsc.frequency.setTargetAtTime(180 + ratio * 160, now, 0.1);
  }

  blip(freq, duration = 0.18, type = 'sine', level = 0.25) {
    if (!this.ctx || !this.enabled) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(level, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain).connect(this.master);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  }

  shiftSuccess() {
    this.blip(523, 0.14, 'triangle', 0.28);
    setTimeout(() => this.blip(784, 0.22, 'triangle', 0.26), 130);
  }

  fail() {
    this.blip(140, 0.5, 'sawtooth', 0.3);
    setTimeout(() => this.blip(92, 0.6, 'sawtooth', 0.28), 180);
  }

  win() {
    [523, 659, 784, 1047].forEach((f, i) =>
      setTimeout(() => this.blip(f, 0.25, 'triangle', 0.26), i * 150));
  }
}
