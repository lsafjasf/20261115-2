/* Quantitative seam diagnostics for tileable N*N RGB images.
 * Lower numbers => better tiling. A perfectly periodic texture scores ~0
 * because opposite edges are samples of the same continuous field. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TexSeam = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function mean(arr) { return arr.reduce((a, b) => a + b, 0) / arr.length; }
  function percentile(arr, p) {
    const s = [...arr].sort((a, b) => a - b);
    return s[Math.min(s.length - 1, Math.floor(s.length * p))];
  }

  function edgeStats(rgb, N) {
    const diffsX = [], diffsY = [];
    const gradX = [], gradY = [];
    for (let y = 0; y < N; y++) {
      const l = (y * N) * 3, r = (y * N + N - 1) * 3;
      const d = (Math.abs(rgb[l] - rgb[r]) + Math.abs(rgb[l + 1] - rgb[r + 1]) + Math.abs(rgb[l + 2] - rgb[r + 2])) / 3;
      diffsX.push(d);
      const gIn = (Math.abs(rgb[l + 3] - rgb[l]) + Math.abs(rgb[(y * N + 1) * 3] - rgb[l]) + Math.abs(rgb[(y * N + 1) * 3 + 1] - rgb[l + 1]) + Math.abs(rgb[(y * N + 1) * 3 + 2] - rgb[l + 2])) / 3;
      gradX.push(gIn);
    }
    for (let x = 0; x < N; x++) {
      const t = x * 3, b = ((N - 1) * N + x) * 3;
      const d = (Math.abs(rgb[t] - rgb[b]) + Math.abs(rgb[t + 1] - rgb[b + 1]) + Math.abs(rgb[t + 2] - rgb[b + 2])) / 3;
      diffsY.push(d);
      const below = (N + x) * 3;
      const gIn = (Math.abs(rgb[below] - rgb[t]) + Math.abs(rgb[below + 1] - rgb[t + 1]) + Math.abs(rgb[below + 2] - rgb[t + 2])) / 3;
      gradY.push(gIn);
    }
    const seamX = mean(diffsX), seamY = mean(diffsY);
    const baseX = percentile(gradX, 0.95), baseY = percentile(gradY, 0.95);
    return {
      seamX, seamY,
      maxX: Math.max(...diffsX), maxY: Math.max(...diffsY),
      p95X: percentile(diffsX, 0.95), p95Y: percentile(diffsY, 0.95),
      baseX, baseY,
      // ratio near 1.0 means the wrap is as smooth as any interior step
      seamRatioX: seamX / (baseX || 1),
      seamRatioY: seamY / (baseY || 1),
    };
  }

  /* Build a 2x2 tiled buffer and confirm crossing pixels match interior gradients. */
  function tiledCrossCheck(rgb, N) {
    const M = 2 * N;
    const big = new Uint8ClampedArray(M * M * 3);
    for (let ty = 0; ty < 2; ty++) for (let tx = 0; tx < 2; tx++) {
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const si = (y * N + x) * 3, di = ((ty * N + y) * M + tx * N + x) * 3;
        big[di] = rgb[si]; big[di + 1] = rgb[si + 1]; big[di + 2] = rgb[si + 2];
      }
    }
    // sample steps that cross the internal tile boundary (x = N and y = N)
    const cross = [], inner = [];
    for (let y = 0; y < M; y++) {
      const c = (y * M + N) * 3, c0 = c - 3;
      cross.push((Math.abs(big[c] - big[c0]) + Math.abs(big[c + 1] - big[c0 + 1]) + Math.abs(big[c + 2] - big[c0 + 2])) / 3);
      const k = (y * M + (N >> 1)) * 3, k0 = k - 3;
      inner.push((Math.abs(big[k] - big[k0]) + Math.abs(big[k + 1] - big[k0 + 1]) + Math.abs(big[k + 2] - big[k0 + 2])) / 3);
    }
    for (let x = 0; x < M; x++) {
      const c = (N * M + x) * 3, c0 = ((N - 1) * M + x) * 3;
      cross.push((Math.abs(big[c] - big[c0]) + Math.abs(big[c + 1] - big[c0 + 1]) + Math.abs(big[c + 2] - big[c0 + 2])) / 3);
      const k = ((N >> 1) * M + x) * 3, k0 = (((N >> 1) - 1) * M + x) * 3;
      inner.push((Math.abs(big[k] - big[k0]) + Math.abs(big[k + 1] - big[k0 + 1]) + Math.abs(big[k + 2] - big[k0 + 2])) / 3);
    }
    return { crossBoundary: mean(cross), interiorStep: mean(inner), ratio: mean(cross) / (mean(inner) || 1) };
  }

  function check(rgb, N) {
    const e = edgeStats(rgb, N);
    const t = tiledCrossCheck(rgb, N);
    // Pass when wrap discontinuity is no larger than a typical interior step,
    // in both mean and 95th-percentile energy, on both axes and the 2x2 cross.
    const passed = e.seamRatioX < 1.15 && e.seamRatioY < 1.15 && t.ratio < 1.15 &&
      e.p95X / (e.baseX || 1) < 1.2 && e.p95Y / (e.baseY || 1) < 1.2;
    return { ...e, ...t, passed };
  }

  return { check, edgeStats, tiledCrossCheck };
});
