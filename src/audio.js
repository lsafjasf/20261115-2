/* Web Audio：电机声随速度变化，制动/缓冲碰撞/气压/警报各有音效。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MoonLiftAudio = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function createAudio() {
    let ctx = null;
    let motorOsc = null;
    let motorGain = null;
    let motorFilter = null;

    function ensure() {
      if (ctx) return ctx;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      motorOsc = ctx.createOscillator();
      motorOsc.type = 'sawtooth';
      motorOsc.frequency.value = 50;
      motorFilter = ctx.createBiquadFilter();
      motorFilter.type = 'lowpass';
      motorFilter.frequency.value = 400;
      motorGain = ctx.createGain();
      motorGain.gain.value = 0;
      motorOsc.connect(motorFilter).connect(motorGain).connect(ctx.destination);
      motorOsc.start();
      return ctx;
    }

    function resume() {
      const ac = ensure();
      if (ac && ac.state === 'suspended') ac.resume();
    }

    function beep(freq, duration, type = 'sine', volume = 0.12) {
      if (!ensure()) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(volume, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    }

    function noiseBurst(duration, volume, cutoff) {
      if (!ensure()) return;
      const bufferSize = Math.floor(ctx.sampleRate * duration);
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i += 1) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
      }
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = cutoff;
      const gain = ctx.createGain();
      gain.gain.value = volume;
      src.connect(filter).connect(gain).connect(ctx.destination);
      src.start();
    }

    // 电机声：频率随当前速度，制动时滤波收窄、音调下沉
    function updateMotor(game) {
      if (!ctx || !motorGain) return;
      const moving = ['accelerating', 'cruising', 'braking'].includes(game.car.status);
      const speed = Math.abs(game.car.velocity);
      const targetFreq = 48 + speed * 14 + (game.car.direction === -1 ? 8 : 0);
      motorOsc.frequency.setTargetAtTime(targetFreq, ctx.currentTime, 0.08);
      motorFilter.frequency.setTargetAtTime(
        game.car.status === 'braking' ? 180 : 520, ctx.currentTime, 0.1);
      motorGain.gain.setTargetAtTime(moving ? 0.06 : 0.0001, ctx.currentTime, 0.1);
    }

    function handleEvent(event) {
      switch (event.type) {
        case 'motor-start': beep(220, 0.12, 'triangle', 0.08); break;
        case 'brake-on':
          beep(140, 0.25, 'square', 0.07);
          noiseBurst(0.18, 0.05, 900);
          break;
        case 'impact':
          // 缓冲器冲击：低频闷响 + 噪声，吸收越强声音越闷
          noiseBurst(0.4, 0.18, 320);
          beep(70, 0.45, 'sine', 0.16);
          break;
        case 'pressure-start': beep(440, 0.15, 'sine', 0.08); break;
        case 'pressure-ready': beep(660, 0.18, 'sine', 0.1); break;
        case 'door-open': beep(520, 0.12, 'triangle', 0.09); break;
        case 'door-close': beep(330, 0.1, 'triangle', 0.07); break;
        case 'delivered': beep(880, 0.2, 'sine', 0.1); break;
        case 'early-open-blocked':
          // 警报：两段急促高音
          beep(980, 0.15, 'square', 0.12);
          setTimeout(() => beep(980, 0.15, 'square', 0.12), 180);
          break;
        case 'win':
          [523, 659, 784, 1047].forEach((f, i) =>
            setTimeout(() => beep(f, 0.25, 'triangle', 0.11), i * 160));
          break;
        case 'hull-destroyed':
          noiseBurst(0.8, 0.2, 240);
          break;
        default:
          break;
      }
    }

    return { resume, updateMotor, handleEvent };
  }

  return { createAudio };
});
