// verify.mjs — 断言验证：成功路径 + 碰撞失败 + 倾斜失败 + wrapAngle 边界

import assert from 'node:assert/strict';
import { createState, step, CONFIG, SCENES, wrapAngle } from '../js/engine.js';
import { Autopilot } from '../js/autopilot.js';

// 1) 成功路径：自动驾驶器在 5 段提示内完成 3 次换景，无碰撞、无倾斜
{
  const state = createState();
  const pilot = new Autopilot(state);
  while (state.status === 'running') step(state, pilot.computeInput(state));
  assert.equal(state.status, 'won', '应成功完成');
  assert.equal(state.sceneIndex, CONFIG.REQUIRED_SHIFTS, '应完成三次换景');
  assert.ok(state.cue.number <= CONFIG.CUE_LIMIT, '提示段数不超过 5');
  assert.ok(!state.events.some((e) => e.type === 'fail'), '全程无失败事件');
  assert.ok(state.time < CONFIG.CUE_TIME * CONFIG.CUE_LIMIT, '总用时合理');
  console.log('✓ 成功路径：3 次换景，使用', state.cue.number, '段提示，用时', state.time.toFixed(2) + 's');
}

// 2) 碰撞失败：持续顺时针转动，布景必然扫到演员/台柱
{
  const state = createState();
  let guard = 0;
  while (state.status === 'running' && guard < 60 * 30) {
    step(state, { torqueDir: 1, cwDir: 0 });
    guard += 1;
  }
  assert.equal(state.status, 'failed');
  assert.match(state.failReason, /^collision-/);
  console.log('✓ 碰撞机制：错误旋转方向触发', state.failReason);
}

// 3) 倾斜失败：把配重推到最外侧（与布景偏心同侧），质心越出支撑面
{
  const state = createState();
  let guard = 0;
  while (state.status === 'running' && guard < 60 * 10) {
    step(state, { torqueDir: 0, cwDir: 1 });
    guard += 1;
  }
  assert.equal(state.status, 'failed');
  assert.equal(state.failReason, 'tilt');
  console.log('✓ 倾斜机制：配重失当触发 tilt（配重位置', state.cw.toFixed(2) + 'm）');
}

// 4) 角度环绕边界
assert.equal(wrapAngle(Math.PI + 0.1), wrapAngle(-Math.PI + 0.1));
assert.equal(wrapAngle(-Math.PI - 0.1), wrapAngle(Math.PI - 0.1));
assert.ok(Math.abs(wrapAngle(7 * Math.PI)) <= Math.PI);
console.log('✓ wrapAngle 边界正确');

// 5) 三个目标角度本身都不在碰撞带内
{
  const state = createState();
  const { checkCollisions } = await import('../js/engine.js');
  for (const scene of SCENES) {
    assert.equal(checkCollisions({ ...state, theta: scene.angle }).hit, false);
  }
  console.log('✓ 三个目标角度均位于安全区');
}

console.log('\n全部断言通过。');
