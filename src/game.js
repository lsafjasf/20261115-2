import {
  BUILDINGS,
  DESTINATIONS,
  PUDDLES,
  START,
  WORLD,
  ROUTE_HINTS,
} from "./map.js";
import { clamp, createBike, normalizeAngle, stepBike } from "./physics.js";
import { Renderer } from "./renderer.js";
import { RainAudio } from "./audio.js";

const SIGN_WINDOW = 8;
const SIGN_DURATION = 1.55;
const ZONE_RADIUS = 53;
const SIGN_SPEED_LIMIT = 18;
const WINDOW_ENTER_RADIUS = 110;
const WINDOW_ENTER_SPEED = 34;

class RainRider {
  constructor() {
    this.canvas = document.querySelector("#game");
    this.startScreen = document.querySelector("#start-screen");
    this.resultScreen = document.querySelector("#result-screen");
    this.startButton = document.querySelector("#start-button");
    this.restartButton = document.querySelector("#restart-button");
    this.renderer = new Renderer(this.canvas);
    this.audio = new RainAudio();
    this.touchControls = document.querySelector("#touch-controls");
    const coarsePointer = Boolean(
      window.matchMedia?.("(pointer: coarse)")?.matches,
    );
    this.touchControls?.setAttribute("aria-hidden", String(!coarsePointer));
    this.keys = new Set();
    this.touch = {
      left: false,
      right: false,
      throttle: false,
      brake: false,
    };
    this.testControls = null;
    this.testMode = false;
    this.lastFrame = performance.now();
    this.audioSplashCooldown = 0;
    this.skidStampCooldown = 0;
    this.resetRun("menu");
    this.bindEvents();
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
    this.exposeTestApi();
  }

  resetRun(phase = "playing") {
    this.bike = createBike(START.x, START.y, START.angle);
    this.phase = phase;
    this.destinationIndex = 0;
    this.delivered = [];
    this.damage = 0;
    this.elapsed = 0;
    this.headlightOn = true;
    this.skidMarks = [];
    this.toast = null;
    this.finishCountdown = 0;
    this.previousWet = false;
    this.delivery = {
      windowOpen: false,
      windowDuration: SIGN_WINDOW,
      remaining: 0,
      signProgress: 0,
      signDuration: SIGN_DURATION,
      cooldown: 0,
    };
  }

  bindEvents() {
    this.startButton.addEventListener("click", () => this.startShift());
    this.restartButton.addEventListener("click", () => this.startShift());
    window.addEventListener("resize", () => this.renderer.resize());

    window.addEventListener("keydown", (event) => {
      const handled = [
        "ArrowUp",
        "ArrowLeft",
        "ArrowRight",
        "ArrowDown",
        "KeyW",
        "KeyA",
        "KeyS",
        "KeyD",
        "Space",
      ];
      if (handled.includes(event.code)) event.preventDefault();
      if (event.repeat) return;
      this.keys.add(event.code);

      if (event.code === "KeyF" && this.phase === "playing") {
        this.headlightOn = !this.headlightOn;
        this.showToast(this.headlightOn ? "车灯已打开" : "车灯已关闭");
      }
      if (event.code === "KeyM") {
        this.audio.setMuted(!this.audio.muted);
        this.showToast(this.audio.muted ? "声音已静音" : "声音已恢复");
      }
      if (
        event.code === "KeyR" &&
        (this.phase === "success" || this.phase === "failed")
      ) {
        this.startShift();
      }
    });

    window.addEventListener("keyup", (event) => {
      this.keys.delete(event.code);
    });

    window.addEventListener("blur", () => {
      this.keys.clear();
      Object.keys(this.touch).forEach((key) => {
        this.touch[key] = false;
      });
    });

    for (const button of document.querySelectorAll("[data-control]")) {
      const control = button.dataset.control;
      const setValue = (value, event) => {
        event.preventDefault();
        this.touch[control] = value;
        button.classList.toggle("pressed", value);
      };
      button.addEventListener("pointerdown", (event) => setValue(true, event));
      button.addEventListener("pointerup", (event) => setValue(false, event));
      button.addEventListener("pointercancel", (event) => setValue(false, event));
      button.addEventListener("pointerleave", (event) => setValue(false, event));
    }
  }

