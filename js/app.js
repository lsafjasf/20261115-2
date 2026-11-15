import {
  CONFIG,
  createSimulation,
  formatClock,
  stepSimulation,
  tideAt,
  toggleCanal,
  toggleGate,
  togglePump,
} from "./simulation.js";
import { setupCanvas } from "./renderer.js";
import { TidalAudio } from "./audio.js";
import { applyAutoControls, issueAutoStart } from "./scenarios.js";

const canvas = document.querySelector("#scene");
const renderer = setupCanvas(canvas);
const audio = new TidalAudio();

const ui = {
  clock: document.querySelector("#clock"),
  tide: document.querySelector("#tide"),
  deadline: document.querySelector("#deadline"),
  status: document.querySelector("#status-pill"),
  statusText: document.querySelector("#status-pill span"),
  timelineState: document.querySelector("#timeline-state"),
  pumpFlowLabel: document.querySelector("#pump-flow-label"),
  canalFlowLabel: document.querySelector("#canal-flow-label"),
  flow: document.querySelector("#flow-readout"),
  pressure: document.querySelector("#pressure-readout"),
  efficiency: document.querySelector("#efficiency-readout"),
  eventLog: document.querySelector("#event-log"),
  briefing: document.querySelector("#briefing-panel"),
  result: document.querySelector("#result-panel"),
  resultKicker: document.querySelector("#result-kicker"),
  resultTitle: document.querySelector("#result-title"),
  resultCopy: document.querySelector("#result-copy"),
  resultStats: document.querySelector("#result-stats"),
  audioButton: document.querySelector("#audio-button"),
  pauseButton: document.querySelector("#pause-button"),
  pauseIcon: document.querySelector("#pause-icon"),
  pauseLabel: document.querySelector("#pause-label"),
};

let sim = createSimulation();
let running = false;
let paused = false;
let speed = 1;
let mode = "manual";
let visualTime = 0;
let lastFrame = performance.now();
let lastStatus = "idle";
let lastLogKey = "";
let terminalHandled = false;
let audioEnabled = false;

const refs = {
  targets: [],
  pumps: [...document.querySelectorAll('[data-control="pump"]')],
  gates: [...document.querySelectorAll('[data-control="gate"]')],
  canal: document.querySelector('[data-control="canal"]'),
  speeds: [...document.querySelectorAll("[data-speed]")],
};

function buildTargetCards() {
  const list = document.querySelector("#target-list");
  list.innerHTML = "";
  sim.reservoirs.forEach((reservoir) => {
    const card = document.createElement("article");
    card.className = "target-card";
    card.innerHTML = `
      <span class="pool-letter">${reservoir.short}</span>
      <div class="target-main">
        <div class="target-line">
          <span>${reservoir.name}</span>
          <b><span class="level-value">${reservoir.level.toFixed(2)}</span> / ${reservoir.target.toFixed(2)} m</b>
        </div>
        <div class="target-track">
          <i></i>
          <em style="left:${(reservoir.target / reservoir.max) * 100}%"></em>
        </div>
      </div>
      <span class="target-state">FILLING</span>
    `;
    list.append(card);
    refs.targets.push({
      card,
      level: card.querySelector(".level-value"),
      track: card.querySelector(".target-track i"),
      state: card.querySelector(".target-state"),
    });
  });
}

function eventKey() {
  const first = sim.events[0];
  return first ? `${sim.events.length}:${first.time.toFixed(2)}:${first.text}` : "empty";
}

function renderEvents() {
  const key = eventKey();
  if (key === lastLogKey) return;
  lastLogKey = key;
  ui.eventLog.innerHTML = "";
  sim.events.forEach((event) => {
    const item = document.createElement("li");
    item.className = event.type;
    const time = document.createElement("time");
    time.textContent = formatClock(event.time);
    const text = document.createElement("span");
    text.textContent = event.text;
    item.append(time, text);
    ui.eventLog.append(item);
  });
}

function stateLabel(state) {
  return {
    off: "待机",
    running: "运行",
    starting: "启动中",
    stopping: "减速中",
  }[state] || state;
}

