import "@fontsource/bebas-neue/400.css";
import "@fontsource-variable/noto-sans-sc";
import "./style.css";

import { analyzePoster } from "./analysis.js";
import {
  DESIGN_PRESETS,
  LOGO_OPTIONS,
  TEXTURE_OPTIONS,
  clonePresetState,
  getPreset,
} from "./designs.js";
import { createQR } from "./qr.js";
import {
  renderCleanQR,
  renderPoster,
} from "./poster.js";

const app = document.querySelector("#app");
const SWATCHES = {
  foreground: ["#123C33", "#111814", "#17345B", "#4B244D", "#7A2E1F"],
  background: ["#F0E5CF", "#E9E3D2", "#DDE8EA", "#F2DCE2", "#F6F3EA"],
  accent: ["#D9573D", "#C9F04A", "#FFB229", "#56C5D8", "#EE82A9"],
};

app.innerHTML = `
  <div class="app-shell">
    <header class="topbar">
      <div class="brand" aria-label="SCANFRAME">
        <span class="brand-mark">S</span>
        <span class="brand-word">SCANFRAME</span>
      </div>
      <span class="top-rule"></span>
      <span class="top-caption">QR POSTER INSTRUMENT / 01</span>
      <div class="top-status">
        <span class="status-dot"></span>
        CANVAS LIVE
      </div>
      <span class="version-tag">BUILD 26.11</span>
    </header>

    <main class="workspace">
      <section class="stage-column">
        <div class="stage-heading">
          <div>
            <p class="section-kicker">COMPOSITION / PREVIEW</p>
            <h2 class="stage-title">海报画布</h2>
          </div>
          <div class="stage-actions">
            <button class="ghost-button" id="heatmapToggle" type="button" aria-pressed="false">
              对比度热区
            </button>
            <button class="ghost-button" id="exportTop" type="button">
              导出 PNG ↗
            </button>
          </div>
        </div>

        <div class="stage">
          <div class="poster-frame">
            <canvas id="posterCanvas" aria-label="二维码海报实时预览"></canvas>
            <div class="poster-meta">
              <span>1200 × 1600 PX</span>
              <span>RGB / PNG</span>
            </div>
          </div>
        </div>

        <div class="audit-strip" aria-label="定位块审计">
          <div class="audit-item">
            <span class="audit-icon" id="finderIcon">3</span>
            <div class="audit-copy">
              <strong id="finderAuditText">定位块 3 / 3 完整</strong>
              <span>逐像素核对，不绘制任何覆盖层</span>
            </div>
          </div>
          <div class="audit-item">
            <span class="audit-icon" id="quietIcon">4</span>
            <div class="audit-copy">
              <strong>静区 4 模块</strong>
              <span>原码保留 5 模块静区</span>
            </div>
          </div>
          <div class="audit-item">
            <span class="audit-icon" id="logoAuditIcon">H</span>
            <div class="audit-copy">
              <strong id="logoAuditText">H 级纠错 · 中心 5.0%</strong>
              <span>图形只进入受控中区</span>
            </div>
          </div>
        </div>
      </section>

      <aside class="control-panel" aria-label="海报控制面板">
        <div class="panel-lead">
          <p class="section-kicker">SCAN RELIABILITY, BY DESIGN</p>
          <h1>让二维码成为画面，<br />而不是画面里的事故。</h1>
          <p>换色、加纹理、放中心图形。每一笔都实时审计对比度，三枚定位块始终独立保护。</p>
        </div>

        <section class="control-section">
          <div class="section-head">
            <h3 class="section-title">选择版式</h3>
            <span class="section-index">01 / PRESET</span>
          </div>
          <div class="preset-grid" id="presetGrid">
            ${DESIGN_PRESETS.map(
              (preset) => `
                <button class="preset-card" type="button" data-preset="${preset.id}" aria-pressed="false">
                  <canvas class="preset-thumb" data-thumb="${preset.id}" width="152" height="202"></canvas>
                  <span class="preset-info">
                    <span class="preset-code">${preset.code}</span>
                    <span class="preset-name">${preset.name}</span>
                    <span class="preset-count">已生成 · 可编辑</span>
                  </span>
                </button>
              `,
            ).join("")}
          </div>
        </section>

        <section class="control-section">
          <div class="section-head">
            <h3 class="section-title">扫码去向</h3>
            <span class="section-index">02 / CONTENT</span>
          </div>
          <label class="field-label" for="qrValue">二维码内容 / URL</label>
          <input class="text-input" id="qrValue" type="text" spellcheck="false" />
        </section>

        <section class="control-section">
          <div class="section-head">
            <h3 class="section-title">颜色系统</h3>
            <span class="section-index">03 / COLOR</span>
          </div>
          <div class="color-stack">
            ${[
              ["foreground", "前景 / 码点", "FOREGROUND"],
              ["background", "背景 / 码底", "BACKGROUND"],
              ["accent", "强调色", "ACCENT"],
            ]
              .map(
                ([key, name, english]) => `
                  <div class="color-row">
                    <label class="color-chip" style="background:${SWATCHES[key][0]}">
                      <input type="color" data-color="${key}" aria-label="${name}" />
                    </label>
                    <span class="color-name">${name}<span>${english}</span></span>
                    <input class="hex-input" type="text" data-hex="${key}" maxlength="7" aria-label="${name}十六进制" />
                  </div>
                `,
              )
              .join("")}
          </div>
          <div class="swatch-row" id="quickSwatches">
            ${SWATCHES.foreground.map(
              (color) =>
                `<button class="quick-swatch" type="button" data-swatch="${color}" style="background:${color}" title="前景 ${color}"></button>`,
            ).join("")}
          </div>
        </section>

        <section class="control-section">
          <div class="section-head">
            <h3 class="section-title">背景纹理</h3>
            <span class="section-index">04 / TEXTURE</span>
          </div>
          <div class="segmented" id="textureOptions">
            ${TEXTURE_OPTIONS.map(
              (texture) => `
                <button class="segment-button" type="button" data-texture="${texture.id}" aria-pressed="false">
                  ${texture.label}
                </button>
              `,
            ).join("")}
          </div>
          <div class="range-row">
            <div class="range-head">
              <label for="textureStrength">纹理强度</label>
              <span class="range-value" id="textureValue">24%</span>
            </div>
            <input id="textureStrength" type="range" min="0" max="65" step="1" />
          </div>
        </section>

        <section class="control-section">
          <div class="section-head">
            <h3 class="section-title">中心图形</h3>
            <span class="section-index">05 / GLYPH</span>
          </div>
          <div class="logo-grid" id="logoOptions">
            ${LOGO_OPTIONS.map(
              (logo) => `
                <button class="logo-button" type="button" data-logo="${logo.id}" aria-pressed="false">
                  <span class="logo-glyph">${logo.glyph}</span>
                  <span class="logo-name">${logo.label}</span>
                </button>
              `,
            ).join("")}
          </div>
        </section>

        <section class="control-section">
          <div class="section-head">
            <h3 class="section-title">实时可靠性</h3>
            <span class="section-index">06 / AUDIT</span>
          </div>
          <div class="risk-panel">
            <div class="risk-top">
              <div>
                <div class="risk-label">WEAKEST 10% · 最弱模块对比度</div>
                <div class="risk-ratio">
                  <strong id="riskRatio">—</strong><span>: 1</span>
                </div>
              </div>
              <span class="risk-badge" id="riskBadge">计算中</span>
            </div>
            <div class="risk-meter" aria-hidden="true">
              <span></span><span></span><span></span>
            </div>
            <div class="risk-scale"><span>0</span><span>3:1 风险</span><span>4.5:1 可用</span><span>7:1</span></div>
            <div class="risk-facts">
              <div class="risk-fact"><span>临界模块</span><strong id="criticalCount">0</strong></div>
              <div class="risk-fact"><span>警告模块</span><strong id="warningCount">0</strong></div>
              <div class="risk-fact"><span>基础对比</span><strong id="baseRatio">0</strong></div>
            </div>
            <div class="risk-zone-title">高风险区域</div>
            <div class="risk-zones" id="riskZones"></div>
            <p class="risk-tip" id="riskTip"></p>
          </div>

          <div class="raw-card">
            <canvas class="raw-preview" id="cleanQRCanvas" aria-label="不含装饰的原始二维码"></canvas>
            <div class="raw-copy">
              <strong>重新扫描用的原码</strong>
              <span>固定黑白、无中心图形<br />保留 5 模块静区</span>
            </div>
            <button class="raw-download" id="downloadRaw" type="button">PNG ↓</button>
          </div>
        </section>

        <section class="control-section export-block">
          <button class="export-button" id="exportBottom" type="button">
            <span>导出海报 PNG</span>
            <span>1200 × 1600 / RGB</span>
          </button>
          <p class="export-note">导出时自动隐藏热区，定位块审计结果附带在文件名中。</p>
        </section>
      </aside>
    </main>
  </div>
  <div class="toast" id="toast" role="status"></div>
`;

