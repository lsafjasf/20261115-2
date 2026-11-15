 (function () {
  'use strict';
  const S = window.TugSim;
  const canvas = document.getElementById('game');
  const sim = new S.Simulation();
  const renderer = new window.TugRender.Renderer(canvas, sim);
  const audio = new window.TugAudio();
  const pilot = new window.TugAutopilot.Autopilot(sim);

  const keys = {};
  let autopilot = false;
  let lastCollisionCount = 0;
  let lastBridgeCount = 0;
  let bannerShown = false;

  const el = (id) => document.getElementById(id);
  renderer.resize();
  window.addEventListener('resize', () => renderer.resize());

  function reset() {
    window.location.reload();
  }
  el('dmgLimit').textContent = S.DAMAGE_LIMIT;
  el('restartBtn').addEventListener('click', reset);
  el('autoBtn').addEventListener('click', toggleAuto);

  function toggleAuto() {
    autopilot = !autopilot;
    el('autoBtn').textContent = autopilot ? '关闭自动驾驶 (T)' : '开启自动驾驶 (T)';
  }

  window.addEventListener('keydown', (e) => {
    keys[e.key.toLowerCase()] = true;
    audio.ensure();
    if (e.key.toLowerCase() === 't') toggleAuto();
    if (e.key.toLowerCase() === 'r') reset();
  });
  window.addEventListener('keyup', (e) => {
    keys[e.key.toLowerCase()] = false;
  });
  canvas.addEventListener('pointerdown', () => audio.ensure());

  function readManualInput() {
    let throttle = 0;
    let rudder = 0;
    let winch = 0;
    if (keys.w) throttle += 1;
    if (keys.s) throttle -= 1;
    if (keys.a) rudder -= 1;
    if (keys.d) rudder += 1;
    if (keys.q) winch -= 1;
    if (keys.e) winch += 1;
    sim.setInput(throttle, rudder, winch);
  }

  function updateHud() {
    const speed = Math.hypot(sim.tug.vx, sim.tug.vy);
    el('speed').textContent = speed.toFixed(0);
    el('clock').textContent = sim.time.toFixed(0);
    el('water').textContent = sim.waterLevel().toFixed(2);
    const avgCable = sim.cables.reduce((a, c) => a + c, 0) / sim.cables.length;
    el('cable').textContent = avgCable.toFixed(0);
    el('cableBar').style.width =
      ((avgCable - S.CABLE_MIN) / (S.CABLE_MAX - S.CABLE_MIN) * 100).toFixed(0) + '%';
    el('tension').textContent = sim.maxTension.toFixed(0);
    el('tensionBar').style.width = Math.min(100, sim.maxTension / 12).toFixed(0) + '%';
    const dmg = sim.totalDamage();
    el('damage').textContent = dmg.toFixed(1);
    el('damageBar').style.width = Math.min(100, dmg / S.DAMAGE_LIMIT * 100).toFixed(0) + '%';
    el('fold').textContent = (sim.maxFoldAngle() * 180 / Math.PI).toFixed(0);
    el('throttle').textContent = sim.throttleEff.toFixed(2);
    el('rudder').textContent = sim.rudderEff.toFixed(2);
    el('bridges').innerHTML = S.BRIDGES.map((b, i) => {
      const open = sim.bridgeOpen(i, sim.time);
      return '<span style="color:' + (open ? '#8fd99a' : '#ff8a7a') + '">桥' +
        (i + 1) + (open ? '通' : '封') + '</span>';
    }).join(' ');
  }

  function showBanner() {
    if (bannerShown || sim.status === 'running') return;
    bannerShown = true;
    const banner = el('banner');
    if (sim.status === 'success') {
      banner.style.color = '#9fe6a4';
      banner.innerHTML = '任务成功<small>三节驳船已靠码头，损伤 ' +
        sim.totalDamage().toFixed(1) + ' · 用时 ' + sim.time.toFixed(0) + 's · 按 R 重开</small>';
      audio.success();
    } else {
      banner.style.color = '#ff8a7a';
      banner.innerHTML = '任务失败<small>船体损伤超过阈值 · 按 R 重开</small>';
      audio.failure();
    }
    banner.style.display = 'block';
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (sim.status === 'running') {
      if (autopilot) pilot.update();
      else readManualInput();
      sim.step(dt);
      audio.update(sim, sim.throttleEff);
      if (sim.collisionEvents.length > lastCollisionCount) {
        const ev = sim.collisionEvents[sim.collisionEvents.length - 1];
        audio.collision(ev.speed);
        lastCollisionCount = sim.collisionEvents.length;
      }
      if (sim.bridgeHits.length > lastBridgeCount) {
        audio.bridgeThud();
        lastBridgeCount = sim.bridgeHits.length;
      }
    }
    renderer.render(dt);
    updateHud();
    showBanner();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
