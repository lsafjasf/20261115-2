import { CONFIG, RESERVOIRS, tideAt, tideEfficiency } from "./simulation.js";

const W = 1280;
const H = 720;
const BOTTOM = 650;
const POOL_LAYOUT = [
  { x: 438, w: 148 },
  { x: 616, w: 148 },
  { x: 794, w: 148 },
];

const COLORS = {
  ink: "#dcecef",
  muted: "#78949c",
  faint: "#48646d",
  cyan: "#67e1df",
  blue: "#43a8dd",
  deepBlue: "#176b9a",
  amber: "#f3b66d",
  danger: "#ff755f",
  success: "#7ce0aa",
  line: "rgba(130,194,205,0.16)",
  strongLine: "rgba(130,194,205,0.36)",
};

function font(size, weight = 400) {
  return `${weight} ${size}px "Noto Sans SC", "IBM Plex Mono", "SFMono-Regular", Consolas, monospace`;
}

function label(ctx, text, x, y, size = 10, color = COLORS.muted, align = "left") {
  ctx.fillStyle = color;
  ctx.font = font(size);
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.fillText(text, x, y);
}

function roundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
}

function drawBackground(ctx, sim, visualTime) {
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, "#0a2735");
  sky.addColorStop(0.56, "#081b25");
  sky.addColorStop(1, "#06141b");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  const glow = ctx.createRadialGradient(150, 220, 0, 150, 220, 600);
  glow.addColorStop(0, "rgba(44, 163, 180, 0.13)");
  glow.addColorStop(1, "rgba(44, 163, 180, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = "rgba(96, 158, 171, 0.065)";
  ctx.lineWidth = 1;
  for (let x = 22; x < W; x += 42) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  for (let y = 28; y < H; y += 42) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }

  ctx.fillStyle = "rgba(2, 8, 12, 0.25)";
  ctx.fillRect(0, BOTTOM, W, H - BOTTOM);
  ctx.strokeStyle = COLORS.line;
  ctx.beginPath();
  ctx.moveTo(0, BOTTOM);
  ctx.lineTo(W, BOTTOM);
  ctx.stroke();

  ctx.save();
  ctx.globalAlpha = 0.35;
  for (let i = 0; i < 3; i += 1) {
    const x = 30 + i * 7;
    const y = 26 + i * 8;
    ctx.strokeStyle = COLORS.cyan;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 16, y);
    ctx.stroke();
  }
  label(ctx, "PS-07  /  SECTION A-A", 28, 68, 10, COLORS.muted);
  label(ctx, "潮脊泵站 · 高程剖面", 28, 87, 13, COLORS.ink);
  ctx.restore();

  const sweep = (visualTime * 120) % 720;
  const scanner = ctx.createLinearGradient(0, 0, 0, sweep);
  scanner.addColorStop(0, "rgba(103,225,223,0)");
  scanner.addColorStop(1, "rgba(103,225,223,0.025)");
  ctx.fillStyle = scanner;
  ctx.fillRect(0, 0, W, sweep);
}

function waterSurface(ctx, x, y, width, amplitude, visualTime, phase = 0) {
  ctx.beginPath();
  ctx.moveTo(x, y);
  for (let px = 0; px <= width; px += 8) {
    const wave = Math.sin((px / width) * Math.PI * 4 + visualTime * 1.35 + phase) * amplitude;
    const ripple = Math.sin((px / width) * Math.PI * 11 - visualTime * 0.8 + phase) * amplitude * 0.28;
    ctx.lineTo(x + px, y + wave + ripple);
  }
}

function fillWater(ctx, x, surface, width, bottom, colorA, colorB, alpha = 1) {
  const water = ctx.createLinearGradient(0, surface, 0, bottom);
  water.addColorStop(0, colorA);
  water.addColorStop(1, colorB);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.lineTo(x + width, bottom);
  ctx.lineTo(x, bottom);
  ctx.closePath();
  ctx.fillStyle = water;
  ctx.fill();
  ctx.restore();
}

