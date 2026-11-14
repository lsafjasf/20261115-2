/* global layout, state, render */
(function () {
const { VIEW, safeRect, clampToSafe } = layout;
const { createDocument, PANEL_LABELS, findBlock, moveBlock, reassignBlock, updateText } = state;
const { renderDocument, renderThumbnail, buildSvg } = render;

const canvas = document.getElementById('stage');
const thumb = document.getElementById('thumb');
const ctx = canvas.getContext('2d');
canvas.width = VIEW.width;
canvas.height = VIEW.height;

let doc = createDocument();
let selectedId = null;
let drag = null;

function hydrateImages(target) {
  target.panels.forEach((panel) => {
    panel.blocks.forEach((block) => {
      if (block.type === 'image' && block.src && !block._image) {
        const img = new Image();
        img.onload = () => redraw();
        img.src = block.src;
        block._image = img;
      }
    });
  });
}

const $ = (sel) => document.querySelector(sel);

function persist() {
  localStorage.setItem('brochure.doc', JSON.stringify(doc, (key, value) => (key === '_computed' ? undefined : value)));
}

function restore() {
  const raw = localStorage.getItem('brochure.doc');
  if (!raw) return false;
  try {
    doc = JSON.parse(raw);
    return true;
  } catch {
    return false;
  }
}

function redraw() {
  const composed = renderDocument(ctx, doc, { showGuides: true, selectedId });
  // Publish non-persistent geometry for hit testing; `rect` stays undefined until a real drag.
  composed.forEach(({ panel, layout }) => {
    panel.blocks.forEach((block, i) => {
      block._computed = layout.blocks[i].rect;
    });
  });
  renderThumbnail(thumb, doc, ctx);
  return composed;
}

function refresh() {
  hydrateImages(doc);
  buildOrderList();
  redraw();
}

function buildInputs() {
  const wrap = $('#inputs');
  wrap.innerHTML = '';
  doc.panels.forEach((panel, index) => {
    const titleBlock = panel.blocks.find((b) => b.type === 'title');
    const bodyBlock = panel.blocks.find((b) => b.type === 'body');
    const card = document.createElement('section');
    card.className = 'card';
    card.innerHTML = `
      <h3>${PANEL_LABELS[panel.name]} <span>第 ${index + 1} 段 · 自动分配</span></h3>
      <label>标题<input data-id="${titleBlock.id}" class="in-title" value="${titleBlock.text.replace(/"/g, '&quot;')}"></label>
      <label>说明<textarea data-id="${bodyBlock.id}" class="in-body" rows="4">${bodyBlock.text}</textarea></label>`;
    card.querySelector('.in-title').addEventListener('input', (e) => {
      doc = updateText(doc, titleBlock.id, e.target.value); persist(); redraw();
    });
    card.querySelector('.in-body').addEventListener('input', (e) => {
      doc = updateText(doc, bodyBlock.id, e.target.value); persist(); redraw();
    });
    wrap.appendChild(card);
  });
}

function buildOrderList() {
  const list = $('#order');
  list.innerHTML = '';
  doc.panels.forEach((panel) => {
    panel.blocks.forEach((block, index) => {
      const row = document.createElement('div');
      row.className = 'order-row';
      row.draggable = true;
      row.dataset.id = block.id;
      const label = block.type === 'title' ? '标题' : block.type === 'body' ? '说明' : '图片';
      row.innerHTML = `<span class="tag tag-${block.type}">${label}</span>
        <span class="where">${PANEL_LABELS[panel.name]} #${index + 1}</span>
        <button data-act="up" title="上移">↑</button>
        <button data-act="down" title="下移">↓</button>`;
      row.querySelector('[data-act=up]').addEventListener('click', () => commit(moveBlock(doc, block.id, -1)));
      row.querySelector('[data-act=down]').addEventListener('click', () => commit(moveBlock(doc, block.id, 1)));
      row.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', block.id);
        e.dataTransfer.effectAllowed = 'move';
      });
      list.appendChild(row);
    });
  });
}

