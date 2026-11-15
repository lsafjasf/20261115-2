export const WORLD = Object.freeze({ width: 1200, height: 700 });

export const CONFIG = Object.freeze({
  idealAnchor: 67,
  safeAnchorMin: 54,
  safeAnchorMax: 80,
  winchPower: 70,
  steerPower: 45,
  slopeX: -9,
  slopeY: 20,
  ropeLimit: 91,
  ropeGrace: 0.85,
  slipLimit: 100,
  tick: 0.05,
  winchPoint: { x: 862, y: 334 },
  frontSafe: { xMin: 686, xMax: 858, yMin: 342, yMax: 421, bayX: 770, bayY: 386 },
  rearSafe: { xMin: 686, xMax: 858, yMin: 423, yMax: 508, bayX: 758, bayY: 462 },
  frontStart: { x: 458, y: 397 },
  rearStart: { x: 268, y: 472 },
  rescueBase: { x: 878, y: 309 },
});

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function anchorQuality(angle) {
  const distance = Math.abs(angle - CONFIG.idealAnchor);
  return clamp(1 - Math.pow(distance / 30, 1.4), 0.03, 1);
}

export function anchorBand(quality) {
  if (quality >= 0.78) return "safe";
  if (quality >= 0.48) return "caution";
  return "danger";
}

function vehicle(start, label) {
  return {
    label,
    x: start.x,
    y: start.y,
    vx: 0,
    vy: 0,
    tilt: -4,
    safe: false,
    lost: false,
  };
}

export function createEngine() {
  return {
    phase: "rig",
    status: "running",
    result: "",
    finishReason: "",
    time: 0,
    lastEventId: 0,
    events: [],
    controls: { winch: 0, angle: 66, steer: 0 },
    anchor: {
      deployed: false,
      angle: 66,
      quality: anchorQuality(66),
      slot: "front",
    },
    tension: 0,
    overload: 0,
    tensionBand: "slack",
    maxTension: 0,
    maxSlip: 0,
    rescue: {
      x: CONFIG.rescueBase.x,
      y: CONFIG.rescueBase.y,
      slip: 0,
      tilt: -4,
      anchored: false,
    },
    active: null,
    pulledDistance: 0,
    front: vehicle(CONFIG.frontStart, "前车"),
    rear: vehicle(CONFIG.rearStart, "后车"),
    slipBand: "steady",
    alert: "先选择锚定角度，再打入地锚固定救援车。",
    outcome: null,
  };
}

function emit(engine, type, text, data = {}) {
  engine.lastEventId += 1;
  engine.events.push({ id: engine.lastEventId, t: engine.time, type, text, ...data });
  if (engine.events.length > 80) engine.events.shift();
}

function finish(engine, result, reason, alert) {
  if (engine.status !== "running") return;
  engine.status = result === "won" ? "won" : "lost";
  engine.result = result;
  engine.finishReason = reason;
  engine.alert = alert;
  engine.controls.winch = 0;
  engine.outcome = {
    result,
    reason,
    time: Number(engine.time.toFixed(2)),
    frontSafe: engine.front.safe,
    rearSafe: engine.rear.safe,
    rescueSlip: Number(engine.rescue.slip.toFixed(1)),
    maxSlip: Number(engine.maxSlip.toFixed(1)),
    maxTension: Number(engine.maxTension.toFixed(1)),
    ropeBroken: reason === "rope-break",
  };
  emit(engine, result, alert, engine.outcome);
}

export function setControls(engine, patch) {
  if (patch.winch !== undefined) {
    engine.controls.winch = clamp(Number(patch.winch), 0, 100);
  }
  if (patch.steer !== undefined) {
    engine.controls.steer = clamp(Number(patch.steer), -1, 1);
  }
  if (patch.angle !== undefined && !engine.anchor.deployed) {
    engine.controls.angle = clamp(Number(patch.angle), 30, 88);
    engine.anchor.quality = anchorQuality(engine.controls.angle);
  }
}

