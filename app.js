"use strict";

// ---------- 模拟地震数据 ----------
const SAMPLE_RATE = 50;            // Hz
const DURATION = 120;              // s
const N = SAMPLE_RATE * DURATION;
const ORIGIN_T = 5;                // 发震时刻 (s)
const P_VEL = 6.0;                 // km/s
const S_VEL = 3.5;                 // km/s

const STATIONS = [
  { id: "ALP", dist: 30,  x: 0.30, y: 0.62, color: "#e2b34c" },
  { id: "BRC", dist: 80,  x: 0.68, y: 0.30, color: "#5fb86a" },
  { id: "CHI", dist: 150, x: 0.82, y: 0.74, color: "#5f9fe0" },
];
const EPICENTER = { x: 0.22, y: 0.42 };
const MAP_SCALE_KM = 220;          // 地图宽度对应公里数

// 确定性伪随机
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function synthTrace(sta, seed) {
  const rnd = mulberry32(seed);
  const data = new Float32Array(N);
  // 背景噪声
  let n1 = 0, n2 = 0;
  for (let i = 0; i < N; i++) {
    n1 = 0.96 * n1 + (rnd() - 0.5);
    n2 = 0.90 * n2 + (rnd() - 0.5);
    data[i] = (n1 * 0.5 + n2 * 0.3) * 0.12;
  }
  const tP = ORIGIN_T + sta.dist / P_VEL;
  const tS = ORIGIN_T + sta.dist / S_VEL;
  // 波列: 衰减正弦包络
  function addWavelet(t0, freq, amp, decay) {
    const i0 = Math.floor(t0 * SAMPLE_RATE);
    for (let i = i0; i < N; i++) {
      const tau = (i - i0) / SAMPLE_RATE;
      const env = Math.exp(-tau / decay) * Math.min(1, tau / 0.15);
      data[i] += amp * env * Math.sin(2 * Math.PI * freq * tau + rnd() * 0.6);
    }
  }
  const att = 140 / (sta.dist + 60);   // 几何衰减
  addWavelet(tP, 6.0, 0.55 * att, 2.5);
  addWavelet(tS, 2.2, 1.00 * att, 6.0);
  return { data, tP, tS };
}

STATIONS.forEach((sta, k) => Object.assign(sta, synthTrace(sta, 1234 + k * 77)));

// ---------- 全局状态 ----------
const state = {
  time: 0,                 // 当前回放时刻 s
  playing: false,
  speed: 1,
  sound: true,
  view: { start: 0, end: DURATION },   // 波形可视窗口
  visible: { ALP: true, BRC: true, CHI: true },
  markers: [],             // { sta, t, phase }
  drag: null,              // 框选 {x0, x1}
};

// 暴露给自动化验证
window.app = { state, STATIONS, EPICENTER };

// ---------- 波形渲染 ----------
const waveCanvas = document.getElementById("wave");
const wctx = waveCanvas.getContext("2d");
const W = waveCanvas.width, H = waveCanvas.height;
const AXIS_H = 26;

function visibleStations() {
  return STATIONS.filter((s) => state.visible[s.id]);
}

function timeToX(t) {
  const { start, end } = state.view;
  return ((t - start) / (end - start)) * W;
}
function xToTime(x) {
  const { start, end } = state.view;
  return start + (x / W) * (end - start);
}

