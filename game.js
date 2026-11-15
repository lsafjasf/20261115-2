"use strict";

// ===== 参数（可用 URL 参数覆盖，便于测试） =====
const params = new URLSearchParams(location.search);
const CFG = {
  windowGameSec: 600,                       // 检修窗口：10 分钟（游戏秒）
  timeScale: Number(params.get("scale")) || 10, // 游戏秒 / 真实秒
  trackLength: 3000,                        // 隧道总长（单位）
  exitX: 2880,                              // 出口位置
  maxSpeed: 70,                             // 单位 / 游戏秒
  accel: 55,
  brake: 140,
  drag: 12,
  zoneHalf: 70,                             // 检测区半径
  inspectTime: 14,                          // 基础检查耗时（游戏秒）
  toolTime: 22,                             // 工具处理额外耗时（游戏秒）
  alarmBefore: 60,                          // 剩余多少游戏秒时拉警报
};

const CHECKPOINTS = [
  { id: 0, x: 800,  name: "1号 信号机" },
  { id: 1, x: 1550, name: "2号 接触网" },
  { id: 2, x: 2250, name: "3号 排水泵" },
];

// 故障点：?faults=0,2 指定；默认随机
function pickFaults() {
  const q = params.get("faults");
  if (q !== null && q !== "") {
    return new Set(q.split(",").map(Number).filter(n => n >= 0 && n < 3));
  }
  if (q === "") return new Set();
  const s = new Set();
  CHECKPOINTS.forEach(c => { if (Math.random() < 0.5) s.add(c.id); });
  return s;
}

// ===== 游戏状态 =====
const state = {
  phase: "ready",          // ready | running | success | fail
  failReason: "",
  timeLeft: CFG.windowGameSec,
  car: { x: 60, v: 0 },
  faults: pickFaults(),
  cps: CHECKPOINTS.map(c => ({
    ...c, status: "pending",   // pending | inspecting | tooling | done
    progress: 0,               // 0..1（检查阶段）
    toolProgress: 0,           // 0..1（工具阶段）
    hasFault: false,
  })),
  keys: {},
  startedAt: 0,
};

function currentCp() {
  return state.cps.find(c => c.status !== "done") || null;
}

// ===== 输入 =====
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

window.addEventListener("keydown", e => {
  if (["ArrowRight", "ArrowLeft", "Space"].includes(e.code)) e.preventDefault();
  state.keys[e.code] = true;
  AudioSys.ensure();
  if (state.phase === "ready") startRun();
  if ((state.phase === "success" || state.phase === "fail") && e.code === "KeyR") resetRun();
});
window.addEventListener("keyup", e => { state.keys[e.code] = false; });

function startRun() {
  state.phase = "running";
  AudioSys.startAmbience();
}

function resetRun() {
  state.phase = "ready";
  state.failReason = "";
  state.timeLeft = CFG.windowGameSec;
  state.car.x = 60;
  state.car.v = 0;
  state.faults = pickFaults();
  state.cps.forEach(c => {
    c.status = "pending";
    c.progress = 0;
    c.toolProgress = 0;
    c.hasFault = state.faults.has(c.id);
  });
  AudioSys.stopAll();
}
state.cps.forEach(c => { c.hasFault = state.faults.has(c.id); });

