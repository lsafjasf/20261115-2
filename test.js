// 自动化测试:1) 完整养护一轮并获胜 2) 大风导致表面失水
'use strict';
var Sim = require('./sim.js');

var failures = 0;
function assert(cond, msg) {
  if (cond) console.log('  ✔ ' + msg);
  else { failures++; console.error('  ✘ ' + msg); }
}

// ---------- 测试 1:策略控制器完整养护 7 天 ----------
console.log('测试 1:自动养护一轮(7 天)');
function autoPlay(seed) {
  var rng = Sim.createRng(seed);
  var s = Sim.createGame({ seed: seed });
  while (!s.over) {
    // 策略:表面偏干就喷淋;大风/热浪/寒潮时盖覆盖层;闷热潮湿时通风
    if (s.surfaceMoisture < 55 && s.sprayHoursLeft === 0) s.sprayHoursLeft = 3;
    var dangerous = s.event && (s.event.type === 'wind' || s.event.type === 'heatwave' || s.event.type === 'coldsnap');
    s.covered = !!dangerous || s.ambientTemp < 12;
    s.ventilating = !s.covered && s.ambientTemp > 26 && s.surfaceMoisture > 70;
    Sim.step(s, rng);
  }
  return s;
}

var wins = 0, runs = 5;
for (var seed = 1; seed <= runs; seed++) {
  var s = autoPlay(seed * 777);
  console.log('  种子 ' + (seed * 777) + ': 强度 ' + s.strength.toFixed(1)
    + ' MPa,裂缝 ' + s.crackArea.toFixed(1) + '%,结果 ' + (s.won ? '成功' : '失败'));
  if (s.won) wins++;
}
assert(wins === runs, wins + '/' + runs + ' 轮养护成功(强度≥' + Sim.TARGET_STRENGTH
  + ' MPa 且裂缝<' + Sim.CRACK_THRESHOLD + '%)');

// 详细展示一轮过程
var demo = autoPlay(20261115);
console.log('  单轮日志(种子 20261115):');
demo.log.forEach(function (e) {
  console.log('    [' + Math.floor(e.hour / 24 + 1) + '天' + (e.hour % 24) + '时] ' + e.msg);
});
assert(demo.won, '示范轮养护成功');
assert(demo.strength >= Sim.TARGET_STRENGTH, '强度达标:' + demo.strength.toFixed(1) + ' MPa');
assert(demo.crackArea < Sim.CRACK_THRESHOLD, '裂缝低于阈值:' + demo.crackArea.toFixed(1) + '%');

// ---------- 测试 2:大风导致表面失水 ----------
console.log('测试 2:大风天气导致表面失水');
var rng2 = Sim.createRng(42);
var s2 = Sim.createGame({ seed: 42 });
s2.nextEventHour = 9999; // 禁用随机事件,手动注入大风
// 先平稳运行 12 小时
for (var i = 0; i < 12; i++) Sim.step(s2, rng2);
var moistBefore = s2.surfaceMoisture;
var evapBefore = s2.evapRate;

// 注入大风事件(不覆盖、不喷淋,最坏情况)
var wind = Sim.WEATHER_EVENTS.find(function (e) { return e.type === 'wind'; });
s2.event = wind;
s2.eventHoursLeft = wind.duration;
s2.covered = false;
s2.ventilating = false;

var minMoist = s2.surfaceMoisture;
var maxEvap = 0;
while (s2.eventHoursLeft > 0) {
  Sim.step(s2, rng2);
  minMoist = Math.min(minMoist, s2.surfaceMoisture);
  maxEvap = Math.max(maxEvap, s2.evapRate);
}
console.log('  大风前:表面湿度 ' + moistBefore.toFixed(1) + '%,蒸发 ' + evapBefore.toFixed(2));
console.log('  大风中:最低表面湿度 ' + minMoist.toFixed(1) + '%,峰值蒸发 ' + maxEvap.toFixed(2)
  + ',裂缝 ' + s2.crackArea.toFixed(2) + '%');
assert(maxEvap > evapBefore + 1.5, '大风显著提高蒸发速率(' + evapBefore.toFixed(2)
  + ' → ' + maxEvap.toFixed(2) + ')');
assert(minMoist < moistBefore - 10, '大风导致表面明显失水(' + moistBefore.toFixed(1)
  + '% → ' + minMoist.toFixed(1) + '%)');

// 对照:覆盖层应显著缓解大风失水
var rng3 = Sim.createRng(42);
var s3 = Sim.createGame({ seed: 42 });
s3.nextEventHour = 9999;
for (var j = 0; j < 12; j++) Sim.step(s3, rng3);
s3.event = wind;
s3.eventHoursLeft = wind.duration;
s3.covered = true;
var minMoistCovered = s3.surfaceMoisture;
while (s3.eventHoursLeft > 0) {
  Sim.step(s3, rng3);
  minMoistCovered = Math.min(minMoistCovered, s3.surfaceMoisture);
}
console.log('  覆盖对照:大风中最低表面湿度 ' + minMoistCovered.toFixed(1) + '%');
assert(minMoistCovered > minMoist + 10, '覆盖层有效缓解大风失水('
  + minMoistCovered.toFixed(1) + '% vs ' + minMoist.toFixed(1) + '%)');

console.log(failures === 0 ? '\n全部测试通过 ✅' : '\n有 ' + failures + ' 项断言失败 ❌');
process.exit(failures === 0 ? 0 : 1);
