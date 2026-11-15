function noiseBuffer(context) {
  const length = context.sampleRate * 2;
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;

  for (let index = 0; index < length; index += 1) {
    const white = Math.random() * 2 - 1;
    last = last * 0.86 + white * 0.14;
    data[index] = white * 0.45 + last * 0.8;
  }

  return buffer;
}

export class AudioEngine {
  constructor() {
    this.context = null;
    this.master = null;
    this.windGain = null;
    this.whistleGain = null;
    this.motorGain = null;
    this.motorOsc = null;
    this.motorHarmonic = null;
    this.windFilter = null;
    this.whistleFilter = null;
    this.ready = false;
    this.muted = true;
    this.windLevel = 0;
    this.motorLevel = 0;
    this.motorFrequency = 44;
  }

  async start() {
    if (!this.context) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return false;

      this.context = new AudioContextClass();
      this.master = this.context.createGain();
      this.master.gain.value = 0;
      this.master.connect(this.context.destination);

      const noise = this.context.createBufferSource();
      noise.buffer = noiseBuffer(this.context);
      noise.loop = true;

      this.windFilter = this.context.createBiquadFilter();
      this.windFilter.type = "lowpass";
      this.windFilter.frequency.value = 720;
      this.windFilter.Q.value = 0.7;

      this.windGain = this.context.createGain();
      this.windGain.gain.value = 0.0001;
      noise.connect(this.windFilter).connect(this.windGain).connect(this.master);

      this.whistleFilter = this.context.createBiquadFilter();
      this.whistleFilter.type = "bandpass";
      this.whistleFilter.frequency.value = 1180;
      this.whistleFilter.Q.value = 2.6;

      this.whistleGain = this.context.createGain();
      this.whistleGain.gain.value = 0.0001;
      noise.connect(this.whistleFilter).connect(this.whistleGain).connect(this.master);

      this.motorOsc = this.context.createOscillator();
      this.motorOsc.type = "sawtooth";
      this.motorOsc.frequency.value = 42;

      this.motorHarmonic = this.context.createOscillator();
      this.motorHarmonic.type = "sine";
      this.motorHarmonic.frequency.value = 84;

      const motorFilter = this.context.createBiquadFilter();
      motorFilter.type = "lowpass";
      motorFilter.frequency.value = 320;
      motorFilter.Q.value = 1.1;

      this.motorGain = this.context.createGain();
      this.motorGain.gain.value = 0.0001;
      this.motorOsc.connect(motorFilter);
      this.motorHarmonic.connect(motorFilter);
      motorFilter.connect(this.motorGain).connect(this.master);

      noise.start();
      this.motorOsc.start();
      this.motorHarmonic.start();
      this.ready = true;
    }

    if (this.context.state === "suspended") {
      await this.context.resume();
    }

    this.muted = false;
    this.master.gain.setTargetAtTime(0.72, this.context.currentTime, 0.08);
    return true;
  }

  async toggle() {
    if (!this.context || (this.muted && this.context.state !== "running")) {
      const started = await this.start();
      return started && !this.muted;
    }

    this.muted = !this.muted;
    this.master.gain.setTargetAtTime(this.muted ? 0.0001 : 0.72, this.context.currentTime, 0.09);
    return !this.muted;
  }

  update({ wind, motorSpeed = 0, motorActive = false }) {
    if (!this.ready || !this.context) return;
    const now = this.context.currentTime;
    const windNormalized = Math.min(1, Math.max(0, wind / 25));
    const motorNormalized = motorActive ? Math.min(1, Math.max(0, motorSpeed)) : 0;

    this.windLevel = 0.012 + windNormalized * 0.12;
    this.motorLevel = motorNormalized * 0.05;
    this.motorFrequency = 42 + motorNormalized * 55;

    this.windGain.gain.setTargetAtTime(this.windLevel, now, 0.12);
    this.windFilter.frequency.setTargetAtTime(380 + windNormalized * 1480, now, 0.16);
    this.whistleGain.gain.setTargetAtTime(Math.max(0, windNormalized - 0.45) * 0.035, now, 0.2);
    this.whistleFilter.frequency.setTargetAtTime(850 + windNormalized * 1050, now, 0.2);
    this.motorGain.gain.setTargetAtTime(this.motorLevel, now, 0.06);
    this.motorOsc.frequency.setTargetAtTime(this.motorFrequency, now, 0.08);
    this.motorHarmonic.frequency.setTargetAtTime(this.motorFrequency * 2.02, now, 0.08);
  }

  stats() {
    return {
      ready: this.ready,
      muted: this.muted,
      contextState: this.context?.state ?? "uninitialized",
      windGain: Number(this.windLevel.toFixed(4)),
      motorGain: Number(this.motorLevel.toFixed(4)),
      motorFrequency: Number(this.motorFrequency.toFixed(1)),
    };
  }
}
