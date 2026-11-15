(() => {
  "use strict";

  const W = 1600;
  const H = 900;
  const TAU = Math.PI * 2;
  const DOOR = { x: 1262, y: 449, r: 238 };
  const PAD = { x: 1370, y: 449, r: 58 };
  const ARENA = { left: 72, right: 1528, top: 112, bottom: 806 };
  const COLORS = {
    ice: "#8ee9ff",
    iceMid: "#3f91a7",
    iceDark: "#10323e",
    warm: "#ffb35f",
    hot: "#ff6a32",
    green: "#7cf5c0",
    red: "#ff5b52",
  };

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const lerp = (a, b, t) => a + (b - a) * t;
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const smoothstep = (min, max, value) => {
    const t = clamp((value - min) / (max - min), 0, 1);
    return t * t * (3 - 2 * t);
  };
  const fmtTime = (seconds) => {
    const safe = Math.max(0, Math.ceil(seconds));
    return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
  };

  const LOCKS = [
    { x: 1054, y: 261, angle: Math.atan2(261 - DOOR.y, 1054 - DOOR.x), label: "01" },
    { x: 1024, y: 449, angle: Math.PI, label: "02" },
    { x: 1054, y: 637, angle: Math.atan2(637 - DOOR.y, 1054 - DOOR.x), label: "03" },
  ];

  const GLASS_PATCHES = [
    { x: 610, y: 295, rx: 195, ry: 112, rot: -0.25 },
    { x: 350, y: 630, rx: 135, ry: 86, rot: 0.3 },
    { x: 845, y: 730, rx: 135, ry: 68, rot: -0.1 },
  ];

  const ROUGH_PATCHES = [
    { x: 256, y: 435, rx: 130, ry: 82, rot: 0.1 },
    { x: 713, y: 505, rx: 120, ry: 92, rot: -0.35 },
    { x: 925, y: 330, rx: 105, ry: 70, rot: 0.2 },
  ];

  const ICE_PILLARS = [
    { x: 708, y: 258, r: 40, seed: 1 },
    { x: 760, y: 622, r: 33, seed: 2 },
  ];

  function inEllipse(x, y, patch) {
    const dx = x - patch.x;
    const dy = y - patch.y;
    const cos = Math.cos(patch.rot);
    const sin = Math.sin(patch.rot);
    const rx = dx * cos + dy * sin;
    const ry = -dx * sin + dy * cos;
    return (rx * rx) / (patch.rx * patch.rx) + (ry * ry) / (patch.ry * patch.ry) <= 1;
  }

  function seededNoise(x, y, seed = 0) {
    const value = Math.sin(x * 12.9898 + y * 78.233 + seed * 37.719) * 43758.5453;
    return value - Math.floor(value);
  }

  class Input {
    constructor(canvas, game) {
      this.canvas = canvas;
      this.game = game;
      this.keys = new Set();
      this.pointer = { x: 900, y: 450 };
      this.pointerDown = false;
      this.pointerMovedAt = -100;
      this.bind();
    }

    bind() {
      window.addEventListener("keydown", (event) => {
        const key = event.code;
        if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(key)) {
          event.preventDefault();
        }
        this.keys.add(key);
        if (event.repeat) return;
        this.game.onKey(key);
      });
      window.addEventListener("keyup", (event) => this.keys.delete(event.code));
      window.addEventListener("blur", () => {
        this.keys.clear();
        this.pointerDown = false;
      });
      this.canvas.addEventListener("pointermove", (event) => {
        this.pointer = this.toWorld(event);
        this.pointerMovedAt = this.game.elapsed;
        this.game.aimLock = null;
      });
      this.canvas.addEventListener("pointerdown", (event) => {
        if (event.button !== 0) return;
        this.pointer = this.toWorld(event);
        this.pointerDown = true;
        this.game.ensureAudio();
      });
      window.addEventListener("pointerup", () => {
        this.pointerDown = false;
      });
      this.canvas.addEventListener("contextmenu", (event) => event.preventDefault());
    }

    toWorld(event) {
      const rect = this.canvas.getBoundingClientRect();
      const scale = Math.min(rect.width / W, rect.height / H);
      const offsetX = rect.left + (rect.width - W * scale) / 2;
      const offsetY = rect.top + (rect.height - H * scale) / 2;
      return {
        x: clamp((event.clientX - offsetX) / scale, 0, W),
        y: clamp((event.clientY - offsetY) / scale, 0, H),
      };
    }

    axis() {
      let x = 0;
      let y = 0;
      if (this.keys.has("KeyA") || this.keys.has("ArrowLeft")) x -= 1;
      if (this.keys.has("KeyD") || this.keys.has("ArrowRight")) x += 1;
      if (this.keys.has("KeyW") || this.keys.has("ArrowUp")) y -= 1;
      if (this.keys.has("KeyS") || this.keys.has("ArrowDown")) y += 1;
      if (x !== 0 && y !== 0) {
        const inv = 1 / Math.sqrt(2);
        x *= inv;
        y *= inv;
      }
      return { x, y };
    }
  }

  class AudioEngine {
    constructor() {
      this.ctx = null;
      this.master = null;
      this.muted = false;
      this.parts = {};
    }

    init() {
      if (this.ctx) {
        if (this.ctx.state === "suspended") this.ctx.resume();
        return;
      }
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.42;
      this.master.connect(ctx.destination);

      const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      let last = 0;
      for (let i = 0; i < data.length; i += 1) {
        const white = Math.random() * 2 - 1;
        last = last * 0.86 + white * 0.14;
        data[i] = last * 2.6;
      }
      this.parts.noiseBuffer = noiseBuffer;

      const makeNoise = (type, frequency, q, gainValue) => {
        const source = ctx.createBufferSource();
        source.buffer = noiseBuffer;
        source.loop = true;
        const filter = ctx.createBiquadFilter();
        filter.type = type;
        filter.frequency.value = frequency;
        filter.Q.value = q;
        const gain = ctx.createGain();
        gain.gain.value = gainValue;
        source.connect(filter).connect(gain).connect(this.master);
        source.start();
        return { source, filter, gain };
      };

      this.parts.pumpNoise = makeNoise("bandpass", 210, 2.8, 0);
      this.parts.jetNoise = makeNoise("bandpass", 1180, 0.72, 0);
      this.parts.steamNoise = makeNoise("highpass", 2400, 0.7, 0);

      const pump = ctx.createOscillator();
      pump.type = "triangle";
      pump.frequency.value = 64;
      const pumpGain = ctx.createGain();
      pumpGain.gain.value = 0;
      pump.connect(pumpGain).connect(this.master);
      pump.start();
      this.parts.pumpOsc = { source: pump, gain: pumpGain };

      const drive = ctx.createOscillator();
      drive.type = "sawtooth";
      drive.frequency.value = 43;
      const driveFilter = ctx.createBiquadFilter();
      driveFilter.type = "lowpass";
      driveFilter.frequency.value = 150;
      const driveGain = ctx.createGain();
      driveGain.gain.value = 0;
      drive.connect(driveFilter).connect(driveGain).connect(this.master);
      drive.start();
      this.parts.drive = { source: drive, filter: driveFilter, gain: driveGain };
    }

    set(param, value, time = 0.08) {
      if (!this.ctx) return;
      param.setTargetAtTime(value, this.ctx.currentTime, time);
    }

    muteNode(param) {
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      param.cancelScheduledValues(now);
      param.setValueAtTime(0, now);
    }

    update({ speed = 0, throttle = 0, heating = false, jet = false, steam = false, silent = false }) {
      if (!this.ctx) return;
      if (silent) {
        this.muteNode(this.parts.drive.gain.gain);
        this.muteNode(this.parts.pumpOsc.gain.gain);
        this.muteNode(this.parts.pumpNoise.gain.gain);
        this.muteNode(this.parts.jetNoise.gain.gain);
        this.muteNode(this.parts.steamNoise.gain.gain);
        return;
      }
      const normSpeed = clamp(speed / 260, 0, 1);
      this.set(this.parts.drive.gain.gain, 0.008 + normSpeed * 0.052 + throttle * 0.01, 0.12);
      this.set(this.parts.drive.source.frequency, 37 + normSpeed * 48 + throttle * 7, 0.15);
      this.set(this.parts.drive.filter.frequency, 120 + normSpeed * 260, 0.15);
      this.set(this.parts.pumpOsc.gain.gain, heating ? 0.032 : 0, 0.06);
      this.set(this.parts.pumpOsc.source.frequency, heating ? 67 + Math.sin(performance.now() / 85) * 4 : 54, 0.05);
      this.set(this.parts.pumpNoise.gain.gain, heating ? 0.05 : 0, 0.05);
      this.set(this.parts.jetNoise.gain.gain, jet ? 0.16 : 0, 0.04);
      this.set(this.parts.steamNoise.gain.gain, steam ? 0.065 : 0, 0.2);
    }

    tone(frequency, duration, gainValue = 0.08, type = "sine", endFrequency = null) {
      if (!this.ctx || this.muted) return;
      const ctx = this.ctx;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(frequency, now);
      if (endFrequency) osc.frequency.exponentialRampToValueAtTime(endFrequency, now + duration);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(gainValue, now + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      osc.connect(gain).connect(this.master);
      osc.start(now);
      osc.stop(now + duration + 0.04);
    }

    impact(strength = 1) {
      if (!this.ctx || this.muted) return;
      const ctx = this.ctx;
      const source = ctx.createBufferSource();
      source.buffer = this.parts.noiseBuffer;
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 240 + strength * 200;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.2 * strength, ctx.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.28);
      source.connect(filter).connect(gain).connect(this.master);
      source.start();
      source.stop(ctx.currentTime + 0.3);
      this.tone(58, 0.18, 0.08 * strength, "square", 31);
    }

    thaw() {
      this.tone(520, 0.22, 0.035, "sine", 880);
    }

    lockDone() {
      this.tone(420, 0.16, 0.055, "triangle");
      setTimeout(() => this.tone(640, 0.24, 0.045, "triangle"), 95);
    }

    success() {
      [330, 440, 554, 660].forEach((frequency, index) => {
        setTimeout(() => this.tone(frequency, 0.55, 0.055, "sine"), index * 120);
      });
    }

    failure() {
      this.tone(170, 0.65, 0.08, "sawtooth", 62);
    }

    toggleMute() {
      this.muted = !this.muted;
      if (this.master) this.set(this.master.gain, this.muted ? 0 : 0.42, 0.04);
      return this.muted;
    }
  }
  class Vehicle {
    constructor() {
      this.reset();
    }

    reset() {
      this.x = 246;
      this.y = 449;
      this.vx = 0;
      this.vy = 0;
      this.radius = 27;
      this.angle = 0;
      this.aim = 0;
      this.hull = 100;
      this.speed = 0;
      this.surface = "packed";
      this.hitCooldown = 0;
      this.trackClock = 0;
      this.throttle = 0;
    }

    muzzle() {
      return {
        x: this.x + Math.cos(this.aim) * 42,
        y: this.y + Math.sin(this.aim) * 42,
      };
    }

    update(dt, input, game) {
      this.hitCooldown = Math.max(0, this.hitCooldown - dt);
      const axis = game.autopilot?.active ? game.autopilot.axis : input.axis();
      if (game.autopilot?.active && game.autopilot.brake) {
        this.vx *= 0.88;
        this.vy *= 0.88;
      }
      this.throttle = Math.hypot(axis.x, axis.y);
      this.surface = game.surfaceAt(this.x, this.y);
      const grip = this.surface === "glass" ? 0.72 : this.surface === "rough" ? 1.3 : 1;
      const drag = this.surface === "glass" ? 0.45 : this.surface === "rough" ? 2.75 : 1.18;
      const accel = 315 * grip;
      this.vx += axis.x * accel * dt;
      this.vy += axis.y * accel * dt;
      this.vx *= Math.exp(-drag * dt);
      this.vy *= Math.exp(-drag * dt);

      const maxSpeed = this.surface === "glass" ? 295 : this.surface === "rough" ? 205 : 252;
      const speed = Math.hypot(this.vx, this.vy);
      if (speed > maxSpeed) {
        this.vx = (this.vx / speed) * maxSpeed;
        this.vy = (this.vy / speed) * maxSpeed;
      }
      this.speed = Math.min(Math.hypot(this.vx, this.vy), maxSpeed);

      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.aim = game.getAimAngle(this);
      this.angle = this.speed > 14 ? Math.atan2(this.vy, this.vx) : lerpAngle(this.angle, this.aim, dt * 1.6);

      this.resolveWalls(game);
      this.resolveObstacles(game);
      this.trackClock -= dt;
      if (this.speed > 30 && this.trackClock <= 0) {
        this.trackClock = 0.055;
        game.addTrack();
      }
    }

    resolveWalls(game) {
      const r = this.radius;
      const hits = [];
      if (this.x - r < ARENA.left) {
        this.x = ARENA.left + r;
        hits.push({ nx: 1, ny: 0, impact: -this.vx });
        this.vx = Math.abs(this.vx) * 0.26;
      }
      if (this.x + r > ARENA.right) {
        this.x = ARENA.right - r;
        hits.push({ nx: -1, ny: 0, impact: this.vx });
        this.vx = -Math.abs(this.vx) * 0.26;
      }
      if (this.y - r < ARENA.top) {
        this.y = ARENA.top + r;
        hits.push({ nx: 0, ny: 1, impact: -this.vy });
        this.vy = Math.abs(this.vy) * 0.26;
      }
      if (this.y + r > ARENA.bottom) {
        this.y = ARENA.bottom - r;
        hits.push({ nx: 0, ny: -1, impact: this.vy });
        this.vy = -Math.abs(this.vy) * 0.26;
      }
      if (hits.length) {
        const impact = Math.max(...hits.map((hit) => hit.impact));
        game.vehicleHit(impact, this.x - hits[0].nx * r, this.y - hits[0].ny * r, "冰壁");
      }
    }

    resolveObstacles(game) {
      const gatePassable = game.doorOpen > 0.84;
      if (!gatePassable) {
        const dx = this.x - DOOR.x;
        const dy = this.y - DOOR.y;
        const distance = Math.max(0.01, Math.hypot(dx, dy));
        const minDistance = DOOR.r + this.radius - 11;
        if (distance < minDistance) {
          const nx = dx / distance;
          const ny = dy / distance;
          const impact = Math.max(0, -(this.vx * nx + this.vy * ny));
          this.x = DOOR.x + nx * minDistance;
          this.y = DOOR.y + ny * minDistance;
          this.vx += nx * impact * 0.58;
          this.vy += ny * impact * 0.58;
          game.vehicleHit(impact, this.x - nx * this.radius, this.y - ny * this.radius, "气闸外壁");
        }
      }

      for (const pillar of ICE_PILLARS) {
        const dx = this.x - pillar.x;
        const dy = this.y - pillar.y;
        const distance = Math.max(0.01, Math.hypot(dx, dy));
        const minDistance = this.radius + pillar.r;
        if (distance < minDistance) {
          const nx = dx / distance;
          const ny = dy / distance;
          const impact = Math.max(0, -(this.vx * nx + this.vy * ny));
          this.x = pillar.x + nx * minDistance;
          this.y = pillar.y + ny * minDistance;
          this.vx += nx * impact * 0.62;
          this.vy += ny * impact * 0.62;
          game.vehicleHit(impact, this.x - nx * this.radius, this.y - ny * this.radius, "冰脊");
        }
      }
    }
  }

  function lerpAngle(a, b, amount) {
    let delta = ((b - a + Math.PI) % TAU) - Math.PI;
    if (delta < -Math.PI) delta += TAU;
    return a + delta * clamp(amount, 0, 1);
  }
  class Game {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.audio = new AudioEngine();
      this.state = "intro";
      this.paused = false;
      this.autopilot = null;
      this.aimLock = null;
      this.shake = 0;
      this.flash = 0;
      this.particles = [];
      this.tracks = [];
      this.steamBursts = [];
      this.lastTime = performance.now();
      this.reset();
      this.input = new Input(canvas, this);
      this.bindUI();
      requestAnimationFrame((now) => this.loop(now));
    }

    reset() {
      this.vehicle = new Vehicle();
      this.vehicle.reset();
      this.locks = LOCKS.map((lock, index) => ({
        ...lock,
        index,
        frozen: 100,
        thawed: false,
        doneAt: 0,
        glow: 0,
        shake: 0,
      }));
      this.elapsed = 0;
      this.oxygen = 150;
      this.energy = 100;
      this.water = 100;
      this.temperature = 22;
      this.currentDraw = 0.2;
      this.powerHistory = [];
      this.powerSampleAt = 0;
      this.doorOpen = 0;
      this.doorUnlocked = false;
      this.doorOpenedSound = false;
      this.doorPulse = 0;
      this.charging = false;
      this.jet = { active: false, heating: false, hitsLock: -1, aimDistance: 0 };
      this.particles = [];
      this.tracks = [];
      this.steamBursts = [];
      this.shake = 0;
      this.flash = 0;
      this.toast = null;
      this.toastAt = 0;
      this.lastCrosshairCheck = 0;
      this.oxygenWarned = false;
      this.result = null;
      this.autopilot = null;
      this.aimLock = null;
    }

    bindUI() {
      const start = document.getElementById("start-button");
      const restart = document.getElementById("restart-button");
      start.addEventListener("click", () => this.start());
      restart.addEventListener("click", () => {
        document.getElementById("result").hidden = true;
        this.start();
      });
      window.addEventListener("resize", () => {
        this.drawIntroBackdrop = null;
      });
    }

    start() {
      this.reset();
      this.state = "playing";
      this.paused = false;
      document.getElementById("briefing").hidden = true;
      document.getElementById("result").hidden = true;
      this.ensureAudio();
      this.showToast("泵机待命 · 抵达 01 锁点后按住左键预热", 4);
      this.lastTime = performance.now();
    }

    ensureAudio() {
      this.audio.init();
      document.getElementById("audio-hint").hidden = true;
    }

    loop(now) {
      const dt = Math.min((now - this.lastTime) / 1000, 0.034);
      this.lastTime = now;
      if (this.state === "playing" && !this.paused) {
        this.update(dt);
      } else if (this.state === "playing" && this.paused) {
        this.audio.update({ silent: true });
      }
      this.render(now / 1000);
      requestAnimationFrame((time) => this.loop(time));
    }

    update(dt) {
      this.elapsed += dt;
      this.shake = Math.max(0, this.shake - dt * 14);
      this.flash = Math.max(0, this.flash - dt * 4);
      if (this.toast) {
        this.toast.time -= dt;
        if (this.toast.time <= 0) this.toast = null;
      }
      if (this.autopilot?.active) this.updateAutopilot(dt);
      this.vehicle.update(dt, this.input, this);
      this.updateNozzle(dt);
      this.updateLocks(dt);
      this.consumeLifeSupport(dt);
      this.updateDoor(dt);
      this.updateParticles(dt);
      this.checkOutcome();
      this.audio.update({
        speed: this.vehicle.speed,
        throttle: this.vehicle.throttle,
        heating: this.jet.heating,
        jet: this.jet.active,
        steam: this.steamBursts.length > 0,
      });
      if (this.oxygen < 30 && !this.oxygenWarned) {
        this.oxygenWarned = true;
        this.audio.failure();
        this.showToast("警告：氧气储量低于 30 秒", 3.2, true);
      }
    }

    onKey(code) {
      if (this.state === "intro" && (code === "Enter" || code === "Space")) {
        this.start();
        return;
      }
      if (code === "KeyM") {
        const muted = this.audio.toggleMute();
        this.showToast(muted ? "音频已静音" : "音频已恢复", 1.4);
      }
      if (code === "KeyP" || code === "Escape") {
        if (this.state === "playing") this.paused = !this.paused;
      }
      if (this.state !== "playing" || this.paused) return;
      if (code === "KeyF") this.snapToLock();
    }

    snapToLock() {
      const active = this.activeLock();
      if (!active) {
        this.aimLock = PAD;
        this.input.pointer = { x: PAD.x, y: PAD.y };
        this.showToast("目标：气闸撤离区", 1.6);
        return;
      }
      this.aimLock = active;
      this.input.pointer = { x: active.x, y: active.y };
      this.showToast(`炮塔锁定 ${active.label} 锁点`, 1.6);
    }

    activeLock() {
      return this.locks.find((lock) => !lock.thawed) || null;
    }

    getAimAngle(vehicle) {
      if (this.autopilot?.active && this.autopilot.aimPoint) {
        return Math.atan2(this.autopilot.aimPoint.y - vehicle.y, this.autopilot.aimPoint.x - vehicle.x);
      }
      const point = this.aimLock || this.input.pointer;
      return Math.atan2(point.y - vehicle.y, point.x - vehicle.x);
    }

    surfaceAt(x, y) {
      if (GLASS_PATCHES.some((patch) => inEllipse(x, y, patch))) return "glass";
      if (ROUGH_PATCHES.some((patch) => inEllipse(x, y, patch))) return "rough";
      return "packed";
    }

    updateNozzle(dt) {
      const wantsSpray =
        this.input.pointerDown ||
        this.input.keys.has("Space") ||
        Boolean(this.autopilot?.active && this.autopilot.spray);
      const hasSupply = this.water > 0.05 && this.energy > 0.5;
      this.jet.active = false;
      this.jet.heating = false;
      this.jet.hitsLock = -1;

      if (wantsSpray && hasSupply) {
        if (this.temperature < 96) {
          this.temperature = Math.min(96, this.temperature + dt * 59);
          this.jet.heating = true;
        } else {
          this.jet.active = true;
          this.water = Math.max(0, this.water - dt * 4.8);
        }
      } else {
        this.temperature = Math.max(21, this.temperature - dt * 8.5);
      }

      if (!this.jet.active) {
        if (this.charging) this.charging = false;
        return;
      }

      const vehicle = this.vehicle;
      const muzzle = vehicle.muzzle();
      const active = this.activeLock();
      this.jet.aimDistance = 260;
      this.charging = true;
      let hit = null;
      if (active) {
        const toLock = Math.atan2(active.y - muzzle.y, active.x - muzzle.x);
        let angleDelta = Math.abs(((toLock - vehicle.aim + Math.PI * 3) % TAU) - Math.PI);
        const lockDistance = Math.hypot(active.x - muzzle.x, active.y - muzzle.y);
        if (lockDistance < 248 && angleDelta < 0.235) {
          hit = active;
          this.jet.hitsLock = active.index;
          const strength = 1 - smoothstep(130, 248, lockDistance) * 0.52;
          active.frozen = Math.max(0, active.frozen - dt * 28 * strength);
          active.glow = Math.min(1, active.glow + dt * 1.7);
          active.shake = Math.min(1, active.shake + dt * 4);
          this.water = Math.max(0, this.water - dt * strength * 0.5);
          this.spawnSpray(muzzle, vehicle.aim, lockDistance);
          this.spawnSteam(active.x, active.y, 2);
          if (Math.random() < dt * 4) this.audio.thaw();
          if (active.frozen <= 0) this.completeLock(active);
        }
      }
      if (!hit) {
        this.spawnSpray(muzzle, vehicle.aim, 250);
        if (Math.random() < dt * 5 && active) {
          const dx = active.x - muzzle.x;
          const dy = active.y - muzzle.y;
          this.spawnSteam(muzzle.x + Math.cos(vehicle.aim) * Math.min(180, Math.hypot(dx, dy)), muzzle.y + Math.sin(vehicle.aim) * Math.min(180, Math.hypot(dx, dy)), 1);
        }
      }
    }

    spawnSpray(muzzle, angle, length) {
      const count = this.jet.hitsLock >= 0 ? 3 : 2;
      for (let i = 0; i < count; i += 1) {
        const spread = (Math.random() - 0.5) * 0.09;
        const speed = 640 + Math.random() * 260;
        const offset = Math.random() * 30;
        this.particles.push({
          type: "water",
          x: muzzle.x + Math.cos(angle) * offset,
          y: muzzle.y + Math.sin(angle) * offset,
          vx: Math.cos(angle + spread) * speed,
          vy: Math.sin(angle + spread) * speed,
          life: Math.min(0.42, length / speed),
          maxLife: 0.42,
          size: 1.2 + Math.random() * 2.4,
        });
      }
    }

    spawnSteam(x, y, count = 1) {
      for (let i = 0; i < count; i += 1) {
        const angle = Math.random() * TAU;
        const speed = 15 + Math.random() * 45;
        this.particles.push({
          type: "steam",
          x: x + (Math.random() - 0.5) * 12,
          y: y + (Math.random() - 0.5) * 12,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 26,
          life: 0.9 + Math.random() * 1.2,
          maxLife: 2.1,
          size: 4 + Math.random() * 12,
        });
      }
    }

    completeLock(lock) {
      if (lock.thawed) return;
      lock.thawed = true;
      lock.frozen = 0;
      lock.doneAt = this.elapsed;
      this.steamBursts.push({ x: lock.x, y: lock.y, life: 2.8, maxLife: 2.8 });
      for (let i = 0; i < 36; i += 1) {
        const angle = Math.random() * TAU;
        const speed = 40 + Math.random() * 190;
        this.particles.push({
          type: "shard",
          x: lock.x,
          y: lock.y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 0.45 + Math.random() * 0.75,
          maxLife: 1.2,
          size: 2 + Math.random() * 5,
        });
      }
      this.shake = 6;
      this.flash = 0.15;
      this.audio.lockDone();
      if (this.locks.every((item) => item.thawed)) {
        this.doorUnlocked = true;
        this.showToast("三锁解除 · 气闸舱门开启中", 4);
        this.audio.tone(220, 0.9, 0.05, "sawtooth", 440);
      } else {
        const next = this.activeLock();
        this.showToast(`锁点 ${lock.label} 已解冻 · 下一目标 ${next.label}`, 3);
      }
    }

    updateLocks(dt) {
      for (const lock of this.locks) {
        lock.shake = Math.max(0, lock.shake - dt * 1.3);
        if (!lock.thawed) lock.glow = Math.max(0, lock.glow - dt * 0.16);
      }
      for (const burst of this.steamBursts) {
        burst.life -= dt;
      }
      this.steamBursts = this.steamBursts.filter((burst) => burst.life > 0);
    }

    consumeLifeSupport(dt) {
      this.oxygen = Math.max(0, this.oxygen - dt);
      const driving = this.vehicle.throttle * 0.34 + (this.vehicle.speed / 260) * 0.2;
      const pump = this.jet.heating ? 0.8 : 0;
      const jet = this.jet.active ? 0.62 : 0;
      this.currentDraw = 0.14 + driving + pump + jet;
      this.energy = Math.max(0, this.energy - this.currentDraw * dt);
      if (this.elapsed - this.powerSampleAt > 0.24) {
        this.powerSampleAt = this.elapsed;
        this.powerHistory.push(this.currentDraw);
        if (this.powerHistory.length > 74) this.powerHistory.shift();
      }
    }

    updateDoor(dt) {
      if (this.doorUnlocked && this.doorOpen < 1) {
        this.doorOpen = Math.min(1, this.doorOpen + dt / 3.1);
        if (this.doorOpen >= 1 && !this.doorOpenedSound) {
          this.doorOpenedSound = true;
          this.audio.tone(92, 1.2, 0.075, "sawtooth", 46);
          this.showToast("气闸已开启 · 驶入绿色撤离区", 5);
        }
      }
      this.doorPulse += dt;
    }

    updateParticles(dt) {
      for (const particle of this.particles) {
        particle.life -= dt;
        particle.x += particle.vx * dt;
        particle.y += particle.vy * dt;
        if (particle.type === "water") {
          particle.vx *= 0.985;
          particle.vy *= 0.985;
        } else if (particle.type === "steam") {
          particle.vx *= 0.97;
          particle.vy = particle.vy * 0.97 - 14 * dt;
          particle.size += dt * 9;
        } else if (particle.type === "shard") {
          particle.vx *= Math.exp(-1.5 * dt);
          particle.vy *= Math.exp(-1.5 * dt);
        }
      }
      this.particles = this.particles.filter((particle) => particle.life > 0);
      for (const track of this.tracks) track.life -= dt;
      this.tracks = this.tracks.filter((track) => track.life > 0);
    }

    addTrack() {
      const v = this.vehicle;
      const sideX = Math.cos(v.angle + Math.PI / 2);
      const sideY = Math.sin(v.angle + Math.PI / 2);
      this.tracks.push({
        x: v.x - sideX * 18,
        y: v.y - sideY * 18,
        angle: v.angle,
        life: 3.2,
        maxLife: 3.2,
      });
      this.tracks.push({
        x: v.x + sideX * 18,
        y: v.y + sideY * 18,
        angle: v.angle,
        life: 3.2,
        maxLife: 3.2,
      });
    }

    vehicleHit(impact, x, y, source) {
      const vehicle = this.vehicle;
      if (impact < 52 || vehicle.hitCooldown > 0) return;
      vehicle.hitCooldown = 0.38;
      const damage = clamp((impact - 38) * 0.105, 2, 17);
      vehicle.hull = Math.max(0, vehicle.hull - damage);
      this.shake = Math.min(18, 4 + impact * 0.055);
      this.flash = 0.25;
      this.audio.impact(clamp(impact / 190, 0.3, 1));
      for (let i = 0; i < 12; i += 1) {
        const angle = Math.random() * TAU;
        const speed = 30 + Math.random() * 130;
        this.particles.push({
          type: "shard",
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 0.3 + Math.random() * 0.55,
          maxLife: 0.9,
          size: 1.4 + Math.random() * 3.4,
        });
      }
      this.showToast(`车体撞击${source} · 完整度 -${Math.round(damage)}%`, 2.1, true);
    }

    showToast(message, time = 2, warning = false) {
      this.toast = { message, time, maxTime: time, warning };
    }

    checkOutcome() {
      if (this.state !== "playing") return;
      if (this.oxygen <= 0) {
        this.end(false, "氧气耗尽，检修单元失去动力。");
      } else if (this.vehicle.hull <= 0) {
        this.end(false, "车体完整度归零，K-7 已无法继续作业。");
      } else if (this.doorOpen >= 0.995 && dist(this.vehicle, PAD) < 62) {
        this.end(true, "三道锁点全部解冻，K-7 已安全驶入气闸。");
      }
    }

    end(success, reason) {
      if (this.state === "ended") return;
      this.state = "ended";
      this.paused = false;
      this.result = { success, reason };
      this.doorUnlocked = true;
      this.audio.update({ silent: true });
      if (success) {
        this.audio.success();
      } else {
        this.audio.failure();
      }
      const result = document.getElementById("result");
      document.getElementById("result-kicker").textContent = success ? "AIRLOCK CONTROL / CLEARANCE" : "EMERGENCY PROTOCOL";
      document.getElementById("result-title").textContent = success ? "气闸已开启" : "检修中止";
      document.getElementById("result-copy").textContent = reason;
      document.getElementById("result-stats").innerHTML = `
        <div><span>作业耗时</span><strong>${fmtTime(this.elapsed)}</strong></div>
        <div><span>剩余氧气</span><strong>${fmtTime(this.oxygen)}</strong></div>
        <div><span>车体完整度</span><strong>${Math.round(this.vehicle.hull)}%</strong></div>
        <div><span>剩余储水</span><strong>${Math.round(this.water)}%</strong></div>
      `;
      document.getElementById("restart-button").innerHTML = `<span>${success ? "再次出勤" : "重新出勤"}</span><i aria-hidden="true">↻</i>`;
      window.setTimeout(() => {
        result.hidden = false;
      }, success ? 900 : 500);
    }

    startAutopilot() {
      if (this.state === "intro") this.start();
      this.autopilot = { active: true, axis: { x: 0, y: 0 }, brake: false, spray: false, aimPoint: null };
    }

    updateAutopilot(dt) {
      const ap = this.autopilot;
      const vehicle = this.vehicle;
      const active = this.activeLock();
      let target;
      ap.spray = false;
      ap.brake = false;

      if (active) {
        const spots = [
          { x: 946, y: 344 },
          { x: 900, y: 449 },
          { x: 946, y: 554 },
        ];
        target = spots[active.index];
        ap.aimPoint = { x: active.x, y: active.y };
        const toLock = Math.hypot(active.x - vehicle.x, active.y - vehicle.y);
        if (toLock < 238) ap.spray = true;
      } else if (this.doorOpen < 0.9) {
        target = { x: 946, y: 449 };
        ap.aimPoint = { x: DOOR.x, y: DOOR.y };
      } else {
        target = PAD;
        ap.aimPoint = PAD;
      }

      const dx = target.x - vehicle.x;
      const dy = target.y - vehicle.y;
      const distance = Math.hypot(dx, dy);
      if (distance < 24 || (distance < 90 && vehicle.speed > 58)) {
        ap.brake = true;
        ap.axis = { x: 0, y: 0 };
      } else {
        const scale = 1 / Math.max(0.001, distance);
        ap.axis = { x: dx * scale, y: dy * scale };
        if (active && distance < 42) {
          ap.brake = true;
          ap.axis = { x: 0, y: 0 };
        }
      }
    }
  }

  Game.prototype.render = function render(time) {
    const ctx = this.ctx;
    ctx.save();
    ctx.clearRect(0, 0, W, H);
    if (this.shake > 0) {
      ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
    }
    this.drawBackground(time);
    this.drawSurface(time);
    this.drawDoorScene(time);
    this.drawTracks();
    this.drawExtractionPad(time);
    this.drawIcePillars(time);
    this.drawLocks(time);
    this.drawVehicle(time);
    this.drawParticles();
    this.drawJet();
    this.drawSteamBursts();
    ctx.restore();
    this.drawHUD(time);
    this.drawToast();
    if (this.flash > 0) {
      ctx.fillStyle = `rgba(255, 111, 68, ${this.flash * 0.22})`;
      ctx.fillRect(0, 0, W, H);
    }
    if (this.paused) this.drawPause(time);
  };

  Game.prototype.drawBackground = function drawBackground(time) {
    const ctx = this.ctx;
    const base = ctx.createLinearGradient(0, 0, W, H);
    base.addColorStop(0, "#061820");
    base.addColorStop(0.38, "#0a2731");
    base.addColorStop(0.72, "#071a22");
    base.addColorStop(1, "#030c11");
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, W, H);

    const halo = ctx.createRadialGradient(DOOR.x, DOOR.y, 30, DOOR.x, DOOR.y, 560);
    halo.addColorStop(0, this.doorUnlocked ? "rgba(255,153,76,0.18)" : "rgba(80,199,222,0.14)");
    halo.addColorStop(0.46, "rgba(45,125,147,0.07)");
    halo.addColorStop(1, "rgba(2,8,12,0)");
    ctx.fillStyle = halo;
    ctx.fillRect(350, 0, W - 350, H);

    this.drawIceStrata(86, "top");
    this.drawIceStrata(818, "bottom");
    this.drawIceStrata(72, "left");
    this.drawIceStrata(1528, "right");

    ctx.save();
    ctx.globalAlpha = 0.2;
    for (let i = 0; i < 16; i += 1) {
      const x = 100 + seededNoise(i, 2) * 1360;
      const drift = Math.sin(time * 0.08 + i) * 22;
      const y = 150 + seededNoise(i, 8) * 560;
      const radius = 1 + seededNoise(i, 4) * 3;
      ctx.fillStyle = i % 3 === 0 ? "#b6f3ff" : "#5796a6";
      ctx.beginPath();
      ctx.arc(x + drift, y, radius, 0, TAU);
      ctx.fill();
    }
    ctx.restore();

    const lampX = [376, 718, 1030];
    for (const x of lampX) {
      const glow = ctx.createRadialGradient(x, 128, 0, x, 128, 138);
      glow.addColorStop(0, "rgba(255,188,112,0.18)");
      glow.addColorStop(1, "rgba(255,188,112,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(x - 140, 112, 280, 180);
      ctx.fillStyle = "rgba(255,190,112,0.5)";
      ctx.fillRect(x - 18, 118, 36, 4);
      ctx.strokeStyle = "rgba(255,190,112,0.15)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x - 12, 124);
      ctx.lineTo(x + 12, 124);
      ctx.stroke();
    }

    ctx.save();
    ctx.globalAlpha = 0.26;
    ctx.fillStyle = "#071a21";
    ctx.beginPath();
    ctx.roundRect(112, 150, 1380, 620, 28);
    ctx.fill();
    ctx.restore();
  };

  Game.prototype.drawIceStrata = function drawIceStrata(edge, side) {
    const ctx = this.ctx;
    const vertical = side === "left" || side === "right";
    const direction = side === "top" || side === "left" ? 1 : -1;
    for (let band = 0; band < 9; band += 1) {
      const depth = 18 + band * 13;
      const alpha = 0.12 - band * 0.007;
      ctx.fillStyle =
        band % 4 === 0
          ? `rgba(132,222,243,${alpha + 0.08})`
          : band % 3 === 0
            ? `rgba(42,115,133,${alpha + 0.12})`
            : `rgba(20,69,83,${alpha + 0.1})`;
      ctx.beginPath();
      if (vertical) {
        const edgeX = edge + direction * depth;
        for (let y = 0; y <= H; y += 36) {
          const wiggle = Math.sin(y * 0.022 + band * 1.9) * 9 + Math.sin(y * 0.057 + band) * 4;
          if (y === 0) ctx.moveTo(edgeX + wiggle, y);
          else ctx.lineTo(edgeX + wiggle, y);
        }
        ctx.lineTo(edge + direction * (depth + 30), H);
        ctx.lineTo(edge + direction * (depth + 30), 0);
      } else {
        const edgeY = edge + direction * depth;
        for (let x = 0; x <= W; x += 44) {
          const wiggle = Math.sin(x * 0.018 + band * 1.4) * 8 + Math.sin(x * 0.049 + band * 2.1) * 3;
          if (x === 0) ctx.moveTo(x, edgeY + wiggle);
          else ctx.lineTo(x, edgeY + wiggle);
        }
        ctx.lineTo(W, edge + direction * (depth + 36));
        ctx.lineTo(0, edge + direction * (depth + 36));
      }
      ctx.closePath();
      ctx.fill();
    }

    ctx.strokeStyle = "rgba(151,231,244,0.16)";
    ctx.lineWidth = 1;
    ctx.strokeRect(edge - (vertical ? 0 : 0), edge - (vertical ? 0 : 0), vertical ? 1 : W, vertical ? H : 1);
  };

  Game.prototype.drawSurface = function drawSurface(time) {
    const ctx = this.ctx;
    ctx.fillStyle = "rgba(7,28,35,0.86)";
    ctx.fillRect(ARENA.left, ARENA.top, ARENA.right - ARENA.left, ARENA.bottom - ARENA.top);

    const floorGlow = ctx.createRadialGradient(540, 500, 30, 540, 500, 640);
    floorGlow.addColorStop(0, "rgba(91,177,187,0.11)");
    floorGlow.addColorStop(0.65, "rgba(23,68,78,0.05)");
    floorGlow.addColorStop(1, "rgba(2,8,10,0)");
    ctx.fillStyle = floorGlow;
    ctx.fillRect(ARENA.left, ARENA.top, ARENA.right - ARENA.left, ARENA.bottom - ARENA.top);

    ctx.save();
    ctx.strokeStyle = "rgba(112,198,211,0.055)";
    ctx.lineWidth = 1;
    for (let x = 120; x < 1500; x += 96) {
      ctx.beginPath();
      ctx.moveTo(x, ARENA.top);
      ctx.lineTo(x - 28, ARENA.bottom);
      ctx.stroke();
    }
    for (let y = 160; y < 790; y += 74) {
      ctx.beginPath();
      ctx.moveTo(ARENA.left, y);
      ctx.lineTo(ARENA.right, y);
      ctx.stroke();
    }
    ctx.restore();

    for (const patch of GLASS_PATCHES) this.drawPatch(patch, "glass", time);
    for (const patch of ROUGH_PATCHES) this.drawPatch(patch, "rough", time);

    ctx.fillStyle = "rgba(146,225,238,0.21)";
    ctx.font = "600 11px 'Trebuchet MS', 'Noto Sans SC', sans-serif";
    ctx.letterSpacing = "2px";
    ctx.fillText("A-07  EXTERNAL SERVICE APRON", 112, 782);
    ctx.strokeStyle = "rgba(127,219,234,0.18)";
    ctx.beginPath();
    ctx.moveTo(112, 792);
    ctx.lineTo(224, 792);
    ctx.stroke();

    for (let i = 0; i < 5; i += 1) {
      const x = 570 + i * 105;
      drawChevron(ctx, x, 449, 11, "rgba(255,183,105,0.18)");
    }

    ctx.save();
    ctx.strokeStyle = "rgba(207,248,255,0.18)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 11; i += 1) {
      const x = 148 + ((i * 172) % 760);
      const y = 192 + ((i * 91) % 560);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 22, y + 7);
      ctx.lineTo(x + 13, y + 25);
      ctx.lineTo(x + 31, y + 36);
      ctx.stroke();
    }
    ctx.restore();
  };

  Game.prototype.drawPatch = function drawPatch(patch, type, time) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(patch.x, patch.y);
    ctx.rotate(patch.rot);
    if (type === "glass") {
      const gradient = ctx.createLinearGradient(-patch.rx, -patch.ry, patch.rx, patch.ry);
      gradient.addColorStop(0, "rgba(110,220,238,0.09)");
      gradient.addColorStop(0.45, "rgba(98,206,228,0.22)");
      gradient.addColorStop(0.52, "rgba(188,249,255,0.2)");
      gradient.addColorStop(1, "rgba(44,121,139,0.08)");
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.ellipse(0, 0, patch.rx, patch.ry, 0, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = "rgba(178,244,255,0.14)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(0, 0, patch.rx - 3, patch.ry - 3, 0, 0, TAU);
      ctx.stroke();
      ctx.strokeStyle = "rgba(209,251,255,0.2)";
      ctx.lineWidth = 1;
      for (let i = 0; i < 4; i += 1) {
        const y = -patch.ry * 0.55 + i * patch.ry * 0.36;
        ctx.beginPath();
        ctx.moveTo(-patch.rx * 0.62, y);
        ctx.lineTo(patch.rx * 0.2, y - 2);
        ctx.stroke();
      }
    } else {
      ctx.fillStyle = "rgba(45,43,38,0.38)";
      ctx.strokeStyle = "rgba(174,133,90,0.18)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(0, 0, patch.rx, patch.ry, 0, 0, TAU);
      ctx.fill();
      ctx.stroke();
      for (let i = 0; i < 18; i += 1) {
        const x = (seededNoise(i, patch.x) - 0.5) * patch.rx * 1.45;
        const y = (seededNoise(i, patch.y) - 0.5) * patch.ry * 1.35;
        const radius = 1 + seededNoise(i, time * 0.03) * 3;
        ctx.fillStyle = "rgba(171,166,139,0.24)";
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
  };

  Game.prototype.drawDoorScene = function drawDoorScene(time) {
    const ctx = this.ctx;
    const open = this.doorOpen;
    const pulse = 0.5 + Math.sin(time * 3.2) * 0.5;

    ctx.save();
    ctx.beginPath();
    ctx.arc(DOOR.x, DOOR.y, DOOR.r - 7, 0, TAU);
    ctx.clip();
    const interior = ctx.createRadialGradient(DOOR.x + 60, DOOR.y, 10, DOOR.x, DOOR.y, DOOR.r);
    interior.addColorStop(0, "#4e3926");
    interior.addColorStop(0.34, "#1d2c2c");
    interior.addColorStop(0.76, "#0a1b21");
    interior.addColorStop(1, "#031015");
    ctx.fillStyle = interior;
    ctx.fillRect(DOOR.x - DOOR.r, DOOR.y - DOOR.r, DOOR.r * 2, DOOR.r * 2);

    const warm = ctx.createLinearGradient(DOOR.x - 40, 0, DOOR.x + DOOR.r, 0);
    warm.addColorStop(0, "rgba(255,135,58,0)");
    warm.addColorStop(1, "rgba(255,157,77,0.22)");
    ctx.fillStyle = warm;
    ctx.fillRect(DOOR.x, DOOR.y - 150, DOOR.r, 300);
    ctx.strokeStyle = "rgba(255,177,101,0.22)";
    ctx.lineWidth = 3;
    for (let y = DOOR.y - 128; y <= DOOR.y + 128; y += 32) {
      ctx.beginPath();
      ctx.moveTo(DOOR.x - 60, y);
      ctx.lineTo(DOOR.x + DOOR.r, y);
      ctx.stroke();
    }
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.arc(DOOR.x, DOOR.y, DOOR.r - 6, 0, TAU);
    ctx.clip();
    this.drawDoorHalf(-1, open, time);
    this.drawDoorHalf(1, open, time);
    ctx.restore();

    ctx.save();
    const seamGlow = ctx.createLinearGradient(DOOR.x - 14, 0, DOOR.x + 14, 0);
    seamGlow.addColorStop(0, "rgba(255,150,69,0)");
    seamGlow.addColorStop(0.5, this.doorUnlocked ? `rgba(255,154,66,${0.18 + pulse * 0.18})` : "rgba(119,218,237,0.12)");
    seamGlow.addColorStop(1, "rgba(255,150,69,0)");
    ctx.fillStyle = seamGlow;
    ctx.fillRect(DOOR.x - 15, DOOR.y - DOOR.r, 30, DOOR.r * 2);
    ctx.strokeStyle = this.doorUnlocked ? "rgba(255,178,100,0.72)" : "rgba(151,229,244,0.26)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(DOOR.x, DOOR.y - DOOR.r + 8);
    ctx.lineTo(DOOR.x, DOOR.y + DOOR.r - 8);
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = "rgba(2,11,15,0.95)";
    ctx.lineWidth = 20;
    ctx.beginPath();
    ctx.arc(DOOR.x, DOOR.y, DOOR.r + 1, 0, TAU);
    ctx.stroke();
    const ring = ctx.createLinearGradient(DOOR.x - DOOR.r, DOOR.y - DOOR.r, DOOR.x + DOOR.r, DOOR.y + DOOR.r);
    ring.addColorStop(0, "#294b53");
    ring.addColorStop(0.31, "#6b8d91");
    ring.addColorStop(0.52, "#1a353d");
    ring.addColorStop(0.78, "#4f747b");
    ring.addColorStop(1, "#162d34");
    ctx.strokeStyle = ring;
    ctx.lineWidth = 13;
    ctx.beginPath();
    ctx.arc(DOOR.x, DOOR.y, DOOR.r + 6, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = "rgba(144,230,243,0.13)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(DOOR.x, DOOR.y, DOOR.r - 3, 0, TAU);
    ctx.stroke();

    for (let i = 0; i < 28; i += 1) {
      const angle = (i / 28) * TAU;
      const x = DOOR.x + Math.cos(angle) * (DOOR.r + 6);
      const y = DOOR.y + Math.sin(angle) * (DOOR.r + 6);
      ctx.fillStyle = i % 4 === 0 ? "rgba(255,184,103,0.62)" : "rgba(166,209,214,0.34)";
      ctx.beginPath();
      ctx.arc(x, y, i % 4 === 0 ? 2.8 : 1.8, 0, TAU);
      ctx.fill();
    }

    for (let i = 0; i < 3; i += 1) {
      const lock = this.locks[i];
      const start = lock.angle - 0.16;
      ctx.strokeStyle = lock.thawed ? "rgba(124,245,192,0.82)" : "rgba(255,167,85,0.32)";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(DOOR.x, DOOR.y, DOOR.r + 17, start, start + 0.32);
      ctx.stroke();
    }

    ctx.fillStyle = "rgba(5,19,24,0.9)";
    roundRectPath(ctx, DOOR.x - 86, DOOR.y - DOOR.r - 55, 172, 29, 4);
    ctx.fill();
    ctx.strokeStyle = "rgba(151,229,244,0.16)";
    ctx.stroke();
    ctx.fillStyle = "rgba(208,245,249,0.75)";
    ctx.font = "600 11px 'Trebuchet MS', 'Noto Sans SC', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("AIRLOCK 04  /  气闸", DOOR.x, DOOR.y - DOOR.r - 36);
    ctx.textAlign = "left";

    if (this.doorUnlocked) {
      ctx.save();
      ctx.globalAlpha = 0.35 + pulse * 0.3;
      ctx.strokeStyle = "rgba(255,168,82,0.8)";
      ctx.lineWidth = 2;
      ctx.setLineDash([12, 13]);
      ctx.lineDashOffset = -time * 28;
      ctx.beginPath();
      ctx.arc(DOOR.x, DOOR.y, DOOR.r + 34, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  };

  Game.prototype.drawDoorHalf = function drawDoorHalf(side, open, time) {
    const ctx = this.ctx;
    const shift = open * 178;
    ctx.save();
    ctx.translate(DOOR.x + side * shift, DOOR.y);
    const panel = ctx.createLinearGradient(-DOOR.r, 0, DOOR.r, 0);
    panel.addColorStop(0, side < 0 ? "#14333b" : "#2e4e54");
    panel.addColorStop(0.45, side < 0 ? "#385b61" : "#172e36");
    panel.addColorStop(1, "#0b2027");
    ctx.fillStyle = panel;
    ctx.fillRect(side < 0 ? -DOOR.r : 0, -DOOR.r, DOOR.r, DOOR.r * 2);

    ctx.strokeStyle = "rgba(133,201,209,0.12)";
    ctx.lineWidth = 2;
    for (let y = -DOOR.r; y < DOOR.r; y += 46) {
      ctx.beginPath();
      ctx.moveTo(side < 0 ? -DOOR.r : 0, y);
      ctx.lineTo(side < 0 ? 0 : DOOR.r, y + 16);
      ctx.stroke();
    }
    ctx.strokeStyle = "rgba(3,15,19,0.58)";
    ctx.lineWidth = 8;
    for (let x = 42; x < DOOR.r; x += 74) {
      const px = side < 0 ? -x : x;
      ctx.beginPath();
      ctx.moveTo(px, -DOOR.r);
      ctx.lineTo(px, DOOR.r);
      ctx.stroke();
    }
    ctx.strokeStyle = "rgba(140,222,233,0.1)";
    ctx.lineWidth = 1;
    for (let x = 60; x < DOOR.r; x += 74) {
      const px = side < 0 ? -x : x;
      ctx.beginPath();
      ctx.moveTo(px + 5, -DOOR.r);
      ctx.lineTo(px + 5, DOOR.r);
      ctx.stroke();
    }

    const edgeX = side < 0 ? -1 : 1;
    ctx.fillStyle = this.doorUnlocked ? "rgba(255,168,84,0.8)" : "rgba(168,232,241,0.23)";
    ctx.fillRect(edgeX * (side < 0 ? 2 : 0), -DOOR.r * 0.78, edgeX * 4, DOOR.r * 1.56);

    ctx.save();
    ctx.globalAlpha = 0.34;
    ctx.strokeStyle = "rgba(255,183,102,0.7)";
    ctx.lineWidth = 4;
    ctx.setLineDash([9, 12]);
    ctx.lineDashOffset = time * (side < 0 ? 12 : -12);
    ctx.beginPath();
    ctx.moveTo(side * 22, -130);
    ctx.lineTo(side * 22, 130);
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = "rgba(7,22,27,0.72)";
    ctx.beginPath();
    ctx.arc(side * 65, -118, 13, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = "rgba(147,228,240,0.26)";
    ctx.stroke();
    ctx.fillStyle = this.doorUnlocked ? "rgba(255,174,87,0.85)" : "rgba(107,206,223,0.4)";
    ctx.beginPath();
    ctx.arc(side * 65, -118, 3.5, 0, TAU);
    ctx.fill();
    ctx.restore();
  };

  Game.prototype.drawExtractionPad = function drawExtractionPad(time) {
    if (this.doorOpen < 0.04) return;
    const ctx = this.ctx;
    const visibility = smoothstep(0.05, 0.7, this.doorOpen);
    const pulse = 0.5 + Math.sin(time * 4) * 0.5;
    ctx.save();
    ctx.globalAlpha = visibility;
    const glow = ctx.createRadialGradient(PAD.x, PAD.y, 2, PAD.x, PAD.y, 108);
    glow.addColorStop(0, `rgba(106,243,184,${0.18 + pulse * 0.08})`);
    glow.addColorStop(1, "rgba(106,243,184,0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(PAD.x, PAD.y, 108, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = "rgba(124,245,192,0.7)";
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 9]);
    ctx.lineDashOffset = -time * 20;
    ctx.beginPath();
    ctx.arc(PAD.x, PAD.y, PAD.r, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(100,239,182,0.12)";
    ctx.beginPath();
    ctx.arc(PAD.x, PAD.y, PAD.r - 8, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "rgba(166,255,214,0.86)";
    ctx.font = "600 11px 'Trebuchet MS', 'Noto Sans SC', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("撤离", PAD.x, PAD.y + 4);
    ctx.textAlign = "left";
    ctx.restore();
  };

  Game.prototype.drawLocks = function drawLocks(time) {
    const ctx = this.ctx;
    const active = this.activeLock();
    for (const lock of this.locks) {
      const isActive = active === lock;
      const unitX = (lock.x - DOOR.x) / DOOR.r;
      const unitY = (lock.y - DOOR.y) / DOOR.r;
      const pulse = 0.5 + Math.sin(time * 3.5 + lock.index) * 0.5;
      const shakeX = lock.shake > 0 ? (Math.random() - 0.5) * lock.shake * 4 : 0;
      ctx.save();
      ctx.translate(lock.x + shakeX, lock.y);

      ctx.strokeStyle = "rgba(4,14,18,0.85)";
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(-unitX * 18, -unitY * 18);
      ctx.lineTo(unitX * 20, unitY * 20);
      ctx.stroke();

      ctx.fillStyle = lock.thawed ? "rgba(40,99,91,0.92)" : "rgba(22,54,64,0.96)";
      ctx.strokeStyle = lock.thawed ? "rgba(124,245,192,0.8)" : isActive ? "rgba(255,178,100,0.88)" : "rgba(127,215,230,0.34)";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, 0, 34, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = "rgba(176,238,247,0.18)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, 0, 26, 0, TAU);
      ctx.stroke();

      ctx.save();
      ctx.rotate(lock.angle + time * (lock.thawed ? 0.8 : 0));
      for (let i = 0; i < 3; i += 1) {
        ctx.rotate(TAU / 3);
        ctx.fillStyle = lock.thawed ? "rgba(102,231,181,0.7)" : "rgba(98,181,196,0.58)";
        ctx.strokeStyle = "rgba(5,18,23,0.85)";
        ctx.lineWidth = 2;
        roundRectPath(ctx, 19, -5, lock.thawed ? 14 : 23, 10, 3);
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();

      if (lock.thawed) {
        ctx.fillStyle = "rgba(124,245,192,0.2)";
        ctx.beginPath();
        ctx.arc(0, 0, 18, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = "rgba(137,255,203,0.9)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-7, 0);
        ctx.lineTo(-1, 7);
        ctx.lineTo(9, -7);
        ctx.stroke();
      } else {
        const ice = ctx.createRadialGradient(-7, -8, 2, 0, 0, 32);
        ice.addColorStop(0, "rgba(220,252,255,0.88)");
        ice.addColorStop(0.32, "rgba(137,225,241,0.55)");
        ice.addColorStop(1, "rgba(62,139,157,0.12)");
        ctx.fillStyle = ice;
        ctx.beginPath();
        for (let i = 0; i < 13; i += 1) {
          const angle = (i / 13) * TAU;
          const radius = 23 + seededNoise(i, lock.index + 1) * 14;
          const x = Math.cos(angle) * radius;
          const y = Math.sin(angle) * radius;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = "rgba(212,250,255,0.36)";
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.strokeStyle = "rgba(232,253,255,0.34)";
        ctx.beginPath();
        ctx.moveTo(-18, -10);
        ctx.lineTo(-2, 2);
        ctx.lineTo(8, 20);
        ctx.moveTo(4, -17);
        ctx.lineTo(2, -4);
        ctx.lineTo(18, 8);
        ctx.stroke();
      }

      if (isActive) {
        ctx.strokeStyle = `rgba(255,183,100,${0.4 + pulse * 0.4})`;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 6]);
        ctx.lineDashOffset = -time * 18;
        ctx.beginPath();
        ctx.arc(0, 0, 43 + pulse * 2, 0, TAU);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      const labelX = unitX * 78;
      const labelY = unitY * 78;
      ctx.fillStyle = lock.thawed ? "rgba(44,116,101,0.9)" : isActive ? "rgba(102,63,28,0.92)" : "rgba(7,24,30,0.9)";
      roundRectPath(ctx, labelX - 21, labelY - 12, 42, 24, 11);
      ctx.fill();
      ctx.strokeStyle = lock.thawed ? "rgba(124,245,192,0.55)" : isActive ? "rgba(255,185,105,0.7)" : "rgba(135,214,229,0.2)";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = lock.thawed ? "#9cffd3" : isActive ? "#ffc481" : "rgba(166,220,229,0.58)";
      ctx.font = "700 10px 'Trebuchet MS', 'Noto Sans SC', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(lock.label, labelX, labelY + 4);

      if (!lock.thawed) {
        ctx.font = "600 9px 'Trebuchet MS', 'Noto Sans SC', sans-serif";
        ctx.fillStyle = isActive ? "rgba(255,212,166,0.86)" : "rgba(157,209,219,0.42)";
        ctx.fillText(`${Math.ceil(lock.frozen)}%`, labelX, labelY + 27);
        if (isActive) {
          ctx.strokeStyle = "rgba(255,171,87,0.28)";
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(0, 0, 37, -Math.PI / 2, -Math.PI / 2 + TAU * (lock.frozen / 100));
          ctx.stroke();
        }
      }
      ctx.textAlign = "left";
      ctx.restore();
    }
  };

  Game.prototype.drawIcePillars = function drawIcePillars(time) {
    const ctx = this.ctx;
    for (const pillar of ICE_PILLARS) {
      ctx.save();
      ctx.translate(pillar.x, pillar.y);
      ctx.fillStyle = "rgba(0,9,13,0.45)";
      ctx.beginPath();
      ctx.ellipse(9, 11, pillar.r + 10, pillar.r * 0.65, 0.2, 0, TAU);
      ctx.fill();
      const crystal = ctx.createLinearGradient(-pillar.r, -pillar.r, pillar.r, pillar.r);
      crystal.addColorStop(0, "rgba(154,234,247,0.62)");
      crystal.addColorStop(0.38, "rgba(57,145,163,0.76)");
      crystal.addColorStop(1, "rgba(12,40,51,0.96)");
      ctx.fillStyle = crystal;
      ctx.strokeStyle = "rgba(178,243,253,0.28)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i < 9; i += 1) {
        const angle = (i / 9) * TAU - 0.5;
        const radius = pillar.r * (0.78 + seededNoise(i, pillar.seed) * 0.35);
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = "rgba(219,252,255,0.23)";
      ctx.beginPath();
      ctx.moveTo(-5, -pillar.r * 0.72);
      ctx.lineTo(5, 2);
      ctx.lineTo(-3, pillar.r * 0.66);
      ctx.stroke();
      ctx.restore();
    }
  };

  Game.prototype.drawTracks = function drawTracks() {
    const ctx = this.ctx;
    for (const track of this.tracks) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, track.life / track.maxLife) * 0.15;
      ctx.translate(track.x, track.y);
      ctx.rotate(track.angle);
      ctx.fillStyle = "#01080a";
      ctx.fillRect(-7, -2, 14, 4);
      ctx.restore();
    }
  };

  Game.prototype.drawVehicle = function drawVehicle(time) {
    const ctx = this.ctx;
    const vehicle = this.vehicle;
    if (this.state === "ended" && this.result?.success) ctx.globalAlpha = 0.8;

    ctx.save();
    ctx.translate(vehicle.x + 8, vehicle.y + 11);
    ctx.rotate(vehicle.angle);
    ctx.fillStyle = "rgba(0,5,8,0.52)";
    ctx.beginPath();
    ctx.ellipse(0, 0, 35, 24, 0, 0, TAU);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(vehicle.x, vehicle.y);
    ctx.rotate(vehicle.angle);
    const wheelSpin = vehicle.speed * 0.04;
    for (const [x, y] of [[-20, -19], [17, -19], [-20, 19], [17, 19]]) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(wheelSpin);
      ctx.fillStyle = "#071014";
      roundRectPath(ctx, -10, -6, 20, 12, 4);
      ctx.fill();
      ctx.strokeStyle = "rgba(118,175,182,0.28)";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = "rgba(151,205,210,0.24)";
      ctx.fillRect(-6, -4, 3, 8);
      ctx.restore();
    }

    const chassis = ctx.createLinearGradient(-26, -20, 26, 20);
    chassis.addColorStop(0, "#7b8987");
    chassis.addColorStop(0.25, "#c8b995");
    chassis.addColorStop(0.55, "#7c795f");
    chassis.addColorStop(1, "#3e4947");
    ctx.fillStyle = chassis;
    ctx.strokeStyle = "rgba(235,226,193,0.45)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-27, -15);
    ctx.lineTo(18, -18);
    ctx.lineTo(28, -9);
    ctx.lineTo(25, 15);
    ctx.lineTo(-22, 17);
    ctx.lineTo(-29, 8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#172125";
    roundRectPath(ctx, -9, -12, 23, 24, 3);
    ctx.fill();
    ctx.strokeStyle = "rgba(121,218,231,0.24)";
    ctx.stroke();
    ctx.fillStyle = "rgba(255,173,91,0.82)";
    ctx.fillRect(14, -7, 5, 14);
    ctx.fillStyle = "rgba(10,20,21,0.82)";
    ctx.fillRect(-24, -10, 11, 20);
    ctx.fillStyle = "rgba(111,217,231,0.72)";
    ctx.font = "700 7px 'Trebuchet MS', 'Noto Sans SC', sans-serif";
    ctx.fillText("K-7", -22, 3);

    ctx.fillStyle = "rgba(255,238,185,0.9)";
    ctx.beginPath();
    ctx.arc(26, -12, 2.8, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(26, 12, 2.8, 0, TAU);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(vehicle.x, vehicle.y);
    ctx.rotate(vehicle.aim);
    ctx.fillStyle = "#26383a";
    ctx.strokeStyle = "rgba(163,224,230,0.4)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, 12, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = this.jet.heating ? "rgba(255,146,66,0.95)" : this.jet.active ? "rgba(255,219,144,0.96)" : "rgba(125,165,166,0.7)";
    ctx.fillRect(7, -3, 26, 6);
    ctx.fillStyle = "#34494b";
    ctx.fillRect(28, -5, 12, 10);
    ctx.strokeStyle = "rgba(255,195,117,0.6)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(33, -8);
    ctx.lineTo(37, -8);
    ctx.moveTo(33, 8);
    ctx.lineTo(37, 8);
    ctx.stroke();
    ctx.fillStyle = "#3b4b4d";
    ctx.beginPath();
    ctx.arc(-7, 0, 4, 0, TAU);
    ctx.fill();
    ctx.restore();

    const muzzle = vehicle.muzzle();
    const glowSize = this.jet.heating ? 15 : this.jet.active ? 23 : 7;
    const glow = ctx.createRadialGradient(muzzle.x, muzzle.y, 0, muzzle.x, muzzle.y, glowSize);
    const heatAlpha = this.temperature > 75 ? 0.6 : 0.16;
    glow.addColorStop(0, `rgba(255,227,167,${heatAlpha})`);
    glow.addColorStop(1, "rgba(255,140,60,0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(muzzle.x, muzzle.y, glowSize, 0, TAU);
    ctx.fill();

    if (vehicle.hull < 48) {
      ctx.save();
      ctx.globalAlpha = 0.15 + (1 - vehicle.hull / 48) * 0.25;
      for (let i = 0; i < 3; i += 1) {
        const x = vehicle.x - 9 + i * 10;
        const y = vehicle.y - 16 - ((time * 24 + i * 13) % 25);
        ctx.fillStyle = i % 2 ? "#ff8550" : "#303536";
        ctx.beginPath();
        ctx.arc(x, y, 4 + i * 1.5, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }
  };

  Game.prototype.drawParticles = function drawParticles() {
    const ctx = this.ctx;
    for (const particle of this.particles) {
      const alpha = clamp(particle.life / particle.maxLife, 0, 1);
      if (particle.type === "water") {
        ctx.fillStyle = `rgba(255,222,166,${alpha * 0.9})`;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = `rgba(255,245,211,${alpha * 0.2})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(particle.x, particle.y);
        ctx.lineTo(particle.x - particle.vx * 0.018, particle.y - particle.vy * 0.018);
        ctx.stroke();
      } else if (particle.type === "steam") {
        ctx.fillStyle = `rgba(209,242,242,${alpha * 0.13})`;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size, 0, TAU);
        ctx.fill();
      } else if (particle.type === "shard") {
        ctx.fillStyle = `rgba(187,245,252,${alpha * 0.85})`;
        ctx.save();
        ctx.translate(particle.x, particle.y);
        ctx.rotate(Math.atan2(particle.vy, particle.vx));
        ctx.beginPath();
        ctx.moveTo(particle.size * 1.6, 0);
        ctx.lineTo(-particle.size, particle.size * 0.7);
        ctx.lineTo(-particle.size * 0.5, -particle.size * 0.5);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }
  };

  Game.prototype.drawJet = function drawJet() {
    if (!this.jet.active) return;
    const ctx = this.ctx;
    const muzzle = this.vehicle.muzzle();
    const length = 255;
    const endX = muzzle.x + Math.cos(this.vehicle.aim) * length;
    const endY = muzzle.y + Math.sin(this.vehicle.aim) * length;
    ctx.save();
    const jetGradient = ctx.createLinearGradient(muzzle.x, muzzle.y, endX, endY);
    jetGradient.addColorStop(0, "rgba(255,245,212,0.7)");
    jetGradient.addColorStop(0.32, "rgba(255,197,112,0.26)");
    jetGradient.addColorStop(1, "rgba(151,232,241,0)");
    ctx.strokeStyle = jetGradient;
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(muzzle.x, muzzle.y);
    ctx.lineTo(endX, endY);
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,248,222,0.26)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(muzzle.x, muzzle.y);
    ctx.lineTo(endX, endY);
    ctx.stroke();
    ctx.restore();
  };

  Game.prototype.drawSteamBursts = function drawSteamBursts() {
    const ctx = this.ctx;
    for (const burst of this.steamBursts) {
      const t = 1 - burst.life / burst.maxLife;
      const radius = 20 + t * 112;
      ctx.save();
      ctx.globalAlpha = (1 - t) * 0.22;
      const steam = ctx.createRadialGradient(burst.x, burst.y, 5, burst.x, burst.y, radius);
      steam.addColorStop(0, "rgba(247,255,250,0.8)");
      steam.addColorStop(0.42, "rgba(188,237,235,0.32)");
      steam.addColorStop(1, "rgba(153,220,224,0)");
      ctx.fillStyle = steam;
      ctx.beginPath();
      ctx.arc(burst.x, burst.y, radius, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  };

  Game.prototype.drawHUD = function drawHUD(time) {
    const ctx = this.ctx;
    const active = this.activeLock();
    const topFade = ctx.createLinearGradient(0, 0, 0, 112);
    topFade.addColorStop(0, "rgba(2,11,15,0.96)");
    topFade.addColorStop(0.78, "rgba(3,15,20,0.88)");
    topFade.addColorStop(1, "rgba(3,15,20,0)");
    ctx.fillStyle = topFade;
    ctx.fillRect(0, 0, W, 112);

    ctx.strokeStyle = "rgba(142,233,255,0.12)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(38, 94);
    ctx.lineTo(W - 38, 94);
    ctx.stroke();

    this.drawBrand(time);
    this.drawObjective(active, time);
    this.drawLockProgress(time);
    this.drawOxygen(time);
    this.drawLowerHUD(time);
    this.drawCrosshair(time);
  };

  Game.prototype.drawBrand = function drawBrand() {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(64, 46);
    ctx.strokeStyle = "rgba(140,231,249,0.65)";
    ctx.fillStyle = "rgba(99,193,211,0.08)";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (let i = 0; i < 6; i += 1) {
      const angle = -Math.PI / 2 + (i / 6) * TAU;
      const x = Math.cos(angle) * 18;
      const y = Math.sin(angle) * 18;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,176,94,0.85)";
    ctx.beginPath();
    ctx.moveTo(0, -10);
    ctx.lineTo(0, 10);
    ctx.moveTo(-8, -5);
    ctx.lineTo(8, 5);
    ctx.moveTo(-8, 5);
    ctx.lineTo(8, -5);
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = "#d9f7fa";
    ctx.font = "700 15px 'Trebuchet MS', 'Noto Sans SC', sans-serif";
    ctx.fillText("ICEBREAKER", 98, 41);
    ctx.fillStyle = "rgba(141,204,214,0.54)";
    ctx.font = "600 9px 'Trebuchet MS', 'Noto Sans SC', sans-serif";
    ctx.fillText("DEEP STATION 04  /  EXT. REPAIR", 98, 58);
    ctx.fillStyle = "rgba(255,173,91,0.8)";
    ctx.fillRect(36, 76, 55, 2);
    ctx.fillStyle = "rgba(141,204,214,0.36)";
    ctx.fillRect(94, 76, 164, 1);
  };

  Game.prototype.drawObjective = function drawObjective(active, time) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(385, 33);
    ctx.fillStyle = "rgba(255,180,99,0.74)";
    ctx.font = "700 9px 'Trebuchet MS', 'Noto Sans SC', sans-serif";
    ctx.fillText("CURRENT DIRECTIVE  /  当前任务", 0, 0);
    let title = "舱门冰封 · 待解除";
    let detail = "按 F 锁定最近锁点";
    if (active) {
      title = `解冻锁点 ${active.label}`;
      detail = "靠近锁点 · 瞄准后按住喷射";
      if (this.jet.heating) detail = "泵机预热中 · 稳住炮塔";
      if (this.jet.active && this.jet.hitsLock === active.index) detail = "热水命中 · 持续解冻";
    } else if (this.doorOpen < 0.995) {
      title = "三锁解除 · 气闸开启中";
      detail = `舱门开度 ${Math.round(this.doorOpen * 100)}%`;
    } else {
      title = "进入气闸 · 完成撤离";
      detail = "驶入舱门内的绿色撤离区";
    }
    ctx.fillStyle = "#e8fbfd";
    ctx.font = "600 17px 'Trebuchet MS', 'Noto Sans SC', sans-serif";
    ctx.fillText(title, 0, 25);
    ctx.fillStyle = this.jet.heating ? "rgba(255,188,113,0.8)" : "rgba(154,211,220,0.58)";
    ctx.font = "500 10px 'Trebuchet MS', 'Noto Sans SC', sans-serif";
    ctx.fillText(detail, 0, 43);
    if (active) {
      ctx.fillStyle = "rgba(255,175,93,0.8)";
      ctx.fillRect(0, 54, 3, 3);
      ctx.fillStyle = "rgba(154,211,220,0.38)";
      ctx.font = "500 9px 'Trebuchet MS', 'Noto Sans SC', sans-serif";
      ctx.fillText(`THERMAL CHARGE  ${String(Math.round(100 - active.frozen)).padStart(3, "0")}%`, 9, 58);
    }
    ctx.restore();
  };

  Game.prototype.drawLockProgress = function drawLockProgress(time) {
    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = "rgba(155,215,225,0.44)";
    ctx.font = "700 9px 'Trebuchet MS', 'Noto Sans SC', sans-serif";
    ctx.fillText("LOCK SEQUENCE", 807, 30);
    for (let i = 0; i < 3; i += 1) {
      const lock = this.locks[i];
      const x = 807 + i * 88;
      const y = 47;
      const isActive = !lock.thawed && this.locks.slice(0, i).every((item) => item.thawed);
      ctx.fillStyle = lock.thawed ? "rgba(50,113,99,0.48)" : isActive ? "rgba(104,67,31,0.54)" : "rgba(10,31,38,0.68)";
      roundRectPath(ctx, x, y, 72, 32, 4);
      ctx.fill();
      ctx.strokeStyle = lock.thawed ? "rgba(124,245,192,0.55)" : isActive ? "rgba(255,181,101,0.62)" : "rgba(132,204,216,0.13)";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = lock.thawed ? "#8dffd0" : isActive ? "#ffc27c" : "rgba(144,199,209,0.35)";
      ctx.font = "700 9px 'Trebuchet MS', 'Noto Sans SC', sans-serif";
      ctx.fillText(lock.label, x + 10, y + 13);
      ctx.fillStyle = "rgba(2,12,16,0.72)";
      ctx.fillRect(x + 10, y + 19, 52, 4);
      ctx.fillStyle = lock.thawed ? "rgba(105,244,185,0.85)" : isActive ? "rgba(255,173,88,0.9)" : "rgba(112,178,190,0.3)";
      const progress = lock.thawed ? 1 : 1 - lock.frozen / 100;
      ctx.fillRect(x + 10, y + 19, 52 * progress, 4);
      if (isActive) {
        ctx.fillStyle = `rgba(255,176,94,${0.35 + Math.sin(time * 4) * 0.2})`;
        ctx.fillRect(x, y - 2, 72, 1);
      }
      if (i < 2) {
        ctx.fillStyle = "rgba(137,197,208,0.2)";
        ctx.fillRect(x + 76, y + 16, 8, 1);
      }
    }
    ctx.restore();
  };

  Game.prototype.drawOxygen = function drawOxygen(time) {
    const ctx = this.ctx;
    const x = 1265;
    const low = this.oxygen < 30;
    const blink = 0.65 + Math.sin(time * 7) * 0.25;
    ctx.save();
    ctx.fillStyle = "rgba(7,24,30,0.54)";
    roundRectPath(ctx, x, 22, 247, 57, 5);
    ctx.fill();
    ctx.strokeStyle = low ? `rgba(255,98,80,${blink})` : "rgba(140,222,236,0.14)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = low ? `rgba(255,119,95,${blink})` : "rgba(164,225,235,0.5)";
    ctx.font = "700 9px 'Trebuchet MS', 'Noto Sans SC', sans-serif";
    ctx.fillText("OXYGEN  /  O₂", x + 14, 39);
    ctx.fillStyle = low ? "#ff8a77" : "#dffafc";
    ctx.font = "700 25px 'Trebuchet MS', 'Noto Sans SC', sans-serif";
    ctx.fillText(fmtTime(this.oxygen), x + 13, 67);
    ctx.fillStyle = "rgba(3,12,16,0.8)";
    ctx.fillRect(x + 101, 44, 128, 5);
    ctx.fillStyle = low ? "rgba(255,92,75,0.92)" : "rgba(110,224,232,0.82)";
    ctx.fillRect(x + 101, 44, 128 * clamp(this.oxygen / 150, 0, 1), 5);
    ctx.fillStyle = "rgba(161,213,222,0.38)";
    ctx.font = "500 8px 'Trebuchet MS', 'Noto Sans SC', sans-serif";
    ctx.fillText("LIFE SUPPORT", x + 101, 61);
    ctx.fillText("150s CAP", x + 190, 61);
    ctx.restore();
  };

  Game.prototype.drawLowerHUD = function drawLowerHUD(time) {
    const ctx = this.ctx;
    const fade = ctx.createLinearGradient(0, 790, 0, H);
    fade.addColorStop(0, "rgba(2,10,14,0)");
    fade.addColorStop(0.25, "rgba(2,10,14,0.86)");
    fade.addColorStop(1, "rgba(2,8,11,0.98)");
    ctx.fillStyle = fade;
    ctx.fillRect(0, 790, W, H - 790);
    ctx.strokeStyle = "rgba(139,225,241,0.12)";
    ctx.beginPath();
    ctx.moveTo(38, 811);
    ctx.lineTo(W - 38, 811);
    ctx.stroke();

    this.drawPanel(38, 822, 396, 60, this.vehicle.hull < 45 ? "rgba(255,91,82,0.55)" : "rgba(139,225,241,0.22)");
    ctx.fillStyle = "rgba(170,226,235,0.45)";
    ctx.font = "700 8px 'Trebuchet MS', 'Noto Sans SC', sans-serif";
    ctx.fillText("K-7  EXTERNAL REPAIR UNIT", 54, 838);
    ctx.fillStyle = "#dffafc";
    ctx.font = "600 14px 'Trebuchet MS', 'Noto Sans SC', sans-serif";
    ctx.fillText("车体完整度", 54, 858);
    ctx.fillStyle = this.vehicle.hull < 45 ? "#ff7c68" : "#dffafc";
    ctx.font = "700 16px 'Trebuchet MS', 'Noto Sans SC', sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(`${Math.ceil(this.vehicle.hull)}%`, 246, 859);
    ctx.textAlign = "left";
    ctx.fillStyle = "rgba(2,12,16,0.82)";
    ctx.fillRect(54, 867, 192, 4);
    ctx.fillStyle = this.vehicle.hull < 45 ? "rgba(255,95,78,0.9)" : this.vehicle.hull < 75 ? "rgba(255,181,93,0.9)" : "rgba(124,245,192,0.82)";
    ctx.fillRect(54, 867, 192 * (this.vehicle.hull / 100), 4);

    const frictionLabel = this.vehicle.surface === "glass" ? "镜面冰 · 低摩擦" : this.vehicle.surface === "rough" ? "碎冰面 · 高摩擦" : "压实雪 · 标准";
    const frictionColor = this.vehicle.surface === "glass" ? "rgba(126,222,239,0.84)" : this.vehicle.surface === "rough" ? "rgba(255,180,104,0.84)" : "rgba(174,220,210,0.72)";
    ctx.fillStyle = frictionColor;
    ctx.font = "500 9px 'Trebuchet MS', 'Noto Sans SC', sans-serif";
    ctx.fillText(frictionLabel, 266, 856);
    ctx.strokeStyle = "rgba(130,205,218,0.2)";
    ctx.beginPath();
    ctx.arc(282, 868, 6, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = frictionColor;
    ctx.beginPath();
    ctx.arc(282, 868, 2, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "rgba(151,207,216,0.34)";
    ctx.font = "500 8px 'Trebuchet MS', 'Noto Sans SC', sans-serif";
    ctx.fillText("TRACTION SURFACE", 266, 883);

    this.drawPanel(452, 822, 720, 60, "rgba(255,166,86,0.24)");
    const meterW = 182;
    this.drawResourceMeter(472, 843, meterW, "储水", this.water, "WATER", "#72e3ee", this.jet.active);
    this.drawResourceMeter(695, 843, meterW, "喷嘴温度", this.temperature, "THERMAL", this.temperature > 80 ? "#ffad5f" : "#d7eef1", this.jet.heating);
    this.drawResourceMeter(918, 843, meterW, "电池", this.energy, "POWER", "#ffd183", this.currentDraw > 1.2);
    ctx.fillStyle = "rgba(7,21,27,0.72)";
    roundRectPath(ctx, 472, 864, meterW, 12, 2);
    ctx.fill();
    this.drawPowerTrace(474, 865, meterW - 4, 10);
    ctx.fillStyle = "rgba(154,210,220,0.34)";
    ctx.font = "500 8px 'Trebuchet MS', 'Noto Sans SC', sans-serif";
    ctx.fillText(`LOAD  ${this.currentDraw.toFixed(2)} kW`, 1030, 872);
    ctx.fillStyle = this.water < 18 ? "rgba(255,104,84,0.8)" : "rgba(126,225,236,0.5)";
    ctx.font = "500 8px 'Trebuchet MS', 'Noto Sans SC', sans-serif";
    ctx.fillText(this.jet.heating ? "PREHEAT 1.3s" : this.jet.active ? "PUMPING / HOT WATER" : "NOZZLE READY", 472, 884);

    this.drawPanel(1192, 822, 370, 60, "rgba(139,225,241,0.18)");
    ctx.fillStyle = "rgba(167,224,234,0.42)";
    ctx.font = "700 8px 'Trebuchet MS', 'Noto Sans SC', sans-serif";
    ctx.fillText("VELOCITY", 1209, 838);
    ctx.fillStyle = "#e2fbfd";
    ctx.font = "700 25px 'Trebuchet MS', 'Noto Sans SC', sans-serif";
    ctx.fillText(String(Math.round(this.vehicle.speed)).padStart(3, "0"), 1208, 868);
    ctx.fillStyle = "rgba(147,205,215,0.4)";
    ctx.font = "500 8px 'Trebuchet MS', 'Noto Sans SC', sans-serif";
    ctx.fillText("UNIT/S", 1267, 866);
    ctx.fillStyle = "rgba(149,207,217,0.42)";
    ctx.font = "500 9px 'Trebuchet MS', 'Noto Sans SC', sans-serif";
    ctx.fillText("WASD 驾驶  ·  F 锁定", 1334, 844);
    ctx.fillText("左键 / Space 喷射", 1334, 860);
    ctx.fillText("P 暂停  ·  M 静音", 1334, 876);
    for (let i = 0; i < 5; i += 1) {
      ctx.fillStyle = i < Math.ceil(this.vehicle.throttle * 5) ? "rgba(255,178,94,0.7)" : "rgba(125,184,195,0.16)";
      ctx.fillRect(1209 + i * 16, 875, 11, 2);
    }
  };

  Game.prototype.drawResourceMeter = function drawResourceMeter(x, y, width, label, value, code, color, active) {
    const ctx = this.ctx;
    const ratio = clamp(value / 100, 0, 1);
    ctx.fillStyle = "rgba(158,218,228,0.5)";
    ctx.font = "500 9px 'Trebuchet MS', 'Noto Sans SC', sans-serif";
    ctx.fillText(label, x, y - 6);
    ctx.fillStyle = "rgba(139,202,213,0.28)";
    ctx.font = "700 7px 'Trebuchet MS', 'Noto Sans SC', sans-serif";
    ctx.fillText(code, x + width - (code.length * 4.7), y - 6);
    ctx.fillStyle = "#e5fbfd";
    ctx.font = "700 16px 'Trebuchet MS', 'Noto Sans SC', sans-serif";
    ctx.fillText(`${Math.round(value)}%`, x, y + 16);
    ctx.fillStyle = "rgba(2,12,16,0.82)";
    ctx.fillRect(x + 50, y + 8, width - 50, 4);
    ctx.fillStyle = color;
    ctx.globalAlpha = active ? 0.92 : 0.7;
    ctx.fillRect(x + 50, y + 8, (width - 50) * ratio, 4);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = "rgba(121,190,201,0.12)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y + 22);
    ctx.lineTo(x + width, y + 22);
    ctx.stroke();
  };

  Game.prototype.drawPowerTrace = function drawPowerTrace(x, y, width, height) {
    const ctx = this.ctx;
    if (this.powerHistory.length < 2) return;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, width, height);
    ctx.clip();
    ctx.strokeStyle = "rgba(255,200,123,0.7)";
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    for (let i = 0; i < this.powerHistory.length; i += 1) {
      const px = x + (i / 73) * width;
      const py = y + height - clamp(this.powerHistory[i] / 2.4, 0, 1) * height;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.restore();
  };

  Game.prototype.drawPanel = function drawPanel(x, y, width, height, accent) {
    const ctx = this.ctx;
    ctx.fillStyle = "rgba(4,18,24,0.68)";
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 8, y);
    ctx.lineTo(x + width - 2, y);
    ctx.lineTo(x + width, y + 2);
    ctx.lineTo(x + width, y + height - 8);
    ctx.lineTo(x + width - 8, y + height);
    ctx.lineTo(x + 2, y + height);
    ctx.lineTo(x, y + height - 2);
    ctx.lineTo(x, y + 8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = accent;
    ctx.fillRect(x + 8, y - 1, 28, 2);
  };

  Game.prototype.drawCrosshair = function drawCrosshair(time) {
    if (this.state !== "playing" || this.paused) return;
    const ctx = this.ctx;
    const point = this.aimLock || this.input.pointer;
    const active = this.activeLock();
    let inRange = false;
    if (active) {
      const muzzle = this.vehicle.muzzle();
      const toLock = Math.atan2(active.y - muzzle.y, active.x - muzzle.x);
      const delta = Math.abs(((toLock - this.vehicle.aim + Math.PI * 3) % TAU) - Math.PI);
      inRange = Math.hypot(active.x - muzzle.x, active.y - muzzle.y) < 248 && delta < 0.235;
    }
    const color = this.jet.active && this.jet.hitsLock >= 0 ? "rgba(255,184,98,0.96)" : inRange ? "rgba(255,178,92,0.85)" : "rgba(139,229,243,0.65)";
    ctx.save();
    ctx.translate(point.x, point.y);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.arc(0, 0, 14 + Math.sin(time * 4) * 2, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(-23, 0);
    ctx.lineTo(-9, 0);
    ctx.moveTo(9, 0);
    ctx.lineTo(23, 0);
    ctx.moveTo(0, -23);
    ctx.lineTo(0, -9);
    ctx.moveTo(0, 9);
    ctx.lineTo(0, 23);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(0, 0, 2, 0, TAU);
    ctx.fill();
    if (active && inRange) {
      ctx.fillStyle = "rgba(7,20,25,0.78)";
      roundRectPath(ctx, 17, 18, 75, 18, 3);
      ctx.fill();
      ctx.fillStyle = color;
      ctx.font = "600 8px 'Trebuchet MS', 'Noto Sans SC', sans-serif";
      ctx.fillText(this.jet.active ? "热水解冻中" : "可喷射", 24, 30);
    }
    ctx.restore();
  };

  Game.prototype.drawToast = function drawToast() {
    if (!this.toast) return;
    const ctx = this.ctx;
    const fadeIn = clamp((this.toast.maxTime - this.toast.time) / 0.2, 0, 1);
    const fadeOut = clamp(this.toast.time / 0.35, 0, 1);
    const alpha = Math.min(fadeIn, fadeOut);
    const warning = this.toast.warning;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = "600 11px 'Trebuchet MS', 'Noto Sans SC', sans-serif";
    const width = Math.min(600, ctx.measureText(this.toast.message).width + 56);
    const x = W / 2 - width / 2;
    ctx.fillStyle = warning ? "rgba(63,22,18,0.9)" : "rgba(6,26,32,0.88)";
    roundRectPath(ctx, x, 114, width, 30, 4);
    ctx.fill();
    ctx.strokeStyle = warning ? "rgba(255,110,86,0.55)" : "rgba(132,226,240,0.22)";
    ctx.stroke();
    ctx.fillStyle = warning ? "#ff9d87" : "rgba(210,245,248,0.85)";
    ctx.textAlign = "center";
    ctx.fillText(this.toast.message, W / 2, 134);
    ctx.textAlign = "left";
    ctx.restore();
  };

  Game.prototype.drawPause = function drawPause(time) {
    const ctx = this.ctx;
    ctx.fillStyle = "rgba(1,8,11,0.72)";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "rgba(7,24,30,0.96)";
    roundRectPath(ctx, W / 2 - 220, H / 2 - 105, 440, 210, 8);
    ctx.fill();
    ctx.strokeStyle = "rgba(139,228,242,0.26)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = "rgba(255,178,96,0.8)";
    ctx.font = "700 9px 'Trebuchet MS', 'Noto Sans SC', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("SYSTEM PAUSED", W / 2, H / 2 - 55);
    ctx.fillStyle = "#e3fbfd";
    ctx.font = "700 30px 'Trebuchet MS', 'Noto Sans SC', sans-serif";
    ctx.fillText("作业暂停", W / 2, H / 2 - 14);
    ctx.fillStyle = "rgba(159,215,224,0.58)";
    ctx.font = "500 11px 'Trebuchet MS', 'Noto Sans SC', sans-serif";
    ctx.fillText("氧气计时已暂停", W / 2, H / 2 + 18);
    ctx.fillStyle = `rgba(255,188,111,${0.55 + Math.sin(time * 3) * 0.25})`;
    ctx.font = "600 11px 'Trebuchet MS', 'Noto Sans SC', sans-serif";
    ctx.fillText("按 P 或 Esc 继续", W / 2, H / 2 + 58);
    ctx.textAlign = "left";
  };

  function roundRectPath(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, Math.abs(width) / 2, Math.abs(height) / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function drawChevron(ctx, x, y, size, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - size, y - size);
    ctx.lineTo(x, y);
    ctx.lineTo(x - size, y + size);
    ctx.stroke();
  }
  /* RENDER_OVERLAY */

  const canvas = document.getElementById("game");
  const game = new Game(canvas);
  window.__iceGate = game;
})();
