// Browser app: canvas rendering (lead, glass, light transmission) + export.
import { computeLayout, verifyLayout, toSVG, PALETTE, LEAD, FRAME_HI, FRAME_LO }
  from './glass.js';

const $ = (id) => document.getElementById(id);
const canvas = $('view');
const ctx = canvas.getContext('2d');

const PRESETS = {
  A: { seed: 'rose-2026', motif: 'rose', rings: 4, tileSize: 95, borderWidth: 12 },
  B: { seed: 'star-7', motif: 'star', rings: 3, tileSize: 130, borderWidth: 18 },
};

function readOpts() {
  return {
    seed: $('seed').value || '1',
    motif: $('motif').value,
    rings: +$('rings').value,
    tileSize: +$('tileSize').value,
    borderWidth: +$('borderWidth').value,
    size: canvas.width,
  };
}

function tilePath(t) {
  const p = new Path2D();
  p.moveTo(t.pts[0][0], t.pts[0][1]);
  for (let i = 1; i < t.pts.length; i++) p.lineTo(t.pts[i][0], t.pts[i][1]);
  p.closePath();
  return p;
}

function centroid(pts) {
  let x = 0, y = 0;
  for (const [px, py] of pts) { x += px; y += py; }
  return [x / pts.length, y / pts.length];
}

function draw(layout) {
  const s = layout.size;
  ctx.clearRect(0, 0, s, s);
  ctx.fillStyle = '#0b0c10';
  ctx.fillRect(0, 0, s, s);

  // soft halo behind the window (light shining through)
  const halo = ctx.createRadialGradient(
    layout.cx, layout.cy, layout.glassR * 0.4,
    layout.cx, layout.cy, layout.frameOuter * 1.25);
  halo.addColorStop(0, 'rgba(120,140,220,0.18)');
  halo.addColorStop(1, 'rgba(120,140,220,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, s, s);

  // glass tiles
  for (const t of layout.tiles) {
    const path = tilePath(t);
    const [gx, gy] = centroid(t.pts);
    const c = PALETTE[t.color];
    const g = ctx.createRadialGradient(
      gx - 12, gy - 16, 4, gx, gy, layout.tileSize * 1.1);
    g.addColorStop(0, c.hi);
    g.addColorStop(0.55, c.base);
    g.addColorStop(1, c.lo);
    ctx.fillStyle = g;
    ctx.fill(path);
  }

  // lead cames
  ctx.strokeStyle = LEAD;
  ctx.lineWidth = layout.borderWidth;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  for (const t of layout.tiles) ctx.stroke(tilePath(t));

  // outer frame (closed annulus)
  const midR = layout.frameOuter - layout.frameW / 2;
  const metal = ctx.createLinearGradient(0, 0, s, s);
  metal.addColorStop(0, FRAME_HI);
  metal.addColorStop(1, FRAME_LO);
  ctx.beginPath();
  ctx.arc(layout.cx, layout.cy, midR, 0, Math.PI * 2);
  ctx.strokeStyle = metal;
  ctx.lineWidth = layout.frameW;
  ctx.stroke();
  for (const r of [layout.frameOuter, layout.glassR]) {
    ctx.beginPath();
    ctx.arc(layout.cx, layout.cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = LEAD;
    ctx.lineWidth = layout.borderWidth * 0.6;
    ctx.stroke();
  }

  // transmitted light: highlight from upper-left + edge falloff
  const light = ctx.createRadialGradient(
    layout.cx * 0.76, layout.cy * 0.64, 10,
    layout.cx, layout.cy, layout.frameOuter);
  light.addColorStop(0, 'rgba(255,255,255,0.30)');
  light.addColorStop(0.55, 'rgba(255,255,255,0.05)');
  light.addColorStop(1, 'rgba(0,0,0,0.25)');
  ctx.beginPath();
  ctx.arc(layout.cx, layout.cy, layout.glassR, 0, Math.PI * 2);
  ctx.fillStyle = light;
  ctx.fill();
}

let layout = null;

function refresh() {
  $('ringsOut').textContent = $('rings').value;
  $('tileOut').textContent = $('tileSize').value;
  $('borderOut').textContent = $('borderWidth').value;
  layout = computeLayout(readOpts());
  draw(layout);
  const v = verifyLayout(layout);
  const status = $('status');
  status.classList.toggle('bad', !v.ok);
  status.textContent = v.ok
    ? `✓ 外圈闭合 · ${layout.tiles.length} 片玻璃 · 无相邻重色（${layout.motifType}）`
    : '✗ ' + v.problems[0];
}

function applyPreset(p) {
  $('seed').value = p.seed;
  $('motif').value = p.motif;
  $('rings').value = p.rings;
  $('tileSize').value = p.tileSize;
  $('borderWidth').value = p.borderWidth;
  refresh();
}

function download(name, blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

$('exportSvg').addEventListener('click', () => {
  const blob = new Blob([toSVG(layout)], { type: 'image/svg+xml' });
  download(`stained-glass-${layout.seed}.svg`, blob);
});
$('exportPng').addEventListener('click', () => {
  canvas.toBlob((b) => download(`stained-glass-${layout.seed}.png`, b), 'image/png');
});
$('randomSeed').addEventListener('click', () => {
  $('seed').value = Math.random().toString(36).slice(2, 9);
  refresh();
});
$('presetA').addEventListener('click', () => applyPreset(PRESETS.A));
$('presetB').addEventListener('click', () => applyPreset(PRESETS.B));
for (const id of ['motif', 'rings', 'tileSize', 'borderWidth', 'seed']) {
  $(id).addEventListener('input', refresh);
}

refresh();
