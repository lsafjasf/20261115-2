export const WORLD = { width: 1600, height: 900 };
export const GEOMETRY = {
  towerX: 1082,
  towerBaseY: 600,
  towerTopY: 174,
  hubX: 1112,
  hubY: 166,
  bladeTipX: 1410,
  bladeTipY: 500,
  crackX: 1294,
  crackY: 372,
  carX: 1024,
  carBaseY: 568,
  carTravel: 318,
  armLength: 254,
  boatTargetWorldX: 878,
};

const COLORS = {
  white: "#edf3f0",
  whiteDim: "#aebfbe",
  steel: "#536b70",
  orange: "#ff9a3d",
  orangeHot: "#ffba68",
  green: "#68e0b0",
  red: "#ff6961",
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function rand(seed) {
  const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function roundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
}

function line(ctx, x1, y1, x2, y2, color, width = 1) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

export class SceneRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.time = 0;
    this.particles = Array.from({ length: 115 }, (_, index) => ({
      x: rand(index + 1) * 1700 - 50,
      y: 95 + rand(index + 2.5) * 385,
      length: 14 + rand(index + 4.2) * 55,
      thickness: 0.55 + rand(index + 9.7) * 1.6,
      speed: 6 + rand(index + 11.1) * 26,
      phase: rand(index + 14.8) * Math.PI * 2,
    }));
    this.clouds = Array.from({ length: 18 }, (_, index) => ({
      x: rand(index + 7) * 1800 - 100,
      y: 80 + rand(index + 3) * 260,
      width: 110 + rand(index + 17) * 260,
      height: 18 + rand(index + 20) * 42,
      alpha: 0.03 + rand(index + 29) * 0.12,
      speed: 2 + rand(index + 31) * 6,
    }));
    this.resize();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.max(1, Math.round(rect.width * dpr));
    this.canvas.height = Math.max(1, Math.round(rect.height * dpr));
    this.scale = this.canvas.width / WORLD.width;
  }

  render(state, dt) {
    const ctx = this.ctx;
    this.time = state.time;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.scale(this.scale, this.scale);

    this.drawSky(state);
    this.drawClouds(state);
    this.drawWindField(state);
    this.drawDistantFarm(state);
    this.drawSea(state, dt);
    this.drawBoat(state);
    this.drawTower(state);
    this.drawRotor(state);
    this.drawPlatform(state);
    this.drawSceneLabels(state);
    this.drawAtmosphere(state);
  }

  drawSky(state) {
    const ctx = this.ctx;
    const sky = ctx.createLinearGradient(0, 0, 0, 540);
    sky.addColorStop(0, "#263f4c");
    sky.addColorStop(0.46, "#6f929c");
    sky.addColorStop(0.77, "#b8c7c2");
    sky.addColorStop(1, "#d8d2bd");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, WORLD.width, 540);

    const haze = ctx.createRadialGradient(330, 300, 20, 330, 300, 380);
    haze.addColorStop(0, "rgba(255, 210, 143, 0.26)");
    haze.addColorStop(0.45, "rgba(255, 208, 145, 0.1)");
    haze.addColorStop(1, "rgba(255, 205, 140, 0)");
    ctx.fillStyle = haze;
    ctx.fillRect(0, 40, 880, 500);

    ctx.fillStyle = "rgba(255, 220, 164, 0.5)";
    ctx.beginPath();
    ctx.arc(330, 300, 28, 0, Math.PI * 2);
    ctx.fill();

    const horizon = ctx.createLinearGradient(0, 454, 0, 538);
    horizon.addColorStop(0, "rgba(223, 219, 202, 0)");
    horizon.addColorStop(0.56, "rgba(234, 225, 203, 0.36)");
    horizon.addColorStop(1, "rgba(48, 87, 92, 0.2)");
    ctx.fillStyle = horizon;
    ctx.fillRect(0, 454, WORLD.width, 86);
  }

  drawClouds(state) {
    const ctx = this.ctx;
    for (const cloud of this.clouds) {
      const drift = (state.time * cloud.speed + cloud.x) % 1900 - 150;
      ctx.fillStyle = `rgba(235, 242, 238, ${cloud.alpha})`;
      ctx.beginPath();
      ctx.ellipse(drift, cloud.y, cloud.width, cloud.height, -0.06, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawWindField(state) {
    const ctx = this.ctx;
    const wind = state.wind;
    const strength = clamp((wind - 3) / 20, 0, 1);
    ctx.save();
    ctx.lineCap = "round";

    for (const particle of this.particles) {
      const travel = (particle.x + state.time * particle.speed * (0.38 + wind * 0.055)) % 1750;
      const x = travel - 60;
      const y = particle.y + Math.sin(state.time * 0.8 + particle.phase) * (4 + strength * 11);
      const slope = -0.06 - strength * 0.14;
      const alpha = (0.045 + strength * 0.26) * (0.45 + rand(particle.phase) * 0.55);
      ctx.strokeStyle = `rgba(240, 248, 244, ${alpha})`;
      ctx.lineWidth = particle.thickness;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + particle.length * (0.55 + strength), y + particle.length * slope);
      ctx.stroke();
    }

    ctx.globalAlpha = 0.045 + strength * 0.12;
    for (let index = 0; index < 4; index += 1) {
      const baseY = 205 + index * 82;
      ctx.strokeStyle = "#f1f8f5";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (let x = -80; x <= 1680; x += 22) {
        const y = baseY + Math.sin(x * 0.014 + state.time * 1.45 + index) * (8 + strength * 13);
        ctx.moveTo(x, y);
        ctx.lineTo(x + 34, y - 3 - strength * 3);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  drawDistantFarm(state) {
    const ctx = this.ctx;
    const turbines = [
      { x: 75, y: 486, scale: 0.33, phase: 0.4 },
      { x: 244, y: 492, scale: 0.25, phase: 2.1 },
      { x: 1480, y: 490, scale: 0.27, phase: 1.2 },
    ];

    for (const turbine of turbines) {
      const hazeAlpha = 0.18;
      const rotorAngle = turbine.phase + state.time * 0.05;
      ctx.strokeStyle = `rgba(31, 59, 64, ${hazeAlpha})`;
      ctx.fillStyle = `rgba(50, 82, 86, ${hazeAlpha + 0.06})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(turbine.x - 1, turbine.y);
      ctx.lineTo(turbine.x, turbine.y - 120 * turbine.scale);
      ctx.lineTo(turbine.x + 2, turbine.y - 120 * turbine.scale);
      ctx.lineTo(turbine.x + 2, turbine.y);
      ctx.fill();
      for (let blade = 0; blade < 3; blade += 1) {
        const angle = rotorAngle + blade * Math.PI * 2 / 3;
        ctx.beginPath();
        ctx.moveTo(turbine.x, turbine.y - 123 * turbine.scale);
        ctx.lineTo(
          turbine.x + Math.cos(angle) * 64 * turbine.scale,
          turbine.y - 123 * turbine.scale + Math.sin(angle) * 64 * turbine.scale,
        );
        ctx.stroke();
      }
    }
  }

  drawSea(state, dt) {
    const ctx = this.ctx;
    const sea = ctx.createLinearGradient(0, 505, 0, WORLD.height);
    sea.addColorStop(0, "#31565d");
    sea.addColorStop(0.2, "#1c4149");
    sea.addColorStop(0.65, "#0e2c35");
    sea.addColorStop(1, "#071b23");
    ctx.fillStyle = sea;
    ctx.fillRect(0, 505, WORLD.width, WORLD.height - 505);

    const glint = ctx.createRadialGradient(330, 540, 10, 330, 540, 490);
    glint.addColorStop(0, "rgba(255, 218, 169, 0.17)");
    glint.addColorStop(0.45, "rgba(204, 229, 224, 0.08)");
    glint.addColorStop(1, "rgba(204, 229, 224, 0)");
    ctx.fillStyle = glint;
    ctx.fillRect(0, 505, 1030, 300);

    const strength = clamp((state.wind - 4) / 18, 0, 1);
    const waves = [
      { y: 544, amp: 1.7 + strength * 2, speed: 0.34, alpha: 0.16, width: 1 },
      { y: 586, amp: 2.3 + strength * 3.6, speed: 0.47, alpha: 0.15, width: 1.2 },
      { y: 642, amp: 3.2 + strength * 5, speed: 0.62, alpha: 0.12, width: 1.5 },
      { y: 720, amp: 4.2 + strength * 7, speed: 0.76, alpha: 0.09, width: 2 },
      { y: 820, amp: 5.8 + strength * 8, speed: 0.9, alpha: 0.06, width: 2.5 },
    ];

    for (const wave of waves) {
      ctx.strokeStyle = `rgba(191, 226, 223, ${wave.alpha})`;
      ctx.lineWidth = wave.width;
      ctx.beginPath();
      for (let x = -40; x <= WORLD.width + 40; x += 16) {
        const y = wave.y
          + Math.sin(x * 0.018 + state.time * wave.speed + wave.y) * wave.amp
          + Math.sin(x * 0.006 - state.time * 0.22) * wave.amp * 0.45;
        if (x === -40) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    ctx.fillStyle = "rgba(229, 234, 220, 0.1)";
    for (let index = 0; index < 49; index += 1) {
      const x = (index * 137 + state.time * (11 + state.wind * 2.2)) % 1720 - 60;
      const y = 535 + rand(index + 2) * 250;
      const width = 10 + rand(index + 5) * 29;
      ctx.beginPath();
      ctx.ellipse(x, y, width, 1.2 + strength * 0.8, -0.06, 0, Math.PI * 2);
      ctx.fill();
    }

    this.drawTowerFoam(state, strength);
  }

  drawTowerFoam(state, strength) {
    const ctx = this.ctx;
    const x = GEOMETRY.towerX;
    ctx.save();
    ctx.strokeStyle = `rgba(222, 237, 227, ${0.13 + strength * 0.1})`;
    for (let ring = 0; ring < 3; ring += 1) {
      const radius = 84 + ring * 28 + Math.sin(state.time * 1.1 + ring) * 8;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(x + 8, 610, radius, 10 + ring * 3, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawBoat(state) {
    const ctx = this.ctx;
    const x = state.boatWorldX;
    const bob = Math.sin(state.time * 0.9) * 1.8 + Math.sin(state.time * 1.4) * 1;
    const y = bob;
    const aligned = Math.abs(state.boatPosition - 82) <= 5;

    if (!state.docked) {
      ctx.save();
      ctx.strokeStyle = aligned ? "rgba(104, 224, 176, 0.7)" : "rgba(255, 154, 61, 0.45)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([8, 6]);
      ctx.beginPath();
      ctx.ellipse(GEOMETRY.boatTargetWorldX, 654, 106, 25, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = aligned ? "rgba(104, 224, 176, 0.7)" : "rgba(255, 154, 61, 0.62)";
      ctx.font = "500 10px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.fillText(aligned ? "BOAT LANDING · 可对接" : "BOAT LANDING", GEOMETRY.boatTargetWorldX, 680);
      ctx.restore();
    }

    ctx.save();
    ctx.translate(x, y);

    ctx.fillStyle = "rgba(0, 9, 12, 0.24)";
    ctx.beginPath();
    ctx.ellipse(0, 620, 136, 23, 0, 0, Math.PI * 2);
    ctx.fill();

    const wake = ctx.createLinearGradient(-220, 600, -115, 600);
    wake.addColorStop(0, "rgba(205, 231, 226, 0)");
    wake.addColorStop(1, "rgba(205, 231, 226, 0.14)");
    ctx.fillStyle = wake;
    ctx.beginPath();
    ctx.moveTo(-196, 600);
    ctx.lineTo(-106, 586);
    ctx.lineTo(-102, 611);
    ctx.lineTo(-214, 624);
    ctx.fill();

    ctx.fillStyle = "#dbe3dd";
    ctx.beginPath();
    ctx.moveTo(-128, 560);
    ctx.lineTo(128, 560);
    ctx.lineTo(113, 615);
    ctx.quadraticCurveTo(0, 636, -113, 615);
    ctx.closePath();
    ctx.fill();

    const hullShade = ctx.createLinearGradient(0, 560, 0, 630);
    hullShade.addColorStop(0, "rgba(255,255,255,0)");
    hullShade.addColorStop(1, "rgba(31, 54, 58, 0.55)");
    ctx.fillStyle = hullShade;
    ctx.fill();
    ctx.fillStyle = "#cf6e32";
    ctx.beginPath();
    ctx.moveTo(-132, 585);
    ctx.lineTo(128, 585);
    ctx.lineTo(111, 602);
    ctx.lineTo(-118, 602);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#132f35";
    ctx.beginPath();
    ctx.moveTo(-119, 604);
    ctx.quadraticCurveTo(0, 625, 112, 604);
    ctx.lineTo(104, 614);
    ctx.quadraticCurveTo(0, 636, -113, 614);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#6b8488";
    ctx.fillRect(-128, 552, 256, 8);
    ctx.fillStyle = "#1a353b";
    ctx.fillRect(-126, 558, 252, 2);

    ctx.fillStyle = "#e7ebe5";
    ctx.fillRect(-89, 506, 81, 52);
    ctx.fillStyle = "#365a61";
    ctx.fillRect(-80, 515, 62, 18);
    ctx.fillStyle = "rgba(157, 217, 219, 0.75)";
    ctx.fillRect(-76, 519, 17, 10);
    ctx.fillRect(-55, 519, 17, 10);
    ctx.fillRect(-34, 519, 13, 10);
    ctx.fillStyle = "#ff9a3d";
    ctx.fillRect(-88, 536, 78, 3);
    ctx.fillStyle = "#d6e1dd";
    ctx.beginPath();
    ctx.moveTo(-94, 506);
    ctx.lineTo(-52, 492);
    ctx.lineTo(-18, 502);
    ctx.lineTo(-16, 509);
    ctx.lineTo(-91, 509);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = "#9eaaa6";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-43, 492);
    ctx.lineTo(-43, 448);
    ctx.stroke();
    ctx.fillStyle = "#ff9a3d";
    ctx.beginPath();
    ctx.arc(-43, 453, 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "rgba(220, 236, 230, 0.5)";
    ctx.lineWidth = 1;
    for (let rail = -5; rail < 110; rail += 23) {
      ctx.beginPath();
      ctx.moveTo(rail, 552);
      ctx.lineTo(rail, 538);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(-5, 539);
    ctx.lineTo(111, 539);
    ctx.stroke();

    if (state.crewOnBoat) {
      this.drawWorker(ctx, 43, 542, 0.84, "#ff9a3d");
      this.drawWorker(ctx, 68, 543, 0.8, "#e6b15f");
    }

    ctx.fillStyle = "#ffb45f";
    ctx.beginPath();
    ctx.arc(118, 570, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    if (state.docked || state.transferProgress > 0) {
      this.drawGangway(state);
    }
  }

  drawGangway(state) {
    const ctx = this.ctx;
    const boatX = state.boatWorldX;
    const startX = boatX + 95;
    const endX = 1030;
    const progress = clamp(state.transferProgress, 0, 1);
    ctx.save();
    ctx.strokeStyle = "rgba(237, 240, 224, 0.75)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(startX, 545);
    ctx.lineTo(startX + (endX - startX) * progress, 564);
    ctx.stroke();
    ctx.strokeStyle = `rgba(255, 154, 61, ${0.65 + progress * 0.2})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(startX, 535);
    ctx.lineTo(startX + (endX - startX) * progress, 553);
    ctx.stroke();
    ctx.strokeStyle = "rgba(219, 231, 223, 0.46)";
    for (let step = 0.12; step < progress; step += 0.11) {
      const x = startX + (endX - startX) * step;
      const y = 545 + (564 - 545) * step;
      line(ctx, x, y, x, y - 9, "rgba(219, 231, 223, 0.35)", 1);
    }

    if (state.transferProgress > 0.1 && state.transferProgress < 0.95) {
      const crewX = startX + (endX - startX) * progress - 8;
      const crewY = 545 + (564 - 545) * progress - 4;
      this.drawWorker(ctx, crewX, crewY, 0.72, "#ff9a3d");
    }
    ctx.restore();
  }

  drawWorker(ctx, x, y, scale = 1, color = "#ff9a3d") {
    const baseHeight = 22 * scale;
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = "#263239";
    ctx.lineWidth = Math.max(1, 2 * scale);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-2 * scale, -5 * scale);
    ctx.lineTo(-4 * scale, 3 * scale);
    ctx.moveTo(3 * scale, -5 * scale);
    ctx.lineTo(5 * scale, 3 * scale);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(-6 * scale, -15 * scale);
    ctx.lineTo(6 * scale, -15 * scale);
    ctx.lineTo(4 * scale, -4 * scale);
    ctx.lineTo(-4 * scale, -4 * scale);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#f0cf9d";
    ctx.beginPath();
    ctx.arc(0, -18 * scale, 4.2 * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f2f4e9";
    ctx.beginPath();
    ctx.arc(0, -21.4 * scale, 4.8 * scale, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffba68";
    ctx.fillRect(-4.5 * scale, -18.2 * scale, 9 * scale, 1.8 * scale);
    ctx.restore();
  }

  drawTower(state) {
    const ctx = this.ctx;
    const { towerX, towerBaseY, towerTopY } = GEOMETRY;
    const bottomHalf = 46;
    const topHalf = 19;
    const towerHeight = towerBaseY - towerTopY;

    ctx.save();

    ctx.fillStyle = "rgba(0, 8, 11, 0.23)";
    ctx.beginPath();
    ctx.ellipse(towerX + 24, 611, 94, 18, 0, 0, Math.PI * 2);
    ctx.fill();

    const towerFill = ctx.createLinearGradient(towerX - bottomHalf, 0, towerX + bottomHalf, 0);
    towerFill.addColorStop(0, "#9badaa");
    towerFill.addColorStop(0.18, "#dfe7e2");
    towerFill.addColorStop(0.5, "#f0f3eb");
    towerFill.addColorStop(0.82, "#d7dfdb");
    towerFill.addColorStop(1, "#8d9e9d");
    ctx.fillStyle = towerFill;
    ctx.beginPath();
    ctx.moveTo(towerX - bottomHalf, towerBaseY);
    ctx.lineTo(towerX - topHalf, towerTopY);
    ctx.lineTo(towerX + topHalf, towerTopY);
    ctx.lineTo(towerX + bottomHalf, towerBaseY);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = "rgba(80, 107, 109, 0.25)";
    ctx.lineWidth = 1;
    for (let seam = 1; seam < 11; seam += 1) {
      const ratio = seam / 11;
      const y = towerBaseY - towerHeight * ratio;
      const half = bottomHalf + (topHalf - bottomHalf) * ratio;
      ctx.beginPath();
      ctx.moveTo(towerX - half + 2, y);
      ctx.lineTo(towerX + half - 2, y);
      ctx.stroke();
    }

    ctx.fillStyle = "rgba(43, 69, 72, 0.45)";
    ctx.font = "700 10px ui-monospace, monospace";
    ctx.save();
    ctx.translate(towerX + 4, 458);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText("WTG-04", 0, 0);
    ctx.restore();

    const piece = ctx.createLinearGradient(towerX - 58, 0, towerX + 58, 0);
    piece.addColorStop(0, "#856834");
    piece.addColorStop(0.25, "#e1b14f");
    piece.addColorStop(0.7, "#c49237");
    piece.addColorStop(1, "#6f572d");
    ctx.fillStyle = piece;
    ctx.beginPath();
    ctx.moveTo(towerX - 48, towerBaseY - 2);
    ctx.lineTo(towerX - 43, 568);
    ctx.lineTo(towerX + 43, 568);
    ctx.lineTo(towerX + 49, towerBaseY - 2);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#2d4244";
    ctx.fillRect(towerX - 13, 548, 26, 52);
    ctx.fillStyle = "#d5a94c";
    ctx.fillRect(towerX - 10, 551, 20, 35);
    ctx.strokeStyle = "rgba(53, 70, 68, 0.6)";
    ctx.strokeRect(towerX - 10, 551, 20, 35);

    ctx.fillStyle = "#fbaf55";
    ctx.fillRect(towerX - 68, 578, 137, 10);
    ctx.fillStyle = "#7d642e";
    ctx.fillRect(towerX - 74, 587, 149, 5);
    ctx.fillStyle = "#f3c86f";
    for (let bumper = 0; bumper < 5; bumper += 1) {
      ctx.beginPath();
      ctx.arc(towerX - 55 + bumper * 28, 592, 5, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.strokeStyle = "rgba(226, 236, 225, 0.72)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(towerX - 58, 577);
    ctx.lineTo(towerX - 58, 548);
    ctx.lineTo(towerX - 8, 548);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(towerX + 51, 577);
    ctx.lineTo(towerX + 51, 548);
    ctx.lineTo(towerX + 14, 548);
    ctx.stroke();
    for (let rail = 0; rail < 5; rail += 1) {
      line(ctx, towerX - 58 + rail * 12, 548, towerX - 58 + rail * 12, 560, "rgba(225, 236, 225, 0.48)", 1);
    }

    ctx.strokeStyle = "rgba(47, 75, 78, 0.68)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(towerX - 27, 574);
    ctx.lineTo(towerX - 27, 204);
    ctx.moveTo(towerX - 37, 574);
    ctx.lineTo(towerX - 33, 204);
    ctx.stroke();
    for (let rung = 0; rung < 26; rung += 1) {
      const y = 566 - rung * 14;
      line(ctx, towerX - 29, y, towerX - 24, y - 1, "rgba(54, 83, 85, 0.42)", 1);
    }

    const beaconAlpha = 0.55 + Math.sin(state.time * 3.1) * 0.35;
    ctx.fillStyle = `rgba(255, 90, 72, ${beaconAlpha})`;
    ctx.beginPath();
    ctx.arc(towerX - 20, 181, 3.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawRotor(state) {
    const ctx = this.ctx;
    const { hubX, hubY } = GEOMETRY;
    ctx.save();

    ctx.fillStyle = "rgba(0, 8, 11, 0.16)";
    ctx.beginPath();
    ctx.ellipse(hubX + 18, 192, 83, 11, 0, 0, Math.PI * 2);
    ctx.fill();

    const nacelle = ctx.createLinearGradient(hubX - 70, 0, hubX + 92, 0);
    nacelle.addColorStop(0, "#c9d5d0");
    nacelle.addColorStop(0.35, "#f0f2e9");
    nacelle.addColorStop(0.75, "#dbe3dd");
    nacelle.addColorStop(1, "#a9b9b6");
    ctx.fillStyle = nacelle;
    ctx.beginPath();
    ctx.moveTo(hubX - 66, 158);
    ctx.quadraticCurveTo(hubX - 81, 136, hubX - 53, 130);
    ctx.lineTo(hubX + 46, 131);
    ctx.quadraticCurveTo(hubX + 88, 135, hubX + 75, 164);
    ctx.quadraticCurveTo(hubX + 67, 181, hubX + 38, 181);
    ctx.lineTo(hubX - 49, 178);
    ctx.quadraticCurveTo(hubX - 70, 175, hubX - 66, 158);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(85, 108, 108, 0.24)";
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = "#7c8f8f";
    ctx.fillRect(hubX - 34, 141, 54, 20);
    ctx.fillStyle = "#ff9a3d";
    ctx.beginPath();
    ctx.arc(hubX + 9, 151, 3, 0, Math.PI * 2);
    ctx.fill();

    const targetAngle = Math.atan2(
      GEOMETRY.bladeTipY - hubY,
      GEOMETRY.bladeTipX - hubX,
    );
    this.drawBlade(hubX, hubY, targetAngle, 452, 25, true);
    this.drawBlade(hubX, hubY, targetAngle + Math.PI * 2 / 3, 405, 22, false);
    this.drawBlade(hubX, hubY, targetAngle + Math.PI * 4 / 3, 405, 22, false);

    ctx.fillStyle = "#e9eee8";
    ctx.beginPath();
    ctx.arc(hubX, hubY, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(55, 85, 87, 0.28)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "#a9b9b6";
    ctx.beginPath();
    ctx.arc(hubX, hubY, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#667e80";
    ctx.beginPath();
    ctx.arc(hubX, hubY, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  drawBlade(x, y, angle, length, width, target) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    const blade = ctx.createLinearGradient(0, -width, 0, width);
    blade.addColorStop(0, target ? "#f2f3e9" : "#dce4de");
    blade.addColorStop(0.5, target ? "#e5ebe5" : "#cbd6d1");
    blade.addColorStop(1, target ? "#aebfba" : "#9baaa7");
    ctx.fillStyle = blade;
    ctx.beginPath();
    ctx.moveTo(12, -width * 0.65);
    ctx.quadraticCurveTo(length * 0.33, -width, length * 0.98, -2);
    ctx.quadraticCurveTo(length, 0, length * 0.98, 2);
    ctx.quadraticCurveTo(length * 0.36, width * 0.72, 14, width * 0.54);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(65, 93, 94, 0.26)";
    ctx.lineWidth = 1.3;
    ctx.stroke();

    ctx.strokeStyle = target ? "rgba(255, 154, 61, 0.42)" : "rgba(105, 128, 126, 0.25)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(24, width * 0.45);
    ctx.quadraticCurveTo(length * 0.55, width * 0.18, length * 0.92, 1);
    ctx.stroke();

    if (target) {
      ctx.strokeStyle = "rgba(83, 111, 110, 0.38)";
      ctx.lineWidth = 1;
      for (let mark = 0.25; mark < 0.9; mark += 0.17) {
        line(ctx, length * mark, -width * 0.34, length * mark + 2, width * 0.29, "rgba(83, 111, 110, 0.28)", 1);
      }
    }
    ctx.restore();
  }

  platformPoint(lift, sway = 0, extension = 1) {
    const carY = GEOMETRY.carBaseY - lift * 3.18;
    const angle = sway * Math.PI / 180 * 1.55;
    const arm = 254 * extension;
    return {
      carX: GEOMETRY.carX,
      carY,
      angle,
      arm,
      x: GEOMETRY.carX + Math.cos(angle) * arm,
      y: carY + Math.sin(angle) * arm,
    };
  }

  drawPlatform(state) {
    if (state.phase === "approach" || state.phase === "transfer") return;
    const ctx = this.ctx;
    const { carX, carBaseY } = GEOMETRY;
    const extension = clamp(state.armExtend ?? 1, 0, 1);
    const point = this.platformPoint(state.lift, state.sway, extension);
    const targetY = carBaseY - 70 * 3.18;

    ctx.save();
    ctx.globalAlpha = state.phase === "success" ? 0.6 : 1;

    line(ctx, carX - 10, 192, carX - 10, carBaseY + 10, "rgba(48, 76, 78, 0.55)", 1.5);
    line(ctx, carX + 23, 192, carX + 23, carBaseY + 10, "rgba(48, 76, 78, 0.4)", 1);
    ctx.fillStyle = "#70898a";
    ctx.fillRect(carX - 16, 186, 40, 7);

    ctx.strokeStyle = "rgba(43, 63, 64, 0.58)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(carX - 1, 195);
    ctx.lineTo(carX - 1, point.carY - 19);
    ctx.moveTo(carX + 14, 195);
    ctx.lineTo(carX + 14, point.carY - 19);
    ctx.stroke();

    if (!state.locked) {
      ctx.strokeStyle = "rgba(255, 180, 95, 0.33)";
      ctx.lineWidth = 1;
      ctx.setLineDash([7, 7]);
      ctx.beginPath();
      ctx.moveTo(838, targetY);
      ctx.lineTo(1350, targetY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(255, 185, 104, 0.72)";
      ctx.font = "500 9px ui-monospace, monospace";
      ctx.fillText("TARGET ELEVATION 70%", 1192, targetY - 8);
    }

    ctx.save();
    ctx.translate(point.carX, point.carY);

    ctx.fillStyle = "rgba(10, 21, 24, 0.25)";
    roundedRect(ctx, 15, -5, 18, 13, 2);
    ctx.fill();

    const body = ctx.createLinearGradient(0, -23, 0, 22);
    body.addColorStop(0, "#ffbe68");
    body.addColorStop(0.45, "#e99a42");
    body.addColorStop(1, "#b86928");
    ctx.fillStyle = body;
    roundedRect(ctx, -26, -21, 54, 41, 3);
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 210, 145, 0.42)";
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = "#122c32";
    roundedRect(ctx, -20, -15, 22, 15, 1.5);
    ctx.fill();
    ctx.fillStyle = "rgba(143, 214, 218, 0.55)";
    ctx.fillRect(-18, -13, 8, 9);
    ctx.fillRect(-8, -13, 7, 9);
    ctx.fillStyle = "#ffd486";
    ctx.beginPath();
    ctx.arc(15, -10, 2.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#4a4d42";
    ctx.fillRect(-23, 17, 48, 4);
    ctx.fillStyle = "#8a8c78";
    ctx.beginPath();
    ctx.arc(-16, 22, 4, 0, Math.PI * 2);
    ctx.arc(17, 22, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(point.carX + 20, point.carY);
    ctx.rotate(point.angle);

    ctx.strokeStyle = "#d8a04f";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(0, -5);
    ctx.lineTo(point.arm, -5);
    ctx.moveTo(0, 5);
    ctx.lineTo(point.arm, 5);
    ctx.stroke();
    ctx.strokeStyle = "rgba(255, 210, 140, 0.55)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(point.arm, -7);
    ctx.stroke();

    for (let segment = 70; segment < point.arm; segment += 64) {
      line(ctx, segment, -8, segment, 8, "rgba(77, 75, 56, 0.35)", 1);
    }

    const basketX = point.arm;
    ctx.strokeStyle = "rgba(43, 65, 64, 0.7)";
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(basketX - 8, -5);
    ctx.lineTo(basketX - 8, -34);
    ctx.moveTo(basketX + 23, -5);
    ctx.lineTo(basketX + 23, -34);
    ctx.stroke();

    ctx.fillStyle = "#26383a";
    roundedRect(ctx, basketX - 33, 6, 67, 20, 2);
    ctx.fill();
    ctx.fillStyle = "#f0a849";
    ctx.fillRect(basketX - 33, 6, 67, 5);
    ctx.strokeStyle = "#ffd185";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(basketX - 33, 6);
    ctx.lineTo(basketX - 33, -13);
    ctx.lineTo(basketX + 34, -13);
    ctx.lineTo(basketX + 34, 6);
    ctx.stroke();
    for (let rail = -21; rail <= 22; rail += 11) {
      line(ctx, basketX + rail, 6, basketX + rail, -13, "rgba(255, 196, 112, 0.55)", 1);
    }
    ctx.fillStyle = "#d69a48";
    ctx.fillRect(basketX - 35, 24, 71, 3);

    if (state.lift > 3) {
      this.drawWorker(ctx, basketX - 16, -6, 0.7, "#ff9a3d");
      this.drawWorker(ctx, basketX + 10, -6, 0.66, "#ffc46c");
    }

    const gaugeX = basketX - 16;
    const gaugeY = 40;
    ctx.fillStyle = "rgba(7, 19, 22, 0.68)";
    roundedRect(ctx, gaugeX - 24, gaugeY - 8, 52, 17, 8);
    ctx.fill();
    ctx.strokeStyle = "rgba(180, 216, 214, 0.24)";
    ctx.stroke();
    ctx.fillStyle = Math.abs(state.sway) <= 3.2 ? COLORS.green : COLORS.red;
    ctx.beginPath();
    ctx.arc(gaugeX + clamp(state.sway / 5, -1, 1) * 17, gaugeY, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(190, 218, 216, 0.32)";
    line(ctx, gaugeX - 17, gaugeY, gaugeX + 17, gaugeY, "rgba(190, 218, 216, 0.3)", 1);
    ctx.restore();

    this.drawCrack(state, point);
    ctx.restore();
  }

  drawCrack(state, point) {
    const ctx = this.ctx;
    const crackX = GEOMETRY.crackX;
    const crackY = GEOMETRY.crackY;
    const aligned = Math.abs(state.lift - 70) <= 6;
    const timedPulse = 0.5 + Math.sin(state.time * 4.2) * 0.28;

    ctx.save();
    if (!state.repaired) {
      ctx.strokeStyle = `rgba(255, 105, 97, ${0.74 + timedPulse * 0.2})`;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(crackX - 10, crackY - 24);
      ctx.lineTo(crackX - 3, crackY - 14);
      ctx.lineTo(crackX - 8, crackY - 7);
      ctx.lineTo(crackX + 1, crackY + 4);
      ctx.lineTo(crackX - 4, crackY + 13);
      ctx.lineTo(crackX + 6, crackY + 24);
      ctx.moveTo(crackX - 6, crackY - 4);
      ctx.lineTo(crackX + 8, crackY - 9);
      ctx.moveTo(crackX + 1, crackY + 4);
      ctx.lineTo(crackX - 13, crackY + 7);
      ctx.stroke();

      ctx.strokeStyle = `rgba(255, 154, 61, ${0.55 + timedPulse * 0.35})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(crackX, crackY, 28 + timedPulse * 4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([4, 5]);
      ctx.beginPath();
      ctx.arc(crackX, crackY, 42 + timedPulse * 5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      if (aligned && !state.locked) {
        ctx.strokeStyle = "rgba(104, 224, 176, 0.72)";
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 5]);
        ctx.beginPath();
        ctx.moveTo(point.x, point.y + 2);
        ctx.lineTo(crackX, crackY + 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    } else {
      ctx.fillStyle = "rgba(46, 63, 63, 0.82)";
      ctx.beginPath();
      ctx.ellipse(crackX, crackY, 18, 31, 0.84, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(104, 224, 176, 0.28)";
      ctx.strokeStyle = "rgba(104, 224, 176, 0.75)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(crackX, crackY, 12, 24, 0.84, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = COLORS.green;
      ctx.font = "600 9px ui-monospace, monospace";
      ctx.fillText("PATCHED", crackX + 28, crackY + 4);
    }

    if (state.locked) {
      ctx.strokeStyle = "rgba(104, 224, 176, 0.82)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(crackX - 30, crackY + 24);
      ctx.lineTo(crackX - 30, crackY + 9);
      ctx.lineTo(crackX - 16, crackY + 9);
      ctx.moveTo(crackX + 30, crackY + 24);
      ctx.lineTo(crackX + 30, crackY + 9);
      ctx.lineTo(crackX + 16, crackY + 9);
      ctx.stroke();
    }

    if (state.repairHeld && !state.repaired) {
      const glow = ctx.createRadialGradient(crackX, crackY, 2, crackX, crackY, 48);
      glow.addColorStop(0, "rgba(255, 214, 123, 0.58)");
      glow.addColorStop(1, "rgba(255, 154, 61, 0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(crackX, crackY, 48, 0, Math.PI * 2);
      ctx.fill();
      for (let spark = 0; spark < 8; spark += 1) {
        const angle = state.time * 2.4 + spark * 2.2;
        const distance = 13 + rand(spark + 4) * 24;
        ctx.fillStyle = "rgba(255, 226, 158, 0.9)";
        ctx.beginPath();
        ctx.arc(
          crackX + Math.cos(angle) * distance,
          crackY + Math.sin(angle) * distance,
          1.1,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
    }
    ctx.restore();
  }

  drawSceneLabels(state) {
    const ctx = this.ctx;
    const showCrack = state.phase !== "approach" && state.phase !== "transfer";
    if (showCrack) {
      const labelX = 1350;
      const labelY = 296;
      ctx.save();
      ctx.strokeStyle = state.repaired ? "rgba(104, 224, 176, 0.55)" : "rgba(255, 123, 101, 0.64)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(GEOMETRY.crackX + 26, GEOMETRY.crackY - 14);
      ctx.lineTo(labelX - 7, labelY + 19);
      ctx.stroke();
      ctx.fillStyle = "rgba(5, 18, 23, 0.82)";
      roundedRect(ctx, labelX - 3, labelY - 9, 162, 47, 2);
      ctx.fill();
      ctx.strokeStyle = state.repaired ? "rgba(104, 224, 176, 0.32)" : "rgba(255, 123, 101, 0.38)";
      ctx.stroke();
      ctx.fillStyle = state.repaired ? COLORS.green : "#ff8a78";
      ctx.font = "600 9px ui-monospace, monospace";
      ctx.fillText(state.repaired ? "REPAIR VERIFIED" : "TIP CRACK / D-04", labelX + 9, labelY + 3);
      ctx.fillStyle = "rgba(224, 236, 234, 0.76)";
      ctx.font = "400 8px 'Noto Sans SC', sans-serif";
      ctx.fillText(state.repaired ? "前缘修复包已固化" : "叶尖前缘 · 等待锁定", labelX + 9, labelY + 18);
      ctx.fillStyle = state.repaired ? "rgba(104, 224, 176, 0.68)" : "rgba(255, 154, 61, 0.74)";
      ctx.fillText(state.repaired ? "STATUS: SEALED" : "STATUS: EXPOSED", labelX + 9, labelY + 31);
      ctx.restore();
    }

    if (state.phase !== "approach" && state.phase !== "transfer") {
      const carY = GEOMETRY.carBaseY - state.lift * 3.18;
      ctx.save();
      ctx.fillStyle = "rgba(255, 193, 111, 0.8)";
      ctx.font = "500 8px ui-monospace, monospace";
      ctx.textAlign = "right";
      ctx.fillText(`LIFT ${Math.round(state.lift)}%`, GEOMETRY.carX - 33, carY + 2);
      ctx.restore();
    }

    if (state.locked) {
      const point = this.platformPoint(state.lift, state.sway, state.armExtend ?? 1);
      ctx.save();
      ctx.fillStyle = "rgba(5, 22, 24, 0.78)";
      roundedRect(ctx, point.x - 42, point.y + 58, 84, 20, 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(104, 224, 176, 0.48)";
      ctx.stroke();
      ctx.fillStyle = COLORS.green;
      ctx.font = "600 8px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.fillText("PLATFORM LOCKED", point.x, point.y + 71);
      ctx.restore();
    }
  }

  drawAtmosphere(state) {
    const ctx = this.ctx;
    const wind = state.wind;
    const storm = clamp((wind - 14) / 9, 0, 1);

    if (storm > 0.12) {
      ctx.save();
      ctx.strokeStyle = `rgba(213, 230, 225, ${storm * 0.16})`;
      ctx.lineWidth = 1;
      for (let drop = 0; drop < 44; drop += 1) {
        const x = (rand(drop + 31) * 1740 + state.time * (42 + wind * 4.2)) % 1770 - 70;
        const y = 70 + ((rand(drop + 51) * 520 + state.time * 18) % 560);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - 9 - storm * 9, y + 18 + storm * 12);
        ctx.stroke();
      }
      ctx.restore();
    }

    ctx.fillStyle = `rgba(204, 229, 222, ${0.025 + storm * 0.035})`;
    for (let spray = 0; spray < 34; spray += 1) {
      const x = (rand(spray + 14) * 1800 + state.time * (15 + wind)) % 1700 - 50;
      const y = 640 + rand(spray + 19) * 210;
      ctx.beginPath();
      ctx.ellipse(x, y, 7 + storm * 18, 1 + storm * 2, -0.05, 0, Math.PI * 2);
      ctx.fill();
    }

    if (wind >= 19) {
      const alert = ctx.createLinearGradient(0, 0, 0, 170);
      alert.addColorStop(0, "rgba(255, 74, 61, 0.19)");
      alert.addColorStop(1, "rgba(255, 74, 61, 0)");
      ctx.fillStyle = alert;
      ctx.fillRect(0, 0, WORLD.width, 190);
      ctx.strokeStyle = `rgba(255, 105, 97, ${0.35 + Math.sin(state.time * 4) * 0.16})`;
      ctx.lineWidth = 2;
      ctx.strokeRect(3, 3, WORLD.width - 6, WORLD.height - 6);
    }
  }
}
