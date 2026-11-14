// renderer.js — Canvas 2D 渲染：舞台、布景、质心与碰撞区

import {
  CONFIG,
  ACTORS,
  POSTS,
  SCENES,
  comWorld,
  localToWorld,
  tiltMetric,
} from './engine.js';

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.round(rect.width * dpr);
    this.canvas.height = Math.round(rect.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.w = rect.width;
    this.h = rect.height;
    this.scale = Math.min(this.w, this.h) * 0.42 / CONFIG.STAGE_R;
    this.cx = this.w / 2;
    this.cy = this.h / 2;
  }

  toScreen(x, y) {
    return [this.cx + x * this.scale, this.cy + y * this.scale];
  }

  draw(state, autopilot) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.w, this.h);
    this.drawStage();
    this.drawTarget(state);
    this.drawForbidden(autopilot);
    this.drawObstacles();
    this.drawSet(state);
    this.drawCom(state);
  }

  drawStage() {
    const ctx = this.ctx;
    const [x, y] = this.toScreen(0, 0);
    const r = CONFIG.STAGE_R * this.scale;
    const grad = ctx.createRadialGradient(x, y, r * 0.2, x, y, r);
    grad.addColorStop(0, '#1b2440');
    grad.addColorStop(1, '#121830');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#3a4a78';
    ctx.lineWidth = 3;
    ctx.stroke();
    // 边界碰撞环带
    ctx.strokeStyle = 'rgba(255, 122, 144, 0.35)';
    ctx.lineWidth = CONFIG.BOUNDARY_HALF_W * 2 * this.scale;
    ctx.beginPath();
    ctx.arc(x, y, (CONFIG.STAGE_R - CONFIG.BOUNDARY_HALF_W) * this.scale, 0, Math.PI * 2);
    ctx.stroke();
    // 底座支撑面
    ctx.fillStyle = 'rgba(122, 162, 255, 0.12)';
    ctx.beginPath();
    ctx.arc(x, y, CONFIG.SUPPORT_RADIUS * this.scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(122, 162, 255, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  drawTarget(state) {
    if (state.status !== 'running') return;
    const ctx = this.ctx;
    const target = SCENES[state.sceneIndex].angle;
    const r = CONFIG.ARM_TIP * this.scale;
    const [x, y] = this.toScreen(Math.cos(target) * r, Math.sin(target) * r);
    ctx.save();
    ctx.strokeStyle = '#46d39a';
    ctx.setLineDash([8, 6]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(this.cx, this.cy);
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#46d39a';
    ctx.beginPath();
    ctx.arc(x, y, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawForbidden(autopilot) {
    if (!autopilot) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = 'rgba(255, 122, 144, 0.10)';
    for (const band of autopilot.bands) {
      const a0 = (band.startIdx * Math.PI) / 360;
      const a1 = (band.endIdx * Math.PI) / 360;
      ctx.beginPath();
      ctx.moveTo(this.cx, this.cy);
      ctx.arc(this.cx, this.cy, CONFIG.STAGE_R * this.scale * 0.96, a0, a1);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  drawObstacles() {
    const ctx = this.ctx;
    for (const actor of ACTORS) this.drawCircle(actor, '#f5b85a', '演员');
    for (const post of POSTS) this.drawCircle(post, '#8d99ae', '台柱');
  }

  drawCircle(ob, color, label) {
    const ctx = this.ctx;
    const [x, y] = this.toScreen(ob.x, ob.y);
    ctx.fillStyle = color + '33';
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, ob.r * this.scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#e8eefc';
    ctx.font = '11px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(label, x, y + 4);
  }

  drawSet(state) {
    const ctx = this.ctx;
    const p = state.params;
    const corners = [
      localToWorld(p.armTip, p.armHalfW, state.theta, 0, 0),
      localToWorld(p.armTip, -p.armHalfW, state.theta, 0, 0),
      localToWorld(p.armTail, -p.armHalfW, state.theta, 0, 0),
      localToWorld(p.armTail, p.armHalfW, state.theta, 0, 0),
    ].map((pt) => this.toScreen(pt.x, pt.y));
    ctx.beginPath();
    ctx.moveTo(corners[0][0], corners[0][1]);
    for (let i = 1; i < corners.length; i += 1) ctx.lineTo(corners[i][0], corners[i][1]);
    ctx.closePath();
    const grad = ctx.createLinearGradient(corners[2][0], corners[2][1], corners[0][0], corners[0][1]);
    grad.addColorStop(0, '#3d5187');
    grad.addColorStop(1, '#7aa2ff');
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = '#a9c0ff';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 配重滑块（沿主梁）
    const cwPos = localToWorld(state.cw, 0, state.theta, 0, 0);
    const [cwX, cwY] = this.toScreen(cwPos.x, cwPos.y);
    ctx.fillStyle = '#c792ea';
    ctx.strokeStyle = '#e3c9f7';
    ctx.beginPath();
    ctx.arc(cwX, cwY, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // 底座旋转轴心
    const [ax, ay] = this.toScreen(0, 0);
    ctx.fillStyle = '#e8eefc';
    ctx.beginPath();
    ctx.arc(ax, ay, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  drawCom(state) {
    const ctx = this.ctx;
    const world = comWorld(state);
    const [x, y] = this.toScreen(world.x, world.y);
    const tilt = tiltMetric(state);
    const danger = tilt > CONFIG.TILT_LIMIT * 0.8;
    ctx.save();
    ctx.strokeStyle = danger ? '#ff5d73' : '#46d39a';
    ctx.fillStyle = danger ? '#ff5d73' : '#46d39a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, 9, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - 5, y);
    ctx.lineTo(x + 5, y);
    ctx.moveTo(x, y - 5);
    ctx.lineTo(x, y + 5);
    ctx.stroke();
    ctx.font = 'bold 11px system-ui';
    ctx.textAlign = 'left';
    ctx.fillText(`质心 ${(tilt * 100).toFixed(0)}%`, x + 12, y - 8);
    ctx.restore();
  }
}
