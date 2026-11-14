"use strict";

// ---------- 常量与状态 ----------
const STAGE_W = 1600;          // 舞台世界坐标宽
const STAGE_H = 900;           // 舞台世界坐标高
const DURATION = 8;            // 预览/导出时长（秒）
const VIEW_DIST = 300;         // 取景框纵深（世界单位）
const STORAGE_KEY = "camera-path-project";

// 不可见障碍（默认不绘制，可用调试开关查看）
const obstacles = [
  { x: 620, y: 300, r: 110 },
  { x: 1050, y: 620, r: 130 },
  { x: 820, y: 700, r: 80 },
];

function defaultKeyframes() {
  return [
    { x: 200, y: 700, angle: -30, focal: 55 },
    { x: 420, y: 420, angle: -10, focal: 45 },
    { x: 800, y: 480, angle: 0, focal: 60 },
    { x: 1180, y: 380, angle: 15, focal: 50 },
    { x: 1400, y: 650, angle: 35, focal: 65 },
  ];
}

const state = {
  keyframes: defaultKeyframes(),
  selected: -1,
  playing: false,
  playT: 0,            // 当前预览时间（秒）
  recording: false,
  drag: null,          // { kind: 'move'|'rotate', index, ... }
};

// ---------- 工程保存 / 加载 ----------
function serializeProject() {
  return JSON.stringify(
    { version: 1, duration: DURATION, keyframes: state.keyframes },
    null,
    2
  );
}

function saveProject() {
  localStorage.setItem(STORAGE_KEY, serializeProject());
}

function loadProject() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (!Array.isArray(data.keyframes) || data.keyframes.length !== 5) return false;
    for (const kf of data.keyframes) {
      if (![kf.x, kf.y, kf.angle, kf.focal].every(Number.isFinite)) return false;
    }
    state.keyframes = data.keyframes.map((kf) => ({
      x: kf.x, y: kf.y, angle: kf.angle, focal: kf.focal,
    }));
    return true;
  } catch {
    return false;
  }
}

// ---------- 几何工具 ----------
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const deg2rad = (d) => (d * Math.PI) / 180;
const lerp = (a, b, t) => a + (b - a) * t;

