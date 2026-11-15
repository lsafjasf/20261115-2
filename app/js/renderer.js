import { CONFIG, WORLD } from "./engine.js";

const FONT = '"Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif';
const MONO = '"SFMono-Regular", "Cascadia Mono", "Noto Sans SC", monospace';
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const rad = (degrees) => (degrees * Math.PI) / 180;

function roundedRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function seeded(index) {
  const value = Math.sin(index * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext("2d");
  let dpr = 1;
  let width = WORLD.width;
  let height = WORLD.height;
  let lastResult = "";

  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
  }

  function drawSky(snap) {
    const sky = ctx.createLinearGradient(0, 0, 0, 430);
    sky.addColorStop(0, "#030914");
    sky.addColorStop(0.54, "#0b1c2d");
    sky.addColorStop(1, "#1b3447");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, height);

    const moonGlow = ctx.createRadialGradient(980, 97, 8, 980, 97, 110);
    moonGlow.addColorStop(0, "rgba(209, 241, 250, 0.34)");
    moonGlow.addColorStop(0.3, "rgba(143, 205, 228, 0.12)");
    moonGlow.addColorStop(1, "rgba(90, 150, 180, 0)");
    ctx.fillStyle = moonGlow;
    ctx.fillRect(850, 0, 260, 230);
    ctx.fillStyle = "#dbeef3";
    ctx.beginPath();
    ctx.arc(980, 97, 17, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(141, 176, 190, 0.35)";
    ctx.beginPath();
    ctx.arc(974, 92, 3, 0, Math.PI * 2);
    ctx.arc(987, 103, 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "rgba(104, 150, 174, 0.13)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 46; i += 1) {
      const x = seeded(i) * 1200;
      const y = seeded(i + 71) * 280;
      ctx.globalAlpha = 0.35 + seeded(i + 31) * 0.45;
      ctx.beginPath();
      ctx.arc(x, y, seeded(i + 42) * 1.25 + 0.3, 0, Math.PI * 2);
      ctx.fillStyle = "#c6e5ef";
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    const far = [
      [[0, 213], [88, 144], [162, 192], [245, 105], [330, 207], [448, 129], [552, 204], [644, 122], [760, 201], [910, 111], [1035, 192], [1200, 151], [1200, 274], [0, 274]],
      [[0, 268], [125, 203], [216, 247], [352, 164], [470, 246], [590, 191], [724, 255], [857, 175], [1000, 236], [1138, 168], [1200, 211], [1200, 320], [0, 320]],
    ];
    far.forEach((points, index) => {
      ctx.beginPath();
      points.forEach(([x, y], pointIndex) => {
        if (pointIndex === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.fillStyle = index === 0 ? "#102537" : "#183044";
      ctx.fill();
      ctx.strokeStyle = "rgba(139, 190, 211, 0.2)";
      ctx.lineWidth = 1;
      ctx.stroke();
    });

    ctx.globalCompositeOperation = "screen";
    for (let i = 0; i < 5; i += 1) {
      const y = 196 + seeded(i + 12) * 85;
      const band = ctx.createLinearGradient(0, y, 0, y + 36);
      band.addColorStop(0, "rgba(99, 168, 190, 0)");
      band.addColorStop(0.5, `rgba(99, 168, 190, ${0.02 + i * 0.007})`);
      band.addColorStop(1, "rgba(99, 168, 190, 0)");
      ctx.fillStyle = band;
      ctx.fillRect(0, y, 1200, 40);
    }
    ctx.globalCompositeOperation = "source-over";

    const snow = ctx.createLinearGradient(0, 150, 0, 700);
    snow.addColorStop(0, "#d5e5ea");
    snow.addColorStop(0.28, "#b8d0d9");
    snow.addColorStop(0.68, "#91adba");
    snow.addColorStop(1, "#607d8d");
    ctx.beginPath();
    ctx.moveTo(0, 234);
    ctx.bezierCurveTo(260, 176, 452, 213, 668, 164);
    ctx.bezierCurveTo(850, 132, 1018, 175, 1200, 153);
    ctx.lineTo(1200, 700);
    ctx.lineTo(0, 700);
    ctx.fillStyle = snow;
    ctx.fill();

    ctx.fillStyle = "rgba(245, 253, 255, 0.36)";
    ctx.beginPath();
    ctx.moveTo(0, 229);
    ctx.bezierCurveTo(280, 168, 475, 208, 685, 160);
    ctx.bezierCurveTo(870, 130, 1030, 170, 1200, 147);
    ctx.lineTo(1200, 177);
    ctx.bezierCurveTo(1000, 197, 840, 167, 675, 194);
    ctx.bezierCurveTo(470, 235, 270, 201, 0, 259);
    ctx.fill();
  }

  function drawSlope(snap) {
    const shelf = ctx.createLinearGradient(580, 260, 1120, 555);
    shelf.addColorStop(0, "rgba(228, 241, 244, 0.92)");
    shelf.addColorStop(0.7, "rgba(197, 216, 224, 0.82)");
    shelf.addColorStop(1, "rgba(167, 192, 204, 0.72)");
    ctx.beginPath();
    ctx.moveTo(611, 254);
    ctx.bezierCurveTo(725, 226, 954, 234, 1082, 299);
    ctx.bezierCurveTo(1170, 347, 1158, 498, 1082, 558);
    ctx.bezierCurveTo(941, 612, 730, 590, 622, 530);
    ctx.bezierCurveTo(554, 479, 564, 317, 611, 254);
    ctx.fillStyle = shelf;
    ctx.fill();
    ctx.strokeStyle = "rgba(242, 252, 255, 0.55)";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.lineWidth = 1;
    for (let i = 0; i < 10; i += 1) {
      const y = 273 + i * 30;
      ctx.beginPath();
      ctx.moveTo(632, y);
      ctx.bezierCurveTo(742, y - 15 + i, 905, y + 7, 1080, y - 8);
      ctx.strokeStyle = `rgba(105, 144, 162, ${0.1 + i * 0.006})`;
      ctx.stroke();
    }

    const pullCorridor = ctx.createLinearGradient(180, 0, 760, 0);
    pullCorridor.addColorStop(0, "rgba(211, 230, 236, 0)");
    pullCorridor.addColorStop(0.36, "rgba(234, 246, 248, 0.24)");
    pullCorridor.addColorStop(1, "rgba(248, 253, 254, 0.58)");
    ctx.beginPath();
    ctx.moveTo(126, 443);
    ctx.bezierCurveTo(326, 384, 520, 326, 774, 329);
    ctx.lineTo(793, 512);
    ctx.bezierCurveTo(520, 522, 320, 564, 112, 634);
    ctx.fillStyle = pullCorridor;
    ctx.fill();

    const chasm = ctx.createLinearGradient(0, 530, 0, 700);
    chasm.addColorStop(0, "#365261");
    chasm.addColorStop(1, "#07131d");
    ctx.beginPath();
    ctx.moveTo(0, 576);
    ctx.bezierCurveTo(154, 535, 314, 541, 456, 578);
    ctx.bezierCurveTo(512, 614, 502, 665, 552, 700);
    ctx.lineTo(0, 700);
    ctx.fillStyle = chasm;
    ctx.fill();
    ctx.strokeStyle = "rgba(220, 241, 248, 0.68)";
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.save();
    ctx.translate(738, 365);
    ctx.rotate(-0.075);
    ctx.fillStyle = "rgba(38, 74, 89, 0.12)";
    for (let i = 0; i < 8; i += 1) {
      ctx.fillRect(-160 + i * 38, 170 + i * 10, 29, 3);
    }
    ctx.restore();

    const safeGlow = ctx.createRadialGradient(773, 415, 25, 773, 415, 235);
    safeGlow.addColorStop(0, "rgba(115, 230, 171, 0.07)");
    safeGlow.addColorStop(1, "rgba(115, 230, 171, 0)");
    ctx.fillStyle = safeGlow;
    ctx.fillRect(570, 265, 420, 310);

    ctx.strokeStyle = "rgba(255, 91, 87, 0.18)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 12; i += 1) {
      ctx.beginPath();
      ctx.moveTo(22 + i * 43, 579 + i * 18);
      ctx.lineTo(47 + i * 43, 565 + i * 18);
      ctx.stroke();
    }

    ctx.fillStyle = "rgba(240, 250, 253, 0.8)";
    ctx.beginPath();
    ctx.ellipse(360, 529, 163, 42, -0.08, 0, Math.PI * 2);
    ctx.ellipse(698, 547, 108, 29, -0.03, 0, Math.PI * 2);
    ctx.fill();

    if (snap.rescue.slip > 12) {
      ctx.strokeStyle = "rgba(255, 91, 87, 0.5)";
      ctx.lineWidth = 3;
      for (let i = 0; i < 3; i += 1) {
        ctx.beginPath();
        ctx.moveTo(snap.rescue.x + 42 + i * 8, snap.rescue.y + 15 + i * 7);
        ctx.bezierCurveTo(800 + i * 10, 374 + i * 7, 762 + i * 6, 410 + i * 8, 733 + i * 4, 432 + i * 7);
        ctx.stroke();
      }
    }
  }

  function drawSafeZone(snap) {
    const frontComplete = snap.front.safe;
    const rearComplete = snap.rear.safe;
    const zones = [
      { x: 691, y: 343, w: 164, h: 72, label: "FRONT SAFE", car: "前车", done: frontComplete, active: snap.active === "front" },
      { x: 691, y: 425, w: 164, h: 76, label: "REAR SAFE", car: "后车", done: rearComplete, active: snap.active === "rear" },
    ];
    zones.forEach((zone, index) => {
      const pulse = 0.5 + Math.sin(snap.time * 2.5 + index * 2) * 0.18;
      ctx.save();
      ctx.beginPath();
      roundedRect(ctx, zone.x, zone.y, zone.w, zone.h, 9);
      ctx.fillStyle = zone.done ? "rgba(89, 207, 146, 0.26)" : `rgba(115, 230, 171, ${0.06 + pulse * 0.035})`;
      ctx.fill();
      ctx.setLineDash(zone.done ? [] : [7, 5]);
      ctx.lineWidth = zone.active ? 2 : 1;
      ctx.strokeStyle = zone.done
        ? "rgba(137, 247, 188, 0.88)"
        : zone.active
          ? "rgba(115, 230, 171, 0.72)"
          : "rgba(115, 230, 171, 0.38)";
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = `600 8px ${MONO}`;
      ctx.fillStyle = zone.done ? "#b9ffda" : "rgba(142, 220, 184, 0.7)";
      ctx.letterSpacing = "1px";
      ctx.fillText(zone.label, zone.x + 10, zone.y + 14);
      ctx.font = `500 9px ${FONT}`;
      ctx.fillStyle = "rgba(223, 247, 237, 0.65)";
      ctx.fillText(zone.car, zone.x + 11, zone.y + zone.h - 10);
      if (zone.done) {
        ctx.font = `700 19px ${MONO}`;
        ctx.fillStyle = "#c5ffdd";
        ctx.fillText("✓", zone.x + zone.w - 25, zone.y + zone.h / 2 + 7);
        ctx.strokeStyle = "rgba(137, 247, 188, 0.7)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(zone.x + 19, zone.y + zone.h / 2 + 4);
        ctx.lineTo(zone.x + 28, zone.y + zone.h / 2 - 4);
        ctx.lineTo(zone.x + 48, zone.y + zone.h / 2 + 18);
        ctx.stroke();
      }
      ctx.restore();
    });
  }

  function drawAnchor(snap) {
    const pointer = snap.phase === "rear" ? { x: 584, y: 141 } : { x: 729, y: 165 };
    const deployed = snap.anchor.deployed && snap.anchor.slot === (snap.phase === "rear" ? "rear" : "front");
    const quality = snap.anchor.quality;
    const tone = quality >= 0.78 ? "#73e6ab" : quality >= 0.48 ? "#ffc15d" : "#ff5b57";
    const truckPoint = { x: 892, y: 341 };

    ctx.save();
    ctx.strokeStyle = deployed ? "rgba(255, 177, 103, 0.7)" : "rgba(255, 177, 103, 0.2)";
    ctx.lineWidth = deployed ? 2 : 1;
    ctx.setLineDash(deployed ? [] : [5, 7]);
    ctx.beginPath();
    ctx.moveTo(pointer.x, pointer.y);
    ctx.bezierCurveTo(pointer.x + 45, pointer.y + 58, truckPoint.x - 56, truckPoint.y - 74, truckPoint.x, truckPoint.y);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = "rgba(9, 19, 28, 0.38)";
    ctx.beginPath();
    ctx.ellipse(pointer.x + 4, pointer.y + 8, 24, 13, -0.35, 0, Math.PI * 2);
    ctx.fill();

    const safeStart = -rad(CONFIG.safeAnchorMax);
    const safeEnd = -rad(CONFIG.safeAnchorMin);
    ctx.beginPath();
    ctx.moveTo(pointer.x, pointer.y);
    ctx.arc(pointer.x, pointer.y, 48, safeStart, safeEnd);
    ctx.closePath();
    ctx.fillStyle = "rgba(115, 230, 171, 0.15)";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(pointer.x, pointer.y, 48, safeStart, safeEnd);
    ctx.strokeStyle = "rgba(115, 230, 171, 0.62)";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(pointer.x, pointer.y, 36, -Math.PI + 0.24, -0.24);
    ctx.strokeStyle = deployed ? "rgba(255, 193, 112, 0.28)" : "rgba(255, 255, 255, 0.16)";
    ctx.lineWidth = 1;
    ctx.stroke();
    for (let angle = 30; angle <= 90; angle += 15) {
      const inner = 39;
      const outer = 45;
      ctx.beginPath();
      ctx.moveTo(pointer.x + Math.cos(-rad(angle)) * inner, pointer.y + Math.sin(-rad(angle)) * inner);
      ctx.lineTo(pointer.x + Math.cos(-rad(angle)) * outer, pointer.y + Math.sin(-rad(angle)) * outer);
      ctx.stroke();
    }

    const needleAngle = -rad(snap.anchor.angle);
    ctx.beginPath();
    ctx.moveTo(pointer.x, pointer.y);
    ctx.lineTo(pointer.x + Math.cos(needleAngle) * 44, pointer.y + Math.sin(needleAngle) * 44);
    ctx.strokeStyle = tone;
    ctx.lineWidth = 2.5;
    ctx.shadowColor = tone;
    ctx.shadowBlur = deployed ? 9 : 0;
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.beginPath();
    ctx.arc(pointer.x, pointer.y, 12, 0, Math.PI * 2);
    ctx.fillStyle = deployed ? "rgba(14, 27, 34, 0.95)" : "rgba(31, 45, 54, 0.78)";
    ctx.fill();
    ctx.strokeStyle = tone;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = tone;
    ctx.beginPath();
    ctx.arc(pointer.x, pointer.y, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.font = `600 8px ${MONO}`;
    ctx.fillStyle = "rgba(238, 249, 251, 0.86)";
    ctx.fillText(deployed ? "ANCHOR LOCKED" : "ANCHOR READY", pointer.x - 44, pointer.y - 62);
    ctx.font = `500 8px ${FONT}`;
    ctx.fillStyle = tone;
    ctx.fillText(`${Math.round(snap.anchor.angle)}°  ·  ${snap.anchor.band === "safe" ? "稳定" : snap.anchor.band === "caution" ? "警戒" : "危险"}`, pointer.x - 44, pointer.y - 50);

    if (snap.anchor.band === "danger" && deployed) {
      ctx.strokeStyle = "rgba(255, 91, 87, 0.7)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(pointer.x, pointer.y, 25 + Math.sin(snap.time * 7) * 2, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawRope(snap) {
    if (!snap.active) return;
    const car = snap[snap.active];
    const start = { x: CONFIG.winchPoint.x, y: CONFIG.winchPoint.y };
    const end = { x: car.x + 37, y: car.y - 2 };
    const load = snap.tension / 100;
    const slack = clamp(1 - load * 1.6, 0, 1);
    const vibration = load > 0.76 ? Math.sin(snap.time * 39) * (load - 0.76) * 10 : 0;
    const midX = (start.x + end.x) / 2;
    const midY = (start.y + end.y) / 2 + 19 * slack + vibration;
    const color =
      snap.tensionBand === "critical"
        ? "#ff5b57"
        : snap.tensionBand === "high"
          ? "#ffc15d"
          : "#e8f7f1";

    ctx.save();
    ctx.lineCap = "round";
    ctx.strokeStyle = "rgba(3, 11, 18, 0.6)";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.quadraticCurveTo(midX, midY + 2, end.x, end.y);
    ctx.stroke();

    ctx.strokeStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = load > 0.7 ? 10 : 3;
    ctx.lineWidth = load > 0.7 ? 2.4 : 1.7;
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.quadraticCurveTo(midX, midY, end.x, end.y);
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.strokeStyle = "rgba(255, 255, 255, 0.62)";
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(start.x, start.y - 1);
    ctx.quadraticCurveTo(midX, midY - 1, end.x, end.y - 1);
    ctx.stroke();

    ctx.fillStyle = "#18252c";
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(end.x, end.y, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    if (snap.tension > 8) {
      const label = `${Math.round(snap.tension)}%`;
      const lx = midX + 3;
      const ly = midY - 15;
      ctx.font = `600 8px ${MONO}`;
      const textWidth = ctx.measureText(label).width;
      ctx.fillStyle = "rgba(6, 15, 23, 0.72)";
      roundedRect(ctx, lx - 5, ly - 10, textWidth + 10, 15, 2);
      ctx.fill();
      ctx.fillStyle = color;
      ctx.fillText(label, lx, ly + 1);
    }
    ctx.restore();
  }

  function drawVehicleShadow(x, y, width, height, angle) {
    ctx.save();
    ctx.translate(x + 4, y + 15);
    ctx.rotate(rad(angle));
    ctx.fillStyle = "rgba(27, 45, 55, 0.32)";
    ctx.beginPath();
    roundedRect(ctx, -width / 2, -height / 2, width, height, 12);
    ctx.fill();
    ctx.restore();
  }

  function drawWheels(width, height, wheelColor = "#111920") {
    const wheelW = 15;
    const wheelH = 8;
    ctx.fillStyle = wheelColor;
    ctx.beginPath();
    roundedRect(ctx, -width / 2 + 11, -height / 2 - 4, wheelW, wheelH, 3);
    roundedRect(ctx, width / 2 - 27, -height / 2 - 4, wheelW, wheelH, 3);
    roundedRect(ctx, -width / 2 + 11, height / 2 - 4, wheelW, wheelH, 3);
    roundedRect(ctx, width / 2 - 27, height / 2 - 4, wheelW, wheelH, 3);
    ctx.fill();
  }

  function drawTowCar(car, options = {}) {
    const width = 88;
    const height = 42;
    drawVehicleShadow(car.x, car.y, width, height, car.tilt);
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(rad(car.tilt));
    drawWheels(width, height);

    const body = ctx.createLinearGradient(-45, -20, 45, 22);
    body.addColorStop(0, options.active ? "#3e91aa" : "#315f72");
    body.addColorStop(0.5, options.active ? "#66b7c7" : "#4f8493");
    body.addColorStop(1, "#274b5a");
    ctx.beginPath();
    roundedRect(ctx, -width / 2, -height / 2, width, height, 9);
    ctx.fillStyle = body;
    ctx.fill();
    ctx.strokeStyle = options.active ? "rgba(184, 243, 252, 0.85)" : "rgba(173, 215, 224, 0.38)";
    ctx.lineWidth = options.active ? 1.7 : 1;
    ctx.stroke();

    ctx.fillStyle = "#183745";
    ctx.beginPath();
    roundedRect(ctx, -23, -15, 35, 30, 5);
    ctx.fill();
    ctx.fillStyle = "rgba(177, 228, 237, 0.6)";
    ctx.beginPath();
    roundedRect(ctx, -19, -11, 13, 22, 3);
    roundedRect(ctx, 0, -11, 13, 22, 3);
    ctx.fill();
    ctx.strokeStyle = "rgba(12, 31, 40, 0.8)";
    ctx.beginPath();
    ctx.moveTo(-3, -14);
    ctx.lineTo(-3, 14);
    ctx.stroke();

    ctx.fillStyle = "rgba(239, 251, 255, 0.86)";
    ctx.beginPath();
    roundedRect(ctx, 22, -17, 17, 34, 4);
    ctx.fill();
    ctx.fillStyle = "rgba(255, 230, 189, 0.95)";
    ctx.beginPath();
    ctx.arc(31, -10, 3, 0, Math.PI * 2);
    ctx.arc(31, 10, 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#0a151d";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-36, -18);
    ctx.lineTo(-36, 18);
    ctx.stroke();
    ctx.fillStyle = "#0b171f";
    ctx.beginPath();
    ctx.arc(-36, 0, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#a9b9be";
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = "rgba(240, 251, 255, 0.7)";
    ctx.beginPath();
    ctx.ellipse(4, -20, 25, 3, 0.03, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawRescueTruck(snap) {
    const truck = snap.rescue;
    const width = 142;
    const height = 66;
    drawVehicleShadow(truck.x, truck.y, width, height, truck.tilt);
    ctx.save();
    ctx.translate(truck.x, truck.y);
    ctx.rotate(rad(truck.tilt));
    drawWheels(width, height, "#0c1318");
    ctx.fillStyle = "#3a413f";
    ctx.beginPath();
    roundedRect(ctx, -width / 2 - 6, -height / 2 + 7, width + 12, height - 14, 7);
    ctx.fill();

    const body = ctx.createLinearGradient(-62, -30, 70, 30);
    body.addColorStop(0, "#8c3c20");
    body.addColorStop(0.38, "#db6731");
    body.addColorStop(0.68, "#f08645");
    body.addColorStop(1, "#78331d");
    ctx.beginPath();
    roundedRect(ctx, -64, -29, 125, 58, 8);
    ctx.fillStyle = body;
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 200, 151, 0.67)";
    ctx.lineWidth = 1.2;
    ctx.stroke();

    ctx.fillStyle = "#802f1d";
    ctx.beginPath();
    roundedRect(ctx, -62, -26, 25, 52, 4);
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 205, 158, 0.24)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.font = `700 8px ${MONO}`;
    ctx.fillStyle = "#ffd6b1";
    ctx.fillText("07", -54, 3);

    const cab = ctx.createLinearGradient(30, -25, 65, 25);
    cab.addColorStop(0, "#eb7739");
    cab.addColorStop(1, "#ad4725");
    ctx.beginPath();
    roundedRect(ctx, 28, -26, 34, 52, 6);
    ctx.fillStyle = cab;
    ctx.fill();
    ctx.fillStyle = "#132b38";
    ctx.beginPath();
    roundedRect(ctx, 38, -19, 20, 17, 3);
    ctx.fill();
    ctx.fillStyle = "rgba(198, 239, 247, 0.7)";
    ctx.beginPath();
    roundedRect(ctx, 40, -18, 16, 5, 2);
    ctx.fill();
    ctx.fillStyle = "#ffdfac";
    ctx.beginPath();
    ctx.arc(57, 13, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#111c22";
    ctx.beginPath();
    roundedRect(ctx, -18, -23, 43, 46, 4);
    ctx.fill();
    for (let i = 0; i < 4; i += 1) {
      ctx.strokeStyle = "rgba(205, 198, 175, 0.28)";
      ctx.beginPath();
      ctx.moveTo(-15 + i * 11, -21);
      ctx.lineTo(-15 + i * 11, 21);
      ctx.stroke();
    }
    ctx.fillStyle = "#403126";
    ctx.beginPath();
    ctx.arc(-30, 0, 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#c6aea0";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(-30, 0, 10, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-39, 0);
    ctx.lineTo(-21, 0);
    ctx.stroke();
    ctx.fillStyle = "#e8d6c7";
    ctx.beginPath();
    ctx.arc(-30, 0, 3.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#28343b";
    ctx.beginPath();
    roundedRect(ctx, 22, -27, 6, 54, 2);
    ctx.fill();
    ctx.fillStyle = "#ffca59";
    ctx.beginPath();
    ctx.arc(25, -22, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowColor = "#ffb400";
    ctx.shadowBlur = 16;
    ctx.fillRect(19, -25, 12, 6);
    ctx.shadowBlur = 0;
    ctx.restore();

    const label = "救援车 · 07";
    ctx.font = `600 10px ${FONT}`;
    ctx.fillStyle = snap.rescue.slip > 20 ? "#ff7c70" : "rgba(255, 224, 197, 0.9)";
    ctx.fillText(label, truck.x - 38, truck.y - 46);
    ctx.font = `500 7px ${MONO}`;
    ctx.fillStyle = "rgba(255, 196, 131, 0.7)";
    ctx.fillText("RESCUE / ANCHORED", truck.x - 38, truck.y - 37);

    if (snap.rescue.slip > 10) {
      const slipX = truck.x + 25;
      const slipY = truck.y + 54;
      ctx.font = `600 8px ${MONO}`;
      ctx.fillStyle = "#ff7166";
      ctx.fillText(`SIDE SLIP ${Math.round(snap.rescue.slip)}%`, slipX, slipY);
      ctx.strokeStyle = "rgba(255, 91, 87, 0.72)";
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 3; i += 1) {
        const ax = truck.x - 55 - i * 16;
        ctx.beginPath();
        ctx.moveTo(ax + 17, truck.y + 28 + i * 11);
        ctx.lineTo(ax, truck.y + 44 + i * 11);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(ax, truck.y + 44 + i * 11);
        ctx.lineTo(ax + 8, truck.y + 40 + i * 11);
        ctx.lineTo(ax + 6, truck.y + 48 + i * 11);
        ctx.fillStyle = "rgba(255, 91, 87, 0.72)";
        ctx.fill();
      }
    }
  }

  function drawVehicleLabels(snap) {
    const labels = [
      { car: snap.front, key: "front", title: "前车 · S1", tone: "#7ed9e8" },
      { car: snap.rear, key: "rear", title: "后车 · S2", tone: "#91c7d6" },
    ];
    labels.forEach(({ car, key, title, tone }) => {
      if (car.safe) return;
      const active = snap.active === key;
      ctx.save();
      ctx.font = `600 9px ${FONT}`;
      const labelWidth = 58;
      const x = car.x - labelWidth / 2;
      const y = car.y - 42;
      ctx.fillStyle = "rgba(5, 15, 24, 0.7)";
      roundedRect(ctx, x, y - 12, labelWidth, 18, 2);
      ctx.fill();
      ctx.fillStyle = active ? tone : "rgba(170, 203, 214, 0.82)";
      ctx.fillText(title, x + 6, y);
      if (active) {
        const blink = 0.45 + Math.sin(snap.time * 7) * 0.3;
        ctx.fillStyle = `rgba(255, 193, 93, ${blink})`;
        ctx.fillRect(x + labelWidth - 17, y - 8, 11, 2);
      }
      ctx.restore();
    });
  }

  function drawWeather(snap) {
    ctx.save();
    ctx.lineCap = "round";
    for (let i = 0; i < 84; i += 1) {
      const speed = 18 + seeded(i + 5) * 48;
      const x = ((seeded(i) * 1320 - snap.time * speed + 160) % 1320) - 60;
      const y = (seeded(i + 18) * 760 + snap.time * speed * 0.35) % 720;
      const length = 3 + seeded(i + 9) * 10;
      ctx.strokeStyle = `rgba(222, 245, 251, ${0.12 + seeded(i + 22) * 0.24})`;
      ctx.lineWidth = 0.8 + seeded(i + 63) * 1.1;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - length, y + length * 0.28);
      ctx.stroke();
    }
    for (let i = 0; i < 8; i += 1) {
      const y = 240 + seeded(i + 83) * 360;
      const x = ((snap.time * (17 + i * 2) + i * 173) % 1320) - 60;
      ctx.strokeStyle = "rgba(226, 247, 252, 0.09)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.bezierCurveTo(x + 40, y - 8, x + 84, y + 10, x + 137, y + 1);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawTowProgress(snap) {
    if (!snap.active) return;
    const car = snap[snap.active];
    const boxX = clamp(car.x - 44, 20, 1060);
    const boxY = Math.max(30, car.y - 79);
    const ratio = clamp(snap.progress, 0, 1);
    ctx.save();
    ctx.fillStyle = "rgba(5, 14, 22, 0.75)";
    roundedRect(ctx, boxX, boxY, 88, 26, 2);
    ctx.fill();
    ctx.font = `600 7px ${MONO}`;
    ctx.fillStyle = "rgba(158, 202, 215, 0.8)";
    ctx.fillText("PULL SEQUENCE", boxX + 7, boxY + 9);
    ctx.fillStyle = "rgba(121, 190, 208, 0.2)";
    ctx.fillRect(boxX + 7, boxY + 15, 73, 3);
    ctx.fillStyle = "#78d7e8";
    ctx.fillRect(boxX + 7, boxY + 15, 73 * ratio, 3);
    ctx.fillStyle = "#b9eef8";
    ctx.font = `500 7px ${MONO}`;
    ctx.fillText(`${Math.round(ratio * 100)}%`, boxX + 63, boxY + 11);
    ctx.restore();
  }

  function drawDangerTint(snap) {
    if (snap.rescue.slip > 25) {
      const alpha = clamp((snap.rescue.slip - 25) / 120, 0, 0.2);
      const danger = ctx.createRadialGradient(820, 390, 90, 820, 390, 650);
      danger.addColorStop(0, "rgba(255, 70, 58, 0)");
      danger.addColorStop(1, `rgba(255, 43, 37, ${alpha})`);
      ctx.fillStyle = danger;
      ctx.fillRect(0, 0, width, height);
    }
    if (snap.status === "won") {
      const win = ctx.createLinearGradient(0, 0, 0, height);
      win.addColorStop(0, "rgba(83, 218, 152, 0.08)");
      win.addColorStop(1, "rgba(83, 218, 152, 0)");
      ctx.fillStyle = win;
      ctx.fillRect(0, 0, width, height);
    }
  }

  function drawHazardFlags(snap) {
    const flag = (x, y, text, color) => {
      ctx.save();
      ctx.strokeStyle = "rgba(24, 36, 43, 0.7)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + 36);
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 24, y + 7);
      ctx.lineTo(x, y + 15);
      ctx.fill();
      ctx.font = `600 7px ${MONO}`;
      ctx.fillStyle = "rgba(240, 249, 251, 0.72)";
      ctx.fillText(text, x + 3, y + 49);
      ctx.restore();
    };
    flag(591, 256, "SAFE PLATEAU", "#73e6ab");
    flag(117, 492, "FALL LINE", "#ff7a61");

    if (snap.anchor.band === "danger") {
      ctx.save();
      ctx.fillStyle = "rgba(255, 91, 87, 0.9)";
      ctx.font = `700 9px ${MONO}`;
      ctx.fillText("ANCHOR VECTOR UNSTABLE", 607, 214);
      ctx.strokeStyle = "rgba(255, 91, 87, 0.55)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(603, 210);
      ctx.lineTo(782, 210);
      ctx.stroke();
      ctx.restore();
    }
  }

  function draw(snap) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    drawSky(snap);
    drawSlope(snap);
    drawHazardFlags(snap);
    drawSafeZone(snap);
    drawAnchor(snap);
    drawRope(snap);

    drawTowCar(snap.front, { active: snap.active === "front" });
    drawTowCar(snap.rear, { active: snap.active === "rear" });
    drawRescueTruck(snap);
    drawVehicleLabels(snap);
    drawTowProgress(snap);
    drawWeather(snap);
    drawDangerTint(snap);

    if (snap.status !== "running") lastResult = snap.status;
    if (lastResult === "lost") {
      const alpha = 0.08 + Math.sin(performance.now() * 0.004) * 0.025;
      ctx.fillStyle = `rgba(120, 8, 8, ${alpha})`;
      ctx.fillRect(0, 0, width, height);
    }
  }

  resize();
  return { resize, draw };
}
