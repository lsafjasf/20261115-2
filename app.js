import {
  LOOP_SECONDS,
  MAX_NODE_TIME,
  MASK_WINDOW,
  PRESETS,
  STEP_SECONDS,
  TRACKS,
  ForestAudio,
  checkSeams,
} from "./sound.js";

const icons = {
  cicada: `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 8c2.2-3.5 8-4.2 11 0-2.3 3.3-8.5 3.8-11 0Z"/><path d="M7 7.2c1 .9 1 1.8 0 2.7M9.8 6.3c1.1 1.5 1.2 2.8.2 4.2"/></svg>`,
  drop: `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2.2s4.1 4.3 4.1 7.1a4.1 4.1 0 1 1-8.2 0C3.9 6.5 8 2.2 8 2.2Z"/><path d="M6.4 9.6c.1 1 .8 1.7 1.7 1.8"/></svg>`,
  bird: `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 9c2.3.9 4.2.5 5.3-1.2 1.3-2 2.7-3.2 5.5-3.9-1.3 2-1.9 4.4-3.8 6.1-2 1.8-4.5 1.4-7-.9Z"/><path d="M9.8 5.4h.1"/></svg>`,
  frog: `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.4c0-2.5 2-4.4 5-4.4s5 1.9 5 4.4c0 2.2-1.9 3.8-5 3.8S3 10.6 3 8.4Z"/><circle cx="6" cy="6.2" r="1"/><circle cx="10" cy="6.2" r="1"/><path d="M6 10c1.3.6 2.7.6 4 0"/></svg>`,
  leaf: `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M13.4 2.7C8.7 2.6 4.4 5.7 3.2 10.8c3.8 2.2 8.7-.3 10.2-7.9Z"/><path d="M3.5 13.4c1-3.8 3.2-6.4 6.8-8.3"/></svg>`,
  pod: `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M9.9 2.1c2.3.8 3.7 3.2 3.4 5.7-.4 3.2-2.8 5.5-5.8 5.4-2.1-.1-3.7-1.4-4.3-3.1"/><path d="M6.9 2.8C5 3.6 3.7 5.1 3.5 7M8.2 5.1c-.8.9-1.2 2.2-1.2 3.4"/><circle cx="4.2" cy="9.4" r=".4"/></svg>`,
};

const speakerIcon = `
  <svg viewBox="0 0 16 16" aria-hidden="true">
    <path d="M2.8 6.2v3.6h2.3l3 2.2V4l-3 2.2H2.8Z"/>
    <path d="M10.5 5.7c1.1.9 1.1 3.7 0 4.6"/>
    <path class="slash" d="M2 2l12 12"/>
  </svg>`;

const state = {
  preset: "dawn",
  times: { ...PRESETS.dawn.times },
  muted: new Map(TRACKS.map((track) => [track.id, false])),
  drag: null,
  toastTimer: 0,
  checking: false,
};

const engine = new ForestAudio();
engine.setPattern({ ...PRESETS.dawn, times: state.times });

const els = {
  rack: document.querySelector("#samplerRack"),
  laneLabels: document.querySelector("#laneLabels"),
  ruler: document.querySelector("#ruler"),
  nodes: document.querySelector("#nodesLayer"),
  masks: document.querySelector("#maskLayer"),
  gridCanvas: document.querySelector("#gridCanvas"),
  waveCanvas: document.querySelector("#waveCanvas"),
  plot: document.querySelector("#plot"),
  waveFrame: document.querySelector(".wave-frame"),
  composer: document.querySelector(".composer-panel"),
  playhead: document.querySelector("#playhead"),
  playButton: document.querySelector("#playButton"),
  playState: document.querySelector("#playState"),
  timeReadout: document.querySelector("#timeReadout"),
  statusCopy: document.querySelector("#statusCopy"),
  densityBars: document.querySelector("#densityBars"),
  seamResult: document.querySelector("#seamResult"),
  seamButton: document.querySelector("#seamButton"),
  toast: document.querySelector("#toast"),
  presetButtons: [...document.querySelectorAll(".preset-button")],
};

function formatTime(value) {
  return Number(value).toFixed(2);
}

