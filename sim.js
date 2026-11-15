// 地下主管抢修物理模拟（浏览器 / Node 共用）
// 模型：集中参数 + Joukowsky 水锤  ΔP = ρ·a·Δv
// 慢关阀（T_close > 2L/a）时峰值按 (2L/a)/T_close 衰减。

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PipeSim = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const RHO = 1000;        // 水密度 kg/m^3
  const WAVE_A = 1200;     // 压力波速 m/s
  const PIPE_L = 600;      // 两阀间距 m
  const V_MAX = 2.0;       // 全开流速 m/s
  const P_STATIC = 0.45e6; // 静压 Pa
  const P_RATING = 1.2e6;  // 管材耐压 Pa
  const T_CRIT = (2 * PIPE_L) / WAVE_A; // 临界关阀时间 s ≈ 1.0

  const PHASES = [
    'LEAKING', 'VALVES_DONE', 'DRAINED',
    'REPAIRED', 'PRESSURE_TEST', 'SUCCESS', 'FAILED',
  ];

  function createSim() {
    return {
      t: 0,
      phase: 'LEAKING',
      failReason: null,
      valveA: { open: 1, target: 1, rate: 0 },   // 上游阀
      valveB: { open: 1, target: 1, rate: 0 },   // 下游阀
      velocity: V_MAX,
      pressure: P_STATIC,
      transients: [],                             // 水锤瞬态
      waterLevel: 1,                              // 管段充水率
      draining: false,
      shoring: 0,                                 // 支护 0..1
      trenchOpen: false,
      stability: 1,                               // 沟槽稳定性 0..1
      pipeInstalled: 0,                           // 换管进度 0..1
      testTimer: 0,
      testHold: 8,                                // 需稳压秒数
      events: [],
      closedOrder: [],
    };
  }

  function log(s, msg, kind) {
    s.events.push({ t: s.t, msg, kind: kind || 'info' });
  }

  // 设定阀门目标开度与关闭/开启用时（秒）
  function setValve(s, which, target, duration) {
    const v = which === 'A' ? s.valveA : s.valveB;
    duration = Math.max(0.05, duration);
    v.target = target;
    v.rate = Math.abs(target - v.open) / duration;
    v._pending = { which, target, duration, moved: 0 };
  }

  // 水锤：开度变化 Δopen 用时 dt
  function hammer(s, dOpen, dt, tag) {
    const dv = V_MAX * Math.abs(dOpen);
    if (dv < 1e-4) return;
    const factor = Math.min(1, T_CRIT / Math.max(dt, 1e-3)); // 慢关衰减
    const amp = RHO * WAVE_A * dv * factor;
    if (amp < 1e3) return;
    s.transients.push({ amp, t0: s.t, freq: 3.5, decay: 1.6 });
    log(s, '水锤瞬态 +' + (amp / 1e6).toFixed(2) + ' MPa（' + tag + '）',
        amp > 0.5e6 ? 'danger' : 'warn');
  }

  function step(s, dt) {
    if (s.phase === 'SUCCESS' || s.phase === 'FAILED') return s;
    s.t += dt;

    // 阀门运动
    for (const key of ['valveA', 'valveB']) {
      const v = s[key];
      if (v.rate > 0 && v.open !== v.target) {
        const before = v.open;
        const dir = Math.sign(v.target - v.open);
        v.open += dir * v.rate * dt;
        v._pending.moved += v.open - before;
        if ((dir > 0 && v.open >= v.target) || (dir < 0 && v.open <= v.target)) {
          v.open = v.target;
          v.rate = 0;
          if (v._pending) {
            hammer(s, v._pending.moved, v._pending.duration, '阀门' + v._pending.which);
            if (v._pending.target === 0) s.closedOrder.push(v._pending.which);
            v._pending = null;
          }
        }
      }
    }

    const openEff = s.valveA.open * s.valveB.open;
    const targetV = V_MAX * openEff * s.waterLevel;
    s.velocity += (targetV - s.velocity) * Math.min(1, dt * 4);

    // 排水
    if (s.draining && openEff < 0.02 && s.waterLevel > 0) {
      s.waterLevel = Math.max(0, s.waterLevel - dt / 20); // 20s 排空
      if (s.waterLevel === 0) {
        s.draining = false;
        if (s.phase === 'VALVES_DONE') {
          s.phase = 'DRAINED';
          log(s, '管段排空完成，可以换管', 'ok');
        }
      }
    }

    // 恢复供水后管段重新充水
    if (openEff > 0.1 && s.waterLevel < 1 && !s.draining) {
      s.waterLevel = Math.min(1, s.waterLevel + dt / 10);
    }

    // 沟槽稳定性：开挖后持续劣化，支护减缓
    if (s.trenchOpen && s.phase !== 'SUCCESS') {
      const decay = 0.012 * (1 - 0.92 * s.shoring);
      s.stability = Math.max(0, s.stability - decay * dt * (1 + 0.5 * (1 - s.shoring)));
      if (s.stability <= 0) return fail(s, '支护不足，沟槽坍塌！');
    }

    // 压力 = 静压(随开度) + 瞬态叠加
    let p = P_STATIC * (0.15 + 0.85 * openEff) * (s.waterLevel > 0 ? 1 : 0.05);
    s.transients = s.transients.filter(tr => s.t - tr.t0 < 6);
    for (const tr of s.transients) {
      const tau = s.t - tr.t0;
      p += tr.amp * Math.exp(-tr.decay * tau) * Math.cos(2 * Math.PI * tr.freq * tau);
    }
    s.pressure = p;

    if (p > P_RATING) {
      return fail(s, '压力峰值 ' + (p / 1e6).toFixed(2) + ' MPa 超过管材耐压，爆管！');
    }

    // 阶段推进
    if (s.phase === 'LEAKING' && s.valveA.open === 0 && s.valveB.open === 0) {
      s.phase = 'VALVES_DONE';
      log(s, '两阀关闭，泄漏隔离', 'ok');
    }
    if (s.phase === 'PRESSURE_TEST') {
      const ok = Math.abs(p - P_STATIC) < 0.08e6 && s.velocity > 0.5;
      s.testTimer = ok ? s.testTimer + dt : 0;
      if (s.testTimer >= s.testHold) {
        s.phase = 'SUCCESS';
        log(s, '压力测试通过，供水恢复！', 'ok');
      }
    }
    return s;
  }

  function fail(s, reason) {
    s.phase = 'FAILED';
    s.failReason = reason;
    log(s, reason, 'danger');
    return s;
  }

  // ---- 玩家操作 ----
  function digTrench(s) {
    if (!s.trenchOpen) { s.trenchOpen = true; log(s, '沟槽开挖，注意支护！', 'warn'); }
  }
  function addShoring(s) {
    s.shoring = Math.min(1, s.shoring + 0.25);
    log(s, '支护加固至 ' + ((s.shoring * 100) | 0) + '%');
  }
  function startDrain(s) {
    if (s.valveA.open > 0.02 || s.valveB.open > 0.02) {
      log(s, '阀门未关严，无法排水', 'warn'); return;
    }
    s.draining = true;
    log(s, '开始排水…');
  }
  function installPipe(s, dt) {
    if (s.phase !== 'DRAINED' && s.phase !== 'VALVES_DONE') return;
    if (s.waterLevel > 0.02) { log(s, '管内有水，无法安装', 'warn'); return; }
    if (s.shoring < 0.5) { log(s, '支护不足 50%，无法安全下管', 'warn'); return; }
    s.pipeInstalled = Math.min(1, s.pipeInstalled + dt / 6);
    if (s.pipeInstalled >= 1 && s.phase !== 'REPAIRED') {
      s.phase = 'REPAIRED';
      log(s, '新管段安装完成！', 'ok');
    }
  }
  function restoreAndTest(s) {
    if (s.phase !== 'REPAIRED') return;
    s.phase = 'PRESSURE_TEST';
    log(s, '恢复供水，开始压力测试…');
  }

  return {
    createSim, step, setValve, digTrench, addShoring, startDrain,
    installPipe, restoreAndTest, fail,
    consts: { RHO, WAVE_A, PIPE_L, V_MAX, P_STATIC, P_RATING, T_CRIT, PHASES },
  };
});
