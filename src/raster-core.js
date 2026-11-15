// Dependency-free software rasterizer. Produces a raw RGBA buffer from the
// neutral draw-command list; PNG encoding lives in raster-node.js so this
// module stays usable directly in the browser.
import { FONT_5X7 } from './font.js';

function hexToRgba(color) {
  if (color.startsWith('rgba')) {
    const m = color.match(/[\d.]+/g);
    return [Number(m[0]), Number(m[1]), Number(m[2]), Math.round(Number(m[3]) * 255)];
  }
  const hex = color.replace('#', '');
  return [
    parseInt(hex.slice(0, 2), 16),
    parseInt(hex.slice(2, 4), 16),
    parseInt(hex.slice(4, 6), 16),
    255
  ];
}

export function rasterizeToBuffer(cmds, width, height, scale = 2) {
  const W = width * scale;
  const H = height * scale;
  const buffer = new Uint8Array(W * H * 4);
  const px = (x, y, rgba) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = (y * W + x) * 4;
    const [r, g, b, a] = rgba;
    if (a === 255) {
      buffer[i] = r; buffer[i + 1] = g; buffer[i + 2] = b; buffer[i + 3] = 255;
    } else {
      const alpha = a / 255;
      buffer[i] = r * alpha + buffer[i] * (1 - alpha);
      buffer[i + 1] = g * alpha + buffer[i + 1] * (1 - alpha);
      buffer[i + 2] = b * alpha + buffer[i + 2] * (1 - alpha);
      buffer[i + 3] = Math.max(buffer[i + 3], a);
    }
  };

  const fillRect = (x, y, w, h, color) => {
    const rgba = hexToRgba(color);
    const x0 = Math.max(0, Math.round(x * scale));
    const y0 = Math.max(0, Math.round(y * scale));
    const x1 = Math.min(W, Math.round((x + w) * scale));
    const y1 = Math.min(H, Math.round((y + h) * scale));
    for (let yy = y0; yy < y1; yy += 1)
      for (let xx = x0; xx < x1; xx += 1) px(xx, yy, rgba);
  };

  const drawLine = (x1, y1, x2, y2, color, w) => {
    const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1), 1);
    const half = (w * scale) / 2;
    for (let i = 0; i <= steps; i += 1) {
      const x = x1 + ((x2 - x1) * i) / steps;
      const y = y1 + ((y2 - y1) * i) / steps;
      fillRect(x - half / scale, y - half / scale, w, w, color);
    }
  };

  const drawText = (cmd) => {
    const str = String(cmd.text).replace(/[^\x20-\x7e]/g, '?');
    const size = (parseInt(cmd.font, 10) || 12) * scale;
    const glyphScale = Math.max(1, Math.round(size / 7));
    const totalW = str.length * 6 * glyphScale;
    let cursor = cmd.rotate ? cmd.y * scale - totalW / 2 : cmd.x * scale - totalW / 2;
    const baseline = cmd.rotate ? cmd.x * scale : cmd.y * scale;
    const rgba = hexToRgba(cmd.fill);
    for (const ch of str) {
      const glyph = FONT_5X7[ch] || FONT_5X7['?'];
      glyph.forEach((bits, row) => {
        for (let col = 0; col < 5; col += 1) {
          if (!(bits & (1 << (4 - col)))) continue;
          for (let dy = 0; dy < glyphScale; dy += 1) {
            for (let dx = 0; dx < glyphScale; dx += 1) {
              const gx = cursor + col * glyphScale + dx;
              const gy = baseline - 3.5 * glyphScale + row * glyphScale + dy;
              if (cmd.rotate) px(Math.round(gy), Math.round(gx), rgba);
              else px(Math.round(gx), Math.round(gy), rgba);
            }
          }
        }
      });
      cursor += 6 * glyphScale;
    }
  };

  for (const cmd of cmds) {
    if (cmd.type === 'rect') fillRect(cmd.x, cmd.y, cmd.width, cmd.height, cmd.fill);
    else if (cmd.type === 'line') {
      if (cmd.dashed) drawDashedLine(cmd, drawLine);
      else drawLine(cmd.x1, cmd.y1, cmd.x2, cmd.y2, cmd.stroke, cmd.width ?? 1);
    } else if (cmd.type === 'text') drawText(cmd);
  }
  return { buffer, width: W, height: H };
}

function drawDashedLine(cmd, drawLine) {
  const dash = 5;
  const gap = 4;
  const len = Math.hypot(cmd.x2 - cmd.x1, cmd.y2 - cmd.y1);
  const ux = (cmd.x2 - cmd.x1) / len;
  const uy = (cmd.y2 - cmd.y1) / len;
  for (let d = 0; d < len; d += dash + gap) {
    const e = Math.min(d + dash, len);
    drawLine(
      cmd.x1 + ux * d, cmd.y1 + uy * d,
      cmd.x1 + ux * e, cmd.y1 + uy * e,
      cmd.stroke, cmd.width ?? 1
    );
  }
}