// ===== Web Audio：轮轨 / 警报 / 工具 =====
const AudioSys = {
  ctx: null,
  master: null,
  rumbleGain: null,
  rumbleSrc: null,
  clackTimer: 0,
  alarmTimer: 0,
  toolOsc: null,
  toolGain: null,

  ensure() {
    if (this.ctx) { if (this.ctx.state === "suspended") this.ctx.resume(); return; }
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) { return; }
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
  },

  startAmbience() {
    if (!this.ctx || this.rumbleSrc) return;
    // 轮轨噪声：循环噪声 -> 低通 -> 增益随速度变化
    const len = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 320;
    const g = this.ctx.createGain();
    g.gain.value = 0;
    src.connect(lp).connect(g).connect(this.master);
    src.start();
    this.rumbleSrc = src;
    this.rumbleGain = g;
  },

  // 钢轨接缝“咔哒”声，频率随车速
  updateClacks(dtReal, speed) {
    if (!this.ctx || state.phase !== "running") return;
    if (speed < 3) return;
    this.clackTimer -= dtReal;
    const interval = 90 / (speed * CFG.timeScale); // 游戏速度换算到真实间隔
    if (this.clackTimer <= 0) {
      this.clackTimer = Math.max(0.08, interval);
      this.clack();
      setTimeout(() => this.clack(), 90); // 转向架双轴：第二声
    }
  },

  clack() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = "triangle";
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(60, t + 0.06);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.25, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 0.1);
  },

  // 倒计时警报
  updateAlarm(dtReal) {
    if (!this.ctx || state.phase !== "running") return;
    if (state.timeLeft > CFG.alarmBefore) return;
    this.alarmTimer -= dtReal;
    if (this.alarmTimer <= 0) {
      this.alarmTimer = 1.0;
      this.beep(880, 0.12, 0.18);
      setTimeout(() => this.beep(880, 0.12, 0.18), 220);
    }
  },

  beep(freq, dur, vol) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = "square";
    o.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  },

  setToolActive(on) {
    if (!this.ctx) return;
    if (on && !this.toolOsc) {
      const o = this.ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = 95;
      const g = this.ctx.createGain();
      g.gain.value = 0.07;
      const lfo = this.ctx.createOscillator();
      lfo.frequency.value = 13;
      const lg = this.ctx.createGain();
      lg.gain.value = 0.05;
      lfo.connect(lg).connect(g.gain);
      o.connect(g).connect(this.master);
      o.start();
      lfo.start();
      this.toolOsc = o;
      this.toolLfo = lfo;
      this.toolGain = g;
    } else if (!on && this.toolOsc) {
      this.toolOsc.stop();
      this.toolLfo.stop();
      this.toolOsc = null;
    }
  },

  jingle(win) {
    if (!this.ctx) return;
    const notes = win ? [523, 659, 784, 1047] : [392, 330, 262, 196];
    notes.forEach((f, i) => setTimeout(() => this.beep(f, 0.25, 0.2), i * 180));
  },

  updateRumble(speed) {
    if (!this.ctx || !this.rumbleGain) return;
    const target = state.phase === "running" ? Math.min(0.35, speed / CFG.maxSpeed * 0.35) : 0;
    this.rumbleGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.1);
  },

  stopAll() {
    if (this.rumbleSrc) { try { this.rumbleSrc.stop(); } catch (e) {} this.rumbleSrc = null; }
    this.setToolActive(false);
  },
};

// ===== 游戏逻辑 =====
function update(dtReal) {
  const dt = dtReal * CFG.timeScale; // 游戏秒
  if (state.phase !== "running") {
    AudioSys.updateRumble(0);
    return;
  }

  // 倒计时
  state.timeLeft -= dt;
  if (state.timeLeft <= 0) {
    state.timeLeft = 0;
    endRun(false, "末班前列车恢复通行，巡检车未能退出隧道");
    return;
  }

  const car = state.car;
  const cp = currentCp();
  const inZone = cp && Math.abs(car.x - cp.x) <= CFG.zoneHalf;
  const stopped = Math.abs(car.v) < 2;
  const busy = cp && (cp.status === "inspecting" || cp.status === "tooling") && inZone;

  // 车辆运动：只能前进，不能倒车
  if (!busy) {
    if (state.keys.ArrowRight || state.keys.KeyD) {
      car.v = Math.min(CFG.maxSpeed, car.v + CFG.accel * dt);
    } else if (state.keys.Space) {
      car.v = Math.max(0, car.v - CFG.brake * dt);
    } else {
      car.v = Math.max(0, car.v - CFG.drag * dt);
    }
  } else {
    car.v = 0;
  }
  car.x += car.v * dt;
  if (car.x < 0) car.x = 0;

  // 检查点逻辑
  if (cp) {
    if (cp.status === "pending" && inZone && stopped && state.keys.KeyE) {
      cp.status = "inspecting";
      AudioSys.beep(660, 0.1, 0.15);
    }
    if (cp.status === "inspecting") {
      if (!inZone) { cp.status = "pending"; cp.progress = 0; } // 开出区域，重来
      else {
        cp.progress += dt / CFG.inspectTime;
        if (cp.progress >= 1) {
          if (cp.hasFault) {
            cp.status = "tooling";
            AudioSys.beep(440, 0.3, 0.2); // 发现故障提示
          } else {
            cp.status = "done";
            AudioSys.beep(990, 0.15, 0.18);
          }
        }
      }
    }
    if (cp.status === "tooling") {
      if (!inZone) { AudioSys.setToolActive(false); }
      else if (state.keys.KeyT) {
        AudioSys.setToolActive(true);
        cp.toolProgress += dt / CFG.toolTime;
        if (cp.toolProgress >= 1) {
          cp.status = "done";
          AudioSys.setToolActive(false);
          AudioSys.beep(990, 0.15, 0.18);
        }
      } else {
        AudioSys.setToolActive(false);
      }
    }
    if (cp.status !== "tooling") AudioSys.setToolActive(false);
  }

  // 出口判定
  if (car.x >= CFG.exitX) {
    const allDone = state.cps.every(c => c.status === "done");
    if (allDone) endRun(true, "");
    else endRun(false, "存在漏检设备，巡检车不得驶出");
    return;
  }

  AudioSys.updateRumble(car.v);
  AudioSys.updateClacks(dtReal, car.v);
  AudioSys.updateAlarm(dtReal);
}