function gateLabel(gate) {
  if (gate.moving && gate.delayRemaining > 0) return `延迟 ${gate.delayRemaining.toFixed(1)}s`;
  if (gate.moving) return gate.targetPosition > 0.5 ? "开启中" : "关闭中";
  return gate.position > 0 ? "已开启" : "关闭";
}

function syncStatus() {
  let text = "待命";
  let className = "";
  if (paused && running) {
    text = "已暂停";
    className = "running";
  } else if (sim.status === "success") {
    text = "完成";
    className = "success";
  } else if (sim.status === "failed") {
    text = sim.failureReason === "overflow" ? "溢流" : "超时";
    className = "failed";
  } else if (running) {
    text = "调度中";
    className = "running";
  }
  ui.status.className = `status-pill ${className}`;
  ui.statusText.textContent = text;
}

function syncTargets() {
  sim.reservoirs.forEach((reservoir, index) => {
    const ref = refs.targets[index];
    if (!ref) return;
    ref.level.textContent = reservoir.level.toFixed(2);
    ref.track.style.width = `${Math.min(100, (reservoir.level / reservoir.max) * 100)}%`;
    ref.card.classList.toggle("in-band", reservoir.inTargetBand);
    ref.card.classList.toggle("over-target", reservoir.overTarget || reservoir.overflowVolume > 0);
    let text = "FILLING";
    if (reservoir.overflowVolume > 0) text = "OVERFLOW";
    else if (reservoir.inTargetBand) text = "IN BAND";
    else if (reservoir.overTarget) text = "OVER TARGET";
    ref.state.textContent = text;
  });
}

function syncDevices() {
  const disabled = !running || paused;
  refs.pumps.forEach((button, index) => {
    const pump = sim.pumps[index];
    button.disabled = disabled;
    button.classList.toggle("active", pump.commanded);
    button.classList.toggle("transitioning", pump.state === "starting" || pump.state === "stopping");
    button.querySelector(".device-top em").textContent = stateLabel(pump.state);
    button.querySelector(".device-meter i").style.width = `${pump.output * 100}%`;
    const values = button.querySelectorAll(".device-foot span");
    values[0].textContent = `${Math.round(pump.output * 100)} %`;
  });

  refs.gates.forEach((button, index) => {
    const gate = sim.gates[index];
    button.disabled = disabled;
    button.classList.toggle("active", gate.position > 0.001);
    button.classList.toggle("transitioning", gate.moving);
    button.querySelector(".device-top em").textContent = gateLabel(gate);
    button.querySelector(".device-meter i").style.width = `${gate.position * 100}%`;
    button.querySelector(".device-foot span").textContent = `${Math.round(gate.position * 100)} %`;
  });

  const canal = sim.canal;
  refs.canal.disabled = disabled;
  refs.canal.classList.toggle("active", canal.position > 0.001);
  refs.canal.classList.toggle("transitioning", canal.moving);
  refs.canal.querySelector(".device-top em").textContent = gateLabel(canal);
  refs.canal.querySelector(".device-meter i").style.width = `${canal.position * 100}%`;
  refs.canal.querySelector(".device-foot span").textContent = `${Math.round(canal.position * 100)} %`;
}

