 (function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TugSim = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const RIVER_POINTS = [
    [0, -460], [0, 260], [0, 640],
    [320, 1080], [320, 1420], [320, 1720],
    [120, 2080], [-160, 2460], [-160, 2840], [-160, 3200],
    [0, 3540], [0, 3920], [0, 4420]
  ];
  const RIVER_HALF_WIDTH = 132;
  const DOCK_STATION = 4720;
  const RIVER_END = 5160;

  const TUG = { len: 52, wid: 22, mass: 1.0, radius: 20 };
  const BARGE = { len: 70, wid: 26, mass: 1.35, radius: 27 };
  const BARGE_COUNT = 3;

  const CABLE_MIN = 48;
  const CABLE_MAX = 130;
  const CABLE_RATE = 26;
  const CABLE_K = 3.2;
  const CABLE_DAMP = 9;
  const CABLE_BREAK_FORCE = 3000;

  const THRUST_ACCEL = 120;
  const REVERSE_ACCEL = 75;
  const RUDDER_ACCEL = 2.6;
  const DRAG_LIN = 0.34;
  const DRAG_QUAD = 0.0048;
  const ANG_DRAG = 1.9;
  const BARGE_ALIGN = 2.4;
  const BARGE_ANG_DRAG = 2.2;

  const DAMAGE_LIMIT = 150;
  const FOLD_ANGLE = 1.0;

  const BRIDGES = [
    { s: 900, baseClearance: 1.78, airDraft: 1.3 },
    { s: 4080, baseClearance: 1.72, airDraft: 1.3 }
  ];

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }
  function angDiff(a, b) {
    let d = a - b;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  function buildRiver() {
    const segs = [];
    let total = 0;
    for (let i = 0; i < RIVER_POINTS.length - 1; i++) {
      const a = RIVER_POINTS[i], b = RIVER_POINTS[i + 1];
      const dx = b[0] - a[0], dy = b[1] - a[1];
      const len = Math.hypot(dx, dy);
      segs.push({
        ax: a[0], ay: a[1], bx: b[0], by: b[1],
        tx: dx / len, ty: dy / len,
        nx: -dy / len, ny: dx / len,
        len, s0: total
      });
      total += len;
    }
    return { segs, length: total };
  }

  function makeBody(name, x, y, angle, spec) {
    return {
      name, x, y, angle,
      vx: 0, vy: 0, wa: 0,
      len: spec.len, wid: spec.wid, mass: spec.mass,
      radius: spec.radius, damage: 0,
      fx: 0, fy: 0, tq: 0,
      prevS: null, bridgeCooldown: [false, false]
    };
  }

  function Simulation(opts) {
    opts = opts || {};
    this.river = buildRiver();
    this.halfWidth = opts.halfWidth || RIVER_HALF_WIDTH;
    this.ignoreBanks = !!opts.ignoreBanks;
    this.fixedWater = typeof opts.fixedWater === 'number' ? opts.fixedWater : null;
    this.waterPhase = typeof opts.waterPhase === 'number' ? opts.waterPhase : 0;
    this.time = 0;
    this.status = 'running';
    this.foldEvents = [];
    this.bridgeHits = [];
    this.collisionEvents = [];
    this.maxTension = 0;

    this.tug = makeBody('tug', 0, -330, Math.PI / 2, TUG);
    this.barges = [];
    let y = -330 - (TUG.len / 2 + 58 + BARGE.len / 2);
    for (let i = 0; i < BARGE_COUNT; i++) {
      this.barges.push(makeBody('barge' + (i + 1), 0, y, Math.PI / 2, BARGE));
      y -= 58 + BARGE.len;
    }
    this.bodies = [this.tug].concat(this.barges);
    this.cables = new Array(BARGE_COUNT).fill(72);
    this.cableTension = new Array(BARGE_COUNT).fill(0);
    this.cableBroken = new Array(BARGE_COUNT).fill(false);

    this.input = { throttle: 0, rudder: 0, winch: 0 };
    this.throttleEff = 0;
    this.rudderEff = 0;
    for (const b of this.bodies) {
      const q = this.worldToRiver(b.x, b.y);
      b.prevS = q.s;
      for (let i = 0; i < BRIDGES.length; i++) b.bridgeCooldown[i] = q.s > BRIDGES[i].s;
    }
  }

  Simulation.prototype.worldToRiver = function (x, y) {
    let best = null;
    for (const seg of this.river.segs) {
      const px = x - seg.ax, py = y - seg.ay;
      const u = clamp((px * seg.tx + py * seg.ty) / seg.len, 0, 1);
      const cx = seg.ax + seg.tx * seg.len * u;
      const cy = seg.ay + seg.ty * seg.len * u;
      const d = Math.hypot(x - cx, y - cy);
      if (!best || d < best.d) best = { d, s: seg.s0 + seg.len * u, seg, u };
    }
    const seg = best.seg;
    const off = (x - (seg.ax + seg.tx * seg.len * best.u)) * seg.nx +
                (y - (seg.ay + seg.ty * seg.len * best.u)) * seg.ny;
    return { s: best.s, offset: off, seg, u: best.u, dist: best.d };
  };

  Simulation.prototype.riverAt = function (s) {
    s = clamp(s, 0, this.river.length - 0.001);
    for (const seg of this.river.segs) {
      if (s <= seg.s0 + seg.len || seg === this.river.segs[this.river.segs.length - 1]) {
        const u = (s - seg.s0) / seg.len;
        return {
          x: seg.ax + seg.tx * seg.len * u,
          y: seg.ay + seg.ty * seg.len * u,
          tx: seg.tx, ty: seg.ty, nx: seg.nx, ny: seg.ny,
          angle: Math.atan2(seg.ty, seg.tx), seg, u
        };
      }
    }
  };

  Simulation.prototype.waterLevel = function (t) {
    if (this.fixedWater !== null) return this.fixedWater;
    const tt = (t || this.time) + this.waterPhase;
    return 2.05 + 1.35 * Math.sin(tt * 0.085) +
      0.3 * Math.sin(tt * 0.21 + 1.7);
  };

  Simulation.prototype.bridgeClearance = function (bridge, t) {
    return bridge.baseClearance - (this.waterLevel(t) - 2.0) * 0.32;
  };

  Simulation.prototype.bridgeOpen = function (index, t) {
    const b = BRIDGES[index];
    return this.bridgeClearance(b, t) >= b.airDraft;
  };

  Simulation.prototype.totalDamage = function () {
    return this.barges.reduce((sum, b) => sum + b.damage, 0);
  };

  Simulation.prototype.setInput = function (throttle, rudder, winch) {
    this.input.throttle = clamp(throttle || 0, -1, 1);
    this.input.rudder = clamp(rudder || 0, -1, 1);
    this.input.winch = clamp(winch || 0, -1, 1);
  };

  Simulation.prototype.cableEndpoints = function () {
    const links = [];
    let ax = this.tug.x - Math.cos(this.tug.angle) * this.tug.len / 2;
    let ay = this.tug.y - Math.sin(this.tug.angle) * this.tug.len / 2;
    for (const b of this.barges) {
      const bx = b.x + Math.cos(b.angle) * b.len / 2;
      const by = b.y + Math.sin(b.angle) * b.len / 2;
      links.push({ ax, ay, bx, by });
      ax = b.x - Math.cos(b.angle) * b.len / 2;
      ay = b.y - Math.sin(b.angle) * b.len / 2;
    }
    return links;
  };

  Simulation.prototype.applyCables = function (dt) {
    if (this.input.winch !== 0) {
      const rate = CABLE_RATE * this.input.winch * dt;
      for (let i = 0; i < BARGE_COUNT; i++) {
        this.cables[i] = clamp(this.cables[i] + rate, CABLE_MIN, CABLE_MAX);
      }
    }
    const links = this.cableEndpoints();
    this.maxTension = 0;
    for (let i = 0; i < BARGE_COUNT; i++) {
      const link = links[i];
      const dx = link.bx - link.ax, dy = link.by - link.ay;
      const d = Math.hypot(dx, dy) || 0.0001;
      const nx = dx / d, ny = dy / d;
      let tension = 0;
      if (!this.cableBroken[i] && d > this.cables[i]) {
        const va = i === 0 ? this.tug : this.barges[i - 1];
        const vb = this.barges[i];
        let stretchRate = (vb.vx - va.vx) * nx + (vb.vy - va.vy) * ny;
        stretchRate = clamp(stretchRate, -150, 150);
        tension = CABLE_K * (d - this.cables[i]) + CABLE_DAMP * stretchRate;
        tension = Math.min(tension, CABLE_BREAK_FORCE * 1.4);
        if (!isFinite(tension) || tension < 0) tension = 0;
        if (tension > CABLE_BREAK_FORCE) this.cableBroken[i] = true;
      }
      if (this.cableBroken[i]) tension = 0;
      this.cableTension[i] = tension;
      if (tension > this.maxTension) this.maxTension = tension;
      if (tension <= 0) continue;
      const fx = nx * tension, fy = ny * tension;
      const a = i === 0 ? this.tug : this.barges[i - 1];
      const b = this.barges[i];
      a.fx += fx; a.fy += fy;
      b.fx -= fx; b.fy -= fy;
      const leverA = Math.min(a.len * 0.42, d * 0.5);
      const leverB = Math.min(b.len * 0.42, d * 0.5);
      const alignA = Math.atan2(dy, dx);
      const steerA = Math.sin(alignA - a.angle);
      const steerB = Math.sin(alignA - b.angle);
      a.tq -= 0.45 * leverA * tension * steerA;
      b.tq -= 0.45 * leverB * tension * steerB;
    }
  };

  Simulation.prototype.applyHydro = function (dt) {
    this.throttleEff += (this.input.throttle - this.throttleEff) * Math.min(1, dt * 1.4);
    this.rudderEff += (this.input.rudder - this.rudderEff) * Math.min(1, dt * 2.2);
    const t = this.tug;
    const ca = Math.cos(t.angle), sa = Math.sin(t.angle);
    const along = t.vx * ca + t.vy * sa;
    const side = -t.vx * sa + t.vy * ca;
    const accel = this.throttleEff >= 0
      ? this.throttleEff * THRUST_ACCEL
      : this.throttleEff * REVERSE_ACCEL;
    t.fx += ca * accel;
    t.fy += sa * accel;
    const speed = Math.hypot(t.vx, t.vy);
    if (speed > 0.01) {
      t.fx -= t.vx * (DRAG_LIN + DRAG_QUAD * speed);
      t.fy -= t.vy * (DRAG_LIN + DRAG_QUAD * speed);
    }
    const tLat = 0.012 + speed * 0.018;
    t.fx -= -sa * side * tLat;
    t.fy -= ca * side * tLat;
    t.tq += this.rudderEff * RUDDER_ACCEL * (0.35 + Math.min(speed / 60, 1)) *
      (along >= 0 ? 1 : -1);
    t.tq -= t.wa * ANG_DRAG;

    for (const b of this.barges) {
      const cb = Math.cos(b.angle), sb = Math.sin(b.angle);
      const sp = Math.hypot(b.vx, b.vy);
      if (sp > 0.01) {
        b.fx -= b.vx * (DRAG_LIN * 0.85 + DRAG_QUAD * sp);
        b.fy -= b.vy * (DRAG_LIN * 0.85 + DRAG_QUAD * sp);
      }
      const sideV = -b.vx * sb + b.vy * cb;
      const bLat = 0.012 + sp * 0.03;
      b.fx -= -sb * sideV * bLat;
      b.fy -= cb * sideV * bLat;
      const q = this.worldToRiver(b.x, b.y);
      const flowAngle = q.seg ? Math.atan2(q.seg.ty, q.seg.tx) : b.angle;
      b.tq += BARGE_ALIGN * angDiff(b.angle, flowAngle);
      b.tq -= b.wa * BARGE_ANG_DRAG;
    }
  };

  Simulation.prototype.collideBanks = function () {
    if (this.ignoreBanks) return;
    for (const b of this.bodies) {
      const q = this.worldToRiver(b.x, b.y);
      const limit = this.halfWidth - b.radius * 0.22;
      const over = Math.abs(q.offset) - limit;
      if (over <= 0) continue;
      const sign = q.offset >= 0 ? 1 : -1;
      const nx = q.seg.nx * sign, ny = q.seg.ny * sign;
      const cx = q.cx !== undefined ? q.cx : q.seg.ax + q.seg.tx * q.seg.len * q.u;
      const cy = q.cy !== undefined ? q.cy : q.seg.ay + q.seg.ty * q.seg.len * q.u;
      b.x = cx + nx * limit;
      b.y = cy + ny * limit;
      const vn = b.vx * nx + b.vy * ny;
      if (vn > 0) {
        b.vx -= nx * vn * 1.05;
        b.vy -= ny * vn * 1.05;
        const flowA = Math.atan2(q.seg.ty, q.seg.tx);
        b.tq += 2.2 * Math.sin(flowA - b.angle);
        b.wa *= 0.92;
        if (b !== this.tug) {
          const dmg = vn * 0.16;
          b.damage += dmg;
          this.collisionEvents.push({ time: this.time, body: b.name, type: 'bank', speed: vn });
        }
      }
    }
  };

  Simulation.prototype.collideBridges = function () {
    for (const b of this.bodies) {
      const q = this.worldToRiver(b.x, b.y);
      for (let i = 0; i < BRIDGES.length; i++) {
        const bridge = BRIDGES[i];
        const crossing = b.prevS !== null &&
          b.prevS < bridge.s && q.s >= bridge.s &&
          bridge.s - b.prevS < 400;
        if (q.s > bridge.s + 220 || q.s < bridge.s - 220) b.bridgeCooldown[i] = false;
        if (!crossing || b.bridgeCooldown[i]) continue;
        if (this.bridgeOpen(i, this.time)) {
          b.bridgeCooldown[i] = true;
          continue;
        }
        const center = this.riverAt(bridge.s);
        const back = clamp(bridge.s - 14, 0, this.river.length - 1);
        const stop = this.riverAt(back);
        b.x = stop.x - center.tx * b.radius;
        b.y = stop.y - center.ty * b.radius;
        const vn = b.vx * center.tx + b.vy * center.ty;
        if (vn > 0) {
          b.vx -= center.tx * vn * 1.3;
          b.vy -= center.ty * vn * 1.3;
        }
        if (b !== this.tug) b.damage += 14;
        b.bridgeCooldown[i] = true;
        this.bridgeHits.push({ time: this.time, bridge: i, body: b.name });
      }
      b.prevS = q.s;
    }
  };

  Simulation.prototype.collideBodies = function () {
    for (let i = 0; i < this.bodies.length; i++) {
      for (let j = i + 1; j < this.bodies.length; j++) {
        const a = this.bodies[i], b = this.bodies[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 0.0001;
        const minD = a.radius + b.radius;
        if (d >= minD) continue;
        const nx = dx / d, ny = dy / d;
        const push = (minD - d) / 2;
        a.x -= nx * push; a.y -= ny * push;
        b.x += nx * push; b.y += ny * push;
        const rvx = b.vx - a.vx, rvy = b.vy - a.vy;
        const vn = rvx * nx + rvy * ny;
        if (vn < 0) {
          const inv = 1 / a.mass + 1 / b.mass;
          const imp = (-1.15 * vn) / inv;
          a.vx -= nx * imp / a.mass; a.vy -= ny * imp / a.mass;
          b.vx += nx * imp / b.mass; b.vy += ny * imp / b.mass;
          if (b !== this.tug && Math.abs(vn) > 14) {
            b.damage += Math.abs(vn) * 0.05;
            this.collisionEvents.push({ time: this.time, body: b.name, type: 'hull', speed: Math.abs(vn) });
          }
        }
      }
    }
  };

  Simulation.prototype.detectFold = function () {
    for (let i = 0; i < this.barges.length - 1; i++) {
      const a = this.barges[i], b = this.barges[i + 1];
      const dx = b.x - a.x, dy = b.y - a.y;
      const linkAngle = Math.atan2(dy, dx);
      const rel = Math.abs(angDiff(a.angle, linkAngle));
      const bend = Math.abs(angDiff(a.angle, b.angle));
      const close = Math.hypot(dx, dy) < a.radius + b.radius + 30;
      if (close && (rel > FOLD_ANGLE || bend > FOLD_ANGLE)) {
        const last = this.foldEvents[this.foldEvents.length - 1];
        if (!last || this.time - last.time > 2.5 || last.pair !== i) {
          this.foldEvents.push({
            time: this.time, pair: i,
            angle: bend, linkAngle: rel,
            x: (a.x + b.x) / 2, y: (a.y + b.y) / 2
          });
        }
      }
    }
  };

  Simulation.prototype.integrate = function (dt) {
    for (const b of this.bodies) {
      b.vx += (b.fx / b.mass) * dt;
      b.vy += (b.fy / b.mass) * dt;
      b.wa += b.tq * dt;
      b.wa = clamp(b.wa, -3.2, 3.2);
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.angle += b.wa * dt;
      b.fx = 0; b.fy = 0; b.tq = 0;
    }
  };

  Simulation.prototype.maxFoldAngle = function () {
    let worst = 0;
    for (let i = 0; i < this.barges.length - 1; i++) {
      const a = this.barges[i], b = this.barges[i + 1];
      const rel = Math.abs(angDiff(a.angle, b.angle));
      if (rel > worst) worst = rel;
    }
    return worst;
  };

  Simulation.prototype.checkEnd = function () {
    if (this.totalDamage() >= DAMAGE_LIMIT) {
      this.status = 'failed-damage';
      return;
    }
    const allDocked = this.barges.every((b) => {
      const q = this.worldToRiver(b.x, b.y);
      return q.s >= DOCK_STATION && Math.abs(q.offset) < this.halfWidth - 6;
    });
    if (allDocked) {
      const slow = this.barges.every((b) => Math.hypot(b.vx, b.vy) < 46);
      if (slow) this.status = 'success';
    }
  };

  Simulation.prototype.step = function (dt) {
    if (this.status !== 'running') return;
    dt = dt || 1 / 60;
    const sub = 2;
    const h = dt / sub;
    for (let k = 0; k < sub; k++) {
      this.time += h;
      this.applyCables(h);
      this.applyHydro(h);
      this.integrate(h);
      this.collideBanks();
      this.collideBodies();
      this.collideBridges();
      this.detectFold();
      this.checkEnd();
      if (this.status !== 'running') break;
    }
  };

  Simulation.prototype.snapshot = function () {
    return {
      time: this.time,
      status: this.status,
      water: this.waterLevel(),
      damage: this.totalDamage(),
      tugS: this.worldToRiver(this.tug.x, this.tug.y).s,
      maxFold: this.maxFoldAngle(),
      maxTension: this.maxTension
    };
  };

  return {
    RIVER_POINTS, RIVER_HALF_WIDTH, DOCK_STATION, RIVER_END,
    TUG, BARGE, BARGE_COUNT, CABLE_MIN, CABLE_MAX, CABLE_RATE,
    CABLE_BREAK_FORCE, BRIDGES, DAMAGE_LIMIT, FOLD_ANGLE,
    clamp, dist, angDiff, buildRiver, makeBody, Simulation
  };
});
