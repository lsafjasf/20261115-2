// 潜水舱氧气 / 压力仿真引擎（无 DOM 依赖，浏览器与 Node 共用）
// 舱内气体使用集总参数模型：
//   P   总压 (kPa)，x 为氧气摩尔分数
//   供氧阀注入富氧混合气（40% O2），泄压阀按比例排出舱内混合气体，
//   乘员持续消耗氧气（只减少氧分压，不改变总压中的其他组分）。

export const CONFIG = {
  STEP: 0.1, // 固定仿真步长 (s)
  SUPPLY_RATE: 10, // 供氧阀全开时的进气速率 (kPa/s)
  VENT_RATE: 0.12, // 泄压阀每单位开度、每 kPa 舱压的排气速率系数
  CONSUMPTION: 0.12, // 乘员氧气消耗速率 (氧分压 kPa/s)
  SUPPLY_O2_FRACTION: 0.4, // 供给气体的氧浓度（富氧混合气）
  VALVE_RATE: 0.5, // 阀门开度每秒最大变化量
  STABLE_TIME: 30, // 安全区内需要稳定的秒数
  SEAL_TIME: 20, // 紧急封闭后的锁定恢复时间 (s)
  P_SAFE: [98, 112], // 压力安全区 (kPa)
  P_HARD: [85, 125], // 压力紧急封闭边界 (kPa)
  O2_SAFE: [19.5, 23.5], // 氧浓度安全区 (%)
  O2_HARD: [14, 26], // 氧浓度紧急封闭边界 (%)
  INITIAL: { pressure: 92, o2: 17.5, supply: 0, vent: 0 },
};

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export class ChamberSim {
  constructor(config = CONFIG) {
    this.cfg = config;
    this.reset();
  }

  reset() {
    const { INITIAL } = this.cfg;
    this.time = 0;
    this.pressure = INITIAL.pressure;
    this.o2Fraction = INITIAL.o2 / 100;
    this.supply = INITIAL.supply; // 供氧阀实际开度 0..1
    this.vent = INITIAL.vent; // 泄压阀实际开度 0..1
    this.supplyTarget = INITIAL.supply;
    this.ventTarget = INITIAL.vent;
    this.sealed = false;
    this.sealRemaining = 0;
    this.sealCount = 0;
    this.stableTimer = 0;
    this.stable = false;
    this.mode = 'running'; // running | sealed | stable
    this.lastTrigger = null; // 最近一次触发封闭的原因
    this.leakRate = 0; // 外部泄漏造成的总压损失 (kPa/s)
    this.inflow = 0;
    this.outflow = 0;
    return this.snapshot();
  }

  get o2() {
    return this.o2Fraction * 100;
  }

  get safe() {
    const [pLo, pHi] = this.cfg.P_SAFE;
    const [oLo, oHi] = this.cfg.O2_SAFE;
    return (
      this.pressure >= pLo &&
      this.pressure <= pHi &&
      this.o2 >= oLo &&
      this.o2 <= oHi
    );
  }

  setSupplyTarget(v) {
    this.supplyTarget = clamp(v, 0, 1);
  }

  setVentTarget(v) {
    this.ventTarget = clamp(v, 0, 1);
  }

  // 以固定速率微调阀门（模拟按键按住的效果）
  adjustSupply(delta) {
    this.setSupplyTarget(this.supplyTarget + delta);
  }

  adjustVent(delta) {
    this.setVentTarget(this.ventTarget + delta);
  }

  addLeak(rate) {
    this.leakRate = Math.max(0, rate);
  }

  removeLeak() {
    this.leakRate = 0;
  }

  triggerSeal(reason) {
    if (this.sealed || this.stable) return;
    this.sealed = true;
    this.mode = 'sealed';
    this.sealRemaining = this.cfg.SEAL_TIME;
    this.sealCount += 1;
    this.lastTrigger = { reason, time: this.time, pressure: this.pressure, o2: this.o2 };
    this.supplyTarget = 0;
    this.ventTarget = 0;
  }

  step(dt = this.cfg.STEP) {
    this.time += dt;

    // 阀门机械动作：实际开度以有限速率跟踪目标开度
    const move = this.cfg.VALVE_RATE * dt;
    this.supply += clamp(this.supplyTarget - this.supply, -move, move);
    this.vent += clamp(this.ventTarget - this.vent, -move, move);

    if (this.sealed) {
      // 紧急封闭：两阀锁死，仅保留乘员耗氧与自然泄漏
      this.sealRemaining -= dt;
      this.supply = 0;
      this.vent = 0;
      this.inflow = 0;
      this.outflow = 0;
      if (this.sealRemaining <= 0) {
        this.sealed = false;
        this.mode = 'running';
        this.sealRemaining = 0;
      }
    } else {
      this.inflow = this.cfg.SUPPLY_RATE * this.supply;
      this.outflow = this.cfg.VENT_RATE * this.vent * this.pressure;
    }

    const c = this.cfg;
    const leak = this.leakRate;
    // 总压：进气 - 排气 - 乘员占用体积折算 - 外漏
    const dPressure =
      this.inflow - this.outflow - c.CONSUMPTION - leak;
    // 氧分压变化：富氧进气带入 - 排气按当前浓度带走 - 乘员纯耗氧 - 泄漏按浓度带走
    const dO2Partial =
      c.SUPPLY_O2_FRACTION * this.inflow -
      this.o2Fraction * this.outflow -
      c.CONSUMPTION -
      this.o2Fraction * leak;

    this.pressure = Math.max(0, this.pressure + dPressure * dt);
    const nextPartial = this.o2Fraction * this.pressure + dO2Partial * dt;
    this.o2Fraction = clamp(nextPartial / this.pressure, 0, 1);

    if (!this.sealed && !this.stable) this._checkEmergency();
    this._updateStability(dt);
    return this.snapshot();
  }

  _checkEmergency() {
    const [pLo, pHi] = this.cfg.P_HARD;
    const [oLo, oHi] = this.cfg.O2_HARD;
    if (this.pressure >= pHi) return this.triggerSeal('压力过冲上限');
    if (this.pressure <= pLo) return this.triggerSeal('压力跌破下限');
    if (this.o2 >= oHi) return this.triggerSeal('氧浓度过冲上限');
    if (this.o2 <= oLo) return this.triggerSeal('氧浓度跌破下限');
  }

  _updateStability(dt) {
    if (this.stable || this.sealed) {
      if (this.sealed) this.stableTimer = 0;
      return;
    }
    if (this.safe) {
      this.stableTimer += dt;
      if (this.stableTimer >= this.cfg.STABLE_TIME) {
        this.stable = true;
        this.mode = 'stable';
      }
    } else {
      this.stableTimer = 0;
    }
  }

  snapshot() {
    return {
      time: this.time,
      pressure: this.pressure,
      o2: this.o2,
      supply: this.supply,
      vent: this.vent,
      supplyTarget: this.supplyTarget,
      ventTarget: this.ventTarget,
      inflow: this.inflow,
      outflow: this.outflow,
      leak: this.leakRate,
      sealed: this.sealed,
      sealRemaining: this.sealRemaining,
      sealCount: this.sealCount,
      safe: this.safe,
      stableTimer: this.stableTimer,
      stable: this.stable,
      mode: this.mode,
      lastTrigger: this.lastTrigger,
    };
  }
}
