import {
  CONTAINERS,
  SHIPS,
  attemptMove,
  advanceTime,
  clockTime,
  createGameState,
  getFinalEta,
  getSummary,
  getTopContainer,
  previewMove,
  roundTime
} from "./game.js";
import { CraneAudio } from "./audio.js";
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  YardRenderer,
  getShipCenter,
  getStackTopCenter,
  getTestPoint,
  hitTest
} from "./render.js";

const canvas = document.querySelector("#gameCanvas");
const renderer = new YardRenderer(canvas);
const audio = new CraneAudio();
const params = new URLSearchParams(window.location.search);
const animationScale = Math.max(0.03, Math.min(1, Number(params.get("tempo")) || 1));

const dom = {
  completedStat: document.querySelector("#completedStat"),
  laneStat: document.querySelector("#laneStat"),
  finalTimer: document.querySelector("#finalTimer"),
  clockReadout: document.querySelector("#clockReadout"),
  selectionStatus: document.querySelector("#selectionStatus"),
  cancelSelection: document.querySelector("#cancelSelection"),
  loadFill: document.querySelector("#loadFill"),
  loadReadout: document.querySelector("#loadReadout"),
  audioHz: document.querySelector("#audioHz"),
  waveform: document.querySelector(".waveform"),
  toast: document.querySelector("#toast"),
  pauseVeil: document.querySelector("#pauseVeil"),
  resultCard: document.querySelector("#resultCard"),
  resultEyebrow: document.querySelector("#resultEyebrow"),
  resultTitle: document.querySelector("#resultTitle"),
  resultCopy: document.querySelector("#resultCopy"),
  resultCompleted: document.querySelector("#resultCompleted"),
  resultMissed: document.querySelector("#resultMissed"),
  resultViolations: document.querySelector("#resultViolations"),
  resultTime: document.querySelector("#resultTime"),
  shipList: document.querySelector("#shipList"),
  soundButton: document.querySelector("#soundButton"),
  pauseButton: document.querySelector("#pauseButton"),
  rulesDialog: document.querySelector("#rulesDialog")
};

let state = createGameState();
let selection = null;
let hover = null;
let pointer = { x: 0, y: 0 };
let preview = null;
let animation = null;
let started = false;
let paused = false;
let lastFrame = performance.now();
let lastTickSecond = -1;
let toastTimer = 0;
let resultScheduled = false;
let lastShipRender = "";
let lastWaveUpdate = 0;

function startClock() {
  if (!started) {
    started = true;
    lastFrame = performance.now();
  }
}

function resetRound() {
  state = createGameState();
  selection = null;
  hover = null;
  preview = null;
  animation = null;
  started = false;
  paused = false;
  resultScheduled = false;
  lastTickSecond = -1;
  lastShipRender = "";
  lastFrame = performance.now();
  audio.stopLoad();
  dom.pauseVeil.hidden = true;
  dom.resultCard.hidden = true;
  dom.pauseButton.textContent = "暂停";
  hideToast();
  updateHud(true);
  renderShipList(true);
}

function togglePause(force) {
  if (state.phase !== "playing") return;
  if (animation) {
    showToast("吊机正在运行，落箱后再暂停", "error");
    return;
  }
  paused = typeof force === "boolean" ? force : !paused;
  dom.pauseVeil.hidden = !paused;
  dom.pauseButton.textContent = paused ? "继续" : "暂停";
  if (paused) {
    selection = null;
    hover = null;
    preview = null;
    audio.stopLoad();
    updateHud(true);
  }
  lastFrame = performance.now();
}

function openRules() {
  if (dom.rulesDialog.open) return;
  dom.rulesDialog.showModal();
}

