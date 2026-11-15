/* 完整一局验证 + 过载极限 + 重车恢复。node tests/playthrough.js */
const assert = require('assert');
const { E, advance, driveTo, settle } = require('./sim.js');
const { CFG, createGame, loadCargo, unloadCargo, atStation, carMass } = E;

let pass = 0;
function check(name, cond, extra) {
  assert.ok(cond, '失败: ' + name + (extra ? ' (' + extra + ')' : ''));
  console.log('  ✓ ' + name + (extra ? ' — ' + extra : ''));
  pass++;
}

console.log('== 场景 1：完整一局（三班次双向，含中途站临时卸货）==');
{
  const g = createGame({ seed: 20261115 });
  advance(g, 2);                                   // 空桥预平衡

  // 班次 1：左平台装 A6 + C4（满载 10 件），到右平台交付（A、C 目标均为右）
  check('起始位于左平台', atStation(g) === 'left');
  for (let i = 0; i < 6; i++) loadCargo(g, 'A', 1);
  for (let i = 0; i < 4; i++) loadCargo(g, 'C', 1);
  check('满载 10 件，总质量 12', carMass(g) === 12, 'mass=' + carMass(g));
  driveTo(g, 1);
  check('班次 1 安全抵达右平台', g.status === 'running' && atStation(g) === 'right',
    'peakStress=' + g.peakStress.toFixed(3));
  check('班次计数=1', g.trips === 1, 'trips=' + g.trips);
  unloadCargo(g, 10);
  check('A6 全部交付右平台', g.delivered.A === 6, 'A=' + g.delivered.A);
  check('C4 交付右平台', g.delivered.C === 4, 'C=' + g.delivered.C);

  // 班次 2：右平台装 B5，运回左平台交付
  for (let i = 0; i < 5; i++) loadCargo(g, 'B', 1);
  driveTo(g, 0);
  check('班次 2 安全回到左平台', g.status === 'running' && atStation(g) === 'left');
  check('班次计数=2', g.trips === 2);
  unloadCargo(g, 5);
  check('B5 全部交付左平台', g.delivered.B === 5);

  // 班次 3：左平台装 C5，经中途站临时卸货再装车（演示临时卸货/增加负担），运抵右平台
  for (let i = 0; i < 5; i++) loadCargo(g, 'C', 1);
  driveTo(g, 0.5);
  check('停靠中途站', atStation(g) === 'mid');
  unloadCargo(g, 5);
  check('中途站临时卸货 5 件', g.piles.mid.C === 5 && g.midUnloads === 5);
  for (let i = 0; i < 5; i++) loadCargo(g, 'C', 1);  // 重新装车，演示“增加后续班次负担”
  driveTo(g, 1);
  check('班次 3 抵达右平台', g.status === 'running' && atStation(g) === 'right');
  check('班次计数=3', g.trips === 3);
  unloadCargo(g, 5);
  check('C9 全部到齐（班次1 的 4 + 班次3 的 5）', g.delivered.C === 9, 'C=' + g.delivered.C);
  check('三批货物全部到齐 → 胜利', g.status === 'won', 'status=' + g.status);
  console.log('  本局峰值应力比 ' + g.peakStress.toFixed(3) +
    '，最大下垂 ' + g.maxSag.toFixed(2) + 'm，阵风事件 ' +
    g.events.filter(e => e.type === 'gust').length + ' 次');
}

console.log('\n== 场景 2：过载桥面极限（无风，可复现）==');
function overloadTrial(cargo) {
  const g = createGame({ gusts: false });
  advance(g, 2);
  const a = Math.min(6, cargo);
  const c = cargo - a;
  for (let i = 0; i < a; i++) loadCargo(g, 'A', 1);
  for (let i = 0; i < c; i++) loadCargo(g, 'C', 1);
  g.input.dir = 1;
  let guard = 0;
  while (g.status === 'running' && g.s < 1 - CFG.END_HALF && guard < 12000) {
    advance(g, CFG.FIXED_DT);
    guard++;
  }
  return g;
}
{
  const safe = overloadTrial(10);
  check('10 件（mass12）全程不断裂', safe.status === 'running',
    'peakStress=' + safe.peakStress.toFixed(3));
  const over = overloadTrial(11);
  check('11 件（mass13）触发断裂', over.status === 'failed',
    'strain=' + over.failInfo.strain);
  check('断裂发生在跨中至高应力后半区', over.failInfo.s >= 0.5 && over.failInfo.s <= 0.95,
    's=' + over.failInfo.s.toFixed(2));
  check('断裂应变介于两工况之间',
    safe.peakStress * CFG.STRAIN_LIMIT < CFG.STRAIN_LIMIT &&
    over.failInfo.strain >= CFG.STRAIN_LIMIT,
    'safePeak=' + (safe.peakStress * CFG.STRAIN_LIMIT).toFixed(4) +
    ' limit=' + CFG.STRAIN_LIMIT + ' fail=' + over.failInfo.strain);
  const over12 = overloadTrial(12);
  check('12 件（mass14）更早断裂且应变更高',
    over12.status === 'failed' && over12.failInfo.strain >= over.failInfo.strain - 1e-9,
    'strain=' + over12.failInfo.strain);
}

console.log('\n== 场景 3：重车停车后的桥面恢复时间 ==');
{
  const g = createGame({ gusts: false });
  advance(g, 2);
  for (let i = 0; i < 8; i++) loadCargo(g, 'C', 1);   // mass10 重车
  driveTo(g, 0.5);
  g.input.dir = 0;
  let waited = 0;
  while (!g.recovery.settled && waited < 8) {
    advance(g, 0.1);
    waited += 0.1;
  }
  const settledEvent = g.events.find(e => e.type === 'settled');
  check('重车在跨中停稳后桥面可收敛', !!settledEvent,
    settledEvent ? '恢复耗时 ' + settledEvent.duration + 's' : '未收敛');
  check('恢复耗时在合理区间（0.5~6s）',
    settledEvent && settledEvent.duration >= 0.5 && settledEvent.duration <= 6);
}

console.log('\n全部 ' + pass + ' 项断言通过 ✔');
