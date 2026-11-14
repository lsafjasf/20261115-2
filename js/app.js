import {
  ENTRANCES,
  TEMPLATES,
  applyTemplate,
  createCue,
  createInitialState,
  getActiveCue,
  serializeProject,
  Clock,
} from './core.js';
import { drawFrame } from './render.js';

const state = createInitialState();
const clock = new Clock(state.duration);

const $ = (id) => document.getElementById(id);
const canvas = $('stage');
const ctx = canvas.getContext('2d');

function selectedCue() {
  return state.cues.find((cue) => cue.id === state.selectedCueId) || state.cues[0];
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return `${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`;
}

function renderStage() {
  drawFrame(ctx, state.cues, clock.time, { width: canvas.width, height: canvas.height });
  $('scrubber').value = String(clock.time);
  $('timecode').textContent = `${formatTime(clock.time)} / ${formatTime(state.duration)}`;
  updatePlayhead();
}

function updatePlayhead() {
  const playhead = $('playhead');
  if (playhead) {
    playhead.style.left = `${12 + (clock.time / state.duration) * (timelineWidth())}px`;
  }
  const active = getActiveCue(state.cues, clock.time);
  document.querySelectorAll('.cue-block').forEach((el) => {
    el.classList.toggle('live', Boolean(active && el.dataset.cueId === active.id));
  });
}

function timelineWidth() {
  const track = document.querySelector('#timeline .track');
  return track ? track.clientWidth : 0;
}

// 单一 rAF 循环：只从时钟读数重绘，播放/暂停/seek 都走同一套时间推导。
function frameLoop(now) {
  clock.tick(now);
  $('play-pause').textContent = clock.playing ? '⏸ 暂停' : '▶ 播放';
  renderStage();
  requestAnimationFrame(frameLoop);
}

$('play-pause').addEventListener('click', () => {
  if (clock.playing) clock.pause();
  else clock.play(performance.now());
});

$('stop').addEventListener('click', () => {
  clock.pause();
  clock.seek(0);
  renderStage();
});

$('scrubber').addEventListener('input', (event) => {
  clock.pause();
  clock.seek(Number(event.target.value));
  renderStage();
});

const TEMPLATE_TAG_COLORS = { news: '#c62828', drama: '#455a64', card: '#1565c0' };

function buildCueList() {
  const list = $('cue-list');
  list.innerHTML = '';
  state.cues.forEach((cue) => {
    const item = document.createElement('li');
    item.className = cue.id === state.selectedCueId ? 'active' : '';
    item.dataset.cueId = cue.id;
    item.innerHTML = `<div>${cue.text || '（空字幕）'}</div>
      <div class="meta">${TEMPLATES[cue.templateId].label} · ${cue.start.toFixed(1)}s–${cue.end.toFixed(1)}s</div>`;
    item.addEventListener('click', () => selectCue(cue.id));
    list.appendChild(item);
  });
}

function buildTimeline() {
  const timeline = $('timeline');
  timeline.innerHTML = '';
  const ruler = document.createElement('div');
  ruler.className = 'ruler';
  for (let sec = 0; sec <= state.duration; sec += 1) {
    const mark = document.createElement('span');
    mark.textContent = `${sec}s`;
    ruler.appendChild(mark);
  }
  const track = document.createElement('div');
  track.className = 'track';
  track.addEventListener('click', (event) => {
    const rect = track.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / rect.width;
    clock.pause();
    clock.seek(Math.min(1, Math.max(0, ratio)) * state.duration);
    renderStage();
  });

  state.cues.forEach((cue) => {
    const block = document.createElement('div');
    block.className = 'cue-block';
    block.dataset.cueId = cue.id;
    block.style.left = `${(cue.start / state.duration) * 100}%`;
    block.style.width = `${((cue.end - cue.start) / state.duration) * 100}%`;
    block.style.background = TEMPLATE_TAG_COLORS[cue.templateId];
    block.innerHTML = `<div>${cue.text || '（空字幕）'}</div><div class="cue-time">${cue.start.toFixed(1)}–${cue.end.toFixed(1)}s</div>`;
    block.addEventListener('click', (event) => {
      event.stopPropagation();
      selectCue(cue.id);
    });
    track.appendChild(block);
  });

  const playhead = document.createElement('div');
  playhead.id = 'playhead';
  playhead.className = 'playhead';

  timeline.append(ruler, track, playhead);
}

function buildTemplateSwitch() {
  const wrap = $('template-switch');
  wrap.innerHTML = '';
  Object.values(TEMPLATES).forEach((template) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.templateId = template.id;
    button.textContent = template.label;
    button.addEventListener('click', () => {
      // 不捕获外部 cue 引用：切换时始终读取当前选中条目的最新状态。
      const current = state.cues.find((item) => item.id === state.selectedCueId);
      const index = state.cues.findIndex((item) => item.id === current.id);
      state.cues[index] = applyTemplate(current, template.id);
      syncAll();
    });
    wrap.appendChild(button);
  });
}

