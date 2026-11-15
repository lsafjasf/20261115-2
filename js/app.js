import {
  TRANSITION_TYPES,
  buildTimeline,
  clearSavedProject,
  createDefaultProject,
  formatTime,
  loadProject,
  moveScene,
  resolvePlaybackState,
  saveProject
} from "./model.js";
import { renderComposition } from "./transitions.js";
import { exportProjectWebM } from "./exporter.js";

const elements = {
  canvas: document.querySelector("#previewCanvas"),
  stageWrap: document.querySelector(".stage-canvas-wrap"),
  previewStatus: document.querySelector("#previewStatus"),
  playButton: document.querySelector("#playButton"),
  restartButton: document.querySelector("#restartButton"),
  loopButton: document.querySelector("#loopButton"),
  timelineRange: document.querySelector("#timelineRange"),
  timelineSegments: document.querySelector("#timelineSegments"),
  timelineTicks: document.querySelector("#timelineTicks"),
  currentTime: document.querySelector("#currentTime"),
  totalTime: document.querySelector("#totalTime"),
  activeSceneLabel: document.querySelector("#activeSceneLabel"),
  transitionCue: document.querySelector("#transitionCue"),
  cueIndex: document.querySelector("#cueIndex"),
  cueName: document.querySelector("#cueName"),
  cueProgress: document.querySelector("#cueProgress"),
  sequenceList: document.querySelector("#sequenceList"),
  saveButton: document.querySelector("#saveButton"),
  exportButton: document.querySelector("#exportButton"),
  resetButton: document.querySelector("#resetButton"),
  saveState: document.querySelector("#saveState"),
  statScenes: document.querySelector("#statScenes"),
  statTransitions: document.querySelector("#statTransitions"),
  statDuration: document.querySelector("#statDuration"),
  toast: document.querySelector("#toast"),
  exportOverlay: document.querySelector("#exportOverlay"),
  exportStatus: document.querySelector("#exportStatus"),
  exportProgress: document.querySelector("#exportProgress"),
  exportFrame: document.querySelector("#exportFrame")
};

const context = elements.canvas.getContext("2d", { alpha: false });
const initialLoad = loadProject();

let project = initialLoad.project;
let timeline = buildTimeline(project);
let currentTime = 0;
let isPlaying = false;
let isLooping = true;
let animationFrame = 0;
let lastFrameTime = 0;
let saveTimer = 0;
let toastTimer = 0;
let activeTransitionIndex = -1;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getSceneStyle(scene) {
  return `--scene-accent: ${scene.accent}`;
}

function renderSequence() {
  const cards = [];
  project.scenes.forEach((scene, index) => {
    const canMoveUp = index > 0;
    const canMoveDown = index < project.scenes.length - 1;
    cards.push(`
      <article class="scene-card" data-scene-index="${index}" style="${getSceneStyle(scene)}" title="跳转到场景 ${index + 1}">
        <div class="scene-thumb thumb-${scene.preset}" aria-hidden="true"></div>
        <div class="scene-card-copy">
          <div class="scene-meta">
            <b>SCENE ${scene.number}</b>
            <span>${scene.duration.toFixed(2)} SEC</span>
          </div>
          <h3>${scene.title}</h3>
          <p>${scene.subtitle}</p>
        </div>
        <div class="scene-actions">
          <button class="move-button" type="button" data-move="-1" aria-label="场景上移" ${canMoveUp ? "" : "disabled"}>↑</button>
          <button class="move-button" type="button" data-move="1" aria-label="场景下移" ${canMoveDown ? "" : "disabled"}>↓</button>
        </div>
      </article>
    `);

    if (index < project.transitions.length) {
      cards.push(renderTransitionEditor(project.transitions[index], index));
    }
  });
  elements.sequenceList.innerHTML = cards.join("");
  updateActiveCards();
}

