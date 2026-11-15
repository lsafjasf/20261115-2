export const CONFIG = Object.freeze({
  duration: 600,
  nominalHz: 50,
  safeMin: 49.5,
  safeMax: 50.5,
  faultAt: 35,
  pvNormal: 18.5,
  pvFaulted: 8.5,
  batteryMax: 6,
  batteryRamp: 0.75,
  batteryDelay: 0.7,
  gasMin: 3.5,
  gasMax: 10,
  gasRamp: 0.5,
  gasDelay: 1.2,
  frequencyStiffness: 0.18,
  frequencyDamping: 0.5,
  droop: 0.067,
  tripGrace: 1.25,
});

export const LOADS = Object.freeze([
  { id: "hospital", name: "医院", mw: 4, critical: true, color: "#4ce3a2" },
  { id: "telecom", name: "通信站", mw: 2.5, critical: true, color: "#56b9ff" },
  { id: "industrial", name: "工业产线", mw: 6, critical: false, color: "#ffb75e" },
  { id: "commercial", name: "商业园区", mw: 5, critical: false, color: "#d48cff" },
  { id: "residential", name: "居民社区", mw: 4.5, critical: false, color: "#67d7d4" },
]);

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const approach = (value, target, rate, dt) => {
  const step = rate * dt;
  return Math.abs(target - value) <= step ? target : value + Math.sign(target - value) * step;
};

function createDevice(target, actual, ramp, delay) {
  return {
    target,
    actual,
    ramp,
    delay,
    hold: 0,
    lastCommandAt: -99,
    lastDirection: 0,
    commands: 0,
    rapidCycles: 0,
    wear: 0,
  };
}

function createLoad(load) {
  return {
    ...load,
    targetFraction: 1,
    fraction: 1,
    ramp: load.critical ? 0 : 0.25,
    hold: 0,
    lastCommandAt: -99,
    lastDirection: 0,
    commands: 0,
    rapidCycles: 0,
    wear: 0,
  };
}

export class MicrogridSimulation {
  constructor({ autoStart = true } = {}) {
    this.config = CONFIG;
    this.time = 0;
    this.status = autoStart ? "running" : "idle";
    this.faultTriggered = false;
    this.recoveryAchieved = false;
    this.recoveryAt = null;
    this.failed = false;
    this.failureReason = "";
    this.outOfBandFor = 0;
    this.violationSeconds = 0;
    this.maxDeviation = 0;
    this.safeSeconds = 0;
    this.events = [];
    this.frequency = CONFIG.nominalHz;
    this.frequencyRate = 0;
    this.pvPower = CONFIG.pvNormal;
    this.battery = createDevice(0, 0, CONFIG.batteryRamp, CONFIG.batteryDelay);
    this.gas = createDevice(
      CONFIG.gasMin,
      CONFIG.gasMin,
      CONFIG.gasRamp,
      CONFIG.gasDelay,
    );
    this.loads = LOADS.map(createLoad);
    this.history = [{ t: 0, hz: CONFIG.nominalHz, pv: this.pvPower, load: this.demand, supply: this.supply }];
    this.historyClock = 0;
    this.stableClock = 0;
    this.addEvent("info", "孤网运行稳定，频率 50.00 Hz。等待光伏阵列遥测。");
  }

  get demand() {
    return this.loads.reduce((sum, load) => sum + load.mw * load.fraction, 0);
  }

  get supply() {
    return this.pvPower + this.battery.actual + this.gas.actual;
  }

  get balance() {
    return this.supply - this.demand;
  }

  get maxWear() {
    const devices = [this.battery, this.gas, ...this.loads.filter((load) => !load.critical)];
    return Math.max(0, ...devices.map((device) => device.wear));
  }

  addEvent(type, message) {
    this.events.unshift({ t: this.time, type, message });
    if (this.events.length > 30) this.events.pop();
  }

