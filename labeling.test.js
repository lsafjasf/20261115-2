/* Node 验证：固定参数通关 + 缺陷判定 + 暂停 + 重置 */
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('./labeling-core.js');

const {
  LabelingEngine,
  judgeLabel,
  IDEAL_PARAMS,
  DEFAULT_PARAMS,
  STATION_X,
  TARGET
} = C;

function runSeconds(engine, seconds, dt = 1 / 60) {
  let events = [];
  for (let t = 0; t < seconds; t += dt) {
    events = events.concat(engine.step(dt));
  }
  return events;
}

test('理想参数判定合格，无任何缺陷', () => {
  const result = judgeLabel(IDEAL_PARAMS);
  assert.equal(result.pass, true);
  assert.deepEqual(result.defects, []);
  assert.ok(result.metrics.bubbleScore < C.TOLERANCE.bubble);
});

test('缺胶翘边、多胶拉丝、转速失配扭转、压轮偏移、气泡分别可触发', () => {
  assert.deepEqual(judgeLabel({ spin: 80, glue: 10, angle: 0 }).defects, ['edgeLift']);
  assert.deepEqual(judgeLabel({ spin: 80, glue: 95, angle: 0 }).defects, ['stringing']);
  assert.deepEqual(judgeLabel({ spin: 120, glue: 50, angle: 0 }).defects, ['twist', 'bubbles']);
  assert.deepEqual(judgeLabel({ spin: 80, glue: 50, angle: 12 }).defects, ['offset', 'bubbles']);
});

test('固定理想参数运行，前 12 瓶全部合格并触发完成事件', () => {
  const engine = new LabelingEngine(IDEAL_PARAMS);
  const seen = [];
  // 第 12 瓶到达检查线约需 (11*2) + 0.82/速度 ≈ 31 秒，给足 45 秒
  const events = runSeconds(engine, 45);
  for (const event of events) {
    if (event.type === 'judged') seen.push(event);
  }
  assert.equal(engine.finished, true);
  assert.equal(engine.passCount, TARGET);
  assert.equal(engine.failCount, 0);
  assert.equal(seen.length, TARGET);
  assert.ok(seen.every((e) => e.pass));
  assert.ok(events.some((e) => e.type === 'finished'));
});

test('暂停期间状态完全冻结，恢复后继续推进', () => {
  const engine = new LabelingEngine(IDEAL_PARAMS);
  runSeconds(engine, 5);
  engine.setPaused(true);
  const frozen = engine.getState();
  const pausedEvents = runSeconds(engine, 3);
  const after = engine.getState();
  assert.equal(after.time, frozen.time);
  assert.equal(after.bottles.length, frozen.bottles.length);
  assert.deepEqual(
    after.bottles.map((b) => b.x),
    frozen.bottles.map((b) => b.x)
  );
  assert.ok(pausedEvents.every((e) => e.type !== 'judged'));

  engine.setPaused(false);
  runSeconds(engine, 2);
  assert.ok(engine.time > frozen.time);
  assert.equal(engine.finished, false);
});

test('重置恢复初始参数并清空全部进度', () => {
  const engine = new LabelingEngine(IDEAL_PARAMS);
  runSeconds(engine, 10);
  assert.ok(engine.passCount > 0 || engine.bottles.length > 0);
  engine.reset();
  const state = engine.getState();
  assert.deepEqual(state.params, DEFAULT_PARAMS);
  assert.equal(state.time, 0);
  assert.equal(state.bottles.length, 0);
  assert.equal(state.passCount, 0);
  assert.equal(state.failCount, 0);
  assert.equal(state.paused, false);
  assert.equal(state.finished, false);
  assert.equal(state.history.length, 0);
  // 重置后仍可正常重新运行
  engine.params = Object.assign({}, IDEAL_PARAMS);
  runSeconds(engine, 45);
  assert.equal(engine.passCount, TARGET);
});

test('运行中实时改参数，后续瓶子按新参数判定', () => {
  const engine = new LabelingEngine(DEFAULT_PARAMS);
  runSeconds(engine, 6);
  engine.setParam('spin', IDEAL_PARAMS.spin);
  engine.setParam('glue', IDEAL_PARAMS.glue);
  engine.setParam('angle', IDEAL_PARAMS.angle);
  runSeconds(engine, 40);
  assert.equal(engine.finished, true);
  assert.equal(engine.passCount, TARGET);
  // 默认参数下早期瓶子应出现不合格
  assert.ok(engine.failCount >= 1);
});

test('工位顺序与缠绕快照确定性', () => {
  assert.ok(STATION_X.GLUE < STATION_X.WRAP);
  assert.ok(STATION_X.WRAP < STATION_X.PRESS);
  assert.ok(STATION_X.PRESS < STATION_X.INSPECT);
  const a = judgeLabel(IDEAL_PARAMS);
  const b = judgeLabel(IDEAL_PARAMS);
  assert.deepEqual(a, b);
});
