const SPEED_SETTINGS = {
  0: { hum: 44, motor: 76, noise: 0.006, filter: 240, drive: 0.01 },
  1: { hum: 58, motor: 112, noise: 0.035, filter: 520, drive: 0.034 },
  2: { hum: 72, motor: 154, noise: 0.058, filter: 880, drive: 0.052 },
  3: { hum: 91, motor: 206, noise: 0.082, filter: 1450, drive: 0.074 }
};

export class PrintAudio {
  constructor() {
    this.ctx = null;
    this.enabled = false;
    this.currentSpeed = 0;
    this.pressState = "idle";
    this.master = null;
    this.hum = null;
    this.humGain = null;
    this.motor = null;
    this.motorGain = null;
    this.noise = null;
    this.noiseGain = null;
    this.filter = null;
  }

  async enable() {
    if (!this.ctx) this._build();
    if (!this.ctx) return false;
    if (this.ctx.state === "suspended") await this.ctx.resume();
    this.enabled = true;
    this.master.gain.setTargetAtTime(1, this.ctx.currentTime, 0.05);
    this._applyMachineSound();
    return true;
  }

  async disable() {
    this.enabled = false;
    if (!this.ctx) return;
    this.master.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.06);
    await this.ctx.suspend();
  }

  async toggle() {
    if (this.enabled) {
      await this.disable();
      return false;
    }
    return this.enable();
  }

  _build() {
    const AudioCtor = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AudioCtor) return;
    this.ctx = new AudioCtor();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.0001;
    const compressor = this.ctx.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.knee.value = 18;
    compressor.ratio.value = 5;
    compressor.attack.value = 0.04;
    compressor.release.value = 0.28;
    this.master.connect(compressor).connect(this.ctx.destination);

    this.hum = this.ctx.createOscillator();
    this.hum.type = "sawtooth";
    this.hum.frequency.value = SPEED_SETTINGS[0].hum;
    this.humGain = this.ctx.createGain();
    this.humGain.gain.value = 0.009;
    const humFilter = this.ctx.createBiquadFilter();
    humFilter.type = "lowpass";
    humFilter.frequency.value = 190;
    this.hum.connect(humFilter).connect(this.humGain).connect(this.master);

    this.motor = this.ctx.createOscillator();
    this.motor.type = "triangle";
    this.motor.frequency.value = SPEED_SETTINGS[0].motor;
    this.motorGain = this.ctx.createGain();
    this.motorGain.gain.value = 0.006;
    this.motor.connect(this.motorGain).connect(this.master);

    this.noise = this.ctx.createBufferSource();
    this.noise.buffer = this._makeNoiseBuffer();
    this.noise.loop = true;
    this.filter = this.ctx.createBiquadFilter();
    this.filter.type = "bandpass";
    this.filter.frequency.value = SPEED_SETTINGS[0].filter;
    this.filter.Q.value = 0.72;
    this.noiseGain = this.ctx.createGain();
    this.noiseGain.gain.value = SPEED_SETTINGS[0].noise;
    this.noise.connect(this.filter).connect(this.noiseGain).connect(this.master);

    this.hum.start();
    this.motor.start();
    this.noise.start();
  }

  _makeNoiseBuffer() {
    const length = Math.floor(this.ctx.sampleRate * 1.2);
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let previous = 0;
    for (let index = 0; index < length; index += 1) {
      const white = Math.random() * 2 - 1;
      previous = previous * 0.78 + white * 0.22;
      data[index] = previous;
    }
    return buffer;
  }

  setMachine(speed, pressState = "idle") {
    this.currentSpeed = Math.max(0, Math.min(3, Number(speed) || 0));
    this.pressState = pressState;
    this._applyMachineSound();
  }

  _applyMachineSound() {
    if (!this.ctx || !this.enabled) return;
    const level = this.pressState === "printing" ? this.currentSpeed : 0;
    const setting = SPEED_SETTINGS[level];
    const now = this.ctx.currentTime;
    const running = this.pressState === "printing";
    this.hum.frequency.setTargetAtTime(setting.hum, now, 0.16);
    this.motor.frequency.setTargetAtTime(setting.motor, now, 0.13);
    this.filter.frequency.setTargetAtTime(setting.filter, now, 0.18);
    this.humGain.gain.setTargetAtTime(running ? 0.009 + setting.drive * 0.36 : 0.009, now, 0.12);
    this.motorGain.gain.setTargetAtTime(running ? 0.006 + setting.drive : 0.006, now, 0.1);
    this.noiseGain.gain.setTargetAtTime(running ? setting.noise : 0.006, now, 0.11);
  }

  _tone(frequency, duration = 0.12, type = "sine", volume = 0.05, delay = 0) {
    if (!this.ctx || !this.enabled) return;
    const start = this.ctx.currentTime + delay;
    const oscillator = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(volume, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain).connect(this.master);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.03);
  }

  click() {
    this._tone(640, 0.055, "square", 0.022);
  }

  alert() {
    this._tone(190, 0.18, "square", 0.085);
    this._tone(145, 0.24, "square", 0.07, 0.2);
  }

  switchPaper() {
    this._tone(320, 0.11, "triangle", 0.045);
    this._tone(510, 0.14, "triangle", 0.04, 0.1);
  }

  success() {
    [392, 494, 587, 784].forEach((frequency, index) => {
      this._tone(frequency, 0.26, "sine", 0.04, index * 0.12);
    });
  }

  scrape() {
    this._tone(110, 0.34, "sawtooth", 0.075);
    this._tone(82, 0.2, "square", 0.035, 0.16);
  }

  debugInfo() {
    return {
      enabled: this.enabled,
      contextState: this.ctx?.state || "uninitialized",
      speed: this.currentSpeed,
      pressState: this.pressState,
      humFrequency: this.hum?.frequency.value || 0,
      noiseGain: this.noiseGain?.gain.value || 0
    };
  }
}