function snapTime(value) {
  return Math.min(
    MAX_NODE_TIME,
    Math.max(0, Math.round(value / STEP_SECONDS) * STEP_SECONDS),
  );
}

function trackBy(id) {
  return TRACKS.find((track) => track.id === id);
}

function showToast(message) {
  window.clearTimeout(state.toastTimer);
  els.toast.textContent = message;
  els.toast.classList.add("show");
  state.toastTimer = window.setTimeout(() => {
    els.toast.classList.remove("show");
  }, 2200);
}

function renderRack() {
  els.rack.innerHTML = TRACKS.map((track) => {
    const isMuted = state.muted.get(track.id);
    return `
      <article class="sampler-card${isMuted ? " muted" : ""}" data-track="${track.id}" style="--track-color: ${track.color}">
        <span class="sampler-glyph">${icons[track.id]}</span>
        <span class="sampler-name">
          <strong>${track.name}</strong>
          <small>${track.latin} / ${track.band}</small>
        </span>
        <button
          class="mute-toggle"
          type="button"
          data-mute="${track.id}"
          aria-label="${isMuted ? "取消静音" : "静音"} ${track.name}"
          aria-pressed="${isMuted}"
          title="${isMuted ? "取消静音" : "静音"}"
        >${speakerIcon}</button>
      </article>
    `;
  }).join("");
}

function renderLabels() {
  els.laneLabels.innerHTML = TRACKS.map((track) => `
    <div class="lane-label${state.muted.get(track.id) ? " muted" : ""}" style="--track-color: ${track.color}">
      <div>
        <strong>${track.name}</strong>
        <small>${formatTime(state.times[track.id])} s</small>
      </div>
    </div>
  `).join("");

  els.ruler.innerHTML = Array.from({ length: 9 }, (_, index) => {
    const time = index;
    const left = (index / 8) * 100;
    return `
      <span class="ruler-tick${index ? " half" : ""}" style="left: ${left}%">
        ${index === 0 ? "0.00" : index === 8 ? "8.00" : index.toFixed(0)}
      </span>
    `;
  }).join("");
}

function renderDensity() {
  const bins = Array.from({ length: 12 }, () => []);
  for (const track of TRACKS) {
    if (state.muted.get(track.id)) continue;
    const bin = Math.min(11, Math.floor((state.times[track.id] / LOOP_SECONDS) * 12));
    bins[bin].push(track.id);
  }
  els.densityBars.innerHTML = bins
    .map((items) => {
      if (items.length >= 2) return `<i class="hot"></i>`;
      if (items.length === 1) return `<i class="on"></i>`;
      return "<i></i>";
    })
    .join("");
}

function renderNodes() {
  els.nodes.innerHTML = TRACKS.map((track, index) => {
    const isMuted = state.muted.get(track.id);
    return `
      <div
        class="sample-node${isMuted ? " muted" : ""}"
        data-node="${track.id}"
        role="slider"
        tabindex="0"
        aria-label="${track.name}发声时间"
        aria-valuemin="0"
        aria-valuemax="${MAX_NODE_TIME}"
        aria-valuenow="${state.times[track.id]}"
        aria-valuetext="${formatTime(state.times[track.id])} 秒"
        style="--track-color: ${track.color}; left: ${(state.times[track.id] / LOOP_SECONDS) * 100}%; top: ${index * 58 + 29}px"
      >
        <span class="node-core">${icons[track.id]}</span>
        <span class="node-time">${formatTime(state.times[track.id])} s</span>
      </div>
    `;
  }).join("");

  for (const node of els.nodes.querySelectorAll(".sample-node")) {
    const trackId = node.dataset.node;
    node.addEventListener("pointerdown", (event) => beginDrag(event, trackId, node));
    node.addEventListener("pointermove", moveDrag);
    node.addEventListener("pointerup", endDrag);
    node.addEventListener("pointercancel", endDrag);
    node.addEventListener("keydown", (event) => {
      const direction =
        event.key === "ArrowRight" || event.key === "ArrowUp"
          ? 1
          : event.key === "ArrowLeft" || event.key === "ArrowDown"
            ? -1
            : 0;
      if (!direction) return;
      event.preventDefault();
      const increment = event.shiftKey ? 1 : STEP_SECONDS;
      setTrackTime(trackId, snapTime(state.times[trackId] + direction * increment));
      if (engine.playing) showToast("时间已更新 · 下一圈生效");
    });
  }
}

