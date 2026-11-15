export const SOURCE_WIDTH = 1280;
export const SOURCE_HEIGHT = 720;
export const DURATION = 20;
export const FPS = 30;
export const BPM = 120;

export const RATIOS = {
  "16:9": {
    id: "16:9",
    label: "Landscape",
    short: "16:9",
    width: 960,
    height: 540,
    display: "1280 × 720",
  },
  "1:1": {
    id: "1:1",
    label: "Square",
    short: "1:1",
    width: 720,
    height: 720,
    display: "900 × 900",
  },
  "9:16": {
    id: "9:16",
    label: "Portrait",
    short: "9:16",
    width: 540,
    height: 960,
    display: "608 × 1080",
  },
};

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const lerp = (a, b, amount) => a + (b - a) * amount;

export function getSubjectState(time) {
  const beat = Math.max(0, (time * BPM) / 60) % 1;
  const pulse = Math.exp(-beat * 7);
  const x =
    SOURCE_WIDTH * 0.515 +
    Math.sin(time * 0.6) * 113 +
    Math.sin(time * 1.37 + 0.6) * 37;
  const y =
    SOURCE_HEIGHT * 0.48 +
    Math.sin(time * 0.82 + 1.1) * 38 +
    Math.cos(time * 1.61) * 9;
  return {
    x,
    y,
    pulse,
    radius: 95 + pulse * 8,
    angle: time * 0.56,
  };
}

export function getCrop(ratio, time, options = {}) {
  const { smart = true, tracking = true } = options;
  if (ratio === "16:9") {
    return { x: 0, y: 0, w: SOURCE_WIDTH, h: SOURCE_HEIGHT };
  }
  const subject = getSubjectState(time);
  const width = ratio === "1:1" ? SOURCE_HEIGHT : (SOURCE_HEIGHT * 9) / 16;
  let center = SOURCE_WIDTH / 2;
  if (smart && tracking) {
    center = subject.x + Math.sin(time * 0.6 + 0.4) * 12;
  } else if (smart) {
    center = lerp(SOURCE_WIDTH / 2, subject.x, 0.5);
  }
  const x = clamp(center - width / 2, 0, SOURCE_WIDTH - width);
  return { x, y: 0, w: width, h: SOURCE_HEIGHT };
}

export function getSafeRect(crop, amount = 0.9) {
  const insetX = (crop.w * (1 - amount)) / 2;
  const insetY = (crop.h * (1 - amount)) / 2;
  return {
    x: crop.x + insetX,
    y: crop.y + insetY,
    w: crop.w * amount,
    h: crop.h * amount,
  };
}

export function isSubjectSafe(crop, time) {
  const subject = getSubjectState(time);
  const safe = getSafeRect(crop, 0.9);
  const radius = subject.radius + 12;
  return (
    subject.x - radius >= safe.x &&
    subject.x + radius <= safe.x + safe.w &&
    subject.y - radius >= safe.y &&
    subject.y + radius <= safe.y + safe.h
  );
}

export function getCaptionForTime(time) {
  if (time < 4) return { index: "01", text: "MAKE ROOM FOR THE BEAT" };
  if (time < 8) return { index: "02", text: "ONE TAKE. THREE FRAMES." };
  if (time < 12) return { index: "03", text: "KEEP THE GROOVE IN FRAME" };
  if (time < 16) return { index: "04", text: "CUT WITH THE RHYTHM" };
  return { index: "05", text: "OFFBEAT · TWENTY SECONDS" };
}

function roundedRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function drawBackdrop(ctx, time, subject) {
  const background = ctx.createLinearGradient(0, 0, SOURCE_WIDTH, SOURCE_HEIGHT);
  background.addColorStop(0, "#171b13");
  background.addColorStop(0.48, "#0e120d");
  background.addColorStop(1, "#080a08");
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, SOURCE_WIDTH, SOURCE_HEIGHT);

  const glow = ctx.createRadialGradient(
    subject.x,
    subject.y,
    10,
    subject.x,
    subject.y,
    390,
  );
  glow.addColorStop(0, `rgba(217, 255, 83, ${0.16 + subject.pulse * 0.06})`);
  glow.addColorStop(0.36, "rgba(138, 174, 49, 0.065)");
  glow.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, SOURCE_WIDTH, SOURCE_HEIGHT);

  ctx.save();
  ctx.translate(100 + Math.sin(time * 0.21) * 24, 580);
  ctx.rotate(-0.22);
  ctx.fillStyle = "rgba(255, 117, 86, 0.09)";
  ctx.fillRect(-80, 0, 455, 210);
  ctx.restore();

  ctx.save();
  ctx.translate(1050, 105);
  ctx.rotate(0.18 + time * 0.006);
  ctx.strokeStyle = "rgba(157, 170, 255, 0.18)";
  ctx.lineWidth = 1;
  for (let ring = 30; ring < 190; ring += 20) {
    ctx.beginPath();
    ctx.arc(0, 0, ring, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();

  ctx.fillStyle = "rgba(230, 238, 211, 0.06)";
  const drift = (time * 8) % 42;
  for (let y = 20; y < SOURCE_HEIGHT; y += 42) {
    for (let x = -20; x < SOURCE_WIDTH; x += 42) {
      ctx.beginPath();
      ctx.arc(x + drift, y + drift * 0.4, 0.8, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.strokeStyle = "rgba(240, 244, 224, 0.08)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(42, 95);
  ctx.lineTo(42, 645);
  ctx.moveTo(42, 645);
  ctx.lineTo(1238, 645);
  ctx.stroke();

  for (let i = 0; i <= 30; i += 1) {
    const x = 64 + i * 38.8;
    const height = i % 5 === 0 ? 9 : 4;
    ctx.globalAlpha = i / 30 < time / DURATION ? 0.42 : 0.13;
    ctx.fillStyle = i / 30 < time / DURATION ? "#d9ff53" : "#f3f1e6";
    ctx.fillRect(x, 636, 1, height);
  }
  ctx.globalAlpha = 1;
}

function drawType(ctx, time) {
  ctx.save();
  ctx.fillStyle = "#d9ff53";
  ctx.fillRect(62, 50, 9, 9);
  ctx.fillStyle = "#eef1e3";
  ctx.font = "800 16px 'Arial Black', sans-serif";
  ctx.letterSpacing = "2px";
  ctx.fillText("OFFBEAT", 82, 59);
  ctx.font = "700 8px 'Arial', sans-serif";
  ctx.fillStyle = "rgba(238, 241, 227, 0.5)";
  ctx.fillText("KINETIC STUDY / 2026", 82, 75);

  ctx.textAlign = "right";
  ctx.fillStyle = "rgba(238, 241, 227, 0.54)";
  ctx.font = "700 8px 'Arial', sans-serif";
  ctx.fillText("A TWENTY-SECOND LOOP", 1216, 107);
  ctx.fillStyle = "#ff7556";
  ctx.fillText(`BPM 120  /  BAR ${String(Math.floor(time * 2) + 1).padStart(2, "0")}`, 1216, 123);

  ctx.textAlign = "left";
  ctx.font = "900 134px 'Arial Black', sans-serif";
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "rgba(243, 241, 230, 0.105)";
  ctx.strokeText("MAKE", 58, 252);
  ctx.strokeText("ROOM", 58, 366);

  ctx.font = "900 235px 'Arial Black', sans-serif";
  ctx.fillStyle = "rgba(243, 241, 230, 0.025)";
  ctx.fillText("20", 1025, 535);

  ctx.save();
  ctx.translate(1228, 325);
  ctx.rotate(Math.PI / 2);
  ctx.font = "700 8px 'Arial', sans-serif";
  ctx.fillStyle = "rgba(243, 241, 230, 0.36)";
  ctx.fillText("SUBJECT SAFE / AUTO REFRAME", 0, 0);
  ctx.restore();

  ctx.font = "700 8px 'Arial', sans-serif";
  ctx.fillStyle = "rgba(243, 241, 230, 0.34)";
  ctx.fillText("SOURCE 1280 × 720", 62, 623);
  ctx.textAlign = "right";
  ctx.fillText("30 FPS / GENERATIVE", 1218, 623);
  ctx.restore();
}

function drawSubject(ctx, time, subject) {
  const { x, y, pulse, radius, angle } = subject;
  ctx.save();
  ctx.translate(x, y);

  ctx.strokeStyle = "rgba(217, 255, 83, 0.18)";
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 7]);
  ctx.beginPath();
  ctx.ellipse(0, 0, 163, 135, -0.25 + Math.sin(time * 0.35) * 0.08, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.globalAlpha = 0.16 + pulse * 0.12;
  ctx.strokeStyle = "#d9ff53";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, radius + 28 + pulse * 20, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;

  ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
  ctx.shadowBlur = 35;
  ctx.shadowOffsetY = 17;
  ctx.fillStyle = "#d9ff53";
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  ctx.save();
  ctx.rotate(angle);
  ctx.strokeStyle = "rgba(13, 18, 8, 0.5)";
  ctx.lineWidth = 1;
  for (let tick = 0; tick < 48; tick += 1) {
    const tickAngle = (tick / 48) * Math.PI * 2;
    const inner = tick % 4 === 0 ? radius - 13 : radius - 8;
    ctx.beginPath();
    ctx.moveTo(Math.cos(tickAngle) * inner, Math.sin(tickAngle) * inner);
    ctx.lineTo(Math.cos(tickAngle) * (radius - 2), Math.sin(tickAngle) * (radius - 2));
    ctx.stroke();
  }
  ctx.restore();

  ctx.fillStyle = "#11150d";
  ctx.beginPath();
  ctx.arc(0, 0, radius - 17, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(238, 242, 225, 0.13)";
  ctx.lineWidth = 1;
  for (let ring = 22; ring < radius - 22; ring += 7) {
    ctx.beginPath();
    ctx.arc(0, 0, ring, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.save();
  ctx.rotate(-angle * 0.55);
  const label = ctx.createLinearGradient(-50, -50, 50, 50);
  label.addColorStop(0, "#ff8b6f");
  label.addColorStop(1, "#ff6345");
  ctx.fillStyle = label;
  ctx.beginPath();
  ctx.arc(0, 0, 40, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#2a180f";
  ctx.textAlign = "center";
  ctx.font = "900 23px 'Arial Black', sans-serif";
  ctx.fillText("20", 0, 3);
  ctx.font = "800 6px 'Arial', sans-serif";
  ctx.letterSpacing = "1px";
  ctx.fillText("OFFBEAT", 0, 17);
  ctx.restore();

  ctx.fillStyle = "rgba(255, 255, 255, 0.24)";
  ctx.beginPath();
  ctx.ellipse(-37, -45, 24, 11, -0.55, 0, Math.PI * 2);
  ctx.fill();

  const orbitAngle = angle * 1.35 + 0.7;
  const orbitX = Math.cos(orbitAngle) * 157;
  const orbitY = Math.sin(orbitAngle) * 128;
  ctx.fillStyle = "#ff7556";
  ctx.beginPath();
  ctx.arc(orbitX, orbitY, 6 + pulse * 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 117, 86, 0.45)";
  ctx.beginPath();
  ctx.arc(orbitX, orbitY, 12, 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();
}

function wrapCaption(ctx, text, maxWidth) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(candidate).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export function getCaptionLayout(ctx, time, crop) {
  const caption = getCaptionForTime(time);
  const padding = Math.max(14, crop.w * 0.022);
  const fontSize = clamp(crop.w * 0.025, 13, 21);
  const lineHeight = fontSize * 1.25;
  const maxTextWidth = crop.w - padding * 2 - 42;

  ctx.save();
  ctx.font = `800 ${fontSize}px 'Arial', sans-serif`;
  ctx.letterSpacing = "0.2px";
  const lines = wrapCaption(ctx, caption.text, maxTextWidth);
  const textWidth = Math.max(...lines.map((line) => ctx.measureText(line).width));
  const boxWidth = Math.min(crop.w - padding * 2, Math.max(150, textWidth + 44));
  const boxHeight = lines.length * lineHeight + 18;
  const boxX = clamp(crop.x + padding, crop.x + padding, crop.x + crop.w - padding - boxWidth);
  const boxY = crop.y + crop.h - padding - boxHeight;
  ctx.restore();
  return {
    caption,
    padding,
    fontSize,
    lineHeight,
    lines,
    textWidth,
    boxWidth,
    boxHeight,
    boxX,
    boxY,
  };
}

function drawCaption(ctx, time, crop) {
  const layout = getCaptionLayout(ctx, time, crop);
  const {
    caption,
    fontSize,
    lineHeight,
    lines,
    textWidth,
    boxWidth,
    boxHeight,
    boxX,
    boxY,
  } = layout;
  const padding = layout.padding;

  roundedRect(ctx, boxX, boxY, boxWidth, boxHeight, 4);
  ctx.fillStyle = "rgba(9, 12, 8, 0.76)";
  ctx.fill();
  ctx.strokeStyle = "rgba(217, 255, 83, 0.24)";
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = "#d9ff53";
  ctx.fillRect(boxX, boxY + 8, 2, boxHeight - 16);
  ctx.font = `800 ${Math.max(7, fontSize * 0.48)}px 'Arial', sans-serif`;
  ctx.fillText(caption.index, boxX + 11, boxY + 16);

  ctx.fillStyle = "#f5f4e9";
  ctx.font = `800 ${fontSize}px 'Arial', sans-serif`;
  lines.forEach((line, index) => {
    ctx.fillText(line, boxX + 31, boxY + 24 + index * lineHeight - fontSize * 0.18);
  });

  const captionRight = boxX + 31 + textWidth;
  if (captionRight > crop.x + crop.w - padding) {
    ctx.fillStyle = "rgba(255, 117, 86, 0.9)";
    ctx.fillRect(crop.x + crop.w - padding - 2, boxY + 8, 2, boxHeight - 16);
  }
}

export function drawSourceScene(ctx, time, crop, options = {}) {
  const { subtitles = true } = options;
  const subject = getSubjectState(time);
  ctx.save();
  ctx.clearRect(0, 0, SOURCE_WIDTH, SOURCE_HEIGHT);
  drawBackdrop(ctx, time, subject);
  drawType(ctx, time);

  const kickPhase = ((time * BPM) / 60) % 1;
  if (kickPhase < 0.32) {
    ctx.save();
    ctx.globalAlpha = (1 - kickPhase / 0.32) * 0.12;
    ctx.strokeStyle = "#d9ff53";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(subject.x, subject.y, 124 + kickPhase * 300, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  drawSubject(ctx, time, subject);
  if (subtitles) drawCaption(ctx, time, crop);
  ctx.restore();
}

export function drawCropOverlay(ctx, crop, options = {}) {
  const { safeGuides = true } = options;
  ctx.save();

  if (crop.x > 0 || crop.w < SOURCE_WIDTH) {
    ctx.beginPath();
    ctx.rect(0, 0, SOURCE_WIDTH, SOURCE_HEIGHT);
    ctx.rect(crop.x, crop.y, crop.w, crop.h);
    ctx.fillStyle = "rgba(4, 6, 3, 0.5)";
    ctx.fill("evenodd");
  }

  ctx.strokeStyle = "rgba(217, 255, 83, 0.95)";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(crop.x + 0.75, crop.y + 0.75, crop.w - 1.5, crop.h - 1.5);

  if (safeGuides) {
    const safe = getSafeRect(crop, 0.9);
    ctx.setLineDash([4, 7]);
    ctx.strokeStyle = "rgba(243, 241, 230, 0.35)";
    ctx.lineWidth = 1;
    ctx.strokeRect(safe.x, safe.y, safe.w, safe.h);
    ctx.setLineDash([]);

    ctx.strokeStyle = "rgba(243, 241, 230, 0.1)";
    for (let index = 1; index < 3; index += 1) {
      const x = crop.x + (crop.w * index) / 3;
      const y = crop.y + (crop.h * index) / 3;
      ctx.beginPath();
      ctx.moveTo(x, crop.y);
      ctx.lineTo(x, crop.y + crop.h);
      ctx.moveTo(crop.x, y);
      ctx.lineTo(crop.x + crop.w, y);
      ctx.stroke();
    }
  }

  const corner = Math.min(24, crop.w * 0.12);
  ctx.strokeStyle = "#d9ff53";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(crop.x, crop.y + corner);
  ctx.lineTo(crop.x, crop.y);
  ctx.lineTo(crop.x + corner, crop.y);
  ctx.moveTo(crop.x + crop.w - corner, crop.y);
  ctx.lineTo(crop.x + crop.w, crop.y);
  ctx.lineTo(crop.x + crop.w, crop.y + corner);
  ctx.moveTo(crop.x, crop.y + crop.h - corner);
  ctx.lineTo(crop.x, crop.y + crop.h);
  ctx.lineTo(crop.x + corner, crop.y + crop.h);
  ctx.moveTo(crop.x + crop.w - corner, crop.y + crop.h);
  ctx.lineTo(crop.x + crop.w, crop.y + crop.h);
  ctx.lineTo(crop.x + crop.w, crop.y + crop.h - corner);
  ctx.stroke();

  ctx.restore();
}

let frameBuffer;
let frameContext;

export function drawCroppedFrame(ctx, time, crop, options = {}) {
  if (!frameBuffer) {
    frameBuffer = document.createElement("canvas");
    frameBuffer.width = SOURCE_WIDTH;
    frameBuffer.height = SOURCE_HEIGHT;
    frameContext = frameBuffer.getContext("2d", { alpha: false });
  }
  drawSourceScene(frameContext, time, crop, options);
  ctx.save();
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(
    frameBuffer,
    crop.x,
    crop.y,
    crop.w,
    crop.h,
    0,
    0,
    ctx.canvas.width,
    ctx.canvas.height,
  );
  ctx.restore();
}

export function formatTimecode(time, withFrames = true) {
  const safeTime = clamp(time, 0, DURATION);
  const minutes = Math.floor(safeTime / 60);
  const seconds = Math.floor(safeTime % 60);
  const frames = Math.floor((safeTime % 1) * FPS);
  const head = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  return withFrames ? `${head}:${String(frames).padStart(2, "0")}` : head;
}

export function formatClipTime(time) {
  const safeTime = clamp(time, 0, DURATION);
  const minutes = Math.floor(safeTime / 60);
  const seconds = safeTime % 60;
  return `${String(minutes).padStart(2, "0")}:${seconds.toFixed(2).padStart(5, "0")}`;
}
