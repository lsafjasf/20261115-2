// Text rendering as SVG path data via opentype.js.
// Converting glyphs to paths makes output identical in browsers and Node,
// independent of installed system fonts.

import opentype from 'opentype.js';

const fontCache = new Map();

export async function loadFont(url) {
  if (fontCache.has(url)) return fontCache.get(url);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`font fetch failed: ${url}`);
  const buffer = await response.arrayBuffer();
  const font = opentype.parse(buffer);
  fontCache.set(url, font);
  return font;
}

export function measureText(font, text, size, tracking = 0) {
  const units = font.unitsPerEm;
  let width = 0;
  for (let i = 0; i < text.length; i += 1) {
    const glyph = font.charToGlyph(text[i]);
    width += glyph.advanceWidth || 0;
    if (i < text.length - 1) width += (tracking / size) * units;
  }
  return (width / units) * size;
}

// Returns an SVG <path> string. x/y is the anchor point; align controls it.
export function textToPath(font, text, size, x, y, options = {}) {
  const {
    fill = '#111111',
    align = 'left',
    tracking = 0,
    id = null,
  } = options;
  const width = measureText(font, text, size, tracking);
  let startX = x;
  if (align === 'center') startX = x - width / 2;
  if (align === 'right') startX = x - width;
  const path = font.getPath(text, startX, y, size, { tracking });
  const d = path.toPathData(2);
  const idAttr = id ? ` id="${id}"` : '';
  return `<path${idAttr} d="${d}" fill="${fill}"/>`;
}

// Largest font size that keeps `text` within maxWidth, between min and max.
export function fitFontSize(font, text, maxWidth, maxSize, minSize, tracking = 0) {
  let size = maxSize;
  while (size > minSize && measureText(font, text, size, tracking) > maxWidth) {
    size -= 2;
  }
  return Math.max(minSize, size);
}