function buildEntranceOptions() {
  const select = $('entrance-select');
  select.innerHTML = '';
  Object.values(ENTRANCES).forEach((entrance) => {
    const option = document.createElement('option');
    option.value = entrance.id;
    option.textContent = entrance.label;
    select.appendChild(option);
  });
}

function selectCue(cueId) {
  state.selectedCueId = cueId;
  syncAll();
}

function syncEditor() {
  const cue = selectedCue();
  $('text-input').value = cue.text;
  $('font-size').value = cue.fontSize;
  $('font-size-value').textContent = `${cue.fontSize}px`;
  $('box-enabled').checked = cue.box.enabled;
  $('box-color').value = toHex(cue.box.fill);
  $('box-radius').value = cue.box.radius;
  $('box-radius-value').textContent = `${cue.box.radius}px`;
  $('stroke-enabled').checked = cue.stroke.enabled;
  $('stroke-color').value = cue.stroke.color;
  $('stroke-width').value = cue.stroke.width;
  $('stroke-width-value').textContent = `${cue.stroke.width}px`;
  $('entrance-select').value = cue.entrance;
  $('cue-start').value = cue.start;
  $('cue-end').value = cue.end;

  document.querySelectorAll('#template-switch button').forEach((button) => {
    button.classList.toggle('active', button.dataset.templateId === cue.templateId);
  });
  $('template-pace').textContent = TEMPLATES[cue.templateId].pace;
}

function toHex(rgba) {
  if (rgba.startsWith('#')) return rgba.slice(0, 7);
  const match = rgba.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!match) return '#000000';
  return '#' + match.slice(1, 4).map((n) => Number(n).toString(16).padStart(2, '0')).join('');
}

function mutateCue(mutator) {
  const index = state.cues.findIndex((item) => item.id === state.selectedCueId);
  const cue = state.cues[index];
  const next = structuredClone(cue);
  mutator(next);
  next.end = Math.max(next.end, next.start + 0.1);
  state.cues[index] = next;
  buildCueList();
  buildTimeline();
}

function bindEditor() {
  $('text-input').addEventListener('input', (event) => {
    mutateCue((cue) => { cue.text = event.target.value; });
  });
  $('font-size').addEventListener('input', (event) => {
    mutateCue((cue) => { cue.fontSize = Number(event.target.value); });
    syncEditor();
  });
  $('box-enabled').addEventListener('change', (event) => {
    mutateCue((cue) => { cue.box.enabled = event.target.checked; });
  });
  $('box-color').addEventListener('input', (event) => {
    const alpha = cueBoxAlpha(selectedCue());
    mutateCue((cue) => { cue.box.fill = hexToRgba(event.target.value, alpha); });
  });
  $('box-radius').addEventListener('input', (event) => {
    mutateCue((cue) => { cue.box.radius = Number(event.target.value); });
    syncEditor();
  });
  $('stroke-enabled').addEventListener('change', (event) => {
    mutateCue((cue) => { cue.stroke.enabled = event.target.checked; });
  });
  $('stroke-color').addEventListener('input', (event) => {
    mutateCue((cue) => { cue.stroke.color = event.target.value; });
  });
  $('stroke-width').addEventListener('input', (event) => {
    mutateCue((cue) => { cue.stroke.width = Number(event.target.value); });
    syncEditor();
  });
  $('entrance-select').addEventListener('change', (event) => {
    mutateCue((cue) => { cue.entrance = event.target.value; });
  });
  $('cue-start').addEventListener('change', (event) => {
    mutateCue((cue) => { cue.start = Number(event.target.value); });
    syncEditor();
  });
  $('cue-end').addEventListener('change', (event) => {
    mutateCue((cue) => { cue.end = Number(event.target.value); });
    syncEditor();
  });

  $('add-cue').addEventListener('click', () => {
    const cue = createCue({ start: 0, end: 3, text: '新字幕', templateId: selectedCue().templateId });
    state.cues.push(cue);
    state.selectedCueId = cue.id;
    syncAll();
  });
}

function hexToRgba(hex, alpha) {
  const value = hex.replace('#', '');
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function cueBoxAlpha(cue) {
  const match = cue.box.fill.match(/rgba\([^)]+,\s*([\d.]+)\)/);
  return match ? Number(match[1]) : 1;
}

function download(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

$('export-frame').addEventListener('click', () => {
  renderStage();
  const stamp = `t${clock.time.toFixed(2).replace('.', '-')}s`;
  canvas.toBlob((blob) => {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `subtitle-frame-${stamp}.png`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, 'image/png');
});

$('export-json').addEventListener('click', () => {
  download(`subtitle-template-${Date.now()}.json`, serializeProject(state), 'application/json');
});

function syncAll() {
  buildCueList();
  buildTimeline();
  syncEditor();
  renderStage();
}

buildTemplateSwitch();
buildEntranceOptions();
bindEditor();
syncAll();
requestAnimationFrame(frameLoop);
