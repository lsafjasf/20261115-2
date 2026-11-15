import { MAX_SPEED, TENSION_BREAK_MIN } from './config.js';

// Web Audio 电机声：振荡器频率随卷速变化，张力越高噪声与告警越明显
export class MachineAudio {
  constructor() {
    this.ctx = null;
    this.osc = null;
    this.gain = null;
    this.noiseGain = null;
    this.alarm = null;
    this.running = false;
  }

  ensureContext() {
    if (this.ctx) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new Ctx();

    this.gain = this.ctx.createGain();
    this.gain.gain.value = 0;
    this.gain.connect(this.ctx.destination);

    this.osc = this.ctx.createOscillator();
    this.osc.type = 'sawtooth';
    this.osc.frequency.value = 60;
    this.osc.connect(this.gain);
    this.osc.start();

    // 机械噪声（缓冲白噪声 + 带通滤波）
    const bufferSize = this.ctx.sampleRate * 2;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 800;
    this.noiseGain = this.ctx.createGain();
    this.noiseGain.gain.value = 0;
    noise.connect(filter);
    filter.connect(this.noiseGain);
    this.noiseGain.connect(this.ctx.destination);
    noise.start();

    // 高张力间歇告警
    this.alarm = this.ctx.createOscillator();
    this.alarm.type = 'square';
    this.alarm.frequency.value = 880;
    this.alarmGain = this.ctx.createGain();
    this.alarmGain.gain.value = 0;
    this.alarm.connect(this.alarmGain);
    this.alarmGain.connect(this.ctx.destination);
    this.alarm.start();
  }

  async start() {
    this.ensureContext();
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    this.running = true;
  }

  stop() {
    this.running = false;
    if (!this.ctx) return;
    this.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.08);
    this.noiseGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.08);
    this.alarmGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
  }

  update(speed, tension, machineRunning) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (!machineRunning || speed <= 0) {
      this.stop();
      return;
    }
    const ratio = speed / MAX_SPEED;
    // 卷速 0-300 对应电机音 55-320 Hz
    const freq = 55 + ratio * 265;
    this.osc.frequency.setTargetAtTime(freq, now, 0.1);
    this.gain.gain.setTargetAtTime(0.05 + ratio * 0.07, now, 0.1);
    // 噪声随张力上升
    const tensionRatio = Math.max(0, tension - 40) / 60;
    this.noiseGain.gain.setTargetAtTime(0.01 + tensionRatio * 0.06, now, 0.15);
    // 进入危险张力区启动间歇告警
    if (tension >= TENSION_BREAK_MIN) {
      const pulse = Math.sin(now * 9) > 0 ? 0.045 : 0;
      this.alarmGain.gain.setTargetAtTime(pulse, now, 0.02);
    } else {
      this.alarmGain.gain.setTargetAtTime(0, now, 0.05);
    }
  }

  crash() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.stop();
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.5);
    g.gain.setValueAtTime(0.18, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
    osc.connect(g);
    g.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.65);
  }
}
