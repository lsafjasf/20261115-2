import {
  DEFAULT_PROJECT,
  TRACK_ORDER,
  dbToGain,
  normalizeProject,
} from "./project.js";
import { renderTrackData } from "./synth.js";

export const CLIP_DBFS = -1;
export const CLIP_PEAK = 10 ** (CLIP_DBFS / 20);

function createAudioBuffer(ctx, channels, sampleRate) {
  const frameCount = channels[0].length;
  const buffer = ctx.createBuffer(2, frameCount, sampleRate);
  for (let channel = 0; channel < 2; channel += 1) {
    buffer.copyToChannel(channels[channel], channel);
  }
  return buffer;
}

function createTrackChain(ctx, bus, settings, data) {
  const source = ctx.createBufferSource();
  const buffer = createAudioBuffer(ctx, data, ctx.sampleRate);
  const fader = ctx.createGain();
  const panner = ctx.createStereoPanner();
  const dry = ctx.createGain();
  const delaySend = ctx.createGain();
  const delay = ctx.createDelay(0.5);
  const feedback = ctx.createGain();
  const wet = ctx.createGain();
  const mute = ctx.createGain();
  const analyser = ctx.createAnalyser();

  source.buffer = buffer;
  source.loop = true;
  source.loopStart = 0;
  source.loopEnd = buffer.duration;
  fader.gain.value = dbToGain(settings.gainDb);
  panner.pan.value = settings.pan;
  dry.gain.value = 1;
  delaySend.gain.value = 1;
  delay.delayTime.value = Math.max(0.001, settings.delayMs / 1000);
  feedback.gain.value = 0.24;
  wet.gain.value = settings.delayMs > 1 ? 0.3 : 0;
  mute.gain.value = settings.muted ? 0 : 1;
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0;

  source.connect(fader).connect(panner);
  panner.connect(dry).connect(mute);
  panner.connect(delaySend).connect(delay).connect(wet).connect(mute);
  delay.connect(feedback).connect(delay);
  mute.connect(analyser).connect(bus);

  return {
    id: settings.id,
    source,
    fader,
    panner,
    delay,
    wet,
    mute,
    feedback,
    analyser,
    data: new Float32Array(analyser.fftSize),
  };
}

function configureCompressor(compressor, bus) {
  compressor.threshold.value = bus.threshold;
  compressor.knee.value = bus.knee;
  compressor.ratio.value = bus.ratio;
  compressor.attack.value = bus.attack;
  compressor.release.value = bus.release;
}

export function buildMixGraph(ctx, projectInput, trackData, options = {}) {
  const project = normalizeProject(projectInput);
  const bus = ctx.createGain();
  const compressor = ctx.createDynamicsCompressor();
  const master = ctx.createGain();
  const masterAnalyser = ctx.createAnalyser();
  const destination = options.destination || ctx.destination;

  configureCompressor(compressor, project.bus);
  master.gain.value = dbToGain(project.masterGainDb);
  masterAnalyser.fftSize = 1024;
  masterAnalyser.smoothingTimeConstant = 0;
  bus.connect(compressor).connect(master).connect(masterAnalyser).connect(destination);

  const tracks = new Map();
  for (const settings of project.tracks) {
    const data = trackData[settings.id];
    if (!data) throw new Error(`Missing synthesized data for ${settings.id}`);
    tracks.set(settings.id, createTrackChain(ctx, bus, settings, data));
  }

  return {
    ctx,
    project,
    bus,
    compressor,
    master,
    masterAnalyser,
    masterData: new Float32Array(masterAnalyser.fftSize),
    tracks,
  };
}

