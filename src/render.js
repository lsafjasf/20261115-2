// Canvas 渲染：舱体、左右两块独立仪表、供氧阀 / 泄压阀与气流粒子。
import { CONFIG } from './engine.js';

export class ChamberRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.particles = [];
  }

  _zoneColor(value, safe, hard) {
    if (value < hard[0] || value > hard[1]) return '#ff3b3b';
    if (value < safe[0] || value > safe[1]) return '#ffb020';
    return '#35d07f';
  }

  // 单参数圆弧仪表：左仪表只画氧浓度，右仪表只画压力
  drawGauge(x, y, radius, value, range, safe, hard, label, unit) {
    const ctx = this.ctx;
    const [lo, hi] = range;
    const frac = Math.min(1, Math.max(0, (value - lo) / (hi - lo)));
    const start = Math.PI * 0.75;
    const end = Math.PI * 2.25;
    const color = this._zoneColor(value, safe, hard);

    ctx.save();
    ctx.translate(x, y);
    ctx.lineCap = 'round';
    // 背景轨道
    ctx.beginPath();
    ctx.arc(0, 0, radius, start, end);
    ctx.lineWidth = 14;
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.stroke();
    // 安全区弧段
    const s0 = start + ((safe[0] - lo) / (hi - lo)) * (end - start);
    const s1 = start + ((safe[1] - lo) / (hi - lo)) * (end - start);
    ctx.beginPath();
    ctx.arc(0, 0, radius, s0, s1);
    ctx.lineWidth = 14;
    ctx.strokeStyle = 'rgba(53,208,127,0.35)';
    ctx.stroke();
    // 当前值弧段
    ctx.beginPath();
    ctx.arc(0, 0, radius, start, start + frac * (end - start));
    ctx.lineWidth = 8;
    ctx.strokeStyle = color;
    ctx.stroke();
    // 读数
    ctx.fillStyle = '#eef4ff';
    ctx.textAlign = 'center';
    ctx.font = 'bold 30px monospace';
    ctx.fillText(value.toFixed(1), 0, 6);
    ctx.font = '13px sans-serif';
    ctx.fillStyle = '#9fb3cc';
    ctx.fillText(`${label} (${unit})`, 0, 30);
    ctx.font = '12px monospace';
    ctx.fillStyle = color;
    const zone =
      value < hard[0] || value > hard[1]
        ? '危险·封闭'
        : value < safe[0] || value > safe[1]
          ? '安全区外'
          : '安全区内';
    ctx.fillText(zone, 0, 48);
    ctx.restore();
  }

  drawValve(x, y, open, label, hotkey) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);
    // 阀体
    ctx.fillStyle = '#22304a';
    ctx.strokeStyle = open > 0 ? '#58b7ff' : '#4a5b78';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-26, -18);
    ctx.lineTo(0, 0);
    ctx.lineTo(-26, 18);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(26, -18);
    ctx.lineTo(0, 0);
    ctx.lineTo(26, 18);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // 开度指示
    ctx.rotate(-Math.PI / 4 + open * (Math.PI / 2));
    ctx.fillStyle = open > 0 ? '#9fd6ff' : '#6b7c99';
    ctx.fillRect(-3, -30, 6, 30);
    ctx.rotate(Math.PI / 4 - open * (Math.PI / 2));
    ctx.fillStyle = '#cdd9ea';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${label} ${(open * 100).toFixed(0)}%`, 0, 40);
    ctx.fillStyle = '#7f90ab';
    ctx.font = '11px monospace';
    ctx.fillText(hotkey, 0, 56);
    ctx.restore();
  }

  drawChamber(snap) {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const cx = w / 2;
    const top = 92;
    const bodyW = 300;
    const bodyH = 250;

    // 舱体
    ctx.save();
    ctx.fillStyle = snap.sealed ? 'rgba(255,59,59,0.10)' : 'rgba(90,140,220,0.08)';
    ctx.strokeStyle = snap.sealed ? '#ff5555' : '#5d7aa6';
    ctx.lineWidth = 3;
    this._roundRect(cx - bodyW / 2, top, bodyW, bodyH, 26);
    ctx.fill();
    ctx.stroke();

    // 舱内气泡：数量与总流量相关
    const flow = snap.inflow + snap.outflow + snap.leak;
    if (Math.random() < Math.min(0.9, flow / 4)) {
      this.particles.push({
        x: cx + (Math.random() - 0.5) * bodyW * 0.7,
        y: top + bodyH - 20,
        r: 2 + Math.random() * 4,
        life: 1,
      });
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const p of this.particles) {
      p.y -= 0.6 + flow * 0.12;
      p.life -= 0.008;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(140,190,255,${p.life * 0.5})`;
      ctx.fill();
    }

    // 中央状态文字
    ctx.textAlign = 'center';
    ctx.fillStyle = '#eef4ff';
    ctx.font = 'bold 18px sans-serif';
    const title = snap.sealed
      ? `紧急封闭 · ${snap.sealRemaining.toFixed(1)}s 后恢复`
      : snap.stable
        ? '已稳定 30 秒 · 任务达成'
        : '潜水舱运行中';
    ctx.fillText(title, cx, top + 34);
    ctx.font = '13px monospace';
    ctx.fillStyle = '#9fb3cc';
    ctx.fillText(
      `进气 ${snap.inflow.toFixed(2)} kPa/s   排气 ${snap.outflow.toFixed(2)} kPa/s` +
        (snap.leak ? `   泄漏 ${snap.leak.toFixed(2)}` : ''),
      cx,
      top + 58,
    );

    // 稳定进度条
    const barW = bodyW * 0.8;
    const barX = cx - barW / 2;
    const barY = top + bodyH - 34;
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    this._roundRect(barX, barY, barW, 12, 6);
    ctx.fill();
    const progress = Math.min(1, snap.stableTimer / CONFIG.STABLE_TIME);
    ctx.fillStyle = snap.sealed ? '#ff5555' : '#35d07f';
    this._roundRect(barX, barY, barW * progress, 12, 6);
    ctx.fill();
    ctx.fillStyle = '#cdd9ea';
    ctx.font = '12px monospace';
    ctx.fillText(`安全区稳定计时 ${snap.stableTimer.toFixed(1)} / ${CONFIG.STABLE_TIME}s`, cx, barY - 8);
    ctx.restore();

    // 阀门与管道
    this.drawValve(cx - bodyW / 2 - 56, top + 70, snap.supply, '供氧阀', 'A / D');
    this.drawValve(cx + bodyW / 2 + 56, top + 70, snap.vent, '泄压阀', '← / →');
    this._drawPipes(cx, top, bodyW, snap);
  }

  _drawPipes(cx, top, bodyW, snap) {
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = '#46597a';
    ctx.lineWidth = 10;
    ctx.lineCap = 'round';
    // 左供氧管道
    ctx.beginPath();
    ctx.moveTo(cx - bodyW / 2 - 90, top + 70);
    ctx.lineTo(cx - bodyW / 2, top + 70);
    ctx.stroke();
    // 右泄压管道
    ctx.beginPath();
    ctx.moveTo(cx + bodyW / 2, top + 70);
    ctx.lineTo(cx + bodyW / 2 + 90, top + 70);
    ctx.stroke();
    // 流动高亮
    ctx.lineWidth = 3;
    if (snap.inflow > 0.05) {
      ctx.strokeStyle = '#58b7ff';
      const shift = (performance.now() / 80) % 24;
      for (let x = cx - bodyW / 2 - 90; x < cx - bodyW / 2; x += 24) {
        ctx.beginPath();
        ctx.moveTo(x + shift, top + 70);
        ctx.lineTo(x + shift + 12, top + 70);
        ctx.stroke();
      }
    }
    if (snap.outflow > 0.05) {
      ctx.strokeStyle = '#ffb020';
      const shift = (performance.now() / 80) % 24;
      for (let x = cx + bodyW / 2; x < cx + bodyW / 2 + 90; x += 24) {
        ctx.beginPath();
        ctx.moveTo(x + shift, top + 70);
        ctx.lineTo(x + shift + 12, top + 70);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  _roundRect(x, y, w, h, r) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  render(snap) {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.clearRect(0, 0, w, h);
    // 左右仪表：信息隔离，各自只有一个参数
    this.drawGauge(
      130,
      150,
      78,
      snap.o2,
      [10, 30],
      CONFIG.O2_SAFE,
      CONFIG.O2_HARD,
      '氧浓度',
      '%',
    );
    this.drawGauge(
      w - 130,
      150,
      78,
      snap.pressure,
      [80, 130],
      CONFIG.P_SAFE,
      CONFIG.P_HARD,
      '舱内压力',
      'kPa',
    );
    this.drawChamber(snap);
  }
}
