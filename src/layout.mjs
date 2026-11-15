// Fixed stamp geometry. Everything decorative or textual must live inside
// SAFE so a perforation can never overlap it.

export const STAMP = {
  width: 1200,
  height: 1500,
  // Perforation (half-circle notches cut into the paper edge).
  holeRadius: 26,
  holeGap: 78, // center-to-center distance between adjacent holes
  cornerMargin: 92, // keep this much edge length clear at every corner
  // Double-rule frame inside the paper.
  frameOuter: 66,
  frameInner: 86,
  // Guaranteed content-safe inset; frame + breathing room.
  safeInset: 118,
};

STAMP.safe = {
  x: STAMP.safeInset,
  y: STAMP.safeInset,
  width: STAMP.width - STAMP.safeInset * 2,
  height: STAMP.height - STAMP.safeInset * 2,
};

// Deterministic perforation hole centers for the four edges.
export function perforationHoles() {
  const { width, height, holeGap, cornerMargin, holeRadius } = STAMP;
  const usableW = width - cornerMargin * 2;
  const usableH = height - cornerMargin * 2;
  const countH = Math.max(2, Math.round(usableW / holeGap));
  const countV = Math.max(2, Math.round(usableH / holeGap));
  const stepH = usableW / countH;
  const stepV = usableH / countV;
  const holes = [];
  for (let i = 0; i < countH; i += 1) {
    const x = cornerMargin + stepH * (i + 0.5);
    holes.push({ x, y: 0, r: holeRadius, edge: 'top' });
    holes.push({ x, y: height, r: holeRadius, edge: 'bottom' });
  }
  for (let i = 0; i < countV; i += 1) {
    const y = cornerMargin + stepV * (i + 0.5);
    holes.push({ x: 0, y, r: holeRadius, edge: 'left' });
    holes.push({ x: width, y, r: holeRadius, edge: 'right' });
  }
  return holes;
}

// Content bands inside the safe area. Bands never touch SAFE boundaries.
export function contentBands() {
  const { safe } = STAMP;
  const gap = 20;
  const topFrieze = {
    x: safe.x, y: safe.y,
    width: safe.width, height: 132,
  };
  const header = {
    x: safe.x,
    y: topFrieze.y + topFrieze.height + gap,
    width: safe.width,
    height: 132,
  };
  const medallion = {
    size: 480,
    x: safe.x + (safe.width - 480) / 2,
    y: header.y + header.height + gap + 10,
  };
  const caption = {
    x: safe.x,
    y: medallion.y + medallion.size + gap,
    width: safe.width,
    height: 60,
  };
  const denomination = {
    x: safe.x,
    y: caption.y + caption.height + gap,
    width: safe.width,
    height: 120,
  };
  const bottomFrieze = {
    x: safe.x,
    y: denomination.y + denomination.height + gap,
    width: safe.width,
    height: 104,
  };
  return { topFrieze, header, medallion, caption, denomination, bottomFrieze };
}

// Geometry verification: bands stay inside SAFE and every hole stays outside.
export function validateLayout() {
  const { safe } = STAMP;
  const bands = contentBands();
  const errors = [];
  for (const [name, box] of Object.entries(bands)) {
    const bx = box.x ?? safe.x;
    const by = box.y;
    const bw = box.width ?? box.size;
    const bh = box.height ?? box.size;
    if (bx < safe.x || by < safe.y
      || bx + bw > safe.x + safe.width
      || by + bh > safe.y + safe.height) {
      errors.push(`band ${name} escapes safe area`);
    }
  }
  const holes = perforationHoles();
  for (const hole of holes) {
    const insideX = hole.x > safe.x - 0.01 && hole.x < safe.x + safe.width + 0.01;
    const insideY = hole.y > safe.y - 0.01 && hole.y < safe.y + safe.height + 0.01;
    if (insideX && insideY) {
      // A hole on an edge only intrudes by its radius along that one axis.
      const intrudesX = hole.edge === 'left' || hole.edge === 'right'
        ? hole.r > STAMP.safeInset
        : hole.x > safe.x && hole.x < safe.x + safe.width;
      const intrudesY = hole.edge === 'top' || hole.edge === 'bottom'
        ? hole.r > STAMP.safeInset
        : hole.y > safe.y && hole.y < safe.y + safe.height;
      if (intrudesX && intrudesY) errors.push(`hole ${hole.edge} enters safe area`);
    }
  }
  return { ok: errors.length === 0, errors, holeCount: holes.length, bands };
}
