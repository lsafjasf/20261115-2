"use strict";

const WIDTH = 760;
const HEIGHT = 475;
const CX = WIDTH / 2;
const CY = HEIGHT / 2 + 1;
const ORBIT_ROTATION = -0.28;
const DIFF_THRESHOLD = 10;
const BASE_RADIUS = 132;
const INITIAL_RADIUS = 164;

const dom = {
  canvasA: document.querySelector("#canvasA"),
  canvasB: document.querySelector("#canvasB"),
  canvasDiff: document.querySelector("#canvasDiff"),
  frameRange: document.querySelector("#frameRange"),
  radiusRange: document.querySelector("#radiusRange"),
  keyframeRail: document.querySelector("#keyframeRail"),
  playButton: document.querySelector("#playButton"),
  exportButton: document.querySelector("#exportButton"),
  resetButton: document.querySelector("#resetButton"),
  toast: document.querySelector("#toast"),
  frameCodeA: document.querySelector("#frameCodeA"),
  frameCodeB: document.querySelector("#frameCodeB"),
  keyframeIndex: document.querySelector("#keyframeIndex"),
  keyframeName: document.querySelector("#keyframeName"),
  timecode: document.querySelector("#timecode"),
  changePercent: document.querySelector("#changePercent"),
  changedPixels: document.querySelector("#changedPixels"),
  totalPixels: document.querySelector("#totalPixels"),
  ratioFill: document.querySelector("#ratioFill"),
  maxX: document.querySelector("#maxX"),
  maxY: document.querySelector("#maxY"),
  maxChannel: document.querySelector("#maxChannel"),
  maxChannelBadge: document.querySelector("#maxChannelBadge"),
  bboxValue: document.querySelector("#bboxValue"),
  findingTitle: document.querySelector("#findingTitle"),
  findingCopy: document.querySelector("#findingCopy"),
  paramAValue: document.querySelector("#paramAValue"),
  paramBValue: document.querySelector("#paramBValue"),
  paramBDeltaValue: document.querySelector("#paramBDeltaValue"),
  deltaBadge: document.querySelector("#deltaBadge"),
  radiusLabelA: document.querySelector("#radiusLabelA"),
  radiusLabelB: document.querySelector("#radiusLabelB"),
  adjustValue: document.querySelector("#adjustValue"),
  adjustScaleMid: document.querySelector("#adjustScaleMid"),
};

const ctxA = dom.canvasA.getContext("2d", { willReadFrequently: true });
const ctxB = dom.canvasB.getContext("2d", { willReadFrequently: true });
const ctxDiff = dom.canvasDiff.getContext("2d", { willReadFrequently: true });

const KEYFRAMES = [
  { frame: 0, name: "初始", code: "00:00:00:00" },
  { frame: 15, name: "伸展", code: "00:00:00:15" },
  { frame: 30, name: "外扩", code: "00:00:01:00" },
  { frame: 45, name: "错相", code: "00:00:01:15" },
  { frame: 60, name: "峰值", code: "00:00:02:00" },
  { frame: 75, name: "回旋", code: "00:00:02:15" },
  { frame: 90, name: "断裂", code: "00:00:03:00" },
  { frame: 105, name: "余波", code: "00:00:03:15" },
  { frame: 120, name: "归位", code: "00:00:04:00" },
];

const SHARED_PARAMS = Object.freeze({
  orbitTilt: ORBIT_ROTATION,
  orbitSquash: 0.44,
  beadCount: 26,
  petalCount: 16,
  trailLength: 42,
  phaseOffset: 0.62,
  corePulse: 0.35,
});

const state = {
  keyIndex: 4,
  radiusB: INITIAL_RADIUS,
  playing: false,
  playTimer: null,
  rafId: 0,
  toastTimer: null,
  lastResult: null,
};

const STARS = createStars();
const DUST = createDust();
const HEAT_LUT = createHeatLut();

