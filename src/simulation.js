export const CONFIG = Object.freeze({
  totalRounds: 3,
  roundSeconds: 70,
  ideal: Object.freeze({ light: 16, nutrient: 1.9, temp: 21, co2: 850 }),
  thresholds: Object.freeze({
    overheat: 32,
    critical: 38,
    heatRecovery: 30,
    oxygenLow: 19.2,
    oxygenHigh: 23.8,
    waterLow: 4,
  }),
  seedReserveKg: 0.8,
});

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const round = (value, digits = 2) => Number(value.toFixed(digits));

export class GreenhouseSimulation {
  constructor({ onEvent } = {}) {
    this.onEvent = typeof onEvent === "function" ? onEvent : null;
    this.reset();
  }

  reset() {
    this.state = {
      phase: "idle",
      round: 1,
      roundElapsed: 0,
      cycleHours: 6,
      growth: 0,
      quality: 0,
      qualitySum: 0,
      qualitySamples: 0,
      peakTemp: 20.5,
      heatStress: 0,
      oxygenPct: 20.8,
      co2Ppm: 620,
      tempC: 20.5,
      waterL: 28,
      waterRecovered: 0,
      seedStock: 1,
      seedReserveKg: 0,
      pantryKg: 0,
      pumpOn: true,
      overheatAlerts: 0,
      overheatNotified: false,
      criticalNotified: false,
      oxygenWarning: false,
      waterWarning: false,
      controls: {
        light: 14,
        nutrient: 1.8,
        temp: 21,
        co2: 850,
      },
      harvests: [],
      events: [],
    };
  }

  emit(type, message, severity = "info", meta = {}) {
    const event = {
      type,
      message,
      severity,
      at: round(this.state.roundElapsed, 1),
      round: this.state.round,
      ...meta,
    };
    this.state.events.unshift(event);
    this.state.events = this.state.events.slice(0, 40);
    this.onEvent?.(event);
  }

  setControl(key, value) {
    if (!(key in this.state.controls)) return;
    this.state.controls[key] = Number(value);
    if (key === "light") this.state.controls.light = clamp(Math.round(value), 6, 21);
  }

  togglePump(force) {
    this.state.pumpOn = typeof force === "boolean" ? force : !this.state.pumpOn;
    this.emit(
      "pump",
      this.state.pumpOn ? "循环泵启动，冷却回路接通。" : "循环泵停机，废热开始积聚。",
      this.state.pumpOn ? "info" : "warn",
    );
    return this.state.pumpOn;
  }

  startRound() {
    const { state } = this;
    if (!["idle", "interplant"].includes(state.phase)) return false;
    if (state.seedStock < 1) {
      this.emit("seed", "种薯库存不足，无法开始下一批。", "danger");
      return false;
    }

    state.seedStock -= 1;
    state.phase = "growing";
    state.roundElapsed = 0;
    state.cycleHours = 6;
    state.growth = 0;
    state.quality = 0;
    state.qualitySum = 0;
    state.qualitySamples = 0;
    state.heatStress = 0;
    state.overheatNotified = false;
    state.criticalNotified = false;
    state.peakTemp = state.tempC;
    this.emit("plant", `第 ${state.round} 批种薯已入水培床，开始生长。`);
    return true;
  }

  getLightState() {
    const elapsedSinceDawn = (this.state.cycleHours - 6 + 24) % 24;
    return {
      isLight: elapsedSinceDawn < this.state.controls.light,
      hoursSinceDawn: elapsedSinceDawn,
    };
  }

  getCanopy() {
    return this.state.phase === "idle" ? 0 : clamp(this.state.growth / 100, 0.06, 1);
  }

