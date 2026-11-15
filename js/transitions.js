import { renderScene } from "./scenes.js";

const bufferSets = new Map();

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function easeInOutCubic(value) {
  return value < 0.5
    ? 4 * value * value * value
    : 1 - Math.pow(-2 * value + 2, 3) / 2;
}

function easeInOutSine(value) {
  return -(Math.cos(Math.PI * value) - 1) / 2;
}

function createBuffer(width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function getBuffers(width, height) {
  const key = `${width}x${height}`;
  let buffers = bufferSets.get(key);
  if (!buffers) {
    buffers = {
      from: createBuffer(width, height),
      to: createBuffer(width, height),
      mask: createBuffer(width, height)
    };
    bufferSets.set(key, buffers);
  }
  return buffers;
}

function resetContext(ctx) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
}

function drawPush(ctx, width, height, progress, fromCanvas, toCanvas) {
  const eased = easeInOutCubic(progress);
  const offset = eased * width;

  resetContext(ctx);
  ctx.fillStyle = "#111";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(fromCanvas, -offset, 0, width, height);
  ctx.drawImage(toCanvas, width - offset, 0, width, height);

  const seamX = width - offset;
  const seam = ctx.createLinearGradient(seamX - width * 0.03, 0, seamX + width * 0.03, 0);
  seam.addColorStop(0, "rgba(255,246,225,0)");
  seam.addColorStop(0.5, "rgba(255,246,225,0.18)");
  seam.addColorStop(1, "rgba(255,246,225,0)");
  ctx.fillStyle = seam;
  ctx.fillRect(seamX - width * 0.03, 0, width * 0.06, height);
}

function drawDissolve(ctx, width, height, progress, fromCanvas, toCanvas) {
  const eased = easeInOutSine(progress);
  resetContext(ctx);
  ctx.drawImage(fromCanvas, 0, 0, width, height);
  ctx.globalAlpha = eased;
  ctx.drawImage(toCanvas, 0, 0, width, height);
  ctx.globalAlpha = 1;

  const glow = Math.sin(Math.PI * progress);
  if (glow > 0) {
    const wash = ctx.createRadialGradient(
      width * 0.55,
      height * 0.48,
      0,
      width * 0.55,
      height * 0.48,
      width * 0.55
    );
    wash.addColorStop(0, `rgba(255,246,229,${glow * 0.055})`);
    wash.addColorStop(1, "rgba(255,246,229,0)");
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, width, height);
  }
}

function drawMask(ctx, width, height, progress, fromCanvas, toCanvas, maskCanvas) {
  resetContext(ctx);
  ctx.drawImage(fromCanvas, 0, 0, width, height);

  const maskContext = maskCanvas.getContext("2d");
  resetContext(maskContext);
  maskContext.clearRect(0, 0, width, height);
  maskContext.drawImage(toCanvas, 0, 0, width, height);

  const centerX = width * 0.65;
  const centerY = height * 0.42;
  const maxRadius = Math.hypot(width * 0.72, height * 0.72);
  const eased = easeInOutCubic(progress);
  const radius = Math.max(0.01, eased * maxRadius);
  const mask = maskContext.createRadialGradient(
    centerX,
    centerY,
    0,
    centerX,
    centerY,
    radius
  );
  mask.addColorStop(0, "rgba(255,255,255,1)");
  mask.addColorStop(0.82, "rgba(255,255,255,1)");
  mask.addColorStop(0.94, "rgba(255,255,255,0.86)");
  mask.addColorStop(1, "rgba(255,255,255,0)");
  maskContext.globalCompositeOperation = "destination-in";
  maskContext.fillStyle = mask;
  maskContext.fillRect(0, 0, width, height);
  maskContext.globalCompositeOperation = "source-over";

  ctx.drawImage(maskCanvas, 0, 0, width, height);

  if (progress > 0.015 && progress < 0.985) {
    ctx.save();
    ctx.globalAlpha = Math.sin(Math.PI * progress) * 0.65;
    ctx.strokeStyle = "rgba(255,242,217,0.82)";
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

function drawFlash(ctx, width, height, progress, fromCanvas, toCanvas) {
  const eased = easeInOutSine(progress);
  resetContext(ctx);
  ctx.drawImage(fromCanvas, 0, 0, width, height);
  ctx.globalAlpha = eased;
  ctx.drawImage(toCanvas, 0, 0, width, height);
  ctx.globalAlpha = 1;

  const flash = Math.pow(Math.sin(Math.PI * progress), 1.35);
  if (flash > 0) {
    const burst = ctx.createRadialGradient(
      width * 0.62,
      height * 0.45,
      0,
      width * 0.62,
      height * 0.45,
      Math.hypot(width, height) * 0.64
    );
    burst.addColorStop(0, `rgba(255,255,249,${flash})`);
    burst.addColorStop(0.52, `rgba(255,244,226,${flash * 0.97})`);
    burst.addColorStop(1, `rgba(255,239,217,${flash * 0.78})`);
    ctx.fillStyle = burst;
    ctx.fillRect(0, 0, width, height);
  }
}

const TRANSITION_RENDERERS = {
  push: drawPush,
  dissolve: drawDissolve,
  mask: drawMask,
  flash: drawFlash
};

export function renderComposition(ctx, width, height, playback) {
  resetContext(ctx);
  ctx.clearRect(0, 0, width, height);

  if (playback.kind === "scene") {
    renderScene(
      ctx,
      playback.scene.scene,
      playback.localTime,
      width,
      height
    );
    return;
  }

  const buffers = getBuffers(width, height);
  const fromContext = buffers.from.getContext("2d", { alpha: false });
  const toContext = buffers.to.getContext("2d", { alpha: false });
  renderScene(
    fromContext,
    playback.fromScene.scene,
    playback.fromLocalTime,
    width,
    height
  );
  renderScene(
    toContext,
    playback.toScene.scene,
    playback.toLocalTime,
    width,
    height
  );

  const renderer = TRANSITION_RENDERERS[playback.transition.type] || drawDissolve;
  renderer(
    ctx,
    width,
    height,
    playback.progress,
    buffers.from,
    buffers.to,
    buffers.mask
  );
}

export function getTransitionProgress(playback) {
  return playback.kind === "transition" ? playback.progress : 0;
}
