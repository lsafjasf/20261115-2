(function () {
  "use strict";

  const BP = (window.BP = window.BP || {});

  class SonarAudio {
    constructor() {
      this.context = null;
      this.master = null;
      this.ambient = null;
      this.muted = false;
      this.enabled = false;
    }

    async init() {
      if (!this.context) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return false;
        this.context = new AudioContext();
        this.master = this.context.createGain();
        this.master.gain.value = 0.82;
        this.master.connect(this.context.destination);
        this.createAmbience();
        this.enabled = true;
      }
      if (this.context.state === "suspended") {
        await this.context.resume();
      }
      return this.enabled;
    }

    createAmbience() {
      const ctx = this.context;
      const length = ctx.sampleRate * 5;
      const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      let brown = 0;
      for (let i = 0; i < length; i += 1) {
        const white = Math.random() * 2 - 1;
        brown = (brown + white * 0.018) / 1.018;
        data[i] = brown * 2.8;
      }
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 280;
      filter.Q.value = 0.6;
      const gain = ctx.createGain();
      gain.gain.value = 0.055;
      source.connect(filter);
      filter.connect(gain);
      gain.connect(this.master);
      source.start();
      this.ambient = { source, filter, gain };
    }

    setMuted(muted) {
      this.muted = muted;
      if (this.master) {
        this.master.gain.setTargetAtTime(muted ? 0 : 0.82, this.context.currentTime, 0.12);
      }
    }

    tone(frequency, start, duration, volume, pan, type) {
      if (!this.context || this.muted) return;
      const ctx = this.context;
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      const panner = ctx.createStereoPanner();
      oscillator.type = type || "sine";
      oscillator.frequency.setValueAtTime(frequency, start);
      oscillator.frequency.exponentialRampToValueAtTime(
        Math.max(60, frequency * 0.72),
        start + duration
      );
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), start + 0.018);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      panner.pan.setValueAtTime(pan || 0, start);
      oscillator.connect(gain);
      gain.connect(panner);
      panner.connect(this.master);
      oscillator.start(start);
      oscillator.stop(start + duration + 0.02);
    }

    playPing(echoes) {
      if (!this.context) return;
      const ctx = this.context;
      const now = ctx.currentTime + 0.025;
      this.tone(1180, now, 0.19, 0.17, 0, "sine");
      this.tone(2240, now + 0.002, 0.055, 0.05, 0, "triangle");

      (echoes || []).forEach((echo, index) => {
        const delay = 0.13 + (echo.distance / 690) * 0.58;
        const pan = Math.max(-0.82, Math.min(0.82, Math.sin((echo.relative || 0) * BP.utils.DEG) * 0.9));
        const volume = 0.11 / (1 + index * 0.45) + 0.025;
        this.tone(390 + echo.group * 14, now + delay, 0.14, volume, pan, "sine");
        this.tone(780 + echo.group * 24, now + delay + 0.012, 0.08, volume * 0.32, pan, "triangle");
      });
    }

    playImpact() {
      if (!this.context) return;
      const ctx = this.context;
      const now = ctx.currentTime + 0.02;
      this.tone(95, now, 0.32, 0.16, 0, "sawtooth");
      this.tone(155, now + 0.04, 0.2, 0.09, 0, "square");
    }

    playWarning() {
      if (!this.context) return;
      const now = this.context.currentTime + 0.02;
      this.tone(530, now, 0.11, 0.055, -0.15, "triangle");
      this.tone(530, now + 0.18, 0.11, 0.055, 0.15, "triangle");
    }

    playGate() {
      if (!this.context) return;
      const now = this.context.currentTime + 0.02;
      this.tone(640, now, 0.16, 0.07, 0, "sine");
      this.tone(920, now + 0.14, 0.24, 0.06, 0, "sine");
    }

    playWin() {
      if (!this.context) return;
      const now = this.context.currentTime + 0.04;
      this.tone(440, now, 0.4, 0.07, 0, "sine");
      this.tone(660, now + 0.25, 0.5, 0.07, 0, "sine");
      this.tone(880, now + 0.55, 0.8, 0.08, 0, "sine");
    }
  }

  BP.SonarAudio = SonarAudio;
})();
