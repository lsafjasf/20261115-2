import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createGame,
  runToEnd,
  stepGame,
  setDelay,
  setRoute,
  setSpeedLimit,
  makeTideCurve,
  SEGMENTS,
  STEP,
  SIM_DURATION,
  PATH,
  MAX_DECEL,
} from '../src/engine.js';

const coastal = (speedLimit, dwell) => ({ route: 'coastal', speedLimit, dwell });
const bypass = (speedLimit, dwell) => ({ route: 'bypass', speedLimit, dwell });

test('固定 seed 生成完全一致的潮汐曲线', () => {
  const a = makeTideCurve(20261115);
  const b = makeTideCurve(20261115);
  const c = makeTideCurve(999);
  for (let t = 0; t <= SIM_DURATION; t += STEP * 37) {
    assert.equal(a(t), b(t), '同 seed 潮位应逐点相同');
  }
  assert.notEqual(a(400), c(400), '不同 seed 潮位应不同');
});

test('沿海抢潮：三车在涨潮前全部到达终点即成功', () => {
  const game = createGame({
    trains: [coastal(26, 20), coastal(26, 20), coastal(26, 20)],
  });
  runToEnd(game);
  assert.equal(game.status, 'success');
  assert.ok(game.trains.every((t) => t.status === 'finished'));
  assert.ok(game.events.some((e) => e.type === 'game_success'));
});

test('内陆绕行：低速长停也能安全完成', () => {
  const game = createGame({
    trains: [bypass(10, 90), bypass(10, 90), bypass(10, 90)],
  });
  runToEnd(game);
  assert.equal(game.status, 'success');
  for (const train of game.trains) {
    assert.equal(train.status, 'finished');
    assert.ok(train.visitedStations.has('neilu'));
    assert.ok(train.finishedAt < SIM_DURATION);
  }
});

test('等潮退：车辆段延迟发车，退潮后走沿海线成功', () => {
  const game = createGame({
    trains: [coastal(14, 40), coastal(14, 40), coastal(14, 40)],
  });
  for (let i = 0; i < 3; i++) setDelay(game, i, 950);
  runToEnd(game);
  assert.equal(game.status, 'success', game.failReason);
  assert.ok(game.trains[0].finishedAt > 1000);
});

test('漏看水位：涨潮时高速冲入自动封锁区段，判涉水事故失败', () => {
  const game = createGame({
    trains: [coastal(26, 20), coastal(26, 20), coastal(26, 20)],
  });
  // 调度员未盯潮水，统一延迟到涨潮窗口内发车
  for (let i = 0; i < 3; i++) setDelay(game, i, 220);
  runToEnd(game);

  assert.equal(game.status, 'failed');
  const crash = game.events.find((e) => e.type === 'train_crashed');
  assert.ok(crash, '必须产生列车事故事件');
  assert.match(crash.reason, /涉水/);

  const floodedSegment = SEGMENTS.find((s) => s.id === crash.segmentId);
  assert.ok(floodedSegment.route === 'coastal');
  assert.ok(game.waterLevel >= floodedSegment.elevation);

  // 事故前必须先有该区段（或相邻沿海段）的自动封锁事件
  const floodBeforeCrash = game.events
    .filter((e) => e.type === 'segment_flooded' && e.t <= crash.t)
    .map((e) => e.segmentId);
  assert.ok(floodBeforeCrash.includes(crash.segmentId));
});

test('同序列低速对照：提前制动可在封锁信号机外停车，退潮后成功', () => {
  const game = createGame({
    trains: [coastal(10, 20), coastal(10, 20), coastal(10, 20)],
  });
  for (let i = 0; i < 3; i++) setDelay(game, i, 220);
  runToEnd(game);
  assert.equal(game.status, 'success', game.failReason);
  assert.equal(game.events.some((e) => e.type === 'train_crashed'), false);
  // 确实经历过封锁并安全等待
  assert.ok(game.events.some((e) => e.type === 'segment_flooded'));
  assert.ok(game.trains.some((t) => t.status === 'finished' && t.finishedAt > 800));
});

test('惯性物理：高速制动距离显著大于低速', () => {
  const d26 = (26 * 26) / (2 * MAX_DECEL);
  const d10 = (10 * 10) / (2 * MAX_DECEL);
  assert.ok(d26 > 250 && d10 < 50);
});

test('道岔在越过 1 号道岔后锁定，不可再改路线', () => {
  const game = createGame({ trains: [coastal(18, 40), coastal(18, 40), coastal(18, 40)] });
  assert.equal(setRoute(game, 0, 'bypass'), true);
  while (game.status === 'running' && game.trains[0].position <= PATH.coastal[1].end) {
    stepGame(game);
  }
  assert.equal(setRoute(game, 0, 'coastal'), false);
});

test('限速调整立即影响后续牵引目标', () => {
  const game = createGame({ trains: [coastal(26, 20), coastal(26, 20), coastal(26, 20)] });
  setSpeedLimit(game, 0, 10);
  for (let i = 0; i < 60 && game.status === 'running'; i++) stepGame(game);
  assert.ok(game.trains[0].speed <= 10.5);
});

test('潮位窗口超时未完成判失败', () => {
  const game = createGame({
    trains: [coastal(10, 90), coastal(10, 90), coastal(10, 90)],
  });
  for (let i = 0; i < 3; i++) setDelay(game, i, 1700);
  runToEnd(game);
  assert.equal(game.status, 'failed');
  assert.match(game.failReason, /超时/);
});
