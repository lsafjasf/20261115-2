import assert from "node:assert/strict";
import {
  Simulation,
  goodFans,
  badFans,
  DURATION,
  CLEAN_EFFICIENCY,
} from "../src/simulation.js";

const SEEDS = [1, 7, 42, 99, 1234, 2026];
let passed = 0;
function check(name, fn) {
  fn();
  passed++;
  console.log(`  \u2713 ${name}`);
}

console.log("Sandstorm defense simulation tests");

check("a correct full run covers the whole ten-minute window", () => {
  const sim = new Simulation({ seed: 42, fans: goodFans() });
  const res = sim.run();
  assert.equal(res.finished, true);
  assert.equal(Math.round(res.time), DURATION);
  assert.ok(res.spawned > 10000, "a full storm should spawn many particles");
});

check("correct fan direction keeps BOTH greenhouses clean across seeds", () => {
  for (const seed of SEEDS) {
    const res = new Simulation({ seed, fans: goodFans() }).run();
    assert.equal(
      res.success,
      true,
      `seed ${seed}: expected success, got ${JSON.stringify(res.houses)}`
    );
    for (const house of res.houses) {
      assert.ok(
        house.efficiency >= CLEAN_EFFICIENCY,
        `seed ${seed} house ${house.id} below clean threshold`
      );
      assert.ok(
        house.efficiency >= 0.93,
        `seed ${seed} house ${house.id} margin too thin`
      );
    }
  }
});

check("wrong fan direction (horizontal jets) chokes BOTH intakes", () => {
  for (const seed of SEEDS) {
    const res = new Simulation({ seed, fans: badFans() }).run();
    assert.equal(res.success, false, `seed ${seed}: wrong direction must fail`);
    for (const house of res.houses) {
      assert.ok(
        house.efficiency < 0.1,
        `seed ${seed} house ${house.id} should be nearly choked`
      );
    }
    assert.ok(
      res.deposited > 9000,
      `seed ${seed}: wrong direction should dump most sand into the houses`
    );
  }
});

check("correct deployment sheds almost all sand instead of trapping it", () => {
  const good = new Simulation({ seed: 42, fans: goodFans() }).run();
  const bad = new Simulation({ seed: 42, fans: badFans() }).run();
  assert.ok(good.deposited < bad.deposited * 0.01);
  assert.ok(good.escaped > bad.escaped * 2.5);
});

check("the tuned deployment raises no over-blowing warnings", () => {
  const res = new Simulation({ seed: 42, fans: goodFans() }).run();
  assert.deepEqual(res.overdrive, []);
});

check("over-blowing a fan toward the far house is detected", () => {
  const fans = goodFans();
  fans[0] = { ...fans[0], angle: 0.5 }; // top fan redirected down into B
  const res = new Simulation({ seed: 42, fans }).run();
  assert.equal(res.overdrive.length, 1);
  assert.equal(res.overdrive[0].target, "B");
  assert.equal(res.success, false);
});

check("deposits monotonically reduce intake efficiency", () => {
  const sim = new Simulation({ seed: 42, fans: badFans() });
  const before = sim.efficiency(sim.greenhouses[0]);
  sim.greenhouses[0].deposited += 100;
  const after = sim.efficiency(sim.greenhouses[0]);
  assert.ok(after < before);
  assert.ok(after >= 0);
});

console.log(`\n${passed} checks passed`);
