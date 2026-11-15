export const BIKE_RADIUS = 8;
export const MAX_SPEED = 238;

const TAU = Math.PI * 2;

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function normalizeAngle(angle) {
  let next = angle;
  while (next > Math.PI) next -= TAU;
  while (next < -Math.PI) next += TAU;
  return next;
}

export function createBike(x, y, angle) {
  return {
    x,
    y,
    angle,
    vx: 0,
    vy: 0,
    speed: 0,
    steer: 0,
    inPuddle: false,
    skidding: false,
    slipAngle: 0,
    lastImpact: 0,
    lastPosition: { x, y },
  };
}

export function pointInPuddle(x, y, puddles) {
  for (const puddle of puddles) {
    const dx = x - puddle.x;
    const dy = y - puddle.y;
    const cos = Math.cos(-puddle.rotation);
    const sin = Math.sin(-puddle.rotation);
    const localX = dx * cos - dy * sin;
    const localY = dx * sin + dy * cos;
    if (
      (localX * localX) / (puddle.rx * puddle.rx) +
        (localY * localY) / (puddle.ry * puddle.ry) <=
      1
    ) {
      return puddle;
    }
  }
  return null;
}

function resolveBuildingCollisions(bike, buildings, previousX, previousY, elapsed) {
  let damage = 0;
  let collided = false;

  for (const building of buildings) {
    const left = building.x - BIKE_RADIUS;
    const right = building.x + building.w + BIKE_RADIUS;
    const top = building.y - BIKE_RADIUS;
    const bottom = building.y + building.h + BIKE_RADIUS;
    if (
      bike.x <= left ||
      bike.x >= right ||
      bike.y <= top ||
      bike.y >= bottom
    ) {
      continue;
    }

    const impactSpeed = Math.hypot(bike.vx, bike.vy);
    const penetrations = [
      { value: bike.x - left, axis: "x", target: left, old: previousX },
      { value: right - bike.x, axis: "x", target: right, old: previousX },
      { value: bike.y - top, axis: "y", target: top, old: previousY },
      { value: bottom - bike.y, axis: "y", target: bottom, old: previousY },
    ];
    penetrations.sort((a, b) => a.value - b.value);
    const hit = penetrations[0];

    if (hit.axis === "x") {
      bike.x = hit.target;
      bike.vx *= -0.08;
      bike.vy *= 0.58;
    } else {
      bike.y = hit.target;
      bike.vy *= -0.08;
      bike.vx *= 0.58;
    }

    if (!collided) {
      damage = Math.max(0, impactSpeed - 34) * 0.29;
    }
    collided = true;
    if (impactSpeed > 34 && elapsed - bike.lastImpact > 0.4) {
      bike.lastImpact = elapsed;
    }
  }

  return { collided, damage };
}

export function stepBike(
  bike,
  controls,
  dt,
  { puddles, buildings, world, elapsed = 0 },
) {
  const safeDt = clamp(dt, 0, 0.05);
  const throttle = Boolean(controls.throttle);
  const brake = Boolean(controls.brake);
  const steer = clamp(Number(controls.steer) || 0, -1, 1);
  const puddle = pointInPuddle(bike.x, bike.y, puddles);
  const wet = Boolean(puddle);
  const previousSpeed = Math.hypot(bike.vx, bike.vy);
  const previousX = bike.x;
  const previousY = bike.y;

  bike.steer = steer;
  const speedRatio = clamp(previousSpeed / 170, 0, 1);
  const steeringAuthority = (0.17 + speedRatio * 1.43) * (wet ? 1.24 : 1);
  bike.angle = normalizeAngle(
    bike.angle + steer * steeringAuthority * safeDt,
  );

  const headingX = Math.cos(bike.angle);
  const headingY = Math.sin(bike.angle);

  if (throttle && previousSpeed < MAX_SPEED) {
    const engine = 126 * (wet ? 0.8 : 1) * (1 - previousSpeed / (MAX_SPEED * 1.08));
    bike.vx += headingX * engine * safeDt;
    bike.vy += headingY * engine * safeDt;
  }

  const hardBrake = brake && previousSpeed > 64;
  if (brake) {
    const brakeForce = wet ? 142 : 188;
    const nextSpeed = Math.max(0, previousSpeed - brakeForce * safeDt);
    const scale = previousSpeed > 0 ? nextSpeed / previousSpeed : 0;
    bike.vx *= scale;
    bike.vy *= scale;
  }

  const speedAfterForces = Math.hypot(bike.vx, bike.vy);
  if (speedAfterForces > 0.01) {
    const velocityAngle = Math.atan2(bike.vy, bike.vx);
    const slip = normalizeAngle(bike.angle - velocityAngle);
    let alignmentRate = wet ? (hardBrake ? 0.72 : 1.72) : hardBrake ? 5.6 : 16.5;
    if (throttle && !brake) alignmentRate *= 1.16;
    const alignedAngle =
      velocityAngle + slip * Math.min(1, alignmentRate * safeDt);

    if (wet && brake && previousSpeed > 62) {
      bike.angle = normalizeAngle(
        bike.angle + steer * safeDt * Math.min(1.5, previousSpeed / 140) * 0.3,
      );
    }

    const rollingDrag = (throttle ? 1.8 : 10) * safeDt;
    const nextSpeed = Math.max(0, speedAfterForces - rollingDrag);
    bike.vx = Math.cos(alignedAngle) * nextSpeed;
    bike.vy = Math.sin(alignedAngle) * nextSpeed;
  } else {
    bike.vx = 0;
    bike.vy = 0;
  }

  bike.x += bike.vx * safeDt;
  bike.y += bike.vy * safeDt;

  const collision = resolveBuildingCollisions(
    bike,
    buildings,
    previousX,
    previousY,
    elapsed,
  );

  const margin = BIKE_RADIUS + 5;
  if (bike.x < margin || bike.x > world.width - margin) {
    bike.x = clamp(bike.x, margin, world.width - margin);
    bike.vx *= -0.08;
  }
  if (bike.y < margin || bike.y > world.height - margin) {
    bike.y = clamp(bike.y, margin, world.height - margin);
    bike.vy *= -0.08;
  }

  bike.speed = Math.hypot(bike.vx, bike.vy);
  bike.inPuddle = Boolean(puddle);
  const velocityAngle =
    bike.speed > 0.01 ? Math.atan2(bike.vy, bike.vx) : bike.angle;
  const slipAngle = Math.abs(normalizeAngle(bike.angle - velocityAngle));
  const lateralSpeed = bike.speed * Math.sin(slipAngle);
  bike.slipAngle = slipAngle;
  bike.skidding =
    hardBrake &&
    wet &&
    previousSpeed > 58 &&
    (slipAngle > 0.018 || Math.abs(steer) > 0.12);
  bike.lastPosition.x = previousX;
  bike.lastPosition.y = previousY;

  return {
    wet,
    puddle,
    hardBrake,
    skidding: bike.skidding,
    slipAngle,
    lateralSpeed,
    collisionDamage: collision.damage,
    collided: collision.collided,
    speed: bike.speed,
  };
}
