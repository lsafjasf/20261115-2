// 纯颜色数学：可复现随机数、值噪声、HSL/RGB/HEX 转换、WCAG 对比度。
// 不依赖 DOM，可直接在 Node 中测试。

export function mulberry32(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 对一维整数网格做平滑插值的值噪声，输出范围约为 [0, 1)。
export function makeValueNoise1D(seed) {
  const rand = mulberry32(seed);
  const lattice = new Map();
  const valueAt = (index) => {
    if (!lattice.has(index)) lattice.set(index, rand());
    return lattice.get(index);
  };
  return (position) => {
    const index = Math.floor(position);
    const fraction = position - index;
    const smooth = fraction * fraction * (3 - 2 * fraction);
    const left = valueAt(index);
    const right = valueAt(index + 1);
    return left + (right - left) * smooth;
  };
}

// 两个倍频的分形噪声，让色相/饱和度/明度轨迹既有趋势又有细节。
export function fractalNoise(noise, position) {
  const broad = noise(position) * 0.65;
  const fine = noise(position * 2.7 + 13.7) * 0.35;
  return broad + fine;
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function hslToRgb(hue, saturation, lightness) {
  const h = ((hue % 360) + 360) % 360;
  const s = clamp(saturation, 0, 1);
  const l = clamp(lightness, 0, 1);
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const sector = h / 60;
  const x = chroma * (1 - Math.abs((sector % 2) - 1));
  let r1 = 0;
  let g1 = 0;
  let b1 = 0;
  if (sector < 1) [r1, g1, b1] = [chroma, x, 0];
  else if (sector < 2) [r1, g1, b1] = [x, chroma, 0];
  else if (sector < 3) [r1, g1, b1] = [0, chroma, x];
  else if (sector < 4) [r1, g1, b1] = [0, x, chroma];
  else if (sector < 5) [r1, g1, b1] = [x, 0, chroma];
  else [r1, g1, b1] = [chroma, 0, x];
  const offset = l - chroma / 2;
  return {
    r: Math.round((r1 + offset) * 255),
    g: Math.round((g1 + offset) * 255),
    b: Math.round((b1 + offset) * 255),
  };
}

export function rgbToHex({ r, g, b }) {
  const toHex = (channel) => channel.toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function hslToHex(hue, saturation, lightness) {
  return rgbToHex(hslToRgb(hue, saturation, lightness));
}

export function hexToRgb(hex) {
  const normalized = hex.replace("#", "").trim();
  const value = Number.parseInt(normalized, 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
}

function channelToLinear(channel) {
  const normalized = channel / 255;
  return normalized <= 0.03928
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(rgb) {
  const r = channelToLinear(rgb.r);
  const g = channelToLinear(rgb.g);
  const b = channelToLinear(rgb.b);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// WCAG 2.1 对比度：(L1 + 0.05) / (L2 + 0.05)，结果 >= 1。
export function contrastRatio(hexA, hexB) {
  const luminanceA = relativeLuminance(hexToRgb(hexA));
  const luminanceB = relativeLuminance(hexToRgb(hexB));
  const lighter = Math.max(luminanceA, luminanceB);
  const darker = Math.min(luminanceA, luminanceB);
  return (lighter + 0.05) / (darker + 0.05);
}

export function wcagLevel(ratio) {
  if (ratio >= 7) return "AAA";
  if (ratio >= 4.5) return "AA";
  if (ratio >= 3) return "AA 大字";
  return "不达标";
}

// 在纯白与近黑之间挑出对比度更高的前景色。
export function bestForeground(hex) {
  const white = "#ffffff";
  const ink = "#1f2430";
  return contrastRatio(hex, white) >= contrastRatio(hex, ink)
    ? { hex: white, label: "白字" }
    : { hex: ink, label: "深字" };
}

export function hslCss(hue, saturation, lightness) {
  return `hsl(${Math.round(hue)}, ${Math.round(saturation * 100)}%, ${Math.round(
    lightness * 100,
  )}%)`;
}