function drawWave() {
  wctx.clearRect(0, 0, W, H);
  const stas = visibleStations();
  const plotH = H - AXIS_H;
  const laneH = stas.length ? plotH / stas.length : plotH;

  // 时间网格
  const { start, end } = state.view;
  const span = end - start;
  const step = span > 60 ? 10 : span > 20 ? 5 : span > 5 ? 1 : 0.2;
  wctx.strokeStyle = "#1d2735";
  wctx.fillStyle = "#6b7b90";
  wctx.font = "11px sans-serif";
  wctx.textAlign = "center";
  for (let t = Math.ceil(start / step) * step; t <= end; t += step) {
    const x = timeToX(t);
    wctx.beginPath();
    wctx.moveTo(x, 0);
    wctx.lineTo(x, plotH);
    wctx.stroke();
    wctx.fillText(t.toFixed(step < 1 ? 1 : 0) + "s", x, H - 8);
  }

  stas.forEach((sta, li) => {
    const y0 = li * laneH, mid = y0 + laneH / 2;
    // 车道分隔与台站名
    wctx.strokeStyle = "#232f40";
    wctx.strokeRect(0.5, y0 + 0.5, W - 1, laneH - 1);
    wctx.fillStyle = sta.color;
    wctx.textAlign = "left";
    wctx.font = "bold 12px sans-serif";
    wctx.fillText(sta.id, 6, y0 + 15);

    // 波形
    const i0 = Math.max(0, Math.floor(start * SAMPLE_RATE));
    const i1 = Math.min(N - 1, Math.ceil(end * SAMPLE_RATE));
    const ampScale = laneH * 0.42;
    wctx.strokeStyle = sta.color;
    wctx.lineWidth = 1;
    wctx.beginPath();
    const pxPerSample = W / ((i1 - i0) || 1);
    if (pxPerSample >= 1) {
      for (let i = i0; i <= i1; i++) {
        const x = timeToX(i / SAMPLE_RATE);
        const y = mid - sta.data[i] * ampScale;
        i === i0 ? wctx.moveTo(x, y) : wctx.lineTo(x, y);
      }
    } else {
      // 高密度时按像素列取 min/max
      for (let px = 0; px < W; px++) {
        const a = i0 + Math.floor((px / W) * (i1 - i0));
        const b = i0 + Math.floor(((px + 1) / W) * (i1 - i0));
        let mn = Infinity, mx = -Infinity;
        for (let i = a; i <= Math.max(a, b); i++) {
          const v = sta.data[i];
          if (v < mn) mn = v;
          if (v > mx) mx = v;
        }
        wctx.moveTo(px + 0.5, mid - mx * ampScale);
        wctx.lineTo(px + 0.5, mid - mn * ampScale);
      }
    }
    wctx.stroke();

    // 该台站的到时标记 —— 同步画在曲线上
    state.markers.forEach((m, mi) => {
      if (m.sta !== sta.id) return;
      const x = timeToX(m.t);
      if (x < -5 || x > W + 5) return;
      const si = Math.max(0, Math.min(N - 1, Math.round(m.t * SAMPLE_RATE)));
      const y = mid - sta.data[si] * ampScale;
      wctx.strokeStyle = "#ff5f6d";
      wctx.lineWidth = 1.5;
      wctx.beginPath();
      wctx.moveTo(x, y0 + 4);
      wctx.lineTo(x, y0 + laneH - 4);
      wctx.stroke();
      wctx.fillStyle = "#ff5f6d";
      wctx.beginPath();
      wctx.arc(x, y, 4.5, 0, Math.PI * 2);
      wctx.fill();
      wctx.font = "10px sans-serif";
      wctx.textAlign = "left";
      wctx.fillText(`#${mi + 1} ${m.phase} ${m.t.toFixed(2)}s`, x + 6, y0 + 14);
    });
  });

  // 回放时间红线
  const tx = timeToX(state.time);
  if (tx >= 0 && tx <= W) {
    wctx.strokeStyle = "#e04b4b";
    wctx.lineWidth = 1.5;
    wctx.beginPath();
    wctx.moveTo(tx, 0);
    wctx.lineTo(tx, plotH);
    wctx.stroke();
  }

  // 框选矩形
  if (state.drag) {
    const x0 = Math.min(state.drag.x0, state.drag.x1);
    const x1 = Math.max(state.drag.x0, state.drag.x1);
    wctx.fillStyle = "rgba(95,159,224,0.18)";
    wctx.fillRect(x0, 0, x1 - x0, plotH);
    wctx.strokeStyle = "#5f9fe0";
    wctx.strokeRect(x0 + 0.5, 0.5, x1 - x0 - 1, plotH - 1);
  }
}

// ---------- 地图渲染 ----------
const mapCanvas = document.getElementById("map");
const mctx = mapCanvas.getContext("2d");
const MW = mapCanvas.width, MH = mapCanvas.height;
const KM_PER_PX = MAP_SCALE_KM / MW;

