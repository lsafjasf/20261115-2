/* Node headless run: completes one cleaning pass and reports water use. */
const Sim = require('../js/simulation.js');

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function run(label, params, seed) {
  const rng = mulberry32(seed || 42);
  const state = Sim.createState(params);
  const dt = 0.1;
  let guard = 0;
  let dryAt = null;
  while (!state.finished && guard < 100000) {
    Sim.step(state, dt, rng);
    if (dryAt === null && state.tank === 0) dryAt = state.time;
    guard++;
  }
  const targets = Sim.targetStatus(state);
  const line = [
    label.padEnd(18),
    't=' + state.time.toFixed(1) + 's',
    'water=' + state.waterUsed.toFixed(2) + 'L',
    'tank=' + state.tank.toFixed(2) + 'L',
    'dryAt=' + (dryAt === null ? '-' : dryAt.toFixed(1) + 's'),
    'fleetPower=' + (state.power * 100).toFixed(1) + '%',
    'targets=[' + targets.map(function (q) {
      return 'P' + q.id + ':' + (q.recovery * 100).toFixed(1) + '%' + (q.ok ? 'OK' : 'X');
    }).join(' ') + ']',
    'result=' + (state.success ? 'SUCCESS' : 'FAIL')
  ].join('  ');
  console.log(line);
  console.log('  per-panel recovery: ' + state.panels.map(function (sp) {
    return 'P' + sp.id + ' ' + (sp.recovery * 100).toFixed(0) + '%';
  }).join(' | '));
  return state;
}

const scenarios = [
  ['balanced default', { speed: 1.2, pressure: 60, flow: 3.0 }],
  ['greedy high flow', { speed: 1.2, pressure: 60, flow: 5.0 }],
  ['water saver', { speed: 0.8, pressure: 80, flow: 2.0 }],
  ['too fast + dry', { speed: 2.5, pressure: 30, flow: 0.5 }],
  ['flow empties tank', { speed: 1.2, pressure: 70, flow: 5.0 }]
];

for (const [label, params] of scenarios) run(label, params);
