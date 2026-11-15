/* Canvas rendering: panel array, dust, robot, mist, power chart. */
(function () {
  'use strict';
  const Sim = window.SolarSim;

  const droplets = [];

  function spawnMist(state, sceneW, sceneH) {
    if (!state.pumpOn || state.tank <= 0) return;
    const idx = state.activePanel;
    const cellW = sceneW / Sim.PANEL_COUNT;
    const x = cellW * (idx + 0.5);
    const gust = state.wind.gust;
    const drift = gust > 0.55 ? state.wind.side * gust * 60 : 0;
    for (let i = 0; i < 3; i++) {
      droplets.push({
        x: x + (Math.random() - 0.5) * cellW * 0.5,
        y: sceneH * 0.42 + Math.random() * 18,
        vx: drift + (Math.random() - 0.5) * 20,
        vy: 30 + Math.random() * 40,
        life: 0.7 + Math.random() * 0.5,
        r: 1.5 + Math.random() * 2.2
      });
    }
  }

  function updateMist(dt) {
    for (let i = droplets.length - 1; i >= 0; i--) {
      const d = droplets[i];
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.life -= dt;
      if (d.life <= 0) droplets.splice(i, 1);
    }
    if (droplets.length > 260) droplets.splice(0, droplets.length - 260);
  }

  function drawScene(ctx, w, h, state) {
    ctx.clearRect(0, 0, w, h);
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#132c4d');
    sky.addColorStop(1, '#1d3d5c');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    // Ground and rail.
    ctx.fillStyle = '#3a352c';
    ctx.fillRect(0, h * 0.78, w, h * 0.22);
    ctx.strokeStyle = '#7d8aa0';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(20, h * 0.8);
    ctx.lineTo(w - 20, h * 0.8);
    ctx.stroke();

    const cellW = w / Sim.PANEL_COUNT;
    const panelW = cellW * 0.86;
    const panelH = h * 0.34;
    const topY = h * 0.2;

    for (let i = 0; i < Sim.PANEL_COUNT; i++) {
      const sp = state.panels[i];
      const x = cellW * i + cellW * 0.07;
      const y = topY;

      // Support frame.
      ctx.strokeStyle = '#5a6b82';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x + panelW * 0.5, y + panelH);
      ctx.lineTo(x + panelW * 0.5, h * 0.8);
      ctx.stroke();

      // Panel glass: clean blue darkens as dust grows.
      const clean = 1 - sp.dust;
      const r = Math.round(30 + 40 * clean);
      const g = Math.round(70 + 90 * clean);
      const b = Math.round(130 + 90 * clean);
      ctx.fillStyle = 'rgb(' + r + ',' + g + ',' + b + ')';
      ctx.fillRect(x, y, panelW, panelH);

      // Cell grid.
      ctx.strokeStyle = 'rgba(200,225,255,0.18)';
      ctx.lineWidth = 1;
      for (let c = 1; c < 4; c++) {
        ctx.beginPath();
        ctx.moveTo(x + (panelW / 4) * c, y);
        ctx.lineTo(x + (panelW / 4) * c, y + panelH);
        ctx.stroke();
      }
      for (let c = 1; c < 3; c++) {
        ctx.beginPath();
        ctx.moveTo(x, y + (panelH / 3) * c);
        ctx.lineTo(x + panelW, y + (panelH / 3) * c);
        ctx.stroke();
      }

      // Dust film: tan translucent layer proportional to dust.
      if (sp.dust > 0.02) {
        ctx.fillStyle = 'rgba(196,164,110,' + (sp.dust * 0.72).toFixed(3) + ')';
        ctx.fillRect(x, y, panelW, panelH);
      }
      // Wet sheen.
      if (sp.wet > 0.02) {
        ctx.fillStyle = 'rgba(160,210,255,' + (sp.wet * 0.28).toFixed(3) + ')';
        ctx.fillRect(x, y, panelW, panelH);
      }

      // Border: target panels get an amber frame, green when达标.
      ctx.lineWidth = sp.isTarget ? 4 : 2;
      ctx.strokeStyle = sp.isTarget
        ? (sp.recovery >= Sim.TARGET_RECOVERY ? '#54e08a' : '#ffb347')
        : '#2a4060';
      ctx.strokeRect(x, y, panelW, panelH);

      // Labels and per-panel recovery.
      ctx.fillStyle = '#dce6f2';
      ctx.font = '12px sans-serif';
      ctx.fillText('P' + sp.id + (sp.isTarget ? '★' : ''), x + 5, y + 15);
      ctx.fillStyle = sp.recovery >= Sim.TARGET_RECOVERY ? '#54e08a' : '#cfe0f5';
      ctx.fillText(Math.round(sp.recovery * 100) + '%', x + 5, y + panelH - 6);
    }

    drawRobot(ctx, w, h, state, cellW);
    drawMist(ctx);
    drawWindIndicator(ctx, w, state);
  }

  function drawRobot(ctx, w, h, state, cellW) {
    const x = 20 + (state.robotX / Sim.TRACK_LENGTH) * (w - 40);
    const baseY = h * 0.8;
    const bodyW = cellW * 0.62;
    const bodyH = 34;
    const bodyY = baseY - bodyH - h * 0.34 - 6;

    ctx.fillStyle = '#e8eef7';
    ctx.fillRect(x - bodyW / 2, bodyY, bodyW, bodyH);
    ctx.strokeStyle = '#8aa2bd';
    ctx.lineWidth = 2;
    ctx.strokeRect(x - bodyW / 2, bodyY, bodyW, bodyH);

    // Wheels on the rail.
    ctx.fillStyle = '#2b3648';
    ctx.beginPath();
    ctx.arc(x - bodyW * 0.28, baseY - 2, 7, 0, Math.PI * 2);
    ctx.arc(x + bodyW * 0.28, baseY - 2, 7, 0, Math.PI * 2);
    ctx.fill();

    // Rotating brush wheel under the body.
    const spin = state.time * (4 + state.params.speed * 6);
    ctx.save();
    ctx.translate(x, bodyY + bodyH + 9);
    ctx.rotate(spin);
    ctx.fillStyle = state.running ? '#ffb347' : '#8a7a5e';
    for (let i = 0; i < 6; i++) {
      ctx.rotate(Math.PI / 3);
      ctx.fillRect(-2, 0, 4, 11);
    }
    ctx.restore();

    // Spray nozzle.
    if (state.pumpOn) {
      ctx.fillStyle = '#9fd0ff';
      ctx.beginPath();
      ctx.arc(x, bodyY + bodyH + 2, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawMist(ctx) {
    for (const d of droplets) {
      ctx.fillStyle = 'rgba(170,215,255,' + Math.max(0, Math.min(0.7, d.life)).toFixed(2) + ')';
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawWindIndicator(ctx, w, state) {
    const wind = state.wind;
    ctx.fillStyle = '#cfe0f5';
    ctx.font = '13px sans-serif';
    const label = '风 ' + wind.speed.toFixed(1) + ' m/s' +
      (wind.gust > 0.55 ? '  阵风→水雾偏移' + (wind.side > 0 ? '→' : '←') : '');
    ctx.fillText(label, w - ctx.measureText(label).width - 14, 22);
  }

  function drawChart(ctx, w, h, state) {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#0a1320';
    ctx.fillRect(0, 0, w, h);

    // Grid and 90% target line.
    ctx.strokeStyle = '#1d3150';
    ctx.lineWidth = 1;
    for (let g = 0; g <= 4; g++) {
      const y = (h - 24) * (1 - g / 4) + 8;
      ctx.beginPath();
      ctx.moveTo(40, y);
      ctx.lineTo(w - 12, y);
      ctx.stroke();
      ctx.fillStyle = '#7f95b0';
      ctx.font = '11px sans-serif';
      ctx.fillText((g * 25) + '%', 8, y + 4);
    }
    const ty = (h - 24) * (1 - Sim.TARGET_RECOVERY) + 8;
    ctx.strokeStyle = '#ffb347';
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    ctx.moveTo(40, ty);
    ctx.lineTo(w - 12, ty);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#ffb347';
    ctx.fillText('目标 90%', w - 70, ty - 5);

    const hist = state.powerHistory;
    if (hist.length < 2) {
      ctx.fillStyle = '#7f95b0';
      ctx.font = '13px sans-serif';
      ctx.fillText('发电恢复曲线（运行后生成）', 48, h / 2);
      return;
    }
    const tMax = Math.max(hist[hist.length - 1].t, 1);
    ctx.strokeStyle = '#54e08a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    hist.forEach(function (pt, i) {
      const x = 40 + (pt.t / tMax) * (w - 56);
      const y = (h - 24) * (1 - pt.power) + 8;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.fillStyle = '#cfe0f5';
    ctx.font = '12px sans-serif';
    ctx.fillText('整阵发电效率', 44, 18);
  }

  window.Renderer = {
    drawScene: function (ctx, w, h, state, dt) {
      spawnMist(state, w, h);
      updateMist(dt || 0.016);
      drawScene(ctx, w, h, state);
    },
    drawChart: drawChart,
    resetMist: function () { droplets.length = 0; }
  };
})();
