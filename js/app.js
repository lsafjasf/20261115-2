import {
  ART_HEIGHT,
  ART_WIDTH,
  PANEL_HEIGHT,
  PANEL_WIDTH,
  drawArtwork,
} from "./artwork.js";
import { FoldRenderer } from "./renderer.js";

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const degrees = (radians) => Math.round((radians * 180) / Math.PI);

const VIEWS = {
  front: { yaw: -0.16, pitch: 0.025, zoom: 1, stamp: "A / 01" },
  side: { yaw: 0.34, pitch: -0.07, zoom: 1, stamp: "B / 02" },
  wide: { yaw: -0.44, pitch: 0.12, zoom: 1, stamp: "C / 03" },
};

const state = {
  yaw: VIEWS.front.yaw,
  pitch: VIEWS.front.pitch,
  targetYaw: VIEWS.front.yaw,
  targetPitch: VIEWS.front.pitch,
  zoom: 1,
  targetZoom: 1,
  lightAz: 48,
  lightEl: 55,
};

const elements = {
  canvas: document.querySelector("#foldCanvas"),
  wrap: document.querySelector("#canvasWrap"),
  yaw: document.querySelector("#yawReadout"),
  pitch: document.querySelector("#pitchReadout"),
  stamp: document.querySelector("#angleStamp"),
  hint: document.querySelector("#dragHint"),
  lightPad: document.querySelector("#lightPad"),
  lightRay: document.querySelector("#lightRay"),
  lightSun: document.querySelector("#lightSun"),
  lightReadout: document.querySelector("#lightReadout"),
  toast: document.querySelector("#toast"),
  presets: [...document.querySelectorAll(".preset")],
  exportFlat: document.querySelector("#exportFlat"),
  exportView: document.querySelector("#exportView"),
};

let renderer;
let artwork;
let frame = 0;
let activeView = "front";
let drag = null;
let toastTimer = 0;

function showToast(message) {
  window.clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add("is-visible");
  toastTimer = window.setTimeout(() => {
    elements.toast.classList.remove("is-visible");
  }, 2100);
}

function updateReadout() {
  elements.yaw.textContent = `YAW ${degrees(state.yaw) >= 0 ? "+" : "−"}${Math.abs(degrees(state.yaw))}°`;
  elements.pitch.textContent = `PITCH ${degrees(state.pitch) >= 0 ? "+" : "−"}${Math.abs(degrees(state.pitch))}°`;
  elements.stamp.textContent = activeView === "free" ? "FREE / 04" : VIEWS[activeView].stamp;
}

function updateLightControl() {
  const radians = (state.lightAz * Math.PI) / 180;
  const x = Math.cos(radians);
  const y = Math.sin(radians);
  elements.lightRay.style.transform = `rotate(${state.lightAz}deg)`;
  elements.lightSun.style.transform = `translate(${x * 12}px, ${y * 12}px)`;
  elements.lightReadout.textContent = `${Math.round(state.lightAz)}°`;
  elements.lightPad.setAttribute("aria-valuenow", String(Math.round(state.lightAz)));
}

function render() {
  if (!renderer) return;
  renderer.render(state);
  updateReadout();
}

function requestFrame() {
  if (frame) return;
  frame = window.requestAnimationFrame(tick);
}

function tick() {
  frame = 0;
  const yawDistance = state.targetYaw - state.yaw;
  const pitchDistance = state.targetPitch - state.pitch;
  const zoomDistance = state.targetZoom - state.zoom;
  const moving =
    Math.abs(yawDistance) > 0.00025 ||
    Math.abs(pitchDistance) > 0.00025 ||
    Math.abs(zoomDistance) > 0.0005;

  state.yaw += yawDistance * 0.18;
  state.pitch += pitchDistance * 0.18;
  state.zoom += zoomDistance * 0.18;
  if (!moving) {
    state.yaw = state.targetYaw;
    state.pitch = state.targetPitch;
    state.zoom = state.targetZoom;
  }

  render();
  if (moving || drag) requestFrame();
}

