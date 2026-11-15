import {
  DURATION,
  FPS,
  RATIOS,
  clamp,
  drawCropOverlay,
  drawCroppedFrame,
  drawSourceScene,
  formatClipTime,
  formatTimecode,
  getCaptionLayout,
  getCrop,
  isSubjectSafe,
} from "./scene.js";
import { BeatPlayer } from "./audio.js";
import { downloadRecording, recordClip, verifyPlayback } from "./exporter.js";

const clips = [
  {
    id: 1,
    name: "Opening",
    ratio: "16:9",
    in: 1.2,
    out: 6.3,
    color: "#d9ff53",
    smart: true,
    tracking: true,
  },
  {
    id: 2,
    name: "The Drop",
    ratio: "1:1",
    in: 7.2,
    out: 12.8,
    color: "#ff7556",
    smart: true,
    tracking: true,
  },
  {
    id: 3,
    name: "Outro",
    ratio: "9:16",
    in: 13.6,
    out: 19.2,
    color: "#9daaff",
    smart: true,
    tracking: true,
  },
];

const state = {
  selectedClip: 0,
  time: clips[0].in,
  playing: false,
  loop: true,
  subtitles: true,
  safeGuides: true,
  isExporting: false,
  exports: [],
};

const dom = {
  sourceCanvas: document.getElementById("sourceCanvas"),
  outputCanvas: document.getElementById("outputCanvas"),
  timelineCanvas: document.getElementById("timelineCanvas"),
  sourceTimecode: document.getElementById("sourceTimecode"),
  cropLabel: document.getElementById("cropLabel"),
  outputPip: document.getElementById("outputPip"),
  pipScreen: document.getElementById("pipScreen"),
  outputRatioLabel: document.getElementById("outputRatioLabel"),
  outputResolutionLabel: document.getElementById("outputResolutionLabel"),
  transportTime: document.getElementById("transportTime"),
  timelineDuration: document.getElementById("timelineDuration"),
  clipNumber: document.getElementById("clipNumber"),
  clipTitle: document.getElementById("clipTitle"),
  clipList: document.getElementById("clipList"),
  ratioGrid: document.getElementById("ratioGrid"),
  inField: document.getElementById("inField"),
  outField: document.getElementById("outField"),
  rangeDuration: document.getElementById("rangeDuration"),
  frameCount: document.getElementById("frameCount"),
  totalRuntime: document.getElementById("totalRuntime"),
  playButton: document.getElementById("playButton"),
  beatBars: document.getElementById("beatBars"),
  loopButton: document.getElementById("loopButton"),
  smartFrameToggle: document.getElementById("smartFrameToggle"),
  subtitleToggle: document.getElementById("subtitleToggle"),
  trackingToggle: document.getElementById("trackingToggle"),
  safeGuideButton: document.getElementById("safeGuideButton"),
  exportModal: document.getElementById("exportModal"),
  exportList: document.getElementById("exportList"),
  confirmExportButton: document.getElementById("confirmExportButton"),
  exportButtonMeta: document.getElementById("exportButtonMeta"),
  renderNote: document.getElementById("renderNote"),
  toast: document.getElementById("toast"),
};

const sourceContext = dom.sourceCanvas.getContext("2d", { alpha: false });
const outputContext = dom.outputCanvas.getContext("2d", { alpha: false });
const timelineContext = dom.timelineCanvas.getContext("2d");
const player = new BeatPlayer();
let currentCrop = getCrop(clips[0].ratio, state.time, { smart: true, tracking: true });
let playbackStartedAt = 0;
let playbackSourceTime = 0;
let playbackTransition = false;
let toastTimer = 0;
let timelineGeometry = null;
const thumbnailCache = new Map();

function selectedClip() {
  return clips[state.selectedClip];
}

function setPipRatio(ratioId) {
  const ratio = RATIOS[ratioId];
  dom.outputPip.classList.toggle("is-square", ratioId === "1:1");
  dom.outputPip.classList.toggle("is-portrait", ratioId === "9:16");
  dom.pipScreen.classList.toggle("is-square", ratioId === "1:1");
  dom.pipScreen.classList.toggle("is-portrait", ratioId === "9:16");
  dom.outputCanvas.width = ratio.width;
  dom.outputCanvas.height = ratio.height;
  dom.outputRatioLabel.textContent = ratioId;
  dom.outputResolutionLabel.textContent = ratio.display;
  dom.cropLabel.textContent = `${ratioId} CROP`;
}

