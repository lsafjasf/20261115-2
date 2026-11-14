/* 雾海双桨 —— Web Audio 方位提示与音效 */
(function () {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  let ctx = null;
  let master = null;
  let panner = null;
  let pingOsc = null;
  let pingGain = null;
  let ambientStarted = false;

  function ensure() {
    if (ctx) return true;
    if (!AudioCtx) return false;
    ctx = new AudioCtx();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);

    panner = ctx.createStereoPanner();
    panner.connect(master);

    pingOsc = ctx.createOscillator();
    pingOsc.type = "sine";
    pingOsc.frequency.value = 660;
    pingGain = ctx.createGain();
    pingGain.gain.value = 0.0;
    pingOsc.connect(pingGain);
    pingGain.connect(panner);
    pingOsc.start();
    startAmbient();
    return true;
  }

  function startAmbient() {
    if (ambientStarted) return;
    ambientStarted = true;
    const len = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.0;
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 420;
    const gain = ctx.createGain();
    gain.gain.value = 0.12;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start();
  }

  /* 方位提示：相对方位角 -> 声像与音高；越偏左越靠左耳，偏差越大音越急 */
  function updateBearing(relDeg, dist) {
    if (!ctx) return;
    const clamped = Math.max(-90, Math.min(90, relDeg));
    panner.pan.setTargetAtTime(clamped / 90, ctx.currentTime, 0.05);
    const offAxis = Math.min(1, Math.abs(relDeg) / 60);
    const freq = 660 + offAxis * 330;
    pingOsc.frequency.setTargetAtTime(freq, ctx.currentTime, 0.05);
    const near = Math.max(0.15, Math.min(0.5, 220 / Math.max(dist, 60) * 0.3));
    pingGain.gain.setTargetAtTime(near, ctx.currentTime, 0.1);
  }

  function blip(freq, dur, type, vol) {
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type || "sine";
    osc.frequency.value = freq;
    g.gain.setValueAtTime(vol || 0.3, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    osc.connect(g);
    g.connect(master);
    osc.start();
    osc.stop(ctx.currentTime + dur);
  }

  function gateChime() {
    blip(880, 0.4, "sine", 0.35);
    setTimeout(() => blip(1320, 0.5, "sine", 0.3), 120);
  }

  function rockThud() {
    blip(90, 0.5, "sawtooth", 0.5);
    blip(55, 0.7, "square", 0.3);
  }

  function winTune() {
    [523, 659, 784, 1046].forEach((f, i) =>
      setTimeout(() => blip(f, 0.5, "triangle", 0.35), i * 160)
    );
  }

  function loseTune() {
    [330, 262, 196, 131].forEach((f, i) =>
      setTimeout(() => blip(f, 0.6, "sawtooth", 0.25), i * 200)
    );
  }

  window.FogAudio = { ensure, updateBearing, gateChime, rockThud, winTune, loseTune };
})();
