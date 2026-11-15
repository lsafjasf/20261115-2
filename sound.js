export const LOOP_SECONDS = 8;
export const STEP_SECONDS = 0.25;
export const MAX_NODE_TIME = LOOP_SECONDS - STEP_SECONDS;
export const MASK_WINDOW = 0.38;

export const TRACKS = [
  {
    id: "cicada",
    name: "蝉翼",
    latin: "Cicada wing",
    band: "4.7 kHz · pulse",
    color: "#c8d873",
    duration: 0.72,
    pan: -0.32,
  },
  {
    id: "drop",
    name: "悬滴",
    latin: "Canopy drip",
    band: "1.3→0.2 kHz",
    color: "#6fd1c4",
    duration: 0.52,
    pan: 0.26,
  },
  {
    id: "bird",
    name: "雀鸣",
    latin: "Wren call",
    band: "1.7→3.5 kHz",
    color: "#e69a68",
    duration: 0.92,
    pan: -0.18,
  },
  {
    id: "frog",
    name: "树蛙",
    latin: "Tree frog",
    band: "160 · 105 Hz",
    color: "#ad9bd6",
    duration: 0.78,
    pan: 0.12,
  },
  {
    id: "leaf",
    name: "叶雨",
    latin: "Leaf rain",
    band: "1.9 kHz · grain",
    color: "#85c7a4",
    duration: 1.1,
    pan: 0.34,
  },
  {
    id: "pod",
    name: "果壳",
    latin: "Seed rattle",
    band: "6.4 kHz · dry",
    color: "#d7b65e",
    duration: 1.18,
    pan: -0.42,
  },
];

export const PRESETS = {
  dawn: {
    id: "dawn",
    code: "A",
    name: "晨雾",
    times: {
      cicada: 0.75,
      drop: 2.25,
      bird: 3.6,
      frog: 4.9,
      leaf: 6.25,
      pod: 7.1,
    },
  },
  squall: {
    id: "squall",
    code: "B",
    name: "骤雨",
    times: {
      cicada: 0.15,
      drop: 0.45,
      bird: 0.75,
      frog: 2.85,
      leaf: 6.72,
      pod: 7.02,
    },
  },
};

const noiseCache = new WeakMap();

function getNoiseBuffer(ctx) {
  if (noiseCache.has(ctx)) return noiseCache.get(ctx);

  const length = Math.ceil(ctx.sampleRate * 1.5);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let value = 0.719;
  for (let i = 0; i < length; i += 1) {
    value = (value * 16807) % 2147483647;
    data[i] = (value / 2147483647) * 2 - 1;
  }
  noiseCache.set(ctx, buffer);
  return buffer;
}

function noise(ctx, when, duration) {
  const source = ctx.createBufferSource();
  source.buffer = getNoiseBuffer(ctx);
  source.loop = true;
  source.start(when);
  source.stop(when + duration);
  return source;
}

function schedulePan(ctx, node, pan) {
  if (!ctx.createStereoPanner) return node;
  const panner = ctx.createStereoPanner();
  panner.pan.value = pan;
  node.connect(panner);
  return panner;
}

function pulseEnvelope(param, when, peaks, peakLevel, tail = 0.01) {
  param.cancelScheduledValues(when);
  param.setValueAtTime(0.0001, when);
  for (const pulse of peaks) {
    const start = when + pulse.at;
    param.exponentialRampToValueAtTime(
      Math.max(0.0002, peakLevel * pulse.level),
      start + 0.012,
    );
    param.exponentialRampToValueAtTime(0.0001, start + pulse.length + tail);
  }
}

function synthCicada(ctx, when, destination, track) {
  const out = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  const air = ctx.createBiquadFilter();
  const source = noise(ctx, when, track.duration);

  filter.type = "bandpass";
  filter.frequency.setValueAtTime(4680, when);
  filter.frequency.linearRampToValueAtTime(5120, when + 0.42);
  filter.Q.value = 13;
  air.type = "highpass";
  air.frequency.value = 3100;

  const pulses = Array.from({ length: 8 }, (_, index) => ({
    at: index * 0.08,
    length: 0.052 + (index % 2) * 0.008,
    level: 0.66 + (index % 3) * 0.12,
  }));
  pulseEnvelope(out.gain, when, pulses, 0.18);

  source.connect(filter);
  filter.connect(air);
  air.connect(out);
  schedulePan(ctx, out, track.pan).connect(destination);
  return [source];
}

