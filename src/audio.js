export class GlassAudio {
  constructor() {
    this.context = null;
    this.master = null;
    this.enabled = true;
    this.score = null;
    this.noiseBuffer = null;
  }

  async ensure() {
    if (!this.context) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return false;
      this.context = new AudioContext();
      const compressor = this.context.createDynamicsCompressor();
      compressor.threshold.value = -16;
      compressor.knee.value = 12;
      compressor.ratio.value = 5;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.18;
      this.master = this.context.createGain();
      this.master.gain.value = this.enabled ? 0.72 : 0;
      this.master.connect(compressor);
      compressor.connect(this.context.destination);
      this.noiseBuffer = this.createNoiseBuffer(2.5);
    }

    if (this.context.state === "suspended") {
      await this.context.resume();
    }
    return true;
  }

  createNoiseBuffer(seconds) {
    const frames = Math.floor(this.context.sampleRate * seconds);
    const buffer = this.context.createBuffer(1, frames, this.context.sampleRate);
    const channel = buffer.getChannelData(0);
    let previous = 0;
    for (let index = 0; index < frames; index += 1) {
      const white = Math.random() * 2 - 1;
      previous = previous * 0.58 + white * 0.42;
      channel[index] = previous;
    }
    return buffer;
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    if (this.master && this.context) {
      this.master.gain.cancelScheduledValues(this.context.currentTime);
      this.master.gain.setTargetAtTime(enabled ? 0.72 : 0, this.context.currentTime, 0.03);
    }
    if (!enabled) this.stopScore(0.04);
  }

  async startScore() {
    if (!this.enabled || !(await this.ensure())) return;
    if (this.score) return;

    const now = this.context.currentTime;
    const source = this.context.createBufferSource();
    source.buffer = this.noiseBuffer;
    source.loop = true;

    const highpass = this.context.createBiquadFilter();
    highpass.type = "highpass";
    highpass.frequency.value = 1100;
    highpass.Q.value = 0.8;

    const bandpass = this.context.createBiquadFilter();
    bandpass.type = "bandpass";
    bandpass.frequency.value = 2800;
    bandpass.Q.value = 0.72;

    const gain = this.context.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.018, now + 0.06);

    const squeal = this.context.createOscillator();
    squeal.type = "triangle";
    squeal.frequency.value = 2200;
    const squealGain = this.context.createGain();
    squealGain.gain.value = 0.0025;

    source.connect(highpass);
    highpass.connect(bandpass);
    bandpass.connect(gain);
    gain.connect(this.master);
    squeal.connect(squealGain);
    squealGain.connect(this.master);
    source.start();
    squeal.start();

    this.score = { source, gain, highpass, bandpass, squeal, squealGain };
  }

  updateScore(speed = 0, pressure = 2.5, active = true) {
    if (!this.score || !this.context || !this.enabled) return;
    const now = this.context.currentTime;
    const power = active ? 1 : 0;
    const speed01 = Math.max(0, Math.min(1.8, speed / 420));
    const pressure01 = Math.max(0, Math.min(1.5, (pressure - 1.6) / 2.2));
    const targetGain = power * (0.014 + speed01 * 0.033 + pressure01 * 0.008);
    this.score.gain.gain.setTargetAtTime(targetGain, now, 0.035);
    this.score.highpass.frequency.setTargetAtTime(920 + speed * 1.8, now, 0.05);
    this.score.bandpass.frequency.setTargetAtTime(2200 + speed * 3.4, now, 0.05);
    this.score.squeal.frequency.setTargetAtTime(1550 + speed * 4.2, now, 0.04);
    this.score.squealGain.gain.setTargetAtTime(
      power * (0.0018 + speed01 * 0.006),
      now,
      0.05,
    );
  }

  stopScore(fade = 0.06) {
    if (!this.score || !this.context) return;
    const now = this.context.currentTime;
    const current = this.score;
    this.score = null;
    current.gain.gain.cancelScheduledValues(now);
    current.gain.gain.setTargetAtTime(0.0001, now, fade);
    current.squealGain.gain.setTargetAtTime(0.0001, now, fade);
    try {
      current.source.stop(now + fade * 4);
      current.squeal.stop(now + fade * 4);
    } catch {
      // Nodes may already be stopped after a rapid reset.
    }
  }

  async knock(index = 0, muted = false) {
    if (!this.enabled || !(await this.ensure())) return;
    const now = this.context.currentTime;
    const base = [780, 610, 870][index] || 720;

    const click = this.context.createBufferSource();
    click.buffer = this.noiseBuffer;
    const clickFilter = this.context.createBiquadFilter();
    clickFilter.type = "bandpass";
    clickFilter.frequency.value = base * 2.6;
    clickFilter.Q.value = 2.4;
    const clickGain = this.context.createGain();
    clickGain.gain.setValueAtTime(muted ? 0.035 : 0.12, now);
    clickGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.13);
    click.connect(clickFilter);
    clickFilter.connect(clickGain);
    clickGain.connect(this.master);
    click.start(now, Math.random() * 0.5, 0.14);

    const ping = this.context.createOscillator();
    ping.type = "sine";
    ping.frequency.setValueAtTime(base * 1.25, now);
    ping.frequency.exponentialRampToValueAtTime(base * 0.75, now + 0.18);
    const pingGain = this.context.createGain();
    pingGain.gain.setValueAtTime(muted ? 0.012 : 0.05, now);
    pingGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);
    ping.connect(pingGain);
    pingGain.connect(this.master);
    ping.start(now);
    ping.stop(now + 0.27);
  }

  async crack(severity = 1) {
    if (!this.enabled || !(await this.ensure())) return;
    const now = this.context.currentTime;
    const amount = Math.max(0.2, Math.min(1.5, severity));
    const burst = this.context.createBufferSource();
    burst.buffer = this.noiseBuffer;
    const filter = this.context.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.setValueAtTime(2400, now);
    filter.frequency.exponentialRampToValueAtTime(900, now + 0.24 * amount);
    const gain = this.context.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.09 * amount, now + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.32 * amount);
    burst.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    burst.start(now, Math.random() * 1.2, 0.36 * amount);

    const thump = this.context.createOscillator();
    thump.type = "sine";
    thump.frequency.setValueAtTime(150, now);
    thump.frequency.exponentialRampToValueAtTime(54, now + 0.2);
    const thumpGain = this.context.createGain();
    thumpGain.gain.setValueAtTime(0.07 * amount, now);
    thumpGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.24);
    thump.connect(thumpGain);
    thumpGain.connect(this.master);
    thump.start(now);
    thump.stop(now + 0.26);
  }

  async tone(frequency, duration, delay = 0, type = "sine", volume = 0.045) {
    if (!this.enabled || !(await this.ensure())) return;
    const start = this.context.currentTime + delay;
    const oscillator = this.context.createOscillator();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    const gain = this.context.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain);
    gain.connect(this.master);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }

  async success() {
    await Promise.all([
      this.tone(523.25, 0.42, 0, "sine", 0.04),
      this.tone(659.25, 0.48, 0.09, "sine", 0.04),
      this.tone(783.99, 0.6, 0.18, "triangle", 0.032),
      this.tone(1046.5, 0.7, 0.3, "sine", 0.025),
    ]);
  }

  async fail() {
    await Promise.all([
      this.tone(196, 0.48, 0, "sawtooth", 0.022),
      this.tone(185, 0.52, 0.05, "triangle", 0.03),
      this.tone(146.83, 0.7, 0.16, "sine", 0.035),
    ]);
  }
}
