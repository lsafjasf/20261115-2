// 盲听 DSP：只接收渲染后的立体声 PCM，不接触声源位置/顺序真值

// 迭代 radix-2 FFT（原地）
export function fft(re, im) {
  const n = re.length;
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
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let curR = 1, curI = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k], ui = im[i + k];
        const vr = re[i + k + len / 2] * curR - im[i + k + len / 2] * curI;
        const vi = re[i + k + len / 2] * curI + im[i + k + len / 2] * curR;
        re[i + k] = ur + vr;
        im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr;
        im[i + k + len / 2] = ui - vi;
        const nr = curR * wr - curI * wi;
        curI = curR * wi + curI * wr;
        curR = nr;
      }
    }
  }
}

// 分帧频谱特征：频段能量、质心、瞬态、调制、左右能量
export function analyze(pcm, frameMs = 90, hopMs = 45) {
  const { left, right, sampleRate } = pcm;
  const frameSize = 1024;
  const hop = Math.floor(sampleRate * hopMs / 1000);
  const windowFn = new Float32Array(frameSize);
  for (let i = 0; i < frameSize; i++) windowFn[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (frameSize - 1));

  const bandEdges = [0, 300, 900, 2400, 4500, 8000, sampleRate / 2];
  const frames = [];
  const mono = new Float32Array(left.length);
  for (let start = 0; start + frameSize <= left.length; start += hop) {
    const reM = new Float32Array(frameSize);
    const imM = new Float32Array(frameSize);
    const reL = new Float32Array(frameSize);
    const imL = new Float32Array(frameSize);
    const reR = new Float32Array(frameSize);
    const imR = new Float32Array(frameSize);
    let eL = 0, eR = 0;
    for (let i = 0; i < frameSize; i++) {
      const idx = start + i;
      eL += left[idx] * left[idx];
      eR += right[idx] * right[idx];
      mono[idx] = (left[idx] + right[idx]) * 0.5;
      reM[i] = mono[idx] * windowFn[i];
      reL[i] = left[idx] * windowFn[i];
      reR[i] = right[idx] * windowFn[i];
    }
    fft(reM, imM);
    fft(reL, imL);
    fft(reR, imR);
    const bands = new Array(bandEdges.length - 1).fill(0);
    const bandL = new Array(bandEdges.length - 1).fill(0);
    const bandR = new Array(bandEdges.length - 1).fill(0);
    let total = 0, centroidNum = 0;
    for (let bin = 1; bin < frameSize / 2; bin++) {
      const mag = reM[bin] * reM[bin] + imM[bin] * imM[bin];
      const magL = reL[bin] * reL[bin] + imL[bin] * imL[bin];
      const magR = reR[bin] * reR[bin] + imR[bin] * imR[bin];
      const freq = bin * sampleRate / frameSize;
      total += mag;
      centroidNum += mag * freq;
      for (let b = 0; b < bands.length; b++) {
        if (freq >= bandEdges[b] && freq < bandEdges[b + 1]) {
          bands[b] += mag;
          bandL[b] += magL;
          bandR[b] += magR;
          break;
        }
      }
    }
    const energy = (eL + eR) / frameSize;
    const bandPan = bands.map((v, b) => (bandR[b] - bandL[b]) / (v + 1e-12));
    frames.push({
      t: (start + frameSize / 2) / sampleRate,
      energy,
      pan: energy > 1e-10 ? (eR - eL) / (eR + eL) : 0,
      bands,
      bandPan,
      centroid: total > 1e-12 ? centroidNum / total : 0,
    });
  }
  return { frames, bandEdges, frameMs, hopMs };
}