export function updateMixGraph(graph, projectInput, when = graph.ctx.currentTime) {
  const project = normalizeProject(projectInput);
  graph.project = project;
  for (const settings of project.tracks) {
    const track = graph.tracks.get(settings.id);
    if (!track) continue;
    track.fader.gain.setTargetAtTime(dbToGain(settings.gainDb), when, 0.025);
    track.panner.pan.setTargetAtTime(settings.pan, when, 0.025);
    track.delay.delayTime.setTargetAtTime(settings.delayMs / 1000, when, 0.035);
    track.wet.gain.setTargetAtTime(settings.delayMs > 1 ? 0.3 : 0, when, 0.035);
    track.mute.gain.setTargetAtTime(settings.muted ? 0 : 1, when, 0.012);
  }
  configureCompressor(graph.compressor, project.bus);
  graph.master.gain.setTargetAtTime(dbToGain(project.masterGainDb), when, 0.025);
}

export function analyserPeak(analyser, data) {
  analyser.getFloatTimeDomainData(data);
  let peak = 0;
  for (let index = 0; index < data.length; index += 1) {
    peak = Math.max(peak, Math.abs(data[index]));
  }
  return peak;
}

export function readGraphLevels(graph) {
  const tracks = {};
  for (const id of TRACK_ORDER) {
    const track = graph.tracks.get(id);
    tracks[id] = tracePeak(track ? analyserPeak(track.analyser, track.data) : 0);
  }
  return {
    tracks,
    master: tracePeak(
      analyserPeak(graph.masterAnalyser, graph.masterData),
    ),
    reduction: graph.compressor.reduction,
  };
}

function tracePeak(peak) {
  return Math.max(0, Math.min(1.5, peak));
}

export class LiveMixer {
  constructor(ctx, project, trackData) {
    this.ctx = ctx;
    this.graph = buildMixGraph(ctx, project, trackData);
    this.playing = false;
    this.startedAt = 0;
  }

  start() {
    if (this.playing) return;
    const startAt = this.ctx.currentTime + 0.06;
    for (const track of this.graph.tracks.values()) {
      track.source.start(startAt);
    }
    this.startedAt = startAt;
    this.playing = true;
  }

  stop() {
    if (!this.playing) return;
    for (const track of this.graph.tracks.values()) {
      try {
        track.source.stop();
      } catch {
        continue;
      }
    }
    this.disconnect();
    this.playing = false;
  }

  disconnect() {
    for (const track of this.graph.tracks.values()) {
      try {
        track.source.disconnect();
      } catch {
        continue;
      }
    }
  }

  dispose() {
    this.stop();
    try {
      this.graph.bus.disconnect();
      this.graph.compressor.disconnect();
      this.graph.master.disconnect();
      this.graph.masterAnalyser.disconnect();
    } catch {
      return;
    }
  }

  update(project) {
    updateMixGraph(this.graph, project);
  }

  position() {
    if (!this.playing) return 0;
    const elapsed = this.ctx.currentTime - this.startedAt;
    if (elapsed < 0) return 0;
    const duration = this.graph.project.loopSeconds;
    return ((elapsed % duration) + duration) % duration;
  }

  levels() {
    return readGraphLevels(this.graph);
  }
}

export async function renderMix(
  projectInput,
  {
    sampleRate = 48000,
    duration = 20,
    OfflineAudioContextCtor,
    trackData = null,
  } = {},
) {
  const project = normalizeProject({ ...projectInput, loopSeconds: duration });
  if (!OfflineAudioContextCtor) {
    throw new Error("OfflineAudioContext constructor is required");
  }
  let data = trackData;
  if (!data) {
    const entries = await Promise.all(
      TRACK_ORDER.map(async (id) => [
        id,
        await renderTrackData(id, sampleRate, duration, OfflineAudioContextCtor),
      ]),
    );
    data = Object.fromEntries(entries);
  }
  const frameCount = Math.ceil(sampleRate * duration);
  const ctx = new OfflineAudioContextCtor(2, frameCount, sampleRate);
  const graph = buildMixGraph(ctx, project, data);
  for (const track of graph.tracks.values()) track.source.start(0);
  const rendered = await ctx.startRendering();
  return { buffer: rendered, project, trackData: data };
}

export { DEFAULT_PROJECT };
