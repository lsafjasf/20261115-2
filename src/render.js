// Canvas rendering for the sandstorm field, greenhouses and mobile fans.
import { FIELD } from "./simulation.js";

const SAND = "#d9b06a";
const SAND_TRAIL = "rgba(217, 176, 106, 0.28)";

function roundedRect(ctx, x, y, w, h, r) {
  if (typeof ctx.roundRect === "function") {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    return;
  }
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.trails = [];
  }

  toScreen(x, y) {
    return [
      (x / FIELD.w) * this.canvas.width,
      (y / FIELD.h) * this.canvas.height,
    ];
  }

  drawBackground(storm) {
    const { ctx, canvas } = this;
    const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    grad.addColorStop(0, `rgba(60, 52, 40, ${0.35 + storm * 0.4})`);
    grad.addColorStop(1, "rgba(28, 26, 22, 0.55)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Ground reference line.
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1;
    for (let gy = 60; gy < FIELD.h; gy += 60) {
      const [, sy] = this.toScreen(0, gy);
      ctx.beginPath();
      ctx.moveTo(0, sy);
      ctx.lineTo(canvas.width, sy);
      ctx.stroke();
    }
  }

  drawGreenhouses(houses, greenhouses) {
    const { ctx } = this;
    houses.forEach((house, i) => {
      const gh = greenhouses[i];
      const [x, y] = this.toScreen(gh.x, gh.y);
      const [w, h] = this.toScreen(gh.w, gh.h);
      ctx.fillStyle = "rgba(120, 170, 150, 0.18)";
      ctx.strokeStyle = house.clean ? "#7fd6b0" : "#e08a5a";
      ctx.lineWidth = 2;
      roundedRect(ctx, x, y, w, h, 10);
      ctx.fill();
      ctx.stroke();

      // Main intake: the left edge, colored by live efficiency.
      const eff = house.efficiency;
      const intakeColor =
        eff >= 0.7 ? "#6fe0a0" : eff >= 0.4 ? "#e8c45a" : "#e8604a";
      ctx.fillStyle = intakeColor;
      ctx.fillRect(x - 4, y, 5, h);

      // Piled sand grows from the intake floor as deposits accumulate.
      const pileH = (1 - eff) * h;
      ctx.fillStyle = "rgba(201, 158, 92, 0.85)";
      ctx.beginPath();
      ctx.moveTo(x, y + h);
      ctx.lineTo(x, y + h - pileH);
      ctx.quadraticCurveTo(x + w * 0.4, y + h - pileH - 8, x + w, y + h - pileH * 0.7);
      ctx.lineTo(x + w, y + h);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = "#eef2ee";
      ctx.font = "14px sans-serif";
      ctx.fillText(`温室 ${house.id}`, x + 12, y + 22);
      ctx.fillText(`进风效率 ${(eff * 100).toFixed(0)}%`, x + 12, y + 42);
    });
  }

  drawFan(fan, selected) {
    const { ctx } = this;
    const [x, y] = this.toScreen(fan.x, fan.y);
    const scale = this.canvas.width / FIELD.w;

    // Jet cone hint.
    const reach = fan.range * scale;
    const mouth = (fan.width ?? 1) * 60 * scale;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(fan.angle);
    const coneGrad = ctx.createLinearGradient(0, 0, reach, 0);
    coneGrad.addColorStop(0, `rgba(140,200,255,${0.12 * fan.power})`);
    coneGrad.addColorStop(1, "rgba(140,200,255,0)");
    ctx.fillStyle = coneGrad;
    ctx.beginPath();
    ctx.moveTo(0, -mouth);
    ctx.lineTo(reach, -mouth * 1.8);
    ctx.lineTo(reach, mouth * 1.8);
    ctx.lineTo(0, mouth);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Fan body and nozzle.
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(fan.angle);
    ctx.fillStyle = selected ? "#9fd0ff" : "#c8d4e0";
    ctx.strokeStyle = "#20262c";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#3a444e";
    ctx.fillRect(6, -7, 14, 14);
    // Blade tick whose spin rate suggests power.
    ctx.strokeStyle = "#11161b";
    ctx.beginPath();
    ctx.moveTo(-8, 0);
    ctx.lineTo(8, 0);
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = "#cfe0f0";
    ctx.font = "12px sans-serif";
    ctx.fillText(`风机 ${fan.id + 1}  功率 ${(fan.power * 100).toFixed(0)}%`, x - 30, y + 34);
  }

  drawSand(particles) {
    const { ctx } = this;
    // Fade previous frame to create motion streaks.
    ctx.fillStyle = SAND_TRAIL;
    for (const p of particles) {
      const [x, y] = this.toScreen(p.x, p.y);
      const [px, py] = this.toScreen(p.x - p.vx * 0.05, p.y - p.vy * 0.05);
      ctx.strokeStyle = SAND_TRAIL;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.fillStyle = SAND;
      ctx.fillRect(x - 1, y - 1, 2, 2);
    }
  }

  drawStormFront(storm, time) {
    const { ctx, canvas } = this;
    const x = ((time * 26) % (canvas.width + 200)) - 100;
    ctx.strokeStyle = `rgba(230, 200, 140, ${0.25 + storm * 0.4})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let y = 0; y <= canvas.height; y += 12) {
      const wave = Math.sin(y * 0.05 + time * 3) * 14;
      if (y === 0) ctx.moveTo(x + wave, y);
      else ctx.lineTo(x + wave, y);
    }
    ctx.stroke();
  }

  render(state) {
    const { sim, selectedFan } = state;
    this.drawBackground(sim.stormLevel());
    this.drawStormFront(sim.stormLevel(), sim.t);
    for (const fan of sim.fans) this.drawFan(fan, fan === selectedFan);
    this.drawGreenhouses(sim.result().houses, sim.greenhouses);
    this.drawSand(sim.particles);
  }
}
