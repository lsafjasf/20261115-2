import {
  BUILDINGS,
  DESTINATIONS,
  LAMPS,
  PUDDLES,
  START,
  TREES,
  WORLD,
} from "./map.js";
import { clamp, normalizeAngle } from "./physics.js";

const TAU = Math.PI * 2;
const fontSans = '"Noto Sans SC", "Microsoft YaHei", sans-serif';
const fontSerif = '"Noto Serif SC", "Songti SC", "Noto Sans SC", Georgia, serif';
const fontMono = '"IBM Plex Mono", "Noto Sans SC", monospace';
const MINI_ROUTE = [
  [760, 956],
  [480, 934],
  [220, 934],
  [220, 300],
  [480, 300],
  [760, 300],
  [760, 610],
  [1040, 610],
  [1280, 610],
  [1280, 820],
  [1242, 820],
];

function hash(text) {
  let value = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value, 16777619);
  }
  return (value >>> 0) / 4294967295;
}

function roundRect(ctx, x, y, w, h, radius) {
  const r = Math.min(radius, w / 2, h / 2);
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.camera = { x: START.x, y: START.y, scale: 1 };
    this.rain = [];
    this.time = 0;
    this.staticLayer = document.createElement("canvas");
    this.staticLayer.width = WORLD.width;
    this.staticLayer.height = WORLD.height;
    this.staticCtx = this.staticLayer.getContext("2d");
    this.lightLayer = document.createElement("canvas");
    this.lightCtx = this.lightLayer.getContext("2d");
    this.buildStaticLayer();
    this.seedRain();
    this.resize();
  }

  resize() {
    this.width = Math.max(320, window.innerWidth);
    this.height = Math.max(320, window.innerHeight);
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.lightLayer.width = this.canvas.width;
    this.lightLayer.height = this.canvas.height;
    this.lightCtx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.rainScale = clamp(this.width / 1280, 0.7, 1.35);
    this.seedRain();
  }

  seedRain() {
    const count = Math.floor((this.width * this.height) / 2900);
    this.rain = Array.from({ length: count }, () => this.makeDrop(true));
  }

  makeDrop(initial = false) {
    return {
      x: Math.random() * (this.width + 160) - 80,
      y: initial ? Math.random() * this.height : -40 - Math.random() * 100,
      speed: 330 + Math.random() * 390,
      drift: 42 + Math.random() * 48,
      length: 8 + Math.random() * 19,
      alpha: 0.1 + Math.random() * 0.24,
      bright: Math.random() > 0.88,
    };
  }

  buildStaticLayer() {
    const ctx = this.staticCtx;
    ctx.clearRect(0, 0, WORLD.width, WORLD.height);
    this.drawGround(ctx);
    this.drawRoadGraph(ctx);
    BUILDINGS.forEach((building, index) => this.drawBuilding(ctx, building, index));
    this.drawRoadDetails(ctx);
    this.drawTrees(ctx);
    this.drawLampPosts(ctx);
  }

  drawGround(ctx) {
    ctx.fillStyle = "#0b141a";
    ctx.fillRect(0, 0, WORLD.width, WORLD.height);

    const grain = document.createElement("canvas");
    grain.width = 180;
    grain.height = 180;
    const grainCtx = grain.getContext("2d");
    const image = grainCtx.createImageData(grain.width, grain.height);
    for (let i = 0; i < image.data.length; i += 4) {
      const value = Math.random() * 255;
      image.data[i] = value * 0.12;
      image.data[i + 1] = value * 0.2;
      image.data[i + 2] = value * 0.23;
      image.data[i + 3] = 9 + Math.random() * 20;
    }
    grainCtx.putImageData(image, 0, 0);
    ctx.fillStyle = ctx.createPattern(grain, "repeat");
    ctx.fillRect(0, 0, WORLD.width, WORLD.height);

    const glow = ctx.createLinearGradient(0, 0, WORLD.width, WORLD.height);
    glow.addColorStop(0, "rgba(34, 72, 82, 0.13)");
    glow.addColorStop(0.48, "rgba(5, 13, 18, 0.1)");
    glow.addColorStop(1, "rgba(15, 41, 53, 0.16)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, WORLD.width, WORLD.height);
  }

  drawRoadGraph(ctx) {
    ctx.save();
    ctx.strokeStyle = "rgba(198, 197, 153, 0.2)";
    ctx.lineWidth = 2;
    ctx.setLineDash([24, 27]);
    ctx.lineDashOffset = 11;
    for (const x of [220, 760, 1280]) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, WORLD.height);
      ctx.stroke();
    }
    for (const y of [280, 660, 960]) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(WORLD.width, y);
      ctx.stroke();
    }
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = "rgba(142, 188, 190, 0.09)";
    ctx.lineWidth = 1;
    for (const x of [152, 288, 672, 848, 1202, 1358]) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, WORLD.height);
      ctx.stroke();
    }
    for (const y of [212, 348, 572, 748, 892, 1028]) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(WORLD.width, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawBuilding(ctx, building, index) {
    const seed = hash(building.id);
    const sidewalk = 13;
    ctx.save();
    ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
    ctx.fillRect(building.x + 7, building.y + 9, building.w + 26, building.h + 26);
    roundRect(
      ctx,
      building.x - sidewalk,
      building.y - sidewalk,
      building.w + sidewalk * 2,
      building.h + sidewalk * 2,
      3,
    );
    ctx.fillStyle = "#1b282d";
    ctx.fill();
    ctx.strokeStyle = "rgba(148, 178, 179, 0.16)";
    ctx.lineWidth = 1;
    ctx.stroke();

    const hue = building.hue;
    ctx.fillStyle = `hsl(${hue} 19% ${15 + (index % 3) * 2}%)`;
    ctx.fillRect(building.x, building.y, building.w, building.h);
    ctx.fillStyle = `hsla(${hue} 28% 48% / 0.08)`;
    ctx.fillRect(building.x + 5, building.y + 5, building.w - 10, building.h - 10);
    ctx.strokeStyle = `hsla(${hue} 43% 64% / 0.12)`;
    ctx.strokeRect(building.x + 0.5, building.y + 0.5, building.w - 1, building.h - 1);

    ctx.strokeStyle = "rgba(2, 8, 11, 0.52)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(building.x + 8, building.y + building.h);
    ctx.lineTo(building.x + 8, building.y + 8);
    ctx.lineTo(building.x + building.w, building.y + 8);
    ctx.stroke();

    this.drawRoofDetails(ctx, building, seed);
    ctx.restore();
  }

  drawRoofDetails(ctx, building, seed) {
    ctx.save();
    const inset = 14;
    ctx.strokeStyle = "rgba(145, 174, 175, 0.09)";
    ctx.lineWidth = 1;
    ctx.strokeRect(
      building.x + inset,
      building.y + inset,
      building.w - inset * 2,
      building.h - inset * 2,
    );
    if (building.roof === "tiles") {
      ctx.strokeStyle = "rgba(2, 8, 11, 0.24)";
      const gap = 17;
      for (let y = building.y + 20; y < building.y + building.h - 10; y += gap) {
        ctx.beginPath();
        ctx.moveTo(building.x + 15, y);
        ctx.lineTo(building.x + building.w - 15, y);
        ctx.stroke();
      }
    }

    const count = Math.max(2, Math.floor((building.w * building.h) / 5800));
    for (let i = 0; i < count; i += 1) {
      const px =
        building.x + 28 + hash(`${building.id}-x-${i}`) * (building.w - 56);
      const py =
        building.y + 28 + hash(`${building.id}-y-${i}`) * (building.h - 56);
      const size = 7 + hash(`${building.id}-s-${i}`) * 13;
      if (building.roof === "water" && i < 2) {
        ctx.fillStyle = "#26373c";
        ctx.beginPath();
        ctx.arc(px, py, size, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = "rgba(158, 196, 195, 0.18)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(px, py, size - 3, 0, TAU);
        ctx.stroke();
        ctx.fillStyle = "rgba(188, 219, 215, 0.1)";
        ctx.beginPath();
        ctx.arc(px - size * 0.25, py - size * 0.25, size * 0.35, 0, TAU);
        ctx.fill();
      } else if (building.roof === "vents") {
        roundRect(ctx, px - size * 0.7, py - size * 0.45, size * 1.4, size * 0.9, 2);
        ctx.fillStyle = "rgba(4, 11, 15, 0.7)";
        ctx.fill();
        ctx.strokeStyle = "rgba(137, 164, 166, 0.16)";
        ctx.stroke();
      } else {
        ctx.fillStyle = `hsla(${building.hue + 20} 33% 66% / ${0.06 + seed * 0.03})`;
        ctx.fillRect(px, py, size * 1.5, size * 0.7);
      }
    }
    ctx.restore();
  }

  drawRoadDetails(ctx) {
    const drains = [
      [92, 612],
      [684, 904],
      [1348, 528],
      [858, 1098],
      [526, 340],
      [1208, 1000],
    ];
    ctx.save();
    for (const [x, y] of drains) {
      ctx.fillStyle = "rgba(2, 7, 10, 0.72)";
      roundRect(ctx, x - 10, y - 5, 20, 10, 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(153, 180, 176, 0.18)";
      ctx.lineWidth = 1;
      for (let i = -7; i <= 7; i += 3) {
        ctx.beginPath();
        ctx.moveTo(x + i, y - 3);
        ctx.lineTo(x + i, y + 3);
        ctx.stroke();
      }
    }
    ctx.font = `600 9px ${fontMono}`;
    ctx.fillStyle = "rgba(164, 190, 188, 0.18)";
    ctx.textAlign = "center";
    for (let x = 330; x < WORLD.width - 200; x += 520) {
      ctx.fillText("雨夜慢行", x, 1002);
    }
    ctx.restore();
  }

  drawTrees(ctx) {
    ctx.save();
    for (const tree of TREES) {
      ctx.fillStyle = "rgba(0, 0, 0, 0.32)";
      ctx.beginPath();
      ctx.ellipse(
        tree.x + 9,
        tree.y + 11,
        tree.r * 1.1,
        tree.r * 0.76,
        0.5,
        0,
        TAU,
      );
      ctx.fill();
      ctx.fillStyle = "#20392f";
      ctx.beginPath();
      ctx.arc(tree.x, tree.y, tree.r, 0, TAU);
      ctx.fill();
      ctx.fillStyle = "rgba(72, 113, 91, 0.22)";
      ctx.beginPath();
      ctx.arc(tree.x - tree.r * 0.25, tree.y - tree.r * 0.3, tree.r * 0.55, 0, TAU);
      ctx.fill();
      ctx.fillStyle = "#3e4a3e";
      ctx.beginPath();
      ctx.arc(tree.x, tree.y, 3, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  drawLampPosts(ctx) {
    ctx.save();
    for (const lamp of LAMPS) {
      ctx.fillStyle = "rgba(0, 0, 0, 0.28)";
      ctx.beginPath();
      ctx.ellipse(lamp.x + 7, lamp.y + 8, 12, 5, 0.6, 0, TAU);
      ctx.fill();
      ctx.fillStyle = "#3f5255";
      ctx.beginPath();
      ctx.arc(lamp.x, lamp.y, 4, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = "rgba(212, 229, 207, 0.22)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(lamp.x, lamp.y, 7, Math.PI, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }

  update(dt) {
    this.time += dt;
    const fall = dt * 1.2;
    for (let i = 0; i < this.rain.length; i += 1) {
      const drop = this.rain[i];
      drop.y += drop.speed * dt;
      drop.x -= drop.drift * fall;
      if (drop.y > this.height + 30 || drop.x < -100) {
        this.rain[i] = this.makeDrop(false);
      }
    }
  }

  draw(game) {
    const ctx = this.ctx;
    const scale = clamp(
      Math.max(this.width / WORLD.width, this.height / WORLD.height),
      0.55,
      1.5,
    );
    const viewWidth = this.width / scale;
    const viewHeight = this.height / scale;
    const targetX = game.bike ? game.bike.x : START.x;
    const targetY = game.bike ? game.bike.y : START.y;
    const cameraX =
      viewWidth >= WORLD.width
        ? WORLD.width / 2
        : clamp(targetX, viewWidth / 2, WORLD.width - viewWidth / 2);
    const cameraY =
      viewHeight >= WORLD.height
        ? WORLD.height / 2
        : clamp(targetY, viewHeight / 2, WORLD.height - viewHeight / 2);
    this.camera = { x: cameraX, y: cameraY, scale, viewWidth, viewHeight };

    ctx.clearRect(0, 0, this.width, this.height);
    ctx.fillStyle = "#041016";
    ctx.fillRect(0, 0, this.width, this.height);

    ctx.save();
    ctx.translate(
      this.width / 2 - cameraX * scale,
      this.height / 2 - cameraY * scale,
    );
    ctx.scale(scale, scale);
    ctx.drawImage(this.staticLayer, 0, 0);
    this.drawLampGlow(ctx, game);
    this.drawPuddles(ctx, game);
    this.drawDestination(ctx, game);
    this.drawSkidMarks(ctx, game);
    if (game.bike) this.drawBike(ctx, game);
    if (game.bike) this.drawBikeSpray(ctx, game);
    ctx.restore();

    this.drawDarkness(game);
    this.drawRain(ctx, game);
    this.drawDestinationArrow(ctx, game);
    this.drawHud(ctx, game);
  }

  worldToScreen(x, y) {
    const { x: cx, y: cy, scale } = this.camera;
    return {
      x: this.width / 2 + (x - cx) * scale,
      y: this.height / 2 + (y - cy) * scale,
    };
  }

  drawLampGlow(ctx, game) {
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    for (const lamp of LAMPS) {
      if (!lamp.lit) continue;
      const flicker = 0.88 + Math.sin(this.time * 7 + lamp.x) * 0.045;
      const gradient = ctx.createRadialGradient(
        lamp.x,
        lamp.y,
        3,
        lamp.x,
        lamp.y,
        86,
      );
      gradient.addColorStop(0, `rgba(255, 211, 126, ${0.17 * flicker})`);
      gradient.addColorStop(0.5, `rgba(255, 198, 101, ${0.075 * flicker})`);
      gradient.addColorStop(1, "rgba(255, 190, 90, 0)");
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(lamp.x, lamp.y, 86, 0, TAU);
      ctx.fill();
      ctx.fillStyle = "rgba(255, 226, 167, 0.66)";
      ctx.beginPath();
      ctx.arc(lamp.x, lamp.y, 3.5, 0, TAU);
      ctx.fill();
    }
    ctx.restore();

    for (const puddle of PUDDLES) {
      const glint = 0.16 + Math.max(0, Math.sin(this.time * 1.3 + puddle.x)) * 0.1;
      ctx.fillStyle = `rgba(125, 190, 203, ${glint})`;
      ctx.beginPath();
      ctx.ellipse(
        puddle.x - puddle.rx * 0.15,
        puddle.y - puddle.ry * 0.12,
        puddle.rx * 0.46,
        puddle.ry * 0.1,
        puddle.rotation,
        0,
        TAU,
      );
      ctx.fill();
    }
    void game;
  }

  drawPuddles(ctx, game) {
    ctx.save();
    for (let index = 0; index < PUDDLES.length; index += 1) {
      const puddle = PUDDLES[index];
      const phase = this.time * 1.15 + index * 1.7;
      ctx.save();
      ctx.translate(puddle.x, puddle.y);
      ctx.rotate(puddle.rotation);

      const gradient = ctx.createRadialGradient(
        -puddle.rx * 0.2,
        -puddle.ry * 0.24,
        2,
        0,
        0,
        puddle.rx,
      );
      gradient.addColorStop(0, "rgba(45, 89, 104, 0.6)");
      gradient.addColorStop(0.58, "rgba(20, 57, 72, 0.56)");
      gradient.addColorStop(1, "rgba(9, 30, 41, 0.7)");
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.ellipse(0, 0, puddle.rx, puddle.ry, 0, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = "rgba(112, 163, 174, 0.24)";
      ctx.lineWidth = 1.2;
      ctx.stroke();

      ctx.strokeStyle = "rgba(134, 192, 202, 0.16)";
      ctx.lineWidth = 0.8;
      for (let ring = 0; ring < 3; ring += 1) {
        const ripple = (phase + ring * 1.4) % 3;
        const radius = 0.16 + ripple * 0.2;
        ctx.globalAlpha = Math.max(0, 1 - ripple / 3) * 0.45;
        ctx.beginPath();
        ctx.ellipse(
          Math.sin(phase + ring) * puddle.rx * 0.2,
          0,
          puddle.rx * radius,
          puddle.ry * radius,
          0,
          0,
          TAU,
        );
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      if (game.bike && game.bike.inPuddle) {
        const isSame = Math.abs(game.bike.x - puddle.x) < puddle.rx * 1.3;
        if (isSame) {
          ctx.strokeStyle = "rgba(210, 238, 230, 0.24)";
          ctx.lineWidth = 1;
          const splashPhase = (this.time * 2.4) % 1;
          ctx.beginPath();
          ctx.ellipse(
            0,
            0,
            puddle.rx * (0.45 + splashPhase * 0.4),
            puddle.ry * (0.45 + splashPhase * 0.4),
            0,
            0,
            TAU,
          );
          ctx.stroke();
        }
      }
      ctx.restore();
    }
    ctx.restore();
  }

  drawDestination(ctx, game) {
    DESTINATIONS.forEach((destination, index) => {
      const delivered = index < game.destinationIndex;
      const active = index === game.destinationIndex && game.phase !== "success";
      const open = active && game.delivery.windowOpen;
      const cooldown = active && game.delivery.cooldown > 0;
      const color = destination.accent;
      const marker = destination.marker;
      const pulse = 0.5 + Math.sin(this.time * 3.4 + index) * 0.5;

      ctx.save();
      ctx.strokeStyle = delivered
        ? "rgba(130, 205, 167, 0.36)"
        : active
          ? color
          : "rgba(177, 199, 199, 0.14)";
      ctx.globalAlpha = active ? 0.72 + pulse * 0.22 : delivered ? 0.65 : 0.5;
      ctx.lineWidth = active ? 2 : 1;
      ctx.setLineDash(active ? [12, 8] : [7, 11]);
      ctx.lineDashOffset = active ? -this.time * 22 : 0;
      ctx.beginPath();
      ctx.arc(marker.x, marker.y, open ? 49 : 43, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);

      if (active) {
        ctx.fillStyle = `rgba(255, 255, 255, ${0.025 + pulse * 0.03})`;
        ctx.beginPath();
        ctx.arc(marker.x, marker.y, 43, 0, TAU);
        ctx.fill();
      }
      ctx.restore();

      this.drawDoor(ctx, destination, delivered, active, open, cooldown, pulse);
      this.drawMarkerLabel(
        ctx,
        destination,
        delivered,
        active,
        open,
        cooldown,
        game.delivery.remaining,
      );
    });
  }

  drawDoor(ctx, destination, delivered, active, open, cooldown, pulse) {
    const { x, y, side } = destination.door;
    const color = delivered ? "#83cda7" : open ? destination.accent : "#6a7a78";
    const horizontal = side === "north" || side === "south";
    const outward = side === "south" ? 1 : side === "north" ? -1 : 1;
    const dx = side === "east" ? 1 : 0;
    const dy = horizontal ? outward : 0;
    const width = 27;
    const depth = 11;

    ctx.save();
    if (active || delivered) {
      ctx.shadowColor = color;
      ctx.shadowBlur = open ? 18 + pulse * 8 : 8;
    }
    ctx.fillStyle = color;
    ctx.globalAlpha = active || delivered ? 0.78 : 0.22;
    roundRect(
      ctx,
      x - dx * depth - (horizontal ? width / 2 : depth / 2),
      y - dy * depth - (horizontal ? depth / 2 : width / 2),
      horizontal ? width : depth,
      horizontal ? depth : width,
      2,
    );
    ctx.fill();
    ctx.shadowBlur = 0;

    if (open && !delivered) {
      ctx.globalAlpha = 0.28 + pulse * 0.1;
      ctx.fillStyle = destination.accent;
      roundRect(ctx, x - 24, y - 28, 48, 15, 2);
      ctx.fill();
    }

    if (cooldown) {
      ctx.globalAlpha = 0.75;
      ctx.strokeStyle = "#8ea8aa";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x, y + outward * 34, 11, -Math.PI / 2, TAU - Math.PI / 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawMarkerLabel(
    ctx,
    destination,
    delivered,
    active,
    open,
    cooldown,
    remaining,
  ) {
    const { x, y } = destination.marker;
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.font = `600 10px ${fontMono}`;
    ctx.letterSpacing = "0.08em";
    ctx.fillStyle = delivered
      ? "rgba(152, 221, 185, 0.75)"
      : active
        ? "rgba(238, 244, 225, 0.88)"
        : "rgba(159, 180, 179, 0.42)";
    const status = delivered
      ? "已签收"
      : open
        ? `${Math.max(0, remaining).toFixed(1)}s`
        : cooldown
          ? "等待客户"
          : active
            ? "签收点"
            : "待派送";
    ctx.fillText(
      delivered ? `${destination.name} · ${status}` : destination.name,
      x,
      y - 56,
    );
    if (!delivered && (open || cooldown)) {
      ctx.font = `500 9px ${fontSans}`;
      ctx.fillStyle = open
        ? "rgba(255, 206, 120, 0.8)"
        : "rgba(145, 174, 175, 0.7)";
      ctx.fillText(status, x, y - 43);
    }
    ctx.restore();
  }

  drawSkidMarks(ctx, game) {
    if (!game.skidMarks.length) return;
    ctx.save();
    ctx.lineCap = "round";
    for (const mark of game.skidMarks) {
      const alpha = Math.max(0, mark.life / mark.maxLife) * 0.28;
      ctx.strokeStyle = `rgba(3, 10, 13, ${alpha})`;
      ctx.lineWidth = mark.width;
      ctx.beginPath();
      ctx.moveTo(mark.x, mark.y);
      ctx.lineTo(
        mark.x - Math.cos(mark.angle) * 12,
        mark.y - Math.sin(mark.angle) * 12,
      );
      ctx.stroke();
    }
    ctx.restore();
  }

  drawBike(ctx, game) {
    const bike = game.bike;
    const wobble = bike.skidding ? Math.sin(this.time * 31) * 0.055 : 0;
    ctx.save();
    ctx.translate(bike.x, bike.y);
    ctx.rotate(bike.angle + wobble);

    ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
    ctx.beginPath();
    ctx.ellipse(4, 6, 11, 23, 0, 0, TAU);
    ctx.fill();

    ctx.fillStyle = "#05090b";
    for (const y of [-15, 13]) {
      roundRect(ctx, -2.1, y - 7, 4.2, 14, 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(147, 176, 174, 0.34)";
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(-2, y);
      ctx.lineTo(2, y);
      ctx.stroke();
    }

    ctx.strokeStyle = "#93b8b3";
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(0, 14);
    ctx.lineTo(0, -12);
    ctx.lineTo(-4, -3);
    ctx.moveTo(0, 14);
    ctx.lineTo(4, 4);
    ctx.lineTo(0, -4);
    ctx.stroke();

    ctx.fillStyle = "#d6a743";
    roundRect(ctx, -3.2, 15, 6.4, 11, 2);
    ctx.fill();

    ctx.fillStyle = "#e4b84c";
    roundRect(ctx, -5.5, 2, 11, 16, 4);
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 229, 139, 0.62)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-4, 11);
    ctx.lineTo(4, 11);
    ctx.stroke();

    ctx.fillStyle = "#152529";
    ctx.beginPath();
    ctx.arc(0, 1, 4.4, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "rgba(136, 198, 194, 0.26)";
    ctx.beginPath();
    ctx.arc(-1.2, -0.4, 2.2, 0, TAU);
    ctx.fill();

    ctx.strokeStyle = "#c5ded8";
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(-5, 6);
    ctx.lineTo(-9, 11);
    ctx.moveTo(5, 6);
    ctx.lineTo(9, 11);
    ctx.stroke();

    if (game.headlightOn) {
      ctx.fillStyle = "rgba(255, 237, 170, 0.9)";
      ctx.beginPath();
      ctx.arc(0, -13, 2.4, 0, TAU);
      ctx.fill();
    }
    ctx.restore();

    ctx.save();
    ctx.translate(bike.x, bike.y);
    ctx.rotate(bike.angle);
    game.delivered.forEach((_, index) => {
      ctx.fillStyle = ["#ffc15c", "#8ed8c6", "#88c8ff", "#ff986d"][index];
      ctx.globalAlpha = 0.9;
      roundRect(ctx, -4.5 + index * 2.4, 17, 2.1, 7, 0.6);
      ctx.fill();
    });
    ctx.restore();
  }

  drawBikeSpray(ctx, game) {
    if (!game.bike.inPuddle || game.bike.speed < 18) return;
    const amount = Math.min(18, Math.floor(game.bike.speed / 10));
    ctx.save();
    ctx.strokeStyle = "rgba(160, 210, 216, 0.24)";
    ctx.lineWidth = 0.8;
    for (let i = 0; i < amount; i += 1) {
      const phase = (this.time * 3.2 + i * 0.73) % 1;
      const angle = game.bike.angle + Math.PI + (i / amount - 0.5) * 1.4;
      const distance = 8 + phase * 28;
      const x = game.bike.x + Math.cos(angle) * distance;
      const y = game.bike.y + Math.sin(angle) * distance;
      ctx.globalAlpha = (1 - phase) * 0.5;
      ctx.beginPath();
      ctx.arc(x, y, 0.8 + phase * 2.1, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawDarkness(game) {
    const ctx = this.lightCtx;
    const overlay = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.fillStyle = "rgba(1, 6, 13, 0.48)";
    ctx.fillRect(0, 0, this.width, this.height);

    if (game.bike) {
      const origin = this.worldToScreen(game.bike.x, game.bike.y);
      const scale = this.camera.scale;
      ctx.globalCompositeOperation = "destination-out";
      const near = ctx.createRadialGradient(
        origin.x,
        origin.y,
        8,
        origin.x,
        origin.y,
        88 * scale,
      );
      near.addColorStop(0, "rgba(0, 0, 0, 0.38)");
      near.addColorStop(0.45, "rgba(0, 0, 0, 0.22)");
      near.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = near;
      ctx.beginPath();
      ctx.arc(origin.x, origin.y, 88 * scale, 0, TAU);
      ctx.fill();

      if (game.headlightOn) {
        const angle = game.bike.angle;
        const length = 310 * scale;
        const halfWidth = 112 * scale;
        const tip = {
          x: origin.x + Math.cos(angle) * length,
          y: origin.y + Math.sin(angle) * length,
        };
        const perpendicularX = Math.cos(angle + Math.PI / 2);
        const perpendicularY = Math.sin(angle + Math.PI / 2);
        const beam = ctx.createLinearGradient(origin.x, origin.y, tip.x, tip.y);
        beam.addColorStop(0, "rgba(0, 0, 0, 0.8)");
        beam.addColorStop(0.4, "rgba(0, 0, 0, 0.6)");
        beam.addColorStop(0.82, "rgba(0, 0, 0, 0.26)");
        beam.addColorStop(1, "rgba(0, 0, 0, 0)");
        ctx.fillStyle = beam;
        ctx.beginPath();
        ctx.moveTo(
          origin.x + Math.cos(angle) * 8,
          origin.y + Math.sin(angle) * 8,
        );
        ctx.lineTo(
          tip.x + perpendicularX * halfWidth,
          tip.y + perpendicularY * halfWidth,
        );
        ctx.lineTo(
          tip.x - perpendicularX * halfWidth,
          tip.y - perpendicularY * halfWidth,
        );
        ctx.closePath();
        ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";
    }

    overlay.drawImage(
      this.lightLayer,
      0,
      0,
      this.lightLayer.width,
      this.lightLayer.height,
      0,
      0,
      this.width,
      this.height,
    );

    if (game.bike && game.headlightOn) {
      const origin = this.worldToScreen(game.bike.x, game.bike.y);
      const scale = this.camera.scale;
      const angle = game.bike.angle;
      overlay.save();
      overlay.globalCompositeOperation = "screen";
      overlay.translate(origin.x, origin.y);
      overlay.rotate(angle);
      const glow = overlay.createLinearGradient(0, 0, 310 * scale, 0);
      glow.addColorStop(0, "rgba(255, 232, 170, 0.14)");
      glow.addColorStop(0.35, "rgba(255, 223, 148, 0.09)");
      glow.addColorStop(1, "rgba(255, 210, 130, 0)");
      overlay.fillStyle = glow;
      overlay.beginPath();
      overlay.moveTo(5 * scale, -9 * scale);
      overlay.lineTo(310 * scale, -112 * scale);
      overlay.lineTo(310 * scale, 112 * scale);
      overlay.lineTo(5 * scale, 9 * scale);
      overlay.closePath();
      overlay.fill();
      const bulb = overlay.createRadialGradient(0, 0, 1, 0, 0, 30 * scale);
      bulb.addColorStop(0, "rgba(255, 241, 188, 0.4)");
      bulb.addColorStop(1, "rgba(255, 221, 146, 0)");
      overlay.fillStyle = bulb;
      overlay.beginPath();
      overlay.arc(0, 0, 30 * scale, 0, TAU);
      overlay.fill();
      overlay.restore();
    }
  }

  drawRain(ctx, game) {
    ctx.save();
    ctx.lineCap = "round";
    for (const drop of this.rain) {
      const flicker =
        drop.bright && game.bike
          ? 0.2 + Math.max(0, Math.sin(this.time * 16 + drop.x)) * 0.35
          : 0;
      ctx.strokeStyle = drop.bright
        ? `rgba(202, 235, 234, ${drop.alpha + flicker})`
        : `rgba(137, 180, 196, ${drop.alpha})`;
      ctx.lineWidth = drop.bright ? 1.2 : 0.7;
      ctx.beginPath();
      ctx.moveTo(drop.x, drop.y);
      ctx.lineTo(drop.x + drop.drift * 0.035, drop.y + drop.length);
      ctx.stroke();
    }
    ctx.restore();

    const vignette = ctx.createRadialGradient(
      this.width / 2,
      this.height / 2,
      Math.min(this.width, this.height) * 0.28,
      this.width / 2,
      this.height / 2,
      Math.max(this.width, this.height) * 0.68,
    );
    vignette.addColorStop(0, "rgba(1, 6, 10, 0)");
    vignette.addColorStop(1, "rgba(1, 5, 9, 0.46)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, this.width, this.height);
  }

  drawDestinationArrow(ctx, game) {
    if (game.phase !== "playing" || game.destinationIndex >= DESTINATIONS.length) {
      return;
    }
    const destination = DESTINATIONS[game.destinationIndex];
    const point = this.worldToScreen(destination.marker.x, destination.marker.y);
    const margin = 54;
    if (
      point.x > margin &&
      point.x < this.width - margin &&
      point.y > margin &&
      point.y < this.height - margin
    ) {
      return;
    }
    const x = clamp(point.x, margin, this.width - margin);
    const y = clamp(point.y, margin, this.height - margin);
    const angle = Math.atan2(point.y - this.height / 2, point.x - this.width / 2);
    const distance = Math.round(
      Math.hypot(
        destination.marker.x - game.bike.x,
        destination.marker.y - game.bike.y,
      ),
    );

    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = "rgba(6, 18, 24, 0.78)";
    roundRect(ctx, -58, -16, 116, 32, 15);
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 200, 107, 0.25)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.translate(-34, 0);
    ctx.rotate(angle);
    ctx.fillStyle = destination.accent;
    ctx.beginPath();
    ctx.moveTo(10, 0);
    ctx.lineTo(-4, -6);
    ctx.lineTo(-4, 6);
    ctx.closePath();
    ctx.fill();
    ctx.rotate(-angle);
    ctx.translate(41, 0);
    ctx.font = `600 10px ${fontMono}`;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(227, 239, 228, 0.88)";
    ctx.fillText(`${distance}m`, 0, 1);
    ctx.restore();
  }

  drawHud(ctx, game) {
    if (game.phase === "menu" || game.phase === "paused") return;
    const scale = clamp(
      Math.min(this.width / 1280, this.height / 760),
      0.76,
      1.12,
    );
    const narrow = this.width < 680;
    this.drawMissionPanel(ctx, game, scale, narrow);
    this.drawDamagePanel(ctx, game, scale, narrow);
    this.drawWindowPanel(ctx, game, scale);

    if (!narrow && this.width > 760 && this.height > 590) {
      this.drawMinimap(ctx, game, 20 * scale, this.height - 174 * scale, 220 * scale, 156 * scale, scale);
    }
    if (!narrow) {
      this.drawControlsHint(ctx, game, scale);
    }
    this.drawToast(ctx, game, scale);
  }

  drawPanel(ctx, x, y, w, h, accent = "rgba(180, 219, 214, 0.17)") {
    ctx.save();
    ctx.fillStyle = "rgba(4, 12, 18, 0.79)";
    roundRect(ctx, x, y, w, h, 3);
    ctx.fill();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }

  drawMissionPanel(ctx, game, scale, narrow) {
    const x = 20 * scale;
    const y = 18 * scale;
    const w = (narrow ? 238 : 350) * scale;
    const h = 96 * scale;
    this.drawPanel(ctx, x, y, w, h);
    ctx.save();
    ctx.fillStyle = "#ffc86b";
    ctx.fillRect(x, y + 12 * scale, 2 * scale, h - 24 * scale);

    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    ctx.fillStyle = "rgba(229, 241, 233, 0.94)";
    ctx.font = `700 ${15 * scale}px ${fontSerif}`;
    ctx.fillText("雨巷夜递", x + 15 * scale, y + 13 * scale);
    ctx.font = `600 ${8 * scale}px ${fontMono}`;
    ctx.fillStyle = "rgba(255, 200, 107, 0.72)";
    ctx.fillText(
      narrow ? "NIGHT 23:47" : "RAIN ALLEY · NIGHT SHIFT",
      x + 15 * scale,
      y + 34 * scale,
    );

    const destination = DESTINATIONS[game.destinationIndex];
    ctx.fillStyle = "rgba(141, 169, 171, 0.85)";
    ctx.font = `500 ${9 * scale}px ${fontSans}`;
    ctx.fillText(
      destination ? "下一站" : "本班路线",
      x + 15 * scale,
      y + 51 * scale,
    );
    ctx.fillStyle = "rgba(231, 242, 234, 0.96)";
    ctx.font = `700 ${14 * scale}px ${fontSans}`;
    ctx.fillText(
      destination ? destination.name : "四单已送完",
      x + 15 * scale,
      y + 64 * scale,
    );

    if (destination) {
      const distance = Math.round(
        Math.hypot(
          destination.marker.x - game.bike.x,
          destination.marker.y - game.bike.y,
        ),
      );
      ctx.fillStyle = "rgba(133, 164, 166, 0.92)";
      ctx.font = `500 ${8.5 * scale}px ${fontMono}`;
      ctx.fillText(`${distance} m · ${destination.customer}`, x + 15 * scale, y + 82 * scale);
    }

    const pipSize = 13 * scale;
    const gap = 6 * scale;
    const startX = x + w - 15 * scale - pipSize * 4 - gap * 3;
    for (let index = 0; index < 4; index += 1) {
      const px = startX + index * (pipSize + gap);
      const py = y + 14 * scale;
      const done = index < game.destinationIndex;
      const current = index === game.destinationIndex;
      ctx.fillStyle = done
        ? "rgba(119, 197, 164, 0.86)"
        : current
          ? "rgba(255, 200, 107, 0.18)"
          : "rgba(185, 207, 202, 0.08)";
      roundRect(ctx, px, py, pipSize, pipSize, 2);
      ctx.fill();
      ctx.strokeStyle = done
        ? "rgba(156, 224, 191, 0.9)"
        : current
          ? "rgba(255, 200, 107, 0.85)"
          : "rgba(170, 197, 193, 0.23)";
      ctx.stroke();
      ctx.fillStyle = done
        ? "#092016"
        : current
          ? "#ffd987"
          : "rgba(188, 207, 203, 0.52)";
      ctx.font = `700 ${7 * scale}px ${fontMono}`;
      ctx.textAlign = "center";
      ctx.fillText(done ? "✓" : `${index + 1}`, px + pipSize / 2, py + 3.3 * scale);
    }
    ctx.restore();
  }

  drawDamagePanel(ctx, game, scale, narrow) {
    const w = (narrow ? 116 : 238) * scale;
    const h = (narrow ? 62 : 96) * scale;
    const x = this.width - w - 20 * scale;
    const y = 18 * scale;
    this.drawPanel(ctx, x, y, w, h);
    const damageRatio = clamp(game.damage / WORLD.damageLimit, 0, 1);
    const danger = damageRatio > 0.68;
    ctx.save();
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    ctx.fillStyle = "rgba(145, 171, 173, 0.9)";
    ctx.font = `600 ${8.5 * scale}px ${fontMono}`;
    ctx.fillText("车损 / LIMIT", x + 12 * scale, y + 12 * scale);
    ctx.fillStyle = danger ? "#ff7f6e" : "rgba(231, 241, 233, 0.95)";
    ctx.font = `700 ${18 * scale}px ${fontMono}`;
    ctx.fillText(
      String(Math.round(game.damage)).padStart(2, "0"),
      x + 12 * scale,
      y + 26 * scale,
    );
    ctx.fillStyle = "rgba(144, 169, 170, 0.65)";
    ctx.font = `600 ${9 * scale}px ${fontMono}`;
    ctx.textAlign = "right";
    ctx.fillText(`/ ${WORLD.damageLimit}`, x + w - 12 * scale, y + 34 * scale);

    const barX = x + 12 * scale;
    const barY = y + 53 * scale;
    const barW = w - 24 * scale;
    const barH = 5 * scale;
    ctx.fillStyle = "rgba(202, 222, 216, 0.1)";
    roundRect(ctx, barX, barY, barW, barH, barH / 2);
    ctx.fill();
    if (damageRatio > 0) {
      const gradient = ctx.createLinearGradient(barX, 0, barX + barW, 0);
      gradient.addColorStop(0, "#83cda7");
      gradient.addColorStop(0.5, "#ffc15c");
      gradient.addColorStop(1, "#ff6f61");
      ctx.fillStyle = gradient;
      roundRect(ctx, barX, barY, Math.max(barH, barW * damageRatio), barH, barH / 2);
      ctx.fill();
    }

    if (!narrow) {
      ctx.fillStyle = "rgba(143, 169, 171, 0.82)";
      ctx.font = `500 ${8.5 * scale}px ${fontMono}`;
      ctx.textAlign = "left";
      ctx.fillText(`用时 ${this.formatTime(game.elapsed)}`, x + 12 * scale, y + 69 * scale);
      ctx.textAlign = "right";
      ctx.fillStyle = game.headlightOn
        ? "rgba(255, 214, 128, 0.86)"
        : "rgba(130, 155, 156, 0.7)";
      ctx.fillText(game.headlightOn ? "车灯 ON · F" : "车灯 OFF · F", x + w - 12 * scale, y + 69 * scale);
    }
    ctx.restore();
  }

  drawWindowPanel(ctx, game, scale) {
    if (game.destinationIndex >= DESTINATIONS.length) return;
    const delivery = game.delivery;
    if (!delivery.windowOpen && delivery.cooldown <= 0) return;
    const narrow = this.width < 680;
    const w = (narrow ? 222 : 264) * scale;
    const h = (narrow ? 49 : 55) * scale;
    const x = this.width / 2 - w / 2;
    const y = narrow ? 122 * scale : 18 * scale;
    const open = delivery.windowOpen;
    this.drawPanel(
      ctx,
      x,
      y,
      w,
      h,
      open ? "rgba(255, 200, 107, 0.4)" : "rgba(143, 170, 172, 0.22)",
    );
    ctx.save();
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    ctx.fillStyle = open ? "#ffd27d" : "rgba(158, 181, 181, 0.9)";
    ctx.font = `700 ${10 * scale}px ${fontSans}`;
    ctx.fillText(
      open ? "签收窗口开启" : "签收窗口已错过",
      x + 12 * scale,
      y + 9 * scale,
    );
    ctx.textAlign = "right";
    ctx.fillStyle = open ? "rgba(255, 226, 169, 0.94)" : "rgba(169, 191, 191, 0.76)";
    ctx.font = `600 ${11 * scale}px ${fontMono}`;
    ctx.fillText(
      open
        ? `${Math.max(0, delivery.remaining).toFixed(1)}s`
        : `${delivery.cooldown.toFixed(1)}s`,
      x + w - 12 * scale,
      y + 8 * scale,
    );

    const barX = x + 12 * scale;
    const barY = y + 29 * scale;
    const barW = w - 24 * scale;
    const barH = 4 * scale;
    ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
    roundRect(ctx, barX, barY, barW, barH, 2);
    ctx.fill();
    const ratio = open
      ? clamp(delivery.remaining / delivery.windowDuration, 0, 1)
      : clamp(delivery.cooldown / 4, 0, 1);
    ctx.fillStyle = open ? "#ffc86b" : "rgba(121, 158, 160, 0.66)";
    roundRect(ctx, barX, barY, Math.max(2, barW * ratio), barH, 2);
    ctx.fill();

    ctx.fillStyle = open
      ? "rgba(215, 225, 215, 0.76)"
      : "rgba(143, 169, 171, 0.68)";
    ctx.font = `500 ${8 * scale}px ${fontSans}`;
    ctx.textAlign = "left";
    let status = open ? "请在门牌环内减速停车" : "客户下楼后重新尝试";
    if (open && delivery.signProgress > 0) {
      status = `正在签收 · ${Math.round(
        clamp(delivery.signProgress / delivery.signDuration, 0, 1) * 100,
      )}%`;
    }
    ctx.fillText(status, barX, y + 37 * scale);
    ctx.restore();
  }

  drawMinimap(ctx, game, x, y, w, h, scale) {
    this.drawPanel(ctx, x, y, w, h);
    const padding = 10 * scale;
    const header = 22 * scale;
    const ratio = Math.min(
      (w - padding * 2) / WORLD.width,
      (h - header - padding) / WORLD.height,
    );
    const mapW = WORLD.width * ratio;
    const mapH = WORLD.height * ratio;
    const offsetX = x + (w - mapW) / 2;
    const offsetY = y + header + (h - header - padding - mapH) / 2;

    ctx.save();
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    ctx.fillStyle = "rgba(148, 174, 175, 0.82)";
    ctx.font = `600 ${8 * scale}px ${fontMono}`;
    ctx.fillText("街区图 · 四单", x + padding, y + 8 * scale);
    ctx.textAlign = "right";
    ctx.fillStyle = "rgba(255, 200, 107, 0.72)";
    ctx.fillText(
      `${game.destinationIndex}/4`,
      x + w - padding,
      y + 8 * scale,
    );

    ctx.fillStyle = "rgba(4, 10, 15, 0.65)";
    ctx.fillRect(offsetX, offsetY, mapW, mapH);

    ctx.strokeStyle = "rgba(141, 178, 182, 0.13)";
    ctx.lineWidth = 0.65;
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    MINI_ROUTE.forEach(([px, py], index) => {
      const mx = offsetX + px * ratio;
      const my = offsetY + py * ratio;
      if (index === 0) ctx.moveTo(mx, my);
      else ctx.lineTo(mx, my);
    });
    ctx.stroke();
    ctx.setLineDash([]);

    for (const building of BUILDINGS) {
      ctx.fillStyle = "rgba(77, 105, 109, 0.22)";
      ctx.fillRect(
        offsetX + building.x * ratio,
        offsetY + building.y * ratio,
        building.w * ratio,
        building.h * ratio,
      );
    }

    for (const puddle of PUDDLES) {
      ctx.fillStyle = "rgba(80, 143, 158, 0.25)";
      ctx.beginPath();
      ctx.ellipse(
        offsetX + puddle.x * ratio,
        offsetY + puddle.y * ratio,
        Math.max(1, puddle.rx * ratio),
        Math.max(1, puddle.ry * ratio),
        puddle.rotation,
        0,
        TAU,
      );
      ctx.fill();
    }

    DESTINATIONS.forEach((destination, index) => {
      const mx = offsetX + destination.marker.x * ratio;
      const my = offsetY + destination.marker.y * ratio;
      const done = index < game.destinationIndex;
      const active = index === game.destinationIndex;
      ctx.fillStyle = done
        ? "rgba(126, 199, 164, 0.8)"
        : active
          ? destination.accent
          : "rgba(163, 184, 181, 0.34)";
      ctx.beginPath();
      ctx.arc(mx, my, (active ? 3.2 : 2.1) * scale, 0, TAU);
      ctx.fill();
      if (active) {
        ctx.strokeStyle = destination.accent;
        ctx.globalAlpha = 0.35 + Math.sin(this.time * 4) * 0.16;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(mx, my, 6 * scale, 0, TAU);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    });

    if (game.bike) {
      const bx = offsetX + game.bike.x * ratio;
      const by = offsetY + game.bike.y * ratio;
      ctx.translate(bx, by);
      ctx.rotate(game.bike.angle);
      ctx.fillStyle = "#f0bb5b";
      ctx.beginPath();
      ctx.moveTo(0, -5 * scale);
      ctx.lineTo(3.4 * scale, 3.5 * scale);
      ctx.lineTo(-3.4 * scale, 3.5 * scale);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(4, 10, 15, 0.7)";
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }
    ctx.restore();
  }

  drawControlsHint(ctx, game, scale) {
    const coarse = Boolean(window.matchMedia?.("(pointer: coarse)")?.matches);
    const text = coarse
      ? "← ↑ → ↓ 控制方向 · 在门牌边停稳签收"
      : "W 蹬车  ·  S 刹车  ·  A/D 转向  ·  F 车灯  ·  M 静音";
    ctx.save();
    ctx.font = `500 ${9 * scale}px ${fontMono}`;
    const width = ctx.measureText(text).width + 28 * scale;
    const x = this.width / 2 - width / 2;
    const y = this.height - 48 * scale;
    ctx.fillStyle = "rgba(4, 12, 17, 0.65)";
    roundRect(ctx, x, y, width, 25 * scale, 13 * scale);
    ctx.fill();
    ctx.strokeStyle = "rgba(170, 200, 195, 0.13)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(185, 206, 203, 0.7)";
    ctx.fillText(text, this.width / 2, y + 13 * scale);
    ctx.restore();

    if (!coarse) this.drawSpeedGauge(ctx, game, scale);
  }

  drawSpeedGauge(ctx, game, scale) {
    const radius = 39 * scale;
    const x = this.width - 64 * scale;
    const y = this.height - 68 * scale;
    const kph = game.bike.speed * 0.235;
    const ratio = clamp(kph / 56, 0, 1);
    ctx.save();
    ctx.fillStyle = "rgba(4, 12, 18, 0.72)";
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = "rgba(172, 202, 199, 0.12)";
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.strokeStyle = game.bike.inPuddle
      ? "rgba(105, 180, 203, 0.78)"
      : "rgba(255, 200, 107, 0.62)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(
      x,
      y,
      radius - 5 * scale,
      Math.PI * 0.72,
      Math.PI * 0.72 + Math.PI * 1.56 * ratio,
    );
    ctx.stroke();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(235, 243, 235, 0.95)";
    ctx.font = `700 ${20 * scale}px ${fontMono}`;
    ctx.fillText(String(Math.round(kph)).padStart(2, "0"), x, y - 2 * scale);
    ctx.fillStyle = "rgba(147, 173, 173, 0.8)";
    ctx.font = `500 ${7 * scale}px ${fontMono}`;
    ctx.fillText("KM/H", x, y + 17 * scale);
    if (game.bike.skidding) {
      ctx.fillStyle = "#ff8b78";
      ctx.font = `700 ${8 * scale}px ${fontSans}`;
      ctx.fillText("侧滑", x, y - 23 * scale);
    }
    ctx.restore();
  }

  drawToast(ctx, game, scale) {
    if (!game.toast || game.toast.life <= 0) return;
    const fade = Math.min(1, game.toast.life / 0.45);
    const coarse = Boolean(window.matchMedia?.("(pointer: coarse)")?.matches);
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.font = `600 ${11 * scale}px ${fontSans}`;
    const width = Math.min(
      this.width - 40 * scale,
      ctx.measureText(game.toast.text).width + 38 * scale,
    );
    const x = this.width / 2 - width / 2;
    const y = this.height - (coarse ? 172 : 96) * scale;
    ctx.fillStyle =
      game.toast.tone === "danger"
        ? "rgba(62, 20, 18, 0.86)"
        : "rgba(5, 17, 23, 0.86)";
    roundRect(ctx, x, y, width, 31 * scale, 2);
    ctx.fill();
    ctx.strokeStyle =
      game.toast.tone === "danger"
        ? "rgba(255, 111, 97, 0.5)"
        : "rgba(255, 200, 107, 0.25)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle =
      game.toast.tone === "danger" ? "#ffb1a5" : "rgba(231, 240, 229, 0.94)";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(game.toast.text, this.width / 2, y + 16 * scale);
    ctx.restore();
  }

  formatTime(seconds) {
    const whole = Math.max(0, Math.floor(seconds));
    const mins = Math.floor(whole / 60);
    const secs = whole % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
}
