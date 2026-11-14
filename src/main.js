import { AudioEngine } from "./audio-engine.js";
import { DualSyncGame, STAGES } from "./game.js";
import { StageRenderer } from "./renderer.js";

const canvas = document.querySelector("#stage-canvas");
const intro = document.querySelector("#intro");
const resultScreen = document.querySelector("#result-screen");
const startButton = document.querySelector("#start-button");
const replayButton = document.querySelector("#replay-button");
const pauseButton = document.querySelector("#pause-button");
const pauseVeil = document.querySelector("#pause-veil");
const consoleElement = document.querySelector(".console");
const statusPill = document.querySelector("#status-pill");
const statusText = document.querySelector("#status-text");
const stageNumber = document.querySelector("#stage-number");
const sectionName = document.querySelector("#section-name");
const tempoReadout = document.querySelector("#tempo-readout");
const frequencyValue = document.querySelector("#frequency-value");
const volumeValue = document.querySelector("#volume-value");
const lockedValue = document.querySelector("#locked-value");
const beatTotal = document.querySelector("#beat-total");
const frequencyMeter = document.querySelector("#frequency-meter");
const volumeMeter = document.querySelector("#volume-meter");
const lockedMeter = document.querySelector("#locked-meter");
const signalValue = document.querySelector("#signal-value");
const frequencyTarget = document.querySelector("#frequency-target");
const lampTarget = document.querySelector("#lamp-target");
const audioIndicator = document.querySelector("#audio-indicator");
const clockNow = () => audio.now;

const audio = new AudioEngine();
let currentFeedback = {
  tone: "info",
  title: "等待两名操作者就位",
  detail: "",
};
let alarmTimer = null;
let resultTimer = null;
let starting = false;

const game = new DualSyncGame(audio, {
  onUpdate: updateHud,
  onStage: handleStage,
  onFeedback: setFeedback,
  onPause: updatePauseUI,
  onAlarm: handleAlarm,
  onStageFail: () => timelineFlash("FAIL"),
  onStageClear: () => timelineFlash("CLEAR"),
  onComplete: handleComplete,
});

const renderer = new StageRenderer(canvas, game);

function setFeedback(feedback) {
  currentFeedback = feedback;
  statusText.textContent = feedback.title;
  statusPill.classList.toggle("is-warn", feedback.tone === "alarm");
  if (feedback.detail) statusPill.title = feedback.detail;
}

function updateHud(state) {
  const stage = STAGES[state.stageIndex] ?? STAGES[0];
  const playerCards = [
    document.querySelector(".player-a"),
    document.querySelector(".player-b"),
  ];
  const live = state.canOperate;
  stageNumber.textContent = `${String(state.stageIndex + 1).padStart(2, "0")} / 03`;
  sectionName.textContent = `${stage.id} / ${stage.title}`;
  tempoReadout.textContent = `${stage.bpm} BPM`;
  frequencyValue.textContent = state.frequency.toFixed(1);
  volumeValue.textContent = Math.round(state.volume);
  lockedValue.textContent = String(state.stageHits);
  beatTotal.textContent = String(state.requiredHits);
  frequencyMeter.style.width = `${((state.frequency - 35) / 70) * 100}%`;
  volumeMeter.style.width = `${state.volume}%`;
  lockedMeter.style.width = `${(state.stageHits / Math.max(1, state.requiredHits)) * 100}%`;
  frequencyTarget.textContent = `目标频段 ${state.frequencyTarget[0]}–${state.frequencyTarget[1]} HZ`;
  frequencyTarget.style.color = state.tuningValid ? "var(--acid)" : "";
  playerCards.forEach((card) => {
    card.classList.toggle("is-live", live && !state.paused);
    card.classList.toggle("is-idle", state.phase === "idle" || state.phase === "complete");
  });

  const nextTarget = state.nextTarget;
  if (state.paused) {
    lampTarget.textContent = "装置暂停 · 灯位与声源已冻结";
  } else if (state.phase === "countin" && state.countIn) {
    lampTarget.textContent = `预备 ${state.countIn.beat} / 4 · ${nextTarget ? `下一灯位 0${nextTarget.lamp + 1}` : ""}`;
  } else if (nextTarget) {
    lampTarget.textContent = `下一灯位 · 0${nextTarget.lamp + 1} / 与低频同拍`;
  } else if (state.phase === "failure") {
    lampTarget.textContent = "报警后冷却 · 等待本段重启";
  } else if (state.phase === "stageClear") {
    lampTarget.textContent = "本段锁定 · 准备切换节奏";
  } else {
    lampTarget.textContent = "三灯序列完成";
  }

  if (state.paused) signalValue.textContent = "HELD";
  else if (!state.canOperate && state.phase !== "idle") signalValue.textContent = "SYNC BUS";
  else if (state.tuningValid) signalValue.textContent = live ? "READY" : "STANDBY";
  else signalValue.textContent = "TUNE";
  signalValue.style.color =
    state.tuningValid ? "var(--acid)" : state.phase === "failure" ? "var(--alarm)" : "";

  audioIndicator.textContent =
    state.audio.state === "running"
      ? "WEB AUDIO LIVE"
      : state.audio.state === "suspended"
        ? "WEB AUDIO HELD"
        : "AUDIO OFFLINE";
  audioIndicator.style.color =
    state.audio.state === "running"
      ? "var(--acid)"
      : state.audio.state === "suspended"
        ? "var(--muted)"
        : "";

  pauseButton.disabled = !game.isRunning;
  pauseButton.querySelector(".pause-icon").textContent = state.paused ? "▶" : "Ⅱ";
  pauseButton.querySelector(".pause-label").textContent = state.paused ? "继续" : "暂停";
}

