/* UI 层：Canvas 曲线、坝体剖面、交互控制、Web Audio 水声。 */
(function () {
  'use strict';
  var S = window.Sim;
  var state = S.createState();
  var playing = false;
  var replaying = false;
  var timer = null;
  var savedOpLog = null; // 回放时暂存的操作记录
  var lastOpLog = null;  // 最近一次调度的操作记录（重置后仍可回放）

  var $ = function (id) { return document.getElementById(id); };
  var els = {
    clock: $('clock'), level: $('stLevel'), inflow: $('stIn'), outflow: $('stOut'),
    gate: $('stGate'), pend: $('stPend'), alertBox: $('alertBox'),
    gateSlider: $('gateSlider'), gateVal: $('gateVal'), logList: $('logList'),
    btnPlay: $('btnPlay'), btnStep: $('btnStep'), btnReset: $('btnReset'),
    btnReplay: $('btnReplay'), btnExport: $('btnExport'), btnSound: $('btnSound')
  };

  // ---------- 曲线绘制 ----------
  function setupCanvas(canvas) {
    var dpr = window.devicePixelRatio || 1;
    var w = canvas.clientWidth, h = canvas.clientHeight || canvas.height;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx: ctx, w: w, h: h };
  }

  function drawChart(canvas, opts) {
    var c = setupCanvas(canvas), ctx = c.ctx;
    var padL = 46, padR = 10, padT = 8, padB = 20;
    var pw = c.w - padL - padR, ph = c.h - padT - padB;
    ctx.clearRect(0, 0, c.w, c.h);
    ctx.font = '11px sans-serif';

    // 网格与纵轴刻度
    ctx.strokeStyle = '#223142'; ctx.fillStyle = '#7d93a8';
    for (var i = 0; i <= 4; i++) {
      var y = padT + ph * i / 4;
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + pw, y); ctx.stroke();
      var v = opts.max - (opts.max - opts.min) * i / 4;
      ctx.fillText(v.toFixed(opts.decimals), 4, y + 4);
    }
    // 横轴时刻
    for (var t = 0; t <= 24; t += 6) {
      var x = padL + pw * t / 24;
      ctx.fillText((t < 10 ? '0' : '') + t + ':00', x - 14, c.h - 6);
    }

    // 阈值线
    if (opts.threshold != null) {
      var ty = padT + ph * (opts.max - opts.threshold) / (opts.max - opts.min);
      ctx.strokeStyle = '#ff5d5d'; ctx.setLineDash([6, 4]);
      ctx.beginPath(); ctx.moveTo(padL, ty); ctx.lineTo(padL + pw, ty); ctx.stroke();
      ctx.setLineDash([]);
    }

    // 全过程参考线（入库为已知预报，画整条；其余画已发生部分）
    var hist = state.history;
    function xAt(step) { return padL + pw * step / S.STEPS_PER_DAY; }
    function yAt(v) { return padT + ph * (opts.max - v) / (opts.max - opts.min); }

    if (opts.fullSeries) {
      ctx.strokeStyle = 'rgba(120,150,180,.35)';
      ctx.beginPath();
      for (var s = 0; s <= S.STEPS_PER_DAY; s++) {
        var hv = opts.fullSeries(s);
        s === 0 ? ctx.moveTo(xAt(s), yAt(hv)) : ctx.lineTo(xAt(s), yAt(hv));
      }
      ctx.stroke();
    }

    ctx.strokeStyle = opts.color; ctx.lineWidth = 2;
    ctx.beginPath();
    hist.forEach(function (h, i) {
      var v = opts.value(h);
      i === 0 ? ctx.moveTo(xAt(h.step), yAt(v)) : ctx.lineTo(xAt(h.step), yAt(v));
    });
    ctx.stroke();
    ctx.lineWidth = 1;

    // 当前时间游标
    if (hist.length) {
      var cx = xAt(state.step);
      ctx.strokeStyle = 'rgba(255,255,255,.25)';
      ctx.beginPath(); ctx.moveTo(cx, padT); ctx.lineTo(cx, padT + ph); ctx.stroke();
    }
  }

  function drawAll() {
    drawChart($('inflowCanvas'), {
      color: '#4da3ff', min: 0, max: 2200, decimals: 0,
      value: function (h) { return h.inflow; },
      fullSeries: function (s) { return S.inflowAt(s * S.STEP_MIN / 60); }
    });
    drawChart($('outflowCanvas'), {
      color: '#ffb84d', min: 0, max: 2200, decimals: 0, threshold: S.DOWNSTREAM_LIMIT,
      value: function (h) { return h.outflow; }
    });
    drawChart($('levelCanvas'), {
      color: '#4dd0a6', min: 148, max: 158, decimals: 1, threshold: S.WARN_LEVEL,
      value: function (h) { return h.level; }
    });
    drawDam();
    renderStats();
  }

  // ---------- 坝体剖面 ----------
  function drawDam() {
    var canvas = $('damCanvas');
    var c = setupCanvas(canvas), ctx = c.ctx;
    var W = c.w, H = c.h;
    ctx.clearRect(0, 0, W, H);

    var levelMin = 138, levelMax = 160;
    function yOf(lv) { return H - 24 - (lv - levelMin) / (levelMax - levelMin) * (H - 44); }

    // 地基
    ctx.fillStyle = '#1b2836';
    ctx.fillRect(0, H - 24, W, 24);

    // 坝体梯形（混凝土重力坝剖面）
    var damTop = yOf(158), damBot = yOf(140);
    var crestX = W * 0.52, crestW = 26;
    ctx.fillStyle = '#5b6b7c';
    ctx.beginPath();
    ctx.moveTo(crestX - 150, damBot);
    ctx.lineTo(crestX, damTop);
    ctx.lineTo(crestX + crestW, damTop);
    ctx.lineTo(crestX + crestW + 40, damBot);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#7d93a8'; ctx.stroke();

    // 上游水体
    var wlY = yOf(state.level);
    var overWarn = state.level >= S.WARN_LEVEL;
    ctx.fillStyle = overWarn ? 'rgba(255,93,93,.45)' : 'rgba(77,163,255,.4)';
    ctx.beginPath();
    ctx.moveTo(0, damBot);
    // 水面与坝坡交点
    var slopeX = crestX - 150 + (damBot - wlY) / (damBot - damTop) * 150;
    ctx.lineTo(Math.max(0, Math.min(slopeX, crestX)), wlY);
    ctx.lineTo(0, wlY);
    ctx.closePath(); ctx.fill();

    // 警戒水位虚线
    ctx.strokeStyle = '#ff5d5d'; ctx.setLineDash([5, 4]);
    ctx.beginPath(); ctx.moveTo(0, yOf(S.WARN_LEVEL)); ctx.lineTo(crestX, yOf(S.WARN_LEVEL)); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#ff8d8d'; ctx.font = '11px sans-serif';
    ctx.fillText('警戒 155.0m', 6, yOf(S.WARN_LEVEL) - 4);

    // 闸门与泄流（开度越大，孔口越高、水舌越粗）
    var gateH = 4 + state.gateOpen * 26;
    var gateY = yOf(144);
    ctx.fillStyle = '#0b121b';
    ctx.fillRect(crestX + 4, gateY - gateH, crestW - 8, gateH);
    if (state.outflow > 0) {
      var jet = Math.min(1, state.outflow / 1600);
      ctx.strokeStyle = 'rgba(120,190,255,' + (0.35 + jet * 0.5) + ')';
      ctx.lineWidth = 2 + jet * 8;
      ctx.beginPath();
      ctx.moveTo(crestX + crestW, gateY - gateH / 2);
      ctx.quadraticCurveTo(crestX + crestW + 90, gateY - gateH / 2 + 6,
        W - 20, damBot - 4);
      ctx.stroke();
      ctx.lineWidth = 1;
    }

    // 标注
    ctx.fillStyle = '#d8e4ee'; ctx.font = '12px sans-serif';
    ctx.fillText('上游水位 ' + state.level.toFixed(2) + ' m', 8, wlY - 8);
    ctx.fillText('泄流 ' + state.outflow + ' m³/s', crestX + crestW + 46, gateY - gateH - 6);
    ctx.fillText('坝顶 158m', crestX - 8, damTop - 6);
  }

  // ---------- 状态面板 / 告警 / 日志 ----------
  function renderStats() {
    els.clock.textContent = S.fmtTime(state.step) + (state.finished ? '（结束）' : '');
    els.level.textContent = state.level.toFixed(2) + ' m';
    els.level.className = state.level >= S.WARN_LEVEL ? 'warn' : '';
    els.inflow.textContent = state.inflow + ' m³/s';
    els.outflow.textContent = state.outflow + ' m³/s';
    els.outflow.className = state.outflow > S.DOWNSTREAM_LIMIT ? 'warn' : '';
    els.gate.textContent = Math.round(state.gateOpen * 100) + '%';
    els.pend.textContent = state.pendingGate.length
      ? Math.round(state.pendingGate[0].value * 100) + '%（' + S.fmtTime(state.pendingGate[0].applyStep) + ' 生效）'
      : '—';

    if (state.alerts.length) {
      els.alertBox.innerHTML = '⚠ ' + state.alerts.map(function (a) { return a.text; }).join('<br>⚠ ');
      els.alertBox.className = 'show';
    } else {
      els.alertBox.className = '';
    }

    if (state.opLog.length) {
      els.logList.innerHTML = state.opLog.map(function (op) {
        return '<div>[' + op.time + '] 开度 → ' + Math.round(op.value * 100) +
          '%（当时水位 ' + op.level + 'm）</div>';
      }).join('');
      els.logList.scrollTop = els.logList.scrollHeight;
    } else {
      els.logList.innerHTML = '<div class="hint">暂无操作</div>';
    }

    els.btnPlay.textContent = playing ? '⏸ 暂停' : '▶ 开始';
    els.btnStep.disabled = playing || state.finished;
    els.btnReplay.disabled = playing || (!state.opLog.length && !(lastOpLog && lastOpLog.length));
    els.btnExport.disabled = !state.history.length;
  }

  // ---------- Web Audio 水声反馈 ----------
  var audio = { ctx: null, gain: null, src: null, on: false };

  function initAudio() {
    if (audio.ctx) return;
    var AC = window.AudioContext || window.webkitAudioContext;
    audio.ctx = new AC();
    // 循环白噪声 -> 低通滤波 -> 增益，模拟水流声
    var len = audio.ctx.sampleRate * 2;
    var buf = audio.ctx.createBuffer(1, len, audio.ctx.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    var src = audio.ctx.createBufferSource();
    src.buffer = buf; src.loop = true;
    var filter = audio.ctx.createBiquadFilter();
    filter.type = 'lowpass'; filter.frequency.value = 700; filter.Q.value = 0.8;
    var gain = audio.ctx.createGain();
    gain.gain.value = 0;
    src.connect(filter); filter.connect(gain); gain.connect(audio.ctx.destination);
    src.start();
    audio.src = src; audio.gain = gain; audio.filter = filter;
  }

  function updateWaterSound() {
    if (!audio.on || !audio.ctx) return;
    var intensity = Math.min(1, state.outflow / 1600);
    var t = audio.ctx.currentTime;
    audio.gain.gain.setTargetAtTime(intensity * 0.35, t, 0.2);
    audio.filter.frequency.setTargetAtTime(400 + intensity * 1600, t, 0.2);
  }

  // ---------- 推进与回放 ----------
  function advance() {
    S.tick(state);
    updateWaterSound();
    drawAll();
    if (state.finished) stopPlay();
  }

  function startPlay() {
    if (state.finished) return;
    playing = true;
    timer = setInterval(advance, 400); // 每 400ms 推进 15 分钟
    if (audio.on && audio.ctx) audio.ctx.resume();
    renderStats();
  }

  function stopPlay() {
    playing = false;
    replaying = false;
    clearInterval(timer);
    renderStats();
  }

  function doReset() {
    stopPlay();
    if (state.opLog.length) {
      lastOpLog = state.opLog.map(function (op) { return { step: op.step, value: op.value }; });
    }
    state = S.createState();
    els.gateSlider.value = Math.round(state.gateOpen * 100);
    els.gateVal.textContent = Math.round(state.gateOpen * 100) + '%';
    drawAll();
  }

  function doReplay() {
    var src = state.opLog.length
      ? state.opLog
      : (lastOpLog || []);
    savedOpLog = src.map(function (op) { return { step: op.step, value: op.value }; });
    if (!savedOpLog.length) return;
    doReset();
    replaying = true;
    startPlay();
  }

  // 回放模式下，到点自动应用记录的开度
  function replayAwareAdvance() {
    if (replaying && savedOpLog) {
      savedOpLog.forEach(function (op) {
        if (op.step === state.step && !op._done) {
          S.setGate(state, op.value);
          op._done = true;
        }
      });
      if (state.finished) {
        savedOpLog.forEach(function (o) { delete o._done; });
      }
    }
    advance();
  }

  // ---------- 事件绑定 ----------
  els.btnPlay.addEventListener('click', function () {
    playing ? stopPlay() : startPlay();
  });
  els.btnStep.addEventListener('click', function () { replayAwareAdvance(); });
  els.btnReset.addEventListener('click', doReset);
  els.btnReplay.addEventListener('click', doReplay);
  els.btnExport.addEventListener('click', function () {
    var csv = S.exportCSV(state);
    var blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'reservoir_dispatch_log.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  });
  els.btnSound.addEventListener('click', function () {
    audio.on = !audio.on;
    if (audio.on) {
      initAudio();
      audio.ctx.resume();
      els.btnSound.textContent = '🔊 水声开';
      updateWaterSound();
    } else {
      els.btnSound.textContent = '🔇 水声关';
      if (audio.gain) audio.gain.gain.value = 0;
    }
  });

  els.gateSlider.addEventListener('input', function () {
    var v = parseInt(els.gateSlider.value, 10) / 100;
    els.gateVal.textContent = els.gateSlider.value + '%';
    if (!replaying) {
      S.setGate(state, v);
      renderStats();
    }
  });

  // 播放循环使用回放感知推进
  startPlay = function () {
    if (state.finished) return;
    playing = true;
    timer = setInterval(replayAwareAdvance, 400);
    if (audio.on && audio.ctx) audio.ctx.resume();
    renderStats();
  };

  window.addEventListener('resize', drawAll);
  drawAll();
})();
