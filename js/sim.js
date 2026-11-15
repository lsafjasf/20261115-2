import { mulberry32, clamp, dist, wrapAngle } from './rng.js';

export const WORLD_W = 1200;
export const WORLD_H = 720;
export const FIXED_DT = 1 / 60;

export const CABLE_REST = 92;       // 缆绳松弛长度（米/像素）
export const CABLE_K = 5.4;         // 张紧后的弹性系数
export const CABLE_BREAK = 1050;    // 断缆张力阈值（正常拖带约 400-750）
export const DOCK_RADIUS = 30;      // 浮标归位半径

const BOAT_THRUST = 620;
const BOAT_DRAG = 0.55;
const BOAT_MAXSPEED = 235;
const BUOY_DRAG = 1.15;
const WIND_BOAT = 34;               // 横风对船的加速度系数
const WIND_BUOY = 14;

// 固定 seed 生成世界：锚位、浅滩、洋流、风、风迹全部由 rng 决定
export function createWorld(seed = 20261115) {
  const rng = mulberry32(seed);
  const anchors = [
    { x: 190 + rng() * 90, y: 170 + rng() * 70 },
    { x: 170 + rng() * 90, y: 380 + rng() * 70 },
    { x: 210 + rng() * 90, y: 570 + rng() * 70 },
  ];
  const buoys = [
    { x: 880 + rng() * 160, y: 110 + rng() * 80 },
    { x: 960 + rng() * 120, y: 330 + rng() * 90 },
    { x: 860 + rng() * 160, y: 560 + rng() * 90 },
  ].map((p, i) => ({
    ...p,
    vx: 0,
    vy: 0,
    id: i,
    docked: false,
  }));
  const shallows = [
    { x: 520 + rng() * 80, y: 200 + rng() * 120, r: 62 + rng() * 18 },
    { x: 560 + rng() * 90, y: 470 + rng() * 90, r: 58 + rng() * 22 },
    { x: 700 + rng() * 70, y: 340 + rng() * 80, r: 44 + rng() * 16 },
  ];
  const current = {
    cx: 200 + rng() * 800,
    cy: 120 + rng() * 480,
    strength: 15 + rng() * 12,
    wx: 260 + rng() * 260,
    wy: 220 + rng() * 260,
  };
  const wind = {
    base: 34 + rng() * 16,
    dir: -0.5 + rng() * 1.0,
    gust: 16 + rng() * 14,
    period: 7 + rng() * 6,
    phase: rng() * Math.PI * 2,
  };
  const streaks = [];
  for (let i = 0; i < 46; i += 1) {
    streaks.push({
      x: rng() * WORLD_W,
      y: rng() * WORLD_H,
      len: 26 + rng() * 46,
      drift: rng() * 2,
    });
  }
  return {
    seed,
    rng,
    time: 0,
    status: 'playing', // playing | won | lost
    events: [],
    boat: {
      x: WORLD_W / 2,
      y: WORLD_H + 90,
      vx: 0,
      vy: 0,
      angle: -Math.PI / 2,
      throttle: 0,
      steer: 0,
      towId: null,
    },
    buoys,
    anchors,
    shallows,
    cable: {
      attached: false,
      buoyId: null,
      tension: 0,
      snag: null,
      snagCooldown: 0,
      broken: false,
    },
    current,
    wind,
    streaks,
    stats: { breaks: 0, snags: 0, docked: 0 },
  };
}

// 湖底涡旋式洋流，决定未拖带浮标的漂移
export function currentAt(world, x, y) {
  const c = world.current;
  const dx = x - c.cx;
  const dy = y - c.cy;
  const d = Math.hypot(dx, dy) + 60;
  const swirl = c.strength * 90 / d;
  const vx = (-dy / d) * swirl + (dx / d) * c.strength * 0.35;
  const vy = (dx / d) * swirl + (dy / d) * c.strength * 0.35;
  const wx2 = Math.cos(x / c.wx + y / c.wy) * c.strength * 0.4;
  const wy2 = Math.sin(y / c.wy - x / c.wx) * c.strength * 0.4;
  return { x: vx + wx2, y: vy + wy2 };
}

// 横风：带阵风的恒定侧向力
export function windAt(world, t) {
  const w = world.wind;
  const gust = 1 + Math.sin(t * (Math.PI * 2 / w.period) + w.phase) * 0.5
    + Math.sin(t * 1.73 + w.phase * 2) * 0.18;
  const speed = w.base + w.gust * gust;
  return {
    x: Math.cos(w.dir) * speed,
    y: Math.sin(w.dir) * speed,
    speed: clamp(speed, 0, 120),
  };
}

// 线段与圆的交点，返回离线段起点最近的交点
export function segmentCircleHit(x1, y1, x2, y2, circle) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const fx = x1 - circle.x;
  const fy = y1 - circle.y;
  const a = dx * dx + dy * dy;
  const b = 2 * (fx * dx + fy * dy);
  const cc = fx * fx + fy * fy - circle.r * circle.r;
  let disc = b * b - 4 * a * cc;
  if (disc < 0 || a === 0) return null;
  disc = Math.sqrt(disc);
  const t1 = (-b - disc) / (2 * a);
  const t2 = (-b + disc) / (2 * a);
  const t = t1 >= 0 && t1 <= 1 ? t1 : (t2 >= 0 && t2 <= 1 ? t2 : null);
  if (t === null) return null;
  return { x: x1 + dx * t, y: y1 + dy * t, t };
}

export function cablePath(world) {
  const { cable, boat } = world;
  if (!cable.attached || cable.broken) return null;
  const buoy = world.buoys[cable.buoyId];
  const end = cable.snag ? cable.snag : buoy;
  return {
    boat: { x: boat.x, y: boat.y },
    bend: cable.snag ? { x: cable.snag.x, y: cable.snag.y } : null,
    end: { x: end.x, y: end.y },
    tension: cable.tension,
  };
}

export const TUNING = {
  BOAT_THRUST,
  BOAT_DRAG,
  BOAT_MAXSPEED,
  BUOY_DRAG,
  WIND_BOAT,
  WIND_BUOY,
};

export { clamp, dist, wrapAngle };
