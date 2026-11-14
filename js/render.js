/* 雾海双桨 —— Canvas 渲染：浓雾、船迹、罗盘、浮标灯 */
(function () {
  const TAU = Math.PI * 2;

  function makeFogBlobs(count, w, h) {
    const blobs = [];
    for (let i = 0; i < count; i++) {
      blobs.push({
        x: Math.random() * w,
        y: Math.random() * h,
        r: 120 + Math.random() * 260,
        vx: (Math.random() - 0.5) * 8,
        vy: (Math.random() - 0.5) * 5,
        a: 0.05 + Math.random() * 0.08,
      });
    }
    return blobs;
  }

  function drawSea(ctx, cam, w, h, t) {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#0b141c");
    g.addColorStop(1, "#060b10");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(70, 100, 120, 0.10)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 14; i++) {
      const y = ((i * 90 + t * 12) % (h + 90)) - 45;
      ctx.beginPath();
      for (let x = 0; x <= w; x += 40) {
        const yy = y + Math.sin((x + cam.x) * 0.02 + i) * 6;
        x === 0 ? ctx.moveTo(x, yy) : ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
  }

  function drawRocks(ctx, cam, rocks) {
    for (const r of rocks) {
      const x = r.x - cam.x, y = r.y - cam.y;
      ctx.fillStyle = "#222b31";
      ctx.strokeStyle = "#3d4a52";
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * TAU;
        const rr = r.r * (0.8 + 0.25 * Math.sin(i * 3.7 + r.x));
        const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }

  function drawBuoys(ctx, cam, buoys, t) {
    for (const b of buoys) {
      const x = b.x - cam.x, y = b.y - cam.y;
      const blink = Math.sin(t * 3 + b.phase) > 0;
      const color = b.passed ? "#69f0ae" : blink ? "#ff5252" : "#5a1f1f";
      const glow = ctx.createRadialGradient(x, y - 14, 2, x, y - 14, 60);
      glow.addColorStop(0, b.passed ? "rgba(105,240,174,0.5)" : blink ? "rgba(255,82,82,0.55)" : "rgba(255,82,82,0.06)");
      glow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(x - 60, y - 74, 120, 120);
      ctx.fillStyle = "#37474f";
      ctx.beginPath();
      ctx.moveTo(x - 10, y);
      ctx.lineTo(x + 10, y);
      ctx.lineTo(x + 5, y - 16);
      ctx.lineTo(x - 5, y - 16);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y - 20, 5, 0, TAU);
      ctx.fill();
    }
  }

  function drawBoat(ctx, cam, boat) {
    const x = boat.x - cam.x, y = boat.y - cam.y;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((boat.heading * Math.PI) / 180);
    ctx.fillStyle = "#6d4c41";
    ctx.strokeStyle = "#a1887f";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(16, 0);
    ctx.quadraticCurveTo(6, 8, -12, 6);
    ctx.lineTo(-12, -6);
    ctx.quadraticCurveTo(6, -8, 16, 0);
    ctx.fill();
    ctx.stroke();
    const sailA = (boat.sailAngle * Math.PI) / 180;
    ctx.strokeStyle = "#eceff1";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(sailA) * 4 - Math.sin(sailA) * -14, Math.sin(sailA) * 14);
    ctx.stroke();
    ctx.restore();
  }

  function drawWake(ctx, cam, wake) {
    for (const p of wake) {
      const life = p.life / p.maxLife;
      ctx.fillStyle = `rgba(150, 200, 220, ${0.25 * life})`;
      ctx.beginPath();
      ctx.arc(p.x - cam.x, p.y - cam.y, 2 + (1 - life) * 7, 0, TAU);
      ctx.fill();
    }
  }

  function drawFog(ctx, cam, blobs, w, h, boatScreen) {
    for (const b of blobs) {
      const x = ((b.x - cam.x * 0.3) % (w + 400)) - 200;
      const y = ((b.y - cam.y * 0.3) % (h + 400)) - 200;
      const g = ctx.createRadialGradient(x, y, 0, x, y, b.r);
      g.addColorStop(0, `rgba(180, 195, 205, ${b.a})`);
      g.addColorStop(1, "rgba(180,195,205,0)");
      ctx.fillStyle = g;
      ctx.fillRect(x - b.r, y - b.r, b.r * 2, b.r * 2);
    }
    const v = ctx.createRadialGradient(
      boatScreen.x, boatScreen.y, 140,
      boatScreen.x, boatScreen.y, 460
    );
    v.addColorStop(0, "rgba(10,16,22,0)");
    v.addColorStop(1, "rgba(160,175,185,0.55)");
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, w, h);
  }

  function drawCompass(ctx, cx, cy, radius, heading, bearing, jitter) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = "rgba(8, 14, 20, 0.8)";
    ctx.strokeStyle = "#546e7a";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, TAU);
    ctx.fill();
    ctx.stroke();
    for (let d = 0; d < 360; d += 10) {
      const a = ((d - 90) * Math.PI) / 180;
      const major = d % 30 === 0;
      const r1 = radius - (major ? 14 : 7);
      ctx.strokeStyle = major ? "#90a4ae" : "#546e7a";
      ctx.lineWidth = major ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r1, Math.sin(a) * r1);
      ctx.lineTo(Math.cos(a) * (radius - 2), Math.sin(a) * (radius - 2));
      ctx.stroke();
      if (major) {
        ctx.fillStyle = "#b0bec5";
        ctx.font = "10px monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(d), Math.cos(a) * (radius - 24), Math.sin(a) * (radius - 24));
      }
    }
    const shown = heading + jitter;
    const ha = ((shown - 90) * Math.PI) / 180;
    ctx.strokeStyle = "#ef5350";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(ha) * (radius - 30), Math.sin(ha) * (radius - 30));
    ctx.stroke();
    const ba = ((bearing - 90) * Math.PI) / 180;
    ctx.fillStyle = "#ffd54f";
    ctx.beginPath();
    ctx.arc(Math.cos(ba) * (radius - 8), Math.sin(ba) * (radius - 8), 5, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  window.FogRender = {
    makeFogBlobs, drawSea, drawRocks, drawBuoys, drawBoat, drawWake, drawFog, drawCompass,
  };
})();
