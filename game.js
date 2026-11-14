/* 吊桥维修 · 双人协作
 * 维修员A: W/S 控制桥板升降（左声道音高 = 升降侧受力）
 * 维修员B: ↑/↓ 控制临时拉索张力（右声道音高 = 张力侧受力）
 */
'use strict';

const cv = document.getElementById('cv');
const ctx = cv.getContext('2d');
const hudPlate = document.getElementById('hud-plate');
const hudStress = document.getElementById('hud-stress');
const hudDock = document.getElementById('hud-dock');
const overlay = document.getElementById('overlay');

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;

/* ---------- 游戏状态 ---------- */
const G = {
  running: false,
  shutdown: false,       // 应力超限 -> 吊桥关闭
  won: false,
  plateIndex: 0,         // 0..2
  platesTotal: 3,
  lift: 30,              // 桥板升降位置 0..100
  liftVel: 0,
  tension: 30,           // 拉索张力 0..100
  tensionVel: 0,
  targetLift: 62,        // 目标位置（绿区中心）
  targetTension: 58,     // 目标张力（绿区中心）
  tolerance: 7,          // 绿区半宽
  dockProgress: 0,       // 0..1 对接保持进度
  stress: 0,             // 0..100
  twist: 0,              // 当前扭转量（视觉+应力来源）
  sag: 0,                // 桥面弯曲量
  time: 0,
  windPhase: 0,
  flash: 0,              // 关闭时红闪
  chime: 0,              // 成功提示动画
};

/* 三块桥板在桥面上的位置（0..1 归一化）与各自目标 */
const PLATES = [
  { x: 0.32, targetLift: 62, targetTension: 58, done: false },
  { x: 0.50, targetLift: 48, targetTension: 70, done: false },
  { x: 0.68, targetLift: 74, targetTension: 44, done: false },
];

function loadPlate(i) {
  const p = PLATES[i];
  G.targetLift = p.targetLift;
  G.targetTension = p.targetTension;
  G.dockProgress = 0;
  G.lift = 20;
  G.liftVel = 0;
  hudPlate.textContent = `桥板 ${i + 1} / ${G.platesTotal}`;
}

