// 世界模型：固定 seed 生成三个声源的位置、发生顺序与声学环境参数
// 坐标系：x 沿湖岸（右为正），y 指向湖面（正=前方=水上，负=后方=岸上）
// 监听点位于湖岸线 y=0 上，只能沿 x 移动。
import { mulberry32 } from './rng.js';

export const FIXED_SEED = 20261115;

export const SOURCE_TYPES = [
  { id: 'reed', label: '芦苇' },
  { id: 'shoal', label: '浅滩' },
  { id: 'dock', label: '码头' },
];

export const DIRECTIONS = [
  { id: 'fl', label: '左前（水面一侧）' },
  { id: 'fr', label: '右前（水面一侧）' },
  { id: 'bl', label: '左后（岸一侧）' },
  { id: 'br', label: '右后（岸一侧）' },
];

export const WORLD = {
  listenerMinX: -40,
  listenerMaxX: 40,
  startListenerX: 0,
  maxAudibleDistance: 120,
  baseSpeed: 343, // 声速 m/s，用于水面反射延迟换算
};

function sourceRegions() {
  // 每个类型对应的地理区域（米）
  return {
    reed: { x: [-55, -18], y: [10, 32] },
    shoal: { x: [12, 52], y: [14, 36] },
    dock: { x: [-38, 38], y: [-26, -10] },
  };
}

function pickRegionPoint(region, random) {
  return {
    x: region.x[0] + random() * (region.x[1] - region.x[0]),
    y: region.y[0] + random() * (region.y[1] - region.y[0]),
  };
}

export function buildWorld(seed = FIXED_SEED) {
  // 三路独立随机流，保证各维度互不干扰且可复现
  const rndPosition = mulberry32(seed ^ 0x9e3779b9);
  const rndOrder = mulberry32(seed ^ 0x85ebca6b);
  const rndSound = mulberry32(seed ^ 0xc2b2ae35);

  const regions = sourceRegions();
  const sources = SOURCE_TYPES.map((type) => {
    const p = pickRegionPoint(regions[type.id], rndPosition);
    return {
      id: type.id,
      label: type.label,
      x: p.x,
      y: p.y,
      seed: (rndSound() * 0xffffffff) >>> 0,
    };
  });

  // 发生顺序：固定 seed 下的确定性乱序，onset 间隔明显便于盲听
  const orderRolls = sources.map((s) => ({ id: s.id, roll: rndOrder() }));
  orderRolls.sort((a, b) => a.roll - b.roll);
  const onsetByType = {};
  orderRolls.forEach((item, index) => {
    onsetByType[item.id] = 1.2 + index * 2.4; // 1.2s / 3.6s / 6.0s
  });
  sources.forEach((s) => {
    s.onset = onsetByType[s.id];
  });

  return {
    seed,
    sources,
    order: orderRolls.map((o) => o.id),
    listener: { x: WORLD.startListenerX, y: 0 },
  };
}

export function relativeGeometry(source, listener) {
  const dx = source.x - listener.x;
  const dy = source.y - listener.y;
  const distance = Math.hypot(dx, dy);
  const azimuth = Math.atan2(dx, dy); // 0=正前，正值偏右，范围 -PI..PI
  const behind = dy < 0;
  const directionId = (behind ? 'b' : 'f') + (dx >= 0 ? 'r' : 'l');
  return { dx, dy, distance, azimuth, behind, directionId };
}

// 风对远处声音的掩盖：距离越远风噪遮蔽越强（返回直达声额外衰减 dB）
export function windMaskDb(distance) {
  const t = Math.max(0, Math.min(1, distance / WORLD.maxAudibleDistance));
  return -14 * t * t;
}

// 水面反射：反射路径比直达长，产生与距离相关的延迟（秒）与衰减
export function reflectionPath(source, listener) {
  // 风格化镜像模型：声源与监听点都高出水面若干米，
  // 反射声沿“镜像声源→监听点”传播，路径更长，产生可闻延迟。
  const direct = Math.hypot(source.x - listener.x, source.y - listener.y);
  const earHeight = 6;
  const sourceHeight = source.y < 0 ? 1.5 : 3;
  const reflectedDistance = Math.hypot(direct, earHeight + sourceHeight);
  const delay = Math.max(0, reflectedDistance - direct) / WORLD.baseSpeed;
  return { reflectedDistance, delay, strength: source.y < 0 ? 0.1 : 0.3 };
}
