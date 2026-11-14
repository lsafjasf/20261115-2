'use strict';

var P = require('../src/physics.js');
var A = require('../src/autopilot.js');

var SEED = 20261115;
var results = [];

function check(name, condition, detail) {
  results.push({ name: name, ok: !!condition, detail: detail || '' });
}

function snapshot(world) {
  return JSON.stringify({
    tug: [world.tug.x, world.tug.y, world.tug.angle,
      world.tug.vx, world.tug.vy, world.tug.omega],
    modules: world.modules.map(function (m) {
      return [m.body.x, m.body.y, m.body.angle, m.recovered];
    }),
    fuel: world.fuel,
    hull: world.hull,
    status: world.status,
    recovered: world.recoveredCount
  });
}

function runMission(options, maxSeconds) {
  var world = P.createWorld(SEED, options);
  var pilot = new A.Autopilot();
  var guard = Math.round(maxSeconds / P.FIXED_DT);
  var steps = 0;
  while (world.status === 'running' && steps < guard) {
    P.step(world, pilot.update(world));
    steps++;
  }
  return { world: world, pilot: pilot, steps: steps };
}

function testDeterminism() {
  var a = runMission(null, 60);
  var b = runMission(null, 60);
  check('determinism: identical replay from fixed seed',
    snapshot(a.world) === snapshot(b.world),
    'snapshots match at ' + a.steps + ' steps');

  var differentSeed = P.createWorld(SEED + 1);
  var sameSeed = P.createWorld(SEED);
  var layoutDiffers = JSON.stringify(differentSeed.modules.map(function (m) {
    return [m.body.x, m.body.y];
  })) !== JSON.stringify(sameSeed.modules.map(function (m) {
    return [m.body.x, m.body.y];
  }));
  check('determinism: different seed yields different layout',
    layoutDiffers, 'seed ' + SEED + ' vs ' + (SEED + 1));
}

function testFullMission() {
  var r = runMission(null, 400);
  var w = r.world;
  var t = P.telemetry(w);
  check('mission: reaches win state', w.status === 'won',
    'status=' + w.status);
  check('mission: all three modules recovered',
    t.recovered === 3, t.recovered + '/3');
  check('mission: fuel not exhausted',
    t.fuel > 0, Math.round(t.fuel) + ' of ' + P.TUG.maxFuel + ' left');
  check('mission: hull survives', t.hull > 0,
    'hull=' + Math.round(t.hull));
  var recovers = w.events.filter(function (e) {
    return e.type === 'recover';
  });
  check('mission: modules recovered in sequence 1->2->3',
    recovers.length === 3 &&
    recovers[0].module === 'Cargo-A' &&
    recovers[1].module === 'Cargo-B' &&
    recovers[2].module === 'Cargo-C',
    recovers.map(function (e) { return e.module; }).join(','));
  return r;
}

function measureTowBehaviour(options, windowSeconds) {
  var world = P.createWorld(SEED, options);
  var pilot = new A.Autopilot();
  var attachStep = -1;
  var angleAccum = 0;
  var towTicks = 0;
  var trackedIndex = 0;
  var startModuleRadius = 0;
  var maxTension = 0;
  var guard = Math.round(80 / P.FIXED_DT);
  for (var i = 0; i < guard && world.status === 'running'; i++) {
    var input = pilot.update(world);
    P.step(world, input);
    if (world.cable.attached) {
      if (attachStep < 0) {
        attachStep = i;
        trackedIndex = world.cable.moduleIndex;
        startModuleRadius = Math.hypot(
          world.modules[trackedIndex].body.x,
          world.modules[trackedIndex].body.y);
      }
      angleAccum += world.tug.omega * P.FIXED_DT;
      towTicks++;
      maxTension = Math.max(maxTension, world.cable.tension);
      if (i - attachStep > windowSeconds / P.FIXED_DT) {
        break;
      }
    }
  }
  var endModuleRadius = Math.hypot(
    world.modules[trackedIndex].body.x,
    world.modules[trackedIndex].body.y);
  return {
    world: world,
    revolutions: Math.abs(angleAccum) / (2 * Math.PI),
    radialProgress: startModuleRadius - endModuleRadius,
    maxTension: maxTension,
    recovered: world.recoveredCount,
    attachStep: attachStep
  };
}

function testOverloadLossOfControl() {
  var normal = measureTowBehaviour(null, 50);
  var heavy = measureTowBehaviour(
    { heavyModule: { name: 'OVERLOAD', mass: 6000 } }, 50);

  check('overload: normal tow makes net inward progress',
    normal.radialProgress > 60,
    '+' + normal.radialProgress.toFixed(0) + ' px toward station');
  check('overload: heavy tow cannot make inward progress',
    heavy.radialProgress < 0,
    heavy.radialProgress.toFixed(0) + ' px (drifts outward)');
  check('overload: heavy and normal behaviour clearly separated',
    normal.radialProgress > 0 && heavy.radialProgress < 0,
    'normal ' + normal.radialProgress.toFixed(0) +
    ' vs heavy ' + heavy.radialProgress.toFixed(0));
  check('overload: cable tension stays within strength limit',
    heavy.maxTension < P.CABLE.breakTension,
    Math.round(heavy.maxTension) + ' < ' + P.CABLE.breakTension +
    ' N (loss of control, not a snapped line)');
  check('overload: cannot recover module within window',
    heavy.recovered === 0, 'recovered=' + heavy.recovered);
}

testDeterminism();
testFullMission();
testOverloadLossOfControl();

var passed = results.filter(function (r) { return r.ok; }).length;
console.log('');
results.forEach(function (r) {
  console.log((r.ok ? 'PASS' : 'FAIL') + '  ' + r.name +
    (r.detail ? '  (' + r.detail + ')' : ''));
});
console.log('');
console.log(passed + '/' + results.length + ' checks passed');
if (passed !== results.length) {
  process.exit(1);
}
