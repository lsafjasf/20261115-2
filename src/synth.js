const DURATION = 20;
const BPM = 96;
const BEAT = 60 / BPM;
const BAR = BEAT * 4;
const STEP = BEAT / 4;
const BAR_COUNT = DURATION / BAR;

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let result = state;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function createNoiseBuffer(ctx, seconds, seed, smooth = 0) {
  const length = Math.ceil(seconds * ctx.sampleRate);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let channel = 0; channel < 2; channel += 1) {
    const data = buffer.getChannelData(channel);
    const random = mulberry32(seed + channel * 7919);
    let previous = 0;
    for (let index = 0; index < length; index += 1) {
      const white = random() * 2 - 1;
      previous = previous * smooth + white * (1 - smooth);
      data[index] = previous;
    }
  }
  return buffer;
}

function createGain(ctx, amount) {
  const node = ctx.createGain();
  node.gain.value = amount;
  return node;
}

function createPanner(ctx, pan) {
  const node = ctx.createStereoPanner();
  node.pan.value = pan;
  return node;
}

function scheduleEnvelope(ctx, node, start, peak, attack, decay) {
  node.gain.setValueAtTime(0.0001, start);
  node.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), start + attack);
  node.gain.exponentialRampToValueAtTime(0.0001, start + attack + decay);
}

function scheduleKick(ctx, destination, start) {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  const panner = createPanner(ctx, -0.02);
  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(154, start);
  oscillator.frequency.exponentialRampToValueAtTime(43, start + 0.14);
  scheduleEnvelope(ctx, gain, start, 0.69, 0.004, 0.42);
  oscillator.connect(gain).connect(panner).connect(destination);
  oscillator.start(start);
  oscillator.stop(start + 0.48);

  const click = ctx.createOscillator();
  const clickGain = ctx.createGain();
  click.type = "triangle";
  click.frequency.setValueAtTime(640, start);
  click.frequency.exponentialRampToValueAtTime(170, start + 0.032);
  scheduleEnvelope(ctx, clickGain, start, 0.055, 0.001, 0.045);
  click.connect(clickGain).connect(panner);
  click.start(start);
  click.stop(start + 0.08);
}

function scheduleSnare(ctx, destination, start, noiseBuffer) {
  const source = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  const panner = createPanner(ctx, 0.09);
  source.buffer = noiseBuffer;
  filter.type = "bandpass";
  filter.frequency.value = 1860;
  filter.Q.value = 0.8;
  scheduleEnvelope(ctx, gain, start, 0.23, 0.002, 0.2);
  source.connect(filter).connect(gain).connect(panner).connect(destination);
  source.start(start, 0.15, 0.34);

  const body = ctx.createOscillator();
  const bodyGain = ctx.createGain();
  body.type = "sine";
  body.frequency.setValueAtTime(184, start);
  body.frequency.exponentialRampToValueAtTime(122, start + 0.1);
  scheduleEnvelope(ctx, bodyGain, start, 0.13, 0.004, 0.11);
  body.connect(bodyGain).connect(panner);
  body.start(start);
  body.stop(start + 0.16);
}

function scheduleHat(ctx, destination, start, noiseBuffer, open, pan) {
  const source = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  const panner = createPanner(ctx, pan);
  source.buffer = noiseBuffer;
  filter.type = "highpass";
  filter.frequency.value = open ? 6100 : 7600;
  filter.Q.value = 0.55;
  scheduleEnvelope(ctx, gain, start, open ? 0.075 : 0.105, 0.001, open ? 0.22 : 0.055);
  source.connect(filter).connect(gain).connect(panner).connect(destination);
  source.start(start, 0.37, open ? 0.28 : 0.09);
}

function scheduleDrums(ctx, destination, noiseBuffer) {
  const random = mulberry32(90210);
  for (let bar = 0; bar < BAR_COUNT; bar += 1) {
    const barStart = bar * BAR;
    for (let beat = 0; beat < 4; beat += 1) {
      scheduleKick(ctx, destination, barStart + beat * BEAT);
    }
    scheduleSnare(ctx, destination, barStart + BEAT, noiseBuffer);
    scheduleSnare(ctx, destination, barStart + BEAT * 3, noiseBuffer);
    for (let step = 0; step < 16; step += 1) {
      const start = barStart + step * STEP;
      if (step % 4 === 2) {
        scheduleHat(ctx, destination, start, noiseBuffer, false, -0.22 + random() * 0.15);
      }
      if (step === 7 || step === 15) {
        scheduleHat(ctx, destination, start, noiseBuffer, true, 0.18);
      }
      if (step % 2 === 1 && random() > 0.18) {
        scheduleHat(ctx, destination, start, noiseBuffer, false, -0.4 + random() * 0.8);
      }
    }
  }
}

