// Canvas 渲染：玻璃杯、水位、振动波纹、温度光晕、裂纹与音名标注。

import { GLASS_COUNT, coldFreq, resonantFreq, detuneCents } from './physics.js';

export const CUP = {
  width: 92,
  gap: 34,
  topY: 90,
  height: 330,
  rimY: 96,
  baseY: 412,
};

export function layout(canvasWidth) {
  const total = GLASS_COUNT * CUP.width + (GLASS_COUNT - 1) * CUP.gap;
  const startX = (canvasWidth - total) / 2;
  return Array.from({ length: GLASS_COUNT }, (_, i) => ({
    x: startX + i * (CUP.width + CUP.gap),
    cx: startX + i * (CUP.width + CUP.gap) + CUP.width / 2,
  }));
}

// 命中测试：返回杯子 id，未命中返回 -1
export function hitTest(x, y, positions) {
  if (y < CUP.rimY - 26 || y > CUP.baseY + 10) return -1;
  for (let i = 0; i < positions.length; i++) {
    const p = positions[i];
    if (x >= p.x - 8 && x <= p.x + CUP.width + 8) return i;
  }
  return -1;
}

function tempColor(t) {
  // 20°C 冷蓝 -> 70°C 暖红
  const k = Math.max(0, Math.min(1, (t - 20) / 50));
  const r = Math.round(90 + 165 * k);
  const g = Math.round(170 - 90 * k);
  const b = Math.round(230 - 170 * k);
  return `rgba(${r},${g},${b},`;
}

export function render(ctx, glasses, positions, hoverId, time) {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  ctx.clearRect(0, 0, w, h);

  // 桌面
  const table = ctx.createLinearGradient(0, CUP.baseY, 0, h);
  table.addColorStop(0, '#2a3650');
  table.addColorStop(1, '#141c2e');
  ctx.fillStyle = table;
  ctx.fillRect(0, CUP.baseY, w, h - CUP.baseY);

  for (const g of glasses) {
    const p = positions[g.id];
    drawGlass(ctx, g, p, hoverId === g.id, time);
  }
}

function drawGlass(ctx, g, p, hover, time) {
  const { x, cx } = p;
  const wobble = g.vibration * Math.sin(time * 0.04 + g.id * 1.7) * 2.2;

  // 温度光晕
  if (g.temperature > 22) {
    const glow = ctx.createRadialGradient(cx, CUP.topY + 140, 10, cx, CUP.topY + 140, 150);
    glow.addColorStop(0, tempColor(g.temperature) + '0.28)');
    glow.addColorStop(1, tempColor(g.temperature) + '0)');
    ctx.fillStyle = glow;
    ctx.fillRect(cx - 150, CUP.topY - 20, 300, 340);
  }

  // 杯身轮廓（轻微梯形）
  ctx.beginPath();
  ctx.moveTo(x + 6 + wobble, CUP.rimY);
  ctx.lineTo(x + 14, CUP.baseY - 14);
  ctx.quadraticCurveTo(x + CUP.width / 2, CUP.baseY + 8, x + CUP.width - 14, CUP.baseY - 14);
  ctx.lineTo(x + CUP.width - 6 - wobble, CUP.rimY);
  ctx.lineWidth = hover ? 3.5 : 2.5;
  ctx.strokeStyle = g.cracked ? 'rgba(220,120,120,0.85)' : 'rgba(200,225,255,0.75)';
  ctx.stroke();

  // 水位
  const waterTop = CUP.baseY - 16 - (CUP.baseY - CUP.rimY - 30) * g.water;
  const grad = ctx.createLinearGradient(0, waterTop, 0, CUP.baseY);
  grad.addColorStop(0, tempColor(g.temperature) + '0.75)');
  grad.addColorStop(1, tempColor(g.temperature) + '0.45)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(x + 12, waterTop);
  ctx.lineTo(x + CUP.width - 12, waterTop);
  ctx.lineTo(x + CUP.width - 15, CUP.baseY - 14);
  ctx.quadraticCurveTo(cx, CUP.baseY + 4, x + 15, CUP.baseY - 14);
  ctx.closePath();
  ctx.fill();

  // 水面振动纹理
  ctx.beginPath();
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 1.5;
  for (let px = x + 12; px <= x + CUP.width - 12; px += 4) {
    const wave = Math.sin(px * 0.35 + time * 0.02) * g.vibration * 3;
    if (px === x + 12) ctx.moveTo(px, waterTop + wave);
    else ctx.lineTo(px, waterTop + wave);
  }
  ctx.stroke();

  // 杯壁振动纹理（摩擦时的环形波纹）
  if (g.vibration > 0.02) {
    for (let ring = 0; ring < 3; ring++) {
      const ry = CUP.rimY + 30 + ring * 46 + ((time * 0.08) % 46);
      ctx.beginPath();
      ctx.strokeStyle = `rgba(210,235,255,${0.16 * g.vibration * (1 - ring * 0.25)})`;
      ctx.ellipse(cx, ry, CUP.width / 2 - 8 - ring * 4, 7, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // 杯口
  ctx.beginPath();
  ctx.ellipse(cx, CUP.rimY, CUP.width / 2 - 4, 9, 0, 0, Math.PI * 2);
  ctx.lineWidth = 3;
  ctx.strokeStyle = g.cracked ? 'rgba(230,130,130,0.9)' : 'rgba(220,240,255,0.9)';
  ctx.stroke();

  // 裂纹
  if (g.cracked) {
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(255,180,180,0.95)';
    ctx.lineWidth = 1.6;
    const cracks = [
      [[cx, CUP.rimY], [cx - 14, CUP.rimY + 50], [cx - 4, CUP.rimY + 110], [cx - 20, CUP.rimY + 170]],
      [[cx, CUP.rimY], [cx + 16, CUP.rimY + 44], [cx + 8, CUP.rimY + 96]],
      [[cx - 14, CUP.rimY + 50], [cx - 26, CUP.rimY + 78]],
    ];
    for (const path of cracks) {
      ctx.moveTo(path[0][0], path[0][1]);
      for (const pt of path.slice(1)) ctx.lineTo(pt[0], pt[1]);
    }
    ctx.stroke();
  }

  // 标注：音名、频率、温度、偏移
  ctx.textAlign = 'center';
  ctx.fillStyle = g.cracked ? '#e08a8a' : '#dce8ff';
  ctx.font = 'bold 15px sans-serif';
  ctx.fillText(g.note, cx, CUP.baseY + 34);
  ctx.font = '11px sans-serif';
  ctx.fillStyle = '#8fa6cc';
  const f = resonantFreq(g);
  ctx.fillText(`${f.toFixed(1)} Hz`, cx, CUP.baseY + 50);
  ctx.fillStyle = g.temperature > 40 ? '#ffb070' : '#7e93b8';
  ctx.fillText(`${g.temperature.toFixed(1)}°C`, cx, CUP.baseY + 65);
  if (!g.cracked && g.temperature > 21) {
    const cents = detuneCents(g);
    ctx.fillStyle = cents < -40 ? '#ffd166' : '#8fa6cc';
    ctx.fillText(`${cents >= 0 ? '+' : ''}${cents.toFixed(0)} cent`, cx, CUP.baseY + 80);
  }
}
// 敲击力度：杯沿处最大（可超过裂杯阈值 1.0），越往杯底越温和
export function forceAt(y) {
  const depth = Math.max(0, y - CUP.rimY);
  return Math.max(0.5, 1.1 - depth / 520);
}