const dom = {
  poster: document.querySelector("#posterCanvas"),
  cleanQR: document.querySelector("#cleanQRCanvas"),
  qrValue: document.querySelector("#qrValue"),
  heatmapToggle: document.querySelector("#heatmapToggle"),
  textureStrength: document.querySelector("#textureStrength"),
  textureValue: document.querySelector("#textureValue"),
  riskRatio: document.querySelector("#riskRatio"),
  riskBadge: document.querySelector("#riskBadge"),
  criticalCount: document.querySelector("#criticalCount"),
  warningCount: document.querySelector("#warningCount"),
  baseRatio: document.querySelector("#baseRatio"),
  riskZones: document.querySelector("#riskZones"),
  riskTip: document.querySelector("#riskTip"),
  finderAuditText: document.querySelector("#finderAuditText"),
  finderIcon: document.querySelector("#finderIcon"),
  logoAuditText: document.querySelector("#logoAuditText"),
  toast: document.querySelector("#toast"),
};

let state = clonePresetState(getPreset("tide"));
let qrValue = getPreset("tide").destination;
let qr = createQR(qrValue);
let analysis = null;
let finderAudit = [];
let showHeatmap = false;
let scheduledRender = 0;
let qrUpdateTimer = 0;
let toastTimer = 0;

