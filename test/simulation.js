/* 无头集成：用 app.js 同款固定步长循环跑完整局，并验证提前开门失败。 */
const L = require('../src/engine');

const STEP = 1 / 60;

function runFrames(game, seconds) {
  let frames = Math.round(seconds / STEP);
  while (frames > 0 && game.status === 'running') {
    L.step(game, STEP);
    frames -= 1;
  }
}

function waitUntil(game, predicate, seconds = 120) {
  let elapsed = 0;
  while (!predicate(game) && elapsed < seconds && game.status === 'running') {
    L.step(game, STEP);
    elapsed += STEP;
  }
  if (!predicate(game)) throw new Error('等待超时');
}

function dockAt(game, floor) {
  L.startMove(game, 1);
  const brakeDist = L.brakingDistance(game);
  waitUntil(game, (g) => L.FLOORS[floor] - g.car.y <= brakeDist + STEP * 10
    && ['accelerating', 'cruising'].includes(g.car.status));
  L.applyBrake(game);
  waitUntil(game, (g) => g.car.status === 'idle' || g.car.status === 'undershoot');
  if (game.car.status === 'undershoot') {
    L.creepToFloor(game, 1);
    waitUntil(game, (g) => g.car.status === 'idle');
  }
}

function dockBottom(game) {
  L.startMove(game, -1);
  const brakeDist = L.brakingDistance(game);
  waitUntil(game, (g) => g.car.y <= brakeDist + STEP * 10
    && ['accelerating', 'cruising'].includes(g.car.status));
  L.applyBrake(game);
  waitUntil(game, (g) => g.car.status === 'idle' || g.car.status === 'undershoot');
  if (game.car.status === 'undershoot') {
    L.creepToFloor(game, -1);
    waitUntil(game, (g) => g.car.status === 'idle');
  }
}

console.log('== 场景 1：完整通关（固定步长循环）==');
const game = L.createGame();
L.setBuffer(game, 'hydraulic');
L.setDockingPlan(game, [1, 2, 3]);

[['seismograph', 1], ['drill', 2], ['reactor', 3]].forEach(([id, floor]) => {
  L.toggleLoad(game, id);
  dockAt(game, floor);
  const early = L.openDoor(game);
  if (early.ok) throw new Error('未平衡时不应能开门');
  L.startPressure(game);
  runFrames(game, L.PRESSURE_TIME + 0.1);
  const opened = L.openDoor(game);
  if (!opened.ok) throw new Error(`开门失败: ${opened.reason}`);
  L.closeDoor(game);
  dockBottom(game);
});

console.log(`最终状态: ${game.status}`);
console.log(`已交付: ${game.delivered.join(', ')}`);
console.log(`提前开门违规次数（每趟刻意试一次）: ${game.violations}`);
console.log(`碰撞次数: ${game.impactCount}, 结构: ${game.hull}%`);
if (game.status !== 'won') throw new Error('应达成胜利');
if (game.violations !== 3) throw new Error('应记录 3 次提前开门失败');

console.log('\n== 场景 2：独立验证一次提前开门失败 ==');
const g2 = L.createGame();
L.setDockingPlan(g2, [1, 2, 3]);
L.toggleLoad(g2, 'seismograph');
dockAt(g2, 1);
const blocked = L.openDoor(g2);
console.log(`开门结果: ok=${blocked.ok}, reason=${blocked.reason}, 违规=${g2.violations}`);
if (blocked.ok || blocked.reason !== 'pressure-imbalance' || g2.violations !== 1) {
  throw new Error('提前开门失败场景不符预期');
}
if (g2.doors.open) throw new Error('门必须保持关闭');

console.log('\n全部无头模拟通过 ✔');
