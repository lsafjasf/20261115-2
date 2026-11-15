/*
 * Solar panel cleaning simulation — pure logic, no DOM.
 * Runs identically in the browser (global SolarSim) and Node (module.exports).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SolarSim = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const PANEL_COUNT = 8;
  const TRACK_LENGTH = 16;                 // metres, panel centre span
  const PANEL_WIDTH = TRACK_LENGTH / PANEL_COUNT;
  const TANK_CAPACITY = 2;                 // litres
  const TIME_SCALE = 4;                    // sim seconds per real second
  const TARGET_RECOVERY = 0.9;             // target panels must reach 90%
  const TARGET_PANELS = [1, 7];            // 1-based: an early board and the end board

  // Ranges exposed to the player.
  const LIMITS = {
    speed: { min: 0.4, max: 2.5, step: 0.1, unit: 'm/s' },
    pressure: { min: 20, max: 100, step: 5, unit: 'N' },
    flow: { min: 0, max: 5, step: 0.1, unit: 'L/min' }
  };

  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

  // Deterministic-ish dust field: heavy middle/end load, lighter near start.
  function initialDust(i) {
    const base = 0.78 + 0.16 * (i / (PANEL_COUNT - 1));
    const wobble = 0.04 * Math.sin(i * 2.7);
    return clamp(base + wobble, 0.55, 0.97);
  }

  function createState(params) {
    const panels = [];
    for (let i = 0; i < PANEL_COUNT; i++) {
      panels.push({
        id: i + 1,
        dust: initialDust(i),
        wet: 0,                    // residual surface water 0..1
        recovery: 0,               // fraction of lost power restored 0..1
        isTarget: TARGET_PANELS.indexOf(i + 1) !== -1
      });
    }
    return {
      time: 0,                     // simulated seconds
      robotX: 0,
      direction: 1,
      panels,
      wind: { speed: 3, gust: 0 }, // m/s, transient gust amount
      windSide: 1,                 // +1 mist drifts toward higher ids
      tank: TANK_CAPACITY,
      waterUsed: 0,
      distance: 0,
      running: false,
      finished: false,
      success: false,
      powerHistory: [],            // {t, power}
      lastUnderIndex: -1,          // most recent panel that ran dry while being brushed
      params: Object.assign({ speed: 1.2, pressure: 60, flow: 3.0 }, params || {})
    };
  }

  // Panel generation efficiency as a function of dust cover.
  function efficiency(dust) {
    return clamp(1 - 0.85 * dust, 0, 1);
  }

  // Recovery of lost output relative to the initially dirty panel.
  function panelRecovery(panel, initialDustValue) {
    const e0 = efficiency(initialDustValue);
    const eNow = efficiency(panel.dust);
    if (1 - e0 <= 1e-6) return 1;
    return clamp((eNow - e0) / (1 - e0), 0, 1);
  }

  function targetStatus(state) {
    return TARGET_PANELS.map(function (id) {
      const sp = state.panels[id - 1];
      return {
        id: id,
        recovery: sp.recovery,
        required: TARGET_RECOVERY,
        ok: sp.recovery >= TARGET_RECOVERY
      };
    });
  }

  function updateWind(state, dt, rng) {
    // Slowly varying breeze plus short gusts; gusts decide mist drift.
    const w = state.wind;
    const target = 4 + 3.5 * Math.sin(state.time * 0.07);
    w.speed += (target - w.speed) * dt * 0.3;
    w.gust = Math.max(0, w.gust - dt * 0.25);
    if (rng() < dt * 0.12) {
      w.gust = 0.6 + rng() * 0.9;                 // fraction of full drift
      w.side = rng() < 0.5 ? -1 : 1;
    }
    return w;
  }

  // Cleaning intensity delivered by the brush to one panel in this step.
  function cleaningIntensity(state, panelIndex, dt) {
    const p = state.params;
    const pressureFactor = 0.35 + 0.65 * (p.pressure / LIMITS.pressure.max);
    // Moving too fast shortens dwell time; slow walking cleans more thoroughly.
    const dwellFactor = clamp(1.5 - p.speed * 0.45, 0.35, 1.3);
    // Water lifts the dust film. Dry brushing works weakly and leaves residue.
    const waterFactor = state.tank > 0 && p.flow > 0
      ? clamp(0.45 + p.flow / LIMITS.flow.max * 1.05, 0.45, 1.5)
      : 0.15;
    // Dust itself cushions the bristles — dirtier boards clean a bit slower.
    const dustPenalty = 1 - 0.25 * state.panels[panelIndex].dust;
    return 1.08 * pressureFactor * dwellFactor * waterFactor * dustPenalty * dt;
  }

  function step(state, dt, rng) {
    if (state.finished) return state;
    rng = rng || Math.random;
    state.time += dt;
    updateWind(state, dt, rng);

    const p = state.params;
    const dx = p.speed * dt * state.direction;
    state.robotX = clamp(state.robotX + dx, 0, TRACK_LENGTH);
    state.distance += Math.abs(dx);
    if (state.robotX >= TRACK_LENGTH) state.direction = -1;
    if (state.robotX <= 0) state.direction = 1;

    // Water consumption: pump flow while the tank holds water.
    let pumpOn = false;
    if (p.flow > 0 && state.tank > 0) {
      const litres = (p.flow / 60) * dt;
      const drawn = Math.min(litres, state.tank);
      state.tank -= drawn;
      state.waterUsed += drawn;
      pumpOn = drawn > 0;
      if (state.tank < 1e-6) state.tank = 0;
    }

    const idx = clamp(Math.floor(state.robotX / PANEL_WIDTH), 0, PANEL_COUNT - 1);
    const panel = state.panels[idx];
    if (!panel.dust0) panel.dust0 = panel.dust;

    const rate = cleaningIntensity(state, idx, dt);
    const before = panel.dust;
    panel.dust = clamp(panel.dust * Math.exp(-rate), 0, 1);
    panel.wet = clamp(panel.wet + (pumpOn ? dt * 0.5 : 0) - dt * 0.15, 0, 1);
    if (!pumpOn && before - panel.dust > 0) state.lastUnderIndex = idx;

    // Strong gusts blow part of the spray onto the neighbouring panel.
    const gust = state.wind.gust;
    if (pumpOn && gust > 0.55) {
      const neighbour = idx + state.wind.side;
      if (neighbour >= 0 && neighbour < PANEL_COUNT) {
        const driftRate = rate * 0.35 * gust;
        const np = state.panels[neighbour];
        if (!np.dust0) np.dust0 = np.dust;
        np.dust = clamp(np.dust * Math.exp(-driftRate), 0, 1);
        np.wet = clamp(np.wet + dt * 0.2 * gust, 0, 1);
        state.lastDrift = { from: idx, to: neighbour, gust, t: state.time };
      }
    }

    // Recompute recovery and fleet power.
    let powerSum = 0;
    for (let i = 0; i < state.panels.length; i++) {
      const sp = state.panels[i];
      if (!sp.dust0) sp.dust0 = sp.dust;
      sp.recovery = panelRecovery(sp, sp.dust0);
      powerSum += efficiency(sp.dust);
    }
    const power = powerSum / PANEL_COUNT;
    state.powerHistory.push({ t: state.time, power });
    if (state.powerHistory.length > 600) state.powerHistory.shift();

    state.power = power;
    state.brushRate = rate;
    state.pumpOn = pumpOn;
    state.activePanel = idx;

    const targetsOk = TARGET_PANELS.every(function (id) {
      return state.panels[id - 1].recovery >= TARGET_RECOVERY;
    });
    // Finish after one full round trip (out and back), i.e. ~2 track lengths.
    const passDone = state.time > 1 && state.distance >= TRACK_LENGTH * 2;
    if (passDone) {
      state.finished = true;
      state.running = false;
      state.success = targetsOk;
    }
    return state;
  }

  return {
    PANEL_COUNT, TRACK_LENGTH, PANEL_WIDTH, TANK_CAPACITY, TIME_SCALE,
    TARGET_RECOVERY, TARGET_PANELS, LIMITS,
    clamp, initialDust, createState, efficiency, panelRecovery,
    updateWind, cleaningIntensity, step, targetStatus
  };
});

