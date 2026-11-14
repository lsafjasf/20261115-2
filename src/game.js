/*
 * Browser game layer: canvas rendering, keyboard input and Web Audio.
 * The simulation itself lives in physics.js and is fully deterministic;
 * this file only renders world state and feeds manual / autopilot input.
 */
(function () {
  'use strict';

  var P = window.TugPhysics;
  var A = window.TugAutopilot;
  var SEED = 20261115;

  function AudioEngine() {
    this.ctx = null;
    this.muted = false;
    this.thrustGain = null;
    this.thrustFilter = null;
    this.tensionOsc = null;
    this.tensionGain = null;
  }

  AudioEngine.prototype.ensure = function () {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
      return;
    }
    var Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) {
      return;
    }
    var ctx = new Ctx();
    this.ctx = ctx;

    var buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    var data = buffer.getChannelData(0);
    for (var i = 0; i < data.length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    var noise = ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;
    var filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 320;
    var thrustGain = ctx.createGain();
    thrustGain.gain.value = 0;
    noise.connect(filter);
    filter.connect(thrustGain);
    thrustGain.connect(ctx.destination);
    noise.start();
    this.thrustFilter = filter;
    this.thrustGain = thrustGain;

    var osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 60;
    var tensionGain = ctx.createGain();
    tensionGain.gain.value = 0;
    osc.connect(tensionGain);
    tensionGain.connect(ctx.destination);
    osc.start();
    this.tensionOsc = osc;
    this.tensionGain = tensionGain;
  };

  AudioEngine.prototype.update = function (telemetry) {
    if (!this.ctx || this.muted) {
      return;
    }
    var now = this.ctx.currentTime;
    var thrustLevel = Math.abs(telemetry.throttleLevel) +
      telemetry.rcsLevel * 0.4;
    this.thrustGain.gain.setTargetAtTime(
      Math.min(0.22, thrustLevel * 0.18), now, 0.08);
    this.thrustFilter.frequency.setTargetAtTime(
      240 + thrustLevel * 900, now, 0.1);

    var tensionRatio = Math.min(1, telemetry.tension / 9000);
    this.tensionGain.gain.setTargetAtTime(
      tensionRatio * 0.12, now, 0.1);
    this.tensionOsc.frequency.setTargetAtTime(
      55 + tensionRatio * 180, now, 0.1);
  };

  AudioEngine.prototype.impact = function (impulse) {
    if (!this.ctx || this.muted) {
      return;
    }
    var ctx = this.ctx;
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(120 + Math.min(300, impulse / 30),
      ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(40,
      ctx.currentTime + 0.25);
    gain.gain.setValueAtTime(Math.min(0.3, impulse / 20000),
      ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001,
      ctx.currentTime + 0.3);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.32);
  };

  AudioEngine.prototype.toggleMute = function () {
    this.muted = !this.muted;
    if (this.ctx) {
      this.thrustGain.gain.value = 0;
      this.tensionGain.gain.value = 0;
    }
    return this.muted;
  };

  var canvas = document.getElementById('game');
  var ctx = canvas.getContext('2d');
  var audio = new AudioEngine();

  var world = P.createWorld(SEED);
  var pilot = null;
  var autopilotMode = false;
  var overloadMode = false;
  var keys = {};
  var trails = [];
  var camera = { x: 0, y: 0, zoom: 1 };

  function resetWorld(overload) {
    overloadMode = !!overload;
    world = P.createWorld(SEED, overload
      ? { heavyModule: { name: 'OVERLOAD', mass: 6000 } }
      : null);
    pilot = autopilotMode ? new A.Autopilot() : null;
    trails = world.modules.map(function () { return []; });
    document.getElementById('banner').style.display = 'none';
  }

  function manualInput() {
    return {
      throttle: (keys.w || keys.arrowup) ? 1 : 0,
      brake: !!(keys.s || keys.arrowdown),
      turn: (keys.d || keys.arrowright ? 1 : 0) -
        (keys.a || keys.arrowleft ? 1 : 0),
      winch: (keys.q ? 1 : 0) - (keys.e ? 1 : 0)
    };
  }

  window.addEventListener('keydown', function (e) {
    var k = e.key.toLowerCase();
    keys[k] = true;
    audio.ensure();
    if (k === ' ') {
      e.preventDefault();
      if (world.cable.attached) {
        P.detachCable(world);
      } else {
        var nearest = nearestModule();
        if (nearest >= 0) {
          P.attachCable(world, nearest);
        }
      }
    }
    if (k === 'r') {
      resetWorld(overloadMode);
    }
    if (k === 'm') {
      var muted = audio.toggleMute();
      document.getElementById('btnMute').textContent =
        '声音: ' + (muted ? '关' : '开') + ' (M)';
    }
  });

  window.addEventListener('keyup', function (e) {
    keys[e.key.toLowerCase()] = false;
  });

  function nearestModule() {
    var best = -1;
    var bestD = Infinity;
    var hitch = P.hitchWorld(world.tug, P.TUG.hitch);
    for (var i = 0; i < world.modules.length; i++) {
      var m = world.modules[i];
      if (m.recovered) {
        continue;
      }
      var d = Math.hypot(m.body.x - hitch.x, m.body.y - hitch.y);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resize);
  resize();

  function worldToScreen(x, y) {
    return {
      x: canvas.width / 2 + (x - camera.x) * camera.zoom,
      y: canvas.height / 2 + (y - camera.y) * camera.zoom
    };
  }

  function drawStars() {
    var stars = world.stars;
    for (var i = 0; i < stars.length; i++) {
      var st = stars[i];
      var px = (st.x - camera.x * st.depth) * camera.zoom +
        canvas.width / 2;
      var py = (st.y - camera.y * st.depth) * camera.zoom +
        canvas.height / 2;
      if (px < -5 || py < -5 || px > canvas.width + 5 ||
        py > canvas.height + 5) {
        continue;
      }
      var tw = 0.6 + 0.4 * Math.sin(world.time * 2 + st.twinkle);
      ctx.fillStyle = 'rgba(200,225,255,' + (st.depth * tw).toFixed(2) + ')';
      ctx.fillRect(px, py, st.size, st.size);
    }
  }

  function drawStation() {
    var s = world.station;
    var p = worldToScreen(s.x, s.y);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.strokeStyle = 'rgba(120,180,255,0.25)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, P.STATION.dockRadius * camera.zoom, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = '#5fd0ff';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(0, 0, s.radius * camera.zoom, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = '#3a86c8';
    ctx.lineWidth = 4;
    for (var i = 0; i < 4; i++) {
      var a = i * Math.PI / 2 + s.angle;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * s.radius * camera.zoom,
        Math.sin(a) * s.radius * camera.zoom);
      ctx.lineTo(Math.cos(a) * (s.radius + 18) * camera.zoom,
        Math.sin(a) * (s.radius + 18) * camera.zoom);
      ctx.stroke();
    }
    ctx.fillStyle = '#9fe4ff';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('空间站 STATION', 0, -s.radius * camera.zoom - 10);
    ctx.restore();
  }

  function drawTrails() {
    for (var i = 0; i < trails.length; i++) {
      var trail = trails[i];
      if (trail.length < 2 || world.modules[i].recovered) {
        continue;
      }
      ctx.beginPath();
      for (var j = 0; j < trail.length; j++) {
        var p = worldToScreen(trail[j].x, trail[j].y);
        if (j === 0) {
          ctx.moveTo(p.x, p.y);
        } else {
          ctx.lineTo(p.x, p.y);
        }
      }
      ctx.strokeStyle = 'rgba(255,180,90,' +
        (0.15 + 0.4 * (i + 1) / trails.length) + ')';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  function drawModules() {
    for (var i = 0; i < world.modules.length; i++) {
      var mod = world.modules[i];
      if (mod.recovered) {
        continue;
      }
      var b = mod.body;
      var p = worldToScreen(b.x, b.y);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(b.angle);
      var r = b.radius * camera.zoom;
      var overload = mod.name === 'OVERLOAD';
      ctx.strokeStyle = overload ? '#ff5c6c' : '#ffb457';
      ctx.fillStyle = overload ? 'rgba(120,30,40,0.6)'
        : 'rgba(120,80,30,0.55)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.rect(-r, -r * 0.7, r * 2, r * 1.4);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(mod.hitch.x * camera.zoom, 0);
      ctx.lineTo(mod.hitch.x * camera.zoom - 8, 0);
      ctx.strokeStyle = '#ffe6b0';
      ctx.stroke();
      ctx.rotate(-b.angle);
      ctx.fillStyle = overload ? '#ff9aa6' : '#ffd9a0';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(mod.name + ' (' + Math.round(b.mass) + 'kg)',
        0, -r - 8);
      ctx.restore();
    }
  }

  function drawTug() {
    var tug = world.tug;
    var p = worldToScreen(tug.x, tug.y);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(tug.angle);
    var r = tug.radius * camera.zoom;
    ctx.strokeStyle = '#7fd0ff';
    ctx.fillStyle = 'rgba(30,80,130,0.7)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(r * 1.3, 0);
    ctx.lineTo(-r, r * 0.8);
    ctx.lineTo(-r * 0.6, 0);
    ctx.lineTo(-r, -r * 0.8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    if (Math.abs(world.throttleLevel || 0) > 0.02) {
      var flame = r * (0.6 + Math.random() * 0.7) *
        Math.abs(world.throttleLevel);
      ctx.fillStyle = world.throttleLevel > 0
        ? 'rgba(120,220,255,0.8)' : 'rgba(255,160,80,0.85)';
      ctx.beginPath();
      ctx.moveTo(-r * 0.6, r * 0.35);
      ctx.lineTo(-r * 0.6 - flame, 0);
      ctx.lineTo(-r * 0.6, -r * 0.35);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  function drawCable() {
    if (!world.cable.attached) {
      return;
    }
    var mod = world.modules[world.cable.moduleIndex];
    if (!mod || mod.recovered) {
      return;
    }
    var a = worldToScreen(
      P.hitchWorld(world.tug, P.TUG.hitch).x,
      P.hitchWorld(world.tug, P.TUG.hitch).y);
    var b = worldToScreen(
      P.hitchWorld(mod.body, mod.hitch).x,
      P.hitchWorld(mod.body, mod.hitch).y);
    var ratio = Math.min(1, world.cable.tension / 9000);
    ctx.strokeStyle = 'rgba(' + Math.round(180 + 75 * ratio) + ',' +
      Math.round(200 - 120 * ratio) + ',255,0.9)';
    ctx.lineWidth = 1.5 + ratio * 2.5;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  function updateCamera() {
    var target = world.tug;
    camera.x += (target.x - camera.x) * 0.08;
    camera.y += (target.y - camera.y) * 0.08;
    var baseZoom = Math.min(canvas.width, canvas.height) / 900;
    camera.zoom += (baseZoom - camera.zoom) * 0.05;
  }

  function recordTrails() {
    for (var i = 0; i < world.modules.length; i++) {
      if (world.modules[i].recovered) {
        continue;
      }
      var b = world.modules[i].body;
      trails[i].push({ x: b.x, y: b.y });
      if (trails[i].length > 220) {
        trails[i].shift();
      }
    }
  }

  var statusText = {
    running: '运行中',
    won: '任务完成',
    'lost-fuel': '燃料耗尽',
    'lost-hull': '船体损毁'
  };

  function updateHud(t) {
    document.getElementById('seed').textContent =
      SEED + (overloadMode ? ' · 过载' : '');
    document.getElementById('time').textContent = t.time.toFixed(1);
    document.getElementById('recovered').textContent =
      t.recovered + '/' + t.total;
    document.getElementById('fuelBar').style.width =
      (100 * t.fuel / P.TUG.maxFuel) + '%';
    document.getElementById('hullBar').style.width = t.hull + '%';
    document.getElementById('tension').textContent =
      Math.round(t.tension);
    document.getElementById('cableLen').textContent =
      t.cableLength.toFixed(0);
    document.getElementById('effMass').textContent =
      Math.round(t.effectiveMass);
    document.getElementById('speed').textContent =
      t.tugSpeed.toFixed(0);
    document.getElementById('status').textContent =
      statusText[t.status] || t.status;
  }

  function showBanner() {
    if (world.status === 'running') {
      return;
    }
    var banner = document.getElementById('banner');
    var title = document.getElementById('bannerTitle');
    var text = document.getElementById('bannerText');
    banner.style.display = 'flex';
    if (world.status === 'won') {
      title.textContent = '任务完成';
      title.style.color = '#7dffb0';
      text.textContent = '三个模块全部回收，剩余燃料 ' +
        world.fuel.toFixed(0) + '，船体 ' + world.hull.toFixed(0) + '%';
    } else {
      title.textContent = world.status === 'lost-fuel'
        ? '燃料耗尽' : '船体损毁';
      title.style.color = '#ff7a6c';
      text.textContent = '按 R 或点击重新开始再试一次';
    }
  }

  var accumulator = 0;
  var last = performance.now();

  function frame(now) {
    var frameDt = Math.min(0.05, (now - last) / 1000);
    last = now;
    accumulator += frameDt;

    var prevEvents = world.events.length;
    while (accumulator >= P.FIXED_DT && world.status === 'running') {
      var input = autopilotMode ? pilot.update(world) : manualInput();
      P.step(world, input);
      accumulator -= P.FIXED_DT;
    }
    if (world.events.length > prevEvents) {
      for (var i = prevEvents; i < world.events.length; i++) {
        if (world.events[i].type === 'damage') {
          audio.impact(world.events[i].impulse);
        }
      }
    }

    recordTrails();
    updateCamera();
    var telemetry = P.telemetry(world);
    audio.update(telemetry);
    updateHud(telemetry);

    ctx.fillStyle = '#05070f';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawStars();
    drawStation();
    drawTrails();
    drawCable();
    drawModules();
    drawTug();
    showBanner();
    requestAnimationFrame(frame);
  }

  document.getElementById('btnRestart').addEventListener('click', function () {
    audio.ensure();
    resetWorld(overloadMode);
  });
  document.getElementById('btnAuto').addEventListener('click', function () {
    audio.ensure();
    autopilotMode = true;
    resetWorld(false);
    pilot = new A.Autopilot();
  });
  document.getElementById('btnOverload').addEventListener('click', function () {
    audio.ensure();
    autopilotMode = true;
    resetWorld(true);
    pilot = new A.Autopilot();
  });
  document.getElementById('btnMute').addEventListener('click', function () {
    audio.ensure();
    var muted = audio.toggleMute();
    this.textContent = '声音: ' + (muted ? '关' : '开') + ' (M)';
  });

  resetWorld(false);
  requestAnimationFrame(frame);
})();
