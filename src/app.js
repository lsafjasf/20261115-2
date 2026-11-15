import {
  EDGE_BY_ID,
  NODE_BY_ID,
  STATIONS,
  formatClock,
  getNode,
} from "./graph.js";
import {
  FIXED_SCENARIO,
  WRONG_ROUTE_SCENARIO,
  TransitSimulation,
  runBlockingTest,
} from "./simulation.js";
import { TunnelRenderer } from "./renderer.js";
import { MaglevAudio } from "./audio.js";

const dom = {
  canvas: document.querySelector("#tunnel-canvas"),
  podList: document.querySelector("#pod-list"),
  stopList: document.querySelector("#stop-list"),
  prioritySelect: document.querySelector("#priority-select"),
  addStopSelect: document.querySelector("#add-stop-select"),
  addStopButton: document.querySelector("#add-stop-button"),
  editorTitle: document.querySelector("#editor-title"),
  editorOrigin: document.querySelector("#editor-origin"),
  editorTaskCount: document.querySelector("#editor-task-count"),
  editorNote: document.querySelector("#editor-note"),
  startButton: document.querySelector("#start-button"),
  faultButton: document.querySelector("#fault-button"),
  resetButton: document.querySelector("#reset-button"),
  quickTestButton: document.querySelector("#quick-test-button"),
  soundToggle: document.querySelector("#sound-toggle"),
  helpButton: document.querySelector("#help-button"),
  helpDialog: document.querySelector("#help-dialog"),
  helpClose: document.querySelector("#help-close"),
  helpStart: document.querySelector("#help-start"),
  testButton: document.querySelector("#test-button"),
  eventLog: document.querySelector("#event-log"),
  logCount: document.querySelector("#log-count"),
  headerStatus: document.querySelector("#header-status"),
  missionClock: document.querySelector("#mission-clock"),
  missionBadge: document.querySelector("#mission-badge"),
  statComplete: document.querySelector("#stat-complete"),
  statReroute: document.querySelector("#stat-reroute"),
  statYield: document.querySelector("#stat-yield"),
  hudOccupied: document.querySelector("#hud-occupied"),
  hudConflict: document.querySelector("#hud-conflict"),
  scenarioName: document.querySelector("#scenario-name"),
  toastRegion: document.querySelector("#toast-region"),
};

const STATE_LABELS = {
  ready: "待发",
  moving: "行驶",
  waiting: "等待",
  dwelling: "换乘",
  complete: "完成",
  faulted: "故障",
  stranded: "受阻",
};

let simulation = new TransitSimulation({ scenario: FIXED_SCENARIO });
let activeScenario = FIXED_SCENARIO;
let activePodId = simulation.pods[0].id;
let speed = 1;
let lastFrame = 0;
let lastUiRefresh = 0;
let lastAudioPulse = 0;
let renderedEventId = 0;
let reportDialog = null;

const renderer = new TunnelRenderer(dom.canvas, simulation);
const audio = new MaglevAudio();

function stationName(nodeId) {
  return getNode(nodeId)?.name ?? nodeId;
}

function stateClass(state) {
  if (["moving", "waiting", "complete", "faulted"].includes(state)) return state;
  return "";
}

function renderPodList() {
  dom.podList.innerHTML = simulation.pods
    .map((pod) => {
      const route = pod.stops.map((stop) => stationName(stop)).join("<i></i>");
      return `
        <button
          type="button"
          class="pod-card ${pod.id === activePodId ? "selected" : ""}"
          data-pod-id="${pod.id}"
          style="--pod-color:${pod.color}"
        >
          <span class="pod-swatch"></span>
          <span class="pod-main">
            <span class="pod-titleline">
              <strong>${pod.name}</strong>
              <span class="priority-pill">P${pod.priority}</span>
            </span>
            <span class="pod-route">${stationName(pod.origin)}<i></i>${route || "无目的地"}</span>
          </span>
          <span class="pod-status ${stateClass(pod.state)}">${STATE_LABELS[pod.state] ?? pod.state}</span>
        </button>
      `;
    })
    .join("");
}