  computeQuality() {
    const { controls } = this.state;
    const lightFit = clamp(1 - Math.abs(controls.light - CONFIG.ideal.light) / 15, 0.18, 1);
    const tempDelta = Math.abs(this.state.tempC - CONFIG.ideal.temp);
    const tempFit = clamp(1 - Math.max(0, tempDelta - 3) / 14, 0.06, 1);
    const nutrientFit = clamp(1 - Math.abs(controls.nutrient - CONFIG.ideal.nutrient) / 1.35, 0.1, 1);
    const co2Fit = this.state.co2Ppm < 430
      ? 0.3
      : clamp(0.93 + (this.state.co2Ppm - 430) / 9000, 0.3, 1);
    const oxygenFit = clamp((this.state.oxygenPct - 17.4) / 3.4, 0.15, 1);
    const waterFit = clamp(this.state.waterL / 7, 0.1, 1);

    const quality = (
      lightFit * 0.27
      + tempFit * 0.28
      + nutrientFit * 0.19
      + co2Fit * 0.16
      + oxygenFit * 0.05
      + waterFit * 0.05
    ) * (this.state.tempC >= CONFIG.thresholds.critical ? 0.55 : 1);

    return {
      value: clamp(quality, 0.05, 1),
      lightFit,
      tempFit,
      nutrientFit,
      co2Fit,
      oxygenFit,
      waterFit,
    };
  }

  updateTemperatures(dt) {
    const { state } = this;
    const target = state.controls.temp;
    const heatBias = (state.controls.light - 14) * 0.045 + 0.035;
    const pumpOffset = state.pumpOn ? 0.07 : 0;
    const naturalDelta = (target - state.tempC) * 0.18 + heatBias - pumpOffset;
    const maxHeat = 0.28;
    const maxCool = state.pumpOn ? -0.34 : -0.11;
    const delta = clamp(naturalDelta, maxCool, maxHeat);

    state.tempC += delta * dt;
    state.tempC = clamp(state.tempC, 10, 48);
    state.peakTemp = Math.max(state.peakTemp, state.tempC);

    if (state.tempC >= CONFIG.thresholds.overheat) {
      state.heatStress = clamp(state.heatStress + (state.tempC - 31) * 0.11 * dt, 0, 100);
      if (!state.overheatNotified) {
        state.overheatNotified = true;
        state.overheatAlerts += 1;
        this.emit(
          "overheat",
          `热区告警：舱温 ${state.tempC.toFixed(1)}°C。开启循环泵并下调温控目标。`,
          "danger",
          { temp: round(state.tempC, 1) },
        );
      }
      if (state.tempC >= CONFIG.thresholds.critical && !state.criticalNotified) {
        state.criticalNotified = true;
        this.emit("critical", "极端热负荷：叶片气孔关闭，生长效率下降。", "danger");
      }
    } else {
      state.heatStress = clamp(state.heatStress - 0.13 * dt, 0, 100);
      if (state.tempC < CONFIG.thresholds.heatRecovery && state.overheatNotified) {
        state.overheatNotified = false;
        this.emit("recovered", "循环泵已带离废热，热区恢复稳定。", "info");
      }
    }
  }

  updateResources(dt, quality) {
    const { state } = this;
    const light = this.getLightState().isLight;
    const canopy = this.getCanopy();
    const nutrientLoad = clamp(0.68 + state.controls.nutrient * 0.18, 0.72, 1.3);

    const transpiration = canopy * (light ? 0.075 : 0.028) * nutrientLoad;
    const pumpDraw = state.pumpOn ? 0.006 : 0;
    const recovered = transpiration * 0.68;
    state.waterL = Math.max(0, state.waterL - transpiration * 0.32 * dt - pumpDraw * dt);
    state.waterRecovered += recovered * dt;

    const photosynthesisO2 = light ? 0.0165 * canopy * quality.co2Fit : 0;
    const plantRespiration = 0.0045 * canopy;
    const crewRespiration = 0.0065;
    state.oxygenPct += (photosynthesisO2 - plantRespiration - crewRespiration) * dt;
    if (state.oxygenPct > 24.2) {
      state.oxygenPct -= (state.oxygenPct - 24.2) * 0.08 * dt;
    }
    state.oxygenPct = clamp(state.oxygenPct, 15, 25);

    const cropUptake = light ? canopy * (7.2 + quality.value * 4.8) : 0;
    const respirationCo2 = canopy * 3 + 2.2;
    const injection = clamp((state.controls.co2 - state.co2Ppm) * 0.075, 0, 20);
    state.co2Ppm += (respirationCo2 + injection - cropUptake) * dt;
    state.co2Ppm = clamp(state.co2Ppm, 280, 1450);

    if (state.oxygenPct < CONFIG.thresholds.oxygenLow && !state.oxygenWarning) {
      state.oxygenWarning = true;
      this.emit("oxygen", "氧气偏低：增加光照时段，让作物恢复光合作用。", "warn");
    } else if (state.oxygenPct > CONFIG.thresholds.oxygenLow + 0.8) {
      state.oxygenWarning = false;
    }

    if (state.waterL < CONFIG.thresholds.waterLow && !state.waterWarning) {
      state.waterWarning = true;
      this.emit("water", "水培储水偏低：冷凝回收已满负荷运行。", "warn");
    } else if (state.waterL > CONFIG.thresholds.waterLow + 2) {
      state.waterWarning = false;
    }
  }

