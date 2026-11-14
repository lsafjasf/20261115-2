export class AudioEngine {
  constructor() {
    this.context = null;
    this.master = null;
    this.noiseBuffer = null;
    this.voiceCount = 0;
    this.ready = false;
    this.paused = false;
  }

  async connect() {
    if (!this.context) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      this.context = new AudioContextClass({ latencyHint: "interactive" });
      this.master = this.context.createGain();
      this.master.gain.value = 0.82;
      this.master.connect(this.context.destination);
      this.noiseBuffer = this.createNoiseBuffer(0.32);
    }

    await this.context.resume();
    this.ready = true;
    this.paused = false;
    this.master.gain.cancelScheduledValues(this.context.currentTime);
    this.master.gain.setTargetAtTime(0.82, this.context.currentTime, 0.025);
  }

  createNoiseBuffer(seconds) {
    const length = Math.max(1, Math.floor(this.context.sampleRate * seconds));
    const buffer = this.context.createBuffer(1, length, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let index = 0; index < length; index += 1) {
      const white = Math.random() * 2 - 1;
      last = last * 0.82 + white * 0.18;
      data[index] = last;
    }
    return buffer;
  }

  get now() {
    return this.context?.currentTime ?? 0;
  }

  get audioState() {
    return this.context?.state ?? "offline";
  }

  get masterValue() {
    return this.master?.gain.value ?? 0;
  }

  trackVoice(source) {
    this.voiceCount += 1;
    source.addEventListener(
      "ended",
      () => {
        this.voiceCount = Math.max(0, this.voiceCount - 1);
      },
      { once: true },
    );
  }

  makeOscillator(type, frequency, when, duration, gainValue, destination = this.master) {
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, when);
    gain.gain.setValueAtTime(Math.max(0.0001, gainValue), when);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
    oscillator.connect(gain);
    gain.connect(destination);
    oscillator.start(when);
    oscillator.stop(when + duration + 0.02);
    this.trackVoice(oscillator);
    return { oscillator, gain };
  }

  scheduleTick(when, accent = false) {
    if (!this.ready || !this.context) return;
    const frequency = accent ? 1180 : 760;
    this.makeOscillator("square", frequency, when, accent ? 0.055 : 0.035, accent ? 0.045 : 0.025);
    this.makeOscillator("sine", accent ? 320 : 210, when, 0.08, accent ? 0.035 : 0.018);
  }

  scheduleTargetPing(when) {
    if (!this.ready || !this.context) return;
    this.makeOscillator("sine", 1040, when, 0.07, 0.018);
    this.makeOscillator("triangle", 520, when, 0.13, 0.012);
  }

  playBassPulse(frequency, volume) {
    if (!this.ready || !this.context || this.paused) return;
    const now = this.context.currentTime + 0.006;
    const normalizedVolume = Math.max(0.2, Math.min(0.9, volume / 100));
    const { oscillator, gain } = this.makeOscillator(
      "triangle",
      frequency,
      now,
      0.34,
      0.035 + normalizedVolume * 0.13,
    );
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(28, frequency * 0.74), now + 0.24);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.03 + normalizedVolume * 0.16, now + 0.018);

    const sub = this.makeOscillator("sine", frequency * 0.5, now + 0.012, 0.42, 0.018);
    sub.oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, frequency * 0.38), now + 0.3);

    const noise = this.context.createBufferSource();
    const noiseGain = this.context.createGain();
    noise.buffer = this.noiseBuffer;
    noiseGain.gain.setValueAtTime(0.018, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.11);
    noise.connect(noiseGain);
    noiseGain.connect(this.master);
    noise.start(now);
    noise.stop(now + 0.13);
    this.trackVoice(noise);
  }

  playLampChime(index) {
    if (!this.ready || !this.context || this.paused) return;
    const base = [590, 735, 905][index] ?? 735;
    const now = this.context.currentTime + 0.006;
    this.makeOscillator("sine", base, now, 0.19, 0.025);
    this.makeOscillator("triangle", base * 1.9, now + 0.012, 0.12, 0.012);
  }

  playLockSweep() {
    if (!this.ready || !this.context || this.paused) return;
    const now = this.context.currentTime + 0.005;
    const oscillator = this.makeOscillator("sine", 280, now, 0.28, 0.018).oscillator;
    oscillator.frequency.exponentialRampToValueAtTime(1280, now + 0.2);
  }

  playAlarm() {
    if (!this.ready || !this.context || this.paused) return;
    const now = this.context.currentTime + 0.005;
    for (let index = 0; index < 3; index += 1) {
      const start = now + index * 0.105;
      const oscillator = this.context.createOscillator();
      const gain = this.context.createGain();
      oscillator.type = "sawtooth";
      oscillator.frequency.setValueAtTime(235 - index * 24, start);
      oscillator.frequency.exponentialRampToValueAtTime(92, start + 0.085);
      gain.gain.setValueAtTime(0.055, start);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.09);
      oscillator.connect(gain);
      gain.connect(this.master);
      oscillator.start(start);
      oscillator.stop(start + 0.1);
      this.trackVoice(oscillator);
    }
  }

  playOffbeat() {
    if (!this.ready || !this.context || this.paused) return;
    const now = this.context.currentTime + 0.003;
    this.makeOscillator("square", 150, now, 0.045, 0.018);
  }

  async pause() {
    if (!this.context || this.paused) return;
    this.paused = true;
    this.master.gain.cancelScheduledValues(this.context.currentTime);
    this.master.gain.value = 0;
    await this.context.suspend();
  }

  async resume() {
    if (!this.context || !this.paused) return;
    this.master.gain.value = 0;
    await this.context.resume();
    this.paused = false;
    this.master.gain.value = 0.82;
  }

  async close() {
    if (!this.context) return;
    await this.context.close();
    this.context = null;
    this.master = null;
    this.ready = false;
  }

  debug() {
    return {
      state: this.audioState,
      currentTime: this.now,
      masterGain: this.masterValue,
      voices: this.voiceCount,
      ready: this.ready,
      paused: this.paused,
    };
  }
}
