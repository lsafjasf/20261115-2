(function () {
  "use strict";

  const BP = (window.BP = window.BP || {});
  const TAU = Math.PI * 2;
  const DEG = Math.PI / 180;

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const lerp = (a, b, t) => a + (b - a) * t;
  const damp = (a, b, rate, dt) => lerp(a, b, 1 - Math.exp(-rate * dt));
  const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
  const angleDiff = (a, b) => ((a - b + 540) % 360) - 180;
  const pad2 = (value) => String(value).padStart(2, "0");
  const formatTime = (seconds) => {
    const safe = Math.max(0, Math.floor(seconds));
    return `${pad2(Math.floor(safe / 60))}:${pad2(safe % 60)}`;
  };

  function hashString(value) {
    let hash = 2166136261;
    for (let i = 0; i < value.length; i += 1) {
      hash ^= value.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function mulberry32(seed) {
    let state = seed >>> 0;
    return function random() {
      state += 0x6d2b79f5;
      let value = state;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
  }

  function pointSegmentDistance(px, py, ax, ay, bx, by) {
    const abx = bx - ax;
    const aby = by - ay;
    const lengthSq = abx * abx + aby * aby;
    if (lengthSq === 0) return dist(px, py, ax, ay);
    const t = clamp(((px - ax) * abx + (py - ay) * aby) / lengthSq, 0, 1);
    return dist(px, py, ax + abx * t, ay + aby * t);
  }

  class ReefField {
    constructor(seedText) {
      this.seedText = String(seedText || "NIGHT-407").trim().toUpperCase() || "NIGHT-407";
      this.seed = hashString(this.seedText);
      this.random = mulberry32(this.seed);
      this.width = 2800;
      this.height = 1000;
      this.start = { x: 135, y: 500 };
      this.lighthouse = { x: 2665, y: 500 };
      this.gates = [];
      this.groups = [];
      this.reefs = [];
      this.waypoints = [];
      this.wave = { direction: 0, strength: 0 };
      this.generate();
    }

    randomBetween(min, max) {
      return min + this.random() * (max - min);
    }

    generate() {
      const gateXs = [665, 1270, 1875, 2420];
      let center = 500;

      for (let index = 0; index < gateXs.length; index += 1) {
        center = clamp(
          center + this.randomBetween(-245, 245),
          220,
          780
        );
        const channelHalf = this.randomBetween(84, 106);
        const gate = {
          index,
          x: gateXs[index],
          y: center,
          center,
          channelHalf,
          rocks: [],
          passed: false,
          touched: false
        };
        this.gates.push(gate);
        this.groups.push(gate);
      }

      this.start.y = this.gates[0].center;
      this.lighthouse.y = clamp(this.gates[3].center, 260, 740);
      this.waypoints = [
        { x: this.start.x, y: this.start.y },
        ...this.gates.map((gate) => ({ x: gate.x, y: gate.center })),
        { x: this.lighthouse.x, y: this.lighthouse.y }
      ];

      this.gates.forEach((gate) => this.generateGroup(gate));
      this.wave.direction = Math.round(this.randomBetween(0, 359));
      this.wave.strength = this.randomBetween(10, 19);
      this.validation = this.validateChannel();
    }

    generateGroup(gate) {
      const attempts = 46;
      const band = 67;
      for (let i = 0; i < attempts; i += 1) {
        const radius = this.randomBetween(17, 42);
        const x = gate.x + this.randomBetween(-band, band);
        const y = this.randomBetween(-35, this.height + 35);
        const centered = Math.abs(y - gate.center);
        const channelLimit = gate.channelHalf + radius + 12;
        if (centered < channelLimit) continue;
        if (this.reefs.some((reef) => dist(x, y, reef.x, reef.y) < (radius + reef.r) * 0.58)) {
          continue;
        }

        const shape = [];
        const segments = 9 + Math.floor(this.random() * 5);
        for (let pointIndex = 0; pointIndex < segments; pointIndex += 1) {
          const angle = (pointIndex / segments) * TAU + this.randomBetween(-0.11, 0.11);
          const radial = radius * this.randomBetween(0.78, 1.14);
          shape.push({ x: Math.cos(angle) * radial, y: Math.sin(angle) * radial * 0.82 });
        }

        const reef = {
          id: this.reefs.length,
          group: gate.index,
          x,
          y,
          r: radius,
          depth: this.randomBetween(0.35, 1.55),
          shade: this.random(),
          shape
        };
        gate.rocks.push(reef);
        this.reefs.push(reef);
      }
    }

    nearestReef(x, y, maxDistance = Infinity) {
      let nearest = null;
      let bestDistance = maxDistance;
      for (const reef of this.reefs) {
        const current = dist(x, y, reef.x, reef.y) - reef.r;
        if (current < bestDistance) {
          bestDistance = current;
          nearest = reef;
        }
      }
      return nearest ? { reef: nearest, clearance: bestDistance } : null;
    }

    getDepth(x, y) {
      let depth = 19.4;
      for (const reef of this.reefs) {
        const centerDistance = dist(x, y, reef.x, reef.y);
        const edgeDistance = centerDistance - reef.r;
        if (edgeDistance < 150) {
          const shelf = clamp(edgeDistance / 150, 0, 1);
          depth = Math.min(depth, 0.45 + Math.pow(shelf, 1.25) * 14.8);
        }
      }
      const boundary = Math.min(y, this.height - y);
      depth = Math.min(depth, 2 + boundary * 0.055);
      return clamp(depth, 0.25, 19.4);
    }

    isColliding(x, y, radius) {
      return this.reefs.find((reef) => dist(x, y, reef.x, reef.y) < reef.r + radius) || null;
    }

    validateChannel() {
      let minimum = Infinity;
      let failPoint = null;
      for (let index = 0; index < this.waypoints.length - 1; index += 1) {
        const from = this.waypoints[index];
        const to = this.waypoints[index + 1];
        const steps = Math.ceil(dist(from.x, from.y, to.x, to.y) / 12);
        for (let step = 0; step <= steps; step += 1) {
          const t = step / steps;
          const x = lerp(from.x, to.x, t);
          const y = lerp(from.y, to.y, t);
          for (const reef of this.reefs) {
            const clearance = dist(x, y, reef.x, reef.y) - reef.r;
            if (clearance < minimum) {
              minimum = clearance;
              if (clearance <= 17) failPoint = { x, y, reef: reef.id };
            }
          }
        }
      }
      return {
        ok: minimum > 17,
        minClearance: Math.max(0, minimum),
        failPoint
      };
    }
  }

  class Game {
    constructor(seedText, events) {
      this.events = events || {};
      this.reset(seedText);
    }

    emit(type, detail) {
      if (typeof this.events[type] === "function") {
        this.events[type](detail);
      }
    }

    reset(seedText) {
      this.field = new ReefField(seedText);
      this.mode = "ready";
      this.elapsed = 0;
      this.timeScale = 1;
      this.pingCount = 0;
      this.hits = 0;
      this.pingCooldown = 0;
      this.hitCooldown = 0;
      this.depthTimer = 0;
      this.boundaryCooldown = 0;
      this.overheatLatched = false;
      this.lowDepthLatched = false;
      this.lastDepth = this.field.getDepth(this.field.start.x, this.field.start.y);
      this.depthHistory = Array.from({ length: 100 }, () => this.lastDepth);
      this.trail = [];
      this.trailTimer = 0;
      this.sonarPulses = [];
      this.sonarRevealUntil = 0;
      this.sonarRevealRadius = 0;
      this.input = { nav: 0, throttle: 0 };
      this.boat = {
        x: this.field.start.x,
        y: this.field.start.y,
        heading: 90,
        throttle: 0.18,
        engineSpeed: 0,
        groundSpeed: 0,
        temp: 44,
        hull: 3,
        depth: this.lastDepth,
        clearance: this.field.nearestReef(this.field.start.x, this.field.start.y).clearance
      };
      this.field.gates.forEach((gate) => {
        gate.passed = false;
        gate.touched = false;
        gate.announced = false;
      });
      this.lastEcho = null;
    }

    start() {
      if (this.mode === "running") return true;
      this.mode = "running";
      this.elapsed = 0;
      this.emit("start", { field: this.field, boat: this.boat });
      return true;
    }

    stop() {
      if (this.mode === "running") this.mode = "paused";
    }

    setNavInput(value) {
      this.input.nav = clamp(value, -1, 1);
    }

    setThrottleInput(value) {
      this.input.throttle = clamp(value, -1, 1);
    }

    headingFor(targetX, targetY) {
      return (Math.atan2(targetX - this.boat.x, this.boat.y - targetY) / DEG + 360) % 360;
    }

    update(dt) {
      if (this.mode !== "running") return;
      const step = Math.min(dt, 0.05) * this.timeScale;
      this.elapsed += step;
      this.pingCooldown = Math.max(0, this.pingCooldown - step);
      this.hitCooldown = Math.max(0, this.hitCooldown - step);
      this.boundaryCooldown = Math.max(0, this.boundaryCooldown - step);

      const boat = this.boat;
      const speedFactor = clamp(boat.engineSpeed / 135, 0, 1);
      const turnRate = 16 + 47 * (0.35 + speedFactor * 0.65);
      boat.heading = (boat.heading + this.input.nav * turnRate * step + 360) % 360;

      boat.throttle = clamp(
        boat.throttle + this.input.throttle * (this.input.throttle > 0 ? 0.34 : 0.46) * step,
        0,
        1
      );

      const targetTemp = 43 + 79 * Math.pow(boat.throttle, 1.55);
      boat.temp += (targetTemp - boat.temp) * 0.105 * step;
      if (boat.temp > 101) {
        boat.temp += (boat.temp - 101) * 0.012 * step;
      }

      let powerFactor = 1;
      if (boat.temp > 100) {
        powerFactor = clamp(1 - (boat.temp - 100) * 0.025, 0.6, 1);
      }
      if (boat.temp > 106 && !this.overheatLatched) {
        this.overheatLatched = true;
        this.emit("overheat", { temp: boat.temp });
      } else if (boat.temp < 99) {
        this.overheatLatched = false;
      }

      const targetSpeed = Math.pow(boat.throttle, 0.78) * 164 * powerFactor;
      boat.engineSpeed = damp(boat.engineSpeed, targetSpeed, 1.9, step);
      const headingRad = boat.heading * DEG;
      const waveRad = this.field.wave.direction * DEG;
      const velocityX = Math.sin(headingRad) * boat.engineSpeed + Math.sin(waveRad) * this.field.wave.strength;
      const velocityY = -Math.cos(headingRad) * boat.engineSpeed - Math.cos(waveRad) * this.field.wave.strength;
      boat.groundSpeed = Math.hypot(velocityX, velocityY);
      boat.x += velocityX * step;
      boat.y += velocityY * step;

      if (boat.y < 15 || boat.y > this.field.height - 15) {
        boat.y = clamp(boat.y, 15, this.field.height - 15);
        boat.engineSpeed *= 0.78;
        if (this.boundaryCooldown === 0) {
          this.boundaryCooldown = 1.1;
          this.emit("boundary", { side: boat.y < 500 ? "north" : "south" });
        }
      }
      boat.x = clamp(boat.x, 15, this.field.width - 15);

      this.checkCollision();
      this.checkGates();

      this.depthTimer += step;
      if (this.depthTimer >= 0.18) {
        this.depthTimer = 0;
        const depth = this.field.getDepth(boat.x, boat.y);
        boat.depth = depth;
        this.lastDepth = depth;
        this.depthHistory.push(depth);
        if (this.depthHistory.length > 100) this.depthHistory.shift();
        if (depth < 3.1 && !this.lowDepthLatched) {
          this.lowDepthLatched = true;
          this.emit("shallow", { depth });
        } else if (depth > 4.2) {
          this.lowDepthLatched = false;
        }
      }

      this.trailTimer += step;
      if (this.trailTimer > 0.12) {
        this.trailTimer = 0;
        this.trail.push({ x: boat.x, y: boat.y, age: 0 });
        if (this.trail.length > 160) this.trail.shift();
      }
      this.trail.forEach((point) => { point.age += step; });
      this.sonarPulses.forEach((pulse) => {
        pulse.age += step;
        pulse.radius = 18 + pulse.age * 390;
      });
      this.sonarPulses = this.sonarPulses.filter((pulse) => pulse.age < 2.15);

      this.checkArrival();
    }

    checkCollision() {
      if (this.hitCooldown > 0) return;
      const boat = this.boat;
      const reef = this.field.isColliding(boat.x, boat.y, 13);
      if (!reef) return;
      const pushAngle = Math.atan2(boat.y - reef.y, boat.x - reef.x);
      const safeDistance = reef.r + 17;
      boat.x = reef.x + Math.cos(pushAngle) * safeDistance;
      boat.y = reef.y + Math.sin(pushAngle) * safeDistance;
      boat.engineSpeed *= 0.28;
      boat.throttle = Math.max(0, boat.throttle * 0.52);
      boat.hull -= 1;
      this.hits += 1;
      this.hitCooldown = 1.15;
      this.field.gates[reef.group].touched = true;
      this.emit("collision", { reef, hull: boat.hull, hits: this.hits });
      if (boat.hull <= 0) {
        this.mode = "lost";
        this.emit("lose", { hits: this.hits });
      }
    }

    checkGates() {
      this.field.gates.forEach((gate) => {
        if (!gate.passed && this.boat.x > gate.x + 78) {
          gate.passed = true;
          this.emit("gate", {
            index: gate.index,
            clean: !gate.touched,
            remaining: this.field.gates.filter((item) => !item.passed).length,
            y: gate.center
          });
        }
      });
    }

    checkArrival() {
      const lighthouse = this.field.lighthouse;
      const cleared = this.field.gates.every((gate) => gate.passed);
      if (cleared && dist(this.boat.x, this.boat.y, lighthouse.x, lighthouse.y) < 138) {
        this.mode = "won";
        this.emit("win", {
          elapsed: this.elapsed,
          hits: this.hits,
          pings: this.pingCount,
          seed: this.field.seedText
        });
      }
    }

    ping() {
      if (this.mode !== "running") return null;
      if (this.pingCooldown > 0) {
        this.emit("pingBlocked", { remaining: this.pingCooldown });
        return null;
      }
      const boat = this.boat;
      const maxRange = 690;
      const groupEchoes = [];
      for (const gate of this.field.gates) {
        let candidate = null;
        let best = Infinity;
        for (const reef of gate.rocks) {
          const distance = dist(boat.x, boat.y, reef.x, reef.y) - reef.r;
          if (distance < best) {
            best = distance;
            candidate = reef;
          }
        }
        if (candidate && best <= maxRange) {
          const dx = candidate.x - boat.x;
          const dy = candidate.y - boat.y;
          const bearing = (Math.atan2(dx, -dy) / DEG + 360) % 360;
          groupEchoes.push({
            group: gate.index,
            distance: Math.max(0, best),
            bearing,
            relative: angleDiff(bearing, boat.heading),
            x: candidate.x,
            y: candidate.y
          });
        }
      }
      groupEchoes.sort((a, b) => a.distance - b.distance);
      const echoes = groupEchoes.slice(0, 4);
      this.pingCount += 1;
      this.pingCooldown = 1.15;
      this.sonarRevealUntil = this.elapsed + 6.5;
      this.sonarRevealRadius = maxRange;
      this.sonarPulses.push({
        x: boat.x,
        y: boat.y,
        radius: 18,
        age: 0,
        duration: 2.15
      });
      const result = {
        echoes,
        nearest: echoes[0] || null,
        boat: { x: boat.x, y: boat.y, heading: boat.heading }
      };
      this.lastEcho = result;
      this.emit("ping", result);
      return result;
    }

    get progress() {
      const span = this.field.lighthouse.x - this.field.start.x;
      return clamp((this.boat.x - this.field.start.x) / span, 0, 1);
    }

    get passedGates() {
      return this.field.gates.filter((gate) => gate.passed).length;
    }
  }

  BP.utils = {
    TAU,
    DEG,
    clamp,
    lerp,
    damp,
    dist,
    angleDiff,
    hashString,
    mulberry32,
    pointSegmentDistance,
    formatTime
  };
  BP.ReefField = ReefField;
  BP.Game = Game;
})();