  update(dt) {
    const { state } = this;
    if (state.phase !== "growing" || !Number.isFinite(dt) || dt <= 0) return;
    const step = Math.min(dt, 0.5);

    state.roundElapsed += step;
    state.cycleHours = (6 + state.roundElapsed * 0.32) % 24;
    this.updateTemperatures(step);

    const quality = this.computeQuality();
    state.quality = quality.value;
    state.qualitySum += quality.value * step;
    state.qualitySamples += step;
    this.updateResources(step, quality);

    const heatPenalty = 1 - state.heatStress / 150;
    let growthRate = (100 / CONFIG.roundSeconds) * 1.12 * quality.value * heatPenalty;
    if (state.waterL <= 0.1 || state.oxygenPct < 17) growthRate = -0.9;
    state.growth = clamp(state.growth + growthRate * step, 0, 100);

    if (state.growth >= 100) {
      state.growth = 100;
      state.phase = "ready";
      this.emit("mature", `第 ${state.round} 批土豆成熟，等待收获并预留下轮种薯。`, "success");
    }
  }

  advance(seconds, step = 1 / 20) {
    let remaining = Math.max(0, Number(seconds) || 0);
    while (remaining > 0) {
      const slice = Math.min(step, remaining);
      this.update(slice);
      remaining -= slice;
      if (this.state.phase !== "growing") break;
    }
  }

  getAverageQuality() {
    const { qualitySum, qualitySamples } = this.state;
    return qualitySamples > 0 ? qualitySum / qualitySamples : this.state.quality;
  }

  harvest() {
    const { state } = this;
    if (state.phase !== "ready") return null;

    const averageQuality = this.getAverageQuality();
    const heatLoss = state.heatStress / 210;
    const yieldKg = round(clamp(3.1 + 3.9 * averageQuality - heatLoss, 2.4, 7.2), 1);
    const edibleKg = round(Math.max(0, yieldKg - CONFIG.seedReserveKg), 1);
    const completedRound = state.round;
    const record = {
      round: completedRound,
      yieldKg,
      edibleKg,
      reservedKg: CONFIG.seedReserveKg,
      averageQuality: round(averageQuality, 2),
      heatStress: round(state.heatStress, 0),
      peakTemp: round(state.peakTemp, 1),
      oxygenPct: round(state.oxygenPct, 2),
      waterL: round(state.waterL, 1),
    };

    state.harvests.push(record);
    state.pantryKg = round(state.pantryKg + edibleKg, 1);
    state.seedStock += 1;
    state.seedReserveKg = CONFIG.seedReserveKg;
    this.emit(
      "harvest",
      `收获 ${yieldKg.toFixed(1)} kg，其中 ${CONFIG.seedReserveKg.toFixed(1)} kg 留作种薯。`,
      "success",
    );

    if (completedRound >= CONFIG.totalRounds) {
      state.phase = "complete";
      this.emit("complete", "三批土豆全部收获，月面温室氧气与种薯库存完成闭环。", "success");
    } else {
      state.round = completedRound + 1;
      state.phase = "interplant";
    }
    return record;
  }

  getSummary() {
    const { state } = this;
    const averageQuality = this.getAverageQuality();
    return {
      rounds: state.harvests.length,
      pantryKg: state.pantryKg,
      seedStock: state.seedStock,
      seedReserveKg: state.seedReserveKg,
      totalYieldKg: round(state.harvests.reduce((sum, item) => sum + item.yieldKg, 0), 1),
      averageQuality,
      peakTemp: state.harvests.reduce((peak, item) => Math.max(peak, item.peakTemp), state.peakTemp),
      overheatAlerts: state.overheatAlerts,
      oxygenPct: state.oxygenPct,
      waterL: state.waterL,
    };
  }
}