function isValidHex(value) {
  return /^#[0-9a-f]{6}$/i.test(value);
}

function scheduleRender() {
  if (scheduledRender) {
    return;
  }
  scheduledRender = requestAnimationFrame(() => {
    scheduledRender = 0;
    renderAll();
  });
}

function rebuildQR() {
  try {
    qr = createQR(qrValue.trim() || "SCANFRAME");
    return true;
  } catch (error) {
    showToast("内容过长，二维码未更新");
    return false;
  }
}

function renderAll() {
  analysis = analyzePoster(state, qr);
  const result = renderPoster(dom.poster, {
    state,
    qr,
    analysis,
    showHeatmap,
    audit: true,
  });
  finderAudit = result.finderAudit;
  renderCleanQR(dom.cleanQR, qr, state);
  syncPanel();
  updateReliability();
}

function syncPanel() {
  document.querySelectorAll("[data-preset]").forEach((button) => {
    button.setAttribute(
      "aria-pressed",
      String(button.dataset.preset === state.presetId),
    );
  });
  document.querySelectorAll("[data-texture]").forEach((button) => {
    button.setAttribute(
      "aria-pressed",
      String(button.dataset.texture === state.texture),
    );
  });
  document.querySelectorAll("[data-logo]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.logo === state.logo));
  });

  document.querySelectorAll("[data-color]").forEach((input) => {
    input.value = state[input.dataset.color];
    input.closest(".color-chip").style.background = state[input.dataset.color];
  });
  document.querySelectorAll("[data-hex]").forEach((input) => {
    input.value = state[input.dataset.hex].toUpperCase();
  });

  dom.qrValue.value = qrValue;
  dom.textureStrength.value = state.textureStrength;
  dom.textureValue.textContent = `${state.textureStrength}%`;
  dom.textureStrength.style.setProperty(
    "--range-progress",
    `${(state.textureStrength / 65) * 100}%`,
  );
  dom.heatmapToggle.setAttribute("aria-pressed", String(showHeatmap));
}

function riskLabel(level) {
  if (level === "critical") {
    return "高风险";
  }
  if (level === "warning") {
    return "需注意";
  }
  return "稳定";
}

