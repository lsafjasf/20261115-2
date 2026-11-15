import {
  COLONY_MIN,
  COLONY_START,
  RELEASE_ZONES,
  SCENARIOS,
  STEP_SECONDS,
  createGame,
  forecastNoonTemperature,
  gameClock,
  pauseGame,
  setSettings,
  startGame,
  tick,
} from './engine.js';
import { GreenhouseRenderer } from './render.js';
import { GreenhouseAudio } from './audio.js';

const $ = (selector) => document.querySelector(selector);
const ui = {
  canvas: $('#scene'),
  cycleStatus: $('#cycleStatus'),
  clock: $('#clock'),
  timelineFill: $('#timelineFill'),
  tempMetric: $('#tempMetric'),
  tempTag: $('#tempTag'),
  activityMetric: $('#activityMetric'),
  activityTag: $('#activityTag'),
  colonyMetric: $('#colonyMetric'),
  colonyTag: $('#colonyTag'),
  fruitMetric: $('#fruitMetric'),
  fruitTag: $('#fruitTag'),
  ventilation: $('#ventilation'),
  ventilationOut: $('#ventilationOut'),
  shade: $('#shade'),
  shadeOut: $('#shadeOut'),
  releaseGrid: $('#releaseGrid'),
  releaseOut: $('#releaseOut'),
  cropList: $('#cropList'),
  residueSummary: $('#residueSummary'),
  colonyBig: $('#colonyBig'),
  colonyBar: $('#colonyBar'),
  colonyDelta: $('#colonyDelta'),
  colonyAdvice: $('#colonyAdvice'),
  eventLog: $('#eventLog'),
  eventClock: $('#eventClock'),
  startBtn: $('#startBtn'),
  pauseBtn: $('#pauseBtn'),
  speedBtn: $('#speedBtn'),
  resetBtn: $('#resetBtn'),
  audioBtn: $('#audioBtn'),
  audioIcon: $('#audioIcon'),
  heatScenarioBtn: $('#heatScenarioBtn'),
  toast: $('#toast'),
  autoBadge: $('#autoBadge'),
  resultCard: $('#resultCard'),
  resultSeal: $('#resultSeal'),
  resultEyebrow: $('#resultEyebrow'),
  resultTitle: $('#resultTitle'),
  resultBody: $('#resultBody'),
  resultStats: $('#resultStats'),
  againBtn: $('#againBtn'),
  closeResultBtn: $('#closeResultBtn'),
  phaseMorning: $('#phaseMorning'),
  phaseNoon: $('#phaseNoon'),
  phaseAfter: $('#phaseAfter'),
  phaseFinish: $('#phaseFinish'),
  canvasVignette: $('.canvas-vignette'),
};

const renderer = new GreenhouseRenderer(ui.canvas);
const audio = new GreenhouseAudio();
let game = createGame();
let speed = 1;
let lastFrame = performance.now();
let eventCursor = game.events.length;
let resultShown = false;
let toastTimer = null;
let uiClock = 0;

const cropRows = new Map();

function slugForCrop(crop) {
  return crop.id;
}

function buildCropRows() {
  ui.cropList.innerHTML = '';
  for (const crop of game.crops) {
    const row = document.createElement('div');
    row.className = 'crop-row';
    row.dataset.crop = slugForCrop(crop);
    row.innerHTML = `
      <span class="crop-icon" style="color:${crop.accent};background:${crop.accent}18">${crop.icon}</span>
      <div class="crop-copy">
        <div><strong>${crop.name}</strong><small></small></div>
        <div class="mini-track"><i></i></div>
      </div>
      <em>0%</em>`;
    ui.cropList.append(row);
    cropRows.set(crop.id, row);
  }
}

function fillRange(input) {
  const percentage = ((Number(input.value) - Number(input.min))
    / (Number(input.max) - Number(input.min))) * 100;
  input.style.setProperty('--fill', `${percentage}%`);
}

