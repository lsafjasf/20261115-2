"use strict";

/* ---------- 数据生成（程序生成，含漂移与噪声） ---------- */
const N = 600;                 // 采样点数
const T0 = 0, T1 = 600;        // 时间范围（秒）
const SENSORS = [
  { name: "传感器 A", color: "#e74c3c", drift: t => 0.0009 * t * t / 10 + 0.6 * Math.sin(t / 90) },
  { name: "传感器 B", color: "#27ae60", drift: t => -0.0012 * t * t / 10 + 0.4 * Math.cos(t / 70) },
  { name: "传感器 C", color: "#2980d9", drift: t => 0.0018 * t * t / 10 - 0.5 * Math.sin(t / 110) },
];
const REF_COLOR = "#222";

function referenceAt(t) {
  return 50 + 8 * Math.sin(t / 55) + 3 * Math.sin(t / 17) + 0.01 * t;
}
function noise(seed) { // 确定性伪随机噪声
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}

// 原始数据：结构固定为 { t, ref, values:[vA,vB,vC] }，校准绝不修改它
const rawData = [];
for (let i = 0; i < N; i++) {
  const t = T0 + (T1 - T0) * i / (N - 1);
  rawData.push({
    t,
    ref: referenceAt(t),
    values: SENSORS.map((s, k) => referenceAt(t) + s.drift(t) + 0.25 * noise(i * 3 + k)),
  });
}

/* ---------- 校准模型：校准点 + 线性插值偏移量 ---------- */
// 校准点：{ t, offsets:[oA,oB,oC] }，o = ref - raw(t)
const state = {
  winStart: 60,
  winEnd: 300,
  showCalibrated: false,
  calPoints: [],
  addingCal: false,
};

function rawValueAt(sensorIdx, t) {
  const pos = (t - T0) / (T1 - T0) * (N - 1);
  const i = Math.max(0, Math.min(N - 2, Math.floor(pos)));
  const f = pos - i;
  return rawData[i].values[sensorIdx] * (1 - f) + rawData[i + 1].values[sensorIdx] * f;
}
function offsetAt(sensorIdx, t) {
  const pts = state.calPoints;
  if (pts.length === 0) return 0;
  if (t <= pts[0].t) return pts[0].offsets[sensorIdx];
  if (t >= pts[pts.length - 1].t) return pts[pts.length - 1].offsets[sensorIdx];
  for (let i = 0; i < pts.length - 1; i++) {
    if (t >= pts[i].t && t <= pts[i + 1].t) {
      const f = (t - pts[i].t) / (pts[i + 1].t - pts[i].t);
      return pts[i].offsets[sensorIdx] * (1 - f) + pts[i + 1].offsets[sensorIdx] * f;
    }
  }
  return 0;
}
function calibratedValueAt(sensorIdx, t) {
  return rawValueAt(sensorIdx, t) + offsetAt(sensorIdx, t);
}
function addCalibrationPoint(t) {
  const offsets = SENSORS.map((_, k) => referenceAt(t) - rawValueAt(k, t));
  state.calPoints.push({ t, offsets });
  state.calPoints.sort((a, b) => a.t - b.t);
}

/* ---------- 统计：窗口内平均误差与最大偏差 ---------- */
function windowStats(useCalibrated) {
  const rows = SENSORS.map(() => ({ sumAbs: 0, maxAbs: 0, count: 0 }));
  for (const d of rawData) {
    if (d.t < state.winStart || d.t > state.winEnd) continue;
    SENSORS.forEach((_, k) => {
      const v = useCalibrated ? d.values[k] + offsetAt(k, d.t) : d.values[k];
      const err = v - d.ref;
      rows[k].sumAbs += Math.abs(err);
      rows[k].maxAbs = Math.max(rows[k].maxAbs, Math.abs(err));
      rows[k].count++;
    });
  }
  return rows.map(r => ({ mean: r.count ? r.sumAbs / r.count : 0, max: r.maxAbs }));
}

/* ---------- 主图渲染：三色曲线 + 参考线 + 误差带 ---------- */
const mainCv = document.getElementById("main");
const ovCv = document.getElementById("overview");
const PAD = { l: 56, r: 16, t: 18, b: 30 };

