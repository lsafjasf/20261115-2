// Shared procedural stained-glass window: geometry, coloring, SVG export.
// Used by the browser app (index.html) and the Node exporter (tools/export.js).

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashSeed(str) {
  const s = String(str);
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export const PALETTE = [
  { name: 'ruby',     hi: '#ff7a86', base: '#d62839', lo: '#7c1220' },
  { name: 'amber',    hi: '#ffd166', base: '#f4a261', lo: '#96551c' },
  { name: 'emerald',  hi: '#7bd88f', base: '#2a9d5c', lo: '#0e4f2d' },
  { name: 'sapphire', hi: '#6aa8ff', base: '#2b5fd9', lo: '#122c6e' },
  { name: 'violet',   hi: '#c79bff', base: '#7d3cc9', lo: '#3a1862' },
  { name: 'cyan',     hi: '#7fe7e0', base: '#2bb3a3', lo: '#0e554d' },
  { name: 'rose',     hi: '#ff9fd0', base: '#e05299', lo: '#771d4e' },
  { name: 'gold',     hi: '#ffe9a3', base: '#e9c46a', lo: '#86681d' },
];

export const LEAD = '#16171d';
export const FRAME_HI = '#4a4d57';
export const FRAME_LO = '#23242b';

const TAU = Math.PI * 2;

function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

function arcPoints(cx, cy, r, a0, a1, step = TAU / 240) {
  const pts = [];
  const n = Math.max(2, Math.ceil(Math.abs(a1 - a0) / step));
  for (let i = 0; i <= n; i++) {
    const a = a0 + (a1 - a0) * (i / n);
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return pts;
}

// --- Center motifs -------------------------------------------------------
// Every motif returns tiles that exactly tile the disk of radius R around
// (cx, cy). Each tile: { pts, a0, a1, outer } where [a0,a1] is the angular
// span used for adjacency and `outer` marks tiles touching radius R.

function motifRose(rng, cx, cy, R) {
  const k = 5 + Math.floor(rng() * 4);          // 5..8 petals
  const rot = rng() * TAU;
  const rd = R * 0.26;                          // center disk radius
  const amp = 0.35 * (Math.PI / k);             // boundary wobble
  const tiles = [];
  tiles.push({ pts: arcPoints(cx, cy, rd, 0, TAU), a0: 0, a1: TAU, outer: false });
  const sector = TAU / k;
  for (let i = 0; i < k; i++) {
    const b0 = rot + i * sector - sector / 2;
    const b1 = b0 + sector;
    const pts = arcPoints(cx, cy, rd, b0, b1);
    const N = 24;
    for (let s = 0; s <= N; s++) {              // outer boundary b1, rd -> R
      const t = s / N;
      const r = rd + (R - rd) * t;
      const a = b1 + amp * Math.sin(Math.PI * t);
      pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
    for (const p of arcPoints(cx, cy, R, b1, b0)) pts.push(p);
    for (let s = N; s >= 0; s--) {              // boundary b0, R -> rd
      const t = s / N;
      const r = rd + (R - rd) * t;
      const a = b0 + amp * Math.sin(Math.PI * t);
      pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
    tiles.push({ pts, a0: b0, a1: b1, outer: true });
  }
  return tiles;
}

function motifStar(rng, cx, cy, R) {
  const k = 5 + Math.floor(rng() * 4);          // 5..8 points
  const rot = rng() * TAU;
  const rIn = R * (0.42 + rng() * 0.1);
  const star = [];
  const tips = [];
  const indents = [];
  for (let i = 0; i < k; i++) {
    const aTip = rot + (i * TAU) / k;
    const aIn = aTip + Math.PI / k;
    tips.push([cx + R * Math.cos(aTip), cy + R * Math.sin(aTip), aTip]);
    indents.push([cx + rIn * Math.cos(aIn), cy + rIn * Math.sin(aIn)]);
  }
  for (let i = 0; i < k; i++) {
    star.push([tips[i][0], tips[i][1]], indents[i]);
  }
  const tiles = [{ pts: star, a0: 0, a1: TAU, outer: false }];
  for (let i = 0; i < k; i++) {                 // kites between star and rim
    const t0 = tips[i];
    const t1 = tips[(i + 1) % k];
    const wrap = i === k - 1 ? TAU : 0;
    const pts = [[t0[0], t0[1]], indents[i], [t1[0], t1[1]]];
    for (const p of arcPoints(cx, cy, R, t1[2], t0[2] + wrap)) pts.push(p);
    tiles.push({ pts, a0: t0[2], a1: t0[2] + TAU / k, outer: true });
  }
  return tiles;
}

function motifMedallion(rng, cx, cy, R) {
  const m = 6 + Math.floor(rng() * 4);          // sectors per band
  const rot = rng() * TAU;
  const r0 = R * 0.34;
  const r1 = R * 0.67;
  const tiles = [{ pts: arcPoints(cx, cy, r0, 0, TAU), a0: 0, a1: TAU, outer: false }];
  const sector = TAU / m;
  for (let i = 0; i < m; i++) {                 // middle band
    const a0 = rot + i * sector;
    const pts = arcPoints(cx, cy, r0, a0, a0 + sector)
      .concat(arcPoints(cx, cy, r1, a0 + sector, a0));
    tiles.push({ pts, a0, a1: a0 + sector, outer: false });
  }
  for (let i = 0; i < m; i++) {                 // outer band, staggered
    const a0 = rot + (i + 0.5) * sector;
    const pts = arcPoints(cx, cy, r1, a0, a0 + sector)
      .concat(arcPoints(cx, cy, R, a0 + sector, a0));
    tiles.push({ pts, a0, a1: a0 + sector, outer: true });
  }
  return tiles;
}

const MOTIFS = { rose: motifRose, star: motifStar, medallion: motifMedallion };
export const MOTIF_NAMES = Object.keys(MOTIFS);

// --- Layout --------------------------------------------------------------

export function computeLayout(opts = {}) {
  const size = opts.size || 1000;
  const seed = hashSeed(opts.seed ?? '1');
  const rng = mulberry32(seed);
  const rings = clamp(Math.round(opts.rings ?? 3), 1, 6);
  const tileSize = clamp(opts.tileSize ?? 90, 30, 260);
  const borderWidth = clamp(opts.borderWidth ?? 10, 2, 30);

  const cx = size / 2;
  const cy = size / 2;
  const frameOuter = size / 2 - borderWidth / 2 - 4;   // stable across seeds
  const frameW = Math.max(borderWidth * 1.8, 16);
  const glassR = frameOuter - frameW;                  // outer radius of glass
  const motifR = glassR * 0.34;

  let motifType = opts.motif || 'auto';
  if (motifType === 'auto') motifType = MOTIF_NAMES[seed % MOTIF_NAMES.length];
  const centerTiles = MOTIFS[motifType](rng, cx, cy, motifR);

  const tiles = [];
  const ringInfo = [];
  for (const t of centerTiles) {
    tiles.push({ pts: t.pts, ring: -1, a0: t.a0, a1: t.a1, outer: t.outer });
  }
  const band = (glassR - motifR) / rings;
  for (let i = 0; i < rings; i++) {
    const rIn = motifR + band * i;
    const rOut = rIn + band;
    const mid = (rIn + rOut) / 2;
    const n = Math.max(6, Math.round((TAU * mid) / tileSize)); // seed-independent
    const step = TAU / n;                            // exact: n * step === TAU
    const offset = rng() * step + (i % 2) * step * 0.5;
    const segs = [];
    for (let j = 0; j < n; j++) {
      const a0 = offset + j * step;
      const a1 = a0 + step;
      const pts = arcPoints(cx, cy, rIn, a0, a1)
        .concat(arcPoints(cx, cy, rOut, a1, a0));
      segs.push({ a0, a1 });
      tiles.push({ pts, ring: i, seg: j, a0, a1, outer: i === rings - 1 });
    }
    ringInfo.push({ index: i, rIn, rOut, n, step, offset, segs });
  }

  const layout = {
    size, cx, cy, rings, tileSize, borderWidth,
    frameOuter, frameW, glassR, motifR, motifType,
    tiles, ringInfo, seed: opts.seed ?? '1',
  };
  buildAdjacency(layout);
  assignColors(layout, rng);
  return layout;
}

// Adjacency by shared boundary: sample polygon vertices and edge midpoints,
// two tiles are neighbors when any pair of samples nearly coincides.
function buildAdjacency(layout) {
  const tiles = layout.tiles;
  const eps = 1.5;
  const samples = tiles.map((t) => {
    const s = [];
    const p = t.pts;
    for (let i = 0; i < p.length; i++) {
      const a = p[i];
      const b = p[(i + 1) % p.length];
      s.push(a, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
    }
    return s;
  });
  const boxes = tiles.map((t) => {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const [x, y] of t.pts) {
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    return [x0 - eps, y0 - eps, x1 + eps, y1 + eps];
  });
  for (const t of tiles) t.neighbors = new Set();
  for (let i = 0; i < tiles.length; i++) {
    for (let j = i + 1; j < tiles.length; j++) {
      const A = boxes[i], B = boxes[j];
      if (A[0] > B[2] || B[0] > A[2] || A[1] > B[3] || B[1] > A[3]) continue;
      let hit = false;
      outer:
      for (const pa of samples[i]) {
        for (const pb of samples[j]) {
          const dx = pa[0] - pb[0], dy = pa[1] - pb[1];
          if (dx * dx + dy * dy < eps * eps) { hit = true; break outer; }
        }
      }
      if (hit) { tiles[i].neighbors.add(j); tiles[j].neighbors.add(i); }
    }
  }
}

// Greedy coloring: no two adjacent tiles share a color.
function assignColors(layout, rng) {
  const tiles = layout.tiles;
  const order = tiles.map((_, i) => i);
  // color center first, then rings outward (ids already ordered that way)
  for (const i of order) {
    const pref = PALETTE.map((_, c) => c);
    for (let k = pref.length - 1; k > 0; k--) {
      const j = Math.floor(rng() * (k + 1));
      [pref[k], pref[j]] = [pref[j], pref[k]];
    }
    const used = new Set();
    for (const n of tiles[i].neighbors) {
      if (tiles[n].color !== undefined) used.add(tiles[n].color);
    }
    let chosen = -1;
    for (const c of pref) if (!used.has(c)) { chosen = c; break; }
    if (chosen === -1) {                        // fallback: rarest among neighbors
      const count = new Map();
      for (const n of tiles[i].neighbors) {
        const c = tiles[n].color;
        if (c !== undefined) count.set(c, (count.get(c) || 0) + 1);
      }
      chosen = pref[0];
      let best = Infinity;
      for (const c of pref) {
        const v = count.get(c) || 0;
        if (v < best) { best = v; chosen = c; }
      }
    }
    tiles[i].color = chosen;
  }
}

// --- Verification --------------------------------------------------------
// Checks the outer structure is closed (each ring's segments wrap with no
// gap or overlap, frame is a continuous annulus) and no adjacent tiles
// share a color. Returns { ok, problems }.
export function verifyLayout(layout) {
  const problems = [];
  const EPS = 1e-6;
  for (const ring of layout.ringInfo) {
    let sum = 0;
    for (let j = 0; j < ring.segs.length; j++) {
      const cur = ring.segs[j];
      const nxt = ring.segs[(j + 1) % ring.segs.length];
      sum += cur.a1 - cur.a0;
      let gap = nxt.a0 - cur.a1;
      if (j === ring.segs.length - 1) gap = (nxt.a0 + TAU) - cur.a1;
      if (Math.abs(gap) > EPS) {
        problems.push(`ring ${ring.index} seg ${j}: gap/overlap ${gap}`);
      }
    }
    if (Math.abs(sum - TAU) > 1e-6) {
      problems.push(`ring ${ring.index}: angular sum ${sum} != 2pi`);
    }
  }
  if (!(layout.frameW > 0) || !(layout.glassR < layout.frameOuter)) {
    problems.push('frame annulus degenerate');
  }
  const lastRing = layout.ringInfo[layout.ringInfo.length - 1];
  if (Math.abs(lastRing.rOut - layout.glassR) > EPS) {
    problems.push('outer glass ring does not meet the frame');
  }
  if (Math.abs(layout.ringInfo[0].rIn - layout.motifR) > EPS) {
    problems.push('inner ring does not meet the center motif');
  }
  let conflicts = 0;
  for (let i = 0; i < layout.tiles.length; i++) {
    const t = layout.tiles[i];
    if (!t.pts || t.pts.length < 3) problems.push(`tile ${i}: degenerate polygon`);
    for (const [x, y] of t.pts) {
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        problems.push(`tile ${i}: non-finite point`);
        break;
      }
    }
    for (const n of t.neighbors) {
      if (n > i && layout.tiles[n].color === t.color) conflicts++;
    }
  }
  if (conflicts > 0) problems.push(`${conflicts} adjacent tile pairs share a color`);
  // every tile must have at least one neighbor (no isolated holes)
  for (let i = 0; i < layout.tiles.length; i++) {
    if (layout.tiles[i].neighbors.size === 0) {
      problems.push(`tile ${i} (ring ${layout.tiles[i].ring}) is isolated`);
    }
  }
  return { ok: problems.length === 0, problems };
}

// --- SVG export ----------------------------------------------------------

function pathFromPts(pts) {
  let d = `M${pts[0][0].toFixed(2)},${pts[0][1].toFixed(2)}`;
  for (let i = 1; i < pts.length; i++) {
    d += `L${pts[i][0].toFixed(2)},${pts[i][1].toFixed(2)}`;
  }
  return d + 'Z';
}

export function toSVG(layout) {
  const s = layout.size;
  const out = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">`);
  out.push('<defs>');
  PALETTE.forEach((p, i) => {
    out.push(`<radialGradient id="glass${i}" cx="42%" cy="38%" r="75%">`
      + `<stop offset="0%" stop-color="${p.hi}"/>`
      + `<stop offset="55%" stop-color="${p.base}"/>`
      + `<stop offset="100%" stop-color="${p.lo}"/></radialGradient>`);
  });
  out.push(`<linearGradient id="frameMetal" x1="0" y1="0" x2="1" y2="1">`
    + `<stop offset="0%" stop-color="${FRAME_HI}"/>`
    + `<stop offset="100%" stop-color="${FRAME_LO}"/></linearGradient>`);
  out.push(`<radialGradient id="light" cx="38%" cy="32%" r="80%">`
    + `<stop offset="0%" stop-color="#ffffff" stop-opacity="0.28"/>`
    + `<stop offset="60%" stop-color="#ffffff" stop-opacity="0.05"/>`
    + `<stop offset="100%" stop-color="#000000" stop-opacity="0.22"/></radialGradient>`);
  out.push('</defs>');
  out.push(`<rect width="${s}" height="${s}" fill="#0b0c10"/>`);
  for (const t of layout.tiles) {
    out.push(`<path d="${pathFromPts(t.pts)}" fill="url(#glass${t.color})" `
      + `stroke="${LEAD}" stroke-width="${layout.borderWidth}" `
      + `stroke-linejoin="round" stroke-linecap="round"/>`);
  }
  const midR = layout.frameOuter - layout.frameW / 2;
  out.push(`<circle cx="${layout.cx}" cy="${layout.cy}" r="${midR.toFixed(2)}" `
    + `fill="none" stroke="url(#frameMetal)" stroke-width="${layout.frameW}"/>`);
  out.push(`<circle cx="${layout.cx}" cy="${layout.cy}" r="${layout.frameOuter.toFixed(2)}" `
    + `fill="none" stroke="${LEAD}" stroke-width="${layout.borderWidth * 0.6}"/>`);
  out.push(`<circle cx="${layout.cx}" cy="${layout.cy}" r="${layout.glassR.toFixed(2)}" `
    + `fill="none" stroke="${LEAD}" stroke-width="${layout.borderWidth * 0.6}"/>`);
  out.push(`<circle cx="${layout.cx}" cy="${layout.cy}" r="${layout.frameOuter.toFixed(2)}" `
    + `fill="url(#light)"/>`);
  out.push('</svg>');
  return out.join('\n');
}