function handleCanvasClick(event) {
  if (paused || state.phase !== "playing") return;
  const point = canvasPoint(event);
  pointer = point;
  const target = hitTest(point.x, point.y);
  hover = target;
  audio.ensure();
  if (!target) {
    clearSelection();
    return;
  }

  if (target.type === "stack") {
    startClock();
    const top = getTopContainer(state, target.stackId);
    if (!top) {
      if (selection) {
        tryMove(selection.stackId, { type: "stack", stackId: target.stackId });
      } else {
        showToast(`${target.stackId} 排为空，不能作为抓取点`);
      }
      return;
    }
    if (!selection) {
      selection = { type: "stack", stackId: target.stackId };
      preview = null;
      showToast(`已抓取 ${top.short} · ${top.weight}t · ${top.height}`);
      updateHud(true);
      return;
    }
    if (selection.stackId === target.stackId) {
      clearSelection();
      return;
    }
    tryMove(selection.stackId, { type: "stack", stackId: target.stackId });
    return;
  }

  if (target.type === "ship") {
    startClock();
    if (!selection) {
      showToast("先从垛顶抓起一只货柜，再选择船舶", "error");
      return;
    }
    tryMove(selection.stackId, { type: "ship", shipId: target.shipId });
    return;
  }

  if (target.type === "lane") {
    startClock();
    if (!selection) {
      showToast("中央通道为禁落区，必须保持畅通", "error");
      return;
    }
    tryMove(selection.stackId, { type: "lane" });
  }
}

function tryMove(sourceStackId, destination) {
  const check = previewMove(state, sourceStackId, destination);
  const container = getTopContainer(state, sourceStackId);
  if (!check.ok) {
    clearSelection();
    const before = state.phase;
    attemptMove(state, sourceStackId, destination);
    audio.playAlert();
    showToast(`${check.reason} · 扣 5 秒`, "error");
    updateHud(true);
    renderShipList(true);
    if (before === "playing" && state.phase !== "playing") scheduleResult();
    return;
  }

  const from =
    destination.type === "stack"
      ? getStackTopCenter(sourceStackId, state.stacks[sourceStackId].length)
      : getStackTopCenter(sourceStackId, state.stacks[sourceStackId].length);
  const result = attemptMove(state, sourceStackId, destination);
  if (!result.ok) {
    showToast(result.reason, "error");
    return;
  }

  const to =
    destination.type === "stack"
      ? getStackTopCenter(destination.stackId, state.stacks[destination.stackId].length)
      : getShipCenter(destination.shipId);
  animation = {
    containerId: container.id,
    from,
    to,
    reason: check.reason,
    kind: check.kind,
    destinationStack: destination.type === "stack" ? destination.stackId : null,
    destinationShip: destination.type === "ship" ? destination.shipId : null,
    startedAt: performance.now(),
    duration: 960 * animationScale,
    weight: container.weight,
    shipName: destination.type === "ship" ? state.ships[destination.shipId].name : null
  };
  selection = null;
  preview = null;
  startClock();
  audio.startLoad(container.weight);
  dom.loadFill.style.width = `${Math.round((container.weight / 34) * 100)}%`;
  dom.loadReadout.textContent = `${container.weight.toFixed(1)} t`;
  showToast(check.reason, "success");
  updateHud(true);
  renderShipList(true);
}

function completeAnimation() {
  if (!animation) return;
  const finished = animation;
  audio.stopLoad();
  audio.playDrop(finished.weight);
  if (finished.kind === "load") {
    window.setTimeout(() => audio.playLoadChime(), 150);
  }
  animation = null;
  dom.loadFill.style.width = "0%";
  dom.loadReadout.textContent = "0.0 t";
  dom.audioHz.textContent = "待机";
  dom.waveform.classList.remove("active");
  updateHud(true);
  renderShipList(true);
  if (state.phase !== "playing") {
    scheduleResult();
  } else if (finished.kind === "load") {
    showToast(`${finished.containerId} 已装上 ${finished.shipName}`, "success");
  } else {
    showToast(`${finished.containerId} 已安全落箱`);
  }
}

function scheduleResult() {
  if (resultScheduled) return;
  resultScheduled = true;
}

function maybeShowResult() {
  if (!resultScheduled || animation || !dom.resultCard.hidden) return;
  resultScheduled = false;
  hideToast();
  const summary = getSummary(state);
  const passed = summary.passed;
  dom.resultCard.hidden = false;
  dom.resultEyebrow.textContent = passed ? "SHIFT COMPLETE / PASS" : "SHIFT CLOSED / REVIEW";
  dom.resultTitle.textContent =
    summary.completed === 6 ? "六箱全装 · 满分" : passed ? "按时通关" : "班组未达标";
  dom.resultCopy.textContent = passed
    ? `末班船离港前完成 ${summary.completed} 只货柜，装卸通道保持畅通。${
        summary.missed ? "有货柜超时滞港。" : "没有货柜超时。"
      }`
    : `只完成 ${summary.completed} 只货柜，未达到 5 只通关线。先移开挡路箱，再按船期装船。`;
  dom.resultCompleted.textContent = `${summary.completed} / 6`;
  dom.resultMissed.textContent = String(summary.missed);
  dom.resultViolations.textContent = String(summary.violations);
  dom.resultTime.textContent = summary.elapsed;
  audio.stopLoad();
}

