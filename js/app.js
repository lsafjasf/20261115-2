(function () {
  "use strict";

  const { PANEL_W, easeInOutCubic, clamp, PaperFoldRenderer } = window.PaperFold;
  const DURATION = 10;
  const TRACK_COLORS = {
    cover: "#b94a33",
    inner: "#1e3932",
    plate: "#c8993f"
  };
  const FOLD_META = {
    cover: {
      number: "01",
      name: "Cover leaf",
      subtitle: "Front surface / perspective fold",
      directions: [
        { value: "toward", label: "Front" },
        { value: "away", label: "Away" }
      ]
    },
    inner: {
      number: "02",
      name: "Inner page",
      subtitle: "Ink reveal / directional wash",
      directions: [
        { value: "ltr", label: "L → R" },
        { value: "rtl", label: "R → L" }
      ]
    },
    plate: {
      number: "03",
      name: "Illustration",
      subtitle: "Plate surface / perspective fold",
      directions: [
        { value: "toward", label: "Front" },
        { value: "away", label: "Away" }
      ]
    }
  };
  const PRESETS = {
    sequence: {
      cover: { start: 0.25, duration: 2.65, direction: "toward" },
      inner: { start: 1.55, duration: 2.15, direction: "ltr" },
      plate: { start: 3.15, duration: 2.7, direction: "toward" }
    },
    overlap: {
      cover: { start: 0.2, duration: 3.4, direction: "toward" },
      inner: { start: 0.65, duration: 2.8, direction: "rtl" },
      plate: { start: 1.45, duration: 3.45, direction: "away" }
    },
    together: {
      cover: { start: 0.35, duration: 3.25, direction: "toward" },
      inner: { start: 0.35, duration: 3.25, direction: "ltr" },
      plate: { start: 0.35, duration: 3.25, direction: "toward" }
    }
  };

  const canvas = document.getElementById("stage");
  const canvasFrame = document.getElementById("canvasFrame");
  const renderer = new PaperFoldRenderer(canvas);
  const audio = new window.PaperAudio();
  const foldCards = document.getElementById("foldCards");
  const timelineTracks = document.getElementById("timelineTracks");
  const scrubber = document.getElementById("scrubber");
  const playheadLine = document.getElementById("playheadLine");
  const playButton = document.getElementById("playButton");
  const rewindButton = document.getElementById("rewindButton");
  const exportButton = document.getElementById("exportButton");
  const exportLabel = document.getElementById("exportLabel");
  const soundToggle = document.getElementById("soundToggle");
  const soundLabel = document.getElementById("soundLabel");
  const foldCheckButton = document.getElementById("foldCheckButton");
  const checkTitle = document.getElementById("checkTitle");
  const checkSub = document.getElementById("checkSub");
  const checkLight = document.getElementById("checkLight");
  const footerStatus = document.getElementById("footerStatus");
  const footerStatusDot = document.querySelector(".status-dot");
  const toast = document.getElementById("toast");
  const toastIcon = document.getElementById("toastIcon");
  const toastTitle = document.getElementById("toastTitle");
  const toastMessage = document.getElementById("toastMessage");
  const currentTimeLabel = document.getElementById("currentTime");
  const coverAngle = document.getElementById("coverAngle");
  const innerAngle = document.getElementById("innerAngle");
  const plateAngle = document.getElementById("plateAngle");
  const stageHint = document.getElementById("stageHint");
  const scrubIndicator = document.getElementById("scrubIndicator");

  const state = {
    time: 6.4,
    folds: JSON.parse(JSON.stringify(PRESETS.sequence)),
    playing: false,
    scrubbing: false,
    exporting: false,
    checking: false,
    checkStartedAt: 0,
    checkPromise: null,
    clockStart: 0,
    clockOffset: 0,
    soundEnabled: true,
    activePreset: "sequence",
    lastFrameTime: 0,
    frameCounter: 0,
    frameRate: 30,
    lastProgress: {}
  };

  let toastTimer = 0;
  let rafId = 0;

  function getFoldRawProgress(id, time) {
    const fold = state.folds[id];
    return clamp((time - fold.start) / Math.max(fold.duration, 0.01), 0, 1);
  }

  function snapshotProgress(time) {
    return {
      cover: getFoldRawProgress("cover", time),
      inner: getFoldRawProgress("inner", time),
      plate: getFoldRawProgress("plate", time)
    };
  }

  function showToast(title, message, tone) {
    toastTitle.textContent = title;
    toastMessage.textContent = message;
    toastIcon.textContent = tone === "error" ? "!" : "✓";
    toast.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 4200);
  }

  function formatTime(seconds) {
    return seconds.toFixed(2).padStart(5, "0");
  }

  function formatClock(seconds) {
    return seconds.toFixed(2).padStart(5, "0");
  }

  function directionWord(fold) {
    if (fold.direction === "toward") return "toward";
    if (fold.direction === "away") return "away";
    return fold.direction === "ltr" ? "left to right" : "right to left";
  }

  function buildFoldCards() {
    for (const id of ["cover", "inner", "plate"]) {
      const meta = FOLD_META[id];
      const fold = state.folds[id];
      const card = document.createElement("article");
      card.className = "fold-card";
      card.dataset.fold = id;
      card.style.setProperty("--accent", TRACK_COLORS[id]);
      card.innerHTML = `
        <div class="fold-card-top">
          <div class="fold-identity">
            <span class="fold-number">${meta.number}</span>
            <span class="fold-name"><strong>${meta.name}</strong><small>${meta.subtitle}</small></span>
          </div>
          <div class="dir-toggle" role="group" aria-label="${meta.name} direction"></div>
        </div>
        <div class="fold-controls">
          <div class="range-row">
            <label for="${id}Start">Start</label>
            <input id="${id}Start" data-control="start" type="range" min="0" max="9" step="0.05" value="${fold.start}">
            <output for="${id}Start" data-output="start">${fold.start.toFixed(2)}s</output>
          </div>
          <div class="range-row">
            <label for="${id}Duration">Length</label>
            <input id="${id}Duration" data-control="duration" type="range" min="0.8" max="4" step="0.05" value="${fold.duration}">
            <output for="${id}Duration" data-output="duration">${fold.duration.toFixed(2)}s</output>
          </div>
        </div>
        <div class="fold-meter">
          <span class="fold-meter-track"></span>
          <span class="fold-meter-fill" data-meter-fill></span>
          <span class="fold-meter-cue" data-meter-cue></span>
        </div>
        <div class="fold-meter-meta"><span data-meter-start></span><span data-meter-end></span></div>
      `;
      const toggle = card.querySelector(".dir-toggle");
      for (const direction of meta.directions) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "dir-btn";
        button.dataset.direction = direction.value;
        button.textContent = direction.label;
        button.setAttribute("aria-pressed", String(fold.direction === direction.value));
        button.addEventListener("click", () => setDirection(id, direction.value));
        toggle.appendChild(button);
      }

      for (const input of card.querySelectorAll("input[type='range']")) {
        input.addEventListener("input", (event) => {
          const control = event.currentTarget.dataset.control;
          const value = Number(event.currentTarget.value);
          updateFoldSetting(id, control, value);
        });
        updateRangeFill(input);
      }
      foldCards.appendChild(card);
    }
    updateTimelineTracks();
  }

  function updateRangeFill(input) {
    const min = Number(input.min);
    const max = Number(input.max);
    const progress = ((Number(input.value) - min) / (max - min)) * 100;
    input.style.setProperty("--fill", `${progress}%`);
  }

  function refreshCardInputs() {
    for (const id of ["cover", "inner", "plate"]) {
      const card = foldCards.querySelector(`[data-fold="${id}"]`);
      if (!card) continue;
      const fold = state.folds[id];
      const startInput = card.querySelector("[data-control='start']");
      const durationInput = card.querySelector("[data-control='duration']");
      startInput.value = fold.start;
      durationInput.value = fold.duration;
      card.querySelector("[data-output='start']").textContent = `${fold.start.toFixed(2)}s`;
      card.querySelector("[data-output='duration']").textContent = `${fold.duration.toFixed(2)}s`;
      updateRangeFill(startInput);
      updateRangeFill(durationInput);
      for (const button of card.querySelectorAll(".dir-btn")) {
        button.setAttribute("aria-pressed", String(button.dataset.direction === fold.direction));
      }
    }
  }

  function updateFoldSetting(id, control, value) {
    const fold = state.folds[id];
    if (control === "start") {
      fold.start = clamp(value, 0, DURATION - 0.8);
      fold.duration = Math.min(fold.duration, DURATION - fold.start);
    } else {
      fold.duration = clamp(value, 0.8, 4);
      fold.start = Math.min(fold.start, DURATION - fold.duration);
    }
    clearPresetSelection();
    refreshCardInputs();
    updateTimelineTracks();
    renderFrame();
    refreshValidation();
  }

  function setDirection(id, direction) {
    if (state.folds[id].direction === direction) return;
    state.folds[id].direction = direction;
    clearPresetSelection();
    refreshCardInputs();
    renderFrame();
    refreshValidation();
  }

  function clearPresetSelection() {
    state.activePreset = null;
    for (const button of document.querySelectorAll(".preset")) {
      button.classList.remove("is-active");
    }
  }

  function applyPreset(name) {
    if (!PRESETS[name]) return;
    state.folds = JSON.parse(JSON.stringify(PRESETS[name]));
    state.activePreset = name;
    for (const button of document.querySelectorAll(".preset")) {
      button.classList.toggle("is-active", button.dataset.preset === name);
    }
    refreshCardInputs();
    updateTimelineTracks();
    renderFrame();
    refreshValidation();
  }

  function updateTimelineTracks() {
    timelineTracks.innerHTML = "";
    for (const id of ["cover", "inner", "plate"]) {
      const fold = state.folds[id];
      const bar = document.createElement("span");
      bar.className = "timeline-track";
      bar.style.setProperty("--left", `${(fold.start / DURATION) * 100}%`);
      bar.style.setProperty("--width", `${(fold.duration / DURATION) * 100}%`);
      bar.style.setProperty("--track", TRACK_COLORS[id]);
      bar.title = `${FOLD_META[id].name}: ${fold.start.toFixed(2)}s–${(fold.start + fold.duration).toFixed(2)}s`;
      timelineTracks.appendChild(bar);
    }
  }

  function setTime(time, options) {
    const settings = options || {};
    const prev = state.time;
    state.time = clamp(time, 0, DURATION);

    if (!settings.silent && (state.playing || state.checking)) {
      triggerSoundCrossings(prev, state.time);
    } else if (!settings.silent && state.scrubbing && Math.abs(state.time - prev) > 0.015) {
      audio.manualRustle(clamp(Math.abs(state.time - prev) * 2.2, 0.18, 0.72));
    }
    state.lastProgress = snapshotProgress(state.time);
    renderFrame();
  }

  function triggerSoundCrossings(previousTime, nextTime) {
    const thresholds = [0.05, 0.38, 0.7, 0.94];
    const pans = { cover: -0.32, inner: 0, plate: 0.34 };
    for (const id of ["cover", "inner", "plate"]) {
      const before = getFoldRawProgress(id, previousTime);
      const after = getFoldRawProgress(id, nextTime);
      if (before === after) continue;
      const direction = after > before ? 1 : -1;
      for (const threshold of thresholds) {
        if ((before < threshold && after >= threshold) || (before > threshold && after <= threshold)) {
          const strength = clamp((id === "inner" ? 0.55 : 0.82) + Math.abs(after - before) * 1.8, 0.35, 1);
          audio.playFoldEvent(strength, pans[id], threshold === thresholds[1] ? 0.018 : 0);
        }
      }
      if (direction < 0 && Math.random() > 0.74) {
        audio.playRustle(0.28, pans[id] * 0.7);
      }
    }
  }

  function renderFrame() {
    renderer.render(state.time, state.folds);
    const metrics = renderer.metrics(state.time, state.folds);
    updateInterface(metrics);
    return metrics;
  }

  function updateInterface(metrics) {
    if (!metrics) metrics = renderer.metrics(state.time, state.folds);
    const progressPercent = (state.time / DURATION) * 100;
    scrubber.value = state.time;
    scrubber.style.setProperty("--progress", `${progressPercent}%`);
    playheadLine.style.left = `${progressPercent}%`;
    currentTimeLabel.textContent = formatClock(state.time);
    coverAngle.textContent = `${metrics.angle.cover.toFixed(1)}°`;
    innerAngle.textContent = `${metrics.angle.inner.toFixed(0)}%`;
    plateAngle.textContent = `${metrics.angle.plate.toFixed(1)}°`;

    for (const id of ["cover", "inner", "plate"]) {
      const card = foldCards.querySelector(`[data-fold="${id}"]`);
      if (!card) continue;
      const fold = state.folds[id];
      const progress = metrics.progress[id];
      const moving = progress > 0.002 && progress < 0.998;
      card.classList.toggle("is-moving", moving);
      const startPct = (fold.start / DURATION) * 100;
      const widthPct = (fold.duration / DURATION) * 100;
      const fill = card.querySelector("[data-meter-fill]");
      fill.style.left = `${startPct}%`;
      fill.style.width = `${widthPct}%`;
      const cue = card.querySelector("[data-meter-cue]");
      cue.style.left = `${startPct + widthPct * progress}%`;
      card.querySelector("[data-meter-start]").textContent = `${fold.start.toFixed(2)}s`;
      card.querySelector("[data-meter-end]").textContent = `${(fold.start + fold.duration).toFixed(2)}s`;
    }

    const movingIds = ["cover", "inner", "plate"].filter((id) => {
      const p = metrics.progress[id];
      return p > 0.002 && p < 0.998;
    });
    if (state.exporting) {
      footerStatus.textContent = "Recording Canvas + paper audio";
      stageHint.textContent = "Export is locked to a ten second timeline";
      exportLabel.textContent = `Recording ${Math.round((state.time / DURATION) * 100)}%`;
    } else if (state.checking) {
      footerStatus.textContent = "Running open / fold verification";
      stageHint.textContent = "Verifying three surfaces in sequence";
    } else if (state.playing) {
      footerStatus.textContent = movingIds.length
        ? `${movingIds.map((id) => FOLD_META[id].name).join(" + ")} in motion`
        : "Holding the open spread";
      stageHint.textContent = "Playing the configured fold sequence";
    } else if (state.scrubbing) {
      footerStatus.textContent = "Manual angle inspection";
      stageHint.textContent = "Perspective projection is live at every angle";
    } else if (movingIds.length) {
      footerStatus.textContent = `${FOLD_META[movingIds[0]].name} held at an intermediate angle`;
      stageHint.textContent = "Drag the playhead to freeze any angle";
    } else if (state.time >= DURATION - 0.01) {
      footerStatus.textContent = "All three surfaces aligned";
      stageHint.textContent = "Open spread / drag the playhead to inspect";
    } else if (state.time <= 0.01) {
      footerStatus.textContent = "Closed stack / surfaces aligned";
      stageHint.textContent = "Press play to unfold all three surfaces";
    } else {
      footerStatus.textContent = "Timeline paused";
      stageHint.textContent = "Drag the playhead to freeze any angle";
    }
    playButton.classList.toggle("is-playing", state.playing);
    playButton.setAttribute("aria-label", state.playing ? "Pause animation" : "Play animation");
    canvasFrame.classList.toggle("is-scrubbing", state.scrubbing);
    exportButton.disabled = state.exporting || state.checking;
    foldCheckButton.disabled = state.checking || state.exporting;
    playButton.disabled = state.exporting || state.checking;
    scrubber.disabled = state.exporting || state.checking;
  }

  function validateSequence() {
    const open = renderer.metrics(DURATION, state.folds);
    const closed = renderer.metrics(0, state.folds);
    const openByX = ["cover", "inner", "plate"]
      .slice()
      .sort((a, b) => open.centers[a].x - open.centers[b].x);
    const openOrderCorrect = openByX.join(",") === "cover,inner,plate";

    let depthSamplesValid = true;
    let allSurfacesPresent = true;
    for (let i = 0; i <= 100; i += 1) {
      const sample = renderer.metrics((i / 100) * DURATION, state.folds);
      if (new Set(sample.depthOrder).size !== 3) depthSamplesValid = false;
      if (sample.depthOrder.length !== 3) allSurfacesPresent = false;
    }

    const closedOverlap = ["cover", "plate"].every((id) => {
      const distance = Math.abs(closed.centers[id].x - closed.centers.inner.x);
      return distance < 18;
    });
    const timingValid = ["cover", "inner", "plate"].every((id) => {
      const fold = state.folds[id];
      return fold.start >= 0 && fold.duration >= 0.8 && fold.start + fold.duration <= DURATION + 0.001;
    });
    const checks = {
      openOrderCorrect,
      depthSamplesValid,
      allSurfacesPresent,
      closedOverlap,
      timingValid
    };
    return {
      ok: Object.values(checks).every(Boolean),
      checks,
      openOrder: openByX,
      closedTop: closed.topSurface,
      openOrderText: openByX.map((id) => FOLD_META[id].number).join(" · ")
    };
  }

  function refreshValidation(report) {
    const result = report || validateSequence();
    checkLight.classList.toggle("is-error", !result.ok);
    footerStatusDot.classList.toggle("is-error", !result.ok);
    if (result.ok) {
      checkTitle.textContent = "Sequence verified";
      checkSub.textContent = `Open order ${result.openOrderText} · depth sort ${result.closedTop}`;
    } else {
      checkTitle.textContent = "Check required";
      checkSub.textContent = "A fold timing or surface order needs attention";
    }
    return result;
  }

  function stopLoop() {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
  }

  function ensureLoop() {
    if (!rafId) rafId = requestAnimationFrame(tick);
  }

  function startPlayback(reset) {
    if (state.exporting || state.checking) return;
    audio.unlock();
    if (reset || state.time >= DURATION - 0.02) {
      setTime(0, { silent: true });
    }
    state.playing = true;
    state.clockStart = performance.now();
    state.clockOffset = state.time;
    state.lastProgress = snapshotProgress(state.time);
    updateInterface();
    ensureLoop();
  }

  function pausePlayback() {
    if (!state.playing) return;
    state.playing = false;
    stopLoop();
    renderFrame();
  }

  function allFoldsComplete() {
    return ["cover", "inner", "plate"].every((id) => getFoldRawProgress(id, state.time) >= 1);
  }

  function togglePlayback() {
    if (state.playing) {
      pausePlayback();
    } else {
      startPlayback(allFoldsComplete());
    }
  }

  function tick(now) {
    rafId = 0;
    if (state.lastFrameTime) {
      const delta = now - state.lastFrameTime;
      if (delta > 0 && delta < 500) {
        state.frameCounter += 1;
        state.frameRate = state.frameRate * 0.94 + (1000 / delta) * 0.06;
      }
    }
    state.lastFrameTime = now;

    if (state.exportStopPending) {
      state.exportStopPending = false;
      finishExport();
      return;
    }

    if (state.playing) {
      const nextTime = state.clockOffset + (now - state.clockStart) / 1000;
      if (nextTime >= DURATION) {
        setTime(DURATION);
        state.playing = false;
        if (state.exporting) {
          state.exportStopPending = true;
        } else {
          renderFrame();
        }
      } else {
        setTime(nextTime);
      }
    }

    if (state.checking) {
      advanceFoldCheck(now);
    }

    if (state.playing || state.checking || state.exportStopPending) {
      ensureLoop();
    }
  }

  function runFoldCheck() {
    if (state.checking) return state.checkPromise;
    if (state.exporting) {
      return Promise.resolve({ ok: false, message: "Export in progress" });
    }
    pausePlayback();
    audio.unlock();
    state.checking = true;
    state.checkStartedAt = performance.now();
    state.checkForwardMs = 2600;
    state.checkReverseMs = 2600;
    foldCheckButton.textContent = "Checking 0%";
    setTime(0, { silent: true });
    refreshValidation();
    updateInterface();
    ensureLoop();
    state.checkPromise = new Promise((resolve) => {
      state.resolveFoldCheck = resolve;
    });
    return state.checkPromise;
  }

  function advanceFoldCheck(now) {
    const elapsed = now - state.checkStartedAt;
    const forward = state.checkForwardMs;
    const reverse = state.checkReverseMs;
    if (elapsed < forward) {
      setTime((elapsed / forward) * DURATION);
      foldCheckButton.textContent = `Checking ${Math.round((elapsed / forward) * 50)}%`;
      return;
    }
    if (elapsed < forward + reverse) {
      const ratio = (elapsed - forward) / reverse;
      setTime((1 - ratio) * DURATION);
      foldCheckButton.textContent = `Checking ${Math.round(50 + ratio * 50)}%`;
      return;
    }

    state.checking = false;
    setTime(0, { silent: true });
    foldCheckButton.textContent = "Run fold check";
    const report = refreshValidation();
    updateInterface();
    if (report.ok) {
      showToast("Fold sequence verified", "Unfolded once and folded once. Open order 01 · 02 · 03 is correct.");
    } else {
      showToast("Fold check needs attention", "A surface order or timing constraint did not pass.", "error");
    }
    if (state.resolveFoldCheck) state.resolveFoldCheck(report);
    state.resolveFoldCheck = null;
    state.checkPromise = null;
  }

  function supportedMimeType() {
    if (!window.MediaRecorder) return "";
    const candidates = [
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm;codecs=vp9",
      "video/webm;codecs=vp8",
      "video/webm"
    ];
    return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || "";
  }

  async function exportVideo() {
    if (state.exporting) return { ok: false, message: "Export already running" };
    if (state.checking) return { ok: false, message: "Fold check in progress" };
    if (!window.MediaRecorder) {
      showToast("WebM unavailable", "This browser does not expose MediaRecorder.", "error");
      return { ok: false, message: "MediaRecorder unavailable" };
    }

    await audio.unlock();
    pausePlayback();
    state.playing = false;
    state.exporting = true;
    setTime(0, { silent: true });
    exportButton.classList.add("is-recording");
    exportLabel.textContent = "Recording 00%";
    exportButton.disabled = true;

    const canvasStream = canvas.captureStream(30);
    const tracks = canvasStream.getVideoTracks();
    const audioTrack = audio.getAudioTrack();
    if (audioTrack) tracks.push(audioTrack);
    const stream = new MediaStream(tracks);
    const mimeType = supportedMimeType();
    const options = {
      videoBitsPerSecond: 6500000,
      audioBitsPerSecond: 128000
    };
    if (mimeType) options.mimeType = mimeType;

    let recorder;
    try {
      recorder = new MediaRecorder(stream, options);
    } catch (error) {
      state.exporting = false;
      exportButton.classList.remove("is-recording");
      exportButton.disabled = false;
      exportLabel.textContent = "Export 10s WebM";
      showToast("Could not start export", error.message || "MediaRecorder rejected the canvas stream.", "error");
      return { ok: false, message: error.message };
    }

    const chunks = [];
    let exportResolve;
    const exportPromise = new Promise((resolve) => {
      exportResolve = resolve;
    });
    state.exportResolve = exportResolve;
    state.exportRecorder = recorder;
    state.exportStream = canvasStream;
    state.exportStartedAt = performance.now();

    recorder.addEventListener("dataavailable", (event) => {
      if (event.data && event.data.size) chunks.push(event.data);
    });
    recorder.addEventListener("error", (event) => {
      const error = event.error || new Error("MediaRecorder error");
      showToast("Export failed", error.message || "The recording could not be completed.", "error");
      state.exporting = false;
      exportButton.classList.remove("is-recording");
      exportButton.disabled = false;
      exportLabel.textContent = "Export 10s WebM";
      if (state.exportResolve) state.exportResolve({ ok: false, message: error.message });
    });
    recorder.addEventListener("stop", () => {
      const preferredType = recorder.mimeType || mimeType || "video/webm";
      const blob = new Blob(chunks, { type: preferredType });
      const url = URL.createObjectURL(blob);
      const filename = "paperfold_10s.webm";
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.style.display = "none";
      document.body.appendChild(link);
      link.click();
      link.remove();

      state.exporting = false;
      exportButton.classList.remove("is-recording");
      exportButton.disabled = false;
      exportLabel.textContent = "Export 10s WebM";
      for (const track of canvasStream.getVideoTracks()) track.stop();
      setTime(DURATION, { silent: true });
      showToast("WebM exported", `10.00 s · ${(blob.size / 1000000).toFixed(2)} MB · Canvas + Web Audio`);
      const result = {
        ok: true,
        blob,
        url,
        filename,
        mimeType: preferredType,
        size: blob.size,
        duration: 10
      };
      window.paperfold.lastExport = result;
      if (state.exportResolve) state.exportResolve(result);
      state.exportResolve = null;
    });

    recorder.start(250);
    state.clockStart = performance.now();
    state.clockOffset = 0;
    state.playing = true;
    state.lastProgress = snapshotProgress(0);
    updateInterface();
    ensureLoop();
    return exportPromise;
  }

  function finishExport() {
    if (!state.exporting) return;
    state.playing = false;
    if (state.exportRecorder && state.exportRecorder.state !== "inactive") {
      state.exportRecorder.stop();
    }
  }

  function beginScrub() {
    if (state.exporting || state.checking) return;
    audio.unlock();
    if (state.playing) pausePlayback();
    state.scrubbing = true;
    canvasFrame.classList.add("is-scrubbing");
  }

  function endScrub() {
    if (!state.scrubbing) return;
    state.scrubbing = false;
    canvasFrame.classList.remove("is-scrubbing");
    renderFrame();
  }

  function bindControls() {
    playButton.addEventListener("click", () => {
      togglePlayback();
    });

    rewindButton.addEventListener("click", () => {
      if (state.exporting || state.checking) return;
      audio.unlock();
      pausePlayback();
      setTime(0);
    });

    scrubber.addEventListener("pointerdown", beginScrub);
    scrubber.addEventListener("input", () => {
      if (state.exporting || state.checking) return;
      if (!state.scrubbing) beginScrub();
      setTime(Number(scrubber.value));
    });
    scrubber.addEventListener("change", endScrub);
    window.addEventListener("pointerup", endScrub);
    window.addEventListener("pointercancel", endScrub);

    soundToggle.addEventListener("click", async () => {
      state.soundEnabled = !state.soundEnabled;
      soundToggle.setAttribute("aria-pressed", String(state.soundEnabled));
      soundLabel.innerHTML = `Paper sound <b>${state.soundEnabled ? "on" : "off"}</b>`;
      if (state.soundEnabled) {
        await audio.unlock();
        audio.setEnabled(true);
        audio.playRustle(0.5, 0);
      } else {
        audio.setEnabled(false);
      }
    });

    exportButton.addEventListener("click", () => {
      exportVideo().then((result) => {
        if (!result || !result.ok) {
          finishCleanupAfterFailedExport();
        }
      }).catch((error) => {
        showToast("Export failed", error.message || "Unexpected export error.", "error");
        finishCleanupAfterFailedExport();
      });
    });

    foldCheckButton.addEventListener("click", () => {
      runFoldCheck().then((report) => {
        if (!report.ok) {
          footerStatusDot.classList.add("is-error");
        }
      });
    });

    document.getElementById("settingsReset").addEventListener("click", () => {
      if (state.exporting || state.checking) return;
      pausePlayback();
      applyPreset("sequence");
      setTime(6.4);
      showToast("Composition reset", "The sequential fold timing is restored.");
    });

    for (const button of document.querySelectorAll(".preset")) {
      button.addEventListener("click", () => {
        if (state.exporting || state.checking) return;
        pausePlayback();
        applyPreset(button.dataset.preset);
      });
    }

    document.addEventListener("keydown", (event) => {
      const target = event.target;
      if (target instanceof HTMLElement && target.matches("input, button, a, select, textarea")) return;
      if (event.code === "Space") {
        event.preventDefault();
        togglePlayback();
      } else if (event.code === "ArrowLeft" || event.code === "ArrowRight") {
        event.preventDefault();
        if (state.exporting || state.checking) return;
        pausePlayback();
        beginScrub();
        const delta = event.shiftKey ? 1 : 0.1;
        setTime(state.time + (event.code === "ArrowRight" ? delta : -delta));
        clearTimeout(state.scrubKeyboardTimer);
        state.scrubKeyboardTimer = setTimeout(endScrub, 260);
      } else if (event.code === "Home") {
        if (state.exporting || state.checking) return;
        pausePlayback();
        setTime(0);
      } else if (event.code === "End") {
        if (state.exporting || state.checking) return;
        pausePlayback();
        setTime(DURATION);
      }
    });

    const resizeObserver = new ResizeObserver(() => {
      renderer.resize();
      renderFrame();
    });
    resizeObserver.observe(canvasFrame);
    window.addEventListener("resize", () => {
      renderer.resize();
      renderFrame();
    });
  }

  function finishCleanupAfterFailedExport() {
    state.exporting = false;
    state.playing = false;
    exportButton.classList.remove("is-recording");
    exportButton.disabled = false;
    exportLabel.textContent = "Export 10s WebM";
    if (state.exportStream) {
      for (const track of state.exportStream.getVideoTracks()) track.stop();
    }
    renderFrame();
  }

  function init() {
    buildFoldCards();
    bindControls();
    renderer.resize();
    renderFrame();
    refreshValidation();
    state.lastProgress = snapshotProgress(state.time);

    window.paperfold = {
      getState() {
        return {
          time: state.time,
          folds: JSON.parse(JSON.stringify(state.folds)),
          playing: state.playing,
          exporting: state.exporting,
          checking: state.checking,
          activePreset: state.activePreset
        };
      },
      setTime(time) {
        pausePlayback();
        setTime(clamp(Number(time), 0, DURATION));
        return renderer.metrics(state.time, state.folds);
      },
      setFolds(nextFolds) {
        for (const id of ["cover", "inner", "plate"]) {
          if (!nextFolds[id]) continue;
          state.folds[id] = { ...state.folds[id], ...nextFolds[id] };
        }
        clearPresetSelection();
        refreshCardInputs();
        updateTimelineTracks();
        renderFrame();
        refreshValidation();
      },
      metrics(time) {
        return renderer.metrics(time === undefined ? state.time : time, state.folds);
      },
      validate: validateSequence,
      runFoldCheck,
      exportVideo,
      resetPlayback() {
        pausePlayback();
        setTime(0);
      },
      renderer
    };

    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => {
        renderer.resize();
        renderFrame();
      });
    }
  }

  init();
})();
