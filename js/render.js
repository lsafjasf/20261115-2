// Canvas 渲染：视频场景 + 安全区 + 字幕框（超限标红）+ PNG 检查图

export const CANVAS_W = 1280;
export const CANVAS_H = 720;
export const SAFE_X = CANVAS_W * 0.05;   // 动作安全区
export const SAFE_Y = CANVAS_H * 0.05;
export const TITLE_SAFE_X = CANVAS_W * 0.1; // 字幕安全区
export const TITLE_SAFE_Y = CANVAS_H * 0.1;

const SCENE_PALETTES = [
  ['#1e3c72', '#2a5298'], ['#134e5e', '#71b280'], ['#355c7d', '#6c5b7b'],
  ['#232526', '#414345'], ['#0f2027', '#2c5364'], ['#42275a', '#734b6d'],
  ['#1d4350', '#a43931'], ['#0b486b', '#f56217'], ['#283048', '#859398'],
  ['#141e30', '#243b55']
];

export function drawScene(ctx, cueId, time) {
  const palette = cueId > 0
    ? SCENE_PALETTES[(cueId - 1) % SCENE_PALETTES.length]
    : ['#10141a', '#1b2230'];
  const [c1, c2] = palette;
  const grad = ctx.createLinearGradient(0, 0, CANVAS_W, CANVAS_H);
  grad.addColorStop(0, c1);
  grad.addColorStop(1, c2);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // 动态几何元素，营造“视频画面”感
  const t = time * 0.001;
  for (let i = 0; i < 5; i++) {
    const seed = cueId * 13 + i * 7;
    const x = CANVAS_W * (0.15 + 0.18 * i) + Math.sin(t * 0.6 + seed) * 60;
    const y = CANVAS_H * 0.3 + Math.cos(t * 0.5 + seed) * 90;
    const r = 40 + (seed % 5) * 18;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,255,255,${0.05 + (i % 3) * 0.03})`;
    ctx.fill();
  }
  // 顶部场景标题条
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(0, 0, CANVAS_W, 56);
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = '600 26px "PingFang SC","Microsoft YaHei",sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(cueId > 0 ? `合成字幕场景 · Cue ${String(cueId).padStart(2, '0')}`
    : '合成字幕场景 · 空闲', 28, 28);
}

export function drawSafeArea(ctx, visible) {
  if (!visible) return;
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 2;
  ctx.setLineDash([12, 10]);
  ctx.strokeRect(SAFE_X, SAFE_Y, CANVAS_W - SAFE_X * 2, CANVAS_H - SAFE_Y * 2);
  ctx.strokeStyle = 'rgba(255,214,0,0.75)';
  ctx.setLineDash([6, 8]);
  ctx.strokeRect(TITLE_SAFE_X, TITLE_SAFE_Y,
    CANVAS_W - TITLE_SAFE_X * 2, CANVAS_H - TITLE_SAFE_Y * 2);
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(255,214,0,0.9)';
  ctx.font = '18px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('字幕安全区', TITLE_SAFE_X + 8, TITLE_SAFE_Y + 8);
  ctx.restore();
}

// 绘制单条字幕，返回整体是否超安全区
export function drawSubtitle(ctx, layout, opts) {
  const fontSize = opts.fontSize;
  const lineHeight = fontSize * 1.45;
  const paddingX = fontSize * 0.7;
  const paddingY = fontSize * 0.35;
  ctx.font = `500 ${fontSize}px "PingFang SC","Microsoft YaHei","Noto Sans CJK SC",sans-serif`;
  ctx.textBaseline = 'alphabetic';

  const boxW = Math.max(...layout.lines.map((l) => l.width)) + paddingX * 2;
  const boxH = layout.lines.length * lineHeight + paddingY * 2;
  const boxX = (CANVAS_W - boxW) / 2;
  const boxBottom = CANVAS_H - TITLE_SAFE_Y;
  const boxY = boxBottom - boxH;

  // 是否突破字幕安全区
  const outOfSafe = boxX < TITLE_SAFE_X ||
    boxX + boxW > CANVAS_W - TITLE_SAFE_X ||
    boxY < TITLE_SAFE_Y;
  const danger = layout.overflow || outOfSafe;

  ctx.save();
  ctx.fillStyle = danger ? 'rgba(176,0,32,0.55)' : 'rgba(0,0,0,0.55)';
  ctx.strokeStyle = danger ? 'rgba(255,80,90,0.95)' : 'rgba(255,255,255,0.18)';
  ctx.lineWidth = danger ? 3 : 1.5;
  roundRect(ctx, boxX, boxY, boxW, boxH, 10);
  ctx.fill();
  ctx.stroke();

  layout.lines.forEach((line, li) => {
    const baselineY = boxY + paddingY + lineHeight * li + fontSize * 0.95;
    let x = (CANVAS_W - line.width) / 2;
    ctx.textAlign = 'left';
    for (const tok of line.tokens) {
      const tokDanger = layout.violations.has(tok) ||
        (outOfSafe && !layout.overflow);
      ctx.fillStyle = tokDanger ? '#ff5a6a' : '#ffffff';
      ctx.fillText(tok.text, x, baselineY);
      x += ctx.measureText(tok.text).width;
    }
  });
  ctx.restore();
  return { danger, outOfSafe, box: { x: boxX, y: boxY, w: boxW, h: boxH } };
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function drawBeatIndicator(ctx, beatOn) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(CANVAS_W - 36, 32, 10, 0, Math.PI * 2);
  ctx.fillStyle = beatOn ? '#ffd34d' : 'rgba(255,255,255,0.25)';
  ctx.fill();
  ctx.restore();
}

// 单帧完整绘制
export function renderFrame(ctx, cue, layout, opts, time, beatOn) {
  drawScene(ctx, cue.id, time);
  drawSafeArea(ctx, opts.showSafe);
  const info = drawSubtitle(ctx, layout, opts);
  drawBeatIndicator(ctx, beatOn);
  return info;
}

// 十宫格 PNG 检查图
export function buildContactSheet(canvas, cues, layouts, opts) {
  const cols = 2;
  const rows = Math.ceil(cues.length / cols);
  const cellW = CANVAS_W / 2;
  const cellH = CANVAS_H / 2;
  const labelH = 34;
  const sheet = document.createElement('canvas');
  sheet.width = cols * cellW;
  sheet.height = rows * (cellH + labelH);
  const sctx = sheet.getContext('2d');
  sctx.fillStyle = '#111418';
  sctx.fillRect(0, 0, sheet.width, sheet.height);

  const cell = document.createElement('canvas');
  cell.width = CANVAS_W;
  cell.height = CANVAS_H;
  const cctx = cell.getContext('2d');

  cues.forEach((cue, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const ox = col * cellW;
    const oy = row * (cellH + labelH);
    const info = renderFrame(cctx, cue, layouts[i], opts, cue.start * 1000, false);
    sctx.drawImage(cell, 0, 0, CANVAS_W, CANVAS_H, ox, oy + labelH, cellW, cellH);
    sctx.fillStyle = info.danger ? 'rgba(176,0,32,0.9)' : 'rgba(30,34,40,0.95)';
    sctx.fillRect(ox, oy, cellW, labelH);
    sctx.fillStyle = '#fff';
    sctx.font = '600 16px "PingFang SC","Microsoft YaHei",sans-serif';
    sctx.textBaseline = 'middle';
    sctx.textAlign = 'left';
    const tag = info.danger
      ? `Cue ${cue.id} · 超出安全区/行宽`
      : `Cue ${cue.id} · OK`;
    sctx.fillText(tag, ox + 12, oy + labelH / 2);
  });
  return sheet;
}