// Catmull-Rom 样条（均匀参数化）
function catmullRom(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * ((2 * p1) + (-p0 + p2) * t +
    (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
    (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

// 沿关键点序列采样：u ∈ [0,1] 映射到整条路线
function samplePath(u) {
  const kfs = state.keyframes;
  const n = kfs.length - 1;
  const seg = clamp(u * n, 0, n - 1e-9);
  const i = Math.floor(seg);
  const t = seg - i;
  const get = (j) => kfs[clamp(j, 0, n)];
  const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
  // 角度按最短弧插值
  let da = ((p2.angle - p1.angle + 540) % 360) - 180;
  return {
    x: catmullRom(p0.x, p1.x, p2.x, p3.x, t),
    y: catmullRom(p0.y, p1.y, p2.y, p3.y, t),
    angle: p1.angle + da * t,
    focal: lerp(p1.focal, p2.focal, t),
  };
}

// 取景框（相机视野足迹）四角：近边在相机处展开为梯形
function frustumCorners(cam) {
  // 36mm 半幅 18mm：halfW = tan(atan(18/focal)) * 距离，焦距越大视角越窄
  const halfW = (18 / cam.focal) * VIEW_DIST;
  const a = deg2rad(cam.angle);
  const dir = { x: Math.cos(a), y: Math.sin(a) };
  const perp = { x: -dir.y, y: dir.x };
  const cx = cam.x + dir.x * VIEW_DIST;
  const cy = cam.y + dir.y * VIEW_DIST;
  return [
    { x: cam.x + perp.x * 6, y: cam.y + perp.y * 6 },
    { x: cx + perp.x * halfW, y: cy + perp.y * halfW },
    { x: cx - perp.x * halfW, y: cy - perp.y * halfW },
    { x: cam.x - perp.x * 6, y: cam.y - perp.y * 6 },
  ];
}

function cornersInsideStage(corners) {
  return corners.every(
    (c) => c.x >= 0 && c.x <= STAGE_W && c.y >= 0 && c.y <= STAGE_H
  );
}

// 调整取景框不越出舞台：位置钳制 + 焦距收缩
function constrainKeyframe(kf) {
  kf.focal = clamp(kf.focal, 20, 120);
  // 先钳制位置（迭代逼近，把取景框推回舞台）
  for (let iter = 0; iter < 60 && !cornersInsideStage(frustumCorners(kf)); iter++) {
    const cs = frustumCorners(kf);
    let dx = 0, dy = 0;
    for (const c of cs) {
      if (c.x < 0) dx = Math.max(dx, -c.x);
      if (c.x > STAGE_W) dx = Math.min(dx, STAGE_W - c.x);
      if (c.y < 0) dy = Math.max(dy, -c.y);
      if (c.y > STAGE_H) dy = Math.min(dy, STAGE_H - c.y);
    }
    if (dx === 0 && dy === 0) break;
    kf.x += dx;
    kf.y += dy;
  }
  // 位置钳制仍越界时，通过增大焦距收窄取景框
  while (kf.focal < 120 && !cornersInsideStage(frustumCorners(kf))) {
    kf.focal += 1;
  }
  kf.x = clamp(kf.x, 0, STAGE_W);
  kf.y = clamp(kf.y, 0, STAGE_H);
}

// ---------- 障碍检测 ----------
function pathObstacleHits() {
  const hits = [];
  const SAMPLES = 200;
  for (let s = 0; s <= SAMPLES; s++) {
    const p = samplePath(s / SAMPLES);
    for (const ob of obstacles) {
      const d = Math.hypot(p.x - ob.x, p.y - ob.y);
      if (d < ob.r) hits.push({ u: s / SAMPLES, obstacle: ob });
    }
  }
  return hits;
}

// ---------- 渲染 ----------
const canvas = document.getElementById("stage");
const ctx = canvas.getContext("2d");
let viewScale = 1, viewOffX = 0, viewOffY = 0;

function updateViewTransform() {
  const scale = Math.min(canvas.width / STAGE_W, canvas.height / STAGE_H);
  viewScale = scale;
  viewOffX = (canvas.width - STAGE_W * scale) / 2;
  viewOffY = (canvas.height - STAGE_H * scale) / 2;
}

function toScreen(p) {
  return { x: viewOffX + p.x * viewScale, y: viewOffY + p.y * viewScale };
}

function toWorld(p) {
  return { x: (p.x - viewOffX) / viewScale, y: (p.y - viewOffY) / viewScale };
}

function drawScene() {
  // 舞台背景与装饰
  ctx.fillStyle = "#1a2432";
  ctx.fillRect(viewOffX, viewOffY, STAGE_W * viewScale, STAGE_H * viewScale);
  const deco = [
    { x: 250, y: 200, r: 60, c: "#2c4a66" },
    { x: 1300, y: 180, r: 90, c: "#2c4a66" },
    { x: 700, y: 780, r: 70, c: "#27405a" },
    { x: 1450, y: 780, r: 55, c: "#27405a" },
    { x: 120, y: 500, r: 45, c: "#27405a" },
  ];
  for (const d of deco) {
    const p = toScreen(d);
    ctx.beginPath();
    ctx.arc(p.x, p.y, d.r * viewScale, 0, Math.PI * 2);
    ctx.fillStyle = d.c;
    ctx.fill();
  }
  // 舞台边框
  ctx.strokeStyle = "#4a5568";
  ctx.lineWidth = 2;
  ctx.strokeRect(viewOffX, viewOffY, STAGE_W * viewScale, STAGE_H * viewScale);
}

function drawPath(hits) {
  const hitUs = new Set(hits.map((h) => Math.round(h.u * 200)));
  ctx.lineWidth = 2.5;
  for (let s = 0; s < 200; s++) {
    const a = toScreen(samplePath(s / 200));
    const b = toScreen(samplePath((s + 1) / 200));
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.strokeStyle = hitUs.has(s) || hitUs.has(s + 1) ? "#ff5a4e" : "#6fb7ff";
    ctx.stroke();
  }
}

function drawFrustum(cam, color, fill) {
  const cs = frustumCorners(cam).map(toScreen);
  ctx.beginPath();
  ctx.moveTo(cs[0].x, cs[0].y);
  for (let i = 1; i < cs.length; i++) ctx.lineTo(cs[i].x, cs[i].y);
  ctx.closePath();
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function drawKeyframes() {
  state.keyframes.forEach((kf, i) => {
    const selected = i === state.selected;
    drawFrustum(kf, selected ? "#ffd166" : "rgba(255,209,102,0.45)",
      selected ? "rgba(255,209,102,0.10)" : "rgba(255,209,102,0.05)");
    const p = toScreen(kf);
    // 相机本体
    ctx.beginPath();
    ctx.arc(p.x, p.y, 9, 0, Math.PI * 2);
    ctx.fillStyle = selected ? "#ffd166" : "#c9a44a";
    ctx.fill();
    ctx.strokeStyle = "#1b1e24";
    ctx.lineWidth = 2;
    ctx.stroke();
    // 朝向线 + 旋转手柄
    const a = deg2rad(kf.angle);
    const hx = p.x + Math.cos(a) * 26;
    const hy = p.y + Math.sin(a) * 26;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(hx, hy);
    ctx.strokeStyle = "#ffd166";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(hx, hy, 5, 0, Math.PI * 2);
    ctx.fillStyle = "#fff";
    ctx.fill();
    // 序号
    ctx.fillStyle = "#e6e8eb";
    ctx.font = "12px sans-serif";
    ctx.fillText(String(i + 1), p.x + 12, p.y - 10);
  });
}

function drawPlayhead() {
  if (!state.playing && state.playT === 0 && !state.recording) return;
  const cam = samplePath(state.playT / DURATION);
  drawFrustum(cam, "#7CFC9A", "rgba(124,252,154,0.12)");
  const p = toScreen(cam);
  ctx.beginPath();
  ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
  ctx.fillStyle = "#7CFC9A";
  ctx.fill();
}

function render() {
  updateViewTransform();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#101318";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  drawScene();
  const hits = pathObstacleHits();
  drawPath(hits);
  drawKeyframes();
  drawPlayhead();
  document.getElementById("warning").classList.toggle("hidden", hits.length === 0);
}

// ---------- 交互 ----------
function canvasPos(evt) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((evt.clientX - rect.left) / rect.width) * canvas.width,
    y: ((evt.clientY - rect.top) / rect.height) * canvas.height,
  };
}

function rotateHandlePos(kf) {
  const p = toScreen(kf);
  const a = deg2rad(kf.angle);
  return { x: p.x + Math.cos(a) * 26, y: p.y + Math.sin(a) * 26 };
}

canvas.addEventListener("mousedown", (evt) => {
  const pos = canvasPos(evt);
  for (let i = 0; i < state.keyframes.length; i++) {
    const kf = state.keyframes[i];
    const h = rotateHandlePos(kf);
    if (Math.hypot(pos.x - h.x, pos.y - h.y) < 10) {
      state.selected = i;
      state.drag = { kind: "rotate", index: i };
      syncPanel();
      render();
      return;
    }
    const p = toScreen(kf);
    if (Math.hypot(pos.x - p.x, pos.y - p.y) < 14) {
      state.selected = i;
      state.drag = { kind: "move", index: i };
      syncPanel();
      render();
      return;
    }
  }
});

canvas.addEventListener("mousemove", (evt) => {
  if (!state.drag) return;
  const kf = state.keyframes[state.drag.index];
  const world = toWorld(canvasPos(evt));
  if (state.drag.kind === "move") {
    kf.x = world.x;
    kf.y = world.y;
  } else {
    kf.angle = (Math.atan2(world.y - kf.y, world.x - kf.x) * 180) / Math.PI;
  }
  constrainKeyframe(kf);
  syncPanel();
  render();
});

window.addEventListener("mouseup", () => {
  if (state.drag) {
    state.drag = null;
    saveProject();
    render();
  }
});

canvas.addEventListener("wheel", (evt) => {
  if (state.selected < 0) return;
  evt.preventDefault();
  const kf = state.keyframes[state.selected];
  kf.focal += evt.deltaY < 0 ? 2 : -2;
  constrainKeyframe(kf);
  syncPanel();
  saveProject();
  render();
}, { passive: false });

// ---------- 面板 ----------
const angleInput = document.getElementById("angle");
const focalInput = document.getElementById("focal");

function syncPanel() {
  const info = document.getElementById("kf-info");
  if (state.selected < 0) {
    info.textContent = "未选中";
    return;
  }
  const kf = state.keyframes[state.selected];
  info.textContent = `关键点 ${state.selected + 1}  x=${kf.x.toFixed(0)} y=${kf.y.toFixed(0)}`;
  angleInput.value = Math.round(kf.angle);
  focalInput.value = Math.round(kf.focal);
  document.getElementById("angle-val").textContent = `${Math.round(kf.angle)}°`;
  document.getElementById("focal-val").textContent = `${Math.round(kf.focal)}mm`;
}

angleInput.addEventListener("input", () => {
  if (state.selected < 0) return;
  const kf = state.keyframes[state.selected];
  kf.angle = Number(angleInput.value);
  constrainKeyframe(kf);
  syncPanel();
  saveProject();
  render();
});

focalInput.addEventListener("input", () => {
  if (state.selected < 0) return;
  const kf = state.keyframes[state.selected];
  kf.focal = Number(focalInput.value);
  constrainKeyframe(kf);
  syncPanel();
  saveProject();
  render();
});

// ---------- 预览播放 ----------
const scrub = document.getElementById("scrub");
let rafId = null;
let playStart = 0;

function setPlayT(t) {
  state.playT = clamp(t, 0, DURATION);
  scrub.value = state.playT;
  document.getElementById("time-val").textContent = `${state.playT.toFixed(1)}s`;
}

function tick(now) {
  if (!state.playing) return;
  const t = (now - playStart) / 1000;
  if (t >= DURATION) {
    stopPlayback();
    return;
  }
  setPlayT(t);
  render();
  rafId = requestAnimationFrame(tick);
}

function startPlayback() {
  state.playing = true;
  playStart = performance.now() - state.playT * 1000;
  rafId = requestAnimationFrame(tick);
}

function stopPlayback() {
  state.playing = false;
  if (rafId) cancelAnimationFrame(rafId);
  setPlayT(0);
  render();
}

document.getElementById("play").addEventListener("click", () => {
  if (state.playing) return;
  setPlayT(0);
  startPlayback();
});

scrub.addEventListener("input", () => {
  setPlayT(Number(scrub.value));
  render();
});

// ---------- 工程按钮 ----------
document.getElementById("save").addEventListener("click", () => {
  saveProject();
  flashStatus("工程已保存");
});

document.getElementById("download").addEventListener("click", () => {
  const blob = new Blob([serializeProject()], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "camera-path-project.json";
  a.click();
  URL.revokeObjectURL(a.href);
});

function flashStatus(msg) {
  const el = document.getElementById("export-status");
  el.textContent = msg;
  setTimeout(() => { el.textContent = ""; }, 2500);
}

// ---------- 视频导出（8 秒） ----------
document.getElementById("export").addEventListener("click", async () => {
  if (state.recording) return;
  state.recording = true;
  const statusEl = document.getElementById("export-status");
  statusEl.textContent = "正在录制 8 秒视频…";
  const stream = canvas.captureStream(30);
  const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
    ? "video/webm;codecs=vp9"
    : "video/webm";
  const rec = new MediaRecorder(stream, { mimeType: mime });
  const chunks = [];
  rec.ondataavailable = (e) => chunks.push(e.data);
  const done = new Promise((resolve) => { rec.onstop = resolve; });
  setPlayT(0);
  startPlayback();
  rec.start();
  await new Promise((resolve) => setTimeout(resolve, DURATION * 1000));
  rec.stop();
  await done;
  stopPlayback();
  state.recording = false;
  const blob = new Blob(chunks, { type: "video/webm" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "camera-path-preview.webm";
  a.click();
  URL.revokeObjectURL(a.href);
  statusEl.textContent = "视频已导出 (camera-path-preview.webm)";
});

// ---------- 初始化 ----------
loadProject();
state.keyframes.forEach(constrainKeyframe);
syncPanel();
render();
