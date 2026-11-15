import {
  WORLD_W, WORLD_H, DOCK_RADIUS, segmentCircleHit, clamp, dist, wrapAngle,
} from './sim.js';

const MARGIN = 26;

// 绕开浅滩：若直线路径穿入浅滩，沿圆心垂直方向选一条绕行点
function avoidPoint(world, tx, ty) {
  const { boat, shallows } = world;
  let target = { x: tx, y: ty };
  for (const s of shallows) {
    const hit = segmentCircleHit(boat.x, boat.y, target.x, target.y, s);
    if (!hit) continue;
    const dx = target.x - boat.x;
    const dy = target.y - boat.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const side = nx * (s.x - boat.x) + ny * (s.y - boat.y) >= 0 ? 1 : -1;
    target = {
      // 绕行点取在圆外，沿垂直于航线的方向偏出半径 + 余量
      x: s.x + nx * side * (s.r + MARGIN * 2),
      y: s.y + ny * side * (s.r + MARGIN * 2),
    };
  }
  return target;
}

function steerTo(boat, tx, ty) {
  const desired = Math.atan2(ty - boat.y, tx - boat.x);
  const err = wrapAngle(desired - boat.angle);
  const steer = clamp(err * 2.2, -1, 1);
  const speed = Math.hypot(boat.vx, boat.vy);
  let throttle = 1;
  if (Math.abs(err) > 1.25 && speed > 120) throttle = 0.25;
  else if (Math.abs(err) > 0.9) throttle = 0.55;
  return { steer, throttle };
}

// 自动回收控制器：追浮标 -> 挂缆 -> 拖回锚位；挂底时回退解缆
export function autopilotInput(world) {
  const { boat, cable } = world;
  const out = { throttle: 0, steer: 0, attachPressed: false };
  if (world.status !== 'playing') return out;

  if (cable.snag) {
    const p = cable.snag;
    // 船头指向“远离挂点”的方向，然后倒车退离浅滩
    const desired = Math.atan2(boat.y - p.y, boat.x - p.x);
    out.steer = clamp(wrapAngle(desired - boat.angle) * 2.2, -1, 1);
    out.throttle = -0.9; // 倒车退出浅滩，让船侧绳段松弛
    return out;
  }

  if (cable.attached) {
    const b = world.buoys[cable.buoyId];
    const a = world.anchors[b.id];
    const d = dist(b.x, b.y, a.x, a.y);
    if (d <= DOCK_RADIUS + 10) {
      out.throttle = 0.15;
      out.steer = 0;
      return out;
    }
    // 瞄准锚位略前方，让浮标被带进入口
    const ux = (a.x - b.x) / d;
    const uy = (a.y - b.y) / d;
    // 绕行以浮标（缆绳末端）为基准，保证整根缆绳绕开浅滩
    const aim = avoidPointFrom(world, b, a.x + ux * 24, a.y + uy * 24);
    const control = steerTo(boat, aim.x, aim.y);
    // 高张力时收油，保护缆绳
    if (cable.tension > 820) control.throttle = Math.min(control.throttle, 0.25);
    return control;
  }

  const target = world.buoys
    .filter((b) => !b.docked)
    .sort((p, q) => dist(boat.x, boat.y, p.x, p.y) - dist(boat.x, boat.y, q.x, q.y))[0];
  if (!target) return out;
  const d = dist(boat.x, boat.y, target.x, target.y);
  if (d < 56) {
    out.attachPressed = true;
    out.throttle = 0;
    return out;
  }
  const aim = avoidPoint(world, target.x, target.y);
  return steerTo(boat, aim.x, aim.y);
}

// 从缆绳末端（浮标）位置出发规划绕行点
function avoidPointFrom(world, from, tx, ty) {
  const { shallows } = world;
  let target = { x: tx, y: ty };
  for (const s of shallows) {
    const hit = segmentCircleHit(from.x, from.y, target.x, target.y, s);
    if (!hit) continue;
    const dx = target.x - from.x;
    const dy = target.y - from.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const side = nx * (s.x - from.x) + ny * (s.y - from.y) >= 0 ? 1 : -1;
    target = {
      x: s.x + nx * side * (s.r + MARGIN * 2),
      y: s.y + ny * side * (s.r + MARGIN * 2),
    };
  }
  return target;
}

export function runTicks(world, ticks, inputFn) {
  for (let i = 0; i < ticks; i += 1) {
    const input = inputFn(world);
    // 动态 import 由入口注入会有循环依赖，这里通过 world 所在包的步进函数处理
    if (world.status !== 'playing') break;
    stepRef(world, input);
  }
  return world;
}

import { stepWorld as stepRef } from './sim-step.js';

export { WORLD_W, WORLD_H };
