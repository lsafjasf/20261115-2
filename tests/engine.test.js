import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COLONY_MIN,
  COLONY_START,
  CYCLE_SECONDS,
  SCENARIOS,
  advance,
  createGame,
  setSettings,
  startGame,
} from '../src/engine.js';

function cycleWith(settings) {
  const game = createGame({ settings });
  startGame(game);
  let maxTemp = game.temp;
  while (game.status === 'running') {
    advance(game, 0.25);
    maxTemp = Math.max(maxTemp, game.temp);
  }
  return { game, maxTemp };
}

test('完整授粉周期：三块作物全部坐果，蜂群保持在下限以上', () => {
  const { game } = cycleWith(SCENARIOS.balanced);

  assert.equal(game.t, CYCLE_SECONDS);
  assert.equal(game.status, 'success');
  assert.equal(game.result.success, true);
  assert.equal(game.fruitCount, 3);
  assert.ok(game.crops.every((crop) => crop.ripe));
  assert.ok(game.crops.every((crop) => crop.pollination >= 80));
  assert.ok(game.colonyMinSeen >= COLONY_MIN, `蜂群最低 ${game.colonyMinSeen}`);
  assert.ok(game.colony >= COLONY_START, `周期后蜂群 ${game.colony}`);
  assert.match(game.result.summary, /完整授粉周期/);
});

test('通风不足：热应激出现、蜂群衰弱并跌破安全下限', () => {
  const { game, maxTemp } = cycleWith(SCENARIOS.weakVentilation);

  assert.equal(game.t, CYCLE_SECONDS);
  assert.equal(game.status, 'failed');
  assert.equal(game.result.success, false);
  assert.ok(maxTemp > 29.1, `最低通风场景应形成热应激，最高温 ${maxTemp}`);
  assert.ok(game.colony < COLONY_START, `蜂群应衰弱，最终 ${game.colony}`);
  assert.ok(game.colonyMinSeen < COLONY_MIN, `蜂群最低 ${game.colonyMinSeen}`);
  assert.equal(game.result.colonySafe, false);
  assert.equal(game.result.cropsRipe, false);
  assert.ok(game.events.some((event) => /热应激/.test(event.text)));
  assert.ok(game.events.some((event) => /跌破下限/.test(event.text)));
  const strawberry = game.crops.find((crop) => crop.id === 'strawberry');
  assert.ok(strawberry.residue > 0.09, '低通风时农残应滞留');
});

test('调整通风与遮阳可修复默认局并完成坐果', () => {
  const game = createGame();
  startGame(game);
  advance(game, CYCLE_SECONDS * 0.42);
  assert.equal(game.status, 'running');

  setSettings(game, SCENARIOS.balanced);
  while (game.status === 'running') advance(game, 0.25);

  assert.equal(game.status, 'success');
  assert.equal(game.fruitCount, 3);
  assert.ok(game.colonyMinSeen >= COLONY_MIN);
});
