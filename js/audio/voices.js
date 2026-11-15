// 四个纯 Web Audio 合成声源，每个返回一个输出节点（GainNode）。

export function createKick(ctx, out) {
  const gain = ctx.createGain();
  gain.gain.value = 0.9;
  gain.connect(out);

  function trigger(time, velocity = 1) {
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(150, time);
    osc.frequency.exponentialRampToValueAtTime(45, time + 0.12);
    amp.gain.setValueAtTime(0.0001, time);
    amp.gain.exponentialRampToValueAtTime(1.0 * velocity, time + 0.004);
    amp.gain.exponentialRampToValueAtTime(0.0001, time + 0.38);
    osc.connect(amp).connect(gain);
    osc.start(time);
    osc.stop(time + 0.42);

    const click = ctx.createOscillator();
    const clickAmp = ctx.createGain();
    click.type = "triangle";
    click.frequency.setValueAtTime(900, time);
    clickAmp.gain.setValueAtTime(0.25 * velocity, time);
    clickAmp.gain.exponentialRampToValueAtTime(0.0001, time + 0.02);
    click.connect(clickAmp).connect(gain);
    click.start(time);
    click.stop(time + 0.03);
  }

  return { name: "kick", label: "底鼓", output: gain, trigger };
}

export function createSnare(ctx, out) {
  const gain = ctx.createGain();
  gain.gain.value = 0.7;
  gain.connect(out);

  function trigger(time, velocity = 1) {
    const noise = makeNoiseBurst(ctx, time, 0.22);
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 1400;
    const noiseAmp = ctx.createGain();
    noiseAmp.gain.setValueAtTime(0.8 * velocity, time);
    noiseAmp.gain.exponentialRampToValueAtTime(0.0001, time + 0.2);
    noise.connect(hp).connect(noiseAmp).connect(gain);

    const osc = ctx.createOscillator();
    const oscAmp = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(220, time);
    osc.frequency.exponentialRampToValueAtTime(160, time + 0.08);
    oscAmp.gain.setValueAtTime(0.5 * velocity, time);
    oscAmp.gain.exponentialRampToValueAtTime(0.0001, time + 0.12);
    osc.connect(oscAmp).connect(gain);
    osc.start(time);
    osc.stop(time + 0.14);
  }

  return { name: "snare", label: "军鼓", output: gain, trigger };
}

export function createHihat(ctx, out, open = false) {
  const gain = ctx.createGain();
  gain.gain.value = 0.45;
  gain.connect(out);
  const dur = open ? 0.28 : 0.06;

  function trigger(time, velocity = 1) {
    const noise = makeNoiseBurst(ctx, time, dur + 0.02);
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 7000;
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0.7 * velocity, time);
    amp.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    noise.connect(hp).connect(amp).connect(gain);
  }

  return { name: "hihat", label: "踩镲", output: gain, trigger };
}

export function createClap(ctx, out) {
  const gain = ctx.createGain();
  gain.gain.value = 0.7;
  gain.connect(out);

  function trigger(time, velocity = 1) {
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1200;
    bp.Q.value = 1.2;
    const amp = ctx.createGain();
    // 三次短促噪声叠加模拟拍手
    const offsets = [0, 0.012, 0.026];
    offsets.forEach((off, i) => {
      const noise = makeNoiseBurst(ctx, time + off, 0.05);
      const a = ctx.createGain();
      const peak = (i === 2 ? 0.9 : 0.55) * velocity;
      a.gain.setValueAtTime(peak, time + off);
      a.gain.exponentialRampToValueAtTime(0.0001, time + off + 0.05);
      noise.connect(a).connect(bp);
    });
    amp.gain.setValueAtTime(0.9 * velocity, time + 0.026);
    amp.gain.exponentialRampToValueAtTime(0.0001, time + 0.2);
    bp.connect(amp).connect(gain);
  }

  return { name: "clap", label: "拍手", output: gain, trigger };
}

let noiseBuffer = null;
function makeNoiseBurst(ctx, time, duration) {
  if (!noiseBuffer) {
    const len = Math.floor(ctx.sampleRate * 1);
    noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer;
  src.loop = true;
  src.start(time);
  src.stop(time + duration + 0.05);
  return src;
}
