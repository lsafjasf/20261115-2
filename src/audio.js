export class RainAudio {
  constructor() {
    this.context = null;
    this.master = null;
    this.nodes = null;
    this.muted = false;
    this.ready = false;
  }

  async start() {
    if (this.ready) {
      await this.context.resume();
      return;
    }
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;

    this.context = new AudioContext();
    this.master = this.context.createGain();
    this.master.gain.value = this.muted ? 0 : 0.72;
    this.master.connect(this.context.destination);

    const noise = this.makeNoiseBuffer(2.4);
    const rain = this.makeNoiseLayer(noise, "highpass", 460, 0.34);
    rain.filter.frequency.value = 2400;
    rain.gain.gain.value = 0.13;

    const rainBed = this.makeNoiseLayer(noise, "lowpass", 430, 0.42);
    rainBed.gain.gain.value = 0.055;

    const tire = this.makeNoiseLayer(noise, "bandpass", 820, 0.75);
    tire.gain.gain.value = 0;

    const water = this.makeNoiseLayer(noise, "bandpass", 1850, 0.55);
    water.gain.gain.value = 0;

    const chainGain = this.context.createGain();
    chainGain.gain.value = 0;
    const chainFilter = this.context.createBiquadFilter();
    chainFilter.type = "lowpass";
    chainFilter.frequency.value = 1250;
    chainFilter.Q.value = 3.2;
    const chainOsc = this.context.createOscillator();
    chainOsc.type = "sawtooth";
    chainOsc.frequency.value = 92;
    chainOsc.connect(chainFilter).connect(chainGain).connect(this.master);
    chainOsc.start();

    this.nodes = {
      noise,
      rain,
      rainBed,
      tire,
      water,
      chainOsc,
      chainGain,
    };
    this.ready = true;
    await this.context.resume();
  }

  makeNoiseBuffer(seconds) {
    const length = Math.floor(this.context.sampleRate * seconds);
    const buffer = this.context.createBuffer(1, length, this.context.sampleRate);
    const channel = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i += 1) {
      const white = Math.random() * 2 - 1;
      last = last * 0.72 + white * 0.28;
      channel[i] = white * 0.64 + last * 0.36;
    }
    return buffer;
  }

  makeNoiseLayer(buffer, filterType, frequency, q) {
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const filter = this.context.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = frequency;
    filter.Q.value = q;
    const gain = this.context.createGain();
    gain.gain.value = 0;
    source.connect(filter).connect(gain).connect(this.master);
    source.start();
    return { source, filter, gain };
  }

  update({ speed = 0, wet = false, skidding = false, engine = false }) {
    if (!this.ready) return;
    const now = this.context.currentTime;
    const speedRatio = Math.min(1, speed / 238);
    const setTarget = (param, value, time = 0.08) => {
      param.setTargetAtTime(value, now, time);
    };

    setTarget(this.nodes.tire.gain.gain, speedRatio * 0.085 + (skidding ? 0.04 : 0));
    setTarget(this.nodes.water.gain.gain, wet ? 0.032 + speedRatio * 0.08 : 0);
    setTarget(
      this.nodes.chainGain.gain,
      engine ? 0.005 + speedRatio * 0.017 : 0.0015,
    );
    setTarget(
      this.nodes.chainOsc.frequency,
      62 + speedRatio * 175 + Math.sin(now * 9) * 2.5,
    );
    setTarget(this.nodes.rain.gain.gain, 0.12 + (wet ? 0.018 : 0));
    setTarget(this.nodes.rainBed.gain.gain, 0.052 + speedRatio * 0.01);
  }

  splash(intensity = 1) {
    if (!this.ready) return;
    const source = this.context.createBufferSource();
    source.buffer = this.nodes.noise;
    const filter = this.context.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(950, this.context.currentTime);
    filter.frequency.exponentialRampToValueAtTime(
      2400,
      this.context.currentTime + 0.32,
    );
    filter.Q.value = 0.8;
    const gain = this.context.createGain();
    const now = this.context.currentTime;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.08 * intensity, now + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
    source.connect(filter).connect(gain).connect(this.master);
    source.start(now, Math.random() * 1.2);
    source.stop(now + 0.4);
  }

  chime(success = true) {
    if (!this.ready) return;
    const now = this.context.currentTime;
    const notes = success ? [659.25, 880, 1174.66] : [196, 164.81, 123.47];
    notes.forEach((frequency, index) => {
      const osc = this.context.createOscillator();
      const gain = this.context.createGain();
      osc.type = success ? "sine" : "triangle";
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(0, now + index * 0.075);
      gain.gain.linearRampToValueAtTime(
        success ? 0.075 : 0.05,
        now + index * 0.075 + 0.015,
      );
      gain.gain.exponentialRampToValueAtTime(
        0.001,
        now + index * 0.075 + 0.55,
      );
      osc.connect(gain).connect(this.master);
      osc.start(now + index * 0.075);
      osc.stop(now + index * 0.075 + 0.58);
    });
  }

  impact(strength = 1) {
    if (!this.ready) return;
    const now = this.context.currentTime;
    const source = this.context.createBufferSource();
    source.buffer = this.nodes.noise;
    const filter = this.context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 360;
    const gain = this.context.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(
      Math.min(0.2, 0.06 + strength * 0.012),
      now + 0.01,
    );
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    source.connect(filter).connect(gain).connect(this.master);
    source.start(now, 0.2);
    source.stop(now + 0.24);

    const thud = this.context.createOscillator();
    const thudGain = this.context.createGain();
    thud.type = "sine";
    thud.frequency.setValueAtTime(92, now);
    thud.frequency.exponentialRampToValueAtTime(44, now + 0.18);
    thudGain.gain.setValueAtTime(0.1, now);
    thudGain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    thud.connect(thudGain).connect(this.master);
    thud.start(now);
    thud.stop(now + 0.22);
  }

  setMuted(muted) {
    this.muted = muted;
    if (!this.ready) return;
    this.master.gain.setTargetAtTime(
      muted ? 0 : 0.72,
      this.context.currentTime,
      0.05,
    );
  }

  suspend() {
    if (this.ready && this.context.state === "running") {
      this.context.suspend();
    }
  }

  resume() {
    if (this.ready && this.context.state === "suspended") {
      this.context.resume();
    }
  }
}
