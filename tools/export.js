// Generate the two showcase patterns (SVG + PNG) and verify closure.
import { writeFileSync } from 'node:fs';
import { computeLayout, verifyLayout, toSVG, PALETTE, LEAD, FRAME_HI, FRAME_LO }
  from '../glass.js';
import { Raster, hexRGB } from './raster.js';
import { encodePNG } from './png.js';

const PATTERNS = [
  { name: 'pattern-a-rose', seed: 'rose-2026', motif: 'rose',
    rings: 4, tileSize: 95, borderWidth: 12 },
  { name: 'pattern-b-star', seed: 'star-7', motif: 'star',
    rings: 3, tileSize: 130, borderWidth: 18 },
];

function centroid(pts) {
  let x = 0, y = 0;
  for (const [px, py] of pts) { x += px; y += py; }
  return [x / pts.length, y / pts.length];
}

function lerp3(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function renderPNG(layout) {
  const S = 1000;
  const ras = new Raster(S, S, 2);
  const sc = ras.scale;
  ras.fillBackground(hexRGB('#0b0c10'));

  // halo behind the window
  const haloR = layout.frameOuter * 1.22 * sc;
  const cx = layout.cx * sc, cy = layout.cy * sc;
  ras.fillPoly(
    [[cx - haloR, cy - haloR], [cx + haloR, cy - haloR],
     [cx + haloR, cy + haloR], [cx - haloR, cy + haloR]],
    (x, y) => {
      const d = Math.hypot(x - cx, y - cy) / haloR;
      const g = Math.max(0, 1 - d) ** 2 * 26;
      return [11 + g * 0.8, 12 + g * 0.9, 16 + g * 1.6];
    });

  // glass tiles with radial shading
  for (const t of layout.tiles) {
    const c = PALETTE[t.color];
    const hi = hexRGB(c.hi), base = hexRGB(c.base), lo = hexRGB(c.lo);
    const [gx, gy] = centroid(t.pts);
    const gxs = (gx - 10) * sc, gys = (gy - 14) * sc;
    const reach = layout.tileSize * 1.15 * sc;
    ras.fillPoly(t.pts, (x, y) => {
      const t1 = Math.min(1, Math.hypot(x - gxs, y - gys) / reach);
      return t1 < 0.55
        ? lerp3(hi, base, t1 / 0.55)
        : lerp3(base, lo, (t1 - 0.55) / 0.45);
    });
  }

  // lead cames
  const lead = hexRGB(LEAD);
  for (const t of layout.tiles) {
    ras.strokePoly(t.pts, layout.borderWidth / 2, lead);
  }

  // closed outer frame annulus
  const hiF = hexRGB(FRAME_HI), loF = hexRGB(FRAME_LO);
  const rIn = layout.glassR * sc, rOut = layout.frameOuter * sc;
  const diag = (ras.w + ras.h);
  ras.apply((x, y, rgb) => {
    const d = Math.hypot(x - cx, y - cy);
    if (d > rIn && d <= rOut) {
      const t = (x + y) / diag;
      return lerp3(hiF, loF, t);
    }
    return rgb;
  });

  // thin lead circles edging the frame
  const circlePts = (r, n = 360) => {
    const p = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      p.push([layout.cx + r * Math.cos(a), layout.cy + r * Math.sin(a)]);
    }
    return p;
  };
  ras.strokePoly(circlePts(layout.frameOuter), layout.borderWidth * 0.3, lead);
  ras.strokePoly(circlePts(layout.glassR), layout.borderWidth * 0.3, lead);

  // transmitted light: bright upper-left, gentle falloff to the rim
  const lx = cx * 0.76, ly = cy * 0.64;
  const glassPx = layout.glassR * sc;
  ras.apply((x, y, rgb) => {
    const dCenter = Math.hypot(x - cx, y - cy);
    if (dCenter > rOut) return rgb;
    const dLight = Math.hypot(x - lx, y - ly) / (glassPx * 1.35);
    const f = 1.32 - 0.55 * Math.min(1, dLight);
    return [rgb[0] * f, rgb[1] * f, rgb[2] * f];
  });

  return encodePNG(ras.outW, ras.outH, ras.downsample());
}

let failed = false;
for (const p of PATTERNS) {
  const layout = computeLayout({ ...p, size: 1000 });
  const v = verifyLayout(layout);
  if (!v.ok) {
    failed = true;
    console.error(`✗ ${p.name}:`, v.problems);
    continue;
  }
  writeFileSync(`artifacts/${p.name}.svg`, toSVG(layout));
  writeFileSync(`artifacts/${p.name}.png`, renderPNG(layout));
  console.log(`✓ ${p.name}: closed outer ring, ${layout.tiles.length} tiles, `
    + `no adjacent color repeats (motif=${layout.motifType})`);
}

// Seed sweep: dimensions must stay stable, structure always closed.
const dims = new Set();
for (let i = 1; i <= 60; i++) {
  const l = computeLayout({ seed: `sweep-${i}`, motif: 'auto', rings: 4,
    tileSize: 95, borderWidth: 12, size: 1000 });
  dims.add(`${l.size}/${l.frameOuter.toFixed(2)}/${l.glassR.toFixed(2)}`);
  const v = verifyLayout(l);
  if (!v.ok) { failed = true; console.error(`✗ sweep-${i}:`, v.problems); }
}
console.log(dims.size === 1
  ? '✓ seed sweep: 60 seeds, dimensions stable, all closed'
  : `✗ seed sweep: dimensions vary! ${[...dims].join(' | ')}`);

process.exit(failed ? 1 : 0);