function selectView(name) {
  if (!VIEWS[name]) return;
  activeView = name;
  const view = VIEWS[name];
  state.targetYaw = view.yaw;
  state.targetPitch = view.pitch;
  state.targetZoom = view.zoom;
  elements.presets.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.view === name);
  });
  requestFrame();
}

function setLightFromPointer(event) {
  const rect = elements.lightPad.getBoundingClientRect();
  const x = event.clientX - (rect.left + rect.width / 2);
  const y = event.clientY - (rect.top + rect.height / 2);
  if (Math.hypot(x, y) < 2) return;
  state.lightAz = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  updateLightControl();
  render();
}

function beginDrag(event) {
  if (event.button !== 0) return;
  drag = {
    x: event.clientX,
    y: event.clientY,
    yaw: state.targetYaw,
    pitch: state.targetPitch,
  };
  activeView = "free";
  elements.wrap.classList.add("is-dragging");
  elements.hint.style.opacity = "0";
  elements.presets.forEach((button) => button.classList.remove("is-active"));
  elements.canvas.setPointerCapture?.(event.pointerId);
}

function moveDrag(event) {
  if (!drag) return;
  const dx = event.clientX - drag.x;
  const dy = event.clientY - drag.y;
  state.targetYaw = clamp(drag.yaw + dx * 0.0048, -0.78, 0.78);
  state.targetPitch = clamp(drag.pitch - dy * 0.004, -0.26, 0.3);
  requestFrame();
}

function endDrag(event) {
  if (!drag) return;
  drag = null;
  elements.wrap.classList.remove("is-dragging");
  elements.canvas.releasePointerCapture?.(event.pointerId);
}

function zoomStage(event) {
  event.preventDefault();
  const factor = Math.exp(-event.deltaY * 0.0013);
  state.targetZoom = clamp(state.targetZoom * factor, 0.82, 1.55);
  activeView = "free";
  elements.presets.forEach((button) => button.classList.remove("is-active"));
  requestFrame();
}

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportFlat() {
  artwork.canvas.toBlob((blob) => {
    if (!blob) return;
    download(blob, "fold-studies-unfolded.png");
    showToast("展开平面已导出 · 2048 × 1100");
  }, "image/png");
}

function createViewExport() {
  renderer.render(state);
  const source = elements.canvas;
  const output = document.createElement("canvas");
  output.width = source.width;
  output.height = source.height;
  const ctx = output.getContext("2d");
  const dpr = source.width / Math.max(1, elements.canvas.getBoundingClientRect().width);

  ctx.fillStyle = "#e6e1d5";
  ctx.fillRect(0, 0, output.width, output.height);
  const ambient = ctx.createRadialGradient(
    output.width * 0.55,
    output.height * 0.43,
    0,
    output.width * 0.55,
    output.height * 0.43,
    output.width * 0.68,
  );
  ambient.addColorStop(0, "#f5f2e9");
  ambient.addColorStop(0.65, "#e9e4d7");
  ambient.addColorStop(1, "#ded8ca");
  ctx.fillStyle = ambient;
  ctx.fillRect(0, 0, output.width, output.height);

  ctx.strokeStyle = "rgba(27,27,24,.055)";
  ctx.lineWidth = Math.max(1, dpr * 0.7);
  const grid = 32 * dpr;
  for (let x = 0; x <= output.width; x += grid) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, output.height);
    ctx.stroke();
  }
  for (let y = 0; y <= output.height; y += grid) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(output.width, y);
    ctx.stroke();
  }

  ctx.drawImage(source, 0, 0);
  return output;
}

function exportView() {
  if (drag) return;
  const output = createViewExport();
  output.toBlob((blob) => {
    if (!blob) return;
    download(blob, `fold-studies-view-${degrees(state.yaw)}deg.png`);
    showToast(`当前视角已导出 · ${output.width} × ${output.height}`);
  }, "image/png");
}