function scheduleBass(ctx, destination) {
  const roots = [55, 55, 43.65, 43.65, 65.41, 65.41, 49, 49];
  const pattern = [
    { step: 0, ratio: 1 },
    { step: 3, ratio: 1 },
    { step: 6, ratio: 1.5 },
    { step: 8, ratio: 1 },
    { step: 11, ratio: 2 },
    { step: 14, ratio: 1.5 },
  ];

  for (let bar = 0; bar < BAR_COUNT; bar += 1) {
    const root = roots[bar % roots.length];
    for (const note of pattern) {
      const start = bar * BAR + note.step * STEP;
      const frequency = root * note.ratio;
      const duration = 0.47;
      const oscillator = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();
      oscillator.type = "sawtooth";
      oscillator.frequency.value = frequency;
      oscillator.detune.value = 2;
      filter.type = "lowpass";
      filter.Q.value = 4.5;
      filter.frequency.setValueAtTime(1050, start);
      filter.frequency.exponentialRampToValueAtTime(280, start + duration * 0.85);
      scheduleEnvelope(ctx, gain, start, 0.2, 0.006, duration);
      oscillator.connect(filter).connect(gain).connect(destination);
      oscillator.start(start);
      oscillator.stop(start + duration + 0.02);

      const sub = ctx.createOscillator();
      const subGain = ctx.createGain();
      sub.type = "sine";
      sub.frequency.value = frequency / 2;
      scheduleEnvelope(ctx, subGain, start, 0.085, 0.008, duration * 0.85);
      sub.connect(subGain).connect(destination);
      sub.start(start);
      sub.stop(start + duration);
    }
  }
}

function scheduleAmbience(ctx, destination, noiseBuffer) {
  const droneBus = createGain(ctx, 0.8);
  const droneFilter = ctx.createBiquadFilter();
  droneFilter.type = "lowpass";
  droneFilter.frequency.value = 620;
  droneBus.connect(droneFilter).connect(destination);

  const droneGain = ctx.createGain();
  droneGain.gain.setValueAtTime(0.0001, 0);
  droneGain.gain.linearRampToValueAtTime(1, 0.4);
  droneGain.gain.setValueAtTime(1, DURATION - 0.45);
  droneGain.gain.linearRampToValueAtTime(0.0001, DURATION);
  droneGain.connect(droneBus);

  const droneNotes = [
    { frequency: 55, gain: 0.018, pan: -0.45 },
    { frequency: 82.41, gain: 0.013, pan: 0.4 },
    { frequency: 110, gain: 0.012, pan: 0.08 },
  ];
  for (const note of droneNotes) {
    const oscillator = ctx.createOscillator();
    const gain = createGain(ctx, note.gain);
    oscillator.type = "triangle";
    oscillator.frequency.value = note.frequency;
    oscillator.detune.value = note.frequency > 80 ? -4 : 3;
    oscillator.connect(gain).connect(createPanner(ctx, note.pan)).connect(droneGain);
    oscillator.start(0);
    oscillator.stop(DURATION);
  }

  const chords = [
    [110, 164.81, 220, 261.63],
    [87.31, 130.81, 174.61, 220],
    [130.81, 164.81, 196, 261.63],
    [98, 123.47, 146.83, 196],
  ];
  for (let chordIndex = 0; chordIndex < chords.length; chordIndex += 1) {
    const start = chordIndex * 5;
    const end = Math.min(DURATION, start + 4.92);
    const chordGain = ctx.createGain();
    const chordPanner = createPanner(
      ctx,
      [-0.46, 0.44, -0.18, 0.22][chordIndex],
    );
    chordGain.gain.setValueAtTime(0.0001, start);
    chordGain.gain.exponentialRampToValueAtTime(0.028, start + 1.15);
    chordGain.gain.setValueAtTime(0.028, end - 1.15);
    chordGain.gain.exponentialRampToValueAtTime(0.0001, end);
    chordGain.connect(chordPanner).connect(destination);
    for (let noteIndex = 0; noteIndex < chords[chordIndex].length; noteIndex += 1) {
      const frequency = chords[chordIndex][noteIndex];
      const oscillator = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      oscillator.type = noteIndex % 2 === 0 ? "sine" : "triangle";
      oscillator.frequency.value = frequency;
      oscillator.detune.value = (noteIndex - 1.5) * 4;
      filter.type = "lowpass";
      filter.frequency.value = 760 + noteIndex * 90;
      filter.Q.value = 0.7;
      oscillator.connect(filter).connect(chordGain);
      oscillator.start(start);
      oscillator.stop(end + 0.02);
    }
  }

  const wash = ctx.createBufferSource();
  const washFilter = ctx.createBiquadFilter();
  const washGain = ctx.createGain();
  const washPanner = createPanner(ctx, 0.22);
  wash.buffer = noiseBuffer;
  washFilter.type = "bandpass";
  washFilter.frequency.value = 520;
  washFilter.Q.value = 0.55;
  washGain.gain.value = 0.038;
  wash.connect(washFilter).connect(washGain).connect(washPanner).connect(destination);
  wash.start(0);
  wash.stop(DURATION);

  const swell = ctx.createOscillator();
  const swellGain = ctx.createGain();
  swell.type = "sine";
  swell.frequency.value = 0.075;
  swellGain.gain.value = 0.013;
  swell.connect(swellGain).connect(washGain.gain);
  swell.start(0);
  swell.stop(DURATION);
}