function updateNodePosition(trackId) {
  const node = els.nodes.querySelector(`[data-node="${trackId}"]`);
  if (!node) return;
  const time = state.times[trackId];
  node.style.left = `${(time / LOOP_SECONDS) * 100}%`;
  node.setAttribute("aria-valuenow", String(time));
  node.setAttribute("aria-valuetext", `${formatTime(time)} 秒`);
  const label = node.querySelector(".node-time");
  if (label) label.textContent = `${formatTime(time)} s`;
  const laneLabel = els.laneLabels.querySelector(
    `.lane-label:nth-child(${TRACKS.findIndex((track) => track.id === trackId) + 1}) small`,
  );
  if (laneLabel) laneLabel.textContent = `${formatTime(time)} s`;
}

function beginDrag(event, trackId, node) {
  if (event.button !== 0) return;
  event.preventDefault();
  state.drag = { trackId, node, pointerId: event.pointerId };
  node.setPointerCapture(event.pointerId);
  node.classList.add("dragging");
  applyPointerTime(event.clientX, trackId);
}

function moveDrag(event) {
  if (!state.drag || state.drag.pointerId !== event.pointerId) return;
  applyPointerTime(event.clientX, state.drag.trackId);
}

function endDrag(event) {
  if (!state.drag || state.drag.pointerId !== event.pointerId) return;
  state.drag.node.classList.remove("dragging");
  try {
    state.drag.node.releasePointerCapture(event.pointerId);
  } catch {
    // Pointer capture may already be released by the browser.
  }
  state.drag = null;
  if (engine.playing) showToast("节奏已改写 · 下一圈生效");
}

function applyPointerTime(clientX, trackId) {
  const rect = els.plot.getBoundingClientRect();
  if (rect.width <= 0) return;
  const raw = ((clientX - rect.left) / rect.width) * LOOP_SECONDS;
  setTrackTime(trackId, snapTime(raw));
}

function setTrackTime(trackId, time) {
  if (state.times[trackId] === time) return;
  state.times[trackId] = time;
  updateNodePosition(trackId);
  engine.setPattern({ ...PRESETS[state.preset], times: { ...state.times } });
  refreshInsights();
}

function getMaskGroups() {
  const active = TRACKS
    .filter((track) => !state.muted.get(track.id))
    .map((track) => ({ track, time: state.times[track.id] }))
    .sort((a, b) => a.time - b.time);
  const groups = [];
  let current = [];

  for (const entry of active) {
    const previous = current[current.length - 1];
    if (previous && entry.time - previous.time <= MASK_WINDOW) {
      current.push(entry);
    } else {
      if (current.length > 1) groups.push(current);
      current = [entry];
    }
  }
  if (current.length > 1) groups.push(current);
  return groups;
}

function renderMasks(groups) {
  els.masks.innerHTML = groups
    .map((group) => {
      const start = group[0].time;
      const end = group[group.length - 1].time;
      const width = Math.max(2.2, ((end - start) / LOOP_SECONDS) * 100);
      const left = Math.min(
        start / LOOP_SECONDS * 100,
        100 - width,
      );
      return `<span class="mask-zone" style="left: ${left}%; width: ${width}%"></span>`;
    })
    .join("");
}

function renderStatus(groups) {
  const totalTracks = groups.reduce((sum, group) => sum + group.length, 0);
  if (groups.length === 0) {
    els.statusCopy.classList.remove("warning");
    els.statusCopy.innerHTML = `
      <span class="status-icon" aria-hidden="true">✓</span>
      <div>
        <strong>声部清晰</strong>
        <p>六个节点间隔舒展，没有明显掩蔽。</p>
      </div>
    `;
    return;
  }

  const names = groups
    .map((group) => group.map((entry) => entry.track.name).join("、"))
    .join("；");
  els.statusCopy.classList.add("warning");
  els.statusCopy.innerHTML = `
    <span class="status-icon" aria-hidden="true">!</span>
    <div>
      <strong>${groups.length} 处声场拥挤 · ${totalTracks} 个声部</strong>
      <p>${names} 的起音过于接近，较弱的声音可能被掩蔽。</p>
    </div>
  `;
}