function synthDrop(ctx, when, destination, track) {
  const out = ctx.createGain();
  const osc = ctx.createOscillator();
  const clickGain = ctx.createGain();
  const clickFilter = ctx.createBiquadFilter();
  const click = noise(ctx, when, 0.055);

  osc.type = "sine";
  osc.frequency.setValueAtTime(1280, when);
  osc.frequency.exponentialRampToValueAtTime(430, when + 0.18);
  osc.frequency.exponentialRampToValueAtTime(205, when + 0.36);

  out.gain.setValueAtTime(0.0001, when);
  out.gain.exponentialRampToValueAtTime(0.34, when + 0.008);
  out.gain.exponentialRampToValueAtTime(0.0001, when + 0.47);

  clickFilter.type = "highpass";
  clickFilter.frequency.value = 2400;
  clickGain.gain.setValueAtTime(0.07, when);
  clickGain.gain.exponentialRampToValueAtTime(0.0001, when + 0.045);

  osc.connect(out);
  click.connect(clickFilter);
  clickFilter.connect(clickGain);
  clickGain.connect(out);
  schedulePan(ctx, out, track.pan).connect(destination);
  osc.start(when);
  osc.stop(when + 0.49);
  return [osc, click];
}

function synthBird(ctx, when, destination, track) {
  const out = ctx.createGain();
  const osc = ctx.createOscillator();
  const lfo = ctx.createOscillator();
  const lfoDepth = ctx.createGain();
  const harmonic = ctx.createGain();

  osc.type = "sine";
  harmonic.gain.value = 0.12;
  osc.frequency.setValueAtTime(1660, when);
  osc.frequency.exponentialRampToValueAtTime(2860, when + 0.13);
  osc.frequency.exponentialRampToValueAtTime(2180, when + 0.26);
  osc.frequency.setValueAtTime(2350, when + 0.36);
  osc.frequency.exponentialRampToValueAtTime(3660, when + 0.55);
  osc.frequency.exponentialRampToValueAtTime(2680, when + 0.79);

  lfo.type = "sine";
  lfo.frequency.value = 26;
  lfoDepth.gain.value = 22;

  pulseEnvelope(
    out.gain,
    when,
    [
      { at: 0.02, length: 0.22, level: 0.75 },
      { at: 0.34, length: 0.43, level: 1 },
    ],
    0.13,
    0.005,
  );

  lfo.connect(lfoDepth);
  lfoDepth.connect(osc.frequency);
  osc.connect(out);
  osc.connect(harmonic);
  harmonic.connect(out);
  schedulePan(ctx, out, track.pan).connect(destination);
  osc.start(when);
  lfo.start(when);
  osc.stop(when + 0.88);
  lfo.stop(when + 0.88);
  return [osc, lfo];
}

function synthFrog(ctx, when, destination, track) {
  const out = ctx.createGain();
  const osc = ctx.createOscillator();
  const overtone = ctx.createOscillator();
  const overtoneGain = ctx.createGain();
  const filter = ctx.createBiquadFilter();

  osc.type = "sine";
  osc.frequency.setValueAtTime(158, when);
  osc.frequency.exponentialRampToValueAtTime(112, when + 0.68);
  overtone.type = "triangle";
  overtone.frequency.setValueAtTime(228, when);
  overtone.frequency.exponentialRampToValueAtTime(166, when + 0.68);
  overtoneGain.gain.value = 0.16;
  filter.type = "lowpass";
  filter.frequency.value = 540;
  filter.Q.value = 2.5;

  pulseEnvelope(
    out.gain,
    when,
    [
      { at: 0.03, length: 0.12, level: 0.9 },
      { at: 0.25, length: 0.1, level: 0.7 },
      { at: 0.49, length: 0.14, level: 1 },
    ],
    0.2,
    0.012,
  );

  osc.connect(filter);
  overtone.connect(overtoneGain);
  overtoneGain.connect(filter);
  filter.connect(out);
  schedulePan(ctx, out, track.pan).connect(destination);
  osc.start(when);
  overtone.start(when);
  osc.stop(when + 0.75);
  overtone.stop(when + 0.75);
  return [osc, overtone];
}

function synthLeaf(ctx, when, destination, track) {
  const out = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  const body = ctx.createBiquadFilter();
  const source = noise(ctx, when, track.duration);

  filter.type = "bandpass";
  filter.frequency.setValueAtTime(1750, when);
  filter.frequency.linearRampToValueAtTime(2260, when + 0.38);
  filter.frequency.linearRampToValueAtTime(1550, when + 0.78);
  filter.Q.value = 0.8;
  body.type = "highpass";
  body.frequency.value = 680;

  const pulses = Array.from({ length: 12 }, (_, index) => ({
    at: index * 0.083 + (index % 3) * 0.009,
    length: 0.042 + (index % 4) * 0.008,
    level: 0.32 + ((index * 7) % 5) * 0.13,
  }));
  pulseEnvelope(out.gain, when, pulses, 0.075, 0.018);

  source.connect(filter);
  filter.connect(body);
  body.connect(out);
  schedulePan(ctx, out, track.pan).connect(destination);
  return [source];
}

