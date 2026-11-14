/* LUMA Color Room — 纯逐像素调色引擎（无外部图片、无依赖） */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LUMA = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const clamp8 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v | 0);
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

  function srgbToLinear(c) {
    c /= 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }
  function linearToSrgb(c) {
    c = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
    return clamp8(c * 255 + 0.5);
  }

  function hslToRgb(h, s, l) {
    h = ((h % 360) + 360) % 360 / 360;
    let r, g, b;
    if (s === 0) { r = g = b = l; }
    else {
      const hue = (p, q, t) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
      };
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hue(p, q, h + 1 / 3);
      g = hue(p, q, h);
      b = hue(p, q, h - 1 / 3);
    }
    return [r * 255, g * 255, b * 255];
  }

  const DEFAULTS = Object.freeze({
    exposure: 0,       // EV，-2 ~ +2
    temperature: 5600, // K，3200（冷）~ 8000（暖）
    contrast: 0,       // -100 ~ +100
    shadowHue: 220,    // 阴影像色色相 0~360
    shadowSat: 0,      // 阴影饱和度 0~100
    highHue: 40,       // 高光像色色相 0~360
    highSat: 0         // 高光饱和度 0~100
  });

  function normalizeParams(p) {
    return Object.assign({}, DEFAULTS, p || {});
  }

  function makeTintLut(hue, sat) {
    if (sat <= 0) return null;
    const s = clamp(sat, 0, 100) / 100;
    const [tr, tg, tb] = hslToRgb(hue, clamp(s * 1.15, 0, 1), 0.5);
    const lut = new Float32Array(256 * 3);
    for (let i = 0; i < 256; i++) {
      lut[i * 3] = tr;
      lut[i * 3 + 1] = tg;
      lut[i * 3 + 2] = tb;
    }
    return { lut, strength: s };
  }

  /* 对一帧 ImageData（或 {data,width,height}）执行逐像素调色，返回同一缓冲 */
  function applyImageData(image, params) {
    const p = normalizeParams(params);
    const d = image.data;
    const gain = Math.pow(2, clamp(p.exposure, -2, 2));
    const tempAmt = clamp((p.temperature - 5600) / 2400, -1, 1);
    const rGain = 1 + tempAmt * 0.16;
    const bGain = 1 - tempAmt * 0.16;
    const c = clamp(p.contrast, -100, 100) / 100;
    const slope = 1 + c;
    const shadow = makeTintLut(p.shadowHue, p.shadowSat);
    const high = makeTintLut(p.highHue, p.highSat);

    for (let i = 0; i < d.length; i += 4) {
      let lr = srgbToLinear(d[i]) * gain * rGain;
      let lg = srgbToLinear(d[i + 1]) * gain;
      let lb = srgbToLinear(d[i + 2]) * gain * bGain;

      let r = linearToSrgb(lr);
      let g = linearToSrgb(lg);
      let b = linearToSrgb(lb);

      // sRGB 编码空间内围绕中灰 128 做对比伸缩，中灰保持不变
      r = (r - 128) * slope + 128;
      g = (g - 128) * slope + 128;
      b = (b - 128) * slope + 128;

      if (shadow || high) {
        const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
        if (shadow) {
          const w = Math.pow(1 - lum, 2) * shadow.strength * 0.85;
          r = r * (1 - w) + shadow.lut[0] * w;
          g = g * (1 - w) + shadow.lut[1] * w;
          b = b * (1 - w) + shadow.lut[2] * w;
        }
        if (high) {
          const w = Math.pow(lum, 2) * high.strength * 0.85;
          r = r * (1 - w) + high.lut[0] * w;
          g = g * (1 - w) + high.lut[1] * w;
          b = b * (1 - w) + high.lut[2] * w;
        }
      }
      d[i] = clamp8(r);
      d[i + 1] = clamp8(g);
      d[i + 2] = clamp8(b);
    }
    return image;
  }

  function computeHistogram(data) {
    const h = { r: new Uint32Array(256), g: new Uint32Array(256),
                b: new Uint32Array(256), lum: new Uint32Array(256) };
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      h.r[r]++; h.g[g]++; h.b[b]++;
      h.lum[clamp8(0.2126 * r + 0.7152 * g + 0.0722 * b)]++;
    }
    return h;
  }

  const PRESETS = [
    { id: 'morning-mist', name: '晨雾', subtitle: '冷调柔光 / 低反差',
      params: { exposure: 0.32, temperature: 4550, contrast: -28,
                shadowHue: 205, shadowSat: 26, highHue: 190, highSat: 12 } },
    { id: 'teal-orange', name: '青橙公路', subtitle: '冷影 / 暖高光',
      params: { exposure: 0.08, temperature: 5480, contrast: 28,
                shadowHue: 198, shadowSat: 38, highHue: 28, highSat: 28 } },
    { id: 'warm-film', name: '暖砂胶片', subtitle: '暖调 / 胶片颗粒',
      params: { exposure: -0.06, temperature: 6400, contrast: 18,
                shadowHue: 32, shadowSat: 16, highHue: 42, highSat: 30 } }
  ];

  function makePreset(name, params, subtitle) {
    return { id: 'u-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
             name: name || '自定义预设', subtitle: subtitle || '本机保存',
             params: normalizeParams(params) };
  }

  return { clamp, clamp8, srgbToLinear, linearToSrgb, hslToRgb,
           DEFAULTS, normalizeParams,
           applyImageData, computeHistogram, PRESETS, makePreset };
});
