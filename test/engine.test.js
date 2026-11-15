const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../src/engine');

const DT = 0.02;

function runUntil(game, predicate, maxSeconds = 180) {
  let elapsed = 0;
  while (!predicate(game) && elapsed < maxSeconds && game.status === 'running') {
    L.step(game, DT);
    elapsed += DT;
  }
  assert.ok(predicate(game), `条件在 ${maxSeconds}s 内未达成（status=${game.status}）`);
  return game;
}

function eventsOf(game, type) {
  return game.log.filter((e) => e.type === type);
}

// 上升任务：以“在理论制动点制动”的方式精确停靠
function ascendAndDock(game, targetFloor) {
  const start = L.startMove(game, 1);
  assert.ok(start.ok, start.reason);
  const brakeDist = L.brakingDistance(game);
  const targetY = L.FLOORS[targetFloor];
  runUntil(game, (g) => targetY - g.car.y <= brakeDist + 0.02
    && ['accelerating', 'cruising'].includes(g.car.status));
  const brake = L.applyBrake(game);
  assert.ok(brake.ok, brake.reason);
  runUntil(game, (g) => g.car.status === 'idle' || g.car.status === 'undershoot');
  if (game.car.status === 'undershoot') {
    L.creepToFloor(game, 1);
    runUntil(game, (g) => g.car.status === 'idle');
  }
  assert.equal(game.car.y, targetY);
}

function descendAndDock(game) {
  const start = L.startMove(game, -1);
  assert.ok(start.ok, start.reason);
  const brakeDist = L.brakingDistance(game);
  runUntil(game, (g) => g.car.y <= brakeDist + 0.02
    && ['accelerating', 'cruising'].includes(g.car.status));
  const brake = L.applyBrake(game);
  assert.ok(brake.ok, brake.reason);
  runUntil(game, (g) => g.car.status === 'idle' || g.car.status === 'undershoot');
  if (game.car.status === 'undershoot') {
    L.creepToFloor(game, -1);
    runUntil(game, (g) => g.car.status === 'idle');
  }
  assert.equal(game.car.y, 0);
}

function balancePressure(game) {
  const floor = L.currentFloorIndex(game);
  const result = L.startPressure(game);
  assert.ok(result.ok, result.reason);
  runUntil(game, (g) => g.doors.pressure[floor] >= L.PRESSURE_TIME);
}

test('制动距离随载重增加而变长、随缓冲器增强而变短', () => {
  const game = L.createGame();
  const empty = L.brakingDistance(game);
  L.toggleLoad(game, 'reactor');
  const heavy = L.brakingDistance(game);
  assert.ok(heavy > empty, '重载下降制动距离应更长');

  L.setBuffer(game, 'spring');
  const spring = L.brakingDistance(game);
  L.setBuffer(game, 'magnetic');
  const magnetic = L.brakingDistance(game);
  assert.ok(spring > heavy && magnetic < heavy);
});

test('停靠顺序必须覆盖 1..3 层且不重复', () => {
  const game = L.createGame();
  assert.equal(L.setDockingPlan(game, [1, 2, 2]).ok, false);
  assert.equal(L.setDockingPlan(game, [1, 2]).ok, false);
  const ok = L.setDockingPlan(game, [2, 1, 3]);
  assert.ok(ok.ok);
  assert.deepEqual(game.plan, [2, 1, 3]);
});

test('完整一局：三层交付后返回底层即胜利', () => {
  const game = L.createGame();
  L.setBuffer(game, 'hydraulic');
  assert.ok(L.setDockingPlan(game, [1, 2, 3]).ok);

  const trips = [
    ['seismograph', 1],
    ['drill', 2],
    ['reactor', 3],
  ];
  for (const [equipId, floor] of trips) {
    assert.ok(L.toggleLoad(game, equipId).ok);
    ascendAndDock(game, floor);
    balancePressure(game);
    const opened = L.openDoor(game);
    assert.ok(opened.ok, opened.reason);
    assert.ok(game.delivered.includes(equipId));
    assert.ok(L.closeDoor(game).ok);
    descendAndDock(game);
  }

  assert.equal(game.status, 'won');
  assert.deepEqual(game.delivered.sort(), L.EQUIP_IDS.slice().sort());
  assert.equal(game.car.y, 0);
  assert.equal(game.violations, 0);
  assert.equal(game.impactCount, 0);
  assert.equal(game.hull, 100);
  assert.ok(eventsOf(game, 'win').length === 1);
  assert.ok(eventsOf(game, 'delivered').length === 3);
});

