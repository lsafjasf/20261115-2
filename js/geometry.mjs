// Procedural low-poly tool-icon geometry.
// Shared by the browser viewer (js/viewer.mjs) and the Node verifier (tools/verify.mjs).
// All geometry is a flat triangle soup: every triangle carries its own three
// vertices and a face normal derived from its winding, so shading is always
// consistent with culling and normals can never disagree with the faces.

export const DEFAULT_PARAMS = {
  depth: 0.45,          // extrusion depth along z
  bevel: 0.06,          // 45-degree chamfer size
  color: '#8c9bab',     // material color
  lightAzimuth: 35,     // degrees, view space
  lightElevation: 45,   // degrees, view space
};

// 2D wrench outline, counter-clockwise, roughly 2.4 x 1.25 units.
export function wrenchOutline() {
  const pts = [];
  const cx = 0.62;
  const R = 0.62;
  const jawHalf = (46 * Math.PI) / 180;
  const halfW = 0.21;
  const handleEnd = -1.15;
  const meet = Math.PI - Math.asin(halfW / R);
  const arcStep = (12 * Math.PI) / 180;

  pts.push([0.56, 0]); // jaw inner point
  for (let a = jawHalf; a < meet - 1e-9; a += arcStep) {
    pts.push([cx + R * Math.cos(a), R * Math.sin(a)]);
  }
  pts.push([cx + R * Math.cos(meet), halfW]);
  pts.push([handleEnd, halfW]);
  const endSegs = 4;
  for (let i = 1; i < endSegs; i++) {
    const a = Math.PI / 2 + (Math.PI * i) / endSegs;
    pts.push([handleEnd + halfW * Math.cos(a), halfW * Math.sin(a)]);
  }
  pts.push([handleEnd, -halfW]);
  pts.push([cx + R * Math.cos(meet), -halfW]);
  for (let a = -meet + arcStep; a < -jawHalf - 1e-9; a += arcStep) {
    pts.push([cx + R * Math.cos(a), R * Math.sin(a)]);
  }
  pts.push([cx + R * Math.cos(jawHalf), -R * Math.sin(jawHalf)]);
  return pts;
}

export function signedArea(poly) {
  let area = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % poly.length];
    area += x1 * y2 - x2 * y1;
  }
  return area / 2;
}

// Inward miter offset of a CCW polygon by `dist` (used for the chamfer ring).
export function insetPolygon(poly, dist) {
  const n = poly.length;
  const normals = [];
  for (let i = 0; i < n; i++) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % n];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    normals.push([-dy / len, dx / len]); // left of edge = inward for CCW
  }
  const out = [];
  for (let i = 0; i < n; i++) {
    const nPrev = normals[(i + n - 1) % n];
    const nNext = normals[i];
    let mx = nPrev[0] + nNext[0];
    let my = nPrev[1] + nNext[1];
    const ml = Math.hypot(mx, my) || 1;
    mx /= ml;
    my /= ml;
    const cosHalf = Math.max(mx * nNext[0] + my * nNext[1], 0.2);
    const d = Math.min(dist / cosHalf, dist * 3);
    out.push([poly[i][0] + mx * d, poly[i][1] + my * d]);
  }
  return out;
}

// Ear-clipping triangulation of a simple CCW polygon. Returns index triples.
export function triangulate(poly) {
  const idx = poly.map((_, i) => i);
  const tris = [];
  const cross = (o, a, b) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  let guard = 0;
  while (idx.length > 3 && guard++ < 100000) {
    let clipped = false;
    for (let i = 0; i < idx.length; i++) {
      const i0 = idx[(i + idx.length - 1) % idx.length];
      const i1 = idx[i];
      const i2 = idx[(i + 1) % idx.length];
      const a = poly[i0];
      const b = poly[i1];
      const c = poly[i2];
      if (cross(a, b, c) <= 1e-12) continue;
      let contains = false;
      for (const j of idx) {
        if (j === i0 || j === i1 || j === i2) continue;
        const p = poly[j];
        if (
          cross(a, b, p) >= 0 &&
          cross(b, c, p) >= 0 &&
          cross(c, a, p) >= 0
        ) {
          contains = true;
          break;
        }
      }
      if (contains) continue;
      tris.push([i0, i1, i2]);
      idx.splice(i, 1);
      clipped = true;
      break;
    }
    if (!clipped) break;
  }
  if (idx.length === 3) tris.push([idx[0], idx[1], idx[2]]);
  return tris;
}