function commit(next) {
  doc = next;
  persist();
  buildOrderList();
  redraw();
}

// Drop a block row onto a panel to reassign it (cover/inner/back).
function bindPanelDropZones() {
  document.querySelectorAll('.drop-zone').forEach((zone) => {
    zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('over'));
    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.classList.remove('over');
      const id = e.dataTransfer.getData('text/plain');
      commit(reassignBlock(doc, id, zone.dataset.panel));
    });
  });
}

function eventPoint(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) * (VIEW.width / rect.width),
    y: (e.clientY - rect.top) * (VIEW.height / rect.height),
  };
}

function hitTest(point) {
  for (let i = 0; i < doc.panels.length; i++) {
    for (const block of doc.panels[i].blocks) {
      const r = block.rect || block._computed;
      if (!r) continue;
      if (point.x >= r.x && point.x <= r.x + r.w && point.y >= r.y && point.y <= r.y + r.h) {
        return { panelIndex: i, block };
      }
    }
  }
  return null;
}

function bindCanvasDrag() {
  canvas.addEventListener('mousedown', (e) => {
    const point = eventPoint(e);
    const hit = hitTest(point);
    if (!hit) { selectedId = null; redraw(); return; }
    selectedId = hit.block.id;
    drag = {
      id: hit.block.id,
      panelIndex: hit.panelIndex,
      startX: point.x,
      startY: point.y,
      origin: { ...(hit.block.rect || hit.block._computed) },
    };
    redraw();
  });

  window.addEventListener('mousemove', (e) => {
    if (!drag) return;
    const point = eventPoint(e);
    const hit = findBlock(doc, drag.id);
    if (!hit) return;
    const moved = {
      ...drag.origin,
      x: drag.origin.x + (point.x - drag.startX),
      y: drag.origin.y + (point.y - drag.startY),
    };
    // Fold-line guarantee: the block can never leave its panel safe box.
    hit.block.rect = clampToSafe(drag.panelIndex, moved);
    redraw();
  });

  window.addEventListener('mouseup', () => {
    if (drag) { drag = null; persist(); }
  });
}

function download(filename, content, mime) {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function bindExport() {
  $('#btn-png').addEventListener('click', () => {
    canvas.toBlob((blob) => download('brochure.png', blob, 'image/png'), 'image/png');
  });
  $('#btn-svg').addEventListener('click', () => {
    download('brochure.svg', buildSvg(doc, ctx), 'image/svg+xml');
  });
  $('#btn-json').addEventListener('click', () => {
    download('brochure-layout.json', JSON.stringify(doc, null, 2), 'application/json');
  });
  $('#btn-import').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    file.text().then((text) => {
      doc = JSON.parse(text);
      persist();
      selectedId = null;
      buildInputs();
      buildOrderList();
      redraw();
    });
  });
  $('#btn-reset').addEventListener('click', () => {
    doc = createDocument();
    persist();
    selectedId = null;
    buildInputs();
    buildOrderList();
    redraw();
  });
}

function bindImageUpload() {
  $('#btn-image').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file || !selectedId) {
      alert('请先在画布上点选一个图片区域，再选择图片文件。');
      return;
    }
    const hit = findBlock(doc, selectedId);
    if (!hit || hit.block.type !== 'image') {
      alert('所选块不是图片区域。');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      hit.block.src = reader.result;
      persist();
      redraw();
    };
    reader.readAsDataURL(file);
  });
}

function init() {
  const restored = restore();
  hydrateImages(doc);
  buildInputs();
  buildOrderList();
  bindPanelDropZones();
  bindCanvasDrag();
  bindExport();
  bindImageUpload();
  redraw();
  $('#restore-flag').textContent = restored ? '已从本地存档载入' : '新建版面';
}

document.addEventListener('DOMContentLoaded', init);

window.__brochure = {
  getDoc: () => doc,
  setDoc: (next) => { doc = next; },
  getSelected: () => selectedId,
};
})();
