(function attachAudio(root, factory) {
  if (root) root.CryoAudio = factory();
})(typeof window !== "undefined" ? window : null, () => {
  function createFanSound() {
    let audioContext = null;
    let master = null;
    let fanOsc = null;
    let fanOsc2 = null;
    let fanGain = null;
    let lowpass = null;
    let noiseSource = null;
    let noiseGain = null;
    let noiseFilter = null;
    let alarmOsc = null;
    let alarmGain = null;
    let enabled = false;
    let mode = "idle";
    let frequency = 0;
    let noiseLevel = 0;
    let lastError = null;

    function createNoiseBuffer(context) {
      const length = Math.floor(context.sampleRate * 1.5);
      const buffer = context.createBuffer(1, length, context.sampleRate);
      const channel = buffer.getChannelData(0);
      let previous = 0;
      for (let i = 0; i < length; i += 1) {
        const white = Math.random() * 2 - 1;
        previous = previous * 0.72 + white * 0.28;
        channel[i] = previous * 0.75;
      }
      return buffer;
    }

    function buildGraph() {
      const AudioCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtor) throw new Error("Web Audio unavailable");
      audioContext = new AudioCtor();
      master = audioContext.createGain();
      master.gain.value = 0.42;
      master.connect(audioContext.destination);

      lowpass = audioContext.createBiquadFilter();
      lowpass.type = "lowpass";
      lowpass.frequency.value = 620;
      lowpass.Q.value = 0.8;

      fanGain = audioContext.createGain();
      fanGain.gain.value = 0.0001;
      fanGain.connect(lowpass);
      lowpass.connect(master);

      fanOsc = audioContext.createOscillator();
      fanOsc.type = "sawtooth";
      fanOsc.frequency.value = 76;
      fanOsc.connect(fanGain);

      fanOsc2 = audioContext.createOscillator();
      fanOsc2.type = "triangle";
      fanOsc2.frequency.value = 152;
      const secondGain = audioContext.createGain();
      secondGain.gain.value = 0.18;
      fanOsc2.connect(secondGain);
      secondGain.connect(fanGain);

      noiseFilter = audioContext.createBiquadFilter();
      noiseFilter.type = "bandpass";
      noiseFilter.frequency.value = 760;
      noiseFilter.Q.value = 0.55;
      noiseGain = audioContext.createGain();
      noiseGain.gain.value = 0.0001;
      noiseSource = audioContext.createBufferSource();
      noiseSource.buffer = createNoiseBuffer(audioContext);
      noiseSource.loop = true;
      noiseSource.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(master);

      alarmGain = audioContext.createGain();
      alarmGain.gain.value = 0.0001;
      alarmOsc = audioContext.createOscillator();
      alarmOsc.type = "square";
      alarmOsc.frequency.value = 720;
      const alarmFilter = audioContext.createBiquadFilter();
      alarmFilter.type = "lowpass";
      alarmFilter.frequency.value = 1200;
      alarmOsc.connect(alarmFilter);
      alarmFilter.connect(alarmGain);
      alarmGain.connect(master);

      fanOsc.start();
      fanOsc2.start();
      noiseSource.start();
      alarmOsc.start();
    }

    async function enable() {
      try {
        if (!audioContext) buildGraph();
        if (audioContext.state === "suspended") await audioContext.resume();
        master.gain.setTargetAtTime(0.42, audioContext.currentTime, 0.04);
        enabled = true;
        lastError = null;
        return true;
      } catch (error) {
        enabled = false;
        lastError = String(error.message || error);
        return false;
      }
    }

    async function disable() {
      enabled = false;
      if (!audioContext) return;
      try {
        master.gain.setTargetAtTime(0.0001, audioContext.currentTime, 0.04);
        await audioContext.suspend();
      } catch (error) {
        lastError = String(error.message || error);
      }
    }

    function update(snapshot) {
      const running = snapshot.status === "running";
      const rpm = snapshot.rpm || 0;
      const blocked = snapshot.blockage;
      mode = blocked ? "blocked" : running ? "fanning" : "idle";
      frequency = blocked ? 31 + rpm * 0.022 : running ? 39 + rpm * 0.052 : 0;
      noiseLevel = running
        ? Number((blocked ? 0.012 : 0.018 + snapshot.effectiveAir * 0.08).toFixed(4))
        : 0;

      if (!audioContext || !enabled) return;
      const now = audioContext.currentTime;
      try {
        fanOsc.frequency.setTargetAtTime(frequency || 28, now, 0.08);
        fanOsc2.frequency.setTargetAtTime((frequency || 28) * 1.98, now, 0.08);
        lowpass.frequency.setTargetAtTime(blocked ? 170 : 360 + rpm * 0.34, now, 0.09);
        fanGain.gain.setTargetAtTime(
          running ? (blocked ? 0.018 : 0.022 + snapshot.effectiveAir * 0.035) : 0.0001,
          now,
          0.08
        );
        noiseFilter.frequency.setTargetAtTime(blocked ? 150 : 420 + rpm * 0.44, now, 0.08);
        noiseGain.gain.setTargetAtTime(running ? noiseLevel : 0.0001, now, 0.08);
        alarmGain.gain.setTargetAtTime(blocked ? 0.014 : 0.0001, now, 0.04);
        if (blocked) {
          alarmOsc.frequency.setTargetAtTime(
            520 + Math.sin(now * 7.5) * 90,
            now,
            0.025
          );
        }
      } catch (error) {
        lastError = String(error.message || error);
      }
    }

    function getState() {
      return {
        enabled,
        mode,
        frequency: Number(frequency.toFixed(1)),
        noiseLevel,
        contextState: audioContext ? audioContext.state : "uninitialized",
        lastError
      };
    }

    return { enable, disable, update, getState, isEnabled: () => enabled };
  }

  return { createFanSound };
});
