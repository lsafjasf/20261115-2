// Geometric ornament generators.
// Each generator returns an SVG string anchored at (0,0) of its own
// <g transform="translate(x,y)"> group. All randomness comes from `rng`,
// so identical configs and seeds reproduce identical output.

const TAU = Math.PI * 2;

function pts(cx, cy, radius, count, rotation = 0) {
  return Array.from({ length: count }, (_, i) => {
    const angle = rotation + (TAU * i) / count;
    return [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)];
  });
}

function polygonPoints(cx, cy, radius, count, rotation = 0) {
  return pts(cx, cy, radius, count, rotation)
    .map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
}

// 1. Repeating diamond lattice — used in horizontal friezes.
export function diamondLattice(width, height, palette, rng) {
  const cell = height * 0.92;
  const gap = cell * 0.16;
  const cols = Math.max(2, Math.round(width / cell));
  const step = width / cols;
  const colors = [palette.ink, palette.accent, palette.muted];
  const pieces = [];
  for (let col = 0; col < cols; col += 1) {
    const cx = step * (col + 0.5);
    const cy = height / 2 + rng.range(-height * 0.05, height * 0.05);
    const r = step * 0.42 - gap;
    const fill = colors[col % colors.length];
    pieces.push(
      `<polygon points="${polygonPoints(cx, cy, r, 4, Math.PI / 4)}" `
      + `fill="${fill}" stroke="${palette.paper}" stroke-width="${Math.max(1, cell * 0.05)}"/>`,
    );
    pieces.push(
      `<polygon points="${polygonPoints(cx, cy, r * 0.42, 4, Math.PI / 4)}" fill="${palette.paper}"/>`,
    );
  }
  return pieces.join('');
}

// 4. Triangle tessellation band, alternating up/down triangles.
export function triangleTessellation(width, height, palette, rng) {
  const rows = rng.pick([2, 3]);
  const rowH = height / rows;
  const cols = Math.max(4, Math.round(width / (rowH * 1.1)));
  const colW = width / cols;
  const pieces = [];
  for (let row = 0; row < rows; row += 1) {
    const top = row * rowH;
    for (let col = 0; col < cols; col += 1) {
      const left = col * colW;
      const up = (row + col) % 2 === 0;
      const points = up
        ? `${left},${top + rowH} ${left + colW},${top + rowH} ${left + colW / 2},${top}`
        : `${left},${top} ${left + colW},${top} ${left + colW / 2},${top + rowH}`;
      const tone = (row + col) % 3;
      const fill = tone === 0 ? palette.ink : tone === 1 ? palette.accent : palette.muted;
      pieces.push(
        `<polygon points="${points}" fill="${fill}" stroke="${palette.paper}" `
        + `stroke-width="${Math.max(1, Math.min(colW, rowH) * 0.06)}"/>`,
      );
    }
  }
  return pieces.join('');
}

// 5. Radial starburst medallion: alternating rays around a core.
export function radialStarburst(size, palette, rng) {
  const cx = size / 2;
  const cy = size / 2;
  const rays = rng.pick([12, 16, 24]);
  const outer = size * 0.47;
  const inner = outer * rng.range(0.55, 0.72);
  const pieces = [];
  for (let i = 0; i < rays; i += 1) {
    const a0 = (TAU * i) / rays;
    const a1 = (TAU * (i + 0.5)) / rays;
    const a2 = (TAU * (i + 1)) / rays;
    const p0 = [cx + inner * Math.cos(a0), cy + inner * Math.sin(a0)];
    const p1 = [cx + outer * Math.cos(a1), cy + outer * Math.sin(a1)];
    const p2 = [cx + inner * Math.cos(a2), cy + inner * Math.sin(a2)];
    pieces.push(
      `<polygon points="${p0.map((v) => v.toFixed(2)).join(',')} `
      + `${p1.map((v) => v.toFixed(2)).join(',')} ${p2.map((v) => v.toFixed(2)).join(',')}" `
      + `fill="${i % 2 ? palette.accent : palette.ink}"/>`,
    );
  }
  pieces.push(`<circle cx="${cx}" cy="${cy}" r="${(size * 0.18).toFixed(2)}" fill="${palette.paper}"/>`);
  pieces.push(
    `<circle cx="${cx}" cy="${cy}" r="${(size * 0.12).toFixed(2)}" fill="${palette.ink}"/>`,
  );
  return pieces.join('');
}

