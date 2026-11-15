"use strict";

const assert = require("node:assert/strict");
const physics = require("../physics.js");

const nearPass = {
  speed: 30,
  duration: 12,
  listenerX: 0,
  listenerOffset: 7,
};

const geometry = physics.getPassGeometry(nearPass);
assert.equal(geometry.pathLength, 360);
assert.equal(geometry.startX, -180);
assert.equal(geometry.endX, 180);
assert.equal(geometry.passProgress, 0.5);

const approaching = physics.getAcousticState(-180, nearPass);
const atPass = physics.getAcousticState(0, nearPass);
const receding = physics.getAcousticState(180, nearPass);

assert.ok(approaching.observedFrequency > physics.SOURCE_FREQUENCY);
assert.ok(receding.observedFrequency < physics.SOURCE_FREQUENCY);
assert.equal(atPass.observedFrequency, physics.SOURCE_FREQUENCY);
assert.ok(approaching.radialVelocity > 0);
assert.ok(receding.radialVelocity < 0);
assert.ok(atPass.distance < approaching.distance);
assert.ok(atPass.gain > approaching.gain);
assert.ok(atPass.filterCutoff > approaching.filterCutoff);
assert.ok(approaching.pan < 0);
assert.ok(receding.pan > 0);

const stationary = { ...nearPass, speed: 0 };
const stationaryAnalysis = physics.analyzePass(stationary);
assert.ok(Math.abs(stationaryAnalysis.maxFrequency - 392) < 1e-9);
assert.ok(Math.abs(stationaryAnalysis.minFrequency - 392) < 1e-9);
assert.equal(stationaryAnalysis.maxCents, 0);

const movingAnalysis = physics.analyzePass(nearPass, 1001);
assert.ok(movingAnalysis.maxFrequency > stationaryAnalysis.maxFrequency);
assert.ok(movingAnalysis.minFrequency < stationaryAnalysis.minFrequency);
assert.ok(movingAnalysis.maxCents > 150);
assert.ok(movingAnalysis.minCents < -140);
assert.ok(Math.abs(movingAnalysis.closestDistance - 7) < 1e-6);

assert.equal(physics.centsBetween(784), 1200);
assert.equal(physics.centsBetween(196), -1200);
assert.equal(physics.centsBetween(392), 0);

console.log("physics tests passed");