function scheduleBell(ctx, destination, start, frequency, pan) {
  const carrier = ctx.createOscillator();
  const modulator = ctx.createOscillator();
  const modGain = ctx.createGain();
  const gain = ctx.createGain();
  const panner = createPanner(ctx, pan);
  carrier.type = "sine";
  carrier.frequency.value = frequency;
  modulator.type = "sine";
  modulator.frequency.value = frequency * 2.01;
  modGain.gain.setValueAtTime(520, start);
  modGain.gain.exponentialRampToValueAtTime(30, start + 1.1);
  scheduleEnvelope(ctx, gain, start, 0.085, 0.008, 1.45);
  modulator.connect(modGain).connect(carrier.frequency);
  carrier.connect(gain).connect(panner).connect(destination);
  modulator.start(start);
  carrier.start(start);
  modulator.stop(start + 1.55);
  carrier.stop(start + 1.55);
}

function scheduleCue(ctx, destination) {
  const motifs = [
    { at: 5, notes: [880, 1046.5, 1318.5] },
    { at: 10, notes: [698.46, 880, 1046.5] },
    { at: 15, notes: [783.99, 987.77, 1174.7] },
    { at: 18.125, notes: [1046.5, 1318.5] },
  ];
  for (let motifIndex = 0; motifIndex < motifs.length; motifIndex += 1) {
    const motif = motifs[motifIndex];
    for (let noteIndex = 0; noteIndex < motif.notes.length; noteIndex += 1) {
      scheduleBell(
        ctx,
        destination,
        motif.at + noteIndex * 0.145,
        motif.notes[noteIndex],
        -0.34 + noteIndex * 0.25,
      );
    }
  }
}

export async function renderTrackData(
  trackId,
  sampleRate,
  duration,
  OfflineAudioContextCtor,
) {
  const frameCount = Math.ceil(sampleRate * duration);
  const ctx = new OfflineAudioContextCtor(2, frameCount, sampleRate);
  const destination = ctx.createGain();
  destination.gain.value = 0.92;
  destination.connect(ctx.destination);
  const noiseLong = createNoiseBuffer(ctx, 2.5, 451, 0.04);
  const noiseWash = createNoiseBuffer(ctx, duration, 773, 0.88);

  const fadeEdges = (buffer, seconds = 0.012) => {
    const fadeFrames = Math.ceil(seconds * sampleRate);
    for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
      const data = buffer.getChannelData(channel);
      for (let index = 0; index < fadeFrames; index += 1) {
        const amount = index / fadeFrames;
        data[index] *= amount;
        data[data.length - 1 - index] *= amount;
      }
    }
  };
  fadeEdges(noiseWash);

  if (trackId === "drums") scheduleDrums(ctx, destination, noiseLong);
  if (trackId === "bass") scheduleBass(ctx, destination);
  if (trackId === "ambience") scheduleAmbience(ctx, destination, noiseWash);
  if (trackId === "cue") scheduleCue(ctx, destination);

  const rendered = await ctx.startRendering();
  return [0, 1].map((channel) => {
    const data = new Float32Array(rendered.length);
    rendered.copyFromChannel(data, channel);
    return data;
  });
}

export function findPeak(channels) {
  let peak = 0;
  for (const channel of channels) {
    for (let index = 0; index < channel.length; index += 1) {
      peak = Math.max(peak, Math.abs(channel[index]));
    }
  }
  return peak;
}
