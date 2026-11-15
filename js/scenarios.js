import {
  createSimulation,
  stepSimulation,
  toggleGate,
  togglePump,
} from "./simulation.js";

export const OVERFLOW_GATE_CLOSE_TIME = 45.6;

export function issueAutoStart(sim) {
  togglePump(sim, 0);
  togglePump(sim, 1);
  toggleGate(sim, 0);
  toggleGate(sim, 1);
  toggleGate(sim, 2);
}

export function applyAutoControls(sim, mode) {
  if (mode === "manual") return;
  sim.reservoirs.forEach((reservoir, index) => {
    const gate = sim.gates[index];
    if (mode === "overflow" && index === 1) return;
    if (gate.commanded && gate.position > 0.98 && reservoir.level >= reservoir.target - 0.08) {
      toggleGate(sim, index);
    }
  });

  if (mode === "overflow" && sim.time >= OVERFLOW_GATE_CLOSE_TIME && sim.gates[1].commanded) {
    toggleGate(sim, 1);
  }

  const allGatesClosed = sim.gates.every((gate) => !gate.commanded && gate.position === 0);
  if (mode === "demo" && allGatesClosed && sim.pumps.some((pump) => pump.commanded)) {
    togglePump(sim, 0);
    togglePump(sim, 1);
  }
}

export function runAutoScenario(mode, step = 0.05, maxSteps = 4000) {
  const sim = createSimulation();
  issueAutoStart(sim);
  for (let index = 0; index < maxSteps && sim.status === "running"; index += 1) {
    applyAutoControls(sim, mode);
    stepSimulation(sim, step);
  }
  return sim;
}