/* ---------- 输入 ---------- */
const keys = {};
addEventListener('keydown', e => {
  keys[e.code] = true;
  if (['ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault();
  if (e.code === 'KeyR') resetGame();
  audioEnsure();
});
addEventListener('keyup', e => { keys[e.code] = false; });

/* ---------- 物理更新 ---------- */
const LIFT_ACC = 55;      // 升降加速度
const LIFT_DAMP = 2.2;
const TENSION_SPD = 34;   // 张力调节速度
const WEIGHT_SAG = 9;     // 桥板重量造成的持续下沉

function update(dt) {
  G.time += dt;
  G.windPhase += dt * 0.35;

  // 目标随风缓慢漂移，迫使两人持续微调
  const p = PLATES[G.plateIndex];
  const drift = Math.sin(G.windPhase) * 4;
  G.targetLift = p.targetLift + drift;
  G.targetTension = p.targetTension + Math.cos(G.windPhase * 0.8) * 4;

  // A: 升降（带惯性 + 重量下沉）
  let acc = 0;
  if (keys.KeyW) acc += LIFT_ACC;
  if (keys.KeyS) acc -= LIFT_ACC;
  G.liftVel += (acc - WEIGHT_SAG * 0.35) * dt;
  G.liftVel -= G.liftVel * LIFT_DAMP * dt;
  G.lift = clamp(G.lift + G.liftVel * dt, 0, 100);
  if (G.lift === 0 || G.lift === 100) G.liftVel = 0;

  // B: 张力（直接调节，带回拉）
  let tIn = 0;
  if (keys.ArrowUp) tIn += TENSION_SPD;
  if (keys.ArrowDown) tIn -= TENSION_SPD;
  G.tensionVel = lerp(G.tensionVel, tIn, 1 - Math.exp(-6 * dt));
  G.tension = clamp(G.tension + G.tensionVel * dt, 0, 100);

  // 扭转 = 两侧支撑不平衡（升降侧 vs 张力侧）
  const imbalance = (G.lift - G.tension) / 100;
  G.twist = lerp(G.twist, imbalance, 1 - Math.exp(-4 * dt));

  // 桥面弯曲：重量让桥中部下沉，张力向上提拉
  const sagTarget = (WEIGHT_SAG - G.tension * 0.09) * (0.6 + 0.4 * Math.abs(G.twist));
  G.sag = lerp(G.sag, sagTarget, 1 - Math.exp(-3 * dt));

  // 应力：扭转 + 偏离目标 累积；同步时缓慢释放
  const posErr = Math.abs(G.lift - G.targetLift) / G.tolerance;
  const tenErr = Math.abs(G.tension - G.targetTension) / G.tolerance;
  const twistStress = Math.abs(G.twist) * 55;
  const errStress = Math.max(0, posErr - 1) * 6 + Math.max(0, tenErr - 1) * 6;
  const rate = twistStress + errStress - 14; // 同步良好时净释放
  G.stress = clamp(G.stress + rate * dt, 0, 100);

  // 对接判定：位置与张力同时合格
  const inZone = posErr <= 1 && tenErr <= 1;
  if (inZone) {
    G.dockProgress = clamp(G.dockProgress + dt / 2.2, 0, 1);
    if (G.dockProgress >= 1) completePlate();
  } else {
    G.dockProgress = clamp(G.dockProgress - dt / 1.2, 0, 1);
  }

  // 应力超限 -> 吊桥关闭
  if (G.stress >= 100 && !G.shutdown) {
    G.shutdown = true;
    G.flash = 1;
    audioShutdown();
  }
  G.flash = Math.max(0, G.flash - dt * 0.8);
  G.chime = Math.max(0, G.chime - dt);

  audioUpdate(inZone);
}

/* ---------- 渲染 ---------- */
function resize() {
  const r = cv.parentElement.getBoundingClientRect();
  cv.width = r.width * devicePixelRatio;
  cv.height = r.height * devicePixelRatio;
  ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
}
addEventListener('resize', resize);

function stressColor(s) { // s: 0..1 -> 绿->黄->红
  const h = lerp(140, 0, clamp(s, 0, 1));
  return `hsl(${h}, 85%, ${45 + 15 * (1 - s)}%)`;
}

/* 桥面某归一化位置 x 的当前位移（弯曲 + 扭转 + 振动） */
function deckOffset(x) {
  const bend = G.sag * Math.sin(Math.PI * x);            // 中部下沉
  const twist = G.twist * 46 * (x - 0.5);                // 两侧反向扭转
  const shake = Math.sin(G.time * 31 + x * 17) * G.stress * 0.05; // 高应力抖动
  return bend + twist + shake;
}

function draw() {
  const W = cv.clientWidth, H = cv.clientHeight;
  ctx.clearRect(0, 0, W, H);

  // 背景
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#0d1430'); sky.addColorStop(1, '#1a2447');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);

  const deckY = H * 0.52;
  const x0 = W * 0.08, x1 = W * 0.92;
  const towerH = H * 0.30;

  // 桥塔
  ctx.fillStyle = '#3a4a7a';
  for (const tx of [x0, x1]) {
    ctx.fillRect(tx - 7, deckY - towerH, 14, towerH + H * 0.3);
  }

  // 主缆（悬链线）
  ctx.strokeStyle = '#5a6ea8'; ctx.lineWidth = 3; ctx.beginPath();
  for (let i = 0; i <= 40; i++) {
    const t = i / 40;
    const x = lerp(x0, x1, t);
    const y = deckY - towerH + Math.sin(Math.PI * t) * towerH * 0.55;
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.stroke();

  // 临时拉索（张力越大越绷直、越亮）
  const plate = PLATES[G.plateIndex];
  const px = lerp(x0, x1, plate.x);
  const taut = G.tension / 100;
  for (const tx of [x0, x1]) {
    const sagC = (1 - taut) * 46;
    ctx.strokeStyle = `rgba(255, 195, 127, ${0.35 + taut * 0.6})`;
    ctx.lineWidth = 1.5 + taut * 2;
    ctx.beginPath();
    ctx.moveTo(tx, deckY - towerH);
    ctx.quadraticCurveTo((tx + px) / 2, deckY - towerH * 0.4 + sagC,
                         px, deckY + deckOffset(plate.x) - 14);
    ctx.stroke();
  }

  // 桥面（分段绘制，颜色 = 局部应力色带）
  const N = 48;
  for (let i = 0; i < N; i++) {
    const t0 = i / N, t1 = (i + 1) / N;
    const xa = lerp(x0, x1, t0), xb = lerp(x0, x1, t1);
    const ya = deckY + deckOffset(t0), yb = deckY + deckOffset(t1);
    const local = clamp(
      G.stress / 100 * 0.6 +
      Math.abs(G.twist) * 1.6 * Math.abs(t0 - 0.5) * 2 +
      Math.abs(deckOffset(t0)) / 40, 0, 1);
    ctx.strokeStyle = stressColor(local);
    ctx.lineWidth = 10;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(xa, ya); ctx.lineTo(xb, yb); ctx.stroke();
  }

  // 已更换的桥板（亮绿）与待更换的缺口
  for (let i = 0; i < PLATES.length; i++) {
    const pl = PLATES[i];
    const cxp = lerp(x0, x1, pl.x);
    const wHalf = (x1 - x0) * 0.045;
    const y = deckY + deckOffset(pl.x);
    if (pl.done) {
      ctx.fillStyle = '#54e88c';
      ctx.fillRect(cxp - wHalf, y - 7, wHalf * 2, 8);
    } else if (i === G.plateIndex && !G.shutdown) {
      // 缺口
      ctx.fillStyle = '#05070f';
      ctx.fillRect(cxp - wHalf, y - 8, wHalf * 2, 12);
      // 升降缆 + 新桥板（随 lift 上下）
      const plateY = y - 8 + (100 - G.lift) * 1.6 - 160;
      ctx.strokeStyle = '#7fd0ff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(cxp, deckY - towerH); ctx.lineTo(cxp, plateY); ctx.stroke();
      ctx.fillStyle = '#7fd0ff';
      ctx.fillRect(cxp - wHalf, plateY, wHalf * 2, 8);
      // 目标位置指示线
      ctx.strokeStyle = 'rgba(84,232,140,0.7)';
      ctx.setLineDash([5, 5]);
      ctx.beginPath(); ctx.moveTo(cxp - wHalf * 1.6, y - 8); ctx.lineTo(cxp + wHalf * 1.6, y - 8); ctx.stroke();
      ctx.setLineDash([]);
    } else {
      ctx.fillStyle = '#8b5a4a'; // 老旧桥板
      ctx.fillRect(cxp - wHalf, y - 7, wHalf * 2, 8);
    }
  }

  drawGauges(W, H);

  // 应力超限红闪
  if (G.flash > 0) {
    ctx.fillStyle = `rgba(255,30,30,${G.flash * 0.35})`;
    ctx.fillRect(0, 0, W, H);
  }
  if (G.shutdown) drawCenterText('⚠ 应力超限 · 吊桥已关闭', '按 R 复位后重新作业');
  if (G.won) drawCenterText('✔ 三块桥板更换完成！', '配合默契，吊桥恢复通行 · 按 R 再来一局');
}

function drawCenterText(big, small) {
  const W = cv.clientWidth, H = cv.clientHeight;
  ctx.fillStyle = 'rgba(5,8,18,0.55)';
  ctx.fillRect(0, H * 0.36, W, H * 0.2);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 30px sans-serif';
  ctx.fillText(big, W / 2, H * 0.46);
  ctx.font = '16px sans-serif';
  ctx.fillStyle = '#9db4ff';
  ctx.fillText(small, W / 2, H * 0.46 + 34);
}

/* 左右竖向仪表：值 + 绿色目标区；底部应力条与对接进度 */
function drawGauges(W, H) {
  const gh = H * 0.42, gw = 22, gy = H * 0.5 - gh / 2;
  const drawGauge = (gx, val, target, label, color) => {
    ctx.fillStyle = '#101a38';
    ctx.fillRect(gx, gy, gw, gh);
    // 目标绿区
    const zTop = gy + gh * (1 - (target + G.tolerance) / 100);
    const zH = gh * (G.tolerance * 2 / 100);
    ctx.fillStyle = 'rgba(84,232,140,0.35)';
    ctx.fillRect(gx, zTop, gw, zH);
    // 当前值
    const vh = gh * val / 100;
    ctx.fillStyle = color;
    ctx.fillRect(gx, gy + gh - vh, gw, vh);
    ctx.strokeStyle = '#4a5b8c'; ctx.lineWidth = 1;
    ctx.strokeRect(gx, gy, gw, gh);
    ctx.fillStyle = '#cfe0ff'; ctx.font = '12px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(label, gx + gw / 2, gy + gh + 16);
  };
  drawGauge(W * 0.03, G.lift, G.targetLift, '位置(A)', '#7fd0ff');
  drawGauge(W * 0.945, G.tension, G.targetTension, '张力(B)', '#ffc37f');

  // 底部：应力条（色带）+ 对接进度
  const bw = W * 0.4, bx = W / 2 - bw / 2, by = H * 0.9;
  const grad = ctx.createLinearGradient(bx, 0, bx + bw, 0);
  grad.addColorStop(0, '#2fd06f'); grad.addColorStop(0.6, '#e8c53a'); grad.addColorStop(1, '#e83a3a');
  ctx.fillStyle = '#101a38'; ctx.fillRect(bx, by, bw, 12);
  ctx.fillStyle = grad; ctx.fillRect(bx, by, bw * G.stress / 100, 12);
  ctx.strokeStyle = '#4a5b8c'; ctx.strokeRect(bx, by, bw, 12);
  ctx.fillStyle = '#cfe0ff'; ctx.font = '12px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('桥面应力', W / 2, by - 6);

  const dy = by + 22;
  ctx.fillStyle = '#101a38'; ctx.fillRect(bx, dy, bw, 8);
  ctx.fillStyle = '#54e88c'; ctx.fillRect(bx, dy, bw * G.dockProgress, 8);
  ctx.strokeStyle = '#4a5b8c'; ctx.strokeRect(bx, dy, bw, 8);
  ctx.fillStyle = '#cfe0ff';
  ctx.fillText('对接保持', W / 2, dy + 22);

  // 同步状态提示
  const posOk = Math.abs(G.lift - G.targetLift) <= G.tolerance;
  const tenOk = Math.abs(G.tension - G.targetTension) <= G.tolerance;
  ctx.font = 'bold 15px sans-serif';
  ctx.fillStyle = posOk ? '#54e88c' : '#e87a7a';
  ctx.fillText(posOk ? '位置 ✓' : '位置 ✗', W / 2 - 70, H * 0.16);
  ctx.fillStyle = tenOk ? '#54e88c' : '#e87a7a';
  ctx.fillText(tenOk ? '张力 ✓' : '张力 ✗', W / 2 + 70, H * 0.16);
}

/* ---------- Web Audio：双声道音高 = 两侧受力 ---------- */
let AC = null, oscL = null, oscR = null, gainL = null, gainR = null,
    rumble = null, rumbleGain = null;

function audioEnsure() {
  if (AC) { if (AC.state === 'suspended') AC.resume(); return; }
  AC = new (window.AudioContext || window.webkitAudioContext)();

  const mk = (pan) => {
    const osc = AC.createOscillator();
    const gain = AC.createGain();
    const panner = AC.createStereoPanner();
    osc.type = 'triangle';
    gain.gain.value = 0;
    osc.connect(gain).connect(panner).connect(AC.destination);
    panner.pan.value = pan;
    osc.start();
    return { osc, gain };
  };
  const L = mk(-0.85), R = mk(0.85);
  oscL = L.osc; gainL = L.gain;
  oscR = R.osc; gainR = R.gain;

  // 应力低频轰鸣
  rumble = AC.createOscillator();
  rumbleGain = AC.createGain();
  rumble.type = 'sawtooth';
  rumble.frequency.value = 38;
  rumbleGain.gain.value = 0;
  rumble.connect(rumbleGain).connect(AC.destination);
  rumble.start();
}

function audioUpdate(inZone) {
  if (!AC) return;
  const t = AC.currentTime;
  const active = G.running && !G.shutdown && !G.won;
  // 左声道音高随升降位置，右声道随张力：越费力音越高
  oscL.frequency.setTargetAtTime(150 + G.lift * 2.4, t, 0.05);
  oscR.frequency.setTargetAtTime(150 + G.tension * 2.4, t, 0.05);
  const base = active ? 0.05 : 0;
  // 进入绿区时对应声道略微提亮，便于“听音对位”
  const posOk = Math.abs(G.lift - G.targetLift) <= G.tolerance;
  const tenOk = Math.abs(G.tension - G.targetTension) <= G.tolerance;
  gainL.gain.setTargetAtTime(active ? base + (posOk ? 0.035 : 0) : 0, t, 0.08);
  gainR.gain.setTargetAtTime(active ? base + (tenOk ? 0.035 : 0) : 0, t, 0.08);
  rumbleGain.gain.setTargetAtTime(active ? (G.stress / 100) * 0.09 : 0, t, 0.15);
  // 对接保持时的滴答激励声
  if (inZone && active && G.dockProgress > 0 && Math.floor(G.time * 6) !== Math.floor((G.time - 1 / 60) * 6)) {
    blip(880, 0.05, 0.05);
  }
}

function blip(freq, dur, vol) {
  if (!AC) return;
  const o = AC.createOscillator(), g = AC.createGain();
  o.type = 'sine'; o.frequency.value = freq;
  g.gain.setValueAtTime(vol, AC.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, AC.currentTime + dur);
  o.connect(g).connect(AC.destination);
  o.start(); o.stop(AC.currentTime + dur);
}

function audioChime() { // 单块桥板完成：上行三音
  [523, 659, 784].forEach((f, i) =>
    setTimeout(() => blip(f, 0.22, 0.12), i * 110));
}

function audioShutdown() { // 关闭：下滑音
  if (!AC) return;
  const o = AC.createOscillator(), g = AC.createGain();
  o.type = 'square';
  o.frequency.setValueAtTime(320, AC.currentTime);
  o.frequency.exponentialRampToValueAtTime(55, AC.currentTime + 0.8);
  g.gain.setValueAtTime(0.14, AC.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, AC.currentTime + 0.9);
  o.connect(g).connect(AC.destination);
  o.start(); o.stop(AC.currentTime + 0.95);
}

function audioWin() {
  [523, 659, 784, 1047].forEach((f, i) =>
    setTimeout(() => blip(f, 0.35, 0.13), i * 150));
}

/* ---------- 游戏流程 ---------- */
function completePlate() {
  PLATES[G.plateIndex].done = true;
  G.chime = 1;
  audioChime();
  G.stress = Math.max(0, G.stress - 25); // 成功对接释放部分应力
  if (G.plateIndex >= G.platesTotal - 1) {
    G.won = true;
    audioWin();
  } else {
    G.plateIndex++;
    loadPlate(G.plateIndex);
  }
}

function resetGame() {
  for (const p of PLATES) p.done = false;
  G.plateIndex = 0;
  G.stress = 0;
  G.twist = 0;
  G.sag = 0;
  G.tension = 30;
  G.tensionVel = 0;
  G.shutdown = false;
  G.won = false;
  G.flash = 0;
  loadPlate(0);
  if (!G.running) {
    G.running = true;
    overlay.classList.add('hidden');
  }
}

document.getElementById('btn-start').addEventListener('click', () => {
  audioEnsure();
  resetGame();
});

/* ---------- 主循环 ---------- */
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (G.running && !G.shutdown && !G.won) update(dt);
  else if (G.running) { G.flash = Math.max(0, G.flash - dt * 0.8); audioUpdate(false); }
  draw();
  hudStress.textContent = `应力 ${Math.round(G.stress)}%`;
  hudDock.textContent = `对接 ${Math.round(G.dockProgress * 100)}%`;
  requestAnimationFrame(frame);
}

resize();
loadPlate(0);
requestAnimationFrame(frame);