// 6. Chevron zigzag band with nested strokes.
export function chevronBand(width, height, palette, rng) {
  const depth = height * 0.42;
  const count = Math.max(4, Math.floor(width / (depth * 1.3)));
  const step = (width - depth) / count;
  const mid = height / 2;
  const layers = rng.pick([2, 3]);
  const pieces = [];
  for (let layer = 0; layer < layers; layer += 1) {
    const d = depth * (1 - layer * 0.28);
    let dPath = '';
    for (let i = 0; i <= count; i += 1) {
      const x = depth / 2 + step * i;
      const y = mid + (i % 2 === 0 ? -d : d);
      dPath += `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)} `;
    }
    pieces.push(
      `<path d="${dPath}" fill="none" stroke="${layer % 2 ? palette.accent : palette.ink}" `
      + `stroke-width="${(height * 0.13).toFixed(2)}" stroke-linejoin="miter"/>`,
    );
  }
  return pieces.join('');
}

export const PATTERNS = {
  diamondLattice: { id: 'diamondLattice', name: '菱格锦', medallion: false, build: diamondLattice },
  concentricRings: { id: 'concentricRings', name: '同心环', medallion: true, build: concentricRings },
  waveBand: { id: 'waveBand', name: '海浪纹', medallion: false, build: waveBand },
  triangleTessellation: { id: 'triangleTessellation', name: '三角密铺', medallion: false, build: triangleTessellation },
  radialStarburst: { id: 'radialStarburst', name: '放射星芒', medallion: true, build: radialStarburst },
  chevronBand: { id: 'chevronBand', name: '锯齿山纹', medallion: false, build: chevronBand },
};

// 2. Concentric ring medallion with an inner polygon.
export function concentricRings(size, palette, rng) {
  const cx = size / 2;
  const cy = size / 2;
  const rings = rng.int(3, 4);
  const pieces = [];
  for (let i = rings; i >= 1; i -= 1) {
    const radius = (size * 0.46 * i) / rings;
    pieces.push(
      `<circle cx="${cx}" cy="${cy}" r="${radius.toFixed(2)}" fill="none" `
      + `stroke="${i % 2 ? palette.ink : palette.accent}" stroke-width="${(size * 0.028).toFixed(2)}"/>`,
    );
  }
  const sides = rng.pick([6, 8, 12]);
  pieces.push(
    `<polygon points="${polygonPoints(cx, cy, size * 0.2, sides, -Math.PI / 2)}" `
    + `fill="${palette.ink}"/>`,
  );
  pieces.push(
    `<polygon points="${polygonPoints(cx, cy, size * 0.1, sides, -Math.PI / 2)}" `
    + `fill="${palette.paper}"/>`,
  );
  return pieces.join('');
}

// 3. Scallop / wave band made of overlapping semicircles.
export function waveBand(width, height, palette, rng) {
  const radius = height * 0.46;
  const count = Math.max(3, Math.round(width / (radius * 1.15)));
  const step = width / count;
  const pieces = [];
  pieces.push(`<rect x="0" y="${height - radius * 0.55}" width="${width}" height="${radius * 0.55}" fill="${palette.muted}"/>`);
  for (let i = 0; i < count; i += 1) {
    const x = step * (i + 0.5);
    const y = height - radius * 0.55;
    pieces.push(
      `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${radius.toFixed(2)}" `
      + `fill="${i % 2 ? palette.accent : palette.ink}"/>`,
    );
    pieces.push(
      `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${(radius * 0.42).toFixed(2)}" `
      + `fill="${palette.paper}" opacity="0.85"/>`,
    );
  }
  pieces.push(
    `<line x1="0" y1="${height - radius * 0.55}" x2="${width}" y2="${height - radius * 0.55}" `
    + `stroke="${palette.paper}" stroke-width="${Math.max(1.5, height * 0.04)}"/>`,
  );
  return pieces.join('');
}
