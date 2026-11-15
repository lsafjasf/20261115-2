/*
 * engine.js — 索桥货缆车物理与货运状态机（浏览器 / Node 通用，无 DOM 依赖）
 * 桥面：Verlet 质点 + 距离约束；吊篮：风驱单摆；断裂：最大段应变超限。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BridgeEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const CFG = {
    SPAN: 60,              // 两塔间距（米）
    SEGMENTS: 24,          // 索段数
    GRAV: 9.81,
    NODE_MASS: 0.35,       // 索节点等效质量
    VERLET_DAMP: 0.985,    // 速度阻尼（每 1/60s 保留系数）
    SPRING_K: 300,         // 索段弹簧刚度 N/m
    SPRING_DAMP: 12,       // 索段内阻尼
    STRUCT_DRAG: 2.4,      // 结构阻尼系数（绝对速度阻力）
    PRETENSION: 1.05,      // 初始索段预张力（静长比例）
    SAG_RATIO: 0.045,      // 初始跨中垂度 / 跨度
    HANGER_LEN: 5.5,       // 吊索长度（米）
    PEND_DAMP: 0.35,       // 单摆阻尼
    TARE_MASS: 2,          // 缆车自重
    CARGO_CAP: 12,         // 车斗物理容量（安全载货 10，11 件起过载）
    CAR_SPEED: 0.045,      // 参数 s 每秒推进量（全程约 22 秒）
    STATION_HALF: 0.055,   // 中途站停靠半宽
    END_HALF: 0.08,        // 两端平台停靠半宽
    STOP_SPEED: 0.004,
    IDLE_SPEED: 0.05,      // 静止判定（m/s，用于装卸许可）
    PARK_SPEED: 0.012,     // 完全停稳（m/s，用于桥面恢复计时）
    STRAIN_LIMIT: 0.289,   // 断裂应变：mass12 全风况 ≤0.286 安全 / mass13 无风 0.293 断裂
    HEAVY_MASS: 8,
    SETTLE_SPEED: 0.03,    // 节点收敛速度 m/s（残余振动阈值）
    SETTLE_STRESS: 0.35,
    SETTLE_HOLD: 0.5,      // 持续满足多久算恢复
    FIXED_DT: 1 / 120
  };

  const TARGET = { A: 'right', B: 'left', C: 'right' };

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function copyPiles(p) {
    return {
      left: Object.assign({}, p.left),
      mid: Object.assign({}, p.mid),
      right: Object.assign({}, p.right)
    };
  }

  function createGame(opts) {
    opts = opts || {};
    const N = CFG.SEGMENTS;
    const rest = CFG.SPAN / N;
    const g = {
      cfg: CFG,
      time: 0,
      status: 'running',
      events: [],
      input: { dir: 0 },
      rng: mulberry32(opts.seed == null ? 20261115 : opts.seed),
      gustsEnabled: opts.gusts !== false,
      _forcedWind: null,
      trips: 0,
      midUnloads: 0,
      piles: copyPiles({ left: { A: 6, C: 9 }, mid: {}, right: { B: 5 } }),
      carCargo: { A: 0, B: 0, C: 0 },
      delivered: { A: 0, B: 0, C: 0 },
      needed: { A: 6, B: 5, C: 9 },
      s: 0,
      sPrev: 0,
      theta: 0,
      thetaVel: 0,
      wind: 1.2,
      peakStress: 0,
      stress: 0,
      maxSag: 0,
      recovery: { stoppedAt: null, settleTime: null, settled: false, maxNodeSpeed: 0 },
      _gust: { nextAt: 2, until: 0, peak: 0 },
      nodes: [],
      _prev: [],
      _subAcc: 0,
      _crossedHalf: false,
      _halfDir: null
    };
    const sag = CFG.SPAN * CFG.SAG_RATIO;
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      const x = i * rest;
      const y = 4 * sag * u * (1 - u);           // 抛物线悬链近似
      g.nodes.push({ x, y, vx: 0, vy: 0, fx: i === 0 || i === N });
      g._prev.push({ x, y });
    }
    // 静长略短于几何段长 → 预张力，数值稳定且垂度合理
    g.restLen = (rest / CFG.PRETENSION);
    return g;
  }
  function carMass(g) {
    return CFG.TARE_MASS + g.carCargo.A + g.carCargo.B + g.carCargo.C;
  }

  function atStation(g) {
    const ds = Math.abs(g.s - g.sPrev);
    if (ds > CFG.IDLE_SPEED * CFG.FIXED_DT) return null;
    if (g.s <= CFG.END_HALF) return 'left';
    if (g.s >= 1 - CFG.END_HALF) return 'right';
    if (Math.abs(g.s - 0.5) <= CFG.STATION_HALF) return 'mid';
    return null;
  }

  // 站点对应的目标参数坐标（驶入停靠区即算到达）
  function stationTarget(name) {
    if (name === 'left' || name === 0) return 0;
    if (name === 'right' || name === 1) return 1;
    return 0.5;
  }

  function reachedStation(g, target) {
    if (target <= 0.01) return g.s <= CFG.END_HALF;
    if (target >= 0.99) return g.s >= 1 - CFG.END_HALF;
    return Math.abs(g.s - 0.5) <= CFG.STATION_HALF;
  }

  function markLoading(g) {
    g.recovery.settled = false;
    g.recovery.settleTime = null;
  }

  function loadCargo(g, batchId, units) {
    if (g.status !== 'running') return false;
    const st = atStation(g);
    if (!st) return false;
    units = units == null ? 1 : units;
    const have = g.piles[st][batchId] || 0;
    const onBoard = carMass(g) - CFG.TARE_MASS;
    units = Math.min(units, have, CFG.CARGO_CAP - onBoard);
    if (units <= 0) return false;
    g.piles[st][batchId] = have - units;
    g.carCargo[batchId] += units;
    markLoading(g);
    g.events.push({ t: g.time, type: 'load', batch: batchId, units, at: st });
    return true;
  }

  function unloadCargo(g, units) {
    if (g.status !== 'running') return false;
    const st = atStation(g);
    if (!st) return false;
    units = units == null ? 1 : units;
    let remaining = units;
    let moved = 0;
    for (const id of ['A', 'B', 'C']) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, g.carCargo[id]);
      if (!take) continue;
      g.carCargo[id] -= take;
      remaining -= take;
      moved += take;
      if (TARGET[id] === st) {
        g.delivered[id] += take;
        g.events.push({ t: g.time, type: 'deliver', batch: id, units: take, at: st });
      } else {
        g.piles[st][id] = (g.piles[st][id] || 0) + take;
        if (st === 'mid') g.midUnloads += take;
      }
    }
    if (!moved) return false;
    markLoading(g);
    checkWin(g);
    return true;
  }

  function checkWin(g) {
    if (g.status === 'running' &&
      g.delivered.A === g.needed.A &&
      g.delivered.B === g.needed.B &&
      g.delivered.C === g.needed.C) {
      g.status = 'won';
      g.events.push({ t: g.time, type: 'win', trips: g.trips });
    }
  }
  function updateWind(g, dt) {
    if (g._forcedWind != null) {
      g.wind = g._forcedWind;
      return;
    }
    if (!g.gustsEnabled) {
      g.wind = 1.2;
      return;
    }
    if (g.time >= g._gust.nextAt && g.time > g._gust.until) {
      const peak = 7 + g.rng() * 5;           // 阵风峰值 7~12 m/s
      const dur = 1.6 + g.rng() * 1.4;
      g._gust = { nextAt: g.time, until: g.time + dur, peak };
      g.events.push({ t: g.time, type: 'gust', peak: +peak.toFixed(2), dur: +dur.toFixed(2) });
    }
    if (g.time < g._gust.until) {
      const p = (g._gust.until - g.time);
      const dur = Math.max(0.0001, g._gust.until - g._gust.nextAt);
      const env = Math.sin(Math.PI * (1 - p / dur));   // 0→1→0 包络
      g.wind = 1.2 + (g._gust.peak - 1.2) * env;
      if (g.time + dt >= g._gust.until) {
        g._gust.nextAt = g._gust.until + 3 + g.rng() * 4;
      }
    } else {
      g.wind = 1.2;
    }
  }

  function integratePendulum(g, dt) {
    // 风推动吊篮，重力为回复力；theta 为相对竖直吊索的摆角
    const gust = Math.max(0, g.wind - 1.2);   // 只有阵风超出背景风的部分驱动摆动
    const windAcc = 0.3 * gust;
    const alpha = (windAcc * Math.cos(g.theta) - CFG.GRAV * Math.sin(g.theta))
      / CFG.HANGER_LEN - CFG.PEND_DAMP * g.thetaVel;
    g.thetaVel += alpha * dt;
    g.theta += g.thetaVel * dt;
    g.theta = Math.max(-0.9, Math.min(0.9, g.theta));
  }

  function carAnchor(g) {
    // 缆车在索上的锚点：按 s 插值到相邻节点
    const f = g.s * CFG.SEGMENTS;
    const i = Math.max(0, Math.min(CFG.SEGMENTS - 1, Math.floor(f)));
    const t = f - i;
    const a = g.nodes[i];
    const b = g.nodes[i + 1];
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, i, t };
  }

  function carBasket(g) {
    const a = carAnchor(g);
    return {
      x: a.x + CFG.HANGER_LEN * Math.sin(g.theta),
      y: a.y + CFG.HANGER_LEN * Math.cos(g.theta),
      anchorX: a.x,
      anchorY: a.y
    };
  }
  function computeForces(g) {
    const rest = g.restLen;
    const forces = new Array(g.nodes.length);
    for (let i = 0; i < g.nodes.length; i++) {
      forces[i] = { x: 0, y: CFG.NODE_MASS * CFG.GRAV };
      if (!g.nodes[i].fx) {
        // 结构阻尼：与绝对速度反向，模拟桥体能量耗散
        forces[i].x -= CFG.STRUCT_DRAG * g.nodes[i].vx;
        forces[i].y -= CFG.STRUCT_DRAG * g.nodes[i].vy;
      }
    }
    for (let i = 0; i < CFG.SEGMENTS; i++) {
      const a = g.nodes[i];
      const b = g.nodes[i + 1];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1e-9;
      const nx = dx / dist;
      const ny = dy / dist;
      const stretch = dist - rest;
      const relVx = b.vx - a.vx;
      const relVy = b.vy - a.vy;
      const f = CFG.SPRING_K * stretch +
        CFG.SPRING_DAMP * (relVx * nx + relVy * ny);
      forces[i].x += f * nx;
      forces[i].y += f * ny;
      forces[i + 1].x -= f * nx;
      forces[i + 1].y -= f * ny;
    }
    return forces;
  }

  function integrateCable(g, dt, forces) {
    const d = Math.pow(CFG.VERLET_DAMP, dt * 60);
    for (let i = 0; i < g.nodes.length; i++) {
      const n = g.nodes[i];
      g._prev[i].x = n.x;
      g._prev[i].y = n.y;
      if (n.fx) {
        n.vx = 0;
        n.vy = 0;
        continue;
      }
      n.vx = (n.vx + forces[i].x / CFG.NODE_MASS * dt) * d;
      n.vy = (n.vy + forces[i].y / CFG.NODE_MASS * dt) * d;
      n.x += n.vx * dt;
      n.y += n.vy * dt;
    }
  }

  function applyCar(g, forces) {
    const m = carMass(g);
    const anchor = carAnchor(g);
    const dynamic = 1 + 0.2 * Math.abs(Math.sin(g.theta));
    const weight = m * CFG.GRAV * dynamic;
    // 吊篮摆动产生水平力，经吊索传回锚点
    const gust = Math.max(0, g.wind - 1.2);
    const horiz = m * 0.3 * gust * Math.cos(g.theta);
    const i = anchor.i;
    const t = anchor.t;
    const a = g.nodes[i];
    const b = g.nodes[i + 1];
    if (!a.fx) {
      forces[i].x += horiz * (1 - t);
      forces[i].y += weight * (1 - t);
    }
    if (!b.fx) {
      forces[i + 1].x += horiz * t;
      forces[i + 1].y += weight * t;
    }
  }

  function measure(g) {
    const rest = g.restLen;
    let maxStrain = 0;
    let maxSpeed = 0;
    let sag = 0;
    for (let i = 0; i < CFG.SEGMENTS; i++) {
      const a = g.nodes[i];
      const b = g.nodes[i + 1];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const strain = (dist - rest) / rest;
      if (strain > maxStrain) maxStrain = strain;
    }
    for (let i = 1; i < CFG.SEGMENTS; i++) {
      const n = g.nodes[i];
      const v = Math.hypot(n.vx, n.vy);
      if (v > maxSpeed) maxSpeed = v;
      if (n.y > sag) sag = n.y;
    }
    g.stress = maxStrain / CFG.STRAIN_LIMIT;
    if (g.stress > g.peakStress) g.peakStress = g.stress;
    g.maxSag = Math.max(g.maxSag, sag);
    g._lastNodeSpeed = maxSpeed;
    if (maxStrain > CFG.STRAIN_LIMIT && g.status === 'running') {
      g.status = 'failed';
      g.failInfo = {
        t: g.time,
        s: g.s,
        mass: carMass(g),
        cargo: Object.assign({}, g.carCargo),
        strain: +maxStrain.toFixed(4),
        wind: +g.wind.toFixed(2),
        theta: +g.theta.toFixed(3)
      };
      g.events.push({ t: g.time, type: 'fail', info: g.failInfo });
    }
  }

  function trackRecovery(g, dt) {
    const r = g.recovery;
    const stopped = Math.abs(g.s - g.sPrev) <= CFG.PARK_SPEED * CFG.FIXED_DT &&
      carMass(g) >= CFG.HEAVY_MASS;
    if (!stopped) {
      r.stoppedAt = null;
      r.settleTime = null;
      r.settled = false;
      r.maxNodeSpeed = 0;
      return;
    }
    if (r.stoppedAt == null) r.stoppedAt = g.time;
    r.maxNodeSpeed = Math.max(r.maxNodeSpeed, g._lastNodeSpeed);
    // 静载应力始终存在，恢复判定只看残余振动速度（动态分量）
    const calm = g._lastNodeSpeed < CFG.SETTLE_SPEED;
    if (calm) {
      if (r.settleTime == null) r.settleTime = g.time;
      if (g.time - r.settleTime >= CFG.SETTLE_HOLD && !r.settled) {
        r.settled = true;
        r.recoveryDuration = +(g.time - r.stoppedAt).toFixed(2);
        g.events.push({
          t: g.time,
          type: 'settled',
          duration: r.recoveryDuration
        });
      }
    } else {
      r.settleTime = null;
    }
  }
  function step(g, dt) {
    if (g.status !== 'running') return g;
    dt = Math.min(dt, 0.05);
    g._subAcc += dt;
    const h = CFG.FIXED_DT;
    while (g._subAcc >= h) {
      g.time += h;
      g.sPrev = g.s;
      const dir = g.input.dir;
      const before = g.s;
      g.s += dir * CFG.CAR_SPEED * h;
      if (g.s <= 0 || g.s >= 1) {
        g.s = g.s <= 0 ? 0 : 1;
        g.input.dir = 0;
      }
      // 完整穿越一次桥算一个班次（中途站停靠不计数），按方向各记半程
      if (g._halfDir == null && dir !== 0 &&
        (g.s > CFG.END_HALF && g.s < 1 - CFG.END_HALF)) {
        g._halfDir = dir;
      }
      if (g._halfDir === 1 && before < 0.5 && g.s >= 0.5) g._crossedHalf = true;
      if (g._halfDir === -1 && before > 0.5 && g.s <= 0.5) g._crossedHalf = true;
      const atEnd = g.s <= CFG.END_HALF || g.s >= 1 - CFG.END_HALF;
      if (g._crossedHalf && atEnd) {
        g.trips += 1;
        g._crossedHalf = false;
        g._halfDir = null;
        g.events.push({
          t: g.time, type: 'trip', n: g.trips,
          at: g.s <= 0.5 ? 'left' : 'right'
        });
      }
      stepSub(g, h);
      g._subAcc -= h;
      if (g.status !== 'running') break;
    }
    return g;
  }

  function stepSub(g, dt) {
    updateWind(g, dt);
    integratePendulum(g, dt);
    const forces = computeForces(g);
    applyCar(g, forces);
    integrateCable(g, dt, forces);
    measure(g);
    trackRecovery(g, dt);
  }

  return {
    CFG,
    TARGET,
    createGame,
    carMass,
    carAnchor,
    carBasket,
    atStation,
    stationTarget,
    reachedStation,
    loadCargo,
    unloadCargo,
    step,
    mulberry32
  };
});