function syncControls() {
  ui.ventilation.value = String(game.settings.ventilation);
  ui.shade.value = String(game.settings.shade);
  ui.ventilationOut.textContent = `${Math.round(game.settings.ventilation)}%`;
  ui.shadeOut.textContent = `${Math.round(game.settings.shade)}%`;
  ui.releaseOut.textContent = RELEASE_ZONES[game.settings.releaseZone].name;
  fillRange(ui.ventilation);
  fillRange(ui.shade);
  ui.releaseGrid.querySelectorAll('button').forEach((button) => {
    button.classList.toggle('active', button.dataset.zone === game.settings.releaseZone);
  });
}

function updateCropPanel() {
  for (const crop of game.crops) {
    const row = cropRows.get(crop.id);
    if (!row) continue;
    row.querySelector('small').textContent = crop.stage;
    row.querySelector('.mini-track i').style.width = `${crop.pollination}%`;
    row.querySelector(':scope > em').textContent = `${Math.round(crop.pollination)}%`;
    row.classList.toggle('hot', crop.residue > 0.1);
    row.title = `农残 ${crop.residue.toFixed(2)} mg/kg · 坐果 ${Math.round(crop.growth)}%`;
  }
}

function activePhase(progress) {
  if (progress < 0.29) return ui.phaseMorning;
  if (progress < 0.65) return ui.phaseNoon;
  if (progress < 0.93) return ui.phaseAfter;
  return ui.phaseFinish;
}

function updateHud() {
  const progress = game.progress || 0;
  ui.clock.textContent = gameClock(game.t, game.duration);
  ui.timelineFill.style.width = `${progress * 100}%`;
  ui.eventClock.textContent = `T+${String(Math.floor(game.t / 60)).padStart(2, '0')}:${String(Math.floor(game.t % 60)).padStart(2, '0')}`;

  const statuses = {
    ready: '准备放蜂',
    running: '授粉进行中',
    paused: '已暂停',
    success: '周期完成',
    failed: '需要调整',
  };
  ui.cycleStatus.textContent = statuses[game.status];

  ui.tempMetric.textContent = `${game.temp.toFixed(1)}°C`;
  const hot = game.temp > 29.2;
  const warm = game.temp > 27.4;
  ui.tempTag.textContent = hot ? '热应激' : warm ? '偏高' : '舒适';
  ui.tempTag.classList.toggle('warn', warm);

  ui.activityMetric.textContent = `${Math.round(game.activity * 100)}%`;
  ui.activityTag.textContent = game.activity > 0.78 ? '活跃' : game.activity > 0.58 ? '迟缓' : '低迷';
  ui.activityTag.classList.toggle('warn', game.activity < 0.68);

  ui.colonyMetric.textContent = `${Math.floor(game.colony)}`;
  ui.colonyTag.textContent = game.colonyMinSeen < COLONY_MIN ? '跌破下限' : `下限 ${COLONY_MIN}`;
  ui.colonyTag.classList.toggle('warn', game.colonyMinSeen < COLONY_MIN || game.colony < 47);

  ui.fruitMetric.textContent = `${game.fruitCount} / 3`;
  ui.fruitTag.textContent = game.fruitCount === 3 ? '全部坐果' : '本周期';
  ui.fruitTag.classList.toggle('warn', game.status === 'failed');

  ui.residueSummary.textContent = `平均农残 ${game.residueLoad.toFixed(2)}`;
  ui.colonyBig.textContent = `${Math.floor(game.colony)}`;
  ui.colonyBar.style.width = `${Math.min(100, game.colony / (COLONY_START + 4) * 100)}%`;
  const delta = Math.round(game.colony - COLONY_START);
  ui.colonyDelta.textContent = `${delta >= 0 ? '+' : ''}${delta} 只`;
  ui.colonyDelta.style.color = delta < 0 ? '#a64d34' : '#59704d';

  const noonForecast = forecastNoonTemperature(game.settings);
  if (game.colonyMinSeen < COLONY_MIN) {
    ui.colonyAdvice.textContent = '蜂群已跌破安全下限。立即降低温度，并避免继续处于高农残区。';
  } else if (game.status === 'ready' && noonForecast > 29.2) {
    ui.colonyAdvice.textContent = `按当前参数，正午预计 ${noonForecast.toFixed(1)}°C。建议先提高通风或遮阳再放蜂。`;
  } else if (game.temp > 29.2) {
    ui.colonyAdvice.textContent = '高温正在削弱工蜂活动。提高通风，必要时放下遮阳幕。';
  } else if (game.residueLoad > 0.12) {
    ui.colonyAdvice.textContent = '草莓区农残偏高。保持通风可加速降解，同时留意温度。';
  } else if (game.status === 'success') {
    ui.colonyAdvice.textContent = '本周期蜂群与作物均达标，可调整参数后进行下一轮。';
  } else {
    ui.colonyAdvice.textContent = '温度与农残处于可控范围。保持访花强度直到三块作物坐果。';
  }

  ui.autoBadge.textContent = hot ? '需干预' : game.status === 'running' ? '监测中' : '手动';
  ui.autoBadge.style.color = hot ? '#93462f' : '';
  ui.canvasVignette.classList.toggle('hot', hot);

  document.querySelectorAll('.phase').forEach((phase) => phase.classList.remove('now'));
  activePhase(progress).classList.add('now');

  ui.startBtn.disabled = game.status === 'running' || game.status === 'success' || game.status === 'failed';
  ui.startBtn.querySelector('b').textContent = game.status === 'paused'
    ? '继续授粉'
    : game.status === 'success' || game.status === 'failed' ? '周期已结束' : '开始授粉';
  ui.startBtn.classList.toggle('ready', game.status === 'ready');
  ui.pauseBtn.disabled = game.status !== 'running';
}