  async startShift() {
    this.resetRun("playing");
    this.startScreen.classList.add("hidden");
    this.resultScreen.classList.add("hidden");
    this.renderer.resize();
    this.showToast("23:47 · 四单夜班开始，先去槐花里 12", 3.2);
    try {
      await this.audio.start();
      this.audio.setMuted(this.audio.muted);
    } catch {
      // Audio is optional if the browser blocks or lacks Web Audio.
    }
  }

  readControls() {
    if (this.testControls) {
      return {
        throttle: Boolean(this.testControls.throttle),
        brake: Boolean(this.testControls.brake),
        steer: clamp(Number(this.testControls.steer) || 0, -1, 1),
      };
    }
    return {
      throttle:
        this.keys.has("KeyW") ||
        this.keys.has("ArrowUp") ||
        this.touch.throttle,
      brake:
        this.keys.has("KeyS") ||
        this.keys.has("ArrowDown") ||
        this.touch.brake,
      steer: (this.keys.has("KeyD") ||
        this.keys.has("ArrowRight") ||
        this.touch.right
        ? 1
        : 0) -
        (this.keys.has("KeyA") ||
        this.keys.has("ArrowLeft") ||
        this.touch.left
          ? 1
          : 0),
    };
  }

  loop(now) {
    const rawDt = (now - this.lastFrame) / 1000;
    this.lastFrame = now;
    const dt = clamp(rawDt || 1 / 60, 0, 0.05);
    if (!this.testMode) {
      this.update(dt);
      this.renderer.update(dt);
    }
    this.renderer.draw(this);
    requestAnimationFrame(this.loop);
  }

  update(dt) {
    if (this.phase === "playing") {
      this.elapsed += dt;
      this.updateBike(dt);
      if (this.phase === "playing") {
        this.updateDelivery(dt);
        this.updateFinish(dt);
      }
    }
    this.updateEffects(dt);
    this.audio.update({
      speed: this.bike.speed,
      wet: this.bike.inPuddle,
      skidding: this.bike.skidding,
      engine: this.readControls().throttle,
    });
  }

  updateBike(dt) {
    const controls = this.readControls();
    const previousWet = this.previousWet;
    const events = stepBike(this.bike, controls, dt, {
      puddles: PUDDLES,
      buildings: BUILDINGS,
      world: WORLD,
      elapsed: this.elapsed,
    });

    if (events.wet && !previousWet && this.bike.speed > 16) {
      this.audio.splash(clamp(this.bike.speed / 150, 0.35, 1.2));
      this.audioSplashCooldown = 0.18;
    }

    if (events.skidding) {
      if (this.audioSplashCooldown <= 0) {
        this.audio.splash(0.65);
        this.audioSplashCooldown = 0.28;
      }
      if (this.skidStampCooldown <= 0) {
        const rearX = this.bike.x - Math.cos(this.bike.angle) * 13;
        const rearY = this.bike.y - Math.sin(this.bike.angle) * 13;
        const sideX = Math.cos(this.bike.angle + Math.PI / 2) * 3;
        const sideY = Math.sin(this.bike.angle + Math.PI / 2) * 3;
        for (const side of [-1, 1]) {
          this.skidMarks.push({
            x: rearX + sideX * side,
            y: rearY + sideY * side,
            angle: this.bike.angle,
            width: 1.2 + this.bike.slipAngle * 4,
            life: 8,
            maxLife: 8,
          });
        }
        this.skidStampCooldown = 0.035;
      }
    }

    if (events.collisionDamage > 0.4) {
      this.damage = Math.min(WORLD.damageLimit, this.damage + events.collisionDamage);
      this.audio.impact(events.collisionDamage);
      this.showToast(
        `撞上墙体 · 车损 +${Math.ceil(events.collisionDamage)}`,
        1.8,
        "danger",
      );
      if (this.damage >= WORLD.damageLimit) {
        this.damage = WORLD.damageLimit;
        this.finishRun(false);
      }
    }
    this.previousWet = events.wet;
  }