  commandDevice(key, target) {
    if (this.status !== "running") return false;
    const device = key === "battery" ? this.battery : this.gas;
    const range = key === "battery" ? CONFIG.batteryMax : CONFIG.gasMax - CONFIG.gasMin;
    const next = clamp(Number(target), key === "battery" ? 0 : CONFIG.gasMin, key === "battery" ? CONFIG.batteryMax : CONFIG.gasMax);
    if (Math.abs(next - device.target) < 0.01) return false;
    this.recordCommand(
      key,
      device,
      Math.abs(next - device.target) / Math.max(range, 0.1),
      Math.sign(next - device.target),
    );
    device.target = next;
    device.hold = key === "battery" ? CONFIG.batteryDelay : CONFIG.gasDelay;
    return true;
  }

  toggleLoad(id) {
    if (this.status !== "running") return false;
    const load = this.loads.find((item) => item.id === id);
    if (!load || load.critical) return false;
    load.targetFraction = load.targetFraction > 0 ? 0 : 1;
    load.hold = 0.35;
    this.recordCommand(id, load, 1, load.targetFraction > 0 ? 1 : -1);
    return true;
  }

  recordCommand(key, device, normalizedChange, direction = 1) {
    const gap = this.time - device.lastCommandAt;
    let penalty = 0.35 + normalizedChange * 3.2;
    const reversed = device.lastDirection !== 0 && direction !== device.lastDirection && gap < 6;
    if (reversed) {
      penalty += (6 - gap) * 1.65;
      device.rapidCycles += 1;
      this.frequencyRate += (device.rapidCycles % 2 ? 1 : -1) * Math.min(0.055, 0.012 * device.rapidCycles);
    }
    device.wear = clamp(device.wear + penalty, 0, 100);
    device.lastCommandAt = this.time;
    device.lastDirection = direction;
    device.commands += 1;
    if (device.rapidCycles === 3) {
      this.addEvent("warn", `${this.deviceName(key)} 调节过于频繁，执行机构出现抖动。`);
    }
  }

  deviceName(key) {
    return { battery: "储能", gas: "燃气机组", industrial: "工业产线", commercial: "商业园区", residential: "居民社区" }[key] || key;
  }

  triggerFault() {
    if (this.faultTriggered || this.status !== "running") return;
    this.faultTriggered = true;
    this.pvPower = CONFIG.pvFaulted;
    this.addEvent("danger", `光伏阵列出力骤降 ${(CONFIG.pvNormal - CONFIG.pvFaulted).toFixed(1)} MW，频率开始下坠。`);
  }

  updateDevice(device, dt) {
    if (device.hold > 0) {
      device.hold = Math.max(0, device.hold - dt);
      return;
    }
    device.actual = approach(device.actual, device.target, device.ramp, dt);
  }

  updateLoad(load, dt) {
    if (load.critical) return;
    if (load.hold > 0) {
      load.hold = Math.max(0, load.hold - dt);
      return;
    }
    load.fraction = approach(load.fraction, load.targetFraction, load.ramp, dt);
  }

  updateFrequency(dt) {
    const wearChatter =
      (this.battery.wear + this.gas.wear) / 100 * 0.018 * Math.sin(this.time * 3.7);
    const target = CONFIG.nominalHz + clamp(this.balance * CONFIG.droop, -2.2, 2.2);
    this.frequencyRate +=
      ((target - this.frequency) * CONFIG.frequencyStiffness -
        (this.frequencyRate - wearChatter) * CONFIG.frequencyDamping) *
      dt;
    this.frequency += this.frequencyRate * dt;
    this.maxDeviation = Math.max(this.maxDeviation, Math.abs(this.frequency - CONFIG.nominalHz));
  }