function drawMap() {
  mctx.clearRect(0, 0, MW, MH);
  // 背景网格 (每格 25 km)
  mctx.strokeStyle = "#16202c";
  mctx.fillStyle = "#54657c";
  mctx.font = "10px sans-serif";
  for (let gx = 0; gx <= MW; gx += (25 / KM_PER_PX)) {
    mctx.beginPath(); mctx.moveTo(gx, 0); mctx.lineTo(gx, MH); mctx.stroke();
    mctx.fillText(Math.round(gx * KM_PER_PX) + "km", gx + 2, MH - 5);
  }
  for (let gy = 0; gy <= MH; gy += (25 / KM_PER_PX)) {
    mctx.beginPath(); mctx.moveTo(0, gy); mctx.lineTo(MW, gy); mctx.stroke();
  }

  const ex = EPICENTER.x * MW, ey = EPICENTER.y * MH;
  const elapsed = state.time - ORIGIN_T;

  // 震源扩散圈 (P / S 波前)
  if (elapsed > 0) {
    const fronts = [
      { r: P_VEL * elapsed, color: "rgba(255,170,60,0.85)", label: "P" },
      { r: S_VEL * elapsed, color: "rgba(90,200,255,0.85)", label: "S" },
    ];
    fronts.forEach((f) => {
      const rp = f.r / KM_PER_PX;
      mctx.strokeStyle = f.color;
      mctx.lineWidth = 2;
      mctx.beginPath();
      mctx.arc(ex, ey, rp, 0, Math.PI * 2);
      mctx.stroke();
      mctx.fillStyle = f.color;
      mctx.font = "11px sans-serif";
      mctx.fillText(f.label, ex + rp * 0.707 + 4, ey - rp * 0.707);
    });
  }

  // 震源星标
  mctx.fillStyle = "#ff5f6d";
  mctx.save();
  mctx.translate(ex, ey);
  mctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 9 : 4;
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    mctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  mctx.closePath();
  mctx.fill();
  mctx.restore();

  // 台站三角
  STATIONS.forEach((sta) => {
    if (!state.visible[sta.id]) return;
    const sx = sta.x * MW, sy = sta.y * MH;
    const arrived = state.time >= sta.tP;
    mctx.fillStyle = arrived ? sta.color : "#3a4a63";
    mctx.beginPath();
    mctx.moveTo(sx, sy - 8);
    mctx.lineTo(sx - 7, sy + 6);
    mctx.lineTo(sx + 7, sy + 6);
    mctx.closePath();
    mctx.fill();
    mctx.fillStyle = "#d8e0ea";
    mctx.font = "12px sans-serif";
    mctx.textAlign = "center";
    mctx.fillText(sta.id, sx, sy + 20);
  });
}

// ---------- 标记列表 ----------
const markerList = document.getElementById("marker-list");

function renderMarkerList() {
  markerList.innerHTML = "";
  state.markers.forEach((m, i) => {
    const li = document.createElement("li");
    const sta = STATIONS.find((s) => s.id === m.sta);
    const label = document.createElement("span");
    label.textContent = `#${i + 1} ${m.sta} ${m.phase} 到时 ${m.t.toFixed(2)} s`;
    label.style.color = sta ? sta.color : "#d8e0ea";
    const del = document.createElement("button");
    del.textContent = "删除";
    del.onclick = () => { state.markers.splice(i, 1); syncMarkers(); };
    li.append(label, del);
    markerList.appendChild(li);
  });
}

function syncMarkers() {
  renderMarkerList();
  drawWave();
}

function addMarker(staId, t) {
  const sta = STATIONS.find((s) => s.id === staId);
  // 依据与理论 P/S 到时的接近程度自动判定震相
  const phase = Math.abs(t - sta.tP) <= Math.abs(t - sta.tS) ? "P" : "S";
  state.markers.push({ sta: staId, t: +t.toFixed(2), phase });
  state.markers.sort((a, b) => a.t - b.t);
  syncMarkers();
}

// ---------- 波形交互: 单击标记 / 拖动缩放 ----------
function canvasPos(e) {
  const r = waveCanvas.getBoundingClientRect();
  return {
    x: ((e.clientX - r.left) / r.width) * W,
    y: ((e.clientY - r.top) / r.height) * H,
  };
}

waveCanvas.addEventListener("mousedown", (e) => {
  const p = canvasPos(e);
  state.drag = { x0: p.x, x1: p.x, moved: false };
});

waveCanvas.addEventListener("mousemove", (e) => {
  if (!state.drag) return;
  const p = canvasPos(e);
  state.drag.x1 = p.x;
  if (Math.abs(p.x - state.drag.x0) > 6) state.drag.moved = true;
  drawWave();
});

let pendingMark = null;

