import {
  GRID_SIZE, CELL_PX, COLORS, MAX_STITCH_LENGTH, MAX_COLOR_SWITCH_RATIO, STROKE_WIDTH,
  validateStitches, wrapSegments, stitchLength, describeColor, toSVG, download,
} from './core.js';
import { generatePattern } from './pattern.js';

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const tooltip = document.getElementById('tooltip');
const tileCanvas = document.getElementById('tile-canvas');
const tileCtx = tileCanvas.getContext('2d');

const state = {
  stitches: [],
  colorIndex: 0,
  tool: 'pen',
  showGrid: true,
  showPreview: true,
  anchor: null, // first lattice point of a leg being placed
  hover: null, // {x, y} lattice point under cursor
  hoverStitch: null,
  runBuffer: [], // points for a shift-continuous thread run
  runId: null,
  highlight: new Set(),
  history: [],
};

function toCell(event) {
  const rect = canvas.getBoundingClientRect();
  const px = ((event.clientX - rect.left) / rect.width) * GRID_SIZE * CELL_PX;
  const py = ((event.clientY - rect.top) / rect.height) * GRID_SIZE * CELL_PX;
  const x = Math.max(0, Math.min(GRID_SIZE - 1, Math.round((px - CELL_PX / 2) / CELL_PX)));
  const y = Math.max(0, Math.min(GRID_SIZE - 1, Math.round((py - CELL_PX / 2) / CELL_PX)));
  return { x, y };
}

function drawStitch(target, stitch, scale = CELL_PX, periodCells = GRID_SIZE, highlight = false) {
  const color = COLORS[stitch.colorIndex].hex;
  target.strokeStyle = color;
  target.lineWidth = STROKE_WIDTH * scale;
  target.lineCap = 'round';
  for (const part of wrapSegments(stitch)) {
    // Repeat on the torus periods so round caps clipped at a tile edge are
    // completed on the opposite edge, matching the exported SVG/PNG seam.
    for (const repX of [-1, 0, 1]) {
      for (const repY of [-1, 0, 1]) {
        target.beginPath();
        target.moveTo((part.x1 + repX * periodCells) * scale, (part.y1 + repY * periodCells) * scale);
        target.lineTo((part.x2 + repX * periodCells) * scale, (part.y2 + repY * periodCells) * scale);
        target.stroke();
      }
    }
  }
  if (highlight) {
    target.strokeStyle = '#111';
    target.lineWidth = Math.max(1.5, 0.08 * scale);
    target.setLineDash([0.4 * scale, 0.3 * scale]);
    for (const part of wrapSegments(stitch)) {
      target.beginPath();
      target.moveTo(part.x1 * scale, part.y1 * scale);
      target.lineTo(part.x2 * scale, part.y2 * scale);
      target.stroke();
    }
    target.setLineDash([]);
  }
}

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#fbf7ee';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (state.showGrid) {
    ctx.strokeStyle = '#e2dccd';
    ctx.lineWidth = 1;
    for (let i = 0; i <= GRID_SIZE; i += 1) {
      ctx.beginPath();
      ctx.moveTo(i * CELL_PX, 0);
      ctx.lineTo(i * CELL_PX, GRID_SIZE * CELL_PX);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i * CELL_PX);
      ctx.lineTo(GRID_SIZE * CELL_PX, i * CELL_PX);
      ctx.stroke();
    }
  }

  state.stitches.forEach((stitch, index) => {
    drawStitch(ctx, stitch, CELL_PX, GRID_SIZE, state.highlight.has(index));
  });

  // Live rubber-band preview of the leg being placed.
  if (state.showPreview && state.anchor && state.hover) {
    const draft = {
      x1: state.anchor.x, y1: state.anchor.y,
      x2: state.hover.x, y2: state.hover.y,
      colorIndex: state.colorIndex, runId: 'preview',
    };
    const length = stitchLength(draft);
    ctx.globalAlpha = 0.55;
    drawStitch(ctx, draft, CELL_PX, GRID_SIZE);
    ctx.globalAlpha = 1;
    ctx.fillStyle = length > MAX_STITCH_LENGTH ? '#c0392b' : '#2b2620';
    ctx.font = '12px sans-serif';
    ctx.fillText(`${length.toFixed(2)} 格`, state.hover.x * CELL_PX + 8, state.hover.y * CELL_PX - 8);
  }

  if (state.hover) {
    ctx.fillStyle = COLORS[state.colorIndex].hex;
    ctx.beginPath();
    ctx.arc(state.hover.x * CELL_PX, state.hover.y * CELL_PX, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  renderTiles();
  renderPanel();
}

function renderTiles() {
  const count = Number(document.getElementById('tile-count').value);
  const scale = tileCanvas.width / (GRID_SIZE * count);
  tileCtx.clearRect(0, 0, tileCanvas.width, tileCanvas.height);
  tileCtx.fillStyle = '#fbf7ee';
  tileCtx.fillRect(0, 0, tileCanvas.width, tileCanvas.height);
  for (let ty = 0; ty < count; ty += 1) {
    for (let tx = 0; tx < count; tx += 1) {
      tileCtx.save();
      tileCtx.translate(tx * GRID_SIZE * scale, ty * GRID_SIZE * scale);
      state.stitches.forEach((stitch) => drawStitch(tileCtx, stitch, scale, GRID_SIZE * count));
      tileCtx.restore();
    }
  }
}

function pushHistory() {
  state.history.push(state.stitches.map((s) => ({ ...s })));
  if (state.history.length > 50) state.history.shift();
}

function placeLeg(a, b) {
  if (a.x === b.x && a.y === b.y) return;
  pushHistory();
  const runId = state.runId ?? `run-${Date.now()}`;
  state.runId = runId;
  state.stitches.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, colorIndex: state.colorIndex, runId });
}

