import {
  CONFIG,
  createEngine,
  cutWinch,
  deployAnchor,
  setControls,
  snapshot,
  step,
} from "./engine.js";
import { createRenderer } from "./renderer.js";
import { RescueAudio } from "./audio.js";

const $ = (selector) => document.querySelector(selector);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const canvas = $("#scene");
const renderer = createRenderer(canvas);
const audio = new RescueAudio();
let engine = createEngine();
let lastFrame = performance.now();
let lastEventId = 0;
let lastStatus = "running";
let lastAlert = "";
let audioButtonState = true;
const heldKeys = new Set();

const refs = {
  clock: $("#clockReadout"),
  missionTitle: $("#missionTitle"),
  missionText: $("#missionText"),
  phaseBadge: $("#phaseBadge"),
  alertStrip: $("#alertStrip"),
  alertText: $("#alertText"),
  angleReadout: $("#angleReadout"),
  angleSlider: $("#angleSlider"),
  anchorDial: $("#anchorDial"),
  anchorQualityText: $("#anchorQualityText"),
  qualityFill: $("#qualityFill"),
  deployBtn: $("#deployBtn"),
  winchReadout: $("#winchReadout"),
  winchSlider: $("#winchSlider"),
  tensionFill: $("#tensionFill"),
  tensionMarker: $("#tensionMarker"),
  steerReadout: $("#steerReadout"),
  steerSlider: $("#steerSlider"),
  steerFill: $("#steerFill"),
  steerKnob: $("#steerKnob"),
  tensionStat: $("#tensionStat"),
  slipStat: $("#slipStat"),
  safeStat: $("#safeStat"),
  soundBtn: $("#soundBtn"),
  resetBtn: $("#resetBtn"),
  resultOverlay: $("#resultOverlay"),
  resultCard: $(".result-card"),
  resultKicker: $("#resultKicker"),
  resultSeal: $("#resultSeal"),
  resultTitle: $("#resultTitle"),
  resultText: $("#resultText"),
  resultTime: $("#resultTime"),
  resultTension: $("#resultTension"),
  resultSlip: $("#resultSlip"),
  againBtn: $("#againBtn"),
};

