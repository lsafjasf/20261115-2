import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, SIZES } from '../src/engine.js';

// 自动操作策略：只开当前批次对应料斗；队首药片尺寸不符即剔除；换批先清缓存。
function runAutopilot(game, { clearOnBatch, divertWrong = true } = {}) {
  game.setPaused(SIZES.LARGE, true); // 首批要求 small
  let seenBatch = 0;
  let steps = 0;
  while (game.status === 'running' && steps < 6000) {
    steps += 1;
    if (game.batchIndex !== seenBatch) {
      seenBatch = game.batchIndex;
      const req = game.requiredSize;
      game.setPaused(SIZES.SMALL, req !== SIZES.SMALL);
      game.setPaused(SIZES.LARGE, req !== SIZES.LARGE);
      if (clearOnBatch) game.clearBuffer();
    }
    const front = game.buffer[0];
    game.setDivert(Boolean(divertWrong && front && front.size !== game.requiredSize));
    if (game.activeBottle && game.activeBottle.bad) game.rejectBottle();
    game.update(100);
  }
  return game;
}

test('完整一局：清缓存 + 剔除错药，十二瓶合格且废瓶不超过两瓶', () => {
  const game = new Game({ seed: 20261115 });
  runAutopilot(game, { clearOnBatch: true });

  assert.equal(game.status, 'won');
  assert.equal(game.goodBottles, 12);
  assert.ok(game.wasteBottles <= 2, `废瓶 ${game.wasteBottles} 超过两瓶`);
  assert.equal(game.mixedBatchContaminations, 0);
  const good = game.bottleLog.filter((b) => b.good);
  assert.equal(good.length, 12);
  // 批次结构：每批 3 瓶，共 4 批
  const perBatch = [0, 0, 0, 0];
  for (const b of good) perBatch[b.batch] += 1;
  assert.deepEqual(perBatch, [3, 3, 3, 3]);
  // 错药被剔除机构分流，不进瓶
  assert.ok(game.divertedPills >= 0);
  assert.ok(game.clearActions >= 3, '换批三次都应执行清缓存动作');
});

test('换批未清缓存：上一批药片进入新瓶，判定混批污染', () => {
  const game = new Game({ seed: 20261115 });
  const initialBatch = game.batchIndex;

  // 正常打到第一次换批，换批瞬间什么都不做（不清缓存、不停料斗、不剔除）
  let steps = 0;
  while (game.batchIndex === initialBatch && game.status === 'running' && steps < 6000) {
    const front = game.buffer[0];
    game.setDivert(Boolean(front && front.size !== game.requiredSize));
    game.update(100);
    steps += 1;
  }
  assert.equal(game.batchIndex, 1, '应已进入第二批');
  assert.ok(game.buffer.length > 0, '缓存中应残留上一批药片');

  let contaminated = false;
  steps = 0;
  while (!contaminated && steps < 60) {
    game.setDivert(false); // 未做任何防护
    game.update(100);
    steps += 1;
    contaminated = Boolean(game.activeBottle && game.activeBottle.bad);
  }

  assert.ok(contaminated, '未清缓存必须造成污染');
  assert.equal(game.activeBottle.reason, 'mixed_batch');
  assert.ok(game.mixedBatchContaminations >= 1);

  // 恢复操作：剔除不良瓶、清空缓存、切到正确料斗后继续生产，仍可成功
  game.rejectBottle();
  game.clearBuffer();
  game.setPaused(SIZES.SMALL, game.requiredSize !== SIZES.SMALL);
  game.setPaused(SIZES.LARGE, game.requiredSize !== SIZES.LARGE);
  runAutopilot(game, { clearOnBatch: true });

  assert.equal(game.status, 'won');
  assert.equal(game.goodBottles, 12);
  assert.equal(game.wasteBottles, 1);
  assert.ok(game.bottleLog.some((b) => !b.good && b.reason === 'mixed_batch'));
});

test('暂停料斗与缓存容量约束生效', () => {
  const game = new Game({ seed: 42 });
  game.setPaused(SIZES.SMALL, true);
  game.setPaused(SIZES.LARGE, true);
  game.update(5000);
  assert.equal(game.buffer.length, 0);
  assert.equal(game.hoppers.small.spawned, 0);

  game.setPaused(SIZES.SMALL, false);
  for (let i = 0; i < 200 && game.buffer.length < 8; i++) game.update(100);
  assert.equal(game.buffer.length, 8); // 缓存上限 8，满料不再进料
});
