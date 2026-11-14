(function () {
  "use strict";

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const renderer = window.SealRenderer;

  const canvas = $("#stamp-canvas");
  const sampleCanvasA = $("#compare-canvas-a");
  const sampleCanvasB = $("#compare-canvas-b");
  const state = {
    settings: Object.assign({}, renderer.DEFAULTS),
    seed: 427,
    compareSeeds: [427, 1284],
    metricsA: null,
    metricsB: null,
    frame: 0,
    toastTimer: 0,
  };

  const controls = {
    text: $("#primary-text"),
    textCount: $("#text-count"),
    date: $("#date-text"),
    arc: $("#arc-range"),
    arcValue: $("#arc-value"),
    notchDepth: $("#notch-depth"),
    notchValue: $("#notch-value"),
    notchCount: $("#notch-count"),
    notchCountValue: $("#notch-count-value"),
    wear: $("#wear-range"),
    wearValue: $("#wear-value"),
    seed: $("#seed-input"),
    seedReadout: $("#seed-readout"),
    inkSwatch: $("#ink-swatch"),
    inkLabel: $("#ink-label"),
    textStatus: $("#text-status"),
    dateStatus: $("#date-status"),
  };

  function formatSeed(seed) {
    return String(seed).padStart(4, "0");
  }

  function formatGap(gapLogical) {
    const mm = (gapLogical / 1000) * renderer.STAMP_MM;
    return `${Math.max(0, mm).toFixed(1)} mm`;
  }

  function setRangeProgress(input) {
    const min = Number(input.min);
    const max = Number(input.max);
    const value = Number(input.value);
    const progress = ((value - min) / Math.max(1, max - min)) * 100;
    input.style.setProperty("--range-progress", `${progress}%`);
  }

  function syncControlValues() {
    const settings = state.settings;
    controls.text.value = settings.primaryText;
    controls.date.value = settings.dateText;
    controls.arc.value = settings.arcDeg;
    controls.arcValue.value = `${settings.arcDeg}°`;
    controls.notchDepth.value = settings.notchDepth;
    controls.notchValue.value = `${settings.notchDepth} px`;
    controls.notchCount.value = settings.notchCount;
    controls.notchCountValue.value = String(settings.notchCount);
    controls.wear.value = settings.wear;
    controls.wearValue.value = `${settings.wear}%`;
    controls.seed.value = state.seed;
    controls.seedReadout.textContent = formatSeed(state.seed);
    controls.textCount.textContent = `${Array.from(settings.primaryText).length} / 18 字`;
    controls.inkSwatch.style.background = settings.ink;
    controls.inkLabel.textContent = getInkLabel(settings.ink);

    [controls.arc, controls.notchDepth, controls.notchCount, controls.wear].forEach(setRangeProgress);

    $$("[data-control='inner-lines'] button").forEach((button) => {
      button.classList.toggle("is-active", Number(button.dataset.value) === settings.innerLines);
    });
    $$("[data-control='logo'] button").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.value === settings.logo);
    });
    $$(".ink-options button").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.ink === settings.ink);
    });
  }

  function getInkLabel(ink) {
    const active = $(`.ink-options button[data-ink='${ink}']`);
    return active ? active.dataset.label : "朱砂印泥 / CINNABAR";
  }

  function updateStatus(metrics) {
    const textIsValid = Array.from(state.settings.primaryText.trim()).length > 0;
    controls.textStatus.classList.toggle("warn", !textIsValid);
    controls.textStatus.innerHTML = textIsValid
      ? "<i></i> 字环连续 · 自动适配"
      : "<i></i> 请填写环上文字";

    const dateIsValid = Array.from(state.settings.dateText.trim()).length > 0;
    const clearOfDate = metrics.protection.safeGap > 0;
    controls.dateStatus.classList.toggle("warn", !dateIsValid || !clearOfDate);
    controls.dateStatus.innerHTML = dateIsValid && clearOfDate
      ? "<i></i> 缺口已避开日期"
      : "<i></i> 日期安全区待检查";
  }

  function updateSampleMeta(card, metrics, seed) {
    const seedNode = $("[data-sample-seed]", card);
    const fillNode = $("[data-sample-fill]", card);
    const gapNode = $("[data-sample-gap]", card);
    seedNode.textContent = formatSeed(seed);
    fillNode.textContent = `${Math.round(metrics.mainLayout.fillRatio * 100)}%`;
    gapNode.textContent = formatGap(metrics.mainLayout.gap);
  }

  function renderAll() {
    state.frame = 0;
    const metrics = renderer.render(canvas, 1024, state.settings, state.seed);
    const sampleSeedA = state.compareSeeds[0];
    const sampleSeedB = state.compareSeeds[1];
    state.metricsA = renderer.render(sampleCanvasA, 720, state.settings, sampleSeedA);
    state.metricsB = renderer.render(sampleCanvasB, 720, state.settings, sampleSeedB);
    updateSampleMeta($("[data-sample='a']"), state.metricsA, sampleSeedA);
    updateSampleMeta($("[data-sample='b']"), state.metricsB, sampleSeedB);
    updateStatus(metrics);
  }

  function scheduleRender() {
    if (state.frame) cancelAnimationFrame(state.frame);
    state.frame = requestAnimationFrame(renderAll);
  }

  function randomSeed() {
    return 100 + Math.floor(Math.random() * 9899);
  }

  function ensureDifferentSeeds() {
    if (state.compareSeeds[1] === state.compareSeeds[0]) {
      state.compareSeeds[1] = (state.compareSeeds[0] + 857) % 99999 || 1;
    }
  }

  function showToast(message) {
    const toast = $("#toast");
    $("#toast-message").textContent = message;
    toast.classList.add("is-visible");
    clearTimeout(state.toastTimer);
    state.toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 2800);
  }

  function downloadDataUrl(dataUrl, filename) {
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  async function exportStamp(seed, label) {
    if (document.fonts && document.fonts.ready) {
      await document.fonts.ready;
    }
    const dataUrl = renderer.toDataUrl(2048, state.settings, seed);
    const safeName = state.settings.primaryText.replace(/[\\/:*?"<>|\s]/g, "-").slice(0, 16) || "seal";
    downloadDataUrl(dataUrl, `${safeName}-seed-${formatSeed(seed)}-${label}.png`);
    showToast(`已导出透明 PNG · SEED ${formatSeed(seed)}`);
  }

  controls.text.addEventListener("input", () => {
    state.settings.primaryText = controls.text.value;
    controls.textCount.textContent = `${Array.from(controls.text.value).length} / 18 字`;
    scheduleRender();
  });

  controls.date.addEventListener("input", () => {
    state.settings.dateText = controls.date.value;
    scheduleRender();
  });

  controls.arc.addEventListener("input", () => {
    state.settings.arcDeg = Number(controls.arc.value);
    controls.arcValue.value = `${state.settings.arcDeg}°`;
    setRangeProgress(controls.arc);
    scheduleRender();
  });

  controls.notchDepth.addEventListener("input", () => {
    state.settings.notchDepth = Number(controls.notchDepth.value);
    controls.notchValue.value = `${state.settings.notchDepth} px`;
    setRangeProgress(controls.notchDepth);
    scheduleRender();
  });

  controls.notchCount.addEventListener("input", () => {
    state.settings.notchCount = Number(controls.notchCount.value);
    controls.notchCountValue.value = String(state.settings.notchCount);
    setRangeProgress(controls.notchCount);
    scheduleRender();
  });

  controls.wear.addEventListener("input", () => {
    state.settings.wear = Number(controls.wear.value);
    controls.wearValue.value = `${state.settings.wear}%`;
    setRangeProgress(controls.wear);
    scheduleRender();
  });

  $$("[data-control='inner-lines'] button").forEach((button) => {
    button.addEventListener("click", () => {
      state.settings.innerLines = Number(button.dataset.value);
      syncControlValues();
      scheduleRender();
    });
  });

  $$("[data-control='logo'] button").forEach((button) => {
    button.addEventListener("click", () => {
      state.settings.logo = button.dataset.value;
      syncControlValues();
      scheduleRender();
    });
  });

  $$(".ink-options button").forEach((button) => {
    button.addEventListener("click", () => {
      state.settings.ink = button.dataset.ink;
      syncControlValues();
      scheduleRender();
    });
  });

  function setMainSeed(seed) {
    state.seed = Math.max(1, Math.min(99999, Number(seed) || 1));
    state.compareSeeds[0] = state.seed;
    ensureDifferentSeeds();
    syncControlValues();
    scheduleRender();
  }

  controls.seed.addEventListener("change", () => setMainSeed(controls.seed.value));
  controls.seed.addEventListener("input", () => {
    if (controls.seed.value) {
      state.seed = Math.max(1, Math.min(99999, Number(controls.seed.value)));
      state.compareSeeds[0] = state.seed;
      ensureDifferentSeeds();
      controls.seedReadout.textContent = formatSeed(state.seed);
      scheduleRender();
    }
  });

  $("#shuffle-seed").addEventListener("click", () => setMainSeed(randomSeed()));
  $("#seed-dice").addEventListener("click", () => setMainSeed(randomSeed()));

  $("#refresh-compare").addEventListener("click", () => {
    let nextA = randomSeed();
    let nextB = randomSeed();
    while (nextB === nextA) nextB = randomSeed();
    state.compareSeeds = [nextA, nextB];
    state.seed = nextA;
    syncControlValues();
    scheduleRender();
    showToast("已重新生成一组双 seed 样本");
  });

  $("#reset-settings").addEventListener("click", () => {
    state.settings = Object.assign({}, renderer.DEFAULTS);
    state.seed = 427;
    state.compareSeeds = [427, 1284];
    syncControlValues();
    scheduleRender();
    showToast("参数已恢复默认");
  });

  $("#export-main").addEventListener("click", () => exportStamp(state.seed, "main"));
  $("#export-bottom").addEventListener("click", () => exportStamp(state.seed, "main"));
  $$("[data-export-sample]").forEach((button) => {
    button.addEventListener("click", () => {
      const index = button.dataset.exportSample === "a" ? 0 : 1;
      exportStamp(state.compareSeeds[index], `sample-${index === 0 ? "a" : "b"}`);
    });
  });

  $$("[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      const stage = $("#canvas-stage");
      stage.dataset.view = button.dataset.view;
      $$("[data-view]").forEach((viewButton) => {
        viewButton.classList.toggle("is-active", viewButton === button);
      });
    });
  });

  window.__sealStudio = {
    state,
    render: renderAll,
    export(seed) {
      return renderer.toDataUrl(2048, state.settings, seed);
    },
    setSettings(partial) {
      Object.assign(state.settings, partial);
      syncControlValues();
      renderAll();
    },
    setSeed(seed) {
      setMainSeed(seed);
      renderAll();
    },
  };

  syncControlValues();
  renderAll();

  if (document.fonts && document.fonts.load) {
    document.fonts.load('600 62px "Noto Serif SC"').then(() => {
      renderAll();
    }).catch(() => {
      renderAll();
    });
  }
})();
