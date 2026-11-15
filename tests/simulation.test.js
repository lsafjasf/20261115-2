import test from "node:test";
import assert from "node:assert/strict";
import {
  CONFIG,
  createSimulation,
  stepSimulation,
  tideAt,
  tideEfficiency,
  toggleGate,
  togglePump,
} from "../js/simulation.js";
import {
  OVERFLOW_GATE_CLOSE_TIME,
  runAutoScenario,
} from "../js/scenarios.js";

test("固定潮汐序列在 72 秒到达高潮，反压持续降低泵效", () => {
  assert.equal(tideAt(0), 0.82);
  assert.equal(tideAt(CONFIG.tidePeakTime), CONFIG.tidePeak);
  assert.ok(tideAt(36) > tideAt(24));
  assert.ok(tideEfficiency(tideAt(60)) < tideEfficiency(tideAt(24)));
  assert.ok(tideEfficiency(tideAt(CONFIG.tidePeakTime)) >= 0.48);
});

test("泵组与闸门都有可见动作延迟", () => {
  const sim = createSimulation();
  togglePump(sim, 0);
  stepSimulation(sim, 0.5);
  assert.equal(sim.pumps[0].state, "starting");
  assert.ok(sim.pumps[0].output > 0 && sim.pumps[0].output < 1);
  stepSimulation(sim, 2.2);
  assert.equal(sim.pumps[0].state, "running");
  assert.equal(sim.pumps[0].output, 1);

  togglePump(sim, 0);
  stepSimulation(sim, 0.5);
  assert.equal(sim.pumps[0].state, "stopping");
  assert.ok(sim.pumps[0].output > 0 && sim.pumps[0].output < 1);
  stepSimulation(sim, 2);
  assert.equal(sim.pumps[0].state, "off");

  toggleGate(sim, 0);
  stepSimulation(sim, 0.5);
  assert.equal(sim.gates[0].position, 0);
  stepSimulation(sim, 0.4);
  assert.ok(sim.gates[0].position > 0 && sim.gates[0].position < 1);
  stepSimulation(sim, 2.8);
  assert.equal(sim.gates[0].position, 1);
});

test("示范调度在最高潮前完成，且全程无溢流", () => {
  const sim = runAutoScenario("demo");
  assert.equal(sim.status, "success");
  assert.equal(sim.failureReason, null);
  assert.ok(sim.completionTime < CONFIG.tidePeakTime);
  assert.equal(sim.totals.overflowVolume, 0);
  assert.ok(sim.reservoirs.every((reservoir) => reservoir.inTargetBand));
  assert.ok(sim.reservoirs.every((reservoir) => reservoir.level <= reservoir.target + CONFIG.targetBand));
  assert.ok(sim.pumps.every((pump) => pump.state === "off"));
  assert.ok(sim.gates.every((gate) => gate.position === 0));
});

test("B 闸晚至 45.6 秒关闭，动作行程内发生真实溢流", () => {
  const sim = runAutoScenario("overflow");
  assert.equal(sim.status, "failed");
  assert.equal(sim.failureReason, "overflow");
  assert.ok(sim.totals.overflowVolume > 0);
  assert.equal(sim.reservoirs[1].level, sim.reservoirs[1].max);

  const closeCommand = sim.events.find((event) => event.text.includes("B池进水闸关闭指令"));
  const overflowEvent = sim.events.find((event) => event.text.includes("二号蓄水池超过安全堰顶"));
  assert.ok(closeCommand);
  assert.ok(overflowEvent);
  assert.ok(Math.abs(closeCommand.time - OVERFLOW_GATE_CLOSE_TIME) < 0.1);
  assert.ok(overflowEvent.time > closeCommand.time);
  assert.ok(overflowEvent.time < CONFIG.tidePeakTime);
});