function showToast(message, duration = 3200) {
  clearTimeout(toastTimer);
  ui.toast.textContent = message;
  ui.toast.classList.add('show');
  toastTimer = setTimeout(() => ui.toast.classList.remove('show'), duration);
}

function renderEvents() {
  const recent = game.log.slice(-6).reverse();
  ui.eventLog.innerHTML = recent.map((event) => `
    <div class="event-item ${event.type}">
      <time>${event.clock}</time>
      <span>${event.text}</span>
    </div>`).join('');
}

function checkNewEvents() {
  const newEvents = game.events.slice(eventCursor);
  eventCursor = game.events.length;
  if (!newEvents.length) return;
  renderEvents();
  const important = newEvents.find((event) => event.type === 'warn') || newEvents.at(-1);
  if (important && game.status === 'running') showToast(important.text);
}

function showResult() {
  if (!game.result || resultShown) return;
  resultShown = true;
  const result = game.result;
  ui.resultCard.classList.remove('hidden', 'success', 'failed');
  ui.resultCard.classList.add(result.success ? 'success' : 'failed');
  ui.resultSeal.textContent = result.success ? '✓' : '!';
  ui.resultEyebrow.textContent = result.success ? 'POLLINATION COMPLETE' : 'CYCLE REVIEW';
  ui.resultTitle.textContent = result.title;
  ui.resultBody.textContent = result.summary;
  ui.resultStats.innerHTML = `
    <div><small>坐果作物</small><strong>${result.fruitCount} / 3</strong></div>
    <div><small>蜂群最低</small><strong>${Math.floor(result.colonyMin)} 只</strong></div>
    <div><small>周期时段</small><strong>06—18 时</strong></div>`;
  audio.result(result.success);
  renderer.swarm.initialized = true;
}

function hideResult() {
  ui.resultCard.classList.add('hidden');
}

