/* LUMA Color Room — 主应用：状态 / 撤销栈 / 预设 / 渲染 / 导出 */
(function () {
  'use strict';
  const { DEFAULTS, normalizeParams, applyImageData, computeHistogram,
          PRESETS, makePreset } = LUMA;
  const { W, H, build } = LUMABase;
  const STORE_KEY = 'luma.colorroom.presets.v1';

  const state = {
    baseId: 'coastline',
    params: normalizeParams(),
    activePresetId: null,
    presets: PRESETS.map((p) => ({ ...p, params: { ...p.params } })),
    undoStack: [],
    redoStack: [],
    processingMs: 0
  };

  let baseCanvas = null, baseData = null;
  let renderTimer = null;
  let dragGroup = null;

  const $ = (sel) => document.querySelector(sel);
  const canvas = $('#stage');
  const ctx = canvas.getContext('2d', { colorSpace: 'srgb' });

  /* ---------------- 程序化底图 ---------------- */
  function loadBase(id) {
    state.baseId = id;
    baseCanvas = id === 'coastline' ? build.coastline() : build.duneGarden();
    baseData = baseCanvas.getContext('2d').getImageData(0, 0, W, H);
    state.undoStack = [];
    state.redoStack = [];
    state.params = normalizeParams();
    state.activePresetId = null;
    document.querySelectorAll('.base-tab').forEach((t) =>
      t.classList.toggle('on', t.dataset.base === id));
    $('#frame-badge').textContent = id === 'coastline' ? '01 / 02' : '02 / 02';
    if (typeof window.onLumaBaseChanged === 'function') {
      try { window.onLumaBaseChanged(baseCanvas); } catch (e) { /* 外部钩子可选 */ }
    }
    scheduleRender();
  }

  /* ---------------- 逐像素渲染 ---------------- */
  function render() {
    const frame = new ImageData(new Uint8ClampedArray(baseData.data), W, H);
    const t0 = performance.now();
    applyImageData(frame, state.params);
    state.processingMs = performance.now() - t0;
    ctx.putImageData(frame, 0, 0);
    LUMAHisto.draw($('#histo'), computeHistogram(frame.data));
    updateReadouts();
    updateUndoButtons();
  }
  function scheduleRender() {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(render, 16);
  }

  /* ---------------- 撤销 / 重做 ---------------- */
  function snapshot(label) {
    state.undoStack.push({ label, params: { ...state.params },
                           activePresetId: state.activePresetId });
    if (state.undoStack.length > 50) state.undoStack.shift();
    state.redoStack.length = 0;
  }
  /* 同一次滑杆拖拽内的连续 input 事件合并为一条撤销记录 */
  function snapshotDrag(key) {
    if (!dragGroup || dragGroup.key !== key) {
      snapshot('调整 · ' + key);
      dragGroup = { key, stackLen: state.undoStack.length };
    }
  }
  function endDrag() { dragGroup = null; }
  function applySnapshot(snap) {
    state.params = { ...snap.params };
    state.activePresetId = snap.activePresetId;
    syncControls();
    highlightPreset();
    scheduleRender();
  }
  function undo() {
    const snap = state.undoStack.pop();
    if (!snap) return;
    state.redoStack.push({ label: snap.label, params: { ...state.params },
                           activePresetId: state.activePresetId });
    applySnapshot(snap);
  }
  function redo() {
    const snap = state.redoStack.pop();
    if (!snap) return;
    state.undoStack.push({ label: snap.label, params: { ...state.params },
                           activePresetId: state.activePresetId });
    applySnapshot(snap);
  }
  function updateUndoButtons() {
    $('#undo-btn').disabled = state.undoStack.length === 0;
    $('#redo-btn').disabled = state.redoStack.length === 0;
  }

  /* ---------------- 预设 ---------------- */
  function applyPreset(id, recordUndo = true) {
    const preset = state.presets.find((p) => p.id === id);
    if (!preset) return;
    if (recordUndo) snapshot('套用预设 · ' + preset.name);
    state.params = normalizeParams(preset.params);
    state.activePresetId = id;
    syncControls();
    highlightPreset();
    scheduleRender();
  }
  function saveCurrentAsPreset() {
    const name = $('#preset-name').value.trim() || '自定义预设';
    const preset = makePreset(name, state.params);
    state.presets.push(preset);
    state.activePresetId = preset.id;
    persistPresets();
    renderPresetList();
    highlightPreset();
    $('#preset-name').value = '';
  }
  function deletePreset(id) {
    state.presets = state.presets.filter((p) => p.id !== id);
    if (state.activePresetId === id) state.activePresetId = null;
    persistPresets();
    renderPresetList();
  }
  function persistPresets() {
    const custom = state.presets.filter((p) => p.id.startsWith('u-'));
    try { localStorage.setItem(STORE_KEY, JSON.stringify(custom)); } catch (e) { /* 无存储时忽略 */ }
  }
  function restoreCustomPresets() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return;
      for (const p of JSON.parse(raw))
        if (!state.presets.some((q) => q.id === p.id)) state.presets.push(p);
    } catch (e) { /* 损坏数据忽略 */ }
  }

  /* ---------------- 导出（与预览同一像素管线） ---------------- */
  function exportPng() {
    const frame = new ImageData(new Uint8ClampedArray(baseData.data), W, H);
    applyImageData(frame, state.params);
    const out = document.createElement('canvas');
    out.width = W; out.height = H;
    out.getContext('2d', { colorSpace: 'srgb' }).putImageData(frame, 0, 0);
    out.toBlob((blob) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      const tag = state.activePresetId || 'custom';
      a.download = `luma-${state.baseId}-${tag}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    }, 'image/png');
  }

  /* ---------------- UI 绑定与读数 ---------------- */
  const CONTROLS = [
    ['exposure', 'exposure', (v) => (v >= 0 ? '+' : '') + (+v).toFixed(2) + ' EV'],
    ['temperature', 'temperature', (v) => v + ' K'],
    ['contrast', 'contrast', (v) => (v >= 0 ? '+' : '') + v],
    ['shadowHue', 'shadowHue', (v) => v + '°'],
    ['shadowSat', 'shadowSat', (v) => v],
    ['highHue', 'highHue', (v) => v + '°'],
    ['highSat', 'highSat', (v) => v]
  ];

  function syncControls() {
    for (const [id, key] of CONTROLS) {
      const el = document.getElementById('ctl-' + id);
      if (el) el.value = state.params[key];
    }
  }
  function updateReadouts() {
    for (const [id, key, fmt] of CONTROLS) {
      const el = document.getElementById('val-' + id);
      if (el) el.textContent = fmt(state.params[key]);
    }
    $('#readout-exposure').textContent =
      (state.params.exposure >= 0 ? '+' : '') + state.params.exposure.toFixed(2) + ' EV';
    $('#readout-temp').textContent = state.params.temperature + ' K';
    $('#readout-contrast').textContent =
      (state.params.contrast >= 0 ? '+' : '') + state.params.contrast;
    $('#readout-split').textContent =
      state.params.shadowHue + '°/' + state.params.highHue + '° · ' +
      state.params.shadowSat + '/' + state.params.highSat;
    $('#readout-ms').textContent = state.processingMs.toFixed(1) + ' ms';
  }

  function renderPresetList() {
    const box = $('#preset-list');
    box.innerHTML = '';
    state.presets.forEach((p) => {
      const card = document.createElement('div');
      card.className = 'preset-card';
      card.dataset.id = p.id;
      card.innerHTML =
        `<div class="preset-thumb" data-thumb="${p.id}"></div>` +
        `<div class="preset-meta"><strong>${p.name}</strong><span>${p.subtitle}</span></div>` +
        `<button class="preset-del" title="删除预设" data-del="${p.id}">×</button>`;
      card.addEventListener('click', (e) => {
        if (e.target.dataset.del) return;
        applyPreset(p.id);
      });
      box.appendChild(card);
      const del = card.querySelector('[data-del]');
      if (!p.id.startsWith('u-')) del.style.display = 'none';
      else del.addEventListener('click', () => deletePreset(p.id));
      paintThumb(p);
    });
  }

  function paintThumb(preset) {
    const holder = document.querySelector(`[data-thumb="${preset.id}"]`);
    if (!holder || !baseCanvas) return;
    const c = document.createElement('canvas');
    c.width = 96; c.height = 64;
    const cctx = c.getContext('2d');
    cctx.drawImage(baseCanvas, 0, 0, W, H, 0, 0, 96, 64);
    const small = cctx.getImageData(0, 0, 96, 64);
    applyImageData(small, preset.params);
    cctx.putImageData(small, 0, 0);
    holder.style.backgroundImage = `url(${c.toDataURL('image/png')})`;
  }
  function refreshThumbs() { state.presets.forEach(paintThumb); }

  function highlightPreset() {
    document.querySelectorAll('.preset-card').forEach((c) =>
      c.classList.toggle('active', c.dataset.id === state.activePresetId));
    const cur = state.presets.find((p) => p.id === state.activePresetId);
    $('#current-preset-name').textContent = cur ? cur.name : '原图参数';
    $('#current-preset-sub').textContent = cur ? cur.subtitle : '未套用预设';
  }

  function bindControls() {
    for (const [id, key] of CONTROLS) {
      const el = document.getElementById('ctl-' + id);
      el.addEventListener('input', () => {
        snapshotDrag(key);
        state.params[key] = key === 'temperature' || key === 'contrast' ||
          key.indexOf('Hue') > -1 || key.indexOf('Sat') > -1
          ? parseInt(el.value, 10) : parseFloat(el.value);
        state.activePresetId = null;
        highlightPreset();
        scheduleRender();
      });
      el.addEventListener('change', endDrag);
      el.addEventListener('blur', endDrag);
    }
    $('#undo-btn').addEventListener('click', undo);
    $('#redo-btn').addEventListener('click', redo);
    $('#export-btn').addEventListener('click', exportPng);
    $('#save-preset').addEventListener('click', saveCurrentAsPreset);
    document.querySelectorAll('.base-tab').forEach((t) =>
      t.addEventListener('click', () => loadBase(t.dataset.base)));

    const hold = $('#hold-original');
    const showOriginal = (on) => ctx.putImageData(baseData, 0, 0);
    hold.addEventListener('mousedown', () => showOriginal(true));
    hold.addEventListener('mouseup', scheduleRender);
    hold.addEventListener('mouseleave', scheduleRender);

    document.addEventListener('keydown', (e) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      else if (mod && (e.key.toLowerCase() === 'y' ||
               (e.shiftKey && e.key.toLowerCase() === 'z'))) { e.preventDefault(); redo(); }
      else if (mod && e.key.toLowerCase() === 'b') { e.preventDefault(); showOriginal(); }
    });
    document.addEventListener('keyup', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') scheduleRender();
    });
  }

  /* ---------------- 启动 ---------------- */
  function boot() {
    restoreCustomPresets();
    bindControls();
    renderPresetList();
    syncControls();
    loadBase('coastline');
    refreshThumbs();
    window.__LUMA__ = {
      state, render, applyPreset, undo, redo, loadBase,
      getBase: () => baseCanvas,
      getFrame: () => {
        const frame = new ImageData(new Uint8ClampedArray(baseData.data), W, H);
        applyImageData(frame, state.params);
        return frame;
      }
    };
  }
  document.addEventListener('DOMContentLoaded', boot);
})();
