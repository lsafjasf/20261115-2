import "@fontsource-variable/noto-sans-sc";
import "@fontsource-variable/jetbrains-mono";
import "./styles.css";
import { createColdChainGame, formatClock, temperatureColor } from "./sim.js";
import { MapRenderer } from "./canvas.js";
import { FridgeAudio } from "./audio.js";

const ui = {
  ambient: document.querySelector("#ambient-readout"),
  clock: document.querySelector("#clock-readout"),
  missionState: document.querySelector("#mission-state"),
  progress: document.querySelector("#progress-readout"),
  truckList: document.querySelector("#truck-list"),
  swapGrid: document.querySelector("#swap-grid"),
  eventLog: document.querySelector("#event-log"),
  primary: document.querySelector("#primary-action"),
  primaryLabel: document.querySelector("#primary-label"),
  pause: document.querySelector("#pause-btn"),
  sound: document.querySelector("#sound-toggle"),
  soundLabel: document.querySelector("#sound-label"),
  overlay: document.querySelector("#result-overlay"),
  resultCard: document.querySelector(".result-card"),
  resultKicker: document.querySelector("#result-kicker"),
  resultStamp: document.querySelector("#result-stamp"),
  resultTitle: document.querySelector("#result-title"),
  resultSummary: document.querySelector("#result-summary"),
  resultStats: document.querySelector("#result-stats"),
  review: document.querySelector("#result-review"),
  restart: document.querySelector("#result-restart"),
  close: document.querySelector("#result-close"),
  toast: document.querySelector("#toast"),
};

const TRUCK_REFERENCE_OPTIONS = [
  ["north", "北线"],
  ["direct", "中线"],
  ["south", "南线"],
];
const COOLING_REFERENCE_OPTIONS = [
  ["eco", "ECO"],
  ["norm", "NORM"],
  ["max", "MAX"],
];

let game = createColdChainGame();
let snapshot = game.getSnapshot();
let speed = 1;
let lastRender = -1;
let lastEvents = -1;
let overlayShown = false;
let toastTimer = 0;
let frameTime = performance.now();
let soundDefaultApplied = false;

const map = new MapRenderer(document.querySelector("#map-canvas"));
const audio = new FridgeAudio();

function segmentedButtons(kind, truck, options) {
  return options
    .map(
      ([value, label]) => `
        <button
          type="button"
          data-action="${kind}"
          data-value="${value}"
          ${truck[kind === "route" ? "route" : "cooling"] === value ? "class=\"active\"" : ""}
        >${label}</button>
      `,
    )
    .join("");
}

function buildTruckCards() {
  ui.truckList.innerHTML = snapshot.trucks
    .map(
      (truck, index) => `
        <article class="truck-card" data-truck-id="${truck.id}" style="--truck-color:${truck.color}">
          <div class="truck-head">
            <span class="truck-index">${String(index + 1).padStart(2, "0")}</span>
            <div class="truck-name">
              <strong>${truck.id} · ${truck.callsign}</strong>
              <small>${truck.routeInfo.label} / ${truck.routeInfo.km.toFixed(1)} KM · ${truck.driver}</small>
            </div>
            <span class="truck-status">${truck.status}</span>
          </div>
          <div class="truck-telemetry">
            <div class="telemetry-value">
              <span>货温</span>
              <b class="temp-value" data-field="temperature">--</b>
            </div>
            <div class="telemetry-value battery-inline">
              <span>电量</span>
              <b data-field="battery">--</b>
              <i class="battery-bar"><em data-field="battery-bar"></em></i>
            </div>
            <div class="telemetry-value">
              <span>预计抵达</span>
              <b data-field="eta">--</b>
            </div>
            <button type="button" class="door-btn" data-action="door" aria-label="${truck.id} 开箱核验">
              开箱 +温
            </button>
          </div>
          <div class="truck-options">
            <div class="option-group">
              <span class="option-label">ROUTE</span>
              <div class="segmented route" role="group" aria-label="${truck.id} 路线">
                ${segmentedButtons("route", truck, TRUCK_REFERENCE_OPTIONS)}
              </div>
            </div>
            <div class="option-group">
              <span class="option-label">COOL</span>
              <div class="segmented cooling" role="group" aria-label="${truck.id} 制冷档位">
                ${segmentedButtons("cooling", truck, COOLING_REFERENCE_OPTIONS)}
              </div>
            </div>
          </div>
        </article>
      `,
    )
    .join("");
  cacheTruckNodes();
}

