import test from "node:test";
import assert from "node:assert/strict";
import { PrintShopGame } from "../src/engine.js";

const setupJob = (game, id, layout, ink) => {
  assert.equal(game.chooseLayout(id, layout), true);
  assert.equal(game.chooseInk(id, ink), true);
};

const runUntil = (game, predicate, limit = 20) => {
  let elapsed = 0;
  while (!predicate() && elapsed < limit) {
    game.tick(0.05);
    elapsed += 0.05;
  }
  return elapsed;
};

test("a full duplex cycle consumes one paper run, waits for drying, flips, then finishes", () => {
  const game = new PrintShopGame();
  setupJob(game, "midnight", "columns", "cyan");
  assert.equal(game.start("midnight"), true);
  assert.equal(game.pressState, "printing");

  runUntil(game, () => game.jobs[0].stage === "drying");
  const job = game.jobs[0];
  assert.equal(job.stage, "drying");
  assert.equal(game.roll.main, 3);
  assert.ok(job.dryRemaining > 0);

  runUntil(game, () => job.stage === "ready_flip", job.dryTime + 1);
  assert.equal(job.stage, "ready_flip");
  assert.equal(game.flipJob("midnight"), true);
  assert.equal(job.stage, "ready_b");

  assert.equal(game.start("midnight"), true);
  runUntil(game, () => job.stage === "done");
  assert.equal(job.stage, "done");
  assert.equal(game.completed, 1);
  assert.equal(game.roll.main, 3);
  assert.equal(game.gameState, "playing");
});

test("wrong plate or ink registration scraps the entire batch", () => {
  const game = new PrintShopGame();
  setupJob(game, "midnight", "poster", "magenta");
  assert.equal(game.start("midnight"), false);
  assert.equal(game.pressState, "idle");
  assert.equal(game.jobs[0].stage, "queued");
  assert.equal(game.waste, 4);
  assert.match(game.message.text, /报废|错配|对版|废纸箱/);
});

test("unattended live registration at sprint speed scraps the whole batch", () => {
  const game = new PrintShopGame();
  setupJob(game, "lastbus", "ticket", "gold");
  game.setSpeed(3);
  assert.equal(game.start("lastbus"), true);
  runUntil(game, () => game.pressState === "idle", 8);
  assert.equal(game.jobs[2].stage, "queued");
  assert.equal(game.waste, 6);
  assert.match(game.events.at(-1).text, /套色|报废/);
});

test("an empty main roll stops the press and switching backup safely resumes the same run", () => {
  const game = new PrintShopGame({ mainRollSheets: 2, backupRollSheets: 14 });
  setupJob(game, "midnight", "columns", "cyan");
  assert.equal(game.start("midnight"), true);

  runUntil(game, () => game.pressState === "out_of_paper");
  assert.equal(game.pressState, "out_of_paper");
  assert.equal(game.roll.main, 0);
  assert.equal(game.roll.backup, 14);
  assert.equal(game.run.side, "A");
  assert.ok(game.run.progress < game.jobs[0].copies);
  assert.equal(game.waste, 0);

  assert.equal(game.switchPaperRoll(), true);
  assert.equal(game.roll.active, "backup");
  assert.equal(game.waste, 1);
  assert.equal(game.pressState, "printing");
  assert.equal(game.run.side, "A");

  runUntil(game, () => game.jobs[0].stage === "drying");
  assert.equal(game.jobs[0].stage, "drying");
  assert.equal(game.roll.backup, 12);
});

test("an unattended paper outage starts adding waste before the next shift", () => {
  const game = new PrintShopGame({ mainRollSheets: 0, backupRollSheets: 14 });
  setupJob(game, "midnight", "columns", "cyan");
  assert.equal(game.start("midnight"), false);
  assert.equal(game.pressState, "out_of_paper");
  runUntil(game, () => game.waste >= 1, 10);
  assert.equal(game.waste, 1);
  assert.equal(game.gameState, "playing");
  assert.equal(game.switchPaperRoll(), true);
  assert.equal(game.waste, 2);
});
