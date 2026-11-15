import { buildCues, TOTAL_DURATION, formatClock } from './cues.js';
import { layoutText, DEFAULT_NO_START, DEFAULT_NO_END } from './layout.js';
import { CANVAS_W, CANVAS_H, renderFrame } from './render.js';
import { BeatEngine } from './audio.js';
import { exportVtt, exportCurrentFrame, exportContactSheet } from './exporter.js';

const $ = (id) => document.getElementById(id);
const canvas = $('stage');
const ctx = canvas.getContext('2d');
const cues = buildCues();

const state = {
  maxWidth: 880,
  fontSize: 34,
  wordIntact: true,
  kinsoku: true,
  noStart: DEFAULT_NO_START,
  noEnd: DEFAULT_NO_END,
  showSafe: true,
  bpm: 120
};

let layouts = [];
let statuses = [];
let currentTime = 0;
let playing = false;
let rafId = null;
let lastTs = 0;
let beatOn = false;

const measureCtx = document.createElement('canvas').getContext('2d');
function measure(text) {
  return measureCtx.measureText(text).width;
}
function syncMeasureFont() {
  measureCtx.font = `500 ${state.fontSize}px "PingFang SC",` +
    '"Microsoft YaHei","Noto Sans CJK SC",sans-serif';
}

// 规则变更 -> 十条字幕立即全部重排
function relayout() {
  syncMeasureFont();
  const opts = {
    maxWidth: state.maxWidth,
    wordIntact: state.wordIntact,
    kinsoku: state.kinsoku,
    noStart: state.noStart,
    noEnd: state.noEnd
  };
  layouts = cues.map((cue) => layoutText(cue.text, measure, opts));
  statuses = layouts.map((layout) => evaluate(layout));
  renderCueList();
  draw();
}

function evaluate(layout) {
  const paddingX = state.fontSize * 0.7;
  const maxLineW = Math.max(...layout.lines.map((l) => l.width));
  const boxW = maxLineW + paddingX * 2;
  const outOfSafe = boxW > CANVAS_W - CANVAS_W * 0.2;
  return {
    danger: layout.overflow || outOfSafe,
    outOfSafe,
    lines: layout.lines.length
  };
}

function activeCueIndex(time) {
  return cues.findIndex((c) => time >= c.start && time <= c.end);
}

function draw() {
  const idx = activeCueIndex(currentTime);
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
  if (idx >= 0) {
    renderFrame(ctx, cues[idx], layouts[idx], state, currentTime * 1000, beatOn);
  } else {
    renderFrame(ctx, { id: 0, text: '' },
      { lines: [], violations: new Set(), overflow: false },
      state, currentTime * 1000, beatOn);
  }
}

function frame(ts) {
  if (!playing) return;
  if (!lastTs) lastTs = ts;
  currentTime += (ts - lastTs) / 1000;
  lastTs = ts;
  if (currentTime >= TOTAL_DURATION) {
    currentTime = TOTAL_DURATION;
    stopPlayback();
  }
  $('seek').value = currentTime;
  updateClock();
  renderCueList();
  draw();
  rafId = requestAnimationFrame(frame);
}

function updateClock() {
  $('clock').textContent = `${formatClock(currentTime)} / ${formatClock(TOTAL_DURATION)}`;
}

async function startPlayback() {
  if (playing) return;
  if (currentTime >= TOTAL_DURATION) currentTime = 0;
  playing = true;
  lastTs = 0;
  $('play').textContent = '❚❚ 暂停';
  try {
    await beat.start();
  } catch (err) {
    // 无音频设备时降级为静音播放，画面与时间轴照常运行
    console.warn('Web Audio 不可用，使用静音播放:', err);
  }
  rafId = requestAnimationFrame(frame);
}

function stopPlayback() {
  playing = false;
  lastTs = 0;
  if (rafId) cancelAnimationFrame(rafId);
  beat.stop();
  beatOn = false;
  $('play').textContent = '▶ 播放';
  draw();
}

const beat = new BeatEngine(() => {
  beatOn = true;
  draw();
  setTimeout(() => {
    beatOn = false;
    draw();
  }, 110);
});

function renderCueList() {
  const active = activeCueIndex(currentTime);
  const list = $('cueList');
  list.innerHTML = '';
  cues.forEach((cue, i) => {
    const item = document.createElement('div');
    item.className = 'cue-item' +
      (statuses[i].danger ? ' danger' : '') +
      (i === active ? ' active' : '');
    const reason = layouts[i].overflow ? '行宽超限'
      : statuses[i].outOfSafe ? '超出安全区' : 'OK';
    item.innerHTML =
      `<span class="cue-id">${String(cue.id).padStart(2, '0')}</span>` +
      `<span class="cue-text">${cue.text}</span>` +
      `<span class="cue-status">${statuses[i].lines} 行 · ${reason}</span>`;
    item.addEventListener('click', () => {
      currentTime = cue.start + 0.01;
      $('seek').value = currentTime;
      updateClock();
      renderCueList();
      draw();
    });
    list.appendChild(item);
  });
}

function bindRange(id, key, valId, after = () => {}) {
  $(id).addEventListener('input', (e) => {
    state[key] = Number(e.target.value);
    $(valId).textContent = e.target.value;
    after();
    relayout();
  });
}

bindRange('maxWidth', 'maxWidth', 'maxWidthVal');
bindRange('fontSize', 'fontSize', 'fontSizeVal');
$('bpm').addEventListener('input', (e) => {
  state.bpm = Number(e.target.value);
  $('bpmVal').textContent = e.target.value;
  beat.setBpm(state.bpm);
});
$('wordIntact').addEventListener('change', (e) => {
  state.wordIntact = e.target.checked;
  relayout();
});
$('kinsoku').addEventListener('change', (e) => {
  state.kinsoku = e.target.checked;
  relayout();
});
$('showSafe').addEventListener('change', (e) => {
  state.showSafe = e.target.checked;
  draw();
});
$('noStart').addEventListener('input', (e) => {
  state.noStart = e.target.value;
  relayout();
});
$('noEnd').addEventListener('input', (e) => {
  state.noEnd = e.target.value;
  relayout();
});

$('play').addEventListener('click', startPlayback);
$('stop').addEventListener('click', () => {
  currentTime = 0;
  $('seek').value = 0;
  updateClock();
  stopPlayback();
});
$('seek').addEventListener('input', (e) => {
  currentTime = Number(e.target.value);
  updateClock();
  renderCueList();
  draw();
});

$('btnVtt').addEventListener('click', () => exportVtt(cues));
$('btnFrame').addEventListener('click', () => exportCurrentFrame(canvas));
$('btnSheet').addEventListener('click', () =>
  exportContactSheet(canvas, cues, layouts, state));

// 初始化
$('noStart').value = DEFAULT_NO_START;
$('noEnd').value = DEFAULT_NO_END;
$('seek').max = TOTAL_DURATION;
beat.setBpm(state.bpm);
relayout();
updateClock();
