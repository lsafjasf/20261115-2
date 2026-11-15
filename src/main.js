import {
  createGame,
  stepGame,
  setRoute,
  setSpeedLimit,
  setDwell,
  setDelay,
  TRAIN_DEFAULTS,
  TRAIN_COUNT,
  SIM_DURATION,
  STEP,
  SEGMENTS,
} from './engine.js';
import { drawScene, drawTideChart, LAYOUT } from './render.js';
import { RailwayAudio } from './audio.js';

const SPEEDS = [1, 2, 4, 8];
let speedIndex = 1;
let paused = true;
let game = null;
let audio = new RailwayAudio();

const sceneCanvas = document.getElementById('scene');
sceneCanvas.width = LAYOUT.width;
sceneCanvas.height = LAYOUT.height;
const ctx = sceneCanvas.getContext('2d');
const chartCanvas = document.getElementById('tideChart');

function newGame(presets) {
  game = createGame(presets ? { trains: presets } : undefined);
  paused = true;
  speedIndex = 1;
  document.getElementById('speedBtn').textContent = '2x';
  acc = 0;
  document.getElementById('result').classList.add('hidden');
  document.getElementById('eventLog').innerHTML = '';
  renderControls();
  refreshHud();
  drawScene(ctx, game);
  drawTideChart(chartCanvas, game);
}

function renderControls() {
  const host = document.getElementById('trainControls');
  host.innerHTML = '';
  game.trains.forEach((train, i) => {
    const card = document.createElement('div');
    card.className = 'train-card';
    card.innerHTML = `
      <div class="card-head">
        <span class="dot" style="background:${train.color}"></span>
        <strong>${train.name}</strong>
        <span class="status" id="status-${i}"></span>
      </div>
      <label>道岔路线
        <select data-action="route" data-train="${i}">
          <option value="coastal" ${train.route === 'coastal' ? 'selected' : ''}>沿海线</option>
          <option value="bypass" ${train.route === 'bypass' ? 'selected' : ''}>内陆绕行</option>
        </select>
      </label>
      <label>限速 (m/s)
        <select data-action="speed" data-train="${i}">
          ${TRAIN_DEFAULTS.speedChoices.map((v) => `<option ${train.speedLimit === v ? 'selected' : ''}>${v}</option>`).join('')}
        </select>
      </label>
      <label>停站时长 (s)
        <select data-action="dwell" data-train="${i}">
          ${TRAIN_DEFAULTS.dwellChoices.map((v) => `<option ${train.dwell === v ? 'selected' : ''}>${v}</option>`).join('')}
        </select>
      </label>
      <label>发车延迟 (s)
        <input type="number" min="0" max="1700" step="20" value="${train.delay}" data-action="delay" data-train="${i}">
      </label>`;
    host.appendChild(card);
  });

  host.onchange = (ev) => {
    const el = ev.target;
    const action = el.dataset.action;
    const id = Number(el.dataset.train);
    if (!action) return;
    if (action === 'route') setRoute(game, id, el.value);
    if (action === 'speed') setSpeedLimit(game, id, Number(el.value));
    if (action === 'dwell') setDwell(game, id, Number(el.value));
    if (action === 'delay') setDelay(game, id, Number(el.value));
  };
}

function refreshHud() {
  document.getElementById('clock').textContent = `${game.t.toFixed(0)} / ${SIM_DURATION}s`;
  document.getElementById('water').textContent = `${game.waterLevel.toFixed(2)} m`;
  const flooded = [...game.flooded];
  document.getElementById('blocks').textContent = flooded.length
    ? flooded.map((id) => SEGMENTS.find((s) => s.id === id).name).join('、')
    : '无';
  document.getElementById('blocks').className = flooded.length ? 'danger' : '';
  const arrived = game.trains.filter((t) => t.status === 'finished').length;
  document.getElementById('arrived').textContent = `${arrived} / ${TRAIN_COUNT}`;
  game.trains.forEach((train, i) => {
    const el = document.getElementById(`status-${i}`);
    if (el) el.textContent = statusText(train);
  });
}