// 频段专用起点检测：每个声源在各自特征频段上独立检测，
// 避免先出现的持续声源把后出现的声源淹没
export function detectBandOnsets(analysis) {
  const times = analysis.frames.map((f) => f.t);
  const headCount = analysis.frames.filter((f) => f.t < 0.7).length || 1;
  const results = {};
  const pick = (bands) => analysis.frames.map((f) => bands.reduce((s, b) => s + f.bands[b], 0));
  const clusterFirst = (found, gap = 1.0) => {
    const clusters = [];
    for (const t of found) {
      const last = clusters[clusters.length - 1];
      if (last && t - last.at(-1) <= gap) last.push(t);
      else clusters.push([t]);
    }
    return clusters.length ? clusters[0][0] : null;
  };

  // 芦苇：900-2400Hz 中频能量相对风噪基线跃升
  {
    const series = pick([2]);
    const base = series.slice(0, headCount).sort((a, b) => a - b)[Math.floor(headCount * 0.8)] || 1e-12;
    const found = [];
    for (let i = 1; i < series.length; i++) {
      if (times[i] >= 0.9 && series[i] > base * 5 && series[i] > series[i - 1] * 1.4) found.push(times[i]);
    }
    results.reed = clusterFirst(found);
  }

  // 浅滩：高频（4.5kHz+）绝对能量出现且持续数帧（排除芦苇的瞬时泄漏）
  {
    const series = pick([4, 5]);
    const found = [];
    for (let i = 2; i < series.length - 2; i++) {
      const sustained = series.slice(i, i + 3).every((v) => v > 250);
      if (times[i] >= 0.9 && sustained && series[i] > series[i - 1] * 1.5) found.push(times[i]);
    }
    results.shoal = clusterFirst(found);
  }

  // 码头：0-300Hz 出现强脉冲（显著高于风噪低频起伏）
  {
    const series = pick([0]);
    const head = series.slice(0, headCount).sort((a, b) => a - b);
    const base = head[Math.floor(head.length * 0.9)] || 1e-12;
    const found = [];
    for (let i = 1; i < series.length; i++) {
      if (times[i] >= 0.9 && series[i] > 400 && series[i] > base * 4
        && series[i] > series[i - 1] * 1.8) {
        found.push(times[i]);
      }
    }
    results.dock = clusterFirst(found);
  }
  return results;
}

// 对一个事件窗口做音色画像
export function timbreProfile(analysis, fromT, toT) {
  const windowFrames = analysis.frames.filter((f) => f.t >= fromT && f.t < toT);
  if (!windowFrames.length) return null;
  const bands = new Array(analysis.bandEdges.length - 1).fill(0);
  const bandPanSum = new Array(analysis.bandEdges.length - 1).fill(0);
  let centroid = 0, pan = 0, energy = 0, maxEnergy = 0;
  const env = [];
  for (const f of windowFrames) {
    for (let b = 0; b < bands.length; b++) bands[b] += f.bands[b];
    for (let b = 0; b < bandPanSum.length; b++) bandPanSum[b] += f.bandPan[b];
    centroid += f.centroid;
    pan += f.pan;
    energy += f.energy;
    maxEnergy = Math.max(maxEnergy, f.energy);
    env.push(f.energy);
  }
  const bandTotal = bands.reduce((a, b) => a + b, 0) || 1;
  const fractions = bands.map((b) => b / bandTotal);
  // 瞬态度：峰值与均值能量比（码头撞击高）
  const impulsiveness = maxEnergy / (energy / windowFrames.length);
  // 调制深度：能量包络的变异程度（芦苇阵风调制高）
  const mean = energy / windowFrames.length;
  const variance = env.reduce((s, v) => s + (v - mean) ** 2, 0) / env.length;
  const modulation = Math.sqrt(variance) / (mean + 1e-12);
  return {
    fractions,
    hfFraction: fractions[4] + fractions[5],
    midFraction: fractions[2] + fractions[3],
    lfFraction: fractions[0] + fractions[1],
    centroid: centroid / windowFrames.length,
    pan: pan / windowFrames.length,
    impulsiveness,
    modulation,
    bandPan: bandPanSum.map((v) => v / windowFrames.length),
  };
}

// 单声道（左/右）画像，用于排除另一侧声源的串扰
export function timbreProfileChannel(pcm, fromT, toT, channel, frameMs = 90, hopMs = 45) {
  const single = {
    sampleRate: pcm.sampleRate,
    length: pcm.length,
    left: channel === 'left' ? pcm.left : pcm.right,
    right: channel === 'left' ? pcm.left : pcm.right,
  };
  return timbreProfile(analyze(single, frameMs, hopMs), fromT, toT);
}

// 低频瞬态比：窗口内 0-300Hz 帧能量的峰值与中位数之比
// 码头撞击是稀疏脉冲；芦苇/浅滩是持续声，比值低
export function lowFrequencyImpulseRatio(pcm, fromT, toT, channel = 'left') {
  const single = {
    sampleRate: pcm.sampleRate,
    length: pcm.length,
    left: channel === 'left' ? pcm.left : pcm.right,
    right: channel === 'left' ? pcm.left : pcm.right,
  };
  const analysis = analyze(single);
  const frames = analysis.frames.filter((f) => f.t >= fromT && f.t < toT);
  const lows = frames.map((f) => f.bands[0]).sort((a, b) => a - b);
  if (!lows.length) return 0;
  const median = lows[Math.floor(lows.length / 2)] || 1e-12;
  const peak = lows[lows.length - 1];
  return peak / median;
}

export function directionFromPan(pan) {
  return pan >= 0 ? 'r' : 'l';
}