  updateDelivery(dt) {
    if (this.destinationIndex >= DESTINATIONS.length) return;
    const destination = DESTINATIONS[this.destinationIndex];
    const distance = Math.hypot(
      this.bike.x - destination.marker.x,
      this.bike.y - destination.marker.y,
    );
    const delivery = this.delivery;

    if (delivery.cooldown > 0) {
      delivery.cooldown = Math.max(0, delivery.cooldown - dt);
      if (delivery.cooldown === 0 && distance < WINDOW_ENTER_RADIUS) {
        this.showToast("客户又下楼了 · 签收窗口重新开启");
      }
      return;
    }

    if (!delivery.windowOpen) {
      if (distance <= WINDOW_ENTER_RADIUS && this.bike.speed <= WINDOW_ENTER_SPEED) {
        delivery.windowOpen = true;
        delivery.remaining = SIGN_WINDOW;
        delivery.signProgress = 0;
        this.showToast(`${destination.customer} 已在门口 · 8 秒签收窗口`);
      }
      return;
    }

    delivery.remaining = Math.max(0, delivery.remaining - dt);
    const inZone = distance <= ZONE_RADIUS;
    const stopped = this.bike.speed <= SIGN_SPEED_LIMIT;
    if (inZone && stopped) {
      delivery.signProgress = Math.min(
        delivery.signDuration,
        delivery.signProgress + dt,
      );
    } else {
      delivery.signProgress = Math.max(0, delivery.signProgress - dt * 1.7);
    }

    if (delivery.signProgress >= delivery.signDuration) {
      this.completeDelivery(destination);
      return;
    }

    if (delivery.remaining <= 0) {
      delivery.windowOpen = false;
      delivery.cooldown = 4;
      delivery.signProgress = 0;
      this.showToast("签收窗口错过 · 等客户再次下楼", 2.5, "danger");
    }
  }

  completeDelivery(destination) {
    this.delivered.push(destination.id);
    this.destinationIndex += 1;
    this.delivery.windowOpen = false;
    this.delivery.remaining = 0;
    this.delivery.signProgress = 0;
    this.delivery.cooldown = 0;
    this.audio.chime(true);

    if (this.destinationIndex >= DESTINATIONS.length) {
      this.finishCountdown = 1.35;
      this.showToast("四单全部签收 · 正在核对车损……", 2.2);
    } else {
      const next = DESTINATIONS[this.destinationIndex];
      this.showToast(`已送达 ${destination.name} · 下一站 ${next.name}`, 3);
    }
  }

  updateFinish(dt) {
    if (this.finishCountdown <= 0 || this.phase !== "playing") return;
    this.finishCountdown -= dt;
    if (this.finishCountdown <= 0) {
      const success =
        this.delivered.length === DESTINATIONS.length &&
        this.damage < WORLD.damageLimit;
      this.finishRun(success);
    }
  }

  updateEffects(dt) {
    this.audioSplashCooldown = Math.max(0, this.audioSplashCooldown - dt);
    this.skidStampCooldown = Math.max(0, this.skidStampCooldown - dt);
    for (const mark of this.skidMarks) mark.life -= dt;
    if (this.skidMarks.length > 340) {
      this.skidMarks.splice(0, this.skidMarks.length - 340);
    }
    this.skidMarks = this.skidMarks.filter((mark) => mark.life > 0);
    if (this.toast) {
      this.toast.life -= dt;
      if (this.toast.life <= 0) this.toast = null;
    }
  }

  showToast(text, duration = 2.4, tone = "info") {
    this.toast = {
      text,
      life: duration,
      maxLife: duration,
      tone,
    };
  }

  finishRun(success) {
    if (this.phase === "success" || this.phase === "failed") return;
    this.phase = success ? "success" : "failed";
    this.audio.chime(success);

    const title = success ? "四单送达" : "班次中止";
    const eyebrow = success
      ? `SHIFT COMPLETE · ${this.formatTime(this.elapsed)}`
      : "SHIFT ABORTED · DAMAGE";
    const copy = success
      ? `四个包裹都在签收窗内交出。\n车损 ${Math.ceil(this.damage)} / ${WORLD.damageLimit}，雨夜路线完成。`
      : `车体损伤达到 ${WORLD.damageLimit} 上限。\n本班送达 ${this.delivered.length} / 4 单。`;

    document.querySelector("#result-eyebrow").textContent = eyebrow;
    document.querySelector("#result-title").textContent = title;
    document.querySelector("#result-copy").textContent = copy;
    document.querySelector("#result-stats").innerHTML = `
      <div><strong>${this.delivered.length}/4</strong><span>签收包裹</span></div>
      <div><strong>${this.formatTime(this.elapsed)}</strong><span>班次用时</span></div>
      <div><strong>${Math.ceil(this.damage)}</strong><span>车体损伤</span></div>
    `;
    this.restartButton.textContent = success ? "再跑一班" : "重新出发";
    this.resultScreen.classList.remove("hidden");
  }

