import assert from "node:assert/strict";
import { test } from "node:test";
import {
  attemptMove,
  advanceTime,
  createGameState,
  getSummary,
  previewMove
} from "../src/game.js";

const stack = (stackId) => ({ type: "stack", stackId });
const ship = (shipId) => ({ type: "ship", shipId });

test("a full six-container shift can be completed without violations", () => {
  const state = createGameState();
  const moves = [
    ["A", ship("star")],
    ["C", stack("D")],
    ["C", ship("star")],
    ["B", ship("wind")],
    ["D", ship("wind")],
    ["B", ship("horizon")],
    ["A", ship("horizon")]
  ];

  for (const [source, destination] of moves) {
    const result = attemptMove(state, source, destination);
    assert.equal(result.ok, true, result.reason);
  }

  const summary = getSummary(state);
  assert.equal(summary.completed, 6);
  assert.equal(summary.missed, 0);
  assert.equal(summary.violations, 0);
  assert.equal(summary.phase, "won");
  assert.equal(summary.passed, true);
  assert.equal(summary.laneClear, true);
  assert.deepEqual(state.stacks, { A: [], B: [], C: [], D: [] });
});

test("a 24t container cannot be stacked on a 12t container", () => {
  const state = createGameState();
  const result = attemptMove(state, "A", stack("B"));

  assert.equal(result.ok, false);
  assert.equal(result.code, "HEAVY_ON_LIGHT");
  assert.match(result.reason, /24t.*12t/);
  assert.deepEqual(state.stacks.A, ["C6", "C1"]);
  assert.deepEqual(state.stacks.B, ["C5", "C4"]);
  assert.equal(state.violations.length, 1);
  assert.equal(state.violations[0].code, "HEAVY_ON_LIGHT");
  assert.equal(state.elapsed, 5);
  assert.equal(state.laneClear, true);
});

test("a 9'6 high cube cannot be placed in the height-limited A row", () => {
  const state = createGameState();
  attemptMove(state, "A", ship("star"));

  const preview = previewMove(state, "B", stack("A"));
  assert.equal(preview.ok, false);
  assert.equal(preview.code, "HIGH_CUBE_LIMIT");
  const result = attemptMove(state, "B", stack("A"));
  assert.equal(result.code, "HIGH_CUBE_LIMIT");
  assert.deepEqual(state.stacks.A, ["C6"]);
  assert.deepEqual(state.stacks.B, ["C5", "C4"]);
});

test("the loading lane always rejects containers and stays clear", () => {
  const state = createGameState();
  const result = attemptMove(state, "A", { type: "lane" });

  assert.equal(result.ok, false);
  assert.equal(result.code, "LANE_BLOCKED");
  assert.equal(state.laneClear, true);
  assert.deepEqual(state.stacks.A, ["C6", "C1"]);
});

test("missed deadlines reduce the final completed count", () => {
  const state = createGameState();
  advanceTime(state, 49);
  assert.deepEqual(state.missed, ["C1", "C3"]);
  assert.equal(state.ships.star.status, "departed");

  attemptMove(state, "B", ship("wind"));
  attemptMove(state, "D", { type: "stack", stackId: "D" });
  advanceTime(state, 90);
  const summary = getSummary(state);
  assert.equal(summary.completed, 1);
  assert.equal(summary.missed, 5);
  assert.equal(summary.phase, "lost");
  assert.equal(summary.passed, false);

  const fresh = createGameState();
  attemptMove(fresh, "A", ship("star"));
  attemptMove(fresh, "C", stack("D"));
  advanceTime(fresh, 49);
  attemptMove(fresh, "B", ship("wind"));
  assert.equal(attemptMove(fresh, "D", ship("wind")).ok, true);
  assert.equal(attemptMove(fresh, "B", ship("horizon")).ok, true);
  assert.equal(attemptMove(fresh, "A", ship("horizon")).ok, true);
  advanceTime(fresh, 89);
  const fiveBoxSummary = getSummary(fresh);
  assert.equal(fiveBoxSummary.completed, 5);
  assert.equal(fiveBoxSummary.missed, 1);
  assert.equal(fiveBoxSummary.phase, "won");
  assert.equal(fiveBoxSummary.passed, true);
});
