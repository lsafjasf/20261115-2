import test from 'node:test';
import assert from 'node:assert/strict';
import { SlitterSim } from '../src/engine.js';
import { ORDERS, NOMINAL_TRIM, WASTE_TARGET_PERCENT } from '../src/config.js';

function runUntil(sim, maxSteps = 200000, dt = 0.1) {
  let steps = 0;
  while (sim.status === 'running' && steps < maxSteps) {
    sim.tick(dt);
    steps++;
  }
  return steps;
}

test('默认刀位不满足订单公差，autoAlign 后全部合格', () => {
  const sim = new SlitterSim();
  assert.equal(sim.allKnivesAligned, false);
  sim.autoAlignKnives();
  assert.deepEqual(sim.stripWidths, ORDERS.map((o) => o.width));
  assert.equal(sim.trimWidths.left, NOMINAL_TRIM);
  assert.equal(sim.trimWidths.right, NOMINAL_TRIM);
  assert.equal(sim.allKnivesAligned, true);
});

test('正确工况下四种订单精确完成且废边达标', () => {
  const sim = new SlitterSim(Math.random);
  sim.timeScale = 10;
  sim.autoAlignKnives();
  sim.setTension(55);
  sim.setSpeed(200);
  sim.start();
  runUntil(sim);
  assert.equal(sim.status, 'complete');
  assert.deepEqual(sim.produced, ORDERS.map((o) => o.target));
  assert.equal(sim.allOrdersExact, true);
  assert.ok(sim.wastePercent <= WASTE_TARGET_PERCENT,
    `废边率 ${sim.wastePercent}% 应不超过 ${WASTE_TARGET_PERCENT}%`);
  assert.equal(sim.succeeded, true);
});

test('高张力必然在有限时间内断纸并停机', () => {
  const trials = [];
  for (let i = 0; i < 25; i++) {
    const sim = new SlitterSim(Math.random);
    sim.timeScale = 4;
    sim.autoAlignKnives();
    sim.setTension(100);
    sim.setSpeed(220);
    sim.start();
    runUntil(sim);
    assert.equal(sim.status, 'broken');
    assert.equal(sim.speed, 0);
    trials.push(sim.breakAt);
  }
  const maxBreak = Math.max(...trials);
  assert.ok(maxBreak < 30, `断纸时间过长: ${maxBreak}s`);
});

test('正常张力下长时间运行不会断纸', () => {
  for (let i = 0; i < 10; i++) {
    const sim = new SlitterSim(Math.random);
    sim.autoAlignKnives();
    sim.setTension(55);
    sim.setSpeed(200);
    sim.start();
    runUntil(sim);
    assert.notEqual(sim.status, 'broken');
  }
});

test('刀距不合格时走纸计入废品且不能成功', () => {
  const sim = new SlitterSim(() => 0.5);
  sim.timeScale = 10;
  sim.setTension(55);
  sim.setSpeed(200);
  sim.start();
  sim.tick(6);
  assert.ok(sim.offspecMeters > 0);
  assert.equal(sim.allKnivesAligned, false);
});

test('运行中禁止移动分切刀', () => {
  const sim = new SlitterSim();
  sim.start();
  assert.throws(() => sim.setKnife(0, 200));
  assert.throws(() => sim.setKnives([200, 630, 1010, 1470, 1890]));
});

test('setKnives 按输入顺序设置并自动排序', () => {
  const sim = new SlitterSim();
  sim.setKnives([1890, 110, 1470, 630, 1010]);
  assert.deepEqual(sim.knives, [110, 630, 1010, 1470, 1890]);
  assert.equal(sim.allKnivesAligned, true);
});

test('低张力高速下偏移增大，超过废边余量产生边缘缺陷', () => {
  const sim = new SlitterSim(() => 0.95);
  sim.timeScale = 10;
  // 刀距合格但两侧废边只有 20mm，对刀余量严重不足
  let x = 20;
  sim.knives = [x];
  for (const o of ORDERS) {
    x += o.width;
    sim.knives.push(x);
  }
  sim.setTension(5);
  sim.setSpeed(300);
  sim.start();
  for (let i = 0; i < 200 && sim.status === 'running'; i++) sim.tick(0.1);
  assert.ok(Math.abs(sim.offset) > 0);
  assert.ok(sim.defectMeters > 0, '应产生边缘缺陷报废');
  assert.ok(sim.wastePercent > WASTE_TARGET_PERCENT);
});
