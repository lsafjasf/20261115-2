/* 页面控制、Canvas 渲染与固定时间步游戏循环。 */
(function () {
  'use strict';

  const sim = window.WaterSim;
  const scene = document.getElementById('scene');
  const chart = document.getElementById('chart');
  const sctx = scene.getContext('2d');
  const cctx = chart.getContext('2d');
  const audio = new window.FlowAudio();

  const ui = {
    time: document.getElementById('timePill'),
    temp: document.getElementById('tempPill'),
    pipe: document.getElementById('pipePill'),
    result: document.getElementById('resultPill'),
    canal: document.getElementById('canalGate'),
    outlet: document.getElementById('outletGate'),
    pump: document.getElementById('pumpSpeed'),
    canalValue: document.getElementById('canalValue'),
    outletValue: document.getElementById('outletValue'),
    pumpValue: document.getElementById('pumpValue'),
    reservoir: document.getElementById('reservoirMetric'),
    inflow: document.getElementById('inflowMetric'),
    pumpFlow: document.getElementById('pumpMetric'),
    failures: document.getElementById('failureMetric'),
    snow: document.getElementById('snowMetric'),
    shortage: document.getElementById('shortageMetric'),
    villages: document.getElementById('villageList'),
    log: document.getElementById('eventLog')
  };

  let state = sim.createState(sim.createWeather());
  let running = false;
  let autoMode = false;
  let testMode = null;
  let timer = null;
  const history = [];
  const particles = [];

  function readControls() {
    return {
      canalGate: Number(ui.canal.value) / 100,
      outletGate: Number(ui.outlet.value) / 100,
      pumpSpeed: Number(ui.pump.value) / 100
    };
  }

  function syncSliders() {
    ui.canal.value = Math.round(state.canalGate * 100);
    ui.outlet.value = Math.round(state.outletGate * 100);
    ui.pump.value = Math.round(state.pumpSpeed * 100);
    ui.canalValue.textContent = `${ui.canal.value}%`;
    ui.outletValue.textContent = `${ui.outlet.value}%`;
    ui.pumpValue.textContent = `${ui.pump.value}%`;
  }

  function resetGame() {
    running = false;
    autoMode = false;
    testMode = null;
    clearInterval(timer);
    state = sim.createState(sim.createWeather());
    history.length = 0;
    particles.length = 0;
    recordHistory();
    syncSliders();
    render();
  }

  function advance() {
    const controls = autoMode ? sim.autoPolicy(state) : readControls();
    sim.step(state, controls);
    if (autoMode) syncSliders();
    recordHistory();
    spawnParticles();
    if (state.completed) {
      running = false;
      clearInterval(timer);
    }
    render();
  }

  function recordHistory() {
    history.push({
      hour: state.time,
      reservoir: state.reservoir,
      inflow: state.inflow,
      pumpFlow: state.pumpFlow,
      demand: state.demands.reduce((sum, value) => sum + value, 0),
      temp: state.temperature,
      ice: state.ice
    });
  }

  function startBlockTest() {
    resetGame();
    const weather = Array.from({ length: 10 }, (_, hour) => ({ hour, temp: -12 }));
    state = sim.createState(weather);
    testMode = { name: 'blockage', weather };
    running = true;
    history.length = 0;
    recordHistory();
    clearInterval(timer);
    timer = setInterval(() => {
      sim.step(state, { canalGate: 0.2, outletGate: 0.2, pumpSpeed: 0 });
      recordHistory();
      spawnParticles();
      if (state.blocked || state.time >= 9) {
        running = false;
        clearInterval(timer);
      }
      render();
    }, 750);
    render();
  }

  function setRunning(value) {
    if (testMode) return;
    audio.ensure();
    running = value;
    clearInterval(timer);
    if (running) timer = setInterval(advance, 650);
  }

  function spawnParticles() {
    const count = Math.max(2, Math.round(state.pumpFlow / 18));
    for (let i = 0; i < count; i += 1) {
      particles.push({ x: 520, y: 250 + Math.random() * 30, speed: 1.5 + Math.random() * 2.2, life: 1 });
    }
    if (particles.length > 100) particles.splice(0, particles.length - 100);
  }

  document.getElementById('playBtn').addEventListener('click', () => setRunning(true));
  document.getElementById('pauseBtn').addEventListener('click', () => setRunning(false));
  document.getElementById('stepBtn').addEventListener('click', () => { if (!testMode) advance(); });
  document.getElementById('autoBtn').addEventListener('click', () => {
    if (testMode) resetGame();
    autoMode = !autoMode;
    setRunning(autoMode);
  });
  document.getElementById('resetBtn').addEventListener('click', resetGame);
  document.getElementById('blockTestBtn').addEventListener('click', startBlockTest);
  document.getElementById('soundToggle').addEventListener('change', (event) => {
    audio.setEnabled(event.target.checked);
    if (event.target.checked) audio.ensure();
  });
  [ui.canal, ui.outlet, ui.pump].forEach((input) => {
    input.addEventListener('input', () => {
      autoMode = false;
      ui.canalValue.textContent = `${ui.canal.value}%`;
      ui.outletValue.textContent = `${ui.outlet.value}%`;
      ui.pumpValue.textContent = `${ui.pump.value}%`;
    });
  });

  function render() {
    renderScene();
    renderChart();
    renderMetrics();
    renderLog();
    audio.update(state.pumpFlow / sim.PUMP_CAPACITY, state.blocked);
  }

  function drawMountain(ctx, points, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    points.forEach(([x, y]) => ctx.lineTo(x, y));
    ctx.lineTo(points[points.length - 1][0], scene.height);
    ctx.lineTo(points[0][0], scene.height);
    ctx.closePath();
    ctx.fill();
  }

  function renderScene() {
    const ctx = sctx;
    ctx.clearRect(0, 0, scene.width, scene.height);
    const sky = ctx.createLinearGradient(0, 0, 0, scene.height);
    sky.addColorStop(0, state.temperature < 0 ? '#17263f' : '#203b59');
    sky.addColorStop(1, '#142332');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, scene.width, scene.height);

    drawMountain(ctx, [[0, 330], [130, 90], [270, 310]], '#36516b');
    drawMountain(ctx, [[180, 340], [335, 60], [510, 320]], '#2d465d');
    drawMountain(ctx, [[430, 340], [590, 110], [780, 330]], '#3a566f');
    const snowLine = 175 - state.snowpack / 90;
    drawMountain(ctx, [[180, 340], [285, snowLine + 5], [335, 60], [385, snowLine + 5], [510, 320]], '#eaf6ff');

    ctx.fillStyle = '#20313f';
    ctx.fillRect(0, 320, scene.width, 100);
    ctx.strokeStyle = '#74c0fc';
    ctx.lineWidth = 3 + state.inflow / 55;
    ctx.beginPath();
    ctx.moveTo(150, 270);
    ctx.bezierCurveTo(260, 245, 350, 255, 450, 260);
    ctx.stroke();

    ctx.fillStyle = '#6b4f38';
    ctx.fillRect(435, 175, 115, 125);
    const waterHeight = 108 * (state.reservoir / sim.RESERVOIR_CAPACITY);
    ctx.fillStyle = '#2f9ecc';
    ctx.fillRect(446, 292 - waterHeight, 93, waterHeight);
    ctx.strokeStyle = '#d8e8f2';
    ctx.strokeRect(435, 175, 115, 125);
    ctx.fillStyle = '#d8e8f2';
    ctx.font = '13px sans-serif';
    ctx.fillText('蓄水池', 462, 168);

    ctx.fillStyle = '#556270';
    ctx.fillRect(548, 278, 22, 42);
    ctx.fillStyle = '#e9ecef';
    ctx.fillRect(553, 283, 12, 32 - state.outletGate * 28);

    ctx.strokeStyle = state.blocked ? '#868e96' : '#4dabf7';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(570, 300);
    ctx.lineTo(870, 300);
    ctx.stroke();

    ctx.fillStyle = '#ffd43b';
    ctx.beginPath();
    ctx.arc(625, 300, 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1d2b38';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText('泵', 620, 305);

    if (state.blocked) {
      ctx.strokeStyle = '#dee2e6';
      ctx.lineWidth = 3;
      for (let x = 680; x <= 820; x += 24) {
        ctx.beginPath();
        ctx.moveTo(x, 292);
        ctx.lineTo(x + 12, 308);
        ctx.stroke();
      }
      ctx.fillStyle = '#ff8787';
      ctx.font = 'bold 18px sans-serif';
      ctx.fillText('⚠ 冰堵', 715, 270);
    } else {
      ctx.fillStyle = `rgba(116, 192, 252, ${0.7})`;
      particles.forEach((particle) => {
        ctx.globalAlpha = particle.life;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, 3, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;
    }

    sim.VILLAGES.forEach((village, index) => {
      const x = 720 + index * 95;
      ctx.fillStyle = village.color;
      ctx.beginPath();
      ctx.moveTo(x, 238);
      ctx.lineTo(x - 22, 264);
      ctx.lineTo(x + 22, 264);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#f8f9fa';
      ctx.font = '12px sans-serif';
      ctx.fillText(village.name, x - 26, 226);
      const shortage = state.shortage[index] || 0;
      ctx.fillStyle = shortage > 2 ? '#ff8787' : '#8ce99a';
      ctx.fillText(shortage > 2 ? '缺水' : '正常', x - 16, 286);
    });

    ctx.fillStyle = '#f8f9fa';
    ctx.font = 'bold 15px sans-serif';
    ctx.fillText(`${testMode ? '冷却堵塞测试' : '融雪供水场景'}  温度 ${state.temperature}℃`, 22, 30);
    ctx.fillText(`雪线 ${Math.round(snowLine)}m`, 22, 54);
  }

  function renderChart() {
    const ctx = cctx;
    ctx.clearRect(0, 0, chart.width, chart.height);
    ctx.fillStyle = '#101e2b';
    ctx.fillRect(0, 0, chart.width, chart.height);
    const pad = 42;
    const width = chart.width - pad * 2;
    const height = chart.height - pad * 2;
    ctx.strokeStyle = '#2a4052';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i += 1) {
      const y = pad + (height / 4) * i;
      ctx.beginPath();
      ctx.moveTo(pad, y);
      ctx.lineTo(chart.width - pad, y);
      ctx.stroke();
    }
    if (history.length < 2) return;
    const maxX = Math.max(48, history.length - 1);
    const maxFlow = 240;
    const maxReservoir = sim.RESERVOIR_CAPACITY;
    const series = [
      { key: 'inflow', color: '#ffd43b', label: '来水' },
      { key: 'pumpFlow', color: '#4dabf7', label: '供水' },
      { key: 'demand', color: '#ff922b', label: '需求' },
      { key: 'reservoir', color: '#8ce99a', label: '蓄水' }
    ];
    series.forEach((item) => {
      ctx.strokeStyle = item.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      history.forEach((point, index) => {
        const x = pad + (point.hour / maxX) * width;
        const maximum = item.key === 'reservoir' ? maxReservoir : maxFlow;
        const y = pad + height - (Math.min(point[item.key], maximum) / maximum) * height;
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    });
    ctx.fillStyle = '#c9dceb';
    ctx.font = '12px sans-serif';
    ctx.fillText('0h', pad, chart.height - 14);
    ctx.fillText(`${maxX}h`, chart.width - pad - 22, chart.height - 14);
    series.forEach((item, index) => {
      ctx.fillStyle = item.color;
      ctx.fillText(item.label, pad + index * 70, 22);
    });
  }

  function renderMetrics() {
    ui.time.textContent = `第 ${state.time} / ${testMode ? state.weather.length - 1 : sim.HOURS} 小时`;
    ui.temp.textContent = `${state.temperature}℃`;
    ui.pipe.textContent = state.blocked ? '管道冰堵' : `结冰度 ${Math.round(state.ice * 100)}%`;
    ui.pipe.className = state.blocked ? 'pill-bad' : state.ice > 0.5 ? 'pill-warn' : 'pill-ok';
    ui.result.textContent = state.completed
      ? (state.peakFailures === 0 ? '调度成功' : `高峰断水 ${state.peakFailures} 次`)
      : (testMode ? '堵塞测试模式' : '调度进行中');
    ui.reservoir.textContent = `${Math.round(state.reservoir)} m³`;
    ui.inflow.textContent = `${state.inflow.toFixed(1)} m³/h`;
    ui.pumpFlow.textContent = `${state.pumpFlow.toFixed(1)} m³/h`;
    ui.failures.textContent = `${state.peakFailures} 次`;
    ui.snow.textContent = `${Math.round(state.snowpack)} m³`;
    ui.shortage.textContent = `${state.totalShortage.toFixed(0)} m³`;
    ui.villages.innerHTML = sim.VILLAGES.map((village, index) => {
      const demand = state.demands[index] || 0;
      const ratio = demand / 80;
      return `<div class="village-row"><span>${village.name}</span>
        <div class="demand-bar"><div class="demand-fill" style="width:${ratio * 100}%;background:${village.color}"></div></div>
        <span>需求 ${demand.toFixed(0)} / 供 ${(state.delivered[index] || 0).toFixed(0)}</span></div>`;
    }).join('');
  }

  function renderLog() {
    ui.log.innerHTML = state.events.map((event) =>
      `<li class="event-${event.type}"><b>${event.hour}h</b>${event.message}</li>`
    ).join('');
  }

  resetGame();
  setInterval(() => {
    particles.forEach((particle) => {
      particle.x += particle.speed;
      particle.life -= 0.012;
    });
    for (let i = particles.length - 1; i >= 0; i -= 1) {
      if (particles[i].life <= 0 || particles[i].x > 850) particles.splice(i, 1);
    }
    render();
  }, 60);
})();