function drawSea(ctx, sim, visualTime) {
  const tide = tideAt(sim.time);
  const surface = BOTTOM - tide * 72;

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, 270, BOTTOM);
  ctx.clip();
  waterSurface(ctx, -8, surface, 300, 2.5, visualTime, 1.2);
  fillWater(
    ctx, 0, surface, 270, BOTTOM,
    "rgba(47, 164, 202, 0.72)", "rgba(7, 42, 67, 0.92)",
  );
  ctx.strokeStyle = "rgba(134, 230, 241, 0.7)";
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(0, surface + 1);
  for (let x = 0; x <= 270; x += 7) {
    ctx.lineTo(x, surface + Math.sin(x * 0.055 + visualTime * 1.5) * 2);
  }
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = "rgba(5, 23, 31, 0.92)";
  ctx.fillRect(0, BOTTOM, 270, H - BOTTOM);
  ctx.strokeStyle = "rgba(58, 116, 127, 0.3)";
  for (let x = 18; x < 270; x += 28) {
    ctx.beginPath();
    ctx.moveTo(x, BOTTOM + 5);
    ctx.lineTo(x + 9, H);
    ctx.stroke();
  }

  label(ctx, "海侧", 22, BOTTOM + 25, 10, COLORS.muted);
  label(ctx, `潮位 +${tide.toFixed(2)} m`, 22, BOTTOM + 42, 12, COLORS.cyan);
  label(ctx, tide < 4.2 ? "涨潮 / 反压上升" : "高潮临近", 22, surface - 13, 9, COLORS.amber);

  ctx.setLineDash([4, 5]);
  ctx.strokeStyle = "rgba(243,182,109,0.36)";
  ctx.beginPath();
  ctx.moveTo(0, BOTTOM - CONFIG.tidePeak * 72);
  ctx.lineTo(270, BOTTOM - CONFIG.tidePeak * 72);
  ctx.stroke();
  ctx.setLineDash([]);
  label(ctx, `高潮线 ${CONFIG.tidePeak.toFixed(2)} m`, 22, BOTTOM - CONFIG.tidePeak * 72 - 10, 8, COLORS.amber);
  return tide;
}

