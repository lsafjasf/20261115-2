// Shared embroidery-pattern core: toroidal geometry, validation and SVG export.
// Used by both the browser editor (src/app.js) and the Node verification tools.

export const GRID_SIZE = 32; // 32 x 32 stitch lattice
export const CELL_PX = 20; // editor rendering: 20 px per lattice cell
export const MAX_STITCH_LENGTH = 5; // cells; longer adjacent legs are flagged
export const MAX_COLOR_SWITCH_RATIO = 0.4; // switches / legs inside one thread run
export const STROKE_WIDTH = 0.22; // in lattice-cell units

// Six-thread palette (traditional embroidery hues).
export const COLORS = [
  { name: '朱红', hex: '#C8372D' },
  { name: '柘黄', hex: '#E8A33D' },
  { name: '石青', hex: '#2E5EAA' },
  { name: '石绿', hex: '#3E8E5A' },
  { name: '紫檀', hex: '#7A4FA3' },
  { name: '米白', hex: '#F2E6D0' },
];

// Shortest signed displacement on a wrap-around (toroidal) grid.
export function torusDelta(a, b, n = GRID_SIZE) {
  let d = b - a;
  if (d > n / 2) d -= n;
  if (d < -n / 2) d += n;
  return d;
}

// Toroidal Euclidean length of one stitch leg, in lattice cells.
export function stitchLength(stitch, n = GRID_SIZE) {
  const dx = torusDelta(stitch.x1, stitch.x2, n);
  const dy = torusDelta(stitch.y1, stitch.y2, n);
  return Math.hypot(dx, dy);
}

// Split a toroidal stitch into drawable straight segments inside [0, n].
// A leg crossing a seam produces two segments tagged with the wrapped axis.
export function wrapSegments(stitch, n = GRID_SIZE) {
  const dx = torusDelta(stitch.x1, stitch.x2, n);
  const dy = torusDelta(stitch.y1, stitch.y2, n);
  const sx = stitch.x1;
  const sy = stitch.y1;
  const ex = sx + dx;
  const ey = sy + dy;
  // Seam axes for SVG twin emission: the extended endpoint goes strictly past
  // a border, or lands exactly on the far border (needs the 0-side twin).
  const seamX = ex < -1e-9 || ex > n + 1e-9 || Math.abs(ex - n) <= 1e-9 || Math.abs(ex) <= 1e-9;
  const seamY = ey < -1e-9 || ey > n + 1e-9 || Math.abs(ey - n) <= 1e-9 || Math.abs(ey) <= 1e-9;

  // Parameter intervals t in [0,1]; split at integer vertical/horizontal lines.
  const breaks = new Set([0, 1]);
  for (let k = Math.min(sx, ex); k <= Math.max(sx, ex); k += 1) {
    if (dx !== 0 && k >= 0 && k <= n) {
      const t = (k - sx) / dx;
      if (t > 0 && t < 1) breaks.add(t);
    }
  }
  for (let k = Math.min(sy, ey); k <= Math.max(sy, ey); k += 1) {
    if (dy !== 0 && k >= 0 && k <= n) {
      const t = (k - sy) / dy;
      if (t > 0 && t < 1) breaks.add(t);
    }
  }
  const ts = [...breaks].sort((a, b) => a - b);
  const parts = [];
  const fold = (v) => ((v % n) + n) % n;
  for (let i = 0; i < ts.length - 1; i += 1) {
    const t0 = ts[i];
    const t1 = ts[i + 1];
    const rawX1 = sx + dx * t0;
    const rawY1 = sy + dy * t0;
    const rawX2 = sx + dx * t1;
    const rawY2 = sy + dy * t1;
    // Inherit the seam axes of the whole leg; an endpoint sitting exactly on
    // the border still emits its opposite-edge twin via the SVG serializer.
    const crossesX = Math.min(rawX1, rawX2) < -1e-9 || Math.max(rawX1, rawX2) > n + 1e-9;
    const crossesY = Math.min(rawY1, rawY2) < -1e-9 || Math.max(rawY1, rawY2) > n + 1e-9;
    let wrap = 'none';
    if (crossesX && crossesY) wrap = 'xy';
    else if (crossesX) wrap = 'x';
    else if (crossesY) wrap = 'y';
    // Folded coordinates stay inside [0,n] for rasterizers; raw coordinates
    // preserve direction for seam-aware SVG serialization.
    const seg = {
      x1: fold(rawX1), y1: fold(rawY1), x2: fold(rawX2), y2: fold(rawY2),
      rawX1, rawY1, rawX2, rawY2, wrap, seamX, seamY,
    };
    parts.push(seg);
  }
  return parts;
}

