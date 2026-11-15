import { SlitterSim } from './engine.js';
import { Renderer } from './render.js';
import { MachineAudio } from './audio.js';
import { ORDERS, WASTE_TARGET_PERCENT } from './config.js';

const canvas = document.getElementById('scene');
const sim = new SlitterSim();
const renderer = new Renderer(canvas);
const audio = new MachineAudio();

// 测试钩子：Playwright 可注入时间倍率与随机源
window.__sim = sim;
window.__setTimeScale = (scale) => { sim.timeScale = scale; };
window.__audio = audio;

const $ = (id) => document.getElementById(id);
const speedSlider = $('speed');
const tensionSlider = $('tension');
const startBtn = $('startBtn');
const stopBtn = $('stopBtn');
const alignBtn = $('alignBtn');
const resetBtn = $('resetBtn');

// —— 刀位输入框 ——
const knifeInputs = [];
const grid = $('knifeInputs');
sim.knives.forEach((_, i) => {
  const wrap = document.createElement('div');
  wrap.innerHTML =
    `<label style="text-align:center">K${i + 1}</label>`;
  const input = document.createElement('input');
  input.type = 'number';
  input.min = '0';
  input.max = '2000';
  input.dataset.knife = i;
  input.addEventListener('change', () => {
    const values = [...grid.querySelectorAll('input')].map((el) => Number(el.value));
    sim.setKnives(values);
    syncUI();
  });
  wrap.appendChild(input);
  grid.appendChild(wrap);
  knifeInputs.push(input);
});

// —— 画布拖动调刀 ——
let draggingKnife = -1;
canvas.addEventListener('mousedown', (e) => {
  if (sim.status === 'running') return;
  const rect = canvas.getBoundingClientRect();
  const y = (e.clientY - rect.top) * (canvas.height / rect.height);
  draggingKnife = renderer.knifeAt(y, sim);
});
canvas.addEventListener('mousemove', (e) => {
  if (draggingKnife < 0) return;
  const rect = canvas.getBoundingClientRect();
  const y = (e.clientY - rect.top) * (canvas.height / rect.height);
  const mm = Math.round(renderer.yToMm(y, sim));
  sim.setKnife(draggingKnife, mm);
  syncUI();
});
window.addEventListener('mouseup', () => { draggingKnife = -1; });

// —— 滑块 ——
speedSlider.addEventListener('input', () => sim.setSpeed(Number(speedSlider.value)));
tensionSlider.addEventListener('input', () => sim.setTension(Number(tensionSlider.value)));

startBtn.addEventListener('click', async () => {
  if (sim.start()) {
    await audio.start();
  }
});
stopBtn.addEventListener('click', () => sim.stop());
alignBtn.addEventListener('click', () => { sim.autoAlignKnives(); syncUI(); });
resetBtn.addEventListener('click', () => {
  audio.stop();
  sim.reset();
  speedSlider.value = 0;
  tensionSlider.value = 55;
  syncUI();
});
resetBtn.addEventListener('click', () => {
  audio.stop();
  sim.reset();
  speedSlider.value = 0;
  tensionSlider.value = 55;
  syncUI();
});

// —— 订单表 ——
const orderBody = $('orderBody');
ORDERS.forEach((order, i) => {
  const tr = document.createElement('tr');
  tr.innerHTML =
    `<td><span style="color:${order.color}">●</span> ${order.id}</td>` +
    `<td>${order.width}mm</td>` +
    `<td><span id="progText${i}">0/${order.target}m</span>` +
    `<div class="bar"><div id="progBar${i}" style="width:0%;background:${order.color}"></div></div></td>`;
  orderBody.appendChild(tr);
});

const STATUS_TEXT = {
  idle: ['就绪', ''],
  running: ['运行中', 'ok'],
  complete: ['已完成', 'ok'],
  broken: ['断纸停机', 'danger'],
};

let lastEventCount = 0;
function syncUI() {
  $('speedVal').textContent = sim.speed.toFixed(0);
  $('tensionVal').textContent = sim.tension.toFixed(0);
  speedSlider.value = sim.speed;
  tensionSlider.value = sim.tension;

  knifeInputs.forEach((input, i) => {
    if (document.activeElement !== input) input.value = sim.knives[i];
    input.disabled = sim.status === 'running';
  });
  alignBtn.disabled = sim.status === 'running';
  startBtn.disabled = sim.status === 'complete' || sim.status === 'broken';

  const [text, cls] = STATUS_TEXT[sim.status];
  const badge = $('statusBadge');
  badge.textContent = text;
  badge.className = `badge ${cls}`;

  const alignBadge = $('alignBadge');
  if (sim.allKnivesAligned) {
    alignBadge.textContent = '合格';
    alignBadge.className = 'badge ok';
  } else {
    alignBadge.textContent = '未对刀';
    alignBadge.className = 'badge warn';
  }

  const waste = sim.wastePercent;
  const wasteEl = $('wasteVal');
  wasteEl.textContent = `${waste.toFixed(2)}%`;
  wasteEl.style.color = waste > WASTE_TARGET_PERCENT ? '#ff4d5e' : '#34d99a';
  $('processedVal').textContent = `${sim.processed.toFixed(1)} m`;
  $('timeVal').textContent = `${sim.simTime.toFixed(1)} s`;

  ORDERS.forEach((order, i) => {
    const pct = Math.min(100, 100 * sim.produced[i] / order.target);
    $(`progBar${i}`).style.width = `${pct}%`;
    $(`progText${i}`).textContent =
      `${sim.produced[i].toFixed(0)}/${order.target}m` +
      (sim.produced[i] >= order.target ? ' ✓' : '');
  });

  const log = $('log');
  if (sim.events.length !== lastEventCount) {
    log.innerHTML = sim.events.map((e) =>
      `<div class="${e.level}">[${e.t.toFixed(1)}s] ${e.message}</div>`).join('');
    log.scrollTop = log.scrollHeight;
    lastEventCount = sim.events.length;
  }
}

// —— 主循环 ——
let lastFrame = performance.now();
let prevStatus = sim.status;
function frame(now) {
  const dt = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;
  const wasRunning = sim.status === 'running';
  sim.tick(dt);
  if (wasRunning && sim.status === 'broken') audio.crash();
  if (sim.status === 'running') {
    audio.update(sim.speed, sim.tension, true);
  } else if (prevStatus === 'running') {
    audio.stop();
  }
  prevStatus = sim.status;
  renderer.draw(sim);
  syncUI();
  requestAnimationFrame(frame);
}

syncUI();
renderer.draw(sim);
requestAnimationFrame(frame);
