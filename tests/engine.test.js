"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { CoolingEngine } = require("../js/engine.js");

function finish(engine, limit) {
  let elapsed = 0;
  const max = limit || 75;
  while (engine.status === "running" && elapsed < max) {
    engine.step(0.1);
    elapsed += 0.1;
  }
  return engine.snapshot();
}

test("balanced mist and crossflow complete a passing three-part batch", () => {
  const engine = new CoolingEngine({ batchNumber: 1, seed: "THERMO-CAST-719" });
  engine.start();
  engine.setControls({ mist: 48, air: 56, belt: 1 });
  const snapshot = finish(engine);

  assert.equal(snapshot.status, "success");
  assert.equal(snapshot.result.passed, true);
  assert.equal(snapshot.parts.length, 3);
  snapshot.parts.forEach((part) => {
    assert.equal(part.cracked, false);
    assert.ok(part.scores.overall >= snapshot.batch.passScore, `${part.name} quality`);
  });
  assert.ok(snapshot.finishTime < 45);
});

test("one-sided quench creates a thermal crack", () => {
  const engine = new CoolingEngine({ batchNumber: 1, seed: "THERMO-CAST-719" });
  engine.start();
  engine.setControls({ mist: 100, air: 0, belt: 0.8 });
  let snapshot;
  let elapsed = 0;
  while (elapsed < 20) {
    engine.step(0.1);
    elapsed += 0.1;
    snapshot = engine.snapshot();
    if (snapshot.parts.some((part) => part.cracked)) break;
  }

  const cracked = snapshot.parts.find((part) => part.cracked);
  assert.ok(cracked, "expected a cracked part");
  assert.ok(cracked.crack.gap > 118, "crack gap should exceed the safe gradient");
  assert.ok(cracked.crack.time < 20, "crack should occur during the quench");

  const result = finish(engine);
  assert.equal(result.status, "failed");
  assert.match(result.result.reason, /裂纹/);
});

test("slow conveyor creates coarse grains and misses quality", () => {
  const engine = new CoolingEngine({ batchNumber: 1, seed: "THERMO-CAST-719" });
  engine.start();
  engine.setControls({ mist: 45, air: 58, belt: 0.7 });
  const snapshot = finish(engine, 70);
  const averageGrain = snapshot.average.grain;

  assert.equal(snapshot.status, "failed");
  assert.ok(averageGrain < 65, "slow cooling should lower the grain score");
  assert.ok(snapshot.finishTime >= 59);
});

test("each new batch receives its own target profile", () => {
  const engine = new CoolingEngine({ batchNumber: 1, seed: "THERMO-CAST-719" });
  const firstCurve = JSON.stringify(engine.batch.curve);
  engine.batchNumber = 2;
  engine.newBatch();
  assert.notEqual(JSON.stringify(engine.batch.curve), firstCurve);
});
