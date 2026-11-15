import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { OfflineAudioContext } from "node-web-audio-api";
import { buildMixGraph, CLIP_PEAK, renderMix } from "../src/audio.js";
import {
  DEFAULT_PROJECT,
  TRACK_ORDER,
  cloneProject,
  normalizeProject,
  parseProject,
  serializeProject,
} from "../src/project.js";
import { findPeak, renderTrackData } from "../src/synth.js";
import { readWavInfo } from "../src/wav.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const wavPath = join(root, "exports", "neon-drift-20s.wav");
const projectPath = join(root, "projects", "neon-drift.json");
const wavBytes = await readFile(wavPath);
const wav = readWavInfo(
  wavBytes.buffer.slice(
    wavBytes.byteOffset,
    wavBytes.byteOffset + wavBytes.byteLength,
  ),
);

assert.equal(wav.channels, 2);
assert.equal(wav.sampleRate, 48000);
assert.equal(wav.bitsPerSample, 24);
assert.equal(wav.frames, 960000);
assert.equal(wav.duration, 20);
assert.equal(wavBytes.byteLength, 5760044);

const savedProject = normalizeProject(
  JSON.parse(await readFile(projectPath, "utf8")),
);
const restored = parseProject(serializeProject(savedProject));
for (const id of TRACK_ORDER) {
  const before = savedProject.tracks.find((track) => track.id === id);
  const after = restored.tracks.find((track) => track.id === id);
  assert.equal(after.gainDb, before.gainDb);
  assert.equal(after.pan, before.pan);
  assert.equal(after.delayMs, before.delayMs);
  assert.equal(after.muted, before.muted);
}

const changed = cloneProject(savedProject);
const drums = changed.tracks.find((track) => track.id === "drums");
const bass = changed.tracks.find((track) => track.id === "bass");
drums.gainDb = 7.5;
drums.pan = -0.63;
drums.delayMs = 112;
bass.pan = 0.48;
bass.delayMs = 63;
const recalled = parseProject(serializeProject(changed));
for (const id of ["drums", "bass"]) {
  const expected = changed.tracks.find((track) => track.id === id);
  const actual = recalled.tracks.find((track) => track.id === id);
  assert.equal(actual.gainDb, expected.gainDb);
  assert.equal(actual.pan, expected.pan);
  assert.equal(actual.delayMs, expected.delayMs);
}

const trackData = {};
for (const id of TRACK_ORDER) {
  trackData[id] = await renderTrackData(
    id,
    48000,
    20,
    OfflineAudioContext,
  );
}
const mutedProject = cloneProject(DEFAULT_PROJECT);
mutedProject.tracks.find((track) => track.id === "drums").muted = true;
const graph = buildMixGraph(
  new OfflineAudioContext(2, 4800, 48000),
  mutedProject,
  trackData,
);
assert.equal(graph.tracks.get("drums").mute.gain.value, 0);
for (const id of ["bass", "ambience", "cue"]) {
  assert.equal(graph.tracks.get(id).mute.gain.value, 1);
}

const drumsPeak = findPeak(trackData.drums);
assert.ok(drumsPeak > 0.3);
assert.ok(drumsPeak * 10 ** (12 / 20) > CLIP_PEAK);

const rendered = await renderMix(DEFAULT_PROJECT, {
  sampleRate: 48000,
  duration: 20,
  OfflineAudioContextCtor: OfflineAudioContext,
  trackData,
});
const renderedChannels = [0, 1].map((channel) => {
  const data = new Float32Array(rendered.buffer.length);
  rendered.buffer.copyFromChannel(data, channel);
  return data;
});
const peak = findPeak(renderedChannels);
assert.equal(rendered.buffer.duration, 20);
assert.ok(peak > 0.2);
assert.ok(peak < 1);

console.log(
  `Verified ${wav.duration}s / ${wav.sampleRate}Hz / ${wav.bitsPerSample}-bit stereo WAV`,
);
console.log(
  `Project recall: faders, pan, delay and mute restored for ${TRACK_ORDER.length} tracks`,
);
console.log(`Mute isolation: only the selected track mute gain is zero`);
console.log(
  `Overload path: drums peak ${drumsPeak.toFixed(3)} reaches CLIP at +12 dB`,
);
