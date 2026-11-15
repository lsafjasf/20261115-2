import { AudioEngine } from "./audio.js";
import { SceneRenderer, GEOMETRY } from "./scene.js";
import {
  windAt,
  windSamples,
  windowInfo,
  swayFor,
  STORM_THRESHOLD,
  STORM_GRACE_SECONDS,
} from "./wind.js";

const LOCK_ANGLE = 3.2;
const TARGET_LIFT = 70;
const LIFT_TOLERANCE = 6;
const DOCK_TARGET = 82;
const DOCK_TOLERANCE = 5;
const EXPOSED_PHASES = new Set(["transfer", "tower", "locked", "repairing", "retreat", "returning", "returnReady"]);

const $ = (selector) => document.querySelector(selector);
const dom = {
  canvas: $("#scene"),
  missionTag: $("#missionTag"),
  missionClock: $("#missionClock"),
  audioBtn: $("#audioBtn"),
  audioLabel: $("#audioLabel"),
  audioBars: [...document.querySelectorAll("#audioBars i")],
  windValue: $("#windValue"),
  windArrow: $("#windArrow"),
  windWindow: $("#windWindow"),
  windState: $("#windState"),
  windMargin: $("#windMargin"),
  windChart: $("#windChart"),
  limitReadout: $("#limitReadout"),
  eventBanner: $("#eventBanner"),
  eventText: $("#eventText"),
  phaseLabel: $("#phaseLabel"),
  steps: [...document.querySelectorAll("#steps li")],
  boatState: $("#boatState"),
  boatRange: $("#boatRange"),
  boatReadout: $("#boatReadout"),
  dockBtn: $("#dockBtn"),
  liftState: $("#liftState"),
  liftRange: $("#liftRange"),
  liftReadout: $("#liftReadout"),
  swayNeedle: $("#swayNeedle"),
  swayReadout: $("#swayReadout"),
  lockBtn: $("#lockBtn"),
  repairBtn: $("#repairBtn"),
  repairLabel: $("#repairBtn span"),
  repairProgress: $("#repairProgress"),
  lowerBtn: $("#lowerBtn"),
  returnBtn: $("#returnBtn"),
  limitSwitch: $("#limitSwitch"),
  limitButtons: [...document.querySelectorAll("#limitSwitch button")],
  windowHint: $("#windowHint"),
  windowStatus: $("#windowStatus"),
  windowStatusText: $("#windowStatusText"),
  nextWindow: $("#nextWindow"),
  windScaleMark: $("#windScaleMark"),
  toast: $("#toast"),
  resultLayer: $("#resultLayer"),
  resultCard: document.querySelector(".result-card"),
  resultKicker: $("#resultKicker"),
  resultSeal: $("#resultSeal"),
  resultTitle: $("#resultTitle"),
  resultText: $("#resultText"),
  resultTime: $("#resultTime"),
  resultWind: $("#resultWind"),
  restartBtn: $("#restartBtn"),
};

const renderer = new SceneRenderer(dom.canvas);
const audio = new AudioEngine();
const chartContext = dom.windChart.getContext("2d");

let toastTimer = 0;
let bannerTimer = 0;
let lastUiUpdate = 0;
let lastPhase = "";
let lastAudioMeterUpdate = 0;
let lastWindowOpen = true;

function initialState() {
  return {
    phase: "approach",
    clock: 0,
    time: 0,
    elapsed: 0,
    wind: windAt(0),
    windLimit: 10,
    windOverride: null,
    boatPosition: 40,
    boatWorldX: 592,
    boatAligned: false,
    docked: false,
    transferProgress: 0,
    crewOnBoat: true,
    lift: 0,
    liftTarget: 0,
    liftVelocity: 0,
    motorActive: false,
    sway: 0,
    armExtend: 0,
    locked: false,
    repaired: false,
    repairHeld: false,
    repairProgress: 0,
    returnProgress: 0,
    stormExposure: 0,
    ended: false,
    result: null,
  };
}

let state = initialState();

function currentWind() {
  return state.windOverride ?? windAt(state.clock);
}

function boatWorldFromPercent(percent) {
  return 320 + percent * 6.8;
}

function isWindowOpen() {
  return state.wind <= state.windLimit;
}

function isExposed() {
  return EXPOSED_PHASES.has(state.phase);
}