function synthPod(ctx, when, destination, track) {
  const out = ctx.createGain();
  const airTail = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  const body = ctx.createBiquadFilter();
  const source = noise(ctx, when, track.duration);

  filter.type = "bandpass";
  filter.frequency.setValueAtTime(6300, when);
  filter.frequency.linearRampToValueAtTime(6900, when + 0.52);
  filter.frequency.linearRampToValueAtTime(5400, when + 1.08);
  filter.Q.value = 2.2;
  body.type = "highpass";
  body.frequency.value = 3900;

  const pulses = Array.from({ length: 15 }, (_, index) => ({
    at: index * 0.072 + (index % 5) * 0.006,
    length: 0.025 + (index % 3) * 0.004,
    level: 0.58 + ((index * 3) % 6) * 0.075,
  }));
  pulseEnvelope(out.gain, when, pulses, 0.045, 0.014);
  airTail.gain.setValueAtTime(0.0001, when);
  airTail.gain.exponentialRampToValueAtTime(0.018, when + 0.055);
  airTail.gain.setValueAtTime(0.014, when + 0.65);
  airTail.gain.setValueAtTime(0.011, when + 1.02);
  airTail.gain.exponentialRampToValueAtTime(0.0001, when + 1.16);

  source.connect(filter);
  filter.connect(body);
  body.connect(out);
  body.connect(airTail);
  const panner = schedulePan(ctx, out, track.pan);
  panner.connect(destination);
  airTail.connect(panner);
  return [source];
}

const SYNTHS = {
  cicada: synthCicada,
  drop: synthDrop,
  bird: synthBird,
  frog: synthFrog,
  leaf: synthLeaf,
  pod: synthPod,
};

export function scheduleVoice(ctx, trackId, when, destination) {
  const track = TRACKS.find((item) => item.id === trackId);
  if (!track || !SYNTHS[trackId]) return [];
  const sources = SYNTHS[trackId](ctx, when, destination, track);
  for (const source of sources) source.__endTime = when + track.duration + 0.06;
  return sources;
}

export function schedulePattern(ctx, pattern, startAt, destination) {
  const sources = [];
  for (const track of TRACKS) {
    const time = pattern.times[track.id];
    sources.push(
      ...scheduleVoice(ctx, track.id, startAt + time, destination),
    );
  }
  return sources;
}

export class ForestAudio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.analyser = null;
    this.laneGains = new Map();
    this.sources = [];
    this.playing = false;
    this.anchor = 0;
    this.loopIndex = 0;
    this.eventCursor = 0;
    this.events = [];
    this.scheduler = null;
    this.pattern = null;
    this.pendingPattern = null;
    this.muted = new Map(TRACKS.map((track) => [track.id, false]));
  }

  ensure() {
    if (this.ctx) return;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) throw new Error("当前浏览器不支持 Web Audio");

    this.ctx = new AudioContextClass({ latencyHint: "interactive" });
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.78;
    const compressor = this.ctx.createDynamicsCompressor();
    compressor.threshold.value = -20;
    compressor.knee.value = 18;
    compressor.ratio.value = 3;
    compressor.attack.value = 0.006;
    compressor.release.value = 0.22;
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 1024;

    this.master.connect(compressor);
    compressor.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);

    for (const track of TRACKS) {
      const gain = this.ctx.createGain();
      gain.gain.value = this.muted.get(track.id) ? 0 : 1;
      gain.connect(this.master);
      this.laneGains.set(track.id, gain);
    }
  }

  setMuted(trackId, muted) {
    this.muted.set(trackId, muted);
    if (!this.ctx) return;
    const gain = this.laneGains.get(trackId);
    if (!gain) return;
    const now = this.ctx.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setTargetAtTime(muted ? 0 : 1, now, 0.025);
  }

  setPattern(pattern) {
    this.pattern = pattern;
    if (this.playing) {
      this.pendingPattern = pattern;
      return;
    }
    this.buildQueue();
  }

  buildQueue() {
    this.events = [...TRACKS]
      .map((track) => ({
        trackId: track.id,
        when: this.pattern.times[track.id],
      }))
      .sort((a, b) => a.when - b.when);
    this.eventCursor = 0;
    this.loopIndex = 0;
  }

  async play() {
    this.ensure();
    if (this.ctx.state === "suspended") await this.ctx.resume();
    if (this.playing) return;
    if (!this.pattern) return;

    const now = this.ctx.currentTime;
    this.anchor = now + 0.055;
    this.buildQueue();
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(0.78, now, 0.015);
    this.playing = true;
    this.scheduleAhead();
    this.scheduler = window.setInterval(() => this.scheduleAhead(), 50);
  }

  scheduleAhead() {
    if (!this.playing || !this.ctx) return;
    const horizon = this.ctx.currentTime + 0.55;

    while (this.events.length > 0) {
      const event = this.events[this.eventCursor];
      const when =
        this.anchor +
        this.loopIndex * LOOP_SECONDS +
        Math.min(event.when, LOOP_SECONDS);
      if (when > horizon) break;

      const destination = this.laneGains.get(event.trackId);
      if (destination) {
        const sources = scheduleVoice(
          this.ctx,
          event.trackId,
          Math.max(when, this.ctx.currentTime + 0.005),
          destination,
        );
        this.sources.push(...sources);
      }

      this.eventCursor += 1;
      if (this.eventCursor >= this.events.length) {
        this.eventCursor = 0;
        this.loopIndex += 1;
        if (this.pendingPattern) {
          this.pattern = this.pendingPattern;
          this.pendingPattern = null;
          this.events = [...TRACKS]
            .map((track) => ({
              trackId: track.id,
              when: this.pattern.times[track.id],
            }))
            .sort((a, b) => a.when - b.when);
        }
      }
    }

    if (this.sources.length > 180) {
      this.sources = this.sources.filter((source) => {
        try {
          return source.context.currentTime < source.__endTime;
        } catch {
          return false;
        }
      });
    }
  }

  elapsed() {
    if (!this.ctx || !this.playing) return 0;
    const raw = this.ctx.currentTime - this.anchor;
    if (raw < 0) return 0;
    return raw % LOOP_SECONDS;
  }

  async stop() {
    if (!this.ctx || !this.playing) return;
    this.playing = false;
    if (this.scheduler) {
      window.clearInterval(this.scheduler);
      this.scheduler = null;
    }
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(
      Math.max(0.0001, this.master.gain.value),
      now,
    );
    this.master.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);

    const sources = this.sources;
    this.sources = [];
    await new Promise((resolve) => window.setTimeout(() => {
      for (const source of sources) {
        try {
          source.stop();
        } catch {
          // A source that already ended cannot be stopped again.
        }
      }
      if (this.ctx) {
        const resetAt = this.ctx.currentTime;
        this.master.gain.cancelScheduledValues(resetAt);
        this.master.gain.setValueAtTime(0.0001, resetAt);
        this.master.gain.setTargetAtTime(0.78, resetAt + 0.02, 0.025);
      }
      resolve();
    }, 165));
  }

  async toggle() {
    if (this.playing) {
      await this.stop();
      return false;
    }
    await this.play();
    return true;
  }
}