function drawTideChart(ctx, sim, visualTime) {
  const x = 772;
  const y = 38;
  const width = 468;
  const height = 126;
  const plotX = x + 24;
  const plotY = y + 23;
  const plotW = width - 44;
  const plotH = height - 43;

  roundedRect(ctx, x, y, width, height, 10);
  ctx.fillStyle = "rgba(5, 20, 28, 0.76)";
  ctx.fill();
  ctx.strokeStyle = COLORS.line;
  ctx.stroke();

  label(ctx, "FIXED TIDE / 固定潮汐序列", x + 12, y + 13, 8, COLORS.faint);
  label(ctx, "5.15", x + 3, plotY + 2, 7, COLORS.faint);
  label(ctx, "0.8", x + 8, plotY + plotH, 7, COLORS.faint);

  ctx.strokeStyle = "rgba(130,194,205,0.1)";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 3; i += 1) {
    const gy = plotY + (plotH * i) / 3;
    ctx.beginPath();
    ctx.moveTo(plotX, gy);
    ctx.lineTo(plotX + plotW, gy);
    ctx.stroke();
  }

  const mapPoint = (time) => ({
    x: plotX + (time / CONFIG.duration) * plotW,
    y: plotY + plotH - ((tideAt(time) - 0.7) / 4.65) * plotH,
  });

  ctx.lineWidth = 1.4;
  ctx.strokeStyle = "rgba(85,156,177,0.28)";
  ctx.beginPath();
  for (let time = 0; time <= CONFIG.duration; time += 1) {
    const point = mapPoint(time);
    if (time === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  }
  ctx.stroke();

  ctx.strokeStyle = COLORS.cyan;
  ctx.lineWidth = 1.8;
  ctx.shadowColor = "rgba(103,225,223,0.5)";
  ctx.shadowBlur = 8;
  ctx.beginPath();
  for (let time = 0; time <= Math.min(sim.time, CONFIG.duration); time += 1) {
    const point = mapPoint(time);
    if (time === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  }
  ctx.stroke();
  ctx.shadowBlur = 0;

  const peakX = mapPoint(CONFIG.tidePeakTime).x;
  const current = mapPoint(Math.min(sim.time, CONFIG.duration));
  ctx.setLineDash([3, 3]);
  ctx.strokeStyle = "rgba(255,117,95,0.48)";
  ctx.beginPath();
  ctx.moveTo(peakX, y + 20);
  ctx.lineTo(peakX, plotY + plotH);
  ctx.stroke();
  ctx.setLineDash([]);
  label(ctx, "高潮", peakX + 3, y + 27, 7, COLORS.danger);

  ctx.fillStyle = COLORS.cyan;
  ctx.shadowColor = COLORS.cyan;
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.arc(current.x, current.y, 3.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.strokeStyle = "rgba(103,225,223,0.33)";
  ctx.beginPath();
  ctx.moveTo(current.x, current.y);
  ctx.lineTo(current.x, plotY + plotH);
  ctx.stroke();
  label(ctx, `T+${Math.min(sim.time, CONFIG.duration).toFixed(0)}s`, current.x, plotY + plotH + 10, 7, COLORS.muted, "center");

  const scanning = 0.6 + Math.sin(visualTime * 2) * 0.12;
  label(ctx, `ETA ${Math.max(0, CONFIG.tidePeakTime - sim.time).toFixed(0)}s`, x + width - 10, y + 13, 8, COLORS.amber, "right");
  ctx.globalAlpha = scanning;
  label(ctx, `泵效 ${(tideEfficiency(tideAt(sim.time)) * 100).toFixed(0)}%`, x + width - 10, y + 26, 8, COLORS.amber, "right");
  ctx.globalAlpha = 1;
}

function drawFlowArrow(ctx, fromX, y, toX, flow, visualTime, color = COLORS.cyan) {
  if (flow < 0.03) return;
  const strength = Math.max(0.18, Math.min(1, flow / 9));
  ctx.save();
  ctx.globalAlpha = strength;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.4;
  ctx.setLineDash([8, 9]);
  ctx.lineDashOffset = -visualTime * (30 + flow * 5);
  ctx.beginPath();
  ctx.moveTo(fromX, y);
  ctx.lineTo(toX, y);
  ctx.stroke();
  ctx.setLineDash([]);
  const direction = toX >= fromX ? 1 : -1;
  for (let x = fromX + direction * 18; x < toX; x += 48) {
    ctx.beginPath();
    ctx.moveTo(x, y - 4);
    ctx.lineTo(x + direction * 5, y);
    ctx.lineTo(x, y + 4);
    ctx.stroke();
  }
  ctx.restore();
}

function drawPumpStation(ctx, sim, visualTime) {
  const tide = tideAt(sim.time);
  ctx.fillStyle = "rgba(9, 30, 39, 0.94)";
  roundedRect(ctx, 278, 166, 138, 242, 6);
  ctx.fill();
  ctx.strokeStyle = COLORS.strongLine;
  ctx.stroke();

  ctx.fillStyle = "#102f3b";
  ctx.beginPath();
  ctx.moveTo(266, 177);
  ctx.lineTo(291, 154);
  ctx.lineTo(405, 154);
  ctx.lineTo(428, 177);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(130,194,205,0.26)";
  ctx.stroke();

  label(ctx, "PUMP HOUSE", 287, 196, 8, COLORS.faint);
  label(ctx, "泵房", 400, 196, 10, COLORS.ink, "right");

  const headerY = 227;
  ctx.strokeStyle = "rgba(118,204,220,0.48)";
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(330, headerY);
  ctx.lineTo(948, headerY);
  ctx.stroke();
  ctx.strokeStyle = "#163d4b";
  ctx.lineWidth = 3;
  ctx.stroke();
  drawFlowArrow(ctx, 333, headerY, 938, sim.totals.pumpFlow, visualTime);

  sim.pumps.forEach((pump, index) => {
    const x = 294 + index * 64;
    const y = 292;
    ctx.strokeStyle = "rgba(130,194,205,0.21)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, headerY);
    ctx.lineTo(x, y - 24);
    ctx.stroke();

    ctx.fillStyle = "rgba(6, 20, 27, 0.96)";
    ctx.beginPath();
    ctx.arc(x, y, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = pump.output > 0 ? COLORS.amber : COLORS.faint;
    ctx.lineWidth = 2;
    ctx.stroke();

    const spin = visualTime * (pump.output * 8 + 0.2);
    ctx.strokeStyle = pump.output > 0 ? "rgba(243,182,109,0.9)" : "rgba(120,148,156,0.6)";
    ctx.lineWidth = 2;
    for (let blade = 0; blade < 4; blade += 1) {
      const angle = spin + (blade * Math.PI) / 2;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(angle) * 5, y + Math.sin(angle) * 5);
      ctx.lineTo(x + Math.cos(angle) * 18, y + Math.sin(angle) * 18);
      ctx.stroke();
    }
    ctx.fillStyle = pump.output > 0 ? COLORS.amber : COLORS.faint;
    ctx.beginPath();
    ctx.arc(x, y, 3.5, 0, Math.PI * 2);
    ctx.fill();

    label(ctx, pump.id, x, y + 39, 9, COLORS.muted, "center");
    const stateText = pump.state === "running" ? "RUN" : pump.state === "off" ? "STBY" : "RAMP";
    label(ctx, stateText, x, y + 51, 7, pump.output > 0 ? COLORS.amber : COLORS.faint, "center");
  });

  ctx.strokeStyle = "rgba(69,144,172,0.32)";
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(290, 343);
  ctx.lineTo(290, 536);
  ctx.lineTo(170, 536);
  ctx.stroke();
  ctx.strokeStyle = "rgba(57,126,159,0.36)";
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 5]);
  ctx.beginPath();
  ctx.moveTo(290, 350);
  ctx.lineTo(290, 526);
  ctx.stroke();
  ctx.setLineDash([]);
  label(ctx, "SEA INTAKE", 297, 526, 7, COLORS.faint);

  label(ctx, "总管 HEADER", 643, headerY - 15, 7, COLORS.faint, "center");
  label(
    ctx,
    `${sim.totals.pumpFlow.toFixed(1)} m³/s  ·  ${sim.totals.pressure.toFixed(2)} MPa`,
    477, headerY + 19, 8, COLORS.cyan, "center",
  );
  label(ctx, `反压潮位 ${tide.toFixed(2)} m`, 382, 341, 7, COLORS.amber, "center");
}

