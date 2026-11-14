// Tiny software rasterizer: polygon fill with per-pixel color callback,
// capsule strokes for lead lines, 2x supersampling for antialiasing.

export class Raster {
  constructor(width, height, scale = 2) {
    this.w = width * scale;
    this.h = height * scale;
    this.scale = scale;
    this.outW = width;
    this.outH = height;
    this.buf = new Float32Array(this.w * this.h * 3);
  }

  fillBackground(rgb) {
    for (let i = 0; i < this.buf.length; i += 3) {
      this.buf[i] = rgb[0]; this.buf[i + 1] = rgb[1]; this.buf[i + 2] = rgb[2];
    }
  }

  // colorFn(x, y) -> [r,g,b] in device pixels
  fillPoly(pts, colorFn) {
    const s = this.scale;
    const dp = pts.map(([x, y]) => [x * s, y * s]);
    let y0 = Infinity, y1 = -Infinity;
    for (const [, y] of dp) { if (y < y0) y0 = y; if (y > y1) y1 = y; }
    y0 = Math.max(0, Math.floor(y0));
    y1 = Math.min(this.h - 1, Math.ceil(y1));
    const n = dp.length;
    for (let y = y0; y <= y1; y++) {
      const yc = y + 0.5;
      const xs = [];
      for (let i = 0; i < n; i++) {
        const [ax, ay] = dp[i];
        const [bx, by] = dp[(i + 1) % n];
        if ((ay <= yc && by > yc) || (by <= yc && ay > yc)) {
          xs.push(ax + ((yc - ay) / (by - ay)) * (bx - ax));
        }
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const xa = Math.max(0, Math.ceil(xs[k] - 0.5));
        const xb = Math.min(this.w - 1, Math.floor(xs[k + 1] - 0.5));
        const row = y * this.w * 3;
        for (let x = xa; x <= xb; x++) {
          const [r, g, b] = colorFn(x + 0.5, yc);
          const o = row + x * 3;
          this.buf[o] = r; this.buf[o + 1] = g; this.buf[o + 2] = b;
        }
      }
    }
  }

  // thick round-capped segment
  strokeSegment(a, b, halfWidth, rgb) {
    const s = this.scale;
    const ax = a[0] * s, ay = a[1] * s, bx = b[0] * s, by = b[1] * s;
    const hw = halfWidth * s;
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - hw));
    const x1 = Math.min(this.w - 1, Math.ceil(Math.max(ax, bx) + hw));
    const y0 = Math.max(0, Math.floor(Math.min(ay, by) - hw));
    const y1 = Math.min(this.h - 1, Math.ceil(Math.max(ay, by) + hw));
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy || 1e-9;
    const hw2 = hw * hw;
    for (let y = y0; y <= y1; y++) {
      const row = y * this.w * 3;
      for (let x = x0; x <= x1; x++) {
        const px = x + 0.5 - ax, py = y + 0.5 - ay;
        let t = (px * dx + py * dy) / len2;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const ex = px - t * dx, ey = py - t * dy;
        if (ex * ex + ey * ey <= hw2) {
          const o = row + x * 3;
          this.buf[o] = rgb[0]; this.buf[o + 1] = rgb[1]; this.buf[o + 2] = rgb[2];
        }
      }
    }
  }

  strokePoly(pts, halfWidth, rgb) {
    for (let i = 0; i < pts.length; i++) {
      this.strokeSegment(pts[i], pts[(i + 1) % pts.length], halfWidth, rgb);
    }
  }

  // per-pixel post process: fn(x, y, [r,g,b]) -> [r,g,b], device pixels
  apply(fn) {
    for (let y = 0; y < this.h; y++) {
      const row = y * this.w * 3;
      for (let x = 0; x < this.w; x++) {
        const o = row + x * 3;
        const out = fn(x + 0.5, y + 0.5, [this.buf[o], this.buf[o + 1], this.buf[o + 2]]);
        this.buf[o] = out[0]; this.buf[o + 1] = out[1]; this.buf[o + 2] = out[2];
      }
    }
  }

  downsample() {
    const s = this.scale;
    const out = Buffer.alloc(this.outW * this.outH * 4);
    for (let y = 0; y < this.outH; y++) {
      for (let x = 0; x < this.outW; x++) {
        let r = 0, g = 0, b = 0;
        for (let sy = 0; sy < s; sy++) {
          for (let sx = 0; sx < s; sx++) {
            const o = ((y * s + sy) * this.w + (x * s + sx)) * 3;
            r += this.buf[o]; g += this.buf[o + 1]; b += this.buf[o + 2];
          }
        }
        const n = s * s;
        const o = (y * this.outW + x) * 4;
        out[o] = Math.max(0, Math.min(255, Math.round(r / n)));
        out[o + 1] = Math.max(0, Math.min(255, Math.round(g / n)));
        out[o + 2] = Math.max(0, Math.min(255, Math.round(b / n)));
        out[o + 3] = 255;
      }
    }
    return out;
  }
}

export function hexRGB(hex) {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}
