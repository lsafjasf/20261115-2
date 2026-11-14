(function () {
  "use strict";

  const BP = (window.BP = window.BP || {});
  const U = BP.utils;

  function roundRect(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
  }

  class Renderer {
    constructor(canvas, game) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.game = game;
      this.time = 0;
      this.layout = null;
      this.pixelRatio = 1;
      this.starSeeds = [];
      this.waveMarks = [];
      this.alertPulse = 0;
      this.resize = this.resize.bind(this);
      this.observer = new ResizeObserver(this.resize);
      this.observer.observe(canvas.parentElement);
      this.resize();
      this.makeAmbientMarks();
    }

    setGame(game) {
      this.game = game;
    }

    makeAmbientMarks() {
      const random = U.mulberry32(407091);
      this.starSeeds = Array.from({ length: 45 }, () => ({
        x: random(),
        y: random(),
        size: 0.4 + random() * 1.25,
        alpha: 0.08 + random() * 0.2,
        phase: random() * U.TAU
      }));
      this.waveMarks = Array.from({ length: 70 }, () => ({
        x: random(),
        y: random(),
        length: 3 + random() * 17,
        speed: 0.4 + random() * 1.6,
        alpha: 0.035 + random() * 0.09
      }));
    }

    resize() {
      const rect = this.canvas.parentElement.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      this.pixelRatio = ratio;
      this.W = Math.max(320, rect.width);
      this.H = Math.max(420, rect.height);
      this.canvas.width = Math.round(this.W * ratio);
      this.canvas.height = Math.round(this.H * ratio);
      this.canvas.style.width = `${this.W}px`;
      this.canvas.style.height = `${this.H}px`;
      const margin = Math.max(10, Math.min(22, this.W * 0.014));
      const chartHeight = Math.max(220, this.H * 0.51);
      const gap = Math.max(8, this.H * 0.012);
      const panelY = margin + chartHeight + gap;
      const panelHeight = this.H - panelY - margin;
      const panelWidth = (this.W - margin * 3) / 2;
      this.layout = {
        margin,
        chart: {
          x: margin,
          y: margin,
          w: this.W - margin * 2,
          h: chartHeight
        },
        left: {
          x: margin,
          y: panelY,
          w: panelWidth,
          h: panelHeight
        },
        right: {
          x: margin * 2 + panelWidth,
          y: panelY,
          w: panelWidth,
          h: panelHeight
        }
      };
    }

    render(dt) {
      const ctx = this.ctx;
      this.time += Math.min(dt, 0.05);
      this.alertPulse += Math.min(dt, 0.05);
      ctx.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
      ctx.clearRect(0, 0, this.W, this.H);
      this.drawStageBackdrop();
      this.drawChart();
      this.drawStation(this.layout.left, "nav");
      this.drawStation(this.layout.right, "engine");
      this.drawFrame();
    }

    drawStageBackdrop() {
      const ctx = this.ctx;
      const gradient = ctx.createLinearGradient(0, 0, 0, this.H);
      gradient.addColorStop(0, "#04141d");
      gradient.addColorStop(0.56, "#061a22");
      gradient.addColorStop(1, "#031016");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, this.W, this.H);

      const glow = ctx.createRadialGradient(
        this.W * 0.72, this.H * 0.1, 0,
        this.W * 0.72, this.H * 0.1, this.W * 0.5
      );
      glow.addColorStop(0, "rgba(73, 110, 103, 0.08)");
      glow.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, this.W, this.H);
    }

    drawFrame() {
      const ctx = this.ctx;
      const m = this.layout.margin;
      ctx.save();
      ctx.strokeStyle = "rgba(154, 211, 211, 0.17)";
      ctx.lineWidth = 1;
      ctx.strokeRect(m + 0.5, m + 0.5, this.W - m * 2 - 1, this.H - m * 2 - 1);
      const corner = Math.min(17, this.W * 0.018);
      ctx.strokeStyle = "rgba(255, 174, 98, 0.34)";
      ctx.beginPath();
      ctx.moveTo(m, m + corner);
      ctx.lineTo(m, m);
      ctx.lineTo(m + corner, m);
      ctx.moveTo(this.W - m - corner, this.H - m);
      ctx.lineTo(this.W - m, this.H - m);
      ctx.lineTo(this.W - m, this.H - m - corner);
      ctx.stroke();
      ctx.restore();
    }

    drawChart() {
      const ctx = this.ctx;
      const box = this.layout.chart;
      const game = this.game;
      const field = game.field;
      const header = Math.max(33, box.h * 0.105);
      const footer = Math.max(24, box.h * 0.078);
      const mapPad = Math.max(14, box.w * 0.012);
      const map = {
        x: box.x + mapPad,
        y: box.y + header,
        w: box.w - mapPad * 2,
        h: box.h - header - footer
      };
      const sx = map.w / field.width;
      const sy = map.h / field.height;
      const project = (x, y) => ({ x: map.x + x * sx, y: map.y + y * sy });

      ctx.save();
      roundRect(ctx, box.x, box.y, box.w, box.h, 4);
      ctx.clip();
      const ocean = ctx.createLinearGradient(map.x, map.y, map.x, map.y + map.h);
      ocean.addColorStop(0, "#071e27");
      ocean.addColorStop(0.48, "#08252d");
      ocean.addColorStop(1, "#06171e");
      ctx.fillStyle = ocean;
      ctx.fillRect(map.x, map.y, map.w, map.h);

      const haze = ctx.createRadialGradient(
        map.x + map.w * 0.82, map.y + map.h * 0.46, 0,
        map.x + map.w * 0.82, map.y + map.h * 0.46, map.w * 0.4
      );
      haze.addColorStop(0, "rgba(121, 180, 170, 0.07)");
      haze.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = haze;
      ctx.fillRect(map.x, map.y, map.w, map.h);

      this.drawChartGrid(map, sx, sy);
      this.drawWaterMarks(map);
      this.drawReefs(map, project, sx, sy);
      this.drawSonar(map, project, sx);
      this.drawTrail(map, project);
      this.drawStartAndGoal(map, project, field);
      this.drawBoat(map, project, game.boat, sx);
      this.drawChartChrome(box, map, header, footer, project, field, game);
      ctx.restore();
    }

    drawChartGrid(map, sx, sy) {
      const ctx = this.ctx;
      ctx.save();
      ctx.strokeStyle = "rgba(113, 176, 177, 0.07)";
      ctx.lineWidth = 1;
      for (let worldX = 0; worldX <= 2800; worldX += 200) {
        const x = map.x + worldX * sx;
        ctx.beginPath();
        ctx.moveTo(x, map.y);
        ctx.lineTo(x, map.y + map.h);
        ctx.stroke();
      }
      for (let worldY = 0; worldY <= 1000; worldY += 200) {
        const y = map.y + worldY * sy;
        ctx.beginPath();
        ctx.moveTo(map.x, y);
        ctx.lineTo(map.x + map.w, y);
        ctx.stroke();
      }
      ctx.strokeStyle = "rgba(126, 184, 182, 0.035)";
      for (let i = 0; i < 5; i += 1) {
        ctx.beginPath();
        const baseY = map.y + map.h * (0.15 + i * 0.18);
        ctx.moveTo(map.x, baseY);
        ctx.bezierCurveTo(
          map.x + map.w * 0.3, baseY - 13,
          map.x + map.w * 0.7, baseY + 17,
          map.x + map.w, baseY - 4
        );
        ctx.stroke();
      }
      ctx.restore();
    }

    drawWaterMarks(map) {
      const ctx = this.ctx;
      const wave = this.game.field.wave;
      const direction = wave.direction * U.DEG;
      const vx = Math.sin(direction);
      const vy = -Math.cos(direction);
      ctx.save();
      ctx.strokeStyle = "rgba(117, 199, 194, 0.12)";
      ctx.lineWidth = 1;
      for (const mark of this.waveMarks) {
        const drift = (this.time * 7 * mark.speed) % (map.w + 80);
        const x = map.x + ((mark.x * (map.w + 80) + vx * drift) % (map.w + 80)) - 40;
        const y = map.y + mark.y * map.h + vy * (this.time * 5 * mark.speed);
        const wrappedY = map.y + ((y - map.y + map.h * 4) % map.h);
        ctx.globalAlpha = mark.alpha;
        ctx.beginPath();
        ctx.moveTo(x, wrappedY);
        ctx.lineTo(x + vx * mark.length, wrappedY + vy * mark.length);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    drawReefs(map, project, sx, sy) {
      const ctx = this.ctx;
      const game = this.game;
      const boat = game.boat;
      const scanning = game.mode === "running" && game.elapsed < game.sonarRevealUntil;
      ctx.save();
      for (const reef of game.field.reefs) {
        const distance = U.dist(boat.x, boat.y, reef.x, reef.y);
        const visible = (scanning && distance <= game.sonarRevealRadius) || distance < 92;
        if (!visible) continue;
        const point = project(reef.x, reef.y);
        if (
          point.x < map.x - 40 || point.x > map.x + map.w + 40 ||
          point.y < map.y - 40 || point.y > map.y + map.h + 40
        ) continue;
        const radius = Math.max(2.5, reef.r * Math.min(sx, sy) * 0.92);
        const reveal = scanning
          ? U.clamp((game.sonarRevealUntil - game.elapsed) / 1.1, 0, 1)
          : 1;
        ctx.globalAlpha = (distance < 92 ? 0.9 : 0.58) * reveal;
        const halo = ctx.createRadialGradient(point.x, point.y, 0, point.x, point.y, radius * 2.1);
        halo.addColorStop(0, "rgba(87, 200, 185, 0.14)");
        halo.addColorStop(1, "rgba(87, 200, 185, 0)");
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(point.x, point.y, radius * 2.1, 0, U.TAU);
        ctx.fill();

        ctx.beginPath();
        reef.shape.forEach((part, index) => {
          const px = point.x + part.x * radius / reef.r;
          const py = point.y + part.y * radius / reef.r;
          if (index === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        ctx.closePath();
        ctx.fillStyle = `rgba(${22 + Math.floor(reef.shade * 14)}, ${51 + Math.floor(reef.shade * 18)}, ${55 + Math.floor(reef.shade * 16)}, 0.9)`;
        ctx.fill();
        ctx.strokeStyle = "rgba(139, 208, 198, 0.18)";
        ctx.lineWidth = 0.7;
        ctx.stroke();
        if (radius > 6) {
          ctx.beginPath();
          ctx.moveTo(point.x - radius * 0.36, point.y - radius * 0.16);
          ctx.lineTo(point.x + radius * 0.08, point.y - radius * 0.55);
          ctx.strokeStyle = "rgba(201, 235, 218, 0.11)";
          ctx.stroke();
        }
      }
      ctx.restore();
    }

    drawSonar(map, project, sx) {
      const ctx = this.ctx;
      const game = this.game;
      const sy = map.h / game.field.height;
      ctx.save();
      for (const pulse of game.sonarPulses) {
        const point = project(pulse.x, pulse.y);
        const rx = Math.min(map.w, pulse.radius * sx);
        const ry = Math.min(map.h, pulse.radius * sy);
        const fade = U.clamp(1 - pulse.age / pulse.duration, 0, 1);
        ctx.strokeStyle = `rgba(128, 244, 223, ${0.45 * fade})`;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.ellipse(point.x, point.y, rx, ry, 0, 0, U.TAU);
        ctx.stroke();
        ctx.strokeStyle = `rgba(128, 244, 223, ${0.13 * fade})`;
        ctx.beginPath();
        ctx.ellipse(point.x, point.y, rx * 0.72, ry * 0.72, 0, 0, U.TAU);
        ctx.stroke();
      }
      ctx.restore();
    }

    drawTrail(map, project) {
      const ctx = this.ctx;
      ctx.save();
      ctx.fillStyle = "rgba(255, 174, 98, 0.3)";
      for (const point of this.game.trail) {
        const mapped = project(point.x, point.y);
        ctx.globalAlpha = U.clamp(1 - point.age / 18, 0, 1) * 0.35;
        ctx.beginPath();
        ctx.arc(mapped.x, mapped.y, 1.3, 0, U.TAU);
        ctx.fill();
      }
      ctx.restore();
    }

    drawStartAndGoal(map, project, field) {
      const ctx = this.ctx;
      const start = project(field.start.x, field.start.y);
      const goal = project(field.lighthouse.x, field.lighthouse.y);
      ctx.save();

      ctx.strokeStyle = "rgba(255, 174, 98, 0.3)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(start.x, start.y, 9, 0, U.TAU);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(start.x - 12, start.y);
      ctx.lineTo(start.x + 12, start.y);
      ctx.moveTo(start.x, start.y - 12);
      ctx.lineTo(start.x, start.y + 12);
      ctx.stroke();

      const beamAngle = this.time * 0.34;
      const goalGlow = ctx.createRadialGradient(goal.x, goal.y, 0, goal.x, goal.y, 58);
      goalGlow.addColorStop(0, "rgba(255, 223, 151, 0.38)");
      goalGlow.addColorStop(0.35, "rgba(255, 190, 99, 0.1)");
      goalGlow.addColorStop(1, "rgba(255, 190, 99, 0)");
      ctx.fillStyle = goalGlow;
      ctx.beginPath();
      ctx.arc(goal.x, goal.y, 58, 0, U.TAU);
      ctx.fill();
      ctx.fillStyle = "rgba(255, 225, 163, 0.1)";
      ctx.beginPath();
      ctx.moveTo(goal.x, goal.y);
      ctx.arc(goal.x, goal.y, 86, beamAngle, beamAngle + 0.22);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#ffe0a1";
      ctx.beginPath();
      ctx.arc(goal.x, goal.y, 3.2, 0, U.TAU);
      ctx.fill();
      ctx.strokeStyle = "rgba(255, 214, 146, 0.58)";
      ctx.beginPath();
      ctx.arc(goal.x, goal.y, 8, 0, U.TAU);
      ctx.stroke();
      ctx.fillStyle = "rgba(255, 222, 162, 0.78)";
      ctx.font = "500 8px ui-monospace, 'Boat Sans SC', monospace";
      ctx.textAlign = "right";
      ctx.fillText("LIGHTHOUSE", goal.x - 10, goal.y - 9);
      ctx.restore();
    }

    drawBoat(map, project, boat, sx) {
      const ctx = this.ctx;
      const point = project(boat.x, boat.y);
      const heading = boat.heading * U.DEG;
      const size = U.clamp(8 + sx * 11, 8, 15);
      ctx.save();
      const glow = ctx.createRadialGradient(point.x, point.y, 0, point.x, point.y, size * 3);
      glow.addColorStop(0, "rgba(255, 191, 115, 0.28)");
      glow.addColorStop(1, "rgba(255, 174, 98, 0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(point.x, point.y, size * 3, 0, U.TAU);
      ctx.fill();

      ctx.translate(point.x, point.y);
      ctx.rotate(heading);
      ctx.beginPath();
      ctx.moveTo(0, -size);
      ctx.lineTo(size * 0.52, size * 0.7);
      ctx.lineTo(0, size * 0.32);
      ctx.lineTo(-size * 0.52, size * 0.7);
      ctx.closePath();
      ctx.fillStyle = "#ffb66d";
      ctx.fill();
      ctx.strokeStyle = "rgba(255, 242, 213, 0.82)";
      ctx.lineWidth = 0.9;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, -size - 2);
      ctx.lineTo(0, -size - 15);
      ctx.strokeStyle = "rgba(255, 183, 106, 0.36)";
      ctx.stroke();
      ctx.restore();

      if (boat.groundSpeed > 70) {
        ctx.save();
        ctx.strokeStyle = "rgba(131, 226, 214, 0.18)";
        ctx.lineWidth = 1;
        const back = heading + Math.PI;
        for (let i = 0; i < 3; i += 1) {
          const offset = (this.time * 28 + i * 8) % 24;
          const bx = point.x + Math.sin(back) * (size + offset);
          const by = point.y - Math.cos(back) * (size + offset);
          ctx.beginPath();
          ctx.arc(bx, by, 2 + i * 1.2, 0, U.TAU);
          ctx.stroke();
        }
        ctx.restore();
      }
    }

    drawChartChrome(box, map, header, footer, project, field, game) {
      const ctx = this.ctx;
      const pad = Math.max(14, box.w * 0.012);
      const compact = box.w < 560;
      ctx.save();
      ctx.fillStyle = "rgba(4, 17, 24, 0.9)";
      ctx.fillRect(box.x, box.y, box.w, header);
      ctx.strokeStyle = "rgba(132, 190, 190, 0.13)";
      ctx.beginPath();
      ctx.moveTo(box.x + pad, box.y + header);
      ctx.lineTo(box.x + box.w - pad, box.y + header);
      ctx.stroke();

      ctx.textBaseline = "middle";
      ctx.fillStyle = "rgba(137, 240, 223, 0.78)";
      ctx.font = "500 9px ui-monospace, 'Boat Sans SC', monospace";
      ctx.fillText(compact ? "SONAR / 共享声呐图" : "SONAR CHART / 共享声呐海图", box.x + pad, box.y + header / 2);

      const passed = game.passedGates;
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(149, 184, 184, 0.8)";
      ctx.font = "500 9px ui-monospace, 'Boat Sans SC', monospace";
      if (!compact) ctx.fillText(`礁区 ${passed} / 4`, box.x + box.w * 0.57, box.y + header / 2);

      const remaining = Math.max(0, U.dist(game.boat.x, game.boat.y, field.lighthouse.x, field.lighthouse.y) / 1000);
      ctx.textAlign = "right";
      ctx.fillStyle = "rgba(255, 195, 126, 0.8)";
      ctx.fillText(`${compact ? "" : "灯塔 "}${remaining.toFixed(2)} NM`, box.x + box.w - pad, box.y + header / 2);

      ctx.fillStyle = "rgba(3, 13, 19, 0.86)";
      ctx.fillRect(box.x, box.y + box.h - footer, box.w, footer);
      ctx.strokeStyle = "rgba(132, 190, 190, 0.1)";
      ctx.beginPath();
      ctx.moveTo(box.x + pad, box.y + box.h - footer);
      ctx.lineTo(box.x + box.w - pad, box.y + box.h - footer);
      ctx.stroke();

      ctx.textAlign = "left";
      ctx.fillStyle = "rgba(88, 126, 129, 0.9)";
      ctx.font = "500 8px ui-monospace, 'Boat Sans SC', monospace";
      ctx.fillText(
        compact
          ? `SEED ${field.seedText}`
          : `SEED ${field.seedText} · 主航道净空 ${Math.round(field.validation.minClearance)}m`,
        box.x + pad,
        box.y + box.h - footer / 2
      );

      const railX = box.x + box.w * 0.68;
      const railY = box.y + box.h - footer / 2;
      if (!compact) {
        ctx.strokeStyle = "rgba(125, 183, 183, 0.14)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(railX, railY);
        ctx.lineTo(railX + box.w * 0.155, railY);
        ctx.stroke();
        field.gates.forEach((gate, index) => {
          const x = railX + index * box.w * 0.046;
          ctx.beginPath();
          ctx.arc(x, railY, 3, 0, U.TAU);
          ctx.fillStyle = gate.passed ? "#ffaf64" : "rgba(113, 157, 159, 0.35)";
          ctx.fill();
        });
      }

      if (game.mode === "running") {
        const active = game.pingCooldown > 0;
        ctx.textAlign = "right";
        ctx.fillStyle = active ? "rgba(86, 121, 123, 0.9)" : "rgba(137, 240, 223, 0.72)";
        ctx.font = "500 8px ui-monospace, 'Boat Sans SC', monospace";
        const label = active
          ? `${compact ? "声呐" : "声呐充能"} ${Math.ceil(game.pingCooldown * 10) / 10}s`
          : compact ? "SPACE 声呐" : "SPACE · 声呐扫描";
        ctx.fillText(label, box.x + box.w - pad, box.y + box.h - footer / 2);
      }
      ctx.restore();
    }

    drawStation(panel, kind) {
      const ctx = this.ctx;
      const nav = kind === "nav";
      const accent = nav ? [255, 174, 98] : [115, 216, 231];
      ctx.save();
      roundRect(ctx, panel.x, panel.y, panel.w, panel.h, 4);
      ctx.clip();
      const bg = ctx.createLinearGradient(panel.x, panel.y, panel.x, panel.y + panel.h);
      if (nav) {
        bg.addColorStop(0, "rgba(20, 28, 27, 0.96)");
        bg.addColorStop(0.55, "rgba(10, 24, 26, 0.97)");
        bg.addColorStop(1, "rgba(9, 19, 20, 0.98)");
      } else {
        bg.addColorStop(0, "rgba(10, 29, 34, 0.97)");
        bg.addColorStop(0.55, "rgba(7, 24, 30, 0.98)");
        bg.addColorStop(1, "rgba(6, 18, 24, 0.98)");
      }
      ctx.fillStyle = bg;
      ctx.fillRect(panel.x, panel.y, panel.w, panel.h);

      const topGlow = ctx.createRadialGradient(
        panel.x + panel.w * (nav ? 0.22 : 0.8),
        panel.y,
        0,
        panel.x + panel.w * (nav ? 0.22 : 0.8),
        panel.y,
        panel.w * 0.65
      );
      topGlow.addColorStop(0, `rgba(${accent.join(",")}, 0.07)`);
      topGlow.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = topGlow;
      ctx.fillRect(panel.x, panel.y, panel.w, panel.h);
      this.drawStationGrid(panel, accent);
      this.drawStationHeader(panel, kind, accent);

      const innerTop = panel.y + Math.max(34, panel.h * 0.12);
      const controlTop = panel.y + panel.h - Math.max(44, panel.h * 0.15);
      const instrumentH = controlTop - innerTop - 7;
      if (nav) {
        const radius = Math.max(30, Math.min(instrumentH * 0.39, panel.w * 0.205));
        this.drawCompass(
          panel.x + panel.w * 0.28,
          innerTop + instrumentH * 0.48,
          radius,
          this.game.boat.heading
        );
        this.drawWaveDial(
          panel.x + panel.w * 0.71,
          innerTop + instrumentH * 0.46,
          radius * 0.88,
          this.game.field.wave.direction,
          this.game.field.wave.strength
        );
        this.drawRudder(panel, controlTop, accent);
      } else {
        this.drawDepth(
          panel.x + Math.max(15, panel.w * 0.025),
          innerTop,
          panel.w * 0.56,
          instrumentH,
          accent
        );
        const compact = panel.w < 330;
        const gaugeRadius = compact
          ? Math.max(26, Math.min(instrumentH * 0.28, panel.w * 0.16))
          : Math.max(34, Math.min(instrumentH * 0.37, panel.w * 0.17));
        this.drawTempGauge(
          panel.x + panel.w * (compact ? 0.81 : 0.79),
          innerTop + instrumentH * 0.44,
          gaugeRadius,
          this.game.boat.temp
        );
        this.drawThrottle(panel, controlTop, accent);
      }

      ctx.strokeStyle = `rgba(${accent.join(",")}, 0.3)`;
      ctx.lineWidth = 1;
      roundRect(ctx, panel.x + 0.5, panel.y + 0.5, panel.w - 1, panel.h - 1, 4);
      ctx.stroke();
      this.drawStationAlert(panel, nav, accent);
      ctx.restore();
    }

    drawStationGrid(panel, accent) {
      const ctx = this.ctx;
      ctx.save();
      ctx.strokeStyle = `rgba(${accent.join(",")}, 0.025)`;
      ctx.lineWidth = 1;
      const step = Math.max(20, panel.w * 0.055);
      for (let x = panel.x + step; x < panel.x + panel.w; x += step) {
        ctx.beginPath();
        ctx.moveTo(Math.round(x) + 0.5, panel.y + 35);
        ctx.lineTo(Math.round(x) + 0.5, panel.y + panel.h);
        ctx.stroke();
      }
      for (let y = panel.y + 35 + step; y < panel.y + panel.h; y += step) {
        ctx.beginPath();
        ctx.moveTo(panel.x, Math.round(y) + 0.5);
        ctx.lineTo(panel.x + panel.w, Math.round(y) + 0.5);
        ctx.stroke();
      }
      ctx.restore();
    }

    drawStationHeader(panel, kind, accent) {
      const ctx = this.ctx;
      const h = Math.max(34, panel.h * 0.12);
      const pad = Math.max(12, panel.w * 0.022);
      const compact = panel.w < 330;
      ctx.save();
      ctx.fillStyle = "rgba(2, 12, 17, 0.46)";
      ctx.fillRect(panel.x, panel.y, panel.w, h);
      ctx.strokeStyle = `rgba(${accent.join(",")}, 0.18)`;
      ctx.beginPath();
      ctx.moveTo(panel.x + pad, panel.y + h);
      ctx.lineTo(panel.x + panel.w - pad, panel.y + h);
      ctx.stroke();

      const index = kind === "nav" ? "01" : "02";
      const label = kind === "nav" ? "领航席" : "轮机席";
      const english = kind === "nav" ? "NAVIGATOR" : "ENGINEER";
      ctx.textBaseline = "middle";
      ctx.fillStyle = `rgba(${accent.join(",")}, 0.46)`;
      ctx.font = "500 9px ui-monospace, 'Boat Sans SC', monospace";
      ctx.fillText(index, panel.x + pad, panel.y + h / 2);
      ctx.fillStyle = `rgba(${accent.join(",")}, 0.94)`;
      ctx.font = "600 11px ui-monospace, 'Boat Sans SC', monospace";
      ctx.fillText(label, panel.x + pad + 22, panel.y + h / 2);
      if (!compact) {
        ctx.fillStyle = "rgba(111, 148, 150, 0.8)";
        ctx.font = "500 8px ui-monospace, 'Boat Sans SC', monospace";
        ctx.fillText(english, panel.x + pad + 62, panel.y + h / 2);

        const status = kind === "nav" ? "只读 · 航向 / 浪向" : "只读 · 水深 / 油温";
        ctx.textAlign = "right";
        ctx.fillStyle = "rgba(112, 147, 148, 0.7)";
        ctx.font = "500 8px ui-monospace, 'Boat Sans SC', monospace";
        ctx.fillText(status, panel.x + panel.w - pad, panel.y + h / 2);
      }
      ctx.restore();
    }

    drawCompass(cx, cy, radius, heading) {
      const ctx = this.ctx;
      const r = Math.max(24, radius);
      ctx.save();
      const face = ctx.createRadialGradient(cx - r * 0.25, cy - r * 0.3, 1, cx, cy, r);
      face.addColorStop(0, "rgba(48, 61, 54, 0.74)");
      face.addColorStop(0.72, "rgba(16, 29, 28, 0.94)");
      face.addColorStop(1, "rgba(7, 18, 19, 0.98)");
      ctx.fillStyle = face;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, U.TAU);
      ctx.fill();
      ctx.strokeStyle = "rgba(255, 174, 98, 0.42)";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.strokeStyle = "rgba(255, 202, 143, 0.08)";
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.8, 0, U.TAU);
      ctx.stroke();

      for (let angle = 0; angle < 360; angle += 5) {
        const major = angle % 30 === 0;
        const middle = angle % 10 === 0;
        const length = major ? r * 0.11 : middle ? r * 0.07 : r * 0.035;
        const theta = angle * U.DEG;
        const x1 = cx + Math.sin(theta) * r * 0.92;
        const y1 = cy - Math.cos(theta) * r * 0.92;
        const x2 = cx + Math.sin(theta) * (r * 0.92 - length);
        const y2 = cy - Math.cos(theta) * (r * 0.92 - length);
        ctx.strokeStyle = major ? "rgba(255, 208, 154, 0.42)" : "rgba(154, 196, 190, 0.18)";
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }

      const cardinals = [
        { label: "N", angle: 0 },
        { label: "E", angle: 90 },
        { label: "S", angle: 180 },
        { label: "W", angle: 270 }
      ];
      ctx.font = `600 ${Math.max(7, Math.round(r * 0.12))}px ui-monospace, 'Boat Sans SC', monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      cardinals.forEach((item, index) => {
        const theta = item.angle * U.DEG;
        const x = cx + Math.sin(theta) * r * 0.68;
        const y = cy - Math.cos(theta) * r * 0.68;
        ctx.fillStyle = index === 0 ? "rgba(255, 206, 150, 0.92)" : "rgba(134, 169, 165, 0.58)";
        ctx.fillText(item.label, x, y);
      });

      const theta = heading * U.DEG;
      const tipX = cx + Math.sin(theta) * r * 0.6;
      const tipY = cy - Math.cos(theta) * r * 0.6;
      const tailX = cx - Math.sin(theta) * r * 0.26;
      const tailY = cy + Math.cos(theta) * r * 0.26;
      ctx.strokeStyle = "#ffb76e";
      ctx.lineWidth = Math.max(1.1, r * 0.018);
      ctx.beginPath();
      ctx.moveTo(tailX, tailY);
      ctx.lineTo(tipX, tipY);
      ctx.stroke();
      ctx.fillStyle = "#ffd09b";
      ctx.beginPath();
      const perp = theta + Math.PI / 2;
      ctx.moveTo(tipX, tipY);
      ctx.lineTo(
        cx + Math.sin(theta) * r * 0.45 + Math.cos(perp) * r * 0.055,
        cy - Math.cos(theta) * r * 0.45 + Math.sin(perp) * r * 0.055
      );
      ctx.lineTo(
        cx + Math.sin(theta) * r * 0.45 - Math.cos(perp) * r * 0.055,
        cy - Math.cos(theta) * r * 0.45 - Math.sin(perp) * r * 0.055
      );
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#ffb76e";
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(2, r * 0.035), 0, U.TAU);
      ctx.fill();

      ctx.fillStyle = "rgba(122, 155, 152, 0.8)";
      ctx.font = "500 7px ui-monospace, 'Boat Sans SC', monospace";
      ctx.fillText("HDG", cx, cy - r * 0.43);
      ctx.fillStyle = "#ffe2be";
      ctx.font = `500 ${Math.max(12, Math.round(r * 0.22))}px ui-monospace, 'Boat Sans SC', monospace`;
      ctx.fillText(`${String(Math.round(heading) % 360).padStart(3, "0")}°`, cx, cy + r * 0.4);
      ctx.restore();
    }

    drawWaveDial(cx, cy, radius, direction, strength) {
      const ctx = this.ctx;
      const r = Math.max(23, radius);
      ctx.save();
      ctx.fillStyle = "rgba(4, 18, 22, 0.6)";
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, U.TAU);
      ctx.fill();
      ctx.strokeStyle = "rgba(126, 196, 187, 0.25)";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.strokeStyle = "rgba(114, 170, 164, 0.09)";
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.72, 0, U.TAU);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.42, 0, U.TAU);
      ctx.stroke();

      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.84, 0, U.TAU);
      ctx.clip();
      ctx.strokeStyle = "rgba(112, 212, 200, 0.22)";
      for (let i = 0; i < 4; i += 1) {
        const offset = ((this.time * 15 + i * 13) % (r * 2)) - r;
        ctx.beginPath();
        for (let x = -r; x <= r; x += 3) {
          const y = cy + offset + Math.sin((x / r) * 5 + this.time * 2 + i) * 2.5;
          if (x === -r) ctx.moveTo(cx + x, y);
          else ctx.lineTo(cx + x, y);
        }
        ctx.stroke();
      }
      ctx.restore();

      const theta = direction * U.DEG;
      const length = r * (0.35 + U.clamp(strength / 28, 0, 0.2));
      const x2 = cx + Math.sin(theta) * length;
      const y2 = cy - Math.cos(theta) * length;
      ctx.strokeStyle = "rgba(124, 231, 212, 0.9)";
      ctx.lineWidth = Math.max(1.2, r * 0.022);
      ctx.beginPath();
      ctx.moveTo(cx - Math.sin(theta) * r * 0.15, cy + Math.cos(theta) * r * 0.15);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.fillStyle = "#a5f1e3";
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - Math.sin(theta - 0.55) * r * 0.12, y2 + Math.cos(theta - 0.55) * r * 0.12);
      ctx.lineTo(x2 - Math.sin(theta + 0.55) * r * 0.12, y2 + Math.cos(theta + 0.55) * r * 0.12);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = "rgba(116, 164, 161, 0.8)";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = "500 7px ui-monospace, 'Boat Sans SC', monospace";
      ctx.fillText("浪向", cx, cy - r * 0.45);
      ctx.fillStyle = "#bcefe8";
      ctx.font = `500 ${Math.max(11, Math.round(r * 0.19))}px ui-monospace, 'Boat Sans SC', monospace`;
      ctx.fillText(`${String(Math.round(direction) % 360).padStart(3, "0")}°`, cx, cy + r * 0.4);
      ctx.fillStyle = "rgba(118, 157, 154, 0.9)";
      ctx.font = "500 7px ui-monospace, 'Boat Sans SC', monospace";
      ctx.fillText(`${(strength / 10).toFixed(1)} kn SET`, cx, cy + r + 10);
      ctx.restore();
    }

    drawRudder(panel, top, accent) {
      const ctx = this.ctx;
      const bottomPad = Math.max(7, panel.h * 0.025);
      const pad = Math.max(13, panel.w * 0.025);
      const rowBottom = panel.y + panel.h - bottomPad;
      const trackY = top + Math.max(14, rowBottom - top) * 0.58;
      const trackLeft = panel.x + pad + 31;
      const trackRight = panel.x + panel.w - pad - 31;
      const center = (trackLeft + trackRight) / 2;
      ctx.save();
      ctx.strokeStyle = `rgba(${accent.join(",")}, 0.17)`;
      ctx.beginPath();
      ctx.moveTo(panel.x + pad, top - 1);
      ctx.lineTo(panel.x + panel.w - pad, top - 1);
      ctx.stroke();

      ctx.fillStyle = "rgba(255, 174, 98, 0.76)";
      ctx.font = "600 9px ui-monospace, 'Boat Sans SC', monospace";
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";
      ctx.fillText("A", panel.x + pad + 4, trackY);
      ctx.textAlign = "right";
      ctx.fillText("D", panel.x + panel.w - pad - 4, trackY);

      ctx.strokeStyle = "rgba(137, 167, 163, 0.18)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(trackLeft, trackY);
      ctx.lineTo(trackRight, trackY);
      ctx.stroke();
      ctx.strokeStyle = "rgba(255, 174, 98, 0.15)";
      for (let i = 0; i <= 8; i += 1) {
        const x = U.lerp(trackLeft, trackRight, i / 8);
        ctx.beginPath();
        ctx.moveTo(x, trackY - 3);
        ctx.lineTo(x, trackY + 3);
        ctx.stroke();
      }

      const value = this.game.input.nav || 0;
      const knobX = center + value * (trackRight - trackLeft) * 0.46;
      ctx.fillStyle = "rgba(255, 174, 98, 0.12)";
      ctx.fillRect(center, trackY - 4, knobX - center, 8);
      ctx.fillStyle = value === 0 ? "rgba(255, 195, 133, 0.8)" : "#ffb66d";
      ctx.beginPath();
      ctx.arc(knobX, trackY, 4.2, 0, U.TAU);
      ctx.fill();
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(255, 202, 146, 0.72)";
      ctx.font = "500 8px ui-monospace, 'Boat Sans SC', monospace";
      ctx.fillText(value < 0 ? "左满舵" : value > 0 ? "右满舵" : "正舵", center, top + 8);
      ctx.restore();
    }

    drawDepth(x, y, width, height, accent) {
      const ctx = this.ctx;
      const boat = this.game.boat;
      const history = this.game.depthHistory;
      const compact = width < 150;
      const titleSize = Math.max(7, Math.min(9, width * 0.027));
      const metricSize = Math.max(17, Math.min(30, width * 0.095));
      const valueColor = boat.depth < 3.1
        ? "#ff9b78"
        : boat.depth < 6
          ? "#ffd08f"
          : "#d9f6ee";
      const trend = history.length > 7
        ? history[history.length - 1] - history[Math.max(0, history.length - 8)]
        : 0;
      ctx.save();
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";
      ctx.fillStyle = "rgba(117, 216, 231, 0.7)";
      ctx.font = `500 ${titleSize}px ui-monospace, 'Boat Sans SC', monospace`;
      ctx.fillText("DEPTH SOUNDER", x, y + 9);
      ctx.fillStyle = valueColor;
      ctx.font = `500 ${metricSize}px ui-monospace, 'Boat Sans SC', monospace`;
      const depthText = boat.depth.toFixed(1);
      ctx.fillText(depthText, x, y + metricSize + 12);
      const textWidth = ctx.measureText(depthText).width;
      ctx.fillStyle = "rgba(146, 183, 184, 0.7)";
      ctx.font = `500 ${Math.max(8, titleSize + 1)}px ui-monospace, 'Boat Sans SC', monospace`;
      ctx.fillText("m", x + textWidth + 3, y + metricSize + 10);

      if (!compact) {
        const trendText = trend < -0.18 ? "↓ 变浅" : trend > 0.18 ? "↑ 变深" : "— 稳定";
        ctx.textAlign = "right";
        ctx.fillStyle = trend < -0.18 ? "rgba(255, 170, 110, 0.9)" : "rgba(116, 195, 190, 0.72)";
        ctx.font = `500 ${titleSize}px ui-monospace, 'Boat Sans SC', monospace`;
        ctx.fillText(trendText, x + width - 4, y + 10);
      }

      const graphTop = y + Math.max(42, height * 0.25);
      const graphHeight = Math.max(30, height - (graphTop - y));
      const graphWidth = width - 4;
      const graph = { x, y: graphTop, w: graphWidth, h: graphHeight };
      ctx.fillStyle = "rgba(2, 15, 21, 0.58)";
      ctx.fillRect(graph.x, graph.y, graph.w, graph.h);
      ctx.strokeStyle = "rgba(116, 183, 185, 0.12)";
      ctx.strokeRect(graph.x + 0.5, graph.y + 0.5, graph.w - 1, graph.h - 1);

      ctx.font = "500 7px ui-monospace, 'Boat Sans SC', monospace";
      ctx.textAlign = "right";
      ctx.textBaseline = "alphabetic";
      for (let depth = 5; depth <= 20; depth += 5) {
        const lineY = graph.y + graph.h - (depth / 20) * graph.h;
        ctx.strokeStyle = "rgba(112, 180, 183, 0.08)";
        ctx.beginPath();
        ctx.moveTo(graph.x, lineY);
        ctx.lineTo(graph.x + graph.w, lineY);
        ctx.stroke();
        ctx.fillStyle = "rgba(103, 148, 151, 0.56)";
        ctx.fillText(`${depth}`, graph.x + graph.w - 4, lineY - 2);
      }

      const shallowY = graph.y + graph.h - (3.1 / 20) * graph.h;
      ctx.strokeStyle = "rgba(255, 126, 97, 0.3)";
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(graph.x, shallowY);
      ctx.lineTo(graph.x + graph.w, shallowY);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.beginPath();
      const count = history.length;
      for (let i = 0; i < count; i += 1) {
        const value = history[i];
        const px = graph.x + (i / Math.max(1, count - 1)) * graph.w;
        const py = graph.y + graph.h - U.clamp(value / 20, 0, 1) * graph.h;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      const stroke = ctx.createLinearGradient(graph.x, 0, graph.x + graph.w, 0);
      stroke.addColorStop(0, "rgba(99, 181, 184, 0.2)");
      stroke.addColorStop(1, boat.depth < 3.1 ? "rgba(255, 154, 112, 0.9)" : "rgba(121, 231, 219, 0.72)");
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1.1;
      ctx.stroke();

      const lastValue = history[history.length - 1] || boat.depth;
      const lastY = graph.y + graph.h - U.clamp(lastValue / 20, 0, 1) * graph.h;
      ctx.fillStyle = boat.depth < 3.1 ? "#ff9a72" : "rgba(128, 241, 222, 0.9)";
      ctx.beginPath();
      ctx.arc(graph.x + graph.w, lastY, 2.2, 0, U.TAU);
      ctx.fill();
      ctx.restore();
    }

    drawTempGauge(cx, cy, radius, temp) {
      const ctx = this.ctx;
      const r = Math.max(28, radius);
      const start = Math.PI * 0.75;
      const end = Math.PI * 2.25;
      const normalized = U.clamp((temp - 20) / 100, 0, 1);
      ctx.save();
      ctx.fillStyle = "rgba(4, 17, 23, 0.74)";
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, U.TAU);
      ctx.fill();
      ctx.strokeStyle = "rgba(115, 216, 231, 0.19)";
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.lineWidth = Math.max(4, r * 0.065);
      ctx.strokeStyle = "rgba(111, 155, 156, 0.13)";
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.81, start, end);
      ctx.stroke();
      ctx.strokeStyle = "rgba(99, 215, 199, 0.38)";
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.81, start, start + (end - start) * 0.64);
      ctx.stroke();
      ctx.strokeStyle = "rgba(255, 192, 109, 0.44)";
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.81, start + (end - start) * 0.64, start + (end - start) * 0.8);
      ctx.stroke();
      ctx.strokeStyle = "rgba(255, 103, 90, 0.48)";
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.81, start + (end - start) * 0.8, end);
      ctx.stroke();

      ctx.strokeStyle = "rgba(129, 171, 168, 0.22)";
      ctx.lineWidth = 1;
      for (let mark = 0; mark <= 4; mark += 1) {
        const angle = start + normalized * 0 + (mark / 4) * (end - start);
        const x1 = cx + Math.cos(angle) * r * 0.81;
        const y1 = cy + Math.sin(angle) * r * 0.81;
        const x2 = cx + Math.cos(angle) * r * 0.71;
        const y2 = cy + Math.sin(angle) * r * 0.71;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }

      const needleAngle = start + normalized * (end - start);
      const hot = temp > 100;
      ctx.strokeStyle = hot ? "#ff7663" : "#ffd08e";
      ctx.lineWidth = Math.max(1.1, r * 0.025);
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(needleAngle) * r * 0.26, cy + Math.sin(needleAngle) * r * 0.26);
      ctx.lineTo(cx + Math.cos(needleAngle) * r * 0.73, cy + Math.sin(needleAngle) * r * 0.73);
      ctx.stroke();
      ctx.fillStyle = hot ? "#ff8c74" : "#ffd18d";
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(2, r * 0.038), 0, U.TAU);
      ctx.fill();

      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "rgba(114, 169, 171, 0.8)";
      ctx.font = "500 7px ui-monospace, 'Boat Sans SC', monospace";
      ctx.fillText("ENGINE °C", cx, cy - r * 0.3);
      ctx.fillStyle = hot ? "#ff9780" : "#d9f7ef";
      ctx.font = `500 ${Math.max(12, Math.round(r * 0.27))}px ui-monospace, 'Boat Sans SC', monospace`;
      ctx.fillText(`${Math.round(temp)}°`, cx, cy + r * 0.27);
      ctx.fillStyle = hot ? "rgba(255, 125, 103, 0.9)" : "rgba(111, 190, 181, 0.7)";
      ctx.font = "500 7px ui-monospace, 'Boat Sans SC', monospace";
      ctx.fillText(hot ? "OVERHEAT" : temp > 88 ? "LOAD HIGH" : "NOMINAL", cx, cy + r * 0.63);
      ctx.restore();
    }

    drawThrottle(panel, top, accent) {
      const ctx = this.ctx;
      const bottomPad = Math.max(7, panel.h * 0.025);
      const pad = Math.max(13, panel.w * 0.025);
      const rowBottom = panel.y + panel.h - bottomPad;
      const rowHeight = Math.max(14, rowBottom - top);
      const trackY = top + rowHeight * 0.64;
      const trackLeft = panel.x + pad + 31;
      const trackRight = panel.x + panel.w - pad - 31;
      const throttle = this.game.boat.throttle;
      ctx.save();
      ctx.strokeStyle = `rgba(${accent.join(",")}, 0.17)`;
      ctx.beginPath();
      ctx.moveTo(panel.x + pad, top - 1);
      ctx.lineTo(panel.x + panel.w - pad, top - 1);
      ctx.stroke();
      ctx.textBaseline = "middle";
      ctx.fillStyle = "rgba(115, 216, 231, 0.74)";
      ctx.font = "600 9px ui-monospace, 'Boat Sans SC', monospace";
      ctx.textAlign = "left";
      ctx.fillText("S", panel.x + pad + 4, trackY);
      ctx.textAlign = "right";
      ctx.fillText("W", panel.x + panel.w - pad - 4, trackY);

      ctx.strokeStyle = "rgba(137, 167, 163, 0.18)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(trackLeft, trackY);
      ctx.lineTo(trackRight, trackY);
      ctx.stroke();
      const fillEnd = U.lerp(trackLeft, trackRight, throttle);
      ctx.strokeStyle = "rgba(119, 229, 218, 0.72)";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(trackLeft, trackY);
      ctx.lineTo(fillEnd, trackY);
      ctx.stroke();
      ctx.strokeStyle = "rgba(115, 216, 231, 0.15)";
      for (let i = 0; i <= 8; i += 1) {
        const x = U.lerp(trackLeft, trackRight, i / 8);
        ctx.beginPath();
        ctx.moveTo(x, trackY - 3);
        ctx.lineTo(x, trackY + 3);
        ctx.stroke();
      }
      ctx.fillStyle = "#99ecdf";
      ctx.beginPath();
      ctx.arc(fillEnd, trackY, 4.2, 0, U.TAU);
      ctx.fill();
      ctx.textAlign = "center";
      const gear = throttle < 0.12 ? "停车" : throttle < 0.42 ? "慢车" : throttle < 0.78 ? "巡航" : "全速";
      ctx.fillStyle = "rgba(131, 220, 214, 0.78)";
      ctx.font = "500 8px ui-monospace, 'Boat Sans SC', monospace";
      ctx.fillText(`${Math.round(throttle * 100)}% · ${gear}`, (trackLeft + trackRight) / 2, top + 8);
      ctx.restore();
    }

    drawStationAlert(panel, nav, accent) {
      const ctx = this.ctx;
      const boat = this.game.boat;
      let alert = null;
      if (nav && boat.hull < 3) alert = ["rgba(255, 104, 87, 0.82)", "HULL"];
      if (!nav && boat.temp > 100) alert = ["rgba(255, 104, 87, 0.86)", "HOT"];
      if (!nav && boat.depth < 3.1 && !alert) alert = ["rgba(255, 174, 98, 0.85)", "SHOAL"];
      if (!alert) return;
      const pulse = 0.55 + Math.sin(this.alertPulse * 5.5) * 0.25;
      ctx.save();
      ctx.globalAlpha = pulse;
      ctx.fillStyle = alert[0];
      ctx.beginPath();
      ctx.arc(panel.x + panel.w - Math.max(72, panel.w * 0.105), panel.y + Math.max(17, panel.h * 0.06), 3, 0, U.TAU);
      ctx.fill();
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillStyle = alert[0];
      ctx.font = "600 8px ui-monospace, 'Boat Sans SC', monospace";
      ctx.fillText(alert[1], panel.x + panel.w - Math.max(63, panel.w * 0.093), panel.y + Math.max(17, panel.h * 0.06));
      ctx.restore();
    }
  }

  BP.Renderer = Renderer;
})();





