// 确定性帧渲染：同一 (cues, time) 输入永远得到同一画面，
// 预览与“导出当前帧”共用本模块，保证所见即所得。

import { TEMPLATES, entranceState, entranceTransform } from './core.js';

export const FRAME_WIDTH = 1280;
export const FRAME_HEIGHT = 720;

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

function drawProgramBackground(ctx, width, height, time) {
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, '#101c33');
  gradient.addColorStop(1, '#1f3a5f');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  ctx.globalAlpha = 0.12;
  ctx.fillStyle = '#9fc5ff';
  for (let i = 0; i < 5; i += 1) {
    const barWidth = 90 + i * 36;
    const x = 120 + i * 220;
    ctx.fillRect(x, height - 140 - barWidth, 56, barWidth);
  }
  ctx.globalAlpha = 1;

  // 时间码烧录在画面角落，便于核对动画与时间轴同步。
  const total = Math.floor(time);
  const frame = Math.floor((time - total) * 30);
  const tc = `00:00:${String(total).padStart(2, '0')}:${String(frame).padStart(2, '0')}`;
  ctx.font = '22px monospace';
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.textAlign = 'left';
  ctx.fillText(tc, 28, 40);
}

function measureCueText(ctx, cue, displayText) {
  ctx.font = `700 ${cue.fontSize}px "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif`;
  const metrics = ctx.measureText(displayText);
  return { width: metrics.width, height: cue.fontSize * 1.25 };
}

function drawCue(ctx, cue, time, width, height) {
  const state = entranceState(cue, time);
  if (!state.visible) return;
  const transform = entranceTransform(cue, state);
  const displayText = transform.chars === null ? cue.text : cue.text.slice(0, transform.chars);
  if (!displayText) return;

  const size = measureCueText(ctx, cue, displayText);
  const template = TEMPLATES[cue.templateId];
  const padding = cue.box.padding;
  const boxWidth = size.width + padding * 2;
  const boxHeight = size.height + padding * 2;

  let x;
  let y;
  if (template.position === 'center') {
    x = (width - boxWidth) / 2;
    y = (height - boxHeight) / 2;
  } else if (cue.templateId === 'news') {
    x = 0;
    y = height - boxHeight - 40;
  } else {
    x = (width - boxWidth) / 2;
    y = height - boxHeight - 48;
  }

  ctx.save();
  ctx.globalAlpha = transform.opacity;
  const centerX = width / 2;
  const centerY = y + boxHeight / 2;
  ctx.translate(centerX, centerY + transform.translateY);
  ctx.scale(transform.scale, transform.scale);
  ctx.translate(-centerX, -centerY);

  if (cue.box.enabled) {
    ctx.fillStyle = cue.box.fill;
    roundedRect(ctx, x, y, boxWidth, boxHeight, cue.box.radius);
    ctx.fill();
    if (cue.templateId === 'news') {
      ctx.fillStyle = template.accent;
      ctx.fillRect(x, y, 10, boxHeight);
    }
  }

  ctx.font = `700 ${cue.fontSize}px "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const textX = x + boxWidth / 2;
  const textY = y + boxHeight / 2 + 2;
  if (cue.stroke.enabled && cue.stroke.width > 0) {
    ctx.lineWidth = cue.stroke.width;
    ctx.strokeStyle = cue.stroke.color;
    ctx.lineJoin = 'round';
    ctx.strokeText(displayText, textX, textY);
  }
  ctx.fillStyle = cue.textColor;
  ctx.fillText(displayText, textX, textY);
  ctx.restore();
}

export function drawFrame(ctx, cues, time, options = {}) {
  const width = options.width || FRAME_WIDTH;
  const height = options.height || FRAME_HEIGHT;
  drawProgramBackground(ctx, width, height, time);
  for (const cue of cues) {
    drawCue(ctx, cue, time, width, height);
  }
}
