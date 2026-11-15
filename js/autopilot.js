 (function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./sim.js'));
  else root.TugAutopilot = factory(root.TugSim);
})(typeof self !== 'undefined' ? self : this, function (S) {
  'use strict';

  function Autopilot(sim, opts) {
    opts = opts || {};
    this.sim = sim;
    this.aggressive = !!opts.aggressive;
    this.targetCable = opts.targetCable || 70;
    this.maxSpeed = this.aggressive ? 120 : 78;
    this.bendSpeed = this.aggressive ? 95 : 52;
    this.log = [];
  }

  Autopilot.prototype.lookAhead = function (dist) {
    const sim = this.sim;
    const q = sim.worldToRiver(sim.tug.x, sim.tug.y);
    const target = sim.riverAt(clampStation(sim, q.s + dist));
    const desired = Math.atan2(target.y - sim.tug.y, target.x - sim.tug.x);
    return { q, target, desired };
  };

  function clampStation(sim, s) {
    return Math.max(0, Math.min(s, sim.river.length - 1));
  }

  Autopilot.prototype.update = function () {
    const sim = this.sim;
    const info = this.lookAhead(150);
    const q = info.q;
    const headingErr = S.angDiff(sim.tug.angle, info.desired);
    const rudder = S.clamp(-headingErr * 1.7, -1, 1);

    const speed = Math.hypot(sim.tug.vx, sim.tug.vy);
    const bendAhead = this.bendAhead(q.s, 420);
    let targetSpeed = bendAhead ? this.bendSpeed : this.maxSpeed;

    let throttle = 0;
    if (speed < targetSpeed - 6) throttle = 1;
    else if (speed > targetSpeed + 10) throttle = -0.55;
    else throttle = 0.25;

    for (let i = 0; i < S.BRIDGES.length; i++) {
      const bs = S.BRIDGES[i].s;
      if (bs > q.s && bs - q.s < 260) {
        if (!sim.bridgeOpen(i, sim.time)) {
          targetSpeed = 0;
          throttle = speed > 14 ? -0.7 : 0.05;
          this.log.push({ time: sim.time, type: 'wait-bridge', bridge: i });
        }
      }
    }

    const dock = S.DOCK_STATION;
    if (dock - q.s < 360) {
      targetSpeed = 34;
      throttle = speed > 40 ? -0.6 : 0.3;
    }

    let winch = 0;
    const avg = sim.cables.reduce((a, c) => a + c, 0) / sim.cables.length;
    if (avg < this.targetCable - 2) winch = 1;
    else if (avg > this.targetCable + 2) winch = -1;
    if (bendAhead && avg > 62) winch = -1;

    sim.setInput(throttle, rudder, winch);
    return { throttle, rudder, winch, headingErr, targetSpeed, bendAhead };
  };

  Autopilot.prototype.bendAhead = function (s, range) {
    const sim = this.sim;
    for (let d = 60; d < range; d += 60) {
      const a = sim.riverAt(Math.min(s + d, sim.river.length - 1));
      const b = sim.riverAt(Math.min(s + d + 60, sim.river.length - 1));
      const turn = Math.abs(S.angDiff(
        Math.atan2(a.ty, a.tx),
        Math.atan2(b.ty, b.tx)
      ));
      if (turn > 0.12) return true;
    }
    return false;
  };

  function run(sim, opts, maxSeconds) {
    const pilot = new Autopilot(sim, opts);
    const frames = Math.ceil((maxSeconds || 240) * 60);
    for (let i = 0; i < frames; i++) {
      pilot.update();
      sim.step(1 / 60);
      if (sim.status !== 'running') break;
    }
    return pilot;
  }

  return { Autopilot, run };
});
