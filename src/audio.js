export class GreenhouseAudio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.fanGain = null;
    this.fanFilter = null;
    this.buzzGain = null;
    this.buzzOsc = null;
    this.buzzFilter = null;
    this.muted = false;
  }

  ensure() {
    if (this.ctx) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    this.ctx = new AudioCtx();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.65;
    this.master.connect(this.ctx.destination);

    const seconds = 2;
    const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate * seconds, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i += 1) {
      const white = Math.random() * 2 - 1;
      last = last * 0.86 + white * 0.14;
      data[i] = last * 1.7;
    }
    this.noiseBuffer = buffer;
    this.buildFan();
    this.buildBuzz();
  }

  buildFan() {
    const source = this.ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    source.loop = true;
    this.fanFilter = this.ctx.createBiquadFilter();
    this.fanFilter.type = 'bandpass';
    this.fanFilter.frequency.value = 320;
    this.fanFilter.Q.value = 0.72;
    this.fanGain = this.ctx.createGain();
    this.fanGain.gain.value = 0;
    source.connect(this.fanFilter).connect(this.fanGain).connect(this.master);
    source.start();

    const rumble = this.ctx.createOscillator();
    rumble.type = 'sine';
    rumble.frequency.value = 46;
    const rumbleGain = this.ctx.createGain();
    rumbleGain.gain.value = 0.012;
    rumble.connect(rumbleGain).connect(this.fanGain);
    rumble.start();
  }

  buildBuzz() {
    this.buzzOsc = this.ctx.createOscillator();
    this.buzzOsc.type = 'sawtooth';
    this.buzzOsc.frequency.value = 132;
    this.buzzFilter = this.ctx.createBiquadFilter();
    this.buzzFilter.type = 'lowpass';
    this.buzzFilter.frequency.value = 480;
    this.buzzFilter.Q.value = 2.6;
    this.buzzGain = this.ctx.createGain();
    this.buzzGain.gain.value = 0;

    const flutter = this.ctx.createOscillator();
    flutter.frequency.value = 24;
    const flutterGain = this.ctx.createGain();
    flutterGain.gain.value = 8;
    flutter.connect(flutterGain).connect(this.buzzOsc.frequency);

    this.buzzOsc.connect(this.buzzFilter).connect(this.buzzGain).connect(this.master);
    this.buzzOsc.start();
    flutter.start();
  }

  resume() {
    this.ensure();
    if (this.ctx?.state === 'suspended') this.ctx.resume();
  }

  update(game) {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    const vent = game.settings.ventilation / 100;
    const fanLevel = Math.pow(vent, 1.3);
    this.fanGain.gain.setTargetAtTime(0.012 + fanLevel * 0.085, now, 0.18);
    this.fanFilter.frequency.setTargetAtTime(210 + vent * 520, now, 0.22);

    const buzz = game.status === 'running' || game.status === 'paused'
      ? game.activity * (0.25 + game.colony / 56 * 0.75)
      : game.status === 'ready' ? 0.07 : 0.035;
    this.buzzGain.gain.setTargetAtTime(buzz * 0.055, now, 0.35);
    this.buzzOsc.frequency.setTargetAtTime(94 + game.activity * 72, now, 0.25);
    this.buzzFilter.frequency.setTargetAtTime(360 + game.activity * 340, now, 0.3);
  }

  tone(frequency, duration, delay = 0, type = 'triangle', volume = 0.14) {
    if (!this.ctx || this.muted) return;
    const start = this.ctx.currentTime + delay;
    const oscillator = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain).connect(this.master);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.03);
  }

  result(success) {
    if (!this.ctx || this.muted) return;
    const notes = success ? [392, 523.25, 659.25, 783.99] : [246.94, 220, 174.61];
    notes.forEach((frequency, index) => {
      this.tone(frequency, success ? 0.34 : 0.42, index * 0.16, success ? 'triangle' : 'sine', 0.11);
    });
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.65;
    return this.muted;
  }
}
