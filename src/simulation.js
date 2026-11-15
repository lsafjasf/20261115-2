// Deterministic sandstorm simulation core.
// Runs unchanged in the browser (Canvas render) and in Node (headless tests).

export const FIELD = { w: 1000, h: 600 };
export const DURATION = 600; // 10 minutes, in simulated seconds
export const CLEAN_EFFICIENCY = 0.7; // greenhouse stays "clean" above this
const FIXED_DT = 1 / 30;
const AMBIENT_WIND = 34; // px/s pushing sand left -> right
const FAN_MAX_SPEED = 300; // px/s jet core speed at full power
const PARTICLE_CAP = 850;
const DEPOSIT_CAPACITY = 450; // deposits that fully choke one intake
const JET_RADIUS = 150; // jet mouth half-width in px; bands overlap to tile the field
const JET_SPREAD = 0.1; // lateral growth per px of travel

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function defaultGreenhouses() {
  // Two greenhouses on the right, each with its main intake on the left edge.
  return [
    { id: "A", x: 830, y: 105, w: 150, h: 175, deposited: 0 },
    { id: "B", x: 830, y: 330, w: 150, h: 175, deposited: 0 },
  ];
}

// Known-good deployment: fans lift sand over A, thread it through the gap,
// and push it under B.
export function goodFans() {
  return [
    // Left pair do the real deflection: steep angled jets lift the upper
    // stream over A and push the lower stream under B.
    { id: 0, x: 350, y: 250, angle: -0.9, power: 1, range: 450 },
    // The narrow middle fan sits further right so it only escorts the
    // remaining central stream through the A/B gap after the angled jets
    // have already bent the outer streams.
    { id: 1, x: 500, y: 305, angle: 0.0, power: 0.8, range: 350, width: 0.25 },
    { id: 2, x: 350, y: 360, angle: 0.9, power: 1, range: 450 },
  ];
}

// Wrong deployment: every fan aims straight into the greenhouses (horizontal
// jet), which accelerates sand directly toward both intakes.
export function badFans() {
  return [
    // All three fans blast horizontally straight at the intakes: instead of
    // bending the streams apart, every jet accelerates sand into A and B.
    { id: 0, x: 350, y: 250, angle: 0, power: 1, range: 450 },
    { id: 1, x: 500, y: 305, angle: 0, power: 1, range: 350, width: 0.25 },
    { id: 2, x: 350, y: 360, angle: 0, power: 1, range: 450 },
  ];
}

function jetAt(fan, x, y) {
  const dx = x - fan.x;
  const dy = y - fan.y;
  const along = dx * Math.cos(fan.angle) + dy * Math.sin(fan.angle);
  if (along <= 0 || along > fan.range) return [0, 0];
  const lateral = -dx * Math.sin(fan.angle) + dy * Math.cos(fan.angle);
  const mouth = JET_RADIUS * (fan.width ?? 1);
  const radius = mouth * (1 + JET_SPREAD * (along / mouth));
  // Flat core (62% width) with a linear soft edge so a fan band applies an
  // even, predictable push instead of a narrow Gaussian spike.
  const q = Math.abs(lateral) / radius;
  const cone = q <= 0.62 ? 1 : Math.max(0, (1 - q) / 0.38);
  // Flat core until 65% of range, linear falloff to zero at the tip.
  const axial = Math.max(0, Math.min(1, (1 - along / fan.range) / 0.18));
  const strength =
    fan.power * FAN_MAX_SPEED * axial * cone;
  return [Math.cos(fan.angle) * strength, Math.sin(fan.angle) * strength];
}

export class Simulation {
  constructor(options = {}) {
    this.rng = mulberry32(options.seed ?? 42);
    this.fans = (options.fans ?? goodFans()).map((f) => ({ ...f }));
    this.greenhouses = defaultGreenhouses();
    this.particles = [];
    this.t = 0;
    this.spawnAcc = 0;
    this.stats = { spawned: 0, escaped: 0, deposited: 0 };
    this.overdriveWarnings = 0;
  }

  // 0..1 storm intensity: ramps in, peaks around minute 5, eases at the end.
  stormLevel() {
    const u = this.t / DURATION;
    const envelope = Math.sin(Math.PI * Math.min(1, u));
    const gust = 0.08 * Math.sin(this.t * 0.9) + 0.05 * Math.sin(this.t * 2.3);
    return Math.max(0.08, 0.55 + 0.45 * envelope + gust);
  }

