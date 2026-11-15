/* 阵风效应验证：同载重下强阵风抬高应力峰值与摆角。node tests/wind-effect.js */
const assert = require('assert');
const { E, advance } = require('./sim.js');
const { CFG, createGame, loadCargo } = E;

function peakStress(cargo, opts) {
  const g = createGame(opts);
  advance(g, 3);
  const a = Math.min(6, cargo);
  for (let i = 0; i < a; i++) loadCargo(g, 'A', 1);
  for (let i = 0; i < cargo - a; i++) loadCargo(g, 'C', 1);
  g.input.dir = 1;
  let peak = 0;
  let maxTheta = 0;
  let maxWind = 0;
  let guard = 0;
  while (g.s < 1 - CFG.END_HALF && guard < 60000) {
    E.step(g, CFG.FIXED_DT);
    peak = Math.max(peak, g.stress * CFG.STRAIN_LIMIT);
    maxTheta = Math.max(maxTheta, Math.abs(g.theta));
    maxWind = Math.max(maxWind, g.wind);
    guard++;
  }
  return { peak, maxTheta, maxWind, gusts: g.events.filter(e => e.type === 'gust').length };
}

// 强制持续强阵风的游戏：通过临时把背景阵风间隔压到极小
function strongWindPeak(cargo) {
  const g = createGame({ seed: 1 });
  g._gust.nextAt = 0;       // 立刻起风
  advance(g, 3);
  const a = Math.min(6, cargo);
  for (let i = 0; i < a; i++) loadCargo(g, 'A', 1);
  for (let i = 0; i < cargo - a; i++) loadCargo(g, 'C', 1);
  g.input.dir = 1;
  let peak = 0;
  let maxTheta = 0;
  let guard = 0;
  while (g.s < 1 - CFG.END_HALF && guard < 60000) {
    E.step(g, CFG.FIXED_DT);
    peak = Math.max(peak, g.stress * CFG.STRAIN_LIMIT);
    maxTheta = Math.max(maxTheta, Math.abs(g.theta));
    guard++;
  }
  return { peak, maxTheta };
}

const calm = peakStress(10, { gusts: false });
const windy = peakStress(10, { seed: 7 });
const strong = strongWindPeak(10);

console.log('无风 10 件:', JSON.stringify({
  peak: calm.peak.toFixed(4), swing: calm.maxTheta.toFixed(3)
}));
console.log('阵风 10 件:', JSON.stringify({
  peak: windy.peak.toFixed(4), swing: windy.maxTheta.toFixed(3),
  gusts: windy.gusts, maxWind: windy.maxWind.toFixed(1)
}));
console.log('即时强风 10 件:', JSON.stringify({
  peak: strong.peak.toFixed(4), swing: strong.maxTheta.toFixed(3)
}));

assert.strictEqual(calm.maxTheta, 0, '无风时吊篮不应摆动');
assert.ok(windy.gusts >= 1, '应至少生成一次阵风');
assert.ok(windy.maxTheta > 0.15, '阵风应产生可见摆角，实际 ' + windy.maxTheta);
assert.ok(windy.peak >= calm.peak, '阵风峰值应力不应低于无风工况');
assert.ok(strong.peak > calm.peak, '强阵风应显著抬高应力峰值');
assert.ok(strong.maxTheta > 0.2, '强阵风应产生明显摆角，实际 ' + strong.maxTheta);
console.log('\n✔ 阵风效应 5 项断言通过：阵风驱动摆动并抬高桥面应力');
