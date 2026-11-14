// 时空图渲染与交互
(function () {
  "use strict";
  const Core = window.BusCore;
  const canvas = document.getElementById("chart");
  const ctx = canvas.getContext("2d");
  const routeSelect = document.getElementById("route-select");
  const winStartInput = document.getElementById("win-start");
  const winEndInput = document.getElementById("win-end");

  const MARGIN = { left: 90, right: 30, top: 34, bottom: 40 };
  const PLOT_W = canvas.width - MARGIN.left - MARGIN.right;
  const PLOT_H = canvas.height - MARGIN.top - MARGIN.bottom;

  const state = {
    route: null,
    winStart: Core.timeToMinutes("07:00"),
    winEnd: Core.timeToMinutes("09:30"),
    records: [],      // 去重 + 筛选后的记录
    intervals: [],
    stops: [],
    dupRemoved: 0,
    hitZones: [],     // 间隔色块的点击热区
    selected: null,   // 当前选中的间隔
  };

  // 等待时长 -> 颜色（绿->黄->红）
  function waitColor(wait, maxWait) {
    const t = maxWait > 0 ? Math.min(wait / maxWait, 1) : 0;
    const hue = 120 - 120 * t;
    return "hsl(" + hue.toFixed(0) + ", 75%, 48%)";
  }

  function xOf(min) {
    const span = Math.max(state.winEnd - state.winStart, 1);
    return MARGIN.left + ((min - state.winStart) / span) * PLOT_W;
  }
  function yOf(stopIndex) {
    const n = Math.max(state.stops.length - 1, 1);
    return MARGIN.top + (stopIndex / n) * PLOT_H;
  }

  function applyFilters() {
    const { unique, duplicates } = Core.dedupRecords(BUS_RECORDS);
    const routeDups = duplicates.filter((d) => d.route === state.route).length;
    const filtered = Core.filterRecords(unique, state.route, state.winStart, state.winEnd);
    state.records = filtered;
    state.dupRemoved = routeDups;
    state.intervals = Core.buildIntervals(filtered);
    const stopMap = new Map();
    for (const r of BUS_RECORDS) {
      if (r.route === state.route && !stopMap.has(r.stopIndex)) {
        stopMap.set(r.stopIndex, r.stop);
      }
    }
    state.stops = [...stopMap.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([index, name]) => ({ index, name }));
    state.selected = null;
    render();
    renderLegend();
    renderStats();
    renderDetail();
  }

  function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    state.hitZones = [];
    drawAxes();
    drawIntervals();
    drawVehicleLines();
    drawStops();
  }

  function drawAxes() {
    ctx.strokeStyle = "#ccc";
    ctx.lineWidth = 1;
    ctx.strokeRect(MARGIN.left, MARGIN.top, PLOT_W, PLOT_H);
    ctx.fillStyle = "#555";
    ctx.font = "11px sans-serif";
    ctx.textAlign = "center";
    const span = state.winEnd - state.winStart;
    const step = span > 120 ? 30 : 15;
    for (let m = Math.ceil(state.winStart / step) * step; m <= state.winEnd; m += step) {
      const x = xOf(m);
      ctx.beginPath();
      ctx.moveTo(x, MARGIN.top);
      ctx.lineTo(x, MARGIN.top + PLOT_H);
      ctx.strokeStyle = "#eee";
      ctx.stroke();
      ctx.fillText(Core.minutesToTime(m), x, MARGIN.top + PLOT_H + 16);
    }
    ctx.fillText("时间", MARGIN.left + PLOT_W / 2, canvas.height - 6);
  }

  function drawIntervals() {
    const maxWait = Math.max(...state.intervals.map((i) => i.wait), 1);
    const bandH = state.stops.length > 1 ? PLOT_H / (state.stops.length - 1) : PLOT_H;
    const h = Math.min(bandH * 0.6, 26);
    for (const iv of state.intervals) {
      const x1 = xOf(iv.startMin);
      const x2 = xOf(iv.endMin);
      const y = yOf(iv.stopIndex) - h / 2;
      ctx.fillStyle = waitColor(iv.wait, maxWait);
      ctx.globalAlpha = 0.75;
      ctx.fillRect(x1, y, Math.max(x2 - x1, 2), h);
      ctx.globalAlpha = 1;
      if (state.selected === iv) {
        ctx.strokeStyle = "#111";
        ctx.lineWidth = 2;
        ctx.strokeRect(x1, y, Math.max(x2 - x1, 2), h);
      }
      state.hitZones.push({ x: x1, y, w: Math.max(x2 - x1, 2), h, interval: iv });
    }
  }

  function drawVehicleLines() {
    const byVehicle = new Map();
    for (const r of state.records) {
      if (!byVehicle.has(r.vehicle)) byVehicle.set(r.vehicle, []);
      byVehicle.get(r.vehicle).push(r);
    }
    ctx.lineWidth = 1.5;
    for (const [, list] of byVehicle) {
      list.sort((a, b) => a.stopIndex - b.stopIndex);
      ctx.strokeStyle = "rgba(25, 118, 210, 0.65)";
      ctx.beginPath();
      list.forEach((r, i) => {
        const x = xOf(Core.timeToMinutes(r.time));
        const y = yOf(r.stopIndex);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }
  }

  function drawStops() {
    ctx.font = "12px sans-serif";
    for (const s of state.stops) {
      const y = yOf(s.index);
      ctx.fillStyle = "#333";
      ctx.textAlign = "right";
      ctx.fillText(s.name, MARGIN.left - 8, y + 4);
      ctx.strokeStyle = "#ddd";
      ctx.beginPath();
      ctx.moveTo(MARGIN.left, y);
      ctx.lineTo(MARGIN.left + PLOT_W, y);
      ctx.stroke();
    }
    // 到站点
    for (const r of state.records) {
      const x = xOf(Core.timeToMinutes(r.time));
      const y = yOf(r.stopIndex);
      ctx.fillStyle = "#0d47a1";
      ctx.beginPath();
      ctx.arc(x, y, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  function renderLegend() {
    const lc = document.getElementById("legend-canvas");
    const lctx = lc.getContext("2d");
    const maxWait = Math.max(...state.intervals.map((i) => i.wait), 0);
    const w = lc.width;
    const h = 16;
    for (let x = 0; x < w; x++) {
      lctx.fillStyle = waitColor((x / w) * maxWait, maxWait || 1);
      lctx.fillRect(x, 6, 1, h);
    }
    lctx.strokeStyle = "#999";
    lctx.strokeRect(0.5, 6.5, w - 1, h - 1);
    document.getElementById("legend-labels").innerHTML =
      '<div style="display:flex;justify-content:space-between;font-size:11px;color:#777">' +
      "<span>0 分钟</span><span>" + maxWait + " 分钟</span></div>";
  }

  function renderStats() {
    const s = Core.computeStats(state.records, state.intervals, state.dupRemoved);
    const rows = [
      ["线路", state.route],
      ["到站记录", s.recordCount + " 条"],
      ["去除重复", s.dupRemoved + " 条"],
      ["间隔数量", s.intervalCount + " 个"],
      ["平均等待", s.avgWait.toFixed(1) + " 分钟"],
      ["最长等待", s.maxWait + " 分钟"],
      ["最短等待", s.minWait + " 分钟"],
    ];
    document.getElementById("stats").innerHTML = rows
      .map(([k, v]) => '<span class="k">' + k + '</span><span class="v">' + v + "</span>")
      .join("");
  }

  function renderDetail() {
    const el = document.getElementById("detail");
    const iv = state.selected;
    if (!iv) {
      el.innerHTML = '<span class="empty">点击图中的间隔色块查看原始记录</span>';
      return;
    }
    el.textContent =
      "站点：" + iv.stop + "\n" +
      "间隔：" + Core.minutesToTime(iv.startMin) + " ~ " + Core.minutesToTime(iv.endMin) +
      "（等待 " + iv.wait + " 分钟）\n" +
      "—— 原始记录 ——\n" +
      JSON.stringify(iv.from, null, 2) + "\n" +
      JSON.stringify(iv.to, null, 2);
  }

  function exportPNG() {
    const link = document.createElement("a");
    link.download = "时空图-" + state.route + "-" +
      Core.minutesToTime(state.winStart) + "-" + Core.minutesToTime(state.winEnd) + ".png";
    link.href = canvas.toDataURL("image/png");
    link.click();
  }

  canvas.addEventListener("click", (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / rect.width) * canvas.width;
    const my = ((e.clientY - rect.top) / rect.height) * canvas.height;
    const hit = state.hitZones.find(
      (z) => mx >= z.x && mx <= z.x + z.w && my >= z.y && my <= z.y + z.h
    );
    state.selected = hit ? hit.interval : null;
    render();
    renderDetail();
  });

  routeSelect.addEventListener("change", () => {
    state.route = routeSelect.value;
    applyFilters();
  });
  winStartInput.addEventListener("change", () => {
    state.winStart = Core.timeToMinutes(winStartInput.value);
    applyFilters();
  });
  winEndInput.addEventListener("change", () => {
    state.winEnd = Core.timeToMinutes(winEndInput.value);
    applyFilters();
  });
  document.getElementById("export-btn").addEventListener("click", exportPNG);

  // 初始化
  const routes = [...new Set(BUS_RECORDS.map((r) => r.route))];
  routeSelect.innerHTML = routes
    .map((r) => '<option value="' + r + '">' + r + "</option>")
    .join("");
  state.route = routes[0];
  applyFilters();
})();