function yRange() {
  let lo = Infinity, hi = -Infinity;
  for (const d of rawData) {
    lo = Math.min(lo, d.ref, ...d.values);
    hi = Math.max(hi, d.ref, ...d.values);
  }
  const m = (hi - lo) * 0.08;
  return [lo - m, hi + m];
}

function drawChart(ctx, W, H, opts) {
  const { useCalibrated, drawWindow, drawCalPoints, drawErrorBand } = opts;
  const [yLo, yHi] = yRange();
  const x = t => PAD.l + (t - T0) / (T1 - T0) * (W - PAD.l - PAD.r);
  const y = v => H - PAD.b - (v - yLo) / (yHi - yLo) * (H - PAD.t - PAD.b);

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, W, H);

  // 网格与坐标
  ctx.strokeStyle = "#e8ecf0";
  ctx.fillStyle = "#888";
  ctx.font = "11px sans-serif";
  ctx.textAlign = "center";
  for (let i = 0; i <= 6; i++) {
    const t = T0 + (T1 - T0) * i / 6;
    ctx.beginPath(); ctx.moveTo(x(t), PAD.t); ctx.lineTo(x(t), H - PAD.b); ctx.stroke();
    ctx.fillText(t.toFixed(0) + "s", x(t), H - PAD.b + 16);
  }
  ctx.textAlign = "right";
  for (let i = 0; i <= 5; i++) {
    const v = yLo + (yHi - yLo) * i / 5;
    ctx.beginPath(); ctx.moveTo(PAD.l, y(v)); ctx.lineTo(W - PAD.r, y(v)); ctx.stroke();
    ctx.fillText(v.toFixed(1), PAD.l - 6, y(v) + 4);
  }

  // 时间窗口高亮
  if (drawWindow) {
    ctx.fillStyle = "rgba(59,130,246,0.08)";
    ctx.fillRect(x(state.winStart), PAD.t, x(state.winEnd) - x(state.winStart), H - PAD.t - PAD.b);
    ctx.strokeStyle = "rgba(59,130,246,0.6)";
    [state.winStart, state.winEnd].forEach(t => {
      ctx.beginPath(); ctx.moveTo(x(t), PAD.t); ctx.lineTo(x(t), H - PAD.b); ctx.stroke();
    });
  }

  // 误差带：窗口内传感器与参考值偏差的包络（min~max 填充）
  if (drawErrorBand) {
    ctx.beginPath();
    const tops = [], bots = [];
    for (const d of rawData) {
      if (d.t < state.winStart || d.t > state.winEnd) continue;
      const vs = SENSORS.map((_, k) =>
        useCalibrated ? d.values[k] + offsetAt(k, d.t) : d.values[k]);
      tops.push([x(d.t), y(Math.max(...vs))]);
      bots.push([x(d.t), y(Math.min(...vs))]);
    }
    tops.forEach(([px, py], i) => { if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); });
    bots.reverse().forEach(([px, py]) => ctx.lineTo(px, py));
    ctx.closePath();
    ctx.fillStyle = useCalibrated ? "rgba(39,174,96,0.15)" : "rgba(231,76,60,0.13)";
    ctx.fill();
  }

  // 传感器曲线
  SENSORS.forEach((s, k) => {
    ctx.beginPath();
    ctx.strokeStyle = s.color;
    ctx.lineWidth = 1.6;
    rawData.forEach((d, i) => {
      const v = useCalibrated ? d.values[k] + offsetAt(k, d.t) : d.values[k];
      if (i === 0) ctx.moveTo(x(d.t), y(v)); else ctx.lineTo(x(d.t), y(v));
    });
    ctx.stroke();
  });

  // 参考线
  ctx.beginPath();
  ctx.strokeStyle = REF_COLOR;
  ctx.lineWidth = 1.8;
  ctx.setLineDash([6, 4]);
  rawData.forEach((d, i) => { if (i === 0) ctx.moveTo(x(d.t), y(d.ref)); else ctx.lineTo(x(d.t), y(d.ref)); });
  ctx.stroke();
  ctx.setLineDash([]);

  // 校准点标记
  if (drawCalPoints) {
    for (const p of state.calPoints) {
      ctx.beginPath();
      ctx.arc(x(p.t), y(referenceAt(p.t)), 6, 0, Math.PI * 2);
      ctx.fillStyle = "#f59e0b";
      ctx.fill();
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  // 图例
  ctx.textAlign = "left";
  ctx.font = "12px sans-serif";
  let lx = PAD.l + 10;
  SENSORS.forEach(s => {
    ctx.fillStyle = s.color;
    ctx.fillRect(lx, PAD.t + 4, 14, 4);
    ctx.fillStyle = "#333";
    ctx.fillText(s.name, lx + 18, PAD.t + 10);
    lx += 92;
  });
  ctx.fillStyle = REF_COLOR;
  ctx.fillRect(lx, PAD.t + 4, 14, 3);
  ctx.fillText("参考线", lx + 18, PAD.t + 10);
  ctx.fillStyle = "#666";
  ctx.fillText(useCalibrated ? "（校准后）" : "（原始）", lx + 74, PAD.t + 10);
}

function renderMain() {
  const ctx = mainCv.getContext("2d");
  drawChart(ctx, mainCv.width, mainCv.height, {
    useCalibrated: state.showCalibrated,
    drawWindow: true,
    drawCalPoints: true,
    drawErrorBand: true,
  });
}

/* ---------- 缩略图 + 可拖动时间窗口 ---------- */
let dragMode = null; // "move" | "left" | "right"
let dragAnchor = 0;

function ovX(t) { return 10 + (t - T0) / (T1 - T0) * (ovCv.width - 20); }
function ovT(px) {
  const r = ovCv.getBoundingClientRect();
  const x = (px - r.left) * (ovCv.width / r.width);
  return T0 + (x - 10) / (ovCv.width - 20) * (T1 - T0);
}
function renderOverview() {
  const ctx = ovCv.getContext("2d");
  const W = ovCv.width, H = ovCv.height;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#fafbfc";
  ctx.fillRect(0, 0, W, H);
  const [yLo, yHi] = yRange();
  const y = v => H - 8 - (v - yLo) / (yHi - yLo) * (H - 16);
  SENSORS.forEach((s, k) => {
    ctx.beginPath();
    ctx.strokeStyle = s.color + "99";
    ctx.lineWidth = 1;
    rawData.forEach((d, i) => {
      if (i === 0) ctx.moveTo(ovX(d.t), y(d.values[k]));
      else ctx.lineTo(ovX(d.t), y(d.values[k]));
    });
    ctx.stroke();
  });
  // 窗口遮罩与边框
  const x1 = ovX(state.winStart), x2 = ovX(state.winEnd);
  ctx.fillStyle = "rgba(30,40,60,0.25)";
  ctx.fillRect(0, 0, x1, H);
  ctx.fillRect(x2, 0, W - x2, H);
  ctx.strokeStyle = "#3b82f6";
  ctx.lineWidth = 2;
  ctx.strokeRect(x1, 1, x2 - x1, H - 2);
  ctx.fillStyle = "#3b82f6";
  ctx.fillRect(x1 - 3, 0, 6, H);
  ctx.fillRect(x2 - 3, 0, 6, H);
}

ovCv.addEventListener("mousedown", e => {
  const t = ovT(e.clientX);
  const tol = (T1 - T0) * 0.015;
  if (Math.abs(t - state.winStart) < tol) dragMode = "left";
  else if (Math.abs(t - state.winEnd) < tol) dragMode = "right";
  else if (t > state.winStart && t < state.winEnd) { dragMode = "move"; dragAnchor = t; }
});
window.addEventListener("mousemove", e => {
  if (!dragMode) return;
  const t = Math.max(T0, Math.min(T1, ovT(e.clientX)));
  const minW = (T1 - T0) * 0.03;
  if (dragMode === "left") state.winStart = Math.min(t, state.winEnd - minW);
  else if (dragMode === "right") state.winEnd = Math.max(t, state.winStart + minW);
  else {
    const w = state.winEnd - state.winStart;
    let s = t - dragAnchor + state.winStart;
    s = Math.max(T0, Math.min(T1 - w, s));
    state.winStart = s; state.winEnd = s + w;
    dragAnchor = t;
  }
  renderAll();
});
window.addEventListener("mouseup", () => { dragMode = null; });

/* ---------- 统计表 / 工具栏 / 导出 / 自动化 API ---------- */
function renderStats() {
  const before = windowStats(false);
  const after = windowStats(true);
  const tbody = document.querySelector("#stats tbody");
  tbody.innerHTML = "";
  SENSORS.forEach((s, k) => {
    const tr = document.createElement("tr");
    tr.innerHTML =
      `<td><span class="swatch" style="background:${s.color}"></span>${s.name}</td>` +
      `<td>${before[k].mean.toFixed(3)}</td><td>${before[k].max.toFixed(3)}</td>` +
      `<td>${after[k].mean.toFixed(3)}</td><td>${after[k].max.toFixed(3)}</td>`;
    tbody.appendChild(tr);
  });
  const info = document.getElementById("calInfo");
  info.textContent =
    `窗口：${state.winStart.toFixed(0)}s ~ ${state.winEnd.toFixed(0)}s　` +
    `校准点：${state.calPoints.length} 个` +
    (state.calPoints.length
      ? "（位于 " + state.calPoints.map(p => p.t.toFixed(0) + "s").join("、") + "）"
      : "");
}

function renderAll() { renderMain(); renderOverview(); renderStats(); }

const btnMode = document.getElementById("btnMode");
const btnAdd = document.getElementById("btnAddCal");
btnMode.addEventListener("click", () => {
  state.showCalibrated = !state.showCalibrated;
  btnMode.textContent = state.showCalibrated ? "视图：校准曲线" : "视图：原始曲线";
  renderAll();
});
btnAdd.addEventListener("click", () => {
  state.addingCal = !state.addingCal;
  btnAdd.classList.toggle("armed", state.addingCal);
});
document.getElementById("btnClearCal").addEventListener("click", () => {
  state.calPoints = [];
  renderAll();
});
mainCv.addEventListener("click", e => {
  if (!state.addingCal) return;
  const r = mainCv.getBoundingClientRect();
  const px = (e.clientX - r.left) * (mainCv.width / r.width);
  const t = T0 + (px - PAD.l) / (mainCv.width - PAD.l - PAD.r) * (T1 - T0);
  addCalibrationPoint(Math.max(T0, Math.min(T1, t)));
  state.addingCal = false;
  btnAdd.classList.remove("armed");
  renderAll();
});

/* 导出前后对比 PNG：上原始、下校准，同一窗口 */
function exportPNG() {
  const W = mainCv.width, H = mainCv.height;
  const out = document.createElement("canvas");
  out.width = W; out.height = H * 2 + 70;
  const ctx = out.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.fillStyle = "#111";
  ctx.font = "bold 16px sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("校准前（原始曲线）", PAD.l, 22);
  ctx.save(); ctx.translate(0, 30);
  drawChart(ctx, W, H, { useCalibrated: false, drawWindow: true, drawCalPoints: true, drawErrorBand: true });
  ctx.restore();
  ctx.fillText("校准后（校准曲线）", PAD.l, H + 52);
  ctx.save(); ctx.translate(0, H + 60);
  drawChart(ctx, W, H, { useCalibrated: true, drawWindow: true, drawCalPoints: true, drawErrorBand: true });
  ctx.restore();
  const a = document.createElement("a");
  a.download = "calibration_compare.png";
  a.href = out.toDataURL("image/png");
  a.click();
  return out;
}
document.getElementById("btnExport").addEventListener("click", exportPNG);

/* 供自动化测试 / 脚本调用 */
window.App = {
  state, rawData, SENSORS,
  setWindow(a, b) { state.winStart = a; state.winEnd = b; renderAll(); },
  addCalibrationPoint(t) { addCalibrationPoint(t); renderAll(); },
  clearCalibration() { state.calPoints = []; renderAll(); },
  setCalibratedView(on) {
    state.showCalibrated = on;
    btnMode.textContent = on ? "视图：校准曲线" : "视图：原始曲线";
    renderAll();
  },
  stats: () => ({ before: windowStats(false), after: windowStats(true) }),
  exportPNG,
};

renderAll();
