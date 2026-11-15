/* Acceptance check: complete one cleaning with the default balanced params. */
const Sim = require('../js/simulation.js');

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = mulberry32(42);
const state = Sim.createState({ speed: 1.2, pressure: 60, flow: 3.0 });
const dt = 0.1;
let guard = 0;
while (!state.finished && guard < 100000) {
  Sim.step(state, dt, rng);
  guard++;
}

const targets = Sim.targetStatus(state);
console.log('--- 一次完整清洁验收（默认平衡参数 1.2m/s, 60N, 3.0L/min）---');
console.log('模拟耗时:    ' + state.time.toFixed(1) + ' s');
console.log('总用水量:    ' + state.waterUsed.toFixed(2) + ' L');
console.log('水箱剩余:    ' + state.tank.toFixed(2) + ' / ' + Sim.TANK_CAPACITY + ' L');
console.log('行走距离:    ' + state.distance.toFixed(1) + ' m（往返各 16m）');
console.log('整阵发电效率:', (state.power * 100).toFixed(1) + '%');
targets.forEach(function (q) {
  console.log('目标板 P' + q.id + ' 恢复率: ' + (q.recovery * 100).toFixed(1) +
    '% （要求 ≥' + (q.required * 100) + '%）' + (q.ok ? ' 达标' : ' 未达标'));
});
console.log('结论:        ' + (state.success ? '清洁成功' : '清洁失败'));

const assertions = [
  ['运行正常结束', state.finished === true],
  ['两块目标板均达标', targets.every(function (q) { return q.ok; })],
  ['用水量为正且不超过水箱', state.waterUsed > 0 && state.waterUsed <= Sim.TANK_CAPACITY],
  ['用水计量与流量×时间一致', Math.abs(state.waterUsed - 3.0 / 60 * state.time) < 0.05]
];
let allOk = true;
assertions.forEach(function ([name, ok]) {
  if (!ok) allOk = false;
  console.log((ok ? '[PASS] ' : '[FAIL] ') + name);
});
process.exit(allOk ? 0 : 1);