function nearestStitch(cell) {
  let best = null;
  let bestDistance = Infinity;
  state.stitches.forEach((stitch, index) => {
    for (const part of wrapSegments(stitch)) {
      const vx = part.x2 - part.x1;
      const vy = part.y2 - part.y1;
      const len2 = vx * vx + vy * vy || 1e-9;
      let t = ((cell.x - part.x1) * vx + (cell.y - part.y1) * vy) / len2;
      t = Math.max(0, Math.min(1, t));
      const px = part.x1 + vx * t;
      const py = part.y1 + vy * t;
      const d = Math.hypot(cell.x - px, cell.y - py);
      if (d < bestDistance) {
        bestDistance = d;
        best = { index, stitch, distance: d };
      }
    }
  });
  return bestDistance <= 1.1 ? best : null;
}

canvas.addEventListener('mousemove', (event) => {
  const cell = toCell(event);
  state.hover = cell;
  const hit = nearestStitch(cell);
  state.hoverStitch = hit;
  const rect = canvas.getBoundingClientRect();
  if (hit) {
    const length = stitchLength(hit.stitch);
    tooltip.hidden = false;
    tooltip.style.left = `${event.clientX - rect.left}px`;
    tooltip.style.top = `${event.clientY - rect.top}px`;
    const color = COLORS[hit.stitch.colorIndex];
    tooltip.innerHTML =
      `<span class="swatch" style="background:${color.hex}"></span>` +
      `针脚 #${hit.index + 1} · 长度 ${length.toFixed(2)} 格 · 线色 ${color.name} ${color.hex}`;
  } else {
    tooltip.hidden = true;
    tooltip.innerHTML =
      `<span class="swatch" style="background:${COLORS[state.colorIndex].hex}"></span>` +
      `当前线色 ${describeColor(state.colorIndex)} · 格点 (${cell.x}, ${cell.y})`;
    tooltip.hidden = false;
    tooltip.style.left = `${event.clientX - rect.left}px`;
    tooltip.style.top = `${event.clientY - rect.top}px`;
  }
  render();
});

canvas.addEventListener('mouseleave', () => {
  state.hover = null;
  state.hoverStitch = null;
  tooltip.hidden = true;
  render();
});

canvas.addEventListener('click', (event) => {
  const cell = toCell(event);
  if (state.tool === 'eraser') {
    const hit = nearestStitch(cell);
    if (hit) {
      pushHistory();
      state.stitches.splice(hit.index, 1);
    }
    render();
    return;
  }
  if (!state.anchor) {
    state.anchor = cell;
    if (!event.shiftKey) state.runId = null;
  } else {
    placeLeg(state.anchor, cell);
    state.anchor = event.shiftKey ? cell : null;
  }
  render();
});