function syncReadouts() {
  const tide = tideAt(sim.time);
  ui.clock.textContent = formatClock(sim.time);
  ui.tide.textContent = `+${tide.toFixed(2)} m`;
  ui.deadline.textContent = formatClock(Math.max(0, CONFIG.tidePeakTime - sim.time));
  ui.pumpFlowLabel.textContent = `${sim.totals.pumpFlow.toFixed(1)} m³/s`;
  ui.canalFlowLabel.textContent = `${sim.totals.canalFlow.toFixed(1)} m³/s`;
  ui.flow.innerHTML = `${sim.totals.pumpFlow.toFixed(1)} <small>m³/s</small>`;
  ui.pressure.innerHTML = `${sim.totals.pressure.toFixed(2)} <small>MPa</small>`;
  ui.efficiency.innerHTML = `${(sim.totals.efficiency * 100).toFixed(0)} <small>%</small>`;

  if (!running && sim.time === 0) {
    ui.timelineState.textContent = mode === "overflow"
      ? "故障注入已装载 · B 闸将在 45.6 秒才收到关闭指令"
      : "系统待命 · 潮汐序列已锁定";
  } else if (sim.status === "success") {
    ui.timelineState.textContent = `三池达标，设备已归位 · ${formatClock(sim.completionTime)}`;
  } else if (sim.status === "failed" && sim.failureReason === "overflow") {
    ui.timelineState.textContent = `溢流锁定 · 首轮越堰 ${formatVolume(sim.totals.overflowVolume)}`;
  } else if (sim.status === "failed") {
    ui.timelineState.textContent = "高潮已到，三池未全部进入目标窗口";
  } else if (paused) {
    ui.timelineState.textContent = "仿真已暂停 · 设备延迟计时同步冻结";
  } else {
    ui.timelineState.textContent = `潮位 +${tide.toFixed(2)} m · 反压泵效 ${(sim.totals.efficiency * 100).toFixed(0)}% · 目标窗口 ±0.00 / +0.16 m`;
  }
}

function formatVolume(volume) {
  return volume < 1 ? `${(volume * 1000).toFixed(1)} L` : `${volume.toFixed(2)} m³`;
}

function syncUI() {
  syncStatus();
  syncTargets();
  syncDevices();
  syncReadouts();
  renderEvents();
}

function pushLocalEvent(type, text) {
  sim.events.unshift({ time: sim.time, type, text });
  sim.events.length = Math.min(sim.events.length, 14);
}

function showResult() {
  if (terminalHandled) return;
  terminalHandled = true;
  running = false;
  paused = false;
  ui.briefing.hidden = true;
  ui.result.hidden = false;
  ui.result.className = `result-panel ${sim.status === "success" ? "success" : "failed"}`;
  ui.resultStats.innerHTML = "";

  if (sim.status === "success") {
    ui.resultKicker.textContent = "MISSION COMPLETE / 调度完成";
    ui.resultTitle.textContent = "三池达标，窗口守住了";
    ui.resultCopy.textContent = "三座蓄水池全部进入目标窗口，泵组停止、进水闸闭合，未发生溢流。";
    addResultStat(`完成时刻 ${formatClock(sim.completionTime)}`);
    addResultStat(`潮位 +${tideAt(sim.completionTime).toFixed(2)} m`);
    addResultStat(`累计进水 ${sim.totals.deliveredVolume.toFixed(0)} m³`);
  } else if (sim.failureReason === "overflow") {
    ui.resultKicker.textContent = "MISSION ABORTED / 安全联锁";
    ui.resultTitle.textContent = "二号池发生溢流";
    ui.resultCopy.textContent = "B 闸在 45.6 秒才收到关闭指令；0.7 秒电机延迟加 2.6 秒闸门行程，来不及截断上升水位。";
    addResultStat(`溢流时刻 ${formatClock(sim.time)}`);
    addResultStat(`越堰水量 ${formatVolume(sim.totals.overflowVolume)}`);
    addResultStat("失败原因 动作过晚");
    if (audioEnabled) audio.overflowAlert();
  } else {
    ui.resultKicker.textContent = "WINDOW MISSED / 高潮已到";
    ui.resultTitle.textContent = "错过高潮前窗口";
    ui.resultCopy.textContent = "潮位已越过峰值线，三座蓄水池仍未同时进入目标窗口。";
    addResultStat("最终潮位 +5.15 m");
    addResultStat(`累计进水 ${sim.totals.deliveredVolume.toFixed(0)} m³`);
  }
  syncUI();
}

function addResultStat(text) {
  const stat = document.createElement("span");
  stat.textContent = text;
  ui.resultStats.append(stat);
}

async function setAudio(enabled) {
  try {
    if (enabled) await audio.enable();
    else audio.disable();
    audioEnabled = enabled;
  } catch {
    audioEnabled = false;
  }
  ui.audioButton.setAttribute("aria-pressed", String(audioEnabled));
  ui.audioButton.querySelector("span:last-child").textContent = audioEnabled ? "静音" : "声音";
}

