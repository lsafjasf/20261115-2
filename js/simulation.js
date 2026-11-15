export const CONFIG = {
  duration: 96,
  tidePeakTime: 72,
  tidePeak: 5.15,
  pumpStartDelay: 2.4,
  pumpStopDelay: 1.8,
  gateDelay: 0.7,
  gateTravel: 2.6,
  canalDelay: 1.5,
  canalTravel: 2.2,
  canalCapacity: 0.78,
  flowCapacity: 17,
  targetBand: 0.16,
  maxDt: 1 / 30,
};

export const RESERVOIRS = [
  {
    id: "A", short: "A", name: "一号蓄水池", area: 120,
    initial: 1.05, target: 2.7, max: 3.35,
    gateCapacity: 0.42, color: "#72d8ff",
  },
  {
    id: "B", short: "B", name: "二号蓄水池", area: 95,
    initial: 1.2, target: 3.25, max: 3.95,
    gateCapacity: 0.47, color: "#4fc3f7",
  },
  {
    id: "C", short: "C", name: "三号蓄水池", area: 78,
    initial: 1.4, target: 3.85, max: 4.45,
    gateCapacity: 0.37, color: "#39a9dd",
  },
];

const TIDE_KEYS = [
  [0, 0.82], [12, 1.18], [24, 2.02], [36, 3.06],
  [48, 4.02], [60, 4.72], [72, 5.15], [84, 4.62],
  [96, 3.74], [110, 2.54], [126, 1.38], [140, 0.9],
];

export function tideAt(time) {
  const clamped = Math.max(0, Math.min(140, time));
  for (let index = 1; index < TIDE_KEYS.length; index += 1) {
    const [nextTime, nextLevel] = TIDE_KEYS[index];
    if (clamped <= nextTime) {
      const [prevTime, prevLevel] = TIDE_KEYS[index - 1];
      const mix = (clamped - prevTime) / (nextTime - prevTime);
      const smooth = mix * mix * (3 - 2 * mix);
      return prevLevel + (nextLevel - prevLevel) * smooth;
    }
  }
  return TIDE_KEYS.at(-1)[1];
}

export function tideEfficiency(tide = 1.2) {
  return Math.max(0.48, 1 - 0.108 * Math.max(0, tide - 1.1));
}

function makePump(index) {
  return {
    id: `P${index + 1}`, name: `${index + 1}号泵`,
    rated: 8.5, commanded: false, state: "off",
    transitionRemaining: 0, output: 0,
  };
}

function makeGate(reservoir) {
  return {
    id: `G${reservoir.short}`, name: `${reservoir.short}池进水闸`,
    reservoirId: reservoir.id, position: 0,
    targetPosition: 0, commanded: false, delayRemaining: 0,
    moving: false,
  };
}

export function createSimulation() {
  return {
    time: 0,
    status: "running",
    failureReason: null,
    completionTime: null,
    pumps: [makePump(0), makePump(1)],
    gates: RESERVOIRS.map(makeGate),
    canal: {
      name: "回水渠", position: 0, targetPosition: 0,
      commanded: false, delayRemaining: 0, moving: false,
    },
    reservoirs: RESERVOIRS.map((source) => ({
      ...source, level: source.initial,
      overflowVolume: 0, overflowRate: 0,
      overTarget: false, inTargetBand: false,
    })),
    totals: {
      pumpFlow: 0, gateFlow: 0, canalFlow: 0,
      overflowVolume: 0, deliveredVolume: 0,
      pressure: 0.18, efficiency: 1,
    },
    events: [],
    dispatched: false,
  };
}

export function getTide(sim) {
  return tideAt(sim.time);
}

