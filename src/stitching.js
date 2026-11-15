import {
  CONTENT_BOUNDS,
  MASTER,
  SEAM_THRESHOLD,
  TILE_SIZE,
  TILES,
  getTerrain,
} from './terrain.js';

const TAU = Math.PI * 2;

export function makeInitialStates() {
  return Object.fromEntries(
    TILES.map((tile) => [
      tile.id,
      { ...tile.base, rotation: (tile.base.rotation * Math.PI) / 180 },
    ]),
  );
}

export function degToRad(value) {
  return (value * Math.PI) / 180;
}

export function radToDeg(value) {
  return (value * 180) / Math.PI;
}

export function normalizeAngle(value) {
  let angle = value % TAU;
  if (angle > Math.PI) angle -= TAU;
  if (angle < -Math.PI) angle += TAU;
  return angle;
}

export function worldToLocal(state, x, y) {
  const cx = state.x + TILE_SIZE.width / 2;
  const cy = state.y + TILE_SIZE.height / 2;
  const dx = x - cx;
  const dy = y - cy;
  const cos = Math.cos(-state.rotation);
  const sin = Math.sin(-state.rotation);
  return {
    x: dx * cos - dy * sin + TILE_SIZE.width / 2,
    y: dx * sin + dy * cos + TILE_SIZE.height / 2,
  };
}

export function localToWorld(state, x, y) {
  const cx = state.x + TILE_SIZE.width / 2;
  const cy = state.y + TILE_SIZE.height / 2;
  const dx = x - TILE_SIZE.width / 2;
  const dy = y - TILE_SIZE.height / 2;
  const cos = Math.cos(state.rotation);
  const sin = Math.sin(state.rotation);
  return {
    x: dx * cos - dy * sin + cx,
    y: dx * sin + dy * cos + cy,
  };
}

export function pointInsideTile(state, x, y, padding = 0) {
  const local = worldToLocal(state, x, y);
  return (
    local.x >= -padding &&
    local.y >= -padding &&
    local.x <= TILE_SIZE.width + padding &&
    local.y <= TILE_SIZE.height + padding
  );
}

export function tileCorners(state) {
  return [
    localToWorld(state, 0, 0),
    localToWorld(state, TILE_SIZE.width, 0),
    localToWorld(state, TILE_SIZE.width, TILE_SIZE.height),
    localToWorld(state, 0, TILE_SIZE.height),
  ];
}

function signedArea(points) {
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}

function lineIntersection(a, b, edgeStart, edgeEnd) {
  const ab = { x: b.x - a.x, y: b.y - a.y };
  const edge = { x: edgeEnd.x - edgeStart.x, y: edgeEnd.y - edgeStart.y };
  const denominator = ab.x * edge.y - ab.y * edge.x;
  if (Math.abs(denominator) < 0.000001) return b;
  const diff = { x: edgeStart.x - a.x, y: edgeStart.y - a.y };
  const t = (diff.x * edge.y - diff.y * edge.x) / denominator;
  return { x: a.x + ab.x * t, y: a.y + ab.y * t };
}

function clipAgainstEdge(subject, edgeStart, edgeEnd, insideSign) {
  const output = [];
  for (let i = 0; i < subject.length; i += 1) {
    const current = subject[i];
    const previous = subject[(i + subject.length - 1) % subject.length];
    const currentInside = (
      (edgeEnd.x - edgeStart.x) * (current.y - edgeStart.y) -
      (edgeEnd.y - edgeStart.y) * (current.x - edgeStart.x)
    ) * insideSign >= 0;
    const previousInside = (
      (edgeEnd.x - edgeStart.x) * (previous.y - edgeStart.y) -
      (edgeEnd.y - edgeStart.y) * (previous.x - edgeStart.x)
    ) * insideSign >= 0;
    if (currentInside) {
      if (!previousInside) output.push(lineIntersection(previous, current, edgeStart, edgeEnd));
      output.push(current);
    } else if (previousInside) {
      output.push(lineIntersection(previous, current, edgeStart, edgeEnd));
    }
  }
  return output;
}

export function polygonIntersection(subjectPoly, clipPoly) {
  let output = subjectPoly.map((point) => ({ ...point }));
  const orientation = signedArea(clipPoly) >= 0 ? 1 : -1;
  for (let i = 0; i < clipPoly.length && output.length; i += 1) {
    const start = clipPoly[i];
    const end = clipPoly[(i + 1) % clipPoly.length];
    output = clipAgainstEdge(output, start, end, orientation);
  }
  return output;
}