function renderEditor() {
  const pod = simulation.podById.get(activePodId);
  if (!pod) return;
  const locked = simulation.running || simulation.paused;

  dom.editorTitle.textContent = `${pod.name.split("-")[0]} 线路`;
  dom.editorOrigin.textContent = stationName(pod.origin);
  dom.editorTaskCount.textContent = `${pod.stops.length} 站`;
  dom.prioritySelect.innerHTML = Array.from(
    { length: 9 },
    (_, index) => `<option value="${index + 1}">${index + 1} · ${index < 3 ? "低" : index < 7 ? "中" : "高"}</option>`,
  ).join("");
  dom.prioritySelect.value = String(pod.priority);
  dom.prioritySelect.disabled = locked;

  dom.stopList.innerHTML = pod.stops.length
    ? pod.stops
        .map(
          (stop, index) => `
            <li class="stop-row">
              <span class="stop-index">${String(index + 1).padStart(2, "0")}</span>
              <span class="stop-name">${stationName(stop)}</span>
              <span class="stop-actions">
                <button type="button" data-stop-action="up" data-index="${index}" ${locked || index === 0 ? "disabled" : ""} aria-label="上移">↑</button>
                <button type="button" data-stop-action="down" data-index="${index}" ${locked || index === pod.stops.length - 1 ? "disabled" : ""} aria-label="下移">↓</button>
                <button type="button" class="remove" data-stop-action="remove" data-index="${index}" ${locked || pod.stops.length === 1 ? "disabled" : ""} aria-label="移除">×</button>
              </span>
            </li>
          `,
        )
        .join("")
    : `<li class="empty-stops">尚未设置目的地</li>`;

  const available = STATIONS.filter((station) => !pod.stops.includes(station.id));
  dom.addStopSelect.innerHTML = available.length
    ? available
        .map((station) => `<option value="${station.id}">${station.code} · ${station.name}</option>`)
        .join("")
    : `<option value="">全部站点已加入</option>`;
  dom.addStopSelect.disabled = locked || available.length === 0;
  dom.addStopButton.disabled = locked || available.length === 0;

  if (locked) {
    dom.editorNote.textContent = simulation.paused
      ? "调度暂停中。继续运行后可观察新的区间请求。"
      : "调度进行中，线路与优先权已锁定；复位后可重新编辑。";
  } else {
    dom.editorNote.textContent = "编辑后点击“开始调度”，系统会自动寻径并独占区间。";
  }
  renderer.setSelectedPod(activePodId);
}

function updateReadouts() {
  const occupied = simulation.occupancy.size;
  const conflict = simulation.metrics.headOnHolds;
  dom.hudOccupied.textContent = `${occupied} / 9`;
  dom.hudConflict.classList.toggle("active", conflict > 0);
  dom.hudConflict.querySelector("strong").textContent = String(conflict);
  dom.statComplete.textContent = `${simulation.metrics.completed} / 4`;
  dom.statReroute.textContent = String(simulation.metrics.reroutes);
  dom.statYield.textContent = String(simulation.metrics.yields);
  dom.missionClock.textContent = formatClock(simulation.elapsed);
  dom.scenarioName.textContent = activeScenario.name;

  const faulted = simulation.pods.some((pod) => pod.state === "faulted");
  let status = "等待调度";
  let badge = "待发";
  let badgeClass = "";
  if (simulation.status === "success") {
    status = "四舱任务完成";
    badge = "成功";
    badgeClass = "success";
  } else if (faulted) {
    status = "故障处置中";
    badge = "故障";
    badgeClass = "fault";
  } else if (simulation.paused) {
    status = "调度暂停";
    badge = "暂停";
    badgeClass = "running";
  } else if (simulation.running) {
    status = "自动调度运行中";
    badge = "运行";
    badgeClass = "running";
  }
  dom.headerStatus.textContent = status;
  dom.missionBadge.textContent = badge;
  dom.missionBadge.className = `mission-badge ${badgeClass}`;
  updateControlButtons();
}