  windAt(x, y) {
    const level = this.stormLevel();
    let wx = AMBIENT_WIND * (0.6 + level * 0.7);
    let wy = 6 * Math.sin(y * 0.02 + this.t * 1.4) * level;
    for (const fan of this.fans) {
      const [jx, jy] = jetAt(fan, x, y);
      wx += jx;
      wy += jy;
    }
    return [wx, wy];
  }

  // Over-blowing: a high-power fan whose jet axis lands on the *opposite*
  // greenhouse's intake height will drive captured sand across into that
  // house instead of shedding it through a safe lane.
  analyzeOverdrive() {
    const warnings = [];
    for (const fan of this.fans) {
      if (fan.power < 0.82) continue;
      const reach = Math.min(fan.range, 830 - fan.x);
      if (reach <= 0) continue;
      const tipY = fan.y + Math.sin(fan.angle) * reach;
      const target = this.greenhouses.find(
        (gh) => tipY >= gh.y && tipY <= gh.y + gh.h
      );
      if (!target) continue;
      // A jet is "cross-pushing" when it carries vertical momentum toward the
      // far house while its power leaves no margin to bend back into a lane.
      const crossPush = Math.abs(Math.sin(fan.angle)) > 0.18;
      if (crossPush) {
        warnings.push({
          fanId: fan.id,
          target: target.id,
          tipY: Math.round(tipY),
          power: fan.power,
        });
      }
    }
    this.overdriveWarnings = warnings.length;
    return warnings;
  }

  spawnParticle() {
    if (this.particles.length >= PARTICLE_CAP) return;
    this.particles.push({
      x: -6,
      y: 25 + this.rng() * (FIELD.h - 50),
      vx: AMBIENT_WIND,
      vy: 0,
      age: 0,
    });
    this.stats.spawned++;
  }

  step(dt = FIXED_DT) {
    if (this.t >= DURATION) return;
    this.t = Math.min(DURATION, this.t + dt);
    const rate = 34 * this.stormLevel(); // particles per second
    this.spawnAcc += rate * dt;
    while (this.spawnAcc >= 1) {
      this.spawnParticle();
      this.spawnAcc -= 1;
    }

    const rng = this.rng;
    for (const p of this.particles) {
      if (!p.alive && p.alive !== undefined) continue;
      const [wx, wy] = this.windAt(p.x, p.y);
      const blend = Math.min(1, dt * 3.2);
      p.vx += (wx - p.vx) * blend;
      p.vy += (wy - p.vy) * blend;
      p.vy += (rng() - 0.5) * 26 * dt; // turbulence
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.age += dt;

      if (p.y < -12 || p.y > FIELD.h + 12 || p.x > FIELD.w + 8) {
        p.alive = false;
        this.stats.escaped++;
        continue;
      }
      for (const gh of this.greenhouses) {
        if (
          p.x >= gh.x &&
          p.x <= gh.x + gh.w &&
          p.y >= gh.y &&
          p.y <= gh.y + gh.h
        ) {
          p.alive = false;
          gh.deposited++;
          this.stats.deposited++;
          break;
        }
      }
    }
    this.particles = this.particles.filter((p) => p.alive !== false);
  }

  run(stepDt = FIXED_DT) {
    while (this.t < DURATION) this.step(stepDt);
    return this.result();
  }

  efficiency(gh) {
    return Math.max(0, 1 - gh.deposited / DEPOSIT_CAPACITY);
  }

  result() {
    const overdrive = this.analyzeOverdrive();
    const houses = this.greenhouses.map((gh) => ({
      id: gh.id,
      deposited: gh.deposited,
      efficiency: this.efficiency(gh),
      clean: this.efficiency(gh) >= CLEAN_EFFICIENCY,
    }));
    return {
      finished: this.t >= DURATION,
      time: this.t,
      houses,
      success: houses.every((h) => h.clean),
      escaped: this.stats.escaped,
      deposited: this.stats.deposited,
      spawned: this.stats.spawned,
      stormLevel: this.stormLevel(),
      overdrive,
    };
  }
}
