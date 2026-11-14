(function () {
  "use strict";

  const BP = window.BP;
  const U = BP.utils;
  const canvas = document.getElementById("game");
  const startScreen = document.getElementById("startScreen");
  const resultScreen = document.getElementById("resultScreen");
  const seedInput = document.getElementById("seedInput");
  const seedLabel = document.getElementById("seedLabel");
  const channelLabel = document.getElementById("channelLabel");
  const audioButton = document.getElementById("audioButton");
  const audioText = document.getElementById("audioText");
  const startButton = document.getElementById("startButton");
  const restartButton = document.getElementById("restartButton");
  const flashMessage = document.getElementById("flashMessage");
  const pauseHint = document.getElementById("pauseHint");
  const tipText = document.getElementById("tipText");
  const resultKicker = document.getElementById("resultKicker");
  const resultTitle = document.getElementById("resultTitle");
  const resultText = document.getElementById("resultText");
  const resultTime = document.getElementById("resultTime");
  const resultHits = document.getElementById("resultHits");
  const resultPings = document.getElementById("resultPings");
  const resultSeed = document.getElementById("resultSeed");
  const audio = new BP.SonarAudio();

  let flashTimer = 0;
  let initialPingTimer = 0;
  let currentSeed = "NIGHT-407";
  let lastFrame = performance.now();

  const events = {
    start: () => {
      pauseHint.classList.add("hidden-hint");
      setTip("左席先报航向，右席再报水深；声呐回波会从礁石方向返回。");
    },
    ping: (result) => {
      audio.playPing(result.echoes);
      const nearest = result.nearest;
      if (!nearest) {
        showFlash("声呐回波：前方暂无声呐接触");
      } else {
        const side = Math.abs(nearest.relative) < 20
          ? "正前"
          : nearest.relative < 0 ? "左前" : "右前";
        showFlash(`声呐回波 · ${side}有接触 · 共 ${result.echoes.length} 组`);
      }
      setTip("回波越晚越远，越靠左/右就说明礁区偏左/右；把听到的方位告诉领航席。");
    },
    collision: (detail) => {
      audio.playImpact();
      showFlash(`触礁 · 船体 ${detail.hull}/3 · 右席立即收油`, "danger");
      setTip("碰撞了。轮机席收油、领航席反向修正，再重新建立航向。");
    },
    shallow: (detail) => {
      audio.playWarning();
      showFlash(`浅水 ${detail.depth.toFixed(1)}m · 礁脊接近`, "danger");
      setTip("水深正在变浅。右席报数，左席向水深回升的一侧修正。");
    },
    overheat: () => {
      audio.playWarning();
      showFlash("发动机过热 · 收油冷却", "danger");
      setTip("油温越过 100°C，先收油；别为了快而让发动机停摆。");
    },
    boundary: () => {
      showFlash("已接近海图边界 · 修正横向漂流");
    },
    gate: (detail) => {
      audio.playGate();
      showFlash(
        detail.clean
          ? `第 ${detail.index + 1} 组暗礁已绕过 · 还剩 ${detail.remaining} 组`
          : `穿过第 ${detail.index + 1} 组暗礁 · 船体已受损`
      );
      if (detail.remaining === 0) {
        setTip("四组暗礁都已通过。朝灯塔慢速靠近，别在最后一段松掉协同。");
      }
    },
    win: (detail) => {
      audio.playWin();
      showResult(true, detail);
    },
    lose: (detail) => {
      showResult(false, detail);
    }
  };

  const game = new BP.Game(currentSeed, events);
  const renderer = new BP.Renderer(canvas, game);
  BP.app = { game, renderer, audio, finishPassage: finishFromConsole };

  function setSeed(seed) {
    currentSeed = String(seed || "NIGHT-407").trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 24);
    if (!currentSeed) currentSeed = "NIGHT-407";
    seedInput.value = currentSeed;
    seedLabel.textContent = currentSeed;
  }

  function refreshFieldLabels() {
    const validation = game.field.validation;
    if (validation.ok) {
      channelLabel.textContent = `已校验 · ${Math.round(validation.minClearance)}m`;
      channelLabel.className = "ok";
    } else {
      channelLabel.textContent = "净空不足";
      channelLabel.className = "warn";
    }
  }

  function showFlash(text, tone) {
    flashMessage.textContent = text;
    flashMessage.classList.toggle("danger", tone === "danger");
    flashMessage.classList.add("show");
    window.clearTimeout(flashTimer);
    flashTimer = window.setTimeout(() => flashMessage.classList.remove("show"), 3100);
  }

  function setTip(text) {
    tipText.textContent = text;
  }

  async function enableAudio() {
    const ready = await audio.init();
    if (!ready) {
      audioButton.setAttribute("aria-pressed", "false");
      audioText.textContent = "音频不可用";
      return false;
    }
    audio.setMuted(false);
    audioButton.setAttribute("aria-pressed", "true");
    audioText.textContent = "声呐在线";
    return true;
  }

  async function startRun() {
    setSeed(seedInput.value);
    await enableAudio();
    game.reset(currentSeed);
    renderer.setGame(game);
    refreshFieldLabels();
    startScreen.classList.add("hidden");
    resultScreen.classList.add("hidden");
    pauseHint.classList.remove("hidden-hint");
    game.start();
    window.clearTimeout(initialPingTimer);
    initialPingTimer = window.setTimeout(() => {
      if (game.mode === "running") game.ping();
    }, 620);
    if (window.history && window.history.replaceState) {
      const url = new URL(window.location.href);
      url.searchParams.set("seed", currentSeed);
      window.history.replaceState({}, "", url);
    }
    setTip("先别推满油门。右席报水深，左席对浪向做修正。");
  }

  function resetRun() {
    resultScreen.classList.add("hidden");
    game.reset(currentSeed);
    renderer.setGame(game);
    refreshFieldLabels();
    pauseHint.classList.remove("hidden-hint");
    game.start();
    window.clearTimeout(initialPingTimer);
    initialPingTimer = window.setTimeout(() => {
      if (game.mode === "running") game.ping();
    }, 420);
    setTip("新航次开始。左席保持航向，右席建立巡航速度。");
  }

  function showResult(success, detail) {
    resultScreen.classList.remove("hidden");
    pauseHint.classList.add("hidden-hint");
    resultKicker.innerHTML = success
      ? "<span></span> 航海日志 · 通行完成"
      : "<span></span> 航海日志 · 船体失效";
    resultTitle.textContent = success ? "灯塔已抵达。" : "船体失去了浮力。";
    resultText.textContent = success
      ? detail.hits === 0
        ? "零碰撞穿过四组暗礁。两块半仪表，拼成了一整条路。"
        : `虽然擦过暗礁 ${detail.hits} 次，你们还是把船带到了灯塔。`
      : "三次触礁耗尽了船体。换一个种子，重新分工再试一次。";
    resultTime.textContent = U.formatTime(detail.elapsed || game.elapsed);
    resultHits.textContent = `${detail.hits}`;
    resultPings.textContent = `${detail.pings || game.pingCount}`;
    resultSeed.textContent = currentSeed;
    channelLabel.textContent = success ? "通行完成" : "航次中断";
    channelLabel.className = success ? "ok" : "warn";
    setTip(success ? "通行已记录。可以换种子再来，或把航向/水深分工反过来练习。" : "先降速再转向；发动机和船体都需要被听见。");
  }

  function finishFromConsole(seconds) {
    if (game.mode !== "running") return;
    if (typeof seconds === "number" && seconds > 0) game.elapsed = seconds;
    game.boat.x = game.field.lighthouse.x;
    game.boat.y = game.field.lighthouse.y;
    game.mode = "won";
    game.emit("win", {
      elapsed: game.elapsed,
      hits: game.hits,
      pings: game.pingCount,
      seed: currentSeed
    });
  }

  const heldKeys = new Set();
  const pointerInput = { nav: 0, throttle: 0 };
  const activePointers = new Map();

  function keyboardValue(positive, negative) {
    if (heldKeys.has(positive) && !heldKeys.has(negative)) return 1;
    if (heldKeys.has(negative) && !heldKeys.has(positive)) return -1;
    return 0;
  }

  function refreshInputs() {
    const navKey = keyboardValue("d", "a");
    const throttleKey = keyboardValue("w", "s");
    game.setNavInput(navKey || pointerInput.nav);
    game.setThrottleInput(throttleKey || pointerInput.throttle);
  }

  function isTypingTarget(target) {
    return target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA");
  }

  window.addEventListener("keydown", (event) => {
    if (isTypingTarget(event.target)) {
      if (event.key === "Enter") {
        event.preventDefault();
        startRun();
      }
      return;
    }
    const key = event.key.toLowerCase();
    if (["a", "d", "w", "s", " "].includes(key)) {
      event.preventDefault();
      if (key === " ") {
        if (!event.repeat && game.mode === "running") game.ping();
        return;
      }
      heldKeys.add(key);
      refreshInputs();
    }
  });

  window.addEventListener("keyup", (event) => {
    const key = event.key.toLowerCase();
    if (heldKeys.has(key)) {
      heldKeys.delete(key);
      refreshInputs();
    }
  });

  window.addEventListener("blur", () => {
    heldKeys.clear();
    pointerInput.nav = 0;
    pointerInput.throttle = 0;
    activePointers.clear();
    refreshInputs();
  });

  function localPoint(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
  }

  function classifyPointer(point) {
    const layout = renderer.layout;
    if (!layout) return null;
    const left = layout.left;
    const right = layout.right;
    const leftControlTop = left.y + left.h * 0.76;
    const rightControlTop = right.y + right.h * 0.76;
    if (point.y >= leftControlTop && point.x >= left.x && point.x <= left.x + left.w) {
      return { kind: "nav", value: point.x < left.x + left.w / 2 ? -1 : 1 };
    }
    if (point.y >= rightControlTop && point.x >= right.x && point.x <= right.x + right.w) {
      return { kind: "throttle", value: point.x < right.x + right.w / 2 ? -1 : 1 };
    }
    const chart = layout.chart;
    if (
      game.mode === "running" &&
      point.x >= chart.x && point.x <= chart.x + chart.w &&
      point.y >= chart.y && point.y <= chart.y + chart.h
    ) {
      return { kind: "sonar" };
    }
    return null;
  }

  canvas.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    if (game.mode !== "running") return;
    const control = classifyPointer(localPoint(event));
    if (!control) return;
    if (control.kind === "sonar") {
      game.ping();
      return;
    }
    activePointers.set(event.pointerId, control);
    pointerInput[control.kind] = control.value;
    refreshInputs();
    canvas.setPointerCapture(event.pointerId);
  });

  canvas.addEventListener("pointermove", (event) => {
    const control = activePointers.get(event.pointerId);
    if (!control) return;
    const next = classifyPointer(localPoint(event));
    if (next && next.kind === control.kind) {
      control.value = next.value;
      pointerInput[control.kind] = next.value;
      refreshInputs();
    }
  });

  function releasePointer(event) {
    const control = activePointers.get(event.pointerId);
    if (!control) return;
    activePointers.delete(event.pointerId);
    pointerInput[control.kind] = 0;
    refreshInputs();
  }

  canvas.addEventListener("pointerup", releasePointer);
  canvas.addEventListener("pointercancel", releasePointer);

  startButton.addEventListener("click", startRun);
  restartButton.addEventListener("click", resetRun);
  seedInput.addEventListener("input", () => {
    seedInput.value = seedInput.value.toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 24);
  });

  audioButton.addEventListener("click", async () => {
    if (!audio.context) {
      await enableAudio();
      return;
    }
    const muted = !audio.muted;
    audio.setMuted(muted);
    audioButton.setAttribute("aria-pressed", muted ? "false" : "true");
    audioText.textContent = muted ? "声呐静音" : "声呐在线";
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      heldKeys.clear();
      refreshInputs();
    }
  });

  function frame(now) {
    const dt = Math.min(0.1, (now - lastFrame) / 1000);
    lastFrame = now;
    game.update(dt);
    renderer.render(dt);
    requestAnimationFrame(frame);
  }

  const querySeed = new URL(window.location.href).searchParams.get("seed");
  setSeed(querySeed || "NIGHT-407");
  game.reset(currentSeed);
  renderer.setGame(game);
  refreshFieldLabels();
  audioButton.setAttribute("aria-pressed", "false");
  requestAnimationFrame(frame);

  BP.app = {
    game,
    renderer,
    audio,
    startRun,
    resetRun,
    enableAudio,
    finishPassage: finishFromConsole,
    getSnapshot: () => ({
      seed: game.field.seedText,
      mode: game.mode,
      boat: { ...game.boat },
      input: { ...game.input },
      gates: game.field.gates.map((gate) => ({ passed: gate.passed, touched: gate.touched })),
      validation: game.field.validation,
      pings: game.pingCount,
      hits: game.hits,
      elapsed: game.elapsed
    })
  };
})();

