'use strict';

const { Metronome, TARGET_BPM, DT } = globalThis.MET;

const el = (id) => document.getElementById(id);
const pendCanvas = el('pendulumCanvas');
const chartCanvas = el('chartCanvas');
const pctx = pendCanvas.getContext('2d');
const cctx = chartCanvas.getContext('2d');

const sliders = {
  length: el('lengthSlider'),
  tension: el('tensionSlider'),
  damping: el('dampingSlider'),
};
const labels = {
  length: el('lengthLbl'),
  tension: el('tensionLbl'),
  damping: el('dampingLbl'),
};

let metronome = new Metronome({ seed: (Date.now() % 1e9) | 0 });
let audio = new MetronomeAudio();
let running = false;
let accumulator = 0;
let lastFrame = performance.now();
let logLines = [];
let autoMode = false;
let autoStepDue = 0;

function syncLabels() {
  const p = metronome.params;
  labels.length.textContent = `${p.length.toFixed(3)} m`;
  labels.tensionLbl.textContent = p.tension.toFixed(2);
  labels.dampingLbl.textContent = p.damping.toFixed(2);
}

function pushLog(text, cls = '') {
  const t = metronome.t.toFixed(2);
  logLines.unshift(`<div class="${cls}">[${t}s] ${text}</div>`);
  logLines = logLines.slice(0, 40);
  el('eventLog').innerHTML = logLines.join('');
}

function handleEvents(events) {
  for (const ev of events) {
    audio.schedule(ev);
    if (ev.type === 'squeal') {
      pushLog(`金属尖响！强度 ${(ev.intensity ?? 0).toFixed(2)}，摆幅 ${ev.amp.toFixed(3)}`, 'squeal');
    } else if (ev.type === 'miss') {
      pushLog('漏拍：擒纵空程，摆幅不足', 'miss');
    } else if (ev.type === 'knock') {
      pushLog('撞机械限位，发出闷响', 'knock');
    }
  }
}

function drawPendulum() {
  const w = pendCanvas.width;
  const h = pendCanvas.height;
  pctx.clearRect(0, 0, w, h);
  const pivotX = w / 2;
  const pivotY = 36;
  const rodLen = 210;
  const theta = metronome.theta;
  const tipX = pivotX + rodLen * Math.sin(theta);
  const tipY = pivotY + rodLen * Math.cos(theta);

  // 机架
  pctx.strokeStyle = '#3a4152';
  pctx.lineWidth = 3;
  pctx.strokeRect(pivotX - 70, pivotY - 12, 140, h - pivotY - 24);
  // 限位参考线
  pctx.strokeStyle = 'rgba(255,93,122,0.35)';
  pctx.lineWidth = 1;
  for (const sgn of [-1, 1]) {
    pctx.beginPath();
    pctx.moveTo(pivotX, pivotY);
    pctx.lineTo(pivotX + rodLen * Math.sin(sgn * 0.52), pivotY + rodLen * Math.cos(0.52));
    pctx.stroke();
  }
  // 摆杆
  pctx.strokeStyle = '#c6ccda';
  pctx.lineWidth = 3;
  pctx.beginPath();
  pctx.moveTo(pivotX, pivotY);
  pctx.lineTo(tipX, tipY);
  pctx.stroke();
  // 摆锤
  const hot = metronome.squealCount > 0 && metronome.params.tension > 0.85;
  pctx.fillStyle = hot ? '#ff5d7a' : '#ffd166';
  pctx.beginPath();
  pctx.arc(tipX, tipY, 16, 0, Math.PI * 2);
  pctx.fill();
  // 支点
  pctx.fillStyle = '#7ee0c8';
  pctx.beginPath();
  pctx.arc(pivotX, pivotY, 6, 0, Math.PI * 2);
  pctx.fill();
  pctx.fillStyle = '#8b93a5';
  pctx.font = '12px monospace';
  pctx.fillText(`θ=${theta.toFixed(3)} rad`, 12, h - 12);
}

