// Feature generation: door, windows, sunshades and sign.
import { pick } from './rng.js';
import { SIGN_TEXTS, PARAPET_H } from './constants.js';

export function buildDoor(cells, rng) {
  const ground = cells.filter((cell) => cell.floor === 0);
  const cell = ground[Math.floor(rng() * ground.length)];
  const doorW = Math.min(74, Math.floor(cell.width * 0.55));
  const doorH = cell.height - 4;
  return {
    cellBay: cell.bay,
    x: cell.x + Math.floor((cell.width - doorW) / 2),
    y: cell.y + 2,
    width: doorW,
    height: doorH
  };
}

export function buildWindows(params, cells, door, rng) {
  const windows = [];
  for (const cell of cells) {
    if (cell.floor === 0) {
      addGroundFloorWindow(windows, cell, door, params, rng);
    } else if (rng() < 0.82) {
      windows.push(makeWindow(cell, params, rng));
    }
  }
  // Guarantee each occupied upper floor keeps at least one window so the
  // silhouette never degenerates into a blank wall.
  for (let f = 1; f < params.floors; f += 1) {
    if (!windows.some((w) => w.cellFloor === f)) {
      const cell = cells.find((c) => c.floor === f);
      windows.push(makeWindow(cell, params, rng));
    }
  }
  return windows;
}

function addGroundFloorWindow(windows, cell, door, params, rng) {
  if (cell.bay === door.cellBay) return; // door bay: no window at all
  const winH = Math.min(64, Math.floor(cell.height * 0.55));
  const winW = Math.min(cell.width - 12, Math.round(winH * params.paneRatio));
  const x = cell.x + Math.floor((cell.width - winW) / 2);
  const y = cell.y + Math.floor((cell.height - winH) / 2);
  windows.push({
    cellFloor: 0,
    cellBay: cell.bay,
    x,
    y,
    width: winW,
    height: winH,
    cols: 2,
    rows: 1
  });
}

function makeWindow(cell, params, rng) {
  const ratio = params.paneRatio;
  let winW = Math.round(cell.height * ratio);
  winW = Math.min(winW, cell.width - 8);
  const winH = Math.min(cell.height - 8, Math.round(winW / ratio));
  const x = cell.x + Math.floor((cell.width - winW) / 2);
  const y = cell.y + Math.floor((cell.height - winH) / 2);
  return {
    cellFloor: cell.floor,
    cellBay: cell.bay,
    x,
    y,
    width: winW,
    height: winH,
    cols: pick(rng, [1, 2, 2, 3]),
    rows: pick(rng, [1, 1, 2])
  };
}

export function buildSunshades(params, windows) {
  if (params.sunshades === 'none') return [];
  return windows
    .filter((w) => {
      if (params.sunshades === 'all') return true;
      // Deterministic-looking spread without extra rng state: hash bay+floor.
      return (w.cellBay * 3 + w.cellFloor * 5) % 2 === 0;
    })
    .map((w) => ({
      x: w.x - 4,
      y: w.y - 7,
      width: w.width + 8,
      height: 6,
      depth: params.sunshadeDepth
    }));
}

export function buildSign(params, facadeX, facadeTop, facadeW, bH, rng, door) {
  if (params.sign === 'none') return null;
  const text = SIGN_TEXTS[Math.floor(rng() * SIGN_TEXTS.length)];
  if (params.sign === 'parapet') {
    return {
      kind: 'parapet',
      x: facadeX + 18,
      y: facadeTop + 3,
      width: Math.min(260, facadeW - 36),
      height: PARAPET_H - 6,
      text
    };
  }
  if (params.sign === 'above-door') {
    const signW = Math.max(110, door.width + 40);
    return {
      kind: 'above-door',
      x: door.x + door.width / 2 - signW / 2,
      y: door.y - 30,
      width: signW,
      height: 24,
      text
    };
  }
  // side-wall: mounted on the corner return, never overlapping facade bays.
  return {
    kind: 'side-wall',
    x: facadeX - 52,
    y: facadeTop + bH * 0.32,
    width: 44,
    height: 120,
    text
  };
}

