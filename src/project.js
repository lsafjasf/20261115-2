export const TRACK_ORDER = ["drums", "bass", "ambience", "cue"];

export const TRACK_META = {
  drums: {
    name: "鼓",
    english: "DRUMS",
    color: "#f2a65a",
    source: "合成鼓组 · 96 BPM",
  },
  bass: {
    name: "低音",
    english: "BASS",
    color: "#75d1cb",
    source: "折叠锯齿 · A 小调",
  },
  ambience: {
    name: "环境",
    english: "AMBIENCE",
    color: "#9a8cff",
    source: "和弦铺底 · 噪声织体",
  },
  cue: {
    name: "提示音",
    english: "CUE",
    color: "#ff7597",
    source: "FM 钟琴 · 三音动机",
  },
};

export const DEFAULT_PROJECT = {
  version: 1,
  title: "NEON DRIFT",
  subtitle: "Twenty-second synthetic loop",
  bpm: 96,
  loopSeconds: 20,
  sampleRate: 48000,
  masterGainDb: -1,
  bus: {
    threshold: -18,
    ratio: 4,
    attack: 0.02,
    release: 0.24,
    knee: 12,
  },
  tracks: [
    {
      id: "drums",
      gainDb: -7,
      pan: -0.08,
      delayMs: 0,
      muted: false,
    },
    {
      id: "bass",
      gainDb: -8.5,
      pan: 0.04,
      delayMs: 88,
      muted: false,
    },
    {
      id: "ambience",
      gainDb: -10,
      pan: 0.18,
      delayMs: 240,
      muted: false,
    },
    {
      id: "cue",
      gainDb: -11,
      pan: -0.22,
      delayMs: 168,
      muted: false,
    },
  ],
};

export const RANGES = {
  gainDb: [-36, 12],
  pan: [-1, 1],
  delayMs: [0, 320],
  threshold: [-48, 0],
  ratio: [1, 12],
  attack: [0.001, 0.12],
  release: [0.05, 1],
};

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value)));
}

export function cloneProject(project = DEFAULT_PROJECT) {
  return JSON.parse(JSON.stringify(project));
}

function finite(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function normalizeProject(input) {
  const base = cloneProject(DEFAULT_PROJECT);
  if (!input || typeof input !== "object") return base;

  const sourceTracks = Array.isArray(input.tracks) ? input.tracks : [];
  const bus = input.bus && typeof input.bus === "object" ? input.bus : {};

  base.title =
    typeof input.title === "string" && input.title.trim()
      ? input.title.trim().slice(0, 48)
      : base.title;
  base.subtitle =
    typeof input.subtitle === "string"
      ? input.subtitle.trim().slice(0, 80)
      : base.subtitle;
  base.bpm = clamp(finite(input.bpm, base.bpm), 60, 180);
  base.loopSeconds = clamp(finite(input.loopSeconds, base.loopSeconds), 1, 60);
  base.masterGainDb = clamp(
    finite(input.masterGainDb, base.masterGainDb),
    -36,
    6,
  );
  base.bus.threshold = clamp(
    finite(bus.threshold, base.bus.threshold),
    ...RANGES.threshold,
  );
  base.bus.ratio = clamp(finite(bus.ratio, base.bus.ratio), ...RANGES.ratio);
  base.bus.attack = clamp(
    finite(bus.attack, base.bus.attack),
    ...RANGES.attack,
  );
  base.bus.release = clamp(
    finite(bus.release, base.bus.release),
    ...RANGES.release,
  );
  base.bus.knee = clamp(finite(bus.knee, base.bus.knee), 0, 40);

  base.tracks = TRACK_ORDER.map((id, index) => {
    const defaults = base.tracks[index];
    const saved = sourceTracks.find((track) => track && track.id === id) || {};
    return {
      id,
      gainDb: clamp(
        finite(saved.gainDb, defaults.gainDb),
        ...RANGES.gainDb,
      ),
      pan: clamp(finite(saved.pan, defaults.pan), ...RANGES.pan),
      delayMs: clamp(
        finite(saved.delayMs, defaults.delayMs),
        ...RANGES.delayMs,
      ),
      muted: Boolean(saved.muted),
    };
  });

  return base;
}

export function serializeProject(project) {
  return `${JSON.stringify(normalizeProject(project), null, 2)}\n`;
}

export function parseProject(text) {
  const parsed = JSON.parse(text);
  return normalizeProject(parsed);
}

export function trackSettings(project, id) {
  return normalizeProject(project).tracks.find((track) => track.id === id);
}

export function dbToGain(db) {
  return 10 ** (db / 20);
}

export function gainToDb(gain) {
  return 20 * Math.log10(Math.max(0.000001, gain));
}
