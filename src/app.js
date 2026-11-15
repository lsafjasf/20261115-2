import {
  DEFAULT_PROJECT,
  RANGES,
  TRACK_META,
  TRACK_ORDER,
  clamp,
  normalizeProject,
  parseProject,
  serializeProject,
} from "./project.js";
import {
  CLIP_DBFS,
  CLIP_PEAK,
  LiveMixer,
  renderMix,
} from "./audio.js";
import { findPeak, renderTrackData } from "./synth.js";
import { audioBufferToWav } from "./wav.js";

const STORAGE_KEY = "pulse-desk-project-v1";
const SAMPLE_RATE = 48000;
const LOOP_SECONDS = 20;
const DB_FLOOR = -60;
const METER_SEGMENTS = 22;
const TRACK_COLORS = Object.fromEntries(
  TRACK_ORDER.map((id) => [id, TRACK_META[id].color]),
);

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

let project = loadStoredProject();
let trackData = null;
let audioContext = null;
let mixer = null;
let playing = false;
let frameHandle = 0;
let saveTimer = 0;
let toastTimer = 0;
let exportBusy = false;
let clipHold = Object.fromEntries(TRACK_ORDER.map((id) => [id, 0]));
let busClipHold = 0;
let currentLevels = emptyLevels();

function emptyLevels() {
  return {
    tracks: Object.fromEntries(TRACK_ORDER.map((id) => [id, 0])),
    master: 0,
    reduction: 0,
  };
}

function loadStoredProject() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return normalizeProject(JSON.parse(stored));
  } catch {
    return normalizeProject(DEFAULT_PROJECT);
  }
  return normalizeProject(DEFAULT_PROJECT);
}

function saveStoredProject({ announce = false } = {}) {
  const status = $("#saveStatus");
  status?.classList.add("is-saving");
  try {
    localStorage.setItem(STORAGE_KEY, serializeProject(project));
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      status?.classList.remove("is-saving");
      const label = status?.querySelector("span:last-child");
      if (label) label.textContent = "自动保存";
    }, 320);
  } catch {
    status?.classList.remove("is-saving");
    const label = status?.querySelector("span:last-child");
    if (label) label.textContent = "仅当前会话";
  }
  if (announce) showToast("工程已保存，刷新或重新打开后会恢复全部推子与声像。");
}

function scheduleSave() {
  window.clearTimeout(saveTimer);
  const status = $("#saveStatus");
  status?.classList.add("is-saving");
  const label = status?.querySelector("span:last-child");
  if (label) label.textContent = "等待写入";
  saveTimer = window.setTimeout(() => saveStoredProject(), 240);
}

function showToast(message, isError = false) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.toggle("is-error", isError);
  toast.classList.add("is-visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toast.classList.remove("is-visible");
  }, 3600);
}

function formatTime(seconds) {
  const safeSeconds = Math.max(0, seconds);
  const minutes = Math.floor(safeSeconds / 60);
  const secs = Math.floor(safeSeconds % 60);
  const millis = Math.floor((safeSeconds % 1) * 1000);
  return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
}

function formatDb(value, digits = 1) {
  if (!Number.isFinite(value)) return "-∞ dB";
  return `${value.toFixed(digits)} dB`;
}

function formatPan(value) {
  if (Math.abs(value) < 0.005) return "C";
  return `${value < 0 ? "L" : "R"} ${Math.round(Math.abs(value) * 100)}`;
}

function dbFromPeak(peak) {
  if (peak <= 0.000001) return -Infinity;
  return 20 * Math.log10(peak);
}

function projectTrack(id) {
  return project.tracks.find((track) => track.id === id);
}

function buildRuler() {
  const ruler = $("#timelineRuler");
  for (let index = 0; index < 4; index += 1) {
    const mark = document.createElement("span");
    mark.className = "ruler-mark";
    mark.textContent = formatTime(index * 5).slice(0, 5);
    ruler.append(mark);
  }
}

