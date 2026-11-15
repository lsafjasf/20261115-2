// Core facade layout engine.
//
// The structural grid (columns, floor beams, plinth, parapet) is laid out
// first. Every window is then placed strictly INSIDE a grid cell using
// fixed margins, so window/structure overlaps are impossible by construction
// rather than patched afterwards.
import { createRng } from './rng.js';
import {
  GROUND_FLOOR_H, UPPER_FLOOR_H, COLUMN_W, BEAM_H, MARGIN_X, MARGIN_TOP,
  PLINTH_H, PARAPET_H, CELL_GAP, CORNER_RETURN_W, DEFAULT_PARAMS
} from './constants.js';
import { buildDoor, buildWindows, buildSunshades, buildSign } from './layout-features.js';

export {
  GROUND_FLOOR_H, UPPER_FLOOR_H, COLUMN_W, BEAM_H, MARGIN_X, MARGIN_TOP,
  PLINTH_H, PARAPET_H, CELL_GAP, CORNER_RETURN_W, DEFAULT_PARAMS
} from './constants.js';

export function buildingHeight(params) {
  const upperFloors = Math.max(0, params.floors - 1);
  return (
    PLINTH_H +
    GROUND_FLOOR_H +
    upperFloors * BEAM_H +
    upperFloors * UPPER_FLOOR_H +
    BEAM_H +
    PARAPET_H
  );
}

export function canvasSize(params) {
  const width = MARGIN_X * 2 + CORNER_RETURN_W + params.bays * 118;
  return { width, height: buildingHeight(params) + MARGIN_TOP * 2 };
}

export function generateFacade(inputParams = {}) {
  const params = { ...DEFAULT_PARAMS, ...inputParams };
  const rng = createRng(params.seed);
  const { width: canvasWidth, height: canvasHeight } = canvasSize(params);

  const facadeX = MARGIN_X + CORNER_RETURN_W;
  const facadeTop = MARGIN_TOP;
  const facadeW = params.bays * 118;
  const bH = buildingHeight(params);

  const columns = buildColumns(params, facadeX, facadeTop, facadeW, bH);
  const structure = buildStructure(params, facadeX, facadeTop, facadeW, columns);
  const { beams, cells, groundLineY } = structure;
  const door = buildDoor(cells, rng);
  const windows = buildWindows(params, cells, door, rng);
  const sunshades = buildSunshades(params, windows);
  const sign = buildSign(params, facadeX, facadeTop, facadeW, bH, rng, door);

  return {
    params,
    canvas: { width: canvasWidth, height: canvasHeight },
    facade: { x: facadeX, y: facadeTop, width: facadeW, height: bH },
    groundLineY,
    columns,
    beams,
    cells,
    door,
    windows,
    sunshades,
    sign
  };
}

function buildColumns(params, facadeX, facadeTop, facadeW, bH) {
  const list = [];
  const step = facadeW / params.bays;
  for (let i = 0; i <= params.bays; i += 1) {
    const x = Math.round(facadeX + i * step - COLUMN_W / 2);
    list.push({ x, y: facadeTop, width: COLUMN_W, height: bH });
  }
  return list;
}

// Builds the full structural stack bottom-up from the ground line:
// plinth -> ground storey -> beam -> upper storey ... -> roof beam -> parapet.
function buildStructure(params, facadeX, facadeTop, facadeW, columns) {
  const beams = [];
  const cells = [];
  const groundLineY = facadeTop + buildingHeight(params);

  // Plinth at the very base.
  beams.push({ kind: 'plinth', x: facadeX, y: groundLineY - PLINTH_H, width: facadeW, height: PLINTH_H });
  let y = groundLineY - PLINTH_H;

  // Ground floor storey (tall), topped by its crown beam.
  const groundTop = y - GROUND_FLOOR_H;
  pushStoreyCells(cells, 0, columns, groundTop + CELL_GAP, y - CELL_GAP, params.bays);
  y = groundTop;
  beams.push({ kind: 'beam', x: facadeX, y: y - BEAM_H, width: facadeW, height: BEAM_H });
  y -= BEAM_H;

  // Upper floors from floor 1 upwards.
  for (let f = 1; f < params.floors; f += 1) {
    const storeyTop = y - UPPER_FLOOR_H;
    pushStoreyCells(cells, f, columns, storeyTop + CELL_GAP, y - CELL_GAP, params.bays);
    y = storeyTop;
    beams.push({ kind: 'beam', x: facadeX, y: y - BEAM_H, width: facadeW, height: BEAM_H });
    y -= BEAM_H;
  }

  // Parapet coping above the roof beam.
  beams.push({ kind: 'parapet', x: facadeX, y: y - PARAPET_H, width: facadeW, height: PARAPET_H });
  return { beams, cells, groundLineY };
}

function pushStoreyCells(cells, floor, columns, cellTop, cellBottom, bays) {
  for (let b = 0; b < bays; b += 1) {
    cells.push(makeCell(floor, b, columns[b], columns[b + 1], cellTop, cellBottom));
  }
}

function makeCell(floor, bay, leftCol, rightCol, cellTop, cellBottom) {
  return {
    floor,
    bay,
    x: leftCol.x + leftCol.width + CELL_GAP,
    y: cellTop,
    width: rightCol.x - (leftCol.x + leftCol.width) - CELL_GAP * 2,
    height: cellBottom - cellTop
  };
}

