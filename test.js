// 场景测试：1) 标准抢修流程成功  2) 错关阀门（秒关）产生水锤峰值爆管
const S = require('./sim.js');
const DT = 0.05;

function run(s, seconds, each) {
  const steps = Math.round(seconds / DT);
  for (let i = 0; i < steps; i++) {
    S.step(s, DT);
    if (each) each(s);
    if (s.phase === 'SUCCESS' || s.phase === 'FAILED') break;
  }
}

function peakDuring(s, seconds) {
  let peak = 0;
  run(s, seconds, () => { peak = Math.max(peak, s.pressure); });
  return peak;
}

// ---------- 场景 1：规范抢修 ----------
function scenarioSuccess() {
  const s = S.createSim();
  S.setValve(s, 'A', 0, 6);          // 上游阀 6s 缓关
  run(s, 7);
  S.setValve(s, 'B', 0, 6);          // 下游阀 6s 缓关
  run(s, 7);
  console.assert(s.phase === 'VALVES_DONE', '两阀应已关闭, got ' + s.phase);

  S.digTrench(s);
  S.addShoring(s); S.addShoring(s); S.addShoring(s); S.addShoring(s); // 100%
  S.startDrain(s);
  run(s, 25);
  console.assert(s.phase === 'DRAINED', '应已排空, got ' + s.phase);

  while (s.pipeInstalled < 1) { S.installPipe(s, DT); S.step(s, DT); }
  console.assert(s.phase === 'REPAIRED', '应已换管, got ' + s.phase);

  S.restoreAndTest(s);
  S.setValve(s, 'B', 1, 8);          // 先开下游，缓慢充压
  run(s, 9);
  S.setValve(s, 'A', 1, 8);
  run(s, 30);
  return s;
}

// ---------- 场景 2：错关阀门（0.2s 猛关下游阀） ----------
function scenarioHammer() {
  const s = S.createSim();
  S.setValve(s, 'B', 0, 0.2);        // 远小于临界关阀时间 1.0s
  const peak = peakDuring(s, 5);
  return { s, peak };
}

const ok = scenarioSuccess();
const bad = scenarioHammer();

console.log('=== 场景1：规范抢修 ===');
console.log('结果:', ok.phase, '| 稳定性:', ok.stability.toFixed(2),
            '| 最终压力:', (ok.pressure / 1e6).toFixed(3), 'MPa');
ok.events.forEach(e => console.log('  [' + e.t.toFixed(1) + 's]', e.msg));

console.log('\n=== 场景2：错关阀门（0.2s 猛关） ===');
console.log('结果:', bad.s.phase, '|', bad.s.failReason || '');
console.log('压力峰值:', (bad.peak / 1e6).toFixed(2), 'MPa',
            '(管材耐压 1.20 MPa, 理论 Joukowsky 峰值 ≈ 2.85 MPa)');
bad.s.events.forEach(e => console.log('  [' + e.t.toFixed(1) + 's]', e.msg));

let failed = 0;
function check(name, cond) {
  console.log((cond ? 'PASS' : 'FAIL') + '  ' + name);
  if (!cond) failed++;
}
console.log('\n=== 断言 ===');
check('规范抢修最终 SUCCESS', ok.phase === 'SUCCESS');
check('规范抢修未发生爆管', !ok.failReason);
check('错关阀导致 FAILED', bad.s.phase === 'FAILED');
check('错关阀峰值超过耐压 1.2MPa', bad.peak > 1.2e6);
check('峰值量级接近 Joukowsky 估计(>2MPa)', bad.peak > 2.0e6);
process.exit(failed ? 1 : 0);
