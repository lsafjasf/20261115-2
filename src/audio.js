export class MaglevAudio {
  constructor() {
    this.context = null;
    this.enabled = false;
    this.nodes = null;
  }

  async enable() {
    if (!window.AudioContext && !window.webkitAudioContext) return false;
    if (!this.context) this.createGraph();
    if (this.context.state === "suspended") await this.context.resume();
    this.enabled = true;
    this.master.gain.cancelScheduledValues(this.context.currentTime);
    this.master.gain.setTargetAtTime(0.62, this.context.currentTime, 0.15);
    return true;
  }

  createGraph() {
    const AudioContextClass = window.AudioContext ?? window.webkitAudioContext;
    this.context = new AudioContextClass();
    const ctx = this.context;

    this.master = ctx.createGain();
    this.master.gain.value = 0;
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.knee.value = 18;
    compressor.ratio.value = 5;
    compressor.attack.value = 0.01;
    compressor.release.value = 0.22;
    this.master.connect(compressor);
    compressor.connect(ctx.destination);

    const hum = ctx.createOscillator();
    hum.type = "sine";
    hum.frequency.value = 47;
    const humGain = ctx.createGain();
    humGain.gain.value = 0.028;
    const humFilter = ctx.createBiquadFilter();
    humFilter.type = "lowpass";
    humFilter.frequency.value = 150;
    hum.connect(humFilter);
    humFilter.connect(humGain);
    humGain.connect(this.master);
    hum.start();

    const harmonic = ctx.createOscillator();
    harmonic.type = "triangle";
    harmonic.frequency.value = 94;
    const harmonicGain = ctx.createGain();
    harmonicGain.gain.value = 0.008;
    harmonic.connect(harmonicGain);
    harmonicGain.connect(this.master);
    harmonic.start();

    const whine = ctx.createOscillator();
    whine.type = "sawtooth";
    whine.frequency.value = 182;
    const whineFilter = ctx.createBiquadFilter();
    whineFilter.type = "bandpass";
    whineFilter.frequency.value = 620;
    whineFilter.Q.value = 2.4;
    const whineGain = ctx.createGain();
    whineGain.gain.value = 0;
    whine.connect(whineFilter);
    whineFilter.connect(whineGain);
    whineGain.connect(this.master);
    whine.start();

    const rush = ctx.createBufferSource();
    rush.buffer = this.noiseBuffer(ctx, 2.4);
    rush.loop = true;
    const rushFilter = ctx.createBiquadFilter();
    rushFilter.type = "bandpass";
    rushFilter.frequency.value = 420;
    rushFilter.Q.value = 0.7;
    const rushGain = ctx.createGain();
    rushGain.gain.value = 0.025;
    rush.connect(rushFilter);
    rushFilter.connect(rushGain);
    rushGain.connect(this.master);
    rush.start();

    this.nodes = {
      hum,
      humGain,
      harmonic,
      harmonicGain,
      whine,
      whineFilter,
      whineGain,
      rushFilter,
      rushGain,
    };
  }

  noiseBuffer(ctx, seconds) {
    const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const channel = buffer.getChannelData(0);
    let seed = 1234567;
    for (let index = 0; index < channel.length; index += 1) {
      seed = (seed * 16807) % 2147483647;
      channel[index] = (seed / 2147483647) * 2 - 1;
    }
    return buffer;
  }

  async disable() {
    if (!this.context) return;
    this.enabled = false;
    this.master.gain.cancelScheduledValues(this.context.currentTime);
    this.master.gain.setTargetAtTime(0, this.context.currentTime, 0.08);
    await new Promise((resolve) => window.setTimeout(resolve, 340));
    if (!this.enabled) await this.context.suspend();
  }

  update(simulation) {
    if (!this.enabled || !this.nodes || !this.context) return;
    const ctx = this.context;
    const now = ctx.currentTime;
    const moving = simulation.pods.filter((pod) => pod.state === "moving").length;
    const waiting = simulation.pods.filter((pod) => pod.state === "waiting").length;
    const active = simulation.running ? 1 : 0;
    const faulted = simulation.pods.some((pod) => pod.state === "faulted");
    const activity = Math.min(1, moving / 4);

    this.nodes.humGain.gain.setTargetAtTime(0.016 + activity * 0.025, now, 0.18);
    this.nodes.harmonicGain.gain.setTargetAtTime(0.003 + activity * 0.008, now, 0.22);
    this.nodes.whineGain.gain.setTargetAtTime(active * (0.006 + activity * 0.012), now, 0.24);
    this.nodes.rushGain.gain.setTargetAtTime(active * (0.012 + activity * 0.025), now, 0.3);
    this.nodes.whine.frequency.setTargetAtTime(
      112 + activity * 105 + waiting * 11 + (faulted ? 38 : 0),
      now,
      0.35,
    );
    this.nodes.whineFilter.frequency.setTargetAtTime(
      480 + activity * 290 + (faulted ? 620 : 0),
      now,
      0.4,
    );
    this.nodes.rushFilter.frequency.setTargetAtTime(
      310 + activity * 260 + (faulted ? 180 : 0),
      now,
      0.5,
    );
  }

  pulse(kind = "info") {
    if (!this.enabled || !this.context) return;
    const map = {
      info: [520, 690, 0.075, "sine"],
      warn: [310, 248, 0.16, "triangle"],
      danger: [182, 104, 0.32, "sawtooth"],
      success: [612, 918, 0.28, "sine"],
    };
    const [start, end, duration, type] = map[kind] ?? map.info;
    const ctx = this.context;
    const now = ctx.currentTime;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(start, now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(30, end), now + duration);
    filter.type = "bandpass";
    filter.frequency.value = (start + end) / 2;
    filter.Q.value = 1.1;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(kind === "danger" ? 0.065 : 0.035, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.03);
  }

  chime() {
    if (!this.enabled || !this.context) return;
    const ctx = this.context;
    const now = ctx.currentTime;
    [523.25, 659.25, 783.99].forEach((frequency, index) => {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = now + index * 0.09;
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.025, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.7);
      oscillator.connect(gain);
      gain.connect(this.master);
      oscillator.start(start);
      oscillator.stop(start + 0.75);
    });
  }
}
