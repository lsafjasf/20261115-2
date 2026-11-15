(function () {
  "use strict";

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  class FoundryAudio {
    constructor() {
      this.context = null;
      this.enabled = true;
      this.active = false;
      this.controls = { mist: 0, air: 0 };
      this.nodes = null;
    }

    async start() {
      if (!this.context) this.createGraph();
      if (this.context.state === "suspended") {
        try {
          await this.context.resume();
        } catch (error) {
          console.warn("Audio context could not resume", error);
        }
      }
      this.active = true;
      this.applyLevels(true);
    }

    createGraph() {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) {
        this.enabled = false;
        return;
      }
      const context = new AudioContextClass();
      this.context = context;

      const master = context.createGain();
      const compressor = context.createDynamicsCompressor();
      master.gain.value = this.enabled ? 0.2 : 0;
      compressor.threshold.value = -20;
      compressor.knee.value = 18;
      compressor.ratio.value = 4;
      master.connect(compressor);
      compressor.connect(context.destination);

      const noiseBuffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      let pink = 0;
      for (let i = 0; i < data.length; i += 1) {
        const white = Math.random() * 2 - 1;
        pink = pink * 0.96 + white * 0.04;
        data[i] = white * 0.35 + pink * 2.2;
      }

      const waterSource = context.createBufferSource();
      waterSource.buffer = noiseBuffer;
      waterSource.loop = true;
      const waterFilter = context.createBiquadFilter();
      waterFilter.type = "bandpass";
      waterFilter.frequency.value = 1900;
      waterFilter.Q.value = 0.7;
      const waterGain = context.createGain();
      waterGain.gain.value = 0;
      waterSource.connect(waterFilter);
      waterFilter.connect(waterGain);
      waterGain.connect(master);
      waterSource.start();

      const fanSource = context.createBufferSource();
      fanSource.buffer = noiseBuffer;
      fanSource.loop = true;
      const fanFilter = context.createBiquadFilter();
      fanFilter.type = "lowpass";
      fanFilter.frequency.value = 420;
      fanFilter.Q.value = 0.8;
      const fanGain = context.createGain();
      fanGain.gain.value = 0;
      fanSource.connect(fanFilter);
      fanFilter.connect(fanGain);
      fanGain.connect(master);
      fanSource.start();

      const motor = context.createOscillator();
      motor.type = "sine";
      motor.frequency.value = 47;
      const motorGain = context.createGain();
      motorGain.gain.value = 0;
      motor.connect(motorGain);
      motorGain.connect(master);
      motor.start();

      const hum = context.createOscillator();
      hum.type = "triangle";
      hum.frequency.value = 92;
      const humGain = context.createGain();
      humGain.gain.value = 0.012;
      hum.connect(humGain);
      humGain.connect(master);
      hum.start();

      this.nodes = {
        master,
        waterSource,
        waterFilter,
        waterGain,
        fanSource,
        fanFilter,
        fanGain,
        motor,
        motorGain,
        hum,
        humGain
      };
    }

    setEnabled(enabled) {
      this.enabled = Boolean(enabled);
      if (!this.context || !this.nodes) return;
      const now = this.context.currentTime;
      this.nodes.master.gain.cancelScheduledValues(now);
      this.nodes.master.gain.setTargetAtTime(this.enabled ? 0.2 : 0, now, 0.05);
    }

    update(controls, active) {
      this.controls = {
        mist: clamp(controls.mist, 0, 100),
        air: clamp(controls.air, 0, 100)
      };
      this.active = Boolean(active);
      if (this.context && this.nodes) this.applyLevels(false);
    }

    applyLevels(immediate) {
      if (!this.context || !this.nodes) return;
      const now = this.context.currentTime;
      const smooth = immediate ? 0.01 : 0.14;
      const waterLevel = this.active ? Math.pow(this.controls.mist / 100, 0.8) * 0.15 : 0;
      const fanLevel = this.active ? Math.pow(this.controls.air / 100, 1.15) * 0.19 : 0;
      const motorLevel = this.active ? Math.pow(this.controls.air / 100, 1.4) * 0.035 : 0;
      const wetFrequency = 950 + this.controls.mist * 18;
      const fanFrequency = 240 + this.controls.air * 7.2;
      const motorFrequency = 38 + this.controls.air * 0.32;

      this.nodes.waterGain.gain.setTargetAtTime(waterLevel, now, smooth);
      this.nodes.fanGain.gain.setTargetAtTime(fanLevel, now, smooth);
      this.nodes.motorGain.gain.setTargetAtTime(motorLevel, now, smooth);
      this.nodes.waterFilter.frequency.setTargetAtTime(wetFrequency, now, 0.2);
      this.nodes.fanFilter.frequency.setTargetAtTime(fanFrequency, now, 0.2);
      this.nodes.motor.frequency.setTargetAtTime(motorFrequency, now, 0.2);
    }

    chime(success) {
      if (!this.context || !this.enabled) return;
      const now = this.context.currentTime;
      const notes = success ? [392, 523, 659] : [220, 174];
      notes.forEach((frequency, index) => {
        const oscillator = this.context.createOscillator();
        const gain = this.context.createGain();
        oscillator.type = success ? "sine" : "square";
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0, now + index * 0.13);
        gain.gain.linearRampToValueAtTime(success ? 0.07 : 0.045, now + index * 0.13 + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + index * 0.13 + 0.22);
        oscillator.connect(gain);
        gain.connect(this.nodes.master);
        oscillator.start(now + index * 0.13);
        oscillator.stop(now + index * 0.13 + 0.24);
      });
    }

    alarm() {
      if (!this.context || !this.enabled) return;
      const now = this.context.currentTime;
      [0, 0.16, 0.35].forEach((offset, index) => {
        const oscillator = this.context.createOscillator();
        const gain = this.context.createGain();
        oscillator.type = "sawtooth";
        oscillator.frequency.setValueAtTime(index === 2 ? 132 : 178, now + offset);
        gain.gain.setValueAtTime(0, now + offset);
        gain.gain.linearRampToValueAtTime(0.04, now + offset + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.1);
        oscillator.connect(gain);
        gain.connect(this.nodes.master);
        oscillator.start(now + offset);
        oscillator.stop(now + offset + 0.12);
      });
    }

    getLevels() {
      return {
        active: this.active,
        enabled: this.enabled,
        contextState: this.context ? this.context.state : "not-created",
        mist: this.controls.mist,
        air: this.controls.air
      };
    }
  }

  window.FoundryAudio = FoundryAudio;
})();