  updateSafety(dt) {
    const inBand = this.frequency >= CONFIG.safeMin && this.frequency <= CONFIG.safeMax;
    if (inBand) {
      this.outOfBandFor = 0;
      this.safeSeconds += dt;
      if (this.faultTriggered && !this.recoveryAchieved) {
        this.stableClock += dt;
        if (this.stableClock >= 8 && Math.abs(this.balance) < 4.2) {
          this.recoveryAchieved = true;
          this.recoveryAt = this.time;
          this.addEvent("success", "频率恢复稳定，重要负荷保供正常。继续守到演练结束。");
        }
      }
    } else if (this.status === "running") {
      this.stableClock = 0;
      this.outOfBandFor += dt;
      this.violationSeconds += dt;
      if (this.outOfBandFor >= CONFIG.tripGrace) {
        this.failed = true;
        this.status = "failed";
        this.failureReason = this.frequency < CONFIG.safeMin ? "低频保护跳闸" : "高频保护跳闸";
        this.addEvent("danger", `${this.failureReason}：频率越限超过 ${CONFIG.tripGrace.toFixed(2)} 秒。`);
      }
    }
    if (this.outOfBandFor > 0 && this.outOfBandFor - dt <= 0.001) {
      this.addEvent("warn", "频率越过安全边界，立即增加支撑或削减可中断负荷！");
    }
  }

  tick(rawDt = 0.1) {
    if (this.status !== "running") return this.snapshot();
    let dt = clamp(Number(rawDt) || 0, 0, 0.5);
    while (dt > 0) {
      const step = Math.min(dt, 0.05);
      this.advance(step);
      dt -= step;
      if (this.status !== "running") break;
    }
    return this.snapshot();
  }

  advance(dt) {
    this.time += dt;
    if (!this.faultTriggered && this.time >= CONFIG.faultAt) this.triggerFault();
    this.updateDevice(this.battery, dt);
    this.updateDevice(this.gas, dt);
    for (const load of this.loads) this.updateLoad(load, dt);
    this.updateFrequency(dt);
    this.updateSafety(dt);
    this.historyClock += dt;
    if (this.historyClock >= 1) {
      this.historyClock = 0;
      this.history.push({
        t: this.time,
        hz: this.frequency,
        pv: this.pvPower,
        load: this.demand,
        supply: this.supply,
      });
      if (this.history.length > 900) this.history.shift();
    }
    if (this.time >= CONFIG.duration && this.status === "running") {
      if (this.violationSeconds > 0.001) {
        this.failed = true;
        this.failureReason ||= "频率曾在安全范围外运行";
      }
      this.status = this.failed ? "failed" : "success";
      if (this.failed) {
        this.addEvent("danger", "演练结束：曾发生频率越限，任务未达成。");
      } else {
        this.addEvent("success", "十分钟演练完成：频率全程保持在安全范围。");
      }
    }
  }

  snapshot() {
    const source = (device) => ({
      target: device.target,
      actual: device.actual,
      wear: device.wear,
      commands: device.commands,
      rapidCycles: device.rapidCycles,
      delayLeft: device.hold,
      ramping: device.hold > 0 || Math.abs(device.actual - device.target) > 0.01,
    });
    return {
      time: this.time,
      status: this.status,
      frequency: this.frequency,
      frequencyRate: this.frequencyRate,
      balance: this.balance,
      supply: this.supply,
      demand: this.demand,
      pvPower: this.pvPower,
      faultTriggered: this.faultTriggered,
      recoveryAchieved: this.recoveryAchieved,
      recoveryAt: this.recoveryAt,
      failed: this.failed,
      failureReason: this.failureReason,
      outOfBandFor: this.outOfBandFor,
      violationSeconds: this.violationSeconds,
      maxDeviation: this.maxDeviation,
      safeSeconds: this.safeSeconds,
      maxWear: this.maxWear,
      battery: source(this.battery),
      gas: source(this.gas),
      loads: this.loads.map((load) => ({
        id: load.id,
        name: load.name,
        mw: load.mw,
        critical: load.critical,
        color: load.color,
        actual: load.mw * load.fraction,
        fraction: load.fraction,
        targetFraction: load.targetFraction,
        wear: load.wear,
        commands: load.commands,
        rapidCycles: load.rapidCycles,
        ramping: load.hold > 0 || Math.abs(load.fraction - load.targetFraction) > 0.01,
      })),
      history: this.history,
      events: this.events,
      config: CONFIG,
    };
  }
}
