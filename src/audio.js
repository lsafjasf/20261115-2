// Web Audio：根据气体流量实时合成声音，不依赖音频素材。
// 供氧气流：白噪声经带通滤波；泄压气流：高通白噪声 + 音高随流量变化；
// 紧急封闭：低频振荡器驱动的双音警报。

export class FlowAudio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.supplyGain = null;
    this.ventGain = null;
    this.alarmGain = null;
    this.alarmOsc = null;
    this.muted = false;
  }

  // 浏览器要求在用户手势中创建 / 恢复 AudioContext
  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9;
    this.master.connect(this.ctx.destination);

    const bufferSize = 2 * this.ctx.sampleRate;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i += 1) data[i] = Math.random() * 2 - 1;

    this.supplyGain = this._makeNoiseChannel(noiseBuffer, 700, 1.2);
    this.ventGain = this._makeNoiseChannel(noiseBuffer, 2400, 0.7);
    this.ventFilter = this.ventGain._filter;

    this.alarmOsc = this.ctx.createOscillator();
    this.alarmOsc.type = 'square';
    this.alarmOsc.frequency.value = 440;
    this.alarmGain = this.ctx.createGain();
    this.alarmGain.gain.value = 0;
    this.alarmOsc.connect(this.alarmGain).connect(this.master);
    this.alarmOsc.start();
  }

  _makeNoiseChannel(noiseBuffer, filterFreq, q) {
    const src = this.ctx.createBufferSource();
    src.buffer = noiseBuffer;
    src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = filterFreq;
    filter.Q.value = q;
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    gain._filter = filter;
    src.connect(filter).connect(gain).connect(this.master);
    src.start();
    return gain;
  }

  // inflow / outflow 单位 kPa/s，最大约 10
  update(inflow, outflow, sealed) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const supplyLevel = Math.min(1, inflow / 10) * 0.22;
    const ventLevel = Math.min(1, outflow / 10) * 0.28;
    this.supplyGain.gain.setTargetAtTime(supplyLevel, t, 0.08);
    this.ventGain.gain.setTargetAtTime(ventLevel, t, 0.08);
    this.ventFilter.frequency.setTargetAtTime(1800 + outflow * 260, t, 0.1);

    const alarmTarget = sealed ? 0.12 : 0;
    this.alarmGain.gain.setTargetAtTime(alarmTarget, t, 0.05);
    if (sealed) {
      // 在 440 / 660 Hz 之间交替，形成双音警报
      const phase = Math.floor(t * 1.5) % 2;
      this.alarmOsc.frequency.setTargetAtTime(phase ? 660 : 440, t, 0.02);
    }
  }

  click() {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = 320;
    gain.gain.setValueAtTime(0.08, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.08);
    osc.connect(gain).connect(this.master);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.1);
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : 0.9;
  }
}
