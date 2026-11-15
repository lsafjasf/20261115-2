// Web Audio：程序化海浪与轮轨声，随潮位和列车状态实时变化
export class RailwayAudio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.oceanGain = null;
    this.oceanFilter = null;
    this.railGain = null;
    this.railOsc = null;
    this.noiseBuffer = null;
    this.muted = false;
  }

  ensure() {
    if (this.ctx) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(this.ctx.destination);

    // 共享白噪声缓冲
    const len = this.ctx.sampleRate * 2;
    this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    this.buildOcean();
    this.buildRail();
  }

  buildOcean() {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    // 低通滤波模拟海浪隆隆声
    this.oceanFilter = this.ctx.createBiquadFilter();
    this.oceanFilter.type = 'lowpass';
    this.oceanFilter.frequency.value = 420;
    this.oceanGain = this.ctx.createGain();
    this.oceanGain.gain.value = 0.0;
    src.connect(this.oceanFilter).connect(this.oceanGain).connect(this.master);
    src.start();

    // 缓慢 LFO 制造浪涌起伏
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 0.12;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 0.05;
    lfo.connect(lfoGain).connect(this.oceanGain.gain);
    lfo.start();
  }

  buildRail() {
    // 轮轨节奏：带通噪声，频率随速度变化
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const band = this.ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 900;
    band.Q.value = 1.4;
    this.railFilter = band;
    this.railGain = this.ctx.createGain();
    this.railGain.gain.value = 0;
    src.connect(band).connect(this.railGain).connect(this.master);
    src.start();
  }

  resume() {
    this.ensure();
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  // 每帧根据仿真状态更新音量与滤波
  update(game) {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    // 潮位越高，海浪越响、滤波截止频率越高（浪更急）
    const level = Math.max(0, game.waterLevel);
    const oceanVol = Math.min(0.22, 0.03 + level * 0.06);
    this.oceanGain.gain.setTargetAtTime(oceanVol, now, 0.4);
    this.oceanFilter.frequency.setTargetAtTime(320 + level * 160, now, 0.5);

    // 轮轨：按在跑列车的平均速度与数量
    const moving = game.trains.filter((t) => t.status === 'running' || t.status === 'blocked');
    const avgSpeed = moving.length
      ? moving.reduce((s, t) => s + t.speed, 0) / moving.length
      : 0;
    const railVol = moving.length ? Math.min(0.14, (avgSpeed / 26) * 0.05 + 0.012) * moving.length : 0;
    this.railGain.gain.setTargetAtTime(railVol, now, 0.25);
    this.railFilter.frequency.setTargetAtTime(500 + avgSpeed * 55, now, 0.3);
  }

  crash() {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.9);
    gain.gain.setValueAtTime(0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 1);
    osc.connect(gain).connect(this.master);
    osc.start(now);
    osc.stop(now + 1.05);
  }

  success() {
    if (!this.ctx || this.muted) return;
    const notes = [523.25, 659.25, 783.99];
    notes.forEach((freq, i) => {
      const now = this.ctx.currentTime + i * 0.18;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.22, now + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
      osc.connect(gain).connect(this.master);
      osc.start(now);
      osc.stop(now + 0.4);
    });
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.55;
    return this.muted;
  }
}
