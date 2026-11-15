import { GlassAudio } from "./audio.js";
import { GlassRenderer } from "./renderer.js";
import {
  BASE_STRESS,
  SAFE_PRESSURE,
  SHEET_MM,
  SPEED_LIMIT,
  TOLERANCE_MM,
  assessParts,
  classifyPressure,
  createCut,
  evaluateAssembly,
  finishCut,
  recordCutSample,
} from "./simulation.js";

const canvas = document.querySelector("#glassCanvas");
const canvasFrame = document.querySelector("#canvasFrame");
const audio = new GlassAudio();
const renderer = new GlassRenderer(canvas, canvasFrame);

const ui = {
  pressure: document.querySelector("#pressure"),
  pressureOutput: document.querySelector("#pressureOutput"),
  pressureHint: document.querySelector("#pressureHint"),
  speedReadout: document.querySelector("#speedReadout"),
  deviationReadout: document.querySelector("#deviationReadout"),
  edgeReadout: document.querySelector("#edgeReadout"),
  stressReadout: document.querySelector("#stressReadout"),
  speedBar: document.querySelector("#speedBar"),
  deviationBar: document.querySelector("#deviationBar"),
  edgeBar: document.querySelector("#edgeBar"),
  stressBar: document.querySelector("#stressBar"),
  stageTitle: document.querySelector("#stageTitle"),
  stageStatus: document.querySelector("#stageStatus"),
  statusLabel: document.querySelector("#statusLabel"),
  stageToast: document.querySelector("#stageToast"),
  toastIcon: document.querySelector(".toast-icon"),
  toastCopy: document.querySelector(".toast-copy"),
  startButton: document.querySelector("#startButton"),
  startButtonLabel: document.querySelector("#startButtonLabel"),
  resetButton: document.querySelector("#resetButton"),
  successSample: document.querySelector("#successSample"),
  failureSample: document.querySelector("#failureSample"),
  soundToggle: document.querySelector("#soundToggle"),
  partCount: document.querySelector("#partCount"),
  partCards: [...document.querySelectorAll(".part-card")],
  resultCard: document.querySelector("#resultCard"),
  resultKicker: document.querySelector("#resultKicker"),
  resultTitle: document.querySelector("#resultTitle"),
  resultCopy: document.querySelector("#resultCopy"),
  maxDeviation: document.querySelector("#maxDeviation"),
  edgeGrade: document.querySelector("#edgeGrade"),
  tooltip: document.querySelector("#headTooltip"),
  tooltipSpeed: document.querySelector("#tooltipSpeed"),
  cutChips: [...document.querySelectorAll(".cut-chip")],
  procedureItems: [...document.querySelectorAll(".procedure-item")],
  orderDots: [...document.querySelectorAll(".order-flow b")],
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const formatSpeed = (value) => String(Math.round(value)).padStart(3, "0");
const round = (value) => Math.round(value * 100) / 100;

function createState() {
  return {
    phase: "ready",
    activeCutId: "A",
    cuts: { A: createCut("A"), B: createCut("B") },
    pressure: Number(ui.pressure.value),
    stress: BASE_STRESS,
    currentSpeed: 0,
    cutting: false,
    pointerId: null,
    lastPointerTime: 0,
    head: { visible: true, x: 0, y: 0 },
    headAnchored: true,
    particles: [],
    chips: [],
    separationIndex: 0,
    release: [0, 0, 0],
    releaseTarget: [0, 0, 0],
    result: null,
    resultParts: null,
    sample: null,
    flash: 0,
    shake: 0,
    measureTimer: 0,
    toastTimer: 0,
    lastCrackSound: 0,
    lastChipSpawn: 0,
    lastUiUpdate: 0,
  };
}

let state = createState();
let lastFrame = performance.now();

function toast(title, copy, tone = "safe", duration = 4200) {
  ui.toastCopy.querySelector("strong").textContent = title;
  ui.toastCopy.querySelector("small").textContent = copy;
  ui.stageToast.classList.remove("is-hidden");
  ui.stageToast.classList.toggle("is-danger", tone === "danger");
  state.toastTimer = duration / 1000;
}

function syncHeadFromProgress() {
  if (state.phase !== "ready" && state.phase !== "cutting") {
    state.head.visible = false;
    return;
  }
  const cut = state.cuts[state.activeCutId];
  const metrics = renderer.getMetrics();
  const point = renderer.scorePoint(
    state.activeCutId,
    Math.max(0, Math.min(1, cut.progress)),
    cut,
    metrics.sheet,
  );
  state.head.x = point.x;
  state.head.y = point.y;
  state.head.visible = true;
  state.headAnchored = true;
}

function updateHeadTooltip() {
  if (!state.head.visible) {
    ui.tooltip.classList.remove("is-visible");
    return;
  }
  const rect = canvas.getBoundingClientRect();
  const x = renderer.width ? state.head.x : 0;
  const y = renderer.height ? state.head.y : 0;
  const maxX = Math.max(8, renderer.width - 102);
  const safeX = Math.min(maxX, x + 14);
  const safeY = clamp(y, 20, renderer.height - 20);
  ui.tooltip.style.left = `${safeX}px`;
  ui.tooltip.style.top = `${safeY}px`;
  ui.tooltip.classList.toggle("is-visible", state.cutting || state.phase === "ready");
  ui.tooltip.classList.toggle(
    "is-danger",
    state.pressure > SAFE_PRESSURE.max || state.currentSpeed > SPEED_LIMIT,
  );
  ui.tooltipSpeed.textContent =
    state.cutting ? `${Math.round(state.currentSpeed)} mm/s` : `${state.pressure.toFixed(2)} N`;
  if (rect.width === 0) ui.tooltip.classList.remove("is-visible");
}

function updatePressureUi() {
  const pressure = state.pressure;
  ui.pressureOutput.innerHTML = `${pressure.toFixed(2)} <small>N</small>`;
  const pressureClass = classifyPressure(pressure);
  ui.pressureHint.classList.toggle("is-danger", pressureClass === "danger");
  if (pressureClass === "danger") {
    ui.pressureHint.querySelector(".hint-text").textContent =
      "压力超限，边缘将出现随机崩边";
  } else if (pressureClass === "warning") {
    ui.pressureHint.querySelector(".hint-text").textContent =
      "接近压力上限，保持匀速可降低崩边风险";
  } else {
    ui.pressureHint.querySelector(".hint-text").textContent =
      "推荐 2.05–2.85 N；超过 2.95 N 会崩边";
  }
}

function updateTelemetry(force = false) {
  const now = performance.now();
  if (!force && now - state.lastUiUpdate < 70) return;
  state.lastUiUpdate = now;

  const cutA = state.cuts.A.quality;
  const cutB = state.cuts.B.quality;
  const maxDeviation = Math.max(cutA.maxDeviation, cutB.maxDeviation);
  const chipDamage = cutA.chipDamage + cutB.chipDamage;
  const edgeIntegrity = clamp(100 - chipDamage * 155, 0, 100);
  const stress = clamp(
    BASE_STRESS + maxDeviation * 19 + chipDamage * 22,
    BASE_STRESS,
    99,
  );
  state.stress = round(stress);

  ui.speedReadout.innerHTML = `${formatSpeed(state.currentSpeed)}<small>mm/s</small>`;
  ui.deviationReadout.innerHTML = `${maxDeviation.toFixed(2)}<small>mm</small>`;
  ui.edgeReadout.innerHTML = `${Math.round(edgeIntegrity)}<small>%</small>`;
  ui.stressReadout.innerHTML = `${Math.round(stress)}<small>%</small>`;
  ui.speedBar.style.width = `${clamp((state.currentSpeed / (SPEED_LIMIT * 1.45)) * 100, 0, 100)}%`;
  ui.deviationBar.style.width = `${clamp((maxDeviation / (TOLERANCE_MM * 2.4)) * 100, 0, 100)}%`;
  ui.edgeBar.style.width = `${edgeIntegrity}%`;
  ui.stressBar.style.width = `${stress}%`;
  ui.speedBar.classList.toggle("is-danger", state.currentSpeed > SPEED_LIMIT);
  ui.deviationBar.classList.toggle("is-danger", maxDeviation > TOLERANCE_MM);
  ui.edgeBar.classList.toggle("is-danger", edgeIntegrity < 88);
}

function updateProcedureAndHeader() {
  const cutDone = state.cuts.A.done && state.cuts.B.done;
  const phaseOrder = ["cut", "separate", "measure"];
  let activeIndex = 0;
  if (state.phase === "separate") activeIndex = 1;
  if (state.phase === "measuring" || state.phase === "result") activeIndex = 2;
  if (state.phase === "separate" && state.separationIndex >= 2) activeIndex = 2;

  ui.procedureItems.forEach((item, index) => {
    item.classList.toggle("is-active", index === activeIndex);
    item.classList.toggle("is-done", index < activeIndex || (cutDone && index === 0));
  });

  const labels = {
    ready: ["待机 · 定位切割头", "READY"],
    cutting: [
      state.activeCutId === "A" ? "刻划中 · A 线" : "刻划中 · B 线",
      "SCORING",
    ],
    separate: [
      state.separationIndex >= 3 ? "全片分离 · 等待测量" : "分离中 · 按序轻敲",
      "RELEASE",
    ],
    measuring: ["光学测量 · 公差检验", "MEASURING"],
    result: [state.result?.success ? "检验完成 · 合格" : "检验完成 · 废片", state.result?.success ? "PASS" : "REJECT"],
  };
  const [title, status] = labels[state.phase];
  ui.stageTitle.textContent = title;
  ui.statusLabel.textContent = status;
  ui.stageStatus.classList.toggle("is-live", state.phase === "cutting" || state.phase === "measuring");
  ui.stageStatus.classList.toggle("is-danger", state.phase === "result" && !state.result?.success);

  const cutChipState = state.cuts;
  ui.cutChips.forEach((chip) => {
    const id = chip.dataset.cut;
    chip.classList.toggle("is-active", id === state.activeCutId && state.phase === "cutting");
    chip.classList.toggle("is-done", (id === "A" || id === "B") && cutChipState[id]?.done);
  });

  const buttonLabels = {
    ready: "开始切割",
    cutting: "沿轨迹拖动",
    separate: "按序轻敲",
    measuring: "检验中…",
    result: "再切一片",
  };
  ui.startButtonLabel.textContent = buttonLabels[state.phase];
  ui.startButton.disabled = state.phase === "measuring" || Boolean(state.sample);
}

function updatePartsUi() {
  const released = state.release.filter((value) => value > 0.6).length;
  ui.partCount.textContent = `${released} / 3`;

  ui.partCards.forEach((card, index) => {
    const status = card.querySelector(".part-status");
    const tolerance = card.querySelector(".part-tolerance");
    const track = card.querySelector(".part-track i");
    const part = state.resultParts?.[index];
    card.classList.remove("is-ready", "is-separating", "is-passed", "is-failed", "is-waste");

    if (part) {
      card.classList.add(part.passed ? "is-passed" : "is-failed");
      card.classList.add("is-waste");
      status.textContent = part.passed ? "合格" : "废片";
      tolerance.textContent = `${part.passed ? "±" : "+"}${part.deviation.toFixed(2)} mm`;
      track.style.width = `${part.passed ? 45 + (1 - part.deviation / TOLERANCE_MM) * 50 : 100}%`;
      return;
    }

    if (state.phase === "separate" || state.phase === "measuring") {
      card.classList.add("is-ready");
      status.textContent =
        state.release[index] > 0.6
          ? "已分离"
          : state.separationIndex === index
            ? "待轻敲"
            : "排队中";
      tolerance.textContent = state.release[index] > 0.6 ? "测量中" : "—";
      track.style.width = state.release[index] > 0.6 ? "70%" : "0%";
    } else if (state.cuts.A.done || state.cuts.B.done) {
      status.textContent = "刻划中";
      tolerance.textContent = "—";
      track.style.width = `${(state.cuts.A.progress + state.cuts.B.progress) * 22}%`;
    } else {
      status.textContent = "待分离";
      tolerance.textContent = "—";
      track.style.width = "0%";
    }
  });

  ui.orderDots.forEach((dot, index) => {
    dot.classList.toggle(
      "is-next",
      (state.phase === "separate" || state.phase === "measuring") &&
        index === state.separationIndex,
    );
  });
}

function showResult(result, parts) {
  state.result = result;
  state.resultParts = parts;
  ui.resultCard.hidden = false;
  ui.resultCard.classList.toggle("is-failure", !result.success);
  ui.resultKicker.textContent = result.success ? "ASSEMBLY PASSED" : "PART REJECTED";
  ui.resultTitle.textContent = result.success ? "装配成功" : "检出废片";
  ui.resultCopy.textContent = result.success
    ? "三片均落入 ±0.35 mm 公差带，可以进入装配。"
    : `${result.reason}；${result.passedCount}/3 片合格。`;
  ui.maxDeviation.textContent = `${result.maxDeviation.toFixed(2)} mm`;
  ui.edgeGrade.textContent = result.edgeGrade;
  updatePartsUi();
}

function pointInPolygon(point, polygon) {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const a = polygon[index];
    const b = polygon[previous];
    const intersects =
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y || 0.0001) + a.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

function screenPoint(curveId, t) {
  const metrics = renderer.getMetrics();
  const point = renderer.curvePoint(curveId, t, metrics.sheet);
  return { x: point.x, y: point.y, metrics };
}

function nearestOnCurve(curveId, pointer) {
  const metrics = renderer.getMetrics();
  const points = renderer.curveCache[curveId];
  let nearest = { t: 0, distance: Infinity, x: 0, y: 0 };
  for (const entry of points) {
    const x = metrics.sheet.x + entry.xy[0] * metrics.sheet.w;
    const y = metrics.sheet.y + entry.xy[1] * metrics.sheet.h;
    const distance = Math.hypot(pointer.x - x, pointer.y - y);
    if (distance < nearest.distance) {
      nearest = { t: entry.t, distance, x, y };
    }
  }
  return { ...nearest, metrics };
}

function eventPoint(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * renderer.width,
    y: ((event.clientY - rect.top) / rect.height) * renderer.height,
  };
}

