import test from "node:test";
import assert from "node:assert/strict";
import { CONFIG, MicrogridSimulation } from "../simulation.js";

function advance(sim, seconds, step = 0.1) {
  for (let elapsed = 0; elapsed < seconds - 1e-9 && sim.status === "running"; elapsed += step) {
    sim.tick(step);
  }
}

function advanceTo(sim, targetTime, step = 0.1) {
  while (sim.time < targetTime - 1e-9 && sim.status === "running") {
    sim.tick(Math.min(step, targetTime - sim.time));
  }
}

test("及时的一次性处置可以完成十分钟故障恢复", () => {
  const sim = new MicrogridSimulation();
  advanceTo(sim, CONFIG.faultAt + 0.2);
  assert.equal(sim.faultTriggered, true);

  assert.equal(sim.commandDevice("battery", 4), true);
  assert.equal(sim.commandDevice("gas", 7.5), true);
  assert.equal(sim.toggleLoad("industrial"), true);

  advance(sim, CONFIG.duration + 1);
  const state = sim.snapshot();
  assert.equal(state.status, "success");
  assert.equal(state.failed, false);
  assert.equal(state.recoveryAchieved, true);
  assert.equal(state.violationSeconds, 0);
  assert.ok(state.maxDeviation < 0.5);
  assert.ok(state.loads.find((load) => load.id === "hospital").fraction === 1);
  assert.ok(state.loads.find((load) => load.id === "telecom").fraction === 1);
});

test("过快反复切换工业负荷会放大频率振荡并加速磨损", () => {
  const sim = new MicrogridSimulation();
  advanceTo(sim, CONFIG.faultAt + 0.2);
  sim.commandDevice("battery", 4);
  sim.commandDevice("gas", 7.5);
  sim.toggleLoad("industrial");

  let nextToggle = sim.time;
  let minimum = 50;
  let maximum = 50;
  while (sim.time < CONFIG.faultAt + 85 && sim.status === "running") {
    sim.tick(0.1);
    if (sim.time >= nextToggle) {
      sim.toggleLoad("industrial");
      nextToggle += 1;
    }
    minimum = Math.min(minimum, sim.frequency);
    maximum = Math.max(maximum, sim.frequency);
  }

  const state = sim.snapshot();
  const industrial = state.loads.find((load) => load.id === "industrial");
  assert.equal(state.status, "running");
  assert.ok(maximum - minimum > 0.4, `振荡峰峰值应超过 0.4 Hz，实际 ${(maximum - minimum).toFixed(3)} Hz`);
  assert.ok(industrial.rapidCycles >= 20);
  assert.ok(state.maxWear >= 60);
});
