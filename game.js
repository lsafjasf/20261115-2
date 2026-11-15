/* 游戏交互 + Canvas 渲染 + Web Audio */
const S = PipeSim;
let sim = S.createSim();
let lastEventCount = 0;
let installing = false;

// ---------- Web Audio：声音随水压/流速变化 ----------
let AC = null, flowNoise, flowFilter, flowGain, leakOsc, leakGain, master;
function initAudio() {
  if (AC) return;
  AC = new (window.AudioContext || window.webkitAudioContext)();
  master = AC.createGain(); master.gain.value = 0.5; master.connect(AC.destination);
  // 水流声：滤波噪声
  const len = AC.sampleRate * 2;
  const buf = AC.createBuffer(1, len, AC.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  flowNoise = AC.createBufferSource(); flowNoise.buffer = buf; flowNoise.loop = true;
  flowFilter = AC.createBiquadFilter(); flowFilter.type = 'lowpass'; flowFilter.frequency.value = 400;
  flowGain = AC.createGain(); flowGain.gain.value = 0;
  flowNoise.connect(flowFilter).connect(flowGain).connect(master);
  flowNoise.start();
  // 泄漏嘶声：高频噪声
  const leakSrc = AC.createBufferSource(); leakSrc.buffer = buf; leakSrc.loop = true;
  const hp = AC.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 3000;
  leakGain = AC.createGain(); leakGain.gain.value = 0;
  leakSrc.connect(hp).connect(leakGain).connect(master);
  leakSrc.start();
}
function thump(strength) { // 水锤闷响
  if (!AC) return;
  const o = AC.createOscillator(), g = AC.createGain();
  o.type = 'sine'; o.frequency.setValueAtTime(70, AC.currentTime);
  o.frequency.exponentialRampToValueAtTime(30, AC.currentTime + 0.4);
  g.gain.setValueAtTime(Math.min(0.9, strength), AC.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, AC.currentTime + 0.5);
  o.connect(g).connect(master); o.start(); o.stop(AC.currentTime + 0.55);
}
function updateAudio() {
  if (!AC) return;
  const p = sim.pressure / 1e6, v = sim.velocity / S.consts.V_MAX;
  flowFilter.frequency.value = 200 + 1200 * p;
  flowGain.gain.value = 0.25 * v * sim.waterLevel;
  const leaking = sim.phase === 'LEAKING' ? 1 : 0;
  leakGain.gain.value = 0.12 * leaking * (sim.valveA.open * sim.valveB.open);
}

// ---------- UI ----------
const $ = id => document.getElementById(id);
const durEl = $('dur');
durEl.oninput = () => $('durLabel').textContent = (+durEl.value).toFixed(1);
const dur = () => +durEl.value;

function bind(id, fn) { $(id).addEventListener('click', () => { initAudio(); fn(); }); }
bind('btnCloseA', () => S.setValve(sim, 'A', 0, dur()));
bind('btnCloseB', () => S.setValve(sim, 'B', 0, dur()));
bind('btnOpenA', () => S.setValve(sim, 'A', 1, dur()));
bind('btnOpenB', () => S.setValve(sim, 'B', 1, dur()));
bind('btnDig', () => S.digTrench(sim));
bind('btnShore', () => S.addShoring(sim));
bind('btnDrain', () => S.startDrain(sim));
bind('btnRestore', () => S.restoreAndTest(sim));
bind('btnReset', () => { sim = S.createSim(); lastEventCount = 0; $('log').innerHTML = ''; });
bind('btnDemo', () => { sim = S.createSim(); lastEventCount = 0; S.setValve(sim, 'B', 0, 0.2); });

$('btnInstall').addEventListener('mousedown', () => { initAudio(); installing = true; });
window.addEventListener('mouseup', () => installing = false);

function refreshButtons() {
  const p = sim.phase, over = p === 'SUCCESS' || p === 'FAILED';
  $('btnCloseA').disabled = over || sim.valveA.open === 0 || sim.valveA.rate > 0;
  $('btnCloseB').disabled = over || sim.valveB.open === 0 || sim.valveB.rate > 0;
  $('btnOpenA').disabled = over || p !== 'PRESSURE_TEST' || sim.valveA.open === 1;
  $('btnOpenB').disabled = over || p !== 'PRESSURE_TEST' || sim.valveB.open === 1;
  $('btnDig').disabled = over || sim.trenchOpen;
  $('btnShore').disabled = over || !sim.trenchOpen || sim.shoring >= 1;
  $('btnDrain').disabled = over || p !== 'VALVES_DONE' || sim.draining;
  $('btnInstall').disabled = over || (p !== 'DRAINED' && p !== 'VALVES_DONE');
  $('btnRestore').disabled = over || p !== 'REPAIRED';
}

const PHASE_TEXT = {
  LEAKING: '阶段：泄漏中 —— 请按规程关阀（先上游 A，再下游 B，务必慢关！）',
  VALVES_DONE: '阶段：阀门已关 —— 开挖沟槽、支护并排水',
  DRAINED: '阶段：已排空 —— 按住「安装新管段」换管',
  REPAIRED: '阶段：换管完成 —— 恢复供水（先开 B 再开 A，慢开）',
  PRESSURE_TEST: '阶段：压力测试 —— 缓开阀门，保持压力稳定',
  SUCCESS: '✅ 抢修成功！供水恢复，压力测试通过',
};
function phaseText() {
  return sim.phase === 'FAILED'
    ? '❌ 抢修失败：' + (sim.failReason || '')
    : (PHASE_TEXT[sim.phase] || sim.phase);
}

// ---------- Canvas 渲染 ----------
const cv = $('cv'), ctx = cv.getContext('2d');
const W = cv.width, H = cv.height;
const GROUND_Y = 90, PIPE_Y = 330, PIPE_R = 26;
const PIPE_X0 = 40, PIPE_X1 = W - 40;
const LEAK_X = W / 2, VALVE_A_X = 130, VALVE_B_X = W - 130;
const particles = [];
let spray = [];

function drawBackground() {
  // 天空与地面
  ctx.fillStyle = '#87b5d6'; ctx.fillRect(0, 0, W, GROUND_Y);
  ctx.fillStyle = '#5b8c5a'; ctx.fillRect(0, GROUND_Y - 6, W, 8);
  // 土层
  const g = ctx.createLinearGradient(0, GROUND_Y, 0, H);
  g.addColorStop(0, '#8a6f4d'); g.addColorStop(1, '#5e4a33');
  ctx.fillStyle = g; ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);
  ctx.fillStyle = 'rgba(0,0,0,0.08)';
  for (let i = 0; i < 40; i++) {
    const x = (i * 97) % W, y = GROUND_Y + 20 + (i * 53) % (H - GROUND_Y - 30);
    ctx.fillRect(x, y, 3, 2);
  }
}

