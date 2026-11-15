import { GreenhouseSimulation, CONFIG } from "./simulation.js";
import { GreenhouseRenderer } from "./renderer.js";
import { MoonAudio } from "./audio.js";

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const canvas = $("#greenhouseCanvas");
const audio = new MoonAudio();
const renderer = new GreenhouseRenderer(canvas);
const sim = new GreenhouseSimulation({ onEvent: handleEvent });

const ui = {
  phaseBanner: $("#phaseBanner"),
  phaseKicker: $(".phase-kicker"),
  phaseTitle: $("#phaseTitle"),
  phaseDetail: $("#phaseDetail"),
  cycleLabel: $("#cycleLabel"),
  oxygenValue: $("#oxygenValue"),
  oxygenTrend: $("#oxygenTrend"),
  waterValue: $("#waterValue"),
  waterTrend: $("#waterTrend"),
  tempValue: $("#tempValue"),
  heatTrend: $("#heatTrend"),
  co2Value: $("#co2Value"),
  co2Trend: $("#co2Trend"),
  pantryValue: $("#pantryValue"),
  seedValue: $("#seedValue"),
  batchLabel: $("#batchLabel"),
  growthValue: $("#growthValue"),
  growthBar: $("#growthBar"),
  vigorValue: $("#vigorValue"),
  yieldValue: $("#yieldValue"),
  stressValue: $("#stressValue"),
  lightValue: $("#lightValue"),
  nutrientValue: $("#nutrientValue"),
  tempControlValue: $("#tempControlValue"),
  co2ControlValue: $("#co2ControlValue"),
  pumpCard: $(".pump-card"),
  pumpState: $("#pumpState"),
  pumpHint: $("#pumpHint"),
  pumpBtn: $("#pumpBtn"),
  primaryBtn: $("#primaryBtn"),
  primaryLabel: $("#primaryLabel"),
  primaryMeta: $("#primaryMeta"),
  systemNote: $("#systemNote"),
  toast: $("#toast"),
  completionOverlay: $("#completionOverlay"),
  completionStats: $("#completionStats"),
  captionHint: $("#captionHint"),
};

const controls = {
  light: $("#lightControl"),
  nutrient: $("#nutrientControl"),
  temp: $("#tempControl"),
  co2: $("#co2Control"),
};

let speed = 1;
let lastFrame = performance.now();
let audioInitPromise = null;
let toastTimer = 0;
let completionShown = false;
let lastUiUpdate = 0;

function showToast(message, severity = "info", duration = 3600) {
  clearTimeout(toastTimer);
  ui.toast.textContent = message;
  ui.toast.className = `toast visible ${severity === "danger" ? "danger" : severity === "warn" ? "warn" : ""}`;
  toastTimer = window.setTimeout(() => {
    ui.toast.className = "toast";
  }, duration);
}

function handleEvent(event) {
  if (event.type === "overheat") {
    showToast(event.message, "danger", 5200);
    audio.playWarning();
  } else if (event.type === "critical") {
    showToast(event.message, "danger", 5000);
    audio.playCritical();
  } else if (event.type === "recovered") {
    showToast(event.message, "info");
  } else if (event.type === "harvest") {
    showToast(event.message, "success", 4200);
    audio.playHarvest();
  } else if (event.type === "complete") {
    showToast(event.message, "success", 5600);
  } else if (event.type === "plant") {
    audio.playPlant();
  } else if (["warn", "danger"].includes(event.severity)) {
    showToast(event.message, event.severity, 4200);
  }
}

function wakeAudio() {
  if (!audioInitPromise) {
    audioInitPromise = (async () => {
      try {
        await audio.ensureStarted();
        audio.setPump(sim.state.pumpOn);
        audio.setMuted($("#audioToggle").getAttribute("aria-pressed") === "false");
      } catch (error) {
        console.warn("Web Audio unavailable", error);
      }
    })();
  }
  return audioInitPromise;
}