function renderTransitionEditor(transition, index) {
  const meta = TRANSITION_TYPES[transition.type];
  const min = 0.25;
  const max = Math.min(
    2.2,
    Math.min(
      project.scenes[index].duration,
      project.scenes[index + 1].duration
    ) - 0.2
  );
  const fill = ((transition.duration - min) / (max - min)) * 100;
  const typeButtons = Object.entries(TRANSITION_TYPES)
    .map(
      ([type, item]) => `
        <button
          class="type-button"
          type="button"
          data-transition-index="${index}"
          data-type="${type}"
          aria-pressed="${type === transition.type}"
          title="${item.label} / ${item.english}"
        >
          <span class="type-glyph">${item.glyph}</span>
          <span>${item.label}</span>
        </button>
      `
    )
    .join("");

  return `
    <div class="transition-block" data-transition-index="${index}">
      <div class="transition-rail" aria-hidden="true"><span>↘</span></div>
      <div class="transition-editor" data-transition-index="${index}">
        <div class="transition-top">
          <b>TRANSITION ${String(index + 1).padStart(2, "0")}</b>
          <span>${meta.english} / ${meta.note}</span>
        </div>
        <div class="type-picker" role="group" aria-label="转场类型">
          ${typeButtons}
        </div>
        <div class="duration-row">
          <label class="duration-label" for="duration-${index}">
            重叠时长
            <span class="duration-value" data-duration-value="${index}">${transition.duration.toFixed(2)}s</span>
          </label>
          <span></span>
          <input
            class="duration-range"
            id="duration-${index}"
            data-duration-index="${index}"
            type="range"
            min="${min}"
            max="${max}"
            step="0.05"
            value="${transition.duration}"
            style="--range-fill: ${fill}%"
            aria-label="转场 ${index + 1} 时长"
          >
        </div>
        <div class="overlap-note"><i></i> 两段场景在此区间同步更新</div>
      </div>
    </div>
  `;
}

function renderTimelineSegments() {
  const segments = [];
  timeline.scenes.forEach((sceneItem, index) => {
    const incoming = index > 0 ? timeline.transitions[index - 1].duration : 0;
    const outgoing =
      index < timeline.transitions.length ? timeline.transitions[index].duration : 0;
    const uniqueDuration = Math.max(
      0.01,
      sceneItem.duration - incoming - outgoing
    );
    const start = sceneItem.start + incoming;
    segments.push({
      kind: "scene",
      start,
      end: start + uniqueDuration,
      accent: sceneItem.scene.accent
    });

    if (index < timeline.transitions.length) {
      const transition = timeline.transitions[index];
      segments.push({
        kind: "transition",
        start: transition.start,
        end: transition.end,
        accent: sceneItem.scene.accent
      });
    }
  });

  elements.timelineSegments.innerHTML = segments
    .map(
      (segment, index) => `
        <span
          class="${segment.kind === "transition" ? "is-transition" : ""}"
          data-segment-start="${segment.start}"
          data-segment-end="${segment.end}"
          style="width: ${((segment.end - segment.start) / timeline.total) * 100}%; --scene-accent: ${segment.accent}"
          title="${segment.kind === "transition" ? "转场重叠" : "场景"} ${formatTime(segment.start)} – ${formatTime(segment.end)}"
        ></span>
      `
    )
    .join("");
  updateTimelineFill(currentTime);
}

function renderTimelineTicks() {
  const tickCount = 5;
  elements.timelineTicks.innerHTML = Array.from(
    { length: tickCount },
    (_, index) => {
      const position = (index / (tickCount - 1)) * 100;
      const seconds = (index / (tickCount - 1)) * timeline.total;
      return `<span style="left:${position}%">${seconds.toFixed(1)}s</span>`;
    }
  ).join("");
}

function updateStats() {
  elements.statScenes.textContent = String(project.scenes.length).padStart(2, "0");
  elements.statTransitions.textContent = String(project.transitions.length).padStart(2, "0");
  elements.statDuration.textContent = formatTime(timeline.total).slice(0, 5);
  elements.totalTime.textContent = formatTime(timeline.total);
  elements.timelineRange.max = timeline.total.toFixed(3);
}

function rebuildTimeline() {
  timeline = buildTimeline(project);
  updateStats();
  renderTimelineSegments();
  renderTimelineTicks();
  currentTime = clamp(currentTime, 0, timeline.total);
}

function updateTimelineFill(time) {
  elements.timelineSegments
    .querySelectorAll("[data-segment-start]")
    .forEach((segment) => {
      const start = Number(segment.dataset.segmentStart);
      const end = Number(segment.dataset.segmentEnd);
      const fill = clamp((time - start) / Math.max(0.001, end - start), 0, 1);
      segment.style.setProperty("--fill", fill.toFixed(4));
    });
}

