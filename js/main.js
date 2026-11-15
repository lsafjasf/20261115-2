/* Wires controls, simulation loop, rendering, audio and HUD. */
(function () {
  'use strict';
  const Sim = window.SolarSim;

  const sceneCanvas = document.getElementById('scene');
  const chartCanvas = document.getElementById('chart');
  const sctx = sceneCanvas.getContext('2d');
  const cctx = chartCanvas.getContext('2d');

  const inputs = {
    speed: document.getElementById('in-speed'),
    pressure: document.getElementById('in-pressure'),
    flow: document.getElementById('in-flow')
  };
  const labels = {
    speed: document.getElementById('val-speed'),
    pressure: document.getElementById('val-pressure'),
    flow: document.getElementById('val-flow')
  };
  const hud = {
    time: document.getElementById('hud-time'),
    water: document.getElementById('hud-water'),
    tank: document.getElementById('hud-tank'),
    power: document.getElementById('hud-power'),
    wind: document.getElementById('hud-wind'),
    result: document.getElementById('hud-result')
  };

  const PRESETS = {
    balanced: { speed: 1.2, pressure: 60, flow: 3.0 },
    saver: { speed: 0.8, pressure: 80, flow: 2.0 },
    greedy: { speed: 1.2, pressure: 60, flow: 5.0 },
    dry: { speed: 2.5, pressure: 30, flow: 0.5 }
  };

  let state = Sim.createState();
  const audio = new window.CleanerAudio();
  let lastTs = null;

  function readParams() {
    state.params.speed = parseFloat(inputs.speed.value);
    state.params.pressure = parseFloat(inputs.pressure.value);
    state.params.flow = parseFloat(inputs.flow.value);
  }

  function syncLabels() {
    labels.speed.textContent = state.params.speed.toFixed(1) + ' m/s';
    labels.pressure.textContent = Math.round(state.params.pressure) + ' N';
    labels.flow.textContent = state.params.flow.toFixed(1) + ' L/min';
  }

  function setInputs(params) {
    inputs.speed.value = params.speed;
    inputs.pressure.value = params.pressure;
    inputs.flow.value = params.flow;
    readParams();
    syncLabels();
  }

  function renderTargets() {
    const box = document.getElementById('target-list');
    const status = Sim.targetStatus(state);
    box.innerHTML = '';
    status.forEach(function (q) {
      const row = document.createElement('div');
      row.className = 'target-row' + (q.ok ? ' ok' : '');
      const pct = Math.round(q.recovery * 100);
      row.innerHTML =
        '<span>P' + q.id + '★</span>' +
        '<span class="bar"><span class="fill" style="width:' + pct + '%"></span></span>' +
        '<span class="pct">' + pct + '%</span>';
      box.appendChild(row);
    });
  }

  function updateHud() {
    hud.time.textContent = '时间 ' + state.time.toFixed(1) + 's';
    hud.water.textContent = '用水 ' + state.waterUsed.toFixed(2) + 'L';
    hud.tank.textContent = '水箱 ' + state.tank.toFixed(2) + 'L';
    hud.power.textContent = '发电 ' + Math.round((state.power || Sim.efficiency(state.panels[0].dust)) * 100) + '%';
    hud.wind.textContent = '风 ' + state.wind.speed.toFixed(1) + 'm/s';
    if (state.finished) {
      hud.result.textContent = state.success ? '清洁成功 ✓' : '未达标 ✗';
      hud.result.className = state.success ? 'result-ok' : 'result-bad';
    } else {
      hud.result.textContent = state.running ? '清洁中…' : '待运行';
      hud.result.className = state.running ? 'result-idle' : 'result-idle';
    }
  }

  function loop(ts) {
    if (lastTs === null) lastTs = ts;
    const realDt = Math.min(0.05, (ts - lastTs) / 1000);
    lastTs = ts;

    if (state.running && !state.finished) {
      readParams();
      const simDt = realDt * Sim.TIME_SCALE;
      // Sub-step keeps the physics stable at high time scale.
      const steps = Math.max(1, Math.ceil(simDt / 0.1));
      for (let i = 0; i < steps; i++) Sim.step(state, simDt / steps);
      if (state.finished) state.running = false;
    }

    syncLabels();
    updateHud();
    renderTargets();
    window.Renderer.drawScene(sctx, sceneCanvas.width, sceneCanvas.height, state, realDt);
    window.Renderer.drawChart(cctx, chartCanvas.width, chartCanvas.height, state);
    try { audio.update(state); } catch (err) { /* audio is optional */ }
    requestAnimationFrame(loop);
  }

  document.getElementById('btn-start').addEventListener('click', function () {
    if (state.finished) resetState();
    readParams();
    state.running = true;
    audio.resume();
  });

  document.getElementById('btn-pause').addEventListener('click', function () {
    state.running = !state.running;
    this.textContent = state.running ? '暂停' : '继续';
    if (state.running) audio.resume();
  });

  function resetState() {
    state = Sim.createState({
      speed: parseFloat(inputs.speed.value),
      pressure: parseFloat(inputs.pressure.value),
      flow: parseFloat(inputs.flow.value)
    });
    window.Renderer.resetMist();
    document.getElementById('btn-pause').textContent = '暂停';
    lastTs = null;
    syncLabels();
    updateHud();
    renderTargets();
  }

  document.getElementById('btn-reset').addEventListener('click', resetState);

  document.getElementById('btn-sound').addEventListener('click', function () {
    const on = audio.toggle();
    this.textContent = '声音:' + (on ? '开' : '关');
  });

  Object.keys(inputs).forEach(function (key) {
    inputs[key].addEventListener('input', function () {
      readParams();
      syncLabels();
    });
  });

  document.querySelectorAll('.presets button').forEach(function (btn) {
    btn.addEventListener('click', function () {
      setInputs(PRESETS[btn.dataset.preset]);
    });
  });

  setInputs(PRESETS.balanced);
  updateHud();
  renderTargets();
  requestAnimationFrame(loop);
})();
