import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, CABLE_REST, CABLE_BREAK } from '../js/sim.js';
import { stepWorld, tryAttach } from '../js/sim-step.js';
import { autopilotInput } from '../js/autopilot.js';

function run(world, ticks, inputFn) {
  const log = [];
  for (let i = 0; i < ticks; i += 1) {
    const input = inputFn ? inputFn(world) : {};
    stepWorld(world, input);
    for (const e of world.events) log.push(e);
    if (world.status !== 'playing') break;
  }
  return log;
}

test('固定 seed 产生完全一致的漂移轨迹', () => {
  const a = createWorld(20261115);
  const b = createWorld(20261115);
  run(a, 600);
  run(b, 600);
  for (let i = 0; i < 3; i += 1) {
    assert.equal(a.buoys[i].x, b.buoys[i].x);
    assert.equal(a.buoys[i].y, b.buoys[i].y);
  }
  const moved = Math.hypot(a.buoys[0].x - 880 - a.buoys[0].id * 0, a.buoys[0].y - 110);
  assert.ok(moved > 2, '浮标应随洋流漂移');
});

test('不同 seed 产生不同世界布局', () => {
  const a = createWorld(1);
  const b = createWorld(2);
  assert.notDeepEqual(a.shallows, b.shallows);
});

test('自动巡航完成三座浮标回收且不断缆', () => {
  const world = createWorld(20261115);
  const log = run(world, 9000, autopilotInput);
  assert.equal(world.status, 'won');
  assert.equal(world.stats.docked, 3);
  assert.equal(world.stats.breaks, 0);
  assert.ok(!world.cable.broken);
  assert.ok(log.some((e) => e.type === 'win'));
  for (let i = 0; i < 3; i += 1) {
    assert.ok(world.buoys[i].docked);
  }
});

test('缆绳挂底后回退解脱，再完成回收', () => {
  const world = createWorld(20261115);
  world.shallows = [{ x: 600, y: 360, r: 78 }];
  world.anchors[0] = { x: 200, y: 360 };
  world.buoys[0] = { id: 0, x: 900, y: 360, vx: 0, vy: 0, docked: false };
  for (let i = 1; i < 3; i += 1) {
    world.buoys[i].docked = true;
    world.buoys[i].x = world.anchors[i].x;
    world.buoys[i].y = world.anchors[i].y;
  }
  world.boat.x = 960;
  world.boat.y = 360;
  world.boat.angle = Math.PI;

  const log = [];
  let snagged = false;
  for (let i = 0; i < 9000; i += 1) {
    let input;
    if (world.cable.snag) snagged = true;
    if (!snagged && !world.cable.attached) {
      const gap = Math.hypot(
        world.boat.x - world.buoys[0].x, world.boat.y - world.buoys[0].y,
      );
      if (gap < 56) tryAttach(world);
    }
    if (!snagged) {
      // 首次挂底前保持直线航线（测试控制器不修正横风偏移）
      stepWorld(world, { throttle: 1, steer: 0 });
      world.boat.y = 360;
      world.boat.vy = 0;
      world.boat.angle = Math.PI;
      world.buoys[0].x = 900;
      world.buoys[0].y = 360;
      world.buoys[0].vx = 0;
      world.buoys[0].vy = 0;
    } else {
      // 挂底后交给自动巡航：倒车解脱、绕开浅滩、拖回锚位
      stepWorld(world, autopilotInput(world));
    }
    log.push(...world.events);
    if (world.status !== 'playing') break;
  }

  assert.ok(world.stats.snags >= 1, '应至少发生一次挂底');
  assert.ok(log.some((e) => e.type === 'snag'));
  assert.ok(log.some((e) => e.type === 'unsnag'), '挂底后应能解脱');
  assert.equal(world.stats.breaks, 0);
  assert.equal(world.buoys[0].docked, true);
  assert.equal(world.status, 'won');
});

test('持续硬拉超过张力阈值会断缆', () => {
  const world = createWorld(20261115);
  world.shallows = [];
  const buoy = world.buoys[0];
  world.boat.x = 400;
  world.boat.y = 360;
  world.boat.angle = Math.PI;
  buoy.x = 450; // 距船 50，处于挂缆半径内
  buoy.y = 360;
  buoy.vx = 0;
  buoy.vy = 0;
  const log = [];
  stepWorld(world, { attachPressed: true });
  assert.equal(world.cable.attached, true);
  for (let i = 0; i < 200; i += 1) {
    world.boat.vx = -320; // 保持高速远离，浮标被人为固定 -> 张力累积
    buoy.x = 450;
    buoy.y = 360;
    buoy.vx = 0;
    buoy.vy = 0;
    stepWorld(world, {});
    log.push(...world.events);
    if (world.status !== 'playing') break;
  }
  assert.ok(world.cable.broken);
  assert.equal(world.status, 'lost');
  assert.ok(log.some((e) => e.type === 'break'));
  const evt = log.find((e) => e.type === 'break');
  assert.ok(evt.tension > CABLE_BREAK);
});