export function deployAnchor(engine) {
  if (engine.status !== "running") {
    return { ok: false, reason: "finished" };
  }
  if (engine.anchor.deployed) {
    return { ok: false, reason: "already-anchored" };
  }
  if (!["rig", "reanchor"].includes(engine.phase)) {
    return { ok: false, reason: "wrong-phase" };
  }
  if (engine.tension > 8) {
    engine.alert = "绞盘仍有张力，先泄压再固定地锚。";
    return { ok: false, reason: "tension-high" };
  }

  const angle = engine.controls.angle;
  const quality = anchorQuality(angle);
  engine.anchor.deployed = true;
  engine.anchor.angle = angle;
  engine.anchor.quality = quality;
  engine.anchor.slot = engine.phase === "rig" ? "front" : "rear";
  engine.rescue.anchored = true;
  engine.phase = engine.phase === "rig" ? "front" : "rear";
  engine.active = engine.phase === "front" ? "front" : "rear";
  engine.alert =
    quality >= 0.78
      ? "地锚咬合稳定。缓慢增加绞盘张力，并用转向修正车头。"
      : "警告：锚点偏离受力线，加大张力会让救援车侧滑。";
  emit(engine, "anchor", engine.alert, { angle, quality: Number(quality.toFixed(3)) });
  return { ok: true, quality };
}

export function cutWinch(engine) {
  engine.controls.winch = 0;
  engine.alert = "绞盘已泄压，拖索正在松弛。";
  emit(engine, "release", engine.alert);
}

function stepVehicle(engine, car, dt) {
  const dx = CONFIG.winchPoint.x - car.x;
  const dy = CONFIG.winchPoint.y - car.y;
  const distance = Math.max(1, Math.hypot(dx, dy));
  const load = engine.tension / 100;
  const anchoredFactor = engine.anchor.deployed ? 1 : 0.08;
  const pull = CONFIG.winchPower * load * anchoredFactor;

  car.vx += (dx / distance) * pull + CONFIG.slopeX;
  car.vy +=
    (dy / distance) * pull +
    CONFIG.slopeY -
    engine.controls.steer * CONFIG.steerPower;

  car.vx *= Math.exp(-0.9 * dt);
  car.vy *= Math.exp(-1.5 * dt);
  car.vx = clamp(car.vx, -34, 90);
  car.vy = clamp(car.vy, -70, 70);
  car.x += car.vx * dt;
  car.y += car.vy * dt;
  car.tilt = clamp(car.tilt + (car.vy * 0.12 - engine.controls.steer * 2.2) * dt, -15, 15);
}

function detectCapture(engine, car) {
  const rescuedFront = engine.active === "front";
  let zone = CONFIG.frontSafe;
  if (!rescuedFront) zone = CONFIG.rearSafe;
  if (
    car.x >= zone.xMin &&
    car.x <= zone.xMax &&
    car.y >= zone.yMin &&
    car.y <= zone.yMax
  ) {
    car.x = zone.bayX;
    car.y = zone.bayY;
    car.vx = 0;
    car.vy = 0;
    car.tilt = 0;
    car.safe = true;
    engine.controls.winch = 0;
    engine.tension = Math.min(engine.tension, 18);
    engine.overload = 0;
    engine.anchor.deployed = false;
    engine.rescue.anchored = false;
    engine.active = null;
    engine.alert = rescuedFront
      ? "前车进入安全区。现在收锚并重新布置锚点，准备救援后车。"
      : "";
    if (engine.phase === "front") {
      engine.phase = "reanchor";
      engine.controls.angle = 68;
      emit(engine, "safe", "前车已固定到安全区，可以重新布置后车锚点。", {
        vehicle: "front",
      });
    } else if (engine.phase === "rear") {
      emit(engine, "safe", "后车已进入安全区。", { vehicle: "rear" });
      finish(engine, "won", "both-safe", "两车均已脱困，救援车保持稳定。任务完成。");
    }
    return true;
  }
  return false;
}