test('计划生效：未按停靠顺序无法跳过目标层', () => {
  const game = L.createGame();
  L.setDockingPlan(game, [3, 2, 1]);
  L.toggleLoad(game, 'seismograph');
  const move = L.startMove(game, 1);
  assert.ok(move.ok);
  assert.equal(game.targetFloor, 3, '首个停靠层应为计划中的第 3 层');
});

test('气闸未完成压力平衡时开门被阻止并记录违规', () => {
  const game = L.createGame();
  L.setDockingPlan(game, [1, 2, 3]);
  L.toggleLoad(game, 'seismograph');
  ascendAndDock(game, 1);

  // 停靠后尚未做压力平衡，直接开门必须失败
  const blocked = L.openDoor(game);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.reason, 'pressure-imbalance');
  assert.equal(game.doors.open, false, '门必须保持关闭');
  assert.equal(game.violations, 1);
  assert.equal(eventsOf(game, 'early-open-blocked').length, 1);

  // 开始平衡，中途再次尝试仍失败
  L.startPressure(game);
  for (let i = 0; i < 50; i += 1) L.step(game, DT); // 推进 1 秒
  const blockedMid = L.openDoor(game);
  assert.equal(blockedMid.ok, false);
  assert.equal(game.violations, 2);
  assert.ok(blockedMid.progress < 1);

  // 平衡完成后开门成功，设备正常交付
  runUntil(game, (g) => g.doors.pressure[1] >= L.PRESSURE_TIME);
  const opened = L.openDoor(game);
  assert.ok(opened.ok, opened.reason);
  assert.equal(game.doors.open, true);
  assert.ok(game.delivered.includes('seismograph'));
});

test('重载下降制动过晚会越过平台并由缓冲器吸收冲击', () => {
  const game = L.createGame();
  L.setBuffer(game, 'spring');
  L.setDockingPlan(game, [1, 2, 3]);
  L.toggleLoad(game, 'reactor');

  L.startMove(game, 1);
  // 故意很晚才制动（越过理论制动点很多），触发碰撞
  runUntil(game, (g) => g.car.y >= L.FLOORS[1] - 0.5);
  L.applyBrake(game);
  runUntil(game, (g) => g.car.status === 'impact' || g.car.status === 'idle');
  assert.equal(game.car.status, 'impact');
  assert.equal(game.impactCount, 1);
  assert.ok(game.hull < 100, '缓冲碰撞应造成结构损伤');

  const impact = eventsOf(game, 'impact')[0];
  assert.ok(impact.damage > 0);
  assert.equal(impact.buffer, 'spring');

  // 回调后仍可继续任务，证明缓冲器让电梯没有报废
  L.creepToFloor(game, -1);
  runUntil(game, (g) => g.car.status === 'idle');
  assert.equal(game.car.y, L.FLOORS[1]);
});

test('强缓冲器比弱缓冲器在相同冲击下损伤更小', () => {
  function damageWith(bufferId) {
    const game = L.createGame();
    L.setBuffer(game, bufferId);
    L.setDockingPlan(game, [1, 2, 3]);
    L.toggleLoad(game, 'reactor');
    L.startMove(game, 1);
    runUntil(game, (g) => g.car.y >= L.FLOORS[1] - 0.5);
    L.applyBrake(game);
    runUntil(game, (g) => g.car.status === 'impact');
    return eventsOf(game, 'impact')[0].damage;
  }
  assert.ok(damageWith('magnetic') < damageWith('spring'));
});
