"use strict";

/* ---------- 数据生成：内置一年逐日风向风速 ---------- */

const DIRS16 = ["N","NNE","NE","ENE","E","ESE","SE","SSE",
                "S","SSW","SW","WSW","W","WNW","NW","NNW"];

const SEASONS = {
  all:    { name: "全年", months: [1,2,3,4,5,6,7,8,9,10,11,12] },
  spring: { name: "春季", months: [3,4,5] },
  summer: { name: "夏季", months: [6,7,8] },
  autumn: { name: "秋季", months: [9,10,11] },
  winter: { name: "冬季", months: [12,1,2] },
};

// 每个季节的主导风向（角度，度）与平均风速，用于生成有季节差异的数据
const SEASON_PATTERN = {
  1:  { dir: 315, speed: 4.6 }, 2:  { dir: 320, speed: 4.4 },
  3:  { dir: 45,  speed: 3.9 }, 4:  { dir: 60,  speed: 3.7 },
  5:  { dir: 90,  speed: 3.4 }, 6:  { dir: 135, speed: 3.2 },
  7:  { dir: 150, speed: 3.0 }, 8:  { dir: 140, speed: 3.1 },
  9:  { dir: 90,  speed: 3.3 }, 10: { dir: 60,  speed: 3.6 },
  11: { dir: 330, speed: 4.1 }, 12: { dir: 320, speed: 4.8 },
};

// 可复现的伪随机数（mulberry32）
function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gauss(rng) {
  const u = Math.max(rng(), 1e-9), v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function generateYearData(year) {
  const rng = makeRng(20261114);
  const records = [];
  const start = new Date(year, 0, 1);
  for (let d = 0; d < 365; d++) {
    const date = new Date(start.getTime() + d * 86400000);
    const month = date.getMonth() + 1;
    const p = SEASON_PATTERN[month];
    // 风向围绕季节主导方向波动（角度环绕处理）
    let dir = p.dir + gauss(rng) * 45;
    dir = ((dir % 360) + 360) % 360;
    // 风速：季节均值 + 噪声，截断到合理范围
    let speed = p.speed + gauss(rng) * 1.3;
    speed = Math.round(Math.min(14, Math.max(0.2, speed)) * 10) / 10;
    records.push({
      date: `${year}-${String(month).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`,
      month,
      dirDeg: Math.round(dir),
      dirIdx: Math.round(dir / 22.5) % 16,
      speed,
    });
  }
  return records;
}

const YEAR = 2025;
const ALL_RECORDS = generateYearData(YEAR);

/* ---------- 状态与统计 ---------- */

const state = { season: "all", hoverDir: -1 };

function filteredRecords() {
  const months = SEASONS[state.season].months;
  return ALL_RECORDS.filter(r => months.includes(r.month));
}

function computeStats(records) {
  const freq = new Array(16).fill(0);
  const speedSum = new Array(16).fill(0);
  let total = 0;
  for (const r of records) {
    freq[r.dirIdx]++;
    speedSum[r.dirIdx] += r.speed;
    total += r.speed;
  }
  return {
    count: records.length,
    avgSpeed: records.length ? total / records.length : 0,
    freq,
    avgSpeedByDir: speedSum.map((s, i) => freq[i] ? s / freq[i] : 0),
    maxFreq: Math.max(...freq, 1),
  };
}

/* ---------- Canvas 绘制：风向玫瑰 ---------- */

const canvas = document.getElementById("roseCanvas");
const ctx = canvas.getContext("2d");
const CX = canvas.width / 2, CY = canvas.height / 2;
const R_MAX = 210;          // 最大半径（像素）
const RINGS = 5;            // 同心圆网格数
const PETAL_HALF = (Math.PI * 2 / 16) / 2 * 0.86; // 瓣半角，留缝

// 供命中测试与导出校验使用
let lastStats = null;

function dirToAngle(idx) {
  // 0 = N，顺时针；canvas 角度 0 指向东，需旋转
  return (idx * 22.5 - 90) * Math.PI / 180;
}

function drawRose(stats) {
  lastStats = stats;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // 背景
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 同心圆网格 + 刻度
  ctx.strokeStyle = "#dfe6ee";
  ctx.fillStyle = "#9aa8b8";
  ctx.font = "11px sans-serif";
  ctx.textAlign = "left";
  for (let i = 1; i <= RINGS; i++) {
    const r = (R_MAX * i) / RINGS;
    ctx.beginPath();
    ctx.arc(CX, CY, r, 0, Math.PI * 2);
    ctx.stroke();
    const v = Math.round((stats.maxFreq * i) / RINGS);
    ctx.fillText(String(v), CX + r + 3, CY - 3);
  }

  // 放射轴线 + 方向标签
  ctx.strokeStyle = "#e8edf3";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (let i = 0; i < 16; i++) {
    const a = dirToAngle(i);
    ctx.beginPath();
    ctx.moveTo(CX, CY);
    ctx.lineTo(CX + R_MAX * Math.cos(a), CY + R_MAX * Math.sin(a));
    ctx.stroke();
    const lr = R_MAX + 24;
    ctx.fillStyle = "#5a6b7d";
    ctx.font = i % 2 === 0 ? "bold 13px sans-serif" : "11px sans-serif";
    ctx.fillText(DIRS16[i], CX + lr * Math.cos(a), CY + lr * Math.sin(a));
  }

  // 玫瑰瓣（频次 -> 半径）
  for (let i = 0; i < 16; i++) {
    const frac = stats.freq[i] / stats.maxFreq;
    const r = Math.max(frac * R_MAX, stats.freq[i] > 0 ? 4 : 0);
    const a = dirToAngle(i);
    const hovered = state.hoverDir === i;
    ctx.beginPath();
    ctx.moveTo(CX, CY);
    ctx.arc(CX, CY, r, a - PETAL_HALF, a + PETAL_HALF);
    ctx.closePath();
    ctx.fillStyle = hovered ? "#f39c12" : `rgba(58, 142, 230, ${0.35 + 0.55 * frac})`;
    ctx.fill();
    ctx.strokeStyle = hovered ? "#d35400" : "#2f7cd0";
    ctx.lineWidth = hovered ? 2 : 1;
    ctx.stroke();
  }
  ctx.lineWidth = 1;

  // 标题
  ctx.fillStyle = "#2c3e50";
  ctx.font = "bold 14px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(
    `${YEAR} 年 · ${SEASONS[state.season].name} · 样本 ${stats.count} 天`,
    CX, 24
  );
}

