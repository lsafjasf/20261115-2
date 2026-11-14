/* 雾海双桨 —— 主循环、输入、HUD 与测试钩子 */
(function () {
  const W = window.FogWorld;
  const R = window.FogRender;
  const A = window.FogAudio;

  const canvas = document.getElementById("sea");
  const ctx = canvas.getContext("2d");
  const VIEW_W = canvas.width;
  const VIEW_H = canvas.height;

  const world = W.createWorld(20261114);
  const rand = W.mulberry32(9917);
  const fogBlobs = R.makeFogBlobs(26, VIEW_W + 400, VIEW_H + 400);
  const wake = [];
  const input = { left: false, right: false, paddleUp: false, paddleDown: false, sailPort: false, sailStarboard: false };

  const el = (id) => document.getElementById(id);
  const hud = {
    heading: el("p1-heading"), bearing: el("p1-bearing"),
    speed: el("p2-speed"), sail: el("p2-sail"), wind: el("p2-wind"),
    hull: el("hull"), timer: el("timer"), gates: el("gates"), message: el("message"),
  };

  const KEYMAP = {
    ArrowLeft: "left", ArrowRight: "right",
    KeyW: "paddleUp", KeyS: "paddleDown",
    KeyA: "sailPort", KeyD: "sailStarboard",
  };

  window.addEventListener("keydown", (e) => {
    const k = KEYMAP[e.code];
    if (k) { input[k] = true; e.preventDefault(); }
    A.ensure();
    if (world.status === "ready") {
      world.status = "running";
      hud.message.textContent = "沿浮标灯前进，保持航向与安全航速！";
    }
  });
  window.addEventListener("keyup", (e) => {
    const k = KEYMAP[e.code];
    if (k) input[k] = false;
  });

  let last = performance.now();
  let lastEventSeen = null;

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    W.step(world, input, dt, rand);

    const boat = world.boat;
    wake.push({ x: boat.x, y: boat.y, life: 1.6, maxLife: 1.6 });
    if (wake.length > 240) wake.shift();
    for (const p of wake) p.life -= dt;
    while (wake.length && wake[0].life <= 0) wake.shift();
    for (const b of fogBlobs) {
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.x < -300) b.x += VIEW_W + 600;
      if (b.x > VIEW_W + 300) b.x -= VIEW_W + 600;
      if (b.y < -300) b.y += VIEW_H + 600;
      if (b.y > VIEW_H + 300) b.y -= VIEW_H + 600;
    }

    const cam = {
      x: Math.max(0, Math.min(W.WORLD_W - VIEW_W, boat.x - VIEW_W / 2)),
      y: Math.max(0, Math.min(W.WORLD_H - VIEW_H, boat.y - VIEW_H / 2)),
    };
    const t = now / 1000;
    R.drawSea(ctx, cam, VIEW_W, VIEW_H, t);
    R.drawRocks(ctx, cam, world.rocks);
    R.drawBuoys(ctx, cam, world.buoys, t);
    R.drawWake(ctx, cam, wake);
    R.drawBoat(ctx, cam, boat);
    R.drawFog(ctx, cam, fogBlobs, VIEW_W, VIEW_H, { x: boat.x - cam.x, y: boat.y - cam.y });

    const nb = W.nextBuoy(world);
    const bearing = nb ? W.bearingTo(boat, nb) : 0;
    R.drawCompass(ctx, VIEW_W / 2, 92, 66, boat.heading, bearing, world.compassJitter);

    if (nb) {
      const rel = W.wrapDeg(bearing - boat.heading);
      A.updateBearing(rel, Math.hypot(boat.x - nb.x, boat.y - nb.y));
    }
    if (world.lastEvent && world.lastEvent !== lastEventSeen) {
      lastEventSeen = world.lastEvent;
      if (world.lastEvent === "gate") A.gateChime();
      if (world.lastEvent === "rock") A.rockThud();
    }

    hud.heading.textContent = ((boat.heading + 360) % 360).toFixed(0);
    hud.bearing.textContent = nb ? bearing.toFixed(0) : "--";
    hud.speed.textContent = boat.speed.toFixed(0);
    hud.sail.textContent = boat.sailAngle.toFixed(0);
    hud.wind.textContent = W.wrapDeg(world.windDir - boat.heading + 180).toFixed(0);
    hud.hull.textContent = world.hull;
    hud.timer.textContent = Math.ceil(world.timeLeft);
    hud.gates.textContent = world.gatesPassed;

    if (world.status === "won" && !world._ended) {
      world._ended = true;
      hud.message.textContent = "航线完成！双人配合天衣无缝。";
      A.winTune();
    } else if (world.status === "lost" && !world._ended) {
      world._ended = true;
      hud.message.textContent = world.hull <= 0 ? "船体损毁，雾海吞没了小舟……" : "时间耗尽，救援灯熄灭了……";
      A.loseTune();
    }

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  /* 自动化/复盘钩子：只暴露只读快照与输入通道 */
  window.__game = {
    snapshot() {
      const nb = W.nextBuoy(world);
      return {
        status: world.status,
        heading: (world.boat.heading + 360) % 360,
        shownHeading: (world.boat.heading + world.compassJitter + 360) % 360,
        speed: world.boat.speed,
        paddle: world.boat.paddle,
        sailAngle: world.boat.sailAngle,
        windRel: W.wrapDeg(world.windDir - world.boat.heading + 180),
        hull: world.hull,
        timeLeft: world.timeLeft,
        gatesPassed: world.gatesPassed,
        x: world.boat.x, y: world.boat.y,
        target: nb ? { x: nb.x, y: nb.y, bearing: W.bearingTo(world.boat, nb) } : null,
        speedBand: [W.SPEED_MIN, W.SPEED_MAX],
      };
    },
  };
})();