function drawPipe() {
  // 管体
  ctx.fillStyle = '#39424e';
  ctx.fillRect(PIPE_X0, PIPE_Y - PIPE_R - 6, PIPE_X1 - PIPE_X0, (PIPE_R + 6) * 2);
  // 管内水
  const wl = sim.waterLevel;
  ctx.fillStyle = '#1b2733';
  ctx.fillRect(PIPE_X0, PIPE_Y - PIPE_R, PIPE_X1 - PIPE_X0, PIPE_R * 2);
  if (wl > 0) {
    const h = PIPE_R * 2 * wl;
    ctx.fillStyle = '#2f7fd0';
    ctx.fillRect(PIPE_X0, PIPE_Y + PIPE_R - h, PIPE_X1 - PIPE_X0, h);
  }
  // 新管段高亮
  if (sim.pipeInstalled > 0) {
    ctx.fillStyle = 'rgba(123,216,143,0.35)';
    const w = 140 * sim.pipeInstalled;
    ctx.fillRect(LEAK_X - w / 2, PIPE_Y - PIPE_R - 6, w, (PIPE_R + 6) * 2);
  }
  // 流动粒子
  if (sim.velocity > 0.1 && sim.waterLevel > 0.05) {
    if (Math.random() < 0.5) particles.push({ x: PIPE_X0, y: PIPE_Y + (Math.random() - 0.5) * PIPE_R });
  }
  ctx.fillStyle = '#bfe3ff';
  for (let i = particles.length - 1; i >= 0; i--) {
    const pt = particles[i];
    pt.x += sim.velocity * 3;
    if (pt.x > PIPE_X1 || sim.velocity < 0.1) { particles.splice(i, 1); continue; }
    ctx.fillRect(pt.x, pt.y, 4, 2);
  }
}

