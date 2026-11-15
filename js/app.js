(function () {
  "use strict";

  const DEFAULTS = { mist: 48, air: 56, belt: 1 };
  const SLIDER_UNITS = {
    mist: { suffix: "%", decimals: 0 },
    air: { suffix: "%", decimals: 0 },
    belt: { suffix: "×", decimals: 2 }
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  class FoundryApp {
    constructor() {
      this.engine = new window.CoolingEngine({ batchNumber: 1, seed: "THERMO-CAST-719" });
      this.renderer = new window.FoundryRenderer(
        document.getElementById("foundryCanvas"),
        document.getElementById("curveCanvas")
      );
      this.audio = new window.FoundryAudio();
      this.lastFrame = 0;
      this.lastUIUpdate = 0;
      this.testPaused = false;
      this.dialogShownFor = null;
      this.controls = { ...DEFAULTS };
      this.cacheElements();
      this.bindControls();
      this.bindActions();
      this.updateClock();
      setInterval(() => this.updateClock(), 1000);
      this.engine.setControls(this.controls);
      this.syncSliderVisuals();
      this.lastFrame = performance.now();
      this.loop = this.loop.bind(this);
      requestAnimationFrame(this.loop);
      this.updateInterface(this.engine.snapshot(), true);
    }

    cacheElements() {
      const byId = (id) => document.getElementById(id);
      this.elements = {
        batchCode: byId("batchCode"),
        batchCodeTop: byId("batchCodeTop"),
        curveBatchCode: byId("curveBatchCode"),
        batchState: byId("batchState"),
        alloyName: byId("alloyName"),
        alloyTag: byId("alloyTag"),
        targetEndTemp: byId("targetEndTemp"),
        canvasStatusText: byId("canvasStatusText"),
        progressText: byId("batchProgressText"),
        progressBar: byId("batchProgressBar"),
        mistSlider: byId("mistSlider"),
        airSlider: byId("airSlider"),
        beltSlider: byId("beltSlider"),
        mistValue: byId("mistValue"),
        airValue: byId("airValue"),
        beltValue: byId("beltValue"),
        predictedQuality: byId("predictedQuality"),
        qualityRing: byId("qualityRing"),
        curveScore: byId("curveScore"),
        uniformScore: byId("uniformScore"),
        grainScore: byId("grainScore"),
        curveBar: byId("curveBar"),
        uniformBar: byId("uniformBar"),
        grainBar: byId("grainBar"),
        curveDeviation: byId("curveDeviation"),
        warningStrip: byId("warningStrip"),
        warningText: byId("warningText"),
        startButton: byId("startButton"),
        startButtonLabel: byId("startButtonLabel"),
        resetControls: byId("resetControls"),
        soundToggle: byId("soundToggle"),
        clock: byId("clock"),
        resultDialog: byId("resultDialog"),
        resultKicker: byId("resultKicker"),
        resultEmblem: byId("resultEmblem"),
        resultTitle: byId("resultTitle"),
        resultDescription: byId("resultDescription"),
        resultParts: byId("resultParts"),
        nextBatchButton: byId("nextBatchButton"),
        closeResultButton: byId("closeResultButton"),
        canvasStatus: document.querySelector(".canvas-status")
      };
      this.partElements = Array.from(document.querySelectorAll(".part-card")).map((card) => ({
        card,
        quality: card.querySelector(".part-quality"),
        temp: card.querySelector(".part-temp"),
        grain: card.querySelector(".part-grain"),
        status: card.querySelector(".part-status"),
        bar: card.querySelector(".tiny-bar i")
      }));
    }

    bindControls() {
      ["mist", "air", "belt"].forEach((key) => {
        const slider = this.elements[`${key}Slider`];
        slider.addEventListener("input", () => {
          const value = Number(slider.value);
          this.controls[key] = value;
          this.engine.setControls(this.controls);
          this.updateSlider(key);
          this.audio.update(this.controls, this.engine.status === "running");
          this.updateInterface(this.engine.snapshot(), true);
        });
      });
      this.elements.resetControls.addEventListener("click", () => {
        this.setControls(DEFAULTS);
      });
    }

    bindActions() {
      this.elements.startButton.addEventListener("click", () => this.handleStart());
      this.elements.nextBatchButton.addEventListener("click", () => {
        this.elements.resultDialog.close();
        this.beginNextBatch();
      });
      this.elements.closeResultButton.addEventListener("click", () => {
        this.elements.resultDialog.close();
      });
      this.elements.soundToggle.addEventListener("click", () => this.toggleSound());
      document.addEventListener("keydown", (event) => this.handleKey(event));
    }

    handleKey(event) {
      const tagName = event.target && event.target.tagName;
      if (tagName === "INPUT" && event.target.type !== "range") return;
      const step = event.shiftKey ? 5 : 2;
      let changed = false;
      if (event.key.toLowerCase() === "a") {
        this.controls.mist = clamp(this.controls.mist - step, 0, 100);
        changed = true;
      } else if (event.key.toLowerCase() === "d") {
        this.controls.mist = clamp(this.controls.mist + step, 0, 100);
        changed = true;
      } else if (event.key.toLowerCase() === "w") {
        this.controls.air = clamp(this.controls.air + step, 0, 100);
        changed = true;
      } else if (event.key.toLowerCase() === "s") {
        this.controls.air = clamp(this.controls.air - step, 0, 100);
        changed = true;
      } else if (event.key === "ArrowLeft") {
        this.controls.belt = clamp(this.controls.belt - 0.01, 0.7, 1.3);
        changed = true;
      } else if (event.key === "ArrowRight") {
        this.controls.belt = clamp(this.controls.belt + 0.01, 0.7, 1.3);
        changed = true;
      } else if (event.key === " " && this.engine.status !== "running") {
        event.preventDefault();
        this.handleStart();
      }
      if (changed) {
        event.preventDefault();
        this.setControls(this.controls);
      }
    }

    setControls(controls) {
      this.controls = {
        mist: clamp(Number(controls.mist), 0, 100),
        air: clamp(Number(controls.air), 0, 100),
        belt: clamp(Number(controls.belt), 0.7, 1.3)
      };
      this.engine.setControls(this.controls);
      this.syncSliderVisuals();
      this.audio.update(this.controls, this.engine.status === "running");
      this.updateInterface(this.engine.snapshot(), true);
    }

    syncSliderVisuals() {
      this.elements.mistSlider.value = this.controls.mist;
      this.elements.airSlider.value = this.controls.air;
      this.elements.beltSlider.value = this.controls.belt;
      ["mist", "air", "belt"].forEach((key) => this.updateSlider(key));
    }

    updateSlider(key) {
      const slider = this.elements[`${key}Slider`];
      const output = this.elements[`${key}Value`];
      const min = Number(slider.min);
      const max = Number(slider.max);
      const value = Number(slider.value);
      const fill = ((value - min) / (max - min)) * 100;
      slider.style.setProperty("--fill", `${fill}%`);
      const unit = SLIDER_UNITS[key];
      output.innerHTML = `${value.toFixed(unit.decimals)}<small>${unit.suffix}</small>`;
    }

    async handleStart() {
      if (this.engine.status === "running") return;
      if (this.engine.status === "success" || this.engine.status === "failed") {
        this.beginNextBatch();
        return;
      }
      await this.startBatch();
    }

    async startBatch() {
      this.audio.update(this.controls, true);
      try {
        await this.audio.start();
      } catch (error) {
        console.warn("Audio unavailable", error);
      }
      if (this.engine.status === "success" || this.engine.status === "failed") {
        this.engine.batchNumber += 1;
      }
      this.engine.start();
      this.engine.setControls(this.controls);
      this.renderer.particles.length = 0;
      this.dialogShownFor = null;
      this.updateInterface(this.engine.snapshot(), true);
    }

    beginNextBatch() {
      if (this.engine.status === "success" || this.engine.status === "failed") {
        this.engine.batchNumber += 1;
      }
      this.engine.newBatch();
      this.engine.setControls(this.controls);
      this.renderer.particles.length = 0;
      this.dialogShownFor = null;
      this.updateInterface(this.engine.snapshot(), true);
      this.startBatch();
    }

    toggleSound() {
      const next = !this.audio.enabled;
      this.audio.setEnabled(next);
      this.elements.soundToggle.setAttribute("aria-pressed", String(next));
      if (next && this.engine.status === "running") this.audio.start();
    }

    loop(timestamp) {
      const delta = clamp((timestamp - this.lastFrame) / 1000, 0, 0.08);
      this.lastFrame = timestamp;
      const snapshot = this.testPaused ? this.engine.snapshot() : this.engine.step(delta);
      this.processEvents();
      this.renderer.render(snapshot, delta);
      if (timestamp - this.lastUIUpdate > 70) {
        this.updateInterface(snapshot, false);
        this.lastUIUpdate = timestamp;
      }
      requestAnimationFrame(this.loop);
    }

    processEvents() {
      const events = this.engine.consumeEvents();
      events.forEach((event) => {
        if (event.type === "crack") {
          this.audio.alarm();
        } else if (event.type === "complete") {
          this.audio.chime(event.result.passed);
          const key = `${this.engine.batch.code}:${event.result.finishTime}`;
          if (this.dialogShownFor !== key) {
            this.dialogShownFor = key;
            this.showResult(event.result);
          }
        }
      });
    }

    updateClock() {
      const now = new Date();
      this.elements.clock.textContent = now.toLocaleTimeString("zh-CN", {
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
      });
    }

    updateInterface(snapshot, force) {
      const { elements } = this;
      const batch = snapshot.batch;
      const running = snapshot.status === "running";
      const complete = snapshot.status === "success" || snapshot.status === "failed";
      if (this.lastAudioActive !== running) {
        this.lastAudioActive = running;
        this.audio.update(this.controls, running);
      }
      elements.batchCode.textContent = batch.code;
      elements.batchCodeTop.textContent = batch.code;
      elements.curveBatchCode.textContent = batch.code;
      elements.alloyName.textContent = batch.alloy;
      elements.alloyTag.textContent = batch.tag;
      elements.targetEndTemp.innerHTML = `${Math.round(batch.endTemp)}<small>°C</small>`;
      elements.progressText.textContent = `${Math.round(snapshot.progress * 100)}%`;
      elements.progressBar.style.width = `${snapshot.progress * 100}%`;

      const stateLabel = running ? "冷却中" : complete ? (snapshot.status === "success" ? "已合格" : "已报废") : "待机";
      elements.batchState.textContent = stateLabel;
      elements.batchState.className = `batch-state${running ? " is-live" : ""}${snapshot.status === "failed" ? " is-failed" : ""}`;

      const canvasLabel = running
        ? `冷却中 · ${Math.round(snapshot.progress * 100)}%`
        : snapshot.status === "success"
          ? "批次合格"
          : snapshot.status === "failed"
            ? "批次异常"
            : "等待装炉";
      elements.canvasStatusText.textContent = canvasLabel;
      elements.canvasStatus.classList.toggle("is-live", running);

      snapshot.parts.forEach((part, index) => {
        const refs = this.partElements[index];
        const quality = Math.round(part.scores.overall);
        const grainGrade = 6 + part.scores.grain * 0.048;
        refs.temp.textContent = `${Math.round(part.nodes[2])} °C`;
        refs.grain.textContent = `晶粒 ${grainGrade.toFixed(1)}`;
        refs.quality.textContent = snapshot.status === "idle" ? "—" : String(quality);
        refs.bar.style.width = `${snapshot.status === "idle" ? 0 : quality}%`;
        refs.card.classList.toggle("is-active", running && !part.cracked);
        refs.card.classList.toggle("is-finished", part.finished && !part.cracked && quality >= batch.passScore);
        refs.card.classList.toggle("is-cracked", part.cracked);
        if (part.cracked) refs.status.textContent = "裂纹";
        else if (running) refs.status.textContent = "冷却中";
        else if (part.finished) refs.status.textContent = quality >= batch.passScore ? "合格" : "扣分";
        else refs.status.textContent = "待机";
      });

      const average = snapshot.average;
      const quality = Math.round(average.overall);
      elements.predictedQuality.textContent = snapshot.status === "idle" ? "—" : String(quality);
      elements.qualityRing.style.setProperty("--quality", snapshot.status === "idle" ? 0 : quality);
      elements.curveScore.textContent = snapshot.status === "idle" ? "—" : String(Math.round(average.curve));
      elements.uniformScore.textContent = snapshot.status === "idle" ? "—" : String(Math.round(average.uniform));
      elements.grainScore.textContent = snapshot.status === "idle" ? "—" : String(Math.round(average.grain));
      elements.curveBar.style.width = `${snapshot.status === "idle" ? 0 : average.curve}%`;
      elements.uniformBar.style.width = `${snapshot.status === "idle" ? 0 : average.uniform}%`;
      elements.grainBar.style.width = `${snapshot.status === "idle" ? 0 : average.grain}%`;
      [elements.uniformBar, elements.curveBar, elements.grainBar].forEach((bar) => {
        const score = Number.parseInt(bar.style.width, 10) || 0;
        bar.style.background = score < 55 ? "var(--danger)" : score < 75 ? "var(--warn)" : "var(--good)";
      });

      let deviation = 0;
      if (snapshot.elapsed > 0) {
        const target = this.engine.targetAt(snapshot.elapsed);
        deviation = snapshot.parts.reduce((sum, part) => sum + Math.abs(part.nodes[2] - target), 0) / snapshot.parts.length;
      }
      elements.curveDeviation.innerHTML = `${Math.round(deviation)}<small>°C</small>`;

      this.updateWarning(snapshot);
      this.updateStartButton(snapshot);
      if (force) this.syncSliderVisuals();
    }

    updateWarning(snapshot) {
      const strip = this.elements.warningStrip;
      const text = this.elements.warningText;
      strip.className = "warning-strip";
      if (snapshot.status === "idle") {
        text.textContent = "设定冷却参数后开始批次";
        return;
      }
      if (snapshot.parts.some((part) => part.cracked)) {
        strip.classList.add("is-danger");
        text.textContent = "检测到局部热应力裂纹，当前批次已判定失效";
        return;
      }
      if (snapshot.status === "success") {
        text.textContent = `批次通过：三件质量均 ≥ ${snapshot.batch.passScore} 分`;
        return;
      }
      if (snapshot.status === "failed") {
        strip.classList.add("is-danger");
        text.textContent = "冷却结束：至少一件铸件低于质量阈值";
        return;
      }
      if (snapshot.average.gap > 104) {
        strip.classList.add("is-danger");
        text.textContent = "截面温差逼近裂纹阈值，立即增加贯穿风冷";
      } else if (snapshot.average.gap > 82) {
        strip.classList.add("is-warning");
        text.textContent = "表面偏冷、芯部仍热，建议降低水雾并提高风冷";
      } else if (snapshot.elapsed > this.engine.batch.duration * 1.04) {
        strip.classList.add("is-warning");
        text.textContent = "冷却节拍过慢，晶粒正在粗化";
      } else {
        text.textContent = "截面温差稳定，继续跟随目标冷却曲线";
      }
    }

    updateStartButton(snapshot) {
      const button = this.elements.startButton;
      const label = this.elements.startButtonLabel;
      const helper = button.querySelector(".start-copy small");
      if (snapshot.status === "running") {
        button.disabled = true;
        label.textContent = `冷却进行中 · ${Math.round(snapshot.progress * 100)}%`;
        helper.textContent = "调节水雾、风冷与传送速度以贴合曲线";
      } else if (snapshot.status === "success" || snapshot.status === "failed") {
        button.disabled = false;
        label.textContent = "开始下一批次";
        helper.textContent = "查看结果后继续生产";
      } else {
        button.disabled = false;
        label.textContent = "开始冷却批次";
        helper.textContent = `所有铸件达到 ${snapshot.batch.passScore} 分即通过`;
      }
    }

    showResult(result) {
      const dialog = this.elements.resultDialog;
      const card = dialog.querySelector(".result-card");
      const passed = result.passed;
      card.classList.toggle("is-failed", !passed);
      this.elements.resultKicker.textContent = passed
        ? `PROFILE ACCEPTED / ${this.engine.batch.code}`
        : `PROFILE REJECTED / ${this.engine.batch.code}`;
      this.elements.resultTitle.textContent = passed ? "批次合格" : "批次未通过";
      this.elements.resultDescription.textContent = passed
        ? `${result.reason}。冷却用时 ${result.finishTime} 秒，可进入下一炉次。`
        : `${result.reason}。冷却用时 ${result.finishTime} 秒，请复核冷却策略。`;
      this.elements.resultEmblem.innerHTML = passed
        ? '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M12 25.5 20.5 34 37 15"/></svg>'
        : '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="m14 14 20 20m0-20-20 20"/></svg>';
      this.elements.resultParts.innerHTML = result.parts.map((part) => `
        <div class="result-part${part.cracked || part.score < this.engine.batch.passScore ? " is-fail" : ""}">
          <span>${part.name}</span>
          <strong>${part.score}<small>/100</small></strong>
          <small>${part.cracked ? "局部裂纹" : `终温 ${part.finalTemp}°C`}</small>
        </div>
      `).join("");
      this.elements.nextBatchButton.innerHTML = `下一批次 <span>→</span>`;
      if (!dialog.open) dialog.showModal();
    }

    summary() {
      const snapshot = this.engine.snapshot();
      return {
        status: snapshot.status,
        batch: snapshot.batch,
        elapsed: Number(snapshot.elapsed.toFixed(2)),
        progress: Number(snapshot.progress.toFixed(3)),
        finishTime: snapshot.finishTime,
        controls: snapshot.controls,
        average: {
          curve: Number(snapshot.average.curve.toFixed(1)),
          uniform: Number(snapshot.average.uniform.toFixed(1)),
          grain: Number(snapshot.average.grain.toFixed(1)),
          overall: Number(snapshot.average.overall.toFixed(1)),
          gap: Number(snapshot.average.gap.toFixed(1))
        },
        parts: snapshot.parts.map((part) => ({
          index: part.index,
          name: part.name,
          core: Number(part.nodes[2].toFixed(1)),
          score: Number(part.scores.overall.toFixed(1)),
          curve: Number(part.scores.curve.toFixed(1)),
          uniform: Number(part.scores.uniform.toFixed(1)),
          grain: Number(part.scores.grain.toFixed(1)),
          maxGap: Number(part.maxGap.toFixed(1)),
          cracked: part.cracked,
          crack: part.crack,
          finished: part.finished
        })),
        result: snapshot.result,
        audio: this.audio.getLevels()
      };
    }
  }

  const app = new FoundryApp();

  window.__forge = {
    app,
    engine: app.engine,
    renderer: app.renderer,
    audio: app.audio,
    pauseForTest() {
      app.testPaused = true;
    },
    resume() {
      app.testPaused = false;
      app.lastFrame = performance.now();
    },
    startBatch() {
      return app.startBatch().then(() => app.summary());
    },
    setControls(controls) {
      app.setControls({ ...app.controls, ...controls });
      return app.summary();
    },
    advance(seconds, step) {
      app.testPaused = true;
      const increment = Number(step) || 0.1;
      let remaining = Math.max(0, Number(seconds) || 0);
      while (remaining > 0 && app.engine.status === "running") {
        const dt = Math.min(increment, remaining);
        app.engine.step(dt);
        remaining -= dt;
      }
      const snapshot = app.engine.snapshot();
      app.processEvents();
      app.renderer.render(snapshot, Math.min(increment, 0.08));
      app.updateInterface(snapshot, true);
      return app.summary();
    },
    getState() {
      return app.summary();
    },
    closeDialog() {
      if (app.elements.resultDialog.open) app.elements.resultDialog.close();
    },
    nextBatch() {
      app.beginNextBatch();
      return app.summary();
    }
  };
})();