function updateControlButtons() {
  const success = simulation.status === "success";
  const running = simulation.running;
  dom.startButton.classList.toggle("running", running && !simulation.paused);
  const startLabel = dom.startButton.querySelector("span:last-child");
  startLabel.textContent = success
    ? "再次调度"
    : running && !simulation.paused
      ? "暂停调度"
      : running && simulation.paused
        ? "继续运行"
        : "开始调度";
  dom.faultButton.disabled = !running || Boolean(simulation.fault) || success;
  dom.faultButton.querySelector("span:last-child").textContent = simulation.fault
    ? "故障处理中"
    : "注入前车故障";
  dom.testButton.disabled = running && !success;
  dom.quickTestButton.disabled = running && !success;
}

function addLogEntry(event) {
  if (!event) return;
  const placeholder = dom.eventLog.querySelector(".log-empty");
  if (placeholder) placeholder.remove();
  const entry = document.createElement("div");
  entry.className = `log-entry ${event.level ?? "info"}`;
  entry.innerHTML = `
    <span class="log-time">${formatClock(event.time)}</span>
    <span class="log-marker"></span>
    <span>${event.message}</span>
  `;
  dom.eventLog.append(entry);
  while (dom.eventLog.children.length > 80) dom.eventLog.firstElementChild.remove();
  dom.eventLog.scrollTop = dom.eventLog.scrollHeight;
  dom.logCount.textContent = `${simulation.events.length} 条`;
  renderedEventId = event.id;
}

function renderLog() {
  dom.eventLog.innerHTML = "";
  if (simulation.events.length === 0) {
    dom.eventLog.innerHTML = `<div class="log-empty">调度事件将在这里出现</div>`;
    dom.logCount.textContent = "0 条";
    renderedEventId = 0;
    return;
  }
  dom.eventLog.innerHTML = `<div class="log-empty">调度事件将在这里出现</div>`;
  const fragment = document.createDocumentFragment();
  for (const event of simulation.events) {
    const entry = document.createElement("div");
    entry.className = `log-entry ${event.level ?? "info"}`;
    entry.innerHTML = `
      <span class="log-time">${formatClock(event.time)}</span>
      <span class="log-marker"></span>
      <span>${event.message}</span>
    `;
    fragment.append(entry);
  }
  dom.eventLog.innerHTML = "";
  dom.eventLog.append(fragment);
  dom.eventLog.scrollTop = dom.eventLog.scrollHeight;
  dom.logCount.textContent = `${simulation.events.length} 条`;
  renderedEventId = simulation.events.at(-1)?.id ?? 0;
}

function showToast(message, level = "info") {
  const toast = document.createElement("div");
  toast.className = `toast ${level}`;
  toast.textContent = message;
  dom.toastRegion.append(toast);
  window.setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(4px)";
    window.setTimeout(() => toast.remove(), 220);
  }, 3600);
}

function handleSimulationEvent(event) {
  addLogEntry(event);
  if (event.level === "danger" || event.level === "warn" || event.level === "success") {
    const now = performance.now();
    if (now - lastAudioPulse > 280) {
      audio.pulse(event.level);
      lastAudioPulse = now;
    }
  }
  if (event.type === "danger" && event.podId !== "system") {
    showToast(event.message, "danger");
  }
  if (
    event.level === "success" &&
    event.message.startsWith("任务完成") &&
    audio.enabled
  ) {
    audio.chime();
    showToast("四舱交班完成：全部区间已释放", "success");
  }
}

function onSimulationEvent(event) {
  if (event.id > renderedEventId) handleSimulationEvent(event);
  updateReadouts();
}

function loadScenario(scenario) {
  simulation = new TransitSimulation({ scenario });
  activeScenario = scenario;
  activePodId = simulation.pods[0]?.id ?? null;
  simulation.onEvent(onSimulationEvent);
  renderer.setSimulation(simulation);
  renderPodList();
  renderEditor();
  renderLog();
  updateReadouts();
}