function getAudit() {
  const boxes = artwork.boxes;
  const overlaps = [];
  for (let first = 0; first < boxes.length; first += 1) {
    for (let second = first + 1; second < boxes.length; second += 1) {
      const a = boxes[first];
      const b = boxes[second];
      if (a.panel !== b.panel) continue;
      const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
      const overlapY = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
      if (overlapX > 0.5 && overlapY > 0.5) {
        overlaps.push({
          panel: a.panel,
          first: a.text,
          second: b.text,
          overlapX,
          overlapY,
        });
      }
    }
  }

  const outside = boxes.filter(
    (box) =>
      box.x < 32 ||
      box.x + box.width > PANEL_WIDTH - 32 ||
      box.y < 24 ||
      box.y + box.height > PANEL_HEIGHT - 24,
  );
  const screens = renderer.getPanelScreens(state);
  const panelWidths = screens.map((panel) => {
    const top = Math.hypot(panel[3].x - panel[0].x, panel[3].y - panel[0].y);
    const bottom = Math.hypot(panel[2].x - panel[1].x, panel[2].y - panel[1].y);
    return Math.min(top, bottom);
  });

  return {
    view: { yaw: state.yaw, pitch: state.pitch, degrees: degrees(state.yaw) },
    light: { azimuth: state.lightAz, elevation: state.lightEl },
    lighting: renderer.lastInfo?.lighting,
    boxes: boxes.length,
    overlaps,
    outside,
    panelScreenWidths: panelWidths,
    scaled20pxCopy: panelWidths.map((width) => (width / PANEL_WIDTH) * 20),
    drawOrder: renderer.lastInfo?.drawOrder,
  };
}

function keyboardLight(event) {
  if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
  event.preventDefault();
  const step = event.shiftKey ? 15 : 5;
  if (event.key === "ArrowLeft") state.lightAz = (state.lightAz - step + 360) % 360;
  if (event.key === "ArrowRight") state.lightAz = (state.lightAz + step) % 360;
  if (event.key === "ArrowUp") state.lightAz = (state.lightAz - step + 360) % 360;
  if (event.key === "ArrowDown") state.lightAz = (state.lightAz + step) % 360;
  updateLightControl();
  render();
}

async function init() {
  await document.fonts.load('500 64px "Noto Sans SC Local"');
  await document.fonts.load('700 64px "Noto Sans SC Local"');
  await document.fonts.ready;
  artwork = drawArtwork();
  renderer = new FoldRenderer(elements.canvas, artwork);
  elements.presets.forEach((button) => {
    button.addEventListener("click", () => selectView(button.dataset.view));
  });
  elements.wrap.addEventListener("pointerdown", beginDrag);
  elements.wrap.addEventListener("pointermove", moveDrag);
  elements.wrap.addEventListener("pointerup", endDrag);
  elements.wrap.addEventListener("pointercancel", endDrag);
  elements.wrap.addEventListener("wheel", zoomStage, { passive: false });
  elements.wrap.addEventListener("dblclick", () => selectView("front"));
  elements.lightPad.addEventListener("pointerdown", (event) => {
    elements.lightPad.setPointerCapture?.(event.pointerId);
    setLightFromPointer(event);
  });
  elements.lightPad.addEventListener("pointermove", (event) => {
    if (event.buttons) setLightFromPointer(event);
  });
  elements.lightPad.addEventListener("keydown", keyboardLight);
  elements.exportFlat.addEventListener("click", exportFlat);
  elements.exportView.addEventListener("click", exportView);

  const observer = new ResizeObserver(() => {
    renderer.render(state);
  });
  observer.observe(elements.wrap);
  updateLightControl();
  renderer.render(state);
  updateReadout();
  document.body.classList.add("is-ready");

  window.foldApp = {
    state,
    setView: selectView,
    setLight: (azimuth, elevation = 55) => {
      state.lightAz = ((azimuth % 360) + 360) % 360;
      state.lightEl = clamp(elevation, 8, 88);
      updateLightControl();
      render();
    },
    setAngles: (yaw, pitch) => {
      state.yaw = state.targetYaw = yaw;
      state.pitch = state.targetPitch = pitch;
      activeView = "free";
      render();
    },
    exportFlat,
    exportView,
    audit: getAudit,
    artwork: artwork.canvas,
    dimensions: { width: ART_WIDTH, height: ART_HEIGHT },
  };
  window.foldReady = true;
}

init().catch((error) => {
  console.error(error);
  showToast(`画布初始化失败：${error.message}`);
});