function updateActiveCards(state) {
  const activeScenes = new Set();
  let transitionIndex = -1;

  if (state?.kind === "transition") {
    activeScenes.add(state.fromScene.index);
    activeScenes.add(state.toScene.index);
    transitionIndex = state.transition.index;
  } else if (state?.scene) {
    activeScenes.add(state.scene.index);
  }

  document.querySelectorAll(".scene-card").forEach((card) => {
    card.classList.toggle(
      "is-active",
      activeScenes.has(Number(card.dataset.sceneIndex))
    );
  });
  document.querySelectorAll(".transition-editor").forEach((editor) => {
    editor.classList.toggle(
      "is-active",
      Number(editor.dataset.transitionIndex) === transitionIndex
    );
  });
  activeTransitionIndex = transitionIndex;
}

function updatePlaybackUi(state) {
  elements.currentTime.textContent = formatTime(currentTime);
  elements.timelineRange.value = String(currentTime);
  updateTimelineFill(currentTime);

  if (state.kind === "transition") {
    const meta = TRANSITION_TYPES[state.transition.type];
    const percent = Math.round(state.progress * 100);
    elements.activeSceneLabel.textContent =
      `SCENE ${state.fromScene.scene.number} → ${state.toScene.scene.number} · ${meta.label} ${percent}%`;
    elements.cueIndex.textContent =
      `TR ${String(state.transition.index + 1).padStart(2, "0")}`;
    elements.cueName.textContent = meta.label;
    elements.cueProgress.style.width = `${state.progress * 100}%`;
    elements.transitionCue.classList.add("is-visible");
  } else {
    elements.activeSceneLabel.textContent =
      `SCENE ${state.scene.scene.number} / ${state.scene.scene.title.toUpperCase()}`;
    elements.transitionCue.classList.remove("is-visible");
    elements.cueProgress.style.width = "0%";
  }

  elements.previewStatus.textContent = isPlaying
    ? state.kind === "transition"
      ? "TRANSITION"
      : "PLAYING"
    : "PAUSED";
  updateActiveCards(state);
}

function drawAt(time, updateUi = true) {
  currentTime = clamp(time, 0, timeline.total);
  const state = resolvePlaybackState(timeline, currentTime);
  renderComposition(
    context,
    elements.canvas.width,
    elements.canvas.height,
    state
  );
  if (updateUi) updatePlaybackUi(state);
  return state;
}

function setPlaying(next) {
  if (next === isPlaying) return;
  isPlaying = next;
  elements.playButton.setAttribute("aria-label", isPlaying ? "暂停" : "播放");
  elements.stageWrap.classList.toggle("is-playing", isPlaying);
  if (isPlaying) {
    lastFrameTime = performance.now();
    animationFrame = requestAnimationFrame(playbackTick);
  } else {
    cancelAnimationFrame(animationFrame);
    animationFrame = 0;
    drawAt(currentTime);
  }
}

function playbackTick(now) {
  if (!isPlaying) return;
  const delta = Math.min(0.1, Math.max(0, (now - lastFrameTime) / 1000));
  lastFrameTime = now;
  currentTime += delta;

  if (currentTime >= timeline.total) {
    if (isLooping) {
      currentTime = 0;
    } else {
      currentTime = timeline.total;
      drawAt(currentTime);
      setPlaying(false);
      return;
    }
  }

  drawAt(currentTime);
  animationFrame = requestAnimationFrame(playbackTick);
}

function togglePlayback() {
  if (!isPlaying && currentTime >= timeline.total - 0.001) {
    currentTime = 0;
    drawAt(currentTime);
  }
  setPlaying(!isPlaying);
}

function seekTo(time) {
  drawAt(time);
  lastFrameTime = performance.now();
}

function setSaveState(message, saving = false) {
  elements.saveState.classList.toggle("is-saving", saving);
  elements.saveState.innerHTML = `<i></i> ${message}`;
}

function persistenceTime() {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date());
}

function persistProject(explicit = false) {
  window.clearTimeout(saveTimer);
  try {
    saveProject(project);
    setSaveState(`已保存 · ${persistenceTime()}`);
    if (explicit) showToast("工程已保存，重载页面会恢复当前场景与转场顺序。");
  } catch {
    setSaveState("保存失败");
    if (explicit) showToast("无法写入本地存储，请检查浏览器设置。");
  }
}