function refreshInsights() {
  const groups = getMaskGroups();
  renderMasks(groups);
  renderStatus(groups);
  renderDensity();
  drawWaveform();
}

function prepareCanvas(canvas) {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (width <= 0 || height <= 0) return null;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const pixelWidth = Math.round(width * dpr);
  const pixelHeight = Math.round(height * dpr);
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  return { ctx, width, height };
}

function drawGrid() {
  const surface = prepareCanvas(els.gridCanvas);
  if (!surface) return;
  const { ctx, width, height } = surface;
  const rowHeight = height / 6;

  for (let lane = 0; lane < 6; lane += 1) {
    const y = lane * rowHeight;
    ctx.fillStyle = lane % 2 === 0
      ? "rgba(255, 255, 255, 0.012)"
      : "rgba(0, 0, 0, 0.025)";
    ctx.fillRect(0, y, width, rowHeight);
    ctx.strokeStyle = "rgba(178, 204, 169, 0.085)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, Math.round(y) + 0.5);
    ctx.lineTo(width, Math.round(y) + 0.5);
    ctx.stroke();
    ctx.strokeStyle = "rgba(178, 204, 169, 0.045)";
    ctx.beginPath();
    ctx.moveTo(0, Math.round(y + rowHeight / 2) + 0.5);
    ctx.lineTo(width, Math.round(y + rowHeight / 2) + 0.5);
    ctx.stroke();
  }

  for (let step = 0; step < 32; step += 1) {
    const x = Math.round((step / 32) * width) + 0.5;
    const isSecond = step % 4 === 0;
    const isHalf = step % 2 === 0;
    ctx.strokeStyle = isSecond
      ? "rgba(197, 218, 187, 0.22)"
      : isHalf
        ? "rgba(178, 204, 169, 0.095)"
        : "rgba(178, 204, 169, 0.045)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, isSecond ? 0 : 8);
    ctx.lineTo(x, height);
    ctx.stroke();
    if (isSecond) {
      ctx.fillStyle = "rgba(200, 216, 115, 0.35)";
      ctx.fillRect(x - 1, 0, 2, 4);
    }
  }

  ctx.strokeStyle = "rgba(197, 218, 187, 0.16)";
  ctx.beginPath();
  ctx.moveTo(width - 0.5, 0);
  ctx.lineTo(width - 0.5, height);
  ctx.stroke();
}

const waveRates = {
  cicada: 66,
  drop: 23,
  bird: 19,
  frog: 8,
  leaf: 13,
  pod: 43,
};

function voiceEnvelope(track, local, totalDuration) {
  if (local <= 0 || local >= totalDuration) return 0;
  const progress = local / totalDuration;
  const attack = Math.min(1, local / 0.045);
  const decay = Math.pow(1 - progress, track.id === "leaf" ? 0.45 : 0.7);
  let envelope = attack * decay;

  if (track.id === "cicada") {
    envelope *= 0.45 + 0.55 * Math.abs(Math.sin(local * 38.5));
  } else if (track.id === "leaf") {
    envelope *= 0.42 + 0.58 * Math.abs(Math.sin(local * 27 + 1.1));
  } else if (track.id === "pod") {
    envelope *= 0.25 + 0.75 * Math.pow(Math.abs(Math.sin(local * 48)), 3);
  } else if (track.id === "frog") {
    envelope *= 0.5 + 0.5 * Math.abs(Math.sin(local * 19.5));
  } else if (track.id === "bird") {
    envelope *= 0.62 + 0.38 * Math.abs(Math.sin(local * 12.8));
  }
  return envelope;
}

