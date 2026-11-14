// Canvas 渲染层：只读取引擎快照，不修改模拟状态。

const W = 960;
const H = 600;

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawTank(ctx, x, y, w, h, level, opts = {}) {
  const fillH = (h * level) / 100;
  ctx.save();
  roundRect(ctx, x, y, w, h, 10);
  ctx.fillStyle = '#101826';
  ctx.fill();
  ctx.clip();
  const grad = ctx.createLinearGradient(0, y + h - fillH, 0, y + h);
  grad.addColorStop(0, opts.colorTop || '#38bdf8');
  grad.addColorStop(1, opts.colorBottom || '#1d4ed8');
  ctx.fillStyle = grad;
  ctx.fillRect(x, y + h - fillH, w, fillH);
  if (level >= 100) {
    ctx.fillStyle = 'rgba(239, 68, 68, 0.85)';
    ctx.font = 'bold 15px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('已满', x + w / 2, y + 24);
  }
  ctx.restore();
  ctx.strokeStyle = opts.stroke || '#7dd3fc';
  ctx.lineWidth = 2;
  roundRect(ctx, x, y, w, h, 10);
  ctx.stroke();
}

function drawHeatBar(ctx, x, y, w, heat, seized) {
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  roundRect(ctx, x, y, w, 14, 7);
  ctx.fill();
  const hue = Math.max(0, 120 - heat * 1.2);
  ctx.fillStyle = seized ? '#ef4444' : `hsl(${hue} 80% 52%)`;
  roundRect(ctx, x, y, (w * heat) / 100, 14, 7);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 1;
  roundRect(ctx, x, y, w, 14, 7);
  ctx.stroke();
}