function endRun(win, reason) {
  state.phase = win ? "success" : "fail";
  state.failReason = reason;
  state.car.v = 0;
  AudioSys.setToolActive(false);
  AudioSys.updateRumble(0);
  AudioSys.jingle(win);
}

// ===== 渲染 =====
const W = canvas.width, H = canvas.height;
const VIEW = { y: 300, railY: 430 }; // 主视图基线

function worldToScreen(x, camX) { return 120 + (x - camX) * 0.9; }

function draw() {
  const car = state.car;
  const camX = Math.max(0, Math.min(CFG.trackLength - 1000, car.x - 320));

  ctx.clearRect(0, 0, W, H);

  // 夜空与洞外
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, "#060a14");
  sky.addColorStop(1, "#0a1020");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  drawTunnel(camX);
  drawCheckpoints(camX);
  drawExit(camX);
  drawCar(camX);
  drawHud(camX);

  if (state.phase === "ready") drawOverlay("夜间检修窗口 · 10 分钟", "按任意键开始 —— 依次完成三处设备检查，并在末班前列车恢复前驶出隧道", "#ffd166");
  if (state.phase === "success") drawOverlay("巡检完成 ✓", "三处设备全部合格，巡检车已按时退出隧道。按 R 再来一局", "#7CFC98");
  if (state.phase === "fail") drawOverlay("任务失败 ✗", state.failReason + "。按 R 重试", "#ff6b6b");
}

function drawTunnel(camX) {
  // 隧道剖面：拱形衬砌
  const x0 = worldToScreen(camX, camX), x1 = worldToScreen(camX + 1100, camX);
  ctx.fillStyle = "#101827";
  ctx.beginPath();
  ctx.moveTo(x0, VIEW.railY + 26);
  ctx.lineTo(x0, VIEW.y - 40);
  ctx.quadraticCurveTo(W / 2, VIEW.y - 170, x1, VIEW.y - 40);
  ctx.lineTo(x1, VIEW.railY + 26);
  ctx.closePath();
  ctx.fill();

  // 衬砌环缝
  ctx.strokeStyle = "rgba(120,150,190,0.12)";
  ctx.lineWidth = 2;
  for (let wx = Math.floor(camX / 200) * 200; wx < camX + 1200; wx += 200) {
    const sx = worldToScreen(wx, camX);
    ctx.beginPath();
    ctx.moveTo(sx, VIEW.railY + 26);
    ctx.lineTo(sx, VIEW.y - 30);
    ctx.stroke();
  }

  // 洞顶照明灯
  for (let wx = Math.floor(camX / 300) * 300; wx < camX + 1200; wx += 300) {
    const sx = worldToScreen(wx + 100, camX);
    ctx.fillStyle = "rgba(255,220,140,0.9)";
    ctx.beginPath();
    ctx.arc(sx, VIEW.y - 78, 4, 0, Math.PI * 2);
    ctx.fill();
    const glow = ctx.createRadialGradient(sx, VIEW.y - 78, 2, sx, VIEW.y - 78, 46);
    glow.addColorStop(0, "rgba(255,220,140,0.20)");
    glow.addColorStop(1, "rgba(255,220,140,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(sx - 46, VIEW.y - 124, 92, 92);
  }

  // 道床与钢轨
  ctx.fillStyle = "#1a2334";
  ctx.fillRect(0, VIEW.railY + 10, W, 26);
  ctx.strokeStyle = "#8a97a8";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, VIEW.railY + 6);
  ctx.lineTo(W, VIEW.railY + 6);
  ctx.stroke();
  // 轨枕
  ctx.strokeStyle = "#2c3a50";
  ctx.lineWidth = 4;
  for (let wx = Math.floor(camX / 40) * 40; wx < camX + 1200; wx += 40) {
    const sx = worldToScreen(wx, camX);
    ctx.beginPath();
    ctx.moveTo(sx, VIEW.railY + 8);
    ctx.lineTo(sx, VIEW.railY + 18);
    ctx.stroke();
  }
}

