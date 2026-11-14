(function () {
// Pure layout engine for the tri-fold product brochure.
// No DOM access here so the same logic runs in Node tests and the browser.

const VIEW = {
  width: 1123, // A4 landscape at 96dpi
  height: 794,
  panelCount: 3,
  foldGap: 2,
  margin: 48, // safe area inset inside each panel
  padding: 14, // inner padding of a panel's content box
  gap: 18,
  imageRatio: 4 / 3,
};

VIEW.panelW = VIEW.width / VIEW.panelCount;
VIEW.contentW = VIEW.panelW - VIEW.margin * 2;
VIEW.innerW = VIEW.contentW - VIEW.padding * 2;

function panelRect(index) {
  return { x: index * VIEW.panelW, y: 0, w: VIEW.panelW, h: VIEW.height };
}

function safeRect(index) {
  const p = panelRect(index);
  return { x: p.x + VIEW.margin, y: VIEW.margin, w: p.w - VIEW.margin * 2, h: VIEW.height - VIEW.margin * 2 };
}

// Split text into tokens. CJK characters wrap individually; latin words stay whole.
function tokenize(text) {
  const tokens = [];
  const words = String(text || '').split(/\s+/).filter(Boolean);
  for (const word of words) {
    let buf = '';
    for (const ch of word) {
      if (/[\u3000-\u9fff\uff00-\uffef\u3040-\u30ff]/.test(ch)) {
        if (buf) tokens.push(buf);
        buf = '';
        tokens.push(ch);
      } else {
        buf += ch;
      }
    }
    if (buf) tokens.push(buf);
  }
  return tokens;
}

function measureWidth(ctx, text, fontPx, weight) {
  ctx.font = `${weight} ${fontPx}px Helvetica, Arial, "PingFang SC", "Microsoft YaHei", sans-serif`;
  return ctx.measureText(text).width;
}

// Greedy word wrap honoring both latin words and per-character CJK.
function wrapLines(ctx, text, fontPx, weight, maxWidth) {
  const tokens = tokenize(text);
  const lines = [];
  let line = '';
  for (const token of tokens) {
    const candidate = line ? line + ' ' + token : token;
    if (measureWidth(ctx, candidate, fontPx, weight) <= maxWidth || !line) {
      line = candidate;
    } else {
      lines.push(line);
      line = token;
    }
  }
  if (line) lines.push(line);
  return lines.map((content) => {
    let clipped = content;
    while (clipped.length > 1 && measureWidth(ctx, clipped, fontPx, weight) > maxWidth) {
      clipped = clipped.slice(0, -1);
    }
    return { text: clipped, width: measureWidth(ctx, clipped, fontPx, weight) };
  });
}

// Shrink font until every line fits width and the total block fits maxHeight.
function fitText(ctx, text, opts) {
  const { maxWidth, maxHeight, startSize, minSize, weight, lineHeightRatio } = opts;
  let size = startSize;
  let lines = [];
  while (size >= minSize) {
    lines = wrapLines(ctx, text, size, weight, maxWidth);
    const blockH = lines.length * size * lineHeightRatio;
    const widest = Math.max(0, ...lines.map((l) => l.width));
    if (blockH <= maxHeight && widest <= maxWidth) break;
    size -= 1;
  }
  if (size < minSize) size = minSize;
  lines = wrapLines(ctx, text, size, weight, maxWidth);
  return { size, lines, lineHeight: size * lineHeightRatio, height: lines.length * size * lineHeightRatio };
}

// Compute absolute geometry for every block inside a panel; never crosses the safe box.
function layoutPanel(ctx, panelIndex, blocks) {
  const safe = safeRect(panelIndex);
  const innerX = safe.x + VIEW.padding;
  const maxWidth = VIEW.innerW;
  let cursorY = safe.y + VIEW.padding;
  const limitBottom = safe.y + safe.h - VIEW.padding;

  const placed = blocks.map((block) => {
    // Blocks the user moved carry a stored rect: honor it but clamp inside safe box.
    if (block.rect) {
      const rect = clampToSafe(panelIndex, { ...block.rect });
      return { ...block, rect, pinned: true };
    }
    if (block.type === 'image') {
      const h = Math.min(block.h || maxWidth / VIEW.imageRatio, Math.max(0, limitBottom - cursorY));
      const rect = { x: innerX, y: cursorY, w: maxWidth, h };
      cursorY += rect.h + VIEW.gap;
      return { ...block, rect };
    }
    const isTitle = block.type === 'title';
    const fitted = fitText(ctx, block.text || '', {
      maxWidth,
      maxHeight: Math.max(20, limitBottom - cursorY),
      startSize: isTitle ? 30 : 16,
      minSize: isTitle ? 14 : 9,
      weight: isTitle ? 700 : 400,
      lineHeightRatio: isTitle ? 1.25 : 1.4,
    });
    const rect = { x: innerX, y: cursorY, w: maxWidth, h: fitted.height };
    cursorY += fitted.height + VIEW.gap;
    return { ...block, rect, fit: fitted };
  });

  return { safe, innerX, blocks: placed };
}

// Ensure a dragged rectangle stays inside the panel safe box (fold-line safety).
function clampToSafe(panelIndex, rect) {
  const safe = safeRect(panelIndex);
  const x = Math.min(Math.max(rect.x, safe.x), safe.x + safe.w - rect.w);
  const y = Math.min(Math.max(rect.y, safe.y), safe.y + safe.h - rect.h);
  return { ...rect, x, y };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { VIEW, panelRect, safeRect, tokenize, wrapLines, fitText, layoutPanel, clampToSafe };
} else {
  window.layout = { VIEW, panelRect, safeRect, tokenize, wrapLines, fitText, layoutPanel, clampToSafe };
}
})();