function cacheTruckNodes() {
  ui.truckCards = new Map(
    [...ui.truckList.querySelectorAll(".truck-card")].map((node) => [
      node.dataset.truckId,
      {
        card: node,
        status: node.querySelector(".truck-status"),
        temp: node.querySelector('[data-field="temperature"]'),
        battery: node.querySelector('[data-field="battery"]'),
        batteryBar: node.querySelector('[data-field="battery-bar"]'),
        eta: node.querySelector('[data-field="eta"]'),
        door: node.querySelector('[data-action="door"]'),
        routeButtons: [...node.querySelectorAll('[data-action="route"]')],
        coolingButtons: [...node.querySelectorAll('[data-action="cooling"]')],
      },
    ]),
  );
}

function renderTrucks(next) {
  for (const truck of next.trucks) {
    const nodes = ui.truckCards.get(truck.id);
    if (!nodes) continue;
    const temp = truck.finalTemp ?? truck.temperature;
    const critical =
      temp >= next.limit ||
      truck.battery <= 12 ||
      truck.temperatureState === "breach";
    nodes.card.classList.toggle("is-arrived", truck.state === "arrived");
    nodes.card.classList.toggle("is-critical", critical);
    nodes.card.style.setProperty("--truck-temp", temperatureColor(temp));
    const statusClass =
      temp >= next.limit || truck.battery <= 0
        ? "status-danger"
        : truck.state === "arrived"
          ? "status-good"
          : "";
    nodes.status.className = `truck-status ${statusClass}`;
    nodes.status.textContent = truck.status;
    nodes.temp.innerHTML = `${temp.toFixed(1)}<small>°C</small>`;
    nodes.battery.textContent = `${Math.round(truck.battery)}%`;
    nodes.batteryBar.style.width = `${Math.max(1, truck.battery)}%`;
    nodes.batteryBar.classList.toggle("is-low", truck.battery <= 18);
    nodes.eta.textContent = truck.state === "arrived"
      ? formatClock(truck.arrivalTime)
      : `~${formatClock(truck.estimatedArrival)}`;

    const routeLocked = next.phase !== "planning";
    for (const button of nodes.routeButtons) {
      button.classList.toggle("active", button.dataset.value === truck.route);
      button.disabled = routeLocked;
    }
    const coolingLocked =
      next.complete || truck.state === "arrived";
    for (const button of nodes.coolingButtons) {
      button.classList.toggle(
        "active",
        button.dataset.value === truck.cooling,
      );
      button.disabled = coolingLocked;
    }
    nodes.door.disabled =
      next.phase !== "running" || truck.state === "arrived";
  }
}

function renderSwap(next) {
  const stationCards = Object.values(next.stations)
    .map((station) => {
      const active = Boolean(station.active);
      const rows = station.entries.length
        ? station.entries
            .map((entry, index) => {
              const statusText =
                entry.status === "swapping"
                  ? "换电中"
                  : entry.status === "waiting"
                    ? "排队"
                    : next.phase === "planning"
                      ? "待发"
                      : "途中";
              return `
                <div class="queue-item ${entry.status === "swapping" ? "is-swapping" : ""}">
                  <span class="queue-rank">${String(index + 1).padStart(2, "0")}</span>
                  <span style="color:${entry.color}">${entry.id} · ${entry.callsign}</span>
                  <span class="queue-eta">${statusText}</span>
                  <span>
                    <button type="button" data-action="priority" data-station="${station.id}" data-truck="${entry.id}" data-direction="-1" ${index === 0 ? "disabled" : ""} aria-label="提高 ${entry.id} 换电优先级">↑</button>
                    <button type="button" data-action="priority" data-station="${station.id}" data-truck="${entry.id}" data-direction="1" ${index === station.entries.length - 1 ? "disabled" : ""} aria-label="降低 ${entry.id} 换电优先级">↓</button>
                  </span>
                </div>
              `;
            })
            .join("")
        : '<div class="queue-item is-empty">暂无车辆</div>';
      return `
        <div class="swap-station ${active ? "is-active" : ""}">
          <div class="swap-station-head">
            <b>${station.label}</b>
            <span class="swap-capacity">${active ? "换电中" : "1 工位"}</span>
          </div>
          <div class="swap-queue">${rows}</div>
        </div>
      `;
    })
    .join("");
  ui.swapGrid.innerHTML = stationCards;
}

function renderEventLog(next) {
  if (next.eventSerial === lastEvents) return;
  lastEvents = next.eventSerial;
  ui.eventLog.innerHTML = next.events
    .slice(-18)
    .map(
      (event) => `
        <div class="log-entry ${event.type ? `is-${event.type}` : ""}">
          <time>${event.clock}</time>
          <span>${event.message}</span>
        </div>
      `,
    )
    .join("");
  ui.eventLog.scrollTop = ui.eventLog.scrollHeight;
}