waveCanvas.addEventListener("mouseup", (e) => {
  const drag = state.drag;
  state.drag = null;
  if (!drag) return;
  if (e.detail > 1) { drawWave(); return; } // 双击用于复位缩放，不标记
  if (drag.moved) {
    // 框选放大
    const t0 = xToTime(Math.min(drag.x0, drag.x1));
    const t1 = xToTime(Math.max(drag.x0, drag.x1));
    if (t1 - t0 > 0.1) state.view = { start: t0, end: t1 };
  } else {
    // 单击: 在对应车道上标记到时 (延迟以区分双击)
    const p = canvasPos(e);
    const stas = visibleStations();
    const laneH = (H - AXIS_H) / (stas.length || 1);
    const li = Math.floor(p.y / laneH);
    if (li >= 0 && li < stas.length) {
      const staId = stas[li].id, t = xToTime(p.x);
      clearTimeout(pendingMark);
      pendingMark = setTimeout(() => addMarker(staId, t), 250);
      return;
    }
  }
  drawWave();
});

waveCanvas.addEventListener("dblclick", () => {
  clearTimeout(pendingMark);
  state.view = { start: 0, end: DURATION };
  drawWave();
});

// ---------- 台站筛选 ----------
document.querySelectorAll("#station-filter input").forEach((cb) => {
  cb.addEventListener("change", () => {
    state.visible[cb.dataset.sta] = cb.checked;
    drawWave();
    drawMap();
  });
});

// ---------- 播放控制 ----------
const timeline = document.getElementById("timeline");
const clockEl = document.getElementById("clock");
const btnPlay = document.getElementById("btn-play");

timeline.addEventListener("input", () => {
  state.time = parseFloat(timeline.value);
  render();
});

btnPlay.addEventListener("click", () => {
  state.playing = !state.playing;
  btnPlay.textContent = state.playing ? "⏸ 暂停" : "▶ 播放";
  if (state.playing && state.time >= DURATION) state.time = 0;
});

document.querySelectorAll("#speed-group button").forEach((b) => {
  b.addEventListener("click", () => {
    state.speed = parseFloat(b.dataset.speed);
    document.querySelectorAll("#speed-group button").forEach((x) => x.classList.remove("active"));
    b.classList.add("active");
  });
});

document.getElementById("btn-sound").addEventListener("click", (e) => {
  state.sound = !state.sound;
  e.currentTarget.classList.toggle("active", state.sound);
});

// ---------- 低频波峰提示音 ----------
let audioCtx = null;
function beep(freq = 70, dur = 0.12, gain = 0.25) {
  if (!state.sound) return;
  audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
  const osc = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  g.gain.setValueAtTime(gain, audioCtx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
  osc.connect(g).connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + dur);
}

// 预计算各台站的显著波峰 (局部极大, 超阈值)
const PEAK_THRESHOLD = 0.35;
STATIONS.forEach((sta) => {
  const peaks = [];
  for (let i = 1; i < N - 1; i++) {
    const v = Math.abs(sta.data[i]);
    if (v > PEAK_THRESHOLD &&
        v >= Math.abs(sta.data[i - 1]) &&
        v > Math.abs(sta.data[i + 1])) {
      const t = i / SAMPLE_RATE;
      if (!peaks.length || t - peaks[peaks.length - 1] > 0.3) peaks.push(t);
    }
  }
  sta.peaks = peaks;
});

function checkPeaks(tPrev, tNow) {
  if (!state.sound || tNow <= tPrev) return;
  for (const sta of STATIONS) {
    if (!state.visible[sta.id]) continue;
    for (const p of sta.peaks) {
      if (p > tPrev && p <= tNow) {
        // 距离越远音高越低
        beep(90 - sta.dist * 0.25, 0.12, 0.22);
        break; // 每帧每台站最多一声
      }
    }
  }
}

// ---------- 主循环 ----------
let lastFrame = null;
function render() {
  timeline.value = state.time;
  clockEl.textContent = `t = ${state.time.toFixed(2)} s`;
  drawWave();
  drawMap();
}

function tick(now) {
  if (lastFrame == null) lastFrame = now;
  const dt = (now - lastFrame) / 1000;
  lastFrame = now;
  if (state.playing) {
    const tPrev = state.time;
    state.time = Math.min(DURATION, state.time + dt * state.speed);
    checkPeaks(tPrev, state.time);
    if (state.time >= DURATION) {
      state.playing = false;
      btnPlay.textContent = "▶ 播放";
    }
    render();
  }
  requestAnimationFrame(tick);
}

renderMarkerList();
render();
requestAnimationFrame(tick);
