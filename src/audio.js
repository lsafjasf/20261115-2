import { BPM } from "./scene.js";

const SAMPLE_RATE = 48000;

function makeNoiseBuffer(context, seconds = 1.5) {
  const length = Math.floor(context.sampleRate * seconds);
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  let seed = 2026;
  for (let index = 0; index < length; index += 1) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    data[index] = (seed / 0xffffffff) * 2 - 1;
  }
  return buffer;
}

function scheduleKick(context, destination, at, velocity = 1) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(132, at);
  oscillator.frequency.exponentialRampToValueAtTime(43, at + 0.12);
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(0.72 * velocity, at + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.28);
  oscillator.connect(gain).connect(destination);
  oscillator.start(at);
  oscillator.stop(at + 0.3);
}

function scheduleSnare(context, destination, noiseBuffer, at, velocity = 1) {
  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const gain = context.createGain();
  source.buffer = noiseBuffer;
  filter.type = "highpass";
  filter.frequency.value = 1100;
  filter.Q.value = 0.6;
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(0.22 * velocity, at + 0.003);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.16);
  source.connect(filter).connect(gain).connect(destination);
  source.start(at, 0, 0.18);

  const body = context.createOscillator();
  const bodyGain = context.createGain();
  body.type = "triangle";
  body.frequency.setValueAtTime(185, at);
  body.frequency.exponentialRampToValueAtTime(105, at + 0.08);
  bodyGain.gain.setValueAtTime(0.0001, at);
  bodyGain.gain.exponentialRampToValueAtTime(0.12 * velocity, at + 0.004);
  bodyGain.gain.exponentialRampToValueAtTime(0.0001, at + 0.11);
  body.connect(bodyGain).connect(destination);
  body.start(at);
  body.stop(at + 0.13);
}

function scheduleHat(context, destination, noiseBuffer, at, open = false) {
  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const gain = context.createGain();
  source.buffer = noiseBuffer;
  filter.type = "highpass";
  filter.frequency.value = 7200;
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(open ? 0.08 : 0.045, at + 0.002);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + (open ? 0.18 : 0.045));
  source.connect(filter).connect(gain).connect(destination);
  source.start(at, open ? 0.18 : 0.02, open ? 0.2 : 0.055);
}

function scheduleBass(context, destination, at, frequency, duration) {
  const oscillator = context.createOscillator();
  const filter = context.createBiquadFilter();
  const gain = context.createGain();
  oscillator.type = "sawtooth";
  oscillator.frequency.value = frequency;
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(520, at);
  filter.frequency.exponentialRampToValueAtTime(155, at + duration);
  filter.Q.value = 4;
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(0.075, at + 0.01);
  gain.gain.setValueAtTime(0.06, at + duration * 0.55);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + duration * 0.94);
  oscillator.connect(filter).connect(gain).connect(destination);
  oscillator.start(at);
  oscillator.stop(at + duration);
}

export async function renderBeatBuffer({
  duration,
  startTime = 0,
  sampleRate = SAMPLE_RATE,
  bpm = BPM,
}) {
  const frameCount = Math.max(1, Math.ceil(duration * sampleRate));
  const OfflineContext = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const context = new OfflineContext(2, frameCount, sampleRate);
  const master = context.createGain();
  const compressor = context.createDynamicsCompressor();
  master.gain.value = 0.72;
  compressor.threshold.value = -12;
  compressor.knee.value = 12;
  compressor.ratio.value = 3;
  compressor.attack.value = 0.004;
  compressor.release.value = 0.16;
  master.connect(compressor).connect(context.destination);

  const noise = makeNoiseBuffer(context);
  const beatLength = 60 / bpm;
  const firstBeat = Math.max(0, Math.floor(startTime / beatLength));
  const lastGlobalTime = startTime + duration;
  const notes = [55, 55, 65.41, 49, 55, 73.42, 65.41, 49];

  for (let beatIndex = firstBeat; beatIndex * beatLength < lastGlobalTime; beatIndex += 1) {
    const local = beatIndex * beatLength - startTime;
    if (local < -0.05) continue;
    const subBeat = beatIndex % 4;

    scheduleKick(context, master, local, subBeat === 0 ? 1 : 0.86);
    scheduleHat(context, master, noise, local + beatLength * 0.5, subBeat === 3);
    if (subBeat === 1 || subBeat === 3) {
      scheduleSnare(context, master, noise, local, 1);
    }
    scheduleBass(
      context,
      master,
      local,
      notes[((beatIndex % notes.length) + notes.length) % notes.length],
      beatLength * 0.82,
    );
  }

  const fadeStart = Math.max(0, duration - 0.08);
  if (fadeStart < duration) {
    master.gain.setValueAtTime(master.gain.value, fadeStart);
    master.gain.linearRampToValueAtTime(0.0001, duration);
  }

  return context.startRendering();
}

export class BeatPlayer {
  constructor() {
    this.context = null;
    this.buffer = null;
    this.source = null;
    this.offset = 0;
    this.startedAt = 0;
    this.rendering = null;
  }

  async ensure() {
    if (!this.context) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.context = new AudioContext({ sampleRate: SAMPLE_RATE });
    }
    if (this.context.state === "suspended") {
      await this.context.resume();
    }
    if (!this.buffer && !this.rendering) {
      this.rendering = renderBeatBuffer({
        duration: 20,
        startTime: 0,
        sampleRate: this.context.sampleRate,
      });
    }
    if (this.rendering) {
      this.buffer = await this.rendering;
      this.rendering = null;
    }
    return this.context;
  }

  async play(offset) {
    await this.ensure();
    this.stop();
    this.offset = offset;
    this.source = this.context.createBufferSource();
    const gain = this.context.createGain();
    gain.gain.value = 0.68;
    this.source.buffer = this.buffer;
    this.source.connect(gain).connect(this.context.destination);
    this.source.start(0, Math.min(offset, 19.99));
    this.startedAt = this.context.currentTime;
  }

  stop() {
    if (this.source) {
      try {
        this.source.stop();
      } catch {
        // A finished source can already be detached.
      }
      this.source.disconnect();
      this.source = null;
    }
  }

  get isPlaying() {
    return Boolean(this.source);
  }

  get audioTime() {
    if (!this.source || !this.context) return this.offset;
    return this.offset + (this.context.currentTime - this.startedAt);
  }
}

export async function createExportAudioTrack(clipStart, duration) {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  const context = new AudioContext({ sampleRate: SAMPLE_RATE });
  if (context.state === "suspended") await context.resume();
  const buffer = await renderBeatBuffer({
    duration,
    startTime: clipStart,
    sampleRate: context.sampleRate,
  });
  const source = context.createBufferSource();
  const gain = context.createGain();
  const destination = context.createMediaStreamDestination();
  source.buffer = buffer;
  gain.gain.value = 0.72;
  source.connect(gain).connect(destination);
  return {
    stream: destination.stream,
    start: () => source.start(),
    stop: () => {
      try {
        source.stop();
      } catch {
        // The source may have already completed.
      }
      source.disconnect();
      context.close();
    },
  };
}