function formatTime(seconds) {
  const whole = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(whole / 60)).padStart(2, "0")}:${String(whole % 60).padStart(2, "0")}`;
}

function showToast(message, type = "", duration = 2600) {
  window.clearTimeout(toastTimer);
  dom.toast.textContent = message;
  dom.toast.className = `toast show ${type}`;
  toastTimer = window.setTimeout(() => {
    dom.toast.className = "toast";
  }, duration);
}

function showBanner(message, type = "", duration = 3600) {
  window.clearTimeout(bannerTimer);
  dom.eventText.textContent = message;
  dom.eventBanner.className = `event-banner visible ${type}`;
  bannerTimer = window.setTimeout(() => {
    dom.eventBanner.className = "event-banner";
  }, duration);
}

function phaseCopy() {
  return {
    approach: ["船员在船 · 待命", "靠泊塔基"],
    transfer: ["人员转移中", "人员登塔"],
    tower: ["甲板已清空 · 升降作业", "升降平台"],
    locked: ["平台锁定 · 可检修", "叶尖修复"],
    repairing: ["复合材料固化中", "叶尖修复"],
    retreat: ["修复完成 · 平台撤离", "平台撤离"],
    returning: ["人员撤回塔基", "人员撤回"],
    returnReady: ["塔基安全 · 等待登船", "准备返船"],
    success: ["全员安全返船", "任务完成"],
    failed: ["任务中止", "强风中止"],
  }[state.phase];
}

function setActiveStep(step, status, copy) {
  const element = dom.steps.find((item) => item.dataset.step === step);
  if (!element) return;
  element.classList.toggle("active", status === "active");
  element.classList.toggle("done", status === "done");
  if (copy) element.querySelector("em").textContent = copy;
}

function updateStepUI() {
  const phase = state.phase;
  const dockDone = ["tower", "locked", "repairing", "retreat", "returning", "returnReady", "success"].includes(phase);
  const liftDone = ["locked", "repairing", "retreat", "returning", "returnReady", "success"].includes(phase);
  const repairDone = state.repaired;
  const returnDone = phase === "success";

  setActiveStep("dock", dockDone ? "done" : (phase === "approach" || phase === "transfer" ? "active" : ""), dockDone ? "已靠泊" : (phase === "transfer" ? "转移中" : "待执行"));
  setActiveStep("lift", liftDone ? "done" : (phase === "tower" ? "active" : ""), liftDone ? "已锁定" : (phase === "tower" ? "升至 70%" : "待执行"));
  setActiveStep("repair", repairDone ? "done" : (phase === "locked" || phase === "repairing" ? "active" : ""), repairDone ? "已修复" : (phase === "repairing" ? `${Math.round(state.repairProgress * 100)}%` : "待执行"));
  setActiveStep("return", returnDone ? "done" : (["retreat", "returning", "returnReady"].includes(phase) ? "active" : ""), returnDone ? "已返船" : (phase === "retreat" ? "降至塔基" : (phase === "returning" ? "撤离中" : "待执行")));

  const copy = phaseCopy();
  dom.missionTag.textContent = copy[0];
  dom.phaseLabel.textContent = copy[1];
  dom.missionClock.textContent = formatTime(state.elapsed);
}

function updateBoatUI() {
  const distance = Math.abs(state.boatPosition - DOCK_TARGET);
  state.boatAligned = distance <= DOCK_TOLERANCE;
  dom.boatRange.value = state.boatPosition;
  dom.boatReadout.textContent = `${Math.round(state.boatPosition)}%`;
  dom.boatState.textContent = state.boatAligned ? "已进入靠泊窗" : `距靠泊窗 ${Math.round(distance * 5)} m`;
  dom.boatRange.disabled = state.phase !== "approach";
  dom.dockBtn.disabled = state.phase !== "approach" || !state.boatAligned || !isWindowOpen();
}

function updatePlatformUI() {
  const windowOpen = isWindowOpen();
  const inHeight = Math.abs(state.lift - TARGET_LIFT) <= LIFT_TOLERANCE;
  const inSway = Math.abs(state.sway) <= LOCK_ANGLE;
  const canLock = state.phase === "tower" && inHeight && inSway && windowOpen;

  dom.liftRange.value = state.liftTarget;
  dom.liftReadout.textContent = `${Math.round(state.lift)}%`;
  dom.swayReadout.textContent = `${Math.abs(state.sway).toFixed(1)}°`;
  dom.swayNeedle.style.left = `${50 + Math.max(-30, Math.min(30, state.sway / 5 * 30))}%`;
  dom.swayNeedle.className = inSway ? "safe" : (Math.abs(state.sway) > 5 ? "danger" : "");

  dom.liftRange.disabled = !["tower", "retreat"].includes(state.phase)
    || (state.phase === "tower" && !windowOpen);
  dom.lockBtn.disabled = !canLock;
  dom.lockBtn.classList.toggle("ready", canLock);
  dom.lockBtn.textContent = state.locked ? "平台已锁定" : "锁定平台";

  dom.repairBtn.disabled = !["locked", "repairing"].includes(state.phase) || state.repaired;
  dom.repairBtn.classList.toggle("holding", state.repairHeld);
  dom.repairProgress.textContent = `${Math.round(state.repairProgress * 100)}%`;
  if (state.phase === "repairing" && !windowOpen) dom.repairLabel.textContent = "风窗关闭 · 暂停";
  else if (state.phase === "repairing") dom.repairLabel.textContent = "检修中";
  else dom.repairLabel.textContent = "按住检修";

  dom.lowerBtn.disabled = state.phase !== "retreat";
  if (state.phase === "retreat") {
    dom.lowerBtn.disabled = state.lift <= 1.5;
    dom.returnBtn.disabled = state.lift > 2;
    dom.returnBtn.textContent = "人员撤回塔基";
  } else if (state.phase === "returnReady") {
    dom.returnBtn.disabled = false;
    dom.returnBtn.textContent = "登船返航";
  } else {
    dom.returnBtn.disabled = true;
    dom.returnBtn.textContent = "返回船舱";
  }

  let liftText = "卷扬机待命";
  if (state.phase === "tower") {
    if (state.motorActive) liftText = "卷扬机运行";
    else if (inHeight) liftText = "检修高度 · 等待锁止";
    else liftText = "调整至 64–76%";
  } else if (state.locked) liftText = "机械锁止";
  else if (state.phase === "repairing") liftText = "修复作业中";
  else if (state.phase === "retreat") liftText = "撤离下降";
  else if (["returning", "returnReady"].includes(state.phase)) liftText = "人员已撤回";
  dom.liftState.textContent = liftText;
}

function drawWindChart() {
  const width = dom.windChart.clientWidth;
  const height = dom.windChart.clientHeight;
  if (!width || !height) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  if (dom.windChart.width !== Math.round(width * dpr)) {
    dom.windChart.width = Math.round(width * dpr);
    dom.windChart.height = Math.round(height * dpr);
  }
  const ctx = chartContext;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const samples = windSamples(state.clock, 30, 0.5);
  const maxWind = 26;
  ctx.strokeStyle = "rgba(155, 190, 192, 0.12)";
  ctx.lineWidth = 1;
  for (let row = 0; row < 3; row += 1) {
    const y = 5 + row * 17;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  const limitY = 44 - (state.windLimit / maxWind) * 40;
  ctx.strokeStyle = "rgba(255, 154, 61, 0.48)";
  ctx.setLineDash([3, 4]);
  ctx.beginPath();
  ctx.moveTo(0, limitY);
  ctx.lineTo(width, limitY);
  ctx.stroke();
  ctx.setLineDash([]);

  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, "rgba(142, 219, 226, 0.28)");
  gradient.addColorStop(1, "rgba(142, 219, 226, 0)");
  ctx.beginPath();
  samples.forEach((sample, index) => {
    const x = sample.offset / 30 * width;
    const y = 44 - sample.speed / maxWind * 40;
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.lineTo(width, 48);
  ctx.lineTo(0, 48);
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();

  ctx.beginPath();
  samples.forEach((sample, index) => {
    const x = sample.offset / 30 * width;
    const y = 44 - sample.speed / maxWind * 40;
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = "#8edbe2";
  ctx.lineWidth = 1.2;
  ctx.stroke();

  ctx.fillStyle = "#ffb45f";
  ctx.beginPath();
  ctx.arc(1, 44 - samples[0].speed / maxWind * 40, 2.4, 0, Math.PI * 2);
  ctx.fill();
}

function updateWindUI() {
  const wind = state.wind;
  const info = windowInfo(state.clock, state.windLimit);
  const open = isWindowOpen();
  dom.windValue.textContent = wind.toFixed(1);
  dom.windMargin.textContent = open
    ? `余量 ${(state.windLimit - wind).toFixed(1)}`
    : `超出 ${(wind - state.windLimit).toFixed(1)}`;
  dom.windWindow.classList.toggle("closed", !open);
  dom.windWindow.classList.toggle("danger", wind >= STORM_THRESHOLD);
  dom.windState.textContent = open ? "风窗开启" : "风窗关闭";
  dom.windowStatus.classList.toggle("closed", !open);
  dom.windowStatusText.textContent = open ? "风窗开启" : "风窗关闭";
  dom.nextWindow.textContent = open
    ? `距关闭约 ${Math.ceil(info.transitionIn)} s`
    : `距重开约 ${Math.ceil(info.nextOpenIn ?? info.transitionIn)} s`;
  dom.windowHint.textContent = open
    ? `余量 ${(state.windLimit - wind).toFixed(1)} m/s · 可作业`
    : `当前超出上限 ${(wind - state.windLimit).toFixed(1)} m/s`;
  dom.windScaleMark.style.left = `${Math.max(0, Math.min(100, wind / 30 * 100))}%`;
  dom.windScaleMark.classList.toggle("danger", !open);
  dom.limitReadout.textContent = state.windLimit;
  dom.windArrow.style.opacity = "0.45";
  dom.windArrow.style.transform = `translateX(${Math.sin(state.time * 0.7) * 3}px)`;
  if (open !== lastWindowOpen && !state.ended) {
    if (open) {
      showBanner(`风窗重新开启 · 上限 ${state.windLimit} m/s`, "", 2600);
    } else {
      showBanner(`风窗关闭 · ${wind.toFixed(1)} m/s 已超过 ${state.windLimit} m/s 上限`, "danger", 3000);
    }
  }
  lastWindowOpen = open;
  drawWindChart();
}

function updateAudioMeter() {
  if (state.time - lastAudioMeterUpdate < 0.09) return;
  lastAudioMeterUpdate = state.time;
  const active = audio.ready && !audio.muted;
  const intensity = active ? Math.min(1, 0.18 + state.wind / 24 + (state.motorActive ? 0.22 : 0)) : 0;
  dom.audioBars.forEach((bar, index) => {
    const wave = Math.abs(Math.sin(state.time * (3.4 + index * 0.52) + index * 1.7));
    const height = active ? 18 + wave * 66 * intensity : 14;
    bar.style.height = `${height.toFixed(0)}%`;
  });
}

function updateUI() {
  updateBoatUI();
  updatePlatformUI();
  updateWindUI();
  updateStepUI();
  updateAudioMeter();

  if (state.phase !== lastPhase) {
    lastPhase = state.phase;
    const messages = {
      transfer: "人员正在通过舷梯，保持船位稳定",
      tower: "已登塔 · 将升降平台升至 64–76% 高度",
      locked: "平台锁定成功 · 按住检修按钮完成修复",
      retreat: "叶尖修复完成 · 将平台降至塔基",
      returning: "人员正在撤离平台",
      returnReady: "人员已撤回塔基 · 等待登船返航",
    };
    if (messages[state.phase]) showBanner(messages[state.phase], state.phase === "locked" ? "" : "warn");
  }
}

function syncWindState() {
  state.wind = currentWind();
}

function setBoatPosition(percent) {
  const value = Math.max(20, Math.min(95, Number(percent)));
  state.boatPosition = value;
  state.boatWorldX = boatWorldFromPercent(value);
  updateBoatUI();
}

function beginDock() {
  if (state.phase !== "approach") return false;
  if (!state.boatAligned) {
    showToast("船位未进入靠泊窗 · 请先调整船位", "warn");
    return false;
  }
  if (!isWindowOpen()) {
    showToast("风窗关闭 · 无法开始人员转移", "danger");
    return false;
  }

  state.docked = true;
  state.phase = "transfer";
  state.transferProgress = 0;
  state.crewOnBoat = true;
  showBanner("对接完成 · 人员正在登塔", "");
  updateUI();
  return true;
}

function setLiftTarget(value) {
  if (!["tower", "retreat"].includes(state.phase)) return false;
  state.liftTarget = Math.max(0, Math.min(100, Number(value)));
  updateUI();
  return true;
}

function canLockPlatform() {
  return state.phase === "tower"
    && Math.abs(state.lift - TARGET_LIFT) <= LIFT_TOLERANCE
    && Math.abs(state.sway) <= LOCK_ANGLE
    && isWindowOpen();
}

function lockPlatform() {
  if (state.phase !== "tower" || state.locked) return false;
  if (Math.abs(state.lift - TARGET_LIFT) > LIFT_TOLERANCE) {
    showToast("平台未对准叶尖 · 目标高度 64–76%", "warn");
    return false;
  }
  if (!isWindowOpen()) {
    showToast("风窗关闭 · 无法机械锁止", "danger");
    return false;
  }
  if (Math.abs(state.sway) > LOCK_ANGLE) {
    showToast(`摆角 ${Math.abs(state.sway).toFixed(1)}° 超出 3.2° 限值 · 等待稳定`, "danger");
    return false;
  }

  state.locked = true;
  state.liftTarget = Math.round(state.lift);
  state.sway = Math.max(-1, Math.min(1, state.sway));
  state.phase = "locked";
  showBanner("机械锁止完成 · 摆角已进入安全区", "");
  showToast("平台已锁定 · 可以开始修复", "", 2200);
  updateUI();
  return true;
}

function beginRepairHold() {
  if (!state.locked || state.phase !== "locked" || state.repaired) return false;
  state.repairHeld = true;
  state.phase = "repairing";
  updateUI();
  return true;
}

function endRepairHold() {
  if (!state.repairHeld) return;
  state.repairHeld = false;
  if (state.phase === "repairing") state.phase = "locked";
  updateUI();
}

function completeRepair() {
  state.repaired = true;
  state.repairProgress = 1;
  state.repairHeld = false;
  state.locked = false;
  state.phase = "retreat";
  state.liftTarget = Math.min(state.liftTarget, state.lift);
  showBanner("修复包固化完成 · 现在将平台降至塔基", "");
  showToast("叶尖修复完成 · 平台正在解锁", "", 2600);
}

function lowerPlatform() {
  if (state.phase !== "retreat") return false;
  state.liftTarget = 0;
  updateUI();
  return true;
}

function handleReturn() {
  if (state.phase === "retreat" && state.lift <= 2) {
    state.phase = "returning";
    state.returnProgress = 0;
    updateUI();
    return true;
  }
  if (state.phase === "returnReady") {
    finishSuccess();
    return true;
  }
  return false;
}

function finishSuccess() {
  state.phase = "success";
  state.ended = true;
  state.crewOnBoat = true;
  state.result = "success";
  updateUI();
  showResult(true);
}

function abortMission(reason) {
  if (state.ended) return;
  state.phase = "failed";
  state.ended = true;
  state.result = "failed";
  state.repairHeld = false;
  state.repaired = false;
  state.locked = false;
  state.stormExposure = STORM_GRACE_SECONDS;
  updateUI();
  showResult(false, reason);
}

function selectWindLimit(limit) {
  state.windLimit = Number(limit);
  dom.limitButtons.forEach((button) => {
    button.classList.toggle("active", Number(button.dataset.limit) === state.windLimit);
  });
  updateUI();
  if (!isWindowOpen()) {
    showToast("作业风窗已关闭 · 等待风速回落", "warn");
  }
}

function showResult(success, reason = "") {
  dom.resultLayer.classList.add("visible");
  dom.resultLayer.setAttribute("aria-hidden", "false");
  dom.resultCard.classList.toggle("fail", !success);
  dom.resultKicker.textContent = success ? "MISSION COMPLETE" : "MISSION ABORTED";
  dom.resultSeal.textContent = success ? "✓" : "×";
  dom.resultTitle.textContent = success ? "叶尖修复完成" : "强风中止任务";
  dom.resultText.textContent = success
    ? "修复包已固化，平台已撤回，全员安全返回船舱。"
    : (reason || "作业区风速超过安全阈值，人员被迫中止检修并撤离。");
  dom.resultTime.textContent = formatTime(state.elapsed);
  dom.resultWind.textContent = `${state.wind.toFixed(1)} m/s`;
}

function restartMission() {
  state = initialState();
  state.boatWorldX = boatWorldFromPercent(state.boatPosition);
  lastPhase = "";
  lastWindowOpen = true;
  dom.resultLayer.classList.remove("visible");
  dom.resultLayer.setAttribute("aria-hidden", "true");
  dom.resultCard.classList.remove("fail");
  dom.boatRange.value = state.boatPosition;
  dom.liftRange.value = 0;
  dom.limitButtons.forEach((button) => {
    button.classList.toggle("active", Number(button.dataset.limit) === state.windLimit);
  });
  showBanner("风窗开启 · 调整船位并靠泊塔基", "", 3200);
  showToast("新的检修任务已开始", "", 1800);
  updateUI();
}

function updateGame(dt) {
  state.time += dt;

  if (!state.ended) {
    state.clock += dt;
    state.elapsed += dt;
    syncWindState();

    if (state.phase === "transfer") {
      state.transferProgress = Math.min(1, state.transferProgress + dt / 1.55);
      if (state.transferProgress >= 1) {
        state.crewOnBoat = false;
        state.phase = "tower";
        state.armExtend = 0;
      }
    }

    const canMoveLift = state.phase === "retreat"
      || (state.phase === "tower" && isWindowOpen());
    const liftDiff = state.liftTarget - state.lift;
    if (canMoveLift && Math.abs(liftDiff) > 0.12) {
      const step = Math.min(Math.abs(liftDiff), 41 * dt) * Math.sign(liftDiff);
      state.lift += step;
      state.liftVelocity = step / Math.max(dt, 0.001);
      state.motorActive = true;
    } else {
      state.liftVelocity *= Math.max(0, 1 - dt * 7);
      state.motorActive = false;
      if (Math.abs(liftDiff) <= 0.12) state.lift = state.liftTarget;
    }

    let extendTarget = 0;
    if (state.phase === "tower") extendTarget = clamp01((state.lift - 18) / 46);
    if (["locked", "repairing"].includes(state.phase)) extendTarget = 1;
    if (state.phase === "retreat") extendTarget = clamp01((state.lift - 16) / 42);
    state.armExtend += (extendTarget - state.armExtend) * Math.min(1, dt * 4);

    if (isExposed()) {
      const motorNormalized = Math.abs(state.liftVelocity) / 41;
      let swayTarget = swayFor(state.wind, state.time, motorNormalized);
      if (state.locked) swayTarget *= 0.1;
      const damping = state.locked ? 18 : (state.motorActive ? 3.6 : 5.4);
      state.sway += (swayTarget - state.sway) * Math.min(1, dt * damping);
    } else {
      state.sway += (0 - state.sway) * Math.min(1, dt * 5);
    }

    if (state.repairHeld && state.locked) {
      if (isWindowOpen() && state.wind < STORM_THRESHOLD) {
        state.repairProgress = Math.min(1, state.repairProgress + dt * 0.38);
        if (state.repairProgress >= 1) completeRepair();
      }
    }

    if (state.phase === "returning") {
      state.returnProgress = Math.min(1, state.returnProgress + dt / 1.15);
      if (state.returnProgress >= 1) {
        state.phase = "returnReady";
        state.crewOnBoat = false;
      }
    }

    if (state.wind >= STORM_THRESHOLD) {
      if (isExposed()) {
        state.stormExposure += dt;
        if (!state.stormWarned) {
          state.stormWarned = true;
          showBanner(`阵风 ${state.wind.toFixed(1)} m/s · 立即撤离作业区`, "danger", 1800);
        }
        if (state.stormExposure >= STORM_GRACE_SECONDS) {
          abortMission(`阵风达到 ${state.wind.toFixed(1)} m/s，暴露作业超过 ${STORM_GRACE_SECONDS.toFixed(1)} 秒。`);
        }
      } else {
        state.stormExposure = 0;
        if (!state.stormWarned) {
          state.stormWarned = true;
          showBanner("强风过境 · 人员应留在船舱等待风窗", "warn", 2200);
        }
      }
    } else {
      state.stormExposure = Math.max(0, state.stormExposure - dt * 1.7);
      state.stormWarned = false;
    }
  }

  audio.update({
    wind: state.wind,
    motorSpeed: Math.abs(state.liftVelocity) / 41,
    motorActive: state.motorActive,
  });

  renderer.render(state, dt);

  if (state.time - lastUiUpdate > 0.075) {
    lastUiUpdate = state.time;
    updateUI();
  }
}

function bindEvents() {
  dom.boatRange.addEventListener("input", (event) => {
    setBoatPosition(event.target.value);
  });

  dom.dockBtn.addEventListener("click", () => {
    beginDock();
  });

  dom.liftRange.addEventListener("input", (event) => {
    setLiftTarget(event.target.value);
  });

  dom.lockBtn.addEventListener("click", () => {
    lockPlatform();
  });

  dom.repairBtn.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    beginRepairHold();
  });

  dom.repairBtn.addEventListener("keydown", (event) => {
    if ((event.key === " " || event.key === "Enter") && !event.repeat) {
      event.preventDefault();
      beginRepairHold();
    }
  });

  dom.repairBtn.addEventListener("keyup", (event) => {
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      endRepairHold();
    }
  });

  window.addEventListener("pointerup", endRepairHold);
  window.addEventListener("blur", endRepairHold);

  dom.lowerBtn.addEventListener("click", () => {
    lowerPlatform();
  });

  dom.returnBtn.addEventListener("click", () => {
    handleReturn();
  });

  dom.limitButtons.forEach((button) => {
    button.addEventListener("click", () => {
      selectWindLimit(button.dataset.limit);
    });
  });

  dom.audioBtn.addEventListener("click", async () => {
    const enabled = await audio.toggle();
    dom.audioBtn.setAttribute("aria-pressed", String(enabled));
    dom.audioLabel.textContent = enabled ? "声音开启" : "声音关闭";
    if (enabled) showToast("风噪与卷扬机音频已开启", "", 1800);
  });

  dom.restartBtn.addEventListener("click", restartMission);

  const resize = () => {
    renderer.resize();
    drawWindChart();
  };
  window.addEventListener("resize", resize);
  if (window.ResizeObserver) {
    new ResizeObserver(resize).observe(dom.canvas);
  }
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function snapshot() {
  return {
    phase: state.phase,
    clock: Number(state.clock.toFixed(2)),
    elapsed: Number(state.elapsed.toFixed(2)),
    wind: Number(state.wind.toFixed(2)),
    windLimit: state.windLimit,
    windowOpen: isWindowOpen(),
    boatPosition: state.boatPosition,
    boatAligned: state.boatAligned,
    docked: state.docked,
    lift: Number(state.lift.toFixed(2)),
    liftTarget: state.liftTarget,
    sway: Number(state.sway.toFixed(2)),
    lockAngle: LOCK_ANGLE,
    locked: state.locked,
    repaired: state.repaired,
    repairProgress: Number(state.repairProgress.toFixed(3)),
    repairHeld: state.repairHeld,
    stormExposure: Number(state.stormExposure.toFixed(2)),
    ended: state.ended,
    result: state.result,
    crewOnBoat: state.crewOnBoat,
    audio: audio.stats(),
  };
}

window.__repairGame = {
  getState: snapshot,
  setBoatPosition,
  beginDock,
  setLiftTarget,
  lockPlatform,
  beginRepairHold,
  endRepairHold,
  lowerPlatform,
  handleReturn,
  selectWindLimit,
  restart: restartMission,
  setWindOverride(value) {
    state.windOverride = Math.max(0, Math.min(40, Number(value)));
    syncWindState();
    updateUI();
  },
  clearWindOverride() {
    state.windOverride = null;
    syncWindState();
    updateUI();
  },
  setClock(seconds) {
    state.clock = Math.max(0, Number(seconds));
    syncWindState();
    updateUI();
  },
  toggleAudio: () => audio.toggle(),
  audioStats: () => audio.stats(),
};

let previousFrame = performance.now();
function animate(now) {
  const dt = Math.min(0.05, Math.max(0.001, (now - previousFrame) / 1000));
  previousFrame = now;
  updateGame(dt);
  requestAnimationFrame(animate);
}

bindEvents();
setBoatPosition(state.boatPosition);
updateUI();
showBanner("风窗开启 · 调整船位并靠泊塔基", "", 4200);
requestAnimationFrame(animate);
