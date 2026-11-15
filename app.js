(() => {
  "use strict";

  const TAU = Math.PI * 2;
  const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smoothstep = (min, max, value) => {
    const t = clamp((value - min) / (max - min));
    return t * t * (3 - 2 * t);
  };

  const stations = [
    {
      id: "W-01",
      name: "翼板对接缝",
      position: 18,
      optimumFocus: 44,
      hasCrack: true,
      defect: "横向裂纹",
      verdict: "NG · 裂纹",
      crackSeed: 1,
    },
    {
      id: "W-02",
      name: "腹板纵向缝",
      position: 50,
      optimumFocus: 68,
      hasCrack: false,
      defect: "未见裂纹",
      verdict: "OK · 无明显缺陷",
      crackSeed: 2,
    },
    {
      id: "W-03",
      name: "端部环焊缝",
      position: 82,
      optimumFocus: 96,
      hasCrack: true,
      defect: "焊趾分支裂纹",
      verdict: "NG · 裂纹",
      crackSeed: 3,
    },
  ];

  const state = {
    cartPosition: 50,
    actualSpeed: 0,
    speedSetting: 0,
    driveDirection: 0,
    autoStation: null,
    focus: 58,
    light: 52,
    activeStation: 1,
    captures: [null, null, null],
    lastShot: null,
    glareTests: 0,
    testRunning: false,
    flash: 0,
    shake: 0,
    distanceTravelled: 0,
    audioOn: false,
    audioMutedByUser: false,
    time: 0,
    wheelAngle: 0,
    toastTimer: 0,
  };

  const metrics = {
    focus: 1,
    exposure: 1,
    motion: 1,
    glare: 0,
    align: 1,
    clarity: 100,
    nearest: 1,
    distance: 0,
  };

  const el = {
    canvas: document.getElementById("scene"),
    stage: document.getElementById("stageFrame"),
    speed: document.getElementById("speedControl"),
    speedValue: document.getElementById("speedValue"),
    focus: document.getElementById("focusControl"),
    focusValue: document.getElementById("focusValue"),
    light: document.getElementById("lightControl"),
    lightValue: document.getElementById("lightValue"),
    focusHint: document.getElementById("focusHint"),
    glareHint: document.getElementById("glareHint"),
    targetId: document.querySelector(".target-id"),
    targetName: document.getElementById("targetName"),
    alignValue: document.getElementById("alignValue"),
    clarityBar: document.getElementById("clarityBar"),
    clarityValue: document.getElementById("clarityValue"),
    exposureBar: document.getElementById("exposureBar"),
    exposureValue: document.getElementById("exposureValue"),
    motionBar: document.getElementById("motionBar"),
    motionValue: document.getElementById("motionValue"),
    glareBar: document.getElementById("glareBar"),
    glareValue: document.getElementById("glareValue"),
    verification: document.getElementById("verification"),
    verifyState: document.getElementById("verifyState"),
    verifyShots: document.getElementById("verifyShots"),
    verifyGlare: document.getElementById("verifyGlare"),
    missionBar: document.getElementById("missionBar"),
    missionDone: document.getElementById("missionDone"),
    stageState: document.getElementById("stageState"),
    cameraMode: document.getElementById("cameraMode"),
    hudWeld: document.getElementById("hudWeld"),
    hudZoom: document.getElementById("hudZoom"),
    hudEv: document.getElementById("hudEv"),
    capture: document.getElementById("captureButton"),
    glareTest: document.getElementById("glareTestButton"),
    testChip: document.getElementById("testChip"),
    testChipText: document.getElementById("testChipText"),
    soundToggle: document.getElementById("soundToggle"),
    toast: document.getElementById("toast"),
    clock: document.getElementById("topClock"),
    footerTime: document.getElementById("footerTime"),
    driveLeft: document.getElementById("driveLeft"),
    driveRight: document.getElementById("driveRight"),
    brake: document.getElementById("brakeButton"),
    cards: [...document.querySelectorAll(".station-card")],
  };

  const canvasCtx = el.canvas.getContext("2d", { alpha: false });
  let ctx = canvasCtx;
  const beamBuffer = document.createElement("canvas");
  const beamBufferCtx = beamBuffer.getContext("2d");
  let width = 0;
  let height = 0;
  let dpr = 1;
  let lastTime = performance.now();

  function nearestStation(position = state.cartPosition) {
    let index = 0;
    let distance = Infinity;
    stations.forEach((station, i) => {
      const nextDistance = Math.abs(station.position - position);
      if (nextDistance < distance) {
        distance = nextDistance;
        index = i;
      }
    });
    return { index, distance: Math.abs(stations[index].position - position) };
  }

  function computeMetrics() {
    const nearest = nearestStation();
    const station = stations[nearest.index];
    state.activeStation = nearest.index;
    metrics.nearest = nearest.index;
    metrics.distance = nearest.distance;

    const focusError = Math.abs(state.focus - station.optimumFocus);
    metrics.focus = clamp(1 - focusError / 19);
    metrics.exposure = clamp(state.light / 46) * clamp((103 - state.light) / 23 + 0.45);
    metrics.motion = clamp(1 - state.actualSpeed / 23);
    metrics.glare = clamp((state.light - 63) / 35);
    metrics.align = clamp(1 - nearest.distance / 4.3);

    const optical = (metrics.focus * 0.39) + (metrics.exposure * 0.22) +
      (metrics.motion * 0.21) + (metrics.align * 0.18);
    metrics.clarity = optical * (1 - metrics.glare * 0.62) * 100;
    return metrics;
  }

  function updateControls() {
    const maxSpeed = state.speedSetting * 0.2;
    el.speedValue.innerHTML = `${maxSpeed.toFixed(1)} <small>m/min</small>`;
    el.focusValue.innerHTML = `${Math.round(state.focus)} <small>mm</small>`;
    el.lightValue.innerHTML = `${Math.round(state.light)} <small>%</small>`;

    el.speed.style.setProperty("--range-progress", `${state.speedSetting}%`);
    el.focus.style.setProperty("--range-progress", `${((state.focus - 24) / 111) * 100}%`);
    el.light.style.setProperty("--range-progress", `${state.light}%`);

    computeMetrics();
    const focusError = Math.abs(state.focus - stations[state.activeStation].optimumFocus);
    if (focusError <= 3.5) {
      el.focusHint.textContent = "合焦锁定";
    } else if (focusError <= 8) {
      el.focusHint.textContent = "接近合焦";
    } else if (focusError <= 15) {
      el.focusHint.textContent = "轻微失焦";
    } else {
      el.focusHint.textContent = "明显失焦";
    }

    const glarePercent = Math.round(metrics.glare * 100);
    el.glareHint.textContent = glarePercent > 62 ? `强 · ${glarePercent}%` :
      glarePercent > 28 ? `中 · ${glarePercent}%` : `低 · ${glarePercent}%`;
    el.glareHint.classList.toggle("is-hot", glarePercent > 62);

    updateMeters();
  }

  function updateMeters() {
    setMeter(el.clarityBar, el.clarityValue, metrics.clarity);
    setMeter(el.exposureBar, el.exposureValue, metrics.exposure * 100);
    setMeter(el.motionBar, el.motionValue, metrics.motion * 100);
    setMeter(el.glareBar, el.glareValue, metrics.glare * 100, true);
  }

  function setMeter(bar, label, value, inverse = false) {
    const rounded = Math.round(value);
    bar.style.width = `${clamp(value)}%`;
    label.textContent = `${rounded}%`;
    let color = "var(--cyan)";
    if (inverse) {
      color = rounded > 62 ? "var(--red)" : rounded > 30 ? "var(--amber)" : "var(--lime)";
    } else if (rounded < 45) {
      color = "var(--red)";
    } else if (rounded < 68) {
      color = "var(--amber)";
    } else {
      color = "var(--lime)";
    }
    bar.style.background = color;
  }

  class InspectionAudio {
    constructor() {
      this.context = null;
      this.master = null;
      this.motorGain = null;
      this.motorOsc = null;
      this.motorOsc2 = null;
      this.noiseGain = null;
    }

    start() {
      if (this.context) {
        if (this.context.state === "suspended") this.context.resume();
        return;
      }
      const AudioCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtor) return;

      this.context = new AudioCtor();
      this.master = this.context.createGain();
      this.master.gain.value = 0.34;
      this.master.connect(this.context.destination);

      const motorFilter = this.context.createBiquadFilter();
      motorFilter.type = "lowpass";
      motorFilter.frequency.value = 460;
      motorFilter.Q.value = 0.8;

      this.motorGain = this.context.createGain();
      this.motorGain.gain.value = 0;
      motorFilter.connect(this.motorGain);
      this.motorGain.connect(this.master);

      this.motorOsc = this.context.createOscillator();
      this.motorOsc.type = "sawtooth";
      this.motorOsc.frequency.value = 46;
      this.motorOsc.connect(motorFilter);
      this.motorOsc.start();

      this.motorOsc2 = this.context.createOscillator();
      this.motorOsc2.type = "triangle";
      this.motorOsc2.frequency.value = 92;
      const secondGain = this.context.createGain();
      secondGain.gain.value = 0.3;
      this.motorOsc2.connect(secondGain);
      secondGain.connect(motorFilter);
      this.motorOsc2.start();

      const noiseLength = this.context.sampleRate * 1.5;
      const noiseBuffer = this.context.createBuffer(1, noiseLength, this.context.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      let noiseMemory = 0;
      for (let i = 0; i < data.length; i += 1) {
        const white = Math.random() * 2 - 1;
        noiseMemory = noiseMemory * 0.96 + white * 0.04;
        data[i] = noiseMemory * 2.8;
      }
      const noise = this.context.createBufferSource();
      noise.buffer = noiseBuffer;
      noise.loop = true;
      const noiseFilter = this.context.createBiquadFilter();
      noiseFilter.type = "bandpass";
      noiseFilter.frequency.value = 185;
      noiseFilter.Q.value = 0.65;
      this.noiseGain = this.context.createGain();
      this.noiseGain.gain.value = 0;
      noise.connect(noiseFilter);
      noiseFilter.connect(this.noiseGain);
      this.noiseGain.connect(this.master);
      noise.start();
    }

    setMuted(muted) {
      if (!this.context || !this.master) return;
      this.master.gain.setTargetAtTime(muted ? 0 : 0.34, this.context.currentTime, 0.035);
    }

    update(speed, moving) {
      if (!this.context || !this.motorGain) return;
      const now = this.context.currentTime;
      const ratio = clamp(speed / 20);
      const frequency = 42 + ratio * 82 + (moving ? 2 : 0);
      this.motorOsc.frequency.setTargetAtTime(frequency, now, 0.09);
      this.motorOsc2.frequency.setTargetAtTime(frequency * 2.03, now, 0.09);
      this.motorGain.gain.setTargetAtTime(moving ? 0.055 + ratio * 0.05 : 0, now, 0.08);
      if (this.noiseGain) {
        this.noiseGain.gain.setTargetAtTime(moving ? 0.035 + ratio * 0.03 : 0, now, 0.1);
      }
    }

    shutter() {
      if (!this.context || !this.master) return;
      const now = this.context.currentTime;

      const thunk = this.context.createOscillator();
      const thunkGain = this.context.createGain();
      thunk.type = "sine";
      thunk.frequency.setValueAtTime(112, now);
      thunk.frequency.exponentialRampToValueAtTime(58, now + 0.075);
      thunkGain.gain.setValueAtTime(0.2, now);
      thunkGain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
      thunk.connect(thunkGain);
      thunkGain.connect(this.master);
      thunk.start(now);
      thunk.stop(now + 0.14);

      const clickBuffer = this.context.createBuffer(1, Math.floor(this.context.sampleRate * 0.065), this.context.sampleRate);
      const clickData = clickBuffer.getChannelData(0);
      for (let i = 0; i < clickData.length; i += 1) {
        const decay = Math.pow(1 - i / clickData.length, 4);
        clickData[i] = (Math.random() * 2 - 1) * decay;
      }
      const click = this.context.createBufferSource();
      const clickFilter = this.context.createBiquadFilter();
      const clickGain = this.context.createGain();
      click.buffer = clickBuffer;
      clickFilter.type = "highpass";
      clickFilter.frequency.value = 1350;
      clickGain.gain.value = 0.26;
      click.connect(clickFilter);
      clickFilter.connect(clickGain);
      clickGain.connect(this.master);
      click.start(now);

      const secondClick = this.context.createBufferSource();
      const secondGain = this.context.createGain();
      secondClick.buffer = clickBuffer;
      secondGain.gain.value = 0.13;
      secondClick.connect(secondGain);
      secondGain.connect(this.master);
      secondClick.start(now + 0.07);
    }
  }

  const audio = new InspectionAudio();

  function primeAudio() {
    if (state.audioMutedByUser) return;
    audio.start();
    state.audioOn = true;
    el.soundToggle.setAttribute("aria-pressed", "true");
    el.soundToggle.title = "关闭声音";
    audio.setMuted(false);
  }

  function showToast(message, type = "") {
    clearTimeout(state.toastTimer);
    el.toast.textContent = message;
    el.toast.className = `toast is-visible${type ? ` is-${type}` : ""}`;
    state.toastTimer = window.setTimeout(() => {
      el.toast.classList.remove("is-visible");
    }, 2600);
  }

  function setDrive(direction) {
    if (state.testRunning) return;
    primeAudio();
    if (direction !== 0 && state.speedSetting === 0) {
      state.speedSetting = 24;
      el.speed.value = state.speedSetting;
    }
    state.driveDirection = direction;
    state.autoStation = null;
    el.driveLeft.classList.toggle("is-held", direction < 0);
    el.driveRight.classList.toggle("is-held", direction > 0);
  }

  function brake() {
    state.driveDirection = 0;
    state.autoStation = null;
    state.speedSetting = 0;
    state.actualSpeed = 0;
    el.speed.value = 0;
    el.driveLeft.classList.remove("is-held");
    el.driveRight.classList.remove("is-held");
    updateControls();
  }

  function alignToStation(index) {
    primeAudio();
    const station = stations[index];
    state.activeStation = index;
    state.driveDirection = 0;
    state.autoStation = index;
    if (state.speedSetting === 0) {
      state.speedSetting = 38;
      el.speed.value = 38;
    }
    const direction = station.position > state.cartPosition ? 1 : -1;
    el.driveLeft.classList.toggle("is-held", direction < 0);
    el.driveRight.classList.toggle("is-held", direction > 0);
    showToast(`自动定位 ${station.id} · 目标 ${station.position.toFixed(0)}%`);
    updateStationCards();
  }

  function updateStationCards() {
    el.cards.forEach((card, index) => {
      const capture = state.captures[index];
      const station = stations[index];
      card.classList.toggle("is-active", index === state.activeStation);
      card.classList.remove("is-pass", "is-fail");
      const status = card.querySelector(".station-status");
      if (!capture) {
        status.textContent = "待拍";
        return;
      }
      status.textContent = station.hasCrack ? "清晰 · NG 裂纹" : "清晰 · OK";
      card.classList.add(station.hasCrack ? "is-fail" : "is-pass");
    });

    const done = state.captures.filter(Boolean).length;
    el.missionDone.textContent = done;
    el.missionBar.style.width = `${(done / stations.length) * 100}%`;

    el.verifyShots.textContent = `${done} / 3`;
    el.verifyGlare.textContent = `${state.glareTests > 0 ? 1 : 0} / 1`;
    const verified = done === stations.length && state.glareTests > 0;
    el.verification.classList.toggle("is-done", verified);
    el.verification.classList.toggle("is-warning", !verified && state.glareTests > 0 && done < 3);
    if (verified) {
      el.verifyState.textContent = "验收通过";
    } else if (done === stations.length) {
      el.verifyState.textContent = "待反光试验";
    } else if (state.glareTests > 0) {
      el.verifyState.textContent = "待拍齐三处";
    } else {
      el.verifyState.textContent = "采集中";
    }

    el.testChip.classList.toggle("is-done", state.glareTests > 0);
    if (state.glareTests > 0) {
      el.testChipText.textContent = `已复现 ${state.glareTests} 次 · 反光致漏判`;
    } else {
      el.testChipText.textContent = "尚未复现误判";
    }
  }

  function updateReadout() {
    const station = stations[state.activeStation];
    el.targetId.textContent = station.id;
    el.targetName.textContent = station.name;
    el.hudWeld.textContent = station.id;
    el.hudZoom.textContent = Number(state.focus).toFixed(1);
    el.hudEv.textContent = `${state.light >= 63 ? "+" : ""}${((state.light - 52) / 18).toFixed(1)}`;

    if (metrics.distance <= 1.5) {
      el.alignValue.textContent = "锁定";
    } else {
      el.alignValue.textContent = `${metrics.distance.toFixed(1)}%`;
    }

    el.cards.forEach((card, index) => {
      card.classList.toggle("is-active", index === state.activeStation);
    });

    let message = "等待定位";
    let mode = "";
    if (state.testRunning) {
      message = "反光试验曝光中";
      mode = "is-bad";
    } else if (state.actualSpeed > 0.12) {
      message = "巡检车移动中";
      mode = "is-bad";
    } else if (metrics.distance > 1.5) {
      message = `移动至 ${station.id}`;
    } else if (metrics.glare > 0.56) {
      message = "强反光 · 裂纹被遮盖";
      mode = "is-bad";
    } else if (metrics.focus < 0.68) {
      message = "失焦 · 调整镜头";
      mode = "is-bad";
    } else if (metrics.exposure < 0.68) {
      message = "补光不足";
      mode = "is-bad";
    } else if (state.captures[state.activeStation]) {
      message = `${station.id} 清晰判定完成`;
      mode = "is-ready";
    } else {
      message = "取景稳定 · 可拍摄";
      mode = "is-ready";
    }
    el.stageState.textContent = message;
    el.stageState.className = `stage-state ${mode}`;

    const allCaptured = state.captures.every(Boolean);
    if (allCaptured && state.glareTests > 0) {
      el.cameraMode.textContent = "VERIFY / COMPLETE";
    } else if (state.actualSpeed > 0.1) {
      el.cameraMode.textContent = "TRACKING / LIVE";
    } else {
      el.cameraMode.textContent = "INSPECT / LIVE";
    }
  }

  function evaluateShot() {
    computeMetrics();
    const station = stations[state.activeStation];
    const focusPass = metrics.focus >= 0.7;
    const exposurePass = metrics.exposure >= 0.7;
    const motionPass = metrics.motion >= 0.82;
    const alignPass = metrics.align >= 0.65;
    const glarePass = metrics.glare <= 0.55;
    const clarityPass = metrics.clarity >= 66;
    const reliable = focusPass && exposurePass && motionPass && alignPass && glarePass && clarityPass;
    const glareMasked = metrics.glare > 0.52;
    let judgment;

    if (glareMasked) {
      judgment = "OK · 未见裂纹";
    } else if (metrics.clarity < 48) {
      judgment = "图像不足 · 无法判读";
    } else {
      judgment = station.hasCrack ? station.verdict : "OK · 无明显缺陷";
    }

    const misjudged = glareMasked && station.hasCrack;
    return {
      station,
      stationIndex: state.activeStation,
      reliable,
      judgment,
      misjudged,
      glareMasked,
      focusPass,
      exposurePass,
      motionPass,
      alignPass,
      glarePass,
      clarityPass,
      quality: metrics.clarity,
      glare: metrics.glare,
      time: new Date(),
    };
  }

  function capture(options = {}) {
    if (state.testRunning && !options.isTest) return;
    if (metrics.distance > 3.1) {
      showToast(`取景框偏离 ${stations[state.activeStation].id}`, "error");
      triggerShutterVisual(false);
      return;
    }

    primeAudio();
    audio.shutter();
    triggerShutterVisual(true);
    state.lastShot = evaluateShot();
    const shot = state.lastShot;

    if (options.isTest) {
      finishGlareTest(shot);
      return;
    }

    if (shot.reliable) {
      state.captures[shot.stationIndex] = {
        quality: shot.quality,
        verdict: shot.judgment,
        glare: shot.glare,
        time: shot.time,
      };
      updateStationCards();
      const allDone = state.captures.every(Boolean);
      if (allDone) {
        showToast(`三处焊缝均获清晰判定 · 反光试验${state.glareTests ? "已完成" : "待执行"}`, "good");
      } else {
        showToast(`${shot.station.id} 清晰判定：${shot.judgment}`, "good");
      }
    } else {
      let reason = "清晰度不足";
      if (!shot.alignPass) reason = "车辆未对准焊缝";
      else if (!shot.motionPass) reason = "车辆仍在移动";
      else if (!shot.exposurePass) reason = "补光不足";
      else if (!shot.focusPass) reason = "镜头失焦";
      else if (!shot.glarePass) reason = "强反光遮盖裂纹";
      if (shot.misjudged) {
        showToast(`判读不可靠：${reason}，系统误报“未见裂纹”`, "error");
      } else {
        showToast(`影像不可判读：${reason}，请重拍`, "error");
      }
    }
    updateReadout();
  }

  function triggerShutterVisual(strong = true) {
    state.flash = strong ? 1 : 0.4;
    state.shake = strong ? 7 : 3;
  }

  function finishGlareTest(shot) {
    state.testRunning = false;
    el.glareTest.disabled = false;
    if (shot.misjudged) {
      state.glareTests += 1;
      updateStationCards();
      showToast("误判已复现：强反光遮住裂纹，系统误报“未见裂纹”", "error");
    } else {
      showToast("试验未形成误判：请检查补光与对位", "error");
    }
    updateReadout();
  }

  function runGlareTest() {
    if (state.testRunning) return;
    primeAudio();
    state.testRunning = true;
    el.glareTest.disabled = true;
    state.driveDirection = 0;
    state.autoStation = null;
    state.actualSpeed = 0;
    state.speedSetting = 0;
    state.cartPosition = stations[0].position;
    state.activeStation = 0;
    state.focus = stations[0].optimumFocus;
    state.light = 96;
    el.speed.value = 0;
    el.focus.value = state.focus;
    el.light.value = state.light;
    updateControls();
    updateStationCards();
    updateReadout();
    showToast("反光试验：W-01 补光 96%，镜头已合焦");

    window.setTimeout(() => {
      if (!state.testRunning) return;
      state.focus = stations[0].optimumFocus;
      state.light = 96;
      computeMetrics();
      capture({ isTest: true });
    }, 520);
  }

  function updateClock() {
    const now = new Date();
    const text = now.toLocaleTimeString("zh-CN", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    el.clock.textContent = text;
    el.footerTime.textContent = text;
  }

  el.speed.addEventListener("input", () => {
    state.speedSetting = Number(el.speed.value);
    if (state.speedSetting === 0) {
      state.driveDirection = 0;
      el.driveLeft.classList.remove("is-held");
      el.driveRight.classList.remove("is-held");
    }
    updateControls();
    updateReadout();
  });

  el.focus.addEventListener("input", () => {
    primeAudio();
    state.focus = Number(el.focus.value);
    updateControls();
    updateReadout();
  });

  el.light.addEventListener("input", () => {
    primeAudio();
    state.light = Number(el.light.value);
    updateControls();
    updateReadout();
  });

  el.capture.addEventListener("click", () => capture());
  el.glareTest.addEventListener("click", runGlareTest);
  el.brake.addEventListener("click", brake);

  el.driveLeft.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    setDrive(-1);
  });
  el.driveRight.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    setDrive(1);
  });

  ["pointerup", "pointercancel", "pointerleave"].forEach((eventName) => {
    [el.driveLeft, el.driveRight].forEach((button) => {
      button.addEventListener(eventName, () => {
        if (eventName === "pointerleave" && event.buttons === 0) return;
        state.driveDirection = 0;
        el.driveLeft.classList.remove("is-held");
        el.driveRight.classList.remove("is-held");
      });
    });
  });

  el.cards.forEach((card) => {
    card.addEventListener("click", () => {
      alignToStation(Number(card.dataset.station));
    });
  });

  el.soundToggle.addEventListener("click", () => {
    if (state.audioOn && !state.audioMutedByUser) {
      state.audioOn = false;
      state.audioMutedByUser = true;
      audio.setMuted(true);
      el.soundToggle.setAttribute("aria-pressed", "false");
      el.soundToggle.title = "开启声音";
    } else {
      state.audioMutedByUser = false;
      state.audioOn = true;
      audio.start();
      audio.setMuted(false);
      el.soundToggle.setAttribute("aria-pressed", "true");
      el.soundToggle.title = "关闭声音";
    }
  });

  const heldKeys = new Set();
  document.addEventListener("keydown", (event) => {
    const tag = event.target.tagName;
    const inControl = tag === "INPUT" || tag === "BUTTON";
    const key = event.key.toLowerCase();

    if (key === " " && !inControl) {
      event.preventDefault();
      if (!event.repeat) capture();
      return;
    }
    if (inControl) return;

    if (["a", "d", "arrowleft", "arrowright"].includes(key)) {
      event.preventDefault();
      primeAudio();
      if (state.speedSetting === 0) {
        state.speedSetting = 24;
        el.speed.value = 24;
        updateControls();
      }
      heldKeys.add(key);
      state.autoStation = null;
      state.driveDirection = key === "a" || key === "arrowleft" ? -1 : 1;
      el.driveLeft.classList.toggle("is-held", state.driveDirection < 0);
      el.driveRight.classList.toggle("is-held", state.driveDirection > 0);
    }
  });

  document.addEventListener("keyup", (event) => {
    const key = event.key.toLowerCase();
    if (!["a", "d", "arrowleft", "arrowright"].includes(key)) return;
    heldKeys.delete(key);
    if (heldKeys.size === 0) {
      state.driveDirection = 0;
      el.driveLeft.classList.remove("is-held");
      el.driveRight.classList.remove("is-held");
    } else {
      const last = [...heldKeys].pop();
      state.driveDirection = last === "a" || last === "arrowleft" ? -1 : 1;
    }
  });

  window.addEventListener("blur", () => {
    heldKeys.clear();
    state.driveDirection = 0;
    el.driveLeft.classList.remove("is-held");
    el.driveRight.classList.remove("is-held");
  });

  function tick(now) {
    const dt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;
    state.time += dt;

    const maxSpeed = state.speedSetting * 0.2;
    let moving = false;

    if (state.autoStation !== null) {
      const destination = stations[state.autoStation].position;
      const distance = destination - state.cartPosition;
      if (Math.abs(distance) < 0.34) {
        state.cartPosition = destination;
        state.actualSpeed = 0;
        state.speedSetting = 0;
        state.driveDirection = 0;
        state.autoStation = null;
        el.speed.value = 0;
        el.driveLeft.classList.remove("is-held");
        el.driveRight.classList.remove("is-held");
        showToast(`已停靠 ${stations[state.activeStation].id} · 请调整焦距`);
      } else {
        const direction = Math.sign(distance);
        const approach = clamp(Math.abs(distance) / 3.2, 0.12, 1);
        state.actualSpeed = maxSpeed * approach;
        state.cartPosition += direction * state.actualSpeed * dt * 0.82;
        moving = true;
      }
    } else if (state.driveDirection !== 0 && maxSpeed > 0) {
      const boundsHit = (state.driveDirection < 0 && state.cartPosition <= 5) ||
        (state.driveDirection > 0 && state.cartPosition >= 95);
      if (boundsHit) {
        state.cartPosition = clamp(state.cartPosition, 5, 95);
        state.actualSpeed = 0;
      } else {
        state.actualSpeed = maxSpeed;
        state.cartPosition += state.driveDirection * maxSpeed * dt * 0.82;
        moving = true;
      }
    } else {
      state.actualSpeed = 0;
    }

    state.cartPosition = clamp(state.cartPosition, 5, 95);
    state.distanceTravelled += state.actualSpeed * dt;
    state.wheelAngle += state.actualSpeed * dt * 0.22;
    state.flash = Math.max(0, state.flash - dt * 4.2);
    state.shake = Math.max(0, state.shake - dt * 28);

    computeMetrics();
    state.activeStation = metrics.nearest;
    audio.update(state.actualSpeed, moving);

    draw();
    updateReadout();
    updateMeters();
    requestAnimationFrame(tick);
  }

  function resizeCanvas() {
    const rect = el.stage.getBoundingClientRect();
    width = Math.max(320, rect.width);
    height = Math.max(300, rect.height);
    dpr = Math.min(2, window.devicePixelRatio || 1);
    el.canvas.width = Math.floor(width * dpr);
    el.canvas.height = Math.floor(height * dpr);
    canvasCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx = canvasCtx;
  }

  function seededRandom(seed) {
    let value = seed >>> 0;
    return () => {
      value = (value * 1664525 + 1013904223) >>> 0;
      return value / 4294967296;
    };
  }

  function getLayout() {
    return {
      beamX: width * 0.035,
      beamW: width * 0.93,
      top: height * 0.16,
      flangeH: height * 0.095,
      webTop: height * 0.255,
      webBottom: height * 0.505,
      lowerFlangeH: height * 0.105,
      bottom: height * 0.61,
      railY: height * 0.815,
      floorY: height * 0.65,
    };
  }

  function stationX(station) {
    const layout = getLayout();
    return layout.beamX + (station.position / 100) * layout.beamW;
  }

  function cartX() {
    const layout = getLayout();
    return layout.beamX + (state.cartPosition / 100) * layout.beamW;
  }

  function drawBackground() {
    const bg = ctx.createLinearGradient(0, 0, 0, height);
    bg.addColorStop(0, "#05090b");
    bg.addColorStop(0.5, "#10181a");
    bg.addColorStop(0.72, "#0b1214");
    bg.addColorStop(1, "#060a0b");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    const ambient = ctx.createRadialGradient(width * 0.48, height * 0.3, 0, width * 0.5, height * 0.42, width * 0.62);
    ambient.addColorStop(0, "rgba(100, 128, 130, 0.16)");
    ambient.addColorStop(0.48, "rgba(42, 57, 60, 0.08)");
    ambient.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = ambient;
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.strokeStyle = "rgba(131, 153, 154, 0.085)";
    ctx.lineWidth = 1;
    const columnXs = [0.075, 0.305, 0.535, 0.765, 0.945];
    columnXs.forEach((fraction, index) => {
      const x = width * fraction;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height * 0.72);
      ctx.stroke();
      if (index < columnXs.length - 1) {
        const next = width * columnXs[index + 1];
        ctx.beginPath();
        ctx.moveTo(x, height * 0.23);
        ctx.lineTo(next, height * 0.49);
        ctx.moveTo(next, height * 0.23);
        ctx.lineTo(x, height * 0.49);
        ctx.stroke();
      }
    });

    ctx.fillStyle = "rgba(1, 3, 4, 0.34)";
    ctx.fillRect(0, height * 0.085, width, 4);
    ctx.fillStyle = "rgba(149, 166, 165, 0.08)";
    ctx.fillRect(0, height * 0.083, width, 1);

    const lampGlow = ctx.createRadialGradient(width * 0.52, height * 0.02, 0, width * 0.52, height * 0.02, width * 0.42);
    lampGlow.addColorStop(0, "rgba(176, 193, 184, 0.09)");
    lampGlow.addColorStop(1, "rgba(176, 193, 184, 0)");
    ctx.fillStyle = lampGlow;
    ctx.fillRect(0, 0, width, height * 0.36);
    ctx.restore();

    drawFactoryFloor();

    const dust = seededRandom(71);
    ctx.fillStyle = "rgba(197, 210, 201, 0.24)";
    for (let i = 0; i < 26; i += 1) {
      const x = dust() * width;
      const baseY = height * (0.08 + dust() * 0.54);
      const y = baseY + Math.sin(state.time * 0.25 + i * 2.1) * 3;
      ctx.globalAlpha = 0.1 + dust() * 0.26;
      ctx.fillRect(x, y, dust() > 0.82 ? 1.4 : 0.7, dust() > 0.82 ? 1.4 : 0.7);
    }
    ctx.globalAlpha = 1;
  }

  function drawFactoryFloor() {
    const layout = getLayout();
    const floorGradient = ctx.createLinearGradient(0, layout.floorY, 0, height);
    floorGradient.addColorStop(0, "rgba(22, 30, 32, 0.3)");
    floorGradient.addColorStop(0.55, "rgba(9, 14, 15, 0.85)");
    floorGradient.addColorStop(1, "#05090a");
    ctx.fillStyle = floorGradient;
    ctx.fillRect(0, layout.floorY, width, height - layout.floorY);

    ctx.save();
    ctx.strokeStyle = "rgba(128, 147, 147, 0.09)";
    ctx.lineWidth = 1;
    const vanishX = width * 0.49;
    const vanishY = height * 0.56;
    for (let i = -6; i <= 6; i += 1) {
      ctx.beginPath();
      ctx.moveTo(vanishX + i * 8, vanishY);
      ctx.lineTo(vanishX + i * width * 0.16, height);
      ctx.stroke();
    }
    for (let i = 0; i < 5; i += 1) {
      const t = i / 5;
      const y = lerp(height * 0.66, height, t * t);
      ctx.globalAlpha = 0.65 - t * 0.45;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawBeamBody() {
    const layout = getLayout();
    const left = layout.beamX;
    const right = layout.beamX + layout.beamW;
    const beamWidth = right - left;
    const top = layout.top;
    const bottom = layout.bottom;

    const shadow = ctx.createLinearGradient(0, top + 10, 0, bottom + height * 0.05);
    shadow.addColorStop(0, "rgba(0, 0, 0, 0.52)");
    shadow.addColorStop(0.6, "rgba(0, 0, 0, 0.2)");
    shadow.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = shadow;
    ctx.fillRect(left - 12, top + 7, beamWidth + 24, bottom - top + height * 0.09);

    const topFlange = ctx.createLinearGradient(0, top, 0, layout.webTop);
    topFlange.addColorStop(0, "#718084");
    topFlange.addColorStop(0.08, "#566469");
    topFlange.addColorStop(0.48, "#414d51");
    topFlange.addColorStop(0.86, "#2d373b");
    topFlange.addColorStop(1, "#1d2629");
    ctx.fillStyle = topFlange;
    ctx.fillRect(left, top, beamWidth, layout.flangeH);

    ctx.fillStyle = "rgba(192, 207, 205, 0.32)";
    ctx.fillRect(left, top, beamWidth, 2);
    ctx.fillStyle = "rgba(8, 12, 13, 0.7)";
    ctx.fillRect(left, top + layout.flangeH - 3, beamWidth, 3);

    const web = ctx.createLinearGradient(0, layout.webTop, 0, layout.webBottom);
    web.addColorStop(0, "#2a3438");
    web.addColorStop(0.2, "#384348");
    web.addColorStop(0.55, "#2e393d");
    web.addColorStop(1, "#222c2f");
    ctx.fillStyle = web;
    ctx.fillRect(left, layout.webTop, beamWidth, layout.webBottom - layout.webTop);

    const webLight = ctx.createLinearGradient(left, 0, right, 0);
    webLight.addColorStop(0, "rgba(0, 0, 0, 0.38)");
    webLight.addColorStop(0.16, "rgba(255, 255, 255, 0.025)");
    webLight.addColorStop(0.5, "rgba(255, 255, 255, 0.07)");
    webLight.addColorStop(0.84, "rgba(255, 255, 255, 0.02)");
    webLight.addColorStop(1, "rgba(0, 0, 0, 0.42)");
    ctx.fillStyle = webLight;
    ctx.fillRect(left, layout.webTop, beamWidth, layout.webBottom - layout.webTop);

    const lowerFlange = ctx.createLinearGradient(0, layout.webBottom, 0, bottom);
    lowerFlange.addColorStop(0, "#566368");
    lowerFlange.addColorStop(0.13, "#3e4a4e");
    lowerFlange.addColorStop(0.52, "#313c40");
    lowerFlange.addColorStop(0.9, "#202a2d");
    lowerFlange.addColorStop(1, "#151d20");
    ctx.fillStyle = lowerFlange;
    ctx.fillRect(left, layout.webBottom, beamWidth, bottom - layout.webBottom);
    ctx.fillStyle = "rgba(191, 205, 203, 0.22)";
    ctx.fillRect(left, layout.webBottom, beamWidth, 1.5);
    ctx.fillStyle = "rgba(0, 0, 0, 0.85)";
    ctx.fillRect(left, bottom - 2, beamWidth, 2);

    ctx.save();
    ctx.beginPath();
    ctx.rect(left, top, beamWidth, bottom - top);
    ctx.clip();

    const noise = seededRandom(19);
    for (let i = 0; i < 100; i += 1) {
      const y = top + noise() * (bottom - top);
      const x = left + noise() * beamWidth;
      const length = 5 + noise() * 68;
      ctx.strokeStyle = noise() > 0.62
        ? `rgba(206, 218, 214, ${0.018 + noise() * 0.035})`
        : `rgba(0, 0, 0, ${0.03 + noise() * 0.07})`;
      ctx.lineWidth = noise() > 0.8 ? 1.2 : 0.65;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + length, y + (noise() - 0.5) * 1.2);
      ctx.stroke();
    }

    for (let i = 0; i < 33; i += 1) {
      const x = left + 28 + noise() * (beamWidth - 56);
      const y = layout.webBottom + layout.lowerFlangeH * 0.34;
      ctx.fillStyle = "rgba(13, 18, 20, 0.6)";
      ctx.beginPath();
      ctx.arc(x, y, 2.1, 0, TAU);
      ctx.fill();
      ctx.fillStyle = "rgba(156, 171, 168, 0.16)";
      ctx.beginPath();
      ctx.arc(x - 0.4, y - 0.6, 1.15, 0, TAU);
      ctx.fill();
    }
    ctx.restore();

    ctx.strokeStyle = "rgba(182, 199, 195, 0.26)";
    ctx.lineWidth = 1;
    ctx.strokeRect(left + 0.5, top + 0.5, beamWidth - 1, bottom - top - 1);

    drawBeamEnds(left, right, top, bottom);
  }

  function drawBeamEnds(left, right, top, bottom) {
    const depth = width * 0.022;
    ctx.fillStyle = "#1b2427";
    ctx.beginPath();
    ctx.moveTo(left, top);
    ctx.lineTo(left - depth, top + depth * 0.7);
    ctx.lineTo(left - depth, bottom - depth * 0.4);
    ctx.lineTo(left, bottom);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#11191b";
    ctx.beginPath();
    ctx.moveTo(right, top);
    ctx.lineTo(right + depth, top + depth * 0.7);
    ctx.lineTo(right + depth, bottom - depth * 0.4);
    ctx.lineTo(right, bottom);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(159, 176, 174, 0.18)";
    ctx.beginPath();
    ctx.moveTo(right, top);
    ctx.lineTo(right + depth, top + depth * 0.7);
    ctx.stroke();
  }

  function drawWelds() {
    stations.forEach((station, index) => {
      drawSingleWeld(station, index);
    });
  }

  function drawSingleWeld(station, index) {
    const layout = getLayout();
    const cx = stationX(station);
    const bandW = clamp(width * 0.045, 30, 58);
    const top = layout.top + layout.flangeH * 0.22;
    const bottom = layout.bottom - layout.lowerFlangeH * 0.16;
    const phase = index * 1.8 + 0.4;

    const edge = (y, side) => {
      const ripple = Math.sin(y * 0.12 + phase) * 1.8 + Math.sin(y * 0.037 + phase * 2) * 1.2;
      const taper = 1 - Math.max(0, (y - top) / (bottom - top)) * 0.16;
      return cx + side * (bandW * 0.5 * taper) + ripple;
    };

    const haz = ctx.createLinearGradient(cx - bandW, 0, cx + bandW, 0);
    haz.addColorStop(0, "rgba(72, 57, 39, 0)");
    haz.addColorStop(0.3, "rgba(97, 70, 43, 0.22)");
    haz.addColorStop(0.5, "rgba(119, 82, 48, 0.3)");
    haz.addColorStop(0.7, "rgba(87, 65, 42, 0.2)");
    haz.addColorStop(1, "rgba(66, 53, 37, 0)");
    ctx.fillStyle = haz;
    ctx.fillRect(cx - bandW * 1.1, top, bandW * 2.2, bottom - top);

    ctx.beginPath();
    ctx.moveTo(edge(top, -1), top);
    for (let y = top; y <= bottom; y += 7) {
      ctx.lineTo(edge(y, -1), y);
    }
    for (let y = bottom; y >= top; y -= 7) {
      ctx.lineTo(edge(y, 1), y);
    }
    ctx.closePath();

    const weldGradient = ctx.createLinearGradient(cx - bandW * 0.5, 0, cx + bandW * 0.5, 0);
    weldGradient.addColorStop(0, "#272d2c");
    weldGradient.addColorStop(0.16, "#555d58");
    weldGradient.addColorStop(0.42, "#747b72");
    weldGradient.addColorStop(0.58, "#656b63");
    weldGradient.addColorStop(0.82, "#434a46");
    weldGradient.addColorStop(1, "#242a29");
    ctx.fillStyle = weldGradient;
    ctx.fill();

    ctx.save();
    ctx.clip();
    const random = seededRandom(101 + station.crackSeed * 17);
    const beadStep = clamp(height * 0.014, 7, 12);
    for (let y = top + 4; y < bottom; y += beadStep) {
      const offset = Math.sin(y * 0.11 + phase) * 2.6;
      ctx.strokeStyle = "rgba(13, 17, 17, 0.36)";
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      ctx.ellipse(cx + offset, y, bandW * 0.43, beadStep * 0.52, -0.04, 0, Math.PI);
      ctx.stroke();
      ctx.strokeStyle = "rgba(190, 197, 178, 0.16)";
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.ellipse(cx + offset, y - 0.8, bandW * 0.36, beadStep * 0.43, -0.04, Math.PI * 1.06, Math.PI * 1.92);
      ctx.stroke();
    }

    for (let i = 0; i < 22; i += 1) {
      const x = cx - bandW * 0.46 + random() * bandW * 0.92;
      const y = top + 5 + random() * (bottom - top - 10);
      ctx.fillStyle = random() > 0.45 ? "rgba(13, 16, 16, 0.32)" : "rgba(210, 199, 165, 0.14)";
      ctx.beginPath();
      ctx.arc(x, y, 0.45 + random() * 1.3, 0, TAU);
      ctx.fill();
    }
    ctx.restore();

    ctx.strokeStyle = "rgba(207, 213, 198, 0.18)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let y = top; y <= bottom; y += 7) {
      const x = edge(y, -1) + 1;
      if (y === top) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    drawWeldSpatter(cx, top, bottom, bandW, station.crackSeed);
    if (station.hasCrack) {
      drawCrack(station, cx, top, bottom);
    }
  }

  function drawWeldSpatter(cx, top, bottom, bandW, seed) {
    const random = seededRandom(209 + seed * 13);
    ctx.fillStyle = "rgba(23, 27, 25, 0.55)";
    for (let i = 0; i < 18; i += 1) {
      const side = random() > 0.5 ? 1 : -1;
      const x = cx + side * (bandW * 0.58 + random() * bandW * 0.52);
      const y = top + random() * (bottom - top);
      const radius = 0.5 + random() * 1.6;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, TAU);
      ctx.fill();
    }
  }

  function drawCrack(station, cx, top, bottom) {
    const scale = clamp(width / 1000, 0.78, 1.18);
    const webY = top + (bottom - top) * 0.25;
    let paths;

    if (station.crackSeed === 1) {
      paths = [
        [
          [cx - 4 * scale, webY],
          [cx + 7 * scale, webY - 3 * scale],
          [cx + 14 * scale, webY + 4 * scale],
          [cx + 24 * scale, webY + 1 * scale],
          [cx + 34 * scale, webY + 7 * scale],
          [cx + 44 * scale, webY + 3 * scale],
        ],
        [
          [cx + 14 * scale, webY + 4 * scale],
          [cx + 17 * scale, webY + 13 * scale],
          [cx + 23 * scale, webY + 17 * scale],
        ],
      ];
    } else {
      paths = [
        [
          [cx + 2 * scale, webY - 13 * scale],
          [cx + 7 * scale, webY - 2 * scale],
          [cx + 4 * scale, webY + 10 * scale],
          [cx + 12 * scale, webY + 23 * scale],
          [cx + 9 * scale, webY + 37 * scale],
          [cx + 17 * scale, webY + 51 * scale],
        ],
        [
          [cx + 4 * scale, webY + 10 * scale],
          [cx + 18 * scale, webY + 6 * scale],
          [cx + 30 * scale, webY + 12 * scale],
        ],
        [
          [cx + 12 * scale, webY + 23 * scale],
          [cx - 5 * scale, webY + 31 * scale],
          [cx - 11 * scale, webY + 42 * scale],
        ],
      ];
    }

    ctx.save();
    paths.forEach((points) => {
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "rgba(9, 11, 11, 0.95)";
      ctx.lineWidth = 2.1 * scale;
      ctx.beginPath();
      points.forEach(([x, y], index) => {
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();

      ctx.strokeStyle = "rgba(209, 202, 173, 0.38)";
      ctx.lineWidth = 0.65 * scale;
      ctx.beginPath();
      points.forEach(([x, y], index) => {
        if (index === 0) ctx.moveTo(x + 0.7, y - 0.7);
        else ctx.lineTo(x + 0.7, y - 0.7);
      });
      ctx.stroke();
    });
    ctx.restore();
  }

  function drawLighting() {
    const layout = getLayout();
    const station = stations[state.activeStation];
    const weldX = stationX(station);
    const frameCenterY = layout.top + (layout.bottom - layout.top) * 0.43;
    const lightRatio = state.light / 100;

    const darkness = 0.13 + (1 - metrics.exposure) * 0.67;
    ctx.fillStyle = `rgba(2, 5, 6, ${darkness.toFixed(3)})`;
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.globalCompositeOperation = "screen";
    const spot = ctx.createRadialGradient(weldX, frameCenterY, 2, weldX, frameCenterY, width * (0.11 + lightRatio * 0.13));
    spot.addColorStop(0, `rgba(255, 225, 175, ${0.24 + lightRatio * 0.34})`);
    spot.addColorStop(0.42, `rgba(217, 190, 144, ${0.12 + lightRatio * 0.18})`);
    spot.addColorStop(1, "rgba(170, 150, 114, 0)");
    ctx.fillStyle = spot;
    ctx.fillRect(0, 0, width, height);

    drawLightCone(weldX, frameCenterY, lightRatio);
    ctx.restore();

    const vignette = ctx.createRadialGradient(
      width * 0.5,
      height * 0.47,
      Math.min(width, height) * 0.26,
      width * 0.5,
      height * 0.48,
      Math.max(width, height) * 0.75
    );
    vignette.addColorStop(0, "rgba(0, 0, 0, 0)");
    vignette.addColorStop(0.72, "rgba(0, 0, 0, 0.18)");
    vignette.addColorStop(1, "rgba(0, 0, 0, 0.64)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, width, height);

    if (metrics.glare > 0.08) {
      drawGlare(weldX, frameCenterY);
    }
  }

  function drawLightCone(targetX, targetY, lightRatio) {
    const layout = getLayout();
    const lampX = cartX();
    const lampY = layout.railY - height * 0.075;
    const frameWidth = clamp(width * 0.24, 175, 330);
    const alpha = 0.05 + lightRatio * 0.14;
    const cone = ctx.createLinearGradient(0, lampY, 0, targetY);
    cone.addColorStop(0, `rgba(255, 216, 159, ${alpha * 0.7})`);
    cone.addColorStop(0.65, `rgba(255, 224, 175, ${alpha})`);
    cone.addColorStop(1, "rgba(255, 225, 180, 0)");
    ctx.fillStyle = cone;
    ctx.beginPath();
    ctx.moveTo(lampX - 19, lampY);
    ctx.lineTo(targetX - frameWidth * 0.52, targetY + 25);
    ctx.lineTo(targetX + frameWidth * 0.52, targetY + 25);
    ctx.lineTo(lampX + 19, lampY);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = `rgba(255, 221, 174, ${0.1 + lightRatio * 0.12})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(lampX - 11, lampY);
    ctx.lineTo(targetX - frameWidth * 0.53, targetY + 25);
    ctx.moveTo(lampX + 11, lampY);
    ctx.lineTo(targetX + frameWidth * 0.53, targetY + 25);
    ctx.stroke();
  }

  function drawGlare(weldX, centerY) {
    const strength = smoothstep(0.06, 0.94, metrics.glare);
    const radius = clamp(width * 0.055 + width * 0.13 * strength, 42, 190);
    const flicker = 0.985 + Math.sin(state.time * 9.2) * 0.015;

    ctx.save();
    ctx.globalCompositeOperation = "screen";

    const hot = ctx.createRadialGradient(weldX - radius * 0.18, centerY, 1, weldX, centerY, radius);
    hot.addColorStop(0, `rgba(255, 255, 248, ${0.66 * strength + 0.13})`);
    hot.addColorStop(0.18, `rgba(255, 250, 227, ${0.54 * strength})`);
    hot.addColorStop(0.42, `rgba(255, 222, 163, ${0.32 * strength})`);
    hot.addColorStop(0.7, `rgba(255, 195, 111, ${0.1 * strength})`);
    hot.addColorStop(1, "rgba(255, 190, 100, 0)");
    ctx.fillStyle = hot;
    ctx.beginPath();
    ctx.ellipse(weldX, centerY, radius * 1.02 * flicker, radius * 0.9, -0.15, 0, TAU);
    ctx.fill();

    const flare = ctx.createLinearGradient(weldX - radius * 2.3, centerY, weldX + radius * 2.3, centerY);
    flare.addColorStop(0, "rgba(255, 196, 105, 0)");
    flare.addColorStop(0.26, `rgba(255, 204, 120, ${strength * 0.15})`);
    flare.addColorStop(0.48, `rgba(255, 255, 239, ${strength * 0.62})`);
    flare.addColorStop(0.52, `rgba(255, 255, 245, ${strength * 0.7})`);
    flare.addColorStop(0.74, `rgba(255, 205, 125, ${strength * 0.15})`);
    flare.addColorStop(1, "rgba(255, 196, 105, 0)");
    ctx.fillStyle = flare;
    ctx.fillRect(weldX - radius * 2.3, centerY - 2.2, radius * 4.6, 4.4);

    const vertical = ctx.createLinearGradient(weldX, centerY - radius * 1.4, weldX, centerY + radius * 1.4);
    vertical.addColorStop(0, "rgba(255, 220, 153, 0)");
    vertical.addColorStop(0.44, `rgba(255, 244, 210, ${strength * 0.16})`);
    vertical.addColorStop(0.5, `rgba(255, 255, 250, ${strength * 0.24})`);
    vertical.addColorStop(0.56, `rgba(255, 244, 210, ${strength * 0.16})`);
    vertical.addColorStop(1, "rgba(255, 220, 153, 0)");
    ctx.fillStyle = vertical;
    ctx.fillRect(weldX - 1.4, centerY - radius * 1.4, 2.8, radius * 2.8);

    for (let i = 0; i < 5; i += 1) {
      const ghostX = weldX + Math.sin(i * 2.4 + 0.8) * radius * (0.9 + i * 0.33);
      const ghostY = centerY + Math.cos(i * 1.9) * radius * 0.65;
      const ghostRadius = radius * (0.07 + i * 0.018);
      const ghost = ctx.createRadialGradient(ghostX, ghostY, 0, ghostX, ghostY, ghostRadius);
      ghost.addColorStop(0, `rgba(255, 235, 198, ${strength * (0.42 - i * 0.055)})`);
      ghost.addColorStop(0.55, `rgba(255, 196, 126, ${strength * (0.15 - i * 0.02)})`);
      ghost.addColorStop(1, "rgba(255, 196, 126, 0)");
      ctx.fillStyle = ghost;
      ctx.beginPath();
      ctx.arc(ghostX, ghostY, ghostRadius, 0, TAU);
      ctx.fill();
    }

    ctx.strokeStyle = `rgba(255, 255, 250, ${strength * 0.35})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(weldX, centerY, radius * 0.92, -0.7, 1.4);
    ctx.stroke();
    ctx.restore();
  }

  function drawTrackAndCart() {
    const layout = getLayout();
    drawTrack(layout);
    drawCart(layout);
  }

  function drawTrack(layout) {
    const y = layout.railY;
    const left = layout.beamX - width * 0.018;
    const right = layout.beamX + layout.beamW + width * 0.018;

    const railGlow = ctx.createLinearGradient(0, y - 14, 0, y + 20);
    railGlow.addColorStop(0, "rgba(0, 0, 0, 0)");
    railGlow.addColorStop(0.48, "rgba(0, 0, 0, 0.45)");
    railGlow.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = railGlow;
    ctx.fillRect(left, y - 14, right - left, 36);

    ctx.fillStyle = "#303b3e";
    ctx.fillRect(left, y - 2, right - left, 4);
    ctx.fillStyle = "#8a9695";
    ctx.fillRect(left, y - 3, right - left, 1.2);
    ctx.fillStyle = "#11181a";
    ctx.fillRect(left, y + 2, right - left, 8);

    ctx.fillStyle = "#1b2427";
    const sleeperStep = width * 0.035;
    for (let x = left; x < right; x += sleeperStep) {
      ctx.fillRect(x, y + 7, 2.5, height * 0.038);
    }

    ctx.strokeStyle = "rgba(149, 163, 160, 0.16)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(left, y - 3.5);
    ctx.lineTo(right, y - 3.5);
    ctx.stroke();

    const arrowX = width * 0.055;
    ctx.fillStyle = "rgba(242, 168, 75, 0.32)";
    ctx.beginPath();
    ctx.moveTo(arrowX, y + height * 0.042);
    ctx.lineTo(arrowX + 18, y + height * 0.052);
    ctx.lineTo(arrowX + 18, y + height * 0.060);
    ctx.lineTo(arrowX, y + height * 0.051);
    ctx.closePath();
    ctx.fill();
  }

  function drawCart(layout) {
    const x = cartX();
    const railY = layout.railY;
    const bodyW = clamp(width * 0.095, 54, 90);
    const wheelR = clamp(bodyW * 0.16, 7, 12);
    const bodyH = bodyW * 0.43;
    const bodyX = x - bodyW / 2;
    const bodyY = railY - wheelR * 2 - bodyH;
    const mastTop = layout.webBottom + height * 0.075;
    const speedRatio = clamp(state.actualSpeed / 20);

    if (speedRatio > 0.05) {
      ctx.strokeStyle = `rgba(242, 168, 75, ${speedRatio * 0.16})`;
      ctx.lineWidth = 1;
      for (let i = 1; i < 5; i += 1) {
        const trail = state.driveDirection === 0 ? -1 : state.driveDirection;
        ctx.beginPath();
        ctx.moveTo(x + trail * (bodyW * 0.3 + i * 10), bodyY + bodyH * 0.3);
        ctx.lineTo(x + trail * (bodyW * 0.7 + i * 18), bodyY + bodyH * 0.3);
        ctx.stroke();
      }
    }

    ctx.fillStyle = "rgba(0, 0, 0, 0.48)";
    ctx.beginPath();
    ctx.ellipse(x, railY + 19, bodyW * 0.58, 8, 0, 0, TAU);
    ctx.fill();

    const poleWidth = clamp(bodyW * 0.055, 4, 6);
    ctx.fillStyle = "#384447";
    ctx.fillRect(x - poleWidth / 2, mastTop, poleWidth, bodyY - mastTop + 8);
    ctx.fillStyle = "rgba(197, 208, 203, 0.19)";
    ctx.fillRect(x - poleWidth / 2 + 1, mastTop, 1, bodyY - mastTop + 8);

    const cameraY = mastTop + 4;
    ctx.fillStyle = "#131b1e";
    ctx.fillRect(x - 17, cameraY - 5, 34, 17);
    ctx.fillStyle = "#2d383b";
    ctx.fillRect(x - 13, cameraY - 2, 26, 11);
    ctx.fillStyle = "#080d0f";
    ctx.beginPath();
    ctx.arc(x, cameraY + 3, 6.4, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#536166";
    ctx.beginPath();
    ctx.arc(x, cameraY + 3, 3.4, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "rgba(218, 231, 225, 0.55)";
    ctx.beginPath();
    ctx.arc(x - 1.5, cameraY + 1.5, 1.35, 0, TAU);
    ctx.fill();

    ctx.fillStyle = "#12191c";
    ctx.beginPath();
    ctx.roundRect(bodyX, bodyY, bodyW, bodyH, 3);
    ctx.fill();
    const bodyGradient = ctx.createLinearGradient(bodyX, bodyY, bodyX, bodyY + bodyH);
    bodyGradient.addColorStop(0, "#3a4649");
    bodyGradient.addColorStop(0.34, "#263135");
    bodyGradient.addColorStop(1, "#11191b");
    ctx.fillStyle = bodyGradient;
    ctx.beginPath();
    ctx.roundRect(bodyX + 2, bodyY + 2, bodyW - 4, bodyH - 4, 2);
    ctx.fill();

    ctx.fillStyle = "rgba(11, 15, 17, 0.5)";
    ctx.fillRect(bodyX + bodyW * 0.13, bodyY + bodyH * 0.22, bodyW * 0.48, bodyH * 0.36);
    ctx.strokeStyle = "rgba(205, 215, 209, 0.13)";
    ctx.lineWidth = 1;
    ctx.strokeRect(bodyX + bodyW * 0.13, bodyY + bodyH * 0.22, bodyW * 0.48, bodyH * 0.36);
    ctx.fillStyle = "rgba(242, 168, 75, 0.8)";
    ctx.fillRect(bodyX + bodyW * 0.16, bodyY + bodyH * 0.29, bodyW * 0.12, 2);

    ctx.font = '500 6px "Cascadia Mono", monospace';
    ctx.fillStyle = "rgba(218, 224, 219, 0.56)";
    ctx.fillText("SEAM/03", bodyX + bodyW * 0.16, bodyY + bodyH * 0.49);

    ctx.fillStyle = "#101719";
    ctx.beginPath();
    ctx.roundRect(bodyX - bodyW * 0.07, bodyY + bodyH * 0.15, bodyW * 0.11, bodyH * 0.44, 2);
    ctx.fill();
    ctx.fillStyle = "#f1a54c";
    ctx.fillRect(bodyX - bodyW * 0.045, bodyY + bodyH * 0.23, 4, bodyH * 0.22);

    ctx.fillStyle = "#0a0f11";
    ctx.beginPath();
    ctx.roundRect(x - bodyW * 0.34, bodyY + bodyH * 0.45, bodyW * 0.68, bodyH * 0.42, 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(140, 157, 155, 0.17)";
    ctx.strokeRect(x - bodyW * 0.34, bodyY + bodyH * 0.45, bodyW * 0.68, bodyH * 0.42);

    const wheelOffsets = [-bodyW * 0.29, bodyW * 0.29];
    wheelOffsets.forEach((offset, index) => {
      const wheelX = x + offset;
      const wheelY = railY - wheelR;
      ctx.fillStyle = "#070b0c";
      ctx.beginPath();
      ctx.arc(wheelX, wheelY, wheelR, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = "#576468";
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.arc(wheelX, wheelY, wheelR - 1, 0, TAU);
      ctx.stroke();
      const spin = state.wheelAngle + index * 1.3;
      ctx.strokeStyle = "rgba(154, 168, 166, 0.46)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(wheelX + Math.cos(spin) * (wheelR - 2), wheelY + Math.sin(spin) * (wheelR - 2));
      ctx.lineTo(wheelX - Math.cos(spin) * (wheelR - 2), wheelY - Math.sin(spin) * (wheelR - 2));
      ctx.stroke();
    });

    const beaconOn = Math.sin(state.time * 5.5) > 0.25 || state.actualSpeed > 1;
    ctx.fillStyle = beaconOn ? "#ffb34d" : "#6b4b24";
    ctx.beginPath();
    ctx.arc(x + bodyW * 0.34, bodyY + 4, 3.2, 0, TAU);
    ctx.fill();
    if (beaconOn) {
      const glow = ctx.createRadialGradient(x + bodyW * 0.34, bodyY + 4, 1, x + bodyW * 0.34, bodyY + 4, 17);
      glow.addColorStop(0, "rgba(255, 177, 73, 0.28)");
      glow.addColorStop(1, "rgba(255, 177, 73, 0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(x + bodyW * 0.34, bodyY + 4, 17, 0, TAU);
      ctx.fill();
    }
  }

  function drawViewfinder() {
    const layout = getLayout();
    const centerX = cartX();
    const centerY = layout.top + (layout.bottom - layout.top) * 0.43;
    const frameW = clamp(width * 0.245, 185, 336);
    const frameH = clamp(height * 0.35, 150, 228);
    const left = centerX - frameW / 2;
    const top = centerY - frameH / 2;
    const station = stations[state.activeStation];
    const targetX = stationX(station);
    const isAligned = metrics.distance <= 1.5;
    const ready = isAligned && metrics.motion > 0.82 && metrics.glare <= 0.55 && metrics.focus >= 0.7;
    let color = "#d6a357";
    if (metrics.glare > 0.55) color = "#ef665c";
    else if (ready) color = "#b8dd85";

    ctx.save();
    ctx.fillStyle = "rgba(3, 7, 8, 0.14)";
    ctx.fillRect(0, 0, width, top);
    ctx.fillRect(0, top + frameH, width, height - top - frameH);
    ctx.fillRect(0, top, left, frameH);
    ctx.fillRect(left + frameW, top, width - left - frameW, frameH);

    ctx.strokeStyle = "rgba(208, 221, 217, 0.12)";
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 5]);
    ctx.beginPath();
    ctx.moveTo(left + frameW / 3, top);
    ctx.lineTo(left + frameW / 3, top + frameH);
    ctx.moveTo(left + frameW * 2 / 3, top);
    ctx.lineTo(left + frameW * 2 / 3, top + frameH);
    ctx.moveTo(left, top + frameH / 3);
    ctx.lineTo(left + frameW, top + frameH / 3);
    ctx.moveTo(left, top + frameH * 2 / 3);
    ctx.lineTo(left + frameW, top + frameH * 2 / 3);
    ctx.stroke();
    ctx.setLineDash([]);

    const corner = clamp(frameW * 0.085, 12, 25);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.7;
    ctx.shadowColor = color;
    ctx.shadowBlur = 4;
    ctx.beginPath();
    ctx.moveTo(left, top + corner);
    ctx.lineTo(left, top);
    ctx.lineTo(left + corner, top);
    ctx.moveTo(left + frameW - corner, top);
    ctx.lineTo(left + frameW, top);
    ctx.lineTo(left + frameW, top + corner);
    ctx.moveTo(left + frameW, top + frameH - corner);
    ctx.lineTo(left + frameW, top + frameH);
    ctx.lineTo(left + frameW - corner, top + frameH);
    ctx.moveTo(left + corner, top + frameH);
    ctx.lineTo(left, top + frameH);
    ctx.lineTo(left, top + frameH - corner);
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.font = '500 8px "Cascadia Mono", monospace';
    ctx.fillStyle = "rgba(231, 239, 235, 0.77)";
    ctx.fillText(`AF-C   ${station.id}   F2.8`, left + 2, top - 8);
    ctx.textAlign = "right";
    ctx.fillStyle = color;
    ctx.fillText(isAligned ? "WELD LOCK" : `OFFSET ${metrics.distance.toFixed(1)}%`, left + frameW - 2, top - 8);
    ctx.textAlign = "left";

    const reticleSize = clamp(frameW * 0.045, 7, 12);
    ctx.strokeStyle = "rgba(229, 237, 232, 0.66)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(centerX - reticleSize, centerY);
    ctx.lineTo(centerX - 3, centerY);
    ctx.moveTo(centerX + 3, centerY);
    ctx.lineTo(centerX + reticleSize, centerY);
    ctx.moveTo(centerX, centerY - reticleSize);
    ctx.lineTo(centerX, centerY - 3);
    ctx.moveTo(centerX, centerY + 3);
    ctx.lineTo(centerX, centerY + reticleSize);
    ctx.stroke();
    ctx.fillStyle = "rgba(228, 235, 230, 0.46)";
    ctx.fillRect(centerX - 0.8, centerY - 0.8, 1.6, 1.6);

    drawTargetLock(targetX, centerY, frameH, color, isAligned);
    drawFocusScale(left + frameW, top, frameH);
    drawFrameScale(left, top + frameH, frameW, station);

    if (metrics.glare > 0.16) {
      const strength = Math.round(smoothstep(0.16, 0.94, metrics.glare) * 100);
      ctx.fillStyle = "rgba(7, 10, 11, 0.7)";
      ctx.fillRect(left + frameW - 92, top + 12, 82, 16);
      ctx.fillStyle = metrics.glare > 0.52 ? "#ff8178" : "#f2b96c";
      ctx.font = '500 7px "Cascadia Mono", monospace';
      ctx.textAlign = "right";
      ctx.fillText(`SPECULAR ${strength}%`, left + frameW - 15, top + 23);
      ctx.textAlign = "left";
    }

    if (!isAligned) {
      ctx.strokeStyle = "rgba(242, 168, 75, 0.52)";
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(centerX, centerY + frameH * 0.32);
      ctx.lineTo(targetX, centerY + frameH * 0.32);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();
  }

  function drawTargetLock(targetX, centerY, frameH, color, aligned) {
    const size = clamp(frameH * 0.14, 23, 36);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(targetX - size, centerY - size + 8);
    ctx.lineTo(targetX - size, centerY - size);
    ctx.lineTo(targetX - size + 8, centerY - size);
    ctx.moveTo(targetX + size - 8, centerY - size);
    ctx.lineTo(targetX + size, centerY - size);
    ctx.lineTo(targetX + size, centerY - size + 8);
    ctx.moveTo(targetX + size, centerY + size - 8);
    ctx.lineTo(targetX + size, centerY + size);
    ctx.lineTo(targetX + size - 8, centerY + size);
    ctx.moveTo(targetX - size + 8, centerY + size);
    ctx.lineTo(targetX - size, centerY + size);
    ctx.lineTo(targetX - size, centerY + size - 8);
    ctx.stroke();

    if (aligned) {
      ctx.fillStyle = color;
      ctx.font = '500 7px "Cascadia Mono", monospace';
      ctx.fillText("LOCK", targetX + size + 5, centerY - size + 7);
    }
  }

  function drawFocusScale(right, top, frameH) {
    const x = right - 11;
    const centerY = top + frameH / 2;
    const scaleHeight = frameH * 0.52;
    ctx.strokeStyle = "rgba(220, 230, 226, 0.28)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, centerY - scaleHeight / 2);
    ctx.lineTo(x, centerY + scaleHeight / 2);
    ctx.stroke();
    for (let i = 0; i <= 8; i += 1) {
      const y = centerY - scaleHeight / 2 + (scaleHeight * i) / 8;
      const long = i === 4;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (long ? 7 : 4), y);
      ctx.stroke();
    }
    const error = state.focus - stations[state.activeStation].optimumFocus;
    const markerY = centerY + clamp(error / 24, -1, 1) * (scaleHeight / 2);
    ctx.fillStyle = Math.abs(error) < 4 ? "#b8dd85" : "#f2a84b";
    ctx.beginPath();
    ctx.moveTo(x - 7, markerY);
    ctx.lineTo(x - 2, markerY - 3);
    ctx.lineTo(x - 2, markerY + 3);
    ctx.closePath();
    ctx.fill();
  }

  function drawFrameScale(left, bottom, frameW, station) {
    ctx.font = '500 7px "Cascadia Mono", monospace';
    ctx.fillStyle = "rgba(217, 227, 223, 0.64)";
    ctx.fillText(`${state.focus.toFixed(0)}mm  ${state.light}%`, left + 2, bottom + 13);
    ctx.textAlign = "right";
    ctx.fillText(`${station.id} / ${metrics.clarity.toFixed(0)} CLR`, left + frameW - 2, bottom + 13);
    ctx.textAlign = "left";
    ctx.strokeStyle = "rgba(219, 229, 225, 0.26)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 18; i += 1) {
      const x = left + (frameW * i) / 17;
      ctx.beginPath();
      ctx.moveTo(x, bottom + 1);
      ctx.lineTo(x, bottom + (i % 5 === 0 ? 6 : 3));
      ctx.stroke();
    }
  }

  function drawScreenEffects() {
    ctx.save();
    ctx.globalAlpha = 0.055;
    ctx.fillStyle = "#d5e2dc";
    for (let y = 0; y < height; y += 4) {
      ctx.fillRect(0, y, width, 0.55);
    }

    if (state.actualSpeed > 1.2) {
      ctx.globalAlpha = 0.13 + clamp(state.actualSpeed / 20) * 0.1;
      const speed = clamp(state.actualSpeed / 20);
      for (let i = 0; i < 13; i += 1) {
        const y = height * (0.14 + ((i * 0.067 + state.time * 0.16) % 0.52));
        const x = (i * 173 + state.time * 80 * (1 + speed)) % width;
        const length = 20 + i * 7;
        const line = ctx.createLinearGradient(x, y, x + length, y);
        line.addColorStop(0, "rgba(207, 223, 217, 0)");
        line.addColorStop(0.5, "rgba(207, 223, 217, 0.4)");
        line.addColorStop(1, "rgba(207, 223, 217, 0)");
        ctx.fillStyle = line;
        ctx.fillRect(x, y, length, 0.7);
      }
    }
    ctx.restore();

    if (state.flash > 0.01) {
      ctx.fillStyle = `rgba(246, 250, 241, ${state.flash * 0.48})`;
      ctx.fillRect(0, 0, width, height);
      ctx.strokeStyle = `rgba(255, 188, 91, ${state.flash * 0.6})`;
      ctx.lineWidth = 2;
      ctx.strokeRect(5, 5, width - 10, height - 10);
    }
  }

  function draw() {
    ctx = canvasCtx;
    canvasCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    canvasCtx.clearRect(0, 0, width, height);
    drawBackground();

    const shakeAmount = state.shake * clamp(state.actualSpeed / 30 + 0.2);
    const shakeX = Math.sin(state.time * 54) * shakeAmount;
    const shakeY = Math.cos(state.time * 47) * shakeAmount * 0.55;

    const defocus = (1 - metrics.focus) * 4.6;
    const motionBlur = (1 - metrics.motion) * 5.4;
    const totalBlur = Math.min(8.5, defocus + motionBlur * 0.58);
    drawBeamLayer(totalBlur, shakeX * 0.22, shakeY * 0.17);

    drawLighting();
    drawTrackAndCart();
    drawViewfinder();
    drawScreenEffects();
  }

  function drawBeamLayer(blurAmount, offsetX, offsetY) {
    if (blurAmount < 0.65) {
      ctx.save();
      ctx.translate(offsetX, offsetY);
      drawBeamBody();
      drawWelds();
      ctx.restore();
      return;
    }

    const scale = clamp(1 / (1 + blurAmount * 0.17), 0.34, 0.9);
    beamBuffer.width = Math.max(1, Math.round(width * scale));
    beamBuffer.height = Math.max(1, Math.round(height * scale));
    beamBufferCtx.setTransform(scale, 0, 0, scale, 0, 0);
    beamBufferCtx.clearRect(0, 0, width, height);
    ctx = beamBufferCtx;
    drawBeamBody();
    drawWelds();
    ctx = canvasCtx;

    canvasCtx.save();
    canvasCtx.imageSmoothingEnabled = true;
    canvasCtx.imageSmoothingQuality = "high";
    canvasCtx.drawImage(beamBuffer, offsetX, offsetY, width, height);
    canvasCtx.restore();
  }

  function init() {
    resizeCanvas();
    updateClock();
    updateControls();
    updateStationCards();
    updateReadout();
    window.setInterval(updateClock, 1000);
    document.getElementById("runCode").textContent = String(410 + Math.floor(Math.random() * 580));

    if ("ResizeObserver" in window) {
      const observer = new ResizeObserver(() => {
        resizeCanvas();
      });
      observer.observe(el.stage);
    } else {
      window.addEventListener("resize", resizeCanvas);
    }

    window.seamInspection = {
      stations,
      state,
      metrics,
      setControls({ speed, focus, light }) {
        if (typeof speed === "number") {
          state.speedSetting = clamp(speed, 0, 100);
          el.speed.value = state.speedSetting;
        }
        if (typeof focus === "number") {
          state.focus = clamp(focus, 24, 135);
          el.focus.value = state.focus;
        }
        if (typeof light === "number") {
          state.light = clamp(light, 0, 100);
          el.light.value = state.light;
        }
        updateControls();
        updateReadout();
      },
      alignToStation,
      capture,
      runGlareTest,
      reset() {
        state.captures = [null, null, null];
        state.glareTests = 0;
        state.lastShot = null;
        state.speedSetting = 0;
        state.actualSpeed = 0;
        state.cartPosition = 50;
        state.focus = 58;
        state.light = 52;
        el.speed.value = 0;
        el.focus.value = 58;
        el.light.value = 52;
        updateControls();
        updateStationCards();
        updateReadout();
      },
    };

    requestAnimationFrame(tick);
  }

  init();
})();
