/* 雾海双桨 —— 世界、物理与规则 */
(function () {
  const WORLD_W = 2400;
  const WORLD_H = 1600;
  const GATE_RADIUS = 70;
  const SPEED_MIN = 30;
  const SPEED_MAX = 70;
  const TIME_LIMIT = 150;

  /* 固定种子，保证航线与礁石布局可复现（便于复盘与自动化验证） */
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function wrapDeg(d) {
    d = d % 360;
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    return d;
  }

  function distToSegment(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const cx = ax + t * dx, cy = ay + t * dy;
    return Math.hypot(px - cx, py - cy);
  }

  function createWorld(seed) {
    const rand = mulberry32(seed);
    const start = { x: 180, y: 1420 };
    const buoys = [
      { x: 760, y: 1080, passed: false, phase: 0.0 },
      { x: 1360, y: 720, passed: false, phase: 1.7 },
      { x: 1980, y: 380, passed: false, phase: 3.1 },
    ];
    const route = [start, ...buoys];
    const rocks = [];
    let guard = 0;
    while (rocks.length < 16 && guard++ < 4000) {
      const x = 120 + rand() * (WORLD_W - 240);
      const y = 120 + rand() * (WORLD_H - 240);
      let minD = Infinity;
      for (let i = 0; i < route.length - 1; i++) {
        minD = Math.min(minD, distToSegment(x, y, route[i].x, route[i].y, route[i + 1].x, route[i + 1].y));
      }
      /* 礁石分布在航道边缘 130~300 之间：偏离安全航线即可能触礁 */
      if (minD < 130 || minD > 300) continue;
      if (Math.hypot(x - start.x, y - start.y) < 220) continue;
      rocks.push({ x, y, r: 22 + rand() * 18 });
    }
    return {
      start, buoys, route, rocks,
      windDir: 315,
      boat: {
        x: start.x, y: start.y,
        heading: -38,
        speed: 0,
        paddle: 40,
        sailAngle: 0,
        drift: 0,
      },
      hull: 100,
      timeLeft: TIME_LIMIT,
      gatesPassed: 0,
      status: "ready",
      hitCooldown: 0,
      compassJitter: 0,
    };
  }

  function bearingTo(boat, target) {
    return ((Math.atan2(target.y - boat.y, target.x - boat.x) * 180) / Math.PI + 360) % 360;
  }

  function nextBuoy(world) {
    return world.buoys.find((b) => !b.passed) || null;
  }

  function step(world, input, dt, rand) {
    if (world.status !== "running") return;
    const boat = world.boat;

    /* 玩家一：舵手修正航向；罗盘扰动使航向随机漂移 */
    if (input.left) boat.heading -= 42 * dt;
    if (input.right) boat.heading += 42 * dt;
    boat.drift += (rand() - 0.5) * 26 * dt;
    boat.drift = Math.max(-9, Math.min(9, boat.drift));
    boat.heading += boat.drift * dt;
    boat.heading = wrapDeg(boat.heading);
    world.compassJitter = (rand() - 0.5) * 7;

    /* 玩家二：桨力与帆角 */
    if (input.paddleUp) boat.paddle = Math.min(100, boat.paddle + 55 * dt);
    if (input.paddleDown) boat.paddle = Math.max(0, boat.paddle - 55 * dt);
    if (input.sailPort) boat.sailAngle = Math.max(-60, boat.sailAngle - 50 * dt);
    if (input.sailStarboard) boat.sailAngle = Math.min(60, boat.sailAngle + 50 * dt);

    const windRel = wrapDeg(world.windDir - boat.heading + 180);
    const optimalSail = Math.max(-60, Math.min(60, windRel / 2));
    const sailEff = Math.max(0, Math.cos(((boat.sailAngle - optimalSail) * Math.PI) / 180));
    const targetSpeed = boat.paddle * 0.52 + 34 * sailEff;
    boat.speed += (targetSpeed - boat.speed) * 0.7 * dt;

    const rad = (boat.heading * Math.PI) / 180;
    boat.x += Math.cos(rad) * boat.speed * dt;
    boat.y += Math.sin(rad) * boat.speed * dt;
    boat.x = Math.max(20, Math.min(WORLD_W - 20, boat.x));
    boat.y = Math.max(20, Math.min(WORLD_H - 20, boat.y));

    /* 触礁 */
    world.hitCooldown = Math.max(0, world.hitCooldown - dt);
    for (const r of world.rocks) {
      if (Math.hypot(boat.x - r.x, boat.y - r.y) < r.r + 12 && world.hitCooldown === 0) {
        world.hull -= 25;
        world.hitCooldown = 1.2;
        boat.speed *= 0.3;
        boat.x -= Math.cos(rad) * 26;
        boat.y -= Math.sin(rad) * 26;
        world.lastEvent = "rock";
        if (world.hull <= 0) { world.hull = 0; world.status = "lost"; }
        break;
      }
    }

    /* 过浮标：需在半径内且航速处于安全区间（两人配合的检验点） */
    const nb = nextBuoy(world);
    if (nb && Math.hypot(boat.x - nb.x, boat.y - nb.y) < GATE_RADIUS) {
      if (boat.speed >= SPEED_MIN && boat.speed <= SPEED_MAX) {
        nb.passed = true;
        world.gatesPassed++;
        world.lastEvent = "gate";
        if (world.gatesPassed === world.buoys.length) world.status = "won";
      } else {
        world.lastEvent = "badSpeed";
      }
    }

    world.timeLeft -= dt;
    if (world.timeLeft <= 0 && world.status === "running") {
      world.timeLeft = 0;
      world.status = "lost";
    }
  }

  window.FogWorld = {
    WORLD_W, WORLD_H, GATE_RADIUS, SPEED_MIN, SPEED_MAX, TIME_LIMIT,
    mulberry32, wrapDeg, createWorld, bearingTo, nextBuoy, step,
  };
})();
