import { createWorld, FIXED_DT } from './sim.js';
import { stepWorld, tryAttach } from './sim-step.js';
import { autopilotInput } from './autopilot.js';
import { Renderer } from './renderer.js';
import { AudioEngine } from './audio.js';

const canvas = document.getElementById('lake');
const renderer = new Renderer(canvas);
const audio = new AudioEngine();

let world = createWorld(20261115);
let auto = false;
const keys = new Set();

const keyMap = {
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
};

window.addEventListener('keydown', (e) => {
  if (keyMap[e.code]) {
    keys.add(keyMap[e.code]);
    e.preventDefault();
  }
  if (e.code === 'KeyE') {
    audio.start();
    tryAttach(world);
    const evt = world.events.find((x) => x.type === 'attach' || x.type === 'detach');
    if (evt) audio.playEvent(evt.type);
  }
  if (e.code === 'KeyT') auto = !auto;
  if (e.code === 'KeyR') reset();
});
window.addEventListener('keyup', (e) => {
  if (keyMap[e.code]) keys.delete(keyMap[e.code]);
});
canvas.addEventListener('pointerdown', () => audio.start());

document.getElementById('toggle-auto').addEventListener('click', () => {
  audio.start();
  auto = !auto;
  document.getElementById('toggle-auto').textContent = auto ? '停止自动巡航 (T)' : '自动巡航演示 (T)';
});
document.getElementById('restart').addEventListener('click', reset);

function reset() {
  world = createWorld(20261115);
  auto = false;
  document.getElementById('toggle-auto').textContent = '自动巡航演示 (T)';
}

function manualInput() {
  const throttle = (keys.has('up') ? 1 : 0) - (keys.has('down') ? 1 : 0);
  const steer = (keys.has('right') ? 1 : 0) - (keys.has('left') ? 1 : 0);
  return { throttle, steer };
}

let last = performance.now();
let acc = 0;

function frame(now) {
  acc += Math.min(0.1, (now - last) / 1000);
  last = now;
  while (acc >= FIXED_DT) {
    const input = auto ? autopilotInput(world) : manualInput();
    stepWorld(world, input);
    for (const evt of world.events) {
      if (evt.type === 'snag' || evt.type === 'dock' || evt.type === 'break'
        || evt.type === 'win' || evt.type === 'unsnag') {
        audio.playEvent(evt.type);
      }
    }
    acc -= FIXED_DT;
  }
  audio.update(world);
  renderer.draw(world, manualInput());
  document.getElementById('status').textContent = auto
    ? '自动巡航中'
    : world.cable.snag
      ? '缆绳挂底！向远离浅滩方向倒车（S）解脱'
      : world.cable.attached
        ? '拖带中：高张力时收油，避开浅滩'
        : '靠近浮标按 E 挂缆';
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
