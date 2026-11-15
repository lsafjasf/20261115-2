/* main.js — 浏览器入口：游戏循环、输入、HUD、自动演示、失败/胜利结算。 */
(function () {
  'use strict';
  const { BridgeEngine: E, BridgeAudio, BridgeRenderer } = window;
  const { CFG } = E;

  const canvas = document.getElementById('scene');
  const renderer = new BridgeRenderer(canvas);
  const audio = new BridgeAudio();
  let game = E.createGame({});
  let last = performance.now();
  let demo = false;
  let demoPlan = null;

  const $ = id => document.getElementById(id);

  function resetGame() {
    game = E.createGame({});
    demo = false;
    demoPlan = null;
    $('overlay').classList.add('hidden');
  }

  function setDir(dir) {
    audio.ensure();
    if (game.status !== 'running') return;
    game.input.dir = dir;
  }

  function currentBatch() {
    const sel = document.querySelector('input[name="batch"]:checked');
    return sel ? sel.value : 'A';
  }

  function doLoad() {
    audio.ensure();
    E.loadCargo(game, currentBatch(), 1);
  }

  function doUnload() {
    audio.ensure();
    E.unloadCargo(game, 1);
  }

  // —— 自动演示：脚本化完成一整局（与 Node 测试同策略）——
  function startDemo() {
    resetGame();
    demo = true;
    demoPlan = buildDemoPlan();
  }

  function buildDemoPlan() {
    const steps = [];
    const wait = sec => steps.push({ t: 'wait', sec });
    const load = (id, n) => { for (let i = 0; i < n; i++) steps.push({ t: 'load', id }); };
    const drive = s => steps.push({ t: 'drive', s });
    const unload = n => { for (let i = 0; i < n; i++) steps.push({ t: 'unload' }); };
    wait(2.5);
    load('A', 6); load('C', 4); drive(1); wait(0.2); unload(10);
    load('B', 5); drive(0); wait(0.2); unload(5);
    load('C', 5); drive(0.5); wait(0.2); unload(5);
    load('C', 5); drive(1); wait(0.2); unload(5);
    return { steps, idx: 0, timer: 0 };
  }

  function updateDemo(dt) {
    if (!demo || !demoPlan || game.status !== 'running') return;
    const plan = demoPlan;
    const step = plan.steps[plan.idx];
    if (!step) return;
    plan.timer += dt;
    if (step.t === 'wait') {
      if (plan.timer >= step.sec) advance();
    } else if (step.t === 'drive') {
      const near = E.reachedStation(game, step.s);
      game.input.dir = near ? 0 : (game.s < step.s ? 1 : -1);
      if (near && Math.abs(game.s - game.sPrev) <= CFG.IDLE_SPEED * CFG.FIXED_DT) {
        game.input.dir = 0;
        advance();
      }
    } else {
      handleInstant(step);
      advance();
    }
    function advance() {
      plan.idx++;
      plan.timer = 0;
    }
  }

  function handleInstant(step) {
    if (step.t === 'load') E.loadCargo(game, step.id, 1);
    if (step.t === 'unload') E.unloadCargo(game, 1);
  }

  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    updateDemo(dt);
    if (game.status === 'running') E.step(game, dt);
    renderer.render(game, dt);
    audio.update(game.stress, game.wind, game.status === 'running');
    updateHud();
    handleEnding();
    requestAnimationFrame(loop);
  }

  let endedShown = false;
  function handleEnding() {
    if (game.status === 'running' || endedShown) return;
    endedShown = true;
    const ov = $('overlay');
    if (game.status === 'failed') {
      audio.fail();
      $('overlayTitle').textContent = '桥面断裂！';
      $('overlayText').textContent =
        '总质量 ' + game.failInfo.mass + ' 在位置 ' + game.failInfo.s.toFixed(2) +
        ' 处应变 ' + game.failInfo.strain + ' 超过极限 ' + CFG.STRAIN_LIMIT +
        '（阵风 ' + game.failInfo.wind + ' m/s）。';
    } else {
      audio.win();
      $('overlayTitle').textContent = '三批货物全部运达！';
      $('overlayText').textContent =
        '共 ' + game.trips + ' 个班次，中途站卸货 ' + game.midUnloads +
        ' 件，峰值应力比 ' + game.peakStress.toFixed(2) + '。';
    }
    ov.classList.remove('hidden');
  }

  function updateHud() {
    const onboard = game.carCargo.A + game.carCargo.B + game.carCargo.C;
    $('hudMass').textContent = (CFG.TARE_MASS + onboard);
    $('hudCargo').textContent = onboard + '/' + CFG.CARGO_CAP;
    $('hudStress').textContent = Math.round(game.stress * 100) + '%';
    $('hudWind').textContent = game.wind.toFixed(1);
    $('hudTrips').textContent = game.trips;
    $('hudSwing').textContent = Math.round(game.theta * 180 / Math.PI) + '°';
    $('hudDeliver').textContent =
      game.delivered.A + '/6  B ' + game.delivered.B + '/5  C ' + game.delivered.C + '/9';
    const st = E.atStation(game);
    $('hudStation').textContent = st ? ({ left: '左平台', mid: '中途站', right: '右平台' })[st] : '桥上';
    const bar = $('stressBar');
    bar.style.width = Math.min(100, game.stress * 100) + '%';
    bar.className = game.stress > 0.85 ? 'danger' : (game.stress > 0.6 ? 'warn' : '');
    if (game.recovery.settled) $('hudRecover').textContent = '已恢复(' + game.recovery.recoveryDuration + 's)';
    else $('hudRecover').textContent = '—';
  }

  window.addEventListener('keydown', e => {
    if (e.key === 'ArrowRight' || e.key === 'd') setDir(1);
    if (e.key === 'ArrowLeft' || e.key === 'a') setDir(-1);
    if (e.key === 'l' || e.key === 'L') doLoad();
    if (e.key === 'u' || e.key === 'U') doUnload();
  });
  window.addEventListener('keyup', e => {
    if (['ArrowRight', 'ArrowLeft', 'd', 'a'].includes(e.key)) game.input.dir = 0;
  });

  $('btnRight').addEventListener('click', () => setDir(1));
  $('btnLeft').addEventListener('click', () => setDir(-1));
  ['btnRight', 'btnLeft'].forEach(id =>
    $(id).addEventListener('mouseup', () => { game.input.dir = 0; }));
  $('btnLoad').addEventListener('click', doLoad);
  $('btnUnload').addEventListener('click', doUnload);
  $('btnReset').addEventListener('click', () => { endedShown = false; resetGame(); });
  $('btnDemo').addEventListener('click', () => { endedShown = false; startDemo(); });
  $('btnMute').addEventListener('click', () => {
    audio.ensure();
    $('btnMute').textContent = audio.toggleMute() ? '🔇 静音' : '🔊 声音';
  });

  window.addEventListener('resize', () => renderer.resize());
  renderer.resize();
  requestAnimationFrame(loop);
})();
