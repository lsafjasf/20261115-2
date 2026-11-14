/* LUMA Color Room — 程序化底图（Canvas 2D 绘制，不加载任何外部图片） */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LUMABase = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const W = 960, H = 640;

  function makeCanvas() {
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    return c;
  }

  /* ---------- 底图 A：海岸公路 ---------- */
  function coastline() {
    const cv = makeCanvas(), ctx = cv.getContext('2d'), rnd = mulberry32(20261115);

    const sky = ctx.createLinearGradient(0, 0, 0, 400);
    sky.addColorStop(0, '#234556'); sky.addColorStop(0.45, '#3d6b78');
    sky.addColorStop(0.72, '#8fb0a8'); sky.addColorStop(0.9, '#e3c198');
    sky.addColorStop(1, '#f2d8b6');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, 400);

    const glow = ctx.createRadialGradient(560, 300, 10, 560, 300, 260);
    glow.addColorStop(0, 'rgba(255,244,214,0.95)'); glow.addColorStop(0.18, 'rgba(255,226,170,0.55)');
    glow.addColorStop(1, 'rgba(255,220,160,0)');
    ctx.fillStyle = glow; ctx.fillRect(0, 0, W, 400);
    ctx.beginPath(); ctx.arc(560, 300, 42, 0, Math.PI * 2);
    ctx.fillStyle = '#fff3d2'; ctx.fill();

    ctx.globalAlpha = 0.5;
    for (let c = 0; c < 7; c++) {
      const cy = 90 + rnd() * 200, cx = 80 + rnd() * 760, cw = 90 + rnd() * 150;
      ctx.fillStyle = rnd() > 0.5 ? '#e9ddc8' : '#cdd6cf';
      for (let k = 0; k < 4; k++) {
        ctx.beginPath();
        ctx.ellipse(cx + k * cw * 0.32, cy + rnd() * 10 - 5, cw * (0.3 + rnd() * 0.18),
                    9 + rnd() * 9, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    ctx.fillStyle = '#33555c';
    hill(ctx, [[0, 392], [120, 360], [240, 388], [360, 396]], 396);
    hill(ctx, [[600, 398], [720, 366], [840, 386], [960, 394]], 398);

    const sea = ctx.createLinearGradient(0, 396, 0, 492);
    sea.addColorStop(0, '#6b9392'); sea.addColorStop(1, '#3c6669');
    ctx.fillStyle = sea; ctx.fillRect(0, 396, W, 96);
    ctx.strokeStyle = 'rgba(220,240,235,0.28)'; ctx.lineWidth = 1.4;
    for (let i = 0; i < 46; i++) {
      const y = 402 + rnd() * 84, x = rnd() * W, len = 18 + rnd() * 70;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + len, y); ctx.stroke();
    }

    ctx.fillStyle = '#5f6250'; ctx.fillRect(0, 492, W, H - 492);
    const ground = ctx.createLinearGradient(0, 492, 0, H);
    ground.addColorStop(0, 'rgba(120,118,92,0.35)'); ground.addColorStop(1, 'rgba(40,44,36,0.55)');
    ctx.fillStyle = ground; ctx.fillRect(0, 492, W, H - 492);

    const hx = 480, topY = 470, botL = 352, botR = 608, topL = hx - 26, topR = hx + 26;
    ctx.beginPath();
    ctx.moveTo(topL - 14, topY); ctx.lineTo(topR + 14, topY);
    ctx.lineTo(botR + 34, H); ctx.lineTo(botL - 34, H); ctx.closePath();
    ctx.fillStyle = '#c7af83'; ctx.fill();
    ctx.beginPath();
    ctx.moveTo(topL, topY); ctx.lineTo(topR, topY); ctx.lineTo(botR, H); ctx.lineTo(botL, H);
    ctx.closePath();
    ctx.fillStyle = '#2c3539'; ctx.fill();

    ctx.strokeStyle = 'rgba(238,232,214,0.85)'; ctx.lineCap = 'round';
    for (let i = 0; i < 9; i++) {
      const t0 = i / 9, t1 = (i + 0.55) / 9;
      const y0 = topY + (H - topY) * t0 * t0, y1 = topY + (H - topY) * t1 * t1;
      ctx.lineWidth = 1.5 + t0 * 4.5;
      ctx.beginPath(); ctx.moveTo(hx, y0); ctx.lineTo(hx, y1); ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(96,110,82,0.8)'; ctx.lineWidth = 1.6;
    for (let i = 0; i < 150; i++) {
      const x = rnd() * W, y = 500 + rnd() * 136;
      if (x > botL - 40 - (y - 500) * 0.9 && x < botR + 40) continue;
      const h = 5 + rnd() * 14;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (rnd() - 0.5) * 5, y - h); ctx.stroke();
    }
    return cv;
  }

  function hill(ctx, pts, baseY) {
    ctx.beginPath(); ctx.moveTo(pts[0][0], baseY);
    for (const [x, y] of pts) ctx.lineTo(x, y);
    ctx.lineTo(pts[pts.length - 1][0], baseY); ctx.closePath(); ctx.fill();
  }

  /* ---------- 底图 B：沙丘花园 ---------- */
  function duneGarden() {
    const cv = makeCanvas(), ctx = cv.getContext('2d'), rnd = mulberry32(424242);

    const sky = ctx.createLinearGradient(0, 0, 0, 360);
    sky.addColorStop(0, '#8ea6b4'); sky.addColorStop(0.55, '#cfae97');
    sky.addColorStop(1, '#f0d4ae');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, 360);

    const sg = ctx.createRadialGradient(650, 175, 8, 650, 175, 200);
    sg.addColorStop(0, 'rgba(255,240,214,0.9)'); sg.addColorStop(1, 'rgba(255,230,190,0)');
    ctx.fillStyle = sg; ctx.fillRect(0, 0, W, 360);
    ctx.beginPath(); ctx.arc(650, 175, 38, 0, Math.PI * 2);
    ctx.fillStyle = '#f7e7cb'; ctx.fill();

    dune(ctx, 300, '#e2bf94', 26);
    dune(ctx, 380, '#cf9d70', 44);
    dune(ctx, 460, '#a9775b', 62);
    dune(ctx, 540, '#7e5648', 80);

    agave(ctx, 180, 560, 1.15, '#3f5549', rnd);
    agave(ctx, 760, 520, 0.9, '#4a6052', rnd);
    agave(ctx, 560, 610, 0.7, '#374d42', rnd);
    agave(ctx, 860, 600, 0.55, '#42584c', rnd);

    ctx.fillStyle = 'rgba(70,48,40,0.55)';
    for (let i = 0; i < 60; i++) {
      const x = rnd() * W, y = 480 + rnd() * 150, r = 1 + rnd() * 2.4;
      ctx.beginPath(); ctx.ellipse(x, y, r * 1.6, r, 0, 0, Math.PI * 2); ctx.fill();
    }
    return cv;
  }

  function dune(ctx, baseY, color, amp) {
    ctx.beginPath(); ctx.moveTo(0, H); ctx.lineTo(0, baseY);
    for (let x = 0; x <= W; x += 24) {
      const y = baseY + Math.sin(x * 0.012 + baseY) * amp * 0.4
                    + Math.sin(x * 0.004 + baseY * 1.7) * amp;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(W, H); ctx.closePath();
    ctx.fillStyle = color; ctx.fill();
  }

  function agave(ctx, cx, cy, scale, color, rnd) {
    const leaves = 12 + Math.floor(rnd() * 4);
    for (let i = 0; i < leaves; i++) {
      const ang = (i / leaves) * Math.PI * 2 + rnd() * 0.25;
      const len = (52 + rnd() * 46) * scale, w = (9 + rnd() * 6) * scale;
      const tipX = cx + Math.cos(ang) * len, tipY = cy + Math.sin(ang) * len * 0.62;
      const c1x = cx + Math.cos(ang) * len * 0.35 - Math.sin(ang) * w;
      const c1y = cy + Math.sin(ang) * len * 0.22 - Math.cos(ang) * w * 0.6;
      const c2x = cx + Math.cos(ang) * len * 0.8 - Math.sin(ang) * w * 0.5;
      const c2y = cy + Math.sin(ang) * len * 0.5 - Math.cos(ang) * w * 0.3;
      ctx.beginPath(); ctx.moveTo(cx, cy);
      ctx.bezierCurveTo(c1x, c1y, c2x, c2y, tipX, tipY);
      ctx.bezierCurveTo(c2x + Math.sin(ang) * w, c2y + Math.cos(ang) * w * 0.6,
                        c1x + Math.sin(ang) * w * 1.6, c1y + Math.cos(ang) * w,
                        cx, cy);
      ctx.closePath();
      ctx.fillStyle = color; ctx.fill();
    }
    ctx.beginPath(); ctx.arc(cx, cy, 7 * scale, 0, Math.PI * 2);
    ctx.fillStyle = '#5d735f'; ctx.fill();
  }

  return { W, H, build: { coastline, duneGarden } };
});
