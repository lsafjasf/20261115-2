export class CraneAudio {
  constructor() {
    this.enabled = true;
    this.context = null;
    this.master = null;
    this.voice = null;
    this.weight = 0;
    this.hz = 0;
    this.level = 0;
  }

  ensure() {
    if (!this.enabled) return false;
    if (!this.context) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return false;
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.gain.value = 0.34;
      this.master.connect(this.context.destination);
    }
    if (this.context.state === "suspended") this.context.resume();
    return true;
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    if (!enabled) this.stopLoad();
    if (enabled) this.ensure();
  }

  toggle() {
    this.setEnabled(!this.enabled);
    return this.enabled;
  }

  startLoad(weight) {
    if (!this.ensure()) return;
    this.stopLoad();
    const ctx = this.context;
    const now = ctx.currentTime;
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    const low = ctx.createOscillator();
    const high = ctx.createOscillator();
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    const normal = Math.min(1, Math.max(0, (weight - 10) / 22));
    const baseHz = 196 - normal * 52;

    low.type = "sawtooth";
    high.type = "triangle";
    low.frequency.value = baseHz;
    high.frequency.value = baseHz * 2.015;
    filter.type = "lowpass";
    filter.frequency.value = 610 - normal * 210;
    filter.Q.value = 1.4;
    lfo.type = "sine";
    lfo.frequency.value = 5.4 - normal * 1.3;
    lfoGain.gain.value = 2.8 + normal * 2.4;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.032 + normal * 0.04, now + 0.08);

    lfo.connect(lfoGain);
    lfoGain.connect(low.frequency);
    lfoGain.connect(high.frequency);
    low.connect(filter);
    high.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    low.start(now);
    high.start(now);
    lfo.start(now);

    this.voice = { gain, low, high, lfo, filter };
    this.weight = weight;
    this.hz = baseHz;
    this.level = 0.032 + normal * 0.04;
  }

  stopLoad() {
    if (!this.voice || !this.context) return;
    const now = this.context.currentTime;
    const voice = this.voice;
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setTargetAtTime(0.0001, now, 0.08);
    for (const oscillator of [voice.low, voice.high, voice.lfo]) {
      try {
        oscillator.stop(now + 0.32);
      } catch {
        // The oscillator may already be stopped during a rapid remount.
      }
    }
    this.voice = null;
    this.weight = 0;
    this.hz = 0;
    this.level = 0;
  }

  playDrop(weight) {
    if (!this.ensure()) return;
    const ctx = this.context;
    const now = ctx.currentTime;
    const normal = Math.min(1, Math.max(0, weight / 34));
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(76 - normal * 20, now);
    oscillator.frequency.exponentialRampToValueAtTime(36, now + 0.26);
    filter.type = "lowpass";
    filter.frequency.value = 190;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.13 + normal * 0.14, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.37);
    oscillator.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    oscillator.start(now);
    oscillator.stop(now + 0.4);
  }

  playAlert() {
    if (!this.ensure()) return;
    const ctx = this.context;
    const now = ctx.currentTime;
    for (let index = 0; index < 2; index += 1) {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = "square";
      oscillator.frequency.value = index ? 154 : 188;
      gain.gain.setValueAtTime(0.0001, now + index * 0.13);
      gain.gain.exponentialRampToValueAtTime(0.038, now + index * 0.13 + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + index * 0.13 + 0.1);
      oscillator.connect(gain);
      gain.connect(this.master);
      oscillator.start(now + index * 0.13);
      oscillator.stop(now + index * 0.13 + 0.12);
    }
  }

  playLoadChime() {
    if (!this.ensure()) return;
    const ctx = this.context;
    const now = ctx.currentTime;
    [392, 523, 659].forEach((frequency, index) => {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, now + index * 0.075);
      gain.gain.exponentialRampToValueAtTime(0.045, now + index * 0.075 + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + index * 0.075 + 0.42);
      oscillator.connect(gain);
      gain.connect(this.master);
      oscillator.start(now + index * 0.075);
      oscillator.stop(now + index * 0.075 + 0.46);
    });
  }

  getStatus() {
    return {
      enabled: this.enabled,
      loadWeight: this.weight,
      hz: this.hz,
      level: this.level,
      active: Boolean(this.voice)
    };
  }
}
