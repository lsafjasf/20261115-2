 (function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./sim.js'));
  else root.TugRender = factory(root.TugSim);
})(typeof self !== 'undefined' ? self : this, function (S) {
  'use strict';
  const env = typeof window !== 'undefined' ? window :
    typeof self !== 'undefined' ? self : globalThis;

  function Renderer(canvas, sim) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.sim = sim;
    this.cam = { x: sim.tug.x, y: sim.tug.y, zoom: 0.92 };
    this.foldMarks = [];
  }

  Renderer.prototype.resize = function () {
    const dpr = (env && env.devicePixelRatio) || 1;
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.round(rect.width * dpr);
    this.canvas.height = Math.round(rect.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.w = rect.width;
    this.h = rect.height;
  };

  Renderer.prototype.toScreen = function (x, y) {
    return [
      (x - this.cam.x) * this.cam.zoom + this.w / 2,
      (y - this.cam.y) * this.cam.zoom + this.h / 2
    ];
  };

  Renderer.prototype.updateCamera = function (dt) {
    const lead = 70;
    const tx = this.sim.tug.x + Math.cos(this.sim.tug.angle) * lead;
    const ty = this.sim.tug.y + Math.sin(this.sim.tug.angle) * lead;
    const k = Math.min(1, dt * 2.4);
    this.cam.x += (tx - this.cam.x) * k;
    this.cam.y += (ty - this.cam.y) * k;
  };

  Renderer.prototype.drawRiver = function () {
    const ctx = this.ctx;
    const sim = this.sim;
    const left = [], right = [];
    for (const seg of sim.river.segs) {
      for (let u = 0; u <= 1.0001; u += 0.25) {
        const cx = seg.ax + seg.tx * seg.len * u;
        const cy = seg.ay + seg.ty * seg.len * u;
        left.push(this.toScreen(cx + seg.nx * sim.halfWidth, cy + seg.ny * sim.halfWidth));
        right.push(this.toScreen(cx - seg.nx * sim.halfWidth, cy - seg.ny * sim.halfWidth));
      }
    }
    ctx.fillStyle = '#3a5a3c';
    ctx.fillRect(0, 0, this.w, this.h);
    ctx.beginPath();
    left.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]));
    for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i][0], right[i][1]);
    ctx.closePath();
    ctx.fillStyle = '#2b6f8f';
    ctx.fill();
    ctx.strokeStyle = '#8a6f4d';
    ctx.lineWidth = 6;
    ctx.beginPath();
    left.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]));
    ctx.stroke();
    ctx.beginPath();
    right.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]));
    ctx.stroke();
  };

  Renderer.prototype.drawCenterline = function () {
    const ctx = this.ctx;
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 14]);
    ctx.beginPath();
    let first = true;
    for (const seg of this.sim.river.segs) {
      for (let u = 0; u <= 1.0001; u += 0.2) {
        const p = this.toScreen(seg.ax + seg.tx * seg.len * u, seg.ay + seg.ty * seg.len * u);
        first ? (ctx.moveTo(p[0], p[1]), first = false) : ctx.lineTo(p[0], p[1]);
      }
    }
    ctx.stroke();
    ctx.setLineDash([]);
  };

  Renderer.prototype.drawBridges = function () {
    const ctx = this.ctx;
    const sim = this.sim;
    S.BRIDGES.forEach((bridge, idx) => {
      const c = sim.riverAt(bridge.s);
      const hw = sim.halfWidth + 26;
      const p1 = this.toScreen(c.x + c.nx * hw, c.y + c.ny * hw);
      const p2 = this.toScreen(c.x - c.nx * hw, c.y - c.ny * hw);
      const open = sim.bridgeOpen(idx, sim.time);
      ctx.lineWidth = 14;
      ctx.strokeStyle = open ? '#6d4c2f' : '#b23b2e';
      ctx.beginPath();
      ctx.moveTo(p1[0], p1[1]);
      ctx.lineTo(p2[0], p2[1]);
      ctx.stroke();
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.moveTo(p1[0], p1[1]);
      ctx.lineTo(p2[0], p2[1]);
      ctx.stroke();
      const label = this.toScreen(c.x, c.y);
      const clearance = sim.bridgeClearance(bridge, sim.time);
      ctx.fillStyle = open ? '#d8f0d2' : '#ffd2cc';
      ctx.font = '13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('桥' + (idx + 1) + ' 净空' + clearance.toFixed(2) + 'm', label[0], label[1] - 16);
    });
  };

  Renderer.prototype.drawDock = function () {
    const ctx = this.ctx;
    const sim = this.sim;
    for (let s = S.DOCK_STATION; s < S.DOCK_STATION + 320; s += 24) {
      const c = sim.riverAt(Math.min(s, sim.river.length - 1));
      for (const side of [-1, 1]) {
        const p = this.toScreen(c.x + c.nx * (sim.halfWidth - 6) * side,
          c.y + c.ny * (sim.halfWidth - 6) * side);
        ctx.fillStyle = '#d9b36c';
        ctx.fillRect(p[0] - 4, p[1] - 4, 8, 8);
      }
    }
    const gate = sim.riverAt(S.DOCK_STATION);
    const gp = this.toScreen(gate.x, gate.y);
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 3;
    ctx.setLineDash([8, 8]);
    ctx.beginPath();
    const a = this.toScreen(gate.x + gate.nx * sim.halfWidth, gate.y + gate.ny * sim.halfWidth);
    const b = this.toScreen(gate.x - gate.nx * sim.halfWidth, gate.y - gate.ny * sim.halfWidth);
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#fff';
    ctx.font = '15px sans-serif';
    ctx.fillText('码头', gp[0], gp[1] - 14);
  };

  Renderer.prototype.drawBody = function (body, color, isTug) {
    const ctx = this.ctx;
    const p = this.toScreen(body.x, body.y);
    ctx.save();
    ctx.translate(p[0], p[1]);
    ctx.rotate(body.angle);
    ctx.scale(this.cam.zoom, this.cam.zoom);
    ctx.fillStyle = color;
    ctx.strokeStyle = '#1c1c1c';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.rect(-body.len / 2, -body.wid / 2, body.len, body.wid);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-body.len / 2 + 6, 0);
    ctx.lineTo(body.len / 2 - 6, 0);
    ctx.stroke();
    if (isTug) {
      ctx.fillStyle = '#222';
      ctx.fillRect(body.len / 2 - 12, -body.wid / 2 + 3, 8, body.wid - 6);
    }
    if (body.damage > 0) {
      ctx.fillStyle = 'rgba(255,80,60,' + Math.min(0.85, body.damage / 60) + ')';
      ctx.fillRect(-body.len / 2, -body.wid / 2, body.len, body.wid);
    }
    ctx.restore();
  };

  Renderer.prototype.drawCables = function () {
    const ctx = this.ctx;
    const sim = this.sim;
    const links = sim.cableEndpoints();
    links.forEach((link, i) => {
      const a = this.toScreen(link.ax, link.ay);
      const b = this.toScreen(link.bx, link.by);
      const tension = sim.cableTension[i];
      const hot = Math.min(1, tension / 900);
      ctx.strokeStyle = sim.cableBroken[i] ? '#777' :
        'rgb(' + Math.round(80 + hot * 175) + ',' + Math.round(70 + (1 - hot) * 120) + ',60)';
      ctx.lineWidth = 2 + hot * 2.5;
      ctx.setLineDash(sim.cableBroken[i] ? [4, 6] : []);
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.stroke();
      ctx.setLineDash([]);
    });
  };

  Renderer.prototype.drawFoldMarks = function (dt) {
    const ctx = this.ctx;
    while (this.sim.foldEvents.length > this.foldMarks.length) {
      const ev = this.sim.foldEvents[this.foldMarks.length];
      this.foldMarks.push({ x: ev.x, y: ev.y, life: 1.4 });
    }
    this.foldMarks = this.foldMarks.filter((m) => (m.life -= dt) > 0);
    for (const m of this.foldMarks) {
      const p = this.toScreen(m.x, m.y);
      ctx.strokeStyle = 'rgba(255,90,70,' + Math.max(0, m.life / 1.4) + ')';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(p[0], p[1], (1.4 - m.life) * 34 + 8, 0, Math.PI * 2);
      ctx.stroke();
    }
  };

  Renderer.prototype.render = function (dt) {
    this.updateCamera(dt);
    this.drawRiver();
    this.drawCenterline();
    this.drawDock();
    this.drawBridges();
    this.drawCables();
    this.drawBody(this.sim.tug, '#e0a33d', true);
    this.sim.barges.forEach((b, i) =>
      this.drawBody(b, ['#c9543f', '#4f86c6', '#5aa469'][i % 3], false));
    this.drawFoldMarks(dt);
  };

  return { Renderer };
});