function buildTimelineLanes() {
  const lanes = $("#timelineLanes");
  const patterns = {
    drums: [
      [0, 12.4],
      [12.5, 12.4],
      [25, 12.4],
      [37.5, 12.4],
      [50, 12.4],
      [62.5, 12.4],
      [75, 12.4],
      [87.5, 12.4],
    ],
    bass: [
      [0, 24.6],
      [25, 24.6],
      [50, 24.6],
      [75, 24.6],
    ],
    ambience: [
      [0, 49.6],
      [50, 49.6],
    ],
    cue: [
      [24.8, 6.8],
      [49.7, 7.3],
      [74.7, 7.4],
      [90.2, 5.5],
    ],
  };
  for (const id of TRACK_ORDER) {
    const lane = document.createElement("div");
    lane.className = "timeline-lane";
    lane.style.setProperty("--lane-color", TRACK_META[id].color);
    lane.innerHTML = `
      <div class="lane-label"><i></i>${TRACK_META[id].english}</div>
      <div class="lane-clips"></div>
    `;
    const clips = lane.querySelector(".lane-clips");
    for (const [left, width] of patterns[id]) {
      const clip = document.createElement("div");
      clip.className = "clip";
      clip.style.left = `${left}%`;
      clip.style.width = `${width}%`;
      clips.append(clip);
    }
    lanes.append(lane);
  }
  const busLane = document.createElement("div");
  busLane.className = "timeline-lane lane-bus";
  busLane.style.setProperty("--lane-color", "var(--violet)");
  busLane.innerHTML = `
    <div class="lane-label"><i></i>BUS COMP</div>
    <div class="lane-clips">
      <div class="clip" style="left: 0%; width: 49.6%"></div>
      <div class="clip" style="left: 50%; width: 49.6%"></div>
    </div>
  `;
  lanes.append(busLane);
}

function meterSegments() {
  return Array.from({ length: METER_SEGMENTS }, (_, index) => {
    const tone =
      index >= METER_SEGMENTS - 4
        ? "meter-hot"
        : index >= METER_SEGMENTS - 10
          ? "meter-warm"
          : "meter-cold";
    return `<i class="${tone}"></i>`;
  }).join("");
}

function buildTrackCards() {
  const grid = $("#trackGrid");
  grid.innerHTML = project.tracks
    .map((track, index) => {
      const meta = TRACK_META[track.id];
      return `
        <article class="track-card" data-track-id="${track.id}"
          style="--track-color: ${meta.color}">
          <header class="track-header">
            <span class="track-number">0${index + 1}</span>
            <div class="track-title">
              <h3>${meta.name}</h3>
              <span>${meta.english}</span>
            </div>
            <button class="mute-button" type="button" data-mute="${track.id}"
              aria-label="静音 ${meta.name}" aria-pressed="false">M</button>
          </header>
          <p class="track-source">${meta.source}</p>
          <div class="track-body">
            <div class="fader-area">
              <div class="fader-shell" data-fader="${track.id}" role="slider"
                aria-label="${meta.name} 增益" aria-valuemin="-36"
                aria-valuemax="12" tabindex="0">
                <div class="fader-rail"><div class="fader-fill"></div></div>
                <div class="fader-ticks">
                  <span>+12</span><span>0</span><span>-12</span>
                  <span>-24</span><span>-36</span>
                </div>
                <div class="fader-handle"></div>
              </div>
              <p class="fader-value"><span data-gain-value="${track.id}">0.0</span> dB</p>
            </div>
            <div class="meter-area">
              <span class="meter-readout" data-meter-value="${track.id}">-∞</span>
              <div class="level-meter" data-meter="${track.id}">
                ${meterSegments()}
              </div>
              <span class="clip-led" data-clip="${track.id}">CLIP</span>
            </div>
          </div>
          <div class="track-lower">
            <div class="pan-control">
              <div class="control-label-row">
                <span class="control-label">PAN</span>
                <span class="control-value" data-pan-value="${track.id}">C</span>
              </div>
              <input class="pan-slider" type="range" min="-1" max="1" step="0.01"
                data-pan="${track.id}" aria-label="${meta.name} 声像" />
              <div class="pan-scale"><span>L</span><span>C</span><span>R</span></div>
            </div>
            <div class="knob-control delay-control" style="--knob-color: ${meta.color}">
              <div class="knob" data-delay="${track.id}" role="slider"
                aria-label="${meta.name} 延迟" aria-valuemin="0"
                aria-valuemax="320" tabindex="0"></div>
              <span class="knob-label">DELAY</span>
              <strong class="knob-value" data-delay-value="${track.id}">0 ms</strong>
            </div>
          </div>
        </article>
      `;
    })
    .join("");

  for (const id of TRACK_ORDER) bindTrackControls(id);
}

