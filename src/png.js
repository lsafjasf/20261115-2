/* Minimal PNG encoder (8-bit RGB or RGBA), zero third-party deps.
 * Uses Node's zlib when available; browser falls back to a tiny stored-block
 * deflate (still valid PNG, just larger). Shared across both runtimes. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    let zlib = null;
    try { zlib = require('zlib'); } catch (e) { zlib = null; }
    module.exports = factory(zlib);
  } else root.TexPNG = factory(root.pako ? { deflateSync: (b) => root.pako.deflate(b) } : null);
})(typeof self !== 'undefined' ? self : this, function (zlib) {
  'use strict';

  const CRC_TABLE = (() => {
    const t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c;
    }
    return t;
  })();

  function crc32(buf) {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  function u32(v) { return [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255]; }

  function chunk(type, data) {
    const len = u32(data.length);
    const typeBytes = [type.charCodeAt(0), type.charCodeAt(1), type.charCodeAt(2), type.charCodeAt(3)];
    const body = new Uint8Array(typeBytes.length + data.length);
    body.set(typeBytes, 0); body.set(data, typeBytes.length);
    const crc = u32(crc32(body));
    const out = new Uint8Array(4 + body.length + 4);
    out.set(len, 0); out.set(body, 4); out.set(crc, 4 + body.length);
    return out;
  }

  function concat(parts) {
    let total = 0;
    for (const p of parts) total += p.length;
    const out = new Uint8Array(total);
    let off = 0;
    for (const p of parts) { out.set(p, off); off += p.length; }
    return out;
  }

  /* Valid but uncompressed deflate via stored blocks (browser fallback). */
  function storedDeflate(input) {
    const blocks = [];
    let pos = 0;
    while (pos < input.length || input.length === 0) {
      const chunk = input.subarray(pos, Math.min(pos + 65535, input.length));
      const last = pos + chunk.length >= input.length ? 1 : 0;
      const header = new Uint8Array(5);
      header[0] = last;
      header[1] = chunk.length & 255; header[2] = (chunk.length >> 8) & 255;
      header[3] = ~chunk.length & 255; header[4] = (~chunk.length >> 8) & 255;
      blocks.push(header, chunk);
      pos += chunk.length;
      if (last) break;
    }
    return concat(blocks);
  }

  /* rgb: Uint8ClampedArray length w*h*3 (or *4 with alpha=true). Returns Uint8Array. */
  function encode(rgb, w, h, alpha) {
    const ch = alpha ? 4 : 3;
    const stride = w * ch;
    const raw = new Uint8Array((stride + 1) * h);
    for (let y = 0; y < h; y++) {
      raw[y * (stride + 1)] = 0; // filter type 0 (None)
      raw.set(rgb.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
    }
    const idat = zlib ? zlib.deflateSync(raw) : storedDeflate(raw);
    const ihdr = new Uint8Array([
      ...u32(w), ...u32(h), 8, alpha ? 6 : 2, 0, 0, 0,
    ]);
    const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    return concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', new Uint8Array(0))]);
  }

  return { encode };
});
