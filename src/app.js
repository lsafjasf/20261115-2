import { TideChart, tideColor } from "./chart.js";
import {
  ANOMALY_THRESHOLD,
  RANGE_MIN_HOURS,
  WEEK_HOURS,
  anomalyCount,
  durationLabel,
  formatTime,
  getRangeStats,
  isAnomaly,
  stations,
  tideData,
} from "./data.js";

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const elements = {
  canvas: $("#tideCanvas"),
  wrap: $("#canvasWrap"),
  tooltip: $("#tooltip"),
  tabs: $$(".view-tab"),
  stationTabs: $("#stationTabs"),
  activeStationName: $("#activeStationName"),
  activeStationCode: $("#activeStationCode"),
  focusSwatch: $("#focusSwatch"),
  chartTitle: $("#chartTitle"),
  chartSubtitle: $("#chartSubtitle"),
  chartHint: $("#chartHint"),
  chartPanel: $("#chartPanel"),
  cursorReadout: $("#cursorReadout"),
  cursorPrev: $("#cursorPrev"),
  cursorNext: $("#cursorNext"),
  startRange: $("#startRange"),
  endRange: $("#endRange"),
  rangeFill: $("#rangeFill"),
  rangeLabels: $("#rangeLabels"),
  windowStartLabel: $("#windowStartLabel"),
  windowEndLabel: $("#windowEndLabel"),
  windowDuration: $("#windowDuration"),
  metricSteps: $("#metricSteps"),
  metricAnomalies: $("#metricAnomalies"),
  exportButton: $("#exportButton"),
  toast: $("#toast"),
  presets: $$(".preset-group button"),
};

const state = {
  view: "heatmap",
  startIndex: 0,
  endIndex: 167,
  stationIndex: 3,
  cursorIndex: 84,
  hover: null,
};

const chart = new TideChart(elements.canvas);
let hoverFrame = 0;
let toastTimer = 0;