function drawCheckpoints(camX) {
  state.cps.forEach(cp => {
    const sx = worldToScreen(cp.x, camX);
    if (sx < -80 || sx > W + 80) return;
    // 检测区地面标记
    const zx0 = worldToScreen(cp.x - CFG.zoneHalf, camX);
    const zx1 = worldToScreen(cp.x + CFG.zoneHalf, camX);
    ctx.fillStyle = cp.status === "done" ? "rgba(80,220,130,0.10)" : "rgba(255,209,102,0.12)";
    ctx.fillRect(zx0, VIEW.railY - 2, zx1 - zx0, 8);

    // 设备箱
    ctx.fillStyle = cp.status === "done" ? "#1f4d33" : "#3a3f2a";
    ctx.fillRect(sx - 16, VIEW.railY - 66, 32, 60);
    ctx.strokeStyle = "#556";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(sx - 16, VIEW.railY - 66, 32, 60);
    // 状态灯
    const lamp = cp.status === "done" ? "#4ade80"
      : (cp.status === "tooling" || cp.status === "inspecting") ? "#ffd166" : "#ef4444";
    ctx.fillStyle = lamp;
    ctx.beginPath();
    ctx.arc(sx, VIEW.railY - 56, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#9fb2c8";
    ctx.font = "12px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(cp.name, sx, VIEW.railY - 76);

    // 进度条
    if (cp.status === "inspecting" || cp.status === "tooling") {
      const p = cp.status === "inspecting" ? cp.progress : cp.toolProgress;
      ctx.fillStyle = "#222";
      ctx.fillRect(sx - 30, VIEW.railY - 100, 60, 7);
      ctx.fillStyle = cp.status === "inspecting" ? "#ffd166" : "#f97316";
      ctx.fillRect(sx - 30, VIEW.railY - 100, 60 * Math.min(1, p), 7);
      ctx.fillStyle = "#cfd8e3";
      ctx.font = "11px sans-serif";
      ctx.fillText(cp.status === "inspecting" ? "检查中…" : "故障！按住 T 使用工具", sx, VIEW.railY - 108);
    } else if (cp.status === "done") {
      ctx.fillStyle = "#4ade80";
      ctx.font = "12px sans-serif";
      ctx.fillText("合格 ✓", sx, VIEW.railY - 90);
    }
  });
}

function drawExit(camX) {
  const sx = worldToScreen(CFG.exitX, camX);
  if (sx < -60 || sx > W + 200) return;
  // 洞口亮光
  const g = ctx.createLinearGradient(sx, 0, sx + 140, 0);
  g.addColorStop(0, "rgba(160,200,255,0.35)");
  g.addColorStop(1, "rgba(160,200,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(sx, VIEW.y - 120, 140, VIEW.railY - VIEW.y + 150);
  ctx.strokeStyle = "#7ea4d6";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(sx, VIEW.railY + 20);
  ctx.lineTo(sx, VIEW.y - 90);
  ctx.stroke();
  ctx.fillStyle = "#9fc1ec";
  ctx.font = "13px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("出 口", sx + 30, VIEW.y - 96);
}

function drawCar(camX) {
  const car = state.car;
  const sx = worldToScreen(car.x, camX);
  const y = VIEW.railY;

  // 前照灯光锥
  const beam = ctx.createLinearGradient(sx + 30, 0, sx + 260, 0);
  beam.addColorStop(0, "rgba(255,240,180,0.30)");
  beam.addColorStop(1, "rgba(255,240,180,0)");
  ctx.fillStyle = beam;
  ctx.beginPath();
  ctx.moveTo(sx + 28, y - 34);
  ctx.lineTo(sx + 260, y - 60);
  ctx.lineTo(sx + 260, y + 2);
  ctx.lineTo(sx + 28, y - 10);
  ctx.closePath();
  ctx.fill();

  // 车体
  ctx.fillStyle = "#d8a13a";
  ctx.fillRect(sx - 42, y - 46, 84, 34);
  ctx.fillStyle = "#b5822a";
  ctx.fillRect(sx - 42, y - 20, 84, 8);
  // 驾驶室
  ctx.fillStyle = "#274058";
  ctx.fillRect(sx + 6, y - 62, 30, 18);
  ctx.fillStyle = "#9fd8ff";
  ctx.fillRect(sx + 10, y - 58, 22, 10);
  // 警示灯（闪烁）
  if (Math.floor(performance.now() / 300) % 2 === 0) {
    ctx.fillStyle = "#ff8c42";
    ctx.beginPath();
    ctx.arc(sx - 20, y - 50, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  // 车轮
  const rot = (car.x / 14) % (Math.PI * 2);
  [-26, 26].forEach(off => {
    ctx.fillStyle = "#222";
    ctx.beginPath();
    ctx.arc(sx + off, y - 4, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#777";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(sx + off, y - 4);
    ctx.lineTo(sx + off + Math.cos(rot) * 8, y - 4 + Math.sin(rot) * 8);
    ctx.moveTo(sx + off, y - 4);
    ctx.lineTo(sx + off - Math.cos(rot) * 8, y - 4 - Math.sin(rot) * 8);
    ctx.stroke();
  });
}

function drawHud(camX) {
  // 倒计时
  const t = Math.max(0, state.timeLeft);
  const mm = String(Math.floor(t / 60)).padStart(2, "0");
  const ss = String(Math.floor(t % 60)).padStart(2, "0");
  const urgent = t <= CFG.alarmBefore;
  ctx.textAlign = "left";
  ctx.font = "bold 34px monospace";
  ctx.fillStyle = urgent && Math.floor(performance.now() / 400) % 2 === 0 ? "#ff5252" : "#e8f0fa";
  ctx.fillText(`⏱ ${mm}:${ss}`, 24, 48);
  ctx.font = "13px sans-serif";
  ctx.fillStyle = "#7c8aa0";
  ctx.fillText("末班前列车恢复倒计时", 24, 68);

  // 检查点状态
  state.cps.forEach((cp, i) => {
    const x = 24 + i * 150;
    ctx.fillStyle = cp.status === "done" ? "#4ade80" : "#8a97a8";
    ctx.font = "13px sans-serif";
    ctx.fillText(`${cp.status === "done" ? "✓" : "○"} ${cp.name}`, x, 96);
  });

  // 车速
  ctx.fillStyle = "#9fb2c8";
  ctx.font = "13px sans-serif";
  ctx.textAlign = "right";
  ctx.fillText(`速度 ${state.car.v.toFixed(0)} u/s`, W - 24, 40);

  // 隧道进度条（小地图）
  const mx = 24, my = H - 34, mw = W - 48;
  ctx.fillStyle = "#16202f";
  ctx.fillRect(mx, my, mw, 10);
  state.cps.forEach(cp => {
    ctx.fillStyle = cp.status === "done" ? "#4ade80" : "#ffd166";
    ctx.beginPath();
    ctx.arc(mx + (cp.x / CFG.trackLength) * mw, my + 5, 5, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.fillStyle = "#7ea4d6";
  ctx.fillRect(mx + (CFG.exitX / CFG.trackLength) * mw - 2, my - 3, 4, 16);
  // 车辆标记
  ctx.fillStyle = "#ffb347";
  ctx.beginPath();
  ctx.arc(mx + (state.car.x / CFG.trackLength) * mw, my + 5, 6, 0, Math.PI * 2);
  ctx.fill();

  // 操作提示
  const cp = currentCp();
  if (state.phase === "running" && cp) {
    const inZone = Math.abs(state.car.x - cp.x) <= CFG.zoneHalf;
    if (inZone && cp.status === "pending" && Math.abs(state.car.v) < 2) {
      hint(`已到达 ${cp.name}，按 E 开始检查`);
    } else if (cp.status === "tooling") {
      hint("发现故障 —— 按住 T 使用工具处理（停留时间增加）");
    }
  }
}

function hint(text) {
  ctx.textAlign = "center";
  ctx.font = "15px sans-serif";
  ctx.fillStyle = "#ffd166";
  ctx.fillText(text, W / 2, H - 56);
}

function drawOverlay(title, sub, color) {
  ctx.fillStyle = "rgba(4,8,16,0.72)";
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = "center";
  ctx.fillStyle = color;
  ctx.font = "bold 40px sans-serif";
  ctx.fillText(title, W / 2, H / 2 - 20);
  ctx.fillStyle = "#c6d2e0";
  ctx.font = "16px sans-serif";
  ctx.fillText(sub, W / 2, H / 2 + 20);
}

// ===== 主循环 =====
let lastTs = 0;
function loop(ts) {
  const dtReal = Math.min(0.1, (ts - lastTs) / 1000 || 0);
  lastTs = ts;
  update(dtReal);
  draw();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// ===== 测试钩子 =====
window.__game = { state, CFG, CHECKPOINTS, resetRun };