function bindTrackControls(id) {
  const fader = document.querySelector(`[data-fader="${id}"]`);
  const settings = projectTrack(id);
  bindVerticalSlider(fader, RANGES.gainDb, settings.gainDb, (value) => {
    settings.gainDb = value;
    updateTrackVisuals(id);
    pushProjectUpdate();
  });

  const pan = document.querySelector(`[data-pan="${id}"]`);
  pan.value = String(settings.pan);
  pan.addEventListener("input", () => {
    settings.pan = Number(pan.value);
    updateTrackVisuals(id);
    pushProjectUpdate();
  });

  const delay = document.querySelector(`[data-delay="${id}"]`);
  bindKnob(delay, RANGES.delayMs, settings.delayMs, (value) => {
    settings.delayMs = value;
    updateTrackVisuals(id);
    pushProjectUpdate();
  });

  document.querySelector(`[data-mute="${id}"]`).addEventListener("click", () => {
    settings.muted = !settings.muted;
    updateTrackVisuals(id);
    pushProjectUpdate();
    const track = TRACK_META[id];
    showToast(
      settings.muted
        ? `${track.name}已静音，其余三轨保持独立输出。`
        : `${track.name}已恢复发声。`,
    );
  });
}

function updateTrackVisuals(id) {
  const settings = projectTrack(id);
  const card = document.querySelector(`[data-track-id="${id}"]`);
  const fader = document.querySelector(`[data-fader="${id}"]`);
  const pan = document.querySelector(`[data-pan="${id}"]`);
  const panPercent = ((settings.pan + 1) / 2) * 100;
  const gainPercent =
    ((settings.gainDb - RANGES.gainDb[0]) /
      (RANGES.gainDb[1] - RANGES.gainDb[0])) *
    100;

  fader.style.setProperty("--fader-pct", `${gainPercent}%`);
  fader.setAttribute("aria-valuenow", settings.gainDb.toFixed(1));
  fader.setAttribute("aria-valuetext", `${settings.gainDb.toFixed(1)} dB`);
  document.querySelector(`[data-gain-value="${id}"]`).textContent =
    settings.gainDb.toFixed(1);

  pan.value = String(settings.pan);
  pan.style.setProperty("--pan-pct", `${panPercent}%`);
  document.querySelector(`[data-pan-value="${id}"]`).textContent = formatPan(
    settings.pan,
  );

  const delay = document.querySelector(`[data-delay="${id}"]`);
  setKnobVisual(delay, settings.delayMs, RANGES.delayMs);
  delay.setAttribute("aria-valuenow", settings.delayMs.toFixed(0));
  delay.setAttribute("aria-valuetext", `${settings.delayMs.toFixed(0)} 毫秒`);
  document.querySelector(`[data-delay-value="${id}"]`).textContent =
    settings.delayMs < 1 ? "OFF" : `${settings.delayMs.toFixed(0)} ms`;

  const mute = document.querySelector(`[data-mute="${id}"]`);
  mute.classList.toggle("is-active", settings.muted);
  mute.setAttribute("aria-pressed", String(settings.muted));
  card.classList.toggle("is-muted", settings.muted);
}

