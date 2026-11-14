(function () {
  "use strict";

  const W = 1600;
  const H = 900;
  const TAU = Math.PI * 2;
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const angleDelta = (from, to) => {
    let d = (to - from + Math.PI) % TAU;
    if (d < 0) d += TAU;
    return d - Math.PI;
  };

  class MissionWorld {
    constructor() {
      this.width = W;
      this.height = H;
      this.core = { x: 250, y: 235 };
      this.base = { x: 800, y: 785, r: 78 };
      this.targets = [
        { id: "alpha", label: "ALPHA", x: 598, y: 488, r: 48, status: "pending" },
        { id: "bravo", label: "BRAVO", x: 875, y: 378, r: 48, status: "pending" },
        { id: "charlie", label: "CHARLIE", x: 1185, y: 556, r: 48, status: "pending" }
      ];
      this.windParticles = Array.from({ length: 125 }, () => this.newWindParticle(true));
      this.rainSeeds = Array.from({ length: 230 }, () => ({
        x: Math.random() * W,
        y: Math.random() * H,
        len: 9 + Math.random() * 25,
        speed: 420 + Math.random() * 560,
        alpha: 0.05 + Math.random() * 0.2
      }));
      this.waveSeeds = Array.from({ length: 82 }, () => ({
        x: Math.random() * W,
        y: 70 + Math.random() * (H - 90),
        len: 7 + Math.random() * 26,
        phase: Math.random() * TAU,
        alpha: 0.04 + Math.random() * 0.11
      }));
      this.cloudSpecks = Array.from({ length: 52 }, () => ({
        angle: Math.random() * TAU,
        radius: 170 + Math.random() * 430,
        size: 20 + Math.random() * 75,
        phase: Math.random() * TAU
      }));
    }

    newWindParticle(anywhere) {
      return {
        x: anywhere ? Math.random() * W : -30,
        y: 50 + Math.random() * (H - 100),
        age: Math.random() * 4,
        life: 2.5 + Math.random() * 3.5,
        strength: 0.5 + Math.random() * 0.9
      };
    }

    windAt(x, y, time, altitude) {
      const dx = x - this.core.x;
      const dy = y - this.core.y;
      const radius = Math.max(50, Math.hypot(dx, dy));
      const nx = dx / radius;
      const ny = dy / radius;
      const ring = Math.exp(-Math.pow((radius - 360) / 240, 2));
      const gust = Math.sin(time * 0.73 + Math.atan2(dy, dx) * 2.2) * 4.2;
      const baseSpeed = 8.5 + ring * 27 + gust * (0.5 + ring);
      const altitudeFactor = lerp(1.18, 0.52, clamp(altitude / 600, 0, 1));
      const speed = Math.max(4, baseSpeed * altitudeFactor);
      const spin = 0.17 * Math.sin(time * 0.24) - 0.22;
      const tx = -ny - nx * spin;
      const ty = nx - ny * spin;
      const tlen = Math.hypot(tx, ty) || 1;
      return {
        x: (tx / tlen) * speed,
        y: (ty / tlen) * speed,
        speed,
        angle: Math.atan2(ty, tx),
        ring
      };
    }

    rainAt(x, y, time) {
      const dx = x - this.core.x;
      const dy = y - this.core.y;
      const radius = Math.hypot(dx, dy);
      const angle = Math.atan2(dy, dx);
      const bandA = Math.max(0, Math.sin(radius * 0.032 - angle * 2.3 + time * 0.34));
      const bandB = Math.max(0, Math.sin(radius * 0.017 + angle * 4.1 - time * 0.19));
      const proximity = clamp(1 - (radius - 160) / 960, 0, 1);
      return clamp((bandA * 0.6 + bandB * 0.46 + 0.12) * proximity, 0, 1);
    }

    update(dt, time, altitude) {
      for (const p of this.windParticles) {
        const wind = this.windAt(p.x, p.y, time, altitude);
        p.x += wind.x * dt * 7.5;
        p.y += wind.y * dt * 7.5;
        p.age += dt;
        if (p.age > p.life || p.x < -80 || p.x > W + 80 || p.y < -60 || p.y > H + 60) {
          Object.assign(p, this.newWindParticle(false));
          if (Math.random() < 0.65) {
            p.y = 40 + Math.random() * (H - 80);
            p.x = 40 + Math.random() * W * 0.7;
          }
        }
      }
    }

    drawWater(ctx, time) {
      const sea = ctx.createLinearGradient(0, 0, W, H);
      sea.addColorStop(0, "#152f38");
      sea.addColorStop(0.42, "#0b252e");
      sea.addColorStop(1, "#06181f");
      ctx.fillStyle = sea;
      ctx.fillRect(0, 0, W, H);

      const glow = ctx.createRadialGradient(180, 160, 20, 180, 160, 850);
      glow.addColorStop(0, "rgba(117, 161, 169, .15)");
      glow.addColorStop(0.55, "rgba(30, 83, 91, .035)");
      glow.addColorStop(1, "rgba(2, 13, 18, 0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, W, H);

      ctx.save();
      ctx.strokeStyle = "rgba(126, 203, 193, .07)";
      ctx.lineWidth = 1;
      for (let x = 0; x <= W; x += 100) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, H);
        ctx.stroke();
      }
      for (let y = 0; y <= H; y += 100) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
      }
      ctx.restore();

      ctx.save();
      ctx.lineCap = "round";
      for (const wave of this.waveSeeds) {
        const sway = Math.sin(time * 0.45 + wave.phase) * 8;
        ctx.strokeStyle = `rgba(159, 216, 208, ${wave.alpha})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(wave.x + sway, wave.y);
        ctx.quadraticCurveTo(wave.x + wave.len * 0.5, wave.y - 3, wave.x + wave.len + sway, wave.y + 1);
        ctx.stroke();
      }
      ctx.restore();
    }

    drawStorm(ctx, time) {
      const cx = this.core.x;
      const cy = this.core.y;
      ctx.save();

      const veil = ctx.createRadialGradient(cx, cy, 50, cx, cy, 760);
      veil.addColorStop(0, "rgba(9, 25, 31, .92)");
      veil.addColorStop(0.32, "rgba(25, 51, 58, .72)");
      veil.addColorStop(0.62, "rgba(34, 64, 70, .35)");
      veil.addColorStop(1, "rgba(12, 34, 41, 0)");
      ctx.fillStyle = veil;
      ctx.fillRect(0, 0, W, H);

      ctx.translate(cx, cy);
      for (let layer = 0; layer < 5; layer += 1) {
        const phase = time * (0.045 + layer * 0.008) + layer * 0.82;
        const radius = 165 + layer * 74;
        ctx.beginPath();
        for (let i = 0; i <= 150; i += 1) {
          const a = (i / 150) * TAU;
          const ripple = Math.sin(a * (3 + layer) + phase * 4.2) * (15 + layer * 4)
            + Math.sin(a * 7 - phase * 6) * 7;
          const r = radius + ripple;
          const x = Math.cos(a) * r;
          const y = Math.sin(a) * r * 0.74;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.strokeStyle = `rgba(186, 220, 219, ${0.055 + layer * 0.012})`;
        ctx.lineWidth = 2 + layer * 0.7;
        ctx.stroke();
      }

      for (let band = 0; band < 7; band += 1) {
        const baseAngle = band * (TAU / 7) + time * 0.018;
        ctx.beginPath();
        for (let i = 0; i <= 55; i += 1) {
          const t = i / 55;
          const angle = baseAngle + t * 2.7;
          const radius = 120 + t * (420 + (band % 3) * 75);
          const x = Math.cos(angle) * radius;
          const y = Math.sin(angle) * radius * 0.73;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = `rgba(135, 171, 171, ${0.028 + (band % 2) * 0.017})`;
        ctx.lineWidth = 15 + (band % 3) * 10;
        ctx.lineCap = "round";
        ctx.stroke();
      }
      ctx.restore();

      ctx.save();
      ctx.globalCompositeOperation = "screen";
      for (const speck of this.cloudSpecks) {
        const angle = speck.angle + time * 0.012;
        const x = cx + Math.cos(angle) * speck.radius;
        const y = cy + Math.sin(angle) * speck.radius * 0.64;
        const pulse = 0.5 + Math.sin(time * 0.2 + speck.phase) * 0.5;
        const cloud = ctx.createRadialGradient(x, y, 0, x, y, speck.size);
        cloud.addColorStop(0, `rgba(130, 165, 166, ${0.026 + pulse * 0.018})`);
        cloud.addColorStop(1, "rgba(80, 112, 116, 0)");
        ctx.fillStyle = cloud;
        ctx.fillRect(x - speck.size, y - speck.size, speck.size * 2, speck.size * 2);
      }
      ctx.restore();

      const eye = ctx.createRadialGradient(cx, cy, 4, cx, cy, 86);
      eye.addColorStop(0, "rgba(158, 194, 192, .12)");
      eye.addColorStop(0.45, "rgba(30, 59, 64, .28)");
      eye.addColorStop(1, "rgba(5, 20, 25, 0)");
      ctx.fillStyle = eye;
      ctx.beginPath();
      ctx.arc(cx, cy, 86, 0, TAU);
      ctx.fill();
    }

    drawWind(ctx, time, altitude) {
      ctx.save();
      ctx.lineCap = "round";
      for (const p of this.windParticles) {
        const wind = this.windAt(p.x, p.y, time, altitude);
        const fade = Math.sin(clamp(p.age / p.life, 0, 1) * Math.PI);
        const scalex = Math.cos(wind.angle);
        const scaley = Math.sin(wind.angle);
        const length = 9 + wind.speed * 1.35 * p.strength;
        ctx.strokeStyle = `rgba(127, 232, 214, ${fade * (0.05 + wind.speed / 390)})`;
        ctx.lineWidth = 0.7 + p.strength * 0.7;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - scalex * length, p.y - scaley * length);
        ctx.stroke();
      }
      ctx.restore();
    }

    drawRain(ctx, time, dt) {
      ctx.save();
      ctx.lineCap = "round";
      for (const drop of this.rainSeeds) {
        drop.y += drop.speed * dt;
        drop.x -= drop.speed * dt * 0.38;
        if (drop.y > H + 30) {
          drop.y = -30;
          drop.x = Math.random() * W;
        }
        if (drop.x < -40) drop.x += W + 80;
        const rain = this.rainAt(drop.x, drop.y, time);
        if (rain < 0.08) continue;
        ctx.strokeStyle = `rgba(175, 214, 217, ${drop.alpha * rain * 1.5})`;
        ctx.lineWidth = 0.75;
        ctx.beginPath();
        ctx.moveTo(drop.x, drop.y);
        ctx.lineTo(drop.x - drop.len * 0.32, drop.y + drop.len);
        ctx.stroke();
      }
      ctx.restore();
    }

    drawAtmosphere(ctx, time) {
      const fog = ctx.createLinearGradient(0, 0, 0, H);
      fog.addColorStop(0, "rgba(109, 146, 149, .075)");
      fog.addColorStop(0.55, "rgba(52, 92, 98, .025)");
      fog.addColorStop(1, "rgba(3, 17, 22, .17)");
      ctx.fillStyle = fog;
      ctx.fillRect(0, 0, W, H);

      ctx.save();
      ctx.globalAlpha = 0.55;
      const sweepY = 60 + ((time * 18) % 900);
      const sweep = ctx.createLinearGradient(0, sweepY - 80, 0, sweepY + 80);
      sweep.addColorStop(0, "rgba(103, 245, 210, 0)");
      sweep.addColorStop(0.5, "rgba(103, 245, 210, .025)");
      sweep.addColorStop(1, "rgba(103, 245, 210, 0)");
      ctx.fillStyle = sweep;
      ctx.fillRect(0, sweepY - 80, W, 160);
      ctx.restore();
    }

    draw(ctx, time, dt, altitude) {
      this.drawWater(ctx, time);
      this.drawStorm(ctx, time);
      this.drawWind(ctx, time, altitude);
      this.drawRain(ctx, time, dt);
      this.drawAtmosphere(ctx, time);
    }
  }

  window.MissionWorld = MissionWorld;
  window.WorldMath = { clamp, lerp, dist, angleDelta, TAU };
}());