function drawValve(x, open, label) {
  ctx.strokeStyle = '#ccc'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(x, PIPE_Y - PIPE_R - 6); ctx.lineTo(x, PIPE_Y - 80); ctx.stroke();
  // 闸板
  const gateH = (1 - open) * (PIPE_R * 2 + 12);
  ctx.fillStyle = '#c0c5ce';
  ctx.fillRect(x - 14, PIPE_Y - PIPE_R - 6, 28, gateH);
  // 手轮
  ctx.strokeStyle = open > 0.5 ? '#7bd88f' : open === 0 ? '#ff6b6b' : '#ffd166';
  ctx.lineWidth = 5;
  ctx.beginPath(); ctx.arc(x, PIPE_Y - 88, 14, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = '#e8e8e8'; ctx.font = '13px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText(label + ' ' + Math.round(open * 100) + '%', x, PIPE_Y - 108);
}

function drawLeak() {
  const leaking = sim.phase === 'LEAKING' && sim.valveA.open * sim.valveB.open > 0.02;
  // 漏点
  ctx.fillStyle = '#ff6b6b';
  ctx.beginPath(); ctx.arc(LEAK_X, PIPE_Y - PIPE_R - 6, 6, 0, Math.PI * 2); ctx.fill();
  if (leaking) {
    for (let i = 0; i < 4; i++) spray.push({
      x: LEAK_X, y: PIPE_Y - PIPE_R - 8,
      vx: (Math.random() - 0.5) * 3, vy: -Math.random() * 5 - 2, life: 1,
    });
  }
  ctx.fillStyle = 'rgba(120,190,255,0.8)';
  for (let i = spray.length - 1; i >= 0; i--) {
    const d = spray[i];
    d.x += d.vx; d.y += d.vy; d.vy += 0.15; d.life -= 0.02;
    if (d.life <= 0) { spray.splice(i, 1); continue; }
    ctx.globalAlpha = d.life;
    ctx.fillRect(d.x, d.y, 3, 3);
    ctx.globalAlpha = 1;
  }
}

function drawTrench() {
  if (!sim.trenchOpen) return;
  const tw = 150, tx = LEAK_X - tw / 2;
  // 坑体（挖开的土）
  ctx.fillStyle = '#2b2119';
  ctx.fillRect(tx, GROUND_Y, tw, PIPE_Y - PIPE_R - 20 - GROUND_Y);
  // 支护板
  const sh = sim.shoring;
  if (sh > 0) {
    ctx.fillStyle = '#a9825a';
    const boards = Math.round(sh * 4);
    for (let i = 0; i < boards; i++) {
      const y = GROUND_Y + 10 + i * 45;
      ctx.fillRect(tx - 8, y, 10, 34);
      ctx.fillRect(tx + tw - 2, y, 10, 34);
    }
  }
  // 坑内积水
  if (sim.waterLevel > 0.05 && sim.draining) {
    ctx.fillStyle = 'rgba(47,127,208,0.5)';
    const wh = 20 * sim.waterLevel;
    ctx.fillRect(tx, PIPE_Y - PIPE_R - 20 - wh, tw, wh);
  }
}

function bar(x, y, w, h, frac, color, label, text) {
  ctx.fillStyle = '#14161b'; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = color; ctx.fillRect(x, y, w * Math.max(0, Math.min(1, frac)), h);
  ctx.strokeStyle = '#555'; ctx.lineWidth = 1; ctx.strokeRect(x, y, w, h);
  ctx.fillStyle = '#e8e8e8'; ctx.font = '12px sans-serif'; ctx.textAlign = 'left';
  ctx.fillText(label + ' ' + text, x, y - 4);
}

function drawGauges() {
  const pMPa = sim.pressure / 1e6;
  const pFrac = sim.pressure / S.consts.P_RATING;
  const pColor = pFrac > 0.85 ? '#ff6b6b' : pFrac > 0.6 ? '#ffd166' : '#7bd88f';
  bar(20, 24, 220, 14, pFrac, pColor, '压力', pMPa.toFixed(2) + ' MPa / 耐压 1.20');
  bar(280, 24, 180, 14, sim.stability, sim.stability > 0.4 ? '#7bd88f' : '#ff6b6b',
      '沟槽稳定', Math.round(sim.stability * 100) + '%');
  bar(500, 24, 120, 14, sim.waterLevel, '#2f7fd0', '充水', Math.round(sim.waterLevel * 100) + '%');
  if (sim.phase === 'PRESSURE_TEST') {
    bar(640, 24, 100, 14, sim.testTimer / sim.testHold, '#8ecae6',
        '稳压', sim.testTimer.toFixed(1) + 's');
  }
  // 水锤红色闪屏
  const recent = sim.transients.some(tr => sim.t - tr.t0 < 0.4 && tr.amp > 0.5e6);
  if (recent) {
    ctx.fillStyle = 'rgba(255,60,60,0.12)';
    ctx.fillRect(0, 0, W, H);
  }
}

// ---------- 主循环 ----------
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (installing) S.installPipe(sim, dt);
  S.step(sim, dt);

  // 新事件 -> 日志 + 音效
  for (; lastEventCount < sim.events.length; lastEventCount++) {
    const e = sim.events[lastEventCount];
    const div = document.createElement('div');
    div.className = e.kind;
    div.textContent = '[' + e.t.toFixed(1) + 's] ' + e.msg;
    $('log').appendChild(div);
    $('log').scrollTop = 1e9;
    if (e.msg.indexOf('水锤') >= 0) thump(0.8);
    if (e.kind === 'danger' && e.msg.indexOf('爆管') >= 0) thump(1.0);
  }

  $('status').textContent = phaseText();
  $('status').style.color = sim.phase === 'SUCCESS' ? '#7bd88f'
    : sim.phase === 'FAILED' ? '#ff6b6b' : '#e8e8e8';

  drawBackground();
  drawTrench();
  drawPipe();
  drawValve(VALVE_A_X, sim.valveA.open, '阀A');
  drawValve(VALVE_B_X, sim.valveB.open, '阀B');
  drawLeak();
  drawGauges();
  refreshButtons();
  updateAudio();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