function handleStage(stage) {
  currentFeedback = {
    tone: "info",
    title: `${stage.id} / ${stage.title}`,
    detail: stage.note,
  };
}

function timelineFlash(label) {
  document.body.dataset.timelineEvent = label;
}

function handleAlarm() {
  consoleElement.classList.remove("is-alarming");
  void consoleElement.offsetWidth;
  consoleElement.classList.add("is-alarming");
  clearTimeout(alarmTimer);
  alarmTimer = window.setTimeout(() => consoleElement.classList.remove("is-alarming"), 900);
}

function updatePauseUI(paused) {
  pauseVeil.hidden = !paused;
  consoleElement.classList.toggle("is-paused", paused);
  setFeedback({
    tone: "info",
    title: paused ? "TRANSMISSION HELD / 声音与灯光已暂停" : "TRANSMISSION LIVE / 双人操作恢复",
    detail: paused ? "AudioContext 已挂起，画面时钟停止" : "AudioContext 已恢复",
  });
  updateHud(game.snapshot());
}

async function togglePause() {
  if (!game.isRunning || starting) return;
  if (!game.paused) {
    game.setPaused(true);
    await audio.pause();
  } else {
    await audio.resume();
    game.setPaused(false);
  }
  updateHud(game.snapshot());
}

async function startRun() {
  if (starting) return;
  starting = true;
  clearTimeout(resultTimer);
  intro.hidden = true;
  resultScreen.hidden = true;
  pauseVeil.hidden = true;
  startButton.disabled = true;
  try {
    await game.start();
    currentFeedback = {
      tone: "info",
      title: "四拍预备 · 调节低频，观察下一灯位",
      detail: "",
    };
    updateHud(game.snapshot());
  } catch (error) {
    intro.hidden = false;
    setFeedback({
      tone: "alarm",
      title: "AUDIO INIT FAILED",
      detail: String(error),
    });
  } finally {
    starting = false;
    startButton.disabled = false;
  }
}

function handleComplete(stats) {
  resultTimer = window.setTimeout(() => {
    document.querySelector("#result-stats").innerHTML = `
      <div><span>LOCKED BEATS</span><strong>${stats.hits}</strong></div>
      <div><span>ALARMS</span><strong>${stats.alarms}</strong></div>
      <div><span>ATTEMPTS</span><strong>${stats.attempts}</strong></div>
    `;
    resultScreen.hidden = false;
  }, 760);
}

function isTypingTarget(target) {
  return target instanceof HTMLElement && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

window.addEventListener("keydown", (event) => {
  if (isTypingTarget(event.target)) return;
  const code = event.code;

  if (!intro.hidden && (code === "Space" || code === "Enter")) {
    event.preventDefault();
    startRun();
    return;
  }

  if (code === "KeyP") {
    event.preventDefault();
    if (!event.repeat) togglePause();
    return;
  }

  if (!game.paused && game.canOperate()) {
    if (["KeyA", "KeyD", "KeyW", "KeyS"].includes(code)) {
      event.preventDefault();
      const direction = code === "KeyD" || code === "KeyW" ? 1 : -1;
      if (code === "KeyA" || code === "KeyD") game.adjustFrequency(direction);
      else game.adjustVolume(direction);
      markKey(code, true);
      return;
    }

    if (code === "Space") {
      event.preventDefault();
      if (!event.repeat) {
        game.playerAInput();
        markKey("Space", true, 180);
      }
      return;
    }

    if (["Digit1", "Digit2", "Digit3"].includes(code)) {
      event.preventDefault();
      if (!event.repeat) {
        const lamp = Number(code.slice(-1)) - 1;
        game.playerBInput(lamp);
        markKey(code, true, 180);
      }
    }
  }
});

window.addEventListener("keyup", (event) => {
  if (event.code === "KeyA" || event.code === "KeyD" || event.code === "KeyW" || event.code === "KeyS") {
    markKey(event.code, false);
  }
});

function markKey(code, pressed, timeout = 0) {
  let target = null;
  if (code === "Space") target = document.querySelector(".key-fire");
  else if (code === "KeyA" || code === "KeyD") target = document.querySelector(".key-pair:first-child");
  else if (code === "KeyW" || code === "KeyS") target = document.querySelector(".key-pair:nth-child(2)");
  else if (code.startsWith("Digit")) {
    target = document.querySelectorAll(".lamp-key")[Number(code.slice(-1)) - 1];
  }
  if (!target) return;
  target.classList.toggle("is-pressed", pressed);
  if (pressed && timeout) {
    window.setTimeout(() => target.classList.remove("is-pressed"), timeout);
  }
}

startButton.addEventListener("click", startRun);
replayButton.addEventListener("click", startRun);
pauseButton.addEventListener("click", togglePause);

function renderLoop() {
  const state = game.update();
  renderer.render(state, clockNow());
  requestAnimationFrame(renderLoop);
}

updateHud(game.snapshot());
renderLoop();

window.__DUAL_SYNC__ = {
  snapshot: () => game.snapshot(),
  start: startRun,
  pause: togglePause,
  setPaused: async (paused) => {
    if (game.paused !== paused) await togglePause();
  },
  canvasDataUrl: () => canvas.toDataURL("image/png"),
  stages: STAGES.map((stage) => ({ ...stage, lamps: [...stage.lamps] })),
};