function resetRound(settings = game.settings, autoStart = false) {
  game = createGame({ settings });
  speed = 1;
  ui.speedBtn.textContent = '1×';
  eventCursor = game.events.length;
  resultShown = false;
  hideResult();
  buildCropRows();
  syncControls();
  updateCropPanel();
  updateHud();
  renderEvents();
  renderer.swarm.initialized = false;
  if (autoStart) beginRound();
}

function beginRound() {
  audio.resume();
  startGame(game);
  hideResult();
  updateHud();
}

function wireControls() {
  ui.ventilation.addEventListener('input', (event) => {
    setSettings(game, { ventilation: Number(event.target.value) });
    syncControls();
    updateHud();
  });
  ui.shade.addEventListener('input', (event) => {
    setSettings(game, { shade: Number(event.target.value) });
    syncControls();
    updateHud();
  });
  ui.releaseGrid.addEventListener('click', (event) => {
    const button = event.target.closest('[data-zone]');
    if (!button) return;
    setSettings(game, { releaseZone: button.dataset.zone });
    syncControls();
    updateHud();
  });
  ui.startBtn.addEventListener('click', beginRound);
  ui.pauseBtn.addEventListener('click', () => {
    if (game.status === 'running') {
      pauseGame(game);
      showToast('授粉周期已暂停，可继续调整温室参数。');
    } else if (game.status === 'paused') {
      startGame(game);
    }
    updateHud();
  });
  ui.speedBtn.addEventListener('click', () => {
    speed = speed === 1 ? 2 : speed === 2 ? 4 : 1;
    ui.speedBtn.textContent = `${speed}×`;
  });
  ui.resetBtn.addEventListener('click', () => {
    resetRound({ ventilation: 30, shade: 35, releaseZone: 'center' });
    showToast('已重置到晨间状态。');
  });
  ui.audioBtn.addEventListener('click', () => {
    audio.resume();
    const muted = audio.toggleMute();
    ui.audioBtn.classList.toggle('sound-off', muted);
    ui.audioIcon.textContent = muted ? '◖×' : '◖))';
    ui.audioBtn.setAttribute('aria-label', muted ? '开启声音' : '关闭声音');
  });
  ui.heatScenarioBtn.addEventListener('click', () => {
    resetRound(SCENARIOS.weakVentilation, false);
    speed = 4;
    ui.speedBtn.textContent = '4×';
    beginRound();
    showToast('实验开始：通风 5%、遮阳 14%，观察热应激对蜂群的影响。', 4200);
  });
  ui.againBtn.addEventListener('click', () => {
    resetRound(game.settings, true);
  });
  ui.closeResultBtn.addEventListener('click', hideResult);
  window.addEventListener('keydown', (event) => {
    if (event.code === 'Space' && !event.target.matches('input, button')) {
      event.preventDefault();
      if (game.status === 'running' || game.status === 'paused') ui.pauseBtn.click();
    }
    if (event.key.toLowerCase() === 'm') ui.audioBtn.click();
  });
}

function loop(now) {
  const frameDelta = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;
  if (game.status === 'running') {
    let simulated = frameDelta * speed;
    while (simulated > 0.0001 && game.status === 'running') {
      const step = Math.min(STEP_SECONDS, simulated);
      tick(game, step);
      simulated -= step;
    }
  }
  renderer.frame(game, frameDelta);
  audio.update(game);
  uiClock += frameDelta;
  if (uiClock > 0.06) {
    uiClock = 0;
    updateHud();
    updateCropPanel();
    checkNewEvents();
    if (game.status === 'success' || game.status === 'failed') showResult();
  }
  requestAnimationFrame(loop);
}

buildCropRows();
syncControls();
updateCropPanel();
updateHud();
renderEvents();
wireControls();
requestAnimationFrame(loop);

window.__greenhouse = {
  get game() {
    return game;
  },
  get result() {
    return game.result;
  },
  get audio() {
    return audio;
  },
};
