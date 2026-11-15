import { INKS, LAYOUTS } from "./engine.js";

const W = 1000;
const H = 620;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export class PressRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.rotation = 0;
    this.lastFrame = performance.now();
    this.resize();
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas);
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
    const width = Math.max(320, Math.round(rect.width * dpr));
    const height = Math.max(200, Math.round(rect.height * dpr));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    this.scaleX = this.canvas.width / W;
    this.scaleY = this.canvas.height / H;
    this.ctx.setTransform(this.scaleX, 0, 0, this.scaleY, 0, 0);
  }

  draw(snapshot, now = performance.now()) {
    const dt = Math.min(0.05, Math.max(0, (now - this.lastFrame) / 1000));
    this.lastFrame = now;
    const speeds = [0, 0.9, 1.8, 3.1];
    if (snapshot.pressState === "printing") {
      this.rotation += dt * speeds[snapshot.speed];
    }
    const ctx = this.ctx;
    ctx.setTransform(this.scaleX, 0, 0, this.scaleY, 0, 0);
    ctx.clearRect(0, 0, W, H);
    this._drawRoom(ctx, snapshot, now);
    this._drawPress(ctx, snapshot, now);
    this._drawDryRack(ctx, snapshot, now);
    this._drawPaperStation(ctx, snapshot, now);
    this._drawWasteBin(ctx, snapshot, now);
    this._drawForeground(ctx, snapshot, now);
  }

  _drawRoom(ctx, state, now) {
    const wall = ctx.createLinearGradient(0, 0, 0, 470);
    wall.addColorStop(0, "#111f27");
    wall.addColorStop(0.55, "#0c161d");
    wall.addColorStop(1, "#080e13");
    ctx.fillStyle = wall;
    ctx.fillRect(0, 0, W, 470);

    ctx.strokeStyle = "rgba(141, 170, 181, 0.055)";
    ctx.lineWidth = 1;
    for (let y = 34; y < 445; y += 29) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
      const offset = (Math.floor(y / 29) % 2) * 54;
      for (let x = -offset; x < W; x += 108) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + 29);
        ctx.stroke();
      }
    }

    const floor = ctx.createLinearGradient(0, 452, 0, H);
    floor.addColorStop(0, "#12181b");
    floor.addColorStop(1, "#070b0e");
    ctx.fillStyle = floor;
    ctx.fillRect(0, 452, W, H - 452);
    ctx.strokeStyle = "rgba(184, 207, 216, 0.09)";
    for (let x = -230; x < W + 250; x += 145) {
      ctx.beginPath();
      ctx.moveTo(500 + (x - 500) * 0.22, 452);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    ctx.strokeStyle = "rgba(184, 207, 216, 0.065)";
    for (let y = 477; y < H; y += 39) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }

    this._drawWindow(ctx, now);
    this._drawLamps(ctx, now);
    this._drawWallDetails(ctx, state);

    const glow = ctx.createRadialGradient(360, 260, 20, 360, 260, 380);
    glow.addColorStop(0, "rgba(87, 223, 245, 0.035)");
    glow.addColorStop(1, "rgba(87, 223, 245, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, 700, 520);
  }

  _drawWindow(ctx, now) {
    ctx.save();
    ctx.fillStyle = "#07131b";
    ctx.fillRect(34, 48, 178, 128);
    const sky = ctx.createLinearGradient(0, 48, 0, 176);
    sky.addColorStop(0, "#07131f");
    sky.addColorStop(0.7, "#102432");
    sky.addColorStop(1, "#182d36");
    ctx.fillStyle = sky;
    ctx.fillRect(42, 56, 162, 112);
    ctx.fillStyle = "rgba(255, 214, 139, 0.68)";
    ctx.beginPath();
    ctx.arc(168, 82, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255, 214, 139, 0.08)";
    ctx.beginPath();
    ctx.arc(168, 82, 31, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#081319";
    const buildings = [
      [45, 142, 23, 26],
      [72, 126, 21, 42],
      [98, 148, 32, 20],
      [135, 134, 19, 34],
      [159, 150, 40, 18]
    ];
    buildings.forEach(([x, y, width, height]) => {
      ctx.fillRect(x, y, width, height);
      ctx.fillStyle = "rgba(255, 202, 96, 0.32)";
      for (let row = y + 6; row < y + height - 2; row += 8) {
        for (let col = x + 4; col < x + width - 2; col += 8) {
          if ((row + col) % 3 === 0) ctx.fillRect(col, row, 2, 2);
        }
      }
      ctx.fillStyle = "#081319";
    });
    ctx.strokeStyle = "#203039";
    ctx.lineWidth = 4;
    ctx.strokeRect(36, 50, 174, 124);
    ctx.strokeStyle = "#15242b";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(123, 57);
    ctx.lineTo(123, 166);
    ctx.moveTo(43, 111);
    ctx.lineTo(201, 111);
    ctx.stroke();
    const glassShine = ctx.createLinearGradient(42, 56, 180, 162);
    glassShine.addColorStop(0, "rgba(163, 220, 234, 0.09)");
    glassShine.addColorStop(0.4, "rgba(163, 220, 234, 0)");
    ctx.fillStyle = glassShine;
    ctx.fillRect(42, 56, 162, 112);
    ctx.restore();

    ctx.save();
    ctx.fillStyle = "#0a1014";
    ctx.fillRect(34, 176, 178, 9);
    ctx.fillStyle = "rgba(255,255,255,0.04)";
    ctx.fillRect(42, 170, 162, 3);
    ctx.restore();
  }

  _drawLamps(ctx, now) {
    const lamps = [
      { x: 305, y: 64, radius: 95 },
      { x: 690, y: 44, radius: 118 }
    ];
    for (const lamp of lamps) {
      ctx.strokeStyle = "#131d22";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(lamp.x, 0);
      ctx.lineTo(lamp.x, lamp.y - 15);
      ctx.stroke();
      ctx.fillStyle = "#1a2427";
      ctx.beginPath();
      ctx.moveTo(lamp.x - 18, lamp.y - 13);
      ctx.lineTo(lamp.x + 18, lamp.y - 13);
      ctx.lineTo(lamp.x + 28, lamp.y + 4);
      ctx.lineTo(lamp.x - 28, lamp.y + 4);
      ctx.closePath();
      ctx.fill();
      const flicker = 0.93 + Math.sin(now * 0.012 + lamp.x) * 0.035;
      ctx.fillStyle = `rgba(255, 211, 138, ${0.86 * flicker})`;
      ctx.beginPath();
      ctx.ellipse(lamp.x, lamp.y + 4, 11, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      const light = ctx.createRadialGradient(lamp.x, lamp.y + 5, 3, lamp.x, lamp.y + 5, lamp.radius);
      light.addColorStop(0, `rgba(255, 200, 112, ${0.12 * flicker})`);
      light.addColorStop(1, "rgba(255, 200, 112, 0)");
      ctx.fillStyle = light;
      ctx.beginPath();
      ctx.arc(lamp.x, lamp.y + 5, lamp.radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  _drawWallDetails(ctx, state) {
    ctx.save();
    ctx.fillStyle = "rgba(9, 17, 22, 0.86)";
    ctx.fillRect(231, 51, 62, 105);
    ctx.strokeStyle = "rgba(255, 196, 92, 0.26)";
    ctx.strokeRect(236, 56, 52, 95);
    ctx.fillStyle = "rgba(255, 196, 92, 0.72)";
    ctx.font = "800 8px 'NightPressCN', monospace";
    ctx.textAlign = "center";
    ctx.fillText("NIGHT", 262, 73);
    ctx.fillText("PRESS", 262, 85);
    ctx.fillStyle = "rgba(87, 223, 245, 0.72)";
    ctx.font = "700 17px 'NightPressCN', monospace";
    ctx.fillText("03", 262, 114);
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.font = "600 6px 'NightPressCN', monospace";
    ctx.fillText("SHIFT  /  K-2", 262, 128);
    ctx.strokeStyle = "rgba(87, 223, 245, 0.15)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(249, 137);
    ctx.lineTo(275, 137);
    ctx.stroke();

    ctx.fillStyle = "rgba(7, 12, 16, 0.7)";
    ctx.fillRect(804, 64, 144, 62);
    ctx.strokeStyle = "rgba(205, 221, 226, 0.12)";
    ctx.strokeRect(811, 71, 130, 48);
    ctx.fillStyle = "rgba(220, 64, 61, 0.38)";
    ctx.font = "900 15px 'NightPressCN', sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("安全第一", 825, 94);
    ctx.fillStyle = "rgba(230, 238, 240, 0.4)";
    ctx.font = "700 7px 'NightPressCN', monospace";
    ctx.fillText("NO LOOSE SLEEVES", 825, 109);

    ctx.strokeStyle = "rgba(141, 170, 181, 0.13)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, 29);
    ctx.lineTo(970, 29);
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, 33);
    ctx.lineTo(970, 33);
    ctx.stroke();

    ctx.fillStyle = state.gameState === "won" ? "#6ce7a8" : "#ffc45c";
    ctx.font = "700 8px 'NightPressCN', monospace";
    ctx.fillText(state.gameState === "won" ? "SHIFT CLEAR" : "SHIFT 03 · IN PROGRESS", 782, 31);
    ctx.restore();
  }

  _drawPress(ctx, state, now) {
    const run = state.run;
    const job = state.jobs.find((item) => item.id === (run?.jobId || state.selectedJobId)) || state.jobs[0];
    const ink = INKS.find((item) => item.id === job.ink) || INKS[0];
    const active = state.pressState === "printing";
    const stopped = ["out_of_paper", "stopped"].includes(state.pressState);

    ctx.save();
    ctx.fillStyle = "rgba(0, 0, 0, 0.43)";
    ctx.beginPath();
    ctx.ellipse(343, 517, 305, 37, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#101719";
    ctx.fillRect(105, 458, 37, 57);
    ctx.fillRect(545, 458, 37, 57);
    ctx.fillStyle = "#263034";
    ctx.fillRect(99, 510, 50, 8);
    ctx.fillRect(539, 510, 50, 8);

    const body = ctx.createLinearGradient(78, 196, 78, 464);
    body.addColorStop(0, "#2b3c3e");
    body.addColorStop(0.24, "#172527");
    body.addColorStop(1, "#0c1417");
    this._roundRect(ctx, 66, 205, 560, 255, 13);
    ctx.fillStyle = body;
    ctx.fill();
    ctx.strokeStyle = "rgba(156, 192, 194, 0.22)";
    ctx.lineWidth = 2;
    ctx.stroke();

    const hood = ctx.createLinearGradient(0, 160, 0, 230);
    hood.addColorStop(0, "#3a4c4c");
    hood.addColorStop(1, "#172426");
    this._roundRect(ctx, 96, 159, 470, 72, 18);
    ctx.fillStyle = hood;
    ctx.fill();
    ctx.strokeStyle = "rgba(184, 218, 216, 0.2)";
    ctx.stroke();
    ctx.fillStyle = "rgba(255, 255, 255, 0.035)";
    this._roundRect(ctx, 111, 166, 440, 10, 5);
    ctx.fill();

    ctx.fillStyle = "#080e10";
    this._roundRect(ctx, 83, 233, 526, 206, 8);
    ctx.fill();
    ctx.strokeStyle = "rgba(80, 118, 120, 0.35)";
    ctx.stroke();

    this._drawFeeder(ctx, state, job);
    this._drawPaperWeb(ctx, state, job, now);
    this._drawRoller(ctx, 230, 364, 69, "#263c3d", "#0b1214", active);
    this._drawRoller(ctx, 407, 359, 53, "#2b3436", "#090f11", active);
    this._drawRoller(ctx, 514, 322, 28, "#263a3b", "#0b1214", active);

    ctx.strokeStyle = "rgba(150, 183, 184, 0.25)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(109, 445);
    ctx.lineTo(584, 445);
    ctx.stroke();
    ctx.fillStyle = "#081012";
    this._roundRect(ctx, 455, 432, 157, 42, 8);
    ctx.fill();
    ctx.strokeStyle = "rgba(130, 160, 161, 0.24)";
    ctx.stroke();
    ctx.fillStyle = state.gameState === "won" ? "#d6eee0" : "#c4cfc9";
    ctx.fillRect(470, 440, 126, 21);
    ctx.strokeStyle = "rgba(0,0,0,0.24)";
    for (let x = 482; x < 585; x += 11) {
      ctx.beginPath();
      ctx.moveTo(x, 443);
      ctx.lineTo(x - 4, 459);
      ctx.stroke();
    }

    this._drawControlDisplay(ctx, state, job, ink);
    this._drawGauge(ctx, state, now);
    this._drawInkStation(ctx, state, job, ink);
    this._drawPressLamps(ctx, state, now);

    ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
    this._roundRect(ctx, 88, 459, 512, 22, 4);
    ctx.fill();
    ctx.fillStyle = "rgba(190, 215, 211, 0.42)";
    ctx.font = "800 9px 'NightPressCN', monospace";
    ctx.textAlign = "left";
    ctx.fillText("K-2  DUPLEX  /  NIGHT PRESS WORKS", 103, 474);
    ctx.textAlign = "right";
    ctx.fillStyle = stopped ? "rgba(255,101,95,0.8)" : "rgba(108,231,168,0.5)";
    ctx.fillText(stopped ? "FEED STOP" : "FEED READY", 583, 474);
    ctx.restore();
  }

  _drawFeeder(ctx, state, job) {
    ctx.save();
    ctx.fillStyle = "#10191b";
    this._roundRect(ctx, 27, 285, 72, 109, 5);
    ctx.fill();
    ctx.strokeStyle = "rgba(159, 195, 196, 0.18)";
    ctx.stroke();
    const sheets = state.roll[state.roll.active] > 0 ? 9 : 2;
    for (let index = sheets; index >= 0; index -= 1) {
      ctx.fillStyle = index % 2 ? "#c8c1ae" : "#ded7c4";
      ctx.fillRect(39 + index * 1.1, 301 - index * 1.25, 53, 2.3);
    }
    ctx.fillStyle = "#1d292b";
    ctx.fillRect(35, 327, 65, 7);
    ctx.fillStyle = job.accent;
    ctx.globalAlpha = 0.6;
    ctx.fillRect(39, 344, 5, 30);
    ctx.globalAlpha = 1;
    ctx.fillStyle = "rgba(212, 225, 221, 0.42)";
    ctx.font = "700 7px 'NightPressCN', monospace";
    ctx.fillText("FEED", 51, 361);
    ctx.restore();
  }

  _drawPaperWeb(ctx, state, job, now) {
    const run = state.run;
    const printing = state.pressState === "printing";
    ctx.save();
    ctx.fillStyle = "rgba(0, 0, 0, 0.26)";
    ctx.fillRect(500, 388, 109, 56);

    const offset = (state.registration - 50) * 0.52;
    ctx.translate(offset, printing ? Math.sin(now * 0.03) * 0.7 : 0);
    ctx.fillStyle = "#d8d0ba";
    ctx.beginPath();
    ctx.moveTo(45, 319);
    ctx.lineTo(555, 308);
    ctx.lineTo(555, 406);
    ctx.lineTo(45, 398);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(68, 64, 52, 0.15)";
    ctx.stroke();
    ctx.save();
    ctx.globalAlpha = printing ? 0.42 : 0.24;
    this._drawLayoutArt(ctx, 105, 326, 370, 61, job.layout, job.accent, 1);
    ctx.globalAlpha = printing ? 0.25 : 0.13;
    this._drawLayoutArt(ctx, 111, 329, 370, 61, job.layout, job.ink === "cyan" ? "#ff4f9d" : "#35d8ff", 1);
    ctx.restore();

    if (run) {
      const progress = clamp(run.progress / job.copies, 0, 1);
      ctx.fillStyle = "rgba(34, 50, 48, 0.48)";
      ctx.font = "800 8px 'NightPressCN', monospace";
      ctx.fillText(`${run.side} 面 · ${Math.floor(run.progress)}/${job.copies}`, 66, 340);
      ctx.fillStyle = "rgba(20, 38, 37, 0.15)";
      ctx.fillRect(66, 389, 460, 4);
      ctx.fillStyle = job.accent;
      ctx.fillRect(66, 389, 460 * progress, 4);
    } else {
      ctx.fillStyle = "rgba(40, 48, 42, 0.36)";
      ctx.font = "700 8px 'NightPressCN', monospace";
      ctx.fillText("PAPER READY", 66, 340);
    }
    ctx.restore();

    if (printing) {
      ctx.save();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
      ctx.lineWidth = 1;
      for (let index = 0; index < 4; index += 1) {
        const y = 322 + ((now * 0.04 + index * 18) % 65);
        ctx.beginPath();
        ctx.moveTo(477, y);
        ctx.lineTo(498, y - 3);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  _drawRoller(ctx, x, y, radius, color, center, active) {
    ctx.save();
    const metal = ctx.createRadialGradient(x - radius * 0.35, y - radius * 0.4, 2, x, y, radius);
    metal.addColorStop(0, "#718183");
    metal.addColorStop(0.35, color);
    metal.addColorStop(1, center);
    ctx.fillStyle = metal;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(180, 210, 208, 0.24)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(this.rotation);
    ctx.strokeStyle = active ? "rgba(87, 223, 245, 0.3)" : "rgba(177, 201, 199, 0.14)";
    ctx.lineWidth = 2;
    for (let index = 0; index < 6; index += 1) {
      ctx.rotate(Math.PI / 3);
      ctx.beginPath();
      ctx.moveTo(radius * 0.2, 0);
      ctx.lineTo(radius * 0.72, 0);
      ctx.stroke();
    }
    ctx.restore();
    ctx.fillStyle = "#0a1113";
    ctx.beginPath();
    ctx.arc(x, y, radius * 0.16, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(158, 183, 181, 0.38)";
    ctx.beginPath();
    ctx.arc(x, y, radius * 0.07, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  _drawControlDisplay(ctx, state, job, ink) {
    ctx.save();
    ctx.fillStyle = "#071012";
    this._roundRect(ctx, 109, 246, 219, 52, 4);
    ctx.fill();
    ctx.strokeStyle = "rgba(87, 223, 245, 0.22)";
    ctx.stroke();
    const run = state.run;
    const side = run?.side || (job.stage === "ready_b" ? "B" : "A");
    const progress = run ? run.progress / job.copies : 0;
    ctx.fillStyle = "rgba(94, 222, 238, 0.82)";
    ctx.font = "700 8px 'NightPressCN', monospace";
    ctx.textAlign = "left";
    ctx.fillText(`JOB ${job.code.replace("单 ", "")}  ·  SIDE ${side}`, 120, 261);
    ctx.fillStyle = "#c9d9d8";
    ctx.font = "800 13px 'NightPressCN', sans-serif";
    ctx.fillText(job.title, 120, 279);
    ctx.fillStyle = "rgba(87, 223, 245, 0.22)";
    ctx.fillRect(120, 286, 193, 3);
    ctx.fillStyle = ink.color;
    ctx.fillRect(120, 286, 193 * progress, 3);
    ctx.fillStyle = "rgba(193, 215, 214, 0.45)";
    ctx.font = "700 7px 'NightPressCN', monospace";
    ctx.fillText(state.gameState === "won" ? "SHIFT COMPLETE" : state.pressState.toUpperCase(), 120, 294);
    ctx.textAlign = "right";
    ctx.fillText(`${Math.round(progress * 100)}%`, 313, 294);
    ctx.restore();
  }

  _drawGauge(ctx, state, now) {
    const centerX = 363;
    const centerY = 268;
    ctx.save();
    ctx.fillStyle = "#101b1d";
    ctx.beginPath();
    ctx.arc(centerX, centerY, 24, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(196, 218, 215, 0.24)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.strokeStyle = "rgba(205, 224, 220, 0.38)";
    ctx.lineWidth = 1;
    for (let index = 0; index < 11; index += 1) {
      const angle = Math.PI * 0.8 + (index / 10) * Math.PI * 1.4;
      ctx.beginPath();
      ctx.moveTo(centerX + Math.cos(angle) * 16, centerY + Math.sin(angle) * 16);
      ctx.lineTo(centerX + Math.cos(angle) * 21, centerY + Math.sin(angle) * 21);
      ctx.stroke();
    }
    const pressure = 0.55 + (state.speed / 3) * 0.32 + Math.sin(now * 0.005) * 0.02;
    const angle = Math.PI * 0.8 + pressure * Math.PI * 1.4;
    ctx.strokeStyle = "#ffc45c";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(centerX + Math.cos(angle) * 15, centerY + Math.sin(angle) * 15);
    ctx.stroke();
    ctx.fillStyle = "#293334";
    ctx.beginPath();
    ctx.arc(centerX, centerY, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(192, 211, 207, 0.36)";
    ctx.font = "700 6px 'NightPressCN', monospace";
    ctx.textAlign = "center";
    ctx.fillText("PRESSURE", centerX, 303);
    ctx.restore();
  }

  _drawInkStation(ctx, state, job, ink) {
    ctx.save();
    ctx.fillStyle = "#0a1214";
    this._roundRect(ctx, 459, 258, 94, 73, 5);
    ctx.fill();
    ctx.strokeStyle = "rgba(132, 166, 166, 0.22)";
    ctx.stroke();
    ctx.fillStyle = "rgba(210, 225, 219, 0.38)";
    ctx.font = "700 6px 'NightPressCN', monospace";
    ctx.textAlign = "left";
    ctx.fillText("INK UNIT", 468, 271);
    const level = state.inkLevels[job.ink] / 100;
    ctx.fillStyle = "#152023";
    this._roundRect(ctx, 471, 278, 17, 42, 5);
    ctx.fill();
    ctx.fillStyle = ink.dark;
    ctx.fillRect(474, 294, 11, 23);
    ctx.fillStyle = ink.color;
    ctx.fillRect(474, 294 + 23 * (1 - level), 11, 23 * level);
    ctx.globalAlpha = 0.55;
    ctx.fillRect(474, 303, 11, 1);
    ctx.globalAlpha = 1;
    ctx.fillStyle = "rgba(216, 229, 224, 0.55)";
    ctx.font = "700 7px 'NightPressCN', monospace";
    ctx.fillText(ink.label, 496, 290);
    ctx.fillStyle = "rgba(216, 229, 224, 0.3)";
    ctx.font = "600 6px 'NightPressCN', monospace";
    ctx.fillText(`${Math.round(level * 100)}%`, 496, 302);
    ctx.strokeStyle = ink.dark;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(488, 318);
    ctx.bezierCurveTo(518, 328, 531, 307, 535, 300);
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }

  _drawPressLamps(ctx, state, now) {
    const x = 461;
    const y = 218;
    const colors = [
      { color: "#6ce7a8", on: state.pressState !== "stopped" && state.pressState !== "out_of_paper" },
      { color: "#ffc45c", on: state.pressState === "printing" },
      { color: "#ff655f", on: state.pressState === "out_of_paper" || state.pressState === "stopped" }
    ];
    ctx.save();
    ctx.fillStyle = "#0b1315";
    this._roundRect(ctx, x - 8, y - 8, 94, 36, 4);
    ctx.fill();
    ctx.strokeStyle = "rgba(180, 206, 202, 0.18)";
    ctx.stroke();
    colors.forEach((lamp, index) => {
      const cx = x + index * 27;
      const pulse = lamp.on && index === 2 ? 0.55 + Math.sin(now * 0.018) * 0.35 : 1;
      ctx.globalAlpha = lamp.on ? pulse : 0.18;
      ctx.fillStyle = lamp.color;
      ctx.beginPath();
      ctx.arc(cx, y + 10, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = lamp.on ? 0.16 : 0;
      ctx.beginPath();
      ctx.arc(cx, y + 10, 11, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
    ctx.fillStyle = "rgba(207, 224, 219, 0.38)";
    ctx.font = "700 6px 'NightPressCN', monospace";
    ctx.textAlign = "left";
    ctx.fillText("POWER", x - 1, y + 22);
    ctx.fillText("RUN", x + 28, y + 22);
    ctx.fillText("FAULT", x + 54, y + 22);
    ctx.restore();
  }

  _drawDryRack(ctx, state, now) {
    ctx.save();
    ctx.fillStyle = "rgba(0, 0, 0, 0.34)";
    ctx.beginPath();
    ctx.ellipse(803, 365, 170, 19, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(166, 194, 193, 0.26)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(626, 108);
    ctx.lineTo(970, 108);
    ctx.moveTo(638, 108);
    ctx.lineTo(638, 371);
    ctx.moveTo(958, 108);
    ctx.lineTo(958, 371);
    ctx.stroke();
    ctx.strokeStyle = "rgba(166, 194, 193, 0.15)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(631, 143);
    ctx.lineTo(966, 143);
    ctx.stroke();
    ctx.fillStyle = "rgba(189, 213, 209, 0.48)";
    ctx.font = "800 8px 'NightPressCN', monospace";
    ctx.textAlign = "left";
    ctx.fillText("DRY RACK  /  A 面晾纸", 648, 128);
    ctx.fillStyle = "rgba(108, 231, 168, 0.5)";
    ctx.textAlign = "right";
    ctx.fillText("AIR DRY", 950, 128);

    const sheets = state.jobs.filter((job) => ["drying", "ready_flip"].includes(job.stage));
    if (sheets.length === 0) {
      ctx.strokeStyle = "rgba(187, 208, 204, 0.09)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(703, 148);
      ctx.lineTo(703, 225);
      ctx.moveTo(884, 148);
      ctx.lineTo(884, 225);
      ctx.stroke();
      ctx.fillStyle = "rgba(193, 211, 207, 0.28)";
      ctx.font = "700 9px 'NightPressCN', monospace";
      ctx.textAlign = "center";
      ctx.fillText("晾纸架空置", 800, 195);
      ctx.fillStyle = "rgba(193, 211, 207, 0.13)";
      ctx.font = "600 7px 'NightPressCN', monospace";
      ctx.fillText("PRINT SIDE A · WAIT · FLIP", 800, 211);
      ctx.restore();
      return;
    }

    const positions = sheets.length === 1 ? [800] : sheets.length === 2 ? [746, 854] : [686, 800, 914];
    sheets.forEach((job, index) => {
      const x = positions[index];
      this._drawHangingSheet(ctx, job, x, now, index);
    });
    ctx.restore();
  }

  _drawHangingSheet(ctx, job, x, now, index) {
    const paperWidth = 66;
    const paperHeight = 91;
    const top = 157;
    const remaining = job.stage === "drying" ? job.dryRemaining : 0;
    const ratio = job.stage === "drying" ? 1 - remaining / job.dryTime : 1;
    ctx.save();
    ctx.strokeStyle = "#839390";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x - 9, 143);
    ctx.lineTo(x, top + 4);
    ctx.moveTo(x + 9, 143);
    ctx.lineTo(x, top + 4);
    ctx.stroke();
    ctx.fillStyle = "#657572";
    ctx.beginPath();
    ctx.arc(x, top + 4, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.translate(x - paperWidth / 2, top + 8);
    ctx.rotate(Math.sin(index * 2 + now * 0.0013) * 0.012);
    ctx.fillStyle = job.stage === "ready_flip" ? "#e7dfc8" : "#d8d1bd";
    ctx.fillRect(0, 0, paperWidth, paperHeight);
    ctx.strokeStyle = job.stage === "ready_flip" ? "rgba(108, 231, 168, 0.8)" : "rgba(61, 57, 47, 0.22)";
    ctx.lineWidth = job.stage === "ready_flip" ? 2 : 1;
    ctx.strokeRect(0, 0, paperWidth, paperHeight);
    this._drawLayoutArt(ctx, 8, 10, 50, 62, job.layout, job.accent, 0.46);
    ctx.fillStyle = "rgba(19, 30, 30, 0.42)";
    ctx.font = "700 6px 'NightPressCN', monospace";
    ctx.fillText("A", paperWidth - 13, 13);
    if (job.stage === "drying") {
      ctx.fillStyle = "rgba(23, 57, 49, 0.13)";
      ctx.fillRect(0, paperHeight - 6, paperWidth, 3);
      ctx.fillStyle = job.accent;
      ctx.fillRect(0, paperHeight - 6, paperWidth * ratio, 3);
      for (let streak = 0; streak < 3; streak += 1) {
        const phase = (now * 0.009 + streak * 0.72 + index) % 1;
        ctx.strokeStyle = `rgba(205, 233, 226, ${0.16 * (1 - phase)})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(10 + streak * 19, -4 - phase * 20);
        ctx.bezierCurveTo(7 + streak * 19, -18 - phase * 20, 16 + streak * 19, -27 - phase * 20, 12 + streak * 19, -44 - phase * 20);
        ctx.stroke();
      }
    } else {
      ctx.globalAlpha = 0.6 + Math.sin(now * 0.009) * 0.2;
      ctx.fillStyle = "#6ce7a8";
      ctx.fillRect(8, paperHeight + 4, 32, 1);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    ctx.fillStyle = job.stage === "ready_flip" ? "#6ce7a8" : "rgba(220, 234, 229, 0.62)";
    ctx.font = "800 7px 'NightPressCN', monospace";
    ctx.textAlign = "center";
    ctx.fillText(job.title, x, 267);
    ctx.fillStyle = "rgba(206, 222, 217, 0.38)";
    ctx.font = "600 6px 'NightPressCN', monospace";
    ctx.fillText(job.stage === "ready_flip" ? "干透 · 可翻面" : `${remaining.toFixed(1)}s 晾干`, x, 279);
    if (job.stage === "ready_flip") {
      ctx.globalAlpha = 0.65 + Math.sin(now * 0.012) * 0.25;
      ctx.strokeStyle = "#6ce7a8";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, 210, 49, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  _drawPaperStation(ctx, state, now) {
    ctx.save();
    ctx.fillStyle = "rgba(8, 14, 17, 0.76)";
    this._roundRect(ctx, 627, 394, 344, 178, 7);
    ctx.fill();
    ctx.strokeStyle = "rgba(156, 188, 184, 0.2)";
    ctx.stroke();
    ctx.fillStyle = "rgba(189, 210, 205, 0.45)";
    ctx.font = "800 8px 'NightPressCN', monospace";
    ctx.textAlign = "left";
    ctx.fillText("PAPER STATION", 647, 414);
    ctx.fillStyle = state.pressState === "out_of_paper" ? "#ff655f" : "rgba(255, 196, 92, 0.55)";
    ctx.textAlign = "right";
    ctx.fillText(state.pressState === "out_of_paper" ? "SUPPLY FAULT" : "SUPPLY OK", 951, 414);

    this._drawPaperRoll(ctx, {
      x: 690,
      y: 498,
      count: state.roll.main,
      max: state.rollCaps.main,
      label: "01 · 主纸卷",
      active: state.roll.active === "main",
      now
    });
    this._drawPaperRoll(ctx, {
      x: 819,
      y: 498,
      count: state.roll.backup,
      max: state.rollCaps.backup,
      label: "02 · 备用卷",
      active: state.roll.active === "backup",
      now
    });

    ctx.strokeStyle = "rgba(152, 183, 179, 0.22)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(928, 471);
    ctx.lineTo(958, 471);
    ctx.lineTo(958, 438);
    ctx.stroke();
    ctx.fillStyle = "rgba(207, 222, 217, 0.35)";
    ctx.font = "600 6px 'NightPressCN', monospace";
    ctx.textAlign = "center";
    ctx.fillText("TO PRESS", 943, 456);
    ctx.restore();
  }

  _drawPaperRoll(ctx, options) {
    const { x, y, count, max, label, active, now } = options;
    const ratio = clamp(count / Math.max(1, max), 0, 1);
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.beginPath();
    ctx.ellipse(x, y + 37, 39, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#0a1012";
    ctx.beginPath();
    ctx.arc(x, y, 39, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = active ? "rgba(87, 223, 245, 0.58)" : "rgba(159, 185, 181, 0.22)";
    ctx.lineWidth = active ? 2 : 1;
    ctx.stroke();
    const inner = 10 + ratio * 21;
    ctx.fillStyle = "#c9c1ac";
    ctx.beginPath();
    ctx.arc(x, y, inner, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(58, 54, 43, 0.32)";
    ctx.lineWidth = 1;
    for (let radius = inner + 3; radius < 35; radius += 5) {
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = "#101719";
    ctx.beginPath();
    ctx.arc(x, y, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#70817c";
    ctx.beginPath();
    ctx.arc(x, y, 4, now * 0.001, Math.PI * 2 + now * 0.001);
    ctx.stroke();
    ctx.fillStyle = active ? "#57dff5" : count > 0 ? "rgba(213, 226, 220, 0.56)" : "#ff655f";
    ctx.font = "800 8px 'NightPressCN', monospace";
    ctx.textAlign = "center";
    ctx.fillText(label, x, 548);
    ctx.fillStyle = count > 0 ? "rgba(210, 222, 216, 0.5)" : "#ff655f";
    ctx.font = "700 7px 'NightPressCN', monospace";
    ctx.fillText(active ? `在机 · ${count} 张` : `${count} 张余量`, x, 559);
    ctx.restore();
  }

  _drawWasteBin(ctx, state, now) {
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.32)";
    ctx.beginPath();
    ctx.ellipse(106, 589, 63, 13, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#1c2524";
    ctx.beginPath();
    ctx.moveTo(58, 520);
    ctx.lineTo(70, 587);
    ctx.lineTo(145, 587);
    ctx.lineTo(157, 520);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(147, 172, 167, 0.24)";
    ctx.stroke();
    ctx.fillStyle = "#0a1011";
    ctx.fillRect(53, 514, 109, 9);
    ctx.fillStyle = "rgba(218, 228, 221, 0.42)";
    ctx.font = "700 7px 'NightPressCN', monospace";
    ctx.textAlign = "center";
    ctx.fillText("WASTE", 107, 557);
    ctx.fillStyle = state.waste > state.wasteLimit ? "#ff655f" : "#ffc45c";
    ctx.font = "900 15px 'NightPressCN', monospace";
    ctx.fillText(`${state.waste} / ${state.wasteLimit}`, 107, 576);
    for (let index = 0; index < Math.min(state.waste, 6); index += 1) {
      const cx = 76 + (index % 3) * 29;
      const cy = 530 + Math.floor(index / 3) * 15;
      ctx.fillStyle = index % 2 ? "#bdb59f" : "#d6cdb6";
      ctx.beginPath();
      ctx.arc(cx, cy, 6 + (index % 2), 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(57, 51, 42, 0.28)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    if (state.pressState === "out_of_paper") {
      ctx.globalAlpha = 0.48 + Math.sin(now * 0.014) * 0.24;
      ctx.strokeStyle = "#ff655f";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(120, 500, 38, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  _drawForeground(ctx, state, now) {
    const vignette = ctx.createRadialGradient(500, 285, 210, 500, 285, 690);
    vignette.addColorStop(0, "rgba(0,0,0,0)");
    vignette.addColorStop(1, "rgba(0,0,0,0.39)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, W, H);
    if (state.pressState === "printing") {
      ctx.save();
      const alpha = 0.025 + state.speed * 0.015;
      ctx.strokeStyle = `rgba(134, 230, 233, ${alpha})`;
      ctx.lineWidth = 1;
      for (let index = 0; index < 7; index += 1) {
        const y = 165 + index * 44;
        const shift = (now * 0.025 * state.speed + index * 13) % 22;
        ctx.beginPath();
        ctx.moveTo(8 + shift, y);
        ctx.lineTo(24 + shift, y);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  _drawLayoutArt(ctx, x, y, width, height, layoutId, color, opacity = 1) {
    ctx.save();
    ctx.globalAlpha *= opacity;
    ctx.fillStyle = color;
    if (layoutId === "poster") {
      ctx.fillRect(x, y, width * 0.56, height * 0.42);
      ctx.globalAlpha *= 0.48;
      ctx.fillRect(x + width * 0.61, y + height * 0.08, width * 0.39, height * 0.14);
      ctx.fillRect(x + width * 0.61, y + height * 0.29, width * 0.3, height * 0.08);
    } else if (layoutId === "columns") {
      ctx.fillRect(x, y, width * 0.47, height * 0.17);
      ctx.globalAlpha *= 0.55;
      for (let row = 0; row < 3; row += 1) {
        ctx.fillRect(x, y + height * (0.28 + row * 0.22), width * 0.45, height * 0.035);
        ctx.fillRect(x + width * 0.53, y + height * (0.28 + row * 0.22), width * 0.47, height * 0.035);
      }
    } else {
      ctx.fillRect(x, y, width * 0.35, height * 0.17);
      ctx.globalAlpha *= 0.45;
      ctx.fillRect(x, y + height * 0.28, width * 0.65, height * 0.04);
      ctx.fillRect(x, y + height * 0.45, width * 0.42, height * 0.04);
      ctx.fillRect(x, y + height * 0.7, width * 0.24, height * 0.2);
      ctx.fillRect(x + width * 0.3, y + height * 0.7, width * 0.22, height * 0.2);
    }
    ctx.restore();
  }

  _roundRect(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
  }
}
