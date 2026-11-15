// Verification: rebuild the tool icon with modified parameters, rotate it a
// full 360 degrees in a software renderer using the exact same shading math
// as the WebGL viewer, assert no black/flipped faces, then export OBJ + PNG.
import { writeFileSync } from 'node:fs';
import {
  buildToolGeometry,
  lightDirection,
  hexToRgb,
  toOBJ,
} from '../js/geometry.mjs';
import { encodePNG } from '../js/png.mjs';

const PARAMS = {
  depth: 0.7,
  bevel: 0.08,
  color: '#e07830',
  lightAzimuth: 120,
  lightElevation: 50,
};
const AMBIENT = 0.28;
const SIZE = 512;

const geo = buildToolGeometry(PARAMS);
const { positions, normals } = geo;
const triCount = geo.triangleCount;

// --- Static checks: normals unit-length, finite, and matching winding ------
let badNormals = 0;
for (let t = 0; t < triCount; t++) {
  const o = t * 9;
  const ux = positions[o + 3] - positions[o];
  const uy = positions[o + 4] - positions[o + 1];
  const uz = positions[o + 5] - positions[o + 2];
  const vx = positions[o + 6] - positions[o];
  const vy = positions[o + 7] - positions[o + 1];
  const vz = positions[o + 8] - positions[o + 2];
  const cx = uy * vz - uz * vy;
  const cy = uz * vx - ux * vz;
  const cz = ux * vy - uy * vx;
  const cl = Math.hypot(cx, cy, cz) || 1;
  const nx = normals[o];
  const ny = normals[o + 1];
  const nz = normals[o + 2];
  const unit = Math.hypot(nx, ny, nz);
  const dot = (nx * cx + ny * cy + nz * cz) / cl;
  if (!Number.isFinite(unit) || Math.abs(unit - 1) > 1e-4 || dot < 0.999) {
    badNormals++;
  }
}

// --- Software renderer (same math as the WebGL shader) ---------------------
const light = lightDirection(PARAMS.lightAzimuth, PARAMS.lightElevation);
const baseColor = hexToRgb(PARAMS.color);

function renderFrame(yaw, pitch, target) {
  const rgba = target || new Uint8Array(SIZE * SIZE * 4);
  const depth = new Float32Array(SIZE * SIZE).fill(Infinity);
  // background
  for (let i = 0; i < SIZE * SIZE; i++) {
    rgba[i * 4] = 22;
    rgba[i * 4 + 1] = 24;
    rgba[i * 4 + 2] = 29;
    rgba[i * 4 + 3] = 255;
  }
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const xf = (x, y, z) => {
    const x1 = cy * x + sy * z;
    const z1 = -sy * x + cy * z;
    const y2 = cp * y - sp * z1;
    const z2 = sp * y + cp * z1;
    return [x1, y2, z2 - 4.2];
  };
  const f = 1 / Math.tan(0.35);
  const stats = { modelPixels: 0, blackPixels: 0, minLum: 255 };
  for (let t = 0; t < triCount; t++) {
    const o = t * 9;
    const v0 = xf(positions[o], positions[o + 1], positions[o + 2]);
    const v1 = xf(positions[o + 3], positions[o + 4], positions[o + 5]);
    const v2 = xf(positions[o + 6], positions[o + 7], positions[o + 8]);
    const n = xf(normals[o], normals[o + 1], normals[o + 2]);
    const nl = Math.hypot(n[0], n[1], n[2]) || 1;
    const nx = n[0] / nl;
    const ny = n[1] / nl;
    const nz = n[2] / nl;
    // backface cull, same as the viewer
    const ex = v1[0] - v0[0];
    const ey = v1[1] - v0[1];
    const fx = v2[0] - v0[0];
    const fy = v2[1] - v0[1];
    if (ex * fy - ey * fx <= 0) continue;
    const diff = Math.max(nx * light[0] + ny * light[1] + nz * light[2], 0);
    const hx = light[0];
    const hy = light[1];
    const hz = light[2] + 1;
    const hl = Math.hypot(hx, hy, hz);
    const spec =
      Math.pow(Math.max((nx * hx + ny * hy + nz * hz) / hl, 0), 28) * 0.35;
    const r = Math.min(255, (baseColor[0] * (AMBIENT + (1 - AMBIENT) * diff) + spec) * 255);
    const g = Math.min(255, (baseColor[1] * (AMBIENT + (1 - AMBIENT) * diff) + spec) * 255);
    const b = Math.min(255, (baseColor[2] * (AMBIENT + (1 - AMBIENT) * diff) + spec) * 255);
    const px = v0.map((_, i) => [
      (([v0, v1, v2][i][0] * f) / -[v0, v1, v2][i][2] * 0.5 + 0.5) * SIZE,
      (0.5 - ([v0, v1, v2][i][1] * f) / -[v0, v1, v2][i][2] * 0.5) * SIZE,
      [v0, v1, v2][i][2],
    ]);
    const minX = Math.max(0, Math.floor(Math.min(px[0][0], px[1][0], px[2][0])));
    const maxX = Math.min(SIZE - 1, Math.ceil(Math.max(px[0][0], px[1][0], px[2][0])));
    const minY = Math.max(0, Math.floor(Math.min(px[0][1], px[1][1], px[2][1])));
    const maxY = Math.min(SIZE - 1, Math.ceil(Math.max(px[0][1], px[1][1], px[2][1])));
    const area = (px[1][0] - px[0][0]) * (px[2][1] - px[0][1]) -
      (px[1][1] - px[0][1]) * (px[2][0] - px[0][0]);
    if (Math.abs(area) < 1e-9) continue;
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const w1 = ((px[1][0] - x) * (px[2][1] - y) - (px[1][1] - y) * (px[2][0] - x)) / area;
        const w2 = ((px[2][0] - x) * (px[0][1] - y) - (px[2][1] - y) * (px[0][0] - x)) / area;
        const w0 = 1 - w1 - w2;
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;
        const z = w0 * px[0][2] + w1 * px[1][2] + w2 * px[2][2];
        const di = y * SIZE + x;
        if (z >= depth[di]) continue;
        depth[di] = z;
        rgba[di * 4] = r;
        rgba[di * 4 + 1] = g;
        rgba[di * 4 + 2] = b;
        rgba[di * 4 + 3] = 255;
        stats.modelPixels++;
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        if (lum < stats.minLum) stats.minLum = lum;
        if (Math.max(r, g, b) < 10) stats.blackPixels++;
      }
    }
  }
  return { rgba, stats };
}

