"use strict";
/* 火山监测站 —— 6 小时喷发前兆判定模拟 */

// ---------- 可复现随机数 ----------
const params = new URLSearchParams(location.search);
let rngState = (parseInt(params.get("seed") || "20261115", 10) >>> 0) || 1;
function rand() {
  rngState |= 0; rngState = (rngState + 0x6D2B79F5) | 0;
  let t = Math.imul(rngState ^ (rngState >>> 15), 1 | rngState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function gauss() { return (rand() + rand() + rand() - 1.5) * 2; }

// ---------- 时间线(单位:游戏分钟,总长 360) ----------
const TOTAL_MIN = 360;
const PRECURSOR = { start: 258, cross: 280, end: 340 }; // 真实前兆窗口
const events = [
  { type: "vehicle", t: 70,  dur: 5,  note: "车辆经过(振动+次声短促尖峰)" },
  { type: "fault",   t: 150, dur: 14, note: "气体传感器故障(单通道卡死)" },
  { type: "vehicle", t: 212, dur: 4,  note: "车辆经过(振动+次声短促尖峰)" },
  { type: "fault",   t: 236, dur: 10, note: "次声传感器故障(单通道归零)" },
];

// ---------- 模拟状态 ----------
const S = {
  running: false, finished: false,
  min: 0,                       // 当前游戏分钟(浮点)
  speed: 1,                     // 1 现实秒 = speed 游戏分钟
  w: { vib: 1, gas: 1, inf: 1 },
  thr: 55,
  sig: { vib: 10, gas: 15, inf: 8 },
  risk: 0,
  alarm: false, alarmHold: 0,
  statFalse: 0, statMiss: 0, statGood: 0,
  correctAlarmMin: null,        // 首次正确预警时刻
  logAfterGood: 0,              // 正确预警后的观察记录数
  fired: new Set(),             // 已触发事件
  history: [],                  // 波形历史 {vib,gas,inf,risk}
  log: [],
};

function smooth(cur, target, k) { return cur + (target - cur) * k; }

// 单步推进 dt 游戏分钟
function step(dt) {
  S.min += dt;
  const t = S.min;

  // 基础信号:基线 + 缓慢漂移 + 噪声
  let vib = 10 + 3 * Math.sin(t / 47) + gauss() * 2.5;
  let gas = 15 + 4 * Math.sin(t / 63 + 2) + gauss() * 2.0;
  let inf = 8 + 2 * Math.sin(t / 31 + 4) + gauss() * 2.2;

  // 事件注入
  for (const e of events) {
    const d = t - e.t;
    if (d >= 0 && d < e.dur) {
      if (!S.fired.has(e)) { S.fired.add(e); addLog(`检测到异常事件 —— 待判定`, "evt"); }
      if (e.type === "vehicle") {
        const env = Math.sin((d / e.dur) * Math.PI);      // 包络:快速起落
        vib += env * (55 + gauss() * 12);
        inf += env * (42 + gauss() * 10);
      } else if (e.type === "fault" && e.t === 150) {
        gas = 86 + gauss() * 0.4;                          // 卡死在高值
      } else if (e.type === "fault" && e.t === 236) {
        inf = 0.3 + rand() * 0.4;                          // 归零故障
      }
    }
  }

  // 真实前兆:三通道同步持续抬升
  if (t >= PRECURSOR.start) {
    const p = Math.min(1, (t - PRECURSOR.start) / (PRECURSOR.cross - PRECURSOR.start));
    const ramp = p * p * (3 - 2 * p);                      // smoothstep
    vib += ramp * 46 + ramp * gauss() * 6;                 // 持续震颤
    gas += ramp * 52 + ramp * gauss() * 4;
    inf += ramp * 40 + ramp * Math.sin(t * 2.1) * 8;       // 次声脉冲
  }

  // 传感器平滑(惯性)
  S.sig.vib = smooth(S.sig.vib, clamp(vib, 0, 100), 0.35);
  S.sig.gas = smooth(S.sig.gas, clamp(gas, 0, 100), 0.35);
  S.sig.inf = smooth(S.sig.inf, clamp(inf, 0, 100), 0.35);

  // 加权风险
  const wSum = S.w.vib + S.w.gas + S.w.inf;
  S.risk = wSum > 0
    ? (S.w.vib * S.sig.vib + S.w.gas * S.sig.gas + S.w.inf * S.sig.inf) / wSum
    : 0;

  S.history.push({ vib: S.sig.vib, gas: S.sig.gas, inf: S.sig.inf, risk: S.risk });
  if (S.history.length > 900) S.history.shift();

  judge(dt);
}

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

// ---------- 判定逻辑 ----------
function judge(dt) {
  const inWindow = S.min >= PRECURSOR.cross && S.min <= PRECURSOR.end;

  // 告警需持续 2 游戏分钟,带 5 点回差
  if (!S.alarm && S.risk > S.thr) {
    S.alarmHold += dt;
    if (S.alarmHold >= 2) {
      S.alarm = true;
      if (inWindow) {
        if (S.correctAlarmMin === null) {
          S.correctAlarmMin = S.min;
          S.statGood++;
          addLog(`预警触发!风险 ${S.risk.toFixed(0)} > 阈值 ${S.thr} —— 判定为真实前兆 ✔`, "ok");
          alarmBeep();
        }
      } else {
        S.statFalse++;
        addLog(`误报!风险 ${S.risk.toFixed(0)} 越限,但无真实前兆特征 ✘`, "warn");
        faultBeep();
      }
      updateAlarmUI();
    }
  } else if (S.alarm && S.risk < S.thr - 5) {
    S.alarm = false; S.alarmHold = 0;
    addLog(`风险回落至 ${S.risk.toFixed(0)},预警解除`, "");
    updateAlarmUI();
  } else if (!S.alarm) {
    S.alarmHold = Math.max(0, S.alarmHold - dt);
  }

  // 错过喷发:前兆窗口结束仍无正确预警
  if (S.min > PRECURSOR.end && S.correctAlarmMin === null && S.statMiss === 0) {
    S.statMiss++;
    addLog(`喷发前兆窗口已过,未发布预警 —— 记为错过 ✘`, "warn");
  }

  // 定时观察记录(每 15 游戏分钟)
  if (S.min - (S.lastObs || 0) >= 15) {
    S.lastObs = S.min;
    addLog(`观察记录:振动 ${S.sig.vib.toFixed(0)} / 气体 ${S.sig.gas.toFixed(0)} / 次声 ${S.sig.inf.toFixed(0)} / 风险 ${S.risk.toFixed(0)}`, "");
    if (S.correctAlarmMin !== null && S.min > S.correctAlarmMin) S.logAfterGood++;
  }

  // 完成条件:一次正确预警 + 之后 ≥3 条后续观察记录
  if (!S.finished && S.correctAlarmMin !== null && S.logAfterGood >= 3) {
    finish(true);
  }
  if (!S.finished && S.min >= TOTAL_MIN) {
    finish(S.correctAlarmMin !== null && S.logAfterGood >= 3);
  }
}

function finish(win) {
  S.finished = true; S.running = false;
  const el = document.getElementById("result");
  el.classList.remove("hidden");
  if (win) {
    el.className = "win";
    el.textContent = `✔ 任务完成:于 T+${fmt(S.correctAlarmMin)} 正确预警,后续观察记录 ${S.logAfterGood} 条,误报 ${S.statFalse} 次`;
    addLog("任务完成 —— 预警有效,观察记录已归档", "ok");
  } else {
    el.className = "lose";
    el.textContent = S.statMiss > 0
      ? "✘ 任务失败:错过喷发前兆,未发布有效预警"
      : "✘ 任务失败:观察记录不足,无法确认预警有效性";
    addLog("任务失败", "warn");
  }
  updateStats();
}

function fmt(min) {
  const h = Math.floor(min / 60), m = Math.floor(min % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function addLog(msg, cls) {
  S.log.push({ t: S.min, msg, cls });
  const box = document.getElementById("log");
  const div = document.createElement("div");
  div.innerHTML = `<span class="t">[T+${fmt(S.min)}]</span><span class="${cls || ""}">${msg}</span>`;
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}

// ---------- 波形渲染 ----------
const waveCv = document.getElementById("waveCanvas");
const waveCtx = waveCv.getContext("2d");

function drawWave() {
  const W = waveCv.width, H = waveCv.height;
  waveCtx.fillStyle = "#0a0e14";
  waveCtx.fillRect(0, 0, W, H);

  // 网格
  waveCtx.strokeStyle = "#1c2330"; waveCtx.lineWidth = 1;
  for (let y = 0; y <= 100; y += 25) {
    waveCtx.beginPath();
    waveCtx.moveTo(0, H - (y / 100) * H);
    waveCtx.lineTo(W, H - (y / 100) * H);
    waveCtx.stroke();
  }

  // 阈值虚线
  const ty = H - (S.thr / 100) * H;
  waveCtx.strokeStyle = "#d2a8ff"; waveCtx.setLineDash([6, 5]);
  waveCtx.beginPath(); waveCtx.moveTo(0, ty); waveCtx.lineTo(W, ty); waveCtx.stroke();
  waveCtx.setLineDash([]);

  const h = S.history, n = h.length;
  if (n < 2) return;
  const series = [
    ["vib", "#ffa657"], ["gas", "#7ee787"], ["inf", "#79c0ff"], ["risk", "#ff7b72"],
  ];
  for (const [key, color] of series) {
    waveCtx.strokeStyle = color;
    waveCtx.lineWidth = key === "risk" ? 2 : 1.2;
    waveCtx.beginPath();
    for (let i = 0; i < n; i++) {
      const x = (i / 900) * W;
      const y = H - (h[i][key] / 100) * H;
      i === 0 ? waveCtx.moveTo(x, y) : waveCtx.lineTo(x, y);
    }
    waveCtx.stroke();
  }
  waveCtx.lineWidth = 1;
}

// ---------- 火山剖面 + 风险带 ----------
const volCv = document.getElementById("volcanoCanvas");
const volCtx = volCv.getContext("2d");

function drawVolcano() {
  const W = volCv.width, H = volCv.height;
  const r = S.risk / 100;
  // 背景随风险变色
  const g = volCtx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, `rgb(${10 + r * 60},${14 - r * 4},${20 - r * 8})`);
  g.addColorStop(1, "#0a0e14");
  volCtx.fillStyle = g; volCtx.fillRect(0, 0, W, H);

  const cx = W * 0.42, base = H - 24, peak = 46;
  // 山体
  volCtx.fillStyle = "#2a2f3a";
  volCtx.beginPath();
  volCtx.moveTo(cx - 150, base); volCtx.lineTo(cx - 16, peak);
  volCtx.lineTo(cx + 16, peak); volCtx.lineTo(cx + 150, base);
  volCtx.closePath(); volCtx.fill();
  // 火山口
  volCtx.fillStyle = "#161a22";
  volCtx.fillRect(cx - 16, peak - 4, 32, 8);
  // 岩浆房
  const glow = 0.3 + r * 0.7;
  volCtx.fillStyle = `rgba(255,${Math.floor(90 - r * 50)},40,${glow})`;
  volCtx.beginPath();
  volCtx.ellipse(cx, base - 26, 52, 20, 0, 0, Math.PI * 2);
  volCtx.fill();
  // 岩浆通道:随风险上升
  const magmaTop = base - 26 - r * (base - 26 - peak - 6);
  volCtx.fillStyle = `rgba(255,${Math.floor(110 - r * 60)},30,${0.35 + r * 0.65})`;
  volCtx.fillRect(cx - 5, magmaTop, 10, base - 26 - magmaTop);
  if (r > 0.55) { // 高风险:火山口微光
    volCtx.fillStyle = `rgba(255,120,40,${(r - 0.55) * 1.4})`;
    volCtx.beginPath();
    volCtx.ellipse(cx, peak - 4, 14 + r * 8, 5 + r * 4, 0, 0, Math.PI * 2);
    volCtx.fill();
  }

  // 右侧风险带
  const bx = W - 34, bw = 18, bh = H - 40, by = 20;
  const bg = volCtx.createLinearGradient(0, by + bh, 0, by);
  bg.addColorStop(0, "#2ea043"); bg.addColorStop(0.55, "#d29922"); bg.addColorStop(1, "#f85149");
  volCtx.fillStyle = "#1c2330"; volCtx.fillRect(bx, by, bw, bh);
  volCtx.fillStyle = bg;
  volCtx.fillRect(bx, by + bh - (S.risk / 100) * bh, bw, (S.risk / 100) * bh);
  // 阈值刻度
  const tyy = by + bh - (S.thr / 100) * bh;
  volCtx.strokeStyle = "#d2a8ff"; volCtx.lineWidth = 2;
  volCtx.beginPath(); volCtx.moveTo(bx - 4, tyy); volCtx.lineTo(bx + bw + 4, tyy); volCtx.stroke();
  volCtx.lineWidth = 1;
  volCtx.fillStyle = "#8b949e"; volCtx.font = "10px monospace";
  volCtx.fillText("风险", bx - 2, by - 6);
}

// ---------- 低沉设备音 ----------
let audioCtx = null, humNode = null, soundOn = false;
function ensureAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === "suspended") audioCtx.resume();
}
function toggleSound() {
  ensureAudio();
  soundOn = !soundOn;
  document.getElementById("btnSound").textContent = soundOn ? "🔈 设备音" : "🔇 设备音";
  if (soundOn && !humNode) {
    humNode = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    humNode.type = "sine"; humNode.frequency.value = 55;   // 低频设备嗡鸣
    gain.gain.value = 0.04;
    humNode.connect(gain).connect(audioCtx.destination);
    humNode.start();
    humNode._gain = gain;
  }
  if (humNode) humNode._gain.gain.value = soundOn ? 0.04 : 0;
}
function blip(freq, dur, vol) {
  if (!soundOn || !audioCtx) return;
  const o = audioCtx.createOscillator(), g = audioCtx.createGain();
  o.type = "sine"; o.frequency.value = freq;
  g.gain.setValueAtTime(vol, audioCtx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
  o.connect(g).connect(audioCtx.destination);
  o.start(); o.stop(audioCtx.currentTime + dur);
}
function alarmBeep() { blip(110, 0.5, 0.12); setTimeout(() => blip(110, 0.5, 0.12), 600); }
function faultBeep() { blip(70, 0.4, 0.1); }

// ---------- UI ----------
function bind(id, fn) { document.getElementById(id).addEventListener("input", fn); }
bind("wVib", e => { S.w.vib = +e.target.value; document.getElementById("wVibVal").textContent = S.w.vib.toFixed(1); });
bind("wGas", e => { S.w.gas = +e.target.value; document.getElementById("wGasVal").textContent = S.w.gas.toFixed(1); });
bind("wInf", e => { S.w.inf = +e.target.value; document.getElementById("wInfVal").textContent = S.w.inf.toFixed(1); });
bind("thr", e => {
  S.thr = +e.target.value;
  document.getElementById("thrVal").textContent = S.thr;
  document.getElementById("thrVal2").textContent = S.thr;
});

document.getElementById("btnStart").addEventListener("click", () => {
  if (S.finished) return;
  S.running = !S.running;
  document.getElementById("btnStart").textContent = S.running ? "⏸ 暂停" : "▶ 继续监测";
});
document.getElementById("btnSpeed").addEventListener("click", () => {
  S.speed = S.speed >= 16 ? 1 : S.speed * 4;
  document.getElementById("btnSpeed").textContent = `速度 ×${S.speed}`;
});
document.getElementById("btnSound").addEventListener("click", toggleSound);

function updateAlarmUI() {
  document.getElementById("alarmBanner").classList.toggle("hidden", !S.alarm);
}
function updateStats() {
  document.getElementById("statFalse").textContent = S.statFalse;
  document.getElementById("statMiss").textContent = S.statMiss;
  document.getElementById("statGood").textContent = S.statGood;
}

// ---------- 主循环 ----------
const DT_MIN = 0.4;                 // 每步推进的游戏分钟;1 现实秒 = speed 游戏分钟
let lastTs = 0, acc = 0;
function loop(ts) {
  requestAnimationFrame(loop);
  const dtReal = Math.min(0.1, (ts - lastTs) / 1000 || 0);
  lastTs = ts;
  if (S.running && !S.finished) {
    acc += dtReal * S.speed;        // 1 现实秒 = speed 游戏分钟
    while (acc >= DT_MIN) { step(DT_MIN); acc -= DT_MIN; }
    document.getElementById("clock").textContent = `T+${fmt(S.min)} / 06:00`;
    document.getElementById("riskVal").textContent = S.risk.toFixed(0);
    updateStats();
  }
  drawWave();
  drawVolcano();
}

addLog("监测站就绪:校准传感器权重与阈值,识别真实喷发前兆", "");
addLog("提示:车辆噪声为振动+次声短促尖峰;设备故障仅影响单一通道", "evt");
if (params.get("speed")) S.speed = clamp(parseInt(params.get("speed"), 10) || 1, 1, 64);
document.getElementById("btnSpeed").textContent = `速度 ×${S.speed}`;
requestAnimationFrame(loop);

// 测试钩子
window.__game = S;