function renderControls(next) {
  ui.ambient.innerHTML = `${next.ambient.toFixed(1)}°C <i>↑</i>`;
  ui.clock.textContent = next.clock;
  ui.progress.textContent = `${Math.round(next.progress * 100)}%`;
  const stateLabel = {
    planning: "等待发车",
    running: "运输执行中",
    paused: "仿真已暂停",
    complete: next.result?.success ? "任务完成" : "任务失败",
  }[next.phase];
  ui.missionState.textContent = stateLabel;

  const labels = {
    planning: ["开始运输", false],
    running: ["运输执行中", true],
    paused: ["继续运输", false],
    complete: ["重新规划", false],
  };
  const [label, disabled] = labels[next.phase];
  ui.primaryLabel.textContent = label;
  ui.primary.disabled = disabled;
  ui.pause.disabled = next.phase === "planning" || next.complete;
  ui.pause.classList.toggle("is-paused", next.phase === "paused");
  ui.pause.textContent = next.phase === "paused" ? "▶" : "Ⅱ";
}

function renderResult(next) {
  if (!next.complete || !next.result || overlayShown) return;
  overlayShown = true;
  const result = next.result;
  const maxTemp = Math.max(
    ...next.trucks.map((truck) => truck.finalTemp ?? truck.temperature),
  );
  ui.resultCard.classList.toggle("is-failure", !result.success);
  ui.resultKicker.textContent = result.success
    ? "MISSION COMPLETE / REPORT 04"
    : "MISSION FAILED / REPORT 04";
  ui.resultStamp.textContent = result.success ? "通过" : "失败";
  ui.resultTitle.textContent = result.success
    ? "药品安全抵达"
    : result.outcome === "cold-chain-breach"
      ? "货温超限，药品拦截"
      : result.outcome === "late"
        ? "准点车辆不足"
        : "任务时钟耗尽";
  ui.resultSummary.textContent = result.summary;
  ui.resultStats.innerHTML = `
    <div class="result-stat">
      <span>安全抵达</span>
      <strong class="${result.unsafe.length ? "is-bad" : "is-good"}">${result.safe}/3</strong>
    </div>
    <div class="result-stat">
      <span>准点车辆</span>
      <strong class="${result.onTime >= 2 ? "is-good" : "is-bad"}">${result.onTime}/3</strong>
    </div>
    <div class="result-stat">
      <span>最高到场货温</span>
      <strong class="${maxTemp >= next.limit ? "is-bad" : ""}">${maxTemp.toFixed(1)}°C</strong>
    </div>
  `;
  ui.overlay.hidden = false;
}

function renderAll(next = game.getSnapshot()) {
  snapshot = next;
  renderControls(next);
  renderTrucks(next);
  renderSwap(next);
  renderEventLog(next);
  renderResult(next);
}

function showToast(message, alert = false) {
  clearTimeout(toastTimer);
  ui.toast.textContent = message;
  ui.toast.classList.toggle("is-alert", alert);
  ui.toast.classList.add("is-visible");
  toastTimer = window.setTimeout(() => {
    ui.toast.classList.remove("is-visible");
  }, 2600);
}

async function enableSound() {
  try {
    const enabled = await audio.toggle();
    setSoundButton(enabled);
    return enabled;
  } catch {
    showToast("当前浏览器无法启动 Web Audio", true);
    return false;
  }
}

function setSoundButton(enabled) {
  ui.sound.setAttribute("aria-pressed", String(enabled));
  ui.soundLabel.textContent = enabled ? "音频开启" : "音频关闭";
}

function resetGame(config = null) {
  game = createColdChainGame();
  if (config?.trucks) {
    for (const truck of config.trucks) {
      if (truck.route) game.setRoute(truck.id, truck.route);
      if (truck.cooling) game.setCooling(truck.id, truck.cooling);
    }
  }
  overlayShown = false;
  lastEvents = -1;
  ui.overlay.hidden = true;
  buildTruckCards();
  renderAll();
}

function handlePrimary() {
  if (snapshot.phase === "planning") {
    game.start();
    renderAll();
    showToast("运输开始：留意外温、货温与换电队列");
    if (!soundDefaultApplied) {
      soundDefaultApplied = true;
      enableSound();
    }
    return;
  }
  if (snapshot.phase === "paused") {
    game.togglePause();
    renderAll();
    return;
  }
  if (snapshot.phase === "complete") {
    resetGame();
    showToast("固定场景已重置，可重新规划");
  }
}

