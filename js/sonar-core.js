export const SURVEY_SPEC = {
  rangeMax: 48,
  beamHalfDeg: 12,
  pingLimit: 24,
  baseDelay: 0.12,
  metersPerSecond: 34,
  plotTolerance: 4.2,
  listenerLimit: 11,
  moveSpeed: 5.2
};

const TARGET_BLUEPRINT = [
  { id: "obs-1", kind: "obstacle", name: "OBSTACLE I", bearing: 17, range: 18 },
  { id: "obs-2", kind: "obstacle", name: "OBSTACLE II", bearing: 196, range: 27 },
  { id: "obs-3", kind: "obstacle", name: "OBSTACLE III", bearing: 288, range: 32 },
  { id: "beacon", kind: "beacon", name: "ACOUSTIC BEACON", bearing: 111, range: 30 }
];

export function normalizeDeg(value) {
  return ((value % 360) + 360) % 360;
}

export function signedAngleDelta(targetBearing, emissionAngle) {
  return ((normalizeDeg(targetBearing - emissionAngle) + 180) % 360) - 180;
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function polarToCartesian(bearingDeg, range) {
  const radians = bearingDeg * Math.PI / 180;
  return { x: Math.sin(radians) * range, y: -Math.cos(radians) * range };
}

export function distanceBetween(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function bearingBetween(listener, target) {
  return normalizeDeg(Math.atan2(target.x - listener.x, -(target.y - listener.y)) * 180 / Math.PI);
}

export function rangeFromDelay(delay, spec = SURVEY_SPEC) {
  return Math.max(0, (delay - spec.baseDelay) * spec.metersPerSecond);
}

export function delayFromRange(range, spec = SURVEY_SPEC) {
  return spec.baseDelay + range / spec.metersPerSecond;
}

function mulberry32(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ result >>> 15, result | 1);
    result ^= result + Math.imul(result ^ result >>> 7, result | 61);
    return ((result ^ result >>> 14) >>> 0) / 4294967296;
  };
}

export function generateSurvey(seed = 384) {
  const random = mulberry32(seed);
  return TARGET_BLUEPRINT.map((blueprint) => {
    const jitter = (random() - 0.5) * 10;
    const offset = (random() - 0.5) * 4;
    const point = polarToCartesian(normalizeDeg(blueprint.bearing + jitter), blueprint.range + offset);
    return { ...blueprint, x: point.x, y: point.y };
  });
}

export function clampListener(listener, spec = SURVEY_SPEC) {
  const radius = Math.hypot(listener.x, listener.y);
  if (radius <= spec.listenerLimit) return { ...listener };
  const scale = spec.listenerLimit / radius;
  return { x: listener.x * scale, y: listener.y * scale };
}

export function moveListener(listener, dx, dy, spec = SURVEY_SPEC) {
  return clampListener({ x: listener.x + dx, y: listener.y + dy }, spec);
}

export function computeReturns(listener, emissionAngle, targets, spec = SURVEY_SPEC) {
  return targets.flatMap((target) => {
    const range = distanceBetween(listener, target);
    if (range > spec.rangeMax) return [];
    const bearing = bearingBetween(listener, target);
    const offset = signedAngleDelta(bearing, emissionAngle);
    if (Math.abs(offset) > spec.beamHalfDeg) return [];
    const beamRatio = Math.sin(offset * Math.PI / 180) / Math.sin(spec.beamHalfDeg * Math.PI / 180);
    const strength = 0.28 + 0.72 * Math.pow(Math.cos(offset / spec.beamHalfDeg * Math.PI / 2), 1.4);
    return [{
      targetId: target.id,
      kind: target.kind,
      name: target.name,
      bearing,
      range,
      delay: delayFromRange(range, spec),
      pan: clamp(beamRatio * 0.92, -1, 1),
      strength
    }];
  }).sort((a, b) => a.delay - b.delay);
}

export function resolvePlot(point, signature, targets, claimedIds = new Set()) {
  const available = targets.filter((target) => !claimedIds.has(target.id));
  if (!available.length) {
    return { status: "occupied", target: null, distance: Infinity };
  }
  const nearest = available.reduce((best, target) => {
    const distance = distanceBetween(point, target);
    return distance < best.distance ? { target, distance } : best;
  }, { target: null, distance: Infinity });

  if (nearest.distance > SURVEY_SPEC.plotTolerance) {
    return { status: "unresolved", target: nearest.target, distance: nearest.distance };
  }
  if (nearest.target.kind !== signature) {
    return { status: "mismatch", target: nearest.target, distance: nearest.distance };
  }
  return { status: "confirmed", target: nearest.target, distance: nearest.distance };
}