function frame(now) {
  const delta = Math.min(0.5, Math.max(0, (now - lastFrame) / 1000));
  lastFrame = now;

  if (started && !paused && state.phase === "playing") {
    const before = state.elapsed;
    advanceTime(state, delta);
    if (Math.floor(state.elapsed) !== lastTickSecond) {
      lastTickSecond = Math.floor(state.elapsed);
      const event = state.lastEvent;
      if (event?.type === "departure" && state.elapsed > before) {
        const ship = state.ships[event.shipId];
        const missed = ship.manifest.filter((id) => !ship.loaded.includes(id));
        showToast(
          `${ship.name} 已离港${missed.length ? ` · ${missed.length} 箱超时` : ""}`,
          missed.length ? "error" : "success"
        );
      }
      renderShipList();
    }
    if (state.phase !== "playing") scheduleResult();
  }

  if (animation && now - animation.startedAt >= animation.duration) {
    completeAnimation();
  }

  updateHud();
  updateAudioVisual(now);
  renderer.render(state, {
    time: now,
    selection,
    hover,
    pointer,
    preview,
    anim: animation
  });
  maybeShowResult();
  requestAnimationFrame(frame);
}

function clearSelection() {
  selection = null;
  preview = null;
  updateHud(true);
}

function canvasPoint(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * CANVAS_WIDTH,
    y: ((event.clientY - rect.top) / rect.height) * CANVAS_HEIGHT
  };
}

function updatePointer(event) {
  if (paused || state.phase !== "playing" || animation) return;
  pointer = canvasPoint(event);
  hover = hitTest(pointer.x, pointer.y);
  preview =
    selection && hover ? previewMove(state, selection.stackId, hover) : null;
  canvas.style.cursor = hover ? (selection ? "pointer" : "grab") : "default";
}

function updateHud(force = false) {
  const summary = getSummary(state);
  dom.completedStat.textContent = String(summary.completed);
  dom.laneStat.textContent = summary.laneClear ? "畅通" : "占用";
  dom.finalTimer.textContent = summary.finalEta;

  if (state.phase !== "playing") {
    dom.clockReadout.textContent = `作业结束 · ${summary.elapsed}`;
  } else if (!started) {
    dom.clockReadout.textContent = "待命 · 点击货柜开始计时";
  } else if (paused) {
    dom.clockReadout.textContent = `已暂停 · ${roundTime(state.elapsed)}`;
  } else {
    dom.clockReadout.textContent = `作业计时 · ${roundTime(state.elapsed)}`;
  }

  if (selection) {
    const container = getTopContainer(state, selection.stackId);
    dom.selectionStatus.innerHTML = container
      ? `<span class="selection-icon" aria-hidden="true">↑</span><span>已抓取 <strong>${container.short} · ${container.weight}t</strong><span class="selection-hint">选择堆位或对应船舶</span></span>`
      : `<span class="selection-icon" aria-hidden="true">＋</span><span><strong>先抓垛顶</strong>，再点目标堆位或对应船舶</span>`;
    dom.cancelSelection.hidden = false;
  } else if (force || !dom.cancelSelection.hidden) {
    dom.selectionStatus.innerHTML =
      '<span class="selection-icon" aria-hidden="true">＋</span><span><strong>先抓垛顶</strong>，再点目标堆位或对应船舶</span>';
    dom.cancelSelection.hidden = true;
  }
}

