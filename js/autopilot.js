// autopilot.js — 自动驾驶器：模拟左右两名玩家的协作操作
// 策略：右侧玩家先把配重移到平衡位（系统质心≈底座中心，防止倾斜），
// 左侧玩家按最短安全方向转动，并在碰撞区前减速停车。

import { CONFIG, SCENES, checkCollisions, wrapAngle } from './engine.js';

const TAU = Math.PI * 2;
const SAMPLE_COUNT = 720;
const STEP_ANGLE = TAU / SAMPLE_COUNT;

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

// 预扫描全部角度，得到碰撞禁入角度带（按 theta 采样，自动合并首尾环绕）
export function buildForbiddenBands(params) {
  const probe = {
    theta: 0,
    params,
  };
  const blocked = [];
  for (let i = 0; i < SAMPLE_COUNT; i += 1) {
    probe.theta = i * STEP_ANGLE;
    blocked[i] = checkCollisions(probe).hit;
  }
  if (blocked.every(Boolean)) {
    return [{ startIdx: 0, endIdx: SAMPLE_COUNT }];
  }
  // 以一个空闲采样点为扫描起点，消除 0° 环绕导致的碎片带
  const offset = blocked.findIndex((b) => !b);
  const rotated = blocked.slice(offset).concat(blocked.slice(0, offset));
  const bands = [];
  let start = -1;
  for (let i = 0; i < SAMPLE_COUNT; i += 1) {
    if (rotated[i] && start < 0) start = i;
    if (!rotated[i] && start >= 0) {
      bands.push({ startIdx: start, endIdx: i });
      start = -1;
    }
  }
  if (start >= 0) bands.push({ startIdx: start, endIdx: SAMPLE_COUNT });
  return bands.map((band) => ({
    startIdx: (band.startIdx + offset) % SAMPLE_COUNT,
    endIdx: (band.endIdx + offset) % SAMPLE_COUNT,
  }));
}

export class Autopilot {
  constructor(state, opts = {}) {
    this.bands = buildForbiddenBands(state.params);
    this.margin = opts.margin ?? 0.07;          // 距碰撞带边缘的安全余量（rad）
    this.cwTolerance = opts.cwTolerance ?? 0.06;
    this.routeDir = 0;                          // 当前换景选定的旋转方向
    this.routeScene = -1;
    // 平衡位：让 armMass*armCom + cwMass*cw ≈ 0
    this.cwTarget = clamp(
      -(state.params.armMass * state.params.armCom) / state.params.cwMass,
      CONFIG.CW_MIN,
      CONFIG.CW_MAX,
    );
  }

  // 沿 dir(+1/-1) 方向，当前 theta 到最近碰撞带安全边缘的角距离
  distanceToDanger(state, dir) {
    const idx = Math.floor(((state.theta + TAU) % TAU) / STEP_ANGLE);
    let best = Infinity;
    for (const band of this.bands) {
      const edgeIdx = dir > 0 ? band.startIdx : band.endIdx;
      let delta = dir * (edgeIdx - idx);
      if (dir > 0 && delta <= 0) delta += SAMPLE_COUNT;
      if (dir < 0 && delta >= 0) delta -= SAMPLE_COUNT;
      const dist = Math.abs(delta) * STEP_ANGLE - this.margin;
      best = Math.min(best, dist);
    }
    return best;
  }

  // 沿 dir 方向旋转到 target 的扫掠弧内是否会进入碰撞带
  pathIsClear(state, target, dir) {
    const dist = dir > 0
      ? ((target - state.theta + TAU) % TAU)
      : ((state.theta - target + TAU) % TAU);
    return this.distanceToDanger(state, dir) > dist;
  }

  // 为当前换景选择无碰撞的较短方向，结果缓存到场景切换
  chooseDirection(state) {
    if (this.routeScene === state.sceneIndex && this.routeDir !== 0) {
      return this.routeDir;
    }
    const target = SCENES[state.sceneIndex].angle;
    const err = wrapAngle(target - state.theta);
    const shortDir = err >= 0 ? 1 : -1;
    const longDir = -shortDir;
    const shortDist = Math.abs(err);
    const longDist = TAU - shortDist;
    const dir = this.pathIsClear(state, target, shortDir) ? shortDir : longDir;
    this.routeDir = dir;
    this.routeScene = state.sceneIndex;
    return dir;
  }

  // 计算本帧的双人输入
  computeInput(state) {
    // 右侧玩家：配重滑动（bang-bang + 死区）
    const cwError = this.cwTarget - state.cw;
    const cwDir =
      Math.abs(cwError) > this.cwTolerance ? Math.sign(cwError) : 0;

    const target = SCENES[state.sceneIndex].angle;
    const dir = this.chooseDirection(state);
    // 沿选定方向的有符号剩余角度（始终与 dir 同号，趋近 0）
    const rawErr = wrapAngle(target - state.theta);
    const err = dir > 0
      ? (rawErr >= 0 ? rawErr : rawErr + TAU)
      : (rawErr <= 0 ? rawErr : rawErr - TAU);

    // 碰撞感知限速：危险距离越近，允许的角速度越低
    const danger = this.distanceToDanger(state, dir);
    const safetyOmega = Math.sqrt(Math.max(0, 2 * 1.1 * danger));

    // PD 控制 + 安全限速
    const kp = 2.6;
    const kd = 3.4;
    let desiredOmega = clamp(
      kp * err - kd * state.omega,
      -CONFIG.MAX_OMEGA,
      CONFIG.MAX_OMEGA,
    );
    desiredOmega = clamp(desiredOmega, -safetyOmega, safetyOmega);

    let torqueDir = 0;
    const omegaError = desiredOmega - state.omega;
    if (Math.abs(omegaError) > 0.02) torqueDir = Math.sign(omegaError);

    // 已到位且几乎停稳时不再输出扭矩，交给 settle 判定
    if (Math.abs(err) < CONFIG.SETTLE_ANGLE && Math.abs(state.omega) < CONFIG.SETTLE_OMEGA) {
      torqueDir = 0;
    }
    return { torqueDir, cwDir };
  }
}
