import { contrastRatio, wcagLevel } from "./core/color.js";
import { drawMockInterface, drawSwatchCard } from "./core/canvas-view.js";
import {
  DEFAULT_PARAMS,
  exportCssVariables,
  generatePalette,
  regeneratePalette,
  resamplePalette,
} from "./core/palette.js";

const params = { ...DEFAULT_PARAMS };
let palette = generatePalette(params);

const els = {
  grid: document.querySelector("#swatch-grid"),
  lockSummary: document.querySelector("#lock-summary"),
  cssOutput: document.querySelector("#css-output"),
  exportStatus: document.querySelector("#export-status"),
  swatchCanvas: document.querySelector("#swatch-canvas"),
  interfaceCanvas: document.querySelector("#interface-canvas"),
};

const rangeBindings = [
  ["base-hue", "baseHue", (value) => `${value}°`],
  ["hue-spread", "hueSpread", (value) => `${value}°`],
  ["sat-min", "saturationMin", (value) => `${value}%`, 100],
  ["sat-max", "saturationMax", (value) => `${value}%`, 100],
  ["light-min", "lightnessMin", (value) => `${value}%`, 100],
  ["light-max", "lightnessMax", (value) => `${value}%`, 100],
];

function syncControlLabels() {
  document.querySelector("#base-hue-value").textContent = `${params.baseHue}°`;
  document.querySelector("#hue-spread-value").textContent = `${params.hueSpread}°`;
  document.querySelector("#sat-min-value").textContent = `${Math.round(params.saturationMin * 100)}%`;
  document.querySelector("#sat-max-value").textContent = `${Math.round(params.saturationMax * 100)}%`;
  document.querySelector("#light-min-value").textContent = `${Math.round(params.lightnessMin * 100)}%`;
  document.querySelector("#light-max-value").textContent = `${Math.round(params.lightnessMax * 100)}%`;
  document.querySelector("#seed-value").textContent = String(params.seed);
  document.querySelector("#seed").value = String(params.seed);
}

function bindControls() {
  rangeBindings.forEach(([id, key, format, divisor = 1]) => {
    const input = document.querySelector(`#${id}`);
    input.addEventListener("input", () => {
      params[key] = Number(input.value) / divisor;
      syncControlLabels();
      palette = resamplePalette(palette, params);
      render();
    });
  });

  const seedInput = document.querySelector("#seed");
  seedInput.addEventListener("change", () => {
    params.seed = Math.max(0, Math.floor(Number(seedInput.value) || 0));
    syncControlLabels();
    palette = resamplePalette(palette, params);
    render();
  });

  document.querySelector("#regenerate-btn").addEventListener("click", () => {
    palette = regeneratePalette(palette, params);
    params.seed = palette.seed;
    syncControlLabels();
    render();
  });

  document.querySelector("#random-seed-btn").addEventListener("click", () => {
    params.seed = Math.floor(Math.random() * 1_000_000_000);
    syncControlLabels();
    palette = resamplePalette(palette, params);
    render();
  });

  document.querySelector("#copy-css-btn").addEventListener("click", copyCss);
  document.querySelector("#download-css-btn").addEventListener("click", downloadCss);
}

function ratingClass(level) {
  return level === "不达标" ? "fail" : "pass";
}

