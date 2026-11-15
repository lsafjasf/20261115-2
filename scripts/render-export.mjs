import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { OfflineAudioContext } from "node-web-audio-api";
import { renderMix } from "../src/audio.js";
import { DEFAULT_PROJECT, serializeProject } from "../src/project.js";
import { findPeak } from "../src/synth.js";
import { audioBufferToWav } from "../src/wav.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const exportsDir = join(root, "exports");
const projectsDir = join(root, "projects");
const sampleRate = 48000;
const duration = 20;

await mkdir(exportsDir, { recursive: true });
await mkdir(projectsDir, { recursive: true });

const { buffer, project, trackData } = await renderMix(DEFAULT_PROJECT, {
  sampleRate,
  duration,
  OfflineAudioContextCtor: OfflineAudioContext,
});
const wav = audioBufferToWav(buffer);
const wavPath = join(exportsDir, "neon-drift-20s.wav");
const projectPath = join(projectsDir, "neon-drift.json");

await writeFile(wavPath, Buffer.from(wav));
await writeFile(projectPath, serializeProject(project));

const channels = [0, 1].map((channel) => {
  const data = new Float32Array(buffer.length);
  buffer.copyFromChannel(data, channel);
  return data;
});
const peak = findPeak(channels);
const rms = Math.sqrt(
  channels.reduce(
    (sum, channel) =>
      sum + channel.reduce((channelSum, sample) => channelSum + sample ** 2, 0),
    0,
  ) /
    (channels.length * buffer.length),
);

console.log(
  JSON.stringify(
    {
      wavPath,
      projectPath,
      sampleRate: buffer.sampleRate,
      channels: buffer.numberOfChannels,
      frames: buffer.length,
      duration: buffer.duration,
      peakDb: 20 * Math.log10(peak),
      rmsDb: 20 * Math.log10(rms),
      trackPeaks: Object.fromEntries(
        Object.entries(trackData).map(([id, data]) => [
          id,
          Number(findPeak(data).toFixed(4)),
        ]),
      ),
      bytes: wav.byteLength,
    },
    null,
    2,
  ),
);