function drawChart() {
  const w = chartCanvas.width;
  const h = chartCanvas.height;
  cctx.clearRect(0, 0, w, h);
  const padL = 46;
  const padB = 28;
  const plotW = w - padL - 14;
  const plotH = h - padB - 14;
  const span = 30; // 显示最近 30s
  const tEnd = Math.max(span, metronome.t);
  const tStart = tEnd - span;
  const bpmLo = TARGET_BPM - 6;
  const bpmHi = TARGET_BPM + 6;
  const xOf = (t) => padL + ((t - tStart) / span) * plotW;
  const yOf = (b) => 14 + plotH * (1 - (b - bpmLo) / (bpmHi - bpmLo));

  // 网格 + Y 轴刻度
  cctx.strokeStyle = '#222632';
  cctx.fillStyle = '#7a8294';
  cctx.font = '11px monospace';
  cctx.lineWidth = 1;
  for (let b = bpmLo; b <= bpmHi; b += 2) {
    const y = yOf(b);
    cctx.beginPath();
    cctx.moveTo(padL, y);
    cctx.lineTo(w - 14, y);
    cctx.stroke();
    cctx.fillText(String(b), 8, y + 4);
  }
  // 误差带 ±1.5
  cctx.fillStyle = 'rgba(126,224,200,0.12)';
  cctx.fillRect(padL, yOf(TARGET_BPM + 1.5), plotW, yOf(TARGET_BPM - 1.5) - yOf(TARGET_BPM + 1.5));
  // 目标线
  cctx.strokeStyle = '#ffd166';
  cctx.setLineDash([6, 5]);
  cctx.beginPath();
  cctx.moveTo(padL, yOf(TARGET_BPM));
  cctx.lineTo(w - 14, yOf(TARGET_BPM));
  cctx.stroke();
  cctx.setLineDash([]);

  // BPM 曲线
  const pts = metronome.bpmWindow.filter((s) => s.time >= tStart);
  if (pts.length > 1) {
    cctx.strokeStyle = '#7ee0c8';
    cctx.lineWidth = 2;
    cctx.beginPath();
    pts.forEach((s, i) => {
      const x = xOf(s.time);
      const y = yOf(Math.max(bpmLo, Math.min(bpmHi, s.bpm)));
      if (i === 0) cctx.moveTo(x, y);
      else cctx.lineTo(x, y);
    });
    cctx.stroke();
  }

  // 事件标记（从历史事件里取——引擎 flush 后已消费，这里用计数器近似打点）
  for (const ev of metronome.recentEvents(span)) {
    if (ev.time < tStart) continue;
    const x = xOf(ev.time);
    if (ev.type === 'squeal') {
      cctx.fillStyle = '#ff5d7a';
      cctx.beginPath();
      cctx.arc(x, yOf(TARGET_BPM + 4.5), 5, 0, Math.PI * 2);
      cctx.fill();
    } else if (ev.type === 'miss') {
      cctx.fillStyle = '#8ab4ff';
      cctx.beginPath();
      cctx.arc(x, yOf(TARGET_BPM - 4.5), 4, 0, Math.PI * 2);
      cctx.fill();
    } else if (ev.type === 'knock') {
      cctx.fillStyle = '#ffcf91';
      cctx.fillRect(x - 3, yOf(TARGET_BPM + 3), 6, 6);
    }
  }
  cctx.fillStyle = '#8b93a5';
  cctx.fillText(`${tStart.toFixed(0)}s`, padL, h - 8);
  cctx.fillText(`${tEnd.toFixed(0)}s`, w - 40, h - 8);
}

function updateReadouts() {
  const s = metronome.getStatus();
  el('bpmVal').textContent = s.bpm == null ? '--' : s.bpm.toFixed(1);
  el('ampVal').textContent = s.amp.toFixed(3);
  el('stableVal').textContent = `${Math.min(s.stableFor, 99).toFixed(1)}s`;
  el('missVal').textContent = s.missCount;
  el('squealVal').textContent = s.squealCount;
  el('knockVal').textContent = s.knockCount;
  const badge = el('statusBadge');
  if (s.succeeded) {
    badge.textContent = '✔ 校准成功：已连续稳定 20 秒';
    badge.className = 'status ok';
  } else if (s.squealCount > 0 || s.knockCount > 0) {
    badge.textContent = '⚠ 过紧异常：金属尖响 / 撞限位';
    badge.className = 'status bad';
  } else if (s.missCount > 0) {
    badge.textContent = '⚠ 过松：擒纵漏拍';
    badge.className = 'status warn';
  } else if (s.bpm != null && Math.abs(s.bpm - TARGET_BPM) > 1.5) {
    badge.textContent = s.bpm > TARGET_BPM ? '偏快：加长摆锤' : '偏慢：缩短摆锤';
    badge.className = 'status warn';
  } else {
    badge.textContent = running ? '运行中…' : '未启动';
    badge.className = 'status';
  }
}

function frame(now) {
  const elapsed = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;
  if (running) {
    accumulator += elapsed;
    let steps = 0;
    while (accumulator >= DT && steps < 400) {
      metronome.step();
      accumulator -= DT;
      steps++;
    }
    const events = metronome.flushEvents();
    if (events.length) handleEvents(events);

    // 自动校准：每 3 秒观察窗口结束后调整一次滑块
    if (autoMode && metronome.t >= autoStepDue) {
      const adj = globalThis.Calibrator.nextAdjustment(metronome, 3);
      if (adj) {
        metronome.setParams(adj.changes);
        Object.entries(adj.changes).forEach(([k, v]) => { sliders[k].value = v; });
        syncLabels();
        pushLog(`自动调节：${adj.rationale.join('；')}`, 'ok');
      } else {
        pushLog('参数收敛，开始 20 秒稳定性计时', 'ok');
        autoMode = false;
      }
      autoStepDue = metronome.t + 3;
    }
  }
  drawPendulum();
  drawChart();
  updateReadouts();
  requestAnimationFrame(frame);
}

function resetEngine() {
  const p = {
    length: parseFloat(sliders.length.value),
    tension: parseFloat(sliders.tension.value),
    damping: parseFloat(sliders.damping.value),
  };
  metronome = new Metronome({ seed: (Date.now() % 1e9) | 0, ...p });
  logLines = [];
  el('eventLog').innerHTML = '';
  accumulator = 0;
  autoStepDue = 3;
  syncLabels();
}

Object.entries(sliders).forEach(([key, input]) => {
  input.addEventListener('input', () => {
    metronome.setParams({ [key]: parseFloat(input.value) });
    syncLabels();
  });
});

el('startBtn').addEventListener('click', () => {
  audio.ensure();
  resetEngine();
  running = true;
  autoMode = false;
  lastFrame = performance.now();
});

el('muteBtn').addEventListener('click', (e) => {
  audio.muted = !audio.muted;
  e.target.textContent = `声音：${audio.muted ? '关' : '开'}`;
});

el('autoBtn').addEventListener('click', () => {
  audio.ensure();
  // 典型“旧节拍器”初始故障状态
  sliders.length.value = 0.09;
  sliders.tension.value = 0.25;
  sliders.damping.value = 0.05;
  resetEngine();
  running = true;
  autoMode = true;
  autoStepDue = 3;
  lastFrame = performance.now();
  pushLog('自动校准开始：摆长偏短、发条偏松、阻尼偏小', 'ok');
});

syncLabels();
requestAnimationFrame(frame);
