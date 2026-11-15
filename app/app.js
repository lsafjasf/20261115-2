(function startApp() {
  const data = window.TUNNEL_DATA;
  const engine = window.CryoEngine.createEngine(data);
  const canvas = document.getElementById("tunnelCanvas");
  const renderer = window.CryoRenderer.createRenderer(canvas);
  const sound = window.CryoAudio.createFanSound();
  const $ = (id) => document.getElementById(id);
  const outcomes = [null, null, null];

  const el = {
    batchRail: $("batchRail"),
    batchSteps: Array.from(document.querySelectorAll(".batch-step")),
    energyValue: $("energyValue"),
    energyFill: $("energyFill"),
    energyCard: $("energyCard"),
    runState: $("runState"),
    liveChip: document.querySelector(".live-chip"),
    rpmReadout: $("rpmReadout"),
    airReadout: $("airReadout"),
    soundBtn: $("soundBtn"),
    soundLabel: $("soundLabel"),
    batchClock: $("batchClock"),
    alarmBanner: $("alarmBanner"),
    tempCard: $("tempCard"),
    coreTemp: $("coreTemp"),
    tempTrend: $("tempTrend"),
    tempDelta: $("tempDelta"),
    tempNeedle: $("tempNeedle"),
    airMetric: $("airMetric"),
    airState: $("airState"),
    airRisk: $("airRisk"),
    airBar: $("airBar"),
    dwellMetric: $("dwellMetric"),
    dwellState: $("dwellState"),
    dwellTarget: $("dwellTarget"),
    dwellBar: $("dwellBar"),
    driftMetric: $("driftMetric"),
    driftState: $("driftState"),
    driftLimit: $("driftLimit"),
    driftBar: $("driftBar"),
    batchTitle: $("batchTitle"),
    batchStatus: $("batchStatus"),
    foodIcon: $("foodIcon"),
    foodTagline: $("foodTagline"),
    targetTemp: $("targetTemp"),
    targetTime: $("targetTime"),
    safeAir: $("safeAir"),
    damperSlider: $("damperSlider"),
    damperValue: $("damperValue"),
    damperHint: $("damperHint"),
    gapSlider: $("gapSlider"),
    gapValue: $("gapValue"),
    gapHint: $("gapHint"),
    speedSlider: $("speedSlider"),
    speedValue: $("speedValue"),
    speedHint: $("speedHint"),
    processTip: $("processTip"),
    startBtn: $("startBtn"),
    blockBtn: $("blockBtn"),
    abortBtn: $("abortBtn"),
    resetBtn: $("resetBtn"),
    helpBtn: $("helpBtn"),
    eventLog: $("eventLog"),
    logTime: $("logTime"),
    footerHint: $("footerHint"),
    resultModal: $("resultModal"),
    resultKicker: $("resultKicker"),
    resultTitle: $("resultTitle"),
    resultSummary: $("resultSummary"),
    resultStats: $("resultStats"),
    resultReasons: $("resultReasons"),
    modalPrimary: $("modalPrimary"),
    modalSecondary: $("modalSecondary"),
    helpModal: $("helpModal"),
    helpClose: $("helpClose")
  };

  let resultRef = null;
  let resultModalDismissed = false;
  let lastEventId = null;
  let lastFrame = performance.now();

  function formatDuration(minutes) {
    const whole = Math.max(0, Math.floor(minutes * 60 + 1e-7));
    return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
  }

  function formatEventTime(seconds) {
    const total = Math.max(0, Math.floor(seconds));
    return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  }

  function setStatusClass(node, className) {
    node.classList.remove("running", "blocked", "failed", "success");
    if (className) node.classList.add(className);
  }

  function updateControlLabels(profile) {
    const controls = engine.state.controls;
    el.damperValue.textContent = `${Math.round(controls.damper * 100)}%`;
    el.gapValue.textContent = `${Math.round(controls.gap)} cm`;
    el.speedValue.textContent = `${controls.speed.toFixed(2)} m/min`;
    el.damperHint.textContent = `目标风量 ${Math.round(profile.idealAir * 100)}%`;
    el.gapHint.textContent = `目标间距 ${profile.idealGap} cm`;
    el.speedHint.textContent = `目标 ${profile.idealSpeed.toFixed(2)} m/min`;
  }

  function setControlsFromRecipe(profile) {
    el.damperSlider.value = String(Math.round(profile.idealAir * 100));
    el.gapSlider.value = String(profile.idealGap);
    el.speedSlider.value = String(profile.idealSpeed);
    engine.setControls({
      damper: profile.idealAir,
      gap: profile.idealGap,
      speed: profile.idealSpeed
    });
    updateControlLabels(profile);
  }

  function pushControl(key, value) {
    engine.setControls({ [key]: value });
    updateControlLabels(engine.snapshot().profile);
  }

  el.damperSlider.addEventListener("input", (event) => {
    pushControl("damper", Number(event.target.value) / 100);
  });
  el.gapSlider.addEventListener("input", (event) => {
    pushControl("gap", Number(event.target.value));
  });
  el.speedSlider.addEventListener("input", (event) => {
    pushControl("speed", Number(event.target.value));
  });

  function renderEvents(events) {
    if (!events.length || events[0].id === lastEventId) return;
    lastEventId = events[0].id;
    el.eventLog.replaceChildren();
    events.slice(0, 5).forEach((event) => {
      const row = document.createElement("li");
      row.className = event.type;
      const time = document.createElement("time");
      time.textContent = formatEventTime(event.at);
      const text = document.createElement("span");
      text.textContent = event.message;
      row.append(time, text);
      el.eventLog.append(row);
    });
    el.logTime.textContent = `T+ ${formatEventTime(engine.state.totalRunSeconds)}`;
  }

  function setSoundEnabled(enabled) {
    el.soundBtn.setAttribute("aria-pressed", String(enabled));
    el.soundLabel.textContent = enabled ? "声音开" : "声音关";
  }

  async function enableSound() {
    const ok = await sound.enable();
    setSoundEnabled(ok);
  }

  async function toggleSound() {
    if (sound.isEnabled()) {
      await sound.disable();
      setSoundEnabled(false);
    } else {
      await enableSound();
    }
  }

  function currentProcessTip(snapshot) {
    if (snapshot.blockage) {
      return "E-03：风机堵塞造成冷气中断。点击“清理风机”，随后检查中心温度是否还能在窗口内达标。";
    }
    if (snapshot.status === "running" && snapshot.effectiveAir > snapshot.profile.safeAir) {
      return "有效风量已越过食品安全线。轻质食品会横向滑移，立即降低风门开度。";
    }
    if (snapshot.status === "running" && snapshot.effectiveAir < snapshot.profile.minAir) {
      return "有效风量不足，中心热阻无法在规定时间内被穿透，适当提高风门或减小托盘间距。";
    }
    if (snapshot.status === "result") {
      return snapshot.result.pass
        ? "本批已出舱并完成探针复核，装载下一批前重新核对配方。"
        : "本批已隔离。复盘温度、停留时间与飘移记录后重试。";
    }
    return snapshot.profile.processTip;
  }

  function syncBatchRail(snapshot) {
    el.batchSteps.forEach((step, index) => {
      step.classList.remove("active", "passed", "failed");
      if (outcomes[index] === true || index < snapshot.batchIndex) {
        step.classList.add("passed");
      } else if (outcomes[index] === false) {
        step.classList.add("failed");
      }
      if (index === snapshot.batchIndex && snapshot.status !== "result") {
        step.classList.add("active");
      }
      if (
        index === snapshot.batchIndex &&
        snapshot.status === "result" &&
        snapshot.result
      ) {
        step.classList.add(snapshot.result.pass ? "passed" : "failed");
      }
    });
  }

  function syncUI(snapshot) {
    const profile = snapshot.profile;
    const result = snapshot.result;
    const energyRatio = snapshot.energyTotal / snapshot.energyLimit;
    el.energyValue.textContent = snapshot.energyTotal.toFixed(1);
    el.energyFill.style.width = `${Math.min(100, energyRatio * 100)}%`;
    el.energyFill.style.background = energyRatio > 0.88
      ? "linear-gradient(90deg, var(--amber), var(--red))"
      : "linear-gradient(90deg, var(--cyan-strong), var(--green))";
    el.energyValue.style.color = energyRatio > 0.88 ? "var(--amber)" : "";

    el.runState.textContent = snapshot.blockage
      ? "堵塞报警"
      : snapshot.status === "running"
        ? "制冷中"
        : snapshot.status === "result"
          ? "已出舱"
          : "待机";
    setStatusClass(el.liveChip, snapshot.blockage ? "blocked" : snapshot.status === "running" ? "running" : "");
    el.rpmReadout.textContent = `${snapshot.rpm} rpm`;
    el.airReadout.textContent = `${snapshot.airVelocity.toFixed(2)} m/s`;
    el.batchClock.textContent = `T+ ${formatDuration(snapshot.minutes)}`;
    el.alarmBanner.classList.toggle("visible", snapshot.blockage);

    const sign = snapshot.temp >= 0 ? "+" : "";
    el.coreTemp.innerHTML = `${sign}${snapshot.temp.toFixed(1)}<small>°C</small>`;
    el.coreTemp.style.color = window.CryoRenderer.tempColor(snapshot.temp);
    el.tempTrend.textContent = snapshot.temp <= profile.targetTemp
      ? "中心温度已达标"
      : snapshot.status === "running"
        ? "中心降温中"
        : "等待入舱";
    el.tempDelta.textContent = `目标 ≤ ${profile.targetTemp}°C`;
    const tempPct = Math.min(100, Math.max(0, ((data.tunnel.initialCoreTemp - snapshot.temp) / (data.tunnel.initialCoreTemp - data.tunnel.airTemp)) * 100));
    el.tempNeedle.style.left = `${tempPct}%`;
    el.tempNeedle.style.background = window.CryoRenderer.tempColor(snapshot.temp);

    el.airMetric.innerHTML = `${snapshot.airVelocity.toFixed(2)}<small> m/s</small>`;
    el.airBar.style.width = `${Math.min(100, snapshot.effectiveAir * 100)}%`;
    el.airBar.classList.toggle("danger", snapshot.blockage);
    el.airState.textContent = snapshot.blockage
      ? "堵塞后流量骤降"
      : snapshot.status !== "running"
        ? "待机"
        : snapshot.effectiveAir < profile.minAir
          ? "风量不足"
          : snapshot.effectiveAir > profile.safeAir
            ? "飘移风险"
            : "安全区间";
    el.airRisk.textContent = `安全上限 ${(profile.safeAir * 5.5).toFixed(2)} m/s`;
    el.airRisk.className = snapshot.status === "running" && snapshot.effectiveAir > profile.safeAir ? "danger" : "";

    el.dwellMetric.innerHTML = `${formatDuration(snapshot.minutes)}<small> min</small>`;
    el.dwellBar.style.width = `${Math.min(100, snapshot.minutes / profile.targetTime * 100)}%`;
    el.dwellBar.classList.toggle("danger", snapshot.minutes > profile.targetTime * 1.08);
    el.dwellState.textContent = snapshot.minutes > profile.targetTime * 1.08
      ? "已超时"
      : snapshot.status === "running"
        ? "窗口内运行"
        : "待入舱";
    el.dwellTarget.textContent = `要求 ${formatDuration(profile.targetTime)}`;

    el.driftMetric.innerHTML = `${snapshot.drift.toFixed(1)}<small>%</small>`;
    el.driftState.textContent = snapshot.drift >= 80 ? "接近托盘边缘" : snapshot.drift > 0 ? "横向偏移" : "稳定";
    el.driftState.className = snapshot.drift >= 80 ? "danger" : snapshot.drift > 0 ? "warning" : "";
    el.driftLimit.textContent = "上限 100%";
    el.driftBar.style.width = `${Math.min(100, snapshot.drift)}%`;
    el.driftBar.classList.toggle("danger", snapshot.drift >= 60);

    el.batchTitle.textContent = `${profile.index} · ${profile.name}`;
    el.foodIcon.className = `food-orbit ${profile.visual}`;
    el.foodTagline.textContent = profile.tagline;
    el.targetTemp.textContent = `${profile.targetTemp}°C`;
    el.targetTime.textContent = formatDuration(profile.targetTime);
    el.safeAir.textContent = `≤ ${(profile.safeAir * 5.5).toFixed(2)} m/s`;
    el.batchStatus.textContent = snapshot.blockage
      ? "堵塞报警"
      : snapshot.status === "running"
        ? "制冷中"
        : snapshot.status === "result"
          ? (result && result.pass ? "合格" : "不合格")
          : "待启动";
    setStatusClass(
      el.batchStatus,
      snapshot.blockage
        ? "blocked"
        : snapshot.status === "running"
          ? "running"
          : snapshot.status === "result" && result && !result.pass
            ? "blocked"
            : ""
    );

    el.processTip.textContent = currentProcessTip(snapshot);
    el.blockBtn.disabled = snapshot.status !== "running";
    el.blockBtn.textContent = snapshot.blockage ? "清理风机" : "风机堵塞";
    el.blockBtn.classList.toggle("active", snapshot.blockage);
    el.abortBtn.disabled = snapshot.status !== "running";

    if (snapshot.status === "running") {
      el.startBtn.disabled = true;
      el.startBtn.querySelector("span:last-child").textContent = "批次运行中";
    } else if (snapshot.status === "result") {
      el.startBtn.disabled = false;
      el.startBtn.querySelector("span:last-child").textContent = result && result.pass
        ? (snapshot.campaignComplete ? "再来一局" : "装载下一批")
        : "重试本批";
    } else {
      el.startBtn.disabled = false;
      el.startBtn.querySelector("span:last-child").textContent = "启动批次";
    }

    el.footerHint.textContent = snapshot.status === "running"
      ? `${profile.shortName} · 观察中心探针与飘移累计，工艺参数可实时微调`
      : snapshot.campaignSuccess
        ? "三批全部合格，累计能耗在红线内"
        : "调整三项工艺参数，使温度在规定时间达标";

    updateControlLabels(profile);
    syncBatchRail(snapshot);
    renderEvents(snapshot.events);

    if (snapshot.status === "result" && result && result !== resultRef) {
      resultRef = result;
      outcomes[snapshot.batchIndex] = result.pass;
      if (!resultModalDismissed) showResult(snapshot);
    }
    if (snapshot.status !== "result") {
      resultRef = null;
      if (snapshot.status === "idle") resultModalDismissed = false;
    }
  }

  function openModal(modal) {
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
  }

  function closeModal(modal) {
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
  }

  function addResultReason(text, good = false) {
    const row = document.createElement("p");
    if (good) row.classList.add("good");
    row.textContent = text;
    el.resultReasons.append(row);
  }

  function showResult(snapshot) {
    const result = snapshot.result;
    const profile = snapshot.profile;
    const isFinal = snapshot.campaignComplete;
    const success = result.pass && (!isFinal || snapshot.campaignSuccess);

    el.resultKicker.textContent = isFinal ? "LINE REPORT / 3 BATCHES" : "BATCH REPORT";
    el.resultTitle.textContent = isFinal
      ? (success ? "全线通关" : "产线未通关")
      : (result.pass ? "批次合格" : "批次不合格");
    el.resultTitle.className = success ? "success" : "failed";

    if (isFinal && success) {
      el.resultSummary.textContent = "三批食品全部在规定窗口内达到中心温度，累计能耗未越过红线。产线可以转入下一班次。";
    } else if (result.pass) {
      el.resultSummary.textContent = `${profile.name} 已出舱，中心探针完成复核。继续调整下一类食品的冷风与停留参数。`;
    } else {
      el.resultSummary.textContent = `${profile.name} 未通过出舱复核，物料已隔离。修正工艺后重试，但已消耗的能耗会被保留。`;
    }

    el.resultStats.replaceChildren();
    [
      ["中心温度", `${result.temp >= 0 ? "+" : ""}${result.temp.toFixed(1)}°C`],
      ["实际停留", formatDuration(result.minutes)],
      ["累计能耗", `${result.energyTotal.toFixed(2)} kWh`]
    ].forEach(([label, value]) => {
      const cell = document.createElement("div");
      const name = document.createElement("span");
      const dataNode = document.createElement("b");
      name.textContent = label;
      dataNode.textContent = value;
      cell.append(name, dataNode);
      el.resultStats.append(cell);
    });

    el.resultReasons.replaceChildren();
    if (result.pass) {
      addResultReason(`中心温度 ${result.temp.toFixed(1)}°C ≤ ${profile.targetTemp}°C`, true);
      addResultReason(`实际停留 ${formatDuration(result.minutes)}，在 ${formatDuration(profile.targetTime)} 工艺窗口内`, true);
      addResultReason(`累计能耗 ${result.energyTotal.toFixed(2)} / ${snapshot.energyLimit.toFixed(1)} kWh`, true);
    } else {
      result.reasons.forEach((reason) => addResultReason(reason));
    }

    if (isFinal) {
      el.modalPrimary.textContent = success ? "再来一局" : "重开产线";
    } else {
      el.modalPrimary.textContent = result.pass ? "装载下一批" : "重试本批";
    }
    el.modalSecondary.textContent = result.pass ? "查看剖面" : "留在本批";
    openModal(el.resultModal);
  }

  function executeResultAction() {
    const snapshot = engine.snapshot();
    if (snapshot.status !== "result" || !snapshot.result) return;
    closeModal(el.resultModal);
    resultModalDismissed = false;
    resultRef = null;

    if (snapshot.campaignComplete) {
      engine.reset();
      outcomes.fill(null);
      setControlsFromRecipe(engine.snapshot().profile);
    } else if (snapshot.result.pass) {
      engine.advance();
    } else {
      engine.retry();
    }
  }

  el.startBtn.addEventListener("click", async () => {
    const snapshot = engine.snapshot();
    if (snapshot.status === "idle") {
      enableSound();
      resultModalDismissed = false;
      closeModal(el.resultModal);
      engine.start();
    } else if (snapshot.status === "result") {
      if (el.resultModal.classList.contains("open")) {
        executeResultAction();
      } else {
        showResult(snapshot);
      }
    }
  });

  el.blockBtn.addEventListener("click", () => {
    if (engine.state.status !== "running") return;
    if (engine.state.blockage) engine.clearBlockage();
    else engine.simulateBlockage();
  });

  el.abortBtn.addEventListener("click", () => {
    if (engine.abort()) {
      closeModal(el.resultModal);
      resultModalDismissed = false;
    }
  });

  el.resetBtn.addEventListener("click", () => {
    closeModal(el.resultModal);
    engine.reset();
    outcomes.fill(null);
    resultRef = null;
    resultModalDismissed = false;
    setControlsFromRecipe(engine.snapshot().profile);
  });

  el.soundBtn.addEventListener("click", toggleSound);
  el.helpBtn.addEventListener("click", () => openModal(el.helpModal));
  el.helpClose.addEventListener("click", () => closeModal(el.helpModal));
  el.modalPrimary.addEventListener("click", executeResultAction);
  el.modalSecondary.addEventListener("click", () => {
    resultModalDismissed = true;
    closeModal(el.resultModal);
  });

  document.addEventListener("keydown", (event) => {
    if (event.target instanceof HTMLInputElement) return;
    if (event.code === "Space") {
      event.preventDefault();
      el.startBtn.click();
    }
    if (event.key === "b" || event.key === "B") {
      if (!el.blockBtn.disabled) el.blockBtn.click();
    }
    if (event.key === "Escape") {
      closeModal(el.resultModal);
      closeModal(el.helpModal);
    }
  });

  function frame(now) {
    const dt = Math.min(0.08, Math.max(0, (now - lastFrame) / 1000));
    lastFrame = now;
    engine.update(dt);
    const snapshot = engine.snapshot();
    renderer.render(snapshot, dt);
    sound.update(snapshot);
    syncUI(snapshot);
    requestAnimationFrame(frame);
  }

  engine.reset();
  setControlsFromRecipe(engine.snapshot().profile);
  syncUI(engine.snapshot());
  requestAnimationFrame(frame);

  window.TunnelApp = {
    engine,
    data,
    renderer,
    sound,
    snapshot: () => engine.snapshot(),
    get audioState() {
      return sound.getState();
    },
    get outcomes() {
      return outcomes.slice();
    },
    setControls(values) {
      if (!values) return;
      if (values.damper !== undefined) {
        const pct = values.damper <= 1 ? values.damper * 100 : values.damper;
        el.damperSlider.value = String(Math.round(pct));
      }
      if (values.gap !== undefined) el.gapSlider.value = String(values.gap);
      if (values.speed !== undefined) el.speedSlider.value = String(values.speed);
      engine.setControls(values);
      updateControlLabels(engine.snapshot().profile);
    },
    simulateBlockage: () => engine.simulateBlockage(),
    clearBlockage: () => engine.clearBlockage()
  };
})();