function spawnChips(x, y, count = 4, intensity = 1, color) {
  for (let index = 0; index < count; index += 1) {
    const angle = Math.random() * Math.PI * 2;
    const speed = (20 + Math.random() * 55) * intensity;
    const life = 0.4 + Math.random() * 0.7;
    state.particles.push({
      x: x + (Math.random() - 0.5) * 8,
      y: y + (Math.random() - 0.5) * 8,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 12,
      gravity: 80,
      size: 1.2 + Math.random() * 3.3 * intensity,
      rotation: Math.random() * Math.PI,
      spin: (Math.random() - 0.5) * 12,
      life,
      maxLife: life,
      color: color || "rgba(210, 248, 236, 0.82)",
    });
  }
}

function signalDefect(sampleResult, point) {
  if (!sampleResult.isCritical) return;
  const now = performance.now();
  state.flash = Math.max(state.flash, sampleResult.overSpeed > 0 ? 0.7 : 0.42);
  state.shake = Math.max(state.shake, sampleResult.overSpeed > 0 ? 0.72 : 0.35);
  if (now - state.lastChipSpawn > 115) {
    state.lastChipSpawn = now;
    spawnChips(
      point.x,
      point.y,
      3 + Math.ceil(sampleResult.chipGain * 100),
      0.8 + sampleResult.overSpeed / 500,
      sampleResult.overPressure > 0 ? "rgba(248, 196, 174, 0.9)" : undefined,
    );
  }
  if (now - state.lastCrackSound > 460) {
    state.lastCrackSound = now;
    audio.crack(sampleResult.overSpeed > 0 ? 1.1 : 0.55);
  }
  if (sampleResult.overSpeed > 85) {
    toast("走刀过快 · 断裂偏移", "降低拖动速度至 320 mm/s 以下", "danger", 2300);
  } else if (sampleResult.overPressure > 0) {
    toast("刀压过高 · 边缘崩裂", "将压力调回 2.05–2.85 N 安全区", "danger", 2300);
  }
}