function setSpeed(nextSpeed) {
  speed = nextSpeed;
  refs.speeds.forEach((button) => {
    button.classList.toggle("active", Number(button.dataset.speed) === speed);
  });
}

function startRun(nextMode = "manual") {
  sim = createSimulation();
  mode = nextMode;
  running = true;
  paused = false;
  terminalHandled = false;
  lastStatus = "running";
  lastLogKey = "";
  refs.targets = [];
  ui.result.hidden = true;
  ui.briefing.hidden = true;
  buildTargetCards();

  if (nextMode === "demo") {
    setSpeed(2);
    issueAutoStart(sim);
    pushLocalEvent("command", "示范调度接管：三闸在目标前 0.08 m 依次关闭");
  } else if (nextMode === "overflow") {
    setSpeed(4);
    issueAutoStart(sim);
    pushLocalEvent("danger", "故障测试：B 闸未按计划关闭，保持至 45.6 s");
  } else {
    setSpeed(1);
    pushLocalEvent("command", "调度开始：启动泵组，再开启三座进水闸");
  }
  if (!audioEnabled) setAudio(true);
  syncUI();
}

function togglePause() {
  if (!running) return;
  paused = !paused;
  ui.pauseIcon.textContent = paused ? "▶" : "Ⅱ";
  ui.pauseLabel.textContent = paused ? "继续" : "暂停";
  ui.pauseButton.classList.toggle("active", paused);
  syncUI();
}

document.querySelector("#start-button").addEventListener("click", () => startRun("manual"));
document.querySelector("#brief-button").addEventListener("click", () => startRun("demo"));
document.querySelector("#retry-button").addEventListener("click", () => startRun("manual"));
document.querySelector("#result-demo-button").addEventListener("click", () => startRun("demo"));
document.querySelector("#overflow-test-button").addEventListener("click", () => startRun("overflow"));
ui.pauseButton.addEventListener("click", togglePause);
ui.audioButton.addEventListener("click", () => setAudio(!audioEnabled));

refs.speeds.forEach((button) => {
  button.addEventListener("click", () => setSpeed(Number(button.dataset.speed)));
});

refs.pumps.forEach((button) => {
  button.addEventListener("click", () => {
    togglePump(sim, Number(button.dataset.index));
    syncUI();
  });
});

refs.gates.forEach((button) => {
  button.addEventListener("click", () => {
    toggleGate(sim, Number(button.dataset.index));
    syncUI();
  });
});

refs.canal.addEventListener("click", () => {
  toggleCanal(sim);
  syncUI();
});

window.addEventListener("keydown", (event) => {
  if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
  const tag = event.target?.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA") return;

  if (event.code === "KeyM") {
    event.preventDefault();
    setAudio(!audioEnabled);
    return;
  }
  if (!running) return;
  if (event.code === "KeyP") {
    event.preventDefault();
    togglePause();
    return;
  }
  if (paused) return;

  const actions = {
    Digit1: () => togglePump(sim, 0),
    Numpad1: () => togglePump(sim, 0),
    Digit2: () => togglePump(sim, 1),
    Numpad2: () => togglePump(sim, 1),
    KeyQ: () => toggleGate(sim, 0),
    KeyW: () => toggleGate(sim, 1),
    KeyE: () => toggleGate(sim, 2),
    Space: () => toggleCanal(sim),
  };
  const action = actions[event.code];
  if (!action) return;
  event.preventDefault();
  action();
  syncUI();
});

function frame(now) {
  const elapsed = Math.min(0.1, Math.max(0, (now - lastFrame) / 1000));
  lastFrame = now;
  visualTime += elapsed;

  if (running && !paused) {
    if (mode !== "manual") applyAutoControls(sim, mode);
    stepSimulation(sim, elapsed * speed);
    if (sim.status !== "running") showResult();
  }

  renderer.render(sim, visualTime);
  audio.update(sim);
  syncUI();
  requestAnimationFrame(frame);
}

buildTargetCards();
setSpeed(1);
syncUI();
requestAnimationFrame(frame);

window.__pumpStation = {
  getSimulation: () => sim,
  startDemo: () => startRun("demo"),
  startOverflowTest: () => startRun("overflow"),
  getMode: () => mode,
};