function bindVerticalSlider(element, range, initial, onChange, step = 0.5) {
  const [min, max] = range;
  let dragging = false;

  const setFromPointer = (event) => {
    const rect = element.getBoundingClientRect();
    const ratio = clamp(1 - (event.clientY - rect.top) / rect.height, 0, 1);
    const value = min + ratio * (max - min);
    onChange(clamp(value, min, max));
  };

  element.addEventListener("pointerdown", (event) => {
    dragging = true;
    element.setPointerCapture(event.pointerId);
    setFromPointer(event);
  });
  element.addEventListener("pointermove", (event) => {
    if (dragging) setFromPointer(event);
  });
  const release = () => {
    dragging = false;
  };
  element.addEventListener("pointerup", release);
  element.addEventListener("pointercancel", release);
  element.addEventListener("keydown", (event) => {
    const current = Number(element.getAttribute("aria-valuenow")) || initial;
    let next = null;
    if (event.key === "ArrowUp" || event.key === "ArrowRight") next = current + step;
    if (event.key === "ArrowDown" || event.key === "ArrowLeft") next = current - step;
    if (event.key === "Home") next = max;
    if (event.key === "End") next = min;
    if (next === null) return;
    event.preventDefault();
    onChange(clamp(next, min, max));
  });
}

function bindKnob(element, range, initial, onChange, step) {
  const [min, max] = range;
  const increment = step || (max - min) / 100;
  let dragging = false;
  let startY = 0;
  let startValue = initial;

  element.addEventListener("pointerdown", (event) => {
    dragging = true;
    startY = event.clientY;
    startValue = Number(element.getAttribute("aria-valuenow")) || initial;
    element.setPointerCapture(event.pointerId);
  });
  element.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    const delta = ((startY - event.clientY) / 110) * (max - min);
    onChange(clamp(startValue + delta, min, max));
  });
  const release = () => {
    dragging = false;
  };
  element.addEventListener("pointerup", release);
  element.addEventListener("pointercancel", release);
  element.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      const current = Number(element.getAttribute("aria-valuenow")) || initial;
      const direction = event.deltaY < 0 ? 1 : -1;
      onChange(clamp(current + direction * increment, min, max));
    },
    { passive: false },
  );
  element.addEventListener("keydown", (event) => {
    const current = Number(element.getAttribute("aria-valuenow")) || initial;
    let next = null;
    if (event.key === "ArrowUp" || event.key === "ArrowRight") next = current + increment;
    if (event.key === "ArrowDown" || event.key === "ArrowLeft") next = current - increment;
    if (event.key === "Home") next = max;
    if (event.key === "End") next = min;
    if (next === null) return;
    event.preventDefault();
    onChange(clamp(next, min, max));
  });
}

function setKnobVisual(element, value, range) {
  const [min, max] = range;
  const ratio = clamp((value - min) / (max - min), 0, 1);
  element.style.setProperty("--sweep", `${ratio * 270}deg`);
  element.style.setProperty("--angle", `${-135 + ratio * 270}deg`);
}

const BUS_CONTROLS = [
  {
    key: "threshold",
    label: "阈值",
    range: RANGES.threshold,
    step: 0.5,
    format: (value) => `${value.toFixed(1)} dB`,
  },
  {
    key: "ratio",
    label: "压缩比",
    range: RANGES.ratio,
    step: 0.1,
    format: (value) => `${value.toFixed(1)}:1`,
  },
  {
    key: "attack",
    label: "启动",
    range: RANGES.attack,
    step: 0.001,
    format: (value) => `${Math.round(value * 1000)} ms`,
  },
  {
    key: "release",
    label: "释放",
    range: RANGES.release,
    step: 0.01,
    format: (value) => `${Math.round(value * 1000)} ms`,
  },
];

function buildBusControls() {
  const container = $("#busControls");
  container.innerHTML = BUS_CONTROLS.map(
    (control) => `
      <div class="knob-control">
        <div class="knob" data-bus-knob="${control.key}" role="slider"
          aria-label="总线压缩${control.label}" tabindex="0"></div>
        <span class="knob-label">${control.label}</span>
        <strong class="knob-value" data-bus-value="${control.key}"></strong>
      </div>
    `,
  ).join("");
  for (const control of BUS_CONTROLS) {
    const knob = document.querySelector(`[data-bus-knob="${control.key}"]`);
    bindKnob(
      knob,
      control.range,
      project.bus[control.key],
      (value) => {
        project.bus[control.key] = value;
        updateBusVisuals();
        pushProjectUpdate();
      },
      control.step,
    );
  }
}

