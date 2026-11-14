#!/usr/bin/env node
/* Build a 2x2 tiled preview PNG with thin red cross lines exactly on the
 * internal tile boundaries, so any seam is visually obvious. */
'use strict';
const fs = require('fs');
const path = require('path');
const TexPNG = require('../src/png.js');

const dir = path.resolve(process.argv[2] || path.join(__dirname, '..', 'artifacts'));
const N = 512, M = N * 2;

for (const type of ['stone', 'wood', 'fabric']) {
  const src = fs.readFileSync(path.join(dir, `${type}_512.png`));
  const zlib = require('zlib');
  let off = 8, idat = [];
  while (off < src.length) {
    const len = src.readUInt32BE(off);
    const t = src.toString('ascii', off + 4, off + 8);
    if (t === 'IDAT') idat.push(src.slice(off + 8, off + 8 + len));
    off += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = N * 3 + 1;
  const tile = new Uint8ClampedArray(N * N * 3);
  for (let y = 0; y < N; y++) {
    raw.copy(Buffer.from(tile.buffer, y * N * 3, N * 3), 0, y * stride + 1, y * stride + 1 + N * 3);
  }
  const big = new Uint8ClampedArray(M * M * 3);
  for (let ty = 0; ty < 2; ty++) for (let tx = 0; tx < 2; tx++)
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const si = (y * N + x) * 3, di = ((ty * N + y) * M + tx * N + x) * 3;
      big[di] = tile[si]; big[di + 1] = tile[si + 1]; big[di + 2] = tile[si + 2];
    }
  // red seam cross at internal boundaries (row/col N-1 and N)
  for (let p = 0; p < M; p++) {
    for (const c of [N - 1, N]) {
      const a = (p * M + c) * 3, b = (c * M + p) * 3;
      big[a] = 255; big[a + 1] = 40; big[a + 2] = 40;
      big[b] = 255; big[b + 1] = 40; big[b + 2] = 40;
    }
  }
  const out = TexPNG.encode(big, M, M, false);
  fs.writeFileSync(path.join(dir, `${type}_2x2_seam.png`), out);
  console.log('wrote', `${type}_2x2_seam.png`, out.length, 'bytes');
}