function buildPalette() {
  const palette = document.getElementById('palette');
  palette.innerHTML = '';
  COLORS.forEach((color, index) => {
    const btn = document.createElement('button');
    btn.className = `swatch-btn ${index === state.colorIndex ? 'selected' : ''}`;
    btn.innerHTML = `<span class="dot" style="background:${color.hex}"></span>${color.name}`;
    btn.title = color.hex;
    btn.addEventListener('click', () => {
      state.colorIndex = index;
      buildPalette();
      render();
    });
    palette.appendChild(btn);
  });
}

function renderPanel() {
  const result = validateStitches(state.stitches);
  const list = document.getElementById('issue-list');
  list.innerHTML = '';
  state.highlight = new Set();
  if (result.ok) {
    const li = document.createElement('li');
    li.className = 'ok';
    li.textContent = `通过：无超长针脚，换色比均 ≤ ${MAX_COLOR_SWITCH_RATIO}`;
    list.appendChild(li);
  }
  for (const issue of result.lengthIssues) {
    const li = document.createElement('li');
    li.className = 'len';
    li.textContent = `针脚 #${issue.index + 1} 过长：${issue.length} 格 > ${MAX_STITCH_LENGTH}`;
    li.addEventListener('click', () => {
      state.highlight = new Set([issue.index]);
      render();
    });
    list.appendChild(li);
    state.highlight.add(issue.index);
  }
  for (const issue of result.switchIssues) {
    const li = document.createElement('li');
    li.className = 'sw';
    li.textContent = `针列 ${issue.runId} 换色过频：${issue.ratio} > ${MAX_COLOR_SWITCH_RATIO}`;
    li.addEventListener('click', () => {
      state.highlight = new Set(issue.indexes);
      render();
    });
    list.appendChild(li);
    issue.indexes.forEach((i) => state.highlight.add(i));
  }
  const stats = document.getElementById('stats');
  stats.innerHTML =
    `针脚 ${result.stats.stitchCount} · 针列 ${result.stats.runCount} · 换色 ${result.stats.switchCount} 次<br>` +
    `最长 ${result.stats.maxLength} 格 · 已用色 ${result.stats.colorsUsed.length}/6`;
}

function exportPNG() {
  const scale = 32; // 1024 x 1024 output, grid excluded for a clean tile
  const out = document.createElement('canvas');
  out.width = GRID_SIZE * scale;
  out.height = GRID_SIZE * scale;
  const target = out.getContext('2d');
  target.fillStyle = '#fbf7ee';
  target.fillRect(0, 0, out.width, out.height);
  state.stitches.forEach((stitch) => drawStitch(target, stitch, scale, GRID_SIZE));
  out.toBlob((blob) => {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'embroidery-pattern.png';
    anchor.click();
    URL.revokeObjectURL(url);
  }, 'image/png');
}

document.getElementById('btn-pen').addEventListener('click', () => setTool('pen'));
document.getElementById('btn-eraser').addEventListener('click', () => setTool('eraser'));
function setTool(tool) {
  state.tool = tool;
  state.anchor = null;
  document.getElementById('btn-pen').classList.toggle('active', tool === 'pen');
  document.getElementById('btn-eraser').classList.toggle('active', tool === 'eraser');
}

document.getElementById('btn-undo').addEventListener('click', () => {
  const previous = state.history.pop();
  if (previous) {
    state.stitches = previous;
    render();
  }
});
document.getElementById('btn-clear').addEventListener('click', () => {
  pushHistory();
  state.stitches = [];
  state.anchor = null;
  render();
});
document.getElementById('toggle-grid').addEventListener('change', (e) => {
  state.showGrid = e.target.checked;
  render();
});
document.getElementById('toggle-preview').addEventListener('change', (e) => {
  state.showPreview = e.target.checked;
  render();
});
document.getElementById('tile-count').addEventListener('change', render);
document.getElementById('btn-svg').addEventListener('click', () => {
  download('embroidery-pattern.svg', toSVG(state.stitches), 'image/svg+xml');
});
document.getElementById('btn-png').addEventListener('click', exportPNG);
document.getElementById('btn-demo').addEventListener('click', () => {
  pushHistory();
  state.stitches = generatePattern();
  state.anchor = null;
  render();
});

buildPalette();
state.stitches = generatePattern();
render();
