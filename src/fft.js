'use strict';

// 轻量 radix-2 FFT（原地，输入长度必须为 2 的幂）
function fft(re, im) {
  const n = re.length;
  if ((n & (n - 1)) !== 0) throw new Error('FFT size must be power of 2');
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k];
        const ui = im[i + k];
        const vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ur + vr;
        im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr;
        im[i + k + len / 2] = ui - vi;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
}

function dominantFrequency(pcm, sampleRate, fftSize = 2048) {
  const re = new Float64Array(fftSize);
  const im = new Float64Array(fftSize);
  // 取能量最大的一帧做分析
  let bestStart = 0;
  let bestEnergy = -1;
  for (let start = 0; start + fftSize <= pcm.length; start += fftSize / 2) {
    let e = 0;
    for (let i = 0; i < fftSize; i++) e += pcm[start + i] ** 2;
    if (e > bestEnergy) {
      bestEnergy = e;
      bestStart = start;
    }
  }
  for (let i = 0; i < fftSize; i++) {
    // Hann 窗减少泄漏
    const win = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (fftSize - 1)));
    re[i] = pcm[bestStart + i] * win;
  }
  fft(re, im);
  const mags = new Array(fftSize / 2);
  for (let i = 0; i < fftSize / 2; i++) {
    mags[i] = { bin: i, freq: (i * sampleRate) / fftSize, mag: Math.hypot(re[i], im[i]) };
  }
  mags.sort((a, b) => b.mag - a.mag);
  return { top: mags.slice(0, 6), frameEnergy: bestEnergy, frameStart: bestStart };
}

module.exports = { fft, dominantFrequency };
