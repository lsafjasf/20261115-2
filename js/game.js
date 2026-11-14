(function () {
  "use strict";

  const { clamp, lerp, dist, angleDelta, TAU } = window.WorldMath;
  const W = 1600;
  const H = 900;

  class DroneGame {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.world = new window.MissionWorld();
      this.audio = new window.StormAudio();
      this.state = "ready";
      this.time = 0;
      this.elapsed = 0;
      this.last = performance.now() / 1000;
      this.messageTimer = 0;
      this.keys = new Set();
      this.trail = [];
      this.trailClock = 0;
      this.uiClock = 0;
      this.shake = 0;
      this.flash = 0;
      this.completed = false;
      this.buoys = [];
      this.deployments = 0;
      this.accuracySamples = [];
      this.lastWind = { x: 0, y: 0, speed: 0, angle: 0, ring: 0 };
      this.lastRain = 0;
      this.drone = this.newDrone();
      this.cacheDom();
      this.bindEvents();
      this.resize();
      this.updateHud(true);
      requestAnimationFrame((t) => this.loop(t));
    }

    cacheDom() {
      const id = (name) => document.getElementById(name);
      this.dom = {
        startOverlay: id("start-overlay"),
        resultOverlay: id("result-overlay"),
        startButton: id("start-button"),
        restartButton: id("restart-button"),
        pauseCard: id("pause-card"),
        clock: id("clock"),
        batteryValue: id("battery-value"),
        batteryBar: id("battery-bar"),
        speedValue: id("speed-value"),
        altitudeValue: id("altitude-value"),
        windValue: id("wind-value"),
        powerNote: id("power-note"),
        deployCount: id("deploy-count"),
        objectiveList: id("objective-list"),
        returnChip: id("return-chip"),
        sensorState: id("sensor-state"),
        visibilityValue: id("visibility-value"),
        errorValue: id("error-value"),
        altitudeMarker: id("altitude-marker"),
        headingValue: id("heading-value"),
        message: id("message"),
        resultEyebrow: id("result-eyebrow"),
        resultTitle: id("result-title"),
        resultCopy: id("result-copy"),
        resultTime: id("result-time"),
        resultBattery: id("result-battery"),
        resultAccuracy: id("result-accuracy"),
        resultPanel: document.querySelector(".result-panel"),
        sensorRadar: id("sensor-radar"),
        compass: id("compass")
      };
      this.radarCtx = this.dom.sensorRadar.getContext("2d");
      this.compassCtx = this.dom.compass.getContext("2d");
    }

    newDrone() {
      return {
        x: this.world.base.x,
        y: 716,
        heading: -Math.PI / 2,
        altitude: 360,
        airspeed: 96,
        battery: 100,
        visualPitch: 0,
        propPhase: 0
      };
    }

    bindEvents() {
      window.addEventListener("resize", () => this.resize());
      window.addEventListener("keydown", (event) => this.onKeyDown(event));
      window.addEventListener("keyup", (event) => this.onKeyUp(event));
      window.addEventListener("blur", () => {
        this.keys.clear();
        if (this.state === "playing") this.togglePause();
      });
      this.dom.startButton.addEventListener("click", () => this.startMission());
      this.dom.restartButton.addEventListener("click", () => this.resetMission());
    }

    resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.canvas.width = Math.round(window.innerWidth * dpr);
      this.canvas.height = Math.round(window.innerHeight * dpr);
      this.canvas.style.width = `${window.innerWidth}px`;
      this.canvas.style.height = `${window.innerHeight}px`;
      this.dpr = dpr;
      this.scale = Math.max(window.innerWidth / W, window.innerHeight / H);
      this.offsetX = (window.innerWidth - W * this.scale) / 2;
      this.offsetY = (window.innerHeight - H * this.scale) / 2;
    }

    onKeyDown(event) {
      const key = event.key.toLowerCase();
      if (["arrowleft", "arrowright", "arrowup", "arrowdown", " "].includes(key)) event.preventDefault();
      if (key === "p" && (this.state === "playing" || this.state === "paused")) {
        this.togglePause();
        return;
      }
      if (key === "m") {
        const muted = this.audio.toggleMute();
        this.showMessage(muted ? "音频已静音" : "音频已开启", "");
      }
      if (this.state !== "playing") return;
      if (key === " " && !event.repeat) this.dropBuoy();
      this.keys.add(key);
    }

    onKeyUp(event) {
      this.keys.delete(event.key.toLowerCase());
    }

    async startMission() {
      if (this.state !== "ready") return;
      await this.audio.start();
      this.state = "playing";
      this.dom.startOverlay.classList.remove("visible");
      this.showMessage("链路建立 · 前往 ALPHA 海域", "good");
    }

    resetMission() {
      this.state = "playing";
      this.time = 0;
      this.elapsed = 0;
      this.drone = this.newDrone();
      this.world.targets.forEach((target) => { target.status = "pending"; });
      this.buoys = [];
      this.deployments = 0;
      this.accuracySamples = [];
      this.trail = [];
      this.completed = false;
      this.flash = 0;
      this.shake = 0;
      this.dom.resultOverlay.classList.remove("visible");
      this.updateHud(true);
      this.showMessage("任务重置 · 前往 ALPHA 海域", "good");
    }

    togglePause() {
      if (this.state === "playing") {
        this.state = "paused";
        this.dom.pauseCard.classList.add("show");
      } else if (this.state === "paused") {
        this.state = "playing";
        this.dom.pauseCard.classList.remove("show");
      }
    }

    showMessage(text, kind = "") {
      this.dom.message.textContent = text;
      this.dom.message.className = `message show ${kind}`;
      this.messageTimer = 2.8;
    }

    loop(timestamp) {
      const now = timestamp / 1000;
      const dt = Math.min(0.04, Math.max(0, now - this.last));
      this.last = now;
      this.time += dt;
      if (this.state === "playing") this.update(dt);
      else if (this.state === "ready") this.world.update(dt, this.time, this.drone.altitude);
      if (this.messageTimer > 0) {
        this.messageTimer -= dt;
        if (this.messageTimer <= 0) this.dom.message.classList.remove("show");
      }
      this.render(dt);
      requestAnimationFrame((t) => this.loop(t));
    }

    update(dt) {
      this.elapsed += dt;
      const drone = this.drone;
      const turn = (this.keys.has("d") || this.keys.has("arrowright") ? 1 : 0)
        - (this.keys.has("a") || this.keys.has("arrowleft") ? 1 : 0);
      const climb = (this.keys.has("w") || this.keys.has("arrowup") ? 1 : 0)
        - (this.keys.has("s") || this.keys.has("arrowdown") ? 1 : 0);

      drone.heading += turn * 1.65 * dt;
      drone.altitude = clamp(drone.altitude + climb * 135 * dt, 80, 600);
      drone.visualPitch = lerp(drone.visualPitch, turn * -0.2, dt * 5);
      drone.propPhase += dt * (26 + drone.airspeed * 0.08);

      const wind = this.world.windAt(drone.x, drone.y, this.time, drone.altitude);
      const rain = this.world.rainAt(drone.x, drone.y, this.time);
      this.lastWind = wind;
      this.lastRain = rain;
      const sin = Math.sin(drone.heading);
      const cos = Math.cos(drone.heading);
      const flightX = cos * drone.airspeed;
      const flightY = sin * drone.airspeed;
      const push = 0.82;
      drone.x += (flightX + wind.x * push) * dt;
      drone.y += (flightY + wind.y * push) * dt;
      drone.x = clamp(drone.x, 28, W - 28);
      drone.y = clamp(drone.y, 48, H - 35);

      const windAlong = wind.x * cos + wind.y * sin;
      const headwind = Math.max(0, -windAlong);
      const powerDraw = 0.2 + headwind * 0.028 + Math.max(0, drone.airspeed - 90) * 0.002;
      drone.battery = Math.max(0, drone.battery - powerDraw * dt);
      drone.powerDraw = powerDraw;

      this.trailClock += dt;
      if (this.trailClock >= 0.07) {
        this.trailClock = 0;
        this.trail.push({ x: drone.x, y: drone.y, alpha: 1 });
        if (this.trail.length > 46) this.trail.shift();
      }
      for (const point of this.trail) point.alpha -= dt * 0.42;
      this.trail = this.trail.filter((point) => point.alpha > 0.02);
      this.updateBuoys(dt);
      this.world.update(dt, this.time, drone.altitude);

      if (drone.battery <= 0) {
        this.failMission("电量耗尽，无人机失去动力。");
        return;
      }

      if (this.completed) {
        const home = dist(drone, this.world.base);
        if (home < this.world.base.r - 12) this.completeMission();
      }

      this.uiClock += dt;
      if (this.uiClock > 0.08) {
        this.uiClock = 0;
        this.updateHud();
      }
      this.audio.update({
        wind: wind.speed,
        rain,
        battery: drone.battery / 100,
        altitude: drone.altitude
      });
    }

    dropBuoy() {
      if (this.state !== "playing" || this.completed) return;
      if (this.buoys.some((buoy) => buoy.status === "falling")) {
        this.showMessage("浮标正在下降，等待落点确认", "bad");
        return;
      }
      const drone = this.drone;
      const wind = this.world.windAt(drone.x, drone.y, this.time, drone.altitude);
      const rain = this.world.rainAt(drone.x, drone.y, this.time);
      const sensorError = 2.2 + rain * 13 + Math.max(0, drone.altitude - 260) * 0.026;
      const errorAngle = Math.random() * TAU;
      const errorRadius = Math.random() * sensorError;
      const driftScale = 0.2 + drone.altitude / 540;
      const landingX = clamp(drone.x + wind.x * driftScale + Math.cos(errorAngle) * errorRadius, 20, W - 20);
      const landingY = clamp(drone.y + wind.y * driftScale + Math.sin(errorAngle) * errorRadius, 35, H - 25);
      const buoy = {
        id: this.buoys.length + 1,
        x: drone.x,
        y: drone.y,
        startX: drone.x,
        startY: drone.y,
        landingX,
        landingY,
        altitude: drone.altitude,
        status: "falling",
        progress: 0,
        fallDuration: 0.85 + drone.altitude / 500,
        sensorError,
        rain
      };
      this.buoys.push(buoy);
      this.shake = Math.max(this.shake, 2.5);
      this.audio.chime("drop");
      this.showMessage(`浮标 ${buoy.id} 已释放 · 设定误差 ±${Math.round(sensorError)} m`, "good");
    }

    updateBuoys(dt) {
      for (const buoy of this.buoys) {
        if (buoy.status !== "falling") continue;
        buoy.progress += dt / buoy.fallDuration;
        const t = clamp(buoy.progress, 0, 1);
        const ease = 1 - Math.pow(1 - t, 3);
        buoy.x = lerp(buoy.startX, buoy.landingX, ease);
        buoy.y = lerp(buoy.startY, buoy.landingY, ease);
        if (t >= 1) this.landBuoy(buoy);
      }
    }

    landBuoy(buoy) {
      let target = null;
      let targetDistance = Infinity;
      for (const candidate of this.world.targets) {
        if (candidate.status !== "pending") continue;
        const distance = dist(buoy, candidate);
        if (distance <= candidate.r && distance < targetDistance) {
          target = candidate;
          targetDistance = distance;
        }
      }
      if (!target) {
        buoy.status = "miss";
        this.audio.chime("miss");
        this.shake = 6;
        this.showMessage("落点偏离目标海域 · 任务失败", "bad");
        this.failMission("浮标未进入目标海域，本次任务中止。");
        return;
      }
      buoy.status = "hit";
      buoy.targetId = target.id;
      target.status = "done";
      target.hitDistance = targetDistance;
      this.deployments += 1;
      const accuracy = clamp(1 - targetDistance / target.r, 0, 1);
      this.accuracySamples.push(accuracy);
      this.flash = 0.45;
      this.audio.chime("hit");
      this.showMessage(`${target.label} 浮标入水 · 链路确认`, "good");
      if (this.deployments === 3) {
        this.completed = true;
        this.dom.returnChip.classList.add("ready");
        this.audio.chime("success");
        this.showMessage("三枚浮标部署完成 · 立即返航", "good");
      }
      this.updateHud(true);
    }

    failMission(reason) {
      if (this.state !== "playing") return;
      this.state = "failed";
      this.keys.clear();
      this.audio.chime("miss");
      this.dom.resultPanel.classList.add("failed");
      this.dom.resultEyebrow.textContent = "MISSION ABORTED";
      this.dom.resultTitle.textContent = "任务失败";
      this.dom.resultCopy.textContent = reason;
      this.dom.resultTime.textContent = this.formatTime(this.elapsed);
      this.dom.resultBattery.textContent = `${Math.ceil(this.drone.battery)}%`;
      this.dom.resultAccuracy.textContent = this.getAccuracyLabel();
      this.dom.resultOverlay.classList.add("visible");
    }

    completeMission() {
      if (this.state !== "playing") return;
      this.state = "complete";
      this.keys.clear();
      this.audio.chime("success");
      this.dom.resultPanel.classList.remove("failed");
      this.dom.resultEyebrow.textContent = "MISSION COMPLETE / ALL BUOYS RELAYING";
      this.dom.resultTitle.textContent = "任务成功";
      this.dom.resultCopy.textContent = "三枚浮标已进入目标海域，无人机安全返航。风暴数据链路保持在线。";
      this.dom.resultTime.textContent = this.formatTime(this.elapsed);
      this.dom.resultBattery.textContent = `${Math.ceil(this.drone.battery)}%`;
      this.dom.resultAccuracy.textContent = this.getAccuracyLabel();
      this.dom.resultOverlay.classList.add("visible");
      this.showMessage("返航完成 · 数据已回传", "good");
    }

    getAccuracyLabel() {
      if (!this.accuracySamples.length) return "0%";
      const average = this.accuracySamples.reduce((sum, value) => sum + value, 0) / this.accuracySamples.length;
      return `${Math.round(average * 100)}%`;
    }

    formatTime(seconds) {
      const mins = Math.floor(seconds / 60).toString().padStart(2, "0");
      const secs = Math.floor(seconds % 60).toString().padStart(2, "0");
      return `${mins}:${secs}`;
    }

    updateHud(force) {
      const drone = this.drone;
      const wind = this.lastWind || { speed: 0 };
      const rain = this.lastRain || 0;
      const sensorError = 2.2 + rain * 13 + Math.max(0, drone.altitude - 260) * 0.026;
      const visibility = clamp(100 - rain * 78, 12, 100);
      const battery = Math.ceil(drone.battery);
      const powerDraw = drone.powerDraw || 0.2;

      this.dom.clock.textContent = `T+ ${this.formatTime(this.elapsed)}`;
      this.dom.batteryValue.textContent = `${battery}%`;
      this.dom.batteryBar.style.transform = `scaleX(${drone.battery / 100})`;
      this.dom.batteryBar.style.background = battery < 22
        ? "linear-gradient(90deg, #b73d34, #ff705d)"
        : battery < 45
          ? "linear-gradient(90deg, #b17d2d, #ffc65c)"
          : "linear-gradient(90deg, #2cb8a7, #67f5d2)";
      this.dom.speedValue.textContent = Math.round(152 + wind.speed * 1.2);
      this.dom.altitudeValue.textContent = Math.round(drone.altitude);
      this.dom.windValue.textContent = wind.speed.toFixed(1);
      this.dom.visibilityValue.textContent = `${Math.round(visibility)}%`;
      this.dom.errorValue.textContent = `±${Math.round(sensorError)} m`;
      this.dom.deployCount.textContent = this.deployments;
      this.dom.altitudeMarker.style.top = `${100 - (drone.altitude - 80) / 520 * 100}%`;
      const bearing = ((drone.heading * 180 / Math.PI) + 90 + 360) % 360;
      this.dom.headingValue.textContent = `${Math.round(bearing).toString().padStart(3, "0")}°`;

      let powerText = "逆风功率储备正常";
      let powerClass = "";
      if (powerDraw > 0.42) {
        powerText = "强逆风 · 电量快速消耗";
        powerClass = "warn";
      }
      if (battery < 22) {
        powerText = "低电量 · 请立即返航";
        powerClass = "danger";
      }
      this.dom.powerNote.textContent = powerText;
      this.dom.powerNote.className = `power-note ${powerClass}`;

      let sensorText = "良好";
      if (rain > 0.52) sensorText = "受降水干扰";
      else if (rain > 0.27) sensorText = "轻度噪声";
      if (drone.altitude > 470) sensorText += " · 高空漂移";
      this.dom.sensorState.textContent = sensorText;
      this.dom.sensorState.style.color = rain > 0.52 || drone.altitude > 470 ? "#ffc65c" : "#67f5d2";

      const items = this.dom.objectiveList.querySelectorAll("li");
      items.forEach((item) => {
        const target = this.world.targets.find((entry) => entry.id === item.dataset.target);
        const active = !this.completed && target.status === "pending"
          && this.world.targets.filter((entry) => entry.status === "pending")[0] === target;
        item.classList.toggle("done", target.status === "done");
        item.classList.toggle("active", active);
        item.querySelector("em").textContent = target.status === "done"
          ? "已确认"
          : active ? "前往" : "等待";
      });
      this.dom.returnChip.classList.toggle("ready", this.completed);
      this.dom.returnChip.textContent = this.completed ? "返航平台 · 已解锁" : "返航平台 · 未解锁";
      this.drawRadar();
      this.drawCompass(bearing);
    }

    render(dt) {
      const ctx = this.ctx;
      const dpr = this.dpr;
      const shakeX = this.shake > 0 ? (Math.random() - 0.5) * this.shake : 0;
      const shakeY = this.shake > 0 ? (Math.random() - 0.5) * this.shake : 0;
      this.shake = Math.max(0, this.shake - dt * 16);
      ctx.setTransform(
        dpr * this.scale, 0, 0, dpr * this.scale,
        dpr * (this.offsetX + shakeX), dpr * (this.offsetY + shakeY)
      );
      ctx.clearRect(-100, -100, W + 200, H + 200);

      const altitude = this.drone.altitude;
      this.world.draw(ctx, this.time, dt, altitude);
      this.drawGridLabels(ctx);
      this.drawBase(ctx);
      this.drawTargets(ctx);
      this.drawGuidance(ctx);
      this.drawBuoys(ctx);
      this.drawTrail(ctx);
      this.drawDrone(ctx);
      this.drawStormEdges(ctx);
      this.drawScreenEffects(ctx);

      if (this.flash > 0) {
        ctx.fillStyle = `rgba(103, 245, 210, ${this.flash * 0.12})`;
        ctx.fillRect(0, 0, W, H);
        this.flash -= dt;
      }
    }

    drawGridLabels(ctx) {
      ctx.save();
      ctx.fillStyle = "rgba(129, 187, 181, .16)";
      ctx.font = "8px Bahnschrift, sans-serif";
      for (let x = 100; x < W; x += 100) {
        ctx.fillText(`${x}`, x + 4, H - 12);
      }
      for (let y = 100; y < H; y += 100) {
        ctx.fillText(`${y}`, 8, y - 4);
      }
      ctx.restore();
    }

    drawBase(ctx) {
      const { x, y, r } = this.world.base;
      const pulse = 0.5 + Math.sin(this.time * 1.6) * 0.5;
      ctx.save();
      ctx.translate(x, y);

      ctx.strokeStyle = "rgba(103, 245, 210, .13)";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 8]);
      ctx.beginPath();
      ctx.arc(0, 0, r + 23, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);

      const pad = ctx.createRadialGradient(0, 0, 8, 0, 0, r);
      pad.addColorStop(0, "rgba(44, 90, 89, .44)");
      pad.addColorStop(0.67, "rgba(15, 46, 51, .52)");
      pad.addColorStop(1, "rgba(4, 20, 25, .1)");
      ctx.fillStyle = pad;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, TAU);
      ctx.fill();

      ctx.strokeStyle = `rgba(103, 245, 210, ${0.34 + pulse * 0.15})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, TAU);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, r - 8, 0.15, Math.PI * 0.85);
      ctx.stroke();

      for (let i = 0; i < 8; i += 1) {
        const angle = i * TAU / 8 + this.time * 0.05;
        const light = 0.35 + Math.sin(this.time * 2.2 + i) * 0.3;
        ctx.fillStyle = `rgba(255, 198, 92, ${light})`;
        ctx.beginPath();
        ctx.arc(Math.cos(angle) * (r - 4), Math.sin(angle) * (r - 4), 2, 0, TAU);
        ctx.fill();
      }

      ctx.strokeStyle = "rgba(234, 247, 240, .3)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-22, 0);
      ctx.lineTo(22, 0);
      ctx.moveTo(0, -22);
      ctx.lineTo(0, 22);
      ctx.stroke();
      ctx.fillStyle = "rgba(214, 238, 232, .45)";
      ctx.font = "9px Bahnschrift, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("HOME / 07", 0, r + 40);
      ctx.restore();
    }

    drawTargets(ctx) {
      const active = this.world.targets.find((target) => target.status === "pending");
      for (const target of this.world.targets) {
        const isActive = !this.completed && target === active;
        const done = target.status === "done";
        const color = done ? "103, 245, 210" : isActive ? "255, 198, 92" : "135, 189, 185";
        const pulse = 0.5 + Math.sin(this.time * 2.1 + target.x * 0.01) * 0.5;
        ctx.save();
        ctx.translate(target.x, target.y);

        ctx.fillStyle = `rgba(${color}, ${isActive ? 0.07 : 0.035})`;
        ctx.beginPath();
        ctx.arc(0, 0, target.r, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = `rgba(${color}, ${done ? 0.7 : isActive ? 0.7 : 0.25})`;
        ctx.lineWidth = isActive ? 1.6 : 1;
        ctx.beginPath();
        ctx.arc(0, 0, target.r, 0, TAU);
        ctx.stroke();

        ctx.setLineDash([6, 7]);
        ctx.lineDashOffset = -this.time * (done ? 0 : 12);
        ctx.strokeStyle = `rgba(${color}, ${done ? 0.4 : isActive ? 0.58 : 0.16})`;
        ctx.beginPath();
        ctx.arc(0, 0, target.r + 10 + pulse * 3, 0, TAU);
        ctx.stroke();
        ctx.setLineDash([]);

        if (isActive) {
          ctx.strokeStyle = `rgba(255, 198, 92, ${0.08 + pulse * 0.12})`;
          ctx.beginPath();
          ctx.arc(0, 0, target.r + 25 + pulse * 20, 0, TAU);
          ctx.stroke();
          ctx.fillStyle = "rgba(255, 198, 92, .78)";
          ctx.font = "9px Bahnschrift, sans-serif";
          ctx.textAlign = "center";
          ctx.fillText(target.label, 0, -target.r - 22);
        }

        ctx.strokeStyle = `rgba(${color}, ${done ? 0.8 : 0.42})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(-10, 0);
        ctx.lineTo(-3, 0);
        ctx.moveTo(10, 0);
        ctx.lineTo(3, 0);
        ctx.moveTo(0, -10);
        ctx.lineTo(0, -3);
        ctx.moveTo(0, 10);
        ctx.lineTo(0, 3);
        ctx.stroke();
        ctx.restore();
      }
    }

    drawGuidance(ctx) {
      const pending = this.world.targets.find((target) => target.status === "pending");
      const goal = this.completed ? this.world.base : pending;
      if (!goal || this.state === "ready") return;
      const drone = this.drone;
      const distance = dist(drone, goal);
      ctx.save();
      ctx.strokeStyle = this.completed ? "rgba(103, 245, 210, .25)" : "rgba(255, 198, 92, .22)";
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 9]);
      ctx.lineDashOffset = -this.time * 10;
      ctx.beginPath();
      ctx.moveTo(drone.x, drone.y);
      ctx.lineTo(goal.x, goal.y);
      ctx.stroke();
      ctx.setLineDash([]);

      const t = 0.5;
      const labelX = lerp(drone.x, goal.x, t);
      const labelY = lerp(drone.y, goal.y, t) - 8;
      ctx.fillStyle = "rgba(5, 20, 25, .68)";
      ctx.fillRect(labelX - 34, labelY - 11, 68, 17);
      ctx.fillStyle = this.completed ? "#67f5d2" : "#ffc65c";
      ctx.font = "8px Bahnschrift, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(`${Math.round(distance * 2.4)} m`, labelX, labelY + 1);
      ctx.restore();
    }

    drawBuoys(ctx) {
      for (const buoy of this.buoys) {
        ctx.save();
        if (buoy.status === "falling") {
          const shadowX = buoy.landingX;
          const shadowY = buoy.landingY;
          ctx.strokeStyle = "rgba(255, 198, 92, .22)";
          ctx.setLineDash([2, 4]);
          ctx.beginPath();
          ctx.moveTo(buoy.x, buoy.y);
          ctx.lineTo(shadowX, shadowY);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = "rgba(5, 16, 20, .45)";
          ctx.beginPath();
          ctx.ellipse(shadowX, shadowY, 9, 4, 0, 0, TAU);
          ctx.fill();
          ctx.translate(buoy.x, buoy.y);
          ctx.strokeStyle = "rgba(255, 198, 92, .6)";
          ctx.beginPath();
          ctx.arc(0, 0, 9, Math.PI, 0);
          ctx.stroke();
          ctx.fillStyle = "#ffc65c";
          ctx.fillRect(-2.5, -4, 5, 9);
        } else {
          ctx.translate(buoy.x, buoy.y);
          const color = buoy.status === "hit" ? "103, 245, 210" : "255, 112, 93";
          const pulse = 0.5 + Math.sin(this.time * 3 + buoy.id) * 0.5;
          ctx.strokeStyle = `rgba(${color}, ${0.23 + pulse * 0.17})`;
          ctx.beginPath();
          ctx.arc(0, 0, 12 + pulse * 8, 0, TAU);
          ctx.stroke();
          ctx.fillStyle = `rgb(${color})`;
          ctx.beginPath();
          ctx.arc(0, 0, 3.5, 0, TAU);
          ctx.fill();
          ctx.strokeStyle = `rgba(${color}, .8)`;
          ctx.beginPath();
          ctx.moveTo(-8, 0);
          ctx.lineTo(-4, 0);
          ctx.moveTo(8, 0);
          ctx.lineTo(4, 0);
          ctx.stroke();
        }
        ctx.restore();
      }
    }

    drawTrail(ctx) {
      if (this.trail.length < 2) return;
      ctx.save();
      ctx.lineCap = "round";
      for (let i = 1; i < this.trail.length; i += 1) {
        const a = this.trail[i - 1];
        const b = this.trail[i];
        const alpha = Math.max(0, b.alpha);
        ctx.strokeStyle = `rgba(103, 245, 210, ${alpha * 0.18})`;
        ctx.lineWidth = 1 + alpha * 1.2;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      ctx.restore();
    }

    drawDrone(ctx) {
      const drone = this.drone;
      const wind = this.world.windAt(drone.x, drone.y, this.time, drone.altitude);
      const scale = 1 + (drone.altitude - 80) / 680;
      ctx.save();

      ctx.fillStyle = "rgba(0, 8, 11, .28)";
      ctx.beginPath();
      ctx.ellipse(
        drone.x + wind.x * 0.28 + 12,
        drone.y + wind.y * 0.28 + 15,
        25 * scale, 11 * scale, drone.heading, 0, TAU
      );
      ctx.fill();

      ctx.translate(drone.x, drone.y);
      ctx.rotate(drone.heading + Math.PI / 2);
      ctx.scale(scale, scale);

      ctx.fillStyle = "rgba(8, 23, 27, .95)";
      ctx.strokeStyle = "rgba(165, 238, 224, .8)";
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(0, -23);
      ctx.lineTo(8, -8);
      ctx.lineTo(27, 2);
      ctx.lineTo(27, 7);
      ctx.lineTo(7, 5);
      ctx.lineTo(5, 16);
      ctx.lineTo(12, 23);
      ctx.lineTo(5, 23);
      ctx.lineTo(0, 17);
      ctx.lineTo(-5, 23);
      ctx.lineTo(-12, 23);
      ctx.lineTo(-5, 16);
      ctx.lineTo(-7, 5);
      ctx.lineTo(-27, 7);
      ctx.lineTo(-27, 2);
      ctx.lineTo(-8, -8);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "rgba(16, 47, 49, .95)";
      ctx.beginPath();
      ctx.ellipse(0, 2, 8, 21, 0, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = "rgba(103, 245, 210, .45)";
      ctx.stroke();

      ctx.fillStyle = "#ffc65c";
      ctx.beginPath();
      ctx.moveTo(0, -20);
      ctx.lineTo(3, -13);
      ctx.lineTo(-3, -13);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "rgba(255, 198, 92, .3)";
      ctx.beginPath();
      ctx.arc(0, -15, 8, 0, TAU);
      ctx.fill();

      for (const rotor of [[-24, 4], [24, 4], [-10, 15], [10, 15]]) {
        ctx.strokeStyle = "rgba(192, 239, 230, .5)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.ellipse(rotor[0], rotor[1], 8, 8, 0, 0, TAU);
        ctx.stroke();
        ctx.strokeStyle = "rgba(192, 239, 230, .22)";
        ctx.beginPath();
        ctx.moveTo(rotor[0] - 7, rotor[1]);
        ctx.lineTo(rotor[0] + 7, rotor[1]);
        ctx.stroke();
      }

      ctx.save();
      ctx.rotate(drone.propPhase * 0.4);
      ctx.strokeStyle = "rgba(219, 255, 246, .34)";
      ctx.beginPath();
      ctx.arc(0, 0, 30, 0, Math.PI);
      ctx.stroke();
      ctx.restore();

      const lightOn = Math.sin(this.time * 7) > 0;
      ctx.fillStyle = lightOn ? "#ff705d" : "rgba(255, 112, 93, .18)";
      ctx.beginPath();
      ctx.arc(-26, 4, 2.2, 0, TAU);
      ctx.fill();
      ctx.fillStyle = lightOn ? "#67f5d2" : "rgba(103, 245, 210, .18)";
      ctx.beginPath();
      ctx.arc(26, 4, 2.2, 0, TAU);
      ctx.fill();
      ctx.restore();

      ctx.save();
      const reticleColor = this.lastRain > 0.4 ? "rgba(255, 198, 92, .48)" : "rgba(103, 245, 210, .38)";
      ctx.strokeStyle = reticleColor;
      ctx.lineWidth = 1;
      const r = 39;
      for (let i = 0; i < 4; i += 1) {
        const angle = i * Math.PI / 2;
        ctx.beginPath();
        ctx.moveTo(drone.x + Math.cos(angle) * r, drone.y + Math.sin(angle) * r);
        ctx.lineTo(drone.x + Math.cos(angle) * (r + 6), drone.y + Math.sin(angle) * (r + 6));
        ctx.stroke();
      }
      ctx.restore();
    }

    drawStormEdges(ctx) {
      ctx.save();
      const edge = ctx.createRadialGradient(
        this.world.core.x, this.world.core.y, 280,
        this.world.core.x, this.world.core.y, 960
      );
      edge.addColorStop(0, "rgba(128, 168, 169, 0)");
      edge.addColorStop(0.56, "rgba(126, 163, 165, 0)");
      edge.addColorStop(0.78, `rgba(126, 163, 165, ${this.lastRain * 0.035})`);
      edge.addColorStop(1, "rgba(5, 17, 22, .1)");
      ctx.fillStyle = edge;
      ctx.fillRect(0, 0, W, H);

      const sweepAngle = this.time * 0.09;
      ctx.translate(this.world.core.x, this.world.core.y);
      ctx.rotate(sweepAngle);
      const beam = ctx.createLinearGradient(0, 0, 570, 0);
      beam.addColorStop(0, "rgba(145, 205, 199, 0)");
      beam.addColorStop(0.8, "rgba(145, 205, 199, .025)");
      beam.addColorStop(1, "rgba(145, 205, 199, 0)");
      ctx.fillStyle = beam;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, 570, -0.12, 0.12);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    drawScreenEffects(ctx) {
      const rain = this.lastRain;
      if (this.state === "playing" || this.state === "ready") {
        ctx.save();
        const veil = ctx.createRadialGradient(W * 0.52, H * 0.48, 220, W * 0.52, H * 0.48, 900);
        veil.addColorStop(0, "rgba(2, 11, 15, 0)");
        veil.addColorStop(1, `rgba(2, 11, 15, ${0.18 + rain * 0.18})`);
        ctx.fillStyle = veil;
        ctx.fillRect(0, 0, W, H);

        if (rain > 0.35) {
          ctx.fillStyle = `rgba(130, 174, 179, ${(rain - 0.35) * 0.08})`;
          for (let i = 0; i < 16; i += 1) {
            const x = (i * 113 + this.time * 55) % W;
            const y = (i * 61 + this.time * 190) % H;
            ctx.fillRect(x, y, 1.2, 18 + (i % 4) * 7);
          }
        }
        ctx.restore();
      }

      if (this.drone.battery < 22) {
        const pulse = 0.5 + Math.sin(this.time * 4.2) * 0.5;
        const warning = ctx.createRadialGradient(W * 0.52, H * 0.5, 320, W * 0.52, H * 0.5, 880);
        warning.addColorStop(0, "rgba(255, 68, 48, 0)");
        warning.addColorStop(1, `rgba(255, 68, 48, ${0.04 + pulse * 0.08})`);
        ctx.fillStyle = warning;
        ctx.fillRect(0, 0, W, H);
      }

      if (this.state === "playing" && this.lastWind.speed > 27) {
        ctx.save();
        ctx.strokeStyle = "rgba(139, 228, 215, .08)";
        ctx.lineWidth = 2;
        for (let i = 0; i < 4; i += 1) {
          const y = 220 + i * 118;
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.bezierCurveTo(420, y - 30, 980, y + 28, W, y - 10);
          ctx.stroke();
        }
        ctx.restore();
      }
    }

    drawRadar() {
      const ctx = this.radarCtx;
      const size = 176;
      const center = size / 2;
      ctx.clearRect(0, 0, size, size);
      ctx.save();
      ctx.beginPath();
      ctx.arc(center, center, 82, 0, TAU);
      ctx.clip();
      ctx.fillStyle = "rgba(3, 20, 24, .82)";
      ctx.fillRect(0, 0, size, size);

      const gradient = ctx.createRadialGradient(center, center, 5, center, center, 82);
      gradient.addColorStop(0, "rgba(27, 100, 92, .22)");
      gradient.addColorStop(1, "rgba(2, 19, 23, .2)");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, size, size);

      ctx.strokeStyle = "rgba(103, 245, 210, .13)";
      ctx.lineWidth = 1;
      for (const r of [25, 51, 78]) {
        ctx.beginPath();
        ctx.arc(center, center, r, 0, TAU);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(center, 4);
      ctx.lineTo(center, size - 4);
      ctx.moveTo(4, center);
      ctx.lineTo(size - 4, center);
      ctx.stroke();

      const sweep = this.time * 1.1;
      const sweepGradient = ctx.createLinearGradient(center, center, center + 80, center);
      sweepGradient.addColorStop(0, "rgba(103, 245, 210, 0)");
      sweepGradient.addColorStop(1, "rgba(103, 245, 210, .13)");
      ctx.fillStyle = sweepGradient;
      ctx.beginPath();
      ctx.moveTo(center, center);
      ctx.arc(center, center, 80, sweep - 0.48, sweep);
      ctx.closePath();
      ctx.fill();

      const drone = this.drone;
      for (const target of this.world.targets) {
        const dx = (target.x - drone.x) * 0.16;
        const dy = (target.y - drone.y) * 0.16;
        if (Math.hypot(dx, dy) > 76) continue;
        const done = target.status === "done";
        ctx.fillStyle = done ? "#67f5d2" : "rgba(255, 198, 92, .85)";
        ctx.beginPath();
        ctx.arc(center + dx, center + dy, done ? 2.7 : 3.4, 0, TAU);
        ctx.fill();
        if (done) {
          ctx.strokeStyle = "rgba(103, 245, 210, .25)";
          ctx.beginPath();
          ctx.arc(center + dx, center + dy, 6, 0, TAU);
          ctx.stroke();
        }
      }

      if (this.lastRain > 0.35) {
        ctx.fillStyle = `rgba(154, 204, 207, ${this.lastRain * 0.22})`;
        for (let i = 0; i < 18; i += 1) {
          const a = Math.random() * TAU;
          const r = Math.random() * 75;
          ctx.fillRect(center + Math.cos(a) * r, center + Math.sin(a) * r, 1, 5);
        }
      }

      const bearing = drone.heading;
      ctx.translate(center, center);
      ctx.rotate(bearing + Math.PI / 2);
      ctx.fillStyle = "#e4f4ef";
      ctx.beginPath();
      ctx.moveTo(0, -7);
      ctx.lineTo(4.5, 5);
      ctx.lineTo(0, 3);
      ctx.lineTo(-4.5, 5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      ctx.strokeStyle = "rgba(103, 245, 210, .35)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(center, center, 82, 0, TAU);
      ctx.stroke();
      ctx.fillStyle = "rgba(103, 245, 210, .6)";
      ctx.font = "8px Bahnschrift, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("N", center, 11);
      ctx.fillText("S", center, size - 4);
      ctx.fillText("E", size - 5, center + 3);
      ctx.fillText("W", 5, center + 3);
    }

    drawCompass(bearing) {
      const ctx = this.compassCtx;
      const size = 190;
      const center = size / 2;
      ctx.clearRect(0, 0, size, size);
      ctx.save();
      ctx.translate(center, center);
      ctx.strokeStyle = "rgba(142, 207, 199, .19)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, 0, 61, 0, TAU);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, 70, 0.25, Math.PI - 0.25);
      ctx.stroke();

      for (let i = 0; i < 36; i += 1) {
        const angle = i * TAU / 36 - Math.PI / 2;
        const major = i % 9 === 0;
        ctx.strokeStyle = major ? "rgba(187, 229, 222, .45)" : "rgba(142, 207, 199, .16)";
        ctx.beginPath();
        ctx.moveTo(Math.cos(angle) * 57, Math.sin(angle) * 57);
        ctx.lineTo(Math.cos(angle) * (major ? 68 : 63), Math.sin(angle) * (major ? 68 : 63));
        ctx.stroke();
      }
      ctx.fillStyle = "rgba(170, 211, 205, .55)";
      ctx.font = "8px Bahnschrift, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("N", 0, -77);
      ctx.fillText("E", 78, 0);
      ctx.fillText("S", 0, 77);
      ctx.fillText("W", -78, 0);

      ctx.rotate((bearing * Math.PI) / 180);
      ctx.fillStyle = "#ffc65c";
      ctx.beginPath();
      ctx.moveTo(0, -49);
      ctx.lineTo(6, -25);
      ctx.lineTo(0, -29);
      ctx.lineTo(-6, -25);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(255, 198, 92, .2)";
      ctx.beginPath();
      ctx.moveTo(0, -24);
      ctx.lineTo(0, 18);
      ctx.stroke();
      ctx.restore();
    }

    getSnapshot() {
      const active = this.world.targets.find((target) => target.status === "pending") || null;
      const goal = this.completed ? this.world.base : active;
      return {
        state: this.state,
        time: this.elapsed,
        drone: {
          x: this.drone.x,
          y: this.drone.y,
          heading: this.drone.heading,
          altitude: this.drone.altitude,
          battery: this.drone.battery
        },
        targets: this.world.targets.map((target) => ({
          id: target.id,
          x: target.x,
          y: target.y,
          r: target.r,
          status: target.status
        })),
        activeTarget: active ? { id: active.id, x: active.x, y: active.y, r: active.r } : null,
        goal: goal ? { x: goal.x, y: goal.y, r: goal.r } : null,
        deployments: this.deployments,
        completed: this.completed,
        rain: this.lastRain,
        wind: this.lastWind.speed,
        sensorError: 2.2 + this.lastRain * 13 + Math.max(0, this.drone.altitude - 260) * 0.026
      };
    }
  }

  window.addEventListener("DOMContentLoaded", () => {
    const game = new DroneGame(document.getElementById("game"));
    window.__droneGame = game;
  });
}());