ui.primary.addEventListener("click", handlePrimary);

ui.pause.addEventListener("click", () => {
  game.togglePause();
  renderAll();
});

document.querySelectorAll(".speed-btn").forEach((button) => {
  button.addEventListener("click", () => {
    speed = Number(button.dataset.speed);
    document.querySelectorAll(".speed-btn").forEach((item) => {
      item.classList.toggle("active", item === button);
    });
  });
});

ui.sound.addEventListener("click", async () => {
  soundDefaultApplied = true;
  const enabled = await audio.toggle().catch(() => false);
  setSoundButton(enabled);
});

ui.truckList.addEventListener("click", (event) => {
  const action = event.target.closest("[data-action]");
  const card = event.target.closest("[data-truck-id]");
  if (!action || !card) return;
  const truckId = card.dataset.truckId;
  if (action.dataset.action === "route") {
    if (game.setRoute(truckId, action.dataset.value)) {
      buildTruckCards();
      renderAll();
    }
  } else if (action.dataset.action === "cooling") {
    game.setCooling(truckId, action.dataset.value);
    renderAll();
  } else if (action.dataset.action === "door") {
    if (game.openDoor(truckId)) {
      showToast(`${truckId} 已开箱，货温正在快速上升`, true);
      renderAll();
    }
  }
});

ui.swapGrid.addEventListener("click", (event) => {
  const button = event.target.closest('[data-action="priority"]');
  if (!button) return;
  game.setPriority(
    button.dataset.station,
    button.dataset.truck,
    Number(button.dataset.direction),
  );
  renderAll();
});

ui.close.addEventListener("click", () => {
  ui.overlay.hidden = true;
});

ui.review.addEventListener("click", () => {
  ui.overlay.hidden = true;
});

ui.restart.addEventListener("click", () => {
  resetGame();
  showToast("固定场景已重置，可重新规划");
});

ui.overlay.addEventListener("click", (event) => {
  if (event.target === ui.overlay) ui.overlay.hidden = true;
});

document.addEventListener("keydown", (event) => {
  if (event.code !== "Space") return;
  const tag = document.activeElement?.tagName;
  if (tag === "BUTTON" || tag === "INPUT" || tag === "TEXTAREA") return;
  if (snapshot.phase === "running" || snapshot.phase === "paused") {
    event.preventDefault();
    game.togglePause();
    renderAll();
  }
});

function frame(now) {
  const delta = Math.min(0.12, Math.max(0, (now - frameTime) / 1000));
  frameTime = now;
  if (snapshot.phase === "running" && !document.hidden) {
    game.advance(delta * speed);
  }
  const next = game.getSnapshot();
  map.render(next, now);
  audio.update(next.audioLoad);

  if (now - lastRender >= 90) {
    lastRender = now;
    renderAll(next);
  }
  requestAnimationFrame(frame);
}

function loadScenario(name) {
  if (name === "power-failure") {
    resetGame({
      trucks: [
        { id: "T-01", route: "direct", cooling: "max" },
        { id: "T-02", route: "direct", cooling: "norm" },
        { id: "T-03", route: "south", cooling: "norm" },
      ],
    });
    showToast("测试场景：低电量车辆走中线并启用 MAX 制冷", true);
    return game.getSnapshot();
  }
  resetGame();
  return game.getSnapshot();
}

window.__polarFreight = {
  snapshot: () => game.getSnapshot(),
  loadScenario,
  start: () => {
    const started = game.start();
    renderAll();
    return started;
  },
  fastForward: (seconds = 90) => {
    if (snapshot.phase === "planning") game.start();
    game.advance(seconds);
    renderAll();
    return game.getSnapshot();
  },
  advance: (seconds) => {
    game.advance(seconds);
    renderAll();
    return game.getSnapshot();
  },
  setRoute: (truckId, routeId) => {
    const changed = game.setRoute(truckId, routeId);
    buildTruckCards();
    renderAll();
    return changed;
  },
  setCooling: (truckId, modeId) => {
    const changed = game.setCooling(truckId, modeId);
    renderAll();
    return changed;
  },
  setPriority: (stationId, truckId, direction) =>
    game.setPriority(stationId, truckId, direction),
  reset: () => resetGame(),
  setSpeed: (value) => {
    speed = value;
  },
  get speed() {
    return speed;
  },
};

buildTruckCards();
renderAll();
setSoundButton(false);
requestAnimationFrame(frame);