// 三种可读性预览：小字（11px 文本）、按钮（白/深字操作按钮）、背景（整面铺色）。
function buildPreview(swatch) {
  const container = document.createElement("div");
  container.className = "readability";
  const textLevel = wcagLevel(swatch.textContrast);

  const small = document.createElement("div");
  small.className = "preview-row";
  small.innerHTML = `
    <span class="preview-label">小字</span>
    <span class="preview-small" style="background:${swatch.hex};color:${swatch.foreground}">
      <span class="sample-text">Aa 示例正文</span>
      <span class="preview-ratio">${swatch.textContrast.toFixed(2)}:1</span>
      <span class="rating ${ratingClass(textLevel)}">${textLevel}</span>
    </span>`;

  const button = document.createElement("div");
  button.className = "preview-row";
  button.innerHTML = `
    <span class="preview-label">按钮</span>
    <span class="preview-button" style="background:${swatch.hex};color:${swatch.foreground}">
      Button
      <span class="preview-ratio">${swatch.buttonContrast.toFixed(2)}:1</span>
    </span>`;

  const paperRatio = contrastRatio(swatch.hex, "#ffffff");
  const inkRatio = contrastRatio(swatch.hex, "#1f2430");
  const useInk = inkRatio > paperRatio;
  const backgroundRatio = useInk ? inkRatio : paperRatio;
  const backgroundLevel = wcagLevel(backgroundRatio);
  const background = document.createElement("div");
  background.className = "preview-row";
  background.innerHTML = `
    <span class="preview-label">背景</span>
    <span class="preview-background" style="background:${swatch.hex};color:${useInk ? "#1f2430" : "#ffffff"}">
      <span class="sample-text">${useInk ? "深色文字" : "白色文字"}铺底</span>
      <span class="preview-ratio">${backgroundRatio.toFixed(2)}:1</span>
      <span class="rating ${ratingClass(backgroundLevel)}">${backgroundLevel}</span>
    </span>`;

  container.append(small, button, background);
  return container;
}

function renderSwatch(swatch) {
  const card = document.createElement("article");
  card.className = `swatch-card${swatch.locked ? " is-locked" : ""}`;

  const hero = document.createElement("div");
  hero.className = "swatch-hero";
  hero.style.background = swatch.hex;
  hero.style.color = swatch.foreground;
  hero.innerHTML = `
    <span class="swatch-index">颜色 ${swatch.index + 1}</span>`;
  const lockButton = document.createElement("button");
  lockButton.className = "lock-btn";
  lockButton.type = "button";
  lockButton.setAttribute("aria-pressed", String(swatch.locked));
  lockButton.textContent = swatch.locked ? "🔒 已锁定" : "🔓 锁定";
  lockButton.addEventListener("click", () => {
    palette[swatch.index].locked = !palette[swatch.index].locked;
    render();
  });
  hero.append(lockButton);

  const meta = document.createElement("div");
  meta.className = "swatch-meta";
  const hexLabel = document.createElement("span");
  hexLabel.className = "swatch-hex";
  hexLabel.textContent = swatch.hex.toUpperCase();
  const hslLabel = document.createElement("span");
  hslLabel.className = "swatch-hsl";
  hslLabel.textContent = `${swatch.hsl} · 前景 ${swatch.foregroundLabel}`;
  meta.append(hexLabel, hslLabel);
  meta.append(buildPreview(swatch));

  card.append(hero, meta);
  return card;
}

function render() {
  els.grid.replaceChildren(...palette.map(renderSwatch));
  const lockedCount = palette.filter((swatch) => swatch.locked).length;
  els.lockSummary.textContent = `已锁定 ${lockedCount} / ${palette.length}`;
  els.cssOutput.textContent = exportCssVariables(palette);
  drawSwatchCard(els.swatchCanvas, palette);
  drawMockInterface(els.interfaceCanvas, palette);
}

async function copyCss() {
  const css = exportCssVariables(palette);
  try {
    await navigator.clipboard.writeText(css);
    els.exportStatus.textContent = "已复制到剪贴板";
  } catch {
    const range = document.createRange();
    range.selectNodeContents(els.cssOutput);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    els.exportStatus.textContent = "剪贴板不可用，已选中代码，可手动复制";
  }
}

function downloadCss() {
  const blob = new Blob([exportCssVariables(palette)], { type: "text/css" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "noise-palette.css";
  anchor.click();
  URL.revokeObjectURL(url);
  els.exportStatus.textContent = "已导出 noise-palette.css";
}

bindControls();
syncControlLabels();
render();
