/* render.js — Canvas 渲染：山脉、形变索桥、吊篮、风迹粒子、平台货堆、HUD。 */
(function (root) {
  'use strict';

  function BridgeRenderer(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.windTrails = [];
    this.lastWind = 1.2;
  }

  BridgeRenderer.prototype.resize = function () {
    const dpr = window.devicePixelRatio || 1;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.W = w;
    this.H = h;
  };

  // 物理坐标（米，跨度 60、y 向下为正）→ 画布坐标
  BridgeRenderer.prototype.map = function (engine, x, y) {
    const padX = 46;
    const topY = 70;
    const scale = (this.W - padX * 2) / engine.cfg.SPAN;
    return {
      x: padX + x * scale,
      y: topY + (y + 2) * (scale * 0.92)
    };
  };

  BridgeRenderer.prototype.spawnWind = function (wind) {
    if (wind <= this.lastWind && this.windTrails.length > 40) return;
    const gust = Math.max(0, wind - 1.2);
    const count = Math.min(4, 1 + Math.floor(gust / 3));
    for (let i = 0; i < count; i++) {
      this.windTrails.push({
        x: this.W + 20,
        y: 40 + Math.random() * (this.H - 120),
        len: 18 + Math.random() * 34,
        speed: 2.2 + gust * 0.32,
        life: 1
      });
    }
    this.lastWind = wind;
  };

  BridgeRenderer.prototype.drawBackground = function () {
    const { ctx, W, H } = this;
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#1b2a4a');
    sky.addColorStop(0.55, '#3a4a6b');
    sky.addColorStop(1, '#6d5a54');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);
    // 远山两层
    this.drawRidge(H * 0.62, '#2c3852', 0.7);
    this.drawRidge(H * 0.74, '#242d42', 1.3);
  };

  BridgeRenderer.prototype.drawRidge = function (baseY, color, phase) {
    const { ctx, W, H } = this;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let x = 0; x <= W; x += 24) {
      const y = baseY - Math.abs(Math.sin(x * 0.012 * phase + phase)) * 70
        - Math.sin(x * 0.03 + phase) * 18;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fill();
  };

  BridgeRenderer.prototype.drawTowersAndDeck = function (engine) {
    const { ctx } = this;
    const left = this.map(engine, 0, 0);
    const right = this.map(engine, engine.cfg.SPAN, 0);
    const groundY = this.map(engine, 0, 26).y;
    ctx.strokeStyle = '#8a93a8';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(left.x, groundY);
    ctx.lineTo(left.x, left.y);
    ctx.moveTo(right.x, groundY);
    ctx.lineTo(right.x, right.y);
    ctx.stroke();
    ctx.fillStyle = '#6b7286';
    ctx.fillRect(left.x - 14, groundY - 6, 28, 10);
    ctx.fillRect(right.x - 14, groundY - 6, 28, 10);
  };

  BridgeRenderer.prototype.drawCable = function (engine) {
    const { ctx } = this;
    const pts = engine.nodes.map(n => this.map(engine, n.x, n.y));
    const ratio = Math.min(1, engine.stress);
    const hot = engine.stress > 0.85;
    ctx.lineCap = 'round';
    // 索体：应力越高越偏红
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      const local = Math.min(1, engine.stress * (0.7 + 0.6 * i / pts.length));
      ctx.strokeStyle = hot
        ? `rgb(${200 + 55 * local},${90 - 50 * local},${60 - 40 * local})`
        : `rgb(${120 + 110 * local},${150 - 70 * local},${200 - 150 * local})`;
      ctx.lineWidth = 2.6;
      ctx.stroke();
    }
    // 节点
    ctx.fillStyle = 'rgba(220,228,245,0.85)';
    pts.forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 1.6, 0, Math.PI * 2);
      ctx.fill();
    });
  };

  BridgeRenderer.prototype.drawCar = function (engine) {
    const { ctx } = this;
    const E = root.BridgeEngine;
    const an = E.carAnchor(engine);
    const bk = E.carBasket(engine);
    const p1 = this.map(engine, an.x, an.y);
    const p2 = this.map(engine, bk.x, bk.y);
    // 吊索
    ctx.strokeStyle = '#c7cfe0';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
    // 吊篮
    const w = 34;
    const h = 22;
    ctx.save();
    ctx.translate(p2.x, p2.y);
    ctx.rotate(engine.theta * 0.5);
    ctx.fillStyle = engine.status === 'failed' ? '#7a3535' : '#d9a441';
    ctx.fillRect(-w / 2, -2, w, h);
    ctx.strokeStyle = '#f0d9a0';
    ctx.lineWidth = 2;
    ctx.strokeRect(-w / 2, -2, w, h);
    // 货物块
    const colors = { A: '#e06c6c', B: '#6cb2e0', C: '#7ed08a' };
    let drawn = 0;
    for (const id of ['A', 'B', 'C']) {
      for (let k = 0; k < engine.carCargo[id]; k++) {
        const col = drawn % 5;
        const row = Math.floor(drawn / 5);
        ctx.fillStyle = colors[id];
        ctx.fillRect(-w / 2 + 2 + col * 6, h - 5 - row * 5, 5, 4);
        drawn++;
      }
    }
    ctx.restore();
  };

  BridgeRenderer.prototype.drawStations = function (engine) {
    const { ctx } = this;
    const defs = [
      { s: 0, label: '左平台', key: 'left' },
      { s: 0.5, label: '中途站', key: 'mid' },
      { s: 1, label: '右平台', key: 'right' }
    ];
    defs.forEach(d => {
      const wx = d.s * engine.cfg.SPAN;
      const p = this.map(engine, wx, 4);
      ctx.fillStyle = d.key === 'mid' ? '#5b6b8c' : '#4c5569';
      ctx.fillRect(p.x - 26, p.y + 26, 52, 8);
      ctx.fillStyle = '#cfd8ec';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(d.label, p.x, p.y + 48);
      const pile = engine.piles[d.key];
      const colors = { A: '#e06c6c', B: '#6cb2e0', C: '#7ed08a' };
      let xOff = -20;
      for (const id of ['A', 'B', 'C']) {
        const n = pile[id] || 0;
        for (let k = 0; k < Math.min(n, 9); k++) {
          ctx.fillStyle = colors[id];
          ctx.fillRect(p.x + xOff, p.y + 20 - (k % 3) * 4, 6, 4);
          xOff += 7;
          if (xOff > 20) xOff = -20;
        }
      }
    });
  };

  BridgeRenderer.prototype.drawWindTrails = function (dt) {
    const { ctx } = this;
    ctx.strokeStyle = 'rgba(200,220,255,0.35)';
    ctx.lineWidth = 1.4;
    this.windTrails = this.windTrails.filter(tr => tr.life > 0);
    for (const tr of this.windTrails) {
      tr.x -= tr.speed * 60 * dt;
      tr.life -= dt * 0.25;
      ctx.globalAlpha = Math.max(0, tr.life) * 0.6;
      ctx.beginPath();
      ctx.moveTo(tr.x, tr.y);
      ctx.quadraticCurveTo(tr.x - tr.len * 0.5, tr.y - 4, tr.x - tr.len, tr.y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  };

  BridgeRenderer.prototype.render = function (engine, dt) {
    this.resize();
    this.drawBackground();
    this.drawTowersAndDeck(engine);
    this.drawStations(engine);
    this.drawCable(engine);
    this.drawCar(engine);
    this.spawnWind(engine.wind);
    this.drawWindTrails(dt);
  };

  root.BridgeRenderer = BridgeRenderer;
})(window);
