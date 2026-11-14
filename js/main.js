// main.js — 浏览器主控：双人输入、固定步长循环、HUD、自动驾驶演示

import { createState, step, CONFIG, SCENES, tiltMetric, wrapAngle } from './engine.js';
import { Autopilot } from './autopilot.js';
import { Renderer } from './renderer.js';
import { StageAudio } from './audio.js';

const canvas = document.getElementById('stage');
const renderer = new Renderer(canvas);
const audio = new StageAudio();

let state = createState();
let autopilot = new Autopilot(state);
let autoMode = true;
let accumulator = 0;
let lastTime = performance.now();

const keys = new Set();
const manual = { torqueDir: 0, cwDir: 0 };

window.addEventListener('keydown', (e) => {
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].includes(e.key)) {
    e.preventDefault();
  }
  keys.add(e.key.toLowerCase());
  if (e.key === 'r' || e.key === 'R') reset();
  if (e.key === 'a' || e.key === 'A') toggleAuto();
  if (e.key === 'm' || e.key === 'M') toggleMute();
});
window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));

function readManualInput() {
  // 左玩家：A/D 或 ←/→ 控制底座扭矩；右玩家：W/S 或 ↑/↓ 滑动配重
  const left = keys.has('a') || keys.has('arrowleft');
  const right = keys.has('d') || keys.has('arrowright');
  manual.torqueDir = (right ? 1 : 0) - (left ? 1 : 0);
  const up = keys.has('w') || keys.has('arrowup');
  const down = keys.has('s') || keys.has('arrowdown');
  manual.cwDir = (up ? 1 : 0) - (down ? 1 : 0);
  return manual;
}

function reset() {
  state = createState();
  autopilot = new Autopilot(state);
  accumulator = 0;
  eventHandled = false;
  hideOverlay();
}

function toggleAuto() {
  autoMode = !autoMode;
  document.getElementById('auto-badge').textContent = autoMode ? '自动驾驶（双人协作演示）' : '手动模式';
  document.getElementById('auto-toggle').textContent = autoMode ? '切到手动 (A)' : '切到自动 (A)';
}

let muted = false;
function toggleMute() {
  muted = !muted;
  audio.setEnabled(!muted);
  document.getElementById('mute-toggle').textContent = muted ? '取消静音 (M)' : '静音 (M)';
}

document.getElementById('reset').addEventListener('click', () => { audio.ensure(); reset(); });
document.getElementById('auto-toggle').addEventListener('click', () => { audio.ensure(); toggleAuto(); });
document.getElementById('mute-toggle').addEventListener('click', () => { audio.ensure(); toggleMute(); });

// 触屏按钮：按下置位、抬起复位
for (const btn of document.querySelectorAll('[data-hold]')) {
  const action = btn.dataset.hold;
  const map = { 'torque-': 'arrowleft', 'torque+': 'arrowright', 'cw-': 'arrowdown', 'cw+': 'arrowup' };
  const key = map[action];
  const press = (e) => { e.preventDefault(); audio.ensure(); keys.add(key); };
  const release = (e) => { e.preventDefault(); keys.delete(key); };
  btn.addEventListener('pointerdown', press);
  btn.addEventListener('pointerup', release);
  btn.addEventListener('pointerleave', release);
  btn.addEventListener('pointercancel', release);
}

function updateHud() {
  const tilt = tiltMetric(state);
  const target = SCENES[state.sceneIndex];
  const err = state.status === 'running' && target
    ? Math.abs(wrapAngle(target.angle - state.theta)) * 180 / Math.PI
    : 0;
  document.getElementById('hud-scene').textContent =
    state.sceneIndex < SCENES.length ? `${state.sceneIndex + 1}. ${SCENES[state.sceneIndex].name}` : '—';
  document.getElementById('hud-progress').textContent =
    `${Math.min(state.sceneIndex, CONFIG.REQUIRED_SHIFTS)}/${CONFIG.REQUIRED_SHIFTS} 次换景`;
  document.getElementById('hud-cue').textContent =
    `${state.cue.number}/${CONFIG.CUE_LIMIT} 段提示`;
  document.getElementById('hud-timer').textContent =
    `${Math.max(0, CONFIG.CUE_TIME - state.cue.elapsed).toFixed(1)}s`;
  document.getElementById('hud-angle').textContent =
    `${(state.theta * 180 / Math.PI).toFixed(1)}°`;
  document.getElementById('hud-speed').textContent =
    `${Math.abs(state.omega).toFixed(2)} rad/s`;
  document.getElementById('hud-cw').textContent = `${state.cw.toFixed(2)} m`;
  document.getElementById('hud-tilt').textContent =
    `${(tilt * 100).toFixed(0)}% / ${(CONFIG.TILT_LIMIT * 100).toFixed(0)}%`;
  document.getElementById('hud-tilt').style.color =
    tilt > CONFIG.TILT_LIMIT * 0.8 ? '#ff5d73' : '#46d39a';
  document.getElementById('hud-err').textContent = `${err.toFixed(1)}°`;
}

function showOverlay(won) {
  const overlay = document.getElementById('overlay');
  const title = document.getElementById('overlay-title');
  const detail = document.getElementById('overlay-detail');
  overlay.classList.add('visible');
  if (won) {
    title.textContent = '换景成功';
    title.style.color = '#46d39a';
    detail.textContent =
      `三次换景完成，使用 ${state.cue.number}/${CONFIG.CUE_LIMIT} 段提示，` +
      `用时 ${state.time.toFixed(1)}s，未发生碰撞或倾斜。`;
  } else {
    const reasonMap = {
      'collision-actor': '布景撞到了演员',
      'collision-boundary': '布景撞到了台柱或舞台边界',
      tilt: '配重不足，布景倾斜失稳',
      timeout: '五段提示用完仍未完成三次换景',
    };
    title.textContent = '换景失败';
    title.style.color = '#ff5d73';
    detail.textContent = reasonMap[state.failReason] || state.failReason;
  }
}

function hideOverlay() {
  document.getElementById('overlay').classList.remove('visible');
}

let eventHandled = false;
function frame(now) {
  const frameDelta = Math.min(0.1, (now - lastTime) / 1000);
  lastTime = now;
  accumulator += frameDelta;

  while (accumulator >= CONFIG.DT && state.status === 'running') {
    const input = autoMode ? autopilot.computeInput(state) : readManualInput();
    const prevScene = state.sceneIndex;
    const prevStatus = state.status;
    step(state, input);
    accumulator -= CONFIG.DT;

    if (state.sceneIndex !== prevScene && state.status === 'running') {
      audio.shiftSuccess();
    }
    if (state.status !== prevStatus) {
      if (state.status === 'won') audio.win();
      if (state.status === 'failed') audio.fail();
    }
  }

  const cwMoving = autoMode
    ? autopilot.computeInput(state).cwDir !== 0
    : manual.cwDir !== 0;
  audio.update(state.omega, tiltMetric(state), CONFIG.TILT_LIMIT, cwMoving);
  renderer.draw(state, autopilot);
  updateHud();

  if (state.status !== 'running' && !eventHandled) {
    eventHandled = true;
    showOverlay(state.status === 'won');
  }
  if (state.status === 'running') eventHandled = false;
  requestAnimationFrame(frame);
}

window.addEventListener('resize', () => renderer.resize());
renderer.resize();
requestAnimationFrame(frame);
