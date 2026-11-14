(function () {
  "use strict";

  class StormAudio {
    constructor() {
      this.ctx = null;
      this.master = null;
      this.windGain = null;
      this.windFilter = null;
      this.rainGain = null;
      this.engineGain = null;
      this.engineOsc = null;
      this.muted = false;
      this.started = false;
    }

    async start() {
      if (this.started) return;
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
      await this.ctx.resume();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.82;
      this.master.connect(this.ctx.destination);

      const wind = this.makeNoise(3.8, "brown");
      this.windFilter = this.ctx.createBiquadFilter();
      this.windFilter.type = "bandpass";
      this.windFilter.frequency.value = 420;
      this.windFilter.Q.value = 0.55;
      this.windGain = this.ctx.createGain();
      this.windGain.gain.value = 0.01;
      wind.connect(this.windFilter).connect(this.windGain).connect(this.master);
      wind.start();

      const rain = this.makeNoise(2.6, "white");
      const rainFilter = this.ctx.createBiquadFilter();
      rainFilter.type = "highpass";
      rainFilter.frequency.value = 2600;
      this.rainGain = this.ctx.createGain();
      this.rainGain.gain.value = 0;
      rain.connect(rainFilter).connect(this.rainGain).connect(this.master);
      rain.start();

      this.engineOsc = this.ctx.createOscillator();
      this.engineOsc.type = "sawtooth";
      this.engineOsc.frequency.value = 74;
      const engineFilter = this.ctx.createBiquadFilter();
      engineFilter.type = "lowpass";
      engineFilter.frequency.value = 240;
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0.035;
      this.engineOsc.connect(engineFilter).connect(this.engineGain).connect(this.master);
      this.engineOsc.start();

      this.started = true;
      this.update({ wind: 0, rain: 0, battery: 1, altitude: 400 });
    }

    makeNoise(duration, color) {
      const rate = this.ctx.sampleRate;
      const length = Math.floor(rate * duration);
      const buffer = this.ctx.createBuffer(1, length, rate);
      const data = buffer.getChannelData(0);
      let last = 0;
      for (let i = 0; i < length; i += 1) {
        const white = Math.random() * 2 - 1;
        if (color === "brown") {
          last = (last + 0.018 * white) / 1.018;
          data[i] = last * 3.2;
        } else {
          data[i] = white;
        }
      }
      const source = this.ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      return source;
    }

    update(state) {
      if (!this.started || !this.ctx) return;
      const now = this.ctx.currentTime;
      const wind = Math.max(0, Math.min(1, state.wind / 40));
      const rain = Math.max(0, Math.min(1, state.rain));
      const battery = Math.max(0, Math.min(1, state.battery));
      const altitude = Math.max(0, Math.min(1, state.altitude / 600));

      this.windGain.gain.setTargetAtTime(0.012 + wind * 0.12, now, 0.18);
      this.windFilter.frequency.setTargetAtTime(260 + wind * 980, now, 0.22);
      this.rainGain.gain.setTargetAtTime(rain * 0.13, now, 0.2);
      this.engineGain.gain.setTargetAtTime(0.02 + battery * 0.025, now, 0.2);
      this.engineOsc.frequency.setTargetAtTime(62 + wind * 36 + altitude * 16, now, 0.24);
    }

    chime(kind) {
      if (!this.started || !this.ctx) return;
      const now = this.ctx.currentTime;
      const notes = kind === "success" ? [523, 659, 784, 1046]
        : kind === "hit" ? [660, 880]
        : kind === "drop" ? [390, 460]
        : [196, 146];
      notes.forEach((freq, index) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0, now + index * 0.11);
        gain.gain.linearRampToValueAtTime(kind === "miss" ? 0.12 : 0.16, now + index * 0.11 + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.001, now + index * 0.11 + 0.34);
        osc.connect(gain).connect(this.master);
        osc.start(now + index * 0.11);
        osc.stop(now + index * 0.11 + 0.38);
      });
    }

    toggleMute() {
      this.muted = !this.muted;
      if (this.master) {
        this.master.gain.setTargetAtTime(this.muted ? 0 : 0.82, this.ctx.currentTime, 0.12);
      }
      return this.muted;
    }
  }

  window.StormAudio = StormAudio;
}());