function finishCurrentCut() {
  const cut = state.cuts[state.activeCutId];
  if (cut.done) return;
  finishCut(cut);
  state.cutting = false;
  state.currentSpeed = 0;
  audio.stopScore();
  audio.tone(940, 0.18, 0, "sine", 0.02);

  if (state.activeCutId === "A") {
    state.activeCutId = "B";
    state.headAnchored = true;
    toast("A 线刻划完成", "将切割头移到 B 线顶部，继续沿曲线拖动", "safe", 5200);
  } else {
    state.phase = "separate";
    state.activeCutId = null;
    state.separationIndex = 0;
    state.head.visible = false;
    toast("刻划完成 · 准备分离", "按 1 → 2 → 3 的顺序轻敲裂片", "safe", 5200);
  }
  updatePartsUi();
  updateProcedureAndHeader();
}

function releasePart(index, source = "user") {
  if (state.phase !== "separate") return false;
  if (index !== state.separationIndex) {
    if (source === "user") {
      state.shake = 0.38;
      toast("分离顺序错误", `请先轻敲 ${state.separationIndex + 1} 号裂片`, "danger", 2400);
      audio.crack(0.22);
    }
    return false;
  }

  state.releaseTarget[index] = source === "sample" ? 1 : 0.92;
  state.separationIndex += 1;
  const card = ui.partCards[index];
  card.classList.add("is-separating");
  window.setTimeout(() => card.classList.remove("is-separating"), 500);
  audio.knock(index, source === "sample");
  spawnChips(
    state.head.x || renderer.width * 0.5,
    state.head.y || renderer.height * 0.5,
    2,
    0.35,
  );

  if (state.separationIndex >= 3) {
    state.phase = "measuring";
    state.measureTimer = 0.85;
    state.head.visible = false;
    toast("三片已分离", "正在扫描切口轮廓与公差…", "safe", 2600);
  } else {
    toast(
      `${index + 1} 号裂片已释放`,
      `下一次轻敲 ${state.separationIndex + 1} 号裂片`,
      "safe",
      1900,
    );
  }
  updatePartsUi();
  updateProcedureAndHeader();
  return true;
}