export function polygonArea(points) {
  return Math.abs(signedArea(points));
}

export const SEAM_PAIRS = [
  { a: 'A', b: 'B', label: 'A · B' },
  { a: 'B', b: 'C', label: 'B · C' },
  { a: 'A', b: 'C', label: 'A · C' },
];

function boundsOfPoints(points) {
  return points.reduce(
    (box, point) => ({
      minX: Math.min(box.minX, point.x),
      minY: Math.min(box.minY, point.y),
      maxX: Math.max(box.maxX, point.x),
      maxY: Math.max(box.maxY, point.y),
    }),
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
  );
}

function measurePair(states, pair, elevation) {
  const stateA = states[pair.a];
  const stateB = states[pair.b];
  const tileA = TILES.find((tile) => tile.id === pair.a);
  const tileB = TILES.find((tile) => tile.id === pair.b);
  const polyA = tileCorners(stateA);
  const polyB = tileCorners(stateB);
  const overlapPoly = polygonIntersection(polyA, polyB);
  const area = polygonArea(overlapPoly);
  const sampleBounds = boundsOfPoints(overlapPoly);
  const errors = [];
  const visualDiffs = [];
  const centers = [];

  if (!overlapPoly.length || area < 80) {
    return {
      ...pair,
      overlapArea: 0,
      overlapPercent: 0,
      error: 0,
      visualDiff: 0,
      samples: 0,
      center: null,
      overlapPoly: [],
    };
  }

  const step = 3;
  for (let y = sampleBounds.minY + step; y < sampleBounds.maxY - step; y += step) {
    for (let x = sampleBounds.minX + step; x < sampleBounds.maxX - step; x += step) {
      if (!pointInsideTile(stateA, x, y, -1) || !pointInsideTile(stateB, x, y, -1)) continue;
      const localA = worldToLocal(stateA, x, y);
      const localB = worldToLocal(stateB, x, y);
      const masterA = { x: tileA.region.x + localA.x, y: tileA.region.y + localA.y };
      const masterB = { x: tileB.region.x + localB.x, y: tileB.region.y + localB.y };
      const deltaX = masterA.x - masterB.x;
      const deltaY = masterA.y - masterB.y;
      errors.push(Math.sqrt(deltaX * deltaX + deltaY * deltaY));

      const valueA = elevation[
        Math.max(0, Math.min(MASTER.height - 1, Math.round(masterA.y))) * MASTER.width +
        Math.max(0, Math.min(MASTER.width - 1, Math.round(masterA.x)))
      ];
      const valueB = elevation[
        Math.max(0, Math.min(MASTER.height - 1, Math.round(masterB.y))) * MASTER.width +
        Math.max(0, Math.min(MASTER.width - 1, Math.round(masterB.x)))
      ];
      visualDiffs.push(Math.abs(valueA - valueB));
      centers.push({ x, y });
    }
  }

  const mean = (values) => (
    values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0
  );
  const center = centers.length
    ? {
      x: mean(centers.map((point) => point.x)),
      y: mean(centers.map((point) => point.y)),
    }
    : null;

  return {
    ...pair,
    overlapArea: area,
    overlapPercent: (area / (TILE_SIZE.width * TILE_SIZE.height)) * 100,
    error: mean(errors),
    visualDiff: mean(visualDiffs) * 180,
    samples: errors.length,
    center,
    overlapPoly,
  };
}

export function computeStitchMetrics(states, elevation) {
  const pairs = SEAM_PAIRS
    .map((pair) => measurePair(states, pair, elevation))
    .filter((pair) => pair.overlapArea > 0);
  const overlapPercent = pairs.length
    ? pairs.reduce((sum, pair) => sum + pair.overlapPercent, 0) / pairs.length
    : 0;
  const maxError = pairs.length
    ? Math.max(...pairs.map((pair) => pair.error))
    : 0;
  const averageError = pairs.length
    ? pairs.reduce((sum, pair) => sum + pair.error, 0) / pairs.length
    : 0;
  return {
    pairs,
    overlapPercent,
    maxError,
    averageError,
    pass: pairs.length >= 2 && maxError <= SEAM_THRESHOLD,
  };
}

export function tileFilter(tile, toneStrength, autoTone) {
  if (!autoTone) {
    return `brightness(${tile.grade.brightness}) saturate(${tile.grade.saturate}) hue-rotate(${tile.grade.hue}deg)`;
  }
  const amount = Math.max(0, Math.min(1, toneStrength / 100));
  const brightness = 1 + (tile.grade.brightness - 1) * (1 - amount);
  const saturate = 1 + (tile.grade.saturate - 1) * (1 - amount);
  const hue = tile.grade.hue * (1 - amount);
  return `brightness(${brightness.toFixed(3)}) saturate(${saturate.toFixed(3)}) hue-rotate(${hue.toFixed(2)}deg)`;
}

