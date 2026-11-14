/*
 * Deterministic autopilot for the space tug.
 * Pure function: given the physics world, returns an input object each tick.
 * Phases per module: approach -> attach -> tow -> release near station.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./physics.js'));
  } else {
    root.TugAutopilot = factory(root.TugPhysics);
  }
})(typeof self !== 'undefined' ? self : this, function (P) {
  'use strict';

  function angleDiff(a, b) {
    var d = a - b;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  function dist(ax, ay, bx, by) {
    return Math.hypot(ax - bx, ay - by);
  }

  function headingControl(desired, current, kp, kd, omega) {
    var err = angleDiff(desired, current);
    var cmd = kp * err - kd * omega;
    return Math.max(-1, Math.min(1, cmd));
  }

  function retroBrake(world, input, travelHeading, strength) {
    var tug = world.tug;
    var speed = Math.hypot(tug.vx, tug.vy);
    if (speed < 4) {
      return;
    }
    var velHeading = Math.atan2(tug.vy, tug.vx);
    var err = angleDiff(velHeading, travelHeading);
    if (Math.abs(err) < 0.35) {
      input.throttle = -(strength || 0.8);
      input.brake = false;
    } else {
      input.brake = true;
    }
  }

  function Autopilot(options) {
    options = options || {};
    this.phase = 'approach';
    this.targetIndex = 0;
    this.maxSpeed = options.maxSpeed || 240;
    this.towSpeed = options.towSpeed || 170;
    this.attachStep = -1;
    this.backoff = 0;
  }

  Autopilot.prototype.targetModule = function (world) {
    for (var i = 0; i < world.modules.length; i++) {
      if (!world.modules[i].recovered) {
        return i;
      }
    }
    return -1;
  };

  Autopilot.prototype.update = function (world) {
    var input = { throttle: 0, turn: 0, brake: false, winch: 0 };
    if (world.status !== 'running') {
      return input;
    }
    var idx = this.targetModule(world);
    if (idx < 0) {
      return input;
    }
    this.targetIndex = idx;
    var tug = world.tug;
    var mod = world.modules[idx];
    var body = mod.body;
    var attached = world.cable.attached && world.cable.moduleIndex === idx;

    if (!attached) {
      this.attachStep = -1;
      this.phase = 'approach';
      return this.approach(world, mod, input);
    }
    this.phase = 'tow';
    var out = this.tow(world, mod, input);
    if (mod.recovered) {
      this.backoff = 150;
    }
    if (this.backoff > 0) {
      this.backoff -= 1;
      var radial = Math.hypot(tug.x, tug.y) || 1;
      var away = Math.atan2(tug.y / radial, tug.x / radial);
      out.turn = headingControl(away, tug.angle, 2.2, 2.0, tug.omega);
      if (Math.abs(angleDiff(away, tug.angle)) < 0.4) {
        out.throttle = 0.4;
        out.brake = false;
      }
    }
    return out;
  };

  Autopilot.prototype.approach = function (world, mod, input) {
    var tug = world.tug;
    var body = mod.body;
    var hitch = P.hitchWorld(tug, P.TUG.hitch);
    var dx = body.x - hitch.x;
    var dy = body.y - hitch.y;
    var d = Math.hypot(dx, dy) || 0.001;

    var speed = Math.hypot(tug.vx, tug.vy);
    var reverseAccel = P.TUG.thrust * 0.8 / tug.mass;
    var approachSpeed = Math.min(110,
      Math.sqrt(2 * reverseAccel * Math.max(0, d - 70)) + 10);
    var nx = dx / d, ny = dy / d;
    var desVx = nx * approachSpeed;
    var desVy = ny * approachSpeed;
    var dvx = desVx - tug.vx;
    var dvy = desVy - tug.vy;
    var dvMag = Math.hypot(dvx, dvy);
    var thrustHeading = Math.atan2(dvy, dvx);
    var noseAim = thrustHeading + Math.PI;

    input.turn = headingControl(noseAim, tug.angle, 2.4, 2.2, tug.omega);
    var aimErr = Math.abs(angleDiff(noseAim, tug.angle));

    if (d < 92 && speed < 80 && aimErr < 0.7) {
      P.attachCable(world, this.targetIndex);
    }
    if (aimErr < 0.4 && dvMag > 6 && d > 48) {
      input.throttle = -Math.min(0.85, 0.25 + dvMag / 130);
    } else if (aimErr >= 0.4 && speed > 50) {
      input.brake = true;
    }
    return input;
  };

  Autopilot.prototype.tow = function (world, mod, input) {
    var tug = world.tug;
    var body = mod.body;
    var station = world.station;

    var dx = station.x - tug.x;
    var dy = station.y - tug.y;
    var dStation = Math.hypot(dx, dy) || 0.001;
    var desired = Math.atan2(dy, dx);

    var hitch = P.hitchWorld(tug, P.TUG.hitch);
    var cableAngle = Math.atan2(body.y - hitch.y, body.x - hitch.x);
    var swing = angleDiff(cableAngle, tug.angle + Math.PI);
    var c = Math.cos(cableAngle), s = Math.sin(cableAngle);
    var pointVel = function (b, h) {
      var r = P.hitchWorld(b, h);
      var rx = r.x - b.x, ry = r.y - b.y;
      return {
        vx: b.vx - b.omega * ry,
        vy: b.vy + b.omega * rx
      };
    };
    var vTug = pointVel(tug, P.TUG.hitch);
    var vMod = pointVel(body, mod.hitch);
    var dvx = vMod.vx - vTug.vx;
    var dvy = vMod.vy - vTug.vy;
    var transverseRate = -dvx * s + dvy * c;
    var headingErr = angleDiff(desired, tug.angle);
    var swingCmd = -0.5 * swing - 0.008 * transverseRate;
    input.turn = Math.max(-1, Math.min(1,
      0.55 * headingErr - 0.85 * tug.omega + 0.3 * swingCmd));

    var aligned = Math.abs(headingErr) < 0.35;
    var roughlyAligned = Math.abs(headingErr) < 0.6;
    var speed = Math.hypot(tug.vx, tug.vy);
    var limit = dStation < 320 ? Math.max(40, 0.26 * dStation)
      : this.towSpeed;
    var swingOk = Math.abs(swing) < 1.6;
    if (this.attachStep < 0) {
      this.attachStep = world.stepCount;
    }
    var settled = world.stepCount - this.attachStep > 60;
    var modDist = dist(body.x, body.y, station.x, station.y);
    if (modDist < P.STATION.dockRadius + 170) {
      input.throttle = 0;
      var toStationX = (station.x - body.x) / (modDist || 1);
      var toStationY = (station.y - body.y) / (modDist || 1);
      var cableLen = world.cable.restLength;
      var anchorX = station.x - toStationX * (P.STATION.dockRadius - 20);
      var anchorY = station.y - toStationY * (P.STATION.dockRadius - 20);
      var adx = anchorX - tug.x;
      var ady = anchorY - tug.y;
      var anchorDist = Math.hypot(adx, ady) || 1;
      var anchorHeading = Math.atan2(ady, adx);
      var aim = anchorHeading;
      input.turn = headingControl(aim, tug.angle, 2.4, 2.2, tug.omega);
      var aimErr = Math.abs(angleDiff(aim, tug.angle));
      var closing = body.vx * toStationX + body.vy * toStationY;
      if (aimErr < 0.4) {
        if (closing > 0.55 * modDist + 18) {
          input.brake = true;
        } else if (anchorDist > cableLen * 0.4) {
          input.throttle = 0.5;
        }
      }
      var tugR = Math.hypot(tug.x, tug.y);
      var tugSafe = P.STATION.radius + tug.radius + 22;
      if (tugR < tugSafe) {
        var outAway = Math.atan2(tug.y, tug.x);
        input.turn = headingControl(outAway, tug.angle, 2.6, 2.2, tug.omega);
        if (Math.abs(angleDiff(outAway, tug.angle)) < 0.4) {
          input.throttle = 0.5;
        }
        input.brake = false;
      }
      input.winch = 0;
      return input;
    }

    if (roughlyAligned && dStation > STATION_DOCK(world) &&
      (swingOk || settled)) {
      if (speed > limit + 15) {
        retroBrake(world, input, desired, 0.6);
      } else if (speed < limit - 15) {
        input.throttle = aligned ? 0.6 : 0.35;
      }
    } else if (speed > this.towSpeed + 30) {
      retroBrake(world, input, desired, 0.5);
    }
    return input;
  };

  function STATION_DOCK() {
    return P.STATION.dockRadius + 40;
  }

  return {
    Autopilot: Autopilot,
    angleDiff: angleDiff
  };
});
