const S = require('../js/sim.js');
const A = require('../js/autopilot.js');

// 模拟 main.js 中 readManualInput 的按键映射，验证手动输入语义
function keysToInput(sim, keys) {
  let throttle = 0, rudder = 0, winch = 0;
  if (keys.w) throttle += 1;
  if (keys.s) throttle -= 1;
  if (keys.a) rudder -= 1;
  if (keys.d) rudder += 1;
  if (keys.q) winch -= 1;
  if (keys.e) winch += 1;
  sim.setInput(throttle, rudder, winch);
}

let failed = 0;
function assert(cond, msg) {
  console.log((cond ? '  PASS ' : '  FAIL ') + msg);
  if (!cond) failed += 1;
}

console.log('=== 手动按键输入语义 ===');
{
  const sim = new S.Simulation();
  const before = sim.cables[0];
  keysToInput(sim, { w: true, d: true, e: true });
  for (let i = 0; i < 120; i++) sim.step(1 / 60);
  assert(sim.input.throttle === 1, 'W 键输出前进油门');
  assert(sim.input.rudder === 1, 'D 键输出右舵');
  assert(sim.cables[0] > before, 'E 键放出系缆');
  assert(Math.hypot(sim.tug.vx, sim.tug.vy) > 20, '拖船在油门下加速');
}

console.log('=== 倒车与收缆 ===');
{
  const sim = new S.Simulation();
  keysToInput(sim, { s: true, q: true });
  for (let i = 0; i < 120; i++) sim.step(1 / 60);
  assert(sim.input.throttle === -1, 'S 键输出倒车');
  assert(sim.cables[0] <= S.CABLE_MIN, 'Q 键把系缆收到最短限');
}

console.log('=== 手动起步后切换自动驾驶抵港 ===');
{
  const sim = new S.Simulation();
  const pilot = new A.Autopilot(sim);
  keysToInput(sim, { w: true });
  for (let i = 0; i < 300; i++) sim.step(1 / 60);
  const manualStation = sim.worldToRiver(sim.tug.x, sim.tug.y).s;
  assert(manualStation > 100, '手动前进阶段船位向上游移动');
  for (let i = 0; i < 240 * 60 && sim.status === 'running'; i++) {
    pilot.update();
    sim.step(1 / 60);
  }
  assert(sim.status === 'success', '接管自动驾驶后完成航程');
  assert(sim.totalDamage() < S.DAMAGE_LIMIT, '损伤保持在阈值内');
}

process.exit(failed ? 1 : 0);
