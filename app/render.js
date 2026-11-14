(function () {
// Shared drawing helpers used by the on-screen canvas, thumbnail and SVG export.

const layoutNS = typeof module !== 'undefined' && module.exports
  ? require('./layout.js')
  : window.layout;
const { VIEW, panelRect, safeRect, layoutPanel, clampToSafe } = layoutNS;

const COLORS = {
  paper: '#ffffff',
  panelFill: '#f7f8fb',
  panelAlt: '#eef2f8',
  fold: '#c2cad8',
  safe: '#3b82f6',
  title: '#0f172a',
  body: '#334155',
  image: '#cbd5e1',
  imageInk: '#64748b',
  accent: '#2563eb',
};

function computeAll(ctx, doc) {
  return doc.panels.map((panel, i) => ({
    panel,
    index: i,
    rect: panelRect(i),
    layout: layoutPanel(ctx, i, panel.blocks),
  }));
}

function drawFoldMarks(ctx) {
  for (let i = 1; i < VIEW.panelCount; i++) {
    const x = i * VIEW.panelW;
    ctx.save();
    ctx.strokeStyle = COLORS.fold;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([8, 6]);
    ctx.beginPath();
    ctx.moveTo(x, 8);
    ctx.lineTo(x, VIEW.height - 8);
    ctx.stroke();
    ctx.restore();
  }
}

function drawSafeGuides(ctx) {
  for (let i = 0; i < VIEW.panelCount; i++) {
    const s = safeRect(i);
    ctx.save();
    ctx.strokeStyle = COLORS.safe;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(s.x, s.y, s.w, s.h);
    ctx.restore();
  }
}

function drawImagePlaceholder(ctx, rect) {
  ctx.save();
  ctx.fillStyle = COLORS.image;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  ctx.strokeStyle = COLORS.imageInk;
  ctx.lineWidth = 1;
  ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.w - 1, rect.h - 1);
  ctx.fillStyle = COLORS.imageInk;
  ctx.font = '13px Helvetica, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('图片区域（可拖动 / 上传）', rect.x + rect.w / 2, rect.y + rect.h / 2);
  ctx.restore();
}

function drawImageBlock(ctx, block) {
  const { rect } = block;
  if (block.src && block._image) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(rect.x, rect.y, rect.w, rect.h);
    ctx.clip();
    const img = block._image;
    const scale = Math.max(rect.w / img.width, rect.h / img.height);
    const dw = img.width * scale;
    const dh = img.height * scale;
    ctx.drawImage(img, rect.x + (rect.w - dw) / 2, rect.y + (rect.h - dh) / 2, dw, dh);
    ctx.restore();
    return;
  }
  drawImagePlaceholder(ctx, rect);
}

function drawBlock(ctx, placed, selectedId) {
  const { rect } = placed;
  if (placed.type === 'image') {
    drawImageBlock(ctx, placed);
  } else {
    const { fit } = placed;
    ctx.save();
    ctx.fillStyle = placed.type === 'title' ? COLORS.title : COLORS.body;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    fit.lines.forEach((line, idx) => {
      ctx.font = `${fit.size >= 20 ? 700 : 400} ${fit.size}px Helvetica, Arial, "PingFang SC", sans-serif`;
      ctx.fillText(line.text, rect.x, rect.y + idx * fit.lineHeight);
    });
    if (placed.type === 'title') {
      ctx.fillStyle = COLORS.accent;
      ctx.fillRect(rect.x, rect.y + fit.height + 4, 44, 3);
    }
    ctx.restore();
  }
  if (selectedId === placed.id) {
    ctx.save();
    ctx.strokeStyle = COLORS.accent;
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 4]);
    ctx.strokeRect(rect.x - 3, rect.y - 3, rect.w + 6, rect.h + 6);
    ctx.restore();
  }
}

