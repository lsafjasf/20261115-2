export class SonarAudio {
  constructor() {
    this.context = null;
    this.master = null;
    this.noiseBuffer = null;
    this.ambientStarted = false;
  }

  get ready() {
    return Boolean(this.context && this.context.state === "running");
  }

  async start() {
    if (!this.context) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) throw new Error("Web Audio is not supported in this browser.");
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.gain.value = 0.82;
      const limiter = this.context.createDynamicsCompressor();
      limiter.threshold.value = -14;
      limiter.knee.value = 8;
      limiter.ratio.value = 8;
      this.master.connect(limiter);
      limiter.connect(this.context.destination);
      this.noiseBuffer = this.makeNoise(2.4);
      this.startAmbient();
    }
    if (this.context.state !== "running") await this.context.resume();
  }

  makeNoise(seconds) {
    const length = Math.floor(this.context.sampleRate * seconds);
    const buffer = this.context.createBuffer(1, length, this.context.sampleRate);
    const channel = buffer.getChannelData(0);
    let smooth = 0;
    for (let index = 0; index < length; index += 1) {
      smooth = smooth * 0.965 + (Math.random() * 2 - 1) * 0.035;
      channel[index] = smooth * 2.6;
    }
    return buffer;
  }

  startAmbient() {
    if (this.ambientStarted) return;
    this.ambientStarted = true;
    const source = this.context.createBufferSource();
    source.buffer = this.makeNoise(4.5);
    source.loop = true;
    const filter = this.context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 145;
    filter.Q.value = 0.7;
    const gain = this.context.createGain();
    gain.gain.value = 0.052;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    source.start();
  }

  transmit() {
    if (!this.ready) return;
    const now = this.context.currentTime;
    const osc = this.context.createOscillator();
    const upper = this.context.createOscillator();
    const gain = this.context.createGain();
    const filter = this.context.createBiquadFilter();
    osc.type = "sine";
    upper.type = "triangle";
    osc.frequency.setValueAtTime(610, now);
    osc.frequency.exponentialRampToValueAtTime(920, now + 0.34);
    upper.frequency.setValueAtTime(1220, now);
    upper.frequency.exponentialRampToValueAtTime(1840, now + 0.28);
    filter.type = "bandpass";
    filter.frequency.value = 760;
    filter.Q.value = 1.6;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.23, now + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.62);
    osc.connect(filter);
    upper.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    osc.start(now);
    upper.start(now);
    osc.stop(now + 0.68);
    upper.stop(now + 0.68);
  }

  scheduleEcho(contact) {
    if (!this.ready) return;
    const now = this.context.currentTime;
    const at = now + Math.max(0.04, contact.delay);
    const panner = this.context.createStereoPanner();
    panner.pan.setValueAtTime(Math.max(-1, Math.min(1, contact.pan)), at);
    const distanceGain = Math.max(0.28, 1 - contact.range / 92);
    const gain = this.context.createGain();
    gain.gain.value = distanceGain;
    panner.connect(gain);
    gain.connect(this.master);

    if (contact.kind === "beacon") {
      this.scheduleBeacon(at, contact.strength, panner);
    } else {
      this.scheduleObstacle(at, contact.strength, panner);
    }
    panner.channelCountMode = "explicit";
    panner.channelInterpretation = "speakers";
  }

  scheduleObstacle(at, strength, destination) {
    const duration = 0.52;
    const tone = this.context.createOscillator();
    const toneGain = this.context.createGain();
    const lowpass = this.context.createBiquadFilter();
    tone.type = "triangle";
    tone.frequency.setValueAtTime(330, at);
    tone.frequency.exponentialRampToValueAtTime(178, at + duration);
    lowpass.type = "lowpass";
    lowpass.frequency.value = 420;
    lowpass.Q.value = 1.2;
    toneGain.gain.setValueAtTime(0.0001, at);
    toneGain.gain.linearRampToValueAtTime(0.075 * strength, at + 0.016);
    toneGain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    tone.connect(lowpass);
    lowpass.connect(toneGain);
    toneGain.connect(destination);
    tone.start(at);
    tone.stop(at + duration + 0.02);

    const noise = this.context.createBufferSource();
    const noiseFilter = this.context.createBiquadFilter();
    const noiseGain = this.context.createGain();
    noise.buffer = this.noiseBuffer;
    noiseFilter.type = "bandpass";
    noiseFilter.frequency.value = 270;
    noiseFilter.Q.value = 2.8;
    noiseGain.gain.setValueAtTime(0.0001, at);
    noiseGain.gain.linearRampToValueAtTime(0.09 * strength, at + 0.012);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, at + 0.29);
    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(destination);
    noise.start(at, Math.random() * 1.5, 0.32);
  }

  scheduleBeacon(at, strength, destination) {
    const duration = 0.88;
    const fundamental = this.context.createOscillator();
    const harmonic = this.context.createOscillator();
    const gain = this.context.createGain();
    const filter = this.context.createBiquadFilter();
    fundamental.type = "sine";
    harmonic.type = "sine";
    fundamental.frequency.setValueAtTime(1420, at);
    fundamental.frequency.linearRampToValueAtTime(1470, at + duration);
    harmonic.frequency.setValueAtTime(2840, at);
    harmonic.frequency.linearRampToValueAtTime(2940, at + duration);
    filter.type = "bandpass";
    filter.frequency.value = 1700;
    filter.Q.value = 4.5;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.linearRampToValueAtTime(0.085 * strength, at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    fundamental.connect(filter);
    harmonic.connect(filter);
    filter.connect(gain);
    gain.connect(destination);
    fundamental.start(at);
    harmonic.start(at);
    fundamental.stop(at + duration + 0.03);
    harmonic.stop(at + duration + 0.03);
  }

  overheat() {
    if (!this.ready) return;
    const now = this.context.currentTime;
    [0, 0.24].forEach((offset) => {
      const oscillator = this.context.createOscillator();
      const gain = this.context.createGain();
      oscillator.type = "square";
      oscillator.frequency.value = offset ? 128 : 96;
      gain.gain.setValueAtTime(0.0001, now + offset);
      gain.gain.linearRampToValueAtTime(0.035, now + offset + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.16);
      oscillator.connect(gain);
      gain.connect(this.master);
      oscillator.start(now + offset);
      oscillator.stop(now + offset + 0.18);
    });
  }

  success() {
    if (!this.ready) return;
    const now = this.context.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((frequency, index) => {
      const oscillator = this.context.createOscillator();
      const gain = this.context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, now + index * 0.16);
      gain.gain.linearRampToValueAtTime(0.025, now + index * 0.16 + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + index * 0.16 + 0.72);
      oscillator.connect(gain);
      gain.connect(this.master);
      oscillator.start(now + index * 0.16);
      oscillator.stop(now + index * 0.16 + 0.78);
    });
  }
}