function formatClock(seconds) {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${rest.toFixed(1).padStart(4, "0")}`;
}

function missionFor(snap) {
  if (snap.status === "won") {
    return ["任务完成", "两车均已进入安全区，救援车保持在稳定平台。"];
  }
  if (snap.status === "lost") {
    return ["救援中断", snap.alert];
  }
  if (snap.phase === "rig") {
    return ["固定救援车", "选择安全的锚定角度，将地锚打入雪层。"];
  }
  if (snap.phase === "front") {
    return ["牵引前车", "保持拖索张力，用转向抵消雪坡侧滑，将前车送入上方安全位。"];
  }
  if (snap.phase === "reanchor") {
    return ["重新布置锚点", "前车已安全。调整锚定角度，为后车建立新的受力线。"];
  }
  if (snap.phase === "rear") {
    return ["牵引后车", "后车更靠近陡坡。稳住转向，完成第二次牵引。"];
  }
  return ["等待指令", "检查锚点与拖索状态。"];
}

function phaseStepState(snap) {
  if (snap.status === "won") {
    return { anchor: "done", front: "done", rear: "done" };
  }
  if (snap.phase === "rig" || snap.phase === "reanchor") {
    return { anchor: "active", front: snap.front.safe ? "done" : "idle", rear: "idle" };
  }
  if (snap.phase === "front") return { anchor: "done", front: "active", rear: "idle" };
  if (snap.phase === "rear") return { anchor: "done", front: "done", rear: "active" };
  return { anchor: "done", front: snap.front.safe ? "done" : "idle", rear: snap.rear.safe ? "done" : "idle" };
}

function updatePhaseSteps(snap) {
  const states = phaseStepState(snap);
  document.querySelectorAll(".phase-step").forEach((node) => {
    const state = states[node.dataset.step];
    node.classList.toggle("active", state === "active");
    node.classList.toggle("done", state === "done");
  });
}

function getAlertInfo(snap) {
  if (snap.status === "lost") return { text: snap.alert, tone: "danger" };
  if (snap.status === "won") return { text: snap.alert, tone: "success" };
  if (snap.overload > 0.12 || snap.tension >= CONFIG.ropeLimit) {
    return { text: "拖索过载！立即降低绞盘力度，否则拖索会断裂。", tone: "danger" };
  }
  if (snap.rescue.slip >= 55) {
    return { text: "救援车正在侧滑！错误锚点无法抵消横向拉力，立即泄压。", tone: "danger" };
  }
  if (snap.rescue.slip >= 22) {
    return { text: "救援车出现侧滑。锚定角度偏离受力线，降低张力并修正转向。", tone: "warning" };
  }
  if (snap.anchor.deployed && snap.anchor.band === "danger" && snap.tension > 8) {
    return { text: "危险锚点：侧向分力正在拉动救援车，张力越高滑移越快。", tone: "danger" };
  }
  if (snap.tension > 84) return { text: "张力进入过载区，拖索余量不足。", tone: "warning" };
  if (snap.phase === "reanchor") {
    return { text: "前车进入安全区。收锚后重新选择角度，再固定救援车。", tone: "normal" };
  }
  return { text: snap.alert, tone: snap.anchor.band === "caution" ? "warning" : "normal" };
}

function updateInterface(snap) {
  const mission = missionFor(snap);
  refs.missionTitle.textContent = mission[0];
  refs.missionText.textContent = mission[1];
  refs.clock.textContent = formatClock(snap.time);
  refs.phaseBadge.textContent =
    snap.status === "won" ? "救援完成" : snap.phase === "rig" || snap.phase === "front" ? "阶段 1 / 2" : "阶段 2 / 2";
  updatePhaseSteps(snap);

  const angle = snap.anchor.deployed ? snap.anchor.angle : snap.controls.angle;
  const quality = snap.anchor.quality;
  refs.angleReadout.textContent = `${Math.round(angle)}°`;
  refs.angleSlider.value = String(Math.round(angle));
  refs.angleSlider.disabled = snap.anchor.deployed || snap.status !== "running";
  refs.anchorDial.querySelector(".needle").style.transform = `rotate(${angle - 90}deg)`;
  refs.anchorQualityText.textContent =
    snap.anchor.band === "safe" ? "咬合稳定" : snap.anchor.band === "caution" ? "边缘受力" : "锚点危险";
  refs.anchorQualityText.style.color =
    snap.anchor.band === "safe" ? "var(--green)" : snap.anchor.band === "caution" ? "var(--amber)" : "var(--red)";
  refs.qualityFill.style.width = `${Math.round(quality * 100)}%`;
  refs.qualityFill.style.background =
    snap.anchor.band === "safe" ? "var(--green)" : snap.anchor.band === "caution" ? "var(--amber)" : "var(--red)";

  const deployLabel = refs.deployBtn.querySelector("strong");
  const deployHint = refs.deployBtn.querySelector("small");
  deployLabel.textContent = snap.phase === "reanchor" ? "重新打入地锚" : "打入地锚";
  deployHint.textContent = snap.phase === "reanchor" ? "SPACE · 为后车换锚" : "SPACE · 固定救援车";
  refs.deployBtn.disabled =
    snap.anchor.deployed || snap.status !== "running" || !["rig", "reanchor"].includes(snap.phase);

  refs.winchReadout.textContent = String(Math.round(snap.controls.winch)).padStart(2, "0");
  refs.winchSlider.value = String(Math.round(snap.controls.winch));
  refs.winchSlider.disabled = snap.status !== "running";
  refs.tensionFill.style.width = `${Math.round(snap.tension)}%`;
  refs.tensionMarker.style.left = `${Math.round(snap.tension)}%`;
  refs.tensionMarker.style.opacity = snap.tension > 1 ? "1" : "0";
  refs.tensionFill.style.background =
    snap.tension >= CONFIG.ropeLimit
      ? "linear-gradient(90deg, var(--red), #ffb0a5)"
      : snap.tension > 84
        ? "linear-gradient(90deg, var(--amber), var(--red))"
        : "linear-gradient(90deg, var(--cyan), var(--amber))";

  const steer = snap.controls.steer;
  refs.steerReadout.textContent =
    Math.abs(steer) < 0.04 ? "居中" : steer > 0 ? `右打 ${Math.round(steer * 100)}` : `左打 ${Math.round(-steer * 100)}`;
  refs.steerSlider.value = String(Math.round(steer * 100));
  refs.steerSlider.disabled = snap.status !== "running";
  const steerPercent = Math.abs(steer) * 50;
  refs.steerFill.style.left = steer >= 0 ? "50%" : `${50 - steerPercent}%`;
  refs.steerFill.style.width = `${steerPercent}%`;
  refs.steerFill.style.background = steer >= 0 ? "var(--green)" : "var(--cyan)";
  refs.steerKnob.style.left = `${50 + steer * 50}%`;

  refs.tensionStat.textContent = `${Math.round(snap.tension)}%`;
  refs.slipStat.textContent = `${Math.round(snap.rescue.slip)}%`;
  refs.slipStat.parentElement.classList.toggle("warn", snap.rescue.slip >= 22);
  refs.safeStat.textContent = `${Number(snap.front.safe) + Number(snap.rear.safe)} / 2`;

  const alert = getAlertInfo(snap);
  if (alert.text !== lastAlert) {
    refs.alertText.textContent = alert.text;
    lastAlert = alert.text;
  }
  refs.alertStrip.classList.toggle("warning", alert.tone === "warning");
  refs.alertStrip.classList.toggle("danger", alert.tone === "danger");

  if (snap.status !== lastStatus) {
    lastStatus = snap.status;
    if (snap.status !== "running") showResult(snap);
  }
}

function showResult(snap) {
  const won = snap.status === "won";
  const titles = {
    "rope-break": ["拖索断裂", "绞盘张力超过拖索极限。下一次应分段加力，并让张力停留在工作区。"],
    "rescue-slide": ["救援车侧滑", "锚点角度偏离坡面受力线，横向分力把救援车带出了平台。"],
    "vehicle-slide": ["车辆滑落", "牵引过程中转向修正不足，受困车滑出了雪坡。"],
    "missed-safe": ["错过安全区", "受困车越过停车位。降低牵引速度，在绿色区域内完成制动。"],
    "both-safe": ["双车救援成功", "两辆受困车均已进入安全区，救援车仍稳固停在平台上。"],
  };
  const content = titles[snap.finishReason] || [won ? "双车救援成功" : "救援失败", snap.alert];
  refs.resultOverlay.classList.remove("hidden");
  refs.resultCard.classList.toggle("lost", !won);
  refs.resultKicker.textContent = won ? "RECOVERY COMPLETE" : "RECOVERY ABORTED";
  refs.resultSeal.textContent = won ? "✓" : "×";
  refs.resultTitle.textContent = content[0];
  refs.resultText.textContent = content[1];
  refs.resultTime.textContent = formatClock(snap.time);
  refs.resultTension.textContent = `${Math.round(engine.maxTension || 0)}%`;
  refs.resultSlip.textContent = `${Math.round(snap.rescue.slip)}%`;
}

function drainEvents() {
  for (const event of engine.events) {
    if (event.id <= lastEventId) continue;
    lastEventId = event.id;
    if (event.type === "won") audio.event("won");
    else if (event.type === "lost") {
      if (event.reason === "rope-break") audio.snap();
      else audio.event("lost");
    } else {
      audio.event(event.type);
    }
  }
}

function updateKeyboard(dt) {
  if (!["running"].includes(engine.status)) return;
  if (heldKeys.has("KeyW") || heldKeys.has("ArrowUp")) {
    setControls(engine, { winch: engine.controls.winch + 50 * dt });
  }
  if (heldKeys.has("KeyS") || heldKeys.has("ArrowDown")) {
    setControls(engine, { winch: engine.controls.winch - 50 * dt });
  }
  if (heldKeys.has("KeyA") || heldKeys.has("ArrowLeft")) {
    setControls(engine, { steer: engine.controls.steer - 1.4 * dt });
  }
  if (heldKeys.has("KeyD") || heldKeys.has("ArrowRight")) {
    setControls(engine, { steer: engine.controls.steer + 1.4 * dt });
  }
  if (!engine.anchor.deployed) {
    if (heldKeys.has("KeyQ")) setControls(engine, { angle: engine.controls.angle - 28 * dt });
    if (heldKeys.has("KeyE")) setControls(engine, { angle: engine.controls.angle + 28 * dt });
  }
}

function resetGame() {
  engine = createEngine();
  lastEventId = 0;
  lastStatus = "running";
  lastAlert = "";
  heldKeys.clear();
  refs.resultOverlay.classList.add("hidden");
  refs.angleSlider.value = "66";
  refs.winchSlider.value = "0";
  refs.steerSlider.value = "0";
  audio.update(0, false, 0.016);
}

function frame(now) {
  const dt = clamp((now - lastFrame) / 1000, 0.001, 0.05);
  lastFrame = now;
  updateKeyboard(dt);
  step(engine, dt);
  const snap = snapshot(engine);
  renderer.draw(snap);
  updateInterface(snap);
  drainEvents();
  audio.update(snap.tension, snap.tensionBand === "critical" || snap.overload > 0.08, dt);
  requestAnimationFrame(frame);
}

refs.angleSlider.addEventListener("input", () => {
  audio.unlock();
  setControls(engine, { angle: Number(refs.angleSlider.value) });
});
refs.winchSlider.addEventListener("input", () => {
  audio.unlock();
  setControls(engine, { winch: Number(refs.winchSlider.value) });
});
refs.steerSlider.addEventListener("input", () => {
  audio.unlock();
  setControls(engine, { steer: Number(refs.steerSlider.value) / 100 });
});
refs.deployBtn.addEventListener("click", () => {
  audio.unlock();
  const result = deployAnchor(engine);
  if (!result.ok && result.reason === "tension-high") {
    lastAlert = "";
  }
});
refs.resetBtn.addEventListener("click", resetGame);
refs.againBtn.addEventListener("click", resetGame);
refs.soundBtn.addEventListener("click", async () => {
  audioButtonState = !audioButtonState;
  audio.setEnabled(audioButtonState);
  refs.soundBtn.classList.toggle("active", audioButtonState);
  refs.soundBtn.textContent = audioButtonState ? "◖ 声音" : "◗ 静音";
  if (audioButtonState) await audio.unlock();
});

window.addEventListener("keydown", (event) => {
  const code = event.code;
  if (["Space", "KeyW", "KeyA", "KeyS", "KeyD", "KeyQ", "KeyE", "KeyX"].includes(code)) {
    event.preventDefault();
  }
  audio.unlock();
  heldKeys.add(code);
  if (code === "Space") deployAnchor(engine);
  if (code === "KeyX") cutWinch(engine);
  if (code === "KeyR") resetGame();
});
window.addEventListener("keyup", (event) => heldKeys.delete(event.code));
window.addEventListener("blur", () => heldKeys.clear());
window.addEventListener("resize", () => renderer.resize());

refs.soundBtn.classList.add("active");
window.RecoveryGame = {
  getSnapshot: () => snapshot(engine),
  reset: resetGame,
  audio,
};
requestAnimationFrame(frame);