export function formatClock(seconds) {
  const value = Math.max(0, Math.ceil(seconds));
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

function addEvent(sim, type, text) {
  sim.events.unshift({ time: sim.time, type, text });
  sim.events.length = Math.min(sim.events.length, 14);
}

function commandPump(sim, index) {
  const pump = sim.pumps[index];
  if (pump.commanded) {
    pump.commanded = false;
    pump.state = "stopping";
    pump.transitionRemaining = CONFIG.pumpStopDelay * Math.max(0.25, pump.output);
    addEvent(sim, "command", `${pump.name}停泵指令 · ${CONFIG.pumpStopDelay.toFixed(1)} 秒减速`);
    return;
  }

  pump.commanded = true;
  pump.state = "starting";
  pump.transitionRemaining = CONFIG.pumpStartDelay * Math.max(0.25, 1 - pump.output);
  addEvent(sim, "command", `${pump.name}启动指令 · ${CONFIG.pumpStartDelay.toFixed(1)} 秒升速`);
}

function commandGate(sim, index) {
  const gate = sim.gates[index];
  const opening = gate.targetPosition < 0.5;
  gate.targetPosition = opening ? 1 : 0;
  gate.commanded = opening;
  gate.delayRemaining = CONFIG.gateDelay;
  gate.moving = true;
  addEvent(sim, "command", `${gate.name}${opening ? "开启" : "关闭"}指令`);
}

function commandCanal(sim) {
  const canal = sim.canal;
  const opening = canal.targetPosition < 0.5;
  canal.targetPosition = opening ? 1 : 0;
  canal.commanded = opening;
  canal.delayRemaining = CONFIG.canalDelay;
  canal.moving = true;
  addEvent(sim, "command", `回水渠${opening ? "开启" : "关闭"}指令`);
}

export function togglePump(sim, index) {
  if (sim.status === "running" && sim.pumps[index]) commandPump(sim, index);
}

export function toggleGate(sim, index) {
  if (sim.status === "running" && sim.gates[index]) commandGate(sim, index);
}

export function toggleCanal(sim) {
  if (sim.status === "running") commandCanal(sim);
}

function updatePump(pump, dt) {
  if (pump.state === "off") {
    pump.output = 0;
    return;
  }
  if (pump.state === "running") {
    pump.output = 1;
    return;
  }

  pump.transitionRemaining = Math.max(0, pump.transitionRemaining - dt);
  if (pump.state === "starting") {
    const duration = CONFIG.pumpStartDelay * Math.max(0.25, 1 - pump.output);
    const base = Math.max(0.01, duration);
    pump.output = Math.min(1, pump.output + dt / base);
    if (pump.transitionRemaining <= 0) {
      pump.state = "running";
      pump.output = 1;
    }
    return;
  }

  if (pump.state === "stopping") {
    const duration = CONFIG.pumpStopDelay * Math.max(0.25, pump.output);
    const base = Math.max(0.01, duration);
    pump.output = Math.max(0, pump.output - dt / base);
    if (pump.transitionRemaining <= 0) {
      pump.state = "off";
      pump.output = 0;
    }
  }
}

function updateGate(gate, dt) {
  if (!gate.moving || Math.abs(gate.position - gate.targetPosition) < 0.0001) {
    gate.position = gate.targetPosition;
    gate.moving = false;
    return;
  }
  if (gate.delayRemaining > 0) {
    gate.delayRemaining = Math.max(0, gate.delayRemaining - dt);
    return;
  }
  const direction = Math.sign(gate.targetPosition - gate.position);
  gate.position = Math.max(0, Math.min(1, gate.position + direction * dt / CONFIG.gateTravel));
  if (Math.abs(gate.position - gate.targetPosition) < 0.0001) {
    gate.position = gate.targetPosition;
    gate.moving = false;
  }
}

function updateCanal(canal, dt) {
  if (!canal.moving || Math.abs(canal.position - canal.targetPosition) < 0.0001) {
    canal.position = canal.targetPosition;
    canal.moving = false;
    return;
  }
  if (canal.delayRemaining > 0) {
    canal.delayRemaining = Math.max(0, canal.delayRemaining - dt);
    return;
  }
  const direction = Math.sign(canal.targetPosition - canal.position);
  canal.position = Math.max(0, Math.min(1, canal.position + direction * dt / CONFIG.canalTravel));
  if (Math.abs(canal.position - canal.targetPosition) < 0.0001) {
    canal.position = canal.targetPosition;
    canal.moving = false;
  }
}

function markOverflow(sim, reservoir, volume) {
  reservoir.overflowVolume += volume;
  sim.totals.overflowVolume += volume;
  if (sim.status === "running") {
    sim.status = "failed";
    sim.failureReason = "overflow";
    addEvent(sim, "danger", `${reservoir.name}超过安全堰顶，发生溢流`);
  }
}

function updateHydraulics(sim, dt, tide, efficiency) {
  const potentialFlow = sim.pumps.reduce(
    (sum, pump) => sum + pump.rated * pump.output * efficiency,
    0,
  );
  const weights = sim.gates.map((gate, index) => (
    gate.position * sim.reservoirs[index].gateCapacity
  ));
  const canalWeight = sim.canal.position * CONFIG.canalCapacity;
  const totalWeight = weights.reduce((sum, weight) => sum + weight, canalWeight);
  const scale = Math.min(1, totalWeight);
  const pumpFlow = potentialFlow * scale;
  const gateFlow = totalWeight > 0 ? pumpFlow * (weights.reduce((a, b) => a + b, 0) / totalWeight) : 0;
  const canalFlow = totalWeight > 0 ? pumpFlow * (canalWeight / totalWeight) : 0;

  sim.reservoirs.forEach((reservoir, index) => {
    const pathShare = totalWeight > 0 ? weights[index] / totalWeight : 0;
    reservoir.flow = pumpFlow * pathShare;
    reservoir.level += (reservoir.flow * dt) / reservoir.area;
    if (reservoir.level > reservoir.max) {
      const excess = reservoir.level - reservoir.max;
      reservoir.level = reservoir.max;
      const volume = excess * reservoir.area;
      reservoir.overflowRate = volume / Math.max(dt, 0.001);
      markOverflow(sim, reservoir, volume);
    } else {
      reservoir.overflowRate = 0;
    }
    reservoir.overTarget = reservoir.level > reservoir.target + CONFIG.targetBand;
    reservoir.inTargetBand = (
      reservoir.level >= reservoir.target
      && reservoir.level <= reservoir.target + CONFIG.targetBand
    );
  });

  sim.totals.pumpFlow = pumpFlow;
  sim.totals.gateFlow = gateFlow;
  sim.totals.canalFlow = canalFlow;
  sim.totals.deliveredVolume += gateFlow * dt;
  sim.totals.pressure = 0.18 + 0.22 * (pumpFlow / CONFIG.flowCapacity)
    + 0.33 * (tide / CONFIG.tidePeak) + 0.38 * (1 - scale);
  sim.totals.efficiency = efficiency;
}

function checkMission(sim) {
  const allAtTarget = sim.reservoirs.every((reservoir) => reservoir.inTargetBand);
  const systemSecured = sim.pumps.every((pump) => pump.state === "off" && pump.output === 0)
    && sim.gates.every((gate) => gate.position === 0)
    && !sim.canal.moving;
  if (allAtTarget && systemSecured && sim.totals.overflowVolume === 0) {
    sim.status = "success";
    sim.completionTime = sim.time;
    addEvent(sim, "success", `三池达标 · 用时 ${formatClock(sim.time)}`);
    return;
  }
  if (sim.time >= CONFIG.tidePeakTime) {
    sim.status = "failed";
    sim.failureReason = "deadline";
    addEvent(sim, "danger", "高潮已到，未完成三池蓄水任务");
  }
}

export function stepSimulation(sim, seconds) {
  if (sim.status !== "running") return sim;
  let remaining = Math.max(0, Math.min(seconds, 5));
  while (remaining > 0 && sim.status === "running") {
    const dt = Math.min(remaining, CONFIG.maxDt);
    sim.time += dt;
    const tide = tideAt(sim.time);
    const efficiency = tideEfficiency(tide);
    sim.pumps.forEach((pump) => updatePump(pump, dt));
    sim.gates.forEach((gate) => updateGate(gate, dt));
    updateCanal(sim.canal, dt);
    updateHydraulics(sim, dt, tide, efficiency);
    checkMission(sim);
    remaining -= dt;
  }
  return sim;
}

export function snapshot(sim) {
  return {
    time: sim.time,
    tide: tideAt(sim.time),
    status: sim.status,
    failureReason: sim.failureReason,
    completionTime: sim.completionTime,
    levels: sim.reservoirs.map((reservoir) => reservoir.level),
    targets: sim.reservoirs.map((reservoir) => reservoir.target),
    pumpOutputs: sim.pumps.map((pump) => pump.output),
    pumpStates: sim.pumps.map((pump) => pump.state),
    gatePositions: sim.gates.map((gate) => gate.position),
    canalPosition: sim.canal.position,
    pumpFlow: sim.totals.pumpFlow,
    efficiency: sim.totals.efficiency,
    pressure: sim.totals.pressure,
    overflowVolume: sim.totals.overflowVolume,
  };
}