function captureCurrentRoutes() {
  return {
    ...activeScenario,
    pods: simulation.pods.map((pod) => ({
      id: pod.id,
      name: pod.name,
      color: pod.color,
      origin: pod.origin,
      stops: [...pod.stops],
      priority: pod.priority,
    })),
  };
}

function startCurrentScenario() {
  const invalid = simulation.pods.find((pod) => pod.stops.length === 0);
  if (invalid) {
    showToast(`${invalid.name} 还没有目的地，请先编辑线路`, "danger");
    return;
  }
  if (simulation.status === "success") {
    const scenario = captureCurrentRoutes();
    loadScenario(scenario);
    simulation.start();
  } else if (simulation.running) {
    simulation.pause();
  } else {
    simulation.start();
  }
  renderPodList();
  renderEditor();
  updateReadouts();
}

function faultCurrentScenario() {
  if (!simulation.running || simulation.fault) return;
  const injected = simulation.injectFault();
  if (injected) {
    showToast("前车故障已注入：故障区间闭锁，后车开始寻找备用路径", "danger");
    renderPodList();
    renderEditor();
  }
  updateReadouts();
}

function resetScenario() {
  loadScenario(FIXED_SCENARIO);
  showToast("固定场景已复位", "info");
}

function updateDraftStops(mutator) {
  const pod = simulation.podById.get(activePodId);
  if (!pod || simulation.running) return;
  const stops = [...pod.stops];
  mutator(stops);
  if (stops.length === 0) return;
  simulation.setStops(pod.id, stops);
  renderPodList();
  renderEditor();
  updateReadouts();
}

function bindControls() {
  dom.startButton.addEventListener("click", startCurrentScenario);
  dom.faultButton.addEventListener("click", faultCurrentScenario);
  dom.resetButton.addEventListener("click", resetScenario);

  document.querySelectorAll("[data-speed]").forEach((button) => {
    button.addEventListener("click", () => {
      speed = Number(button.dataset.speed);
      document.querySelectorAll("[data-speed]").forEach((candidate) => {
        candidate.classList.toggle("active", candidate === button);
      });
    });
  });

  dom.podList.addEventListener("click", (event) => {
    const card = event.target.closest("[data-pod-id]");
    if (!card) return;
    activePodId = card.dataset.podId;
    renderPodList();
    renderEditor();
  });

  dom.prioritySelect.addEventListener("change", () => {
    if (simulation.running) return;
    simulation.setPriority(activePodId, dom.prioritySelect.value);
    renderPodList();
    renderEditor();
  });

  dom.addStopButton.addEventListener("click", () => {
    const station = dom.addStopSelect.value;
    if (!station) return;
    updateDraftStops((stops) => stops.push(station));
  });

  dom.stopList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-stop-action]");
    if (!button) return;
    const index = Number(button.dataset.index);
    updateDraftStops((stops) => {
      if (button.dataset.stopAction === "up" && index > 0) {
        [stops[index - 1], stops[index]] = [stops[index], stops[index - 1]];
      }
      if (button.dataset.stopAction === "down" && index < stops.length - 1) {
        [stops[index + 1], stops[index]] = [stops[index], stops[index + 1]];
      }
      if (button.dataset.stopAction === "remove" && stops.length > 1) {
        stops.splice(index, 1);
      }
    });
  });

  dom.soundToggle.addEventListener("click", async () => {
    if (!audio.enabled) {
      const enabled = await audio.enable();
      dom.soundToggle.setAttribute("aria-pressed", String(enabled));
      if (enabled) {
        showToast("磁悬浮声已启用：低频悬浮与区间气动噪声", "success");
      } else {
        showToast("当前浏览器不支持 Web Audio", "danger");
      }
    } else {
      await audio.disable();
      dom.soundToggle.setAttribute("aria-pressed", "false");
      showToast("环境声已关闭", "info");
    }
  });

  dom.helpButton.addEventListener("click", () => dom.helpDialog.showModal());
  dom.helpClose.addEventListener("click", () => dom.helpDialog.close());
  dom.helpStart.addEventListener("click", () => dom.helpDialog.close());
  dom.helpDialog.addEventListener("click", (event) => {
    if (event.target === dom.helpDialog) dom.helpDialog.close();
  });

  dom.testButton.addEventListener("click", openBlockingReport);
  dom.quickTestButton.addEventListener("click", openBlockingReport);
}