function updateReliability() {
  const passedFinders = finderAudit.filter((finder) => finder.ok).length;
  const allFindersPassed = passedFinders === 3;
  dom.riskRatio.textContent = analysis.p10.toFixed(1);
  dom.criticalCount.textContent = String(analysis.criticalCount);
  dom.warningCount.textContent = String(analysis.warningCount);
  dom.baseRatio.textContent = `${analysis.baseRatio.toFixed(1)}:1`;
  dom.riskBadge.className = `risk-badge ${analysis.level}`;
  dom.riskBadge.textContent = allFindersPassed
    ? riskLabel(analysis.level)
    : "定位异常";

  dom.riskZones.innerHTML =
    analysis.riskZones.length > 0
      ? analysis.riskZones
          .slice(0, 4)
          .map(
            (zone) =>
              `<span class="zone-pill ${zone.count > 80 ? "critical" : ""}">${zone.label} · ${zone.count} 模块</span>`,
          )
          .join("")
      : `<span class="zone-pill">无低对比模块</span>`;
  dom.riskTip.textContent = analysis.recommendations[0];

  dom.finderAuditText.textContent = allFindersPassed
    ? "定位块 3 / 3 完整"
    : `定位块 ${passedFinders} / 3 异常`;
  dom.finderIcon.textContent = `${passedFinders}`;
  dom.finderIcon.style.color = allFindersPassed ? "var(--mint)" : "var(--danger)";
  dom.logoAuditText.textContent = `H 级纠错 · 中心 ${(analysis.logoCoverage * 100).toFixed(1)}%`;
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  dom.toast.textContent = message;
  dom.toast.classList.add("show");
  toastTimer = window.setTimeout(() => {
    dom.toast.classList.remove("show");
  }, 2200);
}

function setColor(key, value) {
  if (!["foreground", "background", "accent"].includes(key)) {
    return;
  }
  if (!isValidHex(value)) {
    return;
  }
  state[key] = value.toLowerCase();
  syncPanel();
  scheduleRender();
}

function applyPreset(presetId) {
  const previousPreset = getPreset(state.presetId);
  const nextPreset = getPreset(presetId);
  state = clonePresetState(nextPreset);
  if (!qrValue.trim() || qrValue === previousPreset.destination) {
    qrValue = nextPreset.destination;
  }
  rebuildQR();
  renderAll();
}

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error("PNG encoding failed"));
      }
    }, "image/png");
  });
}