function updateBusVisuals() {
  for (const control of BUS_CONTROLS) {
    const value = project.bus[control.key];
    const knob = document.querySelector(`[data-bus-knob="${control.key}"]`);
    const output = document.querySelector(`[data-bus-value="${control.key}"]`);
    setKnobVisual(knob, value, control.range);
    knob.setAttribute("aria-valuenow", String(value));
    knob.setAttribute("aria-valuetext", control.format(value));
    output.textContent = control.format(value);
  }
}

function updateMasterVisuals() {
  const percent = ((project.masterGainDb + 36) / 42) * 100;
  const slider = $("#masterSlider");
  $("#masterFill").style.width = `${percent}%`;
  $("#masterThumb").style.left = `${percent}%`;
  $("#masterGainValue").textContent = formatDb(project.masterGainDb);
  slider.setAttribute("aria-valuenow", project.masterGainDb.toFixed(1));
  slider.setAttribute("aria-valuetext", formatDb(project.masterGainDb));
}

function bindMasterSlider() {
  const slider = $("#masterSlider");
  let dragging = false;
  const setFromPointer = (event) => {
    const rect = slider.getBoundingClientRect();
    const ratio = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    project.masterGainDb = -36 + ratio * 42;
    updateMasterVisuals();
    pushProjectUpdate();
  };
  slider.addEventListener("pointerdown", (event) => {
    dragging = true;
    slider.setPointerCapture(event.pointerId);
    setFromPointer(event);
  });
  slider.addEventListener("pointermove", (event) => {
    if (dragging) setFromPointer(event);
  });
  const release = () => {
    dragging = false;
  };
  slider.addEventListener("pointerup", release);
  slider.addEventListener("pointercancel", release);
  slider.addEventListener("keydown", (event) => {
    let next = null;
    if (event.key === "ArrowRight" || event.key === "ArrowUp") {
      next = project.masterGainDb + 0.5;
    }
    if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
      next = project.masterGainDb - 0.5;
    }
    if (event.key === "Home") next = 6;
    if (event.key === "End") next = -36;
    if (next === null) return;
    event.preventDefault();
    project.masterGainDb = clamp(next, -36, 6);
    updateMasterVisuals();
    pushProjectUpdate();
  });
}

function applyProjectToUI() {
  $("#projectTitle").textContent = project.title;
  $("#projectSubtitle").textContent = project.subtitle;
  $("#timeDuration").textContent = formatTime(LOOP_SECONDS);
  $("#timeCurrent").textContent = formatTime(0);
  for (const id of TRACK_ORDER) updateTrackVisuals(id);
  updateBusVisuals();
  updateMasterVisuals();
}

function pushProjectUpdate() {
  if (mixer) mixer.update(project);
  scheduleSave();
}

function setPlayheadPosition(seconds) {
  const playhead = $("#playhead");
  const timeline = $(".timeline");
  if (!timeline || !playhead) return;
  const available = Math.max(0, timeline.clientWidth - 94);
  const x = 94 + (clamp(seconds / LOOP_SECONDS, 0, 1) * available);
  playhead.style.left = `${x}px`;
}

