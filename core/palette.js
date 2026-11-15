// 五色噪声调色板生成、锁定保持、CSS 变量导出。

import {
  bestForeground,
  clamp,
  contrastRatio,
  fractalNoise,
  hslCss,
  hslToHex,
  makeValueNoise1D,
  wcagLevel,
} from "./color.js";

export const SWATCH_COUNT = 5;
export const NEUTRAL_INK = "#1f2430";
export const NEUTRAL_PAPER = "#ffffff";

export const DEFAULT_PARAMS = {
  baseHue: 210,
  hueSpread: 48,
  saturationMin: 0.42,
  saturationMax: 0.78,
  lightnessMin: 0.32,
  lightnessMax: 0.78,
  seed: 20261115,
};

export function clampParams(params) {
  const saturationMin = clamp(params.saturationMin, 0, 1);
  const saturationMax = clamp(params.saturationMax, 0, 1);
  const lightnessMin = clamp(params.lightnessMin, 0, 1);
  const lightnessMax = clamp(params.lightnessMax, 0, 1);
  return {
    baseHue: ((params.baseHue % 360) + 360) % 360,
    hueSpread: clamp(params.hueSpread, 0, 180),
    saturationMin: Math.min(saturationMin, saturationMax),
    saturationMax: Math.max(saturationMin, saturationMax),
    lightnessMin: Math.min(lightnessMin, lightnessMax),
    lightnessMax: Math.max(lightnessMin, lightnessMax),
    seed: Math.max(0, Math.floor(params.seed)),
  };
}

// 单个色块的三条噪声轨迹相互独立，避免三个维度同步起伏。
function buildSwatch(index, params, channels) {
  const position = index / (SWATCH_COUNT - 1);
  const hueNoise = fractalNoise(channels.hue, position + params.seed * 0.0017);
  const saturationNoise = fractalNoise(
    channels.saturation,
    position + params.seed * 0.0029,
  );
  const lightnessNoise = fractalNoise(
    channels.lightness,
    position + params.seed * 0.0041,
  );
  const hue = (params.baseHue + (hueNoise - 0.5) * 2 * params.hueSpread + 360) % 360;
  const saturation =
    params.saturationMin +
    saturationNoise * (params.saturationMax - params.saturationMin);
  const lightness =
    params.lightnessMin +
    lightnessNoise * (params.lightnessMax - params.lightnessMin);
  const hex = hslToHex(hue, saturation, lightness);
  const foreground = bestForeground(hex);
  return {
    index,
    hue,
    saturation,
    lightness,
    hex,
    hsl: hslCss(hue, saturation, lightness),
    foreground: foreground.hex,
    foregroundLabel: foreground.label,
    textContrast: contrastRatio(hex, foreground.hex),
    buttonContrast: contrastRatio(hex, foreground.hex),
    paperContrast: contrastRatio(hex, NEUTRAL_PAPER),
    inkContrast: contrastRatio(hex, NEUTRAL_INK),
  };
}

// 重新生成时：被锁定的位置原样保留，只对未锁定位置重跑噪声。
// 新噪声场只喂给未锁定的索引，因此锁定结果与参数/种子变化完全无关。
export function generatePalette(params, locked = []) {
  const safeParams = clampParams(params);
  const lockedIndexes = new Set(locked.map((swatch) => swatch.index));
  const channels = {
    hue: makeValueNoise1D(safeParams.seed ^ 0x9e3779b9),
    saturation: makeValueNoise1D(safeParams.seed ^ 0x85ebca6b),
    lightness: makeValueNoise1D(safeParams.seed ^ 0xc2b2ae35),
  };
  const palette = Array.from({ length: SWATCH_COUNT }, (_, index) => {
    const kept = locked.find((swatch) => swatch.index === index);
    if (kept) return { ...kept, locked: true };
    return { ...buildSwatch(index, safeParams, channels), locked: false };
  });
  palette.seed = safeParams.seed;
  return palette;
}

export function regeneratePalette(currentPalette, params) {
  const locked = currentPalette.filter((swatch) => swatch.locked);
  const currentSeed =
    typeof currentPalette.seed === "number" ? currentPalette.seed : params.seed;
  return generatePalette({ ...params, seed: currentSeed + 1 }, locked);
}

export function resamplePalette(currentPalette, params) {
  const locked = currentPalette.filter((swatch) => swatch.locked);
  return generatePalette(params, locked);
}

export function contrastSummary(swatch) {
  return {
    text: wcagLevel(swatch.textContrast),
    button: wcagLevel(swatch.buttonContrast),
    background: wcagLevel(Math.max(swatch.paperContrast, swatch.inkContrast)),
  };
}

// 导出 :root CSS 自定义属性，含每个颜色的前景配对与对比度注释。
export function exportCssVariables(palette) {
  const lines = [":root {"];
  palette.forEach((swatch) => {
    const name = `color-${swatch.index + 1}`;
    lines.push(`  --${name}: ${swatch.hex};`);
    lines.push(`  --${name}-hsl: ${swatch.hsl};`);
    lines.push(`  --${name}-on: ${swatch.foreground}; /* 对比度 ${swatch.textContrast.toFixed(2)}:1 */`);
  });
  lines.push("  --ink: #1f2430;");
  lines.push("  --paper: #ffffff;");
  lines.push("}");
  return lines.join("\n");
}
