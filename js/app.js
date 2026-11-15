import {
  SURVEY_SPEC,
  bearingBetween,
  clamp,
  computeReturns,
  distanceBetween,
  generateSurvey,
  moveListener,
  normalizeDeg,
  resolvePlot
} from "./sonar-core.js";
import { SonarAudio } from "./audio.js";
import { ScopeRenderer, WaveRenderer } from "./renderers.js";

const $ = (selector) => document.querySelector(selector);
const $all = (selector) => [...document.querySelectorAll(selector)];

class BlackwaterGame {
  constructor() {
    this.audio = new SonarAudio();
    this.scope = new ScopeRenderer($("#scopeCanvas"));
    this.wave = new WaveRenderer($("#waveCanvas"));
    this.dom = {
      entry: $("#entryScreen"),
      success: $("#successScreen"),
      dive: $("#diveButton"),
      again: $("#againButton"),
      ping: $("#pingButton"),
      undo: $("#undoButton"),
      slider: $("#angleSlider"),
      angleDown: $("#angleDown"),
      angleUp: $("#angleUp"),
      angleReadout: $("#angleReadout"),
      obstacleCount: $("#obstacleCount"),
      beaconCount: $("#beaconCount"),
      pingsLeft: $("#pingsLeft"),
      pips: $("#powerPips"),
      heatValue: $("#heatValue"),
      heatFill: $("#heatFill"),
      heatHint: $("#heatHint"),
      heatCard: $(".heat-card"),
      coordX: $("#coordX"),
      coordY: $("#coordY"),
      hover: $("#hoverReadout"),
      logLine: $("#logLine"),
      logClock: $("#logClock"),
      status: $("#statusText"),
      statusDot: $("#statusDot"),
      audioBadge: $("#audioBadge"),
      overheat: $("#overheatFlash"),
      leftMeter: $("#leftMeter"),
      rightMeter: $("#rightMeter"),
      successPings: $("#successPings"),
      gain: $("#gainValue")
    };
    this.started = false;
    this.scanning = false;
    this.overheated = false;
    this.overheatUntil = 0;
    this.keys = new Set();
    this.hover = null;
    this.stereoPulse = null;
    this.signature = "obstacle";
    this.lastFrame = performance.now();
    this.bootTime = Date.now();
    this.resetSurvey(384, false);
    this.bindEvents();
    this.renderPips();
    this.updateInterface();
    requestAnimationFrame((time) => this.loop(time));
  }

  resetSurvey(seed = 384, announce = true) {
    this.targets = generateSurvey(seed);
    this.listener = { x: 0, y: 0 };
    this.angle = 15;
    this.pingsLeft = SURVEY_SPEC.pingLimit;
    this.heat = 8;
    this.markers = [];
    this.claimed = new Set();
    this.pings = [];
    this.lastEchoes = [];
    this.lastPingAt = 0;
    this.lastPingWall = 0;
    this.overheated = false;
    this.overheatUntil = 0;
    this.stereoPulse = null;
    this.setAngle(15);
    this.renderPips();
    this.renderCounts();
    if (announce) {
      this.log("New survey seeded. Acoustic field reinitialized.");
      this.dom.status.textContent = "AWAITING TRANSMISSION";
      this.dom.success.hidden = true;
    }
  }

