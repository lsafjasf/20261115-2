import {
  CURVES,
  TOLERANCE_MM,
  cubicPoint,
  sampleCurve,
} from "./simulation.js";

const TAU = Math.PI * 2;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function seededNoise(index) {
  const value = Math.sin(index * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
}

export class GlassRenderer {
  constructor(canvas, frame) {
    this.canvas = canvas;
    this.frame = frame;
    this.context = canvas.getContext("2d");
    this.width = 960;
    this.height = 640;
    this.dpr = 1;
    this.curveCache = {
      A: sampleCurve(CURVES.A, 180),
      B: sampleCurve(CURVES.B, 180),
    };
    this.textureMarks = Array.from({ length: 82 }, (_, index) => ({
      x: seededNoise(index + 5),
      y: seededNoise(index + 91),
      length: 0.02 + seededNoise(index + 36) * 0.18,
      lean: (seededNoise(index + 52) - 0.5) * 0.05,
      alpha: 0.025 + seededNoise(index + 13) * 0.09,
      width: 0.3 + seededNoise(index + 76) * 0.9,
    }));
    this.resize = this.resize.bind(this);
    this.observer = new ResizeObserver(this.resize);
    this.observer.observe(frame);
    this.resize();
  }

  resize() {
    const rect = this.frame.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = Math.max(320, rect.width);
    this.height = Math.max(300, rect.height);
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
    this.context.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  getMetrics() {
    const width = this.width;
    const height = this.height;
    const sheet = {
      x: width * 0.135,
      y: height * 0.13,
      w: width * 0.73,
      h: height * 0.745,
      r: Math.min(width, height) * 0.052,
    };
    return { width, height, sheet };
  }

  curvePoint(curveId, t, sheet) {
    const point = cubicPoint(CURVES[curveId].control, t);
    return {
      x: sheet.x + point[0] * sheet.w,
      y: sheet.y + point[1] * sheet.h,
    };
  }

  curvePath(curveId, sheet, endT = 1) {
    const points = this.curveCache[curveId];
    const path = new Path2D();
    for (let index = 0; index < points.length; index += 1) {
      const point = points[index];
      if (point.t > endT) break;
      const x = sheet.x + point.xy[0] * sheet.w;
      const y = sheet.y + point.xy[1] * sheet.h;
      if (index === 0) path.moveTo(x, y);
      else path.lineTo(x, y);
    }
    return path;
  }

  getPartPolygons(metrics = this.getMetrics()) {
    const { sheet } = metrics;
    const top = sheet.y;
    const bottom = sheet.y + sheet.h;
    const left = sheet.x;
    const right = sheet.x + sheet.w;
    const a0 = this.curvePoint("A", 0, sheet);
    const a1 = this.curvePoint("A", 1, sheet);
    const b0 = this.curvePoint("B", 0, sheet);
    const b1 = this.curvePoint("B", 1, sheet);
    const aPoints = this.curveCache.A.map((entry) => this.curvePoint("A", entry.t, sheet));
    const bPoints = this.curveCache.B.map((entry) => this.curvePoint("B", entry.t, sheet));

    return [
      [
        { x: left, y: top },
        { x: a0.x, y: top },
        ...aPoints,
        { x: a1.x, y: bottom },
        { x: left, y: bottom },
      ],
      [
        { x: a0.x, y: top },
        { x: b0.x, y: top },
        ...bPoints,
        { x: b1.x, y: bottom },
        { x: a1.x, y: bottom },
        ...aPoints.slice().reverse(),
        { x: a0.x, y: top },
      ],
      [
        { x: b0.x, y: top },
        { x: right, y: top },
        { x: right, y: bottom },
        { x: b1.x, y: bottom },
        ...bPoints.slice().reverse(),
        { x: b0.x, y: top },
      ],
    ];
  }

  polygonPath(points) {
    const path = new Path2D();
    points.forEach((point, index) => {
      if (index === 0) path.moveTo(point.x, point.y);
      else path.lineTo(point.x, point.y);
    });
    path.closePath();
    return path;
  }

  roundedGlassPath(sheet) {
    const path = new Path2D();
    const { x, y, w, h, r } = sheet;
    path.moveTo(x + r, y);
    path.lineTo(x + w - r * 0.7, y);
    path.quadraticCurveTo(x + w, y, x + w, y + r * 0.7);
    path.lineTo(x + w, y + h - r);
    path.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    path.lineTo(x + r * 0.7, y + h);
    path.quadraticCurveTo(x, y + h, x, y + h - r * 0.7);
    path.lineTo(x, y + r);
    path.quadraticCurveTo(x, y, x + r, y);
    path.closePath();
    return path;
  }

  drawBackdrop(ctx, metrics, time) {
    const { width, height, sheet } = metrics;
    const glow = ctx.createRadialGradient(
      width * 0.66,
      height * 0.18,
      10,
      width * 0.66,
      height * 0.18,
      width * 0.65,
    );
    glow.addColorStop(0, "rgba(95, 149, 131, 0.2)");
    glow.addColorStop(0.48, "rgba(33, 66, 56, 0.07)");
    glow.addColorStop(1, "rgba(4, 12, 9, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.strokeStyle = "#afcfc5";
    ctx.lineWidth = 1;
    for (let x = 45; x < width; x += 43) {
      ctx.beginPath();
      ctx.moveTo(x, 33);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    ctx.globalAlpha = 0.07;
    for (let y = 45; y < height; y += 43) {
      ctx.beginPath();
      ctx.moveTo(31, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    ctx.restore();

    ctx.save();
    ctx.translate(sheet.x + sheet.w / 2, sheet.y + sheet.h / 2);
    ctx.rotate(-0.04);
    ctx.strokeStyle = "rgba(144, 195, 178, 0.12)";
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 7]);
    ctx.strokeRect(-sheet.w * 0.57, -sheet.h * 0.6, sheet.w * 1.14, sheet.h * 1.2);
    ctx.restore();

    const pulse = 0.45 + Math.sin(time * 0.0012) * 0.08;
    ctx.save();
    ctx.fillStyle = `rgba(130, 212, 190, ${pulse * 0.18})`;
    ctx.font = "8px monospace";
    ctx.fillText("INNER STRESS FIELD / 62%", sheet.x, height - 20);
    ctx.fillStyle = "rgba(205, 230, 220, 0.24)";
    ctx.textAlign = "right";
    ctx.fillText("CALIBRATED · 0.01 mm", sheet.x + sheet.w, height - 20);
    ctx.restore();
  }

  drawGlassTexture(ctx, metrics, time, separated) {
    const { sheet } = metrics;
    const grad = ctx.createLinearGradient(sheet.x, sheet.y, sheet.x + sheet.w, sheet.y + sheet.h);
    grad.addColorStop(0, "rgba(185, 228, 218, 0.47)");
    grad.addColorStop(0.27, "rgba(104, 171, 155, 0.29)");
    grad.addColorStop(0.55, "rgba(204, 236, 227, 0.38)");
    grad.addColorStop(0.82, "rgba(90, 153, 138, 0.24)");
    grad.addColorStop(1, "rgba(166, 216, 204, 0.38)");
    ctx.fillStyle = grad;
    ctx.fillRect(sheet.x - 2, sheet.y - 2, sheet.w + 4, sheet.h + 4);

    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.lineCap = "round";
    for (const mark of this.textureMarks) {
      ctx.beginPath();
      ctx.strokeStyle = `rgba(225, 248, 241, ${mark.alpha})`;
      ctx.lineWidth = mark.width;
      const x = sheet.x + mark.x * sheet.w;
      const y = sheet.y + mark.y * sheet.h;
      ctx.moveTo(x, y);
      ctx.lineTo(x + mark.lean * sheet.w, y + mark.length * sheet.h);
      ctx.stroke();
    }

    const stress = ctx.createRadialGradient(
      sheet.x + sheet.w * 0.63,
      sheet.y + sheet.h * 0.48,
      5,
      sheet.x + sheet.w * 0.63,
      sheet.y + sheet.h * 0.48,
      sheet.w * 0.48,
    );
    stress.addColorStop(0, "rgba(220, 169, 87, 0.18)");
    stress.addColorStop(0.28, "rgba(206, 154, 70, 0.09)");
    stress.addColorStop(0.57, "rgba(89, 212, 191, 0.08)");
    stress.addColorStop(1, "rgba(30, 110, 93, 0)");
    ctx.fillStyle = stress;
    ctx.fillRect(sheet.x, sheet.y, sheet.w, sheet.h);

    ctx.translate(sheet.x + sheet.w * 0.62, sheet.y + sheet.h * 0.47);
    ctx.rotate(-0.17);
    ctx.strokeStyle = "rgba(239, 191, 109, 0.16)";
    for (let ring = 0; ring < 5; ring += 1) {
      ctx.beginPath();
      ctx.ellipse(0, 0, 16 + ring * 18, 55 + ring * 17, 0, 0, TAU);
      ctx.lineWidth = 1 + (ring % 2) * 0.5;
      ctx.stroke();
    }
    ctx.restore();

    ctx.save();
    ctx.globalCompositeOperation = "screen";
    const sheen = ctx.createLinearGradient(sheet.x, sheet.y, sheet.x + sheet.w, sheet.y);
    sheen.addColorStop(0, "rgba(255,255,255,0)");
    sheen.addColorStop(0.18, "rgba(255,255,255,0.19)");
    sheen.addColorStop(0.32, "rgba(255,255,255,0.02)");
    sheen.addColorStop(0.48, "rgba(255,255,255,0)");
    sheen.addColorStop(0.7, "rgba(225,255,248,0.1)");
    sheen.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = sheen;
    ctx.beginPath();
    ctx.moveTo(sheet.x, sheet.y);
    ctx.lineTo(sheet.x + sheet.w * 0.56, sheet.y);
    ctx.lineTo(sheet.x + sheet.w * 0.12, sheet.y + sheet.h);
    ctx.lineTo(sheet.x, sheet.y + sheet.h);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    if (!separated) {
      ctx.save();
      ctx.strokeStyle = "rgba(224, 249, 241, 0.33)";
      ctx.lineWidth = 1.2;
      ctx.stroke(this.roundedGlassPath(sheet));
      ctx.restore();
    }
  }

  drawStressWisps(ctx, metrics, time) {
    const { sheet } = metrics;
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.lineWidth = 0.7;
    for (let band = 0; band < 3; band += 1) {
      ctx.beginPath();
      const phase = Math.sin(time * 0.0008 + band * 1.9) * 4;
      for (let step = 0; step <= 30; step += 1) {
        const t = step / 30;
        const x = sheet.x + sheet.w * (0.53 + band * 0.09) + Math.sin(t * 8 + band) * 17 + phase;
        const y = sheet.y + t * sheet.h;
        if (step === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = `rgba(235, 182, 101, ${0.075 - band * 0.016})`;
      ctx.stroke();
    }
    ctx.restore();
  }

  drawGuides(ctx, metrics, state) {
    const { sheet } = metrics;
    ctx.save();
    for (const id of ["A", "B"]) {
      const path = this.curvePath(id, sheet);
      ctx.strokeStyle = "rgba(184, 232, 217, 0.18)";
      ctx.lineWidth = 5;
      ctx.stroke(path);
      ctx.strokeStyle = "rgba(132, 213, 190, 0.31)";
      ctx.lineWidth = 0.8;
      ctx.setLineDash([2, 5]);
      ctx.stroke(path);
      if (!state.cuts[id].done) {
        const start = this.curvePoint(id, 0, sheet);
        ctx.strokeStyle = "rgba(141, 225, 202, 0.55)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(start.x, start.y, state.activeCutId === id ? 7 : 4.5, 0, TAU);
        ctx.stroke();
      }
    }
    ctx.setLineDash([]);

    const active = state.activeCutId;
    if (active && state.phase !== "ready") {
      const start = this.curvePoint(active, 0, sheet);
      const end = this.curvePoint(active, 1, sheet);
      ctx.font = "7px monospace";
      ctx.textAlign = "left";
      ctx.fillStyle = "rgba(202, 235, 224, 0.55)";
      ctx.fillText(`${active} LINE · CUT ${state.cuts[active].progress >= 1 ? "✓" : "1/2"}`, start.x + 9, dropLabelY(start.y));
      ctx.fillStyle = "rgba(202, 235, 224, 0.2)";
      ctx.fillText("END", end.x + 9, end.y - 6);
    }
    ctx.restore();
  }

  scorePoint(curveId, t, cut, sheet) {
    const base = this.curvePoint(curveId, t, sheet);
    const epsilon = Math.min(0.01, Math.max(0.001, t));
    const before = this.curvePoint(curveId, Math.max(0, t - epsilon), sheet);
    const after = this.curvePoint(curveId, Math.min(1, t + epsilon), sheet);
    const dx = after.x - before.x;
    const dy = after.y - before.y;
    const length = Math.hypot(dx, dy) || 1;
    const nx = -dy / length;
    const ny = dx / length;
    const progressWeight = Math.pow(t, 1.45);
    const severity = Math.min(1.7, cut.quality.maxDeviation / TOLERANCE_MM);
    const wobble = Math.sin(t * 18 + (curveId === "A" ? 0.7 : 2.4)) * 0.65;
    const direction = curveId === "A" ? -1 : 1;
    const offsetPx = direction * severity * 9.5 * progressWeight + wobble * severity;
    return {
      x: base.x + nx * offsetPx,
      y: base.y + ny * offsetPx,
      base,
      offset: offsetPx,
    };
  }

  drawCutLines(ctx, metrics, state, time) {
    const { sheet } = metrics;
    const offsets = this.getReleaseOffsets(state);
    for (const id of ["A", "B"]) {
      const cut = state.cuts[id];
      if (cut.progress <= 0) continue;
      const endT = cut.done ? 1 : cut.progress;
      const points = [];
      const count = Math.max(2, Math.ceil(endT * 180));
      for (let index = 0; index <= count; index += 1) {
        const t = endT * (index / count);
        points.push(this.scorePoint(id, t, cut, sheet));
      }

      const adjacentParts = id === "A" ? [0, 1] : [1, 2];
      const split = adjacentParts.some((index) => state.release[index] > 0.01);
      const variants = split
        ? adjacentParts.map((index) => offsets[index])
        : [{ x: 0, y: 0 }];

      variants.forEach((offset) => {
        ctx.save();
        ctx.translate(offset.x, offset.y);
        const path = new Path2D();
        points.forEach((point, index) => {
          if (index === 0) path.moveTo(point.x, point.y);
          else path.lineTo(point.x, point.y);
        });
        ctx.strokeStyle = "rgba(0, 8, 6, 0.45)";
        ctx.lineWidth = 3.6;
        ctx.stroke(path);
        ctx.strokeStyle = "rgba(239, 255, 249, 0.82)";
        ctx.lineWidth = 1;
        ctx.stroke(path);

        const current = points[points.length - 1];
        const glow = ctx.createRadialGradient(
          current.x,
          current.y,
          1,
          current.x,
          current.y,
          17,
        );
        glow.addColorStop(0, "rgba(181, 255, 233, 0.38)");
        glow.addColorStop(1, "rgba(121, 233, 202, 0)");
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(current.x, current.y, 17, 0, TAU);
        ctx.fill();

        if (cut.quality.maxDeviation > TOLERANCE_MM) {
          this.drawFracture(ctx, id, cut, sheet, time);
        }
        if (cut.quality.chipDamage > 0.04) {
          this.drawEdgeChips(ctx, id, cut, sheet);
        }
        ctx.restore();
      });
    }
  }

  getReleaseOffsets(state) {
    return [
      { x: -state.release[0] * 17, y: -state.release[0] * 2 },
      { x: state.release[1] * 1, y: state.release[1] * 5 },
      { x: state.release[2] * 19, y: -state.release[2] * 2 },
    ];
  }

  drawFracture(ctx, curveId, cut, sheet, time) {
    const severity = clamp(cut.quality.maxDeviation / 1.1, 0.25, 1);
    const anchors = [0.33, 0.58, 0.82];
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    for (let branch = 0; branch < anchors.length; branch += 1) {
      if (cut.progress < anchors[branch]) continue;
      const point = this.scorePoint(curveId, anchors[branch], cut, sheet);
      const direction = curveId === "A" ? 1 : -1;
      const flicker = Math.sin(time * 0.003 + branch) * 2;
      ctx.beginPath();
      ctx.moveTo(point.x, point.y);
      let x = point.x;
      let y = point.y;
      for (let segment = 1; segment <= 4; segment += 1) {
        x += direction * (4 + seededNoise(branch * 19 + segment) * 10) * severity;
        y += (seededNoise(branch * 11 + segment + 4) - 0.52) * 13 + flicker;
        ctx.lineTo(x, y);
      }
      ctx.strokeStyle = "rgba(242, 155, 129, 0.72)";
      ctx.lineWidth = 1.1;
      ctx.stroke();
      ctx.strokeStyle = "rgba(255, 220, 203, 0.35)";
      ctx.lineWidth = 0.4;
      ctx.stroke();
    }
    ctx.restore();
  }

  drawEdgeChips(ctx, curveId, cut, sheet) {
    const count = Math.min(13, Math.ceil(cut.quality.chipDamage * 24));
    ctx.save();
    for (let index = 0; index < count; index += 1) {
      const t = 0.09 + seededNoise(index + 71) * Math.min(0.9, cut.progress);
      const point = this.scorePoint(curveId, t, cut, sheet);
      const side = index % 2 ? 1 : -1;
      const size = 1.4 + seededNoise(index + 88) * 3.2;
      ctx.fillStyle = "rgba(225, 251, 243, 0.84)";
      ctx.beginPath();
      ctx.moveTo(point.x + side * 1.5, point.y - size);
      ctx.lineTo(point.x + side * (size + 3), point.y - size * 0.2);
      ctx.lineTo(point.x + side * 1.7, point.y + size);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(19, 74, 59, 0.55)";
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }
    ctx.restore();
  }

  drawPieces(ctx, metrics, state, time) {
    const polygons = this.getPartPolygons(metrics);
    const releaseOffsets = this.getReleaseOffsets(state);

    polygons.forEach((polygon, index) => {
      const offset = releaseOffsets[index];
      ctx.save();
      ctx.translate(offset.x, offset.y);
      if (state.release[index] > 0.02) {
        ctx.shadowColor = "rgba(0, 0, 0, 0.25)";
        ctx.shadowBlur = 12 * state.release[index];
        ctx.shadowOffsetY = 5 * state.release[index];
      }
      ctx.clip(this.polygonPath(polygon));
      this.drawGlassTexture(ctx, metrics, time, state.release[index] > 0);
      if (state.resultParts?.[index]?.passed === false && state.resultParts?.[index]) {
        ctx.fillStyle = "rgba(190, 67, 49, 0.11)";
        ctx.fillRect(metrics.sheet.x, metrics.sheet.y, metrics.sheet.w, metrics.sheet.h);
      }
      ctx.restore();

      ctx.save();
      ctx.translate(offset.x, offset.y);
      ctx.lineWidth = 1.2;
      ctx.strokeStyle =
        state.release[index] > 0.35
          ? "rgba(205, 249, 235, 0.62)"
          : "rgba(216, 247, 237, 0.28)";
      ctx.stroke(this.polygonPath(polygon));
      ctx.restore();
    });
  }

  drawHead(ctx, metrics, state, time) {
    if (!state.head?.visible) return;
    const { sheet } = metrics;
    const x = state.head.x;
    const y = state.head.y;
    const pressure = state.pressure || 2.5;
    const unsafe = pressure > 2.95;
    const led = unsafe ? "#ef715e" : "#72e4bf";
    const angle =
      state.head.angle ??
      Math.atan2(
        this.curvePoint(state.activeCutId || "A", 0.02, sheet).y -
          this.curvePoint(state.activeCutId || "A", 0, sheet).y,
        this.curvePoint(state.activeCutId || "A", 0.02, sheet).x -
          this.curvePoint(state.activeCutId || "A", 0, sheet).x,
      );

    ctx.save();
    ctx.translate(x, y);
    const halo = ctx.createRadialGradient(0, 0, 1, 0, 0, 30);
    halo.addColorStop(0, unsafe ? "rgba(241, 116, 92, 0.26)" : "rgba(120, 238, 204, 0.23)");
    halo.addColorStop(1, "rgba(80, 210, 172, 0)");
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(0, 0, 30, 0, TAU);
    ctx.fill();

    ctx.rotate(angle + Math.PI / 2);
    ctx.shadowColor = "rgba(0, 0, 0, 0.38)";
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 5;

    ctx.fillStyle = "#293d36";
    ctx.strokeStyle = "rgba(191, 231, 219, 0.28)";
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.roundRect(-6, -53, 12, 37, 4);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#3a5149";
    ctx.beginPath();
    ctx.roundRect(-11, -34, 22, 20, 5);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#1c2b26";
    ctx.beginPath();
    ctx.roundRect(-9, -22, 18, 17, 3);
    ctx.fill();

    ctx.fillStyle = led;
    ctx.shadowColor = led;
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.arc(0, -26, 1.7, 0, TAU);
    ctx.fill();
    ctx.shadowBlur = 8;

    ctx.fillStyle = "rgba(223, 234, 230, 0.82)";
    ctx.beginPath();
    ctx.arc(0, 1, 8.5, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#70827b";
    ctx.beginPath();
    ctx.arc(0, 1, 6.7, 0, TAU);
    ctx.fill();

    ctx.strokeStyle = "rgba(25, 42, 35, 0.8)";
    ctx.lineWidth = 1.2;
    for (let spoke = 0; spoke < 5; spoke += 1) {
      const spokeAngle = (spoke / 5) * TAU + time * 0.005;
      ctx.beginPath();
      ctx.moveTo(Math.cos(spokeAngle) * 2, 1 + Math.sin(spokeAngle) * 2);
      ctx.lineTo(Math.cos(spokeAngle) * 6.1, 1 + Math.sin(spokeAngle) * 6.1);
      ctx.stroke();
    }
    ctx.fillStyle = "#d9e4df";
    ctx.beginPath();
    ctx.arc(0, 1, 2.1, 0, TAU);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = unsafe ? "rgba(245, 123, 100, 0.5)" : "rgba(118, 232, 199, 0.42)";
    ctx.lineWidth = 0.8;
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    ctx.moveTo(x - 16, y);
    ctx.lineTo(x + 16, y);
    ctx.moveTo(x, y - 16);
    ctx.lineTo(x, y + 16);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  drawParticles(ctx, particles) {
    for (const particle of particles) {
      const alpha = clamp(particle.life / particle.maxLife, 0, 1);
      ctx.save();
      ctx.translate(particle.x, particle.y);
      ctx.rotate(particle.rotation);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = particle.color || "rgba(203, 243, 230, 0.8)";
      ctx.beginPath();
      ctx.moveTo(-particle.size, particle.size * 0.4);
      ctx.lineTo(particle.size * 0.15, -particle.size);
      ctx.lineTo(particle.size, particle.size * 0.15);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  drawOrderBadges(ctx, metrics, state, time) {
    if (!["separate", "measuring", "result"].includes(state.phase)) return;
    const polygons = this.getPartPolygons(metrics);
    polygons.forEach((polygon, index) => {
      if (state.release[index] > 0.55) return;
      const center = polygon.reduce(
        (accumulator, point) => ({
          x: accumulator.x + point.x / polygon.length,
          y: accumulator.y + point.y / polygon.length,
        }),
        { x: 0, y: 0 },
      );
      const next = state.separationIndex === index;
      const pulse = next ? 1 + Math.sin(time * 0.004) * 0.08 : 1;
      ctx.save();
      ctx.translate(center.x, center.y);
      ctx.scale(pulse, pulse);
      ctx.fillStyle = next ? "rgba(10, 142, 101, 0.94)" : "rgba(10, 29, 23, 0.64)";
      ctx.strokeStyle = next ? "rgba(214, 255, 241, 0.95)" : "rgba(184, 227, 214, 0.38)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, 0, 17, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = next ? "#f1fff9" : "rgba(220, 241, 234, 0.68)";
      ctx.font = "600 12px monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(index + 1), 0, 0.5);
      if (next) {
        ctx.strokeStyle = "rgba(148, 241, 209, 0.3)";
        ctx.beginPath();
        ctx.arc(0, 0, 25 + Math.sin(time * 0.003) * 2.5, 0, TAU);
        ctx.stroke();
      }
      ctx.restore();
    });
  }

  drawStageLabels(ctx, metrics, state) {
    const { sheet } = metrics;
    ctx.save();
    ctx.font = "7px monospace";
    ctx.textAlign = "center";
    const labels = [
      { x: sheet.x + sheet.w * 0.15, y: sheet.y + sheet.h * 0.5, text: "P-01" },
      { x: sheet.x + sheet.w * 0.5, y: sheet.y + sheet.h * 0.5, text: "P-02" },
      { x: sheet.x + sheet.w * 0.85, y: sheet.y + sheet.h * 0.5, text: "P-03" },
    ];
    labels.forEach((label) => {
      ctx.fillStyle = "rgba(224, 245, 238, 0.2)";
      ctx.fillText(label.text, label.x, label.y);
    });
    if (state.phase === "ready") {
      ctx.font = "8px monospace";
      ctx.fillStyle = "rgba(173, 232, 215, 0.58)";
      ctx.textAlign = "left";
      ctx.fillText("DRAG FROM A-LINE START · HOLD THE HEAD", sheet.x + 10, sheet.y - 12);
    }
    ctx.restore();
  }

  drawFlash(ctx, metrics, state) {
    if (state.flash <= 0) return;
    const gradient = ctx.createRadialGradient(
      metrics.width / 2,
      metrics.height / 2,
      10,
      metrics.width / 2,
      metrics.height / 2,
      metrics.width * 0.7,
    );
    gradient.addColorStop(0, `rgba(211, 72, 53, ${state.flash * 0.04})`);
    gradient.addColorStop(1, `rgba(211, 72, 53, ${state.flash * 0.2})`);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, metrics.width, metrics.height);
  }

  render(state, time) {
    const ctx = this.context;
    const metrics = this.getMetrics();
    ctx.clearRect(0, 0, this.width, this.height);
    this.drawBackdrop(ctx, metrics, time);
    this.drawPieces(ctx, metrics, state, time);

    ctx.save();
    if (state.shake > 0.01) {
      ctx.translate(
        Math.sin(time * 0.09) * state.shake * 2.2,
        Math.cos(time * 0.073) * state.shake * 1.4,
      );
    }
    ctx.save();
    ctx.clip(this.roundedGlassPath(metrics.sheet));
    this.drawStressWisps(ctx, metrics, time);
    ctx.restore();
    this.drawGuides(ctx, metrics, state);
    this.drawCutLines(ctx, metrics, state, time);
    this.drawStageLabels(ctx, metrics, state);
    this.drawOrderBadges(ctx, metrics, state, time);
    this.drawParticles(ctx, state.particles || []);
    this.drawHead(ctx, metrics, state, time);
    this.drawFlash(ctx, metrics, state);
    ctx.restore();
  }
}

function dropLabelY(y) {
  return Math.max(18, y + 14);
}
