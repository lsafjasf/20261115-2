(function(){
// Text measurement abstraction.
//
// CanvasMeasurer  : production path, uses Canvas 2D measureText (browser).
// EstimateMeasurer: deterministic fallback for Node unit tests without a canvas.
//
// Both implement:
//   measure(text) -> width in px
//   metrics()      -> { ascent, descent, lineHeight }

// Fullwidth CJK punctuation is given a reduced advance width so lines do not
// look loose. Brackets/quotes keep more width because their glyphs are tall;
// stops and commas are small and can be compressed harder.
const COMPRESS_PUNCT = {};
for (const ch of "。，、：；！？…—–·・".split("")) COMPRESS_PUNCT[ch] = 0.75;
for (const ch of "（）【】《》「」『』〈〉〘〙〚〛“”‘’".split("")) COMPRESS_PUNCT[ch] = 0.9;

function createCanvasMeasurer(ctx, fontString, lineHeight, options = {}) {
  const punctScaleOverride = options.punctScale ?? null;
  ctx.font = fontString;
  const m = ctx.measureText("M中");
  const ascent = m.actualBoundingBoxAscent || m.fontBoundingBoxAscent || 12;
  const descent = m.actualBoundingBoxDescent || m.fontBoundingBoxDescent || 3;
  const cache = new Map();
  const rawMeasure = (text) => ctx.measureText(text).width;
  return {
    mode: "canvas",
    measure(text) {
      if (cache.has(text)) return cache.get(text);
      let width = 0;
      let i = 0;
      while (i < text.length) {
        const ch = text[i];
        if (ch in COMPRESS_PUNCT) {
          const scale = punctScaleOverride ?? COMPRESS_PUNCT[ch];
          width += rawMeasure(ch) * scale;
          i++;
        } else {
          let j = i + 1;
          while (j < text.length && !(text[j] in COMPRESS_PUNCT)) j++;
          width += rawMeasure(text.slice(i, j));
          i = j;
        }
      }
      cache.set(text, width);
      return width;
    },
    metrics() {
      return { ascent, descent, lineHeight };
    },
  };
}

// Estimates: CJK glyph = 1em, latin ~0.55em, punctuation ~0.5em, space 0.3em.
function createEstimateMeasurer(fontSize, lineHeight) {
  const cache = new Map();
  const widthOf = (ch) => {
    if (/\s/.test(ch)) return fontSize * 0.3;
    if (ch in COMPRESS_PUNCT) return fontSize * COMPRESS_PUNCT[ch];
    const code = ch.codePointAt(0);
    if (code > 0x2e7f) return fontSize; // CJK / fullwidth
    if (/[.,;:!?()[\]{}'"]/.test(ch)) return fontSize * 0.35;
    return fontSize * 0.56;
  };
  return {
    mode: "estimate",
    measure(text) {
      if (cache.has(text)) return cache.get(text);
      let w = 0;
      for (const ch of text) w += widthOf(ch);
      cache.set(text, w);
      return w;
    },
    metrics() {
      return {
        ascent: Math.round(fontSize * 0.88),
        descent: Math.round(fontSize * 0.22),
        lineHeight,
      };
    },
  };
}

const api = { createCanvasMeasurer, createEstimateMeasurer };
if (typeof module !== "undefined" && module.exports) module.exports = api;
if (typeof window !== "undefined") window.TypesetterMeasurer = api;

})();
