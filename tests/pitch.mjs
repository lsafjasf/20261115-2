// 解析 16-bit PCM WAV，并用自相关法估计指定时间窗口内的基频。
import { readFile } from 'node:fs/promises';

export async function readWavMono(path) {
  const buf = await readFile(path);
  const channels = buf.readUInt16LE(22);
  const rate = buf.readUInt32LE(24);
  const dataOffset = 44;
  const frames = (buf.length - dataOffset) / (2 * channels);
  const mono = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    let sum = 0;
    for (let c = 0; c < channels; c++) {
      sum += buf.readInt16LE(dataOffset + (i * channels + c) * 2) / 32768;
    }
    mono[i] = sum / channels;
  }
  return { rate, samples: mono };
}

// 自相关基频：在 [minF, maxF] 范围内找最大归一化相关
export function estimatePitch(samples, rate, minF = 150, maxF = 700) {
  const minLag = Math.floor(rate / maxF);
  const maxLag = Math.ceil(rate / minF);
  let bestLag = 0;
  let bestCorr = 0;
  let energy = 0;
  for (let i = 0; i < samples.length; i++) energy += samples[i] ** 2;
  if (energy / samples.length < 1e-6) return 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let corr = 0;
    for (let i = 0; i + lag < samples.length; i++) {
      corr += samples[i] * samples[i + lag];
    }
    if (corr > bestCorr) {
      bestCorr = corr;
      bestLag = lag;
    }
  }
  return bestLag ? rate / bestLag : 0;
}

// 找到首个能量明显的音符，测量其基频
export async function firstNoteFreq(path, noteStartSec = 0.1) {
  const { rate, samples } = await readWavMono(path);
  const start = Math.floor(noteStartSec * rate);
  const win = samples.slice(start, start + Math.floor(0.18 * rate));
  return estimatePitch(win, rate);
}
