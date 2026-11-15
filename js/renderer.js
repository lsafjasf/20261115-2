import { WORLD_W, WORLD_H, cablePath, DOCK_RADIUS, CABLE_BREAK } from './sim.js';

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.t = 0;
  }

  draw(world, input = {}) {
    this.t += 1 / 60;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, WORLD_W, WORLD_H);
    this.drawWater(ctx);
    this.drawShallows(ctx, world);
    this.drawAnchors(ctx, world);
    this.drawStreaks(ctx, world);
    this.drawCable(ctx, world);
    this.drawBuoys(ctx, world);
    this.drawBoat(ctx, world, input);
    this.drawHud(ctx, world);
    this.drawBanner(ctx, world);
  }

  drawWater(ctx) {
    const g = ctx.createLinearGradient(0, 0, 0, WORLD_H);
    g.addColorStop(0, '#0e3a4d');
    g.addColorStop(0.55, '#0b2c3d');
    g.addColorStop(1, '#071e2b');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);
    // 细微波纹
    ctx.strokeStyle = 'rgba(140, 200, 220, 0.05)';
    ctx.lineWidth = 1;
    for (let y = 24; y < WORLD_H; y += 34) {
      ctx.beginPath();
      for (let x = 0; x <= WORLD_W; x += 24) {
        const yy = y + Math.sin((x + this.t * 26) / 46) * 3;
        if (x === 0) ctx.moveTo(x, yy);
        else ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
  }

  drawShallows(ctx, world) {
    for (const s of world.shallows) {
      const g = ctx.createRadialGradient(s.x, s.y, 4, s.x, s.y, s.r);
      g.addColorStop(0, 'rgba(194, 166, 108, 0.5)');
      g.addColorStop(0.75, 'rgba(170, 138, 84, 0.32)');
      g.addColorStop(1, 'rgba(170, 138, 84, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(230, 200, 140, 0.55)';
      ctx.setLineDash([7, 7]);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(240, 220, 170, 0.8)';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('浅滩', s.x, s.y + 4);
    }
  }

  drawAnchors(ctx, world) {
    world.anchors.forEach((a, i) => {
      const docked = world.buoys[i].docked;
      ctx.strokeStyle = docked ? 'rgba(120, 230, 170, 0.95)' : 'rgba(235, 235, 210, 0.8)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(a.x, a.y, DOCK_RADIUS, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(a.x, a.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = docked ? '#78e6aa' : '#e6e6d2';
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`锚位 ${i + 1}`, a.x, a.y - DOCK_RADIUS - 7);
    });
  }

  drawStreaks(ctx, world) {
    const w = world.wind;
    const wx = Math.cos(w.dir);
    const wy = Math.sin(w.dir);
    ctx.strokeStyle = 'rgba(200, 230, 245, 0.28)';
    ctx.lineWidth = 1.2;
    for (const s of world.streaks) {
      const speed = 30 + s.drift * 22;
      s.x += wx * speed / 60;
      s.y += wy * speed / 60;
      if (s.x < -60) s.x = WORLD_W + 50;
      if (s.x > WORLD_W + 60) s.x = -50;
      if (s.y < -60) s.y = WORLD_H + 50;
      if (s.y > WORLD_H + 60) s.y = -50;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(s.x - wx * s.len, s.y - wy * s.len);
      ctx.stroke();
    }
  }

  drawCable(ctx, world) {
    const path = cablePath(world);
    if (!path) return;
    const ratio = Math.min(1, path.tension / CABLE_BREAK);
    const hue = 190 - ratio * 190; // 青 -> 红
    ctx.strokeStyle = `hsl(${hue}, 85%, ${62 - ratio * 12}%)`;
    ctx.lineWidth = 2 + ratio * 2.5;
    ctx.beginPath();
    ctx.moveTo(path.boat.x, path.boat.y);
    if (path.bend) ctx.lineTo(path.bend.x, path.bend.y);
    ctx.lineTo(path.end.x, path.end.y);
    ctx.stroke();
    if (world.cable.snag) {
      ctx.fillStyle = '#ffb347';
      ctx.beginPath();
      ctx.arc(path.bend.x, path.bend.y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,180,80,0.8)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(path.bend.x, path.bend.y, 10 + Math.sin(this.t * 8) * 2, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  drawBuoys(ctx, world) {
    world.buoys.forEach((b, i) => {
      if (b.docked) {
        ctx.fillStyle = '#78e6aa';
      } else {
        ctx.fillStyle = ['#ff6b5e', '#ffd166', '#f78c40'][i % 3];
      }
      ctx.beginPath();
      ctx.arc(b.x, b.y, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.75)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      // 沉重传感器（浮标下方的吊舱）
      ctx.fillStyle = 'rgba(30,30,35,0.85)';
      ctx.fillRect(b.x - 3, b.y + 9, 6, 10);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(String(i + 1), b.x, b.y + 4);
      // 传感器尾迹
      if (!b.docked) {
        ctx.strokeStyle = 'rgba(255,255,255,0.12)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(b.x, b.y);
        ctx.lineTo(b.x - b.vx * 0.35, b.y - b.vy * 0.35);
        ctx.stroke();
      }
    });
  }

  drawBoat(ctx, world) {
    const { boat } = world;
    ctx.save();
    ctx.translate(boat.x, boat.y);
    ctx.rotate(boat.angle);
    // 船体
    ctx.fillStyle = '#e8eef2';
    ctx.beginPath();
    ctx.moveTo(20, 0);
    ctx.lineTo(8, -9);
    ctx.lineTo(-16, -9);
    ctx.lineTo(-20, 0);
    ctx.lineTo(-16, 9);
    ctx.lineTo(8, 9);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#33505e';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // 驾驶舱
    ctx.fillStyle = '#4f7d92';
    ctx.fillRect(-6, -5, 12, 10);
    // 推进器尾流
    if (Math.abs(boat.throttle) > 0.05) {
      const rev = boat.throttle < 0 ? 1 : -1;
      ctx.strokeStyle = 'rgba(220,240,250,0.45)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(20 * rev, 0);
      ctx.lineTo((20 + Math.abs(boat.throttle) * 22) * rev, 0);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawHud(ctx, world) {
    const docked = world.stats.docked;
    const tension = Math.round(world.cable.tension);
    const ratio = Math.min(1, tension / CABLE_BREAK);
    ctx.fillStyle = 'rgba(5, 18, 26, 0.72)';
    ctx.fillRect(12, 12, 268, 118);
    ctx.strokeStyle = 'rgba(140, 190, 210, 0.35)';
    ctx.strokeRect(12, 12, 268, 118);
    ctx.fillStyle = '#dff1f8';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`浮标归位: ${docked} / 3`, 24, 36);
    ctx.fillText(`挂底次数: ${world.stats.snags}`, 24, 58);
    ctx.fillText(`断缆次数: ${world.stats.breaks}`, 24, 80);
    ctx.fillText(`seed: ${world.seed}`, 24, 102);
    // 张力条
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(130, 86, 138, 12);
    ctx.fillStyle = `hsl(${190 - ratio * 190}, 85%, 55%)`;
    ctx.fillRect(130, 86, 138 * ratio, 12);
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.strokeRect(130, 86, 138, 12);
    ctx.fillStyle = '#dff1f8';
    ctx.font = '11px sans-serif';
    ctx.fillText(`张力 ${tension}`, 130, 118);
  }

  drawBanner(ctx, world) {
    if (world.status === 'playing') return;
    ctx.fillStyle = 'rgba(4, 14, 20, 0.72)';
    ctx.fillRect(0, WORLD_H / 2 - 70, WORLD_W, 140);
    ctx.textAlign = 'center';
    ctx.font = 'bold 40px sans-serif';
    if (world.status === 'won') {
      ctx.fillStyle = '#78e6aa';
      ctx.fillText('回收完成 · 三座浮标全部归位', WORLD_W / 2, WORLD_H / 2);
    } else {
      ctx.fillStyle = '#ff7a6e';
      ctx.fillText('缆绳断裂 · 任务失败', WORLD_W / 2, WORLD_H / 2);
    }
    ctx.font = '16px sans-serif';
    ctx.fillStyle = '#dff1f8';
    ctx.fillText('按 R 重新开始', WORLD_W / 2, WORLD_H / 2 + 38);
  }
}