function renderDocument(ctx, doc, opts = {}) {
  const { showGuides = true, selectedId = null } = opts;
  ctx.clearRect(0, 0, VIEW.width, VIEW.height);
  ctx.fillStyle = COLORS.paper;
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);

  for (let i = 0; i < VIEW.panelCount; i++) {
    const p = panelRect(i);
    ctx.fillStyle = i % 2 === 0 ? COLORS.panelFill : COLORS.panelAlt;
    ctx.fillRect(p.x, p.y, p.w, p.h);
  }

  const composed = computeAll(ctx, doc);
  composed.forEach(({ layout }) => {
    layout.blocks.forEach((block) => drawBlock(ctx, block, selectedId));
  });

  drawFoldMarks(ctx);
  if (showGuides) drawSafeGuides(ctx);
  return composed;
}

// Small downscaled overview drawn on its own canvas.
function renderThumbnail(thumbCanvas, doc, sourceCtx) {
  const tctx = thumbCanvas.getContext('2d');
  thumbCanvas.width = 280;
  thumbCanvas.height = Math.round(280 * (VIEW.height / VIEW.width));
  tctx.save();
  const scale = thumbCanvas.width / VIEW.width;
  tctx.scale(scale, scale);
  renderDocument(tctx, doc, { showGuides: true });
  tctx.restore();
}

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

// Serialize the exact laid-out geometry to standalone SVG.
function buildSvg(doc, sourceCtx) {
  const composed = computeAll(sourceCtx, doc);
  const parts = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${VIEW.width}" height="${VIEW.height}" viewBox="0 0 ${VIEW.width} ${VIEW.height}">`);
  parts.push(`<rect width="${VIEW.width}" height="${VIEW.height}" fill="${COLORS.paper}"/>`);
  composed.forEach(({ index }) => {
    const p = panelRect(index);
    parts.push(`<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" fill="${index % 2 ? COLORS.panelAlt : COLORS.panelFill}"/>`);
  });

  composed.forEach(({ layout }) => {
    layout.blocks.forEach((block) => {
      const { rect } = block;
      if (block.type === 'image') {
        parts.push(`<rect x="${rect.x}" y="${rect.y}" width="${rect.w}" height="${rect.h}" fill="${COLORS.image}" stroke="${COLORS.imageInk}"/>`);
        parts.push(`<text x="${rect.x + rect.w / 2}" y="${rect.y + rect.h / 2}" fill="${COLORS.imageInk}" font-size="13" text-anchor="middle" font-family="Helvetica,Arial,sans-serif">图片区域</text>`);
        return;
      }
      const weight = block.fit.size >= 20 ? 700 : 400;
      const fill = block.type === 'title' ? COLORS.title : COLORS.body;
      block.fit.lines.forEach((line, idx) => {
        const y = rect.y + idx * block.fit.lineHeight + block.fit.size;
        parts.push(`<text x="${rect.x}" y="${y.toFixed(1)}" fill="${fill}" font-size="${block.fit.size}" font-weight="${weight}" font-family="Helvetica,Arial,'PingFang SC',sans-serif">${escapeXml(line.text)}</text>`);
      });
      if (block.type === 'title') {
        parts.push(`<rect x="${rect.x}" y="${(rect.y + block.fit.height + 4).toFixed(1)}" width="44" height="3" fill="${COLORS.accent}"/>`);
      }
    });
  });

  for (let i = 1; i < VIEW.panelCount; i++) {
    const x = i * VIEW.panelW;
    parts.push(`<line x1="${x}" y1="8" x2="${x}" y2="${VIEW.height - 8}" stroke="${COLORS.fold}" stroke-width="1.5" stroke-dasharray="8 6"/>`);
  }
  for (let i = 0; i < VIEW.panelCount; i++) {
    const s = safeRect(i);
    parts.push(`<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" fill="none" stroke="${COLORS.safe}" stroke-opacity="0.55" stroke-dasharray="4 4"/>`);
  }
  parts.push('</svg>');
  return parts.join('\n');
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { COLORS, computeAll, renderDocument, renderThumbnail, buildSvg, drawFoldMarks, drawSafeGuides, clampToSafe };
} else {
  window.render = { COLORS, computeAll, renderDocument, renderThumbnail, buildSvg, drawFoldMarks, drawSafeGuides, clampToSafe };
}
})();