function updateMeter(id, peak, now) {
  const settings = projectTrack(id);
  const meter = document.querySelector(`[data-meter="${id}"]`);
  const segments = meter.querySelectorAll("i");
  const level = settings.muted ? 0 : peak;
  const db = dbFromPeak(level);
  const ratio = clamp((db - DB_FLOOR) / -DB_FLOOR, 0, 1);
  const litCount = Math.ceil(ratio * METER_SEGMENTS);

  for (let index = 0; index < segments.length; index += 1) {
    segments[index].classList.toggle("lit", index < litCount);
  }
  document.querySelector(`[data-meter-value="${id}"]`).textContent =
    level <= 0.000001 ? "-∞" : `${Math.max(DB_FLOOR, db).toFixed(1)}`;

  if (!settings.muted && peak >= CLIP_PEAK) clipHold[id] = now + 1100;
  const clipping = clipHold[id] > now;
  const card = document.querySelector(`[data-track-id="${id}"]`);
  card.classList.toggle("is-clipping", clipping);
  document
    .querySelector(`[data-clip="${id}"]`)
    .classList.toggle("is-active", clipping);
}

function updateBusMeters(levels, now) {
  const reduction = Math.abs(Number(levels.reduction) || 0);
  const reductionText =
    reduction >= 0.05 ? `-${reduction.toFixed(1)} dB` : "0.0 dB";
  $("#grReadout").textContent = reductionText;
  $("#busGrValue").textContent = reductionText;
  $("#grBar").style.width = `${clamp((reduction / 12) * 100, 0, 100)}%`;
  const grSegments = $$("#busGrMeter i");
  const litCount = Math.round(clamp(reduction / 12, 0, 1) * grSegments.length);
  grSegments.forEach((segment, index) =>
    segment.classList.toggle("lit", index < litCount),
  );

  if (levels.master >= CLIP_PEAK) busClipHold = now + 1100;
  $(".bus-panel").classList.toggle("is-clipping", busClipHold > now);
}

function renderLevels() {
  const now = performance.now();
  const levels = playing && mixer ? mixer.levels() : emptyLevels();
  currentLevels = levels;
  for (const id of TRACK_ORDER) updateMeter(id, levels.tracks[id], now);
  updateBusMeters(levels, now);
}

function tick() {
  if (playing && mixer) {
    const position = mixer.position();
    $("#timeCurrent").textContent = formatTime(position);
    setPlayheadPosition(position);
    renderLevels();
  }
  frameHandle = requestAnimationFrame(tick);
}

function ensureAnimationLoop() {
  if (!frameHandle) frameHandle = requestAnimationFrame(tick);
}

async function prepareAudio() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  const OfflineContextClass =
    window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!AudioContextClass || !OfflineContextClass) {
    throw new Error("当前浏览器不支持 Web Audio API。");
  }
  try {
    audioContext = new AudioContextClass({
      latencyHint: "interactive",
      sampleRate: SAMPLE_RATE,
    });
  } catch {
    audioContext = new AudioContextClass({ latencyHint: "interactive" });
  }
  $("#loadingLabel").textContent = "正在合成四轨素材…";
  const entries = await Promise.all(
    TRACK_ORDER.map(async (id) => [
      id,
      await renderTrackData(
        id,
        audioContext.sampleRate,
        LOOP_SECONDS,
        OfflineContextClass,
      ),
    ]),
  );
  trackData = Object.fromEntries(entries);
  $("#engineLabel").textContent = "准备就绪";
}

function setPlayingUI(isPlaying) {
  $("#playButton").classList.toggle("is-playing", isPlaying);
  $("#playButton").setAttribute("aria-label", isPlaying ? "停止" : "播放");
  $(".transport-panel").classList.toggle("is-playing", isPlaying);
  $("#playhead").classList.toggle("is-live", isPlaying);
  $("#engineLabel").textContent = isPlaying ? "播放中" : "准备就绪";
}

async function startPlayback() {
  if (!trackData || !audioContext) {
    showToast("音频仍在准备，请稍候。", true);
    return;
  }
  try {
    await audioContext.resume();
    if (!mixer) mixer = new LiveMixer(audioContext, project, trackData);
    mixer.update(project);
    mixer.start();
    playing = true;
    setPlayingUI(true);
    ensureAnimationLoop();
  } catch (error) {
    console.error(error);
    showToast("无法启动音频：请检查浏览器的声音权限。", true);
  }
}

