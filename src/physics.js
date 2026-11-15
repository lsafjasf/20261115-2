(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Airdrop = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const WORLD = {
    WIDTH: 1000,
    DROP_ALT: 680,
    GRAVITY: 9.8,
    TERMINAL_FALL: 55,
    DAMAGE_SPEED: 13,
    ZONE_RADIUS: 48,
    PLANE_PERIOD: 44,
    PLANE_SWING: 360,
    PLANE_X: 500
  };

  function groundHeightAt(x) {
    const n = Math.min(1, Math.abs(x - 500) / 500);
    return 18 + 118 * Math.pow(n, 1.7);
  }

  const RESCUE_POINTS = [
    { id: 'A', x: 235 },
    { id: 'B', x: 500 },
    { id: 'C', x: 765 }
  ].map(function (p) { return { id: p.id, x: p.x, y: groundHeightAt(p.x) }; });

  function makeWind(seed) {
    const rnd = mulberry32(seed == null ? Date.now() : seed);
    return {
      vx: 8 + rnd() * 6,
      gust: 4 + rnd() * 4,
      phase1: rnd() * Math.PI * 2,
      phase2: rnd() * Math.PI * 2
    };
  }

  function windAt(wind, t) {
    return wind.vx
      + wind.gust * Math.sin(t * 0.7 + wind.phase1)
      + wind.gust * 0.45 * Math.sin(t * 1.9 + wind.phase2);
  }

  function shiftWindAfterDrop(wind, rnd) {
    const r = rnd || Math.random;
    wind.vx = clamp(wind.vx + (r() * 12 - 6), -24, 24);
    wind.gust = clamp(wind.gust + (r() * 3 - 1.5), 2.5, 10);
    wind.phase1 += r() * 2;
    wind.phase2 += r() * 2;
    return wind;
  }

  function planeXAt(t) {
    return WORLD.PLANE_X + WORLD.PLANE_SWING * Math.sin((2 * Math.PI * t) / WORLD.PLANE_PERIOD);
  }

  function chuteDescendSpeed(mass) {
    return 5.5 + mass * 1.15;
  }

  function createCrate(cfg, releaseTime) {
    return {
      mass: clamp(cfg.mass || 3, 1, 5),
      openHeight: cfg.openHeight,
      t: releaseTime,
      x: planeXAt(releaseTime),
      y: WORLD.DROP_ALT,
      vx: 0,
      vy: 0,
      chute: false,
      landed: false,
      result: null,
      trail: []
    };
  }

  function stepCrate(c, wind, dt) {
    if (c.landed) return c;
    c.t += dt;
    const w = windAt(wind, c.t);
    if (!c.chute && c.y <= c.openHeight) c.chute = true;

    if (c.chute) {
      const targetVy = chuteDescendSpeed(c.mass);
      c.vy += (targetVy - c.vy) * (1 - Math.exp(-1.6 * dt));
      c.vx += (w - c.vx) * (1 - Math.exp(-1.25 * dt));
    } else {
      c.vy = Math.min(WORLD.TERMINAL_FALL, c.vy + WORLD.GRAVITY * dt);
      c.vx += (w - c.vx) * (1 - Math.exp(-0.1 * dt));
    }

    c.x += c.vx * dt;
    c.y -= c.vy * dt;

    const ground = groundHeightAt(c.x);
    if (c.y <= ground) {
      c.y = ground;
      c.landed = true;
      c.result = evaluateLanding(c);
    }
    return c;
  }

  function evaluateLanding(c) {
    const damaged = c.vy > WORLD.DAMAGE_SPEED;
    let hit = null;
    for (const p of RESCUE_POINTS) {
      const d = Math.hypot(c.x - p.x, c.y - p.y);
      if (d <= WORLD.ZONE_RADIUS) { hit = p; break; }
    }
    let reason;
    if (hit && !damaged) reason = 'delivered';
    else if (damaged) reason = 'damaged';
    else reason = 'missed';
    return {
      success: reason === 'delivered',
      pointId: hit ? hit.id : null,
      reason: reason,
      impactSpeed: c.vy,
      x: c.x,
      y: c.y,
      flightTime: c.t
    };
  }

  function simulate(cfg, wind, releaseTime) {
    const c = createCrate(cfg, releaseTime || 0);
    const dt = 0.05;
    c.trail.push(snap(c));
    let guard = 0;
    while (!c.landed && guard++ < 12000) {
      stepCrate(c, wind, dt);
      if (Math.round(c.t / 0.2) !== Math.round((c.t - dt) / 0.2)) c.trail.push(snap(c));
    }
    c.trail.push(snap(c));
    return c;
  }

  function predictZone(cfg, wind, releaseTime, samples) {
    const n = samples || 22;
    const xs = [];
    const ys = [];
    for (let i = 0; i < n; i++) {
      const variant = {
        vx: wind.vx + (Math.random() * 4 - 2),
        gust: wind.gust * (0.7 + Math.random() * 0.6),
        phase1: wind.phase1 + Math.random() * 6.28,
        phase2: wind.phase2 + Math.random() * 6.28
      };
      const r = simulate(cfg, variant, releaseTime || 0).result;
      xs.push(r.x);
      ys.push(r.y);
    }
    const cx = xs.reduce((a, b) => a + b, 0) / n;
    const cy = ys.reduce((a, b) => a + b, 0) / n;
    const rx = Math.max(8, Math.max.apply(null, xs.map(v => Math.abs(v - cx))));
    const ry = Math.max(6, Math.max.apply(null, ys.map(v => Math.abs(v - cy))));
    return { cx: cx, cy: cy, rx: rx, ry: ry };
  }

  function snap(c) {
    return { t: c.t, x: c.x, y: c.y, vx: c.vx, vy: c.vy, chute: c.chute };
  }

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  return {
    WORLD: WORLD,
    RESCUE_POINTS: RESCUE_POINTS,
    groundHeightAt: groundHeightAt,
    makeWind: makeWind,
    windAt: windAt,
    shiftWindAfterDrop: shiftWindAfterDrop,
    planeXAt: planeXAt,
    chuteDescendSpeed: chuteDescendSpeed,
    createCrate: createCrate,
    stepCrate: stepCrate,
    simulate: simulate,
    predictZone: predictZone,
    clamp: clamp
  };
});