  bindEvents() {
    this.dom.dive.addEventListener("click", () => this.startDive());
    this.dom.again.addEventListener("click", () => {
      this.resetSurvey(Math.floor(Date.now() / 7) % 900000, true);
      this.dom.statusDot.classList.add("on");
      this.dom.status.textContent = "SONAR ACTIVE";
      this.updateInterface();
    });
    this.dom.slider.addEventListener("input", (event) => this.setAngle(Number(event.target.value)));
    this.dom.angleDown.addEventListener("click", () => this.setAngle(this.angle - 5));
    this.dom.angleUp.addEventListener("click", () => this.setAngle(this.angle + 5));
    this.dom.undo.addEventListener("click", () => this.undoTrace());
    $all(".signature-btn").forEach((button) => {
      button.addEventListener("click", () => {
        this.signature = button.dataset.signature;
        $all(".signature-btn").forEach((item) => item.classList.toggle("active", item === button));
      });
    });

    this.dom.ping.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      this.dom.ping.setPointerCapture?.(event.pointerId);
      this.scanning = true;
      this.ping();
    });
    const releaseTransmit = () => {
      this.scanning = false;
      this.dom.ping.classList.remove("firing");
    };
    this.dom.ping.addEventListener("pointerup", releaseTransmit);
    this.dom.ping.addEventListener("pointercancel", releaseTransmit);
    this.dom.ping.addEventListener("lostpointercapture", releaseTransmit);

    this.scope.canvas.addEventListener("pointermove", (event) => this.handleHover(event));
    this.scope.canvas.addEventListener("pointerleave", () => {
      this.hover = null;
      this.dom.hover.textContent = "R — · BRG —";
    });
    this.scope.canvas.addEventListener("click", (event) => this.handlePlot(event));
    this.scope.canvas.addEventListener("wheel", (event) => {
      if (!this.started) return;
      event.preventDefault();
      this.setAngle(this.angle + Math.sign(event.deltaY) * 2);
    }, { passive: false });

    window.addEventListener("keydown", (event) => this.handleKeyDown(event));
    window.addEventListener("keyup", (event) => this.handleKeyUp(event));
    $all(".drive-pad button").forEach((button) => {
      const direction = button.dataset.move;
      button.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        this.keys.add(direction);
        button.classList.add("pressed");
        button.setPointerCapture?.(event.pointerId);
      });
      const release = () => {
        this.keys.delete(direction);
        button.classList.remove("pressed");
      };
      button.addEventListener("pointerup", release);
      button.addEventListener("pointercancel", release);
      button.addEventListener("lostpointercapture", release);
    });
  }

  async startDive() {
    if (this.started) return;
    try {
      await this.audio.start();
      this.dom.audioBadge.textContent = "AUDIO LIVE";
      this.dom.audioBadge.classList.add("live");
    } catch (error) {
      this.log(`Audio unavailable: ${error.message} The visual survey remains active.`);
      this.dom.audioBadge.textContent = "AUDIO FAILED";
    }
    this.started = true;
    this.dom.entry.classList.add("hidden");
    this.dom.statusDot.classList.add("on");
    this.dom.status.textContent = "SONAR ACTIVE";
    this.dom.statusDot.closest(".live-status").setAttribute("title", "Acoustic receiver online");
    this.log("Transducer primed. Rotate the emitter and transmit.");
    setTimeout(() => this.dom.entry.remove(), 700);
  }

  setAngle(value) {
    this.angle = normalizeDeg(Math.round(value));
    const display = String(this.angle).padStart(3, "0");
    this.dom.angleReadout.textContent = display;
    this.dom.slider.value = this.angle;
    this.dom.slider.style.setProperty("--range", `${this.angle / 359 * 100}%`);
  }

  ping() {
    if (!this.started || this.overheated || this.pingsLeft <= 0) {
      if (this.pingsLeft <= 0 && !this.overheated) this.log("Transmission budget exhausted.", "warn");
      return;
    }
    const now = performance.now();
    const interval = now - this.lastPingWall;
    const thermalLoad = 14 + (interval < 1150 ? 6 : 0);
    this.pingsLeft -= 1;
    this.heat = clamp(this.heat + thermalLoad, 0, 100);
    this.lastPingWall = now;
    this.lastPingAt = now;
    this.dom.ping.classList.add("firing");
    this.audio.transmit();

    const echoes = computeReturns(this.listener, this.angle, this.targets);
    this.lastEchoes = echoes;
    this.pings.push({ startedAt: now, angle: this.angle, echoes });
    this.pings = this.pings.slice(-2);
    this.dom.status.textContent = echoes.length ? `${echoes.length} RETURN${echoes.length > 1 ? "S" : ""} INBOUND` : "NO RETURN";
    this.log(echoes.length
      ? `TX ${String(this.angle).padStart(3, "0")}° · ${echoes.length} reflection envelope${echoes.length > 1 ? "s" : ""} propagating.`
      : `TX ${String(this.angle).padStart(3, "0")}° · no hard reflection in beam.`);

    echoes.forEach((echo) => {
      this.audio.scheduleEcho(echo);
      window.setTimeout(() => this.announceEcho(echo), Math.max(0, echo.delay * 1000));
    });
    this.renderPips();
    if (this.heat >= 100) this.triggerOverheat();
    this.updateInterface();
  }

  announceEcho(echo) {
    const side = echo.pan < -0.07 ? "PORT" : echo.pan > 0.07 ? "STBD" : "CENTER";
    const signature = echo.kind === "beacon" ? "HIGH PURE" : "LOW DAMPED";
    this.log(
      `RETURN Δ${echo.delay.toFixed(2)}s · ${side} ${Math.round(Math.abs(echo.pan) * 100)} · ${signature}.`
    );
    this.stereoPulse = { ...echo, at: performance.now() };
    this.dom.status.textContent = "RETURN RESOLVED";
  }

  triggerOverheat() {
    this.heat = 100;
    this.overheated = true;
    this.scanning = false;
    this.overheatUntil = performance.now() + 5200;
    this.audio.overheat();
    this.dom.overheat.classList.add("active");
    this.dom.ping.classList.add("locked");
    this.log("THERMAL LIMIT · transducer locked for 5 seconds.", "warn");
    this.dom.status.textContent = "TRANSDUCER LOCKED";
  }

  handleHover(event) {
    if (!this.started) return;
    const rect = this.scope.canvas.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) * 0.405;
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const relX = (x - centerX) / radius * SURVEY_SPEC.rangeMax;
    const relY = (y - centerY) / radius * SURVEY_SPEC.rangeMax;
    const range = Math.hypot(relX, relY);
    if (range > SURVEY_SPEC.rangeMax) {
      this.hover = null;
      this.dom.hover.textContent = "R — · BRG —";
      return;
    }
    const bearing = normalizeDeg(Math.atan2(relX, -relY) * 180 / Math.PI);
    this.hover = { x: relX, y: relY };
    this.dom.hover.textContent = `R ${range.toFixed(1)}m · BRG ${String(Math.round(bearing)).padStart(3, "0")}°`;
  }

  handlePlot(event) {
    if (!this.started) return;
    const rect = this.scope.canvas.getBoundingClientRect();
    const radius = Math.min(rect.width, rect.height) * 0.405;
    const relX = (event.clientX - rect.left - rect.width / 2) / radius * SURVEY_SPEC.rangeMax;
    const relY = (event.clientY - rect.top - rect.height / 2) / radius * SURVEY_SPEC.rangeMax;
    const range = Math.hypot(relX, relY);
    if (range > SURVEY_SPEC.rangeMax) {
      this.log("Trace rejected: outside the 48 m survey field.", "warn");
      return;
    }
    const point = { x: this.listener.x + relX, y: this.listener.y + relY };
    const result = resolvePlot(point, this.signature, this.targets, this.claimed);
    const marker = {
      x: point.x,
      y: point.y,
      kind: this.signature,
      status: result.status,
      targetId: result.target?.id || null,
      origin: { ...this.listener },
      at: performance.now()
    };

    if (result.status === "confirmed") {
      marker.x = result.target.x;
      marker.y = result.target.y;
      this.claimed.add(result.target.id);
      this.log(`TRACE MATCH · ${result.target.name} fixed at ${distanceBetween(this.listener, result.target).toFixed(1)}m.`);
      this.dom.status.textContent = `CONTACT ${this.claimed.size} OF ${this.targets.length}`;
    } else if (result.status === "mismatch") {
      this.log("SIGNATURE MISMATCH · erase the trace and compare the return tone.", "warn");
      this.dom.status.textContent = "SIGNATURE MISMATCH";
    } else if (result.status === "occupied") {
      this.log("TRACE REJECTED · this contact is already fixed.", "warn");
      this.dom.status.textContent = "TRACE REJECTED";
    } else {
      this.log("UNRESOLVED TRACE · no return matches this plot point.", "warn");
      this.dom.status.textContent = "UNRESOLVED TRACE";
    }

    this.markers.push(marker);
    this.renderCounts();
    this.updateInterface();
    if (this.claimed.size === this.targets.length) {
      window.setTimeout(() => this.completeSurvey(), 650);
    }
  }

  undoTrace() {
    const marker = this.markers.pop();
    if (!marker) return;
    if (marker.status === "confirmed" && marker.targetId) {
      this.claimed.delete(marker.targetId);
    }
    this.renderCounts();
    this.updateInterface();
    this.log("Last operator trace erased.");
  }

  completeSurvey() {
    if (!this.started || this.claimed.size !== this.targets.length) return;
    this.scanning = false;
    this.dom.status.textContent = "SURVEY COMPLETE";
    this.dom.statusDot.classList.remove("on");
    this.dom.successPings.textContent = String(SURVEY_SPEC.pingLimit - this.pingsLeft).padStart(2, "0");
    this.dom.success.hidden = false;
    this.audio.success();
    this.log("ALL CONTACTS FIXED · ABYSS-09 cleared for entry.", "accent");
  }

  renderPips() {
    const fragment = document.createDocumentFragment();
    for (let index = 0; index < SURVEY_SPEC.pingLimit; index += 1) {
      const pip = document.createElement("i");
      if (index >= this.pingsLeft) pip.className = "spent";
      fragment.append(pip);
    }
    this.dom.pips.replaceChildren(fragment);
  }

  renderCounts() {
    const obstacles = [...this.claimed].filter((id) => this.targets.find((target) => target.id === id)?.kind === "obstacle").length;
    const beacon = [...this.claimed].filter((id) => this.targets.find((target) => target.id === id)?.kind === "beacon").length;
    this.dom.obstacleCount.textContent = obstacles;
    this.dom.beaconCount.textContent = beacon;
    $('.tally-row[data-contact="obstacle"]').classList.toggle("complete", obstacles === 3);
    $('.tally-row[data-contact="beacon"]').classList.toggle("complete", beacon === 1);
    this.dom.undo.disabled = this.markers.length === 0;
  }

  handleKeyDown(event) {
    if (!this.started) return;
    const key = event.key.toLowerCase();
    if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(key)) {
      event.preventDefault();
      if (key === "arrowleft") this.setAngle(this.angle - 2);
      else if (key === "arrowright") this.setAngle(this.angle + 2);
      else this.keys.add(key);
      return;
    }
    if (key === "q") {
      event.preventDefault();
      this.setAngle(this.angle - 2);
    } else if (key === "e") {
      event.preventDefault();
      this.setAngle(this.angle + 2);
    } else if (event.code === "Space" && !event.repeat) {
      event.preventDefault();
      this.scanning = true;
      this.ping();
    } else if (key === "z" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      this.undoTrace();
    }
  }

  handleKeyUp(event) {
    const key = event.key.toLowerCase();
    this.keys.delete(key);
    if (event.code === "Space") this.scanning = false;
  }

  updateMovement(deltaSeconds) {
    let deltaX = (this.keys.has("d") || this.keys.has("right") ? 1 : 0)
      - (this.keys.has("a") || this.keys.has("left") ? 1 : 0);
    let deltaY = (this.keys.has("s") || this.keys.has("down") || this.keys.has("arrowdown") ? 1 : 0)
      - (this.keys.has("w") || this.keys.has("up") || this.keys.has("arrowup") ? 1 : 0);
    if (!deltaX && !deltaY) return;
    const length = Math.hypot(deltaX, deltaY);
    deltaX /= length;
    deltaY /= length;
    const distance = SURVEY_SPEC.moveSpeed * deltaSeconds;
    const next = moveListener(this.listener, deltaX * distance, deltaY * distance);
    if (Math.abs(next.x - this.listener.x) + Math.abs(next.y - this.listener.y) > 0.0001) {
      this.listener = next;
    }
  }

  updateStereo() {
    if (!this.stereoPulse) {
      this.dom.leftMeter.style.width = "0%";
      this.dom.rightMeter.style.width = "0%";
      return;
    }
    const age = (performance.now() - this.stereoPulse.at) / 1000;
    const decay = Math.max(0, 1 - age / 1.35);
    if (decay <= 0) {
      this.stereoPulse = null;
      this.dom.leftMeter.style.width = "0%";
      this.dom.rightMeter.style.width = "0%";
      return;
    }
    const pan = this.stereoPulse.pan;
    const left = Math.max(0.06, -pan) * this.stereoPulse.strength * decay;
    const right = Math.max(0.06, pan) * this.stereoPulse.strength * decay;
    this.dom.leftMeter.style.width = `${Math.min(100, left * 118)}%`;
    this.dom.rightMeter.style.width = `${Math.min(100, right * 118)}%`;
  }

  updateInterface() {
    const heat = Math.round(this.heat);
    this.dom.pingsLeft.textContent = this.pingsLeft;
    this.dom.heatValue.textContent = `${heat}%`;
    this.dom.heatFill.style.width = `${heat}%`;
    this.dom.heatFill.style.background = heat > 82
      ? "linear-gradient(90deg, var(--amber), var(--red))"
      : "linear-gradient(90deg, var(--mint), var(--amber))";
    this.dom.heatCard.classList.toggle("hot", heat >= 65 && heat < 90);
    this.dom.heatCard.classList.toggle("danger", heat >= 90);
    this.dom.coordX.textContent = `${this.listener.x >= 0 ? "+" : ""}${this.listener.x.toFixed(1)}`;
    this.dom.coordY.textContent = `${this.listener.y >= 0 ? "+" : ""}${this.listener.y.toFixed(1)}`;
    this.dom.logClock.textContent = new Date().toISOString().slice(11, 19);

    const strong = this.dom.ping.querySelector("strong");
    const small = this.dom.ping.querySelector("small");
    if (this.overheated) {
      strong.textContent = "LOCKED";
      small.textContent = `COOLING · ${Math.max(0, Math.ceil((this.overheatUntil - performance.now()) / 1000))}s`;
      this.dom.heatHint.textContent = "TRANSDUCER PROTECTION ACTIVE";
    } else if (this.pingsLeft <= 0) {
      strong.textContent = "EXHAUSTED";
      small.textContent = "TRANSMISSION BUDGET SPENT";
      this.dom.heatHint.textContent = "NO TRANSMISSIONS REMAIN";
    } else {
      strong.textContent = "TRANSMIT";
      small.textContent = "HOLD TO SWEEP · SPACE";
      this.dom.heatHint.textContent = heat >= 90
        ? "OVERHEAT IMMINENT"
        : heat >= 65 ? "THERMAL LOAD ELEVATED" : "THERMAL MARGIN NOMINAL";
    }
    this.dom.ping.classList.toggle("locked", this.overheated || this.pingsLeft <= 0);
    this.dom.rightMeter.style.opacity = "1";
    this.dom.overheat.classList.toggle("active", this.overheated);
  }

  loop(time) {
    const deltaSeconds = Math.min(0.05, (time - this.lastFrame) / 1000);
    this.lastFrame = time;
    if (this.started) {
      this.updateMovement(deltaSeconds);
      if (this.scanning && !this.overheated && time - this.lastPingWall >= 720) this.ping();
      if (this.overheated) {
        if (time >= this.overheatUntil) {
          this.overheated = false;
          this.heat = 42;
          this.dom.ping.classList.remove("locked");
          this.dom.overheat.classList.remove("active");
          this.dom.status.textContent = "SONAR ACTIVE";
          this.log("Transducer cooled. Reduced thermal margin restored.", "accent");
        }
      } else if (time - this.lastPingWall > 850) {
        this.heat = Math.max(0, this.heat - deltaSeconds * 8.5);
      }
      this.updateStereo();
      this.updateInterface();
    }
    this.scope.draw({
      angle: this.angle,
      scanning: this.scanning,
      lastPingAt: this.lastPingAt,
      markers: this.markers,
      listener: this.listener,
      hover: this.hover,
      overheated: this.overheated
    });
    this.wave.draw({ pings: this.pings });
    requestAnimationFrame((nextTime) => this.loop(nextTime));
  }

  log(message, tone = "") {
    this.dom.logLine.innerHTML = "";
    const span = document.createElement("span");
    span.textContent = message;
    if (tone) span.className = tone;
    this.dom.logLine.append(span);
  }
}

const game = new BlackwaterGame();

window.__blackwater = {
  get snapshot() {
    return {
      started: game.started,
      angle: game.angle,
      listener: { ...game.listener },
      pingsLeft: game.pingsLeft,
      heat: game.heat,
      overheated: game.overheated,
      claimed: [...game.claimed],
      markers: game.markers.map((marker) => ({ ...marker, origin: { ...marker.origin } })),
      echoes: game.lastEchoes.map((echo) => ({ ...echo })),
      targets: game.targets.map((target) => ({ ...target }))
    };
  },
  setAngle: (value) => game.setAngle(value),
  ping: () => game.ping(),
  complete: () => game.claimed.size === game.targets.length
};
