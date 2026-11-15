(function () {
  'use strict';
  const P = window.Airdrop;
  const { Renderer } = window.RendererNs;

  const canvas = document.getElementById('scene');
  const renderer = new Renderer(canvas);
  const sound = new window.SoundEngine();

  const CRATE_COUNT = 4;
  const PRESETS = [
    { release: 0, openHeight: 250, mass: 3 },
    { release: 8, openHeight: 400, mass: 3 },
    { release: 16, openHeight: 150, mass: 4 },
    { release: 24, openHeight: 90, mass: 2 }
  ];

  let wind = P.makeWind(Math.floor(Math.random() * 1e6));
  let simTime = 0;
  let running = false;
  let rafId = null;
  let lastTs = 0;
  let delivered = { A: 0, B: 0, C: 0 };
  let crates = [];
  let predictions = [];
  let demoMode = false;
  let demoStep = 0;
  let demoTimer = 0;

  const configs = PRESETS.map(p => ({ ...p }));

  function initControls() {
    const host = document.getElementById('crateControls');
    host.innerHTML = '';
    configs.forEach((cfg, i) => {
      const card = document.createElement('div');
      card.className = 'crate-card';
      card.innerHTML =
        '<h3>物资 ' + (i + 1) + '<span class="tag">重量 ' + cfg.mass + ' / 5</span></h3>' +
        '<label>投放时刻 <input type="range" min="0" max="40" step="0.5" value="' + cfg.release + '" data-k="release" data-i="' + i + '"><output>' + cfg.release.toFixed(1) + 's</output></label>' +
        '<label>开伞高度 <input type="range" min="30" max="520" step="10" value="' + cfg.openHeight + '" data-k="openHeight" data-i="' + i + '"><output>' + cfg.openHeight + 'm</output></label>' +
        '<label>物资重量 <input type="range" min="1" max="5" step="1" value="' + cfg.mass + '" data-k="mass" data-i="' + i + '"><output>' + cfg.mass + '</output></label>';
      host.appendChild(card);
    });
    host.addEventListener('input', onSlider);
  }

  function onSlider(ev) {
    const el = ev.target;
    if (el.tagName !== 'INPUT') return;
    const i = Number(el.dataset.i);
    const k = el.dataset.k;
    configs[i][k] = Number(el.value);
    el.parentElement.querySelector('output').textContent =
      k === 'release' ? configs[i].release.toFixed(1) + 's' :
      k === 'openHeight' ? configs[i].openHeight + 'm' : String(configs[i].mass);
    el.closest('.crate-card').querySelector('.tag').textContent = '重量 ' + configs[i].mass + ' / 5';
    refreshPredictions();
  }

  function resetCrates() {
    crates = configs.map(cfg => ({
      cfg, active: false, landed: false, chute: false,
      x: 0, y: P.WORLD.DROP_ALT, vx: 0, vy: 0, t: 0, trail: [], result: null
    }));
    predictions = configs.map(() => null);
  }

  function refreshPredictions() {
    if (running) return;
    crates.forEach((slot, i) => {
      predictions[i] = configs[i].release >= 9000
        ? null
        : P.predictZone(configs[i], wind, configs[i].release, 14);
    });
  }

  function spawnCrate(i, release) {
    const slot = crates[i];
    slot.active = true;
    slot.t = simTime;
    slot.x = P.planeXAt(release);
    slot.y = P.WORLD.DROP_ALT;
    slot.vx = 0; slot.vy = 0;
    slot.trail = [{ t: slot.t, x: slot.x, y: slot.y, vx: 0, vy: 0, chute: false }];
    log('物资 ' + (i + 1) + ' 于 t=' + release.toFixed(1) + 's 投放，预定开伞高度 ' + configs[i].openHeight + 'm');
  }

  function frame(ts) {
    if (!running) return;
    const dt = Math.min(0.05, (ts - lastTs) / 1000 || 0.016);
    lastTs = ts;
    simTime += dt;

    configs.forEach((cfg, i) => {
      const slot = crates[i];
      if (!slot.active && !slot.landed && simTime >= cfg.release) spawnCrate(i, cfg.release);
      if (!slot.active || slot.landed) return;

      const wasChute = slot.chute;
      P.stepCrate(slot, wind, dt);
      if (slot.chute && !wasChute) {
        sound.parachute();
        log('物资 ' + (i + 1) + ' 在 ' + slot.y.toFixed(0) + 'm 开伞');
      }
      if (Math.round(slot.t / 0.2) !== Math.round((slot.t - dt) / 0.2)) {
        slot.trail.push({ t: slot.t, x: slot.x, y: slot.y, vx: slot.vx, vy: slot.vy, chute: slot.chute });
      }
      sound.updateAltitude(slot.y, P.WORLD.DROP_ALT);
      if (slot.landed) onLanded(i);
    });

    const wNow = P.windAt(wind, simTime);
    sound.updateWind(wNow);
    updateHud(wNow);
    render();
    checkEnd();
    rafId = requestAnimationFrame(frame);
  }

  function onLanded(i) {
    const slot = crates[i];
    const r = slot.result;
    P.shiftWindAfterDrop(wind, Math.random);
    refreshPredictions();
    sound.thud();
    if (r.reason === 'delivered') {
      delivered[r.pointId] += 1;
      sound.success();
      log('✓ 物资 ' + (i + 1) + ' 送达救援点 ' + r.pointId + '，落点 x=' + r.x.toFixed(0) + 'm，速度 ' + r.impactSpeed.toFixed(1) + 'm/s', true);
    } else if (r.reason === 'damaged') {
      sound.damage();
      log('✗ 物资 ' + (i + 1) + ' 落地损坏：冲击速度 ' + r.impactSpeed.toFixed(1) + 'm/s 超过阈值', false);
    } else {
      log('✗ 物资 ' + (i + 1) + ' 被风飘离救援区，落点 x=' + r.x.toFixed(0) + 'm，无救援点接收', false);
    }
    updatePointStatus();
  }

  function checkEnd() {
    const due = crates.filter(c => c.cfg.release < 9000);
    const spawnedAny = due.some(c => c.active || c.landed);
    const anyFlying = due.some(c => c.active && !c.landed);
    if (spawnedAny && !anyFlying) finishRun();
    const allPoints = P.RESCUE_POINTS.every(p => delivered[p.id] >= 1);
    if (allPoints) finishRun('三处救援点均已收到可用品，任务完成！');
  }

  function finishRun(message) {
    running = false;
    cancelAnimationFrame(rafId);
    sound.silence();
    render();
    document.getElementById('btnLaunch').disabled = false;
    if (message) log(message, true);
    else log('本轮投放全部结束');
    if (demoMode) scheduleDemo();
  }

  function render() {
    renderer.draw({
      time: simTime,
      ground: P.groundHeightAt,
      windAt: function (alt, x, t) { return P.windAt(wind, t + alt * 0.01 + x * 0.002); },
      zones: P.RESCUE_POINTS.map(p => ({ id: p.id, x: p.x, y: p.y, delivered: delivered[p.id] > 0 })),
      radius: P.WORLD.ZONE_RADIUS,
      crates: crates,
      predictions: predictions,
      planeX: P.planeXAt(simTime),
      planeAlt: P.WORLD.DROP_ALT + 28,
      altLabel: P.WORLD.DROP_ALT
    });
  }

  function updateHud(wNow) {
    document.getElementById('hudWind').textContent = '风速 ' + wNow.toFixed(1) + ' m/s（均值 ' + wind.vx.toFixed(1) + '）';
    const active = crates.find(c => c.active && !c.landed);
    document.getElementById('hudAlt').textContent = active ? '物资高度 ' + active.y.toFixed(0) + ' m' : '高度 680 m';
    document.getElementById('hudStatus').textContent = running ? '投放中 t=' + simTime.toFixed(1) + 's' : '待命';
  }

  function updatePointStatus() {
    const ul = document.getElementById('pointStatus');
    ul.innerHTML = '';
    P.RESCUE_POINTS.forEach(p => {
      const li = document.createElement('li');
      if (delivered[p.id] > 0) li.className = 'done';
      li.innerHTML = '<span>救援点 ' + p.id + '（x=' + p.x + 'm）</span><span>' +
        (delivered[p.id] > 0 ? '已收到 ' + delivered[p.id] + ' 箱 ✓' : '等待物资') + '</span>';
      ul.appendChild(li);
    });
  }

  function log(text, good) {
    const ol = document.getElementById('log');
    const li = document.createElement('li');
    li.textContent = 't=' + simTime.toFixed(1) + 's  ' + text;
    if (good === true) li.className = 'good';
    if (good === false) li.className = 'bad';
    ol.prepend(li);
  }

  const DEMO_RUNS = [
    { name: '演示① 成功投放', cfgs: [{ release: 0, openHeight: 250, mass: 3 }] },
    { name: '演示② 开伞过早飘远', cfgs: [{ release: 0, openHeight: 400, mass: 3 }] },
    { name: '演示③ 开伞过晚损坏', cfgs: [{ release: 0, openHeight: 40, mass: 3 }] }
  ];

  function scheduleDemo() {
    if (demoStep >= DEMO_RUNS.length) {
      demoMode = false;
      log('自动演示结束：包含 1 次成功与 2 次落点失败', true);
      return;
    }
    const run = DEMO_RUNS[demoStep++];
    demoTimer = setTimeout(() => startDemoRun(run), 1400);
  }

  function startDemoRun(run) {
    const padded = [];
    for (let i = 0; i < CRATE_COUNT; i++) {
      padded.push(i === 0 ? run.cfgs[0] : { release: 9999, openHeight: 250, mass: 3 });
    }
    startRun(padded, run.name);
  }

  function startRun(override, label) {
    clearTimeout(demoTimer);
    if (override) {
      override.forEach((cfg, i) => { configs[i] = { ...cfg }; });
      initControls();
    }
    simTime = 0;
    resetCrates();
    refreshPredictions();
    running = true;
    lastTs = 0;
    document.getElementById('btnLaunch').disabled = true;
    log(label || '玩家投放开始');
    rafId = requestAnimationFrame(frame);
  }

  function resetAll() {
    running = false;
    demoMode = false;
    clearTimeout(demoTimer);
    cancelAnimationFrame(rafId);
    simTime = 0;
    delivered = { A: 0, B: 0, C: 0 };
    wind = P.makeWind(Math.floor(Math.random() * 1e6));
    configs.forEach((c, i) => Object.assign(c, PRESETS[i]));
    initControls();
    resetCrates();
    refreshPredictions();
    sound.silence();
    updatePointStatus();
    updateHud(0);
    render();
    document.getElementById('btnLaunch').disabled = false;
    document.getElementById('log').innerHTML = '';
    log('已重置，风向随机化');
  }

  document.getElementById('btnLaunch').addEventListener('click', () => {
    sound.ensure();
    demoMode = false;
    startRun();
  });
  document.getElementById('btnDemo').addEventListener('click', () => {
    sound.ensure();
    demoMode = true;
    demoStep = 0;
    delivered = { A: 0, B: 0, C: 0 };
    updatePointStatus();
    scheduleDemo();
  });
  document.getElementById('btnReset').addEventListener('click', resetAll);
  document.getElementById('btnMute').addEventListener('click', ev => {
    const muted = !sound.muted;
    sound.ensure();
    sound.setMuted(muted);
    ev.target.textContent = muted ? '🔇 音效关' : '🔊 音效开';
    ev.target.setAttribute('aria-pressed', String(muted));
  });

  initControls();
  resetCrates();
  refreshPredictions();
  updatePointStatus();
  updateHud(P.windAt(wind, 0));
  render();
})();
