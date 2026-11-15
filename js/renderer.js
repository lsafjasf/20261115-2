(function () {
  "use strict";

  const TAU = Math.PI * 2;
  const COLORS = {
    ink: "#0d1316",
    steel: "#25343c",
    steelLight: "#526972",
    fog: "#8babb8",
    hot: "#ff5a32",
    warm: "#ffb24d",
    cold: "#74d9ff",
    good: "#b7e36b"
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function mixColor(a, b, t) {
    return [
      Math.round(lerp(a[0], b[0], t)),
      Math.round(lerp(a[1], b[1], t)),
      Math.round(lerp(a[2], b[2], t))
    ];
  }

  function rgb(color, alpha) {
    return `rgba(${color[0]},${color[1]},${color[2]},${alpha === undefined ? 1 : alpha})`;
  }

  function heatColor(temp, alpha) {
    const stops = [
      [50, [31, 75, 113]],
      [160, [38, 122, 163]],
      [300, [96, 179, 196]],
      [430, [226, 213, 122]],
      [560, [250, 158, 70]],
      [700, [255, 105, 55]],
      [850, [255, 63, 35]],
      [930, [255, 115, 78]]
    ];
    const t = clamp(temp, 50, 930);
    for (let i = 0; i < stops.length - 1; i += 1) {
      if (t <= stops[i + 1][0]) {
        const local = (t - stops[i][0]) / (stops[i + 1][0] - stops[i][0]);
        return rgb(mixColor(stops[i][1], stops[i + 1][1], local), alpha);
      }
    }
    return rgb(stops[stops.length - 1][1], alpha);
  }

  function roundedRect(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  class FoundryRenderer {
    constructor(foundryCanvas, curveCanvas) {
      this.canvas = foundryCanvas;
      this.ctx = foundryCanvas.getContext("2d");
      this.curveCanvas = curveCanvas;
      this.curveCtx = curveCanvas.getContext("2d");
      this.width = 0;
      this.height = 0;
      this.dpr = 1;
      this.particles = [];
      this.spawnClock = 0;
      this.frameTime = 0;
      this.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      this.observeResize();
    }

    observeResize() {
      const resize = () => this.resize();
      if (typeof ResizeObserver !== "undefined") {
        this.resizeObserver = new ResizeObserver(resize);
        this.resizeObserver.observe(this.canvas.parentElement);
        this.resizeObserver.observe(this.curveCanvas.parentElement);
      } else {
        window.addEventListener("resize", resize);
      }
      resize();
    }

    resize() {
      const setup = (canvas) => {
        const rect = canvas.getBoundingClientRect();
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const width = Math.max(1, Math.floor(rect.width));
        const height = Math.max(1, Math.floor(rect.height));
        canvas.width = Math.floor(width * dpr);
        canvas.height = Math.floor(height * dpr);
        const ctx = canvas.getContext("2d");
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        return { width, height };
      };
      this.dims = setup(this.canvas);
      this.curveDims = setup(this.curveCanvas);
    }

    render(snapshot, dt) {
      this.frameTime += dt;
      this.updateParticles(snapshot, dt);
      this.drawScene(snapshot);
      this.drawCurve(snapshot);
    }

    laneY(index) {
      return this.dims.height * (0.365 + index * 0.105);
    }

    partX(progress) {
      const w = this.dims.width;
      return w * (0.135 + progress * 0.715);
    }

    drawScene(snapshot) {
      const { ctx } = this;
      const { width: w, height: h } = this.dims;
      ctx.clearRect(0, 0, w, h);
      this.drawBackground(w, h);
      this.drawCoolingTunnel(w, h, snapshot);
      this.drawConveyor(w, h, snapshot);
      this.drawMistArch(w, h, snapshot);
      this.drawFans(w, h, snapshot);
      this.drawAirflow(w, h, snapshot);

      snapshot.parts.forEach((part, index) => {
        if (part.history.length > 24) {
          this.drawHeatTrail(part, index, snapshot);
        }
      });
      snapshot.parts.forEach((part, index) => this.drawCasting(part, index, snapshot));
      this.drawParticles();
      this.drawSceneAnnotations(w, h, snapshot);
    }

    drawBackground(w, h) {
      const { ctx } = this;
      const bg = ctx.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, "#0e1518");
      bg.addColorStop(0.45, "#111a1e");
      bg.addColorStop(1, "#080d10");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      const glow = ctx.createRadialGradient(w * 0.22, h * 0.7, 0, w * 0.22, h * 0.7, w * 0.5);
      glow.addColorStop(0, "rgba(255, 98, 46, 0.12)");
      glow.addColorStop(0.55, "rgba(255, 98, 46, 0.025)");
      glow.addColorStop(1, "rgba(255, 98, 46, 0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, w, h);

      ctx.strokeStyle = "rgba(139, 177, 190, 0.07)";
      ctx.lineWidth = 1;
      const floorY = h * 0.77;
      for (let i = -8; i <= 8; i += 1) {
        ctx.beginPath();
        ctx.moveTo(w * 0.5 + i * 12, floorY);
        ctx.lineTo(w * 0.5 + i * w * 0.095, h);
        ctx.stroke();
      }
      for (let y = floorY + 10; y < h; y += 18) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      ctx.strokeStyle = "rgba(185, 211, 219, 0.08)";
      ctx.fillStyle = "rgba(185, 211, 219, 0.08)";
      for (let x = w * 0.06; x < w * 0.95; x += w * 0.115) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h * 0.28);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x - 7, h * 0.085);
        ctx.lineTo(x + 7, h * 0.085);
        ctx.moveTo(x, h * 0.065);
        ctx.lineTo(x + 7, h * 0.085);
        ctx.lineTo(x, h * 0.105);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(0, h * 0.19);
      ctx.lineTo(w, h * 0.19);
      ctx.stroke();

      const vignette = ctx.createLinearGradient(0, 0, 0, h);
      vignette.addColorStop(0, "rgba(0,0,0,0.34)");
      vignette.addColorStop(0.35, "rgba(0,0,0,0)");
      vignette.addColorStop(0.8, "rgba(0,0,0,0)");
      vignette.addColorStop(1, "rgba(0,0,0,0.46)");
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, w, h);
    }

    drawCoolingTunnel(w, h, snapshot) {
      const { ctx } = this;
      const left = w * 0.085;
      const right = w * 0.925;
      const top = h * 0.255;
      const bottom = h * 0.755;
      const live = snapshot.status === "running";

      ctx.save();
      roundedRect(ctx, left, top, right - left, bottom - top, 9);
      const chamber = ctx.createLinearGradient(left, top, right, bottom);
      chamber.addColorStop(0, "rgba(94, 156, 178, 0.055)");
      chamber.addColorStop(0.4, "rgba(94, 182, 213, 0.10)");
      chamber.addColorStop(0.75, "rgba(71, 150, 193, 0.055)");
      chamber.addColorStop(1, "rgba(34, 71, 87, 0.02)");
      ctx.fillStyle = chamber;
      ctx.fill();
      ctx.strokeStyle = live ? "rgba(124, 210, 238, 0.16)" : "rgba(124, 210, 238, 0.09)";
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.strokeStyle = "rgba(133, 189, 206, 0.09)";
      for (let i = 1; i < 9; i += 1) {
        const x = lerp(left, right, i / 9);
        ctx.beginPath();
        ctx.moveTo(x, top + 6);
        ctx.lineTo(x, bottom - 6);
        ctx.stroke();
      }

      ctx.fillStyle = "rgba(11, 21, 25, 0.64)";
      ctx.fillRect(left, top, right - left, 21);
      ctx.font = "8px 'Cascadia Mono', 'Noto Sans SC', monospace";
      ctx.fillStyle = "rgba(150, 184, 193, 0.7)";
      ctx.letterSpacing = "1px";
      ctx.fillText("THERMAL BUFFER / CONTROLLED ATMOSPHERE", left + 11, top + 14);
      ctx.textAlign = "right";
      ctx.fillText(live ? "● 冷却中" : "○ 待机", right - 10, top + 14);
      ctx.textAlign = "left";
      ctx.restore();
    }

    drawConveyor(w, h, snapshot) {
      const { ctx } = this;
      const beltTop = h * 0.29;
      const beltBottom = h * 0.75;
      const left = w * 0.055;
      const right = w * 0.955;
      const beltGradient = ctx.createLinearGradient(0, beltTop, 0, beltBottom);
      beltGradient.addColorStop(0, "rgba(28, 39, 44, 0.34)");
      beltGradient.addColorStop(0.5, "rgba(17, 27, 31, 0.52)");
      beltGradient.addColorStop(1, "rgba(8, 14, 17, 0.68)");
      ctx.fillStyle = beltGradient;
      ctx.fillRect(left, beltTop, right - left, beltBottom - beltTop);

      ctx.strokeStyle = "rgba(169, 204, 214, 0.12)";
      ctx.lineWidth = 1;
      ctx.strokeRect(left, beltTop, right - left, beltBottom - beltTop);

      const motion = this.reducedMotion ? 0 : this.frameTime * 70 * snapshot.controls.belt;
      const slatGap = 48;
      ctx.strokeStyle = "rgba(132, 170, 181, 0.09)";
      for (let x = left - slatGap + (motion % slatGap); x < right; x += slatGap) {
        ctx.beginPath();
        ctx.moveTo(x, beltTop + 9);
        ctx.lineTo(x - 17, beltBottom - 9);
        ctx.stroke();
      }

      for (let i = 0; i < 3; i += 1) {
        const y = this.laneY(i);
        const rail = ctx.createLinearGradient(0, y - 30, 0, y + 30);
        rail.addColorStop(0, "rgba(49, 68, 76, 0.03)");
        rail.addColorStop(0.5, "rgba(67, 88, 96, 0.15)");
        rail.addColorStop(1, "rgba(25, 39, 44, 0.06)");
        ctx.fillStyle = rail;
        ctx.fillRect(left, y - 27, right - left, 54);
        ctx.strokeStyle = "rgba(144, 177, 186, 0.13)";
        ctx.beginPath();
        ctx.moveTo(left, y + 28);
        ctx.lineTo(right, y + 28);
        ctx.stroke();
        ctx.fillStyle = "rgba(157, 185, 193, 0.3)";
        ctx.font = "7px 'Cascadia Mono', 'Noto Sans SC', monospace";
        ctx.fillText(`0${i + 1}`, left + 9, y + 24);
      }

      const rollerY = h * 0.745;
      for (let x = left + 22; x < right; x += 55) {
        ctx.beginPath();
        ctx.arc(x, rollerY, 4.5, 0, TAU);
        ctx.fillStyle = "rgba(107, 137, 147, 0.18)";
        ctx.fill();
        ctx.strokeStyle = "rgba(167, 194, 201, 0.12)";
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x - 2.5, rollerY);
        ctx.lineTo(x + 2.5, rollerY);
        ctx.stroke();
      }
    }

    drawMistArch(w, h, snapshot) {
      const { ctx } = this;
      const x = w * 0.405;
      const top = h * 0.285;
      const bottom = h * 0.74;
      const strength = snapshot.controls.mist / 100;

      ctx.save();
      ctx.strokeStyle = "rgba(114, 215, 255, 0.36)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x - 3, top);
      ctx.lineTo(x - 3, bottom);
      ctx.stroke();
      ctx.strokeStyle = "rgba(114, 215, 255, 0.12)";
      ctx.lineWidth = 7;
      ctx.stroke();

      const glow = ctx.createLinearGradient(x, 0, x + 90, 0);
      glow.addColorStop(0, `rgba(85, 197, 240, ${0.08 + strength * 0.09})`);
      glow.addColorStop(1, "rgba(85, 197, 240, 0)");
      ctx.fillStyle = glow;
      ctx.fillRect(x, top, 90, bottom - top);

      for (let i = 0; i < 8; i += 1) {
        const y = lerp(top + 16, bottom - 12, i / 7);
        ctx.fillStyle = "rgba(175, 225, 239, 0.82)";
        ctx.beginPath();
        ctx.moveTo(x - 7, y - 3);
        ctx.lineTo(x + 4, y + 3);
        ctx.lineTo(x + 10, y + 2);
        ctx.lineTo(x + 1, y - 4);
        ctx.closePath();
        ctx.fill();
        if (strength > 0.02) {
          ctx.strokeStyle = `rgba(114, 215, 255, ${0.12 + strength * 0.24})`;
          ctx.lineWidth = 1;
          for (let ray = 0; ray < 3; ray += 1) {
            ctx.beginPath();
            ctx.moveTo(x + 8 + ray * 2, y);
            ctx.lineTo(x + 25 + ray * 7 + strength * 18, y + 9 + ray * 5);
            ctx.stroke();
          }
        }
      }

      ctx.font = "7px 'Cascadia Mono', 'Noto Sans SC', monospace";
      ctx.fillStyle = "rgba(114, 215, 255, 0.65)";
      ctx.fillText("WATER MIST", x - 25, top - 8);
      ctx.fillStyle = heatColor(250, 0.55);
      ctx.fillRect(x - 26, top - 4, 19 * strength, 1.5);
      ctx.restore();
    }

    drawFans(w, h, snapshot) {
      const { ctx } = this;
      const strength = snapshot.controls.air / 100;
      const rotation = this.reducedMotion ? 0.4 : this.frameTime * (0.8 + strength * 11);
      const x = w * 0.82;
      [0, 2].forEach((lane, fanIndex) => {
        const y = this.laneY(lane) - (fanIndex === 0 ? 18 : -18);
        ctx.save();
        ctx.translate(x, y);
        const housing = ctx.createRadialGradient(-5, -6, 2, 0, 0, 29);
        housing.addColorStop(0, "rgba(118, 154, 166, 0.25)");
        housing.addColorStop(0.6, "rgba(44, 62, 69, 0.72)");
        housing.addColorStop(1, "rgba(14, 22, 26, 0.9)");
        ctx.fillStyle = housing;
        ctx.beginPath();
        ctx.arc(0, 0, 27, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = `rgba(142, 209, 228, ${0.18 + strength * 0.24})`;
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, 0, 20, 0, TAU);
        ctx.stroke();

        ctx.rotate(rotation);
        for (let blade = 0; blade < 6; blade += 1) {
          ctx.rotate(TAU / 6);
          ctx.beginPath();
          ctx.moveTo(3, -2);
          ctx.quadraticCurveTo(14, -12, 18, -4);
          ctx.lineTo(8, 3);
          ctx.closePath();
          ctx.fillStyle = `rgba(158, 191, 201, ${0.16 + strength * 0.16})`;
          ctx.fill();
        }
        ctx.fillStyle = "rgba(211, 229, 233, 0.42)";
        ctx.beginPath();
        ctx.arc(0, 0, 5, 0, TAU);
        ctx.fill();
        ctx.fillStyle = "rgba(11, 18, 21, 0.6)";
        ctx.beginPath();
        ctx.arc(0, 0, 2, 0, TAU);
        ctx.fill();
        ctx.restore();
      });

      ctx.fillStyle = "rgba(189, 220, 228, 0.52)";
      ctx.font = "7px 'Cascadia Mono', 'Noto Sans SC', monospace";
      ctx.fillText("AIR FLOW", x + 2, this.laneY(0) - 43);
    }

    drawAirflow(w, h, snapshot) {
      const { ctx } = this;
      const strength = snapshot.controls.air / 100;
      if (strength < 0.02) return;
      const from = w * 0.795;
      const to = w * 0.46;
      const phase = this.reducedMotion ? 0 : this.frameTime * (12 + strength * 30);
      ctx.save();
      ctx.strokeStyle = `rgba(174, 221, 235, ${0.08 + strength * 0.16})`;
      ctx.lineWidth = 0.8;
      for (let lane = 0; lane < 3; lane += 1) {
        const baseY = this.laneY(lane);
        for (let band = -2; band <= 1; band += 1) {
          const y = baseY + band * 8;
          ctx.beginPath();
          for (let x = from; x > to; x -= 7) {
            const offset = Math.sin((x + phase) * 0.035 + band) * (2.5 + strength * 4);
            if (x === from) ctx.moveTo(x, y + offset);
            else ctx.lineTo(x, y + offset);
          }
          ctx.stroke();
        }
      }
      ctx.restore();
    }

    castingPath(ctx, scale) {
      ctx.beginPath();
      ctx.moveTo(-36 * scale, 8 * scale);
      ctx.bezierCurveTo(-45 * scale, -5 * scale, -41 * scale, -23 * scale, -22 * scale, -28 * scale);
      ctx.bezierCurveTo(-5 * scale, -35 * scale, 18 * scale, -30 * scale, 28 * scale, -18 * scale);
      ctx.bezierCurveTo(41 * scale, -5 * scale, 39 * scale, 12 * scale, 25 * scale, 17 * scale);
      ctx.lineTo(17 * scale, 17 * scale);
      ctx.lineTo(17 * scale, 26 * scale);
      ctx.lineTo(-18 * scale, 26 * scale);
      ctx.lineTo(-18 * scale, 17 * scale);
      ctx.lineTo(-27 * scale, 17 * scale);
      ctx.closePath();
    }

    drawHeatTrail(part, index, snapshot) {
      const { ctx } = this;
      const history = part.history.slice(-46);
      if (history.length < 2) return;
      ctx.save();
      ctx.lineCap = "round";
      ctx.lineWidth = 2.2;
      for (let i = 1; i < history.length; i += 1) {
        const previous = history[i - 1];
        const current = history[i];
        const alpha = (i / history.length) * 0.26;
        ctx.strokeStyle = heatColor(current.core, alpha);
        ctx.beginPath();
        ctx.moveTo(this.partX(previous.progress), this.laneY(index));
        ctx.lineTo(this.partX(current.progress), this.laneY(index));
        ctx.stroke();
      }
      ctx.restore();
    }

    drawCasting(part, index, snapshot) {
      const { ctx } = this;
      const x = this.partX(snapshot.progress) + (index - 1) * 3;
      const y = this.laneY(index);
      const scale = 0.88 + index * 0.025;
      const core = part.nodes[2];
      const top = part.nodes[0];
      const vibration = this.reducedMotion ? 0 : Math.sin(this.frameTime * 8 + index * 1.7) * Math.min(0.8, (top - 350) / 900);
      const isHot = core > 300;

      ctx.save();
      ctx.translate(x, y + vibration);
      if (isHot) {
        ctx.shadowColor = heatColor(core, 0.36);
        ctx.shadowBlur = 18 + Math.max(0, core - 500) * 0.045;
      }

      this.castingPath(ctx, scale);
      const gradient = ctx.createLinearGradient(0, -31 * scale, 0, 28 * scale);
      const nodeStops = [part.nodes[0], part.nodes[1], part.nodes[2], part.nodes[3], part.nodes[4]];
      nodeStops.forEach((temperature, stopIndex) => {
        gradient.addColorStop(stopIndex / 4, heatColor(temperature, 0.98));
      });
      ctx.fillStyle = gradient;
      ctx.fill();
      ctx.shadowBlur = 0;

      ctx.save();
      this.castingPath(ctx, scale);
      ctx.clip();
      const sheen = ctx.createLinearGradient(-35, -25, 30, 20);
      sheen.addColorStop(0, "rgba(255,255,255,0.17)");
      sheen.addColorStop(0.32, "rgba(255,255,255,0.02)");
      sheen.addColorStop(0.65, "rgba(0,0,0,0.12)");
      sheen.addColorStop(1, "rgba(255,255,255,0.06)");
      ctx.fillStyle = sheen;
      ctx.fillRect(-47 * scale, -38 * scale, 94 * scale, 70 * scale);

      ctx.strokeStyle = "rgba(15, 28, 33, 0.25)";
      ctx.lineWidth = 0.8;
      [-21, -11, 0, 11, 21].forEach((lineY) => {
        ctx.beginPath();
        ctx.moveTo(-44 * scale, lineY * scale);
        ctx.bezierCurveTo(-15 * scale, (lineY - 2) * scale, 20 * scale, (lineY + 2) * scale, 42 * scale, lineY * scale);
        ctx.stroke();
      });
      ctx.strokeStyle = "rgba(255,255,255,0.11)";
      ctx.beginPath();
      ctx.moveTo(-31 * scale, -22 * scale);
      ctx.bezierCurveTo(-12 * scale, -29 * scale, 12 * scale, -27 * scale, 25 * scale, -17 * scale);
      ctx.stroke();
      ctx.restore();

      ctx.strokeStyle = heatColor(core, 0.88);
      ctx.lineWidth = 1.1;
      this.castingPath(ctx, scale);
      ctx.stroke();

      ctx.fillStyle = "rgba(10, 21, 25, 0.72)";
      ctx.beginPath();
      ctx.arc(7 * scale, -3 * scale, 10.5 * scale, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.18)";
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.arc(7 * scale, -3 * scale, 6 * scale, 0, TAU);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(7 * scale, -3 * scale, 2 * scale, 0, TAU);
      ctx.fillStyle = "rgba(255,255,255,0.14)";
      ctx.fill();

      [-11, 11].forEach((holeX) => {
        ctx.fillStyle = "rgba(10, 20, 23, 0.72)";
        ctx.beginPath();
        ctx.arc(holeX * scale, 21.5 * scale, 2.4 * scale, 0, TAU);
        ctx.fill();
      });

      if (part.cracked && part.crack) {
        this.drawCrack(part, scale);
      }

      ctx.fillStyle = "rgba(5, 10, 12, 0.8)";
      ctx.fillRect(-17, 32, 34, 11);
      ctx.fillStyle = "rgba(218, 230, 232, 0.74)";
      ctx.font = "7px 'Cascadia Mono', 'Noto Sans SC', monospace";
      ctx.textAlign = "center";
      ctx.fillText(`0${index + 1} · ${Math.round(core)}°`, 0, 40);
      ctx.textAlign = "left";
      ctx.restore();
    }

    drawCrack(part, scale) {
      const { ctx } = this;
      let seed = part.crack.seed;
      const random = () => {
        seed = (seed * 16807) % 2147483647;
        return (seed - 1) / 2147483646;
      };
      const points = [
        [-8 * scale, -31 * scale],
        [-2 * scale, -21 * scale],
        [-8 * scale, -11 * scale],
        [1 * scale, -4 * scale],
        [-3 * scale, 7 * scale],
        [8 * scale, 18 * scale],
        [4 * scale, 27 * scale]
      ];
      ctx.save();
      ctx.strokeStyle = "rgba(9, 14, 16, 0.95)";
      ctx.lineWidth = 2.3 * part.crack.severity;
      ctx.beginPath();
      points.forEach((point, index) => {
        const jitter = index === 0 ? 0 : (random() - 0.5) * 4;
        if (index === 0) ctx.moveTo(point[0], point[1]);
        else ctx.lineTo(point[0] + jitter, point[1]);
      });
      ctx.stroke();
      ctx.strokeStyle = "rgba(255, 112, 91, 0.8)";
      ctx.lineWidth = 0.7;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(2 * scale, 3 * scale);
      ctx.lineTo(15 * scale, 9 * scale);
      ctx.moveTo(-2 * scale, 7 * scale);
      ctx.lineTo(-15 * scale, 13 * scale);
      ctx.stroke();
      ctx.restore();
    }

    updateParticles(snapshot, dt) {
      const safeDt = clamp(dt, 0, 0.1);
      const { width: w, height: h } = this.dims;
      this.spawnClock += safeDt;
      const interval = 0.075;
      while (this.spawnClock >= interval) {
        this.spawnClock -= interval;
        snapshot.parts.forEach((part, index) => {
          const temp = part.nodes[0];
          const emberChance = clamp((temp - 220) / 1300, 0, 0.75);
          if (Math.random() < emberChance) {
            this.particles.push({
              type: "steam",
              x: this.partX(snapshot.progress) + (Math.random() - 0.5) * 48,
              y: this.laneY(index) - 17 + (Math.random() - 0.5) * 20,
              vx: (Math.random() - 0.5) * 11 + 4,
              vy: -10 - Math.random() * 21,
              size: 7 + Math.random() * 19,
              life: 1.1 + Math.random() * 1.8,
              age: 0,
              hot: heatColor(temp, 1)
            });
          }
        });

        if (snapshot.controls.mist > 3) {
          const count = Math.round(snapshot.controls.mist / 28);
          for (let i = 0; i < count; i += 1) {
            this.particles.push({
              type: "mist",
              x: w * 0.412 + Math.random() * 24,
              y: h * (0.3 + Math.random() * 0.42),
              vx: 25 + Math.random() * 50,
              vy: 7 + Math.random() * 15,
              size: 1 + Math.random() * 2.2,
              life: 0.75 + Math.random() * 0.8,
              age: 0
            });
          }
        }
      }

      this.particles.forEach((particle) => {
        particle.age += safeDt;
        particle.x += particle.vx * safeDt;
        particle.y += particle.vy * safeDt;
        if (particle.type === "steam") {
          particle.vx += Math.sin(this.frameTime * 2 + particle.y) * 0.2;
          particle.vy -= safeDt * 2.2;
          particle.size += safeDt * 8;
        } else {
          particle.vy += safeDt * 9;
        }
      });
      this.particles = this.particles.filter((particle) => particle.age < particle.life);
      if (this.particles.length > 260) {
        this.particles.splice(0, this.particles.length - 260);
      }
    }

    drawParticles() {
      const { ctx } = this;
      ctx.save();
      this.particles.forEach((particle) => {
        const progress = clamp(particle.age / particle.life, 0, 1);
        const fade = Math.sin(progress * Math.PI);
        if (particle.type === "mist") {
          ctx.strokeStyle = `rgba(137, 224, 249, ${fade * 0.42})`;
          ctx.lineWidth = particle.size;
          ctx.beginPath();
          ctx.moveTo(particle.x, particle.y);
          ctx.lineTo(particle.x - particle.vx * 0.035, particle.y - particle.vy * 0.03);
          ctx.stroke();
        } else {
          const steam = ctx.createRadialGradient(
            particle.x,
            particle.y,
            0,
            particle.x,
            particle.y,
            particle.size
          );
          steam.addColorStop(0, `rgba(202, 218, 220, ${fade * 0.21})`);
          steam.addColorStop(0.38, `rgba(156, 182, 189, ${fade * 0.13})`);
          steam.addColorStop(1, "rgba(100, 133, 143, 0)");
          ctx.fillStyle = steam;
          ctx.beginPath();
          ctx.arc(particle.x, particle.y, particle.size, 0, TAU);
          ctx.fill();
        }
      });
      ctx.restore();
    }

    drawSceneAnnotations(w, h, snapshot) {
      const { ctx } = this;
      ctx.save();
      ctx.font = "8px 'Cascadia Mono', 'Noto Sans SC', monospace";
      ctx.fillStyle = "rgba(161, 187, 195, 0.52)";
      ctx.fillText("INFEED", w * 0.085, h * 0.79);
      ctx.textAlign = "right";
      ctx.fillText("OUTFEED", w * 0.918, h * 0.79);
      ctx.textAlign = "left";

      ctx.fillStyle = "rgba(114, 215, 255, 0.54)";
      ctx.fillText("MIST QUENCH", w * 0.357, h * 0.83);
      ctx.fillStyle = "rgba(185, 218, 228, 0.5)";
      ctx.fillText("CROSSFLOW", w * 0.775, h * 0.83);

      const p = snapshot.progress;
      const lineX = this.partX(p);
      ctx.strokeStyle = "rgba(255, 178, 77, 0.26)";
      ctx.setLineDash([2, 5]);
      ctx.beginPath();
      ctx.moveTo(lineX, h * 0.27);
      ctx.lineTo(lineX, h * 0.75);
      ctx.stroke();
      ctx.setLineDash([]);

      const cracked = snapshot.parts.find((part) => part.cracked);
      if (cracked) {
        const x = this.partX(Math.max(p, 0.24)) + 38;
        const y = this.laneY(cracked.index) - 46;
        const pulse = 0.55 + Math.sin(this.frameTime * 5) * 0.22;
        ctx.strokeStyle = `rgba(255, 93, 85, ${pulse})`;
        ctx.fillStyle = "rgba(18, 10, 10, 0.86)";
        ctx.lineWidth = 1;
        ctx.fillRect(x - 1, y - 10, 92, 31);
        ctx.strokeRect(x - 1, y - 10, 92, 31);
        ctx.fillStyle = `rgba(255, 130, 118, ${pulse})`;
        ctx.font = "8px 'Cascadia Mono', 'Noto Sans SC', monospace";
        ctx.fillText("! THERMAL CRACK", x + 6, y + 2);
        ctx.fillStyle = "rgba(218, 228, 230, 0.7)";
        ctx.fillText(`Δ ${Math.round(cracked.crack.gap)}°C  T+${cracked.crack.time}s`, x + 6, y + 14);
        ctx.strokeStyle = `rgba(255, 93, 85, ${pulse})`;
        ctx.beginPath();
        ctx.moveTo(x - 1, y + 21);
        ctx.lineTo(x - 20, this.laneY(cracked.index) - 7);
        ctx.stroke();
      }

      const running = snapshot.status === "running";
      const statusText = running
        ? `BELT ${snapshot.controls.belt.toFixed(2)}×   ·   ΔT ${Math.round(snapshot.average.gap)}°C`
        : snapshot.status === "success"
          ? "BATCH VERIFIED"
          : snapshot.status === "failed"
            ? "BATCH REJECTED"
            : "STANDBY / READY TO POUR";
      ctx.fillStyle = running ? "rgba(255, 178, 77, 0.65)" : "rgba(144, 165, 172, 0.5)";
      ctx.fillText(statusText, w * 0.085, h * 0.855);
      ctx.restore();
    }

    drawCurve(snapshot) {
      const ctx = this.curveCtx;
      const { width: w, height: h } = this.curveDims;
      ctx.clearRect(0, 0, w, h);
      const batch = snapshot.batch;
      const margin = { left: 43, right: 17, top: 14, bottom: 24 };
      const plotW = Math.max(1, w - margin.left - margin.right);
      const plotH = Math.max(1, h - margin.top - margin.bottom);
      const xMax = Math.max(45, Math.ceil((snapshot.elapsed + 1) / 10) * 10);
      const yMax = Math.max(900, Math.ceil((batch.startTemp + 10) / 50) * 50);
      const yMin = 100;
      const mapX = (time) => margin.left + (time / xMax) * plotW;
      const mapY = (temperature) => margin.top + ((yMax - temperature) / (yMax - yMin)) * plotH;

      const bg = ctx.createLinearGradient(0, margin.top, 0, margin.top + plotH);
      bg.addColorStop(0, "rgba(255,255,255,0.012)");
      bg.addColorStop(1, "rgba(0,0,0,0.09)");
      ctx.fillStyle = bg;
      ctx.fillRect(margin.left, margin.top, plotW, plotH);

      ctx.strokeStyle = "rgba(177, 201, 208, 0.075)";
      ctx.lineWidth = 1;
      ctx.font = "7px 'Cascadia Mono', 'Noto Sans SC', monospace";
      ctx.fillStyle = "rgba(143, 165, 173, 0.5)";
      for (let i = 0; i <= 4; i += 1) {
        const y = margin.top + (plotH * i) / 4;
        ctx.beginPath();
        ctx.moveTo(margin.left, y);
        ctx.lineTo(margin.left + plotW, y);
        ctx.stroke();
        const label = Math.round(lerp(yMax, yMin, i / 4));
        ctx.fillText(String(label), margin.left - 9, y + 2.5);
      }

      const xSteps = Math.min(9, Math.max(4, Math.floor(xMax / 5)));
      for (let i = 0; i <= xSteps; i += 1) {
        const x = margin.left + (plotW * i) / xSteps;
        ctx.beginPath();
        ctx.moveTo(x, margin.top);
        ctx.lineTo(x, margin.top + plotH);
        ctx.stroke();
        if (i < xSteps) {
          ctx.textAlign = "center";
          ctx.fillText(Math.round((xMax * i) / xSteps), x, margin.top + plotH + 13);
        }
      }
      ctx.textAlign = "left";
      ctx.fillStyle = "rgba(143, 165, 173, 0.42)";
      ctx.fillText("s", margin.left + plotW + 3, margin.top + plotH + 13);
      ctx.fillStyle = "rgba(143, 165, 173, 0.36)";
      ctx.fillText("°C", 2, margin.top + 4);

      const bandTop = [];
      const bandBottom = [];
      for (let i = 0; i <= 100; i += 1) {
        const time = (batch.duration * i) / 100;
        const target = this.targetForTime(batch, time);
        bandTop.push([mapX(time), mapY(target + 13)]);
        bandBottom.push([mapX(time), mapY(target - 13)]);
      }
      ctx.save();
      ctx.beginPath();
      bandTop.forEach((point, index) => {
        if (index === 0) ctx.moveTo(point[0], point[1]);
        else ctx.lineTo(point[0], point[1]);
      });
      for (let i = bandBottom.length - 1; i >= 0; i -= 1) {
        ctx.lineTo(bandBottom[i][0], bandBottom[i][1]);
      }
      ctx.closePath();
      ctx.fillStyle = "rgba(255, 188, 80, 0.075)";
      ctx.fill();
      ctx.strokeStyle = "rgba(255, 194, 91, 0.2)";
      ctx.lineWidth = 0.8;
      ctx.stroke();

      ctx.beginPath();
      bandTop.forEach((point, index) => {
        const target = this.targetForTime(batch, (batch.duration * index) / 100);
        const x = mapX((batch.duration * index) / 100);
        const y = mapY(target);
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = "rgba(255, 194, 91, 0.72)";
      ctx.lineWidth = 1.2;
      ctx.setLineDash([5, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      const colors = ["rgba(114, 215, 255, 0.9)", "rgba(150, 201, 224, 0.75)", "rgba(255, 175, 105, 0.72)"];
      snapshot.parts.forEach((part, index) => {
        const history = part.history;
        if (history.length < 2) return;
        ctx.strokeStyle = colors[index];
        ctx.lineWidth = index === 1 ? 1.5 : 1.1;
        ctx.beginPath();
        history.forEach((sample, sampleIndex) => {
          const x = mapX(sample.t);
          const y = mapY(sample.core);
          if (sampleIndex === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.stroke();

        const latest = history[history.length - 1];
        const x = mapX(latest.t);
        const y = mapY(latest.core);
        ctx.fillStyle = colors[index];
        ctx.beginPath();
        ctx.arc(x, y, 2.2, 0, TAU);
        ctx.fill();
        if (index === 1) {
          ctx.strokeStyle = "rgba(114, 215, 255, 0.4)";
          ctx.beginPath();
          ctx.arc(x, y, 5 + Math.sin(this.frameTime * 4) * 0.8, 0, TAU);
          ctx.stroke();
        }

        if (part.cracked && part.crack) {
          ctx.strokeStyle = "rgba(255, 93, 85, 0.86)";
          ctx.lineWidth = 1.3;
          ctx.beginPath();
          ctx.moveTo(x - 4, y - 4);
          ctx.lineTo(x + 4, y + 4);
          ctx.moveTo(x + 4, y - 4);
          ctx.lineTo(x - 4, y + 4);
          ctx.stroke();
        }
      });

      if (snapshot.historyMarkers !== false && snapshot.elapsed > 0) {
        const x = mapX(snapshot.elapsed);
        ctx.strokeStyle = "rgba(114, 215, 255, 0.2)";
        ctx.setLineDash([2, 4]);
        ctx.beginPath();
        ctx.moveTo(x, margin.top);
        ctx.lineTo(x, margin.top + plotH);
        ctx.stroke();
        ctx.setLineDash([]);
        const core = snapshot.parts[1].nodes[2];
        const target = this.targetForTime(batch, snapshot.elapsed);
        ctx.strokeStyle = "rgba(229, 239, 241, 0.28)";
        ctx.beginPath();
        ctx.moveTo(x, mapY(target));
        ctx.lineTo(x, mapY(core));
        ctx.stroke();
        ctx.fillStyle = "rgba(114, 215, 255, 0.72)";
        ctx.font = "7px 'Cascadia Mono', 'Noto Sans SC', monospace";
        ctx.textAlign = x > w - 70 ? "right" : "left";
        ctx.fillText(`${Math.round(core)}°`, x + (x > w - 70 ? -5 : 5), mapY(core) - 4);
        ctx.textAlign = "left";
      }

      if (snapshot.status === "idle" && snapshot.parts.every((part) => part.history.length === 0)) {
        ctx.fillStyle = "rgba(171, 194, 201, 0.35)";
        ctx.font = "9px 'Bahnschrift', 'Noto Sans SC', sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("曲线将在开始浇铸后记录", margin.left + plotW / 2, margin.top + plotH * 0.54);
        ctx.textAlign = "left";
      }
    }

    targetForTime(batch, time) {
      const t = clamp(time, 0, batch.duration);
      for (let i = 0; i < batch.curve.length - 1; i += 1) {
        const a = batch.curve[i];
        const b = batch.curve[i + 1];
        if (t <= b.t) {
          const local = clamp((t - a.t) / (b.t - a.t), 0, 1);
          const eased = local * local * (3 - 2 * local);
          return lerp(a.value, b.value, eased);
        }
      }
      return batch.curve[batch.curve.length - 1].value;
    }
  }

  window.FoundryRenderer = FoundryRenderer;
})();
