export class MoonAudio {
  constructor() {
    this.context = null;
    this.master = null;
    this.ambient = null;
    this.pumpGain = null;
    this.pumpLfoDepth = null;
    this.humGain = null;
    this.muted = false;
    this.pumpOn = true;
  }

  async ensureStarted() {
    if (!this.context) this.createGraph();
    if (this.context.state === "suspended") await this.context.resume();
    return this.context;
  }

  createGraph() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      this.context = null;
      return;
    }

    const context = new AudioContextClass();
    this.context = context;
    this.master = context.createGain();
    this.master.gain.value = this.muted ? 0 : 0.55;
    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -22;
    compressor.knee.value = 18;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.01;
    compressor.release.value = 0.3;
    this.master.connect(compressor);
    compressor.connect(context.destination);

    this.ambient = context.createGain();
    this.ambient.gain.value = 0.055;
    this.ambient.connect(this.master);

    this.createNoiseBed(context);
    this.createDrone(context);
    this.createPump(context);
  }

  createNoiseBed(context) {
    const length = context.sampleRate * 3;
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i += 1) {
      const white = Math.random() * 2 - 1;
      last = last * 0.985 + white * 0.015;
      data[i] = last * 3.2;
    }

    const noise = context.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;
    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 380;
    filter.Q.value = 0.8;
    const noiseGain = context.createGain();
    noiseGain.gain.value = 0.16;

    const lfo = context.createOscillator();
    const lfoGain = context.createGain();
    lfo.frequency.value = 0.07;
    lfoGain.gain.value = 0.045;
    lfo.connect(lfoGain);
    lfoGain.connect(noiseGain.gain);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.ambient);
    noise.start();
    lfo.start();
  }

  createDrone(context) {
    this.humGain = context.createGain();
    this.humGain.gain.value = 0.012;
    this.humGain.connect(this.ambient);

    const drone = context.createOscillator();
    drone.type = "sine";
    drone.frequency.value = 54;
    drone.connect(this.humGain);
    drone.start();

    const filter = context.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 220;
    filter.Q.value = 4;
    const harmonicGain = context.createGain();
    harmonicGain.gain.value = 0.006;
    const harmonic = context.createOscillator();
    harmonic.type = "triangle";
    harmonic.frequency.value = 110.4;
    harmonic.connect(filter);
    filter.connect(harmonicGain);
    harmonicGain.connect(this.ambient);
    harmonic.start();

    const slowLfo = context.createOscillator();
    const slowDepth = context.createGain();
    slowLfo.frequency.value = 0.045;
    slowDepth.gain.value = 0.003;
    slowLfo.connect(slowDepth);
    slowDepth.connect(harmonicGain.gain);
    slowLfo.start();
  }

  createPump(context) {
    this.pumpGain = context.createGain();
    this.pumpGain.gain.value = this.pumpOn ? 0.022 : 0;
    this.pumpGain.connect(this.master);

    const lowpass = context.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.value = 310;
    lowpass.Q.value = 1.2;
    lowpass.connect(this.pumpGain);

    const pumpOsc = context.createOscillator();
    pumpOsc.type = "sawtooth";
    pumpOsc.frequency.value = 72;
    const motorGain = context.createGain();
    motorGain.gain.value = 0.35;
    pumpOsc.connect(motorGain);
    motorGain.connect(lowpass);
    pumpOsc.start();

    const upperOsc = context.createOscillator();
    upperOsc.type = "triangle";
    upperOsc.frequency.value = 144;
    const upperGain = context.createGain();
    upperGain.gain.value = 0.11;
    upperOsc.connect(upperGain);
    upperGain.connect(lowpass);
    upperOsc.start();

    this.pumpLfoDepth = context.createGain();
    this.pumpLfoDepth.gain.value = this.pumpOn ? 0.009 : 0;
    this.pumpLfoDepth.connect(this.pumpGain.gain);
    const lfo = context.createOscillator();
    lfo.frequency.value = 2.7;
    lfo.connect(this.pumpLfoDepth);
    lfo.start();
  }

  setPump(active) {
    this.pumpOn = Boolean(active);
    if (!this.context || !this.pumpGain) return;
    const now = this.context.currentTime;
    this.pumpGain.gain.setTargetAtTime(this.pumpOn ? 0.022 : 0, now, 0.12);
    this.pumpLfoDepth.gain.setTargetAtTime(this.pumpOn ? 0.009 : 0, now, 0.16);
  }

  setMuted(muted) {
    this.muted = Boolean(muted);
    if (!this.context || !this.master) return;
    this.master.gain.setTargetAtTime(this.muted ? 0 : 0.55, this.context.currentTime, 0.1);
  }

  setTemperature(tempC) {
    if (!this.context || !this.humGain) return;
    const intensity = Math.min(1, Math.max(0, (tempC - 21) / 16));
    this.humGain.gain.setTargetAtTime(0.012 + intensity * 0.012, this.context.currentTime, 1.2);
  }

  async playWarning() {
    if (!this.context || this.muted) return;
    const now = this.context.currentTime;
    for (let i = 0; i < 2; i += 1) {
      this.tone(470 + i * 105, 0.16, "square", 0.022, now + i * 0.22, -35);
    }
  }

  async playHarvest() {
    if (!this.context || this.muted) return;
    const now = this.context.currentTime;
    this.tone(392, 0.35, "sine", 0.032, now, 18);
    this.tone(523.25, 0.5, "sine", 0.026, now + 0.12, 12);
    this.tone(659.25, 0.65, "triangle", 0.018, now + 0.24, 8);
  }

  async playPlant() {
    if (!this.context || this.muted) return;
    const now = this.context.currentTime;
    this.tone(92, 0.38, "sine", 0.035, now, -24);
    this.tone(146.8, 0.25, "triangle", 0.012, now + 0.05, 20);
  }

  playCritical() {
    if (!this.context || this.muted) return;
    const now = this.context.currentTime;
    this.tone(196, 0.5, "sawtooth", 0.012, now, -30);
    this.tone(185, 0.5, "sawtooth", 0.009, now + 0.6, -25);
  }

  tone(frequency, duration, type, volume, startAt, slide = 0) {
    const context = this.context;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, startAt);
    oscillator.frequency.linearRampToValueAtTime(Math.max(30, frequency + slide), startAt + duration);
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(volume, startAt + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
    oscillator.connect(gain);
    gain.connect(this.master);
    oscillator.start(startAt);
    oscillator.stop(startAt + duration + 0.03);
  }
}