function drawWaveform() {
  const surface = prepareCanvas(els.waveCanvas);
  if (!surface) return;
  const { ctx, width, height } = surface;
  const center = height / 2;
  const samples = [];
  let peak = 0;

  for (let x = 0; x <= width; x += 1.5) {
    const time = (x / width) * LOOP_SECONDS;
    let value = 0;
    for (const track of TRACKS) {
      if (state.muted.get(track.id)) continue;
      const local = time - state.times[track.id];
      const envelope = voiceEnvelope(track, local, track.duration);
      if (envelope <= 0) continue;
      const phase = 2 * Math.PI * waveRates[track.id] * local;
      value += envelope * Math.sin(phase + TRACKS.indexOf(track) * 0.72);
    }
    peak = Math.max(peak, Math.abs(value));
    samples.push({ x, value });
  }

  const scale = peak > 0 ? (height * 0.72) / 2 / peak : 0;
  ctx.strokeStyle = "rgba(200, 216, 115, 0.09)";
  ctx.beginPath();
  ctx.moveTo(0, Math.round(center) + 0.5);
  ctx.lineTo(width, Math.round(center) + 0.5);
  ctx.stroke();

  if (peak === 0) {
    ctx.setLineDash([5, 8]);
    ctx.strokeStyle = "rgba(143, 159, 141, 0.2)";
    ctx.beginPath();
    ctx.moveTo(0, center);
    ctx.lineTo(width, center);
    ctx.stroke();
    ctx.setLineDash([]);
    return;
  }

  const top = samples.map(({ x, value }) => [x, center - value * scale]);
  const fill = ctx.createLinearGradient(0, 0, width, 0);
  fill.addColorStop(0, "rgba(111, 209, 196, 0.17)");
  fill.addColorStop(0.46, "rgba(200, 216, 115, 0.2)");
  fill.addColorStop(1, "rgba(230, 154, 104, 0.14)");
  const stroke = ctx.createLinearGradient(0, 0, width, 0);
  stroke.addColorStop(0, "#6fd1c4");
  stroke.addColorStop(0.5, "#d7df8d");
  stroke.addColorStop(1, "#e69a68");

  ctx.beginPath();
  for (const [x, y] of top) ctx.lineTo(x, y);
  for (let index = samples.length - 1; index >= 0; index -= 1) {
    const { x, value } = samples[index];
    ctx.lineTo(x, center + value * scale);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();

  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (const [x, y] of top) ctx.lineTo(x, y);
  ctx.stroke();

  ctx.fillStyle = "rgba(215, 223, 141, 0.55)";
  for (const track of TRACKS) {
    if (state.muted.get(track.id)) continue;
    const x = (state.times[track.id] / LOOP_SECONDS) * width;
    ctx.fillRect(x - 0.5, 7, 1, 5);
  }
}

function setTransportUI(playing) {
  els.composer.classList.toggle("playing", playing);
  els.playButton.setAttribute(
    "aria-label",
    playing ? "停止八秒循环" : "播放八秒循环",
  );
  els.playState.textContent = playing ? "循环播放中" : "准备循环";
  if (!playing) {
    els.playhead.style.left = "0%";
    els.timeReadout.innerHTML = '00.00 <i>/ 08.00</i>';
  }
}

async function togglePlayback() {
  if (state.toggleBusy) return;
  state.toggleBusy = true;
  try {
    const playing = await engine.toggle();
    setTransportUI(playing);
    if (!playing) els.playState.textContent = "循环已停止";
  } catch (error) {
    console.error(error);
    showToast("无法启动音频：请检查浏览器音频权限");
  } finally {
    state.toggleBusy = false;
  }
}

function toggleMute(trackId) {
  const nextMuted = !state.muted.get(trackId);
  state.muted.set(trackId, nextMuted);
  engine.setMuted(trackId, nextMuted);
  renderRack();
  renderLabels();
  for (const node of els.nodes.querySelectorAll(".sample-node")) {
    node.classList.toggle("muted", state.muted.get(node.dataset.node));
  }
  refreshInsights();
  const track = trackBy(trackId);
  showToast(`${track.name}已${nextMuted ? "静音" : "恢复"}`);
}

function loadPreset(presetId) {
  if (presetId === state.preset) return;
  state.preset = presetId;
  state.times = { ...PRESETS[presetId].times };
  engine.setPattern({ ...PRESETS[presetId], times: { ...state.times } });

  for (const button of els.presetButtons) {
    const active = button.dataset.preset === presetId;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  }
  renderLabels();
  renderNodes();
  refreshInsights();

  if (engine.playing) {
    showToast(`${PRESETS[presetId].name}已排队 · 下一圈生效`);
  } else {
    showToast(`已载入 ${PRESETS[presetId].code} · ${PRESETS[presetId].name}`);
  }
}

function setSeamStatus(kind, html, title = "") {
  els.seamResult.classList.remove("checking", "failed");
  if (kind === "checking") els.seamResult.classList.add("checking");
  if (kind === "failed") els.seamResult.classList.add("failed");
  els.seamResult.innerHTML = `<span class="seam-pulse"></span><span>${html}</span>`;
  if (title) {
    els.seamResult.title = title;
    els.seamResult.setAttribute("title", title);
  } else {
    els.seamResult.removeAttribute("title");
  }
}

async function verifySeams() {
  if (state.checking) return;
  state.checking = true;
  els.seamButton.disabled = true;
  els.seamButton.textContent = "检测中…";
  setSeamStatus("checking", "正在检查两段接缝…");

  try {
    const [dawn, squall] = await Promise.all([
      checkSeams(PRESETS.dawn),
      checkSeams(PRESETS.squall),
    ]);
    const details = [
      `A ${dawn.passed ? "通过" : "异常"}：前 ${dawn.preRms.toFixed(3)} / 后 ${dawn.postRms.toFixed(3)} RMS，尾音跨接 ${dawn.tailCross.toFixed(2)} s`,
      `B ${squall.passed ? "通过" : "异常"}：前 ${squall.preRms.toFixed(3)} / 后 ${squall.postRms.toFixed(3)} RMS，尾音跨接 ${squall.tailCross.toFixed(2)} s`,
    ].join("\n");
    const passed = dawn.passed && squall.passed;
    if (passed) {
      setSeamStatus(
        "passed",
        `<strong>两段接缝平滑</strong> · A ${dawn.tailCross.toFixed(2)}s / B ${squall.tailCross.toFixed(2)}s 尾音跨接`,
        details,
      );
    } else {
      setSeamStatus(
        "failed",
        "<strong>接缝需要检查</strong> · 循环边界出现异常衰减",
        details,
      );
    }
  } catch (error) {
    console.error(error);
    setSeamStatus(
      "failed",
      "<strong>接缝检测失败</strong> · OfflineAudioContext 不可用",
      String(error),
    );
  } finally {
    state.checking = false;
    els.seamButton.disabled = false;
    els.seamButton.textContent = "重新检测";
  }
}

function animate() {
  if (engine.playing) {
    const elapsed = engine.elapsed();
    els.playhead.style.left = `${(elapsed / LOOP_SECONDS) * 100}%`;
    const hundredths = Math.floor(elapsed * 100);
    if (state.lastDisplay !== hundredths) {
      state.lastDisplay = hundredths;
      els.timeReadout.innerHTML = `${formatTime(elapsed)} <i>/ 08.00</i>`;
    }
  }
  window.requestAnimationFrame(animate);
}

function wireEvents() {
  els.playButton.addEventListener("click", togglePlayback);
  els.seamButton.addEventListener("click", verifySeams);
  els.presetButtons.forEach((button) => {
    button.addEventListener("click", () => loadPreset(button.dataset.preset));
  });
  els.rack.addEventListener("click", (event) => {
    const button = event.target.closest("[data-mute]");
    if (!button) return;
    toggleMute(button.dataset.mute);
  });

  const gridObserver = new ResizeObserver(() => drawGrid());
  gridObserver.observe(els.plot);
  const waveObserver = new ResizeObserver(() => drawWaveform());
  waveObserver.observe(els.waveFrame);

  document.addEventListener("visibilitychange", () => {
    if (document.hidden && engine.playing) {
      engine.stop();
      setTransportUI(false);
      els.playState.textContent = "已暂停";
    }
  });
}

function init() {
  renderRack();
  renderLabels();
  renderNodes();
  refreshInsights();
  wireEvents();
  drawGrid();
  drawWaveform();
  window.requestAnimationFrame(animate);
  window.setTimeout(verifySeams, 450);

  window.__canopy = {
    getState: () => ({
      preset: state.preset,
      times: { ...state.times },
      muted: Object.fromEntries(state.muted),
      playing: engine.playing,
    }),
    setPreset: loadPreset,
    setTrackTime: (trackId, time) => setTrackTime(trackId, snapTime(time)),
    toggleMute,
    verifySeams,
  };
}

init();
