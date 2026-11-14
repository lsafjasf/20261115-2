// engine.js — 重型布景换景双人协作游戏的确定性物理引擎（浏览器 / Node 共用）
// 纯 ESM，无任何依赖。固定步长积分，可复现。

export const CONFIG = {
  DT: 1 / 60,
  // 布景参数
  ARM_MASS: 120,          // kg，布景主梁质量（重心偏向一端）
  ARM_COM_DIST: 1.1,      // m，无配重时重心相对底座中心的偏心距（正 x 方向）
  ARM_TAIL: -0.6,         // m，布景在底座后方的短端
  ARM_TIP: 3.0,           // m，布景向工作侧伸出的长度
  ARM_HALF_W: 0.45,       // m，布景半宽
  CW_MASS: 70,            // kg，滑动配重
  CW_MIN: -2.6,           // m，配重滑轨范围（相对底座中心）
  CW_MAX: 1.4,
  CW_SPEED: 0.95,         // m/s，右侧玩家配重滑动速度
  // 转动
  TORQUE: 1500,           // N·m，左侧玩家施加的额定扭矩
  INERTIA: 2400,          // kg·m²，整体转动惯量（近似常数）
  DAMPING: 760,           // N·m·s，轴承阻尼
  MAX_OMEGA: 0.85,        // rad/s，机械限速
  // 稳定性
  TILT_LIMIT: 0.95,       // 支撑面允许的最大 |水平重心偏移 / 支撑半径|
  SUPPORT_RADIUS: 1.05,   // m，底座支撑半径
  TILT_GRACE: 0.35,       // s，超限宽限时间，避免瞬时抖动误判
  // 舞台 / 碰撞
  STAGE_R: 4.7,           // m，舞台边界（圆形转台）
  BOUNDARY_HALF_W: 0.35,  // m，边界碰撞环带半宽
  START_THETA: -0.12,     // rad，布景初始角度（略偏，第一次换景也需要转动）
  // 流程
  CUE_LIMIT: 5,           // 五段提示
  CUE_TIME: 20,           // s，每段提示时限
  REQUIRED_SHIFTS: 3,     // 三次换景
  SETTLE_TIME: 0.8,       // s，到位后需稳定停留的时间
  SETTLE_ANGLE: 0.055,    // rad，到位角度容差（约 3.2°）
  SETTLE_OMEGA: 0.06,     // rad/s，到位角速度容差
};

export const ACTORS = [
  // 舞台上的演员（固定位置，米）
  { x: 1.5, y: 2.6, r: 0.55 },
  { x: -1.5, y: 2.6, r: 0.55 },
];

// 舞台台柱：靠近边界的固定障碍（碰到按 boundary 类失败处理）
export const POSTS = [{ x: 0, y: 3.0, r: 0.5 }];

// 三次换景的目标角度（rad）。均避开碰撞区，玩家可选择旋转方向。
export const SCENES = [
  { name: '宫廷厅堂', angle: 0 },
  // 目标均落在与碰撞带相对的安全弧内，换景时必须选对旋转方向绕行
  { name: '森林小径', angle: 2.62 },        // ≈150°，需顺时针长距绕行
  { name: '月下湖畔', angle: -2.09 },       // ≈-120°
];

const TAU = Math.PI * 2;

export function wrapAngle(a) {
  while (a > Math.PI) a -= TAU;
  while (a <= -Math.PI) a += TAU;
  return a;
}

// 布景局部坐标（x 沿主梁，向工作侧为正）-> 世界坐标
export function localToWorld(lx, ly, theta, cx, cy) {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  return { x: cx + lx * c - ly * s, y: cy + lx * s + ly * c };
}

// 当前系统质心相对底座中心的局部坐标
export function comLocal(state) {
  const { armMass, armCom, cwMass } = state.params;
  const total = armMass + cwMass;
  const x = (armMass * armCom + cwMass * state.cw) / total;
  return { x, y: 0 };
}

// 质心世界坐标（相对舞台中心）
export function comWorld(state) {
  const p = comLocal(state);
  return localToWorld(p.x, p.y, state.theta, 0, 0);
}

