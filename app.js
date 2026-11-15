/* 贴标机调机模拟 —— Canvas 渲染 + Web Audio + 交互 */
(function () {
  'use strict';

  const C = window.LabelingCore;
  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');

  // 旧浏览器 roundRect 降级
  if (typeof CanvasRenderingContext2D !== 'undefined' &&
      typeof CanvasRenderingContext2D.prototype.roundRect !== 'function') {
    CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
      const radius = Math.min(r, w / 2, h / 2);
      this.moveTo(x + radius, y);
      this.arcTo(x + w, y, x + w, y + h, radius);
      this.arcTo(x + w, y + h, x, y + h, radius);
      this.arcTo(x, y + h, x, y, radius);
      this.arcTo(x, y, x + w, y, radius);
      this.closePath();
      return this;
    };
  }

  const passEl = document.getElementById('passCount');
  const failEl = document.getElementById('failCount');
  const stateEl = document.getElementById('runState');
  const pauseBtn = document.getElementById('pauseBtn');
  const resetBtn = document.getElementById('resetBtn');
  const muteBtn = document.getElementById('muteBtn');
  const overlay = document.getElementById('overlay');
  const overlayTitle = document.getElementById('overlayTitle');
  const overlaySub = document.getElementById('overlaySub');
  const logEl = document.getElementById('log');
  const slotsEl = document.getElementById('slots');
  const slidersEl = document.getElementById('sliders');

  const engine = new C.LabelingEngine(C.DEFAULT_PARAMS);
  let muted = false;

  /* ---------------- Web Audio：辊轮速度声音 ---------------- */
  const Audio = {
    ctx: null,
    hum: null,
    humGain: null,
    noiseGain: null,
    ready: false,

    ensure() {
      if (this.ready) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();

      // 辊轮嗡鸣：三角波，频率映射瓶体转速
      this.hum = this.ctx.createOscillator();
      this.hum.type = 'triangle';
      this.hum.frequency.value = 120;
      this.humGain = this.ctx.createGain();
      this.humGain.gain.value = 0;
      this.hum.connect(this.humGain).connect(this.ctx.destination);
      this.hum.start();

      // 机械底噪：白噪声 + 低通
      const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate * 2, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;
      noise.loop = true;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      this.noiseGain = this.ctx.createGain();
      this.noiseGain.gain.value = 0;
      noise.connect(filter).connect(this.noiseGain).connect(this.ctx.destination);
      noise.start();

      this.ready = true;
    },

    // 转速 -> 音高；暂停/静音 -> 收音量
    update(spin, running) {
      if (!this.ready) return;
      const now = this.ctx.currentTime;
      const freq = 70 + spin * 2.2;
      this.hum.frequency.setTargetAtTime(freq, now, 0.08);
      const level = running && !muted ? 0.055 : 0;
      const noiseLevel = running && !muted ? 0.03 : 0;
      this.humGain.gain.setTargetAtTime(level, now, 0.12);
      this.noiseGain.gain.setTargetAtTime(noiseLevel, now, 0.12);
    },

    // 每瓶经过检查线的短提示音
    blip(pass) {
      if (!this.ready || muted) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = pass ? 880 : 220;
      gain.gain.setValueAtTime(0.12, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.25);
      osc.connect(gain).connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.26);
    }
  };

  /* ---------------- 控制面板 ---------------- */
  const toleranceHint = {
    spin: '合格区间 68–92 rpm（标准 80）',
    glue: '合格区间 30–70%',
    angle: '合格区间 ±5°'
  };

  const inputs = {};
  Object.keys(C.LIMITS).forEach((key) => {
    const limit = C.LIMITS[key];
    const wrap = document.createElement('div');
    wrap.innerHTML =
      '<div class="slider-head"><span>' + limit.label + '</span>' +
      '<span class="val" id="val-' + key + '"></span></div>' +
      '<input type="range" id="input-' + key + '" min="' + limit.min +
      '" max="' + limit.max + '" step="' + limit.step + '">' +
      '<div class="tolerance">' + toleranceHint[key] + '</div>';
    slidersEl.appendChild(wrap);
    const input = wrap.querySelector('input');
    input.value = engine.params[key];
    input.addEventListener('input', () => {
      engine.setParam(key, parseFloat(input.value));
      syncValues();
    });
    inputs[key] = input;
  });

  function syncValues() {
    Object.keys(C.LIMITS).forEach((key) => {
      const limit = C.LIMITS[key];
      document.getElementById('val-' + key).textContent =
        engine.params[key] + ' ' + limit.unit;
      inputs[key].value = engine.params[key];
    });
  }

  for (let i = 0; i < C.TARGET; i++) {
    const dot = document.createElement('div');
    dot.className = 'slot';
    slotsEl.appendChild(dot);
  }

  function togglePause() {
    Audio.ensure();
    if (engine.finished) return;
    engine.setPaused(!engine.paused);
  }

  function doReset() {
    engine.reset();
    syncValues();
    overlay.classList.remove('show');
    logEl.textContent = '已重置：参数回到初始值，重新供瓶。';
    logEl.className = 'log';
  }

  pauseBtn.addEventListener('click', togglePause);
  resetBtn.addEventListener('click', doReset);
  muteBtn.addEventListener('click', () => {
    Audio.ensure();
    muted = !muted;
    muteBtn.textContent = muted ? '取消静音' : '静音';
  });

  document.addEventListener('keydown', (event) => {
    if (event.target.tagName === 'INPUT') return;
    if (event.code === 'Space') {
      event.preventDefault();
      togglePause();
    } else if (event.key === 'r' || event.key === 'R') {
      doReset();
    } else if (event.key === 'm' || event.key === 'M') {
      muted = !muted;
      muteBtn.textContent = muted ? '取消静音' : '静音';
    }
  });

  /* ---------------- 主循环 ---------------- */
  let last = performance.now();

  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    const events = engine.step(dt);
    handleEvents(events);
    render();
    updateHud();
    Audio.update(engine.params.spin, !engine.paused && !engine.finished);
    requestAnimationFrame(frame);
  }

  function handleEvents(events) {
    for (const event of events) {
      if (event.type === 'judged') {
        Audio.blip(event.pass);
        const result = engine.lastResult;
        if (event.pass) {
          logEl.innerHTML =
            '<span class="good">第 ' + event.bottleId + ' 瓶合格</span>，标签落在允许区域内。';
        } else {
          const names = event.defects.map((d) => C.DEFECT_TEXT[d]).join('、');
          logEl.innerHTML =
            '<span class="bad">第 ' + event.bottleId + ' 瓶不合格：' + names + '</span>';
        }
        void result;
      } else if (event.type === 'finished') {
        overlayTitle.textContent = '十二瓶合格，调机完成';
        overlaySub.textContent =
          '共检查 ' + engine.judged + ' 瓶，不合格 ' + engine.failCount + ' 瓶';
        overlay.classList.add('show');
      }
    }
  }

  function updateHud() {
    passEl.textContent = engine.passCount;
    failEl.textContent = engine.failCount;
    stateEl.textContent = engine.finished
      ? '已完成'
      : engine.paused ? '已暂停' : '运行中';
    pauseBtn.textContent = engine.paused ? '继续' : '暂停';
    pauseBtn.disabled = engine.finished;

    const dots = slotsEl.children;
    const passed = engine.passCount;
    for (let i = 0; i < dots.length; i++) {
      dots[i].className = 'slot' + (i < passed ? ' pass' : '');
    }
  }

  syncValues();
  requestAnimationFrame(frame);

  /* ---------------- Canvas 渲染 ---------------- */
  const W = canvas.width;
  const H = canvas.height;
  const BELT_Y = 320;
  const BELT_H = 46;

  function sx(normX) {
    return 30 + normX * (W - 60);
  }

  function drawStation(x, name, sub, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.setLineDash([7, 6]);
    ctx.beginPath();
    ctx.moveTo(x, 70);
    ctx.lineTo(x, BELT_Y - 18);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = color;
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(name, x, 52);
    ctx.fillStyle = '#7f93ab';
    ctx.font = '11px sans-serif';
    ctx.fillText(sub, x, 68);
  }

  function drawBelt() {
    const grad = ctx.createLinearGradient(0, BELT_Y, 0, BELT_Y + BELT_H);
    grad.addColorStop(0, '#2b3a4d');
    grad.addColorStop(1, '#1b2634');
    ctx.fillStyle = grad;
    ctx.fillRect(0, BELT_Y, W, BELT_H);
    // 流动纹理表现胶带/输送运动
    const offset = (engine.time * 60) % 40;
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 3;
    for (let x = -offset; x < W; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, BELT_Y + 8);
      ctx.lineTo(x + 16, BELT_Y + BELT_H - 8);
      ctx.stroke();
    }
    ctx.fillStyle = '#42566d';
    ctx.fillRect(0, BELT_Y + BELT_H, W, 8);
  }

  function drawGlueStation() {
    const x = sx(C.STATION_X.GLUE);
    ctx.fillStyle = '#3a4d63';
    ctx.fillRect(x - 8, 96, 16, BELT_Y - 120);
    ctx.fillStyle = '#54c6f0';
    ctx.fillRect(x - 14, BELT_Y - 34, 28, 18);
    // 胶滴，密度随胶水量
    const drops = Math.round(engine.params.glue / 12);
    ctx.fillStyle = 'rgba(126, 214, 255, 0.85)';
    for (let i = 0; i < drops; i++) {
      const dy = 120 + ((engine.time * 90 + i * 26) % (BELT_Y - 150));
      ctx.beginPath();
      ctx.arc(x + Math.sin(i * 2.1) * 5, dy, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawLabelReel() {
    const x = sx(C.STATION_X.WRAP);
    const reelY = 118;
    ctx.save();
    ctx.translate(x, reelY);
    ctx.rotate(-engine.time * 1.4);
    ctx.strokeStyle = '#e8c97a';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(0, 0, 34, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = '#8a7438';
    ctx.lineWidth = 3;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos((i * Math.PI) / 2) * 30, Math.sin((i * Math.PI) / 2) * 30);
      ctx.stroke();
    }
    ctx.restore();
    // 标签带从卷轴斜拉到缠绕点
    ctx.strokeStyle = '#f4e3b2';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(x + 20, reelY + 22);
    ctx.lineTo(x + 30, BELT_Y - 26);
    ctx.stroke();
  }

  function drawPressWheel() {
    const x = sx(C.STATION_X.PRESS);
    const angleRad = (engine.params.angle * Math.PI) / 180;
    ctx.save();
    ctx.translate(x, BELT_Y - 40);
    ctx.rotate(angleRad);
    ctx.fillStyle = '#c9d6e5';
    ctx.beginPath();
    ctx.arc(0, 0, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#6f8299';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = '#3a4d63';
    ctx.beginPath();
    ctx.arc(0, 0, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#3a4d63';
    ctx.fillRect(x - 4, 96, 8, BELT_Y - 140);
  }

  function drawInspectLine() {
    const x = sx(C.STATION_X.INSPECT);
    const flash = engine.lastResult && engine.time - engine.lastResult.time < 0.4;
    ctx.strokeStyle = flash
      ? (engine.lastResult.pass ? '#38d39f' : '#ef6f6c')
      : '#b48cf2';
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 8]);
    ctx.beginPath();
    ctx.moveTo(x, 80);
    ctx.lineTo(x, BELT_Y + BELT_H - 6);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function drawBottle(b) {
    const x = sx(b.x);
    const cy = BELT_Y - 8;
    const r = 24;

    // 瓶身
    const grad = ctx.createLinearGradient(x - r, 0, x + r, 0);
    grad.addColorStop(0, '#7fc4e8');
    grad.addColorStop(0.5, '#cfeefb');
    grad.addColorStop(1, '#5fa8d3');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(x - r, cy - 58, r * 2, 74, 10);
    ctx.fill();
    // 瓶颈与瓶盖
    ctx.fillStyle = '#9fd4ef';
    ctx.fillRect(x - 9, cy - 74, 18, 18);
    ctx.fillStyle = '#2f7fa8';
    ctx.fillRect(x - 10, cy - 80, 20, 9);

    // 旋转标记：体现瓶体转速
    ctx.save();
    ctx.translate(x, cy - 20);
    ctx.rotate(b.rot);
    ctx.strokeStyle = 'rgba(31, 78, 110, 0.7)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, 12, 0, Math.PI * 1.4);
    ctx.stroke();
    ctx.restore();

    if (b.wrapped && b.result) drawLabel(x, cy, b.result);
  }

  function drawLabel(x, cy, result) {
    const m = result.metrics;
    const lift = m.lift;
    const strings = m.strings;
    const offset = C.clamp(m.offsetUnits / 14, -1, 1) * 7;
    const twist = C.clamp(m.twistDeg / 50, -1, 1) * 0.5;
    const labelW = 34;
    const labelH = 26;
    const ly = cy - 36;

    ctx.save();
    ctx.translate(x + offset, ly + labelH / 2);
    ctx.rotate(twist);
    ctx.fillStyle = result.pass ? '#fff7e0' : '#ffe9d0';
    ctx.strokeStyle = '#c99b4f';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(-labelW / 2, -labelH / 2, labelW, labelH, 4);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#8a6a2f';
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('饮料', 0, -2);
    ctx.fillStyle = '#b08a4a';
    ctx.fillRect(-10, 5, 20, 2);

    // 翘边：标签一角卷起
    if (lift > 0) {
      ctx.strokeStyle = '#c99b4f';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(labelW / 2 - 2, -labelH / 2 + 2);
      ctx.quadraticCurveTo(
        labelW / 2 + 6 + lift * 8,
        -labelH / 2,
        labelW / 2 + lift * 10,
        labelH / 2 - 4
      );
      ctx.stroke();
    }

    // 气泡：标签上的圆形鼓包
    if (m.bubbleCount > 0 && result.defects.includes('bubbles')) {
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.strokeStyle = 'rgba(150,150,150,0.7)';
      const count = Math.min(m.bubbleCount, 5);
      for (let i = 0; i < count; i++) {
        const bx = -10 + (i % 3) * 10;
        const by = -6 + Math.floor(i / 3) * 11;
        ctx.beginPath();
        ctx.arc(bx, by, 2.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }
    ctx.restore();

    // 拉丝：标签后方拖出的胶丝
    if (strings > 0) {
      ctx.strokeStyle = 'rgba(180, 226, 255, 0.8)';
      ctx.lineWidth = 1.5;
      for (let i = 0; i < Math.round(strings * 4); i++) {
        ctx.beginPath();
        ctx.moveTo(x - labelW / 2 + offset, ly + 6 + i * 4);
        ctx.quadraticCurveTo(
          x - labelW / 2 - 12,
          ly + 2 + Math.sin(engine.time * 6 + i) * 6,
          x - labelW / 2 - 22 - i * 3,
          ly + 8
        );
        ctx.stroke();
      }
    }
  }

  function render() {
    ctx.clearRect(0, 0, W, H);

    // 背景网格
    ctx.fillStyle = '#16202d';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(255,255,255,0.035)';
    ctx.lineWidth = 1;
    for (let gx = 0; gx < W; gx += 40) {
      ctx.beginPath();
      ctx.moveTo(gx, 0);
      ctx.lineTo(gx, H);
      ctx.stroke();
    }

    drawStation(sx(C.STATION_X.GLUE), '上胶辊', '胶水 ' + engine.params.glue + '%', '#54c6f0');
    drawStation(sx(C.STATION_X.WRAP), '标签缠绕', '转速 ' + engine.params.spin + ' rpm', '#e8c97a');
    drawStation(sx(C.STATION_X.PRESS), '压轮', '角度 ' + engine.params.angle + '°', '#c9d6e5');
    drawStation(sx(C.STATION_X.INSPECT), '检查线', '允许区域', '#b48cf2');

    drawBelt();
    drawGlueStation();
    drawLabelReel();
    drawPressWheel();
    drawInspectLine();

    for (const bottle of engine.bottles) drawBottle(bottle);

    // 暂停遮罩
    if (engine.paused) {
      ctx.fillStyle = 'rgba(10,16,24,0.45)';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#e8eef6';
      ctx.font = 'bold 30px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('已暂停', W / 2, H / 2);
      ctx.font = '14px sans-serif';
      ctx.fillStyle = '#9fb2c8';
      ctx.fillText('按空格或点击“继续”恢复', W / 2, H / 2 + 28);
    }
  }
})();