function mulberry32(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function createStars() {
  const random = mulberry32(240116);
  return Array.from({ length: 76 }, () => ({
    x: random() * WIDTH,
    y: random() * HEIGHT,
    radius: 0.25 + random() * 1.1,
    alpha: 0.12 + random() * 0.42,
    phase: random() * Math.PI * 2,
    speed: 0.5 + random() * 1.4,
  }));
}

function createDust() {
  const random = mulberry32(8119);
  return Array.from({ length: 34 }, () => ({
    angle: random() * Math.PI * 2,
    radius: 0.18 + random() * 0.88,
    drift: random() * Math.PI * 2,
    size: 0.4 + random() * 1.2,
  }));
}

function createHeatLut() {
  const stops = [
    [0, [10, 18, 15]],
    [0.05, [16, 42, 36]],
    [0.2, [27, 112, 96]],
    [0.43, [76, 188, 159]],
    [0.64, [222, 205, 106]],
    [0.81, [245, 142, 75]],
    [0.93, [255, 103, 79]],
    [1, [255, 244, 206]],
  ];
  const lut = new Uint8ClampedArray(256 * 3);
  for (let i = 0; i < 256; i += 1) {
    const t = i / 255;
    let left = stops[0];
    let right = stops[stops.length - 1];
    for (let s = 0; s < stops.length - 1; s += 1) {
      if (t >= stops[s][0] && t <= stops[s + 1][0]) {
        left = stops[s];
        right = stops[s + 1];
        break;
      }
    }
    const span = right[0] - left[0] || 1;
    const local = (t - left[0]) / span;
    lut[i * 3] = Math.round(left[1][0] + (right[1][0] - left[1][0]) * local);
    lut[i * 3 + 1] = Math.round(left[1][1] + (right[1][1] - left[1][1]) * local);
    lut[i * 3 + 2] = Math.round(left[1][2] + (right[1][2] - left[1][2]) * local);
  }
  return lut;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function lerp(start, end, amount) {
  return start + (end - start) * amount;
}

function pad(value, length) {
  return String(value).padStart(length, "0");
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US").format(value);
}

function ellipsePoint(radiusX, radiusY, angle) {
  const cosRotation = Math.cos(ORBIT_ROTATION);
  const sinRotation = Math.sin(ORBIT_ROTATION);
  const localX = Math.cos(angle) * radiusX;
  const localY = Math.sin(angle) * radiusY;
  return {
    x: CX + localX * cosRotation - localY * sinRotation,
    y: CY + localX * sinRotation + localY * cosRotation,
  };
}

function makeParams(orbitRadius) {
  return { ...SHARED_PARAMS, orbitRadius };
}

function drawGrid(ctx, phase) {
  ctx.save();
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(173, 212, 186, 0.036)";
  ctx.beginPath();
  for (let x = CX % 38; x < WIDTH; x += 38) {
    ctx.moveTo(Math.round(x) + 0.5, 0);
    ctx.lineTo(Math.round(x) + 0.5, HEIGHT);
  }
  for (let y = CY % 38; y < HEIGHT; y += 38) {
    ctx.moveTo(0, Math.round(y) + 0.5);
    ctx.lineTo(WIDTH, Math.round(y) + 0.5);
  }
  ctx.stroke();

  ctx.strokeStyle = "rgba(174, 213, 186, 0.055)";
  ctx.beginPath();
  ctx.moveTo(CX, 28);
  ctx.lineTo(CX, HEIGHT - 28);
  ctx.moveTo(50, CY);
  ctx.lineTo(WIDTH - 50, CY);
  ctx.stroke();

  const ringAlpha = 0.045 + Math.sin(phase * 0.7) * 0.008;
  ctx.strokeStyle = `rgba(160, 208, 178, ${ringAlpha})`;
  ctx.setLineDash([2, 8]);
  ctx.beginPath();
  ctx.arc(CX, CY, 188, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(CX, CY, 232, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawStars(ctx, phase) {
  ctx.save();
  for (const star of STARS) {
    const twinkle = 0.68 + Math.sin(phase * star.speed + star.phase) * 0.32;
    ctx.globalAlpha = star.alpha * twinkle;
    ctx.fillStyle = star.phase > Math.PI ? "#d8e8d8" : "#d8ff67";
    ctx.beginPath();
    ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawDust(ctx, params, phase) {
  const radius = params.orbitRadius;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const mote of DUST) {
    const angle = mote.angle + phase * 0.08;
    const point = ellipsePoint(
      radius * mote.radius * 1.04,
      radius * mote.radius * SHARED_PARAMS.orbitSquash,
      angle,
    );
    const alpha = 0.08 + (Math.sin(phase * 1.4 + mote.drift) + 1) * 0.055;
    ctx.fillStyle = `rgba(126, 211, 176, ${alpha})`;
    ctx.beginPath();
    ctx.arc(point.x, point.y, mote.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawOrbitGuides(ctx, params, phase) {
  const radius = params.orbitRadius;
  const scales = [0.46, 0.67, 0.84, 1];
  const opacities = [0.09, 0.12, 0.19, 0.55];

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  scales.forEach((scale, index) => {
    const isOuter = index === scales.length - 1;
    ctx.strokeStyle = isOuter ? "rgba(216, 255, 103, 0.3)" : `rgba(92, 192, 161, ${opacities[index]})`;
    ctx.lineWidth = isOuter ? 1.15 : 0.75;
    ctx.setLineDash(isOuter ? [4, 9] : index === 2 ? [1, 6] : []);
    ctx.beginPath();
    ctx.ellipse(
      CX,
      CY,
      radius * scale,
      radius * scale * params.orbitSquash,
      ORBIT_ROTATION,
      0,
      Math.PI * 2,
    );
    ctx.stroke();
  });
  ctx.setLineDash([]);

  const start = phase * 0.38 + 0.4;
  const gradient = ctx.createLinearGradient(CX - radius, CY - radius * 0.35, CX + radius, CY + radius * 0.35);
  gradient.addColorStop(0, "rgba(92, 192, 161, 0)");
  gradient.addColorStop(0.45, "rgba(101, 217, 191, 0.52)");
  gradient.addColorStop(0.72, "rgba(216, 255, 103, 0.75)");
  gradient.addColorStop(1, "rgba(101, 217, 191, 0)");
  ctx.strokeStyle = gradient;
  ctx.lineWidth = 1.7;
  ctx.beginPath();
  ctx.ellipse(
    CX,
    CY,
    radius,
    radius * params.orbitSquash,
    ORBIT_ROTATION,
    start,
    start + Math.PI * 0.64,
  );
  ctx.stroke();

  ctx.strokeStyle = "rgba(216, 255, 103, 0.32)";
  ctx.lineWidth = 0.7;
  for (let i = 0; i < 48; i += 1) {
    const angle = (i / 48) * Math.PI * 2;
    const inner = ellipsePoint(radius, radius * params.orbitSquash, angle);
    const outer = ellipsePoint(radius * 1.028, radius * params.orbitSquash * 1.028, angle);
    const emphasis = i % 6 === 0 ? 0.95 : 0.4;
    ctx.globalAlpha = emphasis;
    ctx.beginPath();
    ctx.moveTo(inner.x, inner.y);
    ctx.lineTo(outer.x, outer.y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawPetals(ctx, params, phase) {
  const radius = params.orbitRadius;
  const petals = params.petalCount;

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (let petal = 0; petal < petals; petal += 1) {
    const baseAngle = (petal / petals) * Math.PI * 2 + phase * 0.12;
    const isAccent = petal % 4 === 0;
    ctx.strokeStyle = isAccent ? "rgba(216, 255, 103, 0.095)" : "rgba(91, 190, 160, 0.075)";
    ctx.lineWidth = isAccent ? 0.9 : 0.65;
    ctx.beginPath();

    for (let step = 0; step <= 28; step += 1) {
      const t = step / 28;
      const distance = radius * lerp(0.18, 0.93, t);
      const bend = Math.sin(t * Math.PI * 1.55 + phase * 0.6 + petal * 0.32) * 0.075 * t;
      const angle = baseAngle + bend;
      const point = ellipsePoint(distance, distance * params.orbitSquash, angle);
      if (step === 0) {
        ctx.moveTo(point.x, point.y);
      } else {
        ctx.lineTo(point.x, point.y);
      }
    }
    ctx.stroke();

    if (isAccent) {
      const endAngle = baseAngle + Math.sin(Math.PI * 1.55 + phase * 0.6 + petal * 0.32) * 0.075;
      const end = ellipsePoint(radius * 0.93, radius * 0.93 * params.orbitSquash, endAngle);
      ctx.fillStyle = "rgba(216, 255, 103, 0.33)";
      ctx.beginPath();
      ctx.arc(end.x, end.y, 1.15, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawBeads(ctx, params, phase) {
  const radius = params.orbitRadius;
  const count = params.beadCount;

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < count; i += 1) {
    const angle = (i / count) * Math.PI * 2 + phase * 0.15;
    const previousAngle = angle - 0.034;
    const current = ellipsePoint(radius, radius * params.orbitSquash, angle);
    const previous = ellipsePoint(radius, radius * params.orbitSquash, previousAngle);
    const accent = i % 5 === 0;
    const pulse = 0.55 + (Math.sin(phase * 2 + i * 0.8) + 1) * 0.22;

    ctx.strokeStyle = accent
      ? `rgba(216, 255, 103, ${0.18 + pulse * 0.24})`
      : `rgba(101, 217, 191, ${0.07 + pulse * 0.13})`;
    ctx.lineWidth = accent ? 1.7 : 0.9;
    ctx.beginPath();
    ctx.moveTo(previous.x, previous.y);
    ctx.lineTo(current.x, current.y);
    ctx.stroke();

    if (accent) {
      ctx.fillStyle = `rgba(230, 255, 166, ${0.42 + pulse * 0.28})`;
      ctx.shadowColor = "rgba(216, 255, 103, 0.42)";
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.arc(current.x, current.y, 1.35 + pulse * 0.65, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    } else {
      ctx.fillStyle = `rgba(159, 230, 208, ${0.2 + pulse * 0.18})`;
      ctx.beginPath();
      ctx.arc(current.x, current.y, 0.7 + pulse * 0.35, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawComet(ctx, params, phase) {
  const radius = params.orbitRadius;
  const angle = phase * 1.4 + params.phaseOffset;
  const trail = params.trailLength;

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const trailGradient = ctx.createLinearGradient(CX, CY, CX + radius, CY);
  trailGradient.addColorStop(0, "rgba(101, 217, 191, 0.02)");
  trailGradient.addColorStop(0.55, "rgba(101, 217, 191, 0.14)");
  trailGradient.addColorStop(1, "rgba(216, 255, 103, 0.76)");

  ctx.strokeStyle = trailGradient;
  ctx.lineWidth = 2.5;
  ctx.lineCap = "round";
  ctx.beginPath();
  for (let step = 0; step <= trail; step += 1) {
    const t = step / trail;
    const point = ellipsePoint(
      radius * lerp(0.9, 1, t),
      radius * lerp(0.9, 1, t) * params.orbitSquash,
      angle - (1 - t) * 1.15,
    );
    if (step === 0) {
      ctx.moveTo(point.x, point.y);
    } else {
      ctx.lineTo(point.x, point.y);
    }
  }
  ctx.stroke();

  ctx.strokeStyle = "rgba(244, 255, 210, 0.64)";
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  for (let step = 18; step <= trail; step += 1) {
    const t = step / trail;
    const point = ellipsePoint(
      radius * lerp(0.955, 1, t),
      radius * lerp(0.955, 1, t) * params.orbitSquash,
      angle - (1 - t) * 0.58,
    );
    if (step === 18) {
      ctx.moveTo(point.x, point.y);
    } else {
      ctx.lineTo(point.x, point.y);
    }
  }
  ctx.stroke();

  const head = ellipsePoint(radius, radius * params.orbitSquash, angle);
  const tailPoint = ellipsePoint(radius * 0.94, radius * 0.94 * params.orbitSquash, angle - 0.45);
  ctx.strokeStyle = "rgba(216, 255, 103, 0.2)";
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.moveTo(tailPoint.x, tailPoint.y);
  ctx.lineTo(head.x, head.y);
  ctx.stroke();

  const glow = ctx.createRadialGradient(head.x, head.y, 0, head.x, head.y, 25);
  glow.addColorStop(0, "rgba(255, 249, 213, 0.95)");
  glow.addColorStop(0.18, "rgba(225, 255, 151, 0.72)");
  glow.addColorStop(0.5, "rgba(159, 229, 120, 0.19)");
  glow.addColorStop(1, "rgba(101, 217, 191, 0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(head.x, head.y, 25, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#ffffe5";
  ctx.beginPath();
  ctx.arc(head.x, head.y, 2.1, 0, Math.PI * 2);
  ctx.fill();

  const secondaryAngle = angle + Math.PI * 0.74;
  const secondary = ellipsePoint(radius * 0.84, radius * 0.84 * params.orbitSquash, secondaryAngle);
  ctx.fillStyle = "rgba(101, 217, 191, 0.75)";
  ctx.beginPath();
  ctx.arc(secondary.x, secondary.y, 1.35, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawCore(ctx, params, phase) {
  const pulse = 0.86 + Math.sin(phase * 2.3) * 0.08 + Math.sin(phase * 0.7 + params.corePulse) * 0.05;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";

  const haze = ctx.createRadialGradient(CX, CY, 2, CX, CY, 78 * pulse);
  haze.addColorStop(0, "rgba(216, 255, 103, 0.2)");
  haze.addColorStop(0.25, "rgba(117, 211, 160, 0.11)");
  haze.addColorStop(0.65, "rgba(58, 139, 118, 0.04)");
  haze.addColorStop(1, "rgba(20, 40, 32, 0)");
  ctx.fillStyle = haze;
  ctx.beginPath();
  ctx.arc(CX, CY, 78 * pulse, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(216, 255, 103, 0.26)";
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.arc(CX, CY, 19 + pulse * 2, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = "rgba(101, 217, 191, 0.15)";
  ctx.setLineDash([1, 5]);
  ctx.beginPath();
  ctx.arc(CX, CY, 30 + pulse * 2, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  const coreGradient = ctx.createRadialGradient(CX - 1, CY - 1, 0, CX, CY, 7);
  coreGradient.addColorStop(0, "#ffffeb");
  coreGradient.addColorStop(0.3, "#eaff8e");
  coreGradient.addColorStop(1, "rgba(216, 255, 103, 0)");
  ctx.fillStyle = coreGradient;
  ctx.beginPath();
  ctx.arc(CX, CY, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawScene(ctx, params, frame) {
  const phase = (frame / 120) * Math.PI * 2 + 0.18;
  ctx.clearRect(0, 0, WIDTH, HEIGHT);

  ctx.fillStyle = "#07100c";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const backdrop = ctx.createRadialGradient(CX, CY, 18, CX, CY, 375);
  backdrop.addColorStop(0, "rgba(35, 70, 55, 0.52)");
  backdrop.addColorStop(0.38, "rgba(17, 37, 29, 0.38)");
  backdrop.addColorStop(0.72, "rgba(8, 18, 14, 0.2)");
  backdrop.addColorStop(1, "rgba(4, 8, 6, 0)");
  ctx.fillStyle = backdrop;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  drawGrid(ctx, phase);
  drawStars(ctx, phase);
  drawDust(ctx, params, phase);
  drawOrbitGuides(ctx, params, phase);
  drawPetals(ctx, params, phase);
  drawBeads(ctx, params, phase);
  drawComet(ctx, params, phase);
  drawCore(ctx, params, phase);

  ctx.save();
  const vignette = ctx.createRadialGradient(CX, CY, 125, CX, CY, 430);
  vignette.addColorStop(0, "rgba(0, 0, 0, 0)");
  vignette.addColorStop(0.72, "rgba(0, 0, 0, 0.04)");
  vignette.addColorStop(1, "rgba(0, 0, 0, 0.62)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.restore();
}

function computeDiff(imageA, imageB) {
  const sourceA = imageA.data;
  const sourceB = imageB.data;
  const pixelCount = WIDTH * HEIGHT;
  const heat = ctxDiff.createImageData(WIDTH, HEIGHT);
  const heatData = heat.data;
  let changed = 0;
  let maxDiff = 0;
  let maxX = Math.floor(WIDTH / 2);
  let maxY = Math.floor(HEIGHT / 2);
  let minX = WIDTH;
  let minY = HEIGHT;
  let maxBoundsX = 0;
  let maxBoundsY = 0;

  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    const offset = pixel * 4;
    const dr = Math.abs(sourceA[offset] - sourceB[offset]);
    const dg = Math.abs(sourceA[offset + 1] - sourceB[offset + 1]);
    const db = Math.abs(sourceA[offset + 2] - sourceB[offset + 2]);
    const diff = Math.max(dr, dg, db);
    const lutOffset = diff * 3;

    heatData[offset] = HEAT_LUT[lutOffset];
    heatData[offset + 1] = HEAT_LUT[lutOffset + 1];
    heatData[offset + 2] = HEAT_LUT[lutOffset + 2];
    heatData[offset + 3] = 255;

    if (diff > DIFF_THRESHOLD) {
      changed += 1;
      const x = pixel % WIDTH;
      const y = Math.floor(pixel / WIDTH);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxBoundsX = Math.max(maxBoundsX, x);
      maxBoundsY = Math.max(maxBoundsY, y);
      if (diff > maxDiff) {
        maxDiff = diff;
        maxX = x;
        maxY = y;
      }
    }
  }

  ctxDiff.putImageData(heat, 0, 0);

  return {
    changed,
    total: pixelCount,
    percent: (changed / pixelCount) * 100,
    maxDiff,
    maxX,
    maxY,
    minX: changed ? minX : 0,
    minY: changed ? minY : 0,
    maxBoundsX: changed ? maxBoundsX : 0,
    maxBoundsY: changed ? maxBoundsY : 0,
  };
}

function drawLocator(ctx, x, y, color) {
  const radius = 9;
  ctx.save();
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(3, 8, 5, 0.9)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.moveTo(x - radius - 7, y);
  ctx.lineTo(x - radius + 1, y);
  ctx.moveTo(x + radius - 1, y);
  ctx.lineTo(x + radius + 7, y);
  ctx.moveTo(x, y - radius - 7);
  ctx.lineTo(x, y - radius + 1);
  ctx.moveTo(x, y + radius - 1);
  ctx.lineTo(x, y + radius + 7);
  ctx.stroke();

  ctx.strokeStyle = color;
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.moveTo(x - radius - 6, y);
  ctx.lineTo(x - radius + 2, y);
  ctx.moveTo(x + radius - 2, y);
  ctx.lineTo(x + radius + 6, y);
  ctx.moveTo(x, y - radius - 6);
  ctx.lineTo(x, y - radius + 2);
  ctx.moveTo(x, y + radius - 2);
  ctx.lineTo(x, y + radius + 6);
  ctx.stroke();

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, 1.55, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawAllLocators(result) {
  if (result.maxDiff <= DIFF_THRESHOLD) {
    return;
  }
  drawLocator(ctxA, result.maxX, result.maxY, "rgba(255, 121, 97, 0.95)");
  drawLocator(ctxB, result.maxX, result.maxY, "rgba(255, 121, 97, 0.95)");
  drawLocator(ctxDiff, result.maxX, result.maxY, "rgba(255, 248, 218, 0.98)");
}

function updateInterface(result) {
  const keyframe = KEYFRAMES[state.keyIndex];
  const delta = state.radiusB - BASE_RADIUS;
  const deltaText = `${delta >= 0 ? "+" : ""}${delta} px`;
  const percent = result.percent;

  dom.paramAValue.textContent = String(BASE_RADIUS);
  dom.paramBValue.textContent = String(state.radiusB);
  dom.paramBDeltaValue.textContent = String(state.radiusB);
  dom.deltaBadge.textContent = deltaText;
  dom.radiusLabelA.textContent = String(BASE_RADIUS);
  dom.radiusLabelB.textContent = String(state.radiusB);
  dom.adjustValue.textContent = String(state.radiusB);
  dom.adjustScaleMid.textContent = deltaText;
  dom.frameCodeA.textContent = `F.${pad(keyframe.frame, 3)}`;
  dom.frameCodeB.textContent = `F.${pad(keyframe.frame, 3)}`;
  dom.keyframeIndex.textContent = pad(state.keyIndex + 1, 2);
  dom.keyframeName.textContent = keyframe.name;
  dom.timecode.textContent = keyframe.code;

  dom.changePercent.innerHTML = `${percent.toFixed(1)}<small>%</small>`;
  dom.changedPixels.textContent = formatNumber(result.changed);
  dom.totalPixels.textContent = formatNumber(result.total);
  dom.ratioFill.style.width = `${clamp(percent, 0, 100)}%`;
  dom.maxX.textContent = pad(result.maxX, 3);
  dom.maxY.textContent = pad(result.maxY, 3);
  dom.maxChannel.textContent = String(result.maxDiff);
  dom.maxChannelBadge.textContent = String(result.maxDiff);

  if (result.changed) {
    dom.bboxValue.textContent =
      `X ${result.minX}–${result.maxBoundsX} · Y ${result.minY}–${result.maxBoundsY}`;
  } else {
    dom.bboxValue.textContent = "NO DELTA";
  }

  dom.findingTitle.textContent = result.changed ? "差异集中在外轨道" : "当前帧无可测差异";
  dom.findingCopy.textContent = result.changed
    ? `轨道半径 ${BASE_RADIUS} → ${state.radiusB} px。峰值位于 X ${result.maxX} / Y ${result.maxY} 的轨迹边缘，并随关键帧移动。`
    : "A/B 参数在阈值范围内未产生可测像素差。";

  dom.frameRange.value = String(state.keyIndex);
  dom.frameRange.style.setProperty(
    "--range-progress",
    `${(state.keyIndex / (KEYFRAMES.length - 1)) * 100}%`,
  );
  dom.frameRange.setAttribute(
    "aria-valuetext",
    `关键帧 ${state.keyIndex + 1}，第 ${keyframe.frame} 帧，${keyframe.name}`,
  );

  dom.radiusRange.value = String(state.radiusB);
  dom.radiusRange.style.setProperty(
    "--radius-progress",
    `${((state.radiusB - Number(dom.radiusRange.min)) / (Number(dom.radiusRange.max) - Number(dom.radiusRange.min))) * 100}%`,
  );
  dom.radiusRange.setAttribute("aria-valuetext", `${state.radiusB} 像素`);

  for (const button of dom.keyframeRail.children) {
    const active = Number(button.dataset.index) === state.keyIndex;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  }
}

function renderComparison() {
  const keyframe = KEYFRAMES[state.keyIndex];
  const paramsA = makeParams(BASE_RADIUS);
  const paramsB = makeParams(state.radiusB);

  drawScene(ctxA, paramsA, keyframe.frame);
  drawScene(ctxB, paramsB, keyframe.frame);

  const imageA = ctxA.getImageData(0, 0, WIDTH, HEIGHT);
  const imageB = ctxB.getImageData(0, 0, WIDTH, HEIGHT);
  const result = computeDiff(imageA, imageB);
  drawAllLocators(result);
  updateInterface(result);
  state.lastResult = result;
}

function scheduleRender() {
  if (state.rafId) {
    return;
  }
  state.rafId = requestAnimationFrame(() => {
    state.rafId = 0;
    renderComparison();
  });
}

function buildKeyframeRail() {
  const fragment = document.createDocumentFragment();
  KEYFRAMES.forEach((keyframe, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "keyframe-tick";
    button.dataset.index = String(index);
    button.setAttribute("aria-label", `跳转到关键帧 ${index + 1}，第 ${keyframe.frame} 帧，${keyframe.name}`);
    button.setAttribute("aria-pressed", String(index === state.keyIndex));
    button.innerHTML = `<b>${pad(keyframe.frame, 2)}</b><span>${keyframe.name}</span>`;
    fragment.appendChild(button);
  });
  dom.keyframeRail.appendChild(fragment);
}

function showToast(message) {
  dom.toast.textContent = message;
  dom.toast.classList.add("is-visible");
  window.clearTimeout(state.toastTimer);
  state.toastTimer = window.setTimeout(() => {
    dom.toast.classList.remove("is-visible");
  }, 2400);
}

function setKeyframe(index) {
  state.keyIndex = clamp(index, 0, KEYFRAMES.length - 1);
  renderComparison();
}

function stopPlayback() {
  state.playing = false;
  window.clearInterval(state.playTimer);
  state.playTimer = null;
  dom.playButton.classList.remove("is-playing");
  dom.playButton.setAttribute("aria-label", "播放关键帧");
}

function startPlayback() {
  state.playing = true;
  dom.playButton.classList.add("is-playing");
  dom.playButton.setAttribute("aria-label", "暂停关键帧播放");
  state.playTimer = window.setInterval(() => {
    const next = (state.keyIndex + 1) % KEYFRAMES.length;
    state.keyIndex = next;
    renderComparison();
  }, 1100);
}

function togglePlayback() {
  if (state.playing) {
    stopPlayback();
  } else {
    startPlayback();
  }
}

function bindControls() {
  dom.frameRange.addEventListener("input", (event) => {
    stopPlayback();
    setKeyframe(Number(event.target.value));
  });

  dom.keyframeRail.addEventListener("click", (event) => {
    const button = event.target.closest(".keyframe-tick");
    if (!button) {
      return;
    }
    stopPlayback();
    setKeyframe(Number(button.dataset.index));
  });

  dom.radiusRange.addEventListener("input", (event) => {
    state.radiusB = Number(event.target.value);
    scheduleRender();
  });

  dom.playButton.addEventListener("click", togglePlayback);

  dom.resetButton.addEventListener("click", () => {
    state.radiusB = INITIAL_RADIUS;
    renderComparison();
    showToast(`已还原变体轨道半径：${INITIAL_RADIUS} px`);
  });

  dom.exportButton.addEventListener("click", exportComparison);

  document.addEventListener("visibilitychange", () => {
    if (document.hidden && state.playing) {
      stopPlayback();
    }
  });
}

function roundedRectPath(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawExportPanel(ctx, canvas, x, y, width, height, meta) {
  ctx.save();
  ctx.fillStyle = "#0e1310";
  roundedRectPath(ctx, x, y, width, height, 10);
  ctx.fill();
  ctx.strokeStyle = meta.border;
  ctx.lineWidth = 1;
  ctx.stroke();

  const headerHeight = 48;
  const imageHeight = (width * HEIGHT) / WIDTH;
  const footerHeight = height - headerHeight - imageHeight;

  ctx.fillStyle = meta.color;
  roundedRectPath(ctx, x + 14, y + 14, 24, 24, 5);
  ctx.fill();
  ctx.fillStyle = "#10140d";
  ctx.font = "700 12px 'SFMono-Regular', 'Roboto Mono', 'Noto Sans SC', monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(meta.letter, x + 26, y + 26.5);

  ctx.textAlign = "left";
  ctx.fillStyle = "#eef3e8";
  ctx.font = "600 14px 'Inter', 'PingFang SC', 'Noto Sans SC', sans-serif";
  ctx.fillText(meta.title, x + 49, y + 28);
  ctx.fillStyle = "#667268";
  ctx.font = "500 8px 'SFMono-Regular', 'Roboto Mono', 'Noto Sans SC', monospace";
  ctx.fillText(meta.subtitle, x + 49, y + 40);

  ctx.textAlign = "right";
  ctx.fillStyle = "#8a968c";
  ctx.font = "500 9px 'SFMono-Regular', 'Roboto Mono', 'Noto Sans SC', monospace";
  ctx.fillText(meta.timecode, x + width - 14, y + 30);

  ctx.drawImage(
    canvas,
    0,
    0,
    WIDTH,
    HEIGHT,
    x,
    y + headerHeight,
    width,
    imageHeight,
  );

  ctx.strokeStyle = "#26312a";
  ctx.beginPath();
  ctx.moveTo(x, y + headerHeight + imageHeight + 0.5);
  ctx.lineTo(x + width, y + headerHeight + imageHeight + 0.5);
  ctx.stroke();

  ctx.textAlign = "left";
  ctx.fillStyle = "#7b877d";
  ctx.font = "500 9px 'SFMono-Regular', 'Roboto Mono', 'Noto Sans SC', monospace";
  ctx.fillText(meta.footerLeft, x + 14, y + height - footerHeight / 2 + 1);
  ctx.textAlign = "right";
  ctx.fillStyle = meta.footerColor;
  ctx.fillText(meta.footerRight, x + width - 14, y + height - footerHeight / 2 + 1);
  ctx.restore();
}

function drawExportHeader(ctx, result, keyframe) {
  ctx.save();
  ctx.fillStyle = "#d8ff67";
  ctx.fillRect(64, 34, 2, 24);
  ctx.fillStyle = "#d8ff67";
  ctx.font = "700 13px 'SFMono-Regular', 'Roboto Mono', 'Noto Sans SC', monospace";
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText("FRAMEDIFF", 82, 51);
  ctx.fillStyle = "#68746b";
  ctx.font = "500 9px 'SFMono-Regular', 'Roboto Mono', 'Noto Sans SC', monospace";
  ctx.letterSpacing = "1px";
  ctx.fillText("PARAMETRIC MOTION LAB / SCENE TB-04", 200, 51);

  ctx.fillStyle = "#f0f3e8";
  ctx.font = "650 37px 'Inter', 'PingFang SC', 'Noto Sans SC', sans-serif";
  ctx.letterSpacing = "-1px";
  ctx.fillText("潮汐花环 / 参数差异对比", 64, 103);
  ctx.fillStyle = "#8b978d";
  ctx.font = "400 12px 'Inter', 'PingFang SC', 'Noto Sans SC', sans-serif";
  ctx.letterSpacing = "0px";
  ctx.fillText(
    `关键帧 ${pad(state.keyIndex + 1, 2)} · ${keyframe.name}   /   FRAME ${pad(keyframe.frame, 3)}   /   CANVAS 2D`,
    66,
    126,
  );

  ctx.textAlign = "right";
  ctx.fillStyle = "#647067";
  ctx.font = "500 9px 'SFMono-Regular', 'Roboto Mono', monospace";
  ctx.fillText("EXPORT / CURRENT FRAME COMPARISON", 2336, 49);
  ctx.fillStyle = "#d8ff67";
  ctx.font = "500 11px 'SFMono-Regular', 'Roboto Mono', 'Noto Sans SC', monospace";
  ctx.fillText(`${result.percent.toFixed(1)}% CHANGED PIXELS`, 2336, 78);
  ctx.fillStyle = "#7d897f";
  ctx.font = "500 9px 'SFMono-Regular', 'Roboto Mono', 'Noto Sans SC', monospace";
  ctx.fillText(
    `MAX Δ  X ${pad(result.maxX, 3)} / Y ${pad(result.maxY, 3)}`,
    2336,
    99,
  );
  ctx.restore();
}

function drawExportStats(ctx, result, width) {
  const x = 64;
  const y = 744;
  const statWidth = width / 3;

  ctx.save();
  ctx.strokeStyle = "#28332b";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y - 16.5);
  ctx.lineTo(x + width, y - 16.5);
  ctx.stroke();

  ctx.textAlign = "left";
  ctx.fillStyle = "#68746b";
  ctx.font = "500 8px 'SFMono-Regular', 'Roboto Mono', 'Noto Sans SC', monospace";
  ctx.fillText("01 / 变化像素比例", x, y + 10);
  ctx.fillStyle = "#f0f3e8";
  ctx.font = "430 32px 'SFMono-Regular', 'Roboto Mono', 'Noto Sans SC', monospace";
  ctx.fillText(`${result.percent.toFixed(1)}%`, x, y + 50);
  ctx.fillStyle = "#89958b";
  ctx.font = "400 10px 'SFMono-Regular', 'Roboto Mono', 'Noto Sans SC', monospace";
  ctx.fillText(
    `${formatNumber(result.changed)} / ${formatNumber(result.total)} pixels · threshold Δ > 10`,
    x,
    y + 68,
  );

  const meterX = x;
  const meterY = y + 86;
  const meterWidth = statWidth - 52;
  ctx.fillStyle = "#222c24";
  roundedRectPath(ctx, meterX, meterY, meterWidth, 4, 2);
  ctx.fill();
  ctx.fillStyle = "#d8ff67";
  roundedRectPath(ctx, meterX, meterY, Math.max(4, (meterWidth * result.percent) / 100), 4, 2);
  ctx.fill();

  const secondX = x + statWidth + 24;
  ctx.fillStyle = "#68746b";
  ctx.font = "500 8px 'SFMono-Regular', 'Roboto Mono', 'Noto Sans SC', monospace";
  ctx.fillText("02 / 最大差异坐标", secondX, y + 10);
  ctx.fillStyle = "#ffb09f";
  ctx.font = "430 28px 'SFMono-Regular', 'Roboto Mono', 'Noto Sans SC', monospace";
  ctx.fillText(`X ${pad(result.maxX, 3)}`, secondX, y + 48);
  ctx.fillText(`Y ${pad(result.maxY, 3)}`, secondX + 160, y + 48);
  ctx.fillStyle = "#89958b";
  ctx.font = "400 10px 'SFMono-Regular', 'Roboto Mono', 'Noto Sans SC', monospace";
  ctx.fillText(`峰值通道差 ${result.maxDiff} / 255 · IMAGE SPACE`, secondX, y + 68);

  const thirdX = x + statWidth * 2 + 48;
  ctx.fillStyle = "#68746b";
  ctx.font = "500 8px 'SFMono-Regular', 'Roboto Mono', 'Noto Sans SC', monospace";
  ctx.fillText("03 / 实际参数变更", thirdX, y + 10);
  ctx.fillStyle = "#f0f3e8";
  ctx.font = "500 18px 'SFMono-Regular', 'Roboto Mono', 'Noto Sans SC', monospace";
  ctx.fillText("orbitRadius", thirdX, y + 44);
  ctx.fillStyle = "#748078";
  ctx.font = "500 13px 'SFMono-Regular', 'Roboto Mono', 'Noto Sans SC', monospace";
  ctx.fillText(`${BASE_RADIUS}`, thirdX + 145, y + 44);
  ctx.fillStyle = "#6e786f";
  ctx.fillText("→", thirdX + 177, y + 44);
  ctx.fillStyle = "#ff7961";
  ctx.fillText(`${state.radiusB}`, thirdX + 199, y + 44);
  ctx.fillStyle = "#89958b";
  ctx.font = "400 10px 'SFMono-Regular', 'Roboto Mono', 'Noto Sans SC', monospace";
  ctx.fillText(
    `${state.radiusB - BASE_RADIUS >= 0 ? "+" : ""}${state.radiusB - BASE_RADIUS} px · PARAM SET B ONLY`,
    thirdX,
    y + 68,
  );

  const gradientX = 64;
  const gradientY = 938;
  const gradientWidth = 198;
  const gradient = ctx.createLinearGradient(gradientX, 0, gradientX + gradientWidth, 0);
  gradient.addColorStop(0, "#122a25");
  gradient.addColorStop(0.22, "#1d7066");
  gradient.addColorStop(0.52, "#59c29d");
  gradient.addColorStop(0.72, "#deb86a");
  gradient.addColorStop(0.9, "#ff674f");
  gradient.addColorStop(1, "#fff4ce");
  ctx.fillStyle = gradient;
  roundedRectPath(ctx, gradientX, gradientY, gradientWidth, 5, 3);
  ctx.fill();
  ctx.fillStyle = "#647067";
  ctx.font = "500 8px 'SFMono-Regular', 'Roboto Mono', 'Noto Sans SC', monospace";
  ctx.fillText("LOW", gradientX, gradientY + 20);
  ctx.textAlign = "right";
  ctx.fillText("HIGH", gradientX + gradientWidth, gradientY + 20);

  ctx.textAlign = "right";
  ctx.fillStyle = "#4f5c53";
  ctx.font = "500 8px 'SFMono-Regular', 'Roboto Mono', 'Noto Sans SC', monospace";
  const stamp = new Date().toLocaleString("zh-CN", { hour12: false });
  ctx.fillText(`CANVAS 2D · 760 × 475 · ${stamp}`, 2336, gradientY + 5);
  ctx.restore();
}

function exportComparison() {
  if (!state.lastResult) {
    return;
  }
  stopPlayback();

  const result = state.lastResult;
  const keyframe = KEYFRAMES[state.keyIndex];
  const exportCanvas = document.createElement("canvas");
  exportCanvas.width = 2400;
  exportCanvas.height = 1000;
  const exportCtx = exportCanvas.getContext("2d");

  exportCtx.fillStyle = "#080b09";
  exportCtx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);

  const glow = exportCtx.createRadialGradient(2050, 0, 0, 2050, 0, 680);
  glow.addColorStop(0, "rgba(102, 130, 79, 0.09)");
  glow.addColorStop(1, "rgba(8, 11, 9, 0)");
  exportCtx.fillStyle = glow;
  exportCtx.fillRect(0, 0, exportCanvas.width, 420);

  drawExportHeader(exportCtx, result, keyframe);

  const panelTop = 158;
  const panelWidth = 742;
  const imageHeight = (panelWidth * HEIGHT) / WIDTH;
  const panelHeight = 48 + imageHeight + 36;
  const panels = [
    {
      canvas: dom.canvasA,
      meta: {
        letter: "A",
        title: "原始帧",
        subtitle: "ORIGINAL / PARAM SET A",
        timecode: `F.${pad(keyframe.frame, 3)}`,
        footerLeft: `R = ${BASE_RADIUS} px`,
        footerRight: "BASE / A",
        color: "#65d9bf",
        footerColor: "#8cafa3",
        border: "#26312a",
      },
    },
    {
      canvas: dom.canvasB,
      meta: {
        letter: "B",
        title: "变体帧",
        subtitle: "VARIANT / PARAM SET B",
        timecode: `F.${pad(keyframe.frame, 3)}`,
        footerLeft: `R = ${state.radiusB} px`,
        footerRight: "VARIANT / B",
        color: "#ff7961",
        footerColor: "#ba8d82",
        border: "#3a2e27",
      },
    },
    {
      canvas: dom.canvasDiff,
      meta: {
        letter: "Δ",
        title: "差分热图",
        subtitle: "PIXEL DELTA / THRESHOLD 10",
        timecode: `MAX Δ ${result.maxDiff}`,
        footerLeft: "LOW → HIGH",
        footerRight: `X ${pad(result.maxX, 3)} / Y ${pad(result.maxY, 3)}`,
        color: "#f5b65d",
        footerColor: "#d0a66b",
        border: "#44372b",
      },
    },
  ];

  panels.forEach((panel, index) => {
    const x = 64 + index * (panelWidth + 22);
    drawExportPanel(
      exportCtx,
      panel.canvas,
      x,
      panelTop,
      panelWidth,
      panelHeight,
      panel.meta,
    );
  });

  drawExportStats(exportCtx, result, 2272);

  const filename = `tidal-bloom_f${pad(keyframe.frame, 3)}_r${state.radiusB}.png`;
  exportCanvas.toBlob((blob) => {
    if (!blob) {
      showToast("导出失败，请重试");
      return;
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast(`已导出 ${filename}`);
  }, "image/png");
}

function init() {
  buildKeyframeRail();
  bindControls();
  renderComparison();
}

init();