// 命中测试：返回扇区索引或 -1
function hitSector(mx, my) {
  const dx = mx - CX, dy = my - CY;
  const dist = Math.hypot(dx, dy);
  if (dist > R_MAX || dist < 8) return -1;
  let ang = Math.atan2(dy, dx) * 180 / Math.PI + 90; // 转回“北为 0 顺时针”
  ang = ((ang % 360) + 360) % 360;
  return Math.round(ang / 22.5) % 16;
}

/* ---------- 统计面板与记录列表 ---------- */

const statsPanel = document.getElementById("statsPanel");
const recordBody = document.getElementById("recordBody");
const listTitle = document.getElementById("listTitle");

function renderStats(stats) {
  const cells = DIRS16.map((d, i) => {
    const pct = stats.count ? (stats.freq[i] / stats.count * 100) : 0;
    const hot = i === state.hoverDir ? ' class="hot"' : "";
    return `<span${hot}>${d}: ${stats.freq[i]} 次 (${pct.toFixed(1)}%)</span>`;
  }).join("");
  statsPanel.innerHTML =
    `<div><b>${SEASONS[state.season].name}</b> · 样本 ${stats.count} 天 · ` +
    `平均风速 <b>${stats.avgSpeed.toFixed(2)} m/s</b></div>` +
    `<div class="freq-grid">${cells}</div>`;
}

function renderList(records) {
  const label = state.hoverDir >= 0 ? ` · 高亮 ${DIRS16[state.hoverDir]} 方向` : "";
  listTitle.textContent = `原始记录（${SEASONS[state.season].name}，共 ${records.length} 条${label}）`;
  const rows = records.map(r => {
    let cls = "";
    if (state.hoverDir >= 0) cls = r.dirIdx === state.hoverDir ? "hl" : "dim";
    return `<tr class="${cls}" data-dir="${r.dirIdx}">` +
      `<td>${r.date}</td><td>${DIRS16[r.dirIdx]}</td>` +
      `<td>${r.dirDeg}°</td><td>${r.speed.toFixed(1)}</td></tr>`;
  }).join("");
  recordBody.innerHTML = rows;
}

/* ---------- 主渲染与事件 ---------- */

function render() {
  const records = filteredRecords();
  const stats = computeStats(records);
  drawRose(stats);
  renderStats(stats);
  renderList(records);
}

document.getElementById("seasonBtns").addEventListener("click", e => {
  const btn = e.target.closest("button");
  if (!btn) return;
  state.season = btn.dataset.season;
  state.hoverDir = -1;
  document.querySelectorAll("#seasonBtns button").forEach(b =>
    b.classList.toggle("active", b === btn));
  render();
});

canvas.addEventListener("mousemove", e => {
  const rect = canvas.getBoundingClientRect();
  const mx = (e.clientX - rect.left) * (canvas.width / rect.width);
  const my = (e.clientY - rect.top) * (canvas.height / rect.height);
  const idx = hitSector(mx, my);
  if (idx !== state.hoverDir) {
    state.hoverDir = idx;
    render();
  }
});

canvas.addEventListener("mouseleave", () => {
  if (state.hoverDir !== -1) {
    state.hoverDir = -1;
    render();
  }
});

document.getElementById("exportBtn").addEventListener("click", () => {
  const a = document.createElement("a");
  a.download = `wind-rose-${YEAR}-${state.season}.png`;
  a.href = canvas.toDataURL("image/png");
  a.click();
});

render();

// 供自动化测试/调试读取当前统计
window.__debugStats = () => ({ season: state.season, ...computeStats(filteredRecords()) });