export function drawScene(ctx, engine) {
  ctx.clearRect(0, 0, W, H);
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#0b1220');
  bg.addColorStop(1, '#111827');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const remain = Math.max(0, engine.cfg.DURATION - engine.t);
  const mm = String(Math.floor(remain / 60)).padStart(2, '0');
  const ss = String(Math.floor(remain % 60)).padStart(2, '0');
  ctx.fillStyle = '#e2e8f0';
  ctx.font = 'bold 22px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`剩余 ${mm}:${ss}`, 24, 36);
  ctx.font = '14px sans-serif';
  ctx.fillStyle = '#94a3b8';
  ctx.fillText('玩家1 摇杆 Space　玩家2 阀门 A/B　（单人可自己兼任）', 180, 36);

  // 左侧：泵房积水井
  const sump = { x: 46, y: 110, w: 210, h: 420 };
  drawTank(ctx, sump.x, sump.y, sump.w, sump.h, engine.level);
  const safeY = sump.y + sump.h - (sump.h * engine.cfg.SAFE_LINE) / 100;
  ctx.strokeStyle = '#22c55e';
  ctx.setLineDash([8, 6]);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(sump.x, safeY);
  ctx.lineTo(sump.x + sump.w, safeY);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = '#22c55e';
  ctx.font = 'bold 14px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`安全线 ${engine.cfg.SAFE_LINE}`, sump.x, safeY - 8);
  ctx.fillStyle = '#e2e8f0';
  ctx.font = 'bold 16px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`泵房水位 ${engine.level.toFixed(1)}`, sump.x + sump.w / 2, sump.y + sump.h + 28);

  // 中间：泵体与摇杆
  const px = 390, py = 300, pw = 170, ph = 150;
  ctx.save();
  if (engine.flashWrong > 0) ctx.shadowColor = '#ef4444';
  else if (engine.seized) ctx.shadowColor = '#ef4444';
  else ctx.shadowColor = '#38bdf8';
  ctx.shadowBlur = engine.flashWrong > 0 || engine.seized ? 26 : 12;
  roundRect(ctx, px, py, pw, ph, 16);
  ctx.fillStyle = engine.seized ? '#3f1d1d' : '#1e293b';
  ctx.fill();
  ctx.strokeStyle = engine.seized ? '#ef4444' : '#60a5fa';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();

  // 摇杆：绕支点转动，摇杆速度越快越亮
  const pivot = { x: px + pw / 2, y: py + 26 };
  const armLen = 78;
  const ax = pivot.x + Math.sin(engine.crankAngle) * armLen;
  const ay = pivot.y - Math.cos(engine.crankAngle) * 22 + 18;
  ctx.strokeStyle = engine.seized ? '#7f1d1d' : '#fbbf24';
  ctx.lineWidth = 8;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(pivot.x, pivot.y);
  ctx.lineTo(ax, ay);
  ctx.stroke();
  ctx.fillStyle = engine.seized ? '#ef4444' : '#fde68a';
  ctx.beginPath();
  ctx.arc(ax, ay, 12, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#cbd5e1';
  ctx.font = '14px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('手摇泵', px + pw / 2, py + ph - 46);
  ctx.fillText(`速度 ${engine.pumpSpeed.toFixed(1)} 次/秒`, px + pw / 2, py + ph - 24);
  drawHeatBar(ctx, px + 16, py + ph + 14, pw - 32, engine.heat, engine.seized);
  ctx.fillStyle = engine.seized ? '#ef4444' : '#cbd5e1';
  ctx.font = '13px sans-serif';
  ctx.fillText(
    engine.seized ? `过热锁定 ${Math.ceil(engine.seizeTimer)}s` : `热量 ${engine.heat.toFixed(0)}%`,
    px + pw / 2,
    py + ph + 46,
  );

  // 右侧：两个接收池与阀门
  const poolW = 120, poolH = 300, poolY = 200;
  engine.pools.forEach((pool, idx) => {
    const x = 660 + idx * 150;
    const selected = engine.valve === idx;
    drawTank(ctx, x, poolY, poolW, poolH, pool.level, {
      stroke: selected ? '#fbbf24' : '#475569',
    });
    ctx.fillStyle = selected ? '#fbbf24' : '#94a3b8';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`池 ${pool.name}${selected ? ' ◄ 阀门' : ''}`, x + poolW / 2, poolY - 14);
    ctx.fillStyle = '#cbd5e1';
    ctx.font = '13px sans-serif';
    ctx.fillText(`${pool.level.toFixed(0)}%`, x + poolW / 2, poolY + poolH + 24);
    // 泵到池的流向箭头
    ctx.strokeStyle = selected ? '#fbbf24' : 'rgba(148,163,184,0.35)';
    ctx.lineWidth = selected ? 4 : 2;
    ctx.beginPath();
    ctx.moveTo(px + pw, py + 60);
    ctx.lineTo(x, poolY + 40);
    ctx.stroke();
    if (selected && engine.flashPump > 0) {
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.arc((px + pw + x) / 2, (py + 60 + poolY + 40) / 2, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  });

  // 底部统计
  ctx.fillStyle = '#94a3b8';
  ctx.font = '13px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(
    `行程 ${engine.strokeCount}　有效排水 ${engine.routedCount}　错阀 ${engine.wrongCount}　过热 ${engine.seizureCount}`,
    24,
    572,
  );

  if (engine.finished) {
    ctx.fillStyle = 'rgba(2,6,23,0.72)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.font = 'bold 44px sans-serif';
    ctx.fillStyle = engine.success ? '#22c55e' : '#ef4444';
    ctx.fillText(engine.success ? '排水成功' : '任务失败', W / 2, H / 2 - 10);
    ctx.font = '20px sans-serif';
    ctx.fillStyle = '#e2e8f0';
    const detail = engine.success
      ? `用时 ${engine.timeUsed.toFixed(1)} 秒，水位降至安全线`
      : '十分钟内未能把水位降到安全线';
    ctx.fillText(detail, W / 2, H / 2 + 32);
    ctx.font = '16px sans-serif';
    ctx.fillText('点击「重新开始」再来一局', W / 2, H / 2 + 66);
  } else if (engine.seized) {
    ctx.textAlign = 'center';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillStyle = '#fca5a5';
    ctx.fillText('泵过热！摇杆锁定，等待冷却', W / 2, 96);
  }
}

export const CANVAS_SIZE = { W, H };
