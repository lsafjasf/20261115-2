// 双人控制器与单人连续操作控制器。
// 两名玩家是独立智能体：O2Player 只读取氧浓度、只控制供氧阀；
// PressurePlayer 只读取压力、只控制泄压阀。它们互相看不到对方的仪表。

import { CONFIG } from './engine.js';

const clamp01 = (v) => Math.min(1, Math.max(0, v));

// 左玩家：供氧阀。信息输入仅为氧浓度（以及自己阀门的目标开度）。
export class O2Player {
  constructor(target = 21.5, gain = 0.16, deadband = 0.35) {
    this.target = target;
    this.gain = gain;
    this.deadband = deadband;
    this.name = '左玩家(供氧阀)';
  }

  // view: 该玩家可见的仪表信息 —— 只有氧浓度，没有压力
  decide(view, sim) {
    const err = this.target - view.o2;
    if (Math.abs(err) <= this.deadband) return; // 死区内保持当前开度
    sim.adjustSupply(err * this.gain);
    sim.supplyTarget = clamp01(sim.supplyTarget);
  }
}

// 右玩家：泄压阀。信息输入仅为压力。
export class PressurePlayer {
  constructor(target = 105, gain = 0.05, deadband = 0.6) {
    this.target = target;
    this.gain = gain;
    this.deadband = deadband;
    this.name = '右玩家(泄压阀)';
  }

  decide(view, sim) {
    const err = view.pressure - this.target;
    if (Math.abs(err) <= this.deadband) return;
    // 压力高于目标 -> 加大泄压；低于目标 -> 关小泄压
    sim.adjustVent(err * this.gain);
    sim.ventTarget = clamp01(sim.ventTarget);
  }
}

// 单人连续操作：同一操作者同时看两块仪表、左右手各管一个阀。
// 直接复用两名玩家各自的比例控制律，但由一个大脑在每个节拍同时下发，
// 并在紧急封闭期间统一停手等待恢复。
export class SoloOperator {
  constructor() {
    this.o2 = new O2Player(21.5, 0.18, 0.3);
    this.pressure = new PressurePlayer(105, 0.06, 0.5);
    this.name = '单人连续操作';
    this.tick = 0;
  }

  decide(view, sim) {
    this.tick += 1;
    if (sim.sealed) {
      sim.setSupplyTarget(0);
      sim.setVentTarget(0);
      return;
    }
    // 稳定达成后仍继续维持工况（乘员持续耗氧，不能撒手）
    this.o2.decide(view, sim);
    this.pressure.decide(view, sim);
  }
}

// 给双人玩家各自构造受限视图：仪表信息隔离
export function o2View(snapshot) {
  return { o2: snapshot.o2 };
}

export function pressureView(snapshot) {
  return { pressure: snapshot.pressure };
}

// 让双人协作跑若干步，返回最终快照
export function runCooperative(sim, o2Player, pPlayer, steps) {
  for (let i = 0; i < steps; i += 1) {
    const snap = sim.snapshot();
    if (!sim.sealed) {
      o2Player.decide(o2View(snap), sim);
      pPlayer.decide(pressureView(snap), sim);
    } else {
      sim.setSupplyTarget(0);
      sim.setVentTarget(0);
    }
    sim.step();
  }
  return sim.snapshot();
}

export { CONFIG };
