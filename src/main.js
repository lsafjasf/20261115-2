import { ChamberSim } from './engine.js';
import { O2Player, PressurePlayer, SoloOperator, o2View, pressureView } from './controllers.js';
import { ChamberRenderer } from './render.js';
import { FlowAudio } from './audio.js';

const canvas = document.getElementById('stage');
const modeSelect = document.getElementById('mode');
const resetBtn = document.getElementById('reset');
const muteBtn = document.getElementById('mute');
const statusEl = document.getElementById('status');
const soloPanel = document.querySelector('.solo-only');
const leftPanel = document.getElementById('left-panel');
const rightPanel = document.getElementById('right-panel');

const sim = new ChamberSim();
const renderer = new ChamberRenderer(canvas);
const audio = new FlowAudio();
const o2Player = new O2Player();
const pressurePlayer = new PressurePlayer();
const soloOperator = new SoloOperator();

const keys = new Set();
let lastFrame = performance.now();
let acc = 0; // 固定步长累加器
let stableAnnounced = false;

function isAuto() {
  return modeSelect.value.startsWith('auto');
}

function applyKeyboard() {
  if (sim.sealed || isAuto()) return;
  const step = 0.06;
  if (keys.has('KeyA')) sim.adjustSupply(-step);
  if (keys.has('KeyD')) sim.adjustSupply(step);
  if (keys.has('ArrowLeft')) sim.adjustVent(-step);
  if (keys.has('ArrowRight')) sim.adjustVent(step);
}

function applyAutoController() {
  const mode = modeSelect.value;
  const snap = sim.snapshot();
  if (mode === 'auto-duo') {
    if (sim.sealed) {
      sim.setSupplyTarget(0);
      sim.setVentTarget(0);
    } else {
      o2Player.decide(o2View(snap), sim);
      pressurePlayer.decide(pressureView(snap), sim);
    }
  } else if (mode === 'auto-solo') {
    soloOperator.decide(snap, sim);
  }
}

function updateStatus(snap) {
  if (snap.stable && !stableAnnounced) {
    stableAnnounced = true;
    statusEl.textContent = `任务达成：双参数安全区内稳定 30 秒（用时 ${snap.time.toFixed(1)}s，封闭 ${snap.sealCount} 次）`;
    statusEl.className = 'status ok';
    return;
  }
  if (snap.sealed) {
    statusEl.textContent = `紧急封闭中：${snap.lastTrigger?.reason ?? ''}，两阀锁定，${snap.sealRemaining.toFixed(1)}s 后恢复`;
    statusEl.className = 'status danger';
  } else if (!snap.safe) {
    statusEl.textContent = `安全区外：压力 ${snap.pressure.toFixed(1)} kPa，氧浓度 ${snap.o2.toFixed(1)}%（稳定计时 ${snap.stableTimer.toFixed(0)}s）`;
    statusEl.className = 'status';
  } else {
    statusEl.textContent = `双参数均在安全区，保持中：${snap.stableTimer.toFixed(1)} / 30 s`;
    statusEl.className = 'status ok';
  }
}

function frame(now) {
  const elapsed = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;
  acc += elapsed;
  const dt = sim.cfg.STEP;
  let guard = 0;
  while (acc >= dt && guard < 8) {
    if (isAuto()) applyAutoController();
    applyKeyboard();
    sim.step(dt);
    acc -= dt;
    guard += 1;
  }
  const snap = sim.snapshot();
  renderer.render(snap);
  audio.update(snap.inflow, snap.outflow, snap.sealed);
  updateStatus(snap);
  requestAnimationFrame(frame);
}

function reset() {
  sim.reset();
  acc = 0;
  stableAnnounced = false;
  statusEl.className = 'status';
  statusEl.textContent = '准备就绪';
}

function syncModePanels() {
  const mode = modeSelect.value;
  const solo = mode === 'solo' || mode === 'auto-solo';
  soloPanel.hidden = !solo;
  leftPanel.style.opacity = solo ? 0.45 : 1;
  rightPanel.style.opacity = solo ? 0.45 : 1;
}

window.addEventListener('keydown', (e) => {
  if (['KeyA', 'KeyD', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
    e.preventDefault();
    audio.ensure();
    keys.add(e.code);
  }
});

window.addEventListener('keyup', (e) => {
  keys.delete(e.code);
});

resetBtn.addEventListener('click', () => {
  audio.ensure();
  audio.click();
  reset();
});

muteBtn.addEventListener('click', () => {
  audio.ensure();
  audio.setMuted(!audio.muted);
  muteBtn.textContent = audio.muted ? '声音：关' : '声音：开';
});

modeSelect.addEventListener('change', () => {
  audio.ensure();
  syncModePanels();
  reset();
});

syncModePanels();
requestAnimationFrame((t) => {
  lastFrame = t;
  requestAnimationFrame(frame);
});
