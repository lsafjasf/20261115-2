/* Texture studio UI: parameterized generation, plane/sphere preview,
 * wrap-synchronized local painting, and PNG export. */
(function () {
  'use strict';
  const N = TexEngine.SIZE;
  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');
  const status = document.getElementById('status');

  const state = {
    type: 'stone',
    scale: 5, angle: 30, contrast: 1.15, seed: 20261115,
    view: 'plane', repeat: 1, showGrid: false,
    tool: 'heal', brush: 28, strength: 0.6, wrap: true,
    base: null,       // pristine generated RGB Uint8ClampedArray N*N*3
    work: null,       // editable RGB copy
    undoStack: [],
    painting: false,
    raf: null,
  };

  const $ = (id) => document.getElementById(id);
  function setStatus(msg) { status.textContent = msg; }

  function params() {
    return { type: state.type, seed: state.seed, scale: state.scale,
      angleDeg: state.angle, contrast: state.contrast };
  }

  function generate() {
    const { rgb } = TexEngine.generate(N, params());
    state.base = rgb;
    state.work = new Uint8ClampedArray(rgb);
    state.undoStack = [];
    scheduleRender();
    runSeamCheck();
  }

  function toImageData(rgb) {
    const img = ctx.createImageData(N, N);
    for (let i = 0, j = 0; i < rgb.length; i += 3, j += 4) {
      img.data[j] = rgb[i]; img.data[j + 1] = rgb[i + 1];
      img.data[j + 2] = rgb[i + 2]; img.data[j + 3] = 255;
    }
    return img;
  }

  function scheduleRender() {
    if (state.raf) return;
    state.raf = requestAnimationFrame(() => { state.raf = null; render(); });
  }

  function render() {
    if (state.view === 'sphere') renderSphere();
    else renderPlane();
  }

  function renderPlane() {
    const img = toImageData(state.work);
    const tile = document.createElement('canvas');
    tile.width = tile.height = N;
    tile.getContext('2d').putImageData(img, 0, 0);

    const rep = state.repeat;
    const cell = canvas.width / rep;
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let ty = 0; ty < rep; ty++) for (let tx = 0; tx < rep; tx++) {
      ctx.drawImage(tile, tx * cell, ty * cell, cell, cell);
    }
    if (state.showGrid && rep > 1) {
      ctx.strokeStyle = 'rgba(255,64,64,.9)'; ctx.lineWidth = 1;
      for (let k = 1; k < rep; k++) {
        const p = k * cell;
        ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, canvas.height); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(canvas.width, p); ctx.stroke();
      }
    }
  }

  /* Sphere preview via equirectangular sampling with simple lambert shading. */
  function renderSphere() {
    const S = canvas.width;
    const out = ctx.createImageData(S, S);
    const cx = S / 2, cy = S / 2, R = S * 0.46;
    const light = norm([-0.5, -0.6, 0.7]);
    for (let py = 0; py < S; py++) {
      for (let px = 0; px < S; px++) {
        const dx = (px - cx) / R, dy = (py - cy) / R;
        const d2 = dx * dx + dy * dy;
        const oi = (py * S + px) * 4;
        if (d2 > 1) { out.data[oi + 3] = 0; continue; }
        const dz = Math.sqrt(1 - d2);
        // spherical -> equirectangular uv
        const lon = Math.atan2(dx, dz);                 // -pi..pi
        const lat = Math.asin(Math.max(-1, Math.min(1, dy)));
        const u = (lon / (2 * Math.PI) + 0.5) * N;
        const v = (lat / Math.PI + 0.5) * N;
        const ti = (wrapIdx(v, N) * N + wrapIdx(u, N)) * 3;
        const ndl = Math.max(0, dx * light[0] + dy * light[1] + dz * light[2]);
        const shade = 0.35 + 0.75 * ndl;
        out.data[oi] = state.work[ti] * shade;
        out.data[oi + 1] = state.work[ti + 1] * shade;
        out.data[oi + 2] = state.work[ti + 2] * shade;
        out.data[oi + 3] = 255;
      }
    }
    ctx.putImageData(out, 0, 0);
  }

  function norm(v) { const l = Math.hypot(v[0], v[1], v[2]) || 1; return v.map((x) => x / l); }
  function wrapIdx(x, size) { return ((Math.floor(x) % size) + size) % size; }

  function runSeamCheck() {
    const s = TexSeam.check(state.work, N);
    const box = $('seamBox');
    box.style.color = s.passed ? '#9fe0b0' : '#ff9b9b';
    box.textContent =
      '接缝检测 ' + (s.passed ? '✓ 通过' : '✗ 未通过') +
      '\nX 环绕比值 ' + s.seamRatioX.toFixed(3) +
      '  Y 环绕比值 ' + s.seamRatioY.toFixed(3) +
      '\n2×2 跨界比值 ' + s.ratio.toFixed(3);
  }

  function pushUndo() {
    state.undoStack.push(new Uint8ClampedArray(state.work));
    if (state.undoStack.length > 20) state.undoStack.shift();
  }

  /* Convert a canvas pixel to texture coordinates (handles plane repeat). */
  function canvasToTex(px, py) {
    const rep = state.view === 'plane' ? state.repeat : 1;
    const cell = canvas.width / rep;
    const tx = ((px % cell) / cell) * N;
    const ty = ((py % cell) / cell) * N;
    return { tx, ty };
  }

  function strokeAt(px, py) {
    if (state.view === 'sphere') { setStatus('球体预览下请切回平面模式进行修补'); return; }
    const { tx, ty } = canvasToTex(px, py);
    const radius = state.brush * (N / (canvas.width / state.repeat));
    paint(tx, ty, radius);
    scheduleRender();
  }

  /* Apply a brush stamp. When wrap is on, the same stamp is repeated at all
   * nine wrapped offsets so an edit near one edge appears on the opposite edge. */
  function paint(cx, cy, radius) {
    const work = state.work, base = state.base;
    const r2 = radius * radius;
    const strength = state.strength;
    const offsets = state.wrap
      ? [[0, 0], [N, 0], [-N, 0], [0, N], [0, -N], [N, N], [-N, -N], [N, -N], [-N, N]]
      : [[0, 0]];
    const r = Math.ceil(radius);
    for (const [ox, oy] of offsets) {
      const ax = cx + ox, ay = cy + oy;
      const x0 = Math.max(0, Math.floor(ax - r)), x1 = Math.min(N - 1, Math.ceil(ax + r));
      const y0 = Math.max(0, Math.floor(ay - r)), y1 = Math.min(N - 1, Math.ceil(ay + r));
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const ddx = x - ax, ddy = y - ay;
        const dist2 = ddx * ddx + ddy * ddy;
        if (dist2 > r2) continue;
        const fall = Math.pow(1 - Math.sqrt(dist2) / radius, 1.5) * strength;
        const idx = (y * N + x) * 3;
        for (let c = 0; c < 3; c++) {
          let target;
          if (state.tool === 'heal') target = base[idx + c];
          else if (state.tool === 'smooth') target = neighborAvg(work, x, y, c);
          else if (state.tool === 'lighten') target = work[idx + c] + 40;
          else target = work[idx + c] - 40; // darken
          work[idx + c] = work[idx + c] + (target - work[idx + c]) * fall;
        }
      }
    }
  }

  function neighborAvg(work, x, y, c) {
    let sum = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const xx = wrapIdx(x + dx, N), yy = wrapIdx(y + dy, N);
      sum += work[(yy * N + xx) * 3 + c];
    }
    return sum / 9;
  }

  function download(bytes, name) {
    const blob = new Blob([bytes], { type: 'image/png' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function exportCurrent() {
    const png = TexPNG.encode(state.work, N, N, false);
    download(png, state.type + '_512.png');
    runSeamCheck();
    setStatus('已导出 ' + state.type + '_512.png（' + png.length + ' 字节）');
  }

  function exportAll() {
    const presets = [
      { type: 'stone', scale: 5, angleDeg: 30, contrast: 1.15 },
      { type: 'wood', scale: 6, angleDeg: 75, contrast: 1.35 },
      { type: 'fabric', scale: 4, angleDeg: 0, contrast: 1.1 },
    ];
    for (const p of presets) {
      const { rgb } = TexEngine.generate(N, { ...p, seed: state.seed });
      download(TexPNG.encode(rgb, N, N, false), p.type + '_512.png');
    }
    setStatus('已导出三套 512×512 PNG');
  }

  function bindRange(id, key, fmt, onChange) {
    const el = $(id), label = $(id + 'Val');
    const sync = () => {
      const v = parseFloat(el.value);
      state[key] = key === 'strength' ? v / 100 : v;
      if (label) label.textContent = fmt ? fmt(state[key]) : state[key];
      if (onChange) onChange();
    };
    el.addEventListener('input', sync);
    sync();
  }

  let regenTimer = null;
  function debounceRegen() {
    clearTimeout(regenTimer);
    regenTimer = setTimeout(generate, 120);
  }

  function bindSeg(id, key, after) {
    const seg = $(id);
    seg.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      [...seg.children].forEach((b) => b.classList.toggle('on', b === btn));
      state[key] = btn.dataset.value;
      if (after) after();
    });
  }

  bindRange('scale', 'scale', (v) => v.toFixed(1), debounceRegen);
  bindRange('angle', 'angle', (v) => v.toFixed(0) + '°', debounceRegen);
  bindRange('contrast', 'contrast', (v) => v.toFixed(2), debounceRegen);
  bindRange('seed', 'seed', (v) => String(v), debounceRegen);
  bindRange('brush', 'brush', (v) => v.toFixed(0));
  bindRange('strength', 'strength', (v) => Math.round(v * 100) + '%');
  bindRange('repeat', 'repeat', (v) => v.toFixed(0) + '×', scheduleRender);

  bindSeg('typeSeg', 'type', generate);
  bindSeg('viewSeg', 'view', () => {
    $('viewHint').textContent = state.view === 'sphere'
      ? '球体模式：球面 UV 环绕预览；修补请切回平面。'
      : '平面模式：直接在纹理上拖动即可修补。';
    scheduleRender();
  });
  bindSeg('toolSeg', 'tool');

  $('showGrid').addEventListener('change', (e) => { state.showGrid = e.target.checked; scheduleRender(); });
  $('wrapOn').addEventListener('change', (e) => { state.wrap = e.target.checked; });
  $('regen').addEventListener('click', generate);
  $('exportPng').addEventListener('click', exportCurrent);
  $('exportAll').addEventListener('click', exportAll);
  $('undo').addEventListener('click', undo);
  $('resetEdits').addEventListener('click', () => {
    pushUndo(); state.work = new Uint8ClampedArray(state.base);
    scheduleRender(); runSeamCheck();
  });

  function undo() {
    const prev = state.undoStack.pop();
    if (prev) { state.work = prev; scheduleRender(); runSeamCheck(); }
  }

  function eventPos(e) {
    const rect = canvas.getBoundingClientRect();
    const sx = canvas.width / rect.width, sy = canvas.height / rect.height;
    const p = e.touches ? e.touches[0] : e;
    return { x: (p.clientX - rect.left) * sx, y: (p.clientY - rect.top) * sy };
  }
  let last = null;
  function down(e) {
    e.preventDefault();
    state.painting = true; pushUndo();
    const p = eventPos(e); last = p; strokeAt(p.x, p.y);
  }
  function move(e) {
    if (!state.painting) return;
    e.preventDefault();
    const p = eventPos(e);
    // interpolate between events so fast drags stay continuous
    const steps = Math.max(1, Math.hypot(p.x - last.x, p.y - last.y) / 4);
    for (let s = 1; s <= steps; s++) {
      strokeAt(last.x + (p.x - last.x) * s / steps, last.y + (p.y - last.y) * s / steps);
    }
    last = p;
  }
  function up() { state.painting = false; if (state.work) runSeamCheck(); }

  canvas.addEventListener('mousedown', down);
  window.addEventListener('mousemove', move);
  window.addEventListener('mouseup', up);
  canvas.addEventListener('touchstart', down, { passive: false });
  canvas.addEventListener('touchmove', move, { passive: false });
  window.addEventListener('touchend', up);
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
  });

  generate();

  window.__tex = { state, generate, scheduleRender, runSeamCheck, N };
})();