function completeMeasurement() {
  const parts = assessParts(state.cuts, state.stress);
  const result = evaluateAssembly(parts, state.cuts, state.stress);
  state.phase = "result";
  state.sample = null;
  state.pressure = 2.52;
  ui.pressure.disabled = false;
  ui.pressure.value = "2.52";
  updatePressureUi();
  showResult(result, parts);
  if (result.success) {
    toast("公差检验通过", "三片装配件均落入 ±0.35 mm 公差带", "safe", 6000);
    audio.success();
  } else {
    toast("检出废片", result.reason, "danger", 6500);
    audio.fail();
  }
  ui.successSample.disabled = false;
  ui.failureSample.disabled = false;
  updateProcedureAndHeader();
  updateTelemetry(true);
}

function resetStation(showMessage = true) {
  audio.stopScore();
  const pressure = clamp(Number(ui.pressure.value) || 2.52, 1.6, 3.8);
  state = createState();
  state.pressure = pressure;
  ui.pressure.disabled = false;
  ui.resultCard.hidden = true;
  ui.resultCard.classList.remove("is-failure");
  ui.successSample.disabled = false;
  ui.failureSample.disabled = false;
  ui.startButton.disabled = false;
  ui.partCards.forEach((card) => {
    card.className = "part-card";
    card.querySelector(".part-status").textContent = "待分离";
    card.querySelector(".part-tolerance").textContent = "—";
    card.querySelector(".part-track i").style.width = "0%";
  });
  syncHeadFromProgress();
  updateTelemetry(true);
  updatePartsUi();
  updateProcedureAndHeader();
  updatePressureUi();
  if (showMessage) toast("工位已重置", "从 A 线顶部起点拖动切割头", "safe", 2500);
}