// 倾斜指标：质心相对底座中心的水平偏移 / 支撑半径（>=1 即失稳）
export function tiltMetric(state) {
  return Math.abs(comLocal(state).x) / state.params.supportR;
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

// 碰撞检测：布景矩形 vs 演员圆形、布景四角 vs 舞台边界环带
export function checkCollisions(state) {
  const { armTail, armTip, armHalfW: hw, stageR, boundaryHalfW: bw } = state.params;
  const corners = [
    localToWorld(armTip, hw, state.theta, 0, 0),
    localToWorld(armTip, -hw, state.theta, 0, 0),
    localToWorld(armTail, hw, state.theta, 0, 0),
    localToWorld(armTail, -hw, state.theta, 0, 0),
  ];
  for (const corner of corners) {
    const radial = Math.hypot(corner.x, corner.y);
    if (radial > stageR - bw) {
      return { hit: true, reason: 'boundary', x: corner.x, y: corner.y, radial };
    }
  }
  // 圆形障碍（演员 + 台柱）与布景矩形的碰撞，统一用局部坐标最近点判定
  const c = Math.cos(-state.theta);
  const s = Math.sin(-state.theta);
  const circles = [
    ...ACTORS.map((o) => ({ ...o, kind: 'actor' })),
    ...POSTS.map((o) => ({ ...o, kind: 'boundary' })),
  ];
  for (const obstacle of circles) {
    const lx = obstacle.x * c - obstacle.y * s;
    const ly = obstacle.x * s + obstacle.y * c;
    const nx = clamp(lx, armTail, armTip);
    const ny = clamp(ly, -hw, hw);
    const d = Math.hypot(lx - nx, ly - ny);
    if (d < obstacle.r) {
      return {
        hit: true,
        reason: obstacle.kind === 'actor' ? 'collision-actor' : 'collision-boundary',
        x: obstacle.x,
        y: obstacle.y,
      };
    }
  }
  return { hit: false };
}

export function createState() {
  return {
    theta: CONFIG.START_THETA,
    omega: 0,
    cw: 0,
    time: 0,
    status: 'running',
    failReason: null,
    sceneIndex: 0,          // 已完成的换景数
    cue: { number: 1, elapsed: 0 },
    settle: 0,
    tiltOverTime: 0,
    lastCollision: null,
    events: [],
    params: {
      armMass: CONFIG.ARM_MASS,
      armCom: CONFIG.ARM_COM_DIST,
      cwMass: CONFIG.CW_MASS,
      armTail: CONFIG.ARM_TAIL,
      armTip: CONFIG.ARM_TIP,
      armHalfW: CONFIG.ARM_HALF_W,
      supportR: CONFIG.SUPPORT_RADIUS,
      stageR: CONFIG.STAGE_R,
      boundaryHalfW: CONFIG.BOUNDARY_HALF_W,
    },
  };
}

// input: { torqueDir: -1|0|1, cwDir: -1|0|1 }
export function step(state, input, dt = CONFIG.DT) {
  if (state.status !== 'running') return state;
  const p = state.params;
  state.time += dt;

  // 右侧玩家：配重沿滑轨移动
  state.cw = clamp(
    state.cw + (input.cwDir || 0) * CONFIG.CW_SPEED * dt,
    CONFIG.CW_MIN,
    CONFIG.CW_MAX,
  );

  // 左侧玩家：扭矩驱动底座，含轴承阻尼与机械限速
  const accel =
    ((input.torqueDir || 0) * CONFIG.TORQUE - CONFIG.DAMPING * state.omega) /
    CONFIG.INERTIA;
  state.omega = clamp(state.omega + accel * dt, -CONFIG.MAX_OMEGA, CONFIG.MAX_OMEGA);
  state.theta = wrapAngle(state.theta + state.omega * dt);

  // 碰撞判定（撞到演员或边界即失败）
  const collision = checkCollisions(state);
  if (collision.hit) {
    state.status = 'failed';
    state.failReason = collision.reason;
    state.lastCollision = collision;
    state.events.push({ t: state.time, type: 'fail', reason: state.failReason });
    return state;
  }

  // 倾斜判定：超出支撑面并持续宽限时间才判定失稳
  const tilt = tiltMetric(state);
  state.tiltOverTime = tilt > CONFIG.TILT_LIMIT ? state.tiltOverTime + dt : 0;
  if (state.tiltOverTime >= CONFIG.TILT_GRACE) {
    state.status = 'failed';
    state.failReason = 'tilt';
    state.events.push({ t: state.time, type: 'fail', reason: 'tilt', tilt });
    return state;
  }

  // 到位判定：角度与角速度同时进入容差并保持 SETTLE_TIME
  const target = SCENES[state.sceneIndex].angle;
  const err = Math.abs(wrapAngle(state.theta - target));
  if (err < CONFIG.SETTLE_ANGLE && Math.abs(state.omega) < CONFIG.SETTLE_OMEGA) {
    state.settle += dt;
  } else {
    state.settle = 0;
  }
  if (state.settle >= CONFIG.SETTLE_TIME) {
    state.events.push({
      t: state.time,
      type: 'shift',
      scene: state.sceneIndex,
      cue: state.cue.number,
    });
    state.sceneIndex += 1;
    state.settle = 0;
    if (state.sceneIndex >= CONFIG.REQUIRED_SHIFTS) {
      state.status = 'won';
      state.events.push({ t: state.time, type: 'win', cues: state.cue.number });
      return state;
    }
    state.cue.number += 1;
    state.cue.elapsed = 0;
    return state;
  }

  // 提示倒计时：超时消耗一段提示，同场景重试
  state.cue.elapsed += dt;
  if (state.cue.elapsed >= CONFIG.CUE_TIME) {
    if (state.cue.number >= CONFIG.CUE_LIMIT) {
      state.status = 'failed';
      state.failReason = 'timeout';
      state.events.push({ t: state.time, type: 'fail', reason: 'timeout' });
      return state;
    }
    state.events.push({ t: state.time, type: 'cue-timeout', cue: state.cue.number });
    state.cue.number += 1;
    state.cue.elapsed = 0;
  }
  return state;
}
