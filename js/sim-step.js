import {
  WORLD_W, WORLD_H, FIXED_DT, CABLE_REST, CABLE_K, CABLE_BREAK,
  DOCK_RADIUS, currentAt, windAt, segmentCircleHit, clamp, dist, wrapAngle,
  TUNING,
} from './sim.js';

const ATTACH_RANGE = 58;

function emit(world, type, detail = {}) {
  world.events.push({ type, t: world.time, ...detail });
}

// 玩家按 E：靠近未归位浮标时挂缆；已挂缆时摘缆
export function tryAttach(world) {
  const { boat, cable } = world;
  if (cable.broken) return false;
  if (cable.attached) {
    cable.attached = false;
    cable.buoyId = null;
    cable.tension = 0;
    cable.snag = null;
    boat.towId = null;
    emit(world, 'detach');
    return true;
  }
  let best = -1;
  let bestD = ATTACH_RANGE;
  for (const b of world.buoys) {
    if (b.docked) continue;
    const d = dist(boat.x, boat.y, b.x, b.y);
    if (d < bestD) {
      bestD = d;
      best = b.id;
    }
  }
  if (best >= 0) {
    cable.attached = true;
    cable.buoyId = best;
    cable.tension = 0;
    boat.towId = best;
    emit(world, 'attach', { buoyId: best });
    return true;
  }
  return false;
}

function detectSnag(world) {
  const { cable, boat } = world;
  if (!cable.attached || cable.snag || cable.snagCooldown > 0) return;
  const buoy = world.buoys[cable.buoyId];
  for (const s of world.shallows) {
    const hit = segmentCircleHit(boat.x, boat.y, buoy.x, buoy.y, s);
    if (hit) {
      cable.snag = { x: hit.x, y: hit.y, shallow: s };
      cable.snagCooldown = 0;
      world.stats.snags += 1;
      emit(world, 'snag', { x: hit.x, y: hit.y });
      return;
    }
  }
}

// 计算缆绳张力以及对船、浮标的拉力（挂底时路径经过挂点弯折）
function cableForces(world, wind) {
  const { cable, boat } = world;
  const buoy = world.buoys[cable.buoyId];
  let tension = 0;
  let boatPull = { x: 0, y: 0 };
  let buoyPull = { x: 0, y: 0 };

  if (cable.snag) {
    const p = cable.snag;
    const l1 = Math.max(dist(boat.x, boat.y, p.x, p.y), 0.001);
    const l2 = Math.max(dist(p.x, p.y, buoy.x, buoy.y), 0.001);
    const u1 = { x: (p.x - boat.x) / l1, y: (p.y - boat.y) / l1 };
    const u2 = { x: (buoy.x - p.x) / l2, y: (buoy.y - p.y) / l2 };
    const length = l1 + l2;
    const rate = -(boat.vx * u1.x + boat.vy * u1.y)
      + (buoy.vx * u2.x + buoy.vy * u2.y);
    if (length > CABLE_REST) {
      tension = CABLE_K * (length - CABLE_REST) + clamp(rate, -400, 400) * 0.35;
    }
    tension = Math.max(0, tension);
    boatPull = { x: tension * u1.x, y: tension * u1.y };
    buoyPull = { x: -tension * u2.x, y: -tension * u2.y };
    // 船倒出浅滩且绳段松弛 -> 挂点失效；冷却帧防止同一边界反复挂住
    const outside = dist(boat.x, boat.y, p.shallow.x, p.shallow.y) > p.shallow.r + 6;
    if ((outside && l1 <= 30) || length <= CABLE_REST * 0.985) {
      cable.snag = null;
      cable.snagCooldown = 45;
      emit(world, 'unsnag');
    }
  } else {
    const length = Math.max(dist(boat.x, boat.y, buoy.x, buoy.y), 0.001);
    const u = { x: (buoy.x - boat.x) / length, y: (buoy.y - boat.y) / length };
    const rate = (buoy.vx - boat.vx) * u.x + (buoy.vy - boat.vy) * u.y;
    if (length > CABLE_REST) {
      tension = CABLE_K * (length - CABLE_REST) + clamp(rate, -400, 400) * 0.35;
    }
    tension = Math.max(0, tension);
    boatPull = { x: tension * u.x, y: tension * u.y };
    buoyPull = { x: -tension * u.x, y: -tension * u.y };
  }

  cable.tension = tension;
  if (tension > CABLE_BREAK) {
    cable.broken = true;
    cable.attached = false;
    cable.snag = null;
    cable.tension = 0;
    boat.towId = null;
    world.stats.breaks += 1;
    world.status = 'lost';
    emit(world, 'break', { tension });
    return { boatPull: { x: 0, y: 0 }, buoyPull: { x: 0, y: 0 } };
  }
  return { boatPull, buoyPull };
}

