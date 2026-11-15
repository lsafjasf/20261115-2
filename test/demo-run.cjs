const assert = require('node:assert');
const A = require('../src/physics.js');

const wind = A.makeWind(42);
const rng = (function (s) {
  return function () {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
})(7);

function banner(s) { console.log('\n=== ' + s + ' ==='); }

banner('场景1：成功投放（送达救援点 C）');
const good = A.simulate({ openHeight: 250, mass: 3 }, wind, 0);
console.log('结果      :', good.result.reason);
console.log('救援点    :', good.result.pointId);
console.log('落点 x    :', good.result.x.toFixed(1), 'm');
console.log('落地速度  :', good.result.impactSpeed.toFixed(1), 'm/s（损坏阈值', A.WORLD.DAMAGE_SPEED + '）');
console.log('飞行时长  :', good.result.flightTime.toFixed(1), 's');
console.log('轨迹采样  :', good.trail.length, '个点');
assert.equal(good.result.success, true);
assert.equal(good.result.pointId, 'C');

banner('场景2：落点失败 A —— 开伞过早，被风飘出救援区');
const drift = A.simulate({ openHeight: 400, mass: 3 }, wind, 0);
console.log('结果      :', drift.result.reason);
console.log('落点 x    :', drift.result.x.toFixed(1), 'm（最近救援点 765，超出半径', A.WORLD.ZONE_RADIUS + 'm）');
assert.equal(drift.result.success, false);
assert.equal(drift.result.reason, 'missed');

banner('场景3：落点失败 B —— 开伞过晚，物资损坏');
const crash = A.simulate({ openHeight: 40, mass: 3 }, wind, 0);
console.log('结果      :', crash.result.reason);
console.log('落地速度  :', crash.result.impactSpeed.toFixed(1), 'm/s（超过阈值', A.WORLD.DAMAGE_SPEED + 'm/s）');
assert.equal(crash.result.success, false);
assert.equal(crash.result.reason, 'damaged');

banner('投放后风向小幅变化');
const before = wind.vx;
A.shiftWindAfterDrop(wind, rng);
console.log('平均风速  :', before.toFixed(2), '->', wind.vx.toFixed(2), 'm/s');
assert.notEqual(before, wind.vx);

banner('全部断言通过');
