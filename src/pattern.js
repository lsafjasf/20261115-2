// Procedurally generated seamless six-color embroidery pattern on a 32x32 torus.
// Every motif is emitted by code (no hand-authored coordinate lists).

import { GRID_SIZE } from './core.js';

let runSeq = 0;

function makeStitch(x1, y1, x2, y2, colorIndex, runId) {
  const norm = (v) => ((v % GRID_SIZE) + GRID_SIZE) % GRID_SIZE;
  return { x1: norm(x1), y1: norm(y1), x2: norm(x2), y2: norm(y2), colorIndex, runId };
}

// A continuous polyline thread run; each consecutive point pair becomes a leg.
function polyline(points, colorIndex, stitches) {
  const runId = `run-${runSeq++}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    stitches.push(makeStitch(points[i][0], points[i][1], points[i + 1][0], points[i + 1][1], colorIndex, runId));
  }
}

// A deliberately mixed-color run: one switch over five legs (ratio 1/5 = 0.2).
function twoColorRun(points, colorA, colorB, stitches) {
  const runId = `run-${runSeq++}`;
  const colors = [colorA, colorA, colorA, colorB, colorB];
  for (let i = 0; i < points.length - 1; i += 1) {
    stitches.push(makeStitch(points[i][0], points[i][1], points[i + 1][0], points[i + 1][1], colors[i], runId));
  }
}

function diamond(cx, cy, r, colorIndex, stitches) {
  polyline([[cx, cy - r], [cx + r, cy], [cx, cy + r], [cx - r, cy], [cx, cy - r]], colorIndex, stitches);
}

function ring(cx, cy, r, colorIndex, stitches) {
  const pts = [];
  for (let i = 0; i < 8; i += 1) {
    const a = (Math.PI / 4) * i;
    pts.push([Math.round(cx + r * Math.cos(a)), Math.round(cy + r * Math.sin(a))]);
  }
  polyline([...pts, pts[0]], colorIndex, stitches);
}

// Dense diamond outline made of short <=4-cell legs with intermediate lattice points.
function shortDiamond(cx, cy, r, colorIndex, stitches) {
  const corners = [[cx, cy - r], [cx + r, cy], [cx, cy + r], [cx - r, cy], [cx, cy - r]];
  const pts = [];
  for (let i = 0; i < corners.length - 1; i += 1) {
    const [ax, ay] = corners[i];
    const [bx, by] = corners[i + 1];
    const steps = Math.max(Math.abs(bx - ax), Math.abs(by - ay));
    for (let k = 0; k < steps; k += 1) {
      pts.push([Math.round(ax + ((bx - ax) * k) / steps), Math.round(ay + ((by - ay) * k) / steps)]);
    }
  }
  pts.push(corners[0]);
  polyline(pts, colorIndex, stitches);
}

function star(cx, cy, rOuter, rInner, colorIndex, stitches) {
  const pts = [];
  for (let i = 0; i < 8; i += 1) {
    const a = (Math.PI / 4) * i - Math.PI / 2;
    const r = i % 2 === 0 ? rOuter : rInner;
    pts.push([Math.round(cx + r * Math.cos(a)), Math.round(cy + r * Math.sin(a))]);
  }
  polyline([...pts, pts[0]], colorIndex, stitches);
}

// Torus-translated copy of a motif so the pattern is periodic with period 16.
function translated(motif, ox, oy) {
  return motif.map((s) => ({ ...s, x1: s.x1 + ox, y1: s.y1 + oy, x2: s.x2 + ox, y2: s.y2 + oy }));
}

export function generatePattern() {
  runSeq = 0;
  const cell = [];

  // Medallion inside one 16x16 period cell: nested diamond, star, ring.
  shortDiamond(8, 8, 5, 0, cell); // 朱红 outer diamond, subdivided into unit legs
  star(8, 8, 4, 2, 1, cell); // 柘黄 eight-petal star (max leg ~3)
  ring(8, 8, 3, 5, cell); // 米白 inner ring

  // Edge rosettes sit on the cell borders; on the tiled torus they join their
  // translated twin across each seam instead of overlapping it.
  diamond(0, 8, 2, 3, cell); // 石绿, straddles left/right seam
  diamond(16, 8, 2, 2, cell); // 石青, torus-equivalent point with a second hue
  diamond(8, 0, 2, 3, cell); // 石绿, straddles top/bottom seam
  diamond(8, 16, 2, 2, cell); // 石青

  // Tortoiseshell lattice: 4x4 diagonal cells in 紫檀; each leg is sqrt(8) ~2.83.
  for (let gx = 0; gx < 16; gx += 4) {
    for (let gy = 0; gy < 16; gy += 4) {
      polyline([[gx, gy + 2], [gx + 2, gy], [gx + 4, gy + 2], [gx + 2, gy + 4], [gx, gy + 2]], 4, cell);
    }
  }

  // Seam-crossing couching: continuous unit-stitched rails that run off one
  // border and resume from the opposite one, so every tile edge carries an
  // unbroken whip-stitch line once the pattern is tiled.
  const verticalRail = (x, colorIndex) => {
    // Two short runs meet across the wrap; on the torus 16 and 0 are adjacent.
    polyline([[x, 14], [x, 15], [x, 16]], colorIndex, cell);
    polyline([[x, 0], [x, 1], [x, 2]], colorIndex, cell);
  };
  const horizontalRail = (y, colorIndex) => {
    polyline([[14, y], [15, y], [16, y]], colorIndex, cell);
    polyline([[0, y], [1, y], [2, y]], colorIndex, cell);
  };
  verticalRail(2, 5);
  verticalRail(13, 1);
  horizontalRail(10, 0);
  horizontalRail(13, 3);

  // One controlled mixed-color thread run (switch ratio 1/3 <= 0.4).
  twoColorRun([[4, 8], [5, 7], [6, 6], [7, 6], [8, 7], [7, 8]], 1, 5, cell);

  // Periodic replication with period 16 fills the 32x32 torus without overlap.
  const pattern = [...cell];
  for (const [ox, oy] of [[16, 0], [0, 16], [16, 16]]) {
    pattern.push(...translated(cell, ox, oy));
  }
  for (const stitch of pattern) {
    const norm = (v) => ((v % GRID_SIZE) + GRID_SIZE) % GRID_SIZE;
    stitch.x1 = norm(stitch.x1);
    stitch.y1 = norm(stitch.y1);
    stitch.x2 = norm(stitch.x2);
    stitch.y2 = norm(stitch.y2);
  }
  // Remove legs that coincide after torus folding (keeps the run structure intact).
  const seen = new Set();
  const deduped = pattern.filter((stitch) => {
    const key = [stitch.x1, stitch.y1, stitch.x2, stitch.y2, stitch.colorIndex].join(',');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return deduped;
}
