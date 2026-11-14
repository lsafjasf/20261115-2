// Web Audio：泵声音调与响度跟随摇杆速度，错阀 / 过热 / 结算有独立提示音。

export function createAudio() {
  let ctx = null;
  let master;
  let humOsc;
  let humGain;
  let filter;
  let noiseGain;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(ctx.destination);

    humOsc = ctx.createOscillator();
    humOsc.type = 'sawtooth';
    humOsc.frequency.value = 48;
    filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 240;
    humGain = ctx.createGain();
    humGain.gain.value = 0;
    humOsc.connect(filter).connect(humGain).connect(master);
    humOsc.start();

    const bufferSize = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i += 1) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;
    noiseGain = ctx.createGain();
    noiseGain.gain.value = 0;
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.value = 180;
    noise.connect(noiseFilter).connect(noiseGain).connect(master);
    noise.start();
    return ctx;
  }

  // speed 为引擎中的摇杆次/秒；越快音调越高、噪声越响。
  function update(speed, seized) {
    if (!ctx) return;
    const now = ctx.currentTime;
    if (seized) {
      humGain.gain.setTargetAtTime(0.02, now, 0.1);
      noiseGain.gain.setTargetAtTime(0.01, now, 0.1);
      humOsc.frequency.setTargetAtTime(36, now, 0.1);
      return;
    }
    const active = Math.min(1, speed / 2.2);
    humGain.gain.setTargetAtTime(0.03 + active * 0.12, now, 0.08);
    noiseGain.gain.setTargetAtTime(active * 0.08, now, 0.08);
    humOsc.frequency.setTargetAtTime(46 + speed * 34, now, 0.06);
    filter.frequency.setTargetAtTime(220 + speed * 260, now, 0.08);
  }

  function blip(freq, duration, type = 'square', volume = 0.15) {
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain).connect(master);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  }

  return {
    unlock() { ensure(); },
    update,
    stroke(speed) {
      ensure();
      // 每次摇杆行程的机械咔哒声，越快音高越高。
      blip(130 + Math.min(speed, 3) * 60, 0.09, 'triangle', 0.18);
    },
    wrong() {
      ensure();
      blip(160, 0.18, 'square', 0.2);
      setTimeout(() => blip(110, 0.25, 'square', 0.2), 110);
    },
    seizure() {
      ensure();
      blip(420, 0.15, 'sawtooth', 0.22);
      setTimeout(() => blip(300, 0.3, 'sawtooth', 0.22), 160);
    },
    finish(success) {
      ensure();
      if (success) {
        [523, 659, 784].forEach((f, i) => setTimeout(() => blip(f, 0.22, 'sine', 0.2), i * 150));
      } else {
        [330, 262, 196].forEach((f, i) => setTimeout(() => blip(f, 0.3, 'sawtooth', 0.18), i * 200));
      }
    },
  };
}
