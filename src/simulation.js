/*
 * 山区蓄水池供水调度仿真核心（无 DOM 依赖，可在浏览器与 Node 中运行）。
 * 单位：水量 m³，流量 m³/h，时间 h，温度 ℃。
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.WaterSim = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const HOURS = 48;
  const RESERVOIR_CAPACITY = 3000;
  const INITIAL_SNOWPACK = 9000;
  const INITIAL_RESERVOIR = 1500;
  const BASE_INFLOW = 25;
  const OUTLET_CAPACITY = 200;
  const PUMP_CAPACITY = 120;
  const FREEZE_FLOW = 45;
  const BLOCKED_ICE = 1;
  const CLEAR_ICE = 0.5;

  const VILLAGES = [
    { id: 'A', name: '北坡村', peakCenter: 8, color: '#4fc3f7' },
    { id: 'B', name: '河谷村', peakCenter: 12, color: '#81c784' },
    { id: 'C', name: '南山村', peakCenter: 19, color: '#ffb74d' }
  ];

  function round(value, digits) {
    const factor = Math.pow(10, digits || 0);
    return Math.round(value * factor) / factor;
  }

  function cyclicDistance(hour, center) {
    const wrapped = ((hour - center) % 24 + 24) % 24;
    return Math.min(wrapped, 24 - wrapped);
  }

  function createWeather() {
    const weather = [];
    for (let hour = 0; hour <= HOURS; hour += 1) {
      let temp = 5 + 9 * Math.sin(((hour - 9) / 24) * Math.PI * 2);
      if (hour >= 2 && hour <= 5) temp -= 5;
      if (hour >= 26 && hour <= 29) temp -= 7;
      if (hour >= 12 && hour <= 14) temp += 6;
      if (hour >= 36 && hour <= 38) temp += 8;
      weather.push({ hour, temp: round(temp, 1) });
    }
    return weather;
  }

  function sampleWeather(weather, hour) {
    const index = Math.max(0, Math.min(weather.length - 1, Math.floor(hour)));
    const next = Math.min(weather.length - 1, index + 1);
    const fraction = hour - index;
    return weather[index].temp * (1 - fraction) + weather[next].temp * fraction;
  }

  function villageDemand(village, hour) {
    const distance = cyclicDistance(hour, village.peakCenter);
    const peakWave = Math.max(0, 1 - distance / 2);
    return round(12 + 62 * peakWave, 2);
  }

  function isPeakHour(village, hour) {
    return cyclicDistance(hour, village.peakCenter) <= 1;
  }

  function createState(weather) {
    return {
      time: 0,
      weather,
      snowpack: INITIAL_SNOWPACK,
      reservoir: INITIAL_RESERVOIR,
      ice: 0,
      blocked: false,
      canalGate: 0.5,
      outletGate: 0.5,
      pumpSpeed: 0.5,
      temperature: sampleWeather(weather, 0),
      melt: 0,
      inflow: BASE_INFLOW,
      diverted: 0,
      spill: 0,
      release: 0,
      pumpFlow: 0,
      demands: VILLAGES.map((village) => villageDemand(village, 0)),
      delivered: VILLAGES.map(() => 0),
      shortage: VILLAGES.map(() => 0),
      totalShortage: 0,
      peakFailures: 0,
      events: [],
      completed: false
    };
  }

  function addEvent(state, type, message) {
    state.events.unshift({ hour: round(state.time, 1), type, message });
    state.events = state.events.slice(0, 30);
  }

  function calculateMelt(state, temperature, previousTemperature) {
    const warmth = Math.max(0, temperature);
    const heat = Math.max(0, temperature - 8);
    const suddenWarmth = Math.max(0, temperature - previousTemperature - 3) * 28;
    const melt = warmth * 9 + heat * 14 + suddenWarmth;
    return Math.min(state.snowpack, Math.max(0, melt));
  }

  function updateIce(state, temperature, effectivePumpFlow) {
    if (temperature < 0) {
      const freeze = (-temperature) / 45 - effectivePumpFlow / 300;
      state.ice = Math.max(0, state.ice + freeze);
    } else {
      state.ice = Math.max(0, state.ice - temperature / 10 - 0.05);
    }
    if (state.ice >= BLOCKED_ICE && !state.blocked) {
      state.blocked = true;
      addEvent(state, 'block', `管道结冰堵塞（${round(temperature, 1)}℃）`);
    }
    if (state.blocked && state.ice <= CLEAR_ICE) {
      state.blocked = false;
      addEvent(state, 'clear', '管道冰塞融化，供水恢复');
    }
  }

  function step(state, controls) {
    if (state.completed) return state;
    controls = controls || {};
    state.canalGate = clamp(controls.canalGate ?? state.canalGate);
    state.outletGate = clamp(controls.outletGate ?? state.outletGate);
    state.pumpSpeed = clamp(controls.pumpSpeed ?? state.pumpSpeed);

    const previousTemperature = state.temperature;
    const temperature = sampleWeather(state.weather, state.time + 1);
    state.temperature = round(temperature, 1);
    state.melt = round(calculateMelt(state, temperature, previousTemperature), 2);
    state.snowpack = round(Math.max(0, state.snowpack - state.melt), 2);
    state.inflow = round(BASE_INFLOW + state.melt, 2);

    if (temperature - previousTemperature >= 4 && temperature > 0) {
      addEvent(state, 'surge', `升温融雪，来水突增至 ${round(state.inflow, 1)} m³/h`);
    }

    state.diverted = state.inflow * state.canalGate;
    state.spill = 0;
    state.reservoir += state.diverted;
    if (state.reservoir > RESERVOIR_CAPACITY) {
      state.spill = round(state.reservoir - RESERVOIR_CAPACITY, 2);
      state.reservoir = RESERVOIR_CAPACITY;
    }

    state.release = Math.min(state.reservoir, state.outletGate * OUTLET_CAPACITY);
    state.reservoir = round(state.reservoir - state.release, 2);
    state.pumpFlow = state.blocked ? 0 : Math.min(state.release, state.pumpSpeed * PUMP_CAPACITY);

    state.demands = VILLAGES.map((village) => villageDemand(village, state.time + 1));
    const totalDemand = state.demands.reduce((sum, value) => sum + value, 0);
    const availableRatio = totalDemand === 0 ? 1 : Math.min(1, state.pumpFlow / totalDemand);
    state.delivered = state.demands.map((demand) => round(demand * availableRatio, 2));
    state.shortage = state.demands.map((demand, index) => round(demand - state.delivered[index], 2));
    state.totalShortage = round(state.totalShortage + state.shortage.reduce((sum, value) => sum + value, 0), 2);

    VILLAGES.forEach((village, index) => {
      if (isPeakHour(village, state.time + 1) && state.shortage[index] > 2) {
        state.peakFailures += 1;
        addEvent(state, 'failure', `${village.name}高峰断水 ${round(state.shortage[index], 1)} m³/h`);
      }
    });

    updateIce(state, temperature, state.pumpFlow);
    state.time += 1;
    state.completed = state.time >= HOURS;
    return state;
  }

  function clamp(value) {
    return Math.max(0, Math.min(1, Number(value) || 0));
  }

  function autoPolicy(state) {
    const cold = state.temperature < 2;
    const nearPeak = VILLAGES.some((village) => cyclicDistance(state.time + 1, village.peakCenter) <= 1.5);
    let canalGate = cold ? 0.35 : 0.8;
    let outletGate = cold ? 0.55 : 0.45;
    let pumpSpeed = cold ? 0.45 : 0.35;

    if (nearPeak) {
      outletGate = 0.75;
      pumpSpeed = 1;
      canalGate = 0.65;
    }
    if (state.reservoir > 2550) canalGate = 0.15;
    if (state.reservoir < 700) {
      canalGate = 1;
      outletGate = Math.max(0.35, outletGate);
    }
    if (state.blocked) {
      pumpSpeed = 0.8;
      outletGate = 0.25;
    }
    return { canalGate, outletGate, pumpSpeed };
  }

  function runSimulation(weather, policy) {
    const state = createState(weather || createWeather());
    const controller = policy || autoPolicy;
    while (!state.completed) step(state, controller(state));
    return state;
  }

  function runBlockageTest() {
    const weather = Array.from({ length: 10 }, (_, hour) => ({ hour, temp: -12 }));
    const state = createState(weather);
    const timeline = [];
    while (!state.blocked && state.time < 9) {
      step(state, { canalGate: 0.2, outletGate: 0.2, pumpSpeed: 0 });
      timeline.push({
        hour: state.time,
        temp: state.temperature,
        pumpFlow: state.pumpFlow,
        ice: round(state.ice, 3),
        blocked: state.blocked
      });
    }
    return { blocked: state.blocked, blockedAtHour: state.blocked ? state.time : null, timeline, state };
  }

  return {
    HOURS,
    RESERVOIR_CAPACITY,
    PUMP_CAPACITY,
    OUTLET_CAPACITY,
    VILLAGES,
    createWeather,
    sampleWeather,
    villageDemand,
    isPeakHour,
    createState,
    step,
    autoPolicy,
    runSimulation,
    runBlockageTest,
    round
  };
});