  formatTime(seconds) {
    const whole = Math.max(0, Math.floor(seconds));
    const mins = Math.floor(whole / 60);
    const secs = whole % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }

  getSnapshot() {
    return {
      phase: this.phase,
      elapsed: this.elapsed,
      damage: this.damage,
      damageLimit: WORLD.damageLimit,
      destinationIndex: this.destinationIndex,
      delivered: this.delivered.slice(),
      headlightOn: this.headlightOn,
      audioReady: this.audio.ready,
      bike: {
        x: this.bike.x,
        y: this.bike.y,
        angle: this.bike.angle,
        vx: this.bike.vx,
        vy: this.bike.vy,
        speed: this.bike.speed,
        inPuddle: this.bike.inPuddle,
        skidding: this.bike.skidding,
        slipAngle: this.bike.slipAngle,
      },
      delivery: { ...this.delivery },
      toast: this.toast ? { ...this.toast } : null,
    };
  }

  exposeTestApi() {
    const api = {
      startShift: () => this.startShift(),
      setTestMode: (enabled = true) => {
        this.testMode = Boolean(enabled);
        this.lastFrame = performance.now();
        return this.testMode;
      },
      setControls: (controls = {}) => {
        this.testControls = {
          throttle: Boolean(controls.throttle),
          brake: Boolean(controls.brake),
          steer: clamp(Number(controls.steer) || 0, -1, 1),
        };
        return { ...this.testControls };
      },
      clearControls: () => {
        this.testControls = null;
      },
      step: (dt = 1 / 120, count = 1) => {
        for (let index = 0; index < count; index += 1) {
          this.update(clamp(dt, 0, 0.05));
          this.renderer.update(clamp(dt, 0, 0.05));
        }
        return this.getSnapshot();
      },
      advance: (seconds = 1 / 120, controls) => {
        if (controls !== undefined) {
          this.testControls = {
            throttle: Boolean(controls.throttle),
            brake: Boolean(controls.brake),
            steer: clamp(Number(controls.steer) || 0, -1, 1),
          };
        }
        const total = Math.max(0, Math.min(120, Number(seconds) || 0));
        const steps = Math.max(1, Math.ceil(total / (1 / 120)));
        const dt = total / steps;
        for (let index = 0; index < steps; index += 1) this.update(dt);
        return this.getSnapshot();
      },
      teleport: (x, y, angle = this.bike.angle, speed = 0) => {
        this.bike.x = Number(x);
        this.bike.y = Number(y);
        this.bike.angle = normalizeAngle(Number(angle) || 0);
        this.bike.vx = Math.cos(this.bike.angle) * Number(speed || 0);
        this.bike.vy = Math.sin(this.bike.angle) * Number(speed || 0);
        this.bike.speed = Math.hypot(this.bike.vx, this.bike.vy);
        this.previousWet = false;
        return this.getSnapshot();
      },
      setDamage: (value) => {
        this.damage = clamp(Number(value) || 0, 0, WORLD.damageLimit);
        return this.damage;
      },
      setHeadlight: (enabled) => {
        this.headlightOn = Boolean(enabled);
        return this.headlightOn;
      },
      getMap: () => ({
        world: { ...WORLD },
        destinations: DESTINATIONS.map((destination) => ({
          ...destination,
          marker: { ...destination.marker },
          door: { ...destination.door },
        })),
        puddles: PUDDLES.map((puddle) => ({ ...puddle })),
        buildings: BUILDINGS.map((building) => ({ ...building })),
        routeHints: ROUTE_HINTS.map((point) => ({ ...point })),
      }),
      getState: () => this.getSnapshot(),
    };
    window.__rainRider = api;
    this.api = api;
  }
}

new RainRider();
