(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RendererNs = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const COLORS = ['#ffd166', '#6fd3ff', '#ff8fa3', '#9dffb0'];

  function Renderer(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.scaleX = canvas.width / 1000;
    this.scaleY = 0.92;
    this.topPad = canvas.height * 0.08;
  }

  Renderer.prototype.xy = function (x, y) {
    return { sx: x * this.scaleX, sy: this.canvas.height - this.topPad - y * this.scaleY };
  };

  Renderer.prototype.draw = function (state) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.drawSky(state);
    this.drawTerrain(state);
    this.drawWindField(state);
    this.drawZones(state);
    this.drawTrails(state);
    this.drawPlane(state);
    this.drawCrates(state);
  };

  Renderer.prototype.drawSky = function (state) {
    const ctx = this.ctx;
    const g = ctx.createLinearGradient(0, 0, 0, this.canvas.height);
    g.addColorStop(0, '#0b1a30');
    g.addColorStop(1, '#173754');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.fillStyle = 'rgba(255,255,255,.55)';
    ctx.font = '12px sans-serif';
    ctx.fillText('高度 ' + state.altLabel + ' m', 14, this.canvas.height - 12);
  };

  Renderer.prototype.drawTerrain = function (state) {
    const ctx = this.ctx;
    ctx.beginPath();
    const first = this.xy(0, state.ground(0));
    ctx.moveTo(first.sx, this.canvas.height);
    ctx.lineTo(first.sx, first.sy);
    for (let x = 0; x <= 1000; x += 12) {
      const p = this.xy(x, state.ground(x));
      ctx.lineTo(p.sx, p.sy);
    }
    const last = this.xy(1000, state.ground(1000));
    ctx.lineTo(last.sx, this.canvas.height);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, this.canvas.height * 0.55, 0, this.canvas.height);
    g.addColorStop(0, '#3a5a3c');
    g.addColorStop(1, '#223a28');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = '#6f9a63';
    ctx.lineWidth = 2;
    ctx.stroke();
  };

  Renderer.prototype.drawWindField = function (state) {
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = 'rgba(160,215,255,.5)';
    ctx.fillStyle = 'rgba(160,215,255,.7)';
    ctx.lineWidth = 1.4;
    const rows = [180, 320, 460, 580];
    for (const alt of rows) {
      for (let x = 60; x < 1000; x += 140) {
        const w = state.windAt(alt, x, state.time);
        const len = 10 + Math.min(26, Math.abs(w) * 1.6);
        const p = this.xy(x, alt);
        const dir = w >= 0 ? 1 : -1;
        ctx.beginPath();
        ctx.moveTo(p.sx, p.sy);
        ctx.lineTo(p.sx + dir * len, p.sy);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(p.sx + dir * len, p.sy);
        ctx.lineTo(p.sx + dir * (len - 6), p.sy - 3.5);
        ctx.lineTo(p.sx + dir * (len - 6), p.sy + 3.5);
        ctx.fill();
      }
    }
    ctx.restore();
  };

  Renderer.prototype.drawZones = function (state) {
    const ctx = this.ctx;
    for (const z of state.zones) {
      const p = this.xy(z.x, z.y);
      ctx.beginPath();
      ctx.ellipse(p.sx, p.sy, state.radius * this.scaleX, 9, 0, 0, Math.PI * 2);
      ctx.fillStyle = z.delivered ? 'rgba(70,220,150,.28)' : 'rgba(255,120,120,.22)';
      ctx.fill();
      ctx.strokeStyle = z.delivered ? '#46dc96' : '#ff7a7a';
      ctx.setLineDash([6, 5]);
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#eef6ff';
      ctx.font = 'bold 15px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(z.id + (z.delivered ? ' ✓' : ''), p.sx, p.sy - 16);
    }
    ctx.textAlign = 'left';
  };

  Renderer.prototype.drawTrails = function (state) {
    const ctx = this.ctx;
    state.crates.forEach((c, i) => {
      if (c.trail.length < 2) return;
      ctx.beginPath();
      c.trail.forEach((pt, k) => {
        const p = this.xy(pt.x, pt.y);
        if (k === 0) ctx.moveTo(p.sx, p.sy);
        else ctx.lineTo(p.sx, p.sy);
      });
      ctx.strokeStyle = COLORS[i % COLORS.length];
      ctx.globalAlpha = 0.75;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.globalAlpha = 1;
    });
  };

  Renderer.prototype.drawPlane = function (state) {
    const p = this.xy(state.planeX, state.planeAlt);
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(p.sx, p.sy);
    ctx.fillStyle = '#cfd9e6';
    ctx.beginPath();
    ctx.moveTo(-22, 0); ctx.lineTo(24, 0); ctx.lineTo(14, -7); ctx.lineTo(-16, -7);
    ctx.closePath(); ctx.fill();
    ctx.fillRect(-4, -14, 12, 8);
    ctx.fillStyle = '#8fa3bd';
    ctx.fillRect(-20, -3, 8, 6);
    ctx.restore();
  };

  Renderer.prototype.drawCrates = function (state) {
    const ctx = this.ctx;
    state.crates.forEach((c, i) => {
      if (!c.active && !c.landed) return;
      const p = this.xy(c.x, c.y);
      if (c.chute && !c.landed) {
        ctx.strokeStyle = COLORS[i % COLORS.length];
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(p.sx, p.sy);
        ctx.lineTo(p.sx - 12, p.sy - 20);
        ctx.moveTo(p.sx, p.sy);
        ctx.lineTo(p.sx + 12, p.sy - 20);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(p.sx, p.sy - 22, 14, Math.PI, 0);
        ctx.fillStyle = COLORS[i % COLORS.length];
        ctx.fill();
      }
      const color = c.landed ? (c.result.success ? '#46dc96' : '#ff6b6b') : COLORS[i % COLORS.length];
      ctx.fillStyle = color;
      ctx.fillRect(p.sx - 6, p.sy - 6, 12, 12);
      ctx.strokeStyle = '#0d1420';
      ctx.strokeRect(p.sx - 6, p.sy - 6, 12, 12);
      if (c.landed) this.drawResultLabel(c, p.sx, p.sy);
    });
    this.drawPredictions(state);
  };

  Renderer.prototype.drawResultLabel = function (c, sx, sy) {
    const ctx = this.ctx;
    const text = c.result.success ? '送达 ' + c.result.pointId : c.result.reason === 'damaged' ? '损坏' : '飘远';
    ctx.fillStyle = c.result.success ? '#9ff0cf' : '#ffb0b0';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(text, sx, sy - 14);
    ctx.textAlign = 'left';
  };

  Renderer.prototype.drawPredictions = function (state) {
    const ctx = this.ctx;
    state.predictions.forEach((zone, i) => {
      if (!zone || state.crates[i].landed) return;
      const p = this.xy(zone.cx, zone.cy);
      ctx.beginPath();
      ctx.ellipse(p.sx, p.sy, zone.rx * this.scaleX, Math.max(5, zone.ry * this.scaleY), 0, 0, Math.PI * 2);
      ctx.strokeStyle = COLORS[i % COLORS.length];
      ctx.globalAlpha = 0.45;
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1.4;
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    });
  };

  return { Renderer: Renderer, COLORS: COLORS };
});
