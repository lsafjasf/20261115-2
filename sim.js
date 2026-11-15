// 混凝土养护模拟核心(纯逻辑,浏览器与 Node 通用)
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CuringSim = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var HOURS_PER_DAY = 24;
  var TOTAL_DAYS = 7;
  var TOTAL_HOURS = HOURS_PER_DAY * TOTAL_DAYS;

  var TARGET_STRENGTH = 25;      // 目标强度 MPa
  var MAX_STRENGTH = 38;         // 强度上限 MPa
  var CRACK_THRESHOLD = 8;       // 裂缝面积阈值 %
  var DRY_CRACK_MOISTURE = 25;   // 表面湿度低于此值且蒸发强则开裂
  var COLD_SHOCK_DROP = 5;       // 3 小时温降超过此值惩罚强度

  var WEATHER_EVENTS = [
    { type: 'wind',     name: '大风', wind: 8, tempShift: -2, humidity: -20, duration: 6 },
    { type: 'heatwave', name: '热浪', wind: 1, tempShift: 8,  humidity: -15, duration: 8 },
    { type: 'coldsnap', name: '寒潮', wind: 3, tempShift: -9, humidity: 0,   duration: 10 },
    { type: 'rain',     name: '阵雨', wind: 2, tempShift: -3, humidity: 30,  duration: 5 }
  ];

  function createRng(seed) {
    var s = seed >>> 0;
    return function () {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  function createGame(options) {
    options = options || {};
    var rng = createRng(options.seed == null ? 12345 : options.seed);
    var state = {
      hour: 0,
      surfaceMoisture: 85,
      internalMoisture: 90,
      slabTemp: 22,
      strength: 2,
      crackArea: 0,
      crackCells: [],
      covered: false,
      ventilating: false,
      sprayHoursLeft: 0,
      ambientTemp: 22,
      ambientHumidity: 60,
      windSpeed: 2,
      event: null,
      eventHoursLeft: 0,
      nextEventHour: 12 + Math.floor(rng() * 12),
      evapRate: 0,
      tempHistory: [22],
      log: [],
      over: false,
      won: false
    };
    for (var i = 0; i < 40; i++) state.crackCells.push(0);
    return state;
  }

  function ambientBase(hour) {
    var h = hour % 24;
    return 22 + 8 * Math.sin((h - 10) / 24 * Math.PI * 2);
  }

  function logEvent(state, msg) {
    state.log.push({ hour: state.hour, msg: msg });
  }

  function maybeTriggerEvent(state, rng) {
    if (state.eventHoursLeft > 0) return;
    if (state.hour >= state.nextEventHour && state.hour < TOTAL_HOURS - 6) {
      var ev = WEATHER_EVENTS[Math.floor(rng() * WEATHER_EVENTS.length)];
      state.event = ev;
      state.eventHoursLeft = ev.duration;
      state.nextEventHour = state.hour + ev.duration + 10 + Math.floor(rng() * 18);
      logEvent(state, '天气突变:' + ev.name + '来袭!');
    }
  }

  function step(state, rng) {
    if (state.over) return state;
    rng = rng || Math.random;

    maybeTriggerEvent(state, rng);

    // --- 环境 ---
    var ev = state.eventHoursLeft > 0 ? state.event : null;
    if (state.eventHoursLeft > 0) state.eventHoursLeft--;
    if (state.eventHoursLeft === 0 && state.event) {
      logEvent(state, state.event.name + '结束。');
      state.event = null;
    }
    var tempShift = ev ? ev.tempShift : 0;
    var wind = ev ? ev.wind : 2;
    var humidShift = ev ? ev.humidity : 0;
    state.ambientTemp = ambientBase(state.hour) + tempShift + (rng() - 0.5) * 1.5;
    state.ambientHumidity = clamp(60 + humidShift + (rng() - 0.5) * 8, 10, 100);
    state.windSpeed = wind;

    // --- 板温(热惯性,覆盖减缓,通风加速交换) ---
    var exchange = state.ventilating ? 0.35 : 0.12;
    if (state.covered) exchange *= 0.4;
    state.slabTemp += (state.ambientTemp - state.slabTemp) * exchange;
    state.tempHistory.push(state.slabTemp);
    if (state.tempHistory.length > 4) state.tempHistory.shift();

    // 温度骤降惩罚
    var drop3h = state.tempHistory[0] - state.slabTemp;
    if (drop3h > COLD_SHOCK_DROP) {
      var loss = (drop3h - COLD_SHOCK_DROP) * 0.4;
      state.strength = Math.max(0, state.strength - loss);
      logEvent(state, '温度骤降 ' + drop3h.toFixed(1) + '℃,强度损失 ' + loss.toFixed(1) + ' MPa!');
    }

    // --- 蒸发 ---
    var evap = 0.6
      + Math.max(0, state.ambientTemp - 15) * 0.12
      + wind * 0.35
      + Math.max(0, 60 - state.ambientHumidity) * 0.02;
    if (state.ventilating) evap *= 1.6;
    if (state.covered) evap *= 0.25;
    state.evapRate = evap;

    // --- 湿度 ---
    if (state.sprayHoursLeft > 0) {
      state.surfaceMoisture += 18;
      state.internalMoisture += 2;
      state.sprayHoursLeft--;
    }
    if (ev && ev.type === 'rain') state.surfaceMoisture += 10;
    var migration = (state.internalMoisture - state.surfaceMoisture) * 0.08;
    state.surfaceMoisture += migration;
    state.internalMoisture -= migration * 0.5;
    state.surfaceMoisture -= evap * (0.4 + state.surfaceMoisture / 100);
    state.internalMoisture -= evap * 0.08 * (state.covered ? 0.3 : 1);
    state.surfaceMoisture = clamp(state.surfaceMoisture, 0, 100);
    state.internalMoisture = clamp(state.internalMoisture, 0, 100);

    // --- 开裂 ---
    if (state.surfaceMoisture < DRY_CRACK_MOISTURE && evap > 2.5) {
      var growth = (DRY_CRACK_MOISTURE - state.surfaceMoisture) * 0.02 * (evap / 4);
      state.crackArea = clamp(state.crackArea + growth, 0, 100);
      var idx = Math.floor(rng() * state.crackCells.length);
      state.crackCells[idx] = Math.min(1, state.crackCells[idx] + growth * 0.5);
      for (var k = 0; k < state.crackCells.length; k++) {
        if (state.crackCells[k] > 0 && rng() < 0.3) {
          var nb = (k + (rng() < 0.5 ? 1 : state.crackCells.length - 1)) % state.crackCells.length;
          state.crackCells[nb] = Math.min(1, state.crackCells[nb] + growth * 0.3);
        }
      }
    }

    // --- 强度增长(成熟度法) ---
    var tempFactor = state.slabTemp <= 0 ? 0 : Math.pow((state.slabTemp + 10) / 30, 1.5);
    var moistFactor = clamp(state.internalMoisture / 70, 0, 1);
    var gain = 0.22 * tempFactor * moistFactor;
    state.strength = Math.min(MAX_STRENGTH, state.strength + gain);

    // --- 结束判定 ---
    state.hour++;
    if (state.hour >= TOTAL_HOURS) {
      state.over = true;
      state.won = state.strength >= TARGET_STRENGTH && state.crackArea < CRACK_THRESHOLD;
      logEvent(state, state.won
        ? '养护成功!强度 ' + state.strength.toFixed(1) + ' MPa,裂缝 ' + state.crackArea.toFixed(1) + '%'
        : '养护失败。强度 ' + state.strength.toFixed(1) + '/' + TARGET_STRENGTH
          + ' MPa,裂缝 ' + state.crackArea.toFixed(1) + '/' + CRACK_THRESHOLD + '%');
    }
    return state;
  }

  return {
    createGame: createGame,
    step: step,
    createRng: createRng,
    TOTAL_HOURS: TOTAL_HOURS,
    TARGET_STRENGTH: TARGET_STRENGTH,
    CRACK_THRESHOLD: CRACK_THRESHOLD,
    WEATHER_EVENTS: WEATHER_EVENTS
  };
});
