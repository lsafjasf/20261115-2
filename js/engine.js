(function (root) {
  "use strict";

  const CONFIG = {
    baseTravelSeconds: 42,
    duration: 42,
    ambient: 24,
    passScore: 75,
    crackGap: 118,
    crackHold: 0.38,
    maxHistory: 220,
    sampleRate: 0.22,
    diffusion: 0.58,
    nodes: 5,
    partProfiles: [
      { name: "涡壳 A", mass: 0.95, initDelta: -5, waterBias: 1.03 },
      { name: "涡壳 B", mass: 1.0, initDelta: 0, waterBias: 1.0 },
      { name: "涡壳 C", mass: 1.045, initDelta: 5, waterBias: 0.97 }
    ],
    waterProfile: [0.075, 0.057, 0.036, 0.021, 0.013],
    airProfile: [0.045, 0.051, 0.056, 0.051, 0.045]
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function smoothstep(edge0, edge1, x) {
    const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
  }

  function zoneEnvelope(progress, start, end, fade) {
    if (progress <= start || progress >= end) return 0;
    return smoothstep(start, start + fade, progress) * (1 - smoothstep(end - fade, end, progress));
  }

  function hashSeed(seed) {
    let h = 2166136261 >>> 0;
    String(seed).split("").forEach((char) => {
      h ^= char.charCodeAt(0);
      h = Math.imul(h, 16777619);
    });
    return h >>> 0;
  }

  function rngFrom(seed) {
    let state = hashSeed(seed) || 1;
    return function random() {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      return ((state >>> 0) / 4294967296);
    };
  }

  class CoolingEngine {
    constructor(options) {
      this.options = Object.assign({ batchNumber: 1, seed: "LN-03" }, options || {});
      this.controls = { mist: 48, air: 56, belt: 1 };
      this.batchNumber = this.options.batchNumber;
      this.events = [];
      this.simulatedSeconds = 0;
      this.newBatch(this.options.seed);
    }

    newBatch(seed) {
      const random = rngFrom(seed || `${this.options.seed}-${this.batchNumber}`);
      const start = 866 + Math.floor(random() * 33);
      const end = 304 + Math.floor(random() * 25);
      const duration = CONFIG.duration;
      const midBias = (random() - 0.5) * 30;
      this.batch = {
        code: `B-${String(this.batchNumber).padStart(3, "0")}`,
        alloy: "INCONEL 718",
        tag: "Ni-Cr-Fe",
        startTemp: start,
        endTemp: end,
        duration,
        curve: [
          { t: 0, value: start },
          { t: duration * 0.16, value: start - 83 + midBias * 0.25 },
          { t: duration * 0.38, value: start - 258 + midBias * 0.65 },
          { t: duration * 0.61, value: lerp(start, end, 0.72) + midBias * 0.35 },
          { t: duration * 0.83, value: end + 67 - midBias * 0.2 },
          { t: duration, value: end }
        ],
        passScore: CONFIG.passScore
      };
      this.progress = 0;
      this.elapsed = 0;
      this.status = "idle";
      this.finishTime = null;
      this.result = null;
      this.lastEventMilestone = 0;
      this.parts = CONFIG.partProfiles.map((profile, index) => this.createPart(profile, index));
    }

    createPart(profile, index) {
      const hot = this.batch.startTemp + profile.initDelta;
      const nodes = [hot + 4, hot - 2, hot - 11, hot - 3, hot + 2];
      return {
        index,
        name: profile.name,
        mass: profile.mass,
        waterBias: profile.waterBias,
        initialTemp: nodes[2],
        nodes,
        cracked: false,
        crack: null,
        crackHold: 0,
        maxGap: 0,
        maxGapScore: 0,
        curveErrorSum: 0,
        sampleTime: 0,
        lastSample: -1,
        history: [],
        scores: { curve: 0, uniform: 100, grain: 100, overall: 0 },
        finished: false,
        finalTemp: null
      };
    }

    start() {
      if (this.status === "running") return false;
      this.newBatch();
      this.status = "running";
      this.progress = 0;
      this.elapsed = 0;
      this.simulatedSeconds = 0;
      this.events.push({ type: "start", batch: this.batch.code });
      return true;
    }

    setControls(next) {
      if (!next) return;
      if (typeof next.mist === "number") this.controls.mist = clamp(next.mist, 0, 100);
      if (typeof next.air === "number") this.controls.air = clamp(next.air, 0, 100);
      if (typeof next.belt === "number") this.controls.belt = clamp(next.belt, 0.7, 1.3);
    }

    targetAt(time) {
      const points = this.batch.curve;
      const t = clamp(time, 0, this.batch.duration);
      for (let i = 0; i < points.length - 1; i += 1) {
        const a = points[i];
        const b = points[i + 1];
        if (t <= b.t) {
          const local = smoothstep(a.t, b.t, t);
          return lerp(a.value, b.value, local);
        }
      }
      return points[points.length - 1].value;
    }

    gradientFor(part) {
      return Math.max.apply(null, part.nodes) - Math.min.apply(null, part.nodes);
    }

    coreTemp(part) {
      return part.nodes[2];
    }

    updateScores(part, dt) {
      const target = this.targetAt(this.elapsed);
      const core = this.coreTemp(part);
      const error = Math.abs(core - target);
      part.curveErrorSum += error * dt;
      part.sampleTime += dt;
      const averageError = part.curveErrorSum / Math.max(part.sampleTime, 0.001);
      const gap = this.gradientFor(part);
      part.maxGap = Math.max(part.maxGap, gap);

      const curveScore = clamp(100 - averageError * 0.46, 0, 100);
      const uniformScore = clamp(100 - Math.max(0, part.maxGap - 55) * 0.45, 0, 100);
      const desiredRate = (this.batch.startTemp - this.batch.endTemp) / this.batch.duration;
      const actualRate = (part.initialTemp - core) / Math.max(this.elapsed, 1);
      const slowPenalty = Math.max(0, desiredRate - actualRate) * 5.4;
      const dwellPenalty = Math.max(0, this.elapsed - this.batch.duration * 1.04) * 1.7;
      const grainScore = clamp(100 - slowPenalty - dwellPenalty, 8, 100);
      const overall = clamp(curveScore * 0.45 + uniformScore * 0.3 + grainScore * 0.25, 0, 100);

      part.scores.curve = curveScore;
      part.scores.uniform = uniformScore;
      part.scores.grain = grainScore;
      part.scores.overall = part.cracked ? Math.min(overall, 28) : overall;

      if (this.elapsed - part.lastSample >= CONFIG.sampleRate) {
        part.lastSample = this.elapsed;
        part.history.push({
          t: Number(this.elapsed.toFixed(2)),
          progress: Number(this.progress.toFixed(3)),
          core: Number(core.toFixed(1)),
          top: Number(part.nodes[0].toFixed(1)),
          target: Number(target.toFixed(1))
        });
        if (part.history.length > CONFIG.maxHistory) part.history.shift();
      }
    }

    coolPart(part, dt) {
      const p = this.progress;
      const mistZone = zoneEnvelope(p, 0.075, 0.68, 0.09);
      const airZone = zoneEnvelope(p, 0.44, 0.95, 0.1);
      const mist = (this.controls.mist / 100) * mistZone;
      const air = (this.controls.air / 100) * airZone;
      const massScale = 1 / part.mass;
      const ambient = CONFIG.ambient;
      const before = part.nodes.slice();

      for (let i = 0; i < CONFIG.nodes; i += 1) {
        const waterRate = mist * CONFIG.waterProfile[i] * part.waterBias;
        const airRate = air * CONFIG.airProfile[i];
        const baseRate = 0.0038 + (this.controls.belt - 0.7) * 0.0014;
        const rate = (waterRate + airRate + baseRate) * massScale;
        part.nodes[i] -= rate * (part.nodes[i] - ambient) * dt;
      }

      const diffused = part.nodes.slice();
      for (let i = 1; i < CONFIG.nodes - 1; i += 1) {
        const exchange = CONFIG.diffusion * (before[i - 1] + before[i + 1] - 2 * before[i]);
        diffused[i] += exchange * dt;
      }
      for (let i = 0; i < CONFIG.nodes - 1; i += 1) {
        const exchange = CONFIG.diffusion * 0.34 * (before[i + 1] - before[i]);
        diffused[i] += exchange * dt;
        diffused[i + 1] -= exchange * dt;
      }
      part.nodes = diffused;
    }

    detectCrack(part, dt) {
      if (part.cracked) return;
      const topCoreGap = Math.abs(part.nodes[0] - part.nodes[2]);
      const localGap = topCoreGap + Math.abs(part.nodes[1] - part.nodes[3]) * 0.35;
      if (localGap > CONFIG.crackGap) {
        part.crackHold += dt;
        if (part.crackHold >= CONFIG.crackHold) {
          part.cracked = true;
          part.crack = {
            time: Number(this.elapsed.toFixed(1)),
            gap: Number(localGap.toFixed(1)),
            severity: clamp((localGap - CONFIG.crackGap) / 55 + 0.6, 0.6, 1.8),
            seed: (part.index + 1) * 17.3 + this.batchNumber * 3.1
          };
          this.events.push({ type: "crack", part: part.index, gap: part.crack.gap, time: part.crack.time });
        }
      } else {
        part.crackHold = Math.max(0, part.crackHold - dt * 1.7);
      }
    }

    step(delta) {
      if (this.status !== "running") return this.snapshot();
      const dt = clamp(delta, 0, 0.25);
      if (dt <= 0) return this.snapshot();

      this.elapsed += dt;
      this.progress = clamp(this.progress + (this.controls.belt / CONFIG.baseTravelSeconds) * dt, 0, 1);
      this.parts.forEach((part) => {
        this.coolPart(part, dt);
        this.detectCrack(part, dt);
        this.updateScores(part, dt);
      });

      const milestone = Math.floor(this.progress * 4) / 4;
      if (milestone > this.lastEventMilestone) {
        this.lastEventMilestone = milestone;
        this.events.push({ type: "progress", progress: milestone });
      }

      if (this.progress >= 1) this.completeBatch();
      return this.snapshot();
    }

    completeBatch() {
      this.status = "complete";
      this.finishTime = this.elapsed;
      const parts = this.parts.map((part) => {
        part.finished = true;
        part.finalTemp = this.coreTemp(part);
        const target = this.batch.endTemp;
        const finalError = Math.abs(part.finalTemp - target);
        const liveCurve = clamp(100 - (part.curveErrorSum / part.sampleTime) * 0.46, 0, 100);
        const exitScore = clamp(100 - finalError * 0.9, 0, 100);
        part.scores.curve = liveCurve * 0.72 + exitScore * 0.28;
        part.scores.overall = clamp(
          part.scores.curve * 0.45 + part.scores.uniform * 0.3 + part.scores.grain * 0.25,
          0,
          100
        );
        if (part.cracked) part.scores.overall = Math.min(part.scores.overall, 28);
        return part;
      });
      const passed = parts.every((part) => !part.cracked && part.scores.overall >= this.batch.passScore);
      this.result = {
        passed,
        reason: passed ? "三件铸件均达到质量阈值" : this.resultReason(parts),
        finishTime: Number(this.finishTime.toFixed(1)),
        parts: parts.map((part) => ({
          name: part.name,
          score: Math.round(part.scores.overall),
          cracked: part.cracked,
          finalTemp: Math.round(part.finalTemp),
          curve: Math.round(part.scores.curve),
          uniform: Math.round(part.scores.uniform),
          grain: Math.round(part.scores.grain)
        }))
      };
      this.status = passed ? "success" : "failed";
      this.events.push({ type: "complete", result: this.result });
    }

    resultReason(parts) {
      if (parts.some((part) => part.cracked)) return "局部急冷造成截面裂纹，批次报废";
      if (parts.some((part) => part.scores.overall < this.batch.passScore)) {
        return "至少一件铸件未达到质量阈值";
      }
      return "冷却曲线偏差超出工艺窗口";
    }

    averageScores() {
      const count = this.parts.length;
      const total = this.parts.reduce((sum, part) => {
        sum.curve += part.scores.curve;
        sum.uniform += part.scores.uniform;
        sum.grain += part.scores.grain;
        sum.overall += part.scores.overall;
        sum.gap += this.gradientFor(part);
        return sum;
      }, { curve: 0, uniform: 0, grain: 0, overall: 0, gap: 0 });
      return {
        curve: total.curve / count,
        uniform: total.uniform / count,
        grain: total.grain / count,
        overall: total.overall / count,
        gap: total.gap / count
      };
    }

    consumeEvents() {
      const events = this.events.slice();
      this.events.length = 0;
      return events;
    }

    snapshot() {
      return {
        status: this.status,
        progress: this.progress,
        elapsed: this.elapsed,
        finishTime: this.finishTime,
        batch: this.batch,
        controls: { ...this.controls },
        parts: this.parts,
        average: this.averageScores(),
        result: this.result
      };
    }
  }

  root.CoolingEngine = CoolingEngine;
  root.COOLING_CONFIG = CONFIG;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { CoolingEngine, CONFIG };
  }
})(typeof window !== "undefined" ? window : globalThis);