function beginManualCut() {
  if (state.phase === "ready") {
    state.phase = "cutting";
    state.activeCutId = "A";
    state.headAnchored = true;
    syncHeadFromProgress();
    toast("切割已就绪", "按住 A 线顶部的切割头，沿虚线向下拖动", "safe", 4000);
  } else if (state.phase === "cutting") {
    toast("沿发光曲线拖动", "保持匀速，压力落在绿色安全区", "safe", 2500);
  } else if (state.phase === "separate") {
    toast("按顺序轻敲", `点击画布中的 ${state.separationIndex + 1} 号裂片`, "safe", 2500);
  } else if (state.phase === "result") {
    resetStation(false);
  }
  updateProcedureAndHeader();
}

function pointerDown(event) {
  if (event.button !== undefined && event.button !== 0) return;
  audio.ensure();
  if (state.sample || state.phase === "measuring" || state.phase === "result") return;
  const point = eventPoint(event);
  if (state.phase === "separate") {
    const polygons = renderer.getPartPolygons();
    const index = polygons.findIndex((polygon) => pointInPolygon(point, polygon));
    if (index >= 0) releasePart(index, "user");
    return;
  }

  if (state.phase === "ready") {
    state.phase = "cutting";
    state.activeCutId = "A";
  }
  const cut = state.cuts[state.activeCutId];
  const nearest = nearestOnCurve(state.activeCutId, point);
  const head = screenPoint(state.activeCutId, cut.progress);
  const start = screenPoint(state.activeCutId, 0);
  const headDistance = Math.hypot(point.x - head.x, point.y - head.y);
  const startDistance = Math.hypot(point.x - start.x, point.y - start.y);
  const atStart = cut.progress < 0.02 && startDistance < 42;
  if (headDistance > 42 && !atStart) {
    toast(
      "未抓住切割头",
      cut.progress < 0.02
        ? `请从 ${state.activeCutId} 线顶部圆形起点开始`
        : "从切割头当前位置继续拖动",
      "danger",
      2500,
    );
    return;
  }

  event.preventDefault();
  state.cutting = true;
  state.pointerId = event.pointerId;
  state.lastPointerTime = performance.now();
  state.currentSpeed = 0;
  state.headAnchored = true;
  canvas.setPointerCapture?.(event.pointerId);
  audio.startScore();
  toast(
    `${state.activeCutId} 线刻划中`,
    "保持稳定压力；速度过大会造成断裂偏移",
    "safe",
    2200,
  );
  updateProcedureAndHeader();
}

