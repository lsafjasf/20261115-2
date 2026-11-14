// 纯模拟引擎：不依赖 DOM / Canvas，可在 Node 中无头步进测试。
// 时间单位均为秒，水位 / 热量 / 池容均为 0-100 的标量。

export const CONFIG = {
  DURATION: 600,          // 十分钟模拟
  START_LEVEL: 100,       // 泵房初始水位
  SAFE_LINE: 35,          // 安全线
  INFLOW: 2.6,            // 持续渗流（单位/秒）
  VOLUME_PER_STROKE: 3.6, // 每次有效摇杆行程抽出的水量
  BACKFLOW: 1.8,          // 错阀（池已满）时的回灌水量
  WRONG_HEAT: 6,          // 错阀额外热量
  POOL_CAP: 100,
  POOL_DRAIN: 1.6,        // 池子自身下渗速度
  MIN_STROKE: 0.3,        // 两次行程最小间隔（防抖）
  SAFE_SPEED: 1.2,        // 安全摇杆速度（次/秒）
  SPEED_TAU: 0.5,         // 速度估计衰减时间常数
  HEAT_BASE: 1.4,         // 摇泵时基础发热速率
  HEAT_EXCESS: 16,        // 超速发热系数
  COOL_RATE: 14,          // 停泵冷却速率
  SEIZE_TEMP: 100,
  SEIZE_COOLDOWN: 8,      // 过热锁定时长
  SEIZE_RESET: 45,        // 锁定解除后的温度
};

export function createEngine(cfg = CONFIG) {
  return {
    cfg,
    t: 0,
    running: false,
    finished: false,
    success: false,
    timeUsed: 0,
    level: cfg.START_LEVEL,
    heat: 20,
    seized: false,
    seizeTimer: 0,
    pumpSpeed: 0,
    crankAngle: 0,
    valve: 0,
    pools: [
      { name: 'A', level: 8, cap: cfg.POOL_CAP },
      { name: 'B', level: 62, cap: cfg.POOL_CAP },
    ],
    strokeCount: 0,
    routedCount: 0,
    wrongCount: 0,
    seizureCount: 0,
    lastStrokeAt: -10,
    flashWrong: 0,
    flashPump: 0,
  };
}

export function start(engine) {
  engine.running = true;
}

export function setValve(engine, idx) {
  if (idx === 0 || idx === 1) engine.valve = idx;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

// 玩家 1 压下一次摇杆。返回行程结果，供音频 / 测试使用。
export function crank(engine) {
  if (!engine.running || engine.finished) return { ok: false, reason: 'idle' };
  if (engine.seized) return { ok: false, reason: 'seized' };
  const dt = engine.t - engine.lastStrokeAt;
  if (dt < engine.cfg.MIN_STROKE) return { ok: false, reason: 'debounce' };
  engine.lastStrokeAt = engine.t;
  engine.strokeCount += 1;
  // 冲量 + 指数衰减：稳态下 pumpSpeed 约等于实际摇杆次/秒。
  engine.pumpSpeed += 1 / engine.cfg.SPEED_TAU;
  engine.crankAngle = (engine.crankAngle + Math.PI / 3) % (Math.PI * 2);
  engine.flashPump = 0.18;

  const pool = engine.pools[engine.valve];
  if (pool.level >= pool.cap) {
    engine.wrongCount += 1;
    engine.level = clamp(engine.level + engine.cfg.BACKFLOW, 0, 100);
    engine.heat = clamp(engine.heat + engine.cfg.WRONG_HEAT, 0, 100);
    engine.flashWrong = 0.4;
    return { ok: true, routed: false, pool: pool.name };
  }
  pool.level = clamp(pool.level + engine.cfg.VOLUME_PER_STROKE, 0, pool.cap);
  engine.level = clamp(engine.level - engine.cfg.VOLUME_PER_STROKE, 0, 100);
  engine.routedCount += 1;
  return { ok: true, routed: true, pool: pool.name };
}

export function step(engine, dt) {
  if (!engine.running || engine.finished || dt <= 0) return;
  const cfg = engine.cfg;
  engine.t += dt;

  engine.pumpSpeed = Math.max(0, engine.pumpSpeed - (engine.pumpSpeed * dt) / cfg.SPEED_TAU);

  if (engine.seized) {
    engine.seizeTimer -= dt;
    if (engine.seizeTimer <= 0) {
      engine.seized = false;
      // 锁定解除时复位到统一安全温度，便于玩家立刻重新起步。
      engine.heat = cfg.SEIZE_RESET;
    } else {
      engine.heat = clamp(engine.heat - cfg.COOL_RATE * 1.5 * dt, 0, 100);
    }
  } else {
    const pumping = engine.pumpSpeed > 0.15;
    const excess = Math.max(0, engine.pumpSpeed - cfg.SAFE_SPEED);
    const heatRate = pumping
      ? cfg.HEAT_BASE + cfg.HEAT_EXCESS * excess
      : -cfg.COOL_RATE;
    engine.heat = clamp(engine.heat + heatRate * dt, 0, 100);
    if (engine.heat >= cfg.SEIZE_TEMP) {
      engine.seized = true;
      engine.seizeTimer = cfg.SEIZE_COOLDOWN;
      engine.seizureCount += 1;
    }
  }

  // 渗流抬升泵房水位，两个池子缓慢下渗。
  engine.level = clamp(engine.level + cfg.INFLOW * dt, 0, 100);
  for (const pool of engine.pools) {
    pool.level = clamp(pool.level - cfg.POOL_DRAIN * dt, 0, pool.cap);
  }

  engine.flashWrong = Math.max(0, engine.flashWrong - dt);
  engine.flashPump = Math.max(0, engine.flashPump - dt);

  if (engine.level <= cfg.SAFE_LINE) {
    engine.finished = true;
    engine.success = true;
    engine.timeUsed = engine.t;
    engine.running = false;
  } else if (engine.t >= cfg.DURATION) {
    engine.finished = true;
    engine.success = false;
    engine.timeUsed = engine.t;
    engine.running = false;
  }
}
