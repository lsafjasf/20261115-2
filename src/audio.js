export class FridgeAudio {
  constructor() {
    this.context = null;
    this.enabled = false;
    this.master = null;
    this.filter = null;
    this.oscillators = [];
    this.lfo = null;
    this.load = 0;
    this.targetLoad = 0;
  }

  async enable() {
    if (!this.context) this.createGraph();
    await this.context.resume();
    this.enabled = true;
    this.master.gain.setTargetAtTime(0.032, this.context.currentTime, 0.25);
  }

  disable() {
    this.enabled = false;
    if (this.context) {
      this.master.gain.setTargetAtTime(0.0001, this.context.currentTime, 0.12);
    }
  }

  async toggle() {
    if (this.enabled) {
      this.disable();
      return false;
    }
    await this.enable();
    return true;
  }

  createGraph() {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    this.context = new AudioContext();
    this.master = this.context.createGain();
    this.master.gain.value = 0.0001;
    this.filter = this.context.createBiquadFilter();
    this.filter.type = "lowpass";
    this.filter.frequency.value = 340;
    this.filter.Q.value = 1.2;

    const compressor = this.context.createDynamicsCompressor();
    compressor.threshold.value = -28;
    compressor.knee.value = 18;
    compressor.ratio.value = 4;

    this.filter.connect(this.master);
    this.master.connect(compressor);
    compressor.connect(this.context.destination);

    const low = this.context.createOscillator();
    low.type = "sawtooth";
    low.frequency.value = 64;
    const lowGain = this.context.createGain();
    lowGain.gain.value = 0.18;
    low.connect(lowGain);
    lowGain.connect(this.filter);

    const upper = this.context.createOscillator();
    upper.type = "triangle";
    upper.frequency.value = 128;
    const upperGain = this.context.createGain();
    upperGain.gain.value = 0.08;
    upper.connect(upperGain);
    upperGain.connect(this.filter);

    this.lfo = this.context.createOscillator();
    this.lfo.type = "sine";
    this.lfo.frequency.value = 2.1;
    const lfoGain = this.context.createGain();
    lfoGain.gain.value = 0.025;
    this.lfo.connect(lfoGain);
    lfoGain.connect(this.master.gain);

    low.start();
    upper.start();
    this.lfo.start();
    this.oscillators = [
      { node: low, base: 64 },
      { node: upper, base: 128 },
    ];
  }

  update(load) {
    this.targetLoad = Math.max(0, Math.min(1, load));
    this.load += (this.targetLoad - this.load) * 0.075;
    if (!this.enabled || !this.context) return;

    const now = this.context.currentTime;
    for (const oscillator of this.oscillators) {
      oscillator.node.frequency.setTargetAtTime(
        oscillator.base * (1 + this.load * 1.35),
        now,
        0.12,
      );
    }
    this.filter.frequency.setTargetAtTime(
      250 + this.load * 980,
      now,
      0.16,
    );
    this.filter.Q.setTargetAtTime(0.9 + this.load * 2.4, now, 0.2);
    this.lfo.frequency.setTargetAtTime(1.4 + this.load * 4.2, now, 0.2);
    this.master.gain.setTargetAtTime(0.018 + this.load * 0.038, now, 0.24);
  }
}
