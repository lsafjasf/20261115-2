// 主控：交互、旋律判定、自动演奏、录音与离线渲染入口。

import {
  createGlasses, step, strike, rub,
  MELODY, GLASS_COUNT, detuneCents, resonantFreq,
} from './physics.js';
import { GlassAudio, encodeWav } from './audio.js';
import { render, layout, hitTest, forceAt } from './renderer.js';

const canvas = document.getElementById('stage');
const ctx = canvas.getContext('2d');
const positions = layout(canvas.width);

const ui = {
  status: document.getElementById('status'),
  progress: document.getElementById('progress'),
  detune: document.getElementById('detune'),
  broken: document.getElementById('broken'),
  target: document.getElementById('target'),
  auto: document.getElementById('btn-auto'),
  record: document.getElementById('btn-record'),
  reset: document.getElementById('btn-reset'),
  recInfo: document.getElementById('rec-info'),
};

let glasses = createGlasses();
let audio = null;
let progress = 0;
let brokenCount = 0;
let finished = false;
let hoverId = -1;
let drag = null;
let lastFrame = performance.now();

MELODY.forEach((id, i) => {
  const li = document.createElement('li');
  li.textContent = glasses[id].note;
  li.dataset.index = i;
  ui.target.appendChild(li);
});

function ensureAudio() {
  if (!audio) audio = new GlassAudio(new AudioContext());
  if (audio.ctx.state === 'suspended') audio.ctx.resume();
  return audio;
}

function updateHud() {
  ui.progress.textContent = `${progress} / ${MELODY.length}`;
  ui.broken.textContent = String(brokenCount);
  [...ui.target.children].forEach((li, i) => {
    li.classList.toggle('done', i < progress);
    li.classList.toggle('next', i === progress && !finished);
  });
  const active = drag ? glasses[drag.id] : glasses.find((g) => g.vibration > 0.05);
  const cents = active ? detuneCents(active) : 0;
  ui.detune.textContent = `${cents >= 0 ? '+' : ''}${cents.toFixed(0)} cent`;
}

function handleStrike(id, force) {
  if (finished) return;
  const g = glasses[id];
  const a = ensureAudio();
  const ev = strike(g, force);
  if (ev.type === 'crack') {
    a.crack();
    brokenCount += 1;
    ui.status.textContent = `杯子 ${g.note} 破裂！演奏失败`;
    finished = true;
  } else if (ev.type === 'ring') {
    a.strike(g, force);
    advanceMelody(g);
  }
}

function advanceMelody(g) {
  if (progress >= MELODY.length) return;
  if (g.id === MELODY[progress] && Math.abs(detuneCents(g)) < 80) {
    progress += 1;
    if (progress === MELODY.length) {
      finished = true;
      ui.status.textContent = '🎉 旋律完成，无破损，演奏成功！';
    } else {
      ui.status.textContent = `命中 ${g.note}，继续！`;
    }
  } else {
    ui.status.textContent = `听到 ${g.note}，期待 ${glasses[MELODY[progress]].note}`;
  }
}

canvas.addEventListener('pointerdown', (e) => {
  if (finished) return;
  const { x, y } = toLocal(e);
  const id = hitTest(x, y, positions);
  if (id < 0 || glasses[id].cracked) return;
  canvas.setPointerCapture(e.pointerId);
  handleStrike(id, forceAt(y));
  drag = { id, lastX: x, lastY: y, lastT: performance.now(), speed: 0 };
  ensureAudio().startRub(glasses[id]);
});

canvas.addEventListener('pointermove', (e) => {
  const { x, y } = toLocal(e);
  hoverId = hitTest(x, y, positions);
  if (!drag) return;
  const g = glasses[drag.id];
  if (g.cracked) {
    endDrag();
    return;
  }
  const now = performance.now();
  const dt = Math.max(1, now - drag.lastT) / 1000;
  const instantSpeed = Math.hypot(x - drag.lastX, y - drag.lastY) / (dt * 1000);
  drag.speed = drag.speed * 0.35 + instantSpeed * 0.65;
  const intensity = Math.max(0.2, Math.min(1, 0.35 + drag.speed * 1.4));
  rub(g, intensity, dt);
  audio?.updateRub(g, intensity);
  drag.lastX = x;
  drag.lastY = y;
  drag.lastT = now;
});

canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);

function endDrag() {
  if (drag && audio) audio.stopRub(glasses[drag.id]);
  drag = null;
}

function toLocal(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) * (canvas.width / rect.width),
    y: (e.clientY - rect.top) * (canvas.height / rect.height),
  };
}

function frame(now) {
  const dt = Math.min(0.05, (now - lastFrame) / 1000);
  lastFrame = now;
  step(glasses, dt);
  render(ctx, glasses, positions, hoverId, now);
  updateHud();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

function resetAll() {
  glasses.splice(0, GLASS_COUNT, ...createGlasses());
  progress = 0;
  brokenCount = 0;
  finished = false;
  drag = null;
  ui.status.textContent = '准备演奏';
  ui.recInfo.textContent = '';
  updateHud();
}
ui.reset.addEventListener('click', resetAll);

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function autoPlay() {
  if (finished) resetAll();
  ensureAudio();
  ui.auto.disabled = true;
  for (const id of MELODY) {
    handleStrike(id, 0.45);
    await wait(420);
  }
  ui.auto.disabled = false;
}
ui.auto.addEventListener('click', autoPlay);

let recorder = null;
let recChunks = [];
ui.record.addEventListener('click', async () => {
  if (recorder) {
    recorder.stop();
    return;
  }
  const a = ensureAudio();
  const dest = a.ctx.createMediaStreamDestination();
  a.master.connect(dest);
  recChunks = [];
  recorder = new MediaRecorder(dest.stream);
  recorder.ondataavailable = (e) => recChunks.push(e.data);
  recorder.onstop = () => {
    const blob = new Blob(recChunks, { type: recorder.mimeType });
    downloadBlob(blob, `glass-harp-${Date.now()}.webm`);
    ui.recInfo.textContent = `已保存录音 (${(blob.size / 1024).toFixed(1)} KB)`;
    ui.record.textContent = '● 开始录音';
    ui.record.classList.remove('recording');
    recorder = null;
  };
  recorder.start();
  ui.record.textContent = '■ 停止并保存';
  ui.record.classList.add('recording');
  ui.recInfo.textContent = '录音中…';
});

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export async function renderMelodyWav({ heated = false } = {}) {
  const sampleRate = 44100;
  const noteGap = 0.45;
  const total = MELODY.length * noteGap + 2.0;
  const off = new OfflineAudioContext(2, Math.ceil(total * sampleRate), sampleRate);
  const ga = new GlassAudio(off);
  const local = createGlasses();

  if (heated) {
    for (let s = 0; s < 40; s++) rub(local[MELODY[0]], 1, 0.1);
  }
  MELODY.forEach((id, i) => {
    const g = local[id];
    strike(g, 0.45);
    ga.strike(g, 0.45, i * noteGap + 0.1);
  });
  const rendered = await off.startRendering();
  return { buffer: rendered, wav: encodeWav(rendered), glasses: local };
}

const physics = await import('./physics.js');
window.__glassHarp = {
  physics,
  getState: () => ({
    progress,
    brokenCount,
    finished,
    glasses: glasses.map((g) => ({
      id: g.id,
      note: g.note,
      temperature: g.temperature,
      freq: resonantFreq(g),
      cents: detuneCents(g),
      cracked: g.cracked,
    })),
  }),
  reset: resetAll,
  autoPlay,
  renderMelodyWav,
  downloadBlob,
  rubGlass: (id, seconds = 3, intensity = 1) => {
    const g = glasses[id];
    let acc = 0;
    const stepSec = 0.05;
    while (acc < seconds) {
      rub(g, intensity, stepSec);
      acc += stepSec;
    }
    return {
      temperature: g.temperature,
      freq: resonantFreq(g),
      cents: detuneCents(g),
    };
  },
  strikeHard: (id) => handleStrike(id, 1.1),
};