// Validate stitch length and color-switch frequency.
// Stitches sharing a `runId` are consecutive legs of one continuous thread.
export function validateStitches(stitches) {
  const lengthIssues = [];
  const switchIssues = [];
  const runs = new Map();

  stitches.forEach((stitch, index) => {
    const length = stitchLength(stitch);
    stitch._length = Number(length.toFixed(2));
    if (length > MAX_STITCH_LENGTH) {
      lengthIssues.push({ index, length: Number(length.toFixed(2)), runId: stitch.runId });
    }
    if (!runs.has(stitch.runId)) runs.set(stitch.runId, []);
    runs.get(stitch.runId).push({ index, color: stitch.colorIndex });
  });

  let switchCount = 0;
  for (const [runId, legs] of runs) {
    let runSwitches = 0;
    const switchIndexes = [];
    for (let i = 1; i < legs.length; i += 1) {
      if (legs[i].color !== legs[i - 1].color) {
        runSwitches += 1;
        switchIndexes.push(legs[i].index);
      }
    }
    switchCount += runSwitches;
    const ratio = legs.length > 1 ? runSwitches / (legs.length - 1) : 0;
    if (ratio > MAX_COLOR_SWITCH_RATIO) {
      switchIssues.push({ runId, ratio: Number(ratio.toFixed(2)), indexes: switchIndexes });
    }
  }

  return {
    ok: lengthIssues.length === 0 && switchIssues.length === 0,
    lengthIssues,
    switchIssues,
    stats: {
      stitchCount: stitches.length,
      runCount: runs.size,
      switchCount,
      maxLength: stitches.length
        ? Number(Math.max(...stitches.map((s) => stitchLength(s))).toFixed(2))
        : 0,
      colorsUsed: [...new Set(stitches.map((s) => s.colorIndex))].sort(),
    },
  };
}

function xmlEscape(value) {
  return String(value).replace(/[<>&'"]/g, (c) =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]);
}

// Serialize the pattern to a seamless SVG in lattice-cell units.
// `seamWrap` repeats each segment on the torus periods so round caps clipped
// at a tile edge are painted on the opposite edge, matching the PNG rasterizer.
export function toSVG(stitches, { background = '#FBF7EE', grid = false, n = GRID_SIZE, seamWrap = true } = {}) {
  const lines = [];
  lines.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${n * 20}" height="${n * 20}" ` +
      `viewBox="0 0 ${n} ${n}">`,
  );
  lines.push(`<rect x="0" y="0" width="${n}" height="${n}" fill="${background}"/>`);
  if (grid) {
    for (let i = 0; i <= n; i += 1) {
      lines.push(`<path d="M${i} 0V${n}M0 ${i}H${n}" stroke="#d8d2c4" stroke-width="0.04" fill="none"/>`);
    }
  }
  // Build one tile from raw segment coordinates. Nine translated copies are
  // emitted and clipped to the central [0,n] square, so any round cap crossing
  // a border is completed by the neighbouring copy — a true toroidal SVG with
  // a 1:1 viewBox-to-pixel mapping (no scaling, no ghost diagonals).
  const tileLines = [];
  for (const stitch of stitches) {
    const color = COLORS[stitch.colorIndex].hex;
    for (const part of wrapSegments(stitch, n)) {
      tileLines.push(
        `<line x1="${part.rawX1}" y1="${part.rawY1}" x2="${part.rawX2}" y2="${part.rawY2}" ` +
          `stroke="${color}" stroke-width="${STROKE_WIDTH}" stroke-linecap="round"/>`,
      );
    }
  }
  if (seamWrap) {
    // A nested svg establishes its own overflow-hidden viewport at [0,0,n,n],
    // clipping the nine translated copies without clipPath coordinate issues.
    lines.push(`<svg x="0" y="0" width="${n}" height="${n}" viewBox="0 0 ${n} ${n}" overflow="hidden">`);
    for (const ox of [-n, 0, n]) {
      for (const oy of [-n, 0, n]) {
        lines.push(`<g transform="translate(${ox},${oy})">${tileLines.join('')}</g>`);
      }
    }
    lines.push('</svg>');
  } else {
    lines.push(tileLines.join(''));
  }
  lines.push('</svg>');
  return lines.join('\n');
}

export function download(filename, content, mime = 'image/svg+xml') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function describeColor(index) {
  const color = COLORS[index];
  return color ? `${color.name} ${color.hex}` : '未知';
}

export { xmlEscape };