function stopPlayback({ quiet = false } = {}) {
  if (mixer) mixer.dispose();
  mixer = null;
  playing = false;
  setPlayingUI(false);
  $("#timeCurrent").textContent = formatTime(0);
  setPlayheadPosition(0);
  renderLevels();
  if (!quiet) showToast("播放已停止，循环工程保持就绪。");
}

function togglePlayback() {
  if (playing) stopPlayback({ quiet: true });
  else startPlayback();
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function slugify(text) {
  const slug = text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "pulse-desk";
}

function saveProjectFile() {
  saveStoredProject({ announce: true });
  const blob = new Blob([serializeProject(project)], {
    type: "application/json",
  });
  downloadBlob(blob, `${slugify(project.title)}.json`);
}

function setLoading(visible, label = "正在离线渲染 20 秒混音…") {
  $("#loadingLabel").textContent = label;
  $("#loadingScreen").classList.toggle("is-hidden", !visible);
}

async function exportWav() {
  if (exportBusy) return;
  exportBusy = true;
  const button = $("#exportButton");
  const label = $("#exportLabel");
  button.disabled = true;
  label.textContent = "渲染中…";
  try {
    setLoading(true);
    const OfflineContextClass =
      window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const { buffer } = await renderMix(project, {
      sampleRate: SAMPLE_RATE,
      duration: LOOP_SECONDS,
      OfflineAudioContextCtor: OfflineContextClass,
    });
    const channels = [];
    for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
      const data = new Float32Array(buffer.length);
      buffer.copyFromChannel(data, channel);
      channels.push(data);
    }
    const peak = findPeak(channels);
    const wav = audioBufferToWav(buffer);
    const blob = new Blob([wav], { type: "audio/wav" });
    const filename = `${slugify(project.title)}-20s.wav`;
    downloadBlob(blob, filename);
    saveStoredProject();
    showToast(
      `已导出 ${filename} · 20.000 秒 / 48 kHz / 24-bit · 峰值 ${formatDb(dbFromPeak(peak))}`,
    );
  } catch (error) {
    console.error(error);
    showToast(`WAV 导出失败：${error.message}`, true);
  } finally {
    exportBusy = false;
    button.disabled = false;
    label.textContent = "导出 WAV";
    window.setTimeout(() => setLoading(false), 260);
  }
}

function replaceProject(nextProject) {
  const wasPlaying = playing;
  if (wasPlaying) stopPlayback({ quiet: true });
  project = normalizeProject(nextProject);
  buildTrackCards();
  applyProjectToUI();
  saveStoredProject();
  showToast("工程已载入，四条通道的推子、声像与延迟均已恢复。");
}

async function importProjectFile(file) {
  if (!file) return;
  try {
    const text = await file.text();
    replaceProject(parseProject(text));
  } catch (error) {
    console.error(error);
    showToast("工程文件无效：需要 Pulse Desk JSON 工程。", true);
  } finally {
    $("#projectFile").value = "";
  }
}

function bindActions() {
  $("#playButton").addEventListener("click", togglePlayback);
  $("#saveButton").addEventListener("click", saveProjectFile);
  $("#loadButton").addEventListener("click", () => $("#projectFile").click());
  $("#projectFile").addEventListener("change", (event) => {
    importProjectFile(event.target.files?.[0]);
  });
  $("#exportButton").addEventListener("click", exportWav);
  window.addEventListener("resize", () => {
    if (playing && mixer) setPlayheadPosition(mixer.position());
  });
  window.addEventListener("beforeunload", () => {
    if (mixer) mixer.dispose();
  });
}

async function init() {
  buildRuler();
  buildTimelineLanes();
  buildTrackCards();
  buildBusControls();
  bindMasterSlider();
  bindActions();
  applyProjectToUI();
  renderLevels();
  setPlayheadPosition(0);
  ensureAnimationLoop();
  try {
    await prepareAudio();
  } catch (error) {
    console.error(error);
    $("#engineLabel").textContent = "音频不可用";
    showToast(`音频引擎初始化失败：${error.message}`, true);
  } finally {
    window.setTimeout(() => setLoading(false), 320);
  }
}

init();
