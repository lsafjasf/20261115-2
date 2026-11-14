import { rgba } from "./color.js";

function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let next = value;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

function clipRect(ctx, bounds) {
  ctx.beginPath();
  if (bounds.radius) {
    ctx.roundRect(bounds.x, bounds.y, bounds.w, bounds.h, bounds.radius);
  } else {
    ctx.rect(bounds.x, bounds.y, bounds.w, bounds.h);
  }
  ctx.clip();
}

export function drawTexture(
  ctx,
  bounds,
  { color, texture, strength, seed = 7, grainScale = 1 },
) {
  if (!texture || texture === "none" || strength <= 0) {
    return;
  }

  const normalized = Math.max(0.04, Math.min(1, strength / 100));
  const random = seededRandom(seed + Math.round(bounds.x + bounds.w));
  ctx.save();
  clipRect(ctx, bounds);

  if (texture === "grain") {
    const count = Math.round((bounds.w * bounds.h) / 420);
    for (let index = 0; index < count; index += 1) {
      const x = bounds.x + random() * bounds.w;
      const y = bounds.y + random() * bounds.h;
      const size = 0.7 + random() * 2.1;
      ctx.fillStyle = rgba(color, 0.08 + normalized * 0.34);
      ctx.fillRect(x, y, size * grainScale, size * grainScale);
    }
  }

  if (texture === "dots") {
    const gap = 25;
    ctx.fillStyle = rgba(color, 0.12 + normalized * 0.35);
    for (let y = bounds.y + 10; y < bounds.y + bounds.h; y += gap) {
      for (let x = bounds.x + 10; x < bounds.x + bounds.w; x += gap) {
        const offset = Math.round(y / gap) % 2 === 0 ? 0 : gap / 2;
        ctx.beginPath();
        ctx.arc(x + offset, y, 1.2 + normalized * 2.8, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  if (texture === "grid") {
    const gap = 31;
    ctx.strokeStyle = rgba(color, 0.1 + normalized * 0.34);
    ctx.lineWidth = 1;
    for (let x = bounds.x + 8; x < bounds.x + bounds.w; x += gap) {
      ctx.beginPath();
      ctx.moveTo(x, bounds.y);
      ctx.lineTo(x, bounds.y + bounds.h);
      ctx.stroke();
    }
    for (let y = bounds.y + 8; y < bounds.y + bounds.h; y += gap) {
      ctx.beginPath();
      ctx.moveTo(bounds.x, y);
      ctx.lineTo(bounds.x + bounds.w, y);
      ctx.stroke();
    }
  }

  if (texture === "waves") {
    const gap = 20;
    ctx.strokeStyle = rgba(color, 0.11 + normalized * 0.33);
    ctx.lineWidth = 1.2;
    for (let y = bounds.y; y < bounds.y + bounds.h; y += gap) {
      ctx.beginPath();
      for (let x = bounds.x; x <= bounds.x + bounds.w; x += 8) {
        const wave = Math.sin((x - bounds.x) / 25 + y / 38) * 4;
        if (x === bounds.x) {
          ctx.moveTo(x, y + wave);
        } else {
          ctx.lineTo(x, y + wave);
        }
      }
      ctx.stroke();
    }
  }

  ctx.restore();
}
