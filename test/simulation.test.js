import test from "node:test";
import assert from "node:assert/strict";
import {
  BASE_STRESS,
  SPEED_LIMIT,
  TOLERANCE_MM,
  assessParts,
  createCut,
  evaluateAssembly,
  finishCut,
  recordCutSample,
  simulateDeterministicSample,
} from "../src/simulation.js";

test("fixed success sample keeps all three parts inside tolerance", () => {
  const sample = simulateDeterministicSample("success");

  assert.equal(sample.result.success, true);
  assert.equal(sample.result.passedCount, 3);
  assert.ok(sample.result.maxDeviation <= TOLERANCE_MM);
  assert.deepEqual(
    sample.parts.map((part) => part.passed),
    [true, true, true],
  );
  assert.equal(sample.speeds.A, 205);
  assert.equal(sample.speeds.B, 205);
});

test("fixed overspeed sample rejects the B-line fracture drift", () => {
  const sample = simulateDeterministicSample("overspeed");

  assert.equal(sample.result.success, false);
  assert.equal(sample.result.passedCount, 1);
  assert.equal(sample.speeds.B, 630);
  assert.ok(sample.result.peakSpeed > SPEED_LIMIT);
  assert.ok(sample.parts[0].passed);
  assert.ok(!sample.parts[1].passed);
  assert.ok(!sample.parts[2].passed);
  assert.ok(sample.parts[1].deviation > TOLERANCE_MM);
  assert.ok(sample.parts[2].deviation > TOLERANCE_MM);
  assert.match(sample.result.reason, /走刀速度/);
});

test("overspeed damage grows monotonically with feed rate", () => {
  const deviations = [260, 430, 690].map((speed) => {
    const cut = createCut("B");
    for (let index = 0; index < 50; index += 1) {
      recordCutSample(cut, {
        speed,
        pressure: 2.52,
        dt: 0.02,
        trackError: 1,
      });
    }
    return cut.quality.maxDeviation;
  });

  assert.ok(deviations[0] < deviations[1]);
  assert.ok(deviations[1] < deviations[2]);
  assert.ok(deviations[2] > TOLERANCE_MM);
});

test("excessive wheel pressure produces chipped edges and a rejection", () => {
  const cuts = { A: createCut("A"), B: createCut("B") };
  for (const id of ["A", "B"]) {
    for (let index = 0; index < 100; index += 1) {
      recordCutSample(cuts[id], {
        speed: 220,
        pressure: 3.6,
        dt: 0.02,
        trackError: 2,
      });
    }
    finishCut(cuts[id]);
  }

  const parts = assessParts(cuts, BASE_STRESS);
  const result = evaluateAssembly(parts, cuts, BASE_STRESS);
  assert.ok(cuts.A.quality.chipDamage > 0);
  assert.equal(result.success, false);
  assert.match(result.reason, /刀压过高/);
  assert.equal(result.edgeGrade, "C");
});

test("tolerance classification uses the 0.35 mm pass boundary", () => {
  const parts = [
    { id: 1, deviation: 0.35, passed: true, edgeGrade: "B" },
    { id: 2, deviation: 0.351, passed: false, edgeGrade: "C" },
    { id: 3, deviation: 0.12, passed: true, edgeGrade: "A" },
  ];
  const result = evaluateAssembly(parts, {
    A: { quality: { chipDamage: 0, peakSpeed: 200 } },
    B: { quality: { chipDamage: 0, peakSpeed: 200 } },
  });

  assert.equal(result.success, false);
  assert.equal(result.passedCount, 2);
  assert.equal(result.maxDeviation, 0.35);
});
