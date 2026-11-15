/* WebAudio：水流声随流量变化，冰堵时切换为报警声。 */
(function (root) {
  'use strict';

  function FlowAudio() {
    this.context = null;
    this.enabled = true;
    this.master = null;
    this.filter = null;
    this.oscillator = null;
    this.gain = null;
    this.noise = null;
  }

  FlowAudio.prototype.ensure = function () {
    if (this.context) {
      if (this.context.state === 'suspended') this.context.resume();
      return;
    }
    const AudioContext = root.AudioContext || root.webkitAudioContext;
    if (!AudioContext) return;
    this.context = new AudioContext();
    this.master = this.context.createGain();
    this.master.gain.value = 0.12;
    this.master.connect(this.context.destination);

    this.filter = this.context.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 400;
    this.filter.connect(this.master);

    const length = this.context.sampleRate * 2;
    const buffer = this.context.createBuffer(1, length, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    this.noise = this.context.createBufferSource();
    this.noise.buffer = buffer;
    this.noise.loop = true;

    this.gain = this.context.createGain();
    this.gain.gain.value = 0;
    this.noise.connect(this.gain);
    this.gain.connect(this.filter);
    this.noise.start();

    this.oscillator = this.context.createOscillator();
    this.oscillator.type = 'sine';
    this.oscillator.frequency.value = 160;
    this.oscillator.connect(this.master);
    this.oscillator.start();
  };

  FlowAudio.prototype.update = function (flowRatio, blocked) {
    if (!this.enabled || !this.context) return;
    const now = this.context.currentTime;
    if (blocked) {
      this.filter.frequency.setTargetAtTime(1800, now, 0.1);
      this.gain.gain.setTargetAtTime(0.22, now, 0.08);
      this.oscillator.frequency.setTargetAtTime(660, now, 0.05);
      return;
    }
    const ratio = Math.max(0, Math.min(1, flowRatio));
    this.filter.frequency.setTargetAtTime(280 + ratio * 900, now, 0.12);
    this.gain.gain.setTargetAtTime(0.025 + ratio * 0.15, now, 0.12);
    this.oscillator.frequency.setTargetAtTime(100 + ratio * 180, now, 0.12);
  };

  FlowAudio.prototype.setEnabled = function (enabled) {
    this.enabled = enabled;
    if (!enabled && this.master) this.master.gain.setTargetAtTime(0, this.context.currentTime, 0.05);
    if (enabled && this.master) this.master.gain.setTargetAtTime(0.12, this.context.currentTime, 0.05);
  };

  root.FlowAudio = FlowAudio;
})(window);
