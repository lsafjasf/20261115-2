// 前端：Canvas 渲染（风场/羽流/监测点）+ 控制面板 + Web Audio
(function () {
  "use strict";
  var cv = document.getElementById("cv");
  var ctx = cv.getContext("2d");
  var CELL = cv.width / Sim.GRID_W; // 10px/格

  var state = Sim.createState();
  var paused = false;
  var STEPS_PER_FRAME = 0.14; // 约 8 倍速（60fps）
  var stepAcc = 0;

  // ---- 构建塔控制面板 ----
  var towersEl = document.getElementById("towers");
  var towerUi = [];
  state.towers.forEach(function (tw) {
    var card = document.createElement("div");
    card.className = "card";
    card.innerHTML =
      "<h3>" + tw.name + "（源强 " + tw.source + "）</h3>" +
      '<div class="row"><label>风量</label>' +
      '<input type="range" min="0" max="100" value="60" data-k="airflow">' +
      "<output>60%</output></div>" +
      '<div class="row"><label>旁路</label>' +
      '<input type="range" min="0" max="100" value="10" data-k="bypass">' +
      "<output>10%</output></div>" +
      '<div class="row"><label>滤芯</label>' +
      '<button data-k="switch">切换滤芯</button>' +
      '<span class="eta" style="font-size:12px;color:#9fb2c5"></span></div>' +
      '<div class="filters">' +
      '<div class="filter active"><i></i></div>' +
      '<div class="filter"><i></i></div></div>';
    towersEl.appendChild(card);
    var ui = {
      card: card,
      sliders: card.querySelectorAll("input[type=range]"),
      switchBtn: card.querySelector("button"),
      filterEls: card.querySelectorAll(".filter"),
      etaEl: card.querySelector(".eta"),
    };
    ui.sliders.forEach(function (sl) {
      sl.addEventListener("input", function () {
        var v = sl.value / 100;
        sl.parentElement.querySelector("output").textContent = sl.value + "%";
        if (sl.dataset.k === "airflow") Sim.setAirflow(state, tw.id, v);
        else Sim.setBypass(state, tw.id, v);
      });
    });
    ui.switchBtn.addEventListener("click", function () {
      Sim.switchFilter(state, tw.id);
    });
    towerUi.push(ui);
  });

  // ---- 监测点面板 ----
  var monitorsEl = document.getElementById("monitors");
  state.monitors.forEach(function (m) {
    var div = document.createElement("div");
    div.className = "mon";
    div.innerHTML = "<span>" + m.name + "</span><b>--</b>";
    monitorsEl.appendChild(div);
  });
  var monEls = monitorsEl.querySelectorAll(".mon");

  // ---- 顶部按钮 ----
  var banner = document.getElementById("banner");
  var warnEl = document.getElementById("warn");
  document.getElementById("pauseBtn").addEventListener("click", function (e) {
    paused = !paused;
    e.target.textContent = paused ? "继续" : "暂停";
  });
  document.getElementById("restartBtn").addEventListener("click", function () {
    state = Sim.createState();
    paused = false;
    document.getElementById("pauseBtn").textContent = "暂停";
    banner.style.display = "none";
    towerUi.forEach(function (ui, i) {
      ui.sliders[0].value = 60; ui.sliders[1].value = 10;
      ui.sliders[0].parentElement.querySelector("output").textContent = "60%";
      ui.sliders[1].parentElement.querySelector("output").textContent = "10%";
    });
  });

  // ---- 羽流热力图（离屏，按网格分辨率） ----
  var heatCv = document.createElement("canvas");
  heatCv.width = Sim.GRID_W; heatCv.height = Sim.GRID_H;
  var heatCtx = heatCv.getContext("2d");
  var heatImg = heatCtx.createImageData(Sim.GRID_W, Sim.GRID_H);

  function plumeColor(v) {
    // 浓度 -> 颜色：背景蓝灰 -> 黄 -> 红
    var t = Math.min(1, Math.max(0, (v - 5) / 220));
    var r = Math.floor(30 + 225 * Math.min(1, t * 1.6));
    var g = Math.floor(45 + 140 * (t < 0.5 ? t * 2 : 2 - t * 2));
    var b = Math.floor(70 * (1 - t));
    var a = Math.floor(40 + 200 * t);
    return [r, g, b, a];
  }

  function drawPlume() {
    var d = heatImg.data;
    for (var i = 0; i < state.grid.length; i++) {
      var c = plumeColor(state.grid[i]);
      var o = i * 4;
      d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = c[3];
    }
    heatCtx.putImageData(heatImg, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(heatCv, 0, 0, cv.width, cv.height);
  }

  // ---- 风场箭头 ----
  function drawWind() {
    ctx.strokeStyle = "rgba(160,200,240,0.35)";
    ctx.lineWidth = 1;
    var t = state.t;
    for (var y = 4; y < Sim.GRID_H; y += 6) {
      for (var x = 4; x < Sim.GRID_W; x += 6) {
        var w = Sim.windAt(x, y, t);
        var px = x * CELL, py = y * CELL;
        var len = 4 + Math.min(8, Math.hypot(w.u, w.v) * 3);
        var ang = Math.atan2(w.v, w.u);
        var ex = px + Math.cos(ang) * len, ey = py + Math.sin(ang) * len;
        ctx.beginPath();
        ctx.moveTo(px, py); ctx.lineTo(ex, ey);
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex - 3 * Math.cos(ang - 0.5), ey - 3 * Math.sin(ang - 0.5));
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex - 3 * Math.cos(ang + 0.5), ey - 3 * Math.sin(ang + 0.5));
        ctx.stroke();
      }
    }
  }

  // ---- 塔与监测点 ----
  function drawTowers() {
    state.towers.forEach(function (tw) {
      var x = tw.x * CELL, y = tw.y * CELL;
      var active = tw.filters[tw.activeFilter];
      ctx.fillStyle = active.overloaded ? "#e05555" : "#4da3ff";
      ctx.beginPath();
      ctx.moveTo(x, y - 12); ctx.lineTo(x + 9, y + 8); ctx.lineTo(x - 9, y + 8);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#0e141c";
      ctx.font = "bold 9px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(String(tw.id + 1), x, y + 4);
      // 排放强度指示圈
      ctx.strokeStyle = "rgba(255,255,255,0.25)";
      ctx.beginPath();
      ctx.arc(x, y, 6 + tw.emission * 0.15, 0, Math.PI * 2);
      ctx.stroke();
    });
  }

  function drawMonitors() {
    state.monitors.forEach(function (m) {
      var x = m.x * CELL, y = m.y * CELL;
      ctx.fillStyle = m.exceed ? "#ff5b5b" : "#4fe08a";
      ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.7)";
      ctx.stroke();
      ctx.fillStyle = "#eaf2fa";
      ctx.font = "11px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(m.name, x, y - 12);
    });
  }

  // ---- HUD 刷新 ----
  var timerEl = document.getElementById("timer");
  var holdEl = document.getElementById("hold");
  function updateHud() {
    var remain = Math.max(0, Sim.SIM_DURATION - state.t);
    var mm = String(Math.floor(remain / 60)).padStart(2, "0");
    var ss = String(Math.floor(remain % 60)).padStart(2, "0");
    timerEl.textContent = mm + ":" + ss;
    holdEl.textContent = Math.floor(state.holdTimer) + " / " + Sim.HOLD_TO_WIN + "s";
    state.monitors.forEach(function (m, i) {
      var b = monEls[i].querySelector("b");
      b.textContent = m.value.toFixed(1);
      b.className = m.exceed ? "bad" : "ok";
    });
    var warns = [];
    state.towers.forEach(function (tw, i) {
      var ui = towerUi[i];
      tw.filters.forEach(function (f, fi) {
        var el = ui.filterEls[fi];
        el.classList.toggle("active", fi === tw.activeFilter);
        el.classList.toggle("over", f.overloaded);
        el.querySelector("i").style.width =
          Math.min(100, (f.load / Sim.FILTER_CAPACITY) * 100) + "%";
      });
      ui.etaEl.textContent = "效率 " + Math.round(tw.eta * 100) + "%";
      if (tw.filters[tw.activeFilter].overloaded) {
        warns.push(tw.name + " 滤芯过载！");
      }
      if (tw.bypass > 0.4) warns.push(tw.name + " 旁路过高");
    });
    warnEl.textContent = warns.join("　");
  }

  function showBanner() {
    if (state.status === "running") { banner.style.display = "none"; return; }
    banner.style.display = "flex";
    if (state.status === "success") {
      banner.innerHTML = "✅ 全部监测点达标！<small>用时 " +
        Math.floor(state.t / 60) + " 分 " + (state.t % 60) +
        " 秒　—— 点击「重新开局」再来一局</small>";
      banner.style.color = "#6fe08f";
    } else {
      banner.innerHTML = "❌ 时间耗尽，仍有监测点超标<small>点击「重新开局」重试</small>";
      banner.style.color = "#ff7a7a";
    }
  }

  // ---- Web Audio：风机负载轰鸣 ----
  var audio = null;
  function initAudio() {
    var AC = window.AudioContext || window.webkitAudioContext;
    var ctxA = new AC();
    var master = ctxA.createGain();
    master.gain.value = 0.12;
    master.connect(ctxA.destination);
    // 每塔一个振荡器（频率随风量）
    var oscs = state.towers.map(function () {
      var o = ctxA.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = 55;
      var g = ctxA.createGain();
      g.gain.value = 0;
      o.connect(g); g.connect(master);
      o.start();
      return { osc: o, gain: g };
    });
    // 旁路噪声（白噪声 -> 高通）
    var noiseBuf = ctxA.createBuffer(1, ctxA.sampleRate, ctxA.sampleRate);
    var nd = noiseBuf.getChannelData(0);
    for (var i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    var noise = ctxA.createBufferSource();
    noise.buffer = noiseBuf; noise.loop = true;
    var hp = ctxA.createBiquadFilter();
    hp.type = "highpass"; hp.frequency.value = 1200;
    var noiseGain = ctxA.createGain();
    noiseGain.gain.value = 0;
    noise.connect(hp); hp.connect(noiseGain); noiseGain.connect(master);
    noise.start();
    return { ctx: ctxA, oscs: oscs, noiseGain: noiseGain };
  }
  var audioBtn = document.getElementById("audioBtn");
  audioBtn.addEventListener("click", function () {
    if (!audio) {
      audio = initAudio();
      audioBtn.textContent = "关闭声音";
    } else if (audio.ctx.state === "running") {
      audio.ctx.suspend(); audioBtn.textContent = "开启声音";
    } else {
      audio.ctx.resume(); audioBtn.textContent = "关闭声音";
    }
  });
  function updateAudio() {
    if (!audio || audio.ctx.state !== "running") return;
    var t = audio.ctx.currentTime;
    var bypassTotal = 0;
    state.towers.forEach(function (tw, i) {
      var o = audio.oscs[i];
      var load = tw.airflow;
      o.osc.frequency.setTargetAtTime(45 + load * 70, t, 0.1);
      // 过载时声音发抖（增益粗糙化）
      var rough = tw.filters[tw.activeFilter].overloaded ? 0.5 : 1;
      o.gain.gain.setTargetAtTime(load * 0.33 * rough, t, 0.1);
      bypassTotal += tw.bypass * tw.airflow;
    });
    audio.noiseGain.gain.setTargetAtTime(Math.min(0.5, bypassTotal * 0.4), t, 0.1);
  }

  // ---- 主循环 ----
  function frame() {
    if (!paused && state.status === "running") {
      stepAcc += STEPS_PER_FRAME;
      while (stepAcc >= 1) { Sim.step(state); stepAcc -= 1; }
    }
    ctx.clearRect(0, 0, cv.width, cv.height);
    drawPlume();
    drawWind();
    drawTowers();
    drawMonitors();
    updateHud();
    updateAudio();
    showBanner();
    requestAnimationFrame(frame);
  }
  frame();
})();