export function stepWorld(world, input = {}) {
  if (world.status !== 'playing') return world;
  const dt = FIXED_DT;
  world.time += dt;
  world.events = [];
  const { boat, cable } = world;
  const throttle = clamp(input.throttle || 0, -1, 1);
  const steer = clamp(input.steer || 0, -1, 1);
  boat.throttle = throttle;
  boat.steer = steer;
  if (input.attachPressed) tryAttach(world);

  const wind = windAt(world, world.time);
  if (cable.snagCooldown > 0) cable.snagCooldown -= 1;
  detectSnag(world);
  const pulls = cable.attached
    ? cableForces(world, wind)
    : { boatPull: { x: 0, y: 0 }, buoyPull: { x: 0, y: 0 } };

  // 回收艇：推进 + 横风漂移 + 缆绳拉力 + 水阻
  const speed = Math.hypot(boat.vx, boat.vy);
  boat.angle += steer * (1.05 + speed / 260) * 1.9 * dt;
  const thrust = TUNING.BOAT_THRUST * throttle;
  let fx = Math.cos(boat.angle) * thrust + wind.x * (TUNING.WIND_BOAT / 60) + pulls.boatPull.x;
  let fy = Math.sin(boat.angle) * thrust + wind.y * (TUNING.WIND_BOAT / 60) + pulls.boatPull.y;
  boat.vx += fx * dt;
  boat.vy += fy * dt;
  const dragB = Math.exp(-TUNING.BOAT_DRAG * dt);
  boat.vx *= dragB;
  boat.vy *= dragB;
  const sp = Math.hypot(boat.vx, boat.vy);
  if (sp > TUNING.BOAT_MAXSPEED) {
    boat.vx *= TUNING.BOAT_MAXSPEED / sp;
    boat.vy *= TUNING.BOAT_MAXSPEED / sp;
  }
  boat.x = clamp(boat.x + boat.vx * dt, 18, WORLD_W - 18);
  boat.y = clamp(boat.y + boat.vy * dt, 18, WORLD_H - 18);

  // 浮标：洋流漂移 + 风 + 缆绳拉力
  for (const b of world.buoys) {
    if (b.docked) continue;
    const cur = currentAt(world, b.x, b.y);
    let bx = cur.x * 1.7 + wind.x * (TUNING.WIND_BUOY / 60);
    let by = cur.y * 1.7 + wind.y * (TUNING.WIND_BUOY / 60);
    if (cable.attached && cable.buoyId === b.id) {
      bx += pulls.buoyPull.x;
      by += pulls.buoyPull.y;
    }
    b.vx += bx * dt;
    b.vy += by * dt;
    const drag = Math.exp(-TUNING.BUOY_DRAG * dt);
    b.vx *= drag;
    b.vy *= drag;
    b.x = clamp(b.x + b.vx * dt, 10, WORLD_W - 10);
    b.y = clamp(b.y + b.vy * dt, 10, WORLD_H - 10);
  }

  // 归位判定
  if (cable.attached) {
    const b = world.buoys[cable.buoyId];
    const a = world.anchors[b.id];
    if (dist(b.x, b.y, a.x, a.y) <= DOCK_RADIUS) {
      b.docked = true;
      b.vx = 0;
      b.vy = 0;
      b.x = a.x;
      b.y = a.y;
      cable.attached = false;
      cable.buoyId = null;
      cable.snag = null;
      cable.tension = 0;
      boat.towId = null;
      world.stats.docked += 1;
      emit(world, 'dock', { buoyId: b.id });
      if (world.buoys.every((x) => x.docked)) {
        world.status = 'won';
        emit(world, 'win');
      }
    }
  }
  return world;
}