function windowRms(data, start, end) {
  const from = Math.max(0, Math.floor(start));
  const to = Math.min(data.length, Math.floor(end));
  let sum = 0;
  for (let i = from; i < to; i += 1) sum += data[i] * data[i];
  return to > from ? Math.sqrt(sum / (to - from)) : 0;
}

function largestJump(data, start, end) {
  const from = Math.max(1, Math.floor(start));
  const to = Math.min(data.length - 1, Math.floor(end));
  let largest = 0;
  for (let i = from; i < to; i += 1) {
    largest = Math.max(largest, Math.abs(data[i + 1] - data[i]));
  }
  return largest;
}

export async function checkSeams(pattern, sampleRate = 48000) {
  const OfflineContext =
    window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!OfflineContext) {
    return {
      passed: false,
      reason: "OfflineAudioContext unavailable",
      preRms: 0,
      postRms: 0,
      ratio: 0,
      jump: 0,
      tailCross: 0,
    };
  }

  const totalSeconds = LOOP_SECONDS * 2 + 0.25;
  const ctx = new OfflineContext(1, Math.ceil(totalSeconds * sampleRate), sampleRate);
  const master = ctx.createGain();
  master.gain.value = 0.72;
  master.connect(ctx.destination);

  schedulePattern(ctx, pattern, 0, master);
  schedulePattern(ctx, pattern, LOOP_SECONDS, master);

  const rendered = await ctx.startRendering();
  const data = rendered.getChannelData(0);
  const seam = LOOP_SECONDS * sampleRate;
  const win = 0.055 * sampleRate;
  const preRms = windowRms(data, seam - win, seam);
  const postRms = windowRms(data, seam, seam + win);
  const jump = largestJump(data, seam - 0.004 * sampleRate, seam + 0.004 * sampleRate);
  const ratio = preRms > 0 ? postRms / preRms : 0;
  const tailCross = Math.max(
    0,
    ...TRACKS.map(
      (track) => pattern.times[track.id] + track.duration - LOOP_SECONDS,
    ),
  );
  const passed =
    preRms > 0.0015 &&
    postRms > 0.0015 &&
    ratio > 0.12 &&
    tailCross > 0.05;

  const result = {
    passed,
    preRms,
    postRms,
    ratio,
    jump,
    tailCross,
    reason: passed ? "smooth" : "seam discontinuity",
  };
  return result;
}