function softTileCanvas(tile, options, feather) {
  const canvas = document.createElement('canvas');
  canvas.width = TILE_SIZE.width;
  canvas.height = TILE_SIZE.height;
  const ctx = canvas.getContext('2d');
  ctx.filter = tileFilter(tile, options.toneStrength, options.autoTone);
  ctx.drawImage(tile.canvas, 0, 0);
  ctx.filter = 'none';

  if (feather > 0 && tile.id !== 'A') {
    const gradient = ctx.createLinearGradient(0, 0, feather, 0);
    gradient.addColorStop(0, 'rgba(0, 0, 0, 0.32)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 1)');
    ctx.globalCompositeOperation = 'destination-in';
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, TILE_SIZE.width, TILE_SIZE.height);
    ctx.globalCompositeOperation = 'source-over';
  }
  return canvas;
}

export function paintComposition({
  ctx,
  states,
  terrain,
  options,
  scale = 1,
  background = '#0d191a',
  includeBackground = true,
}) {
  const width = MASTER.width + 120;
  const height = MASTER.height + 90;
  if (includeBackground) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width * scale, height * scale);
  }
  const feather = 14 + (options.overlapBlend / 100) * 66;

  terrain.tiles.forEach((tile) => {
    const tileCanvas = softTileCanvas(tile, options, feather);
    const state = states[tile.id];
    ctx.save();
    ctx.translate(
      (state.x + TILE_SIZE.width / 2) * scale,
      (state.y + TILE_SIZE.height / 2) * scale,
    );
    ctx.rotate(state.rotation);
    ctx.scale(scale, scale);
    ctx.drawImage(tileCanvas, -TILE_SIZE.width / 2, -TILE_SIZE.height / 2);
    ctx.restore();
  });
}

export function createStitchedCanvas(states, terrain, options, scale = 1.5) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(CONTENT_BOUNDS.width * scale);
  canvas.height = Math.round(CONTENT_BOUNDS.height * scale);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0d191a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.translate(-CONTENT_BOUNDS.x * scale, -CONTENT_BOUNDS.y * scale);
  paintComposition({ ctx, states, terrain, options, scale, includeBackground: false });
  ctx.restore();
  return canvas;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function downloadStitchedPng(states, terrain, options) {
  const canvas = createStitchedCanvas(states, terrain, options, 1.5);
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      downloadBlob(blob, 'beiling-stitched-terrain.png');
      resolve(blob);
    }, 'image/png');
  });
}

export function buildTransformPayload(states, metrics, options) {
  return {
    project: '北岭地貌 · 三幅拼接',
    exportedAt: new Date().toISOString(),
    coordinateSystem: 'stage-px / rotation-radians',
    canvas: { width: MASTER.width + 120, height: MASTER.height + 110 },
    output: {
      width: Math.round(CONTENT_BOUNDS.width * 1.5),
      height: Math.round(CONTENT_BOUNDS.height * 1.5),
    },
    seamThreshold: SEAM_THRESHOLD,
    blend: {
      toneStrength: options.toneStrength,
      autoTone: options.autoTone,
      overlapBlend: options.overlapBlend,
    },
    tiles: TILES.map((tile) => ({
      id: tile.id,
      name: tile.name,
      source: `${tile.code}.proc-terrain`,
      topLeft: { x: Number(states[tile.id].x.toFixed(3)), y: Number(states[tile.id].y.toFixed(3)) },
      rotationRadians: Number(states[tile.id].rotation.toFixed(6)),
      rotationDegrees: Number(radToDeg(states[tile.id].rotation).toFixed(4)),
      toneGrade: tile.grade,
    })),
    seams: metrics.pairs.map((pair) => ({
      pair: pair.label,
      overlapPercent: Number(pair.overlapPercent.toFixed(2)),
      seamErrorPx: Number(pair.error.toFixed(3)),
      pass: pair.error <= SEAM_THRESHOLD,
    })),
  };
}

export function downloadTransformParams(states, metrics, options) {
  const payload = buildTransformPayload(states, metrics, options);
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  downloadBlob(blob, 'beiling-transform-params.json');
  return payload;
}

export function prepareTerrain() {
  return getTerrain();
}
