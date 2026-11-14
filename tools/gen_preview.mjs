// 用与浏览器相同的姿态数据生成挥手动画预览 GIF（纯软件光栅化，无头验证用）
// 用法：node tools/gen_preview.mjs [输出路径]
import Pose from '../pose.js';
import { GIFEncoder, quantize, applyPalette } from '../vendor/gifenc.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const W = 480, H = 480, GROUND_Y = 408;
const PAPER = [247, 243, 232];
const INK = [43, 43, 43];
const GROUND = [150, 147, 138];
const FPS = 12;

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeBuffer() {
  const buf = new Uint8Array(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    buf[i * 4] = PAPER[0]; buf[i * 4 + 1] = PAPER[1]; buf[i * 4 + 2] = PAPER[2]; buf[i * 4 + 3] = 255;
  }
  return buf;
}

function disc(buf, cx, cy, r, color) {
  const r2 = r * r;
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const dx = x - cx, dy = y - cy;
      if (dx * dx + dy * dy > r2) continue;
      const o = (y * W + x) * 4;
      buf[o] = color[0]; buf[o + 1] = color[1]; buf[o + 2] = color[2];
    }
  }
}

function segment(buf, x1, y1, x2, y2, color, thick) {
  const len = Math.hypot(x2 - x1, y2 - y1);
  const steps = Math.max(1, Math.ceil(len * 2));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    disc(buf, x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, thick, color);
  }
}

// 与 app.js 一致的手绘抖动折线
function wobblyLine(buf, x1, y1, x2, y2, rand, color) {
  const mx = (x1 + x2) / 2 + (rand() - 0.5) * 3;
  const my = (y1 + y2) / 2 + (rand() - 0.5) * 3;
  const steps = 24;
  let px = x1, py = y1;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps, u = 1 - t;
    const x = u * u * x1 + 2 * u * t * mx + t * t * x2;
    const y = u * u * y1 + 2 * u * t * my + t * t * y2;
    segment(buf, px, py, x, y, color, 1.8);
    px = x; py = y;
  }
}

function renderFrame(pose, seed) {
  const buf = makeBuffer();
  const rand = mulberry32(seed * 7919 + 13);
  segment(buf, 30, GROUND_Y, W - 30, GROUND_Y, GROUND, 1);
  const geo = Pose.strokes(pose);
  for (const line of geo.lines) {
    for (let i = 0; i < line.length - 1; i++) {
      wobblyLine(buf, line[i].x, line[i].y, line[i + 1].x, line[i + 1].y, rand, INK);
    }
  }
  const { center, radius } = geo.head;
  const wob = (rand() - 0.5) * 2;
  const rx = radius + wob, ry = radius - wob;
  const rot = (rand() - 0.5) * 0.1;
  let px = null, py = null;
  const steps = 72;
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const ex = Math.cos(a) * rx, ey = Math.sin(a) * ry;
    const x = center.x + ex * Math.cos(rot) - ey * Math.sin(rot);
    const y = center.y + ex * Math.sin(rot) + ey * Math.cos(rot);
    if (px !== null) segment(buf, px, py, x, y, INK, 1.8);
    px = x; py = y;
  }
  return buf;
}

const frames = Pose.makeWaveFrames(12);

if (process.argv.includes('--sheet')) {
  // 12 帧平铺校验图：6 列 x 2 行，每帧缩至 240x240
  const COLS = 6, ROWS = 2, CELL = 240;
  const sheet = new Uint8Array(COLS * CELL * ROWS * CELL * 4);
  for (let i = 0; i < sheet.length; i += 4) {
    sheet[i] = PAPER[0]; sheet[i + 1] = PAPER[1]; sheet[i + 2] = PAPER[2]; sheet[i + 3] = 255;
  }
  frames.forEach((pose, i) => {
    const data = renderFrame(pose, i);
    const ox = (i % COLS) * CELL, oy = Math.floor(i / COLS) * CELL;
    for (let y = 0; y < CELL; y++) {
      for (let x = 0; x < CELL; x++) {
        const src = ((y * 2) * W + x * 2) * 4;
        const dst = ((oy + y) * COLS * CELL + ox + x) * 4;
        sheet[dst] = data[src]; sheet[dst + 1] = data[src + 1];
        sheet[dst + 2] = data[src + 2]; sheet[dst + 3] = 255;
      }
    }
  });
  const gif = GIFEncoder();
  const palette = quantize(sheet, 256);
  gif.writeFrame(applyPalette(sheet, palette), COLS * CELL, ROWS * CELL, { palette });
  gif.finish();
  const out = 'artifacts/wave_sheet.gif';
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, gif.bytes());
  console.log(`已生成 ${out}`);
} else {
  const out = process.argv[2] || 'artifacts/wave_preview.gif';
  const gif = GIFEncoder();
  for (let i = 0; i < frames.length; i++) {
    const data = renderFrame(frames[i], i);
    const palette = quantize(data, 256);
    const index = applyPalette(data, palette);
    gif.writeFrame(index, W, H, { palette, delay: Math.round(1000 / FPS), repeat: i === 0 ? 0 : undefined });
  }
  gif.finish();
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, gif.bytes());
  console.log(`已生成 ${out}（${frames.length} 帧 @ ${FPS} fps，${gif.bytes().length} 字节）`);
}