function statusText(train) {
  return {
    holding: '待发',
    running: '运行',
    dwell: `停站 ${Math.ceil(train.dwellRemaining)}s`,
    blocked: '红灯等待',
    finished: '已到达',
    crashed: '事故',
  }[train.status];
}

function appendLog() {
  const box = document.getElementById('eventLog');
  const rendered = Number(box.dataset.rendered || 0);
  for (const ev of game.events.slice(rendered)) {
    const line = document.createElement('div');
    line.className = `log-${ev.type}`;
    line.textContent = `[${ev.t.toFixed(0)}s] ${eventText(ev)}`;
    box.appendChild(line);
  }
  box.dataset.rendered = String(game.events.length);
  while (box.children.length > 40) box.firstChild.remove();
  box.scrollTop = box.scrollHeight;
}

function eventText(ev) {
  switch (ev.type) {
    case 'train_departed': return `${ev.name} 从车辆段发车`;
    case 'train_stopped_station': return `${ev.name} 进站停车，停站 ${ev.dwell}s`;
    case 'train_resumed': return `${ev.name} 停站结束继续运行`;
    case 'train_arrived': return `${ev.name} 到达终点`;
    case 'segment_flooded': return `水位 ${ev.level.toFixed(2)}m，${ev.name} 自动封锁`;
    case 'segment_reopened': return `水位回落，${ev.name} 解除封锁`;
    case 'train_crashed': return `事故：${ev.reason}`;
    case 'game_success': return '三列维修车全部到达，调度成功';
    case 'game_failed': return `调度失败：${ev.reason}`;
    default: return ev.type;
  }
}

function showResult() {
  const box = document.getElementById('result');
  box.classList.remove('hidden', 'success', 'failed');
  box.classList.add(game.status);
  box.querySelector('h2').textContent = game.status === 'success' ? '调度成功' : '调度失败';
  box.querySelector('p').textContent =
    game.status === 'success'
      ? `三列维修车均在潮位窗口内到达终点，用时 ${Math.max(...game.trains.map((t) => t.finishedAt)).toFixed(0)}s。`
      : game.failReason;
  if (game.status === 'success') audio.success();
  if (game.status === 'failed' && game.failReason.includes('涉水')) audio.crash();
}

let acc = 0;
let lastTs = 0;
function frame(ts) {
  requestAnimationFrame(frame);
  if (!game) return;
  const dt = Math.min(0.1, (ts - lastTs) / 1000 || 0);
  lastTs = ts;
  if (!paused && game.status === 'running') {
    acc += dt * SPEEDS[speedIndex];
    let guard = 0;
    while (acc >= STEP && guard < 240) {
      stepGame(game);
      acc -= STEP;
      guard += 1;
      if (game.status !== 'running') {
        paused = true;
        showResult();
        break;
      }
    }
    audio.update(game);
  }
  drawScene(ctx, game);
  drawTideChart(chartCanvas, game);
  refreshHud();
  appendLog();
}

document.getElementById('startBtn').onclick = () => {
  audio.resume();
  paused = false;
};
document.getElementById('pauseBtn').onclick = () => (paused = true);
document.getElementById('speedBtn').onclick = (e) => {
  speedIndex = (speedIndex + 1) % SPEEDS.length;
  e.target.textContent = `${SPEEDS[speedIndex]}x`;
};
document.getElementById('resetBtn').onclick = () => newGame();
document.getElementById('muteBtn').onclick = (e) => {
  audio.resume();
  e.target.textContent = audio.toggleMute() ? '🔇 已静音' : '🔊 音效';
};

// 一键载入“漏看水位”失败教学局
document.getElementById('demoFailBtn').onclick = () => {
  newGame([
    { route: 'coastal', speedLimit: 26, dwell: 20 },
    { route: 'coastal', speedLimit: 26, dwell: 20 },
    { route: 'coastal', speedLimit: 26, dwell: 20 },
  ]);
  for (let i = 0; i < TRAIN_COUNT; i++) setDelay(game, i, 220);
  renderControls();
};

newGame();
requestAnimationFrame(frame);