function updateRescue(engine, dt) {
  const pulling = engine.anchor.deployed && engine.tension > 7;
  const risk = Math.max(0, 0.82 - engine.anchor.quality);
  if (pulling && risk > 0.02) {
    engine.rescue.slip += engine.tension / 100 * risk * 42 * dt;
  } else {
    engine.rescue.slip = Math.max(0, engine.rescue.slip - 7 * dt);
  }
  engine.rescue.slip = clamp(engine.rescue.slip, 0, 100);
  engine.maxSlip = Math.max(engine.maxSlip, engine.rescue.slip);

  const slip = engine.rescue.slip;
  engine.rescue.x = CONFIG.rescueBase.x - slip * 0.62;
  engine.rescue.y = CONFIG.rescueBase.y + slip * 0.34;
  engine.rescue.tilt = -4 + slip * 0.13;

  const band = slip >= 55 ? "slide" : slip >= 22 ? "creep" : "steady";
  if (band !== engine.slipBand) {
    if (band === "creep") emit(engine, "warning", "救援车开始侧滑，立即降低绞盘张力。");
    if (band === "slide") emit(engine, "danger", "侧滑加剧！锚索正在失去横向抓地力。");
    engine.slipBand = band;
  }
  if (slip >= CONFIG.slipLimit) {
    finish(engine, "lost", "rescue-slide", "救援车滑出平台。锚点角度与受力方向严重偏离。");
  }
}

export function step(engine, dt = CONFIG.tick) {
  if (engine.status !== "running") return engine;
  dt = clamp(Number(dt) || CONFIG.tick, 0.001, 0.05);
  engine.time += dt;

  const target = engine.phase === "rig" || engine.phase === "reanchor"
    ? 0
    : engine.controls.winch;
  engine.tension += (target - engine.tension) * Math.min(1, dt * 2.6);
  if (engine.tension < 0.01) engine.tension = 0;
  engine.maxTension = Math.max(engine.maxTension || 0, engine.tension);

  if (engine.tension >= 85) {
    engine.tensionBand = engine.tension >= CONFIG.ropeLimit ? "critical" : "high";
  } else if (engine.tension >= 46) {
    engine.tensionBand = "work";
  } else {
    engine.tensionBand = "slack";
  }

  if (engine.tension >= CONFIG.ropeLimit) {
    engine.overload += dt;
  } else {
    engine.overload = Math.max(0, engine.overload - dt * 0.8);
  }
  if (engine.overload >= CONFIG.ropeGrace) {
    finish(engine, "lost", "rope-break", "拖索过载断裂。降低绞盘力度，分段牵引。");
    return engine;
  }

  updateRescue(engine, dt);
  if (engine.status !== "running") return engine;

  if (engine.active) {
    const car = engine[engine.active];
    stepVehicle(engine, car, dt);
    engine.pulledDistance += Math.max(0, car.vx) * dt;

    if (car.y > 565 || car.x < -40) {
      car.lost = true;
      finish(engine, "lost", "vehicle-slide", `${car.label}滑出雪坡。修正转向并降低牵引速度。`);
      return engine;
    }
    if (detectCapture(engine, car)) return engine;
    if (car.x > 890) {
      finish(engine, "lost", "missed-safe", `${car.label}越过安全区，救援失败。`);
      return engine;
    }
  }

  if (engine.phase === "reanchor") {
    engine.alert = "前车已安全。收起旧锚，按新的受力方向重新打入地锚。";
    engine.tension *= Math.exp(-3 * dt);
  }
  return engine;
}

export function activeTarget(engine) {
  if (engine.active === "front") return CONFIG.frontSafe.bayY;
  if (engine.active === "rear") return CONFIG.rearSafe.bayY;
  return engine.active ? engine[engine.active].y : 0;
}

export function snapshot(engine) {
  const activeCar = engine.active ? engine[engine.active] : null;
  const target = activeCar ? activeTarget(engine) : 0;
  const progress = activeCar
    ? clamp((activeCar.x - (engine.active === "front" ? CONFIG.frontStart.x : CONFIG.rearStart.x)) / 310, 0, 1)
    : engine.front.safe && engine.rear.safe
      ? 1
      : 0;
  return {
    phase: engine.phase,
    status: engine.status,
    result: engine.result,
    finishReason: engine.finishReason,
    time: engine.time,
    controls: { ...engine.controls },
    anchor: { ...engine.anchor, band: anchorBand(engine.anchor.quality) },
    tension: engine.tension,
    tensionBand: engine.tensionBand,
    overload: engine.overload,
    rescue: { ...engine.rescue },
    maxSlip: engine.maxSlip,
    maxTension: engine.maxTension,
    front: { ...engine.front },
    rear: { ...engine.rear },
    active: engine.active,
    activeTargetY: target,
    progress,
    alert: engine.alert,
    slipBand: engine.slipBand,
    outcome: engine.outcome,
  };
}
