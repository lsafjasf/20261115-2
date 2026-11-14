import { contrastRatio, hexToRgb } from "./color.js";
import { getLogoModules, isInsideLogo } from "./qr.js";
import {
  POSTER_HEIGHT,
  POSTER_WIDTH,
  getQRLayout,
  paintPaperBase,
  paintQRCardBase,
} from "./poster.js";

function channelLuminance(value) {
  const channel = value / 255;
  return channel <= 0.03928
    ? channel / 12.92
    : Math.pow((channel + 0.055) / 1.055, 2.4);
}

function rgbLuminance(r, g, b) {
  return (
    0.2126 * channelLuminance(r) +
    0.7152 * channelLuminance(g) +
    0.0722 * channelLuminance(b)
  );
}

function ratioFromLuminance(first, second) {
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

function averagePixel(data, width, x, y, radius = 1) {
  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;
  for (let offsetY = -radius; offsetY <= radius; offsetY += 1) {
    for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
      const px = Math.max(0, Math.min(width - 1, x + offsetX));
      const py = Math.max(0, Math.min(width - 1, y + offsetY));
      const index = (py * width + px) * 4;
      r += data[index];
      g += data[index + 1];
      b += data[index + 2];
      count += 1;
    }
  }
  return { r: r / count, g: g / count, b: b / count };
}

function percentile(values, amount) {
  if (!values.length) {
    return 21;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * amount));
  return sorted[index];
}

function collectRiskZones(grid) {
  const counts = { "左上": 0, "右上": 0, "左下": 0, "右下": 0 };
  const size = grid.length;
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      if (grid[row][col] >= 4.5 || !Number.isFinite(grid[row][col])) {
        continue;
      }
      const vertical = row < size / 2 ? "上" : "下";
      const horizontal = col < size / 2 ? "左" : "右";
      counts[`${horizontal}${vertical}`] += 1;
    }
  }
  return Object.entries(counts)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([label, count]) => ({ label, count }));
}

function levelFor(p10, criticalCount, warningCount, inverted) {
  if (p10 < 3 || criticalCount > 4 || inverted) {
    return "critical";
  }
  if (p10 < 4.5 || warningCount > 0) {
    return "warning";
  }
  return "safe";
}

export function analyzePoster(state, qr) {
  const layout = getQRLayout(qr, state.presetId);
  const surface = document.createElement("canvas");
  surface.width = POSTER_WIDTH;
  surface.height = POSTER_HEIGHT;
  const ctx = surface.getContext("2d", { willReadFrequently: true });

  paintPaperBase(ctx, state);
  paintQRCardBase(ctx, layout, state, false);

  const image = ctx.getImageData(
    Math.floor(layout.qrX),
    Math.floor(layout.qrY),
    Math.ceil(layout.qrSize),
    Math.ceil(layout.qrSize),
  );
  const fg = hexToRgb(state.foreground);
  const fgLuminance = rgbLuminance(fg.r, fg.g, fg.b);
  const backgroundLuminance = rgbLuminance(
    ...Object.values(hexToRgb(state.background)),
  );
  const baseRatio = contrastRatio(state.foreground, state.background);
  const logo = getLogoModules(qr.size, state.logo);
  const grid = [];
  const ratios = [];
  const moduleSize = layout.moduleSize;

  for (let row = 0; row < qr.size; row += 1) {
    grid[row] = [];
    for (let col = 0; col < qr.size; col += 1) {
      if (!qr.matrix[row][col] || isInsideLogo(row, col, qr.size, state.logo)) {
        grid[row][col] = Infinity;
        continue;
      }
      const sample = averagePixel(
        image.data,
        image.width,
        Math.round((col + 0.5) * moduleSize),
        Math.round((row + 0.5) * moduleSize),
      );
      const bgLuminance = rgbLuminance(sample.r, sample.g, sample.b);
      const ratio = ratioFromLuminance(fgLuminance, bgLuminance);
      grid[row][col] = ratio;
      ratios.push(ratio);
    }
  }

  const p10 = percentile(ratios, 0.1);
  const average =
    ratios.reduce((total, value) => total + value, 0) / Math.max(1, ratios.length);
  const criticalCount = ratios.filter((ratio) => ratio < 3).length;
  const warningCount = ratios.filter((ratio) => ratio >= 3 && ratio < 4.5).length;
  const inverted = fgLuminance > backgroundLuminance;
  const level = levelFor(p10, criticalCount, warningCount, inverted);
  const riskZones = collectRiskZones(grid);

  return {
    layout,
    grid,
    p10,
    average,
    min: Math.min(...ratios),
    max: Math.max(...ratios),
    baseRatio,
    backgroundLuminance,
    criticalCount,
    warningCount,
    inverted,
    level,
    riskZones,
    logoCoverage: logo?.coverage ?? 0,
    logoContrast: contrastRatio(state.foreground, state.background),
    recommendations: buildRecommendations({
      state,
      p10,
      baseRatio,
      inverted,
      warningCount,
      criticalCount,
      logoCoverage: logo?.coverage ?? 0,
    }),
  };
}

function buildRecommendations({
  state,
  p10,
  baseRatio,
  inverted,
  warningCount,
  criticalCount,
  logoCoverage,
}) {
  const tips = [];
  if (inverted) {
    tips.push("前景亮度高于背景，部分旧设备不接受反色二维码。");
  }
  if (baseRatio < 4.5) {
    tips.push("基础色对比度偏低，建议加深前景色或提亮背景色。");
  }
  if ((criticalCount > 0 || warningCount > 0) && state.textureStrength > 18) {
    tips.push("纹理正在侵入数据模块，降低纹理强度可恢复边距。");
  }
  if (p10 < 4.5) {
    tips.push("最弱模块达不到 4.5:1，请查看红色热区后调整。");
  }
  if (logoCoverage > 0.16) {
    tips.push("中心图形覆盖超过 16%，H 级纠错余量正在收窄。");
  }
  if (!tips.length) {
    tips.push("对比度与纠错余量充足，三枚定位块保持独立。");
  }
  return tips;
}
