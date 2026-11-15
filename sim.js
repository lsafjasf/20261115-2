// 净化塔模拟核心：确定性（固定种子），可在浏览器与 Node 中运行。
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Sim = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // ---- 固定数据 ----
  var GRID_W = 100;
  var GRID_H = 60;
  var CELL_M = 20; // 每格 20 米
  var DT = 1; // 每步 1 秒（模拟时间）
  var SIM_DURATION = 30 * 60; // 30 分钟
  var LIMIT = 75; // 达标限值（浓度单位）
  var HOLD_TO_WIN = 60; // 全部达标需连续保持的秒数

  var FILTER_CAPACITY = 9000; // 滤芯容尘量
  var FILTER_ETA_FRESH = 0.95; // 新滤芯效率
  var FILTER_ETA_OVERLOAD = 0.35; // 过载后效率
  var FILTER_REGEN = 100; // 备用滤芯每秒自清洁量
  var PREROLL_STEPS = 300; // 开局前无管控预滚秒数（形成既有污染）

  // 三座净化塔：位置（格）、污染源速率
  var TOWER_DEFS = [
    { id: 0, name: "1号塔", x: 12, y: 14, source: 60 },
    { id: 1, name: "2号塔", x: 10, y: 32, source: 85 },
    { id: 2, name: "3号塔", x: 14, y: 46, source: 65 },
  ];

  // 监测点：学校、住宅区、厂界
  var MONITOR_DEFS = [
    { id: 0, name: "学校", x: 62, y: 16 },
    { id: 1, name: "住宅区", x: 68, y: 38 },
    { id: 2, name: "厂界东", x: 34, y: 30 },
  ];

  // 固定种子随机数（mulberry32）
  function makeRng(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---- 风场（确定性）：主风向自西向东，叠加两个涡旋与阵风 ----
  function windAt(x, y, t) {
    var u = 1.6 + 0.25 * Math.sin(t * 0.01 + y * 0.15);
    var v = 0.2 * Math.sin(t * 0.008 + x * 0.12);
    var dx1 = x - 45, dy1 = y - 18;
    var r1 = dx1 * dx1 + dy1 * dy1 + 40;
    u += (-dy1 * 6) / r1;
    v += (dx1 * 6) / r1;
    var dx2 = x - 55, dy2 = y - 44;
    var r2 = dx2 * dx2 + dy2 * dy2 + 40;
    u += (dy2 * 5) / r2;
    v += (-dx2 * 5) / r2;
    return { u: u, v: v };
  }

  function createState() {
    var rng = makeRng(20261115);
    var grid = new Float32Array(GRID_W * GRID_H);
    for (var i = 0; i < grid.length; i++) grid[i] = 5 + rng() * 3;
    var towers = TOWER_DEFS.map(function (d) {
      return {
        id: d.id, name: d.name, x: d.x, y: d.y, source: d.source,
        airflow: 0,     // 风量 0..1
        bypass: 0,      // 旁路比例 0..1
        activeFilter: 0,
        filters: [
          { load: 0, overloaded: false },
          { load: 0, overloaded: false },
        ],
        emission: 0,
        eta: FILTER_ETA_FRESH,
      };
    });
    var state = {
      t: 0,
      grid: grid,
      towers: towers,
      monitors: MONITOR_DEFS.map(function (d) {
        return { id: d.id, name: d.name, x: d.x, y: d.y, value: 0, exceed: false };
      }),
      holdTimer: 0,
      status: "running", // running | success | failed
    };
    // 预滚：玩家接管前工厂无管控运行，监测点已超标
    for (var p = 0; p < PREROLL_STEPS; p++) step(state);
    state.t = 0;
    state.holdTimer = 0;
    state.status = "running";
    // 玩家接管时的默认工况
    for (var q = 0; q < state.towers.length; q++) {
      state.towers[q].airflow = 0.6;
      state.towers[q].bypass = 0.1;
    }
    return state;
  }

  // ---- 玩家操作 ----
  function setAirflow(state, id, v) {
    state.towers[id].airflow = Math.min(1, Math.max(0, v));
  }
  function setBypass(state, id, v) {
    state.towers[id].bypass = Math.min(1, Math.max(0, v));
  }
  function switchFilter(state, id) {
    var tw = state.towers[id];
    tw.activeFilter = 1 - tw.activeFilter;
  }

  // ---- 塔：计算单塔每秒排放，并更新滤芯 ----
  function updateTower(tw) {
    var f = tw.airflow;
    var b = tw.bypass;
    var active = tw.filters[tw.activeFilter];
    var idle = tw.filters[1 - tw.activeFilter];

    // 备用滤芯缓慢自清洁，可恢复
    idle.load = Math.max(0, idle.load - FILTER_REGEN * DT);
    if (idle.overloaded && idle.load < FILTER_CAPACITY * 0.3) idle.overloaded = false;

    var eta = active.overloaded ? FILTER_ETA_OVERLOAD : FILTER_ETA_FRESH;
    tw.eta = eta;

    // 排放 = 未捕集 + 旁路直排 + 过滤后残余
    var captured = tw.source * f;
    var throughFilter = captured * (1 - b);
    var emission = tw.source * (1 - f) + captured * b + throughFilter * (1 - eta);
    tw.emission = emission;

    // 滤芯积尘
    active.load += throughFilter * eta * DT;
    if (!active.overloaded && active.load >= FILTER_CAPACITY) {
      active.overloaded = true; // 过载：效率骤降
    }
  }

  // ---- 污染羽流：半拉格朗日平流 + 扩散 + 沉降 ----
  var scratch = new Float32Array(GRID_W * GRID_H);
  function advect(state) {
    var g = state.grid;
    var t = state.t;
    for (var y = 0; y < GRID_H; y++) {
      for (var x = 0; x < GRID_W; x++) {
        var w = windAt(x, y, t);
        var sx = x - w.u * DT;
        var sy = y - w.v * DT;
        scratch[y * GRID_W + x] = sample(g, sx, sy);
      }
    }
    // 简单扩散与沉降
    for (var yy = 0; yy < GRID_H; yy++) {
      for (var xx = 0; xx < GRID_W; xx++) {
        var i = yy * GRID_W + xx;
        var c = scratch[i];
        var n = 0, sum = 0;
        if (xx > 0) { sum += scratch[i - 1]; n++; }
        if (xx < GRID_W - 1) { sum += scratch[i + 1]; n++; }
        if (yy > 0) { sum += scratch[i - GRID_W]; n++; }
        if (yy < GRID_H - 1) { sum += scratch[i + GRID_W]; n++; }
        var avg = sum / n;
        g[i] = Math.max(0, (c * 0.92 + avg * 0.08) * 0.9995);
      }
    }
  }

  function sample(g, fx, fy) {
    var x0 = Math.floor(fx), y0 = Math.floor(fy);
    var x1 = x0 + 1, y1 = y0 + 1;
    var ax = fx - x0, ay = fy - y0;
    function at(x, y) {
      if (x < 0 || y < 0 || x >= GRID_W || y >= GRID_H) return 5; // 背景
      return g[y * GRID_W + x];
    }
    var top = at(x0, y0) * (1 - ax) + at(x1, y0) * ax;
    var bot = at(x0, y1) * (1 - ax) + at(x1, y1) * ax;
    return top * (1 - ay) + bot * ay;
  }

  // ---- 主步进 ----
  function step(state) {
    if (state.status !== "running") return state;
    state.t += DT;

    // 1) 塔排放注入网格
    for (var k = 0; k < state.towers.length; k++) {
      var tw = state.towers[k];
      updateTower(tw);
      var idx = tw.y * GRID_W + tw.x;
      state.grid[idx] += tw.emission * DT * 30; // 排放系数
    }

    // 2) 羽流扩散
    advect(state);

    // 3) 监测点读数
    var allOk = true;
    for (var m = 0; m < state.monitors.length; m++) {
      var mon = state.monitors[m];
      mon.value = sample(state.grid, mon.x, mon.y);
      mon.exceed = mon.value > LIMIT;
      if (mon.exceed) allOk = false;
    }

    // 4) 胜负判定：全部达标并保持 HOLD_TO_WIN 秒
    if (allOk) {
      state.holdTimer += DT;
      if (state.holdTimer >= HOLD_TO_WIN) state.status = "success";
    } else {
      state.holdTimer = 0;
    }
    if (state.t >= SIM_DURATION && state.status === "running") {
      state.status = "failed";
    }
    return state;
  }

  return {
    GRID_W: GRID_W, GRID_H: GRID_H, CELL_M: CELL_M,
    SIM_DURATION: SIM_DURATION, LIMIT: LIMIT, HOLD_TO_WIN: HOLD_TO_WIN,
    FILTER_CAPACITY: FILTER_CAPACITY,
    FILTER_ETA_FRESH: FILTER_ETA_FRESH,
    FILTER_ETA_OVERLOAD: FILTER_ETA_OVERLOAD,
    TOWER_DEFS: TOWER_DEFS, MONITOR_DEFS: MONITOR_DEFS,
    windAt: windAt, createState: createState, step: step,
    setAirflow: setAirflow, setBypass: setBypass, switchFilter: switchFilter,
  };
});
