import { CONFIG, createEngine, start, step, crank, setValve } from './engine.js';
import { drawScene } from './render.js';
import { createAudio } from './audio.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const audio = createAudio();

let engine = createEngine();
let lastTime = performance.now();
let lastSeized = false;

function reset() {
  engine = createEngine();
  lastTime = performance.now();
  lastSeized = false;
  drawScene(ctx, engine);
}

function pressCrank() {
  if (!engine.running) start(engine);
  audio.unlock();
  const result = crank(engine);
  if (result.ok) audio.stroke(engine.pumpSpeed);
  if (result.ok && !result.routed) audio.wrong();
}

function pressValve(idx) {
  audio.unlock();
  setValve(engine, idx);
}

document.getElementById('startBtn').addEventListener('click', () => {
  audio.unlock();
  start(engine);
});
document.getElementById('resetBtn').addEventListener('click', reset);
document.getElementById('crankBtn').addEventListener('click', pressCrank);
document.getElementById('valveABtn').addEventListener('click', () => pressValve(0));
document.getElementById('valveBBtn').addEventListener('click', () => pressValve(1));

window.addEventListener('keydown', (event) => {
  if (event.repeat) return;
  if (event.code === 'Space') {
    event.preventDefault();
    pressCrank();
  } else if (event.code === 'KeyA') {
    pressValve(0);
  } else if (event.code === 'KeyB') {
    pressValve(1);
  }
});

// 固定上限的变步长循环，避免标签页切走后大步长失真。
function frame(now) {
  let dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;
  while (dt > 0 && engine.running && !engine.finished) {
    const slice = Math.min(dt, 1 / 60);
    step(engine, slice);
    dt -= slice;
  }
  if (engine.seized && !lastSeized) audio.seizure();
  lastSeized = engine.seized;
  audio.update(engine.pumpSpeed, engine.seized);
  if (engine.finished && !frame.announced) {
    frame.announced = true;
    audio.finish(engine.success);
  }
  if (!engine.finished) frame.announced = false;
  drawScene(ctx, engine);
  requestAnimationFrame(frame);
}

reset();
requestAnimationFrame((now) => {
  lastTime = now;
  frame(now);
});

// 便于控制台调试与外部检查。
window.__pumpGame = {
  get engine() { return engine; },
  config: CONFIG,
  reset,
};