function openBlockingReport() {
  const report = runBlockingTest();
  const waitedName = report.waitedPodId
    ? simulation.pods.find((pod) => pod.id === report.waitedPodId)?.name ??
      report.waitedPodId.toUpperCase()
    : "低优先级舱";
  const reportName =
    WRONG_ROUTE_SCENARIO.pods.find((pod) => pod.id === report.waitedPodId)?.name ??
    waitedName;
  const waitValue =
    report.waitSeconds == null ? "—" : `${report.waitSeconds.toFixed(1)} s`;

  reportDialog?.remove();
  reportDialog = document.createElement("dialog");
  reportDialog.className = "test-report";
  reportDialog.innerHTML = `
    <div class="report-head">
      <div class="report-status">
        <i>${report.pass ? "✓" : "!"}</i>
        <div>
          <strong>${report.pass ? "阻塞测试通过" : "阻塞测试未通过"}</strong>
          <span>HEADLESS RUN / ${formatClock(report.elapsed, false)}</span>
        </div>
      </div>
      <button class="report-close" type="button" data-report-close>关闭</button>
    </div>
    <div class="report-grid">
      <div class="report-stat"><span>冲突区间</span><strong>${report.conflictEdgeLabel.replace("—", " / ")}</strong></div>
      <div class="report-stat"><span>低优先等待</span><strong>${waitValue}</strong></div>
      <div class="report-stat"><span>交会闭锁</span><strong>${report.headOnHolds}</strong></div>
      <div class="report-stat"><span>区间重复占用</span><strong>${Math.max(0, report.maxOccupancyPerEdge - 1)}</strong></div>
    </div>
    <div class="report-body">
      <p>两辆舱被排成对向线路，同时请求 ${report.conflictEdgeLabel}。${reportName} 在岔点等待前车完全驶离；区间释放后继续运行，四舱均完成任务，未发生正面相遇。</p>
      <ul class="report-assertions">
        ${report.assertions
          .map((assertion) => `<li>${assertion.pass ? "" : "未通过："}${assertion.label}</li>`)
          .join("")}
      </ul>
      <div class="report-actions">
        <button class="primary-button" type="button" data-report-play>在画布播放错误线路</button>
        <button class="ghost-button" type="button" data-report-close>返回固定场景</button>
      </div>
    </div>
  `;
  document.body.append(reportDialog);
  reportDialog.addEventListener("click", (event) => {
    if (event.target === reportDialog) {
      reportDialog.close();
      reportDialog.remove();
      reportDialog = null;
      return;
    }
    if (event.target.closest("[data-report-close]")) {
      reportDialog.close();
      reportDialog.remove();
      reportDialog = null;
      return;
    }
    if (event.target.closest("[data-report-play]")) {
      reportDialog.close();
      reportDialog.remove();
      reportDialog = null;
      loadScenario(WRONG_ROUTE_SCENARIO);
      window.setTimeout(() => simulation.start(), 120);
      showToast("错误线路已载入画布，观察低优先级舱的等待过程", "warn");
    }
  });
  reportDialog.showModal();
}

function frame(now) {
  if (!lastFrame) lastFrame = now;
  const dt = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;

  if (simulation.running && !simulation.paused && !document.hidden) {
    simulation.step(dt * speed);
  }

  renderer.render(now);
  audio.update(simulation);

  if (now - lastUiRefresh > 140) {
    lastUiRefresh = now;
    updateReadouts();
    renderPodList();
  }
  requestAnimationFrame(frame);
}

function initialize() {
  simulation.onEvent(onSimulationEvent);
  bindControls();
  renderPodList();
  renderEditor();
  renderLog();
  updateReadouts();
  requestAnimationFrame(frame);
}

initialize();
