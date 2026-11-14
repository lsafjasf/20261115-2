// 渲染、输入与音效。游戏判定逻辑见 logic.js。
(function () {
  "use strict";
  const L = window.CameraLogic;
  const cv = document.getElementById("view");
  const ctx = cv.getContext("2d");
  const W = cv.width, H = cv.height;

  const ui = {
    focus: document.getElementById("focusReadout"),
    film: document.getElementById("filmReadout"),
    keepers: document.getElementById("keeperReadout"),
    ap: document.getElementById("apReadout"),
    sh: document.getElementById("shReadout"),
    msg: document.getElementById("message"),
    gallery: document.getElementById("gallery"),
    overlay: document.getElementById("overlay"),
    overlayText: document.getElementById("overlayText"),
  };

  // ---------- 游戏状态 ----------
  let game, focusDist, apIndex, shIndex, keys, flash, lastResult, resultTimer;

  function reset() {
    game = L.createGame();
    focusDist = 8;
    apIndex = 2; // f/8
    shIndex = 5; // 1/60
    keys = {};
    flash = 0;
    lastResult = null;
    resultTimer = 0;
    ui.overlay.classList.add("hidden");
    ui.gallery.innerHTML = "";
    setMessage("等待鸟儿出现……");
  }

  const aperture = () => L.APERTURES[apIndex];
  const shutter = () => L.SHUTTERS[shIndex];

  function shutterLabel(t) {
    return t >= 1 ? String(t) : "1/" + Math.round(1 / t);
  }

  function setMessage(text, bad) {
    ui.msg.textContent = text;
    ui.msg.style.color = bad ? "#d48a7a" : "#9fd48a";
  }

  // ---------- Web Audio 音效 ----------
  let ac = null;
  function audio() {
    if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)();
    if (ac.state === "suspended") ac.resume();
    return ac;
  }

  function blip(freq, dur, type, gain, when) {
    const a = audio(), t = a.currentTime + (when || 0);
    const o = a.createOscillator(), g = a.createGain();
    o.type = type || "square";
    o.frequency.value = freq;
    g.gain.setValueAtTime(gain || 0.05, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(a.destination);
    o.start(t); o.stop(t + dur);
  }

  function noiseBurst(dur, cutoff, gain, when) {
    const a = audio(), t = a.currentTime + (when || 0);
    const len = Math.max(1, Math.floor(a.sampleRate * dur));
    const buf = a.createBuffer(1, len, a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = a.createBufferSource(); src.buffer = buf;
    const f = a.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = cutoff;
    const g = a.createGain(); g.gain.value = gain;
    src.connect(f).connect(g).connect(a.destination);
    src.start(t);
  }

  const sfx = {
    focusTick(dir) { blip(dir > 0 ? 660 : 520, 0.03, "square", 0.02); },
    dialClick() { blip(880, 0.025, "square", 0.04); },
    shutter() { // 大画幅镜间快门：开-关两声
      noiseBurst(0.05, 3000, 0.5, 0);
      noiseBurst(0.04, 2200, 0.4, 0.12);
    },
    keeper() { blip(523, 0.12, "sine", 0.12); blip(784, 0.2, "sine", 0.12, 0.12); },
    fail() { blip(180, 0.25, "sawtooth", 0.08); },
    birdIn() { blip(1200, 0.06, "sine", 0.05); blip(1500, 0.08, "sine", 0.05, 0.07); },
  };

  // ---------- 输入 ----------
  window.addEventListener("keydown", (e) => {
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key)) {
      e.preventDefault();
    }
    if (e.repeat) return;
    keys[e.key.toLowerCase()] = true;
    if (game.status !== "playing") return;
    if (e.key === "ArrowUp" && apIndex > 0) { apIndex--; sfx.dialClick(); }
    if (e.key === "ArrowDown" && apIndex < L.APERTURES.length - 1) { apIndex++; sfx.dialClick(); }
    if (e.key === "ArrowLeft" && shIndex > 0) { shIndex--; sfx.dialClick(); }
    if (e.key === "ArrowRight" && shIndex < L.SHUTTERS.length - 1) { shIndex++; sfx.dialClick(); }
    if (e.key === " ") takeShot();
  });
  window.addEventListener("keyup", (e) => { keys[e.key.toLowerCase()] = false; });
  document.getElementById("restart").addEventListener("click", reset);

  // ---------- 拍摄 ----------
  function takeShot() {
    if (game.film <= 0) return;
    flash = 1;
    sfx.shutter();
    const r = L.shoot(game, focusDist, aperture(), shutter());
    if (r.error) { setMessage(r.error, true); return; }
    lastResult = r;
    resultTimer = 2.2;
    if (r.verdict === "keeper") {
      sfx.keeper();
      setMessage("✓ " + r.reason + "（" + zoneLabel(r.zone) + "）", false);
    } else {
      sfx.fail();
      setMessage("✗ " + r.reason, true);
    }
    addFrame(r);
    if (game.status === "won") endGame(true);
    else if (game.status === "lost") endGame(false);
  }

  function zoneLabel(id) {
    const z = L.ZONES.find((z) => z.id === id);
    return z ? z.label : id;
  }

  function addFrame(r) {
    const div = document.createElement("div");
    const ok = r.verdict === "keeper";
    div.className = "frame " + (ok ? "keeper" : "dud");
    div.textContent = ok ? "★ " + zoneLabel(r.zone) : r.reason;
    ui.gallery.appendChild(div);
  }

  function endGame(won) {
    ui.overlayText.textContent = won
      ? "🎉 三个距离分区全部收录，协作成功！"
      : "胶片耗尽，任务失败……";
    ui.overlay.classList.remove("hidden");
  }

  // ---------- 主循环 ----------
  let prev = performance.now();
  let birdWasThere = false;

  function loop(now) {
    const dt = Math.min((now - prev) / 1000, 0.1);
    prev = now;

    // 左玩家连续调焦（对数刻度，手感更接近对焦环）
    if (game.status === "playing") {
      const speed = 0.9 * dt;
      if (keys["w"]) { focusDist *= 1 + speed; sfx.focusTick(1); }
      if (keys["s"]) { focusDist *= 1 - speed; sfx.focusTick(-1); }
      focusDist = Math.max(L.FOCUS_MIN, Math.min(L.FOCUS_MAX, focusDist));
    }

    L.tick(game, dt);
    if (game.bird && !birdWasThere) sfx.birdIn();
    birdWasThere = !!game.bird;

    if (flash > 0) flash = Math.max(0, flash - dt * 4);
    if (resultTimer > 0) resultTimer -= dt;

    render();
    updateHud();
    requestAnimationFrame(loop);
  }

  function updateHud() {
    ui.focus.textContent = focusDist.toFixed(1);
    ui.film.textContent = game.film;
    ui.ap.textContent = aperture();
    ui.sh.textContent = shutterLabel(shutter());
    ui.keepers.textContent = game.keepers.length
      ? game.keepers.map(zoneLabel).join("、")
      : "无";
  }

  // ---------- 取景画面渲染 ----------
  // 世界纵深分层：每层有自己的“合焦距离”，按对焦距离分别虚化
  const LAYERS = [
    { dist: 2.5, draw: drawForeground },
    { dist: 9, draw: drawMidground },
    { dist: 26, draw: drawBackground },
  ];

  function blurFor(layerDist) {
    const tol = L.focusTolerance(layerDist, aperture());
    const ratio = Math.min(Math.abs(focusDist - layerDist) / (tol * 4), 1);
    return ratio * 14;
  }

  function render() {
    ctx.clearRect(0, 0, W, H);
    // 由远及近绘制
    for (let i = LAYERS.length - 1; i >= 0; i--) {
      ctx.save();
      ctx.filter = "blur(" + blurFor(LAYERS[i].dist).toFixed(1) + "px)";
      LAYERS[i].draw();
      ctx.restore();
    }
    if (game.bird) drawBird(game.bird);
    drawExposurePreview();
    drawFocusScale();
    drawExposureMeter();
    drawFrameLines();
    if (flash > 0) {
      ctx.fillStyle = "rgba(255,255,255," + (flash * 0.9).toFixed(2) + ")";
      ctx.fillRect(0, 0, W, H);
    }
  }

  function drawBackground() { // 远山与天空（远景层）
    const sky = ctx.createLinearGradient(0, 0, 0, H * 0.7);
    sky.addColorStop(0, "#8fb4d8");
    sky.addColorStop(1, "#d8cba8");
    ctx.fillStyle = sky;
    ctx.fillRect(-20, -20, W + 40, H * 0.72);
    ctx.fillStyle = "#7a8a9a";
    ctx.beginPath();
    ctx.moveTo(-20, H * 0.55);
    for (let x = -20; x <= W + 20; x += 80) {
      ctx.lineTo(x + 40, H * 0.38 + Math.sin(x * 0.05) * 30);
      ctx.lineTo(x + 80, H * 0.55);
    }
    ctx.lineTo(W + 20, H * 0.72);
    ctx.lineTo(-20, H * 0.72);
    ctx.fill();
  }

  function drawMidground() { // 树林（中景层）
    ctx.fillStyle = "#4a5a3a";
    ctx.fillRect(-20, H * 0.62, W + 40, H * 0.2);
    for (let x = 0; x < W; x += 55) {
      const h = 60 + ((x * 37) % 40);
      ctx.fillStyle = "#3a4a2e";
      ctx.beginPath();
      ctx.moveTo(x, H * 0.64);
      ctx.lineTo(x + 18, H * 0.64 - h);
      ctx.lineTo(x + 36, H * 0.64);
      ctx.fill();
    }
  }

  function drawForeground() { // 草地与石头（近景层）
    ctx.fillStyle = "#5a5232";
    ctx.fillRect(-20, H * 0.8, W + 40, H * 0.25);
    ctx.fillStyle = "#6e6540";
    for (let x = 20; x < W; x += 90) {
      ctx.beginPath();
      ctx.ellipse(x, H * 0.88 + (x % 30), 26, 12, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawBird(bird) {
    // 距离决定大小与纵向位置；虚化量由对焦误差决定
    const t = (Math.log(bird.distance) - Math.log(L.FOCUS_MIN)) /
              (Math.log(L.FOCUS_MAX) - Math.log(L.FOCUS_MIN));
    const size = 90 - t * 70; // 近大远小
    const x = W * 0.5 + Math.sin(performance.now() * 0.001) * W * 0.2;
    const y = H * (0.3 + t * 0.35);
    const f = L.focusError(focusDist, bird.distance, aperture());
    const blur = f.ratio * 16;
    const flap = Math.sin(performance.now() * 0.02) * size * 0.35;

    ctx.save();
    ctx.filter = "blur(" + blur.toFixed(1) + "px)";
    ctx.fillStyle = "#2a2622";
    ctx.beginPath(); // 身体
    ctx.ellipse(x, y, size * 0.28, size * 0.16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath(); // 双翼
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x - size * 0.5, y - size * 0.3 - flap, x - size * 0.8, y - flap);
    ctx.quadraticCurveTo(x - size * 0.4, y + size * 0.05, x, y);
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + size * 0.5, y - size * 0.3 - flap, x + size * 0.8, y - flap);
    ctx.quadraticCurveTo(x + size * 0.4, y + size * 0.05, x, y);
    ctx.fill();
    ctx.restore();

    // 停留倒计时提示
    ctx.fillStyle = "rgba(255,240,200,0.9)";
    ctx.font = "13px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("鸟 · 剩余 " + bird.timeLeft.toFixed(1) + "s", x, y - size * 0.6 - 8);
  }

  function drawExposurePreview() {
    // 取景器模拟当前曝光的明暗偏差
    const err = L.exposureError(aperture(), shutter(), game.sceneEV);
    if (err > 0) { // 欠曝：画面变暗
      ctx.fillStyle = "rgba(8,6,10," + Math.min(err * 0.18, 0.6).toFixed(2) + ")";
    } else { // 过曝：画面泛白
      ctx.fillStyle = "rgba(255,250,235," + Math.min(-err * 0.18, 0.55).toFixed(2) + ")";
    }
    ctx.fillRect(0, 0, W, H);
  }

  function drawFocusScale() {
    // 左侧对焦标尺：显示对焦距离与（若有鸟时）景深容差带
    const x0 = 26, y0 = 60, h = H - 140;
    ctx.strokeStyle = "rgba(240,225,190,0.7)";
    ctx.lineWidth = 2;
    ctx.strokeRect(x0, y0, 10, h);
    const toY = (d) => y0 + h - ((Math.log(d) - Math.log(L.FOCUS_MIN)) /
      (Math.log(L.FOCUS_MAX) - Math.log(L.FOCUS_MIN))) * h;
    ctx.font = "11px sans-serif";
    ctx.textAlign = "left";
    ctx.fillStyle = "rgba(240,225,190,0.8)";
    for (const m of [1.5, 3, 6, 12, 25, 45]) {
      ctx.fillText(m + "m", x0 + 16, toY(m) + 4);
      ctx.beginPath();
      ctx.moveTo(x0, toY(m)); ctx.lineTo(x0 + 10, toY(m));
      ctx.stroke();
    }
    if (game.bird) {
      const tol = L.focusTolerance(game.bird.distance, aperture());
      const yA = toY(Math.max(L.FOCUS_MIN, game.bird.distance - tol));
      const yB = toY(Math.min(L.FOCUS_MAX, game.bird.distance + tol));
      ctx.fillStyle = "rgba(140,220,120,0.3)";
      ctx.fillRect(x0 - 3, yB, 16, yA - yB);
    }
    const y = toY(focusDist);
    ctx.fillStyle = "#ffd76a";
    ctx.beginPath();
    ctx.moveTo(x0 - 8, y); ctx.lineTo(x0 - 1, y - 5); ctx.lineTo(x0 - 1, y + 5);
    ctx.fill();
  }

  function drawExposureMeter() {
    // 右侧曝光表：指针偏离中心即曝光不准
    const cx = W - 60, cy = H - 90, r = 46;
    const err = L.exposureError(aperture(), shutter(), game.sceneEV);
    ctx.save();
    ctx.fillStyle = "rgba(20,16,12,0.75)";
    ctx.beginPath(); ctx.arc(cx, cy, r + 12, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "rgba(240,225,190,0.6)";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI * 0.85, Math.PI * 2.15); ctx.stroke();
    for (let i = -3; i <= 3; i++) {
      const a = Math.PI * 1.5 + i * 0.32;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * (r - 7), cy + Math.sin(a) * (r - 7));
      ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      ctx.stroke();
    }
    const clamped = Math.max(-2.2, Math.min(2.2, err));
    const na = Math.PI * 1.5 + clamped * 0.32;
    ctx.strokeStyle = Math.abs(err) <= L.EXPOSURE_TOLERANCE ? "#8ce070" : "#e07050";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(na) * (r - 4), cy + Math.sin(na) * (r - 4));
    ctx.stroke();
    ctx.fillStyle = "rgba(240,225,190,0.9)";
    ctx.font = "11px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("曝光 " + (err > 0 ? "+" : "") + err.toFixed(1) + " EV", cx, cy + r + 22);
    ctx.restore();
  }

  function drawFrameLines() {
    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.lineWidth = 1;
    ctx.strokeRect(W * 0.2, H * 0.15, W * 0.6, H * 0.7);
    if (lastResult && resultTimer > 0) {
      ctx.fillStyle = lastResult.verdict === "keeper"
        ? "rgba(120,220,110,0.9)" : "rgba(220,110,90,0.9)";
      ctx.font = "bold 26px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(lastResult.reason, W / 2, 56);
    }
  }

  reset();
  requestAnimationFrame(loop);
})();
