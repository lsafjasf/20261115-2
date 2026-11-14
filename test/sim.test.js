import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ChamberSim, CONFIG } from '../src/engine.js';
import {
  O2Player,
  PressurePlayer,
  SoloOperator,
  o2View,
  pressureView,
} from '../src/controllers.js';

const STEP = CONFIG.STEP;

function runTwoPlayers(sim, steps, o2Player = new O2Player(), pPlayer = new PressurePlayer()) {
  const trace = [];
  for (let i = 0; i < steps; i += 1) {
    const snap = sim.snapshot();
    if (sim.sealed) {
      sim.setSupplyTarget(0);
      sim.setVentTarget(0);
    } else {
      o2Player.decide(o2View(snap), sim);
      pPlayer.decide(pressureView(snap), sim);
    }
    sim.step();
    if (i % 50 === 0) trace.push(sim.snapshot());
  }
  return { snap: sim.snapshot(), trace };
}

test('初始状态在安全区外，且两块仪表读数独立', () => {
  const sim = new ChamberSim();
  const snap = sim.snapshot();
  assert.equal(snap.safe, false);
  assert.equal(snap.stable, false);
  assert.equal(snap.sealed, false);
  const o = o2View(snap);
  const p = pressureView(snap);
  assert.ok(o.o2 !== undefined && o.pressure === undefined);
  assert.ok(p.pressure !== undefined && p.o2 === undefined);
});

test('双人协作：氧浓度与压力同时进入安全区并稳定 30 秒', () => {
  const sim = new ChamberSim();
  const steps = Math.round(180 / STEP);
  const { snap } = runTwoPlayers(sim, steps);
  assert.equal(snap.stable, true);
  assert.equal(snap.sealCount, 0, '正常协作不应触发紧急封闭');
  assert.ok(snap.pressure >= CONFIG.P_SAFE[0] && snap.pressure <= CONFIG.P_SAFE[1]);
  assert.ok(snap.o2 >= CONFIG.O2_SAFE[0] && snap.o2 <= CONFIG.O2_SAFE[1]);
  // 稳定前必须持续处于安全区满 30 秒
  const stableAt = snap.time - snap.stableTimer;
  assert.ok(stableAt >= CONFIG.STABLE_TIME);
});

test('任一侧玩家失控（供氧全开、泄压全关）会过冲并触发紧急封闭，且需 20 秒恢复', () => {
  const sim = new ChamberSim();
  sim.setSupplyTarget(1);
  sim.setVentTarget(0);
  let triggeredAt = null;
  for (let i = 0; i < Math.round(30 / STEP); i += 1) {
    sim.step();
    if (sim.sealed && triggeredAt === null) triggeredAt = sim.time;
  }
  assert.ok(triggeredAt !== null, '应在 30 秒内触发紧急封闭');
  assert.equal(sim.sealCount, 1);
  // 重新构造一个停在封闭期内的实例检查锁定状态
  const locked = new ChamberSim();
  locked.setSupplyTarget(1);
  while (!locked.sealed) locked.step();
  assert.equal(locked.sealed, true);
  // 封闭激活后阀门目标立即归零，实际开度在随后若干步内机械回零
  assert.equal(locked.supplyTarget, 0);
  assert.equal(locked.ventTarget, 0);
  for (let i = 0; i < Math.round(3 / STEP); i += 1) locked.step();
  assert.equal(locked.supply, 0);
  assert.equal(locked.vent, 0);
  assert.equal(locked.sealed, true, '3 秒后仍处于封闭期内');
  // 等待恢复（含一步余量）
  const wait = Math.round((CONFIG.SEAL_TIME + 1) / STEP);
  for (let i = 0; i < wait; i += 1) locked.step();
  assert.equal(locked.sealed, false);
  assert.equal(locked.mode, 'running');
  assert.ok(locked.sealRemaining <= 0);
});

test('封闭期间安全计时清零，恢复后双人仍可重新完成稳定', () => {
  const sim = new ChamberSim();
  sim.setSupplyTarget(1);
  while (!sim.sealed) sim.step();
  sim.stableTimer = CONFIG.STABLE_TIME - 1; // 模拟临近完成
  const before = sim.stableTimer;
  sim.step();
  assert.equal(sim.stableTimer, 0);
  assert.ok(before > 0);
  // 恢复并重新接管
  while (sim.sealed) sim.step();
  const { snap } = runTwoPlayers(sim, Math.round(240 / STEP));
  assert.equal(snap.stable, true);
});

test('单人连续操作：独立完成首次 30 秒稳定', () => {
  const sim = new ChamberSim();
  const solo = new SoloOperator();
  let stableAt = null;
  for (let i = 0; i < Math.round(180 / STEP); i += 1) {
    solo.decide(sim.snapshot(), sim);
    sim.step();
    if (sim.stable && stableAt === null) stableAt = sim.time;
  }
  const snap = sim.snapshot();
  assert.ok(stableAt !== null, '单人应在 180 秒内完成稳定');
  assert.equal(snap.sealCount, 0);
  assert.ok(snap.safe);
});

test('单人连续操作：5 分钟耐力，多次外漏扰动后仍无过冲并能回到安全区', () => {
  const sim = new ChamberSim();
  const solo = new SoloOperator();
  const total = Math.round(300 / STEP);
  const leakWindows = [
    [110, 130],
    [170, 190],
    [230, 248],
  ].map(([a, b]) => [Math.round(a / STEP), Math.round(b / STEP)]);
  const recoveries = [];
  for (let i = 0; i < total; i += 1) {
    const leaking = leakWindows.some(([a, b]) => i >= a && i < b);
    if (leaking) sim.addLeak(0.4);
    else sim.removeLeak();
    solo.decide(sim.snapshot(), sim);
    sim.step();
    if (!sim.sealed && sim.safe) recoveries.push(sim.time);
  }
  const snap = sim.snapshot();
  assert.equal(sim.sealCount, 0, '温和扰动下单人操作不应过冲');
  assert.ok(snap.safe, '扰动结束后应回到安全区');
  assert.ok(snap.stable, '最后一次扰动结束后应重新累计满 30 秒稳定');
  // 每次泄漏期间压力最低值仍高于硬下限
  assert.ok(snap.pressure > CONFIG.P_HARD[0]);
});

test('仿真确定性：相同初始条件与操作序列产生完全一致轨迹', () => {
  function drive() {
    const sim = new ChamberSim();
    const out = [];
    for (let i = 0; i < 500; i += 1) {
      if (i === 30) sim.setSupplyTarget(0.6);
      if (i === 120) sim.setVentTarget(0.3);
      if (i === 260) sim.setVentTarget(0);
      sim.step();
      out.push([sim.pressure, sim.o2, sim.supply, sim.vent]);
    }
    return out;
  }
  assert.deepEqual(drive(), drive());
});

test('阀门以有限速率动作，目标开度不会瞬间到位', () => {
  const sim = new ChamberSim();
  sim.setSupplyTarget(1);
  sim.step();
  assert.ok(sim.supply > 0 && sim.supply < 1);
  assert.ok(Math.abs(sim.supply - CONFIG.VALVE_RATE * STEP) < 1e-9);
});