async function downloadCanvas(canvas, filename) {
  const blob = await canvasToBlob(canvas);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function exportPoster() {
  const exportCanvas = document.createElement("canvas");
  const result = renderPoster(exportCanvas, {
    state,
    qr,
    analysis,
    showHeatmap: false,
    audit: true,
  });
  const passed = result.finderAudit.filter((finder) => finder.ok).length;
  await downloadCanvas(
    exportCanvas,
    `scanframe-${state.presetId}-finders-${passed}of3.png`,
  );
  showToast(`海报已导出 · 定位块 ${passed} / 3 完整`);
}

async function exportCleanQR() {
  await downloadCanvas(
    dom.cleanQR,
    `scanframe-${state.presetId}-original-qr.png`,
  );
  showToast("原始二维码已导出 · 保留 5 模块静区");
}

function renderPresetThumbnails() {
  const scratch = document.createElement("canvas");
  document.querySelectorAll("[data-thumb]").forEach((canvas) => {
    const preset = getPreset(canvas.dataset.thumb);
    const thumbState = clonePresetState(preset);
    const thumbQR = createQR(preset.destination);
    renderPoster(scratch, {
      state: thumbState,
      qr: thumbQR,
      analysis: null,
      audit: false,
    });
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(scratch, 0, 0, canvas.width, canvas.height);
  });
}

function bindEvents() {
  document.querySelectorAll("[data-preset]").forEach((button) => {
    button.addEventListener("click", () => applyPreset(button.dataset.preset));
  });

  dom.qrValue.addEventListener("input", (event) => {
    qrValue = event.target.value;
    window.clearTimeout(qrUpdateTimer);
    qrUpdateTimer = window.setTimeout(() => {
      if (rebuildQR()) {
        renderAll();
      }
    }, 260);
  });

  document.querySelectorAll("[data-color]").forEach((input) => {
    input.addEventListener("input", () => {
      setColor(input.dataset.color, input.value);
    });
  });

  document.querySelectorAll("[data-hex]").forEach((input) => {
    input.addEventListener("input", () => {
      if (isValidHex(input.value)) {
        setColor(input.dataset.hex, input.value);
      }
    });
    input.addEventListener("blur", () => syncPanel());
  });

  document.querySelectorAll("[data-swatch]").forEach((button) => {
    button.addEventListener("click", () => {
      setColor("foreground", button.dataset.swatch);
      renderAll();
    });
  });

  document.querySelectorAll("[data-texture]").forEach((button) => {
    button.addEventListener("click", () => {
      state.texture = button.dataset.texture;
      renderAll();
    });
  });

  document.querySelectorAll("[data-logo]").forEach((button) => {
    button.addEventListener("click", () => {
      state.logo = button.dataset.logo;
      renderAll();
    });
  });

  dom.textureStrength.addEventListener("input", (event) => {
    state.textureStrength = Number(event.target.value);
    dom.textureValue.textContent = `${state.textureStrength}%`;
    dom.textureStrength.style.setProperty(
      "--range-progress",
      `${(state.textureStrength / 65) * 100}%`,
    );
    scheduleRender();
  });

  dom.heatmapToggle.addEventListener("click", () => {
    showHeatmap = !showHeatmap;
    renderPoster(dom.poster, {
      state,
      qr,
      analysis,
      showHeatmap,
      audit: true,
    });
    syncPanel();
  });

  document.querySelector("#exportTop").addEventListener("click", exportPoster);
  document.querySelector("#exportBottom").addEventListener("click", exportPoster);
  document.querySelector("#downloadRaw").addEventListener("click", exportCleanQR);
}

async function buildDesigns() {
  await document.fonts.ready;
  const designs = [];
  for (const preset of DESIGN_PRESETS) {
    const designState = clonePresetState(preset);
    const designQR = createQR(preset.destination);
    const designAnalysis = analyzePoster(designState, designQR);
    const poster = document.createElement("canvas");
    const result = renderPoster(poster, {
      state: designState,
      qr: designQR,
      analysis: designAnalysis,
      showHeatmap: false,
      audit: true,
    });
    const clean = document.createElement("canvas");
    renderCleanQR(clean, designQR, designState);
    designs.push({
      id: preset.id,
      name: preset.name,
      destination: preset.destination,
      state: designState,
      finderAudit: result.finderAudit,
      analysis: {
        p10: designAnalysis.p10,
        baseRatio: designAnalysis.baseRatio,
        criticalCount: designAnalysis.criticalCount,
        warningCount: designAnalysis.warningCount,
        level: designAnalysis.level,
        riskZones: designAnalysis.riskZones,
        logoCoverage: designAnalysis.logoCoverage,
        inverted: designAnalysis.inverted,
      },
      posterDataUrl: poster.toDataURL("image/png"),
      cleanDataUrl: clean.toDataURL("image/png"),
    });
  }
  return designs;
}

let resolveReady;
const ready = new Promise((resolve) => {
  resolveReady = resolve;
});

function applyStatePatch(patch) {
  const allowed = [
    "presetId",
    "foreground",
    "background",
    "accent",
    "texture",
    "textureStrength",
    "logo",
  ];
  allowed.forEach((key) => {
    if (patch[key] !== undefined) {
      state[key] = patch[key];
    }
  });
  renderAll();
}

window.scanframe = {
  ready,
  getState: () => ({ ...state, qrValue }),
  getAnalysis: () => analysis,
  getFinderAudit: () => finderAudit,
  getPosterDataUrl: () => dom.poster.toDataURL("image/png"),
  getCleanQRDataUrl: () => dom.cleanQR.toDataURL("image/png"),
  setState: (patch) => {
    applyStatePatch(patch);
    return { state: { ...state, qrValue }, analysis, finderAudit };
  },
  setQR: (value) => {
    qrValue = value;
    const updated = rebuildQR();
    if (updated) {
      renderAll();
    }
    return updated;
  },
  setHeatmap: (visible) => {
    showHeatmap = Boolean(visible);
    renderPoster(dom.poster, {
      state,
      qr,
      analysis,
      showHeatmap,
      audit: true,
    });
    syncPanel();
    return showHeatmap;
  },
  buildDesigns,
};

bindEvents();
renderAll();

document.fonts.ready.then(() => {
  renderPresetThumbnails();
  renderAll();
  document.body.dataset.ready = "true";
  resolveReady(true);
  window.dispatchEvent(new CustomEvent("scanframe-ready"));
});
