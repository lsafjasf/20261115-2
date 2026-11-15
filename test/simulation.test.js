const assert = require('assert');
const sim = require('../src/simulation.js');

function testWeatherSequence() {
  const weather = sim.createWeather();
  assert.strictEqual(weather.length, sim.HOURS + 1);
  const coldNight = weather.filter((point) => point.hour >= 26 && point.hour <= 29);
  assert.ok(coldNight.every((point) => point.temp <= -2), '第二夜应有强降温');
  const warmWave = weather.filter((point) => point.hour >= 36 && point.hour <= 38);
  assert.ok(warmWave.every((point) => point.temp >= 18), '傍晚应有升温融雪');
}

function testVillagePeaks() {
  assert.ok(sim.villageDemand(sim.VILLAGES[0], 8) > 70);
  assert.ok(sim.villageDemand(sim.VILLAGES[1], 12) > 70);
  assert.ok(sim.villageDemand(sim.VILLAGES[2], 19) > 70);
  assert.ok(sim.isPeakHour(sim.VILLAGES[0], 8));
  assert.ok(!sim.isPeakHour(sim.VILLAGES[0], 12));
}

function testSuccessfulDispatch() {
  const result = sim.runSimulation(sim.createWeather());
  assert.strictEqual(result.time, sim.HOURS);
  assert.strictEqual(result.peakFailures, 0, `自动调度不应高峰断水，实际失败 ${result.peakFailures} 次`);
  assert.strictEqual(result.blocked, false, '正常调度不应结冰堵塞');
  assert.ok(result.reservoir > 400, '调度结束后蓄水池仍应保留余量');
}

function testColdBlockage() {
  const result = sim.runBlockageTest();
  assert.ok(result.blocked, '低温且停泵时管道必须发生堵塞');
  assert.ok(result.blockedAtHour >= 3 && result.blockedAtHour <= 6, '堵塞应在持续冷却数小时后发生');
  assert.strictEqual(result.timeline[result.timeline.length - 1].pumpFlow, 0);
}

function testFlowPreventsBlockage() {
  const weather = Array.from({ length: 10 }, (_, hour) => ({ hour, temp: -10 }));
  const state = sim.createState(weather);
  while (!state.completed && state.time < 9) {
    sim.step(state, { canalGate: 0.5, outletGate: 1, pumpSpeed: 1 });
  }
  assert.strictEqual(state.blocked, false, '保持足够流量可防止冰堵');
}

function testSurgeAndSpill() {
  const state = sim.createState(sim.createWeather());
  state.reservoir = 2990;
  sim.step(state, { canalGate: 1, outletGate: 0, pumpSpeed: 0 });
  assert.ok(state.spill > 0 || state.reservoir === sim.RESERVOIR_CAPACITY, '满库进水应溢流');
}

const tests = [
  ['固定天气序列', testWeatherSequence],
  ['三村错峰需求', testVillagePeaks],
  ['48小时自动调度成功', testSuccessfulDispatch],
  ['夜间冷却导致管道堵塞', testColdBlockage],
  ['持续流动防止堵塞', testFlowPreventsBlockage],
  ['满库溢流', testSurgeAndSpill]
];

for (const [name, test] of tests) {
  test();
  console.log(`✓ ${name}`);
}
console.log(`\n全部 ${tests.length} 项测试通过`);
