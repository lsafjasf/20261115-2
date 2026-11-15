// Turns a facade model into an ordered list of backend-neutral draw commands.
// SVG, Canvas2D and the raster PNG encoder all consume the same command list,
// so every export format renders the identical elevation.
import { CORNER_RETURN_W, MARGIN_X } from './constants.js';

export const COLORS = {
  paper: '#f4f1e8',
  wall: '#e8dcc3',
  sideWall: '#cdbf9f',
  column: '#d8c6a3',
  beam: '#cfbd97',
  plinth: '#b3a281',
  glass: '#8fb4c9',
  glassDark: '#5f8aa3',
  frame: '#f7f4ec',
  recess: '#7a6d55',
  sunshade: '#c9743f',
  shadow: 'rgba(60, 48, 30, 0.18)',
  shadowSoft: 'rgba(60, 48, 30, 0.10)',
  signBoard: '#2f5d50',
  signText: '#f8f3e2',
  construction: '#b04a3a',
  ground: '#8a7d66',
  door: '#6b4f35',
  doorGlaze: '#a9c6d6'
};

function rect(x, y, width, height, fill, extra = {}) {
  return { type: 'rect', x, y, width, height, fill, ...extra };
}

export function buildScene(model) {
  const cmds = [];
  const { facade, canvas, params } = model;
  cmds.push(rect(0, 0, canvas.width, canvas.height, COLORS.paper));

  // Ground shadow cast behind the street corner.
  cmds.push(rect(facade.x - 8, model.groundLineY + 6, facade.width + 24, 14, COLORS.shadowSoft));
  // Corner return: darker side wall describing the building depth.
  cmds.push(rect(facade.x - CORNER_RETURN_W, facade.y, CORNER_RETURN_W, facade.height, COLORS.sideWall));
  cmds.push(rect(facade.x - 4, facade.y, 4, facade.height, COLORS.shadowSoft));

  // Main wall mass.
  cmds.push(rect(facade.x, facade.y, facade.width, facade.height, COLORS.wall));

  // Soft cast shadow from each sunshade, drawn before structural elements so
  // the shadow always sits on the wall surface, never on a column.
  for (const shade of model.sunshades) {
    cmds.push(rect(shade.x, shade.y + shade.height, shade.width, shade.depth, COLORS.shadowSoft));
  }

  // Structural beams and columns.
  for (const beam of model.beams) cmds.push(rect(beam.x, beam.y, beam.width, beam.height, COLORS.beam));
  for (const col of model.columns) cmds.push(rect(col.x, col.y, col.width, col.height, COLORS.column));

  if (params.constructionLines) addConstructionLines(cmds, model);
  addDoor(cmds, model);
  addWindows(cmds, model);
  addSunshades(cmds, model);
  if (model.sign) addSign(cmds, model);

  // Ground / street line on top of everything at the base.
  cmds.push({ type: 'line', x1: MARGIN_X, y1: model.groundLineY, x2: canvas.width - MARGIN_X, y2: model.groundLineY, stroke: COLORS.ground, width: 2 });
  return cmds;
}

function addConstructionLines(cmds, model) {
  const c = COLORS.construction;
  for (const col of model.columns) {
    const cx = col.x + col.width / 2;
    cmds.push({ type: 'line', x1: cx, y1: model.facade.y - 12, x2: cx, y2: model.groundLineY + 10, stroke: c, width: 1, dashed: true });
  }
  for (const beam of model.beams) {
    cmds.push({ type: 'line', x1: model.facade.x - 10, y1: beam.y + beam.height / 2, x2: model.facade.x + model.facade.width + 10, y2: beam.y + beam.height / 2, stroke: c, width: 1, dashed: true });
  }
}

function addDoor(cmds, model) {
  const d = model.door;
  cmds.push(rect(d.x - 3, d.y - 3, d.width + 6, d.height + 6, COLORS.recess));
  cmds.push(rect(d.x, d.y, d.width, d.height, COLORS.door));
  const glazeH = Math.round(d.height * 0.42);
  cmds.push(rect(d.x + 6, d.y + 8, d.width - 12, glazeH, COLORS.doorGlaze));
  cmds.push(rect(d.x + d.width - 12, d.y + d.height - 26, 4, 10, COLORS.signText));
}

function addWindows(cmds, model) {
  for (const w of model.windows) {
    cmds.push(rect(w.x - 3, w.y - 3, w.width + 6, w.height + 6, COLORS.recess));
    cmds.push(rect(w.x, w.y, w.width, w.height, COLORS.glass));
    // Sill and frame.
    cmds.push(rect(w.x - 4, w.y + w.height, w.width + 8, 4, COLORS.frame));
    for (let c = 1; c < w.cols; c += 1) {
      const x = w.x + Math.round((w.width / w.cols) * c) - 1;
      cmds.push(rect(x, w.y, 2, w.height, COLORS.frame));
    }
    for (let r = 1; r < w.rows; r += 1) {
      const y = w.y + Math.round((w.height / w.rows) * r) - 1;
      cmds.push(rect(w.x, y, w.width, 2, COLORS.frame));
    }
    // Diagonal light streak for a touch of material depth.
    cmds.push({ type: 'line', x1: w.x + 4, y1: w.y + 6, x2: w.x + Math.min(18, w.width - 6), y2: w.y + 6, stroke: COLORS.frame, width: 2 });
  }
}

function addSunshades(cmds, model) {
  for (const shade of model.sunshades) {
    cmds.push(rect(shade.x, shade.y, shade.width, shade.height, COLORS.sunshade));
    cmds.push(rect(shade.x, shade.y + shade.height, shade.width, 3, COLORS.recess));
  }
}

function addSign(cmds, model) {
  const s = model.sign;
  cmds.push(rect(s.x, s.y, s.width, s.height, COLORS.signBoard));
  cmds.push({
    type: 'text',
    x: s.x + s.width / 2,
    y: s.y + s.height / 2,
    text: s.text,
    font: s.kind === 'side-wall' ? '11px sans-serif' : 'bold 13px sans-serif',
    fill: COLORS.signText,
    rotate: s.kind === 'side-wall' ? -90 : 0
  });
}

