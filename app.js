(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const lerp = (from, to, amount) => from + (to - from) * amount;

  const MISSION_SECONDS = 900;
  const SPEEDS = [1, 4, 12, 30];
  const BATTERY_KWH = 18;
  const BATTERY_RESERVE = 20;
  const FUEL_KWH = 3.8;
  const FUEL_MAX_KW = 24;
  const TIDAL_CAPACITY = 22;
  const STABILITY_MIN = 60;
  const HEAT_WARN = 70;
  const HEAT_CRITICAL = 78;
  const HEAT_ABORT = 94;

  const DEVICE_DEFS = [
    {
      id: "life",
      name: "生命维持",
      detail: "闭环供氧 · 恒温",
      power: 15.2,
      on: true,
      locked: true,
      icon: '<svg viewBox="0 0 16 16"><path d="M2 8h2.2l1.5-3 2.1 7 1.8-4H14"/></svg>',
    },
    {
      id: "pump",
      name: "深海循环泵",
      detail: "满载 · 启动浪涌 54 kW",
      shortDetail: "满载 · 启动浪涌 54 kW",
      power: 26,
      surge: 28,
      on: true,
      icon: '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="4.6"/><path d="M8 1.8v3.5M8 10.7v3.5M1.8 8h3.5M10.7 8h3.5"/></svg>',
    },
    {
      id: "electrolyzer",
      name: "电解制氧",
      detail: "备氧生产 · 10.5 kW",
      power: 10.5,
      on: true,
      icon: '<svg viewBox="0 0 16 16"><path d="M8 2.2S4.2 6.2 4.2 9a3.8 3.8 0 0 0 7.6 0C11.8 6.2 8 2.2 8 2.2Z"/><path d="M8.8 6.5 6.7 9.2h2.1l-1 2.2"/></svg>',
    },
    {
      id: "lights",
      name: "科研照明",
      detail: "实验舱 · 4.8 kW",
      power: 4.8,
      on: true,
      icon: '<svg viewBox="0 0 16 16"><path d="M4.3 9.2a4.4 4.4 0 1 1 7.4 0c.7.9.8 1.5.8 2.2H3.5c0-.7.1-1.3.8-2.2Z"/><path d="M5.3 13.4h5.4"/></svg>',
    },
    {
      id: "sonar",
      name: "声呐通信",
      detail: "水面中继 · 4.2 kW",
      power: 4.2,
      on: false,
      icon: '<svg viewBox="0 0 16 16"><circle cx="3.7" cy="11.8" r="1.1"/><path d="M4 8.6a4 4 0 0 1 3.4 3.2M4 5.4a7.2 7.2 0 0 1 6.4 6.4"/></svg>',
    },
    {
      id: "desal",
      name: "海水淡化",
      detail: "生活循环 · 8.6 kW",
      power: 8.6,
      on: false,
      icon: '<svg viewBox="0 0 16 16"><path d="M2 6c1.8-1.4 3.4-1.4 5.2 0s3.4 1.4 5.2 0M2 9.3c1.8-1.4 3.4-1.4 5.2 0s3.4 1.4 5.2 0M2 12.6c1.8-1.4 3.4-1.4 5.2 0s3.4 1.4 5.2 0"/></svg>',
    },
  ];

  const state = {
    running: true,
    ended: false,
    simTime: 0,
    speedIndex: 2,
    lastFrame: performance.now(),
    uiTimer: 0,
    batteryKwh: BATTERY_KWH * 0.64,
    batteryTemp: 37.5,
    batteryLimit: 38,
    fuelOn: false,
    fuelKwh: FUEL_KWH,
    stability: 100,
    overheatTime: 0,
    pumpSurge: 0,
    surgePulse: 0,
    deficit: 0,
    load: 0,
    tidal: 0,
    fuelOutput: 0,
    batteryOutput: 0,
    batteryCharge: 0,
    flow: 0,
    operationCount: 0,
    logs: [],
    toastTimer: null,
    alertTimer: null,
  };

  const devices = structuredClone(DEVICE_DEFS);
  const deviceById = (id) => devices.find((device) => device.id === id);
  const activeDevicePower = () =>
    devices.reduce((sum, device) => sum + (device.on ? device.power : 0), 0);

  function formatClock(seconds) {
    const total = Math.max(0, Math.ceil(seconds));
    const minutes = Math.floor(total / 60);
    const secs = total % 60;
    return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }

  function formatLogTime(seconds) {
    const total = Math.max(0, Math.floor(seconds));
    return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  }

  function batteryPercent() {
    return clamp((state.batteryKwh / BATTERY_KWH) * 100, 0, 100);
  }

  function fuelPercent() {
    return clamp((state.fuelKwh / FUEL_KWH) * 100, 0, 100);
  }

  function currentSpeed() {
    return SPEEDS[state.speedIndex];
  }

  function renderLoadList() {
    $("loadList").innerHTML = devices
      .map(
        (device) => `
          <div class="load-row ${device.on ? "" : "off"} ${device.locked ? "locked" : ""}" data-device="${device.id}">
            <span class="load-icon" aria-hidden="true">${device.icon}</span>
            <div class="load-copy">
              <strong>${device.name}</strong>
              <small>${device.detail}</small>
            </div>
            <span class="load-power">${device.power.toFixed(1)}<small> kW</small></span>
            ${
              device.locked
                ? '<span class="lock-mark" title="关键负载不可断电">LOCK</span>'
                : `<button class="load-toggle" type="button" role="switch" aria-checked="${device.on}" aria-label="切换${device.name}"><span></span></button>`
            }
          </div>`
      )
      .join("");
  }

  function tidalFlowAt(seconds) {
    return clamp(
      0.73 +
        0.17 * Math.sin(seconds * 0.0074) +
        0.065 * Math.sin(seconds * 0.026 + 1.4) +
        0.025 * Math.sin(seconds * 0.071),
      0.38,
      1.04
    );
  }

  function calculatePower() {
    const flow = tidalFlowAt(state.simTime);
    const tidal = Math.min(TIDAL_CAPACITY, 2 + 18 * Math.pow(flow, 1.9));
    const pump = deviceById("pump");
    const surgeActive = pump.on && state.pumpSurge > 0;
    const demand = activeDevicePower() + (surgeActive ? pump.surge : 0);
    const tidalSupply = Math.min(tidal, demand);
    const gap = Math.max(0, demand - tidalSupply);

    let fuelOutput = 0;
    if (state.fuelOn && state.fuelKwh > 0.0001) {
      fuelOutput = Math.min(FUEL_MAX_KW, gap);
    }

    const remainingGap = Math.max(0, gap - fuelOutput);
    const powerHeadroom = batteryPercent() <= 4 ? 14 : batteryPercent() <= 12 ? 28 : 42;
    const batteryOutput = Math.min(remainingGap, state.batteryLimit, powerHeadroom);
    const deficit = Math.max(0, remainingGap - batteryOutput);
    const surplus = Math.max(0, tidal - demand);
    const batteryCharge = state.batteryOutput > 0 ? 0 : Math.min(10, surplus * 0.82);

    return { flow, tidal, demand, tidalSupply, fuelOutput, batteryOutput, batteryCharge, deficit, surgeActive };
  }

  function finishMission(kind, reason) {
    if (state.ended) return;
    state.ended = true;
    state.running = false;
    audio.stopAlarm();
    const battery = batteryPercent();
    const success = kind === "success";
    $("resultKicker").textContent = success ? "MISSION COMPLETE" : "MISSION ABORTED";
    $("resultTitle").textContent = success ? "基地守住了" : reason || "基地失稳";
    $("resultMessage").textContent = success
      ? "十五分钟值守完成。潮汐、电池与备用燃料电池协同稳定，核心舱室保持在线。"
      : "模拟已终止。检查供电缺口、电池温度与关键负载，再试一次。";
    $("resultBattery").textContent = `${battery.toFixed(0)}%`;
    $("resultStability").textContent = `${Math.max(0, state.stability).toFixed(0)}%`;
    $("resultOps").textContent = String(state.operationCount).padStart(2, "0");
    $("resultModal").hidden = false;
    $("pauseButton").classList.add("paused");
    addLog(success ? "15 分钟值守完成 · 核心系统在线" : `任务中止 · ${reason}`, success ? "" : "warn");
    updateUI(true);
  }

  function updateSimulation(delta) {
    if (state.ended || !state.running || delta <= 0) return;
    const dt = Math.min(delta, MISSION_SECONDS - state.simTime);
    state.simTime = Math.min(MISSION_SECONDS, state.simTime + dt);

    if (state.pumpSurge > 0) {
      state.pumpSurge = Math.max(0, state.pumpSurge - dt);
    }
    state.surgePulse = Math.max(0, state.surgePulse - dt * 1.4);

    const power = calculatePower();
    state.flow = power.flow;
    state.tidal = power.tidal;
    state.load = power.demand;
    state.deficit = power.deficit;
    state.batteryOutput = power.batteryOutput;
    state.batteryCharge = power.batteryCharge;
    state.fuelOutput = power.fuelOutput;

    state.batteryKwh = clamp(
      state.batteryKwh + (power.batteryCharge - power.batteryOutput) * (dt / 3600),
      0,
      BATTERY_KWH
    );

    if (power.fuelOutput > 0) {
      state.fuelKwh = Math.max(0, state.fuelKwh - power.fuelOutput * (dt / 3600));
      if (state.fuelKwh <= 0.0001) {
        state.fuelOn = false;
        state.fuelKwh = 0;
        $("fuelToggle").setAttribute("aria-checked", "false");
        $("fuelToggle").querySelector("span").textContent = "耗尽";
        addLog("备用燃料电池耗尽 · 自动脱网", "warn");
        showToast("燃料电池", "氢气耗尽，备用电源已脱网");
      }
    }

    const heatTarget =
      27 +
      (state.batteryOutput + state.batteryCharge * 0.16) * 1.55 +
      (power.surgeActive ? 4 : 0);
    state.batteryTemp += (heatTarget - state.batteryTemp) * (dt / 78);

    if (state.batteryTemp >= HEAT_CRITICAL) {
      state.overheatTime += dt;
      state.stability -= dt * (0.022 + (state.batteryTemp - HEAT_CRITICAL) * 0.0035);
    } else if (state.batteryTemp >= HEAT_WARN) {
      state.overheatTime += dt * 0.45;
      state.stability -= dt * 0.006;
    } else {
      state.overheatTime = Math.max(0, state.overheatTime - dt * 0.2);
    }

    if (state.deficit > 0.4) {
      state.stability -= dt * (0.02 + state.deficit * 0.0032);
    } else if (state.batteryTemp < 68) {
      state.stability += dt * 0.005;
    }
    state.stability = clamp(state.stability, 0, 100);

    if (state.batteryTemp >= HEAT_ABORT) {
      finishMission("fail", "电池热失控");
    } else if (state.stability <= 0) {
      finishMission("fail", "基地稳定性耗尽");
    } else if (state.batteryKwh <= 0.0001 && state.deficit > 0) {
      finishMission("fail", "主电池耗尽");
    } else if (state.simTime >= MISSION_SECONDS) {
      const battery = batteryPercent();
      if (battery >= BATTERY_RESERVE && state.stability >= STABILITY_MIN) {
        finishMission("success");
      } else {
        const reason =
          battery < BATTERY_RESERVE && state.stability < STABILITY_MIN
            ? "电量与稳定性均未达标"
            : battery < BATTERY_RESERVE
              ? "电池储备低于 20%"
              : "基地稳定性低于 60%";
        finishMission("fail", reason);
      }
    }
  }

  function addLog(text, type = "") {
    state.logs.unshift({ time: formatLogTime(state.simTime), text, type });
    state.logs = state.logs.slice(0, 6);
    renderLogs();
  }

  function renderLogs() {
    $("eventLog").innerHTML = state.logs
      .map(
        (entry) =>
          `<div class="log-entry ${entry.type}"><time>${entry.time}</time><strong>${entry.text}</strong></div>`
      )
      .join("");
    $("logCount").textContent = String(state.operationCount).padStart(2, "0");
  }

  function showToast(kicker, text) {
    $("toastKicker").textContent = kicker;
    $("toastText").textContent = text;
    $("eventToast").classList.add("visible");
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => $("eventToast").classList.remove("visible"), 3400);
  }

  function updateUI(force = false) {
    const battery = batteryPercent();
    const remaining = Math.max(0, MISSION_SECONDS - state.simTime);
    const temperature = state.batteryTemp;
    let status = "系统稳定";
    let level = "normal";

    if (state.deficit > 0.4) {
      status = "供电缺口";
      level = "critical";
    } else if (temperature >= HEAT_CRITICAL) {
      status = "电池过热";
      level = "critical";
    } else if (temperature >= HEAT_WARN) {
      status = "温度偏高";
      level = "warning";
    } else if (battery < BATTERY_RESERVE) {
      status = "储备告急";
      level = "warning";
    } else if (state.stability < 75) {
      status = "稳定性下降";
      level = "warning";
    }

    if (state.ended) {
      status = battery >= BATTERY_RESERVE && state.stability >= STABILITY_MIN ? "值守完成" : "任务终止";
      level = status === "值守完成" ? "normal" : "critical";
    }

    $("missionTime").textContent = formatClock(remaining);
    $("missionProgress").style.transform = `scaleX(${state.simTime / MISSION_SECONDS})`;
    $("timeScaleLabel").textContent = `×${currentSpeed()} 时流`;
    $("speedButton").textContent = `×${currentSpeed()}`;
    $("stateLabel").textContent = status;
    $("stateLabel").style.color =
      level === "critical" ? "var(--red)" : level === "warning" ? "var(--amber)" : "var(--aqua)";
    $("signalDot").className = `signal-dot ${level === "normal" ? "" : level === "warning" ? "warning" : "critical"}`;

    $("loadMetric").textContent = `${state.load.toFixed(1)} kW`;
    $("tidalMetric").textContent = `${state.tidal.toFixed(1)} kW`;
    $("flowMetric").textContent = `流速 ${state.flow.toFixed(2)} m/s`;
    const net = state.batteryCharge - state.batteryOutput;
    $("netMetric").textContent = `${net >= 0 ? "+" : ""}${net.toFixed(1)} kW`;
    $("netTrend").textContent = net < -0.2 ? "放电中" : net > 0.2 ? "充电中" : "待机";
    $("loadTrend").textContent = state.load > state.tidal + state.fuelOutput ? "电池补偿" : "潮汐覆盖";
    $("stabilityMetric").textContent = `${Math.max(0, state.stability).toFixed(0)}%`;
    $("stabilityTrend").textContent =
      state.stability >= 85 ? "核心稳定" : state.stability >= 60 ? "可恢复" : "临界";

    $("tidalSourceValue").textContent = `${state.tidal.toFixed(1)} kW`;
    $("flowValue").textContent = `${state.flow.toFixed(2)} m/s`;
    $("batterySourceValue").textContent = `${state.batteryOutput.toFixed(1)} kW`;
    $("batteryCharge").textContent = `${battery.toFixed(0)}%`;
    $("batteryFill").style.width = `${battery}%`;
    $("batteryFill").classList.toggle("low", battery < BATTERY_RESERVE);
    $("batteryTempValue").textContent = `${temperature.toFixed(1)}°C`;
    $("canvasTemp").innerHTML = `${temperature.toFixed(1)}<small>°C</small>`;
    $("canvasTempBar").style.width = `${clamp(((temperature - 24) / 60) * 100, 3, 100)}%`;
    $("canvasTempBar").style.background =
      temperature >= HEAT_CRITICAL
        ? "linear-gradient(90deg, var(--orange), var(--red))"
        : undefined;
    document.querySelector(".temp-float").classList.toggle("hot", temperature >= HEAT_CRITICAL);

    const heatFoot = document.querySelector(".heat-foot");
    heatFoot.classList.toggle("warm", temperature >= HEAT_WARN && temperature < HEAT_CRITICAL);
    heatFoot.classList.toggle("hot", temperature >= HEAT_CRITICAL);
    $("heatStatus").textContent =
      temperature >= HEAT_CRITICAL
        ? `过热 ${state.overheatTime.toFixed(0)}s`
        : temperature >= HEAT_WARN
          ? "温度偏高"
          : "散热正常";

    $("fuelSourceValue").textContent =
      state.fuelOn && state.fuelKwh > 0 ? `${state.fuelOutput.toFixed(1)} kW` : "0.0 kW";
    $("fuelRemaining").textContent = `${fuelPercent().toFixed(0)}%`;
    $("fuelToggle").setAttribute("aria-checked", String(state.fuelOn));
    $("fuelToggle").querySelector("span").textContent =
      state.fuelKwh <= 0.001 ? "耗尽" : state.fuelOn ? "开启" : "关闭";
    document.querySelector(".fuel-card").classList.toggle("active", state.fuelOn);
    const fuelCells = Math.ceil((state.fuelKwh / FUEL_KWH) * 6);
    [...$("fuelLeds").children].forEach((led, index) => {
      led.style.opacity = index < fuelCells ? "1" : "0.12";
    });

    const activePower = activeDevicePower();
    $("busTotal").textContent = activePower.toFixed(1);
    const busRatio = clamp(activePower / 78, 0, 1);
    $("busCapacityFill").style.width = `${busRatio * 100}%`;
    $("busCapacityFill").classList.toggle("warning", state.deficit > 0.4);

    devices.forEach((device) => {
      const row = document.querySelector(`[data-device="${device.id}"]`);
      if (!row) return;
      row.classList.toggle("off", !device.on);
      row.classList.toggle("surging", device.id === "pump" && state.pumpSurge > 0);
      const button = row.querySelector(".load-toggle");
      if (button) button.setAttribute("aria-checked", String(device.on));
      if (device.id === "pump") {
        const detail = row.querySelector(".load-copy small");
        detail.textContent =
          state.pumpSurge > 0
            ? `启动浪涌 · ${state.pumpSurge.toFixed(1)}s 后回落`
            : device.on
              ? "满载 · 启动浪涌 54 kW"
              : "已关闭 · 可快速启动";
        const power = row.querySelector(".load-power");
        power.innerHTML = `${(device.on ? device.power + (state.pumpSurge > 0 ? device.surge : 0) : 0).toFixed(1)}<small> kW</small>`;
      }
    });

    let alertText = "";
    if (state.deficit > 0.4) {
      alertText = `供电缺口 ${state.deficit.toFixed(1)} kW · 启用备用电源或卸载负荷`;
    } else if (temperature >= HEAT_CRITICAL) {
      alertText = `电池温度 ${temperature.toFixed(1)}°C · 降低放电负荷`;
    } else if (temperature >= HEAT_WARN) {
      alertText = `电池温度接近上限 · 建议启用燃料电池`;
    }
    $("canvasAlertText").textContent = alertText;
    $("canvasAlert").classList.toggle("visible", Boolean(alertText));

    if (state.deficit > 0.4 && !state.wasDeficit) {
      addLog(`供电缺口 ${state.deficit.toFixed(1)} kW`, "warn");
      showToast("总线告警", "供电缺口出现，稳定性正在下降");
      audio.alarm("deficit");
      state.wasDeficit = true;
    } else if (state.deficit <= 0.4 && state.wasDeficit) {
      addLog("供电缺口已消除");
      showToast("总线恢复", "负荷总线重新平衡");
      audio.stopAlarm();
      state.wasDeficit = false;
    }

    if (temperature >= HEAT_CRITICAL && !state.wasHot) {
      addLog(`电池组 ${temperature.toFixed(0)}°C · 过热`, "warn");
      showToast("热控告警", "电池过热，请降低电池放电量");
      audio.alarm("heat");
      state.wasHot = true;
    } else if (temperature < HEAT_WARN && state.wasHot) {
      addLog("电池温度恢复至安全区");
      audio.stopAlarm();
      state.wasHot = false;
    }

    if (force) renderLogs();
  }

  const canvas = $("baseCanvas");
  const ctx = canvas.getContext("2d");
  const scene = {
    width: 0,
    height: 0,
    dpr: 1,
    bubbles: [],
  };

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    scene.width = Math.max(1, rect.width);
    scene.height = Math.max(1, rect.height);
    scene.dpr = dpr;
    canvas.width = Math.round(scene.width * dpr);
    canvas.height = Math.round(scene.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (scene.bubbles.length === 0) {
      scene.bubbles = Array.from({ length: 42 }, () => ({
        x: Math.random(),
        y: Math.random(),
        radius: 0.7 + Math.random() * 2.8,
        speed: 0.006 + Math.random() * 0.018,
        drift: Math.random() * Math.PI * 2,
      }));
    }
  }

  function roundRect(context, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    context.beginPath();
    context.moveTo(x + r, y);
    context.arcTo(x + width, y, x + width, y + height, r);
    context.arcTo(x + width, y + height, x, y + height, r);
    context.arcTo(x, y + height, x, y, r);
    context.arcTo(x, y, x + width, y, r);
    context.closePath();
  }

  function drawBackground(time) {
    const { width: w, height: h } = scene;
    const gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, "#06242d");
    gradient.addColorStop(0.34, "#041b23");
    gradient.addColorStop(0.7, "#03151b");
    gradient.addColorStop(1, "#020e13");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);

    const surfaceGlow = ctx.createRadialGradient(w * 0.38, -h * 0.2, 0, w * 0.38, -h * 0.2, h * 0.95);
    surfaceGlow.addColorStop(0, "rgba(93, 221, 211, 0.25)");
    surfaceGlow.addColorStop(0.45, "rgba(38, 132, 139, 0.08)");
    surfaceGlow.addColorStop(1, "rgba(4, 18, 23, 0)");
    ctx.fillStyle = surfaceGlow;
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.globalCompositeOperation = "screen";
    for (let i = 0; i < 5; i += 1) {
      const x = w * (0.09 + i * 0.18) + Math.sin(time * 0.00013 + i) * 26;
      const beam = ctx.createLinearGradient(x, 0, x + 120, h * 0.72);
      beam.addColorStop(0, "rgba(97, 209, 203, 0.055)");
      beam.addColorStop(0.5, "rgba(68, 167, 170, 0.018)");
      beam.addColorStop(1, "rgba(10, 46, 55, 0)");
      ctx.fillStyle = beam;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + 46, 0);
      ctx.lineTo(x + 175 + i * 8, h * 0.74);
      ctx.lineTo(x + 52, h * 0.74);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    ctx.strokeStyle = "rgba(111, 188, 188, 0.072)";
    ctx.lineWidth = 1;
    for (let y = h * 0.13; y < h * 0.75; y += 34) {
      ctx.beginPath();
      for (let x = 0; x <= w; x += 8) {
        const wave = Math.sin(x * 0.009 + time * 0.00035 + y * 0.02) * 2.3;
        if (x === 0) ctx.moveTo(x, y + wave);
        else ctx.lineTo(x, y + wave);
      }
      ctx.stroke();
    }

    scene.bubbles.forEach((bubble) => {
      bubble.y -= bubble.speed * 0.00013 * time;
      if (bubble.y < -0.04) bubble.y = 1.04;
      const x = bubble.x * w + Math.sin(time * 0.0007 + bubble.drift) * 7;
      const y = bubble.y * h;
      ctx.beginPath();
      ctx.arc(x, y, bubble.radius, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(110, 218, 213, 0.2)";
      ctx.lineWidth = 0.7;
      ctx.stroke();
      ctx.fillStyle = "rgba(112, 213, 210, 0.06)";
      ctx.fill();
    });

    const floor = ctx.createLinearGradient(0, h * 0.78, 0, h);
    floor.addColorStop(0, "rgba(2, 14, 18, 0)");
    floor.addColorStop(1, "rgba(1, 8, 11, 0.9)");
    ctx.fillStyle = floor;
    ctx.beginPath();
    ctx.moveTo(0, h * 0.86);
    ctx.bezierCurveTo(w * 0.2, h * 0.81, w * 0.32, h * 0.94, w * 0.5, h * 0.86);
    ctx.bezierCurveTo(w * 0.68, h * 0.79, w * 0.83, h * 0.91, w, h * 0.84);
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(86, 161, 161, 0.12)";
    ctx.stroke();
  }

  function pointOnPolyline(points, progress) {
    const lengths = [];
    let total = 0;
    for (let i = 1; i < points.length; i += 1) {
      const length = Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
      lengths.push(length);
      total += length;
    }
    let target = clamp(progress, 0, 1) * total;
    for (let i = 0; i < lengths.length; i += 1) {
      if (target <= lengths[i]) {
        const ratio = lengths[i] === 0 ? 0 : target / lengths[i];
        return [
          lerp(points[i][0], points[i + 1][0], ratio),
          lerp(points[i][1], points[i + 1][1], ratio),
        ];
      }
      target -= lengths[i];
    }
    return points[points.length - 1];
  }

  function drawFlowPath(points, color, active, time, direction = 1) {
    if (active <= 0.02) return;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.18 + active * 0.12;
    ctx.lineWidth = 1;
    ctx.beginPath();
    points.forEach(([x, y], index) => {
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    const dotCount = 4 + Math.round(active * 4);
    for (let i = 0; i < dotCount; i += 1) {
      let progress = (time * 0.00018 * (0.7 + active * 0.8) + i / dotCount) % 1;
      if (direction < 0) progress = 1 - progress;
      const [x, y] = pointOnPolyline(points, progress);
      const fade = Math.sin(progress * Math.PI * 1.5) * 0.35 + 0.72;
      ctx.globalAlpha = clamp(fade * (0.45 + active * 0.55), 0, 1);
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 9;
      ctx.beginPath();
      ctx.arc(x, y, 1.5 + active * 0.8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawTurbine(x, y, scale, time) {
    const rotation = time * 0.0012 * (0.55 + state.flow * 1.8);
    const radius = 39 * scale;

    ctx.save();
    ctx.strokeStyle = "rgba(92, 159, 164, 0.32)";
    ctx.fillStyle = "rgba(18, 57, 65, 0.7)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x - 30 * scale, y + 20 * scale);
    ctx.lineTo(x - 11 * scale, y + 134 * scale);
    ctx.lineTo(x + 11 * scale, y + 134 * scale);
    ctx.lineTo(x + 30 * scale, y + 20 * scale);
    ctx.closePath();
    ctx.stroke();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x - 9 * scale, y + 56 * scale);
    ctx.lineTo(x - 27 * scale, y + 134 * scale);
    ctx.moveTo(x + 9 * scale, y + 56 * scale);
    ctx.lineTo(x + 27 * scale, y + 134 * scale);
    ctx.stroke();

    ctx.shadowColor = "rgba(102, 234, 212, 0.35)";
    ctx.shadowBlur = 15;
    ctx.fillStyle = "rgba(10, 45, 52, 0.95)";
    ctx.strokeStyle = "rgba(102, 234, 212, 0.42)";
    ctx.beginPath();
    ctx.arc(x, y, 14 * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;

    for (let blade = 0; blade < 3; blade += 1) {
      const angle = rotation + (blade * Math.PI * 2) / 3;
      const tipX = x + Math.cos(angle) * radius;
      const tipY = y + Math.sin(angle) * radius;
      const normalX = Math.cos(angle + Math.PI / 2) * 8 * scale;
      const normalY = Math.sin(angle + Math.PI / 2) * 8 * scale;
      const gradient = ctx.createLinearGradient(x, y, tipX, tipY);
      gradient.addColorStop(0, "rgba(90, 211, 198, 0.68)");
      gradient.addColorStop(1, "rgba(40, 117, 120, 0.16)");
      ctx.fillStyle = gradient;
      ctx.strokeStyle = "rgba(119, 223, 210, 0.3)";
      ctx.beginPath();
      ctx.moveTo(x + normalX, y + normalY);
      ctx.quadraticCurveTo(
        x + Math.cos(angle) * radius * 0.52 + normalX * 1.8,
        y + Math.sin(angle) * radius * 0.52 + normalY * 1.8,
        tipX,
        tipY
      );
      ctx.lineTo(x - normalX * 0.45, y - normalY * 0.45);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    ctx.fillStyle = "rgba(99, 231, 215, 0.8)";
    ctx.beginPath();
    ctx.arc(x, y, 4.2 * scale, 0, Math.PI * 2);
    ctx.fill();

    const flowWidth = 72 + state.flow * 52;
    ctx.strokeStyle = "rgba(109, 224, 215, 0.16)";
    for (let line = 0; line < 3; line += 1) {
      const lineY = y - 18 * scale + line * 17 * scale;
      ctx.beginPath();
      ctx.moveTo(x - flowWidth - 30, lineY);
      ctx.bezierCurveTo(
        x - 30,
        lineY - 4,
        x + 16,
        lineY + 5,
        x + 35 + flowWidth * 0.2,
        lineY - 2
      );
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawHabitatModules(cx, cy, scale) {
    const life = deviceById("life");
    const lights = deviceById("lights");
    const desal = deviceById("desal");
    const leftX = cx - 155 * scale;
    const rightX = cx + 112 * scale;
    const moduleY = cy + 7 * scale;
    const bodyWidth = 114 * scale;
    const bodyHeight = 48 * scale;

    ctx.save();
    ctx.strokeStyle = "rgba(94, 157, 162, 0.34)";
    ctx.fillStyle = "rgba(9, 32, 39, 0.92)";
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(cx - 46 * scale, moduleY + 22 * scale);
    ctx.lineTo(cx + 48 * scale, moduleY + 22 * scale);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(leftX + bodyWidth - 3 * scale, moduleY + 16 * scale);
    ctx.lineTo(cx - 30 * scale, moduleY + 16 * scale);
    ctx.lineTo(cx + 30 * scale, moduleY + 16 * scale);
    ctx.lineTo(rightX + 3 * scale, moduleY + 16 * scale);
    ctx.stroke();

    [leftX, rightX].forEach((x) => {
      roundRect(ctx, x, moduleY, bodyWidth, bodyHeight, 15 * scale);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = "rgba(120, 197, 197, 0.13)";
      for (let row = 1; row < 3; row += 1) {
        ctx.beginPath();
        ctx.moveTo(x + 7 * scale, moduleY + row * 16 * scale);
        ctx.lineTo(x + bodyWidth - 7 * scale, moduleY + row * 16 * scale);
        ctx.stroke();
      }
    });

    const lifeGlow = ctx.createRadialGradient(
      leftX + 31 * scale,
      moduleY + 18 * scale,
      0,
      leftX + 31 * scale,
      moduleY + 18 * scale,
      24 * scale
    );
    lifeGlow.addColorStop(0, life.on ? "rgba(121, 224, 170, 0.35)" : "rgba(255, 93, 97, 0.2)");
    lifeGlow.addColorStop(1, "rgba(121, 224, 170, 0)");
    ctx.fillStyle = lifeGlow;
    ctx.fillRect(leftX, moduleY - 12 * scale, 100 * scale, 72 * scale);
    ctx.strokeStyle = life.on ? "rgba(121, 224, 170, 0.65)" : "rgba(255, 93, 97, 0.7)";
    ctx.lineWidth = 1.2;
    ctx.strokeRect(leftX + 20 * scale, moduleY + 11 * scale, 20 * scale, 8 * scale);
    ctx.fillStyle = life.on ? "rgba(121, 224, 170, 0.18)" : "rgba(255, 93, 97, 0.16)";
    ctx.fillRect(leftX + 20 * scale, moduleY + 11 * scale, 20 * scale, 8 * scale);

    const windowColor = lights.on ? "rgba(255, 192, 105, 0.65)" : "rgba(84, 131, 136, 0.18)";
    for (let i = 0; i < 3; i += 1) {
      ctx.fillStyle = windowColor;
      ctx.shadowColor = lights.on ? "rgba(255, 183, 88, 0.45)" : "transparent";
      ctx.shadowBlur = lights.on ? 9 : 0;
      roundRect(ctx, rightX + (28 + i * 24) * scale, moduleY + 17 * scale, 12 * scale, 8 * scale, 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;

    ctx.fillStyle = "rgba(104, 182, 184, 0.45)";
    ctx.font = `${7 * Math.max(0.9, scale)}px "Cascadia Code", monospace`;
    ctx.textAlign = "left";
    ctx.fillText("LIFE SUPPORT", leftX + 8 * scale, moduleY + bodyHeight + 10 * scale);
    ctx.fillText("LAB / HAB", rightX + 8 * scale, moduleY + bodyHeight + 10 * scale);
    if (desal.on) {
      ctx.fillStyle = "rgba(91, 177, 215, 0.42)";
      ctx.fillText("DESAL ONLINE", rightX + 8 * scale, moduleY + bodyHeight + 20 * scale);
    }
    ctx.restore();
  }

  function drawCoreDome(cx, cy, scale) {
    const radius = 57 * scale;
    ctx.save();
    ctx.strokeStyle = "rgba(90, 153, 160, 0.28)";
    ctx.fillStyle = "rgba(12, 37, 44, 0.7)";
    ctx.lineWidth = 1.2;

    [-1, 1].forEach((side) => {
      ctx.beginPath();
      ctx.moveTo(cx + side * 39 * scale, cy + 41 * scale);
      ctx.lineTo(cx + side * 47 * scale, cy + 107 * scale);
      ctx.lineTo(cx + side * 55 * scale, cy + 107 * scale);
      ctx.lineTo(cx + side * 46 * scale, cy + 41 * scale);
      ctx.stroke();
    });

    const halo = ctx.createRadialGradient(cx, cy, radius * 0.35, cx, cy, radius * 1.35);
    halo.addColorStop(0, "rgba(81, 218, 207, 0.15)");
    halo.addColorStop(1, "rgba(34, 125, 128, 0)");
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 1.4, 0, Math.PI * 2);
    ctx.fill();

    const dome = ctx.createRadialGradient(
      cx - radius * 0.3,
      cy - radius * 0.38,
      radius * 0.05,
      cx,
      cy,
      radius
    );
    dome.addColorStop(0, "rgba(30, 87, 94, 0.82)");
    dome.addColorStop(0.56, "rgba(8, 36, 44, 0.95)");
    dome.addColorStop(1, "rgba(3, 19, 25, 0.98)");
    ctx.fillStyle = dome;
    ctx.strokeStyle = "rgba(111, 205, 199, 0.38)";
    ctx.shadowColor = "rgba(81, 213, 202, 0.15)";
    ctx.shadowBlur = 25;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius - 1.2, 0, Math.PI * 2);
    ctx.clip();
    ctx.strokeStyle = "rgba(112, 205, 199, 0.12)";
    for (let offset = -radius; offset <= radius; offset += radius / 3.2) {
      ctx.beginPath();
      ctx.ellipse(cx, cy + offset, radius * 0.98, radius * 0.2, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (let offset = -radius; offset <= radius; offset += radius / 3.2) {
      ctx.beginPath();
      ctx.ellipse(cx, cy, radius * 0.2, radius * 0.98, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();

    const inner = ctx.createRadialGradient(cx, cy + 4 * scale, 2, cx, cy + 4 * scale, 28 * scale);
    inner.addColorStop(0, "rgba(109, 249, 227, 0.38)");
    inner.addColorStop(0.45, "rgba(36, 136, 135, 0.16)");
    inner.addColorStop(1, "rgba(7, 33, 40, 0.2)");
    ctx.fillStyle = inner;
    ctx.beginPath();
    ctx.arc(cx, cy + 5 * scale, 28 * scale, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "rgba(118, 235, 221, 0.55)";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(cx, cy + 5 * scale, 12 * scale, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy + 5 * scale, 4.3 * scale, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(125, 245, 226, 0.8)";
    ctx.fill();

    ctx.fillStyle = "rgba(118, 207, 203, 0.62)";
    ctx.font = `${7 * Math.max(0.95, scale)}px "Cascadia Code", monospace`;
    ctx.textAlign = "center";
    ctx.fillText("A-17 // CORE", cx, cy + radius + 14 * scale);
    ctx.restore();
  }

  function drawBattery(busX, busY, scale, time) {
    const width = 104 * scale;
    const height = 42 * scale;
    const x = busX - width / 2;
    const y = busY + 37 * scale;
    const percent = batteryPercent() / 100;
    const hotRatio = clamp((state.batteryTemp - 45) / 45, 0, 1);
    const coreColor = `rgba(${Math.round(lerp(73, 255, hotRatio))}, ${Math.round(
      lerp(169, 94, hotRatio)
    )}, ${Math.round(lerp(216, 74, hotRatio))}, 1)`;

    ctx.save();
    ctx.strokeStyle = "rgba(102, 181, 188, 0.35)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(busX - 15 * scale, busY + 11 * scale);
    ctx.lineTo(busX - 15 * scale, y);
    ctx.moveTo(busX + 15 * scale, busY + 11 * scale);
    ctx.lineTo(busX + 15 * scale, y);
    ctx.stroke();

    ctx.shadowColor = hotRatio > 0.35 ? "rgba(255, 92, 75, 0.22)" : "rgba(74, 166, 204, 0.18)";
    ctx.shadowBlur = 22;
    roundRect(ctx, x, y, width, height, 6 * scale);
    ctx.fillStyle = "rgba(7, 29, 36, 0.96)";
    ctx.fill();
    ctx.strokeStyle = hotRatio > 0.5 ? "rgba(255, 103, 78, 0.5)" : "rgba(95, 173, 188, 0.35)";
    ctx.stroke();
    ctx.shadowBlur = 0;

    const cellGap = 3 * scale;
    const cellWidth = (width - 16 * scale - cellGap * 5) / 6;
    for (let i = 0; i < 6; i += 1) {
      const cellX = x + 8 * scale + i * (cellWidth + cellGap);
      const fill = clamp(percent * 6 - i, 0, 1);
      roundRect(ctx, cellX, y + 8 * scale, cellWidth, height - 16 * scale, 1.5);
      ctx.fillStyle = "rgba(38, 78, 89, 0.38)";
      ctx.fill();
      if (fill > 0) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(cellX, y + 8 * scale, cellWidth * fill, height - 16 * scale);
        ctx.clip();
        const cellGradient = ctx.createLinearGradient(0, y + height, 0, y);
        cellGradient.addColorStop(0, coreColor);
        cellGradient.addColorStop(1, hotRatio > 0.5 ? "rgba(255, 183, 93, 0.82)" : "rgba(101, 214, 230, 0.9)");
        ctx.fillStyle = cellGradient;
        ctx.fillRect(cellX, y + 8 * scale, cellWidth, height - 16 * scale);
        ctx.restore();
      }
    }
    ctx.fillStyle = hotRatio > 0.45 ? "rgba(255, 128, 93, 0.85)" : "rgba(104, 211, 222, 0.72)";
    ctx.font = `${7 * Math.max(0.95, scale)}px "Cascadia Code", monospace`;
    ctx.textAlign = "left";
    ctx.fillText("MAIN BATTERY", x + 8 * scale, y + height + 11 * scale);
    ctx.textAlign = "right";
    ctx.fillText(`${state.batteryTemp.toFixed(1)}°C`, x + width - 8 * scale, y + height + 11 * scale);

    if (state.batteryTemp > 58) {
      ctx.strokeStyle = `rgba(255, ${Math.round(lerp(159, 76, hotRatio))}, 90, ${
        0.12 + hotRatio * 0.45
      })`;
      ctx.lineWidth = 1;
      for (let i = 0; i < 4; i += 1) {
        const waveX = x + (18 + i * 22) * scale;
        const waveTop = y - (18 + hotRatio * 22) * scale - Math.sin(time * 0.003 + i) * 4;
        ctx.beginPath();
        ctx.moveTo(waveX, y - 3);
        ctx.bezierCurveTo(
          waveX - 7,
          y - 12 * scale,
          waveX + 8,
          y - 21 * scale,
          waveX + Math.sin(time * 0.002 + i) * 7,
          waveTop
        );
        ctx.stroke();
      }
    }
    ctx.restore();
    return { x, y, width, height };
  }

  function drawFuelCell(x, y, scale) {
    const width = 78 * scale;
    const height = 39 * scale;
    ctx.save();
    ctx.globalAlpha = state.fuelOn ? 1 : 0.48;
    ctx.shadowColor = state.fuelOn ? "rgba(245, 200, 105, 0.28)" : "transparent";
    ctx.shadowBlur = 14;
    roundRect(ctx, x - width / 2, y - height / 2, width, height, 4 * scale);
    ctx.fillStyle = "rgba(27, 35, 31, 0.88)";
    ctx.fill();
    ctx.strokeStyle = state.fuelOn ? "rgba(245, 200, 105, 0.48)" : "rgba(139, 151, 132, 0.24)";
    ctx.stroke();
    ctx.shadowBlur = 0;

    const activeFuel = fuelPercent() / 100;
    for (let i = 0; i < 3; i += 1) {
      const tankX = x - width / 2 + (9 + i * 14) * scale;
      roundRect(ctx, tankX, y - 11 * scale, 9 * scale, 22 * scale, 4 * scale);
      ctx.fillStyle = i / 3 < activeFuel ? "rgba(245, 200, 105, 0.32)" : "rgba(92, 91, 67, 0.16)";
      ctx.fill();
      ctx.strokeStyle = "rgba(245, 200, 105, 0.3)";
      ctx.stroke();
    }
    ctx.fillStyle = state.fuelOn ? "rgba(245, 200, 105, 0.82)" : "rgba(150, 157, 134, 0.5)";
    ctx.font = `${7 * Math.max(0.95, scale)}px "Cascadia Code", monospace`;
    ctx.textAlign = "center";
    ctx.fillText(state.fuelOn ? "FUEL CELL · ONLINE" : "FUEL CELL · STANDBY", x, y + height / 2 + 12 * scale);
    ctx.restore();
  }

  function drawBus(x, y, scale, time) {
    const pulse = 0.55 + Math.sin(time * 0.0035) * 0.14;
    ctx.save();
    ctx.translate(x, y);
    const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, 28 * scale);
    glow.addColorStop(0, `rgba(104, 240, 222, ${0.26 * pulse})`);
    glow.addColorStop(1, "rgba(104, 240, 222, 0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, 28 * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(106, 233, 217, 0.5)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, 11 * scale, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, 4.5 * scale, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(121, 246, 226, 0.9)";
    ctx.shadowColor = "rgba(102, 234, 212, 0.9)";
    ctx.shadowBlur = 12;
    ctx.fill();
    ctx.shadowBlur = 0;
    for (let i = 0; i < 8; i += 1) {
      const angle = (i / 8) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(angle) * 12.5 * scale, Math.sin(angle) * 12.5 * scale);
      ctx.lineTo(Math.cos(angle) * 15 * scale, Math.sin(angle) * 15 * scale);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawFishSchool(time, width, height) {
    const schoolX = ((time * 0.012) % (width + 180)) - 90;
    const schoolY = height * 0.29 + Math.sin(time * 0.00045) * 13;
    ctx.save();
    ctx.strokeStyle = "rgba(105, 179, 181, 0.2)";
    ctx.fillStyle = "rgba(57, 107, 116, 0.18)";
    ctx.lineWidth = 0.8;
    for (let i = 0; i < 11; i += 1) {
      const x = schoolX - (i % 5) * 13 + Math.sin(i * 2.4) * 4;
      const y = schoolY + Math.floor(i / 5) * 9 + Math.sin(i * 1.9 + time * 0.002) * 3;
      ctx.beginPath();
      ctx.ellipse(x, y, 4.2, 1.5, -0.12, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x + 3.8, y);
      ctx.lineTo(x + 6.6, y - 2.2);
      ctx.lineTo(x + 6.1, y + 1.8);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  function drawSurge(cx, cy, busX, busY, scale, time) {
    if (state.pumpSurge <= 0) return;
    const strength = clamp(state.pumpSurge / 4, 0, 1);
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.strokeStyle = `rgba(255, 187, 93, ${0.22 + strength * 0.4})`;
    ctx.lineWidth = 1;
    ctx.shadowColor = "rgba(255, 175, 82, 0.65)";
    ctx.shadowBlur = 8;
    for (let arc = 0; arc < 3; arc += 1) {
      ctx.beginPath();
      const startX = busX + 15 * scale;
      const startY = busY - 2 * scale;
      ctx.moveTo(startX, startY);
      for (let point = 1; point <= 6; point += 1) {
        const t = point / 6;
        const x = startX + t * (cx + 74 * scale - startX);
        const y =
          startY +
          t * (cy - 31 * scale - startY) +
          Math.sin(point * 4.7 + time * 0.03 + arc) * 4 * strength;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawScene(time) {
    if (!scene.width || !scene.height) return;
    const { width: w, height: h } = scene;
    const scale = clamp(Math.min(w / 920, h / 540) * 1.08, 0.62, 1.42);
    const cx = w * 0.525;
    const cy = h * 0.455;
    const busX = cx;
    const busY = cy + 76 * scale;
    const turbineX = w * 0.115;
    const turbineY = h * 0.55;
    const fuelX = cx + 176 * scale;
    const fuelY = cy + 74 * scale;

    drawBackground(time);
    drawFishSchool(time, w, h);
    drawTurbine(turbineX, turbineY, scale * 0.86, time);
    drawHabitatModules(cx, cy, scale);
    drawCoreDome(cx, cy, scale);
    drawFuelCell(fuelX, fuelY, scale * 0.92);
    const battery = drawBattery(busX, busY, scale, time);

    const tidalPath = [
      [turbineX + 30 * scale, turbineY + 16 * scale],
      [turbineX + 96 * scale, turbineY + 52 * scale],
      [cx - 122 * scale, busY + 2 * scale],
      [busX - 14 * scale, busY],
    ];
    const fuelPath = [
      [fuelX - 21 * scale, fuelY],
      [fuelX - 62 * scale, busY + 12 * scale],
      [busX + 14 * scale, busY],
    ];
    const batteryPath = [
      [busX, battery.y],
      [busX, busY + 16 * scale],
    ];
    const leftLoadPath = [
      [busX - 12 * scale, busY - 2 * scale],
      [cx - 70 * scale, busY - 26 * scale],
      [cx - 119 * scale, cy + 30 * scale],
    ];
    const rightLoadPath = [
      [busX + 12 * scale, busY - 2 * scale],
      [cx + 67 * scale, busY - 26 * scale],
      [cx + 127 * scale, cy + 30 * scale],
    ];

    drawFlowPath(tidalPath, "rgba(102, 234, 212, 0.9)", state.tidal / TIDAL_CAPACITY, time);
    drawFlowPath(fuelPath, "rgba(245, 200, 105, 0.92)", state.fuelOn ? state.fuelOutput / FUEL_MAX_KW : 0, time);
    drawFlowPath(
      batteryPath,
      "rgba(91, 175, 229, 0.95)",
      state.batteryCharge > 0 ? state.batteryCharge / 10 : state.batteryOutput / 42,
      time,
      state.batteryCharge > 0 ? -1 : 1
    );
    drawFlowPath(leftLoadPath, "rgba(121, 224, 170, 0.82)", deviceById("life").on ? 0.9 : 0, time);
    drawFlowPath(
      rightLoadPath,
      "rgba(255, 191, 104, 0.82)",
      deviceById("lights").on ? 0.7 : 0.12,
      time
    );
    drawBus(busX, busY, scale, time);
    drawSurge(cx, cy, busX, busY, scale, time);

    ctx.save();
    ctx.fillStyle = "rgba(100, 188, 190, 0.36)";
    ctx.font = `${7 * Math.max(0.95, scale)}px "Cascadia Code", monospace`;
    ctx.textAlign = "left";
    ctx.fillText("TIDAL ARRAY", turbineX - 32 * scale, turbineY + 153 * scale);
    ctx.textAlign = "right";
    ctx.fillText("POWER BUS / A-17", w - 24, h - 18);
    ctx.restore();
  }

  const audio = {
    context: null,
    master: null,
    ocean: null,
    oceanGain: null,
    drone: null,
    droneGain: null,
    hum: null,
    humGain: null,
    humFilter: null,
    alarmOsc: null,
    alarmGain: null,
    alarmType: null,
    muted: true,

    ensure() {
      if (this.context) {
        if (this.context.state === "suspended") this.context.resume();
        return true;
      }
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return false;
      const context = new AudioContextClass();
      const master = context.createGain();
      master.gain.value = this.muted ? 0 : 0.42;
      master.connect(context.destination);

      const buffer = context.createBuffer(1, context.sampleRate * 3, context.sampleRate);
      const data = buffer.getChannelData(0);
      let last = 0;
      for (let i = 0; i < data.length; i += 1) {
        last = last * 0.88 + (Math.random() * 2 - 1) * 0.12;
        data[i] = last;
      }
      const ocean = context.createBufferSource();
      ocean.buffer = buffer;
      ocean.loop = true;
      const oceanFilter = context.createBiquadFilter();
      oceanFilter.type = "lowpass";
      oceanFilter.frequency.value = 360;
      oceanFilter.Q.value = 0.7;
      const oceanGain = context.createGain();
      oceanGain.gain.value = 0.08;
      ocean.connect(oceanFilter).connect(oceanGain).connect(master);
      ocean.start();

      const drone = context.createOscillator();
      drone.type = "sine";
      drone.frequency.value = 47;
      const droneGain = context.createGain();
      droneGain.gain.value = 0.045;
      drone.connect(droneGain).connect(master);
      drone.start();

      const hum = context.createOscillator();
      hum.type = "sawtooth";
      hum.frequency.value = 92;
      const humFilter = context.createBiquadFilter();
      humFilter.type = "lowpass";
      humFilter.frequency.value = 210;
      humFilter.Q.value = 1.4;
      const humGain = context.createGain();
      humGain.gain.value = 0;
      hum.connect(humFilter).connect(humGain).connect(master);
      hum.start();

      this.context = context;
      this.master = master;
      this.ocean = ocean;
      this.oceanGain = oceanGain;
      this.drone = drone;
      this.droneGain = droneGain;
      this.hum = hum;
      this.humGain = humGain;
      this.humFilter = humFilter;
      this.update(state, true);
      return true;
    },

    setMuted(muted) {
      this.muted = muted;
      if (this.master && this.context) {
        this.master.gain.setTargetAtTime(muted ? 0 : 0.42, this.context.currentTime, 0.08);
      }
    },

    update(snapshot, immediate = false) {
      if (!this.context) return;
      const now = this.context.currentTime;
      const smoothing = immediate ? 0.01 : 0.25;
      const loadRatio = clamp(snapshot.load / 78, 0, 1);
      const tidalRatio = clamp(snapshot.tidal / TIDAL_CAPACITY, 0, 1);
      this.oceanGain.gain.setTargetAtTime(0.07 + tidalRatio * 0.055, now, smoothing);
      this.droneGain.gain.setTargetAtTime(0.038 + loadRatio * 0.05, now, smoothing);
      this.humGain.gain.setTargetAtTime(0.014 + loadRatio * 0.032, now, smoothing);
      this.hum.frequency.setTargetAtTime(72 + loadRatio * 88, now, smoothing);
      this.humFilter.frequency.setTargetAtTime(150 + loadRatio * 260, now, smoothing);
      this.drone.frequency.setTargetAtTime(44 + (snapshot.batteryTemp - 30) * 0.13, now, smoothing);
    },

    playSwitch(on) {
      if (!this.context || this.muted) return;
      const now = this.context.currentTime;
      const oscillator = this.context.createOscillator();
      const gain = this.context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(on ? 430 : 310, now);
      oscillator.frequency.exponentialRampToValueAtTime(on ? 690 : 190, now + 0.11);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.045, now + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.15);
      oscillator.connect(gain).connect(this.master);
      oscillator.start(now);
      oscillator.stop(now + 0.17);
    },

    playSurge() {
      if (!this.context || this.muted) return;
      const now = this.context.currentTime;
      const oscillator = this.context.createOscillator();
      const filter = this.context.createBiquadFilter();
      const gain = this.context.createGain();
      oscillator.type = "sawtooth";
      oscillator.frequency.setValueAtTime(88, now);
      oscillator.frequency.exponentialRampToValueAtTime(32, now + 1.35);
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(520, now);
      filter.frequency.exponentialRampToValueAtTime(120, now + 1.4);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.12, now + 0.08);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.75);
      oscillator.connect(filter).connect(gain).connect(this.master);
      oscillator.start(now);
      oscillator.stop(now + 1.8);
    },

    alarm(type) {
      if (!this.context || this.muted) return;
      if (this.alarmType === type && this.alarmOsc) return;
      this.stopAlarm();
      const now = this.context.currentTime;
      const oscillator = this.context.createOscillator();
      const gain = this.context.createGain();
      const lfo = this.context.createOscillator();
      const lfoGain = this.context.createGain();
      oscillator.type = "triangle";
      oscillator.frequency.value = type === "heat" ? 650 : 390;
      lfo.frequency.value = type === "heat" ? 2.2 : 1.25;
      lfoGain.gain.value = 0.013;
      gain.gain.value = 0.016;
      lfo.connect(lfoGain).connect(gain.gain);
      oscillator.connect(gain).connect(this.master);
      oscillator.start(now);
      lfo.start(now);
      this.alarmOsc = oscillator;
      this.alarmGain = gain;
      this.alarmLfo = lfo;
      this.alarmType = type;
    },

    stopAlarm() {
      if (!this.alarmOsc) return;
      const now = this.context ? this.context.currentTime : 0;
      try {
        this.alarmGain.gain.cancelScheduledValues(now);
        this.alarmGain.gain.setTargetAtTime(0, now, 0.03);
        this.alarmOsc.stop(now + 0.2);
        this.alarmLfo.stop(now + 0.2);
      } catch {
        // Audio may already be stopped when the page is reset.
      }
      this.alarmOsc = null;
      this.alarmGain = null;
      this.alarmLfo = null;
      this.alarmType = null;
    },
  };

  function toggleDevice(id) {
    const device = deviceById(id);
    if (!device || device.locked || state.ended) return;
    audio.ensure();
    device.on = !device.on;
    state.operationCount += 1;
    if (device.id === "pump") {
      if (device.on) {
        state.pumpSurge = 4;
        state.surgePulse = 1;
        audio.playSurge();
        addLog("深海循环泵启动 · 浪涌 54 kW", "warn");
        showToast("泵组启动", "浪涌已注入总线，4 秒后回落");
      } else {
        state.pumpSurge = 0;
        audio.playSwitch(false);
        addLog("深海循环泵已关闭");
        showToast("负荷卸载", "循环泵 26.0 kW 已退出总线");
      }
    } else {
      audio.playSwitch(device.on);
      addLog(`${device.name} ${device.on ? "投入" : "退出"} · ${device.power.toFixed(1)} kW`);
      showToast("负荷切换", `${device.name}已${device.on ? "投入" : "退出"}，总负载 ${activeDevicePower().toFixed(1)} kW`);
    }
    updateUI();
  }

  function toggleFuel() {
    if (state.ended || state.fuelKwh <= 0.001) return;
    audio.ensure();
    state.fuelOn = !state.fuelOn;
    state.operationCount += 1;
    audio.playSwitch(state.fuelOn);
    addLog(`备用燃料电池 ${state.fuelOn ? "并网" : "脱网"}`, state.fuelOn ? "" : "warn");
    showToast(
      "能源分配",
      state.fuelOn ? "燃料电池并网，可分担最高 24.0 kW" : "燃料电池已脱网，电池负担上升"
    );
    updateUI();
  }

  function resetSimulation() {
    audio.stopAlarm();
    Object.assign(state, {
      running: true,
      ended: false,
      simTime: 0,
      speedIndex: 2,
      lastFrame: performance.now(),
      uiTimer: 0,
      batteryKwh: BATTERY_KWH * 0.64,
      batteryTemp: 37.5,
      batteryLimit: 38,
      fuelOn: false,
      fuelKwh: FUEL_KWH,
      stability: 100,
      overheatTime: 0,
      pumpSurge: 0,
      surgePulse: 0,
      deficit: 0,
      load: 0,
      tidal: 0,
      fuelOutput: 0,
      batteryOutput: 0,
      batteryCharge: 0,
      flow: 0,
      operationCount: 0,
      logs: [],
      wasDeficit: false,
      wasHot: false,
    });
    devices.forEach((device, index) => {
      device.on = DEVICE_DEFS[index].on;
    });
    $("batteryLimit").value = "38";
    $("batteryLimitValue").textContent = "38 kW";
    $("resultModal").hidden = true;
    $("pauseButton").classList.remove("paused");
    $("canvasAlert").classList.remove("visible");
    $("eventToast").classList.remove("visible");
    document.querySelector(".fuel-card").classList.remove("active");
    renderLoadList();
    addLog("系统上线 · 主电池初始储备 64%");
    addLog("负荷总线就绪 · 低流速工况");
    updateUI(true);
    showToast("值班开始", "低流速导致出力不足，请分配备用电源");
  }

  function bindControls() {
    $("loadList").addEventListener("click", (event) => {
      const button = event.target.closest(".load-toggle");
      if (!button) return;
      const row = button.closest(".load-row");
      if (row) toggleDevice(row.dataset.device);
    });

    $("fuelToggle").addEventListener("click", toggleFuel);

    $("batteryLimit").addEventListener("input", (event) => {
      state.batteryLimit = Number(event.target.value);
      $("batteryLimitValue").textContent = `${state.batteryLimit} kW`;
      updateUI();
    });

    $("batteryLimit").addEventListener("change", (event) => {
      if (state.ended) return;
      state.operationCount += 1;
      addLog(`电池放电上限设为 ${event.target.value} kW`);
      showToast("能源分配", `电池放电上限调整为 ${event.target.value} kW`);
    });

    $("pauseButton").addEventListener("click", () => {
      if (state.ended) return;
      audio.ensure();
      state.running = !state.running;
      state.lastFrame = performance.now();
      $("pauseButton").classList.toggle("paused", !state.running);
      showToast("时流控制", state.running ? "模拟继续" : "模拟已暂停");
    });

    $("speedButton").addEventListener("click", () => {
      if (state.ended) return;
      audio.ensure();
      state.speedIndex = (state.speedIndex + 1) % SPEEDS.length;
      updateUI();
      showToast("时流控制", `模拟速度切换为 ×${currentSpeed()}`);
    });

    $("audioButton").addEventListener("click", () => {
      const ready = audio.ensure();
      if (!ready) return;
      audio.setMuted(!audio.muted);
      const muted = audio.muted;
      $("audioButton").classList.toggle("muted", muted);
      $("audioButton").setAttribute("aria-label", muted ? "开启环境音频" : "关闭环境音频");
      $("audioButton").title = muted ? "开启环境音频" : "关闭环境音频";
      if (muted) audio.stopAlarm();
      else {
        if (state.deficit > 0.4) audio.alarm("deficit");
        else if (state.batteryTemp >= HEAT_CRITICAL) audio.alarm("heat");
      }
    });

    $("restartButton").addEventListener("click", resetSimulation);
    $("resultRestart").addEventListener("click", resetSimulation);

    window.addEventListener("keydown", (event) => {
      if (event.code === "Space" && !event.target.matches("input, button")) {
        event.preventDefault();
        $("pauseButton").click();
      }
    });

    if ("ResizeObserver" in window) {
      const observer = new ResizeObserver(resizeCanvas);
      observer.observe(canvas.parentElement);
    } else {
      window.addEventListener("resize", resizeCanvas);
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const realDelta = Math.min(0.15, Math.max(0, (now - state.lastFrame) / 1000));
    state.lastFrame = now;

    if (state.running && !state.ended) {
      let simulatedTime = realDelta * currentSpeed();
      while (simulatedTime > 0 && !state.ended) {
        const step = Math.min(0.5, simulatedTime);
        updateSimulation(step);
        simulatedTime -= step;
      }
    }

    drawScene(state.simTime * 1000 + 1800);

    if (now - state.uiTimer > 90) {
      updateUI();
      audio.update(state);
      state.uiTimer = now;
    }
  }

  function init() {
    $("audioButton").classList.add("muted");
    resizeCanvas();
    renderLoadList();
    bindControls();
    addLog("系统上线 · 主电池初始储备 64%");
    addLog("负荷总线就绪 · 低流速工况");
    updateUI(true);
    showToast("值班开始", "低流速导致出力不足，请分配备用电源");
    state.lastFrame = performance.now();
    requestAnimationFrame(frame);
  }

  init();
})();
