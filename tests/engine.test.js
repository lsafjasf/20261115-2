import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG, createEngine, start, step, crank, setValve } from '../js/engine.js';
import { runDriver } from './drivers.js';

test('正常行程把水从泵房送入未满的池子', () => {
  const engine = createEngine();
  start(engine);
  setValve(engine, 0);
  const before = engine.level;
  const result = crank(engine);
  assert.equal(result.routed, true);
  assert.ok(engine.level < before);
  assert.ok(engine.pools[0].level > 0);
});

test('满池继续送水会回灌泵房并增加热量（错阀）', () => {
  const engine = createEngine();
  start(engine);
  setValve(engine, 0);
  engine.pools[0].level = CONFIG.POOL_CAP;
  engine.level = 50;
  const result = crank(engine);
  assert.equal(result.routed, false);
  assert.equal(engine.level, 50 + CONFIG.BACKFLOW);
  assert.equal(engine.wrongCount, 1);
  assert.ok(engine.heat > 20);
});

test('持续超速摇泵会触发过热锁定，冷却后恢复', () => {
  const engine = createEngine();
  start(engine);
  // 维持高水位，避免在热量爬升前先达成排水目标，本测试只验证热锁定机制。
  engine.level = 100;
  const originalInflow = engine.cfg.INFLOW;
  engine.cfg.INFLOW = 8;
  let guard = 0;
  while (!engine.seized && guard < 20000) {
    crank(engine);
    step(engine, CONFIG.MIN_STROKE);
    guard += 1;
    engine.level = 100;
  }
  engine.cfg.INFLOW = originalInflow;
  assert.ok(engine.seized);
  assert.equal(engine.seizureCount, 1);
  assert.equal(crank(engine).reason, 'seized');
  for (let i = 0; i < 200 && engine.seized; i += 1) step(engine, 0.1);
  assert.equal(engine.seized, false);
  assert.equal(engine.heat, CONFIG.SEIZE_RESET);
});

test('十分钟超时未达安全线则判定失败', () => {
  const engine = createEngine();
  start(engine);
  for (let i = 0; i < 6500 && !engine.finished; i += 1) step(engine, 0.1);
  assert.equal(engine.finished, true);
  assert.equal(engine.success, false);
  assert.ok(Math.abs(engine.timeUsed - CONFIG.DURATION) < 0.5);
});

test('双人分工：在 10 分钟内成功降到安全线且不出现错阀', () => {
  const { engine } = runDriver('duo');
  assert.equal(engine.success, true);
  assert.ok(engine.timeUsed <= CONFIG.DURATION);
  assert.equal(engine.level <= CONFIG.SAFE_LINE, true);
  assert.equal(engine.wrongCount, 0);
});

test('单人兼任：同一玩家无法兼顾节奏与阀门，任务超时失败', () => {
  const { engine } = runDriver('solo');
  assert.equal(engine.finished, true);
  assert.equal(engine.success, false);
  assert.ok(Math.abs(engine.timeUsed - CONFIG.DURATION) < 0.5);
  assert.ok(engine.level > CONFIG.SAFE_LINE);
});
