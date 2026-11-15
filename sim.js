/*
 * 地热井模拟核心：纯逻辑，无 DOM 依赖，可在 Node 中测试。
 * 玩家可调：泄压阀 relief、注水率 injection、涡轮负荷 load（0..1）。
 * 压力/温度为一阶滞后；注水过快暂时压低蒸汽量；泄压损失输出。
 * 井口压力超限持续数秒触发紧急停机（失败）；撑满时长且平均功率达标即成功。
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GeothermalSim = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const DEFAULTS = {
    duration: 600,        // 模拟时长（秒）
    pStart: 8.0,          // 初始井口压力 MPa
    pLimit: 12.0,         // 超压上限 MPa
    pWarn: 10.5,          // 报警压力 MPa
    tStart: 240,          // 初始蒸汽温度 °C
    tEq: 255,             // 热储平衡温度 °C
    tauT: 70,             // 温度惯性时间常数 s
    tauValve: 3,          // 阀门/负荷执行机构滞后 s
    overpressureGrace: 5, // 超压宽限 s
    powerSuccessAvg: 6,   // 成功所需平均功率 MW
    seed: 20261115,
  };

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  function createSim(options) {
    const cfg = Object.assign({}, DEFAULTS, options || {});
    const rng = mulberry32(cfg.seed);

    // 预生成随机蒸汽涌浪事件（地热活动增强）
    const surges = [];
    let tCursor = 60 + rng() * 60;
    while (tCursor < cfg.duration - 40) {
      surges.push({
        start: tCursor,
        end: tCursor + 15 + rng() * 20,
        mag: 2.5 + rng() * 2.5,
      });
      tCursor += 70 + rng() * 90;
    }

    const state = {
      t: 0,
      P: cfg.pStart,
      T: cfg.tStart,
      target: { relief: 0, injection: 0, load: 0.8 },
      actual: { relief: 0, injection: 0, load: 0.8 },
      flows: { qIn: 0, qTurb: 0, qRelief: 0, qWater: 0 },
      power: 0,
      energy: 0,
      avgPower: 0,
      overTimer: 0,
      shutdown: false,
      shutdownReason: null,
      success: false,
      finished: false,
      surgeActive: 0,
      ramp: 0,
    };

    function setControls(c) {
      if (state.shutdown) return; // 停机后控制锁定
      if (c.relief !== undefined) state.target.relief = clamp(c.relief, 0, 1);
      if (c.injection !== undefined) state.target.injection = clamp(c.injection, 0, 1);
      if (c.load !== undefined) state.target.load = clamp(c.load, 0, 1);
    }

    function surgeAt(t) {
      let m = 0;
      for (const s of surges) {
        if (t >= s.start && t <= s.end) m = Math.max(m, s.mag);
      }
      return m;
    }

    function step(dt) {
      if (state.finished) return state;
      dt = Math.min(dt, 1);
      state.t += dt;

      // 执行机构一阶滞后
      const a = dt / cfg.tauValve;
      for (const k of ['relief', 'injection', 'load']) {
        state.actual[k] += (state.target[k] - state.actual[k]) * a;
      }

      const act = state.actual;
      const W = act.injection * 10;              // 注水 kg/s
      state.ramp = 14 * Math.min(state.t / cfg.duration, 1); // 热储缓慢增压
      state.surgeActive = surgeAt(state.t);

      // 蒸汽流入：随温度升高而增强；注水冷却会暂时压低蒸汽量
      const qIn = Math.max(2, 6 + 0.05 * state.T + state.ramp + state.surgeActive - 1.2 * W);
      let qTurb = state.shutdown ? 0 : 2.75 * state.P * act.load;
      let qRelief = 3.0 * Math.max(state.P - 1, 0) * act.relief;

      if (state.shutdown) {
        // 紧急停机：涡轮跳闸，泄压阀全开
        qTurb = 0;
        qRelief = 3.0 * Math.max(state.P - 1, 0) * 1.0;
      }

      // 压力动态：流入 - 流出 + 注水置换
      const dP = (qIn + 0.5 * W - qTurb - qRelief) * 0.05;
      state.P = clamp(state.P + dP * dt, 0.5, 20);

      // 温度动态：向热储平衡温度回归，注水冷却
      const dT = (cfg.tEq - state.T) / cfg.tauT - 0.15 * W;
      state.T = clamp(state.T + dT * dt, 100, 320);

      state.flows = { qIn, qTurb, qRelief, qWater: W };
      state.power = qTurb * 0.6 * (0.7 + 0.3 * state.T / 240);
      state.energy += state.power * dt / 3600;
      state.avgPower = state.energy * 3600 / Math.max(state.t, 1e-9);

      // 超压判定
      if (!state.shutdown) {
        if (state.P > cfg.pLimit) {
          state.overTimer += dt;
          if (state.overTimer >= cfg.overpressureGrace) {
            state.shutdown = true;
            state.shutdownReason = 'overpressure';
          }
        } else {
          state.overTimer = Math.max(0, state.overTimer - 2 * dt);
        }
      }

      if (state.t >= cfg.duration) {
        state.finished = true;
        state.success = !state.shutdown && state.avgPower >= cfg.powerSuccessAvg;
      }
      return state;
    }

    return { cfg, state, surges, setControls, step };
  }

  return { DEFAULTS, createSim };
});
