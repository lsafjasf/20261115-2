import { MASTER_WIDTH, ORDERS, MAX_SPEED, TENSION_BREAK_MIN } from './config.js';

// Canvas 绘制：俯视图（左放卷 → 中分切 → 右收卷）
export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.W = canvas.width;
    this.H = canvas.height;
    this.webTop = 110;
    this.webHeight = 260;
    this.unwindX = 120;
    this.knifeX = 430;
    this.rewindX = 820;
    this.scroll = 0;
  }

  webToY(positionMm, offsetMm = 0) {
    const scale = this.webHeight / MASTER_WIDTH;
    return this.webTop + (positionMm + offsetMm) * scale;
  }

  draw(sim) {
    const { ctx, W, H } = this;
    ctx.clearRect(0, 0, W, H);
    this._drawBackground();
    this._drawUnwind(sim);
    this._drawWeb(sim);
    this._drawKnives(sim);
    this._drawRewinders(sim);
    this._drawTensionHint(sim);
    if (sim.status === 'broken') this._drawBreakBanner();
    if (sim.status === 'complete') this._drawCompleteBanner(sim);
  }

  _drawBackground() {
    const { ctx, W, H } = this;
    ctx.fillStyle = '#101623';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    for (let x = 40; x < W; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
  }

  _drawUnwind(sim) {
    const { ctx } = this;
    const radius = 95;
    ctx.save();
    ctx.translate(this.unwindX, this.webTop + this.webHeight / 2);
    if (sim.status === 'running') {
      this.scroll += sim.speed / MAX_SPEED * 0.09;
      ctx.rotate(-this.scroll);
    }
    const grad = ctx.createRadialGradient(-20, -20, 10, 0, 0, radius);
    grad.addColorStop(0, '#e8e2d4');
    grad.addColorStop(1, '#9a9284');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#5d574b';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(80,70,55,0.5)';
    ctx.lineWidth = 1;
    for (let r = 25; r < radius; r += 16) {
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = '#3a342b';
    ctx.beginPath();
    ctx.arc(0, 0, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#8ea0bd';
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('放卷轴（母卷 2000mm）', this.unwindX, this.webTop + this.webHeight + 28);
  }
  _drawWeb(sim) {
    const { ctx } = this;
    const x0 = this.unwindX + 95;
    const x1 = this.rewindX - 70;
    const top = this.webToY(0, sim.offset);
    const bottom = this.webToY(MASTER_WIDTH, sim.offset);

    // 纸幅主体
    const grad = ctx.createLinearGradient(0, top, 0, bottom);
    grad.addColorStop(0, '#f4efe3');
    grad.addColorStop(0.5, '#fffdf6');
    grad.addColorStop(1, '#e6dfce');
    ctx.fillStyle = grad;
    ctx.fillRect(x0, top, x1 - x0, bottom - top);

    // 走纸纹理：随卷速滚动的横向纹理
    if (sim.status === 'running') this.scroll += sim.speed / MAX_SPEED * 0.6;
    ctx.strokeStyle = 'rgba(120,110,90,0.25)';
    ctx.lineWidth = 1;
    const gap = 26;
    const offset = this.scroll % gap;
    for (let x = x0 - gap + offset; x < x1; x += gap) {
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x, bottom);
      ctx.stroke();
    }

    // 四条订单带的分色区（刀位之后）
    sim.knives.forEach((kp, i) => {
      if (i >= sim.knives.length - 1) return;
      const yA = this.webToY(kp, sim.offset);
      const yB = this.webToY(sim.knives[i + 1], sim.offset);
      ctx.fillStyle = ORDERS[i].color + '22';
      ctx.fillRect(this.knifeX + 6, yA, x1 - this.knifeX - 6, yB - yA);
    });

    // 两侧废边阴影
    ctx.fillStyle = 'rgba(120,80,60,0.28)';
    ctx.fillRect(x0, top, x1 - x0, this.webToY(sim.knives[0], sim.offset) - top);
    ctx.fillRect(x0, this.webToY(sim.knives[4], sim.offset), x1 - x0,
      bottom - this.webToY(sim.knives[4], sim.offset));

    // 偏移指示线（理想中心线 vs 实际中心线）
    ctx.strokeStyle = 'rgba(80,160,255,0.7)';
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    const idealMid = this.webToY(MASTER_WIDTH / 2, 0);
    ctx.moveTo(x0, idealMid);
    ctx.lineTo(x1, idealMid);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = '#ffd34d';
    ctx.beginPath();
    ctx.moveTo(x0, (top + bottom) / 2);
    ctx.lineTo(x1, (top + bottom) / 2);
    ctx.stroke();
  }

  _drawKnives(sim) {
    const { ctx } = this;
    sim.knives.forEach((kp, idx) => {
      const y = this.webToY(kp, sim.offset);
      ctx.save();
      ctx.translate(this.knifeX, y);
      // 刀架
      ctx.fillStyle = '#2b3550';
      ctx.fillRect(-10, -7, 20, 14);
      // 圆盘刀
      ctx.beginPath();
      ctx.arc(0, 0, 9, 0, Math.PI * 2);
      ctx.fillStyle = sim.status === 'running' ? '#d7dde8' : '#8b94a6';
      ctx.fill();
      ctx.strokeStyle = '#46506a';
      ctx.lineWidth = 2;
      ctx.stroke();
      if (sim.status === 'running') {
        ctx.strokeStyle = 'rgba(40,46,60,0.8)';
        ctx.beginPath();
        ctx.moveTo(-5, 0);
        ctx.lineTo(5, 0);
        ctx.stroke();
      }
      ctx.restore();
      // 分切线（刀右侧红色细线）
      ctx.strokeStyle = 'rgba(230,70,90,0.55)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(this.knifeX + 10, y);
      ctx.lineTo(this.rewindX - 70, y);
      ctx.stroke();
      // 刀位毫米标注
      ctx.fillStyle = '#aeb9cc';
      ctx.font = '11px monospace';
      ctx.textAlign = 'right';
      ctx.fillText(`K${idx + 1}:${kp}`, this.knifeX - 16, y + 4);
    });
    ctx.fillStyle = '#8ea0bd';
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('分切刀组（5 刀 4 带）', this.knifeX, this.webTop + this.webHeight + 28);
  }
  _drawRewinders(sim) {
    const { ctx } = this;
    ORDERS.forEach((order, i) => {
      const yTop = this.webToY(sim.knives[i], sim.offset);
      const yBot = this.webToY(sim.knives[i + 1], sim.offset);
      const cy = (yTop + yBot) / 2;
      const radius = Math.min(26, (yBot - yTop) / 2 - 4);
      const done = sim.produced[i] >= order.target;
      ctx.save();
      ctx.translate(this.rewindX, cy);
      if (sim.status === 'running' && !done) {
        ctx.rotate(this.scroll * 1.4);
      }
      const grad = ctx.createRadialGradient(-6, -6, 4, 0, 0, radius);
      grad.addColorStop(0, order.color);
      grad.addColorStop(1, '#1d2738');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = done ? '#34d99a' : 'rgba(255,255,255,0.45)';
      ctx.lineWidth = done ? 3 : 1.5;
      ctx.stroke();
      ctx.restore();

      // 标签与进度
      ctx.fillStyle = order.color;
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`${order.id} ${order.width}mm`, this.rewindX + radius + 8, cy - 6);
      ctx.fillStyle = '#cfd8e6';
      ctx.font = '11px monospace';
      ctx.fillText(
        `${sim.produced[i].toFixed(0)}/${order.target}m` +
        (done ? ' ✓' : ''), this.rewindX + radius + 8, cy + 10);
    });
    ctx.fillStyle = '#8ea0bd';
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('收卷轴（精确长度）', this.rewindX, this.webTop + this.webHeight + 28);
  }

  _drawTensionHint(sim) {
    const { ctx } = this;
    const x0 = 250;
    const x1 = 360;
    const y = 40;
    ctx.fillStyle = '#c8d2e2';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`张力 ${sim.tension.toFixed(0)}`, x0 - 70, y + 4);
    ctx.fillStyle = '#202a3d';
    ctx.fillRect(x0, y - 8, x1 - x0, 10);
    const ratio = sim.tension / 100;
    let color = '#34d99a';
    if (sim.tension >= TENSION_BREAK_MIN) color = '#ff4d5e';
    else if (sim.tension > 68 || sim.tension < 42) color = '#ffd34d';
    ctx.fillStyle = color;
    ctx.fillRect(x0, y - 8, (x1 - x0) * ratio, 10);
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.strokeRect(x0, y - 8, x1 - x0, 10);

    // 卷速读数
    ctx.fillStyle = '#c8d2e2';
    ctx.fillText(`卷速 ${sim.speed.toFixed(0)} m/min`, x1 + 24, y + 4);
    // 偏移读数
    ctx.fillStyle = Math.abs(sim.offset) >
      Math.min(sim.trimWidths.left, sim.trimWidths.right) ? '#ff8a5c' : '#c8d2e2';
    ctx.fillText(`偏移 ${sim.offset >= 0 ? '+' : ''}${sim.offset.toFixed(1)}mm`,
      x1 + 150, y + 4);
  }

  _drawBreakBanner() {
    const { ctx, W, H } = this;
    ctx.fillStyle = 'rgba(255,40,60,0.22)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#ff4d5e';
    ctx.font = 'bold 42px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('⚠ 断纸停机', W / 2, H / 2);
    ctx.font = '16px sans-serif';
    ctx.fillStyle = '#ffd7db';
    ctx.fillText('张力超过安全极限，点击复位后重新开始', W / 2, H / 2 + 32);
  }

  _drawCompleteBanner(sim) {
    const { ctx, W } = this;
    const ok = sim.succeeded;
    ctx.fillStyle = ok ? 'rgba(40,200,140,0.18)' : 'rgba(255,180,60,0.18)';
    ctx.fillRect(0, 0, W, 40);
    ctx.fillStyle = ok ? '#52f0ac' : '#ffd34d';
    ctx.font = 'bold 20px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(ok ? '✓ 分切成功：订单精确完成且废边达标' :
      '订单已完成，但存在废边超标或刀距不合格', W / 2, 27);
  }

  // 命中测试：返回鼠标位置最近的刀索引（容差 12px）
  knifeAt(mouseY, sim) {
    let best = -1;
    let bestDist = 14;
    sim.knives.forEach((kp, idx) => {
      const y = this.webToY(kp, sim.offset);
      const dist = Math.abs(mouseY - y);
      if (dist < bestDist) {
        bestDist = dist;
        best = idx;
      }
    });
    return best;
  }

  yToMm(mouseY, sim) {
    const scale = this.webHeight / MASTER_WIDTH;
    return (mouseY - this.webTop) / scale - sim.offset;
  }
}
