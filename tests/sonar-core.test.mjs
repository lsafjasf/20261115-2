import test from "node:test";
import assert from "node:assert/strict";
import {
  SURVEY_SPEC,
  bearingBetween,
  computeReturns,
  generateSurvey,
  moveListener,
  normalizeDeg,
  polarToCartesian,
  rangeFromDelay,
  resolvePlot
} from "../js/sonar-core.js";

test("bearing is north-zero and clockwise", () => {
  const listener = { x: 0, y: 0 };
  assert.equal(bearingBetween(listener, { x: 0, y: -10 }), 0);
  assert.equal(bearingBetween(listener, { x: 10, y: 0 }), 90);
  assert.equal(bearingBetween(listener, { x: 0, y: 10 }), 180);
  assert.equal(bearingBetween(listener, { x: -10, y: 0 }), 270);
});

test("survey contacts resolve into exact beam returns", () => {
  const targets = generateSurvey(384);
  targets.forEach((target) => {
    const bearing = bearingBetween({ x: 0, y: 0 }, target);
    const range = Math.hypot(target.x, target.y);
    const echoes = computeReturns({ x: 0, y: 0 }, bearing, targets);
    const echo = echoes.find((item) => item.targetId === target.id);
    assert.ok(echo, `${target.id} should return inside its bearing beam`);
    assert.ok(Math.abs(echo.range - range) < 0.001);
    assert.ok(Math.abs(rangeFromDelay(echo.delay) - echo.range) < 0.001);
    assert.ok(Math.abs(echo.pan) < 0.04);
  });
});

test("beam rejects contacts outside the emission sector", () => {
  const target = { id: "test", kind: "obstacle", x: 0, y: -20 };
  assert.equal(computeReturns({ x: 0, y: 0 }, 30, [target]).length, 0);
  assert.equal(computeReturns({ x: 0, y: 0 }, 8, [target]).length, 1);
});

test("plot resolution checks range and signature", () => {
  const target = { id: "beacon", kind: "beacon", x: 0, y: -20 };
  assert.equal(resolvePlot({ x: 1, y: -20 }, "beacon", [target]).status, "confirmed");
  assert.equal(resolvePlot({ x: 1, y: -20 }, "obstacle", [target]).status, "mismatch");
  assert.equal(resolvePlot({ x: 8, y: -20 }, "beacon", [target]).status, "unresolved");
  assert.equal(resolvePlot({ x: 0, y: -20 }, "beacon", [target], new Set(["beacon"])).status, "occupied");
});

test("listener drive stays inside the survey disc", () => {
  const listener = moveListener({ x: 0, y: 0 }, 100, 100);
  assert.ok(Math.hypot(listener.x, listener.y) <= SURVEY_SPEC.listenerLimit + 0.001);
  assert.equal(normalizeDeg(-15), 345);
  const east = polarToCartesian(90, 10);
  assert.ok(Math.abs(east.x - 10) < 1e-9);
  assert.ok(Math.abs(east.y) < 1e-9);
});
