export class TidalAudio {
  constructor() {
    this.context = null;
    this.enabled = false;
    this.nodes = null;
  }

  async enable() {
    if (!this.context) this.build();
    await this.context.resume();
    this.enabled = true;
    this.nodes.master.gain.cancelScheduledValues(this.context.currentTime);
    this.nodes.master.gain.setTargetAtTime(0.16, this.context.currentTime, 0.4);
  }

  disable() {
    if (!this.nodes) return;
    this.enabled = false;
    this.nodes.master.gain.setTargetAtTime(0, this.context.currentTime, 0.12);
  }

  build() {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    const context = new AudioContext();
    const master = context.createGain();
    master.gain.value = 0;
    master.connect(context.destination);

    const humFilter = context.createBiquadFilter();
    humFilter.type = "lowpass";
    humFilter.frequency.value = 230;
    humFilter.Q.value = 0.8;
    humFilter.connect(master);

    const humGain = context.createGain();
    humGain.gain.value = 0.028;
    humGain.connect(humFilter);

    const oscillatorA = context.createOscillator();
    oscillatorA.type = "sawtooth";
    oscillatorA.frequency.value = 48;
    const oscillatorB = context.createOscillator();
    oscillatorB.type = "sine";
    oscillatorB.frequency.value = 73;
    oscillatorA.connect(humGain);
    oscillatorB.connect(humGain);

    const noiseBuffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    let last = 0;
    for (let index = 0; index < data.length; index += 1) {
      const white = Math.random() * 2 - 1;
      last = last * 0.93 + white * 0.07;
      data[index] = last * 2.7;
    }
    const noise = context.createBufferSource();
    noise.buffer = noiseBuffer;
    noise.loop = true;

    const waterFilter = context.createBiquadFilter();
    waterFilter.type = "bandpass";
    waterFilter.frequency.value = 480;
    waterFilter.Q.value = 0.55;
    const waterGain = context.createGain();
    waterGain.gain.value = 0;
    noise.connect(waterFilter);
    waterFilter.connect(waterGain);
    waterGain.connect(master);

    oscillatorA.start();
    oscillatorB.start();
    noise.start();
    this.context = context;
    this.nodes = {
      master, oscillatorA, oscillatorB, humFilter, humGain,
      noise, waterFilter, waterGain,
    };
  }

  update(sim) {
    if (!this.context || !this.nodes || !this.enabled) return;
    const now = this.context.currentTime;
    const pump = Math.min(1, sim.totals.pumpFlow / 12);
    const tide = sim.totals.pressure;
    const flow = Math.min(1, (sim.totals.pumpFlow + sim.totals.canalFlow) / 17);
    const { oscillatorA, oscillatorB, humFilter, humGain, waterFilter, waterGain } = this.nodes;
    oscillatorA.frequency.setTargetAtTime(42 + tide * 23 + pump * 7, now, 0.18);
    oscillatorB.frequency.setTargetAtTime(68 + tide * 31 + pump * 8, now, 0.18);
    humFilter.frequency.setTargetAtTime(180 + pressure(tide) * 80, now, 0.2);
    humGain.gain.setTargetAtTime(0.014 + pump * 0.045, now, 0.2);
    waterFilter.frequency.setTargetAtTime(320 + flow * 1120, now, 0.25);
    waterGain.gain.setTargetAtTime(flow * 0.17 + (sim.status === "failed" ? 0.05 : 0), now, 0.2);
  }

  overflowAlert() {
    if (!this.context || !this.enabled) return;
    const now = this.context.currentTime;
    const gain = this.context.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.17, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
    gain.connect(this.context.destination);
    for (let index = 0; index < 3; index += 1) {
      const oscillator = this.context.createOscillator();
      oscillator.type = "square";
      oscillator.frequency.value = 176 + index * 46;
      oscillator.connect(gain);
      oscillator.start(now + index * 0.13);
      oscillator.stop(now + 0.1 + index * 0.13);
    }
  }
}

function pressure(value) {
  return Math.max(0, Math.min(1, (value - 0.18) / 0.82));
}