function drawGate(ctx, gate, reservoir, centerX, visualTime) {
  const housingY = 244;
  ctx.strokeStyle = "rgba(130,194,205,0.22)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(centerX, 227);
  ctx.lineTo(centerX, housingY - 17);
  ctx.stroke();

  ctx.fillStyle = "#09232d";
  roundedRect(ctx, centerX - 27, housingY - 17, 54, 36, 4);
  ctx.fill();
  ctx.strokeStyle = gate.position > 0 ? "rgba(103,225,223,0.66)" : "rgba(130,194,205,0.36)";
  ctx.lineWidth = 1.2;
  ctx.stroke();

  const bladeHeight = 17;
  const lift = gate.position * 17;
  ctx.fillStyle = gate.moving ? COLORS.amber : gate.position > 0 ? COLORS.cyan : "#53727b";
  ctx.fillRect(centerX - 17, housingY - 7 - lift, 34, bladeHeight);
  ctx.fillStyle = "rgba(5,15,20,0.55)";
  for (let y = housingY - 4 - lift; y < housingY + 8 - lift; y += 4) {
    ctx.fillRect(centerX - 17, y, 34, 1);
  }

  if (gate.moving && gate.delayRemaining > 0) {
    ctx.strokeStyle = COLORS.amber;
    ctx.globalAlpha = 0.55 + Math.sin(visualTime * 8) * 0.3;
    ctx.beginPath();
    ctx.arc(centerX + 33, housingY - 11, 3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  const caption = gate.moving
    ? gate.delayRemaining > 0 ? "等待动作" : gate.targetPosition > 0.5 ? "开启中" : "关闭中"
    : gate.position > 0 ? "已开启" : "已关闭";
  label(ctx, `${reservoir.short}闸 · ${caption}`, centerX, housingY + 29, 7, gate.moving ? COLORS.amber : COLORS.faint, "center");
}

function drawReservoir(ctx, sim, reservoir, layout, index, visualTime) {
  const { x, w } = layout;
  const poolTop = 280;
  const crestY = BOTTOM - reservoir.max * 82;
  const targetY = BOTTOM - reservoir.target * 82;
  const bandY = BOTTOM - (reservoir.target + CONFIG.targetBand) * 82;
  const surface = BOTTOM - reservoir.level * 82;
  const gate = sim.gates[index];
  const centerX = x + w / 2;

  ctx.save();
  ctx.beginPath();
  ctx.rect(x, poolTop, w, BOTTOM - poolTop);
  ctx.clip();

  const basin = ctx.createLinearGradient(0, poolTop, 0, BOTTOM);
  basin.addColorStop(0, "rgba(4, 16, 23, 0.1)");
  basin.addColorStop(1, "rgba(2, 9, 14, 0.82)");
  ctx.fillStyle = basin;
  ctx.fillRect(x, poolTop, w, BOTTOM - poolTop);

  ctx.fillStyle = "rgba(12, 39, 49, 0.55)";
  ctx.fillRect(x + 2, poolTop + 2, w - 4, BOTTOM - poolTop - 2);

  if (reservoir.level > 0) {
    waterSurface(ctx, x + 2, surface, w - 4, 1.4, visualTime, index * 1.7);
    fillWater(
      ctx, x + 2, surface, w - 4, BOTTOM,
      "rgba(53,182,213,0.68)", "rgba(10,66,94,0.86)",
    );
    ctx.strokeStyle = "rgba(148,239,246,0.74)";
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(x + 2, surface);
    for (let px = 2; px <= w - 2; px += 5) {
      ctx.lineTo(x + px, surface + Math.sin(px * 0.12 + visualTime * 1.5 + index) * 1.4);
    }
    ctx.stroke();

    ctx.globalAlpha = 0.28;
    ctx.fillStyle = "rgba(164,243,247,0.36)";
    for (let line = 0; line < 4; line += 1) {
      const ly = BOTTOM - 17 - ((visualTime * 9 + line * 37 + index * 18) % Math.max(22, BOTTOM - surface - 18));
      ctx.fillRect(x + 17 + line * 27, ly, 14, 1);
    }
    ctx.globalAlpha = 1;
  }

  ctx.fillStyle = "rgba(124,224,170,0.09)";
  ctx.fillRect(x + 3, bandY, w - 6, targetY - bandY);
  ctx.setLineDash([5, 4]);
  ctx.strokeStyle = "rgba(124,224,170,0.72)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + 4, targetY);
  ctx.lineTo(x + w - 4, targetY);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.setLineDash([3, 4]);
  ctx.strokeStyle = "rgba(255,117,95,0.58)";
  ctx.beginPath();
  ctx.moveTo(x + 4, crestY);
  ctx.lineTo(x + w - 4, crestY);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.restore();

  ctx.strokeStyle = "rgba(126,157,162,0.6)";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(x, poolTop);
  ctx.lineTo(x, BOTTOM);
  ctx.moveTo(x + w, poolTop);
  ctx.lineTo(x + w, BOTTOM);
  ctx.moveTo(x, BOTTOM);
  ctx.lineTo(x + w, BOTTOM);
  ctx.stroke();
  ctx.strokeStyle = "rgba(130,194,205,0.17)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + 5, poolTop);
  ctx.lineTo(x + 5, BOTTOM - 4);
  ctx.moveTo(x + w - 5, poolTop);
  ctx.lineTo(x + w - 5, BOTTOM - 4);
  ctx.stroke();

  label(ctx, `${reservoir.name} / ${reservoir.short}`, x + 9, poolTop - 20, 10, COLORS.ink);
  label(ctx, `目标 ${reservoir.target.toFixed(2)} m`, x + w - 8, poolTop - 20, 8, COLORS.muted, "right");

  label(ctx, `${reservoir.level.toFixed(2)}`, x + 11, Math.max(surface - 11, poolTop + 17), 17, COLORS.ink);
  label(ctx, "m", x + 57, Math.max(surface - 10, poolTop + 18), 8, COLORS.cyan);
  label(ctx, `堰顶 ${reservoir.max.toFixed(2)}`, x + w - 8, crestY - 8, 7, "rgba(255,117,95,0.7)", "right");

  const stateText = reservoir.overflowVolume > 0 ? "OVERFLOW"
    : reservoir.inTargetBand ? "IN BAND"
      : reservoir.overTarget ? "OVER TARGET" : "FILLING";
  const stateColor = reservoir.overflowVolume > 0 ? COLORS.danger
    : reservoir.inTargetBand ? COLORS.success
      : reservoir.overTarget ? COLORS.danger : COLORS.faint;
  label(ctx, stateText, x + 9, BOTTOM + 17, 7, stateColor);
  label(ctx, `Q ${(reservoir.flow || 0).toFixed(1)} m³/s`, x + w - 8, BOTTOM + 17, 7, COLORS.muted, "right");

  for (let meter = 1; meter <= 4; meter += 1) {
    const tickY = BOTTOM - meter * 82;
    ctx.strokeStyle = "rgba(130,194,205,0.12)";
    ctx.beginPath();
    ctx.moveTo(x + w - 12, tickY);
    ctx.lineTo(x + w - 4, tickY);
    ctx.stroke();
  }

  drawGate(ctx, gate, reservoir, centerX, visualTime);

  if (reservoir.overflowVolume > 0) {
    const pulse = 0.65 + Math.sin(visualTime * 10) * 0.25;
    ctx.save();
    ctx.globalAlpha = pulse;
    ctx.strokeStyle = COLORS.danger;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + 9, crestY);
    ctx.quadraticCurveTo(x - 10, crestY + 23, x - 25, crestY + 9);
    ctx.stroke();
    ctx.fillStyle = "rgba(255,117,95,0.18)";
    ctx.beginPath();
    ctx.arc(x - 2, crestY + 7, 36, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    label(ctx, "溢流", x - 1, crestY - 17, 9, COLORS.danger, "center");
  }
}

function drawCanal(ctx, sim, visualTime) {
  const x = 1010;
  const w = 230;
  const top = 276;
  const canal = sim.canal;
  const flow = sim.totals.canalFlow;
  const surface = BOTTOM - (1.25 + Math.min(1.1, flow * 0.09)) * 82;

  ctx.strokeStyle = "rgba(130,194,205,0.23)";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(948, 227);
  ctx.lineTo(1024, 227);
  ctx.lineTo(1024, 306);
  ctx.stroke();
  drawFlowArrow(ctx, 953, 227, 1022, flow, visualTime, COLORS.blue);

  ctx.fillStyle = "rgba(7, 24, 32, 0.9)";
  ctx.fillRect(x, top, w, BOTTOM - top);
  ctx.strokeStyle = "rgba(126,157,162,0.58)";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(x, top);
  ctx.lineTo(x, BOTTOM);
  ctx.moveTo(x + w, top);
  ctx.lineTo(x + w, BOTTOM);
  ctx.moveTo(x, BOTTOM);
  ctx.lineTo(x + w, BOTTOM);
  ctx.stroke();
  ctx.strokeStyle = "rgba(130,194,205,0.16)";
  ctx.lineWidth = 1;
  for (let line = 1; line < 5; line += 1) {
    const lineX = x + (w * line) / 5;
    ctx.beginPath();
    ctx.moveTo(lineX, top + 3);
    ctx.lineTo(lineX, BOTTOM - 4);
    ctx.stroke();
  }

  ctx.save();
  ctx.beginPath();
  ctx.rect(x + 3, top + 2, w - 6, BOTTOM - top - 4);
  ctx.clip();
  waterSurface(ctx, x + 3, surface, w - 6, 2.1, visualTime, 0.4);
  fillWater(
    ctx, x + 3, surface, w - 6, BOTTOM,
    "rgba(35,130,171,0.5)", "rgba(7, 37, 60, 0.82)",
  );
  ctx.strokeStyle = "rgba(123,201,230,0.66)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(x + 3, surface);
  for (let px = 3; px <= w - 3; px += 6) {
    ctx.lineTo(x + px, surface + Math.sin(px * 0.08 + visualTime * 1.25) * 1.8);
  }
  ctx.stroke();

  if (flow > 0.03) {
    ctx.globalAlpha = 0.38;
    ctx.strokeStyle = COLORS.cyan;
    ctx.lineWidth = 1;
    ctx.setLineDash([14, 20]);
    ctx.lineDashOffset = -visualTime * (20 + flow * 4);
    for (let y = surface + 27; y < BOTTOM; y += 38) {
      ctx.beginPath();
      ctx.moveTo(x + 16, y);
      ctx.lineTo(x + w - 16, y);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }
  ctx.restore();

  ctx.fillStyle = "#0a222c";
  roundedRect(ctx, 1003, 292, 42, 34, 4);
  ctx.fill();
  ctx.strokeStyle = canal.position > 0 ? COLORS.blue : COLORS.faint;
  ctx.stroke();
  const lift = canal.position * 15;
  ctx.fillStyle = canal.position > 0 ? COLORS.blue : "#526d75";
  ctx.fillRect(1011, 299 - lift, 26, 13);

  label(ctx, "回水渠 / R-01", x + 11, top - 21, 11, COLORS.ink);
  label(ctx, canal.position > 0 ? `旁通 ${(canal.position * 100).toFixed(0)}%` : "旁通关闭", x + w - 9, top - 21, 8, canal.position > 0 ? COLORS.cyan : COLORS.faint, "right");
  label(ctx, "RETURN CANAL", x + 11, BOTTOM + 20, 8, COLORS.faint);
  label(ctx, `Q ${flow.toFixed(1)} m³/s`, x + w - 9, BOTTOM + 20, 8, COLORS.blue, "right");

  ctx.setLineDash([4, 5]);
  ctx.strokeStyle = "rgba(72,174,232,0.22)";
  ctx.beginPath();
  ctx.moveTo(x + 10, top + 17);
  ctx.lineTo(x + w - 10, top + 17);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawBottomScale(ctx, sim) {
  const x = 438;
  const y = 688;
  const width = 800;
  ctx.strokeStyle = "rgba(130,194,205,0.18)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + width, y);
  ctx.stroke();
  for (let i = 0; i <= 8; i += 1) {
    const lineX = x + (width * i) / 8;
    ctx.beginPath();
    ctx.moveTo(lineX, y - 3);
    ctx.lineTo(lineX, y + 3);
    ctx.stroke();
  }
  label(ctx, "0", x, y + 11, 7, COLORS.faint, "center");
  label(ctx, "TIDE WINDOW  /  96 s", x + width / 2, y + 11, 7, COLORS.faint, "center");
  label(ctx, "1:36", x + width, y + 11, 7, COLORS.faint, "center");
  label(ctx, `SIM ${sim.time.toFixed(1)} s`, 28, y + 7, 8, COLORS.muted);
  label(ctx, `泵效 ${(sim.totals.efficiency * 100).toFixed(0)}%`, W - 28, y + 7, 8, COLORS.amber, "right");
}

export function drawScene(ctx, sim, visualTime = 0) {
  drawBackground(ctx, sim, visualTime);
  drawTideChart(ctx, sim, visualTime);
  drawSea(ctx, sim, visualTime);
  drawPumpStation(ctx, sim, visualTime);

  sim.reservoirs.forEach((reservoir, index) => {
    drawReservoir(ctx, sim, reservoir, POOL_LAYOUT[index], index, visualTime);
  });
  drawCanal(ctx, sim, visualTime);
  drawBottomScale(ctx, sim);

  if (sim.status === "failed") {
    const danger = ctx.createRadialGradient(W / 2, H / 2, 150, W / 2, H / 2, 700);
    danger.addColorStop(0, "rgba(255,80,54,0)");
    danger.addColorStop(1, "rgba(255,70,45,0.14)");
    ctx.fillStyle = danger;
    ctx.fillRect(0, 0, W, H);
  }
}

export function setupCanvas(canvas) {
  const ctx = canvas.getContext("2d");
  let width = 0;
  let height = 0;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = rect.width;
    height = rect.height;
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    ctx.setTransform((width * dpr) / W, 0, 0, (height * dpr) / H, 0, 0);
  }

  resize();
  window.addEventListener("resize", resize);

  return {
    render(sim, visualTime) {
      if (!width || !height) resize();
      drawScene(ctx, sim, visualTime);
    },
  };
}

export { RESERVOIRS };
