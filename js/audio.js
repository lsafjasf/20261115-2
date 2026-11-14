(function () {
  "use strict";

  class PaperAudio {
    constructor() {
      this.context = null;
      this.master = null;
      this.destination = null;
      this.noiseBuffer = null;
      this.enabled = true;
      this.lastManualRustle = 0;
    }

    async init() {
      if (this.context) {
        if (this.context.state === "suspended") await this.context.resume();
        return this.context;
      }
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return null;
      this.context = new AudioContextClass();
      this.master = this.context.createGain();
      this.master.gain.value = this.enabled ? 0.8 : 0;
      this.destination = this.context.createMediaStreamDestination();
      this.master.connect(this.context.destination);
      this.master.connect(this.destination);
      this.noiseBuffer = this.createNoiseBuffer(3);
      await this.context.resume();
      return this.context;
    }

    createNoiseBuffer(seconds) {
      const length = Math.floor(this.context.sampleRate * seconds);
      const buffer = this.context.createBuffer(1, length, this.context.sampleRate);
      const data = buffer.getChannelData(0);
      let previous = 0;
      for (let i = 0; i < length; i += 1) {
        const white = Math.random() * 2 - 1;
        previous = previous * 0.58 + white * 0.42;
        const pulse = Math.random() > 0.988 ? Math.random() * 0.85 : 0;
        data[i] = previous * 0.44 + pulse;
      }
      return buffer;
    }

    async unlock() {
      const context = await this.init();
      if (context && this.enabled) {
        this.master.gain.setTargetAtTime(0.8, context.currentTime, 0.03);
      }
      return context;
    }

    setEnabled(enabled) {
      this.enabled = enabled;
      if (!this.context) return;
      const target = enabled ? 0.8 : 0;
      this.master.gain.setTargetAtTime(target, this.context.currentTime, 0.05);
      if (enabled) this.context.resume();
    }

    playRustle(intensity, pan, delay) {
      if (!this.context || !this.enabled || this.context.state !== "running") return;
      const level = Math.max(0.03, Math.min(1, intensity || 0.4));
      const now = this.context.currentTime + Math.max(0, delay || 0) + Math.random() * 0.015;
      const duration = 0.18 + Math.random() * 0.24;
      const source = this.context.createBufferSource();
      source.buffer = this.noiseBuffer;
      source.playbackRate.value = 0.68 + Math.random() * 0.68;

      const highpass = this.context.createBiquadFilter();
      highpass.type = "highpass";
      highpass.frequency.value = 330 + Math.random() * 260;
      highpass.Q.value = 0.35;

      const bandpass = this.context.createBiquadFilter();
      bandpass.type = "bandpass";
      bandpass.frequency.value = 1050 + Math.random() * 1500;
      bandpass.Q.value = 0.65 + Math.random() * 0.55;

      const gain = this.context.createGain();
      const peak = 0.055 + level * 0.105;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(peak, now + 0.012 + Math.random() * 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

      let node = source;
      node.connect(highpass);
      highpass.connect(bandpass);
      bandpass.connect(gain);
      if (this.context.createStereoPanner) {
        const panner = this.context.createStereoPanner();
        panner.pan.value = Math.max(-0.75, Math.min(0.75, pan || 0));
        gain.connect(panner);
        node = panner;
      }
      node.connect(this.master);
      const offset = Math.random() * 2.3;
      source.start(now, offset, duration + 0.03);
    }

    playFoldEvent(intensity, pan, delay) {
      if (!this.context || !this.enabled || this.context.state !== "running") return;
      const delaySeconds = Math.max(0, delay || 0);
      const context = this.context;
      const now = context.currentTime + delaySeconds;
      const source = context.createBufferSource();
      source.buffer = this.noiseBuffer;
      source.playbackRate.value = 0.56 + Math.random() * 0.38;

      const lowpass = context.createBiquadFilter();
      lowpass.type = "lowpass";
      lowpass.frequency.value = 620 + Math.random() * 260;
      lowpass.Q.value = 0.45;

      const gain = context.createGain();
      const peak = Math.max(0.025, 0.075 + intensity * 0.1);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(peak, now + 0.018);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.13 + intensity * 0.05);

      source.connect(lowpass);
      lowpass.connect(gain);
      gain.connect(this.master);
      source.start(now, Math.random() * 2.1, 0.22);
      this.playRustle(intensity * 1.05, pan, delay);
      if (intensity > 0.55) {
        this.playRustle(intensity * 0.5, -pan * 0.4, delay + 0.055);
      }
    }

    manualRustle(intensity) {
      if (!this.enabled) return;
      const now = performance.now();
      if (now - this.lastManualRustle < 65) return;
      this.lastManualRustle = now;
      this.playRustle(intensity, (Math.random() - 0.5) * 0.35);
    }

    getAudioTrack() {
      if (!this.destination) return null;
      return this.destination.stream.getAudioTracks()[0] || null;
    }
  }

  window.PaperAudio = PaperAudio;
})();