function pointerMove(event) {
  if (!state.cutting || state.sample) return;
  const point = eventPoint(event);
  const cut = state.cuts[state.activeCutId];
  const nearest = nearestOnCurve(state.activeCutId, point);
  const now = performance.now();
  const dt = clamp((now - state.lastPointerTime) / 1000, 0.008, 0.08);
  state.lastPointerTime = now;

  const nextProgress = clamp(Math.max(cut.progress, nearest.t), cut.progress, 1);
  const delta = nextProgress - cut.progress;
  if (delta > 0.00025) {
    const speed = (delta * cut.lengthMm) / dt;
    const trackErrorMm =
      nearest.distance * (SHEET_MM.width / nearest.metrics.sheet.w);
    cut.progress = nextProgress;
    const sample = recordCutSample(cut, {
      speed,
      pressure: state.pressure,
      dt,
      trackError: trackErrorMm,
    });
    state.currentSpeed = speed;
    const head = screenPoint(state.activeCutId, cut.progress);
    state.head.x = head.x;
    state.head.y = head.y;
    state.headAnchored = true;
    audio.updateScore(speed, state.pressure, true);
    signalDefect(sample, head);
    if (cut.progress >= 0.992) finishCurrentCut();
  } else {
    state.currentSpeed *= 0.7;
    audio.updateScore(0, state.pressure, true);
  }
}