function scheduleSave() {
  window.clearTimeout(saveTimer);
  setSaveState("正在保存…", true);
  saveTimer = window.setTimeout(() => persistProject(false), 320);
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add("is-visible");
  toastTimer = window.setTimeout(() => {
    elements.toast.classList.remove("is-visible");
  }, 2800);
}

function handleSequenceClick(event) {
  const moveButton = event.target.closest("[data-move]");
  if (moveButton) {
    const card = moveButton.closest(".scene-card");
    const fromIndex = Number(card.dataset.sceneIndex);
    const toIndex = fromIndex + Number(moveButton.dataset.move);
    const nextProject = moveScene(project, fromIndex, toIndex);
    if (!nextProject) return;

    project = nextProject;
    rebuildTimeline();
    renderSequence();
    drawAt(currentTime);
    scheduleSave();
    showToast("场景顺序已更新，并已自动保存。");
    return;
  }

  const typeButton = event.target.closest(".type-button");
  if (typeButton) {
    const index = Number(typeButton.dataset.transitionIndex);
    const type = typeButton.dataset.type;
    if (!project.transitions[index] || project.transitions[index].type === type) {
      return;
    }
    project.transitions[index].type = type;
    rebuildTimeline();
    renderSequence();
    const transition = timeline.transitions[index];
    const inspectTime = transition.start + transition.duration * 0.46;
    setPlaying(false);
    seekTo(inspectTime);
    scheduleSave();
    return;
  }

  const sceneCard = event.target.closest(".scene-card");
  if (sceneCard) {
    const index = Number(sceneCard.dataset.sceneIndex);
    const scene = timeline.scenes[index];
    if (!scene) return;
    setPlaying(false);
    seekTo(scene.start + Math.min(0.12, scene.duration * 0.03));
  }
}

function handleDurationInput(event) {
  const slider = event.target.closest("[data-duration-index]");
  if (!slider) return;
  const index = Number(slider.dataset.durationIndex);
  const value = clamp(Number(slider.value), 0.25, 2.2);
  project.transitions[index].duration = value;

  const min = Number(slider.min);
  const max = Number(slider.max);
  const fill = ((value - min) / (max - min)) * 100;
  slider.style.setProperty("--range-fill", `${fill}%`);
  const valueLabel = document.querySelector(`[data-duration-value="${index}"]`);
  if (valueLabel) valueLabel.textContent = `${value.toFixed(2)}s`;

  rebuildTimeline();
  drawAt(currentTime);
  scheduleSave();
}

async function handleExport() {
  if (elements.exportButton.disabled) return;
  setPlaying(false);
  elements.exportButton.disabled = true;
  elements.exportOverlay.hidden = false;
  elements.exportStatus.textContent = "准备画布与视频编码器…";
  elements.exportProgress.style.width = "0%";

  try {
    const result = await exportProjectWebM({
      project,
      width: 1280,
      height: 720,
      fps: 30,
      onProgress(info) {
        const percent = clamp((info.time / info.total) * 100, 0, 100);
        elements.exportStatus.textContent = `正在编码 ${formatTime(info.time)} / ${formatTime(info.total)}`;
        elements.exportProgress.style.width = `${percent}%`;
        elements.exportFrame.textContent =
          `FRAME ${String(info.frame).padStart(3, "0")} / ${String(info.totalFrames).padStart(3, "0")}`;
      }
    });

    const url = URL.createObjectURL(result.blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "cutloop-three-movements.webm";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 5000);

    elements.exportProgress.style.width = "100%";
    elements.exportStatus.textContent = "视频已生成";
    showToast(
      `WebM 已导出：${result.totalFrames} 帧，${formatTime(result.duration)}，${(result.blob.size / 1024 / 1024).toFixed(1)} MB。`
    );
    window.__CUTLOOP_LAST_EXPORT__ = {
      duration: result.duration,
      frames: result.totalFrames,
      size: result.blob.size,
      mimeType: result.blob.type
    };
  } catch (error) {
    console.error(error);
    showToast(`导出失败：${error.message || "浏览器不支持视频录制"}`);
    elements.exportStatus.textContent = "导出失败";
  } finally {
    window.setTimeout(() => {
      elements.exportOverlay.hidden = true;
      elements.exportButton.disabled = false;
    }, 850);
  }
}

