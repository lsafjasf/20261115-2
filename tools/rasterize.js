// Toroidal embroidery rasterizers.
// - renderPattern: dependency-free distance-field rasterizer used for
//   toroidal seam/tiling topology checks.
// - renderCanonical / renderCanonicalTiled: standard SVG engine (resvg) output
//   used for the shipped PNG, matching the browser canvas antialiasing.

import sharp from 'sharp';
import { Resvg } from '@resvg/resvg-js';
import { COLORS, STROKE_WIDTH, wrapSegments } from '../src/core.js';
import { toSVG } from '../src/core.js';

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

const BG = hexToRgb('#FBF7EE');

export function createBuffer(size) {
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i += 1) {
    data[i * 4] = BG.r;
    data[i * 4 + 1] = BG.g;
    data[i * 4 + 2] = BG.b;
    data[i * 4 + 3] = 255;
  }
  return { size, data };
}

function setPixel(buf, x, y, rgb, alpha) {
  // Wrap around the full rendered canvas (a whole number of tiles), so caps
  // clipped at any tile edge are painted on the matching opposite edge.
  const wx = (((x | 0) % buf.size) + buf.size) % buf.size;
  const wy = (((y | 0) % buf.size) + buf.size) % buf.size;
  const i = (wy * buf.size + wx) * 4;
  const inv = 1 - alpha;
  buf.data[i] = Math.round(rgb.r * alpha + buf.data[i] * inv);
  buf.data[i + 1] = Math.round(rgb.g * alpha + buf.data[i + 1] * inv);
  buf.data[i + 2] = Math.round(rgb.b * alpha + buf.data[i + 2] * inv);
}

function paintSegment(buf, x1, y1, x2, y2, rgb, radius) {
  const minX = Math.floor(Math.min(x1, x2) - radius - 1);
  const maxX = Math.ceil(Math.max(x1, x2) + radius + 1);
  const minY = Math.floor(Math.min(y1, y2) - radius - 1);
  const maxY = Math.ceil(Math.max(y1, y2) + radius + 1);
  const vx = x2 - x1;
  const vy = y2 - y1;
  const len2 = vx * vx + vy * vy || 1e-9;
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const t = Math.max(0, Math.min(1, ((x + 0.5 - x1) * vx + (y + 0.5 - y1) * vy) / len2));
      const px = x1 + vx * t;
      const py = y1 + vy * t;
      const d = Math.hypot(x + 0.5 - px, y + 0.5 - py);
      const alpha = Math.max(0, Math.min(1, radius - d + 0.5));
      if (alpha > 0) setPixel(buf, x, y, rgb, alpha);
    }
  }
}

export function renderPattern(stitches, { size = 960, gridSize = 32, tiles = 1 } = {}) {
  const total = size * tiles;
  const buf = createBuffer(total);
  const scale = size / gridSize;
  const radius = (STROKE_WIDTH * scale) / 2;
  for (let ty = 0; ty < tiles; ty += 1) {
    for (let tx = 0; tx < tiles; tx += 1) {
      const ox = tx * size;
      const oy = ty * size;
      for (const stitch of stitches) {
        const rgb = hexToRgb(COLORS[stitch.colorIndex].hex);
        for (const part of wrapSegments(stitch, gridSize)) {
          const x1 = ox + part.x1 * scale;
          const y1 = oy + part.y1 * scale;
          const x2 = ox + part.x2 * scale;
          const y2 = oy + part.y2 * scale;
          // Repeat each segment along the torus periods (full-canvas width)
          // so round caps clipped at one edge reappear on the opposite edge.
          for (const repX of [-1, 0, 1]) {
            for (const repY of [-1, 0, 1]) {
              paintSegment(
                buf,
                x1 + repX * total, y1 + repY * total,
                x2 + repX * total, y2 + repY * total,
                rgb, radius,
              );
            }
          }
        }
      }
    }
  }
  return buf;
}

export async function savePNG(buf, path) {
  await sharp(buf.data, { raw: { width: buf.size, height: buf.size, channels: 4 } })
    .png()
    .toFile(path);
}

export async function saveSVG(svg, path) {
  await sharp(Buffer.from(svg)).png().toFile(path);
}

// Rasterize the seamless SVG (already toroidal via nine translated copies)
// with a standards-compliant engine. Returns raw RGBA plus metadata.
export async function renderCanonical(stitches, size) {
  const svg = toSVG(stitches);
  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: size } });
  const png = resvg.render().asPng();
  return sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
}

// Build a tiles x tiles seamless mosaic by repeating the canonical tile PNG.
export async function renderCanonicalTiled(stitches, tileSize, tiles) {
  const resvg = new Resvg(toSVG(stitches), { fitTo: { mode: 'width', value: tileSize } });
  const tilePng = resvg.render().asPng();
  const total = tileSize * tiles;
  const composites = [];
  for (let ty = 0; ty < tiles; ty += 1) {
    for (let tx = 0; tx < tiles; tx += 1) {
      composites.push({ input: tilePng, left: tx * tileSize, top: ty * tileSize });
    }
  }
  return sharp({
    create: { width: total, height: total, channels: 4, background: '#FBF7EE' },
  })
    .composite(composites)
    .raw()
    .toBuffer({ resolveWithObject: true });
}

export function isBackground(buf, x, y) {
  const i = (y * buf.size + x) * 4;
  return Math.abs(buf.data[i] - BG.r) < 6
    && Math.abs(buf.data[i + 1] - BG.g) < 6
    && Math.abs(buf.data[i + 2] - BG.b) < 6;
}
