(function startTrainDopplerApp() {
  "use strict";

  const Physics = window.TrainPhysics;
  const DEFAULT_PARAMS = Object.freeze({
    speed: 30,
    duration: 12,
    listenerX: 0,
    listenerOffset: 7,
  });

  const params = { ...DEFAULT_PARAMS };
  const run = {
    status: "idle",
    elapsed: 0,
    snapshot: null,
    current: null,
    trace: [],
    maxFrequency: -Infinity,
    minFrequency: Infinity,
    closestDistance: Infinity,
    lastSampleAt: -Infinity,
  };
  const ui = {
    muted: false,
    audioReady: false,
    lastFrameAt: 0,
    lastTraceDrawAt: 0,
    lastUiDrawAt: 0,
    logs: [],
    passCount: 0,
    spectrumCache: null,
  };
  let synth = null;

  const $ = (selector) => document.querySelector(selector);
  const elements = {
    audioStatus: $("#audioStatus"),
    sampleRateLabel: $("#sampleRateLabel"),
    phaseBadge: $("#passPhase"),
    canvasShell: $("#canvasShell"),
    sceneCanvas: $("#sceneCanvas"),
    traceCanvas: $("#traceCanvas"),
    worldScaleLabel: $("#worldScaleLabel"),
    runClock: $("#runClock"),
    hudDistance: $("#hudDistance"),
    hudRadial: $("#hudRadial"),
    hudPitch: $("#hudPitch"),
    playButton: $("#playButton"),
    playButtonLabel: $(".button-label"),
    resetButton: $("#resetButton"),
    muteButton: $("#muteButton"),
    muteIcon: $("#muteIcon"),
    progressFill: $("#progressFill"),
    progressPassMark: $("#progressPassMark"),
    elapsedLabel: $("#elapsedLabel"),
    durationLabel: $("#durationLabel"),
    transportStatus: $("#transportStatus"),
    comparisonVerdict: $("#comparisonVerdict"),
    movingFrequency: $("#movingFrequency"),
    movingCaption: $("#movingCaption"),
    deltaFill: $("#deltaFill"),
    deltaMarker: $("#deltaMarker"),
    deltaCentsLabel: $("#deltaCentsLabel"),
    dopplerFactor: $("#dopplerFactor"),
    radialReadout: $("#radialReadout"),
    pitchDirection: $("#pitchDirection"),
    pitchSwing: $("#pitchSwing"),
    gainReadout: $("#gainReadout"),
    panReadout: $("#panReadout"),
    filterReadout: $("#filterReadout"),
    speedInput: $("#speedInput"),
    speedOutput: $("#speedOutput"),
    durationInput: $("#durationInput"),
    durationOutput: $("#durationOutput"),
    listenerXInput: $("#listenerXInput"),
    listenerXOutput: $("#listenerXOutput"),
    listenerYInput: $("#listenerYInput"),
    listenerYOutput: $("#listenerYOutput"),
    presetButton: $("#presetButton"),
    demoButton: $("#demoButton"),
    runBadge: $("#runBadge"),
    runEmpty: $("#runEmpty"),
    runList: $("#runList"),
  };

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function formatSigned(value, digits = 1) {
    const safe = Math.abs(value) < 0.05 ? 0 : value;
    return `${safe >= 0 ? "+" : "−"}${Math.abs(safe).toFixed(digits)}`;
  }

  function formatClock(seconds) {
    const safe = Math.max(0, seconds);
    const minutes = Math.floor(safe / 60);
    const wholeSeconds = Math.floor(safe % 60);
    const tenths = Math.floor((safe % 1) * 10);
    return `${String(minutes).padStart(2, "0")}:${String(wholeSeconds).padStart(2, "0")}.${tenths}`;
  }

  function formatPan(pan) {
    if (Math.abs(pan) < 0.02) return "C";
    return `${pan < 0 ? "L" : "R"}${Math.round(Math.abs(pan) * 100)}`;
  }

  function currentDisplayState() {
    if (run.current) return run.current;
    return Physics.getStateAtProgress(0, params);
  }

  function setAudioStatus(text, stateName = "") {
    const label = elements.audioStatus.querySelector("span");
    label.textContent = text;
    elements.audioStatus.classList.toggle("is-live", stateName === "live");
    elements.audioStatus.classList.toggle("is-error", stateName === "error");
  }

  function updateRangeProgress(input) {
    const min = Number(input.min);
    const max = Number(input.max);
    const value = Number(input.value);
    const progress = max === min ? 0 : ((value - min) / (max - min)) * 100;
    input.style.setProperty("--range-progress", `${progress}%`);
  }

  function readParamsFromInputs() {
    params.speed = Number(elements.speedInput.value);
    params.duration = Number(elements.durationInput.value);
    params.listenerX = Number(elements.listenerXInput.value);
    params.listenerOffset = Number(elements.listenerYInput.value);
  }

  function updateControlLabels() {
    elements.speedOutput.textContent = `${params.speed} m/s`;
    elements.durationOutput.textContent = `${params.duration.toFixed(1)} s`;
    elements.listenerXOutput.textContent = `${formatSigned(params.listenerX, 0)} m`;
    elements.listenerYOutput.textContent = `${params.listenerOffset} m`;
    elements.durationLabel.textContent = `${params.duration.toFixed(1)} s`;
    elements.speedInput.value = params.speed;
    elements.durationInput.value = params.duration;
    elements.listenerXInput.value = params.listenerX;
    elements.listenerYInput.value = params.listenerOffset;
    [elements.speedInput, elements.durationInput, elements.listenerXInput, elements.listenerYInput]
      .forEach(updateRangeProgress);

    const geometry = Physics.getPassGeometry(params);
    elements.progressPassMark.style.left = `${geometry.passProgress * 100}%`;
    elements.worldScaleLabel.textContent = `${Math.round(geometry.pathLength)} m PASS`;
  }

  function TrainSynth() {
    this.context = null;
    this.nodes = null;
    this.oscillators = [];
    this.muted = false;
    this.started = false;
    this.spectrum = null;
  }

  TrainSynth.prototype.ensureStarted = async function ensureStarted() {
    if (this.context) {
      if (this.context.state === "suspended") await this.context.resume();
      return this.context;
    }

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) throw new Error("当前浏览器不支持 Web Audio");

    const context = new AudioContextClass();
    const master = context.createGain();
    master.gain.value = 0;

    const analyser = context.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.76;
    analyser.minDecibels = -96;
    analyser.maxDecibels = -14;

    const panner = context.createStereoPanner
      ? context.createStereoPanner()
      : context.createGain();
    if ("pan" in panner) panner.pan.value = 0;

    const sourceGain = context.createGain();
    sourceGain.gain.value = 0;

    const toneFilter = context.createBiquadFilter();
    toneFilter.type = "lowpass";
    toneFilter.frequency.value = 3200;
    toneFilter.Q.value = 0.55;

    const wave = this.createHornWave(context);
    const hornRatios = [
      { ratio: 1, gain: 0.2 },
      { ratio: 1.189, gain: 0.085 },
      { ratio: 0.5, gain: 0.068 },
    ];
    const oscillators = hornRatios.map(({ ratio, gain: level }) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.setPeriodicWave(wave);
      oscillator.frequency.value = Physics.SOURCE_FREQUENCY * ratio;
      gain.gain.value = level;
      oscillator.connect(gain);
      gain.connect(sourceGain);
      oscillator.start();
      return { oscillator, gain, ratio };
    });

    const noiseSource = context.createBufferSource();
    noiseSource.buffer = this.createBrownNoise(context, 2.4);
    noiseSource.loop = true;
    const noiseFilter = context.createBiquadFilter();
    noiseFilter.type = "lowpass";
    noiseFilter.frequency.value = 260;
    noiseFilter.Q.value = 0.7;
    const noiseGain = context.createGain();
    noiseGain.gain.value = 0.04;
    noiseSource.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(sourceGain);
    noiseSource.start();

    sourceGain.connect(toneFilter);
    toneFilter.connect(analyser);
    analyser.connect(panner);
    panner.connect(master);
    master.connect(context.destination);

    this.context = context;
    this.nodes = {
      master,
      analyser,
      panner,
      sourceGain,
      toneFilter,
      noiseGain,
      noiseFilter,
    };
    this.oscillators = oscillators;
    this.spectrum = new Float32Array(analyser.frequencyBinCount);
    this.started = true;

    if (context.state === "suspended") await context.resume();
    return context;
  };

  TrainSynth.prototype.createHornWave = function createHornWave(context) {
    const harmonics = [
      0, 1, 0.42, 0.68, 0.22, 0.46, 0.16, 0.3, 0.12, 0.19, 0.09, 0.14, 0.06, 0.1,
      0.04, 0.075, 0.035, 0.052, 0.023, 0.04, 0.018, 0.03, 0.012, 0.022,
    ];
    const real = new Float32Array(harmonics.length);
    const imag = new Float32Array(harmonics.length);
    harmonics.forEach((amplitude, index) => {
      imag[index] = amplitude;
    });
    return context.createPeriodicWave(real, imag, { disableNormalization: false });
  };

  TrainSynth.prototype.createBrownNoise = function createBrownNoise(context, seconds) {
    const sampleRate = context.sampleRate;
    const buffer = context.createBuffer(1, Math.floor(sampleRate * seconds), sampleRate);
    const data = buffer.getChannelData(0);
    let previous = 0;
    for (let index = 0; index < data.length; index += 1) {
      const white = Math.random() * 2 - 1;
      previous = (previous + 0.02 * white) / 1.02;
      data[index] = previous * 3.2;
    }
    return buffer;
  };

  TrainSynth.prototype.smoothParam = function smoothParam(param, value, timeConstant) {
    if (!this.context) return;
    const now = this.context.currentTime;
    param.setTargetAtTime(value, now, timeConstant);
  };

  TrainSynth.prototype.update = function update(acousticState, speed) {
    if (!this.context || !this.nodes || !this.started) return;
    const { nodes } = this;
    this.oscillators.forEach(({ oscillator, ratio }) => {
      this.smoothParam(
        oscillator.frequency,
        acousticState.observedFrequency * ratio,
        0.035,
      );
    });
    this.smoothParam(nodes.sourceGain.gain, acousticState.gain, 0.055);
    this.smoothParam(nodes.toneFilter.frequency, acousticState.filterCutoff, 0.065);
    this.smoothParam(nodes.panner.pan || nodes.panner.gain, acousticState.pan, 0.045);
    this.smoothParam(nodes.noiseGain.gain, 0.03 + (speed / 160) * 0.085, 0.06);
    this.smoothParam(
      nodes.noiseFilter.frequency,
      clamp(220 + speed * 1.8, 240, 380),
      0.08,
    );
  };

  TrainSynth.prototype.setMasterLevel = function setMasterLevel(level) {
    if (!this.context || !this.nodes) return;
    this.smoothParam(this.nodes.master.gain, this.muted ? 0 : level, 0.045);
  };

  TrainSynth.prototype.beginPlayback = async function beginPlayback(acousticState, speed) {
    await this.ensureStarted();
    this.update(acousticState, speed);
    this.setMasterLevel(0.92);
  };

  TrainSynth.prototype.pausePlayback = function pausePlayback() {
    this.setMasterLevel(0);
  };

  TrainSynth.prototype.resumePlayback = function resumePlayback() {
    this.setMasterLevel(0.92);
  };

  TrainSynth.prototype.endPlayback = function endPlayback() {
    this.setMasterLevel(0);
  };

  TrainSynth.prototype.toggleMuted = function toggleMuted() {
    this.muted = !this.muted;
    if (run.status === "running") this.setMasterLevel(0.92);
    return this.muted;
  };

  TrainSynth.prototype.getSpectrum = function getSpectrum() {
    if (!this.nodes || !this.spectrum) return null;
    this.nodes.analyser.getFloatFrequencyData(this.spectrum);
    return this.spectrum;
  };

  function setPhaseBadge(text, className = "") {
    elements.phaseBadge.textContent = text;
    elements.phaseBadge.className = `phase-badge${className ? ` ${className}` : ""}`;
  }

  function updateTransport() {
    const isRunning = run.status === "running";
    const isPaused = run.status === "paused";
    const isComplete = run.status === "complete";
    elements.playButton.classList.toggle("is-playing", isRunning);

    if (isRunning) {
      elements.playButtonLabel.textContent = "暂停";
      elements.transportStatus.textContent = "实时合成中";
    } else if (isPaused) {
      elements.playButtonLabel.textContent = "继续通过";
      elements.transportStatus.textContent = "已暂停";
    } else if (isComplete) {
      elements.playButtonLabel.textContent = "再次通过";
      elements.transportStatus.textContent = "通过完成";
    } else {
      elements.playButtonLabel.textContent = "开始通过";
      elements.transportStatus.textContent = "待启动";
    }

    const activeDuration = run.snapshot ? run.snapshot.duration : params.duration;
    const progress = activeDuration > 0 ? clamp(run.elapsed / activeDuration, 0, 1) : 0;
    elements.progressFill.style.width = `${progress * 100}%`;
    elements.elapsedLabel.textContent = `${run.elapsed.toFixed(1)} s`;
    elements.durationLabel.textContent = `${activeDuration.toFixed(1)} s`;
    elements.runClock.textContent = formatClock(run.elapsed);
  }

  function updateLiveReadouts(state = currentDisplayState()) {
    const frequency = state.observedFrequency;
    const cents = state.cents;
    const isApproaching = state.radialVelocity > 0.45;
    const isReceding = state.radialVelocity < -0.45;

    elements.hudDistance.textContent = `${state.distance.toFixed(1)} m`;
    elements.hudRadial.textContent = `${formatSigned(state.radialVelocity, 1)} m/s`;
    elements.hudPitch.textContent = `${frequency.toFixed(1)} Hz`;
    elements.hudRadial.classList.toggle("is-hot", isApproaching);
    elements.hudPitch.classList.toggle("is-hot", isApproaching);

    elements.movingFrequency.innerHTML = `${frequency.toFixed(1)}<small>Hz</small>`;
    elements.dopplerFactor.textContent = `${state.dopplerFactor.toFixed(3)}×`;
    elements.radialReadout.textContent = `${formatSigned(state.radialVelocity, 1)} m/s`;
    elements.gainReadout.textContent = `${state.gainDb.toFixed(1)} dB`;
    elements.panReadout.textContent = formatPan(state.pan);
    elements.filterReadout.textContent = `${(state.filterCutoff / 1000).toFixed(1)} kHz`;

    const absoluteCents = Math.abs(cents);
    const gaugeAmount = clamp(absoluteCents / 400, 0, 1) * 50;
    elements.deltaFill.style.left = `${cents < 0 ? 50 - gaugeAmount : 50}%`;
    elements.deltaFill.style.width = `${gaugeAmount}%`;
    elements.deltaMarker.style.left = `${50 + (cents < 0 ? -gaugeAmount : gaugeAmount)}%`;
    elements.deltaFill.classList.toggle("is-down", cents < 0);
    elements.deltaMarker.classList.toggle("is-down", cents < 0);
    elements.deltaCentsLabel.textContent = `${formatSigned(cents, 0)} cents`;

    if (isApproaching) {
      elements.movingCaption.textContent = `径向接近 · ${formatSigned(cents, 0)} cents`;
      elements.pitchDirection.textContent = "升调";
      elements.pitchDirection.classList.add("is-hot");
    } else if (isReceding) {
      elements.movingCaption.textContent = `径向远离 · ${formatSigned(cents, 0)} cents`;
      elements.pitchDirection.textContent = "降调";
      elements.pitchDirection.classList.remove("is-hot");
    } else {
      elements.movingCaption.textContent = "正横经过 · 接近 f₀";
      elements.pitchDirection.textContent = "回到原音高";
      elements.pitchDirection.classList.remove("is-hot");
    }
    if (run.status === "idle") {
      elements.movingCaption.textContent = "预览起点 · 待发车";
    }

    elements.comparisonVerdict.classList.remove("is-up", "is-down", "is-complete");
    if (run.status === "idle") {
      elements.comparisonVerdict.textContent = "运动声源 · 待发车";
    } else if (run.status === "complete") {
      elements.comparisonVerdict.textContent = "通过完成 · 已低于静止频率";
      elements.comparisonVerdict.classList.add("is-complete");
    } else if (isApproaching) {
      elements.comparisonVerdict.textContent = `接近 · 高于静止 ${Math.round(absoluteCents)} cents`;
      elements.comparisonVerdict.classList.add("is-up");
    } else if (isReceding) {
      elements.comparisonVerdict.textContent = `远离 · 低于静止 ${Math.round(absoluteCents)} cents`;
      elements.comparisonVerdict.classList.add("is-down");
    } else {
      elements.comparisonVerdict.textContent = "正横经过 · 频率交叉";
    }

    if (run.status === "running" && isApproaching) {
      setPhaseBadge("接近 · 升调", "is-approaching");
    } else if (run.status === "running" && isReceding) {
      setPhaseBadge("远离 · 降调", "is-moving");
    } else if (run.status === "running") {
      setPhaseBadge("近距离经过", "is-moving");
    } else if (run.status === "paused") {
      setPhaseBadge("已暂停");
    } else if (run.status === "complete") {
      setPhaseBadge("通过完成", "is-complete");
    } else {
      setPhaseBadge("等待发车");
    }

    if (Number.isFinite(run.maxFrequency) && Number.isFinite(run.minFrequency)) {
      elements.pitchSwing.textContent = `${formatSigned(Physics.centsBetween(run.maxFrequency), 0)} / ${formatSigned(Physics.centsBetween(run.minFrequency), 0)}`;
    } else {
      elements.pitchSwing.textContent = "+0 / −0";
    }

    updateTransport();
  }

  function renderRunLog() {
    elements.runBadge.textContent = `${ui.passCount} 次`;
    elements.runEmpty.hidden = ui.logs.length > 0;
    elements.runList.replaceChildren();

    ui.logs.slice(0, 3).forEach((record, index) => {
      const item = document.createElement("li");
      const number = document.createElement("span");
      number.className = "run-number";
      number.textContent = `#${String(index + 1).padStart(2, "0")}`;

      const detail = document.createElement("span");
      detail.className = "run-detail";
      const title = document.createElement("strong");
      title.textContent = record.qualified ? "近距离通过已完成" : "经过完成 · 监听点较远";
      detail.append(
        title,
        `${record.speed} m/s · ${record.duration.toFixed(1)} s · 最近 ${record.closest.toFixed(1)} m`,
      );

      const swing = document.createElement("span");
      swing.className = "run-swing";
      swing.textContent = `${formatSigned(record.maxCents, 0)} / ${formatSigned(record.minCents, 0)}`;
      item.append(number, detail, swing);
      elements.runList.append(item);
    });
  }

  function resetRun() {
    run.status = "idle";
    run.elapsed = 0;
    run.snapshot = null;
    run.current = null;
    run.trace = [];
    run.maxFrequency = -Infinity;
    run.minFrequency = Infinity;
    run.closestDistance = Infinity;
    run.lastSampleAt = -Infinity;
    ui.spectrumCache = null;
    if (synth) synth.pausePlayback();
    updateLiveReadouts(currentDisplayState());
    drawTrace();
  }

  function completeRun() {
    if (run.status !== "running" || !run.snapshot) return;
    run.status = "complete";
    run.elapsed = run.snapshot.duration;
    run.current = Physics.getStateAtTime(run.elapsed, run.snapshot);
    if (synth) synth.endPlayback();
    if (!Number.isFinite(run.maxFrequency)) {
      run.maxFrequency = run.current.observedFrequency;
      run.minFrequency = run.current.observedFrequency;
    }
    if (!Number.isFinite(run.closestDistance)) {
      run.closestDistance = run.current.distance;
    }

    const record = {
      speed: run.snapshot.speed,
      duration: run.snapshot.duration,
      listenerX: run.snapshot.listenerX,
      listenerOffset: run.snapshot.listenerOffset,
      maxFrequency: run.maxFrequency,
      minFrequency: run.minFrequency,
      maxCents: Physics.centsBetween(run.maxFrequency),
      minCents: Physics.centsBetween(run.minFrequency),
      closest: run.closestDistance,
      qualified: run.closestDistance <= 18,
    };
    ui.logs.unshift(record);
    ui.logs = ui.logs.slice(0, 3);
    ui.passCount += 1;
    renderRunLog();
    updateLiveReadouts(run.current);
  }

  async function startRun() {
    const sameSession = run.status === "paused" && run.snapshot;
    if (!sameSession) {
      run.snapshot = { ...params };
      run.elapsed = 0;
      run.current = Physics.getStateAtTime(0, run.snapshot);
      run.trace = [{ time: 0, frequency: run.current.observedFrequency }];
      run.maxFrequency = run.current.observedFrequency;
      run.minFrequency = run.current.observedFrequency;
      run.closestDistance = run.current.distance;
      run.lastSampleAt = 0;
      ui.spectrumCache = null;
    }

    run.status = "running";
    updateLiveReadouts(run.current);
    if (sameSession) {
      if (synth) synth.resumePlayback();
      return;
    }

    try {
      await synth.beginPlayback(run.current, run.snapshot.speed);
      ui.audioReady = true;
      const sampleRate = synth.context.sampleRate / 1000;
      setAudioStatus(`Web Audio · ${sampleRate.toFixed(1)} kHz`, "live");
      elements.sampleRateLabel.textContent = `AUDIO ${sampleRate.toFixed(1)} kHz`;
      synth.update(run.current, run.snapshot.speed);
      if (run.status !== "running") synth.pausePlayback();
    } catch (error) {
      setAudioStatus("音频启动失败", "error");
      elements.transportStatus.textContent = "仅画面运行";
      console.error("Web Audio startup failed:", error);
    }
  }

  function pauseRun() {
    if (run.status !== "running") return;
    run.status = "paused";
    if (synth) synth.pausePlayback();
    updateLiveReadouts(run.current || currentDisplayState());
  }

  function togglePlayback() {
    if (run.status === "running") {
      pauseRun();
    } else {
      startRun();
    }
  }

  function applyPreset(nextParams = DEFAULT_PARAMS) {
    Object.assign(params, nextParams);
    updateControlLabels();
    resetRun();
  }

  function handleParameterInput() {
    readParamsFromInputs();
    updateControlLabels();
    if (run.status !== "idle") {
      resetRun();
    } else {
      updateLiveReadouts(currentDisplayState());
      drawTrace();
    }
  }

  function updateSimulation(deltaSeconds) {
    if (run.status !== "running" || !run.snapshot) return;
    run.elapsed = Math.min(run.elapsed + deltaSeconds, run.snapshot.duration);
    const nextState = Physics.getStateAtTime(run.elapsed, run.snapshot);
    run.current = nextState;

    run.maxFrequency = Math.max(run.maxFrequency, nextState.observedFrequency);
    run.minFrequency = Math.min(run.minFrequency, nextState.observedFrequency);
    run.closestDistance = Math.min(run.closestDistance, nextState.distance);

    if (run.elapsed - run.lastSampleAt >= 0.055) {
      run.trace.push({ time: run.elapsed, frequency: nextState.observedFrequency });
      run.lastSampleAt = run.elapsed;
    }

    if (synth) synth.update(nextState, run.snapshot.speed);
    updateLiveReadouts(nextState);

    if (run.elapsed >= run.snapshot.duration) completeRun();
  }

  const sceneContext = elements.sceneCanvas.getContext("2d");
  const traceContext = elements.traceCanvas.getContext("2d");
  const canvasSizes = new WeakMap();
  const CANVAS_FONT =
    '"Noto Sans SC Local", "SFMono-Regular", "Cascadia Code", monospace';

  function prepareCanvas(canvas, context) {
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cached = canvasSizes.get(canvas);

    if (!cached || cached.width !== width || cached.height !== height || cached.dpr !== dpr) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvasSizes.set(canvas, { width, height, dpr });
    }
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { width, height, dpr };
  }

  function roundedRect(context, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    context.beginPath();
    context.moveTo(x + r, y);
    context.arcTo(x + width, y, x + width, y + height, r);
    context.arcTo(x + width, y + height, x, y + height, r);
    context.arcTo(x, y + height, x, y, r);
    context.arcTo(x, y, x + width, y, r);
    context.closePath();
  }

  function drawTrace() {
    const { width, height } = prepareCanvas(elements.traceCanvas, traceContext);
    const context = traceContext;
    const activeParams = run.snapshot || params;
    const analysis = Physics.analyzePass(activeParams, 181);
    const plot = {
      left: 34,
      right: width - 9,
      top: 13,
      bottom: height - 20,
    };
    plot.width = Math.max(1, plot.right - plot.left);
    plot.height = Math.max(1, plot.bottom - plot.top);

    const frequencyMin = Math.floor((Math.min(analysis.minFrequency, 392) - 22) / 20) * 20;
    const frequencyMax = Math.ceil((Math.max(analysis.maxFrequency, 392) + 22) / 20) * 20;
    const mapY = (frequency) =>
      plot.bottom - ((frequency - frequencyMin) / (frequencyMax - frequencyMin)) * plot.height;

    context.clearRect(0, 0, width, height);
    context.lineWidth = 1;
    context.strokeStyle = "rgba(181, 201, 191, 0.1)";
    context.fillStyle = "rgba(118, 129, 123, 0.8)";
    context.font = `7px ${CANVAS_FONT}`;
    context.textAlign = "right";
    context.textBaseline = "middle";

    [frequencyMin, 392, frequencyMax].forEach((frequency) => {
      const y = mapY(frequency);
      context.beginPath();
      context.moveTo(plot.left, y + 0.5);
      context.lineTo(plot.right, y + 0.5);
      context.stroke();
      context.fillText(`${Math.round(frequency)}`, plot.left - 6, y);
    });

    const staticY = mapY(392);
    context.save();
    context.setLineDash([2, 4]);
    context.strokeStyle = "rgba(205, 217, 208, 0.55)";
    context.beginPath();
    context.moveTo(plot.left, staticY);
    context.lineTo(plot.right, staticY);
    context.stroke();
    context.restore();

    context.save();
    context.setLineDash([3, 4]);
    context.strokeStyle = "rgba(113, 233, 196, 0.26)";
    context.beginPath();
    analysis.samples.forEach((sample, index) => {
      const x = plot.left + (index / (analysis.samples.length - 1)) * plot.width;
      const y = mapY(sample.observedFrequency);
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.stroke();
    context.restore();

    if (run.trace.length > 1) {
      const gradient = context.createLinearGradient(0, plot.top, 0, plot.bottom);
      gradient.addColorStop(0, "rgba(255, 184, 92, 0.14)");
      gradient.addColorStop(1, "rgba(255, 184, 92, 0)");

      context.beginPath();
      run.trace.forEach((point, index) => {
        const duration = run.snapshot ? run.snapshot.duration : activeParams.duration;
        const x = plot.left + clamp(point.time / duration, 0, 1) * plot.width;
        const y = mapY(point.frequency);
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      });
      const lastPoint = run.trace[run.trace.length - 1];
      const duration = run.snapshot ? run.snapshot.duration : activeParams.duration;
      const lastX = plot.left + clamp(lastPoint.time / duration, 0, 1) * plot.width;
      context.lineTo(lastX, plot.bottom);
      context.lineTo(plot.left, plot.bottom);
      context.closePath();
      context.fillStyle = gradient;
      context.fill();

      context.beginPath();
      run.trace.forEach((point, index) => {
        const x = plot.left + clamp(point.time / duration, 0, 1) * plot.width;
        const y = mapY(point.frequency);
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      });
      context.strokeStyle = "#ffb85c";
      context.lineWidth = 1.6;
      context.stroke();
    }

    const passProgress = Physics.getPassGeometry(activeParams).passProgress;
    const passX = plot.left + passProgress * plot.width;
    context.save();
    context.setLineDash([2, 3]);
    context.strokeStyle = "rgba(113, 233, 196, 0.2)";
    context.beginPath();
    context.moveTo(passX, plot.top);
    context.lineTo(passX, plot.bottom);
    context.stroke();
    context.restore();

    if (run.status !== "idle") {
      const nowProgress = clamp(run.elapsed / (activeParams.duration || 1), 0, 1);
      const nowX = plot.left + nowProgress * plot.width;
      context.strokeStyle = "rgba(255, 255, 255, 0.28)";
      context.beginPath();
      context.moveTo(nowX, plot.top);
      context.lineTo(nowX, plot.bottom);
      context.stroke();

      const currentFrequency = run.current ? run.current.observedFrequency : 392;
      context.beginPath();
      context.arc(nowX, mapY(currentFrequency), 2.5, 0, Math.PI * 2);
      context.fillStyle = "#ffb85c";
      context.fill();
    }

    context.font = `6px ${CANVAS_FONT}`;
    context.fillStyle = "rgba(118, 129, 123, 0.65)";
    context.textAlign = "left";
    context.fillText("0 s", plot.left, height - 7);
    context.textAlign = "right";
    context.fillText(`${activeParams.duration.toFixed(1)} s`, plot.right, height - 7);
    context.textAlign = "center";
    context.fillStyle = "rgba(113, 233, 196, 0.55)";
    context.fillText("正横", passX, plot.top - 4);
  }

  function drawScene(timestamp) {
    const { width, height } = prepareCanvas(elements.sceneCanvas, sceneContext);
    const context = sceneContext;
    const activeParams = run.snapshot || params;
    const geometry = Physics.getPassGeometry(activeParams);
    const state = run.current || Physics.getStateAtProgress(0, activeParams);
    const edgePad = Math.max(42, width * 0.065);
    const worldPadding = Math.max(26, geometry.pathLength * 0.045);
    const worldMin = Math.min(geometry.startX, geometry.listenerX) - worldPadding;
    const worldMax = Math.max(geometry.endX, geometry.listenerX) + worldPadding;
    const worldWidth = Math.max(1, worldMax - worldMin);
    const scale = (width - edgePad * 2) / worldWidth;
    const mapX = (worldX) => edgePad + (worldX - worldMin) * scale;
    const trackY = clamp(height * 0.34, 90, 158);
    const listenerY = Math.min(
      trackY + 42 + activeParams.listenerOffset * 2.2,
      height * 0.61,
    );
    const spectrumTop = height * 0.66;

    context.clearRect(0, 0, width, height);
    drawSceneBackdrop(context, width, height, trackY, spectrumTop);
    drawTrack(context, width, trackY, mapX, worldMin, worldMax, geometry, activeParams);
    drawDistanceLink(context, mapX(state.sourceX), listenerY, mapX(geometry.listenerX), trackY, state);
    drawTrain(context, mapX(state.sourceX), trackY, scale, state, activeParams, timestamp);
    drawListener(
      context,
      mapX(geometry.listenerX),
      trackY,
      listenerY,
      state,
      activeParams,
      timestamp,
    );
    drawSpectrum(context, width, height, spectrumTop, state, timestamp);
  }

  function drawSceneBackdrop(context, width, height, trackY, spectrumTop) {
    const background = context.createLinearGradient(0, 0, 0, height);
    background.addColorStop(0, "#0a1010");
    background.addColorStop(0.6, "#0b1211");
    background.addColorStop(1, "#080d0d");
    context.fillStyle = background;
    context.fillRect(0, 0, width, height);

    const halo = context.createRadialGradient(
      width * 0.5,
      trackY,
      12,
      width * 0.5,
      trackY,
      width * 0.48,
    );
    halo.addColorStop(0, "rgba(81, 143, 122, 0.1)");
    halo.addColorStop(0.55, "rgba(54, 95, 82, 0.035)");
    halo.addColorStop(1, "rgba(4, 8, 8, 0)");
    context.fillStyle = halo;
    context.fillRect(0, 0, width, spectrumTop);

    context.strokeStyle = "rgba(161, 184, 172, 0.055)";
    context.lineWidth = 1;
    const gridStep = Math.max(48, width / 14);
    for (let x = gridStep * 0.5; x < width; x += gridStep) {
      context.beginPath();
      context.moveTo(Math.round(x) + 0.5, 28);
      context.lineTo(Math.round(x) + 0.5, spectrumTop - 8);
      context.stroke();
    }
    for (let y = 42; y < spectrumTop - 14; y += 42) {
      context.beginPath();
      context.moveTo(0, y + 0.5);
      context.lineTo(width, y + 0.5);
      context.stroke();
    }

    context.fillStyle = "rgba(113, 233, 196, 0.09)";
    for (let index = 0; index < 18; index += 1) {
      const x = (index / 17) * width;
      const wave = Math.sin(index * 1.9) * 4;
      context.fillRect(x, spectrumTop - 20 + wave, 1, 9 - wave);
    }
  }

  function drawTrack(context, width, trackY, mapX, worldMin, worldMax, geometry, activeParams) {
    const trackLeft = Math.max(16, mapX(worldMin));
    const trackRight = Math.min(width - 16, mapX(worldMax));

    const bedGradient = context.createLinearGradient(0, trackY - 17, 0, trackY + 17);
    bedGradient.addColorStop(0, "rgba(54, 66, 61, 0)");
    bedGradient.addColorStop(0.5, "rgba(65, 77, 72, 0.24)");
    bedGradient.addColorStop(1, "rgba(54, 66, 61, 0)");
    context.fillStyle = bedGradient;
    context.fillRect(trackLeft, trackY - 17, trackRight - trackLeft, 34);

    context.strokeStyle = "rgba(190, 205, 196, 0.28)";
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(trackLeft, trackY - 7.5);
    context.lineTo(trackRight, trackY - 7.5);
    context.moveTo(trackLeft, trackY + 7.5);
    context.lineTo(trackRight, trackY + 7.5);
    context.stroke();

    const sleeperStep = Math.max(13, width / 62);
    context.strokeStyle = "rgba(151, 169, 159, 0.14)";
    for (let x = trackLeft; x <= trackRight; x += sleeperStep) {
      context.beginPath();
      context.moveTo(x + 0.5, trackY - 11);
      context.lineTo(x + 0.5, trackY + 11);
      context.stroke();
    }

    context.strokeStyle = "rgba(193, 209, 199, 0.16)";
    context.beginPath();
    context.moveTo(trackLeft, trackY + 7.5);
    context.lineTo(trackLeft, trackY + 13);
    context.lineTo(trackRight, trackY + 13);
    context.lineTo(trackRight, trackY + 7.5);
    context.stroke();

    const tickInterval = geometry.pathLength > 650 ? 200 : geometry.pathLength > 380 ? 100 : 50;
    const firstTick = Math.ceil(worldMin / tickInterval) * tickInterval;
    context.font = `6px ${CANVAS_FONT}`;
    context.textAlign = "center";
    context.textBaseline = "top";
    for (let worldX = firstTick; worldX <= worldMax; worldX += tickInterval) {
      const x = mapX(worldX);
      if (x < 18 || x > width - 18) continue;
      context.strokeStyle = "rgba(169, 188, 177, 0.12)";
      context.beginPath();
      context.moveTo(x + 0.5, trackY + 14);
      context.lineTo(x + 0.5, trackY + 19);
      context.stroke();
      context.fillStyle = "rgba(125, 140, 132, 0.48)";
      context.fillText(`${worldX > 0 ? "+" : ""}${worldX}m`, x, trackY + 21);
    }

    const passX = mapX(geometry.listenerX);
    context.save();
    context.setLineDash([3, 4]);
    context.strokeStyle = "rgba(113, 233, 196, 0.25)";
    context.beginPath();
    context.moveTo(passX, trackY - 18);
    context.lineTo(passX, trackY + 28);
    context.stroke();
    context.restore();

    context.fillStyle = "rgba(113, 233, 196, 0.55)";
    context.font = `6px ${CANVAS_FONT}`;
    context.textAlign = "center";
    context.textBaseline = "bottom";
    context.fillText("CLOSEST / 正横", passX, trackY - 20);

    const progressX = mapX(
      Physics.lerp(geometry.startX, geometry.endX, run.status === "idle" ? 0 : run.elapsed / geometry.duration),
    );
    context.fillStyle = "rgba(255, 184, 92, 0.65)";
    context.fillRect(progressX - 1, trackY - 16, 2, 32);
  }

  function drawDistanceLink(context, sourceX, listenerY, listenerX, trackY, state) {
    const midpointX = (sourceX + listenerX) / 2;
    const midpointY = (trackY + listenerY) / 2;
    const nearness = clamp(1 - state.distance / 150, 0.14, 0.9);

    context.save();
    context.setLineDash([2, 5]);
    context.lineWidth = 1;
    context.strokeStyle = `rgba(113, 233, 196, ${0.1 + nearness * 0.36})`;
    context.beginPath();
    context.moveTo(sourceX, trackY);
    context.lineTo(listenerX, listenerY);
    context.stroke();
    context.restore();

    context.font = `7px ${CANVAS_FONT}`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    const label = `${state.distance.toFixed(1)} m`;
    const labelWidth = context.measureText(label).width + 10;
    context.fillStyle = "rgba(9, 15, 14, 0.8)";
    roundedRect(context, midpointX - labelWidth / 2, midpointY - 7, labelWidth, 14, 4);
    context.fill();
    context.fillStyle = `rgba(152, 239, 214, ${0.45 + nearness * 0.4})`;
    context.fillText(label, midpointX, midpointY + 0.5);
  }

  function drawTrain(context, sourceX, trackY, scale, state, activeParams, timestamp) {
    const trainLength = clamp(50 * scale, 92, Math.min(230, 50 * scale + 18));
    const bodyHeight = clamp(trainLength * 0.23, 21, 31);
    const left = sourceX - trainLength / 2;
    const top = trackY - bodyHeight / 2;
    const distanceFade = clamp(1.08 - state.distance / 440, 0.38, 1);
    const approaching = state.radialVelocity > 0;

    const headGlow = context.createRadialGradient(
      sourceX + trainLength / 2 + 2,
      trackY,
      0,
      sourceX + trainLength / 2 + 2,
      trackY,
      clamp(trainLength * 0.72, 34, 92),
    );
    headGlow.addColorStop(0, `rgba(255, 225, 170, ${0.34 * distanceFade})`);
    headGlow.addColorStop(1, "rgba(255, 215, 140, 0)");
    context.fillStyle = headGlow;
    context.fillRect(
      sourceX + trainLength / 2 - 8,
      trackY - trainLength * 0.5,
      trainLength,
      trainLength,
    );

    context.save();
    context.globalAlpha = distanceFade;
    context.fillStyle = "rgba(0, 0, 0, 0.34)";
    context.beginPath();
    context.ellipse(sourceX + 3, trackY + bodyHeight * 0.72, trainLength * 0.5, 5, 0, 0, Math.PI * 2);
    context.fill();

    const bodyGradient = context.createLinearGradient(0, top, 0, top + bodyHeight);
    bodyGradient.addColorStop(0, approaching ? "#d6aa62" : "#a99265");
    bodyGradient.addColorStop(0.35, "#75633f");
    bodyGradient.addColorStop(0.68, "#3e3b2c");
    bodyGradient.addColorStop(1, "#1b201d");
    roundedRect(context, left, top, trainLength, bodyHeight, bodyHeight * 0.32);
    context.fillStyle = bodyGradient;
    context.fill();
    context.lineWidth = 1;
    context.strokeStyle = approaching ? "rgba(255, 212, 144, 0.75)" : "rgba(201, 193, 165, 0.38)";
    context.stroke();

    context.fillStyle = "rgba(225, 238, 228, 0.1)";
    context.fillRect(left + 12, top + 3, trainLength - 24, 1);
    context.fillRect(left + 12, top + bodyHeight - 4, trainLength - 24, 1);

    const carCount = 3;
    const carWidth = trainLength / carCount;
    for (let index = 0; index < carCount; index += 1) {
      const carLeft = left + carWidth * index;
      if (index > 0) {
        context.fillStyle = "rgba(8, 11, 10, 0.52)";
        context.fillRect(carLeft, top + 2, 1.4, bodyHeight - 4);
      }

      const windowCount = Math.max(2, Math.floor(carWidth / 15));
      for (let windowIndex = 0; windowIndex < windowCount; windowIndex += 1) {
        const windowX = carLeft + 7 + windowIndex * ((carWidth - 13) / windowCount);
        const windowWidth = Math.max(3, (carWidth - 18) / windowCount * 0.48);
        context.fillStyle = `rgba(113, 233, 196, ${0.34 + distanceFade * 0.3})`;
        context.fillRect(windowX, top + 4, windowWidth, 3);
        context.fillStyle = `rgba(113, 233, 196, ${0.16 + distanceFade * 0.18})`;
        context.fillRect(windowX, top + bodyHeight - 7, windowWidth, 2);
      }
    }

    context.fillStyle = "rgba(6, 9, 8, 0.68)";
    for (let wheelIndex = 0; wheelIndex < 4; wheelIndex += 1) {
      const wheelX = left + trainLength * (0.14 + wheelIndex * 0.24);
      context.beginPath();
      context.arc(wheelX, top + bodyHeight - 1, 2.5, 0, Math.PI * 2);
      context.fill();
    }

    context.fillStyle = "#ff7668";
    context.beginPath();
    context.arc(left + 3, trackY, 1.8, 0, Math.PI * 2);
    context.fill();

    context.fillStyle = "#fff0c3";
    context.beginPath();
    context.arc(left + trainLength - 4, trackY, 2.1, 0, Math.PI * 2);
    context.fill();

    if (run.status === "running") {
      const shimmer = (Math.sin(timestamp / 90) + 1) / 2;
      context.strokeStyle = `rgba(255, 211, 143, ${0.1 + shimmer * 0.16})`;
      context.lineWidth = 0.8;
      for (let lineIndex = 0; lineIndex < 3; lineIndex += 1) {
        const lineY = trackY - 12 + lineIndex * 12;
        context.beginPath();
        context.moveTo(left - 9 - lineIndex * 5, lineY);
        context.lineTo(left - 4 - lineIndex * 3, lineY);
        context.stroke();
      }
    }
    context.restore();

    context.font = `7px ${CANVAS_FONT}`;
    context.textAlign = "center";
    context.textBaseline = "bottom";
    context.fillStyle = `rgba(238, 242, 233, ${0.36 + distanceFade * 0.45})`;
    context.fillText(
      `${activeParams.speed} m/s ${approaching ? "→" : "→"}`,
      sourceX,
      top - 8,
    );
    context.fillStyle = "rgba(255, 184, 92, 0.56)";
    context.fillText("TRAIN 01", sourceX, top - 19);
  }

  function drawListener(context, x, trackY, listenerY, state, activeParams, timestamp) {
    const proximity = clamp(1 - state.distance / 90, 0, 1);
    context.save();
    context.setLineDash([2, 4]);
    context.strokeStyle = `rgba(113, 233, 196, ${0.18 + proximity * 0.3})`;
    context.beginPath();
    context.moveTo(x, trackY + 12);
    context.lineTo(x, listenerY - 13);
    context.stroke();
    context.restore();

    context.fillStyle = "rgba(113, 233, 196, 0.75)";
    context.beginPath();
    context.moveTo(x, trackY + 10);
    context.lineTo(x - 4, trackY + 17);
    context.lineTo(x + 4, trackY + 17);
    context.closePath();
    context.fill();

    const pulse = ((timestamp / 1300) % 1);
    for (let ring = 0; ring < 2; ring += 1) {
      const ringProgress = (pulse + ring * 0.45) % 1;
      context.beginPath();
      context.arc(x, listenerY, 11 + ringProgress * 28, 0, Math.PI * 2);
      context.strokeStyle = `rgba(113, 233, 196, ${(1 - ringProgress) * (0.06 + proximity * 0.15)})`;
      context.lineWidth = 0.8;
      context.stroke();
    }

    context.beginPath();
    context.arc(x, listenerY, 10, 0, Math.PI * 2);
    context.fillStyle = "rgba(9, 17, 15, 0.94)";
    context.fill();
    context.strokeStyle = `rgba(113, 233, 196, ${0.42 + proximity * 0.42})`;
    context.lineWidth = 1.2;
    context.stroke();

    context.fillStyle = `rgba(113, 233, 196, ${0.72 + proximity * 0.25})`;
    context.beginPath();
    context.arc(x, listenerY - 2.5, 2.1, 0, Math.PI * 2);
    context.fill();
    context.beginPath();
    context.arc(x, listenerY + 5.2, 4.2, Math.PI, 0);
    context.fill();

    context.font = `7px ${CANVAS_FONT}`;
    context.textAlign = "center";
    context.textBaseline = "top";
    context.fillStyle = "rgba(184, 243, 224, 0.75)";
    context.fillText("YOU / 监听点", x, listenerY + 15);
    context.fillStyle = "rgba(118, 129, 123, 0.8)";
    context.fillText(
      `${formatSigned(activeParams.listenerX, 0)} m · 离轨 ${activeParams.listenerOffset} m`,
      x,
      listenerY + 25,
    );
  }

  function drawSpectrum(context, width, height, spectrumTop, state, timestamp) {
    const panelHeight = height - spectrumTop;
    const plotLeft = 19;
    const plotRight = width - 19;
    const plotTop = spectrumTop + 27;
    const plotBottom = height - 19;
    const plotWidth = plotRight - plotLeft;
    const plotHeight = plotBottom - plotTop;
    const minFrequency = 45;
    const maxFrequency = 4200;
    const mapFrequency = (frequency) =>
      plotLeft +
      (Math.log(frequency / minFrequency) / Math.log(maxFrequency / minFrequency)) * plotWidth;

    context.save();
    const panelGradient = context.createLinearGradient(0, spectrumTop, 0, height);
    panelGradient.addColorStop(0, "rgba(11, 18, 17, 0.95)");
    panelGradient.addColorStop(1, "rgba(7, 12, 11, 0.98)");
    context.fillStyle = panelGradient;
    context.fillRect(0, spectrumTop, width, panelHeight);
    context.strokeStyle = "rgba(181, 201, 191, 0.12)";
    context.beginPath();
    context.moveTo(0, spectrumTop + 0.5);
    context.lineTo(width, spectrumTop + 0.5);
    context.stroke();

    context.font = `7px ${CANVAS_FONT}`;
    context.textBaseline = "middle";
    context.textAlign = "left";
    context.fillStyle = "rgba(179, 195, 185, 0.55)";
    context.fillText("REAL-TIME SPECTRUM", plotLeft, spectrumTop + 13);
    context.fillStyle = "rgba(118, 129, 123, 0.52)";
    context.textAlign = "right";
    context.fillText("FFT 2048 · LOG 45 Hz—4.2 kHz", plotRight, spectrumTop + 13);

    const ticks = [50, 100, 200, 392, 800, 1600, 3200];
    ticks.forEach((frequency) => {
      const x = mapFrequency(frequency);
      context.strokeStyle = "rgba(181, 201, 191, 0.075)";
      context.beginPath();
      context.moveTo(x + 0.5, plotTop - 3);
      context.lineTo(x + 0.5, plotBottom);
      context.stroke();
      context.fillStyle = "rgba(118, 129, 123, 0.55)";
      context.font = `6px ${CANVAS_FONT}`;
      context.textAlign = "center";
      context.textBaseline = "top";
      context.fillText(`${frequency}`, x, plotBottom + 4);
    });

    let spectrum = null;
    if (run.status === "running" && synth) {
      const liveSpectrum = synth.getSpectrum();
      if (liveSpectrum) {
        ui.spectrumCache = new Float32Array(liveSpectrum);
        spectrum = liveSpectrum;
      }
    } else if (ui.spectrumCache) {
      spectrum = ui.spectrumCache;
    }

    if (spectrum && synth && synth.context) {
      const binWidth = synth.context.sampleRate / 2 / spectrum.length;
      const barCount = Math.max(54, Math.floor(plotWidth / 7));
      const barGap = 1.2;
      const barWidth = Math.max(1, plotWidth / barCount - barGap);
      const fill = context.createLinearGradient(0, plotBottom, 0, plotTop);
      fill.addColorStop(0, "rgba(57, 142, 119, 0.42)");
      fill.addColorStop(0.55, "rgba(91, 210, 176, 0.72)");
      fill.addColorStop(1, "rgba(255, 206, 132, 0.92)");
      context.fillStyle = fill;

      for (let index = 0; index < barCount; index += 1) {
        const startFrequency =
          minFrequency * Math.pow(maxFrequency / minFrequency, index / barCount);
        const endFrequency =
          minFrequency * Math.pow(maxFrequency / minFrequency, (index + 1) / barCount);
        const startBin = clamp(Math.floor(startFrequency / binWidth), 0, spectrum.length - 1);
        const endBin = clamp(Math.ceil(endFrequency / binWidth), startBin + 1, spectrum.length);
        let peak = -120;
        for (let bin = startBin; bin < endBin; bin += 1) {
          peak = Math.max(peak, spectrum[bin]);
        }
        const normalized = clamp((peak + 92) / 77, 0, 1);
        const barHeight = Math.pow(normalized, 1.35) * plotHeight;
        if (barHeight < 1) continue;
        const x = plotLeft + (index / barCount) * plotWidth;
        context.fillRect(x, plotBottom - barHeight, barWidth, barHeight);
      }

      context.fillStyle = "rgba(113, 233, 196, 0.03)";
      context.fillRect(plotLeft, plotTop, plotWidth, 1);
    } else {
      context.strokeStyle = "rgba(113, 233, 196, 0.18)";
      context.beginPath();
      context.moveTo(plotLeft, plotBottom - 0.5);
      context.lineTo(plotRight, plotBottom - 0.5);
      context.stroke();
      context.fillStyle = "rgba(118, 129, 123, 0.6)";
      context.font = `8px ${CANVAS_FONT}`;
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText("启动音频后，这里显示实时谐波", (plotLeft + plotRight) / 2, plotTop + plotHeight * 0.5);
    }

    const f0X = mapFrequency(392);
    context.save();
    context.setLineDash([2, 4]);
    context.strokeStyle = "rgba(255, 184, 92, 0.58)";
    context.beginPath();
    context.moveTo(f0X + 0.5, plotTop - 1);
    context.lineTo(f0X + 0.5, plotBottom);
    context.stroke();
    context.restore();
    context.fillStyle = "rgba(255, 184, 92, 0.86)";
    context.font = `6px ${CANVAS_FONT}`;
    context.textAlign = "center";
    context.textBaseline = "bottom";
    context.fillText("f₀ 392", f0X, plotTop - 3);

    const movingX = mapFrequency(clamp(state.observedFrequency, minFrequency, maxFrequency));
    const movingGlow = context.createLinearGradient(0, plotTop, 0, plotBottom);
    movingGlow.addColorStop(0, "rgba(113, 233, 196, 0.85)");
    movingGlow.addColorStop(1, "rgba(113, 233, 196, 0.06)");
    context.strokeStyle = movingGlow;
    context.lineWidth = 1.2;
    context.beginPath();
    context.moveTo(movingX + 0.5, plotTop);
    context.lineTo(movingX + 0.5, plotBottom);
    context.stroke();
    context.fillStyle = "rgba(160, 246, 222, 0.94)";
    context.beginPath();
    context.moveTo(movingX, plotTop - 6);
    context.lineTo(movingX - 3, plotTop - 10);
    context.lineTo(movingX + 3, plotTop - 10);
    context.closePath();
    context.fill();

    const movingLabel = `f运动 ${state.observedFrequency.toFixed(0)}`;
    const labelWidth = context.measureText(movingLabel).width + 8;
    const labelX = clamp(movingX, plotLeft + labelWidth / 2, plotRight - labelWidth / 2);
    context.fillStyle = "rgba(7, 13, 12, 0.8)";
    roundedRect(context, labelX - labelWidth / 2, plotTop + 4, labelWidth, 12, 3);
    context.fill();
    context.fillStyle = "rgba(160, 246, 222, 0.9)";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(movingLabel, labelX, plotTop + 10);

    context.fillStyle = "rgba(113, 233, 196, 0.3)";
    context.beginPath();
    context.arc(plotLeft + 1, plotBottom - 2 + Math.sin(timestamp / 220) * 0.5, 1.3, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  function animationFrame(timestamp) {
    const deltaSeconds = ui.lastFrameAt
      ? Math.min((timestamp - ui.lastFrameAt) / 1000, 0.05)
      : 0;
    ui.lastFrameAt = timestamp;

    if (run.status === "running") updateSimulation(deltaSeconds);
    drawScene(timestamp);

    if (timestamp - ui.lastTraceDrawAt > 60) {
      drawTrace();
      ui.lastTraceDrawAt = timestamp;
    }
    requestAnimationFrame(animationFrame);
  }

  function bindEvents() {
    [
      elements.speedInput,
      elements.durationInput,
      elements.listenerXInput,
      elements.listenerYInput,
    ].forEach((input) => {
      input.addEventListener("input", handleParameterInput);
    });

    elements.playButton.addEventListener("click", togglePlayback);
    elements.resetButton.addEventListener("click", () => {
      resetRun();
      if (synth && synth.context) setAudioStatus("Web Audio · 已暂停", "live");
    });
    elements.muteButton.addEventListener("click", () => {
      const muted = synth.toggleMuted();
      ui.muted = muted;
      elements.muteButton.classList.toggle("is-muted", muted);
      elements.muteButton.setAttribute("aria-pressed", String(muted));
      elements.muteIcon.textContent = muted ? "MUTE" : "VOL";
    });
    elements.presetButton.addEventListener("click", () => {
      applyPreset(DEFAULT_PARAMS);
    });
    elements.demoButton.addEventListener("click", () => {
      applyPreset(DEFAULT_PARAMS);
      startRun();
    });

    document.addEventListener("keydown", (event) => {
      const target = event.target;
      const isTyping =
        target instanceof HTMLInputElement ||
        target instanceof HTMLButtonElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement;
      if (event.code === "Space" && !isTyping) {
        event.preventDefault();
        togglePlayback();
      }
      if (event.key.toLowerCase() === "r" && !isTyping) {
        resetRun();
      }
    });

    window.addEventListener("resize", () => {
      drawScene(performance.now());
      drawTrace();
    });

    let pendingResize = false;
    if ("ResizeObserver" in window) {
      const observer = new ResizeObserver(() => {
        if (pendingResize) return;
        pendingResize = true;
        requestAnimationFrame(() => {
          pendingResize = false;
          drawScene(performance.now());
          drawTrace();
        });
      });
      observer.observe(elements.canvasShell);
    }
  }

  function init() {
    synth = new TrainSynth();
    readParamsFromInputs();
    updateControlLabels();
    bindEvents();
    renderRunLog();
    updateLiveReadouts(currentDisplayState());
    drawScene(performance.now());
    drawTrace();
    requestAnimationFrame(animationFrame);
  }

  init();
})();
