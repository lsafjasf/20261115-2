// Web Audio 程序化环境声合成：三种水声 + 风噪，全部由噪声/振荡器实时生成
import { mulberry32 } from './rng.js';

const TWO_PI = Math.PI * 2;

function makeNoise(random, frames) {
  const buf = new Float32Array(frames);
  let last = 0;
  for (let i = 0; i < frames; i++) {
    // 轻度棕化，避免白噪过刺
    const white = random() * 2 - 1;
    last = 0.72 * last + 0.28 * white;
    buf[i] = last * 2.4;
  }
  return buf;
}

// 简易带通：状态变量滤波器，可随时间扫频
function bandpass(input, frames, sampleRate, freqFn, q) {
  const out = new Float32Array(frames);
  let low = 0, band = 0, high = 0;
  for (let i = 0; i < frames; i++) {
    const f = Math.max(30, Math.min(sampleRate * 0.2, freqFn(i / sampleRate)));
    const w = TWO_PI * f / sampleRate;
    const alpha = Math.max(0, Math.min(0.95, Math.sin(w) / (2 * q)));
    low += w * band;
    high = input[i] - low - 2 * alpha * band;
    band += w * high;
    out[i] = band;
  }
  return out;
}

function lowpass(input, frames, sampleRate, cutoff) {
  const out = new Float32Array(frames);
  const rc = 1 / (TWO_PI * cutoff);
  const dt = 1 / sampleRate;
  const a = dt / (rc + dt);
  let last = 0;
  for (let i = 0; i < frames; i++) {
    last += a * (input[i] - last);
    out[i] = last;
  }
  return out;
}

function crossfadeLoop(buffer, fadeMs, sampleRate) {
  const ch = buffer.getChannelData(0);
  const n = fadeMs * sampleRate / 1000;
  for (let i = 0; i < n; i++) {
    const w = 0.5 - 0.5 * Math.cos(Math.PI * i / n);
    ch[i] = ch[i] * w + ch[ch.length - n + i] * (1 - w);
  }
}

function toAudioBuffer(ctx, mono, loopFadeMs = 60) {
  const buf = ctx.createBuffer(1, mono.length, ctx.sampleRate);
  buf.copyToChannel(mono, 0);
  crossfadeLoop(buf, loopFadeMs, ctx.sampleRate);
  return buf;
}

// 芦苇：中频带通的沙沙声，带 6-9Hz 阵风式幅度起伏，几乎无高频
export function makeReedBuffer(ctx, seed) {
  const random = mulberry32(seed);
  const seconds = 3.2;
  const frames = Math.floor(ctx.sampleRate * seconds);
  const noise = makeNoise(random, frames);
  const carrier = bandpass(noise, frames, ctx.sampleRate, (t) => {
    return 1500 + 650 * Math.sin(TWO_PI * 0.23 * t + seed % 7)
      + 220 * Math.sin(TWO_PI * 0.71 * t);
  }, 4.2);
  const modFreq = 6.5 + (seed % 5) * 0.7;
  for (let i = 0; i < frames; i++) {
    const t = i / ctx.sampleRate;
    const env = 0.42 + 0.58 * (0.5 + 0.5 * Math.sin(TWO_PI * modFreq * t + 1.3));
    carrier[i] *= env;
  }
  return toAudioBuffer(ctx, carrier);
}

// 浅滩：持续高频水声（4-7kHz 嘶嘶）+ 周期性拍岸脉冲（约 1.2Hz）
export function makeShoalBuffer(ctx, seed) {
  const random = mulberry32((seed + 101) >>> 0);
  const seconds = 4.0;
  const frames = Math.floor(ctx.sampleRate * seconds);
  const noise = makeNoise(random, frames);
  const hiss = bandpass(noise, frames, ctx.sampleRate, (t) => {
    return 5200 + 900 * Math.sin(TWO_PI * 0.31 * t + 0.4);
  }, 2.6);
  const wavePeriod = 0.82 + (seed % 4) * 0.06;
  for (let i = 0; i < frames; i++) {
    const t = i / ctx.sampleRate;
    const phase = (t % wavePeriod) / wavePeriod;
    // 拍岸浪：快速上升、缓慢消退
    const wave = Math.exp(-Math.pow((phase - 0.18) / 0.11, 2)) * 0.9
      + Math.exp(-Math.pow((phase - 0.55) / 0.22, 2)) * 0.35;
    hiss[i] = hiss[i] * (0.55 + 0.45 * wave) + 0.05 * wave * Math.sin(TWO_PI * 380 * t);
  }
  return toAudioBuffer(ctx, hiss);
}

// 码头：稀疏的低频撞击（木板/桩）+ 中高频吱呀声，冲击性强
export function makeDockBuffer(ctx, seed) {
  const random = mulberry32((seed + 202) >>> 0);
  const seconds = 5.0;
  const frames = Math.floor(ctx.sampleRate * seconds);
  const out = new Float32Array(frames);
  // 背景：轻微水流低鸣
  const noise = makeNoise(random, frames);
  const bed = lowpass(noise, frames, ctx.sampleRate, 240);
  for (let i = 0; i < frames; i++) out[i] += bed[i] * 0.25;

  const thumps = 4 + (seed % 3);
  for (let k = 0; k < thumps; k++) {
    const start = Math.floor((0.3 + random() * (seconds - 0.8)) * ctx.sampleRate);
    const f0 = 90 + random() * 60;
    const len = Math.floor(0.28 * ctx.sampleRate);
    for (let i = 0; i < len && start + i < frames; i++) {
      const t = i / ctx.sampleRate;
      const env = Math.exp(-t * 14);
      out[start + i] += env * (2.6 * Math.sin(TWO_PI * f0 * t)
        + 0.9 * Math.sin(TWO_PI * f0 * 2.01 * t));
    }
  }
  const creaks = 2 + (seed % 3);
  for (let k = 0; k < creaks; k++) {
    const start = Math.floor((0.4 + random() * (seconds - 1.2)) * ctx.sampleRate);
    const base = 1700 + random() * 1100;
    const len = Math.floor((0.35 + random() * 0.3) * ctx.sampleRate);
    const local = new Float32Array(len);
    for (let i = 0; i < len; i++) {
      const t = i / ctx.sampleRate;
      local[i] = Math.sin(TWO_PI * (base + 500 * Math.sin(TWO_PI * 6 * t)) * t);
    }
    const creak = bandpass(local, len, ctx.sampleRate, () => base, 6);
    for (let i = 0; i < len && start + i < frames; i++) {
      const t = i / ctx.sampleRate;
      out[start + i] += 0.32 * Math.sin(Math.PI * t / (len / ctx.sampleRate)) * creak[i];
    }
  }
  return toAudioBuffer(ctx, out);
}

// 风：低通宽频呼啸，缓慢起伏，用来掩盖远处声音
export function makeWindBuffer(ctx, seed) {
  const random = mulberry32((seed + 303) >>> 0);
  const seconds = 6.0;
  const frames = Math.floor(ctx.sampleRate * seconds);
  const noise = makeNoise(random, frames);
  const wind = lowpass(noise, frames, ctx.sampleRate, 520);
  const gusty = bandpass(wind, frames, ctx.sampleRate, (t) => 300 + 120 * Math.sin(TWO_PI * 0.12 * t), 1.4);
  for (let i = 0; i < frames; i++) {
    const t = i / ctx.sampleRate;
    const gust = 0.7 + 0.3 * Math.sin(TWO_PI * 0.17 * t + 2) * Math.sin(TWO_PI * 0.043 * t);
    gusty[i] *= gust;
  }
  return toAudioBuffer(ctx, gusty, 400);
}