function showToast(title, message) {
  const strong = dom.toast.querySelector("strong");
  const small = dom.toast.querySelector("small");
  strong.textContent = title;
  small.textContent = message;
  dom.toast.classList.add("is-visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => dom.toast.classList.remove("is-visible"), 2400);
}

function clipDuration(clip) {
  return clip.out - clip.in;
}

function updateTotals() {
  const total = clips.reduce((sum, clip) => sum + clipDuration(clip), 0);
  dom.totalRuntime.textContent = `${total.toFixed(2)}s`;
  dom.timelineDuration.textContent = `3 clips · ${total.toFixed(1)}s`;
}

function ratioName(id) {
  return RATIOS[id].short;
}

function renderClipList() {
  dom.clipList.replaceChildren();
  clips.forEach((clip, index) => {
    const row = document.createElement("button");
    row.type = "button";
    row.className = `clip-row${index === state.selectedClip ? " is-active" : ""}`;
    row.style.setProperty("--clip-color", clip.color);
    row.dataset.clipIndex = String(index);
    row.innerHTML = `
      <span class="clip-index">${String(clip.id).padStart(2, "0")}</span>
      <div><strong>${clip.name}</strong><small>${formatClipTime(clip.in)} — ${formatClipTime(clip.out)}</small></div>
      <span class="clip-ratio-tag">${clip.ratio}</span>
      <span class="clip-duration">${clipDuration(clip).toFixed(2)}s</span>
    `;
    row.addEventListener("click", () => selectClip(index));
    dom.clipList.append(row);
  });
}

function updateRatioCards() {
  const clip = selectedClip();
  dom.ratioGrid.querySelectorAll(".ratio-card").forEach((card) => {
    card.classList.toggle("is-active", card.dataset.ratio === clip.ratio);
  });
}

function updateRangeUi() {
  const clip = selectedClip();
  const duration = clipDuration(clip);
  dom.inField.value = formatClipTime(clip.in);
  dom.outField.value = formatClipTime(clip.out);
  dom.rangeDuration.textContent = `${duration.toFixed(2)}s`;
  dom.frameCount.textContent = `${Math.round(duration * FPS)} frames`;
  dom.transportTime.innerHTML = `${formatClipTime(state.time)} <em>/ ${formatClipTime(duration)}</em>`;
  dom.sourceTimecode.textContent = formatTimecode(state.time);
}

function updateInspector() {
  const clip = selectedClip();
  dom.clipNumber.textContent = String(clip.id).padStart(2, "0");
  dom.clipTitle.textContent = clip.name;
  dom.smartFrameToggle.checked = clip.smart;
  dom.trackingToggle.checked = clip.tracking;
  dom.subtitleToggle.checked = state.subtitles;
  setPipRatio(clip.ratio);
  updateRatioCards();
  updateRangeUi();
  renderClipList();
  updateTotals();
}

function selectClip(index) {
  if (index < 0 || index >= clips.length) return;
  stopPlayback();
  state.selectedClip = index;
  const clip = selectedClip();
  state.time = clip.in;
  currentCrop = getCrop(clip.ratio, state.time, clip);
  updateInspector();
  drawTimeline();
}

function easeCrop(target) {
  const amount = 0.2;
  const next = {
    x: currentCrop.x + (target.x - currentCrop.x) * amount,
    y: currentCrop.y + (target.y - currentCrop.y) * amount,
    w: currentCrop.w + (target.w - currentCrop.w) * amount,
    h: currentCrop.h + (target.h - currentCrop.h) * amount,
  };
  if (Math.abs(next.x - target.x) < 0.15) next.x = target.x;
  if (Math.abs(next.w - target.w) < 0.15) next.w = target.w;
  currentCrop = next;
}

function drawSourceFrame() {
  const clip = selectedClip();
  const targetCrop = getCrop(clip.ratio, state.time, {
    smart: clip.smart,
    tracking: clip.tracking,
  });
  easeCrop(targetCrop);
  drawSourceScene(sourceContext, state.time, currentCrop, {
    subtitles: state.subtitles,
  });
  drawCropOverlay(sourceContext, currentCrop, {
    ratio: clip.ratio,
    safeGuides: state.safeGuides,
  });
  drawCroppedFrame(outputContext, state.time, targetCrop, {
    subtitles: state.subtitles,
  });
  updateRangeUi();
}

function setPlayButton(playing) {
  dom.playButton.classList.toggle("is-playing", playing);
  dom.playButton.setAttribute("aria-label", playing ? "Pause clip" : "Play selected clip");
  dom.beatBars.classList.toggle("is-playing", playing);
}

async function startPlayback() {
  if (state.playing || state.isExporting) return;
  const clip = selectedClip();
  if (state.time >= clip.out - 0.02 || state.time < clip.in) state.time = clip.in;
  state.playing = true;
  playbackTransition = true;
  setPlayButton(true);
  try {
    await player.play(state.time);
  } catch {
    showToast("Audio unavailable", "Visual playback continues without sound.");
  }
  if (!state.playing) return;
  playbackTransition = false;
  playbackSourceTime = state.time;
  playbackStartedAt = performance.now();
}

function stopPlayback() {
  state.playing = false;
  playbackTransition = false;
  player.stop();
  setPlayButton(false);
}

function togglePlayback() {
  if (state.playing) {
    stopPlayback();
    drawTimeline();
  } else {
    startPlayback();
  }
}

function stepFrame(direction) {
  if (state.playing) stopPlayback();
  const clip = selectedClip();
  state.time = clamp(state.time + direction / FPS, clip.in, clip.out);
  updateRangeUi();
  drawTimeline();
}

function updatePlayback(now) {
  if (!state.playing || playbackTransition) return;
  const clip = selectedClip();
  const elapsed = (now - playbackStartedAt) / 1000;
  const time = playbackSourceTime + elapsed;
  if (time >= clip.out) {
    if (state.loop) {
      playbackSourceTime = clip.in;
      playbackStartedAt = now;
      state.time = clip.in;
      player.play(clip.in).catch(() => {});
    } else {
      state.time = clip.out;
      stopPlayback();
    }
  } else {
    state.time = time;
  }
}

function animationLoop(now) {
  updatePlayback(now);
  drawSourceFrame();
  drawTimeline();
  requestAnimationFrame(animationLoop);
}

function fitTimelineCanvas() {
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const width = dom.timelineCanvas.clientWidth;
  const height = dom.timelineCanvas.clientHeight;
  if (!width || !height) return null;
  if (
    dom.timelineCanvas.width !== Math.round(width * ratio) ||
    dom.timelineCanvas.height !== Math.round(height * ratio)
  ) {
    dom.timelineCanvas.width = Math.round(width * ratio);
    dom.timelineCanvas.height = Math.round(height * ratio);
  }
  timelineContext.setTransform(ratio, 0, 0, ratio, 0, 0);
  return { width, height };
}

function timelineLayout(width, height) {
  const left = 77;
  const right = 15;
  const top = 23;
  const bottom = 5;
  const laneHeight = (height - top - bottom) / clips.length;
  return { left, right, top, bottom, laneHeight, width, height };
}

function timeToX(time, layout) {
  const span = layout.width - layout.left - layout.right;
  return layout.left + (clamp(time, 0, DURATION) / DURATION) * span;
}

function xToTime(x, layout) {
  const span = layout.width - layout.left - layout.right;
  return clamp(((x - layout.left) / span) * DURATION, 0, DURATION);
}

function roundRectPath(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function getClipThumbnails(clip) {
  const count = 5;
  const ratio = RATIOS[clip.ratio];
  const key = `${clip.id}:${clip.ratio}:${clip.in.toFixed(2)}:${clip.out.toFixed(2)}`;
  if (thumbnailCache.has(key)) return thumbnailCache.get(key);
  const images = [];
  for (let index = 0; index < count; index += 1) {
    const time = clip.in + (clipDuration(clip) * (index + 0.5)) / count;
    const canvas = document.createElement("canvas");
    canvas.width = 88;
    canvas.height = 56;
    const context = canvas.getContext("2d", { alpha: false });
    const crop = getCrop(clip.ratio, time, {
      smart: clip.smart,
      tracking: clip.tracking,
    });
    drawCroppedFrame(context, time, crop, { subtitles: false });
    images.push(canvas);
  }
  thumbnailCache.set(key, images);
  return images;
}

function drawTimelineWaveform(ctx, x1, x2, y, height, clip) {
  const width = Math.max(0, x2 - x1);
  if (width < 2) return;
  ctx.save();
  ctx.globalAlpha = 0.64;
  ctx.fillStyle = clip.color;
  const step = Math.max(2, Math.round(width / 150));
  for (let x = x1; x < x2; x += step) {
    const time = xToTime(x, timelineGeometry);
    const beat = (time * 2) % 1;
    const pulse = Math.exp(-beat * 2.5);
    const second = (time * 4 + 0.3) % 1;
    const texture = 0.2 + Math.abs(Math.sin(time * 18.7)) * 0.25;
    const amplitude = clamp(0.22 + pulse * 0.56 + texture * (1 - pulse), 0.2, 1);
    const barHeight = Math.max(1, amplitude * height);
    ctx.fillRect(x, y + (height - barHeight) / 2, Math.max(1, step - 1), barHeight);
  }
  ctx.restore();
}

function drawTimeline() {
  if (!timelineGeometry) return;
  const { width, height, left, top, bottom, laneHeight } = timelineGeometry;
  const ctx = timelineContext;
  ctx.clearRect(0, 0, width, height);

  const background = ctx.createLinearGradient(0, 0, 0, height);
  background.addColorStop(0, "#0d0f0b");
  background.addColorStop(1, "#0a0c08");
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "rgba(243, 241, 230, 0.09)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, top - 1);
  ctx.lineTo(width, top - 1);
  ctx.stroke();

  ctx.font = "600 7px ui-monospace, monospace";
  ctx.fillStyle = "rgba(243, 241, 230, 0.39)";
  for (let second = 0; second <= DURATION; second += 1) {
    const x = timeToX(second, timelineGeometry);
    const major = second % 2 === 0;
    ctx.strokeStyle = major ? "rgba(243, 241, 230, 0.15)" : "rgba(243, 241, 230, 0.07)";
    ctx.beginPath();
    ctx.moveTo(x, top - (major ? 8 : 4));
    ctx.lineTo(x, top - 1);
    ctx.stroke();
    if (major) {
      ctx.textAlign = second === 0 ? "left" : second === DURATION ? "right" : "center";
      ctx.fillText(`${second}s`, x, 9);
    }
  }
  ctx.textAlign = "left";

  clips.forEach((clip, index) => {
    const laneY = top + index * laneHeight;
    const active = index === state.selectedClip;
    const barY = laneY + 4;
    const barHeight = laneHeight - 8;
    const x1 = timeToX(clip.in, timelineGeometry);
    const x2 = timeToX(clip.out, timelineGeometry);

    if (active) {
      ctx.fillStyle = "rgba(217, 255, 83, 0.045)";
      ctx.fillRect(0, laneY + 1, width, laneHeight - 2);
      ctx.fillStyle = clip.color;
      ctx.fillRect(0, laneY + 1, 2, laneHeight - 2);
    }

    ctx.font = "800 8px 'Arial', sans-serif";
    ctx.fillStyle = active ? "#e9edd9" : "rgba(243, 241, 230, 0.58)";
    ctx.fillText(String(clip.id).padStart(2, "0"), 12, laneY + 18);
    ctx.font = "700 7px 'Arial', sans-serif";
    ctx.fillStyle = active ? clip.color : "rgba(243, 241, 230, 0.34)";
    ctx.fillText(`${clip.ratio}  ${clip.name.toUpperCase()}`, 29, laneY + 18);

    ctx.fillStyle = "rgba(255, 255, 255, 0.035)";
    ctx.fillRect(left, barY, width - left - 15, barHeight);

    roundRectPath(ctx, x1, barY, x2 - x1, barHeight, 3);
    ctx.save();
    ctx.clip();
    const fill = ctx.createLinearGradient(x1, barY, x2, barY);
    fill.addColorStop(0, "rgba(217, 255, 83, 0.12)");
    fill.addColorStop(1, "rgba(255, 255, 255, 0.04)");
    ctx.fillStyle = fill;
    ctx.fillRect(x1, barY, x2 - x1, barHeight);

    const key = `${clip.id}:${clip.ratio}:${clip.in.toFixed(2)}:${clip.out.toFixed(2)}`;
    const thumbs = thumbnailCache.get(key);
    if (thumbs) {
      const slotWidth = (x2 - x1) / thumbs.length;
      thumbs.forEach((thumb, thumbIndex) => {
        const drawX = x1 + thumbIndex * slotWidth;
        ctx.globalAlpha = active ? 0.62 : 0.38;
        ctx.drawImage(thumb, drawX, barY, slotWidth + 0.5, barHeight);
      });
      ctx.globalAlpha = 1;
    }

    const shade = ctx.createLinearGradient(0, barY, 0, barY + barHeight);
    shade.addColorStop(0, "rgba(8, 10, 7, 0.1)");
    shade.addColorStop(0.55, "rgba(8, 10, 7, 0.28)");
    shade.addColorStop(1, "rgba(8, 10, 7, 0.8)");
    ctx.fillStyle = shade;
    ctx.fillRect(x1, barY, x2 - x1, barHeight);
    drawTimelineWaveform(ctx, x1 + 3, x2 - 3, barY + barHeight * 0.38, barHeight * 0.5, clip);
    ctx.restore();

    roundRectPath(ctx, x1 + 0.5, barY + 0.5, Math.max(1, x2 - x1 - 1), barHeight - 1, 3);
    ctx.strokeStyle = active ? clip.color : "rgba(243, 241, 230, 0.14)";
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.font = "700 7px ui-monospace, monospace";
    ctx.fillStyle = "rgba(243, 241, 230, 0.64)";
    ctx.fillText(`${clipDuration(clip).toFixed(2)}s`, x1 + 7, barY + 11);
    if (active) {
      ctx.textAlign = "right";
      ctx.fillStyle = clip.color;
      ctx.fillText("TRIM", x2 - 7, barY + 11);
      ctx.textAlign = "left";
    }

    if (active) {
      const handleY = barY + barHeight / 2;
      [clip.in, clip.out].forEach((value, handleIndex) => {
        const x = timeToX(value, timelineGeometry);
        ctx.fillStyle = clip.color;
        ctx.fillRect(x - 1.5, barY - 3, 3, barHeight + 6);
        roundRectPath(ctx, x - 6, handleY - 11, 12, 22, 2);
        ctx.fillStyle = handleIndex === 0 ? "#d9ff53" : "#f3f1e6";
        ctx.fill();
        ctx.fillStyle = "#15180e";
        ctx.fillRect(x - 3, handleY - 4, 6, 1);
        ctx.fillRect(x - 3, handleY, 6, 1);
        ctx.fillRect(x - 3, handleY + 4, 6, 1);
      });
    }
  });

  const playheadX = timeToX(state.time, timelineGeometry);
  ctx.strokeStyle = "rgba(243, 241, 230, 0.78)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(playheadX, top - 9);
  ctx.lineTo(playheadX, height - bottom);
  ctx.stroke();
  ctx.fillStyle = "#f3f1e6";
  ctx.beginPath();
  ctx.moveTo(playheadX - 4, top - 9);
  ctx.lineTo(playheadX + 4, top - 9);
  ctx.lineTo(playheadX, top - 2);
  ctx.closePath();
  ctx.fill();
}

let activeDrag = null;

function hitTestTimeline(event) {
  if (!timelineGeometry) return null;
  const rect = dom.timelineCanvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  const laneIndex = Math.floor((y - timelineGeometry.top) / timelineGeometry.laneHeight);
  if (laneIndex < 0 || laneIndex >= clips.length) return { x, y, laneIndex, handle: null };
  const clip = clips[laneIndex];
  const inX = timeToX(clip.in, timelineGeometry);
  const outX = timeToX(clip.out, timelineGeometry);
  let handle = null;
  if (laneIndex === state.selectedClip && Math.abs(x - inX) <= 11) handle = "in";
  if (laneIndex === state.selectedClip && Math.abs(x - outX) <= 11) handle = "out";
  return { x, y, laneIndex, handle, inX, outX };
}

function trimConstraints(index) {
  const clip = clips[index];
  const previous = index > 0 ? clips[index - 1] : null;
  const next = index < clips.length - 1 ? clips[index + 1] : null;
  return {
    minIn: previous ? previous.out + 0.2 : 0,
    maxOut: next ? next.in - 0.2 : DURATION,
    minDuration: 0.5,
    clip,
  };
}

function applyTrim(handle, time) {
  const index = state.selectedClip;
  const clip = clips[index];
  const limits = trimConstraints(index);
  if (handle === "in") {
    clip.in = clamp(time, limits.minIn, clip.out - limits.minDuration);
    state.time = clip.in;
  } else {
    clip.out = clamp(time, clip.in + limits.minDuration, limits.maxOut);
    state.time = clip.out;
  }
  updateRangeUi();
  updateTotals();
}

function onTimelinePointerDown(event) {
  const hit = hitTestTimeline(event);
  if (!hit || hit.laneIndex < 0 || hit.laneIndex >= clips.length) return;
  if (state.playing) stopPlayback();
  if (hit.laneIndex !== state.selectedClip) {
    selectClip(hit.laneIndex);
  }
  const clip = selectedClip();
  if (hit.handle) {
    activeDrag = { mode: hit.handle, pointerId: event.pointerId };
  } else {
    state.time = clamp(xToTime(hit.x, timelineGeometry), clip.in, clip.out);
    activeDrag = { mode: "scrub", pointerId: event.pointerId };
  }
  dom.timelineCanvas.setPointerCapture(event.pointerId);
  drawTimeline();
  updateRangeUi();
}

function onTimelinePointerMove(event) {
  if (!activeDrag || activeDrag.pointerId !== event.pointerId) return;
  const rect = dom.timelineCanvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const time = xToTime(x, timelineGeometry);
  if (activeDrag.mode === "scrub") {
    const clip = selectedClip();
    state.time = clamp(time, clip.in, clip.out);
    updateRangeUi();
  } else {
    applyTrim(activeDrag.mode, time);
  }
}

function onTimelinePointerUp(event) {
  if (!activeDrag) return;
  const mode = activeDrag.mode;
  activeDrag = null;
  if (dom.timelineCanvas.hasPointerCapture(event.pointerId)) {
    dom.timelineCanvas.releasePointerCapture(event.pointerId);
  }
  updateInspector();
  if (mode === "in" || mode === "out") {
    showToast("Trim updated", `${mode.toUpperCase()} point snapped to ${formatClipTime(state.time)}.`);
  }
}

function parseClipTime(value) {
  const match = String(value).match(/(?:(\d+):)?(\d{1,2}(?:\.\d+)?)/);
  if (!match) return null;
  const minutes = Number(match[1] || 0);
  const seconds = Number(match[2] || 0);
  const total = minutes * 60 + seconds;
  return Number.isFinite(total) ? clamp(total, 0, DURATION) : null;
}

function commitRangeFields() {
  const clip = selectedClip();
  const inValue = parseClipTime(dom.inField.value);
  const outValue = parseClipTime(dom.outField.value);
  if (inValue !== null) {
    const limits = trimConstraints(state.selectedClip);
    clip.in = clamp(inValue, limits.minIn, clip.out - 0.5);
  }
  if (outValue !== null) {
    const limits = trimConstraints(state.selectedClip);
    clip.out = clamp(outValue, clip.in + 0.5, limits.maxOut);
  }
  state.time = clamp(state.time, clip.in, clip.out);
  updateInspector();
  showToast("Range updated", "The clip now matches the new in and out points.");
}

function setRatio(ratioId) {
  const clip = selectedClip();
  if (!RATIOS[ratioId] || clip.ratio === ratioId) return;
  clip.ratio = ratioId;
  setPipRatio(ratioId);
  updateRatioCards();
  updateInspector();
  thumbnailCache.clear();
  showToast("Ratio changed", `${ratioId} output keeps the subject inside the 90% safe frame.`);
}

function nudgeTime(direction) {
  const clip = selectedClip();
  state.time = clamp(state.time + direction / FPS, clip.in, clip.out);
  updateRangeUi();
}

function handleKeydown(event) {
  if (event.target instanceof HTMLInputElement) return;
  if (event.code === "Space") {
    event.preventDefault();
    togglePlayback();
  } else if (event.key === "ArrowLeft") {
    event.preventDefault();
    nudgeTime(event.shiftKey ? -1 : -1 / FPS);
  } else if (event.key === "ArrowRight") {
    event.preventDefault();
    nudgeTime(event.shiftKey ? 1 : 1 / FPS);
  } else if (event.key.toLowerCase() === "j") {
    event.preventDefault();
    stepFrame(-10);
  } else if (event.key.toLowerCase() === "k") {
    event.preventDefault();
    togglePlayback();
  } else if (event.key.toLowerCase() === "l") {
    event.preventDefault();
    stepFrame(10);
  }
}

function buildExportRow(clip) {
  const ratio = RATIOS[clip.ratio];
  const row = document.createElement("div");
  row.className = "export-row";
  row.dataset.clipId = String(clip.id);

  const thumb = document.createElement("div");
  thumb.className = "export-thumb";
  const thumbCanvas = document.createElement("canvas");
  thumbCanvas.width = ratio.width / 10;
  thumbCanvas.height = ratio.height / 10;
  const thumbContext = thumbCanvas.getContext("2d", { alpha: false });
  const time = clip.in + clipDuration(clip) * 0.56;
  const crop = getCrop(clip.ratio, time, clip);
  drawCroppedFrame(thumbContext, time, crop, { subtitles: false });
  thumb.append(thumbCanvas);

  const copy = document.createElement("div");
  copy.className = "export-copy";
  const slug = clip.name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
  copy.innerHTML = `<strong>${String(clip.id).padStart(2, "0")} / ${clip.name}</strong><span>offbeat_${String(clip.id).padStart(2, "0")}_${slug}_${clip.ratio.replace(":", "x")}.webm</span>`;

  const meta = document.createElement("div");
  meta.className = "export-meta";
  meta.innerHTML = `<strong>${formatClipTime(clip.in)} → ${formatClipTime(clip.out)}</strong><span>${ratio.width}×${ratio.height} · 30 fps</span>`;

  const exportState = document.createElement("span");
  exportState.className = "export-state";
  exportState.textContent = "QUEUED";

  const link = document.createElement("a");
  link.className = "download-link";
  link.textContent = "DOWNLOAD";
  link.download = "";

  row.append(thumb, copy, meta, exportState, link);
  return row;
}

function renderExportQueue() {
  dom.exportList.replaceChildren();
  clips.forEach((clip) => dom.exportList.append(buildExportRow(clip)));
}

function exportRow(clipId) {
  return dom.exportList.querySelector(`[data-clip-id="${clipId}"]`);
}

function setExportState(clip, status, progress = null) {
  const row = exportRow(clip.id);
  if (!row) return;
  const label = row.querySelector(".export-state");
  row.classList.toggle("is-rendering", status === "rendering");
  if (status === "rendering") {
    row.classList.remove("is-done");
    label.className = "export-state is-rendering";
    label.textContent =
      progress === null ? "RENDERING" : `RENDERING ${Math.round(progress * 100)}%`;
  } else if (status === "verifying") {
    label.className = "export-state is-rendering";
    label.textContent = "PLAYBACK CHECK";
  } else if (status === "error") {
    label.className = "export-state";
    label.textContent = "FAILED";
  }
}

function markExportDone(recorded, verification, downloadUrl) {
  const row = exportRow(recorded.clipId);
  if (!row) return;
  row.classList.remove("is-rendering");
  row.classList.add("is-done");
  const stateLabel = row.querySelector(".export-state");
  stateLabel.className = "export-state is-done";
  stateLabel.textContent = verification.passed
    ? `PASS · ${verification.duration.toFixed(2)}s`
    : "CHECK FAILED";
  const link = row.querySelector(".download-link");
  link.href = downloadUrl;
  link.download = recorded.fileName;
  link.textContent = verification.passed
    ? `${verification.duration.toFixed(2)}s · SAVE`
    : "REVIEW";
}

function openExportModal() {
  renderExportQueue();
  dom.exportModal.classList.add("is-open");
  dom.exportModal.setAttribute("aria-hidden", "false");
}

function closeExportModal() {
  if (state.isExporting) return;
  dom.exportModal.classList.remove("is-open");
  dom.exportModal.setAttribute("aria-hidden", "true");
}

async function exportAll() {
  if (state.isExporting) return;
  state.isExporting = true;
  state.exports = [];
  renderExportQueue();
  dom.confirmExportButton.disabled = true;
  dom.confirmExportButton.querySelector("span").textContent = "Rendering…";
  dom.exportButtonMeta.textContent = "0 / 3";
  dom.renderNote.textContent = "Rendering in real time. Each file is played back to verify its length.";

  let passed = 0;
  for (let index = 0; index < clips.length; index += 1) {
    const clip = clips[index];
    setExportState(clip, "rendering", 0);
    try {
      const recorded = await recordClip(clip, {
        subtitles: state.subtitles,
        smart: clip.smart,
        tracking: clip.tracking,
        onProgress: (progress) => setExportState(clip, "rendering", progress),
      });
      recorded.clipId = clip.id;
      setExportState(clip, "verifying");
      const verification = await verifyPlayback(recorded, {
        fullPlayback: true,
        tolerance: 0.42,
      });
      const downloadUrl = URL.createObjectURL(recorded.blob);
      const exportRecord = {
        ...verification,
        clipId: clip.id,
        ratio: clip.ratio,
        in: clip.in,
        out: clip.out,
        hasAudio: recorded.hasAudio,
        downloadUrl,
        blob: recorded.blob,
      };
      state.exports.push(exportRecord);
      markExportDone(recorded, verification, downloadUrl);
      downloadRecording(recorded);
      if (verification.passed) passed += 1;
      dom.exportButtonMeta.textContent = `${index + 1} / 3`;
    } catch (error) {
      setExportState(clip, "error");
      state.exports.push({
        clipId: clip.id,
        passed: false,
        error: error.message,
        expectedDuration: clipDuration(clip),
      });
      dom.renderNote.textContent = `Render stopped: ${error.message}`;
    }
  }

  state.isExporting = false;
  dom.confirmExportButton.disabled = false;
  dom.confirmExportButton.querySelector("span").textContent = "Render again";
  dom.exportButtonMeta.textContent = `${passed} / 3 passed`;
  dom.renderNote.textContent =
    passed === 3
      ? "All three WebM files rendered and played back to their final frame."
      : "One or more clips failed the duration check. Review the queue.";
  showToast(
    passed === 3 ? "Three crops exported" : "Render check needs attention",
    passed === 3
      ? "WebM lengths verified by full playback."
      : `${passed} of 3 clips passed the playback check.`,
  );
}

function initEvents() {
  dom.playButton.addEventListener("click", togglePlayback);
  document.getElementById("jumpStartButton").addEventListener("click", () => {
    if (state.playing) stopPlayback();
    state.time = selectedClip().in;
    updateRangeUi();
  });
  document.getElementById("jumpEndButton").addEventListener("click", () => {
    if (state.playing) stopPlayback();
    state.time = selectedClip().out;
    updateRangeUi();
  });
  document.getElementById("stepBackButton").addEventListener("click", () => stepFrame(-1));
  document.getElementById("stepForwardButton").addEventListener("click", () => stepFrame(1));
  dom.loopButton.addEventListener("click", () => {
    state.loop = !state.loop;
    dom.loopButton.classList.toggle("is-on", state.loop);
    dom.loopButton.lastChild.textContent = state.loop ? " LOOP CLIP" : " ONCE";
  });
  dom.safeGuideButton.addEventListener("click", () => {
    state.safeGuides = !state.safeGuides;
    dom.safeGuideButton.classList.toggle("is-active", state.safeGuides);
  });
  document.getElementById("fullscreenButton").addEventListener("click", () => {
    const shell = document.getElementById("sourceShell");
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      shell.requestFullscreen?.();
    }
  });
  dom.ratioGrid.addEventListener("click", (event) => {
    const card = event.target.closest(".ratio-card");
    if (card) setRatio(card.dataset.ratio);
  });
  dom.inField.addEventListener("change", commitRangeFields);
  dom.outField.addEventListener("change", commitRangeFields);
  dom.inField.addEventListener("keydown", (event) => {
    if (event.key === "Enter") dom.inField.blur();
  });
  dom.outField.addEventListener("keydown", (event) => {
    if (event.key === "Enter") dom.outField.blur();
  });
  dom.smartFrameToggle.addEventListener("change", () => {
    selectedClip().smart = dom.smartFrameToggle.checked;
    thumbnailCache.clear();
    showToast(
      "Smart framing updated",
      dom.smartFrameToggle.checked ? "Subject lock is active." : "Crop is centered.",
    );
  });
  dom.trackingToggle.addEventListener("change", () => {
    selectedClip().tracking = dom.trackingToggle.checked;
    thumbnailCache.clear();
  });
  dom.subtitleToggle.addEventListener("change", () => {
    state.subtitles = dom.subtitleToggle.checked;
  });
  document.getElementById("openExportButton").addEventListener("click", openExportModal);
  document.getElementById("renderAllButton").addEventListener("click", openExportModal);
  document.getElementById("closeExportButton").addEventListener("click", closeExportModal);
  dom.exportModal.addEventListener("click", (event) => {
    if (event.target === dom.exportModal) closeExportModal();
  });
  dom.confirmExportButton.addEventListener("click", exportAll);
  dom.timelineCanvas.addEventListener("pointerdown", onTimelinePointerDown);
  dom.timelineCanvas.addEventListener("pointermove", onTimelinePointerMove);
  dom.timelineCanvas.addEventListener("pointerup", onTimelinePointerUp);
  dom.timelineCanvas.addEventListener("pointercancel", onTimelinePointerUp);
  window.addEventListener("keydown", handleKeydown);
}

function resizeTimeline() {
  const size = fitTimelineCanvas();
  if (!size) return;
  timelineGeometry = timelineLayout(size.width, size.height);
  drawTimeline();
}

function auditFraming() {
  const context = document.createElement("canvas").getContext("2d");
  return clips.map((clip) => {
    let sampleCount = 0;
    let subjectSafe = true;
    let captionsInBounds = true;
    let minimumRightMargin = Infinity;
    for (let time = clip.in; time <= clip.out + 0.001; time += 0.1) {
      sampleCount += 1;
      const crop = getCrop(clip.ratio, time, {
        smart: clip.smart,
        tracking: clip.tracking,
      });
      if (!isSubjectSafe(crop, time)) subjectSafe = false;
      const caption = getCaptionLayout(context, time, crop);
      const right = caption.boxX + caption.boxWidth;
      const bottom = caption.boxY + caption.boxHeight;
      const outside =
        caption.boxX < crop.x ||
        caption.boxY < crop.y ||
        right > crop.x + crop.w ||
        bottom > crop.y + crop.h;
      if (outside) captionsInBounds = false;
      minimumRightMargin = Math.min(minimumRightMargin, crop.x + crop.w - right);
    }
    return {
      clipId: clip.id,
      ratio: clip.ratio,
      sampleCount,
      subjectSafe,
      captionsInBounds,
      minimumRightMargin: Number(minimumRightMargin.toFixed(2)),
    };
  });
}

function init() {
  updateInspector();
  initEvents();
  resizeTimeline();
  new ResizeObserver(resizeTimeline).observe(dom.timelineCanvas.parentElement);
  clips.forEach((clip) => getClipThumbnails(clip));
  drawSourceFrame();
  drawTimeline();
  requestAnimationFrame(animationLoop);

  window.cropStudio = {
    clips,
    state,
    selectClip,
    setRatio,
    auditFraming,
    exportAll,
    openExportModal,
    getTimelineGeometry: () => ({ ...timelineGeometry }),
    getCurrentCrop: () =>
      getCrop(selectedClip().ratio, state.time, {
        smart: selectedClip().smart,
        tracking: selectedClip().tracking,
      }),
    getExports: () =>
      state.exports.map(({ blob, downloadUrl, ...record }) => ({ ...record })),
    setTime: (time) => {
      state.time = clamp(time, selectedClip().in, selectedClip().out);
      updateRangeUi();
    },
  };
}

init();