function renderShipList(force = false) {
  const key = `${state.revision}:${Math.floor(state.elapsed)}:${state.phase}`;
  if (!force && key === lastShipRender) return;
  lastShipRender = key;

  dom.shipList.innerHTML = SHIPS.map((definition) => {
    const ship = state.ships[definition.id];
    const remaining = Math.max(0, ship.deadline - state.elapsed);
    const status =
      ship.status === "departed"
        ? "已离港"
        : remaining <= 12
          ? "即将截止"
          : "接货中";
    const urgency =
      ship.status === "open" && remaining <= 12 ? "urgent" : "";
    const departure = ship.status === "departed" ? "departed" : "";
    const manifest = ship.manifest
      .map((containerId) => {
        const container = CONTAINERS[containerId];
        const loaded = ship.loaded.includes(containerId);
        const missed = ship.status === "departed" && !loaded;
        return `<span class="manifest-box ${loaded ? "loaded" : ""} ${missed ? "missed" : ""}">
          <b>${container.short}</b><small>${container.weight}t · ${container.height}</small>
        </span>`;
      })
      .join("");
    const progress = ship.manifest
      .map((containerId) => {
        const loaded = ship.loaded.includes(containerId);
        const missed = ship.status === "departed" && !loaded;
        return `<i class="${loaded ? "loaded" : missed ? "missed" : ""}"></i>`;
      })
      .join("");
    return `<article class="ship-card ${urgency} ${departure}" style="--ship-color:${definition.color}">
      <div class="ship-card-top">
        <span class="berth-tag">B${definition.berth}</span>
        <div>
          <h3>${definition.name}</h3>
          <span class="ship-english">${definition.english}</span>
        </div>
        <span class="ship-countdown">${clockTime(remaining)}</span>
      </div>
      <div class="ship-meta">
        <span>ETD ${clockTime(ship.deadline)} · ${status}</span>
        <span class="ship-progress" aria-label="装载进度">${progress}</span>
      </div>
      <div class="manifest-row">${manifest}</div>
    </article>`;
  }).join("");
}

function updateAudioVisual(now) {
  if (now - lastWaveUpdate < 65) return;
  lastWaveUpdate = now;
  const status = audio.getStatus();
  if (status.active) {
    dom.audioHz.textContent = `${status.loadWeight.toFixed(0)}t · ${status.hz.toFixed(0)} Hz`;
    dom.waveform.classList.add("active");
    for (const [index, bar] of [...dom.waveform.children].entries()) {
      const wave = 0.35 + Math.abs(Math.sin(now / 190 + index * 0.74)) * 0.65;
      bar.style.height = `${3 + wave * (11 + status.loadWeight * 0.42)}px`;
    }
  } else {
    dom.audioHz.textContent = audio.enabled ? "待机" : "静音";
    dom.waveform.classList.remove("active");
    for (const bar of dom.waveform.children) bar.style.height = "3px";
  }
}

function showToast(message, type = "") {
  window.clearTimeout(toastTimer);
  dom.toast.textContent = message;
  dom.toast.className = `toast visible ${type}`.trim();
  toastTimer = window.setTimeout(hideToast, type === "error" ? 2900 : 1900);
}

function hideToast() {
  dom.toast.className = "toast";
}

canvas.addEventListener("pointerdown", handleCanvasClick);
canvas.addEventListener("pointermove", updatePointer);
canvas.addEventListener("pointerleave", () => {
  hover = null;
  preview = null;
  canvas.style.cursor = "default";
});
canvas.addEventListener("contextmenu", (event) => event.preventDefault());
window.addEventListener("resize", () => renderer.resize());

dom.cancelSelection.addEventListener("click", clearSelection);
dom.pauseButton.addEventListener("click", () => togglePause());
dom.soundButton.addEventListener("click", () => {
  const enabled = audio.toggle();
  dom.soundButton.setAttribute("aria-pressed", String(enabled));
  dom.soundButton.querySelector(".button-label").textContent = enabled ? "声音开" : "静音";
  if (enabled) showToast("吊机音频已开启");
});
document.querySelector("#newGameButton").addEventListener("click", resetRound);
document.querySelector("#resultRestart").addEventListener("click", resetRound);
document.querySelector("#resumeButton").addEventListener("click", () => togglePause(false));
document.querySelector("#helpButton").addEventListener("click", openRules);
document.querySelector("#briefHelp").addEventListener("click", openRules);

window.addEventListener("keydown", (event) => {
  const tag = event.target?.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || dom.rulesDialog.open) return;
  if (event.key === "Escape") clearSelection();
  if (event.key.toLowerCase() === "p") togglePause();
  if (event.key.toLowerCase() === "r") resetRound();
});

if (params.has("test")) {
  window.__YARD_TEST__ = {
    getState: () => structuredClone(state),
    getSummary: () => getSummary(state),
    getPoint: getTestPoint,
    isBusy: () => Boolean(animation),
    isStarted: () => started,
    getAudio: () => audio.getStatus()
  };
}

updateHud(true);
renderShipList(true);
requestAnimationFrame(frame);
