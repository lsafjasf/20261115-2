/*
 * Space tug towing simulation - deterministic 2D rigid-body physics.
 * UMD module: works in Node (require) and browsers (global TugPhysics).
 * All randomness comes from a mulberry32 PRNG seeded by the caller;
 * integration uses a fixed timestep so a fixed seed always replays identically.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.TugPhysics = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var FIXED_DT = 1 / 60;
  var SUBSTEPS = 3;

  var TUG = {
    radius: 14,
    mass: 120,
    inertia: 120 * 14 * 14 * 0.55,
    thrust: 2600,
    rcsTorque: 22000,
    maxFuel: 340,
    fuelPerMainSecond: 3.2,
    fuelPerRcsSecond: 0.2,
    hull: 100,
    hitch: { x: -10, y: 0 }
  };

  var CABLE = {
    minLength: 46,
    maxLength: 240,
    stiffness: 90,
    damping: 95,
    pushRod: true,
    breakTension: 40000
  };

  var STATION = { radius: 52, dockRadius: 130, position: { x: 0, y: 0 } };

  var BOUNDS = 1600;
  var WORLD = { width: 3200, height: 2400 };

  var MODULE_TEMPLATES = [
    { name: 'Cargo-A', radius: 13, mass: 260, inertia: 260 * 13 * 13 * 0.6 },
    { name: 'Cargo-B', radius: 15, mass: 340, inertia: 340 * 15 * 15 * 0.6 },
    { name: 'Cargo-C', radius: 17, mass: 460, inertia: 460 * 17 * 17 * 0.6 }
  ];

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function makeBody(x, y, angle, radius, mass, inertia) {
    return {
      x: x, y: y, angle: angle || 0,
      vx: 0, vy: 0, omega: 0,
      radius: radius, mass: mass, inertia: inertia,
      fx: 0, fy: 0, torque: 0
    };
  }

  function buildStars(rng, count) {
    var stars = [];
    for (var i = 0; i < count; i++) {
      stars.push({
        x: rng() * WORLD.width - WORLD.width / 2,
        y: rng() * WORLD.height - WORLD.height / 2,
        size: rng() < 0.85 ? 1 : 2,
        depth: 0.25 + rng() * 0.75,
        twinkle: rng() * Math.PI * 2
      });
    }
    return stars;
  }

  function createWorld(seed, options) {
    options = options || {};
    var rng = mulberry32(seed);
    var stars = buildStars(rng, 260);

    var tug = makeBody(520, 360, Math.PI, TUG.radius, TUG.mass, TUG.inertia);

    var modules = MODULE_TEMPLATES.map(function (tpl, index) {
      var body = makeBody(
        760 + index * 300 + (rng() - 0.5) * 160,
        -260 - index * 220 + (rng() - 0.5) * 120,
        rng() * Math.PI * 2,
        tpl.radius, tpl.mass, tpl.inertia
      );
      return {
        name: tpl.name,
        body: body,
        hitch: { x: -tpl.radius * 0.4, y: 0 },
        recovered: false,
        damage: 0
      };
    });

    if (options.heavyModule) {
      var heavy = options.heavyModule;
      var first = modules[0];
      first.body.mass = heavy.mass;
      first.body.inertia = heavy.mass * first.body.radius * first.body.radius * 0.6;
      first.name = heavy.name || 'OVERLOAD';
    }

    return {
      seed: seed,
      rng: rng,
      stars: stars,
      tug: tug,
      modules: modules,
      station: {
        x: STATION.position.x, y: STATION.position.y,
        radius: STATION.radius, angle: 0
      },
      cable: {
        attached: false,
        moduleIndex: -1,
        restLength: CABLE.minLength,
        tension: 0,
        broken: false,
        hitchTug: { x: TUG.hitch.x, y: TUG.hitch.y },
        hitchModule: { x: 0, y: 0 }
      },
      fuel: TUG.maxFuel,
      hull: TUG.hull,
      time: 0,
      stepCount: 0,
      status: 'running',
      recoveredCount: 0,
      lastImpact: 0,
      events: []
    };
  }

  function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }

  function rotate(x, y, angle) {
    var c = Math.cos(angle), s = Math.sin(angle);
    return { x: x * c - y * s, y: x * s + y * c };
  }

  function hitchWorld(body, hitch) {
    var p = rotate(hitch.x, hitch.y, body.angle);
    return { x: body.x + p.x, y: body.y + p.y };
  }

  function resetForces(world) {
    var bodies = [world.tug];
    for (var i = 0; i < world.modules.length; i++) {
      bodies.push(world.modules[i].body);
    }
    for (var j = 0; j < bodies.length; j++) {
      bodies[j].fx = 0;
      bodies[j].fy = 0;
      bodies[j].torque = 0;
    }
  }

  function applyThrusters(world, input, dt) {
    if (world.status !== 'running') {
      return { main: 0, rcs: 0 };
    }
    var tug = world.tug;
    var mainLevel = 0;
    var rcsLevel = 0;

    if (world.fuel > 0) {
      mainLevel = clamp(input.throttle || 0, -1, 1);
      if (mainLevel === 0 && input.brake) {
        mainLevel = -0.7;
      }
      if (mainLevel !== 0) {
        var force = TUG.thrust * mainLevel;
        tug.fx += Math.cos(tug.angle) * force;
        tug.fy += Math.sin(tug.angle) * force;
        world.fuel = Math.max(0,
          world.fuel - TUG.fuelPerMainSecond * Math.abs(mainLevel) * dt);
      }

      var turn = clamp(input.turn || 0, -1, 1);
      if (turn !== 0) {
        rcsLevel = Math.abs(turn);
        tug.torque += TUG.rcsTorque * turn;
        world.fuel = Math.max(0,
          world.fuel - TUG.fuelPerRcsSecond * rcsLevel * dt);
      }
    }
    world.throttleLevel = mainLevel;
    world.rcsLevel = rcsLevel;
    return { main: mainLevel, rcs: rcsLevel };
  }

  function activeModule(world) {
    if (!world.cable.attached || world.cable.broken) {
      return null;
    }
    var mod = world.modules[world.cable.moduleIndex];
    return mod && !mod.recovered ? mod : null;
  }

  function attachCable(world, moduleIndex) {
    var mod = world.modules[moduleIndex];
    if (!mod || mod.recovered || world.cable.attached) {
      return false;
    }
    var tugPoint = hitchWorld(world.tug, TUG.hitch);
    var modPoint = hitchWorld(mod.body, mod.hitch);
    var dx = modPoint.x - tugPoint.x;
    var dy = modPoint.y - tugPoint.y;
    var dist = Math.hypot(dx, dy);
    var centerGap = Math.hypot(mod.body.x - world.tug.x,
      mod.body.y - world.tug.y);
    if (centerGap < TUG.radius + mod.body.radius + 34) {
      return false;
    }
    world.cable.attached = true;
    world.cable.broken = false;
    world.cable.moduleIndex = moduleIndex;
    world.cable.restLength = clamp(Math.max(dist, 84),
      CABLE.minLength, CABLE.maxLength);
    world.cable.tension = 0;
    world.cable.hitchModule = { x: mod.hitch.x, y: mod.hitch.y };
    world.events.push({ type: 'attach', time: world.time, module: mod.name });
    return true;
  }

  function detachCable(world) {
    if (!world.cable.attached) {
      return;
    }
    world.events.push({ type: 'detach', time: world.time });
    world.cable.attached = false;
    world.cable.moduleIndex = -1;
    world.cable.tension = 0;
  }

  function updateWinch(world, input, dt) {
    if (!world.cable.attached || world.status !== 'running') {
      return;
    }
    var speed = 120 * (input.winch || 0);
    world.cable.restLength = clamp(
      world.cable.restLength - speed * dt,
      CABLE.minLength, CABLE.maxLength
    );
  }

  function applyCable(world, dt) {
    var mod = activeModule(world);
    if (!mod) {
      world.cable.tension = 0;
      return null;
    }
    var tug = world.tug;
    var tugPoint = hitchWorld(tug, TUG.hitch);
    var modPoint = hitchWorld(mod.body, mod.hitch);
    var dx = modPoint.x - tugPoint.x;
    var dy = modPoint.y - tugPoint.y;
    var dist = Math.hypot(dx, dy) || 0.0001;
    var nx = dx / dist;
    var ny = dy / dist;

    var stretch = dist - world.cable.restLength;
    function pointVelocity(body, point) {
      var rx = point.x - body.x;
      var ry = point.y - body.y;
      return {
        vx: body.vx - body.omega * ry,
        vy: body.vy + body.omega * rx
      };
    }
    var vTug = pointVelocity(tug, tugPoint);
    var vMod = pointVelocity(mod.body, modPoint);
    var rate = ((vMod.vx - vTug.vx) * nx +
      (vMod.vy - vTug.vy) * ny);

    var tension = CABLE.stiffness * stretch + CABLE.damping * rate;
    if (!CABLE.pushRod) {
      tension = Math.max(0, tension);
    }

    if (tension > CABLE.breakTension) {
      world.cable.broken = true;
      world.cable.tension = 0;
      world.events.push({ type: 'snap', time: world.time, tension: tension });
      detachCable(world);
      return null;
    }
    world.cable.tension = tension;

    var fx = nx * tension;
    var fy = ny * tension;
    tug.fx += fx;
    tug.fy += fy;
    mod.body.fx -= fx;
    mod.body.fy -= fy;

    var rTug = rotate(TUG.hitch.x, TUG.hitch.y, tug.angle);
    tug.torque += rTug.x * fy - rTug.y * fx;
    var rMod = rotate(mod.hitch.x, mod.hitch.y, mod.body.angle);
    mod.body.torque += rMod.x * (-fy) - rMod.y * (-fx);
    return { tension: tension, nx: nx, ny: ny, dist: dist };
  }

  function resolveCollision(world, a, b, restitution) {
    var dx = b.x - a.x;
    var dy = b.y - a.y;
    var dist = Math.hypot(dx, dy) || 0.0001;
    var overlap = a.radius + b.radius - dist;
    if (overlap <= 0) {
      return 0;
    }
    var nx = dx / dist;
    var ny = dy / dist;
    var invA = 1 / a.mass;
    var invB = b.invMass || 1 / b.mass;
    var invSum = invA + invB;

    if (b.invMass === 0) {
      a.x -= nx * overlap;
      a.y -= ny * overlap;
    } else {
      a.x -= nx * overlap * (invA / invSum);
      a.y -= ny * overlap * (invA / invSum);
      b.x += nx * overlap * (invB / invSum);
      b.y += ny * overlap * (invB / invSum);
    }

    var rvx = b.vx - a.vx;
    var rvy = b.vy - a.vy;
    var velN = rvx * nx + rvy * ny;
    if (velN < 0) {
      var j = -(1 + restitution) * velN / invSum;
      var jx = nx * j;
      var jy = ny * j;
      a.vx -= jx * invA;
      a.vy -= jy * invA;
      if (b.invMass !== 0) {
        b.vx += jx * invB;
        b.vy += jy * invB;
      }
      return -velN * a.mass;
    }
    return 0;
  }

  function applyDamage(world, impulse, label) {
    if (impulse <= 7500) {
      return;
    }
    var amount = Math.min(40, (impulse - 7500) / 340);
    if (amount <= 0) {
      return;
    }
    world.hull = Math.max(0, world.hull - amount);
    world.lastImpact = impulse;
    world.events.push({
      type: 'damage', time: world.time, amount: amount, impulse: impulse,
      source: label || 'impact'
    });
  }

  function handleCollisions(world) {
    var tug = world.tug;
    var station = world.station;

    var stationBody = {
      x: station.x, y: station.y, radius: station.radius,
      mass: 1, vx: 0, vy: 0, invMass: 0
    };
    var tugImpulse = resolveCollision(world, tug, stationBody, 0.25);
    applyDamage(world, tugImpulse, 'station');

    for (var i = 0; i < world.modules.length; i++) {
      var mod = world.modules[i];
      if (mod.recovered) {
        continue;
      }
      var body = mod.body;
      var impulse = resolveCollision(world, tug, body, 0.35);
      if (impulse > 0) {
        applyDamage(world, impulse, mod.name);
      }
      var stationHit = resolveCollision(world, body, stationBody, 0.2);
      if (stationHit > 0) {
        mod.damage += stationHit / 400;
      }
    }

    for (var k = 0; k < world.modules.length; k++) {
      for (var m = k + 1; m < world.modules.length; m++) {
        if (world.modules[k].recovered || world.modules[m].recovered) {
          continue;
        }
        resolveCollision(world, world.modules[k].body,
          world.modules[m].body, 0.3);
      }
    }
  }

  function integrateBody(body, dt) {
    body.vx += (body.fx / body.mass) * dt;
    body.vy += (body.fy / body.mass) * dt;
    body.omega += (body.torque / body.inertia) * dt;
    body.x += body.vx * dt;
    body.y += body.vy * dt;
    body.angle += body.omega * dt;
  }

  function enforceBounds(body) {
    var hit = false;
    if (body.x < -BOUNDS) { body.x = -BOUNDS; body.vx = Math.abs(body.vx) * 0.4; hit = true; }
    if (body.x > BOUNDS) { body.x = BOUNDS; body.vx = -Math.abs(body.vx) * 0.4; hit = true; }
    if (body.y < -BOUNDS) { body.y = -BOUNDS; body.vy = Math.abs(body.vy) * 0.4; hit = true; }
    if (body.y > BOUNDS) { body.y = BOUNDS; body.vy = -Math.abs(body.vy) * 0.4; hit = true; }
    return hit;
  }

  function checkDocking(world) {
    var mod = activeModule(world);
    if (!mod) {
      return;
    }
    var body = mod.body;
    var dist = Math.hypot(body.x - world.station.x, body.y - world.station.y);
    var speed = Math.hypot(body.vx, body.vy);
    if (dist < STATION.dockRadius && speed < 90) {
      mod.recovered = true;
      world.recoveredCount += 1;
      world.events.push({
        type: 'recover', time: world.time,
        module: mod.name, count: world.recoveredCount
      });
      detachCable(world);
      var awayX = world.tug.x - world.station.x;
      var awayY = world.tug.y - world.station.y;
      var awayLen = Math.hypot(awayX, awayY) || 1;
      var safeGap = STATION.radius + TUG.radius + 24;
      if (awayLen < safeGap) {
        world.tug.x = world.station.x + awayX / awayLen * safeGap;
        world.tug.y = world.station.y + awayY / awayLen * safeGap;
      }
      if (world.recoveredCount === world.modules.length) {
        world.status = 'won';
        world.events.push({ type: 'win', time: world.time });
      }
    }
  }

  function checkFailure(world) {
    if (world.status !== 'running') {
      return;
    }
    if (world.fuel <= 0 && world.recoveredCount < world.modules.length) {
      world.status = 'lost-fuel';
      world.events.push({ type: 'fuel-out', time: world.time });
    } else if (world.hull <= 0) {
      world.status = 'lost-hull';
      world.events.push({ type: 'hull-fail', time: world.time });
    }
  }

  function substep(world, input, dt) {
    resetForces(world);
    applyThrusters(world, input, dt);
    applyCable(world, dt);
    integrateBody(world.tug, dt);
    for (var i = 0; i < world.modules.length; i++) {
      var body = world.modules[i].body;
      if (!world.modules[i].recovered) {
        integrateBody(body, dt);
      }
    }
    handleCollisions(world);
    enforceBounds(world.tug);
    for (var j = 0; j < world.modules.length; j++) {
      if (!world.modules[j].recovered) {
        enforceBounds(world.modules[j].body);
      }
    }
  }

  function step(world, input) {
    input = input || {};
    if (world.status !== 'running') {
      return world;
    }
    updateWinch(world, input, FIXED_DT);
    var h = FIXED_DT / SUBSTEPS;
    for (var s = 0; s < SUBSTEPS; s++) {
      substep(world, input, h);
    }
    checkDocking(world);
    checkFailure(world);
    world.time += FIXED_DT;
    world.stepCount += 1;
    return world;
  }

  function telemetry(world) {
    var mod = activeModule(world);
    var tug = world.tug;
    var effectiveMass = tug.mass;
    var effectiveInertia = tug.inertia;
    if (mod) {
      var body = mod.body;
      effectiveMass += body.mass;
      var d = Math.hypot(body.x - tug.x, body.y - tug.y);
      effectiveInertia += body.inertia + body.mass * d * d;
    }
    return {
      time: world.time,
      fuel: world.fuel,
      hull: world.hull,
      status: world.status,
      recovered: world.recoveredCount,
      total: world.modules.length,
      tension: world.cable.tension,
      attached: !!mod,
      attachedName: mod ? mod.name : null,
      cableLength: world.cable.restLength,
      tugSpeed: Math.hypot(tug.vx, tug.vy),
      tugOmega: tug.omega,
      effectiveMass: effectiveMass,
      effectiveInertia: effectiveInertia,
      throttleLevel: world.throttleLevel || 0,
      rcsLevel: world.rcsLevel || 0,
      lastImpact: world.lastImpact
    };
  }

  return {
    FIXED_DT: FIXED_DT,
    TUG: TUG,
    CABLE: CABLE,
    STATION: STATION,
    WORLD: WORLD,
    createWorld: createWorld,
    step: step,
    attachCable: attachCable,
    detachCable: detachCable,
    hitchWorld: hitchWorld,
    telemetry: telemetry,
    mulberry32: mulberry32
  };
});
