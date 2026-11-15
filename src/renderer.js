import { CONFIG } from "./simulation.js";

const WIDTH = 1200;
const HEIGHT = 720;
const BAYS = [
  { x: 150, y: 500, w: 252, cx: 276 },
  { x: 474, y: 500, w: 252, cx: 600 },
  { x: 798, y: 500, w: 252, cx: 924 },
];

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function roundedRect(ctx, x, y, w, h, radius) {
  const r = Math.min(radius, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawLabel(ctx, text, x, y, color, size = 10, spacing = 1.5) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.font = `${size}px "IBM Plex Mono", "Noto Sans SC", monospace`;
  ctx.letterSpacing = `${spacing}px`;
  ctx.fillText(text, x, y);
  ctx.restore();
}

export class GreenhouseRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.random = seededRandom(71423);
    this.stars = Array.from({ length: 150 }, () => ({
      x: this.random() * WIDTH,
      y: this.random() * 530,
      r: 0.35 + this.random() * 1.35,
      a: 0.2 + this.random() * 0.7,
      phase: this.random() * Math.PI * 2,
    }));
    this.craters = Array.from({ length: 22 }, () => ({
      x: this.random() * WIDTH,
      y: 583 + this.random() * 125,
      r: 4 + this.random() * 20,
      a: 0.06 + this.random() * 0.12,
    }));
    this.heatEnabled = false;
  }

  render(sim, time = 0) {
    const ctx = this.ctx;
    const state = sim.state;
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    this.drawSpace(time);
    this.drawEarth(time);
    this.drawLunarSurface();
    this.drawDome(state, time);
    this.drawInterior(state, time);
    this.drawHeatZones(state, time);
    this.drawWaterSystem(state, time);
    this.drawBays(state, time);
    this.drawPump(state, time);
    this.drawAtmosphere(state, time);
    if (this.heatEnabled) this.drawThermalScan(state, time);
    this.drawVignette(state);
  }

  drawSpace(time) {
    const ctx = this.ctx;
    const sky = ctx.createLinearGradient(0, 0, 0, 600);
    sky.addColorStop(0, "#030706");
    sky.addColorStop(0.55, "#07100e");
    sky.addColorStop(1, "#101612");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    const nebula = ctx.createRadialGradient(190, 150, 0, 190, 150, 390);
    nebula.addColorStop(0, "rgba(55, 102, 83, 0.1)");
    nebula.addColorStop(0.55, "rgba(20, 48, 42, 0.06)");
    nebula.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = nebula;
    ctx.fillRect(0, 0, WIDTH, 600);

    for (const star of this.stars) {
      const twinkle = 0.7 + Math.sin(time * 0.8 + star.phase) * 0.25;
      ctx.fillStyle = `rgba(208, 233, 219, ${star.a * twinkle})`;
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawEarth(time) {
    const ctx = this.ctx;
    const x = 1034;
    const y = 142;
    const r = 86;
    const shade = ctx.createRadialGradient(x - 28, y - 32, 5, x, y, r);
    shade.addColorStop(0, "#86c5be");
    shade.addColorStop(0.3, "#407f82");
    shade.addColorStop(0.67, "#214c55");
    shade.addColorStop(1, "#07181c");
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = shade;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);

    ctx.globalAlpha = 0.46;
    ctx.fillStyle = "#c3d5b0";
    const land = [
      [-31, -43, 31, 17, -0.2],
      [1, -6, 45, 22, 0.3],
      [-43, 13, 35, 25, -0.5],
      [29, 41, 24, 31, 0.2],
    ];
    for (const [lx, ly, lw, lh, rot] of land) {
      ctx.beginPath();
      ctx.ellipse(x + lx, y + ly, lw, lh, rot, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = "#d9eef1";
    ctx.beginPath();
    ctx.ellipse(x - 24, y - 9, 26, 7, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(x + 37, y + 25, 19, 5, 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    const halo = ctx.createRadialGradient(x, y, r - 2, x, y, r + 30);
    halo.addColorStop(0, "rgba(117, 211, 207, 0.2)");
    halo.addColorStop(0.35, "rgba(80, 154, 153, 0.08)");
    halo.addColorStop(1, "rgba(80, 154, 153, 0)");
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(x, y, r + 30, 0, Math.PI * 2);
    ctx.fill();

    const pulse = 0.52 + Math.sin(time * 0.25) * 0.08;
    drawLabel(ctx, "EARTH / 384,400 KM", x - 73, y + r + 26, `rgba(154, 206, 193, ${pulse})`, 9, 1.4);
  }

  drawLunarSurface() {
    const ctx = this.ctx;
    const ground = ctx.createLinearGradient(0, 555, 0, HEIGHT);
    ground.addColorStop(0, "#3b4139");
    ground.addColorStop(0.2, "#272b25");
    ground.addColorStop(0.65, "#161a16");
    ground.addColorStop(1, "#0a0d0b");
    ctx.fillStyle = ground;
    ctx.beginPath();
    ctx.moveTo(0, 572);
    ctx.bezierCurveTo(200, 552, 340, 579, 540, 562);
    ctx.bezierCurveTo(760, 543, 980, 575, 1200, 548);
    ctx.lineTo(1200, 720);
    ctx.lineTo(0, 720);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = "rgba(198, 211, 188, 0.13)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, 576);
    ctx.bezierCurveTo(210, 556, 360, 583, 540, 566);
    ctx.bezierCurveTo(760, 547, 960, 579, 1200, 552);
    ctx.stroke();

    for (const crater of this.craters) {
      ctx.fillStyle = `rgba(5, 8, 6, ${crater.a})`;
      ctx.beginPath();
      ctx.ellipse(crater.x, crater.y, crater.r * 1.8, crater.r * 0.45, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = `rgba(196, 206, 186, ${crater.a * 0.45})`;
      ctx.beginPath();
      ctx.ellipse(crater.x, crater.y - 1, crater.r * 1.7, crater.r * 0.38, 0, Math.PI, Math.PI * 2);
      ctx.stroke();
    }

    for (let i = 0; i < 5; i += 1) {
      const x = 120 + i * 242;
      const y = 682 + (i % 2) * 14;
      ctx.fillStyle = "rgba(109, 126, 111, 0.12)";
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 34, y - 28);
      ctx.lineTo(x + 67, y - 2);
      ctx.lineTo(x + 94, y - 20);
      ctx.strokeStyle = "rgba(5, 7, 5, 0.25)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  domePath() {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(48, 598);
    ctx.bezierCurveTo(58, 202, 380, 70, 600, 64);
    ctx.bezierCurveTo(842, 65, 1145, 221, 1152, 598);
    ctx.closePath();
  }

  drawDome(state, time) {
    const ctx = this.ctx;
    this.domePath();
    const glass = ctx.createLinearGradient(180, 80, 1010, 590);
    glass.addColorStop(0, "rgba(96, 157, 133, 0.16)");
    glass.addColorStop(0.38, "rgba(17, 42, 34, 0.72)");
    glass.addColorStop(1, "rgba(6, 18, 15, 0.86)");
    ctx.fillStyle = glass;
    ctx.fill();
    ctx.strokeStyle = "rgba(147, 202, 172, 0.34)";
    ctx.lineWidth = 1.4;
    ctx.stroke();

    ctx.save();
    ctx.strokeStyle = "rgba(135, 192, 161, 0.11)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 7; i += 1) {
      const x = 152 + i * 150;
      ctx.beginPath();
      ctx.moveTo(600, 68);
      ctx.quadraticCurveTo(x + 18, 280, x, 594);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.ellipse(600, 430, 516, 178, 0, Math.PI, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    const reflection = ctx.createLinearGradient(260, 90, 470, 380);
    reflection.addColorStop(0, "rgba(224, 255, 232, 0.02)");
    reflection.addColorStop(0.46, "rgba(224, 255, 232, 0.1)");
    reflection.addColorStop(1, "rgba(224, 255, 232, 0)");
    ctx.fillStyle = reflection;
    ctx.beginPath();
    ctx.moveTo(312, 153);
    ctx.quadraticCurveTo(405, 101, 536, 117);
    ctx.quadraticCurveTo(464, 203, 348, 267);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = "rgba(164, 208, 182, 0.22)";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(46, 598);
    ctx.lineTo(1154, 598);
    ctx.stroke();

    const pulse = 0.55 + Math.sin(time * 1.2) * 0.12;
    drawLabel(ctx, "LUNAR GREENHOUSE / DOME 07", 66, 78, `rgba(160, 211, 184, ${pulse})`, 10, 2);
    drawLabel(ctx, "P = 96.2 kPa   T = 293 K", 892, 78, "rgba(126, 165, 144, 0.48)", 8, 1);
  }

  drawInterior(state, time) {
    const ctx = this.ctx;
    const floor = ctx.createLinearGradient(0, 410, 0, 590);
    floor.addColorStop(0, "rgba(24, 51, 42, 0.38)");
    floor.addColorStop(1, "rgba(7, 23, 18, 0.62)");
    ctx.fillStyle = floor;
    ctx.fillRect(72, 408, 1056, 184);

    ctx.strokeStyle = "rgba(103, 163, 135, 0.12)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 7; i += 1) {
      const x = 72 + i * 176;
      ctx.beginPath();
      ctx.moveTo(x, 408);
      ctx.lineTo(x - 24, 590);
      ctx.stroke();
    }
    for (let i = 0; i < 4; i += 1) {
      const y = 430 + i * 36;
      ctx.beginPath();
      ctx.moveTo(72, y);
      ctx.lineTo(1128, y);
      ctx.stroke();
    }

    const cableY = 146;
    ctx.strokeStyle = "rgba(146, 176, 158, 0.28)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(174, 94);
    ctx.quadraticCurveTo(600, 174, 1066, 96);
    ctx.stroke();

    for (const bay of BAYS) {
      const g = ctx.createLinearGradient(bay.cx, 160, bay.cx, 238);
      g.addColorStop(0, "rgba(20, 28, 24, 0.8)");
      g.addColorStop(1, "rgba(54, 49, 36, 0.8)");
      ctx.fillStyle = g;
      roundedRect(ctx, bay.cx - 72, 156, 144, 24, 3);
      ctx.fill();
      ctx.strokeStyle = "rgba(205, 186, 136, 0.22)";
      ctx.stroke();
      ctx.fillStyle = "rgba(239, 217, 162, 0.18)";
      ctx.fillRect(bay.cx - 57, 174, 114, 3);
    }
  }

  drawHeatZones(state, time) {
    const ctx = this.ctx;
    const heat = clamp((state.tempC - 20) / 16, 0.08, 1);
    const overheat = state.tempC >= CONFIG.thresholds.overheat;
    const flicker = 0.92 + Math.sin(time * 2.2) * 0.05;

    for (let i = 0; i < BAYS.length; i += 1) {
      const bay = BAYS[i];
      const active = i === state.round - 1 && !["complete"].includes(state.phase);
      const strength = active ? heat : heat * 0.45;
      const glow = ctx.createRadialGradient(bay.cx, 186, 5, bay.cx, 210, 145 + heat * 50);
      glow.addColorStop(0, `rgba(255, 188, 93, ${0.14 + strength * 0.28})`);
      glow.addColorStop(0.35, `rgba(241, 132, 55, ${0.06 + strength * 0.12})`);
      glow.addColorStop(1, "rgba(190, 70, 24, 0)");
      ctx.fillStyle = glow;
      ctx.fillRect(bay.cx - 210, 115, 420, 390);

      if (active) {
        const cone = ctx.createLinearGradient(0, 185, 0, 495);
        cone.addColorStop(0, `rgba(255, 214, 144, ${0.1 * flicker})`);
        cone.addColorStop(1, "rgba(255, 214, 144, 0)");
        ctx.fillStyle = cone;
        ctx.beginPath();
        ctx.moveTo(bay.cx - 57, 181);
        ctx.lineTo(bay.cx + 57, 181);
        ctx.lineTo(bay.cx + 126, 506);
        ctx.lineTo(bay.cx - 126, 506);
        ctx.closePath();
        ctx.fill();
      }
    }

    const pumpHeat = ctx.createRadialGradient(1082, 478, 3, 1082, 478, 92);
    pumpHeat.addColorStop(0, `rgba(255, 126, 54, ${state.pumpOn ? 0.1 + heat * 0.18 : 0.02})`);
    pumpHeat.addColorStop(1, "rgba(255, 93, 36, 0)");
    ctx.fillStyle = pumpHeat;
    ctx.fillRect(974, 376, 220, 224);

    if (overheat) {
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      for (let i = 0; i < 3; i += 1) {
        const x = 620 + Math.sin(time * 0.7 + i * 2.1) * 300;
        const y = 270 + Math.cos(time * 0.5 + i) * 80;
        const plume = ctx.createRadialGradient(x, y, 0, x, y, 170);
        plume.addColorStop(0, `rgba(255, 91, 45, ${0.025 + heat * 0.03})`);
        plume.addColorStop(1, "rgba(255, 91, 45, 0)");
        ctx.fillStyle = plume;
        ctx.fillRect(x - 170, y - 170, 340, 340);
      }
      ctx.restore();
    }

    const load = Math.round(clamp((state.tempC - 18) / 24, 0, 1) * 100);
    drawLabel(
      ctx,
      `THERMAL LOAD ${load}%`,
      181,
      388,
      overheat ? "rgba(255, 104, 74, 0.9)" : "rgba(233, 173, 103, 0.55)",
      9,
      1.4,
    );
  }

  drawWaterSystem(state, time) {
    const ctx = this.ctx;
    const tankX = 54;
    const tankY = 294;
    const tankW = 64;
    const tankH = 242;
    const level = clamp(state.waterL / 34, 0.04, 1);
    const fluidY = tankY + tankH - tankH * level;

    ctx.save();
    roundedRect(ctx, tankX, tankY, tankW, tankH, 12);
    ctx.fillStyle = "rgba(6, 21, 21, 0.86)";
    ctx.fill();
    ctx.strokeStyle = "rgba(102, 206, 205, 0.28)";
    ctx.stroke();

    ctx.save();
    roundedRect(ctx, tankX + 3, tankY + 3, tankW - 6, tankH - 6, 10);
    ctx.clip();
    const water = ctx.createLinearGradient(0, fluidY, 0, tankY + tankH);
    water.addColorStop(0, "rgba(86, 226, 218, 0.42)");
    water.addColorStop(1, "rgba(21, 97, 103, 0.72)");
    ctx.fillStyle = water;
    ctx.fillRect(tankX, fluidY, tankW, tankH);
    ctx.strokeStyle = "rgba(175, 255, 247, 0.7)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = tankX; x <= tankX + tankW; x += 2) {
      const y = fluidY + Math.sin(x * 0.28 + time * 1.4) * 2.2;
      if (x === tankX) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    for (let i = 0; i < 9; i += 1) {
      const bubbleY = tankY + tankH - ((time * 11 + i * 27) % (tankH - 20));
      ctx.fillStyle = `rgba(190, 255, 249, ${0.08 + (i % 3) * 0.04})`;
      ctx.beginPath();
      ctx.arc(tankX + 12 + (i * 17) % 40, bubbleY, 1.2 + (i % 2), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    for (let i = 0; i < 5; i += 1) {
      ctx.strokeStyle = "rgba(151, 219, 209, 0.14)";
      ctx.beginPath();
      ctx.moveTo(tankX + 7, tankY + 36 + i * 45);
      ctx.lineTo(tankX + tankW - 7, tankY + 36 + i * 45);
      ctx.stroke();
    }
    drawLabel(ctx, "H₂O", tankX + 18, tankY - 14, "rgba(123, 218, 211, 0.72)", 10, 1.2);
    drawLabel(ctx, `${state.waterL.toFixed(1)}L`, tankX + 8, tankY + tankH + 19, "rgba(189, 242, 232, 0.7)", 9, 0.9);
    ctx.restore();

    const pipeY = 562;
    ctx.strokeStyle = "rgba(72, 164, 162, 0.3)";
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(tankX + tankW, pipeY);
    ctx.lineTo(1154, pipeY);
    ctx.stroke();
    ctx.strokeStyle = "rgba(10, 31, 29, 0.9)";
    ctx.lineWidth = 3;
    ctx.stroke();

    for (let i = 0; i < BAYS.length; i += 1) {
      const bay = BAYS[i];
      ctx.strokeStyle = "rgba(75, 191, 183, 0.38)";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(bay.cx, pipeY);
      ctx.lineTo(bay.cx, 545);
      ctx.stroke();
      ctx.strokeStyle = "rgba(9, 30, 28, 0.9)";
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    if (state.pumpOn) {
      for (let i = 0; i < 7; i += 1) {
        const x = tankX + tankW + ((time * 95 + i * 165) % 1050);
        const flow = ctx.createRadialGradient(x, pipeY, 0, x, pipeY, 15);
        flow.addColorStop(0, "rgba(128, 255, 240, 0.55)");
        flow.addColorStop(1, "rgba(86, 226, 218, 0)");
        ctx.fillStyle = flow;
        ctx.fillRect(x - 16, pipeY - 16, 32, 32);
      }
    }
  }

  drawBays(state, time) {
    const ctx = this.ctx;
    for (let i = 0; i < BAYS.length; i += 1) {
      const bay = BAYS[i];
      const complete = i < state.harvests.length;
      const current = i === state.round - 1 && state.phase !== "complete";
      const growing = current && ["growing", "ready"].includes(state.phase);
      const prepared = current && ["idle", "interplant"].includes(state.phase);

      ctx.save();
      if (current) {
        ctx.shadowColor = state.phase === "ready" ? "rgba(242, 179, 95, 0.32)" : "rgba(111, 235, 159, 0.22)";
        ctx.shadowBlur = 18;
      }

      const tray = ctx.createLinearGradient(0, bay.y, 0, bay.y + 74);
      tray.addColorStop(0, "rgba(73, 83, 67, 0.92)");
      tray.addColorStop(0.12, "rgba(46, 55, 45, 0.96)");
      tray.addColorStop(1, "rgba(17, 25, 21, 0.98)");
      roundedRect(ctx, bay.x, bay.y + 15, bay.w, 54, 5);
      ctx.fillStyle = tray;
      ctx.fill();
      ctx.strokeStyle = current ? "rgba(163, 232, 183, 0.4)" : "rgba(128, 156, 138, 0.2)";
      ctx.lineWidth = 1;
      ctx.stroke();

      const soil = ctx.createLinearGradient(0, bay.y, 0, bay.y + 20);
      soil.addColorStop(0, "#403c2c");
      soil.addColorStop(1, "#26261d");
      ctx.fillStyle = soil;
      ctx.beginPath();
      ctx.moveTo(bay.x + 10, bay.y + 14);
      ctx.lineTo(bay.x + bay.w - 10, bay.y + 14);
      ctx.lineTo(bay.x + bay.w - 24, bay.y + 30);
      ctx.lineTo(bay.x + 24, bay.y + 30);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = "rgba(131, 170, 145, 0.22)";
      ctx.beginPath();
      ctx.moveTo(bay.x + 12, bay.y + 67);
      ctx.lineTo(bay.x + bay.w - 12, bay.y + 67);
      ctx.stroke();

      ctx.restore();

      if (growing) {
        this.drawBatchPlants(state, bay, time);
      } else if (complete) {
        this.drawHarvestedBed(bay, state.harvests[i], time);
      } else if (prepared) {
        this.drawSeedBed(bay, state, time);
      }

      const label = `BATCH 0${i + 1}`;
      drawLabel(
        ctx,
        label,
        bay.x + 11,
        bay.y + 88,
        current ? "rgba(166, 231, 187, 0.78)" : "rgba(112, 136, 120, 0.45)",
        9,
        1.4,
      );

      if (current) {
        const status = state.phase === "ready"
          ? "READY / 收获"
          : growing
            ? `GROW ${state.growth.toFixed(0)}%`
            : "AWAITING SEED";
        const statusColor = state.phase === "ready" ? "rgba(247, 189, 99, 0.9)" : "rgba(130, 200, 153, 0.6)";
        drawLabel(ctx, status, bay.x + bay.w - 4 - status.length * 5.2, bay.y + 88, statusColor, 8, 0.8);
      }
    }
  }

  drawBatchPlants(state, bay, time) {
    const ctx = this.ctx;
    const stage = clamp(state.growth / 100, 0.04, 1);
    const stress = clamp(state.heatStress / 100, 0, 0.8);
    const seed = 31 + state.round * 17;
    const offsets = [-78, -26, 27, 78];

    for (let i = 0; i < offsets.length; i += 1) {
      this.drawPlant(
        bay.cx + offsets[i],
        bay.y + 25,
        0.84 + (i % 2) * 0.12,
        stage,
        state.phase === "ready",
        stress,
        time,
        seed + i * 9,
      );
    }

    if (stage > 0.62) {
      const rootGlow = ctx.createLinearGradient(0, bay.y + 28, 0, bay.y + 66);
      rootGlow.addColorStop(0, "rgba(74, 51, 28, 0.75)");
      rootGlow.addColorStop(1, "rgba(23, 19, 13, 0.9)");
      ctx.fillStyle = rootGlow;
      roundedRect(ctx, bay.cx - 50, bay.y + 34, 100, 25, 8);
      ctx.fill();
      for (let i = 0; i < 4; i += 1) {
        const tuberAlpha = clamp((stage - 0.62) * 2.5, 0, 1);
        ctx.fillStyle = `rgba(205, 157, 82, ${tuberAlpha * 0.84})`;
        ctx.beginPath();
        ctx.ellipse(bay.cx - 32 + i * 21, bay.y + 48 + (i % 2) * 3, 8, 5, i * 0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = `rgba(245, 200, 119, ${tuberAlpha * 0.24})`;
        ctx.stroke();
      }
    }

    if (state.phase === "ready") {
      const halo = ctx.createRadialGradient(bay.cx, bay.y - 70, 5, bay.cx, bay.y - 70, 160);
      halo.addColorStop(0, "rgba(255, 213, 119, 0.1)");
      halo.addColorStop(1, "rgba(255, 213, 119, 0)");
      ctx.fillStyle = halo;
      ctx.fillRect(bay.cx - 160, bay.y - 230, 320, 300);
    }
  }

  drawPlant(x, baseY, scale, stage, ripe, stress, time, seed) {
    const ctx = this.ctx;
    const height = (18 + stage * 166) * scale;
    const sway = 3.2 + stage * 5.5;
    const green = ripe ? "#b8da70" : "#68a96f";
    const stressColor = stress > 0.18 ? "#a99454" : green;

    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    for (let stem = 0; stem < 3; stem += 1) {
      const side = stem - 1;
      const phase = time * 0.72 + seed * 0.11 + stem * 1.7;
      const tipX = x + side * stage * 24 + Math.sin(phase) * sway;
      const tipY = baseY - height * (0.83 + stem * 0.055);
      const bendX = x + side * stage * 13 + Math.sin(phase + 1.3) * sway * 0.4;
      const bendY = baseY - height * 0.5;

      ctx.strokeStyle = stress > 0.45 ? "rgba(159, 137, 69, 0.82)" : "rgba(91, 168, 102, 0.92)";
      ctx.lineWidth = Math.max(1.1, 2.3 * scale);
      ctx.beginPath();
      ctx.moveTo(x + side * 5 * scale, baseY);
      ctx.quadraticCurveTo(bendX, bendY, tipX, tipY);
      ctx.stroke();

      const leafCount = stage < 0.15 ? 1 : 3;
      for (let leaf = 1; leaf <= leafCount; leaf += 1) {
        const t = 0.32 + leaf * 0.2;
        const px = (1 - t) * (1 - t) * (x + side * 5) + 2 * (1 - t) * t * bendX + t * t * tipX;
        const py = (1 - t) * (1 - t) * baseY + 2 * (1 - t) * t * bendY + t * t * tipY;
        const sideLeaf = (leaf + stem) % 2 === 0 ? 1 : -1;
        this.drawLeaf(px, py, sideLeaf, scale * (0.7 + stage * 0.45), stressColor, stress, seed + leaf + stem);
      }
    }

    ctx.fillStyle = stress > 0.2 ? "rgba(146, 130, 74, 0.8)" : "rgba(83, 153, 91, 0.9)";
    ctx.beginPath();
    ctx.ellipse(x, baseY - 1, 7 + stage * 11, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawLeaf(x, y, side, scale, color, stress, seed) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(side * (0.42 + Math.sin(seed) * 0.12) + stress * 0.2);
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.78 + (seed % 3) * 0.07;
    ctx.beginPath();
    ctx.ellipse(side * 10 * scale, -4 * scale, 12 * scale, 5.2 * scale, side * 0.28, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(207, 239, 169, 0.22)";
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(side * 20 * scale, -7 * scale);
    ctx.stroke();
    ctx.restore();
  }

  drawHarvestedBed(bay, record, time) {
    const ctx = this.ctx;
    const pulse = 0.6 + Math.sin(time * 0.8) * 0.1;
    ctx.save();
    ctx.strokeStyle = `rgba(165, 184, 145, ${pulse * 0.4})`;
    ctx.lineWidth = 1;
    for (let i = 0; i < 3; i += 1) {
      const x = bay.cx - 38 + i * 38;
      ctx.beginPath();
      ctx.moveTo(x, bay.y + 24);
      ctx.lineTo(x + (i - 1) * 4, bay.y + 13);
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(132, 151, 125, 0.55)";
    roundedRect(ctx, bay.cx - 45, bay.y + 38, 90, 20, 3);
    ctx.fill();
    drawLabel(ctx, `+${record.edibleKg.toFixed(1)} KG`, bay.cx - 29, bay.y + 52, "rgba(210, 225, 195, 0.78)", 8, 0.8);
    ctx.restore();
  }

  drawSeedBed(bay, state, time) {
    const ctx = this.ctx;
    const pulse = 0.25 + Math.sin(time * 1.4) * 0.08;
    const glow = ctx.createRadialGradient(bay.cx, bay.y + 24, 1, bay.cx, bay.y + 24, 58);
    glow.addColorStop(0, `rgba(242, 179, 95, ${pulse})`);
    glow.addColorStop(1, "rgba(242, 179, 95, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(bay.cx - 60, bay.y - 36, 120, 120);
    ctx.strokeStyle = "rgba(230, 190, 116, 0.55)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(bay.cx, bay.y + 24, 13, 7, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "rgba(201, 158, 82, 0.45)";
    ctx.beginPath();
    ctx.ellipse(bay.cx, bay.y + 24, 7, 4, 0.2, 0, Math.PI * 2);
    ctx.fill();
    drawLabel(
      ctx,
      state.phase === "interplant" ? "SEED STOCK SECURED" : "SEED STOCK / READY",
      bay.cx - 58,
      bay.y + 51,
      "rgba(210, 172, 105, 0.6)",
      7,
      0.7,
    );
  }

  drawPump(state, time) {
    const ctx = this.ctx;
    const x = 1062;
    const y = 402;
    const w = 92;
    const h = 164;
    const cx = x + w / 2;
    const cy = y + 74;

    ctx.save();
    roundedRect(ctx, x, y, w, h, 5);
    const body = ctx.createLinearGradient(x, y, x + w, y + h);
    body.addColorStop(0, "rgba(41, 65, 58, 0.98)");
    body.addColorStop(1, "rgba(13, 27, 23, 0.98)");
    ctx.fillStyle = body;
    ctx.fill();
    ctx.strokeStyle = state.pumpOn ? "rgba(102, 216, 204, 0.48)" : "rgba(178, 101, 81, 0.42)";
    ctx.stroke();

    ctx.fillStyle = "rgba(4, 15, 13, 0.78)";
    ctx.beginPath();
    ctx.arc(cx, cy, 30, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(129, 179, 158, 0.28)";
    ctx.stroke();

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(state.pumpOn ? time * 4.2 : 0.5);
    for (let i = 0; i < 4; i += 1) {
      ctx.rotate(Math.PI / 2);
      ctx.fillStyle = state.pumpOn ? "rgba(107, 224, 211, 0.72)" : "rgba(114, 128, 119, 0.42)";
      ctx.beginPath();
      ctx.ellipse(0, -12, 3.2, 11, 0.45, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    ctx.fillStyle = state.pumpOn ? "#86ebd6" : "#dc735f";
    ctx.shadowColor = state.pumpOn ? "#69d8c8" : "#d65c4b";
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(cx, cy, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    drawLabel(ctx, "COOLANT", x + 22, y + 123, "rgba(153, 190, 173, 0.7)", 8, 0.8);
    drawLabel(ctx, state.pumpOn ? "ON" : "OFF", x + 37, y + 142, state.pumpOn ? "rgba(129, 232, 210, 0.9)" : "rgba(242, 114, 91, 0.9)", 9, 1);

    ctx.strokeStyle = "rgba(72, 155, 149, 0.35)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(cx, y + h);
    ctx.lineTo(cx, 590);
    ctx.stroke();
    ctx.restore();
  }

  drawAtmosphere(state, time) {
    const ctx = this.ctx;
    const active = ["growing", "ready"].includes(state.phase);
    if (!active) return;

    const bay = BAYS[state.round - 1];
    const light = (state.cycleHours - 6 + 24) % 24 < state.controls.light;
    const bubbleCount = light ? 18 : 5;

    ctx.save();
    ctx.globalCompositeOperation = "screen";
    for (let i = 0; i < bubbleCount; i += 1) {
      const period = 4.5 + (i % 4) * 0.7;
      const t = ((time * 0.18 + i * 0.137) % 1);
      const x = bay.cx - 100 + (i * 37) % 205 + Math.sin(time * 0.9 + i) * 12;
      const y = 480 - t * (265 + (i % 3) * 24);
      const a = Math.sin(t * Math.PI) * (light ? 0.44 : 0.16);
      ctx.fillStyle = `rgba(119, 235, 221, ${a})`;
      ctx.beginPath();
      ctx.arc(x, y, 1.2 + (i % 3) * 0.7, 0, Math.PI * 2);
      ctx.fill();
    }

    const o2Aura = ctx.createRadialGradient(bay.cx, 400, 5, bay.cx, 400, 150);
    o2Aura.addColorStop(0, "rgba(95, 227, 203, 0.025)");
    o2Aura.addColorStop(1, "rgba(95, 227, 203, 0)");
    ctx.fillStyle = o2Aura;
    ctx.fillRect(bay.cx - 150, 250, 300, 300);
    ctx.restore();

    drawLabel(
      ctx,
      `O₂ ${state.oxygenPct.toFixed(2)}%`,
      144,
      252,
      state.oxygenPct < CONFIG.thresholds.oxygenLow ? "rgba(255, 116, 86, 0.9)" : "rgba(113, 227, 212, 0.68)",
      11,
      1.2,
    );
    drawLabel(
      ctx,
      light ? "PHOTOSYNTHESIS ACTIVE" : "DARK RESPIRATION",
      144,
      269,
      light ? "rgba(148, 206, 171, 0.48)" : "rgba(119, 139, 158, 0.58)",
      7,
      1,
    );
  }

  drawThermalScan(state, time) {
    const ctx = this.ctx;
    const temp = state.tempC;
    const hot = temp >= CONFIG.thresholds.overheat;
    ctx.save();
    ctx.fillStyle = "rgba(4, 18, 19, 0.28)";
    ctx.fillRect(38, 56, 1128, 548);
    ctx.globalCompositeOperation = "screen";

    for (let i = 0; i < BAYS.length; i += 1) {
      const bay = BAYS[i];
      const radius = 80 + (i === state.round - 1 ? 30 : 0);
      const g = ctx.createRadialGradient(bay.cx, 205, 3, bay.cx, 205, radius);
      const heat = clamp((temp - 19) / 18, 0.08, 1);
      g.addColorStop(0, `rgba(255, 202, 91, ${0.34 + heat * 0.22})`);
      g.addColorStop(0.35, `rgba(242, 102, 48, ${0.14 + heat * 0.14})`);
      g.addColorStop(1, "rgba(55, 34, 109, 0)");
      ctx.fillStyle = g;
      ctx.fillRect(bay.cx - radius, 205 - radius, radius * 2, radius * 2);
    }

    const pump = ctx.createRadialGradient(1108, 476, 3, 1108, 476, 82);
    pump.addColorStop(0, "rgba(255, 151, 54, 0.35)");
    pump.addColorStop(1, "rgba(26, 49, 102, 0)");
    ctx.fillStyle = pump;
    ctx.fillRect(1020, 390, 180, 180);
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = "rgba(242, 190, 107, 0.22)";
    ctx.setLineDash([3, 6]);
    ctx.lineWidth = 1;
    for (let y = 92; y < 580; y += 8) {
      ctx.beginPath();
      ctx.moveTo(40, y);
      ctx.lineTo(1164, y);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    drawLabel(ctx, "THERMAL IMAGING / LWIR", 70, 113, "rgba(246, 191, 107, 0.92)", 9, 1.3);
    drawLabel(ctx, "LOW-G CONVECTION", 70, 128, "rgba(218, 147, 86, 0.54)", 7, 1);
    const target = 200 + Math.sin(time * 0.7) * 6;
    ctx.strokeStyle = "rgba(255, 201, 107, 0.4)";
    ctx.beginPath();
    ctx.moveTo(960, 112);
    ctx.lineTo(966, 112);
    ctx.moveTo(960, 112);
    ctx.lineTo(960, 118);
    ctx.stroke();
    drawLabel(
      ctx,
      `MAX ${temp.toFixed(1)}°C`,
      972,
      114,
      hot ? "rgba(255, 116, 82, 0.95)" : "rgba(247, 197, 119, 0.72)",
      8,
      0.8,
    );
    ctx.strokeStyle = hot ? "rgba(255, 108, 72, 0.55)" : "rgba(240, 188, 108, 0.35)";
    ctx.strokeRect(1006, 358, 154, 126);
    drawLabel(
      ctx,
      state.pumpOn ? "PUMP SINK ACTIVE" : "HEAT TRAP",
      1018,
      348,
      hot ? "rgba(255, 126, 82, 0.85)" : "rgba(236, 178, 102, 0.55)",
      7,
      0.8,
    );
    ctx.restore();
  }

  drawVignette(state) {
    const ctx = this.ctx;
    const overheat = state.tempC >= CONFIG.thresholds.overheat;
    const vignette = ctx.createRadialGradient(600, 350, 230, 600, 350, 760);
    vignette.addColorStop(0, "rgba(0, 0, 0, 0)");
    vignette.addColorStop(0.72, "rgba(0, 0, 0, 0.12)");
    vignette.addColorStop(1, "rgba(0, 0, 0, 0.51)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    if (overheat) {
      const warning = ctx.createLinearGradient(0, 0, 0, 44);
      warning.addColorStop(0, "rgba(255, 78, 48, 0.19)");
      warning.addColorStop(1, "rgba(255, 78, 48, 0)");
      ctx.fillStyle = warning;
      ctx.fillRect(0, 0, WIDTH, 44);
      drawLabel(ctx, "THERMAL WARNING", 928, 70, "rgba(255, 124, 91, 0.88)", 9, 1.4);
    }

    ctx.strokeStyle = "rgba(164, 207, 183, 0.2)";
    ctx.lineWidth = 1;
    const corner = 17;
    const inset = 12;
    for (const [x, y, sx, sy] of [
      [inset, inset, 1, 1],
      [WIDTH - inset, inset, -1, 1],
      [inset, HEIGHT - inset, 1, -1],
      [WIDTH - inset, HEIGHT - inset, -1, -1],
    ]) {
      ctx.beginPath();
      ctx.moveTo(x + sx * corner, y);
      ctx.lineTo(x, y);
      ctx.lineTo(x, y + sy * corner);
      ctx.stroke();
    }
    drawLabel(ctx, "AIRLOCK SEALED / O₂ LOOP NOMINAL", 925, 684, "rgba(159, 194, 175, 0.38)", 7, 0.8);
  }
}