function pointerUp(event) {
  if (!state.cutting) return;
  state.cutting = false;
  state.pointerId = null;
  state.currentSpeed = 0;
  audio.stopScore();
  canvas.releasePointerCapture?.(event.pointerId);
  const cut = state.cuts[state.activeCutId];
  if (!cut.done) {
    toast(
      "刻划暂停",
      `已刻划 ${Math.round(cut.progress * 100)}%，从切割头处继续拖动`,
      "safe",
      2800,
    );
  }
  updateProcedureAndHeader();
}

function sampleDuration(id, mode, cut) {
  if (mode === "overspeed" && id === "B") return 0.68;
  return cut.lengthMm / (mode === "overspeed" ? 215 : 205);
}

function finishSampleCut(sample) {
  const cut = state.cuts[state.activeCutId];
  finishCurrentCut();
  sample.cutId = state.activeCutId;
  if (state.phase === "separate") {
    sample.separationTimer = 0.62;
    sample.mode === "overspeed"
      ? toast("过速刻划完成", "B 线断裂偏移，正在按序分离以检验废片", "danger", 4200)
      : toast("标准刻划完成", "按顺序轻敲分离三片装配件", "safe", 3600);
  }
}

function updateSample(dt) {
  const sample = state.sample;
  if (!sample) return;

  if (state.phase === "cutting") {
    const cut = state.cuts[state.activeCutId];
    const duration = sampleDuration(state.activeCutId, sample.mode, cut);
    cut.progress = Math.min(1, cut.progress + dt / duration);
    const speed = cut.lengthMm / duration;
    state.currentSpeed = speed;
    state.headAnchored = true;
    const sampleResult = recordCutSample(cut, {
      speed,
      pressure: 2.52,
      dt,
      trackError: sample.mode === "overspeed" && state.activeCutId === "B" ? 4.2 : 1.2,
    });
    audio.updateScore(speed, 2.52, true);
    const head = screenPoint(state.activeCutId, cut.progress);
    state.head.x = head.x;
    state.head.y = head.y;
    signalDefect(sampleResult, head);
    if (cut.progress >= 0.992) finishSampleCut(sample);
    return;
  }

  if (state.phase === "separate") {
    sample.separationTimer -= dt;
    if (sample.separationTimer <= 0 && state.separationIndex < 3) {
      const wait = sample.mode === "overspeed" ? 0.46 : 0.58;
      releasePart(state.separationIndex, "sample");
      sample.separationTimer = wait;
    }
  }
}

function startSample(mode) {
  if (state.sample) return;
  resetStation(false);
  audio.ensure();
  state.sample = {
    mode,
    separationTimer: 0.62,
    startedAt: performance.now(),
  };
  state.phase = "cutting";
  state.activeCutId = "A";
  state.pressure = 2.52;
  ui.pressure.value = "2.52";
  ui.pressure.disabled = true;
  ui.successSample.disabled = true;
  ui.failureSample.disabled = true;
  updatePressureUi();
  updateProcedureAndHeader();
  syncHeadFromProgress();
  audio.startScore();
  if (mode === "overspeed") {
    toast("回放过速废片", "A 线保持标准速度；B 线将以 611 mm/s 超限走刀", "danger", 5200);
  } else {
    toast("回放标准切割", "安全压力 · 205 mm/s 匀速 · 完成后自动分离检验", "safe", 5200);
  }
}

