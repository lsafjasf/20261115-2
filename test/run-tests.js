const S = require('../js/sim.js');
const A = require('../js/autopilot.js');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed += 1;
    console.log('  PASS ' + message);
  } else {
    failed += 1;
    console.error('  FAIL ' + message);
  }
}

function section(name) {
  console.log('\n=== ' + name + ' ===');
}

section('一局完整航程（自动驾驶）');
{
  const sim = new S.Simulation();
  const pilot = A.run(sim, { targetCable: 70 }, 240);
  const snap = sim.snapshot();
  console.log('  结果:', sim.status, '用时', sim.time.toFixed(1) + 's',
    '损伤', sim.totalDamage().toFixed(1), '/', S.DAMAGE_LIMIT,
    '最大折叠', (sim.maxFoldAngle() * 180 / Math.PI).toFixed(0) + 'deg');
  assert(sim.status === 'success', '三节驳船全部抵达码头且减速达标');
  assert(sim.totalDamage() < S.DAMAGE_LIMIT, '总损伤低于阈值');
  assert(sim.bridgeHits.length === 0, '没有撞击低桥（水位判定生效）');
  assert(sim.cableBroken.every((b) => !b), '全程没有断缆');
  assert(sim.barges.every((b) => sim.worldToRiver(b.x, b.y).s >= S.DOCK_STATION),
    '每节驳船站位都超过码头线');
  assert(sim.time < 240, '在时限内完成航程');
  assert(snap.water > 0.5 && snap.water < 3.6, '水位随时间波动且范围合理');
  console.log('  等待桥孔次数:', pilot.log.filter((l) => l.type === 'wait-bridge').length);
}

section('船列折叠测试（急停 + 满舵，开阔水面）');
{
  const sim = new S.Simulation({ ignoreBanks: true, fixedWater: 1.5 });
  let maxFold = 0;
  let atTime = 0;
  for (let i = 0; i < 6000; i++) {
    const t = sim.time;
    const throttle = t > 10 ? -1 : 1;
    const rudder = t > 10 ? 1 : 0;
    sim.setInput(throttle, rudder, -1);
    sim.step(1 / 60);
    const f = sim.maxFoldAngle();
    if (f > maxFold) {
      maxFold = f;
      atTime = t;
    }
  }
  console.log('  最大折叠角:', (maxFold * 180 / Math.PI).toFixed(0) + 'deg',
    '发生于', atTime.toFixed(1) + 's', '折叠事件', sim.foldEvents.length,
    '损伤', sim.totalDamage().toFixed(1));
  assert(maxFold >= S.FOLD_ANGLE, '折叠角超过检测阈值 ' + (S.FOLD_ANGLE * 180 / Math.PI) + 'deg');
  assert(maxFold > 2.6, '出现接近对折的 V 形折叠（>150deg）');
  assert(sim.foldEvents.length > 5, '折叠事件被持续记录');
  assert(sim.cables.every((c) => c <= S.CABLE_MIN + 0.5), '绞车已把缆绳收到最短');
  assert(sim.totalDamage() > 0, '折叠过程中船体发生接触损伤');
}

section('水位与桥高逻辑');
{
  const high = new S.Simulation({ fixedWater: 3.4 });
  const low = new S.Simulation({ fixedWater: 0.8 });
  assert(low.bridgeOpen(0) && low.bridgeOpen(1), '低水位时两桥均可通过');
  assert(!high.bridgeOpen(1), '高水位时第二座低桥封闭');
  const c0 = low.bridgeClearance(S.BRIDGES[0]);
  const c1 = high.bridgeClearance(S.BRIDGES[0]);
  assert(c0 > c1, '水位越高净空越低');
}

section('高水位等待桥孔（波动水位，不撞桥）');
{
  const sim = new S.Simulation({ waterPhase: 0 });
  const pilot = A.run(sim, {}, 280);
  const waits = pilot.log.filter((l) => l.type === 'wait-bridge').length;
  console.log('  等待帧:', waits, '撞桥:', sim.bridgeHits.length, '用时', sim.time.toFixed(0) + 's');
  assert(waits > 0, '封闭期在桥前主动等待');
  assert(sim.bridgeHits.length === 0, '等待期间没有撞击桥体');
  assert(sim.status === 'success', '水位回落后顺利通过并完成航程');
}

section('缆绳张力与绞车');
{
  const sim = new S.Simulation();
  sim.setInput(1, 0, 1);
  for (let i = 0; i < 300; i++) sim.step(1 / 60);
  assert(sim.cables.every((c) => c > 70), '放缆后系缆长度增加');
  assert(sim.cables.every((c) => c <= S.CABLE_MAX), '系缆长度不超过上限');
  assert(sim.maxTension >= 0 && isFinite(sim.maxTension), '张力始终为有限值');
  assert(sim.cableBroken.every((b) => !b), '正常航行不会断缆');
}

console.log('\n----------------------------------------');
console.log('通过 ' + passed + ' / ' + (passed + failed) + '，失败 ' + failed);
process.exit(failed === 0 ? 0 : 1);