function formatClock(hours) {
  const normalized = (hours + 24) % 24;
  const whole = Math.floor(normalized);
  const minutes = Math.floor((normalized - whole) * 60);
  return `${String(whole).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function setText(element, text) {
  if (element && element.textContent !== text) element.textContent = text;
}

function setOptimal(element, value, ideal, tolerance) {
  element.classList.toggle("optimal", Math.abs(value - ideal) <= tolerance);
}

function estimateYield() {
  const state = sim.state;
  if (state.phase === "ready") {
    const quality = sim.getAverageQuality();
    return clamp(3.1 + 3.9 * quality - state.heatStress / 210, 2.4, 7.2);
  }
  if (state.phase === "growing") {
    const quality = Math.max(state.quality, sim.computeQuality().value);
    return clamp(3.1 + 3.9 * quality - state.heatStress / 210, 2.4, 7.2);
  }
  return null;
}

function updateRoundNodes(state) {
  $$(".round-node").forEach((node, index) => {
    const completed = index < state.harvests.length;
    const active = !completed && index === state.round - 1 && state.phase !== "complete";
    node.classList.toggle("done", completed);
    node.classList.toggle("active", active);
    const small = node.querySelector("small");
    if (completed) {
      small.textContent = "已收获";
    } else if (active) {
      small.textContent = state.phase === "ready"
        ? "可收获"
        : state.phase === "growing"
          ? "培育中"
          : "待播种";
    } else {
      small.textContent = "待留种";
    }
  });
}

function updatePhaseBanner(state) {
  const hidden = state.phase === "growing" || state.phase === "complete";
  ui.phaseBanner.classList.toggle("hidden", hidden);
  ui.phaseKicker.textContent = `任务 ${String(state.round).padStart(2, "0")} / 03`;

  if (state.phase === "idle") {
    ui.phaseTitle.textContent = "等待播种";
    ui.phaseDetail.textContent = "初始种薯已装载。先校准光照、营养、温控与 CO₂，再启动第一批。";
  } else if (state.phase === "interplant") {
    ui.phaseTitle.textContent = `第 ${state.round} 批待播种`;
    const previous = state.harvests[state.harvests.length - 1];
    ui.phaseDetail.textContent = `第 ${state.round - 1} 批已收获 ${previous.yieldKg.toFixed(1)} kg，其中 0.8 kg 已留种。库存交接完成。`;
  } else if (state.phase === "ready") {
    const estimate = estimateYield();
    ui.phaseTitle.textContent = `第 ${state.round} 批土豆成熟`;
    ui.phaseDetail.textContent = `当前可收获约 ${estimate.toFixed(1)} kg。必须预留 0.8 kg 作下一轮种薯。`;
  }
}

function updatePrimaryAction(state) {
  ui.primaryBtn.classList.remove("harvest");
  ui.primaryBtn.disabled = false;

  if (state.phase === "idle") {
    ui.primaryLabel.textContent = "播种第 1 批";
    ui.primaryMeta.textContent = "消耗种薯 1 枚 · 水培床已就绪";
  } else if (state.phase === "interplant") {
    ui.primaryLabel.textContent = `播种第 ${state.round} 批`;
    ui.primaryMeta.textContent = "种薯库存 1 枚 · 上轮留种已入库";
  } else if (state.phase === "growing") {
    ui.primaryBtn.disabled = true;
    ui.primaryLabel.textContent = `培育中 · ${state.growth.toFixed(0)}%`;
    ui.primaryMeta.textContent = state.phase === "growing"
      ? "环境参数可随时调整"
      : "";
  } else if (state.phase === "ready") {
    ui.primaryBtn.classList.add("harvest");
    ui.primaryLabel.textContent = `收获第 ${state.round} 批 + 留种`;
    ui.primaryMeta.textContent = "预留 0.8 kg 种薯后入库";
  } else if (state.phase === "complete") {
    ui.primaryBtn.disabled = true;
    ui.primaryLabel.textContent = "三季闭环完成";
    ui.primaryMeta.textContent = "最终种薯库存已保留";
  }
}

function updateMetrics(state) {
  const light = sim.getLightState();
  const oxygenMetric = $(".metric.oxygen");
  const waterMetric = $(".metric.water");
  const heatMetric = $(".metric.heat");
  const co2Metric = $(".metric.co2");

  setText(ui.oxygenValue, `${state.oxygenPct.toFixed(2)}%`);
  setText(
    ui.oxygenTrend,
    light.isLight && state.phase !== "idle" ? "光合作用放氧中" : state.phase === "idle" ? "循环待机" : "暗呼吸耗氧中",
  );
  setText(ui.waterValue, `${state.waterL.toFixed(1)} L`);
  setText(ui.waterTrend, `已回收 ${state.waterRecovered.toFixed(1)} L`);
  setText(ui.tempValue, `${state.tempC.toFixed(1)}°`);
  setText(
    ui.heatTrend,
    state.tempC >= CONFIG.thresholds.overheat
      ? "热区告警"
      : state.pumpOn
        ? "循环泵散热中"
        : "泵机停机 · 聚热",
  );
  setText(ui.co2Value, `${Math.round(state.co2Ppm)} ppm`);
  setText(
    ui.co2Trend,
    state.co2Ppm < 430
      ? "浓度偏低"
      : light.isLight && state.phase !== "idle"
        ? "作物吸收中"
        : "呼吸释放中",
  );
  setText(ui.pantryValue, `${state.pantryKg.toFixed(1)} kg`);
  setText(ui.seedValue, `种薯库存 ${state.seedStock} 枚`);

  oxygenMetric.classList.toggle("warning", state.oxygenPct < CONFIG.thresholds.oxygenLow);
  waterMetric.classList.toggle("warning", state.waterL < CONFIG.thresholds.waterLow);
  heatMetric.classList.toggle("hot", state.tempC >= CONFIG.thresholds.overheat);
  heatMetric.classList.toggle("warning", state.tempC >= CONFIG.thresholds.overheat);
  co2Metric.classList.toggle("warning", state.co2Ppm < 430);
  ui.cycleLabel.textContent = `${light.isLight ? "昼" : "夜"} ${formatClock(state.cycleHours)}`;
  ui.captionHint.textContent = state.tempC >= CONFIG.thresholds.overheat
    ? `热区 ${state.tempC.toFixed(1)}°C · 低重力散热不足`
    : `低重力散热效率仅为地表的 38% · ${state.pumpOn ? "泵机运行" : "泵机停机"}`;
}

function updateCultivation(state) {
  const phaseNames = {
    idle: "种薯待激活",
    growing: "培育中",
    ready: "等待收获",
    interplant: "等待下一批",
    complete: "三季完成",
  };
  setText(ui.batchLabel, `批次 0${state.round} · ${phaseNames[state.phase]}`);
  setText(ui.growthValue, `${Math.round(state.growth)}%`);
  ui.growthBar.style.width = `${state.growth}%`;

  const active = ["growing", "ready"].includes(state.phase);
  const quality = active ? Math.max(state.quality, sim.computeQuality().value) : 0;
  setText(ui.vigorValue, active ? `${Math.round(quality * 100)}%` : "--");
  const estimate = estimateYield();
  setText(ui.yieldValue, estimate ? `${estimate.toFixed(1)} kg` : "--");
  setText(ui.stressValue, `${Math.round(state.heatStress)}%`);
  ui.stressValue.style.color = state.heatStress > 35 ? "var(--danger)" : "";
}

function updateControls(state) {
  setText(ui.lightValue, `${state.controls.light} h`);
  setText(ui.nutrientValue, `${state.controls.nutrient.toFixed(2)} EC`);
  setText(ui.tempControlValue, `${state.controls.temp}°C`);
  setText(ui.co2ControlValue, `${state.controls.co2} ppm`);
  setOptimal(ui.lightValue, state.controls.light, 16, 2);
  setOptimal(ui.nutrientValue, state.controls.nutrient, 1.9, 0.3);
  setOptimal(ui.tempControlValue, state.controls.temp, 21, 2);
  setOptimal(ui.co2ControlValue, state.controls.co2, 850, 150);

  ui.pumpCard.classList.toggle("running", state.pumpOn);
  ui.pumpBtn.setAttribute("aria-pressed", String(state.pumpOn));
  setText(ui.pumpState, state.pumpOn ? "运行中" : "已停机");
  setText(ui.pumpHint, state.pumpOn ? "冷却效率 +58% · 耗水 0.01 L/s" : "散热受阻 · 热区持续积聚");
  ui.pumpBtn.querySelector("b").textContent = state.pumpOn ? "ON" : "OFF";
}

function updateSystemNote(state) {
  const noteText = ui.systemNote.querySelector("p");
  ui.systemNote.classList.toggle("danger", state.tempC >= CONFIG.thresholds.overheat);
  if (state.tempC >= CONFIG.thresholds.overheat) {
    noteText.textContent = `热区告警：舱温 ${state.tempC.toFixed(1)}°C。启动循环泵并降低温控目标，避免块茎停止膨大。`;
  } else if (!state.pumpOn) {
    noteText.textContent = "循环泵已停机，低重力下废热无法及时离开灯阵。重新开启泵机可恢复冷却。";
  } else if (state.phase === "ready") {
    noteText.textContent = "作物已成熟。收获会扣除 0.8 kg 种薯库存留给下一批，其余进入食用库存。";
  } else {
    noteText.textContent = "月面辐射散热慢于地表。热成像用于定位泵机与灯阵的热区。";
  }
}

function renderCompletion() {
  const summary = sim.getSummary();
  const stats = [
    ["收获批次", `${summary.rounds} / 3`],
    ["总产量", `${summary.totalYieldKg.toFixed(1)} kg`],
    ["食用库存", `${summary.pantryKg.toFixed(1)} kg`],
    ["预留种薯", `${summary.seedStock} 枚`],
    ["最终 O₂", `${summary.oxygenPct.toFixed(2)}%`],
    ["过热告警", `${summary.overheatAlerts} 次`],
  ];
  ui.completionStats.innerHTML = stats
    .map(([label, value]) => `<div><small>${label}</small><b>${value}</b></div>`)
    .join("");
  completionShown = true;
  ui.completionOverlay.classList.add("visible");
}

function updateUI() {
  const state = sim.state;
  updateRoundNodes(state);
  updatePhaseBanner(state);
  updatePrimaryAction(state);
  updateMetrics(state);
  updateCultivation(state);
  updateControls(state);
  updateSystemNote(state);
  if (state.phase === "complete" && !completionShown) renderCompletion();
}

async function primaryAction() {
  await wakeAudio();
  const state = sim.state;
  if (state.phase === "idle" || state.phase === "interplant") {
    sim.startRound();
  } else if (state.phase === "ready") {
    sim.harvest();
  }
  updateUI();
}

function setSpeed(value) {
  speed = clamp(Number(value) || 1, 1, 4);
  $$(".speed-control button").forEach((button) => {
    button.classList.toggle("active", Number(button.dataset.speed) === speed);
  });
}

function resetGame() {
  sim.reset();
  completionShown = false;
  ui.completionOverlay.classList.remove("visible");
  setSpeed(1);
  for (const [key, input] of Object.entries(controls)) {
    input.value = String(sim.state.controls[key]);
  }
  audio.setPump(sim.state.pumpOn);
  updateUI();
  renderer.render(sim, performance.now() / 1000);
}

ui.primaryBtn.addEventListener("click", primaryAction);

ui.pumpBtn.addEventListener("click", async () => {
  await wakeAudio();
  sim.togglePump();
  audio.setPump(sim.state.pumpOn);
  updateUI();
});

$$(".speed-control button").forEach((button) => {
  button.addEventListener("click", () => setSpeed(button.dataset.speed));
});

Object.entries(controls).forEach(([key, input]) => {
  input.addEventListener("input", () => {
    sim.setControl(key, input.value);
    updateUI();
  });
});

$("#heatToggle").addEventListener("click", () => {
  renderer.heatEnabled = !renderer.heatEnabled;
  $("#heatToggle").setAttribute("aria-pressed", String(renderer.heatEnabled));
});

$("#audioToggle").addEventListener("click", async () => {
  await wakeAudio();
  const button = $("#audioToggle");
  const enabled = button.getAttribute("aria-pressed") !== "false";
  button.setAttribute("aria-pressed", String(!enabled));
  button.querySelector(".audio-label").textContent = enabled ? "环境声静音" : "环境声开启";
  audio.setMuted(enabled);
  showToast(enabled ? "Web Audio 环境声已静音。" : "Web Audio 泵机与环境声已恢复。");
});

$("#restartBtn").addEventListener("click", resetGame);

window.addEventListener("pointerdown", wakeAudio, { once: true, passive: true });

function frame(now) {
  const realDt = Math.min(0.12, (now - lastFrame) / 1000);
  lastFrame = now;

  if (sim.state.phase === "growing") {
    sim.advance(realDt * speed, 1 / 30);
  }
  renderer.render(sim, now / 1000);

  if (now - lastUiUpdate > 110) {
    updateUI();
    audio.setTemperature(sim.state.tempC);
    lastUiUpdate = now;
  }
  requestAnimationFrame(frame);
}

window.moonGame = {
  sim,
  renderer,
  audio,
  startRound: () => sim.startRound(),
  harvest: () => sim.harvest(),
  setControl: (key, value) => sim.setControl(key, value),
  togglePump: (force) => sim.togglePump(force),
  setSpeed,
  advance(seconds) {
    sim.advance(seconds, 1 / 30);
    updateUI();
    renderer.render(sim, performance.now() / 1000);
    return sim.state;
  },
  get summary() {
    return sim.getSummary();
  },
};

updateUI();
renderer.render(sim, performance.now() / 1000);
requestAnimationFrame(frame);
