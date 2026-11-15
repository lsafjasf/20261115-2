/* 前端：Canvas 渲染 + Web Audio + 游戏循环，依赖 sim.js 的 GeothermalSim */
(function () {
  const { createSim } = window.GeothermalSim;

  const cv = document.getElementById('cv');
  const ctx = cv.getContext('2d');
  const ui = {
    load: document.getElementById('rLoad'),
    relief: document.getElementById('rRelief'),
    inj: document.getElementById('rInj'),
    oLoad: document.getElementById('oLoad'),
    oRelief: document.getElementById('oRelief'),
    oInj: document.getElementById('oInj'),
    stats: document.getElementById('stats'),
    msg: document.getElementById('msg'),
    btnStart: document.getElementById('btnStart'),
    btnReset: document.getElementById('btnReset'),
    speed: document.getElementById('speed'),
  };

  let sim = createSim();
  let running = false;
  let histP = [], histT = [];       // 历史曲线
  let particles = [];               // 蒸汽/水粒子
  let lastFrame = 0, acc = 0;

  // ---------- Web Audio：喷流强度驱动 ----------
  let ac = null, jetGain = null, jetFilter = null, alarmOsc = null, alarmGain = null;
  function initAudio() {
    if (ac) return;
    ac = new (window.AudioContext || window.webkitAudioContext)();
    const len = ac.sampleRate * 2;
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ac.createBufferSource();
    src.buffer = buf; src.loop = true;
    jetFilter = ac.createBiquadFilter();
    jetFilter.type = 'bandpass'; jetFilter.frequency.value = 800; jetFilter.Q.value = 0.8;
    jetGain = ac.createGain(); jetGain.gain.value = 0;
    src.connect(jetFilter).connect(jetGain).connect(ac.destination);
    src.start();
    // 超压警报
    alarmOsc = ac.createOscillator();
    alarmOsc.type = 'square'; alarmOsc.frequency.value = 880;
    alarmGain = ac.createGain(); alarmGain.gain.value = 0;
    alarmOsc.connect(alarmGain).connect(ac.destination);
    alarmOsc.start();
  }
  function updateAudio(s) {
    if (!ac) return;
    const flow = s.flows.qTurb + s.flows.qRelief;
    const intensity = Math.min(flow / 30, 1);
    jetGain.gain.setTargetAtTime(intensity * 0.25, ac.currentTime, 0.1);
    jetFilter.frequency.setTargetAtTime(400 + intensity * 1600, ac.currentTime, 0.1);
    const alarm = (!s.shutdown && s.P > sim.cfg.pWarn) ? 0.06 : 0;
    alarmGain.gain.setTargetAtTime(alarm, ac.currentTime, 0.05);
    alarmOsc.frequency.setTargetAtTime(s.P > sim.cfg.pLimit ? 1200 : 880, ac.currentTime, 0.05);
  }

  // ---------- 控制 ----------
  function pushControls() {
    sim.setControls({
      load: ui.load.value / 100,
      relief: ui.relief.value / 100,
      injection: ui.inj.value / 100,
    });
    ui.oLoad.textContent = ui.load.value + '%';
    ui.oRelief.textContent = ui.relief.value + '%';
    ui.oInj.textContent = ui.inj.value + '%';
  }
  ['load', 'relief', 'inj'].forEach(k => ui[k === 'inj' ? 'inj' : k].addEventListener('input', pushControls));

  ui.btnStart.addEventListener('click', () => {
    initAudio();
    if (ac.state === 'suspended') ac.resume();
    running = !running;
    ui.btnStart.textContent = running ? '⏸ 暂停' : '▶ 继续';
    if (sim.state.finished) return;
    setMsg(running ? '模拟进行中…' : '已暂停', 'info');
  });
  ui.btnReset.addEventListener('click', reset);

  function reset() {
    sim = createSim();
    running = false;
    histP = []; histT = []; particles = [];
    ui.load.value = 80; ui.relief.value = 0; ui.inj.value = 0;
    pushControls();
    ui.btnStart.textContent = '▶ 开始';
    setMsg('调节三个阀门，撑过 10 分钟', 'info');
  }

  function setMsg(text, cls) { ui.msg.textContent = text; ui.msg.className = cls; }

  // ---------- 主循环 ----------
  const SIM_DT = 0.25;
  function frame(ts) {
    requestAnimationFrame(frame);
    const dtReal = Math.min((ts - lastFrame) / 1000, 0.1);
    lastFrame = ts;
    if (running && !sim.state.finished) {
      acc += dtReal * Number(ui.speed.value);
      while (acc >= SIM_DT) {
        sim.step(SIM_DT);
        acc -= SIM_DT;
      }
      const s = sim.state;
      if (histP.length === 0 || s.t - histP[histP.length - 1].t >= 1) {
        histP.push({ t: s.t, v: s.P });
        histT.push({ t: s.t, v: s.T });
      }
      spawnParticles(s, dtReal);
      updateAudio(s);
      if (s.shutdown) {
        running = false;
        ui.btnStart.textContent = '▶ 开始';
        setMsg('🚨 超压紧急停机！模拟失败', 'bad');
      } else if (s.finished) {
        running = false;
        ui.btnStart.textContent = '▶ 开始';
        setMsg(s.success ? `✅ 成功！平均功率 ${s.avgPower.toFixed(1)} MW` : '❌ 发电量不足，失败', s.success ? 'ok' : 'bad');
      }
    }
    updateStats();
    draw(ts / 1000);
  }

  // ---------- 粒子 ----------
  function spawnParticles(s, dtReal) {
    const rate = (s.flows.qIn / 25) * 60 * dtReal;
    for (let i = 0; i < rate; i++) {
      particles.push({ x: 200 + Math.random() * 40 - 20, y: 470, vy: -(1 + Math.random()), kind: 'steam' });
    }
    if (s.flows.qRelief > 0.5) {
      const r = (s.flows.qRelief / 20) * 80 * dtReal;
      for (let i = 0; i < r; i++) {
        particles.push({ x: 320, y: 130, vx: 2 + Math.random() * 2, vy: -0.5, kind: 'vent' });
      }
    }
    if (s.flows.qWater > 0.3) {
      const w = (s.flows.qWater / 10) * 40 * dtReal;
      for (let i = 0; i < w; i++) {
        particles.push({ x: 120 + Math.random() * 8, y: 140, vy: 1.5 + Math.random(), kind: 'water' });
      }
    }
    if (particles.length > 600) particles.splice(0, particles.length - 600);
  }

  // ---------- 状态栏 ----------
  function fmtTime(t) {
    const m = Math.floor(t / 60), s = Math.floor(t % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  }
  function updateStats() {
    const s = sim.state;
    const pCls = s.P > sim.cfg.pLimit ? 'danger' : s.P > sim.cfg.pWarn ? 'warn' : '';
    ui.stats.innerHTML =
      `⏱ 剩余时间 <b>${fmtTime(Math.max(0, sim.cfg.duration - s.t))}</b><br>` +
      `🧭 井口压力 <b class="${pCls}">${s.P.toFixed(2)} MPa</b> / 上限 ${sim.cfg.pLimit}<br>` +
      `🌡 蒸汽温度 <b>${s.T.toFixed(1)} °C</b><br>` +
      `⚡ 当前功率 <b>${s.power.toFixed(1)} MW</b>（均值 ${s.avgPower.toFixed(1)}）<br>` +
      `🔋 累计发电 <b>${s.energy.toFixed(2)} MWh</b>` +
      (s.surgeActive > 0 ? '<br><span class="warn">⚠ 检测到蒸汽涌浪！</span>' : '') +
      (s.overTimer > 0.5 ? `<br><span class="danger">⚠ 超压 ${s.overTimer.toFixed(1)}s / ${sim.cfg.overpressureGrace}s</span>` : '');
  }

  // ---------- 绘制 ----------
  function draw(now) {
    const s = sim.state;
    ctx.clearRect(0, 0, cv.width, cv.height);

    // 地层
    const grad = ctx.createLinearGradient(0, 380, 0, 560);
    grad.addColorStop(0, '#1a1410'); grad.addColorStop(1, '#3a1f0d');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 380, cv.width, 180);
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, cv.width, 380);
    ctx.strokeStyle = '#4a3220';
    ctx.beginPath(); ctx.moveTo(0, 380); ctx.lineTo(cv.width, 380); ctx.stroke();
    // 热储
    ctx.fillStyle = `rgba(255,${Math.floor(80 + s.T / 3)},40,0.25)`;
    ctx.beginPath(); ctx.ellipse(200, 500, 150, 45, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ff9a5f'; ctx.font = '12px sans-serif';
    ctx.fillText('热储', 260, 505);

    // 井筒
    ctx.fillStyle = '#2a3546';
    ctx.fillRect(178, 120, 44, 360);
    ctx.fillStyle = '#10161f';
    ctx.fillRect(186, 120, 28, 360);
    // 井筒内蒸汽柱（颜色随温度）
    const heat = Math.min((s.T - 150) / 120, 1);
    ctx.fillStyle = `rgba(255,${Math.floor(200 - heat * 80)},${Math.floor(255 - heat * 200)},${0.15 + heat * 0.25})`;
    ctx.fillRect(186, 120, 28, 360);

    // 注水管
    ctx.fillStyle = '#2a3546'; ctx.fillRect(112, 120, 16, 300);
    ctx.fillStyle = '#1d4ed8';
    const wh = s.flows.qWater / 10 * 300;
    ctx.fillRect(114, 120, 12, wh);
    ctx.fillStyle = '#7fb8ff'; ctx.font = '11px sans-serif';
    ctx.fillText('注水', 108, 112);

    // 井口装置
    ctx.fillStyle = '#3b475c'; ctx.fillRect(160, 96, 80, 26);
    // 涡轮（右侧）
    ctx.fillStyle = '#3b475c'; ctx.fillRect(240, 108, 70, 44);
    ctx.save();
    ctx.translate(275, 130);
    ctx.rotate(now * s.flows.qTurb * 0.3);
    ctx.strokeStyle = '#7fd4ff'; ctx.lineWidth = 3;
    for (let i = 0; i < 3; i++) {
      ctx.rotate(Math.PI * 2 / 3);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 14); ctx.stroke();
    }
    ctx.restore();
    ctx.fillStyle = '#9fb2c8'; ctx.font = '11px sans-serif';
    ctx.fillText('涡轮', 262, 168);
    // 泄压阀（左侧支管）
    ctx.fillStyle = '#3b475c'; ctx.fillRect(320, 122, 46, 14);
    ctx.fillStyle = s.actual.relief > 0.02 ? '#ffb454' : '#5a6a82';
    ctx.beginPath(); ctx.arc(332, 129, 8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#9fb2c8';
    ctx.fillText('泄压阀', 330, 112);

    // 粒子
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      if (p.kind === 'steam') {
        p.y += p.vy * (1 + s.flows.qIn / 20);
        if (p.y < 128) { p.y = 128; }
        if (p.y <= 128 && Math.random() < 0.02) particles.splice(i, 1);
        ctx.fillStyle = 'rgba(200,230,255,0.5)';
        ctx.fillRect(p.x, p.y, 2.5, 2.5);
      } else if (p.kind === 'vent') {
        p.x += p.vx; p.y += p.vy; p.vy -= 0.02;
        if (p.x > cv.width) { particles.splice(i, 1); continue; }
        ctx.fillStyle = 'rgba(255,220,180,0.6)';
        ctx.fillRect(p.x, p.y, 3, 3);
      } else {
        p.y += p.vy;
        if (p.y > 420) { particles.splice(i, 1); continue; }
        ctx.fillStyle = 'rgba(90,150,255,0.7)';
        ctx.fillRect(p.x, p.y, 2.5, 2.5);
      }
    }

    drawGauges(s, now);
    drawCharts(s);
  }

  // 压力表 + 温度/功率条
  function drawGauges(s, now) {
    const cx = 480, cy = 130, r = 62;
    const pMin = 0, pMax = 14;
    const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;
    const toAng = p => a0 + (p - pMin) / (pMax - pMin) * (a1 - a0);
    ctx.lineWidth = 10;
    ctx.strokeStyle = '#223041';
    ctx.beginPath(); ctx.arc(cx, cy, r, a0, a1); ctx.stroke();
    // 警戒区
    ctx.strokeStyle = '#ffb454';
    ctx.beginPath(); ctx.arc(cx, cy, r, toAng(sim.cfg.pWarn), toAng(sim.cfg.pLimit)); ctx.stroke();
    ctx.strokeStyle = '#ff5f5f';
    ctx.beginPath(); ctx.arc(cx, cy, r, toAng(sim.cfg.pLimit), a1); ctx.stroke();
    // 指针（超压时抖动）
    const jitter = s.P > sim.cfg.pWarn ? Math.sin(now * 40) * 0.01 : 0;
    const ang = toAng(Math.min(s.P, pMax)) + jitter;
    ctx.strokeStyle = s.P > sim.cfg.pLimit ? '#ff5f5f' : '#7fd4ff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(ang) * (r - 12), cy + Math.sin(ang) * (r - 12));
    ctx.stroke();
    ctx.fillStyle = '#d7e0ea'; ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${s.P.toFixed(1)} MPa`, cx, cy + 34);
    ctx.font = '11px sans-serif'; ctx.fillStyle = '#8b98ab';
    ctx.fillText('井口压力', cx, cy + 50);
    ctx.textAlign = 'left';

    // 温度条
    bar(440, 240, 180, 12, (s.T - 150) / 130, '#ff8c5a', `温度 ${s.T.toFixed(0)} °C`);
    // 功率条
    bar(440, 290, 180, 12, s.power / 20, '#4ade80', `功率 ${s.power.toFixed(1)} MW`);
    // 流量指示
    ctx.fillStyle = '#8b98ab'; ctx.font = '11px sans-serif';
    ctx.fillText(`蒸汽流入 ${s.flows.qIn.toFixed(1)}  涡轮 ${s.flows.qTurb.toFixed(1)}  泄放 ${s.flows.qRelief.toFixed(1)}`, 400, 340);
  }

  function bar(x, y, w, h, frac, color, label) {
    ctx.fillStyle = '#1c2534';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w * Math.max(0, Math.min(frac, 1)), h);
    ctx.fillStyle = '#d7e0ea'; ctx.font = '11px sans-serif';
    ctx.fillText(label, x, y - 5);
  }

  // 压力/温度历史曲线
  function drawCharts(s) {
    const x0 = 400, y0 = 380, w = 220, h = 150;
    ctx.fillStyle = '#10161f';
    ctx.fillRect(x0, y0, w, h);
    ctx.strokeStyle = '#2a3546';
    ctx.strokeRect(x0, y0, w, h);
    // 压力上限线
    const yLimit = y0 + h - (sim.cfg.pLimit / 14) * h;
    ctx.strokeStyle = 'rgba(255,95,95,0.6)';
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(x0, yLimit); ctx.lineTo(x0 + w, yLimit); ctx.stroke();
    ctx.setLineDash([]);
    plot(histP, 14, '#7fd4ff');
    plot(histT, 320, '#ff8c5a');
    ctx.fillStyle = '#7fd4ff'; ctx.font = '10px sans-serif';
    ctx.fillText('压力', x0 + 6, y0 + 12);
    ctx.fillStyle = '#ff8c5a';
    ctx.fillText('温度', x0 + 40, y0 + 12);

    function plot(hist, maxV, color) {
      if (hist.length < 2) return;
      ctx.strokeStyle = color; ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i < hist.length; i++) {
        const px = x0 + (hist[i].t / sim.cfg.duration) * w;
        const py = y0 + h - Math.min(hist[i].v / maxV, 1) * h;
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
  }

  // 启动
  pushControls();
  requestAnimationFrame(frame);
})();
