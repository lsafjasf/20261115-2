export class RescueAudio {
  constructor() {
    this.context = null;
    this.master = null;
    this.motor = null;
    this.motorGain = null;
    this.reel = null;
    this.reelGain = null;
    this.wind = null;
    this.windGain = null;
    this.warning = null;
    this.warningGain = null;
    this.enabled = true;
    this.warningActive = false;
    this.currentTension = 0;
  }

  async unlock() {
    if (!this.enabled) return false;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return false;
    try {
      if (!this.context) {
        this.context = new AudioContextClass();
        this.build();
      }
      if (this.context.state === "suspended") await this.context.resume();
      return this.context.state === "running";
    } catch {
      return false;
    }
  }

  build() {
    const ctx = this.context;
    this.master = ctx.createGain();
    this.master.gain.value = this.enabled ? 0.65 : 0;
    this.master.connect(ctx.destination);

    this.motor = ctx.createOscillator();
    this.motor.type = "sawtooth";
    this.motor.frequency.value = 51;
    this.motorGain = ctx.createGain();
    this.motorGain.gain.value = 0.012;
    const motorFilter = ctx.createBiquadFilter();
    motorFilter.type = "lowpass";
    motorFilter.frequency.value = 240;
    motorFilter.Q.value = 0.7;
    this.motor.connect(motorFilter).connect(this.motorGain).connect(this.master);
    this.motor.start();

    this.reel = ctx.createOscillator();
    this.reel.type = "triangle";
    this.reel.frequency.value = 82;
    this.reelGain = ctx.createGain();
    this.reelGain.gain.value = 0.004;
    this.reel.connect(this.reelGain).connect(this.master);
    this.reel.start();

    this.warning = ctx.createOscillator();
    this.warning.type = "square";
    this.warning.frequency.value = 690;
    this.warningGain = ctx.createGain();
    this.warningGain.gain.value = 0;
    this.warning.connect(this.warningGain).connect(this.master);
    this.warning.start();

    const noiseLength = Math.max(1, Math.floor(ctx.sampleRate * 2.4));
    const buffer = ctx.createBuffer(1, noiseLength, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let state = 0x12345678;
    for (let i = 0; i < data.length; i += 1) {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      data[i] = ((state >>> 0) / 0xffffffff) * 2 - 1;
    }
    const windSource = ctx.createBufferSource();
    windSource.buffer = buffer;
    windSource.loop = true;
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = "bandpass";
    windFilter.frequency.value = 420;
    windFilter.Q.value = 0.9;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0.018;
    windSource.connect(windFilter).connect(this.windGain).connect(this.master);
    windSource.start();
    this.wind = windSource;
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    if (this.master) {
      this.master.gain.setTargetAtTime(enabled ? 0.65 : 0, this.context.currentTime, 0.08);
    }
    if (!enabled) this.warningActive = false;
  }

  update(tension, danger, dt = 0.016) {
    this.currentTension = tension;
    if (!this.context || !this.master || !this.enabled) return;
    const now = this.context.currentTime;
    const load = Math.max(0, Math.min(1, tension / 100));
    const motorFreq = 46 + load * 105;
    this.motor.frequency.setTargetAtTime(motorFreq, now, 0.06);
    this.motorGain.gain.setTargetAtTime(0.010 + load * 0.042, now, 0.06);
    this.reel.frequency.setTargetAtTime(72 + load * 190, now, 0.05);
    this.reelGain.gain.setTargetAtTime(0.003 + load * 0.018, now, 0.05);
    this.windGain.gain.setTargetAtTime(0.012 + Math.min(load, 0.5) * 0.022, now, 0.2);

    const shouldWarn = danger && load > 0.78;
    if (shouldWarn !== this.warningActive) {
      this.warningActive = shouldWarn;
      this.warning.frequency.setTargetAtTime(danger ? 760 : 610, now, 0.03);
      this.warningGain.gain.setTargetAtTime(shouldWarn ? 0.035 : 0, now, 0.04);
    } else if (shouldWarn) {
      this.warningGain.gain.setTargetAtTime(0.025 + Math.sin(now * 12) * 0.012, now, 0.03);
    }
  }

  tone(frequency, duration, level = 0.05, type = "sine") {
    if (!this.context || !this.enabled || !this.master) return;
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    const now = this.context.currentTime;
    osc.type = type;
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(level, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain).connect(this.master);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  event(type) {
    if (!this.context || !this.enabled) return;
    if (type === "anchor") this.tone(290, 0.24, 0.05, "triangle");
    if (type === "safe") {
      this.tone(520, 0.26, 0.045);
      setTimeout(() => this.tone(780, 0.42, 0.038), 150);
    }
    if (type === "warning") {
      this.tone(240, 0.18, 0.035, "square");
      setTimeout(() => this.tone(212, 0.2, 0.03, "square"), 220);
    }
    if (type === "lost" || type === "danger") this.tone(115, 0.7, 0.07, "sawtooth");
    if (type === "won") {
      this.tone(420, 0.5, 0.05);
      setTimeout(() => this.tone(660, 0.6, 0.045), 210);
      setTimeout(() => this.tone(880, 0.8, 0.04), 430);
    }
  }

  snap() {
    if (!this.context || !this.enabled) return;
    const now = this.context.currentTime;
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(210, now);
    osc.frequency.exponentialRampToValueAtTime(38, now + 0.25);
    gain.gain.setValueAtTime(0.09, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
    osc.connect(gain).connect(this.master);
    osc.start(now);
    osc.stop(now + 0.33);
    this.tone(70, 0.38, 0.06, "triangle");
  }
}