// --- Rotate a full 360 degrees and check every frame -----------------------
const pitch = -0.35;
let totalBlack = 0;
let globalMinLum = 255;
let totalModelPixels = 0;
for (let deg = 0; deg < 360; deg += 15) {
  const { stats } = renderFrame((deg * Math.PI) / 180, pitch);
  totalBlack += stats.blackPixels;
  totalModelPixels += stats.modelPixels;
  if (stats.minLum < globalMinLum) globalMinLum = stats.minLum;
  if (stats.modelPixels < 5000) {
    console.error(`frame ${deg}°: suspiciously few model pixels (${stats.modelPixels})`);
    process.exitCode = 1;
  }
}

// Ambient floor: even a fully unlit face keeps AMBIENT * color luminance.
const ambientFloor =
  255 * AMBIENT * (0.299 * baseColor[0] + 0.587 * baseColor[1] + 0.114 * baseColor[2]);

console.log(`triangles: ${triCount}`);
console.log(`bad normals (non-unit / winding mismatch): ${badNormals}`);
console.log(`model pixels across 24 frames: ${totalModelPixels}`);
console.log(`black pixels (max(r,g,b) < 10): ${totalBlack}`);
console.log(`min model luminance: ${globalMinLum.toFixed(1)} (ambient floor ${ambientFloor.toFixed(1)})`);

let failed = false;
if (badNormals > 0) {
  console.error('FAIL: normals disagree with triangle winding');
  failed = true;
}
if (totalBlack > 0) {
  console.error('FAIL: black faces detected during rotation');
  failed = true;
}
if (globalMinLum < ambientFloor - 2) {
  console.error('FAIL: some faces are darker than the ambient floor');
  failed = true;
}

// --- Export one OBJ and one PNG with the modified parameters ---------------
writeFileSync('artifacts/tool-icon.obj', toOBJ(geo));
const frame = renderFrame((30 * Math.PI) / 180, pitch);
writeFileSync('artifacts/tool-icon.png', encodePNG(SIZE, SIZE, frame.rgba));
console.log('exported artifacts/tool-icon.obj and artifacts/tool-icon.png');

if (failed) {
  process.exit(1);
}
console.log('PASS: full 360° rotation, no black faces, normals stable');
