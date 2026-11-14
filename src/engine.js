/* Procedural seamless texture engine.
 * Shared by the browser UI (window.TexEngine) and Node headless tools.
 * All generated fields are N-periodic in both axes, so every texture
 * tiles seamlessly by construction.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TexEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* In-place radix-2 complex FFT. re/im are Float64Array of length n (power of 2). */
  function fft1d(re, im, invert) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) {
        let t = re[i]; re[i] = re[j]; re[j] = t;
        t = im[i]; im[i] = im[j]; im[j] = t;
      }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = (2 * Math.PI / len) * (invert ? -1 : 1);
      const wr = Math.cos(ang), wi = Math.sin(ang);
      const half = len >> 1;
      for (let i = 0; i < n; i += len) {
        let cr = 1, ci = 0;
        for (let k = 0; k < half; k++) {
          const a = i + k, b = a + half;
          const tr = cr * re[b] - ci * im[b];
          const ti = cr * im[b] + ci * re[b];
          re[b] = re[a] - tr; im[b] = im[a] - ti;
          re[a] += tr; im[a] += ti;
          const ncr = cr * wr - ci * wi;
          ci = cr * wi + ci * wr; cr = ncr;
        }
      }
    }
    if (invert) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
  }

  /* Periodic directional Gaussian/random field via anisotropic spectrum shaping.
   * opts: {seed, scale (1..16, feature size), angle (radians),
   *         anisotropy (1 isotropic .. 16 strongly streaky), roughness (1 smooth..4 rough)}
   * Returns Float32Array N*N, normalized to mean 0 / std 1. */
  function fftField(N, opts) {
    const rng = mulberry32(opts.seed);
    const re = new Float64Array(N * N);
    const im = new Float64Array(N * N);
    const cosA = Math.cos(opts.angle), sinA = Math.sin(opts.angle);
    const aniso = Math.max(1, opts.anisotropy || 1);
    const rough = opts.roughness || 2;
    const scale = Math.max(0.5, opts.scale || 4);
    const hx = N >> 1;

    for (let ky = 0; ky < N; ky++) {
      const fy = ky <= hx ? ky : ky - N;
      for (let kx = 0; kx <= hx; kx++) {
        const fx = kx; // half-spectrum: mirror below
        if (fx === 0 && fy === 0) continue;
        // rotate frequency vector: fu along grain direction, fv perpendicular
        const fu = fx * cosA + fy * sinA;
        const fv = -fx * sinA + fy * cosA;
        const rEff = Math.hypot(fu, fv / aniso) / scale;
        if (rEff < 1e-6) continue;
        // power-law spectrum (rougher => steeper falloff) with high-freq guard
        let mag = Math.pow(rEff, -rough * 0.5) * Math.exp(-rEff * rEff * 0.02);
        const phase = rng() * 2 * Math.PI;
        const c = mag * Math.cos(phase), s = mag * Math.sin(phase);
        const i1 = ky * N + kx;
        re[i1] = c; im[i1] = s;
        // conjugate-symmetric counterpart so the inverse transform is real
        const mx = (N - kx) & (N - 1);
        const my = (N - ky) & (N - 1);
        const i2 = my * N + mx;
        re[i2] = c; im[i2] = -s;
      }
    }
    const rowRe = new Float64Array(N), rowIm = new Float64Array(N);
    const colRe = new Float64Array(N), colIm = new Float64Array(N);
    for (let y = 0; y < N; y++) {
      const off = y * N;
      for (let x = 0; x < N; x++) { rowRe[x] = re[off + x]; rowIm[x] = im[off + x]; }
      fft1d(rowRe, rowIm, true);
      for (let x = 0; x < N; x++) { re[off + x] = rowRe[x]; im[off + x] = rowIm[x]; }
    }
    for (let x = 0; x < N; x++) {
      for (let y = 0; y < N; y++) { colRe[y] = re[y * N + x]; colIm[y] = im[y * N + x]; }
      fft1d(colRe, colIm, true);
      for (let y = 0; y < N; y++) { re[y * N + x] = colRe[y]; im[y * N + x] = colIm[y]; }
    }
    const out = new Float32Array(N * N);
    let mean = 0;
    for (let i = 0; i < out.length; i++) { out[i] = re[i]; mean += re[i]; }
    mean /= out.length;
    let variance = 0;
    for (let i = 0; i < out.length; i++) { const d = out[i] - mean; variance += d * d; }
    const std = Math.sqrt(variance / out.length) || 1;
    for (let i = 0; i < out.length; i++) out[i] = (out[i] - mean) / std;
    return out;
  }

  /* Periodic value-noise fBm, cheap fine detail. Grid period divides N. */
  function fbm(N, seed, octaves, baseGrid) {
    const rng = mulberry32(seed);
    const grids = [];
    let g = baseGrid || 16;
    for (let o = 0; o < octaves; o++) {
      const vals = new Float64Array(g * g);
      for (let i = 0; i < vals.length; i++) vals[i] = rng() * 2 - 1;
      grids.push({ g, vals, amp: Math.pow(0.5, o) });
      g *= 2;
      if (g > N) break;
    }
    const out = new Float32Array(N * N);
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        let sum = 0, norm = 0;
        for (let o = 0; o < grids.length; o++) {
          const { g: gg, vals, amp } = grids[o];
          const gx = (x / N) * gg, gy = (y / N) * gg;
          const x0 = Math.floor(gx), y0 = Math.floor(gy);
          const tx = gx - x0, ty = gy - y0;
          const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
          const x1 = (x0 + 1) % gg, y1 = (y0 + 1) % gg;
          const ix = x0 % gg, iy = y0 % gg;
          const v00 = vals[iy * gg + ix], v10 = vals[iy * gg + x1];
          const v01 = vals[y1 * gg + ix], v11 = vals[y1 * gg + x1];
          const top = v00 + (v10 - v00) * sx;
          const bot = v01 + (v11 - v01) * sx;
          sum += (top + (bot - top) * sy) * amp;
          norm += amp;
        }
        out[y * N + x] = sum / norm;
      }
    }
    return out;
  }

  /* Wrap-safe sample of a periodic N*N field at fractional coordinates. */
  function sample(field, N, x, y) {
    const ix = ((Math.floor(x) % N) + N) % N;
    const iy = ((Math.floor(y) % N) + N) % N;
    return field[iy * N + ix];
  }

  /* Mathematical modulo into [0,1) — JS % keeps the sign of the dividend. */
  function mod1(x) { return x - Math.floor(x); }

  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function smoothstep(e0, e1, x) {
    const t = clamp01((x - e0) / (e1 - e0));
    return t * t * (3 - 2 * t);
  }

  /* Map a standardized field through a contrast curve centered at 0.5.
   * contrast in [0.25 .. 4]; <1 flattens, >1 expands. */
  function applyContrast(g, contrast) {
    const out = new Float32Array(g.length);
    for (let i = 0; i < g.length; i++) {
      const v = clamp01(0.5 + (g[i] - 0.5) * contrast);
      out[i] = smoothstep(0, 1, v);
    }
    return out;
  }

  function colorize(g, ramp) {
    const n = g.length;
    const rgb = new Uint8ClampedArray(n * 3);
    const stops = ramp.stops; // [{t, rgb:[r,g,b]}]
    for (let i = 0; i < n; i++) {
      const t = clamp01(g[i]);
      let k = 0;
      while (k < stops.length - 2 && t > stops[k + 1].t) k++;
      const a = stops[k], b = stops[k + 1];
      const f = clamp01((t - a.t) / (b.t - a.t || 1));
      rgb[i * 3] = a.rgb[0] + (b.rgb[0] - a.rgb[0]) * f;
      rgb[i * 3 + 1] = a.rgb[1] + (b.rgb[1] - a.rgb[1]) * f;
      rgb[i * 3 + 2] = a.rgb[2] + (b.rgb[2] - a.rgb[2]) * f;
    }
    return rgb;
  }

  const RAMPS = {
    stone: {
      stops: [
        { t: 0.0, rgb: [78, 82, 88] },
        { t: 0.45, rgb: [132, 134, 138] },
        { t: 0.75, rgb: [178, 176, 172] },
        { t: 1.0, rgb: [214, 210, 204] },
      ],
    },
    wood: {
      stops: [
        { t: 0.0, rgb: [84, 47, 22] },
        { t: 0.4, rgb: [143, 88, 43] },
        { t: 0.7, rgb: [196, 138, 78] },
        { t: 1.0, rgb: [232, 196, 140] },
      ],
    },
    fabric: {
      stops: [
        { t: 0.0, rgb: [38, 52, 74] },
        { t: 0.5, rgb: [78, 102, 138] },
        { t: 1.0, rgb: [168, 188, 214] },
      ],
    },
  };

  /* p: {seed, scale, angleDeg, contrast, type}
   * angleDeg = grain/streak direction in degrees (0 = horizontal). */
  function generate(N, p) {
    const angle = (p.angleDeg || 0) * Math.PI / 180;
    const seed = (p.seed || 1234) >>> 0;
    let g;
    if (p.type === 'stone') {
      const warp = fftField(N, { seed, scale: p.scale, angle, anisotropy: 1.6, roughness: 2.4 });
      const fine = fbm(N, seed + 77, 4, 16);
      const sx = new Float32Array(N * N), sy = new Float32Array(N * N);
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const i = y * N + x;
        sx[i] = x + warp[i] * (10 + p.scale * 2);
        sy[i] = y + fine[i] * 14;
      }
      const base = fftField(N, { seed: seed + 13, scale: p.scale * 1.4, angle, anisotropy: 1, roughness: 2.0 });
      const warped = new Float32Array(N * N);
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const i = y * N + x;
        warped[i] = sample(base, N, sx[i], sy[i]);
      }
      g = normalizeToUnit(warped, 0.85);
      for (let i = 0; i < g.length; i++) g[i] = clamp01(g[i] + fine[i] * 0.06);
    } else if (p.type === 'wood') {
      const turb = fftField(N, { seed, scale: p.scale * 0.8, angle: 0, anisotropy: 1, roughness: 2.2 });
      const fine = fbm(N, seed + 51, 3, 32);
      const rings = Math.max(3, Math.round(26 / Math.max(1, p.scale)));
      // integer wave vector => sin(2pi(kx*x+ky*y)/N) is exactly N-periodic
      const kx = Math.round(rings * Math.cos(angle));
      const ky = Math.round(rings * Math.sin(angle));
      g = new Float32Array(N * N);
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const i = y * N + x;
        const phase = mod1((kx * x + ky * y) / N + turb[i] * 0.05 + fine[i] * 0.03);
        g[i] = 0.5 + 0.5 * Math.sin(phase * 2 * Math.PI);
      }
      // sharpen growth rings
      g = applyContrast(g, 1.25);
      return { gray: applyContrast(g, p.contrast), rgb: colorize(applyContrast(g, p.contrast), RAMPS.wood) };
    } else {
      // fabric: strong orthogonal weave along the chosen orientation
      const thread = fftField(N, { seed, scale: p.scale, angle: 0, anisotropy: 1, roughness: 3.0 });
      g = new Float32Array(N * N);
      const threads = Math.max(8, Math.round(64 / Math.max(1, p.scale)));
      // orthogonal integer wave vectors => both thread sets are exactly N-periodic
      const kx = Math.round(threads * Math.cos(angle));
      const ky = Math.round(threads * Math.sin(angle));
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const i = y * N + x;
        const pu = mod1((kx * x + ky * y) / N);
        const pv = mod1((-ky * x + kx * y) / N);
        const warpT = 0.5 + 0.5 * Math.sin(pu * 2 * Math.PI);
        const weftT = 0.5 + 0.5 * Math.sin(pv * 2 * Math.PI);
        // continuous over/under weighting (sign of cosine product), no floor jump
        const over = Math.cos(pu * 2 * Math.PI) * Math.cos(pv * 2 * Math.PI) > 0 ? 1 : 0;
        const cell = over;
        const weave = cell ? warpT * 0.7 + weftT * 0.3 : weftT * 0.7 + warpT * 0.3;
        g[i] = clamp01(0.5 + (weave - 0.5) * 0.9 + thread[i] * 0.08);
      }
    }
    g = applyContrast(g, p.contrast);
    return { gray: g, rgb: colorize(g, RAMPS[p.type]) };
  }

  function normalizeToUnit(field, keep) {
    let min = Infinity, max = -Infinity;
    for (let i = 0; i < field.length; i++) { if (field[i] < min) min = field[i]; if (field[i] > max) max = field[i]; }
    const out = new Float32Array(field.length);
    const span = max - min || 1;
    for (let i = 0; i < field.length; i++) out[i] = ((field[i] - min) / span) * (keep || 1);
    return out;
  }

  return { mulberry32, fft1d, fftField, fbm, sample, generate, colorize,
    applyContrast, normalizeToUnit, clamp01, RAMPS, SIZE: 512 };
});