// Build the extruded, chamfered tool icon as a flat triangle soup.
// Returns { positions, normals, triangleCount, params } with Float32Arrays.
export function buildToolGeometry(params = {}) {
  const p = { ...DEFAULT_PARAMS, ...params };
  const depth = Math.min(Math.max(p.depth, 0.05), 1.5);
  const bevel = Math.min(Math.max(p.bevel, 0), depth * 0.45, 0.14);

  const outline = wrenchOutline();
  if (signedArea(outline) < 0) outline.reverse();
  const useBevel = bevel > 1e-6;
  const inner = useBevel ? insetPolygon(outline, bevel) : outline;

  const zBot = -depth / 2;
  const zTop = depth / 2;
  const positions = [];
  const tri = (a, b, c) => {
    positions.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
  };
  const lift = (poly, z) => poly.map(([x, y]) => [x, y, z]);

  // Caps (top CCW -> +z normal, bottom reversed -> -z normal).
  const topLoop = lift(inner, zTop);
  const botLoop = lift(inner, zBot);
  for (const [a, b, c] of triangulate(inner)) {
    tri(topLoop[a], topLoop[b], topLoop[c]);
    tri(botLoop[a], botLoop[c], botLoop[b]);
  }

  // Ring between two loops with identical vertex order; winding chosen so
  // normals point away from the z axis (verified in tools/verify.mjs).
  const ring = (loopA, zA, loopB, zB) => {
    const A = lift(loopA, zA);
    const B = lift(loopB, zB);
    const n = loopA.length;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      tri(A[i], B[j], B[i]);
      tri(A[i], A[j], B[j]);
    }
  };

  if (useBevel) {
    ring(inner, zBot, outline, zBot + bevel); // bottom chamfer
    ring(outline, zBot + bevel, outline, zTop - bevel); // side walls
    ring(outline, zTop - bevel, inner, zTop); // top chamfer
  } else {
    ring(outline, zBot, outline, zTop);
  }

  const pos = new Float32Array(positions);
  const nor = new Float32Array(pos.length);
  for (let t = 0; t < pos.length; t += 9) {
    const ax = pos[t];
    const ay = pos[t + 1];
    const az = pos[t + 2];
    const ux = pos[t + 3] - ax;
    const uy = pos[t + 4] - ay;
    const uz = pos[t + 5] - az;
    const vx = pos[t + 6] - ax;
    const vy = pos[t + 7] - ay;
    const vz = pos[t + 8] - az;
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len;
    ny /= len;
    nz /= len;
    for (let k = 0; k < 3; k++) {
      nor[t + k * 3] = nx;
      nor[t + k * 3 + 1] = ny;
      nor[t + k * 3 + 2] = nz;
    }
  }
  return {
    positions: pos,
    normals: nor,
    triangleCount: pos.length / 9,
    params: { ...p, depth, bevel },
  };
}

export function lightDirection(azimuthDeg, elevationDeg) {
  const az = (azimuthDeg * Math.PI) / 180;
  const el = (elevationDeg * Math.PI) / 180;
  return [
    Math.cos(el) * Math.sin(az),
    Math.sin(el),
    Math.cos(el) * Math.cos(az),
  ];
}

export function hexToRgb(hex) {
  const v = parseInt(hex.replace('#', ''), 16);
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
}

export function toOBJ(geo, name = 'tool-icon') {
  const { positions, normals } = geo;
  const f = (x) => Number(x.toFixed(6));
  const lines = [`o ${name}`];
  for (let i = 0; i < positions.length; i += 3) {
    lines.push(`v ${f(positions[i])} ${f(positions[i + 1])} ${f(positions[i + 2])}`);
  }
  for (let i = 0; i < normals.length; i += 3) {
    lines.push(`vn ${f(normals[i])} ${f(normals[i + 1])} ${f(normals[i + 2])}`);
  }
  for (let t = 0; t < positions.length / 9; t++) {
    const a = t * 3 + 1;
    const b = a + 1;
    const c = a + 2;
    lines.push(`f ${a}//${a} ${b}//${b} ${c}//${c}`);
  }
  return lines.join('\n') + '\n';
}
