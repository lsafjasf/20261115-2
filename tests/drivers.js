import {
  CONFIG,
  activeTarget,
  createEngine,
  deployAnchor,
  setControls,
  step,
} from "../app/js/engine.js";

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function runRecovery({
  frontAngle = 67,
  rearAngle = 65,
  winch = 62,
  tick = CONFIG.tick,
  maxTime = 70,
} = {}) {
  const engine = createEngine();
  const log = [];
  let lastPhase = "";

  setControls(engine, { angle: frontAngle });
  deployAnchor(engine);

  while (engine.status === "running" && engine.time < maxTime) {
    if (engine.phase === "reanchor") {
      setControls(engine, { angle: rearAngle });
      deployAnchor(engine);
    }

    if (engine.active) {
      const car = engine[engine.active];
      const targetY = activeTarget(engine);
      const steer = clamp(
        0.21 + (car.y - targetY) * 0.018 + car.vy * 0.014,
        -0.9,
        0.9,
      );
      setControls(engine, { winch, steer });
    } else {
      setControls(engine, { winch: 0, steer: 0 });
    }
    step(engine, tick);

    if (engine.phase !== lastPhase) {
      log.push({
        t: Number(engine.time.toFixed(2)),
        phase: engine.phase,
        tension: Number(engine.tension.toFixed(1)),
        slip: Number(engine.rescue.slip.toFixed(1)),
      });
      lastPhase = engine.phase;
    }
  }

  return { engine, log };
}

export function runWrongAnchor({
  angle = 29,
  winch = 67,
  seconds = 8,
  stopAtSlip = 28,
  tick = CONFIG.tick,
} = {}) {
  const engine = createEngine();
  setControls(engine, { angle });
  deployAnchor(engine);

  for (
    let elapsed = 0;
    elapsed < seconds && engine.status === "running" && engine.rescue.slip < stopAtSlip;
    elapsed += tick
  ) {
    const car = engine.front;
    const steer = clamp((car.y - CONFIG.frontSafe.bayY) * 0.055 - car.vy * 0.11, -0.9, 0.9);
    setControls(engine, { winch, steer });
    step(engine, tick);
  }
  return { engine };
}
