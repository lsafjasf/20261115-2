// 渲染、交互与音效
(function () {
  'use strict';
  var Sim = window.CuringSim;
  var canvas = document.getElementById('board');
  var ctx = canvas.getContext('2d');
  var W = canvas.width, H = canvas.height;

  var state = Sim.createGame({ seed: (Math.random() * 1e9) | 0 });
  var speed = 1;               // 每帧推进小时数的倒数控制
  var frameCount = 0;
  var running = true;

  // ---------- 音效(WebAudio) ----------
  var audioCtx = null;
  var pumpNode = null;
  function ensureAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  }
  function startPump() {
    ensureAudio();
    if (pumpNode) return;
    var len = audioCtx.sampleRate * 1;
    var buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * 0.5;
    var src = audioCtx.createBufferSource();
    src.buffer = buf; src.loop = true;
    var filt = audioCtx.createBiquadFilter();
    filt.type = 'lowpass'; filt.frequency.value = 400;
    var gain = audioCtx.createGain();
    gain.gain.value = 0.15;
    var lfo = audioCtx.createOscillator();
    lfo.frequency.value = 6;
    var lfoGain = audioCtx.createGain();
    lfoGain.gain.value = 0.06;
    lfo.connect(lfoGain); lfoGain.connect(gain.gain);
    src.connect(filt); filt.connect(gain); gain.connect(audioCtx.destination);
    src.start(); lfo.start();
    pumpNode = { src: src, lfo: lfo, gain: gain };
  }
  function stopPump() {
    if (!pumpNode) return;
    pumpNode.gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.2);
    var p = pumpNode;
    setTimeout(function () { p.src.stop(); p.lfo.stop(); }, 300);
    pumpNode = null;
  }
  function beep(freq, dur, type, vol) {
    ensureAudio();
    var o = audioCtx.createOscillator();
    var g = audioCtx.createGain();
    o.type = type || 'sine'; o.frequency.value = freq;
    g.gain.setValueAtTime(vol || 0.2, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
    o.connect(g); g.connect(audioCtx.destination);
    o.start(); o.stop(audioCtx.currentTime + dur);
  }
  function windGust() {
    ensureAudio();
    var len = audioCtx.sampleRate * 1.5;
    var buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    var src = audioCtx.createBufferSource();
    src.buffer = buf;
    var filt = audioCtx.createBiquadFilter();
    filt.type = 'bandpass'; filt.frequency.value = 600; filt.Q.value = 0.8;
    var g = audioCtx.createGain(); g.gain.value = 0.4;
    src.connect(filt); filt.connect(g); g.connect(audioCtx.destination);
    src.start();
  }

  // ---------- 天气提示 ----------
  var lastLogLen = 0;
  function checkLogSounds() {
    for (var i = lastLogLen; i < state.log.length; i++) {
      var msg = state.log[i].msg;
      if (msg.indexOf('大风') >= 0) windGust();
      else if (msg.indexOf('天气突变') >= 0) beep(660, 0.3, 'square', 0.15);
      else if (msg.indexOf('温度骤降') >= 0) beep(220, 0.5, 'sawtooth', 0.2);
      else if (msg.indexOf('养护成功') >= 0) { beep(523, 0.2); setTimeout(function(){beep(659,0.2);},200); setTimeout(function(){beep(784,0.4);},400); }
      else if (msg.indexOf('养护失败') >= 0) beep(180, 0.8, 'sawtooth', 0.2);
    }
    lastLogLen = state.log.length;
  }

  // ---------- 渲染 ----------
  function drawSlab() {
    // 板面底色:湿度越高颜色越深越蓝
    var m = state.surfaceMoisture / 100;
    var r = Math.round(190 - m * 90);
    var g = Math.round(185 - m * 70);
    var b = Math.round(175 - m * 30);
    ctx.fillStyle = 'rgb(' + r + ',' + g + ',' + b + ')';
    ctx.fillRect(0, 0, W, H);

    // 水膜光泽
    if (state.surfaceMoisture > 60) {
      ctx.fillStyle = 'rgba(120,170,220,' + ((state.surfaceMoisture - 60) / 400) + ')';
      ctx.fillRect(0, 0, W, H);
    }

    // 裂缝:40 个格子(8x5)
    ctx.strokeStyle = 'rgba(40,30,25,0.9)';
    var cw = W / 8, ch = H / 5;
    for (var i = 0; i < state.crackCells.length; i++) {
      var v = state.crackCells[i];
      if (v <= 0) continue;
      var cx = (i % 8) * cw + cw / 2;
      var cy = Math.floor(i / 8) * ch + ch / 2;
      ctx.lineWidth = 1 + v * 2;
      ctx.beginPath();
      ctx.moveTo(cx - cw * 0.4 * v, cy);
      ctx.lineTo(cx, cy + ch * 0.3 * v);
      ctx.lineTo(cx + cw * 0.4 * v, cy - ch * 0.2 * v);
      ctx.stroke();
    }

    // 覆盖层
    if (state.covered) {
      ctx.fillStyle = 'rgba(210,180,90,0.45)';
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = 'rgba(150,120,40,0.6)';
      ctx.lineWidth = 1;
      for (var x = 0; x < W; x += 24) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 12, H); ctx.stroke();
      }
    }

    // 喷淋水滴动画
    if (state.sprayHoursLeft > 0) {
      ctx.fillStyle = 'rgba(150,200,255,0.8)';
      for (var k = 0; k < 30; k++) {
        var dx = (k * 97 + frameCount * 7) % W;
        var dy = (k * 53 + frameCount * 11) % H;
        ctx.fillRect(dx, dy, 3, 6);
      }
    }

    // 通风气流线
    if (state.ventilating) {
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 2;
      for (var j = 0; j < 5; j++) {
        var yy = 30 + j * (H - 60) / 4;
        var off = (frameCount * 4 + j * 60) % W;
        ctx.beginPath();
        ctx.moveTo(off - 40, yy);
        ctx.quadraticCurveTo(off - 20, yy - 8, off, yy);
        ctx.stroke();
      }
    }
  }

  function drawHud() {
    var day = Math.floor(state.hour / 24) + 1;
    var hh = state.hour % 24;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, W, 58);
    ctx.fillStyle = '#fff';
    ctx.font = '14px sans-serif';
    ctx.fillText('第 ' + day + '/7 天 ' + hh + ':00', 10, 20);
    ctx.fillText('环境 ' + state.ambientTemp.toFixed(1) + '℃  湿度 '
      + state.ambientHumidity.toFixed(0) + '%  风 ' + state.windSpeed + ' 级', 10, 40);
    if (state.event) {
      ctx.fillStyle = '#ffcc44';
      ctx.fillText('⚠ ' + state.event.name + ' 持续中', W - 160, 20);
    }
    ctx.fillStyle = '#fff';
    ctx.fillText('蒸发速率 ' + state.evapRate.toFixed(2), W - 160, 40);
  }

  function bar(elId, val, max) {
    var el = document.getElementById(elId);
    el.style.width = Math.min(100, val / max * 100) + '%';
    el.textContent = val.toFixed(1);
  }

  function updatePanel() {
    bar('barMoist', state.surfaceMoisture, 100);
    bar('barTemp', state.slabTemp, 45);
    bar('barStrength', state.strength, Sim.TARGET_STRENGTH * 1.4);
    bar('barCrack', state.crackArea, Sim.CRACK_THRESHOLD * 2);
    document.getElementById('valMoist').textContent = state.surfaceMoisture.toFixed(0) + '%';
    document.getElementById('valTemp').textContent = state.slabTemp.toFixed(1) + '℃';
    document.getElementById('valStrength').textContent =
      state.strength.toFixed(1) + ' / ' + Sim.TARGET_STRENGTH + ' MPa';
    document.getElementById('valCrack').textContent =
      state.crackArea.toFixed(1) + '% / 限 ' + Sim.CRACK_THRESHOLD + '%';
    var logEl = document.getElementById('log');
    var recent = state.log.slice(-6);
    logEl.innerHTML = recent.map(function (e) {
      return '<div>[' + Math.floor(e.hour / 24 + 1) + '天' + (e.hour % 24) + '时] ' + e.msg + '</div>';
    }).join('');
    logEl.scrollTop = logEl.scrollHeight;
    if (state.over) {
      var b = document.getElementById('banner');
      b.textContent = state.won ? '🎉 养护成功!' : '❌ 养护失败,点击重新开始';
      b.className = state.won ? 'win' : 'lose';
      b.style.display = 'block';
    }
  }

  // ---------- 主循环 ----------
  function tick() {
    if (!running || state.over) return;
    frameCount++;
    if (frameCount % Math.max(1, 12 - speed * 3) === 0) {
      Sim.step(state);
      checkLogSounds();
      if (state.sprayHoursLeft > 0) startPump(); else stopPump();
    }
    drawSlab();
    drawHud();
    updatePanel();
  }

  function loop() {
    tick();
    requestAnimationFrame(loop);
  }

  // ---------- 控制 ----------
  function bind(id, fn) {
    document.getElementById(id).addEventListener('click', function () {
      ensureAudio();
      fn();
    });
  }
  bind('btnSpray', function () {
    if (state.over) return;
    state.sprayHoursLeft = 3;
    startPump();
  });
  bind('btnCover', function () {
    if (state.over) return;
    state.covered = !state.covered;
    this.textContent = state.covered ? '揭开覆盖层' : '加盖覆盖层';
    beep(440, 0.1, 'triangle', 0.1);
  });
  bind('btnVent', function () {
    if (state.over) return;
    state.ventilating = !state.ventilating;
    this.textContent = state.ventilating ? '关闭通风' : '开通风';
    beep(520, 0.1, 'triangle', 0.1);
  });
  bind('btnSpeed', function () {
    speed = speed >= 3 ? 1 : speed + 1;
    this.textContent = '速度 x' + speed;
  });
  bind('btnRestart', function () {
    state = Sim.createGame({ seed: (Math.random() * 1e9) | 0 });
    lastLogLen = 0;
    document.getElementById('banner').style.display = 'none';
    document.getElementById('btnCover').textContent = '加盖覆盖层';
    document.getElementById('btnVent').textContent = '开通风';
    stopPump();
  });
  document.getElementById('banner').addEventListener('click', function () {
    document.getElementById('btnRestart').click();
  });

  loop();
})();