const VIEW_COPY = {
  heatmap: {
    title: "逐小时潮位热图",
    subtitle: "颜色越亮，潮位越高；橙红色单元为异常高水位。",
    hint: "悬停查看潮高 · 点击单元锁定站点与时刻",
  },
  line: {
    title: "站点潮位折线",
    subtitle: "高亮站点的逐小时潮位变化，异常峰值以独立橙红色标出。",
    hint: "悬停查看逐小时潮高 · 点击折线移动剖面时刻",
  },
  profile: {
    title: "站点潮位剖面",
    subtitle: "剖面时刻内各站点潮位对比，高亮站点保持一致。",
    hint: "悬停查看站点潮高 · 点击站点锁定高亮",
  },
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function stationAtIndex(index) {
  return stations[index];
}

function currentHeight(hourIndex, stationIndex) {
  return tideData[hourIndex][stationIndex];
}

function redraw() {
  chart.render(state);
}

function updateStationUI() {
  const station = stationAtIndex(state.stationIndex);
  elements.activeStationName.textContent = station.name;
  elements.activeStationCode.textContent = `${station.code} · ${station.latitude}`;
  elements.focusSwatch.style.background = tideColor(
    currentHeight(state.cursorIndex, state.stationIndex),
  );
  elements.focusSwatch.style.boxShadow = isAnomaly(
    currentHeight(state.cursorIndex, state.stationIndex),
  )
    ? "0 0 12px rgba(255, 118, 80, 0.55)"
    : "0 0 12px rgba(112, 224, 210, 0.4)";

  $$(".station-chip").forEach((button, index) => {
    const active = index === state.stationIndex;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function updateViewUI() {
  const copy = VIEW_COPY[state.view];
  elements.tabs.forEach((tab) => {
    const active = tab.dataset.view === state.view;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-selected", String(active));
    tab.tabIndex = active ? 0 : -1;
    if (active) elements.chartPanel.setAttribute("aria-labelledby", tab.id);
  });

  const station = stationAtIndex(state.stationIndex);
  elements.chartTitle.textContent =
    state.view === "heatmap"
      ? copy.title
      : `${station.name} · ${copy.title}`;
  elements.chartSubtitle.textContent = copy.subtitle;
  elements.chartHint.textContent = copy.hint;
  elements.cursorReadout.textContent = formatTime(state.cursorIndex);
}

function updateWindowUI() {
  const numberOfHours = state.endIndex - state.startIndex + 1;
  const stats = getRangeStats(state.startIndex, state.endIndex);
  const startPercent = (state.startIndex / (WEEK_HOURS - 1)) * 100;
  const widthPercent = ((state.endIndex - state.startIndex) / (WEEK_HOURS - 1)) * 100;

  elements.startRange.value = String(state.startIndex);
  elements.endRange.value = String(state.endIndex);
  elements.startRange.max = String(state.endIndex - RANGE_MIN_HOURS + 1);
  elements.endRange.min = String(state.startIndex + RANGE_MIN_HOURS - 1);
  elements.rangeFill.style.left = `${startPercent}%`;
  elements.rangeFill.style.width = `${widthPercent}%`;
  elements.windowStartLabel.textContent = formatTime(state.startIndex);
  elements.windowEndLabel.textContent = formatTime(state.endIndex);
  elements.windowDuration.textContent = durationLabel(state.startIndex, state.endIndex);
  elements.metricSteps.textContent = String(numberOfHours).padStart(2, "0");
  elements.metricAnomalies.textContent = String(stats.anomalies).padStart(2, "0");
  elements.metricAnomalies.title = `${stats.anomalies} 个异常高水位观测值`;

  elements.presets.forEach((button) => {
    const preset = Number(button.dataset.preset);
    const active = preset === numberOfHours;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });

  elements.canvas.dataset.view = state.view;
  elements.canvas.dataset.windowStart = formatTime(state.startIndex);
  elements.canvas.dataset.windowEnd = formatTime(state.endIndex);
  elements.canvas.dataset.cursor = formatTime(state.cursorIndex);
  elements.canvas.dataset.highlightedStation = stationAtIndex(state.stationIndex).name;
}

function updateAllUI() {
  updateStationUI();
  updateViewUI();
  updateWindowUI();
  redraw();
}

function setView(view) {
  if (!VIEW_COPY[view] || view === state.view) return;
  state.view = view;
  state.hover = null;
  hideTooltip();
  updateAllUI();
}

function setStation(stationIndex) {
  state.stationIndex = clamp(Number(stationIndex), 0, stations.length - 1);
  state.hover = null;
  hideTooltip();
  updateAllUI();
}

function setWindow(startIndex, endIndex, options = {}) {
  const start = clamp(Math.round(startIndex), 0, WEEK_HOURS - RANGE_MIN_HOURS);
  const end = clamp(Math.round(endIndex), start + RANGE_MIN_HOURS - 1, WEEK_HOURS - 1);
  state.startIndex = start;
  state.endIndex = end;
  state.cursorIndex = clamp(state.cursorIndex, start, end);
  if (options.anchorCursor !== false) {
    state.cursorIndex = clamp(state.cursorIndex, start, end);
  }
  state.hover = null;
  hideTooltip();
  updateAllUI();
}

function moveCursor(delta) {
  state.cursorIndex = clamp(
    state.cursorIndex + delta,
    state.startIndex,
    state.endIndex,
  );
  state.hover = null;
  hideTooltip();
  updateAllUI();
}

function buildStationTabs() {
  const fragment = document.createDocumentFragment();
  stations.forEach((station, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "station-chip";
    button.textContent = station.name;
    button.dataset.stationIndex = String(index);
    button.setAttribute("aria-pressed", "false");
    button.title = `${station.name} · ${station.code}`;
    fragment.append(button);
  });
  elements.stationTabs.append(fragment);
}

function buildRangeLabels() {
  const indexes = [0, 24, 48, 72, 96, 120, 144, 167];
  elements.rangeLabels.replaceChildren(
    ...indexes.map((index) => {
      const label = document.createElement("span");
      label.textContent = formatTime(index).slice(0, 5);
      return label;
    }),
  );
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add("is-visible");
  toastTimer = window.setTimeout(() => {
    elements.toast.classList.remove("is-visible");
  }, 2600);
}

function hideTooltip() {
  elements.tooltip.classList.remove("is-visible", "is-anomaly");
  elements.tooltip.setAttribute("aria-hidden", "true");
}

function showTooltip(hit, pointerX, pointerY) {
  const station = stationAtIndex(hit.stationIndex);
  const height = currentHeight(hit.hourIndex, hit.stationIndex);
  const anomaly = isAnomaly(height);
  const difference = height - ANOMALY_THRESHOLD;
  const note = anomaly
    ? `超出阈值 +${difference.toFixed(2)} m`
    : `距异常阈值 ${(ANOMALY_THRESHOLD - height).toFixed(2)} m`;

  elements.tooltip.innerHTML = `
    <div class="tooltip-label">
      <span>${formatTime(hit.hourIndex, true)}</span>
      <b>${anomaly ? "异常高水位" : "常规潮位"}</b>
    </div>
    <div class="tooltip-station">
      <strong>${station.name}</strong>
      <small>${station.code} · ${station.latitude}</small>
    </div>
    <div class="tooltip-value">
      <strong>${height.toFixed(2)}</strong>
      <span>m</span>
    </div>
    <div class="tooltip-note ${anomaly ? "alert" : ""}">${note}</div>
  `;
  elements.tooltip.classList.toggle("is-anomaly", anomaly);
  elements.tooltip.classList.add("is-visible");
  elements.tooltip.setAttribute("aria-hidden", "false");

  const tooltipWidth = elements.tooltip.offsetWidth || 214;
  const tooltipHeight = elements.tooltip.offsetHeight || 118;
  const left = clamp(pointerX + 18, 10, elements.wrap.clientWidth - tooltipWidth - 10);
  const top = clamp(pointerY + 16, 10, elements.wrap.clientHeight - tooltipHeight - 10);
  elements.tooltip.style.left = `${left}px`;
  elements.tooltip.style.top = `${top}px`;
}

function pointerPosition(event) {
  const rect = elements.canvas.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
}

function handlePointerMove(event) {
  const point = pointerPosition(event);
  const hit = chart.hitTest(point.x, point.y, state);
  if (!hit) {
    if (state.hover) {
      state.hover = null;
      redraw();
    }
    hideTooltip();
    return;
  }

  state.hover = hit;
  showTooltip(hit, point.x, point.y);
  window.cancelAnimationFrame(hoverFrame);
  hoverFrame = window.requestAnimationFrame(redraw);
}

function handleCanvasClick(event) {
  const point = pointerPosition(event);
  const hit = chart.hitTest(point.x, point.y, state);
  if (!hit) return;

  if (state.view === "heatmap") {
    state.stationIndex = hit.stationIndex;
    state.cursorIndex = hit.hourIndex;
  } else if (state.view === "line") {
    state.cursorIndex = hit.hourIndex;
  } else {
    state.stationIndex = hit.stationIndex;
  }

  state.hover = null;
  hideTooltip();
  updateAllUI();
}

async function exportCurrentView() {
  elements.exportButton.disabled = true;
  try {
    await document.fonts.ready;
    const offscreen = document.createElement("canvas");
    const exporter = new TideChart(offscreen);
    exporter.render(state, { width: 1600, height: 900, exportMode: true });
    const blob = await new Promise((resolve) => offscreen.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("PNG encoding failed");

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `tidelens-${state.view}-${String(state.startIndex).padStart(3, "0")}-${String(state.endIndex).padStart(3, "0")}.png`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1200);
    showToast(`已导出 ${VIEW_COPY[state.view].title} · 高亮 ${stations[state.stationIndex].name}`);
  } catch (error) {
    showToast(`导出失败：${error.message}`);
  } finally {
    elements.exportButton.disabled = false;
  }
}

function applyPreset(hours) {
  if (hours >= WEEK_HOURS) {
    setWindow(0, WEEK_HOURS - 1);
    return;
  }
  const cursor = clamp(state.cursorIndex, 0, WEEK_HOURS - 1);
  let start = cursor - Math.floor(hours / 2);
  start = clamp(start, 0, WEEK_HOURS - hours);
  setWindow(start, start + hours - 1);
}

elements.tabs.forEach((tab) => {
  tab.addEventListener("click", () => setView(tab.dataset.view));
  tab.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
    event.preventDefault();
    const direction = event.key === "ArrowRight" ? 1 : -1;
    const current = elements.tabs.findIndex((item) => item.dataset.view === state.view);
    const next = (current + direction + elements.tabs.length) % elements.tabs.length;
    setView(elements.tabs[next].dataset.view);
    elements.tabs[next].focus();
  });
});

elements.stationTabs.addEventListener("click", (event) => {
  const button = event.target.closest(".station-chip");
  if (button) setStation(Number(button.dataset.stationIndex));
});

elements.presets.forEach((button) => {
  button.addEventListener("click", () => applyPreset(Number(button.dataset.preset)));
});

elements.cursorPrev.addEventListener("click", () => moveCursor(-1));
elements.cursorNext.addEventListener("click", () => moveCursor(1));
elements.exportButton.addEventListener("click", exportCurrentView);

elements.startRange.addEventListener("input", () => {
  const value = Number(elements.startRange.value);
  setWindow(Math.min(value, state.endIndex - RANGE_MIN_HOURS + 1), state.endIndex);
});

elements.endRange.addEventListener("input", () => {
  const value = Number(elements.endRange.value);
  setWindow(state.startIndex, Math.max(value, state.startIndex + RANGE_MIN_HOURS - 1));
});

elements.canvas.addEventListener("pointermove", handlePointerMove);
elements.canvas.addEventListener("pointerleave", () => {
  state.hover = null;
  hideTooltip();
  redraw();
});
elements.canvas.addEventListener("click", handleCanvasClick);

const resizeObserver = new ResizeObserver(() => {
  window.requestAnimationFrame(() => {
    chart.resize();
    chart.render(state);
  });
});
resizeObserver.observe(elements.wrap);

buildStationTabs();
buildRangeLabels();
updateAllUI();
document.fonts.ready.then(() => chart.render(state));

window.__tidelens = {
  getState: () => ({
    view: state.view,
    startIndex: state.startIndex,
    endIndex: state.endIndex,
    windowStart: formatTime(state.startIndex),
    windowEnd: formatTime(state.endIndex),
    cursorIndex: state.cursorIndex,
    cursor: formatTime(state.cursorIndex),
    stationIndex: state.stationIndex,
    highlightedStation: stations[state.stationIndex].name,
    anomalies: anomalyCount(state.startIndex, state.endIndex),
  }),
  setView,
  setStation,
  setWindow,
  exportCurrentView,
};