function inspectAt(time) {
  const localTimeline = buildTimeline(project);
  const state = resolvePlaybackState(localTimeline, time);
  if (state.kind === "transition") {
    return {
      time: state.time,
      kind: "transition",
      transitionType: state.transition.type,
      transitionIndex: state.transition.index,
      progress: state.progress,
      fromSceneId: state.fromScene.scene.id,
      toSceneId: state.toScene.scene.id,
      fromLocalTime: state.fromLocalTime,
      toLocalTime: state.toLocalTime,
      total: localTimeline.total
    };
  }
  return {
    time: state.time,
    kind: "scene",
    sceneId: state.scene.scene.id,
    sceneIndex: state.scene.index,
    sceneLocalTime: state.localTime,
    progress: 0,
    total: localTimeline.total
  };
}

function restoreProject() {
  setPlaying(false);
  clearSavedProject();
  project = createDefaultProject();
  currentTime = 0;
  rebuildTimeline();
  renderSequence();
  drawAt(0);
  persistProject(false);
  showToast("已恢复三场景、两转场示例。");
}

function bindEvents() {
  elements.playButton.addEventListener("click", togglePlayback);
  elements.canvas.addEventListener("click", togglePlayback);
  elements.restartButton.addEventListener("click", () => {
    seekTo(0);
  });
  elements.loopButton.addEventListener("click", () => {
    isLooping = !isLooping;
    elements.loopButton.setAttribute("aria-pressed", String(isLooping));
    showToast(isLooping ? "循环播放已开启。" : "循环播放已关闭。");
  });
  elements.timelineRange.addEventListener("input", (event) => {
    seekTo(Number(event.target.value));
  });
  elements.sequenceList.addEventListener("click", handleSequenceClick);
  elements.sequenceList.addEventListener("input", handleDurationInput);
  elements.saveButton.addEventListener("click", () => persistProject(true));
  elements.exportButton.addEventListener("click", handleExport);
  elements.resetButton.addEventListener("click", restoreProject);

  window.addEventListener("keydown", (event) => {
    const target = event.target;
    if (
      target.closest("button, input, select, textarea") ||
      event.metaKey ||
      event.ctrlKey ||
      event.altKey
    ) {
      return;
    }
    if (event.code === "Space") {
      event.preventDefault();
      togglePlayback();
    } else if (event.code === "ArrowLeft") {
      event.preventDefault();
      setPlaying(false);
      seekTo(currentTime - 1 / 30);
    } else if (event.code === "ArrowRight") {
      event.preventDefault();
      setPlaying(false);
      seekTo(currentTime + 1 / 30);
    } else if (event.code === "Home") {
      event.preventDefault();
      seekTo(0);
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden && isPlaying) setPlaying(false);
  });
}

function exposeApi() {
  window.CutLoop = {
    inspectAt,
    seek(time) {
      setPlaying(false);
      seekTo(time);
    },
    getProject() {
      return structuredClone(project);
    },
    getSummary() {
      const localTimeline = buildTimeline(project);
      return {
        title: project.title,
        sceneOrder: project.scenes.map((scene) => scene.id),
        sceneTitles: project.scenes.map((scene) => scene.title),
        transitions: project.transitions.map((transition) => ({ ...transition })),
        total: localTimeline.total,
        transitionWindows: localTimeline.transitions.map((transition) => ({
          type: transition.type,
          start: transition.start,
          end: transition.end,
          fromSceneId: transition.from.scene.id,
          toSceneId: transition.to.scene.id
        }))
      };
    },
    exportBlob(options = {}) {
      return exportProjectWebM({
        project,
        width: options.width || 1280,
        height: options.height || 720,
        fps: options.fps || 30
      });
    }
  };
}

function initialize() {
  rebuildTimeline();
  renderSequence();
  bindEvents();
  exposeApi();
  drawAt(0);

  if (initialLoad.restored) {
    setSaveState(`工程已恢复 · ${persistenceTime()}`);
    showToast("已恢复上次保存的场景顺序与转场设置。");
  } else {
    persistProject(false);
  }
}

initialize();