function updateParticles(dt) {
  for (const particle of state.particles) {
    particle.life -= dt;
    particle.vy += particle.gravity * dt;
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.rotation += particle.spin * dt;
  }
  state.particles = state.particles.filter((particle) => particle.life > 0);
}

function updateRelease(dt) {
  const ease = Math.min(1, dt * 7.5);
  state.release = state.release.map((value, index) => {
    const target = state.releaseTarget[index];
    const next = value + (target - value) * ease;
    return Math.abs(target - next) < 0.004 ? target : next;
  });
}

function updateEnvironment(dt) {
  state.flash = Math.max(0, state.flash - dt * 2.5);
  state.shake = Math.max(0, state.shake - dt * 2.1);
  if (!state.cutting && !state.sample) {
    state.currentSpeed *= Math.exp(-dt * 7);
    if (state.currentSpeed < 0.4) state.currentSpeed = 0;
  }
  if (state.toastTimer > 0) {
    state.toastTimer -= dt;
    if (state.toastTimer <= 0) ui.stageToast.classList.add("is-hidden");
  }
  if (state.phase === "measuring") {
    state.measureTimer -= dt;
    if (state.measureTimer <= 0) completeMeasurement();
  }
}

function frame(now) {
  const dt = clamp((now - lastFrame) / 1000, 0.001, 0.05);
  lastFrame = now;
  updateSample(dt);
  updateEnvironment(dt);
  updateParticles(dt);
  updateRelease(dt);

  if (state.headAnchored && (state.phase === "ready" || state.phase === "cutting")) {
    syncHeadFromProgress();
  }
  if (!["ready", "cutting"].includes(state.phase)) {
    state.head.visible = false;
  }
  updateHeadTooltip();
  updateTelemetry();
  updatePartsUi();
  renderer.render(state, now);
  requestAnimationFrame(frame);
}

ui.pressure.addEventListener("input", () => {
  state.pressure = Number(ui.pressure.value);
  updatePressureUi();
});

ui.startButton.addEventListener("click", () => {
  audio.ensure();
  beginManualCut();
});

ui.resetButton.addEventListener("click", () => resetStation(true));

ui.successSample.addEventListener("click", () => startSample("success"));
ui.failureSample.addEventListener("click", () => startSample("overspeed"));

ui.soundToggle.addEventListener("click", async () => {
  const enabled = ui.soundToggle.getAttribute("aria-pressed") !== "true";
  ui.soundToggle.setAttribute("aria-pressed", String(enabled));
  ui.soundToggle.classList.toggle("is-muted", !enabled);
  audio.setEnabled(enabled);
  if (enabled) await audio.ensure();
});

canvas.addEventListener("pointerdown", pointerDown);
canvas.addEventListener("pointermove", pointerMove);
canvas.addEventListener("pointerup", pointerUp);
canvas.addEventListener("pointercancel", pointerUp);
canvas.addEventListener("contextmenu", (event) => event.preventDefault());

window.addEventListener("blur", () => {
  if (!state.cutting) return;
  state.cutting = false;
  state.currentSpeed = 0;
  audio.stopScore();
  updateProcedureAndHeader();
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") resetStation(true);
});

window.addEventListener("resize", () => {
  if (state.headAnchored) syncHeadFromProgress();
});

resetStation(false);
syncHeadFromProgress();
toast("引导曲线已校准", "按住 A 线顶部切割头，保持匀速沿虚线拖动", "safe", 5200);
requestAnimationFrame(frame);
