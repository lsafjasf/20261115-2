#!/usr/bin/env node
/* Verify wrap-synchronized painting: a stroke near one edge must reproduce
 * identically on the opposite edge, and the result must stay tileable. */
'use strict';
const E = require('../src/engine.js');
const S = require('../src/seam.js');
const N = E.SIZE;
const { rgb } = E.generate(N, { type: 'wood', seed: 42, scale: 6, angleDeg: 75, contrast: 1.35 });
const work = new Uint8ClampedArray(rgb);
const base = new Uint8ClampedArray(rgb);

function paint(cx, cy, radius, tool, strength, wrap) {
  const offs = wrap
    ? [[0, 0], [N, 0], [-N, 0], [0, N], [0, -N], [N, N], [-N, -N], [N, -N], [-N, N]]
    : [[0, 0]];
  const r = Math.ceil(radius), r2 = radius * radius;
  for (const [ox, oy] of offs) {
    const ax = cx + ox, ay = cy + oy;
    const x0 = Math.max(0, Math.floor(ax - r)), x1 = Math.min(N - 1, Math.ceil(ax + r));
    const y0 = Math.max(0, Math.floor(ay - r)), y1 = Math.min(N - 1, Math.ceil(ay + r));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const ddx = x - ax, ddy = y - ay, d2 = ddx * ddx + ddy * ddy;
        if (d2 > r2) continue;
        const fall = Math.pow(1 - Math.sqrt(d2) / radius, 1.5) * strength;
        const idx = (y * N + x) * 3;
        for (let c = 0; c < 3; c++) {
          const target = tool === 'heal' ? base[idx + c] : work[idx + c] - 40;
          work[idx + c] = work[idx + c] + (target - work[idx + c]) * fall;
        }
      }
    }
  }
}

function changedRows(stripX) {
  let n = 0;
  for (let y = 0; y < N; y++) {
    const idx = (y * N + stripX) * 3;
    if (Math.abs(work[idx] - base[idx]) > 1) n++;
  }
  return n;
}

paint(6, 256, 30, 'darken', 0.9, true);
console.log('left edge (x=6) changed rows:  ', changedRows(6));
console.log('right edge (x=506) changed rows:', changedRows(506));
console.log('far interior (x=256) changed:   ', changedRows(256));

// Ground truth: paint one stamp on an infinite 3N x 3N canvas, fold it back
// by modulo N, and compare against the nine-offset wrapped implementation.
const big = new Uint8ClampedArray(base); // same start, single tile upscaled below
const truth = new Uint8ClampedArray(N * N * 3);
truth.set(base);
const R = 30, r2 = R * R, cx = 6, cy = 256, strength = 0.9;
for (let gy = -N; gy < 2 * N; gy++) {
  for (let gx = -N; gx < 2 * N; gx++) {
    const d2 = (gx - cx) ** 2 + (gy - cy) ** 2;
    if (d2 > r2) continue;
    const fall = Math.pow(1 - Math.sqrt(d2) / R, 1.5) * strength;
    const lx = ((gx % N) + N) % N, ly = ((gy % N) + N) % N;
    const idx = (ly * N + lx) * 3;
    for (let c = 0; c < 3; c++) truth[idx + c] = truth[idx + c] + (truth[idx + c] - 40 - truth[idx + c]) * fall;
  }
}
let maxDiff = 0;
for (let i = 0; i < work.length; i++) maxDiff = Math.max(maxDiff, Math.abs(work[i] - truth[i]));
console.log('max diff vs infinite-canvas ground truth:', maxDiff.toFixed(2));

const seam = S.check(work, N);
console.log('wrap boundary no worse than interior (ratio <=1.25):',
  seam.seamRatioX <= 1.25, seam.seamRatioY <= 1.25, '2x2 ratio', seam.ratio.toFixed(3));
if (maxDiff > 0.5 || seam.seamRatioX > 1.25 || seam.seamRatioY > 1.25) process.exit(1);
