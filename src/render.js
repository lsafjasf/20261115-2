import { COLONY_MIN, COLONY_START, RELEASE_ZONES } from './engine.js';

const TAU = Math.PI * 2;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const lerp = (a, b, t) => a + (b - a) * t;

function roundedRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, r);
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class SwarmVisual {
  constructor() {
    this.random = mulberry32(20261115);
    this.bees = Array.from({ length: 34 }, (_, index) => ({
      index,
      x: 0,
      y: 0,
      targetX: 0,
      targetY: 0,
      cropIndex: index % 3,
      speed: 0.7 + this.random() * 0.55,
      phase: this.random() * TAU,
      scale: 0.78 + this.random() * 0.42,
      rest: this.random() * 2,
      trail: [],
    }));
    this.initialized = false;
  }

  releasePoint(zone, bounds) {
    const x = zone === 'west' ? 0.17 : zone === 'east' ? 0.83 : 0.5;
    return {
      x: bounds.x + bounds.w * x,
      y: bounds.y + bounds.h * 0.72,
    };
  }

  update(game, dt, layout) {
    const bounds = layout.greenhouse;
    const release = this.releasePoint(game.settings.releaseZone, bounds);
    const bedXs = [0.245, 0.5, 0.755].map((x) => bounds.x + bounds.w * x);
    const bedY = bounds.y + bounds.h * 0.58;
    const activity = game.activity;

    for (const bee of this.bees) {
      if (!this.initialized) {
        bee.x = release.x + (this.random() - 0.5) * bounds.w * 0.12;
        bee.y = release.y + (this.random() - 0.5) * bounds.h * 0.09;
      }

      if (Math.hypot(bee.targetX - bee.x, bee.targetY - bee.y) < 5) {
        bee.cropIndex = Math.floor(this.random() * 3);
        if (game.settings.releaseZone === 'west' && this.random() < 0.2) bee.cropIndex = 0;
        if (game.settings.releaseZone === 'east' && this.random() < 0.2) bee.cropIndex = 2;
        const targetX = bedXs[bee.cropIndex] + (this.random() - 0.5) * bounds.w * 0.12;
        const targetY = bedY - bounds.h * (0.05 + this.random() * 0.25);
        bee.targetX = targetX;
        bee.targetY = targetY;
        bee.rest = this.random() * (1 - activity) * 1.8;
      }

      if (bee.rest > 0) {
        bee.rest -= dt;
      } else {
        const dx = bee.targetX - bee.x;
        const dy = bee.targetY - bee.y;
        const distance = Math.max(1, Math.hypot(dx, dy));
        const pace = (30 + 120 * activity) * bee.speed * dt;
        bee.x += (dx / distance) * pace;
        bee.y += (dy / distance) * pace;
        bee.phase += dt * (5 + activity * 9) * bee.speed;
        bee.y += Math.sin(bee.phase) * pace * 0.12;
      }

      if (this.initialized) {
        bee.trail.push({ x: bee.x, y: bee.y, life: 1 });
        if (bee.trail.length > 9) bee.trail.shift();
      }
      for (const point of bee.trail) point.life -= dt * 0.55;
    }
    this.initialized = true;
  }

  draw(ctx, game) {
    for (const bee of this.bees) {
      const trail = bee.trail.filter((point) => point.life > 0);
      if (trail.length > 1) {
        ctx.beginPath();
        trail.forEach((point, index) => {
          if (index === 0) ctx.moveTo(point.x, point.y);
          else ctx.lineTo(point.x, point.y);
        });
        ctx.strokeStyle = `rgba(241, 190, 68, ${0.04 + game.activity * 0.09})`;
        ctx.lineWidth = 1.1;
        ctx.setLineDash([2, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      const hover = Math.sin(bee.phase) * 1.8;
      ctx.save();
      ctx.translate(bee.x, bee.y + hover);
      ctx.rotate(Math.sin(bee.phase * 0.7) * 0.14);
      ctx.scale(bee.scale, bee.scale);
      ctx.globalAlpha = 0.92;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.48)';
      ctx.beginPath();
      ctx.ellipse(-3, -4, 4.6, 2.4, -0.5, 0, TAU);
      ctx.ellipse(3, -4, 4.6, 2.4, 0.5, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#e5ae2e';
      ctx.beginPath();
      ctx.ellipse(0, 0, 4.4, 3, 0, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = '#2b2c21';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(-1.8, -2.8);
      ctx.lineTo(-1.8, 2.8);
      ctx.moveTo(1.3, -2.5);
      ctx.lineTo(1.3, 2.5);
      ctx.stroke();
      ctx.restore();
    }
  }
}

function drawBackground(ctx, w, h, game) {
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#c8d9cf');
  sky.addColorStop(0.52, '#e6e3c9');
  sky.addColorStop(1, '#b7b397');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  const sun = ctx.createRadialGradient(w * 0.71, h * 0.07, 8, w * 0.71, h * 0.07, w * 0.45);
  const strength = 0.1 + game.solar * 0.22;
  sun.addColorStop(0, `rgba(255, 240, 171, ${strength})`);
  sun.addColorStop(0.35, `rgba(245, 209, 118, ${strength * 0.46})`);
  sun.addColorStop(1, 'rgba(255, 243, 202, 0)');
  ctx.fillStyle = sun;
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = 'rgba(71, 94, 66, 0.16)';
  ctx.beginPath();
  ctx.moveTo(0, h * 0.66);
  ctx.quadraticCurveTo(w * 0.24, h * 0.56, w * 0.5, h * 0.63);
  ctx.quadraticCurveTo(w * 0.78, h * 0.7, w, h * 0.58);
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.fill();
}

function drawGreenhouse(ctx, w, h, game) {
  const left = w * 0.035;
  const right = w * 0.965;
  const roofY = h * 0.05;
  const springY = h * 0.24;
  const floorY = h * 0.84;
  const glass = ctx.createLinearGradient(0, roofY, 0, floorY);
  glass.addColorStop(0, 'rgba(223, 237, 226, 0.3)');
  glass.addColorStop(0.55, 'rgba(245, 242, 220, 0.13)');
  glass.addColorStop(1, 'rgba(214, 218, 194, 0.1)');
  ctx.fillStyle = glass;
  ctx.beginPath();
  ctx.moveTo(left, floorY);
  ctx.lineTo(left, springY);
  ctx.quadraticCurveTo(w * 0.2, roofY + h * 0.02, w * 0.5, roofY);
  ctx.quadraticCurveTo(w * 0.8, roofY + h * 0.02, right, springY);
  ctx.lineTo(right, floorY);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = 'rgba(47, 67, 54, 0.46)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(left, floorY);
  ctx.lineTo(left, springY);
  ctx.quadraticCurveTo(w * 0.2, roofY + h * 0.02, w * 0.5, roofY);
  ctx.quadraticCurveTo(w * 0.8, roofY + h * 0.02, right, springY);
  ctx.lineTo(right, floorY);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(47, 67, 54, 0.28)';
  ctx.lineWidth = 1.2;
  for (let i = 1; i < 8; i += 1) {
    const x = lerp(left, right, i / 8);
    const arch = Math.sin((i / 8) * Math.PI);
    ctx.beginPath();
    ctx.moveTo(x, roofY + (1 - arch) * h * 0.15);
    ctx.lineTo(x, floorY);
    ctx.stroke();
  }
  for (let i = 1; i < 4; i += 1) {
    const y = roofY + (springY - roofY) * (i / 4) + h * 0.1;
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.quadraticCurveTo(w * 0.5, y - h * 0.08, right, y);
    ctx.stroke();
  }

  ctx.strokeStyle = 'rgba(47, 67, 54, 0.54)';
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(w * 0.5, roofY);
  ctx.lineTo(w * 0.5, springY + h * 0.1);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(left + 6, springY);
  ctx.lineTo(w * 0.5, roofY + 8);
  ctx.lineTo(right - 6, springY);
  ctx.stroke();
}

function drawVentilation(ctx, w, h, game) {
  const floorY = h * 0.84;
  const open = game.settings.ventilation / 100;
  const sideHeight = h * 0.19;
  const ventWidth = w * 0.035;
  const positions = [
    { x: w * 0.075, side: 1 },
    { x: w * 0.925, side: -1 },
  ];

  for (const vent of positions) {
    const y = h * 0.28;
    ctx.save();
    ctx.translate(vent.x, y);
    ctx.strokeStyle = 'rgba(52, 73, 60, 0.46)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(-ventWidth / 2, 0, ventWidth, sideHeight);
    const angle = open * 0.95;
    for (let i = 0; i < 4; i += 1) {
      ctx.save();
      ctx.translate(0, (sideHeight / 4) * (i + 0.5));
      ctx.rotate(angle * vent.side);
      ctx.fillStyle = `rgba(206, 224, 211, ${0.2 + open * 0.35})`;
      ctx.strokeStyle = 'rgba(49, 72, 58, 0.5)';
      ctx.beginPath();
      ctx.rect(-ventWidth * 0.35, -2, ventWidth * 1.3, 4);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
    if (open > 0.16) {
      ctx.strokeStyle = `rgba(93, 139, 132, ${0.1 + open * 0.24})`;
      ctx.lineWidth = 1;
      for (let i = 0; i < 3; i += 1) {
        ctx.beginPath();
        ctx.moveTo(vent.side * (ventWidth * 0.8), h * 0.05 + i * 17);
        ctx.bezierCurveTo(
          vent.side * (ventWidth * 1.8), h * 0.01 + i * 20,
          vent.side * (ventWidth * 2.4), h * 0.14 + i * 13,
          vent.side * (ventWidth * 1.2), h * 0.2 + i * 18,
        );
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  ctx.fillStyle = 'rgba(20, 36, 27, 0.3)';
  ctx.fillRect(w * 0.08, floorY - 4, w * 0.84, 4);
}

function drawShade(ctx, w, h, game) {
  const coverage = game.settings.shade / 100;
  if (coverage < 0.02) return;
  const roofY = h * 0.075;
  const drop = h * 0.08 + coverage * h * 0.19;
  ctx.save();
  ctx.globalAlpha = 0.15 + coverage * 0.36;
  const cloth = ctx.createLinearGradient(0, roofY, 0, roofY + drop);
  cloth.addColorStop(0, '#6f765f');
  cloth.addColorStop(1, 'rgba(111, 118, 95, 0.25)');
  ctx.fillStyle = cloth;
  ctx.beginPath();
  ctx.moveTo(w * 0.12, roofY);
  ctx.quadraticCurveTo(w * 0.3, roofY - h * 0.015, w * 0.5, roofY + h * 0.015);
  ctx.quadraticCurveTo(w * 0.72, roofY - h * 0.005, w * 0.88, roofY + h * 0.02);
  for (let i = 1; i <= 12; i += 1) {
    const x = lerp(w * 0.88, w * 0.12, i / 12);
    ctx.lineTo(x, roofY + drop * (0.84 + Math.sin(i * 2.2) * 0.1));
  }
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(75, 83, 65, 0.24)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 7; i += 1) {
    const x = lerp(w * 0.15, w * 0.85, i / 6);
    ctx.beginPath();
    ctx.moveTo(x, roofY + 3);
    ctx.lineTo(x, roofY + drop * 0.82);
    ctx.stroke();
  }
  ctx.restore();
}

function drawSunbeams(ctx, w, h, game) {
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const alpha = 0.035 + game.solar * 0.065;
  ctx.fillStyle = `rgba(255, 229, 156, ${alpha})`;
  for (let i = 0; i < 4; i += 1) {
    ctx.beginPath();
    ctx.moveTo(w * (0.57 + i * 0.055), h * 0.07);
    ctx.lineTo(w * (0.25 + i * 0.12), h * 0.76);
    ctx.lineTo(w * (0.34 + i * 0.12), h * 0.76);
    ctx.lineTo(w * (0.64 + i * 0.055), h * 0.07);
    ctx.fill();
  }
  ctx.restore();
}

function drawHeatZones(ctx, w, h, game) {
  const intensity = clamp(game.heatStress * 1.2 + game.solar * 0.08, 0.03, 0.8);
  const spots = [
    { x: 0.49, y: 0.35, rx: 0.25, ry: 0.25, amount: intensity },
    { x: 0.74, y: 0.57, rx: 0.18, ry: 0.17, amount: intensity * 0.8 },
    { x: 0.23, y: 0.65, rx: 0.13, ry: 0.13, amount: intensity * 0.42 },
  ];
  ctx.save();
  for (const spot of spots) {
    const gradient = ctx.createRadialGradient(
      w * spot.x, h * spot.y, 4,
      w * spot.x, h * spot.y, Math.max(w, h) * spot.rx,
    );
    gradient.addColorStop(0, `rgba(218, 82, 43, ${spot.amount * 0.3})`);
    gradient.addColorStop(0.5, `rgba(225, 118, 53, ${spot.amount * 0.13})`);
    gradient.addColorStop(1, 'rgba(225, 118, 53, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
  }
  ctx.restore();
}

function drawFloor(ctx, w, h) {
  const floorY = h * 0.79;
  const ground = ctx.createLinearGradient(0, floorY, 0, h);
  ground.addColorStop(0, '#a29b7d');
  ground.addColorStop(1, '#817a63');
  ctx.fillStyle = ground;
  ctx.beginPath();
  ctx.moveTo(0, floorY);
  ctx.quadraticCurveTo(w * 0.5, floorY - h * 0.045, w, floorY);
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = 'rgba(66, 60, 45, 0.13)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 8; i += 1) {
    const x = w * (0.06 + i * 0.14);
    ctx.beginPath();
    ctx.moveTo(x, floorY + 4);
    ctx.lineTo(lerp(x, w * 0.5, 0.78), h);
    ctx.stroke();
  }
  for (let i = 1; i < 5; i += 1) {
    const y = lerp(floorY + 8, h, i / 5);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.quadraticCurveTo(w * 0.5, y - (i - 2) * 12, w, y);
    ctx.stroke();
  }
}

function drawBed(ctx, x, y, width, height, color) {
  ctx.save();
  ctx.fillStyle = 'rgba(47, 44, 30, 0.16)';
  ctx.beginPath();
  ctx.ellipse(x, y + height * 0.34, width * 0.56, height * 0.25, 0, 0, TAU);
  ctx.fill();

  const wood = ctx.createLinearGradient(0, y - height / 2, 0, y + height / 2);
  wood.addColorStop(0, '#8c6b48');
  wood.addColorStop(1, '#5e4b37');
  ctx.fillStyle = wood;
  roundedRect(ctx, x - width / 2, y - height / 2, width, height, height * 0.18);
  ctx.fill();
  ctx.strokeStyle = 'rgba(48, 37, 26, 0.35)';
  ctx.stroke();

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(x, y - height * 0.38, width * 0.47, height * 0.19, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(255, 243, 199, 0.11)';
  ctx.beginPath();
  ctx.ellipse(x - width * 0.08, y - height * 0.44, width * 0.3, height * 0.09, -0.06, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function drawLeaf(ctx, x, y, size, angle, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(size * 0.5, 0, size * 0.5, size * 0.22, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(2, 0);
  ctx.lineTo(size * 0.8, 0);
  ctx.stroke();
  ctx.restore();
}

function drawFlower(ctx, x, y, size, pollinated, tint = '#fff8df') {
  ctx.save();
  ctx.translate(x, y);
  if (!pollinated) {
    for (let i = 0; i < 5; i += 1) {
      ctx.rotate(TAU / 5);
      ctx.fillStyle = tint;
      ctx.beginPath();
      ctx.ellipse(0, -size * 0.7, size * 0.36, size * 0.64, 0, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = '#e3a52c';
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.32, 0, TAU);
    ctx.fill();
  } else {
    ctx.fillStyle = 'rgba(255, 247, 218, 0.42)';
    for (let i = 0; i < 5; i += 1) {
      ctx.rotate(TAU / 5);
      ctx.beginPath();
      ctx.ellipse(0, -size * 0.55, size * 0.18, size * 0.35, 0, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = '#c99835';
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.24, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

function drawTomato(ctx, crop, x, groundY, scale, time) {
  const sway = Math.sin(time * 0.7 + x) * 1.2;
  const height = scale * (48 + crop.growth * 0.33);
  ctx.save();
  ctx.strokeStyle = 'rgba(61, 51, 33, 0.55)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(x + 2, groundY);
  ctx.lineTo(x + 3, groundY - height);
  ctx.stroke();

  ctx.strokeStyle = '#4f7440';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(x, groundY);
  ctx.quadraticCurveTo(x - 5 + sway, groundY - height * 0.55, x + sway, groundY - height);
  ctx.stroke();

  const leafCount = 6;
  for (let i = 0; i < leafCount; i += 1) {
    const y = groundY - height * (0.13 + i * 0.135);
    const side = i % 2 === 0 ? -1 : 1;
    drawLeaf(ctx, x + sway * (i / leafCount), y, 20 + (i % 3) * 3, side * (0.35 + i * 0.09), i > 3 ? '#66874d' : '#557947');
  }

  const flowerCount = crop.pollination >= 58 ? 2 : 4;
  for (let i = 0; i < flowerCount; i += 1) {
    const angle = i * 1.8;
    const fx = x + Math.cos(angle) * 18 + sway;
    const fy = groundY - height * (0.48 + i * 0.1);
    drawFlower(ctx, fx, fy, 5.3 + scale * 1.5, crop.pollination >= 55, '#fff7d4');
  }

  if (crop.growth > 36) {
    const berrySize = 3.2 + crop.growth * 0.038;
    for (let i = 0; i < 5; i += 1) {
      const bx = x + (i % 3 - 1) * 11 + Math.sin(i * 2.1) * 4;
      const by = groundY - height * 0.44 + Math.floor(i / 3) * 13 + Math.cos(i) * 4;
      ctx.fillStyle = crop.growth > 72 ? '#d4492f' : '#b47e3d';
      ctx.beginPath();
      ctx.arc(bx, by, berrySize * (0.8 + (i % 2) * 0.2), 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 221, 168, 0.7)';
      ctx.beginPath();
      ctx.arc(bx - berrySize * 0.23, by - berrySize * 0.23, berrySize * 0.2, 0, TAU);
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawStrawberry(ctx, crop, x, groundY, scale, time) {
  const sway = Math.sin(time * 0.9 + x) * 0.7;
  ctx.save();
  for (let i = 0; i < 14; i += 1) {
    const angle = -1.6 + (i / 13) * 3.2;
    const length = (15 + (i % 4) * 4) * scale;
    drawLeaf(
      ctx,
      x + Math.sin(angle) * 5,
      groundY - 4,
      length,
      angle + sway * 0.03,
      i % 2 ? '#527744' : '#668854',
    );
  }

  for (let i = 0; i < 4; i += 1) {
    const fx = x + (i - 1.5) * 13 + sway;
    const fy = groundY - 16 - (i % 2) * 7;
    drawFlower(ctx, fx, fy, 4.3, crop.pollination > 50 + i * 6, '#fff9e6');
  }

  if (crop.growth > 34) {
    for (let i = 0; i < 5; i += 1) {
      const bx = x + (i - 2) * 11 + Math.sin(i * 3) * 4;
      const by = groundY - 7 - (i % 2) * 7;
      const size = 2.7 + crop.growth * 0.032;
      ctx.fillStyle = crop.growth > 72 ? '#c53f48' : '#c98670';
      ctx.beginPath();
      ctx.moveTo(bx, by + size);
      ctx.bezierCurveTo(bx - size * 1.5, by - size * 0.2, bx - size, by - size * 1.3, bx, by - size * 0.35);
      ctx.bezierCurveTo(bx + size, by - size * 1.3, bx + size * 1.5, by - size * 0.2, bx, by + size);
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 237, 200, 0.76)';
      for (let j = 0; j < 3; j += 1) {
        ctx.beginPath();
        ctx.arc(bx - size * 0.4 + j * size * 0.4, by - size * 0.3, 0.45, 0, TAU);
        ctx.fill();
      }
    }
  }
  ctx.restore();
}

function drawBlueberry(ctx, crop, x, groundY, scale, time) {
  const sway = Math.sin(time * 0.8 + x) * 1;
  const height = scale * (36 + crop.growth * 0.25);
  ctx.save();
  ctx.strokeStyle = '#425d3e';
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(x, groundY);
  ctx.quadraticCurveTo(x - 3 + sway, groundY - height * 0.6, x + sway, groundY - height);
  ctx.stroke();
  for (let i = 0; i < 4; i += 1) {
    const y = groundY - height * (0.34 + i * 0.12);
    const side = i % 2 ? 1 : -1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + side * 21, y - 8 + i * 2);
    ctx.stroke();
    drawLeaf(ctx, x + side * 12, y - 5, 17, side * 0.2, '#52724b');
    drawLeaf(ctx, x + side * 18, y - 3, 13, side * -0.35, '#698458');
  }

  for (let i = 0; i < 3; i += 1) {
    drawFlower(
      ctx,
      x + (i - 1) * 14 + sway,
      groundY - height * 0.69 - (i % 2) * 8,
      3.8,
      crop.pollination > 60,
      '#eee8d0',
    );
  }

  if (crop.growth > 40) {
    for (let i = 0; i < 9; i += 1) {
      const bx = x + Math.sin(i * 2.4) * 24 + sway;
      const by = groundY - height * 0.53 + Math.cos(i * 1.7) * 17;
      const size = 2.4 + crop.growth * 0.018;
      ctx.fillStyle = crop.growth > 75 ? '#536d9b' : '#7c7f91';
      ctx.beginPath();
      ctx.arc(bx, by, size, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(214, 224, 241, 0.65)';
      ctx.beginPath();
      ctx.arc(bx - 0.7, by - 0.8, 0.7, 0, TAU);
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawCrops(ctx, w, h, game, time) {
  const centers = [0.245, 0.5, 0.755].map((x) => w * x);
  const bedY = h * 0.755;
  const bedWidth = Math.min(w * 0.235, 340);
  const bedHeight = h * 0.105;
  const drawer = [drawTomato, drawStrawberry, drawBlueberry];

  game.crops.forEach((crop, cropIndex) => {
    const x = centers[cropIndex];

    ctx.save();
    ctx.strokeStyle = 'rgba(67, 80, 58, 0.18)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 4; i += 1) {
      ctx.beginPath();
      ctx.moveTo(x - bedWidth * 0.36, bedY - h * 0.05 - i * h * 0.045);
      ctx.lineTo(x + bedWidth * 0.36, bedY - h * 0.05 - i * h * 0.045);
      ctx.stroke();
    }
    ctx.restore();

    drawBed(ctx, x, bedY, bedWidth, bedHeight, '#66543f');
    const groundY = bedY - bedHeight * 0.32;
    const plantCount = cropIndex === 0 ? 3 : 4;
    for (let plant = 0; plant < plantCount; plant += 1) {
      const px = x + (plant - (plantCount - 1) / 2) * (bedWidth * 0.2);
      const scale = cropIndex === 0 ? 0.72 : cropIndex === 1 ? 0.9 : 0.76;
      drawer[cropIndex](ctx, crop, px, groundY, scale, time);
    }

    const residueAlpha = clamp((crop.residue - 0.055) * 1.7, 0, 0.32);
    if (residueAlpha > 0.01) {
      const haze = ctx.createRadialGradient(x, bedY - h * 0.06, 4, x, bedY - h * 0.06, bedWidth * 0.55);
      haze.addColorStop(0, `rgba(161, 103, 157, ${residueAlpha})`);
      haze.addColorStop(0.62, `rgba(161, 103, 157, ${residueAlpha * 0.36})`);
      haze.addColorStop(1, 'rgba(161, 103, 157, 0)');
      ctx.fillStyle = haze;
      ctx.fillRect(x - bedWidth * 0.6, bedY - h * 0.25, bedWidth * 1.2, h * 0.28);
    }
  });
}

function drawHives(ctx, w, h, game) {
  const floorY = h * 0.88;
  const zones = {
    west: { x: w * 0.16, name: '西侧放蜂区' },
    center: { x: w * 0.5, name: '中央放蜂区' },
    east: { x: w * 0.84, name: '东侧放蜂区' },
  };
  for (const [key, zone] of Object.entries(zones)) {
    const active = key === game.settings.releaseZone;
    const x = zone.x;
    const y = floorY;
    ctx.save();
    if (active) {
      const glow = ctx.createRadialGradient(x, y - 18, 2, x, y - 18, 46);
      glow.addColorStop(0, 'rgba(241, 188, 65, 0.34)');
      glow.addColorStop(1, 'rgba(241, 188, 65, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(x - 55, y - 70, 110, 100);
    }
    ctx.fillStyle = 'rgba(45, 38, 25, 0.25)';
    ctx.beginPath();
    ctx.ellipse(x, y + 5, 31, 8, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = active ? '#dcb15b' : 'rgba(111, 91, 59, 0.64)';
    roundedRect(ctx, x - 21, y - 33, 42, 35, 4);
    ctx.fill();
    ctx.strokeStyle = 'rgba(74, 55, 31, 0.45)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.fillStyle = 'rgba(78, 57, 31, 0.35)';
    for (let i = 0; i < 3; i += 1) {
      ctx.fillRect(x - 17, y - 25 + i * 8, 34, 2);
    }
    ctx.fillStyle = 'rgba(31, 28, 19, 0.72)';
    ctx.beginPath();
    ctx.arc(x, y - 10, 2.4, 0, TAU);
    ctx.fill();
    ctx.font = '600 8px "Noto Sans SC", "Avenir Next", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = active ? '#38432f' : 'rgba(61, 66, 50, 0.52)';
    ctx.fillText(active ? '● 正在放蜂' : zone.name, x, y + 17);
    ctx.restore();
  }
}

function drawCropLabels(ctx, w, h, game) {
  const bedY = h * 0.755;
  const centers = [0.245, 0.5, 0.755].map((x) => w * x);
  game.crops.forEach((crop, index) => {
    const x = centers[index];
    const y = bedY + h * 0.083;
    ctx.save();
    ctx.font = '600 9px "Noto Sans SC", "Avenir Next", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255, 253, 242, 0.93)';
    roundedRect(ctx, x - 52, y - 5, 104, 30, 8);
    ctx.fill();
    ctx.fillStyle = crop.accent;
    ctx.font = '700 10px "Noto Sans SC", "Avenir Next", sans-serif';
    ctx.fillText(`${crop.name}  ${Math.round(crop.pollination)}%`, x, y + 6);
    ctx.fillStyle = '#718071';
    ctx.font = '500 8px "Noto Sans SC", "Avenir Next", sans-serif';
    ctx.fillText(
      `${crop.stage} · 坐果 ${Math.round(crop.growth)}%`,
      x,
      y + 17,
    );
    ctx.restore();
  });
}

function drawSceneHud(ctx, w, h, game) {
  const airText = game.temp > 29.2 ? '热应激升高' : game.temp > 27.4 ? '温度偏高' : '温度舒适';
  const airColor = game.temp > 29.2 ? '#b54e34' : game.temp > 27.4 ? '#ad7a2e' : '#496d4b';
  const pulse = 0.55 + Math.sin(performance.now() / 550) * 0.2;

  ctx.save();
  roundedRect(ctx, w * 0.055, h * 0.11, 148, 43, 10);
  ctx.fillStyle = 'rgba(247, 245, 230, 0.72)';
  ctx.fill();
  ctx.fillStyle = airColor;
  ctx.beginPath();
  ctx.arc(w * 0.055 + 18, h * 0.11 + 17, 4, 0, TAU);
  ctx.globalAlpha = pulse;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.font = '700 8px "Noto Sans SC", "Avenir Next", sans-serif';
  ctx.fillText('INDOOR CLIMATE', w * 0.055 + 31, h * 0.11 + 15);
  ctx.font = '600 10px "Noto Sans SC", "Avenir Next", sans-serif';
  ctx.fillStyle = airColor;
  ctx.fillText(`${game.temp.toFixed(1)}°C · ${airText}`, w * 0.055 + 14, h * 0.11 + 32);

  if (game.heatStress > 0.02) {
    const x = w * 0.5;
    const y = h * 0.34;
    ctx.textAlign = 'center';
    ctx.font = '700 9px "Noto Sans SC", "Avenir Next", sans-serif';
    ctx.fillStyle = `rgba(159, 58, 36, ${0.55 + game.heatStress * 0.35})`;
    ctx.fillText('▲ 热负荷区 / HEAT POCKET', x, y);
  }

  ctx.textAlign = 'right';
  ctx.font = '600 8px "Noto Sans SC", "Avenir Next", sans-serif';
  ctx.fillStyle = 'rgba(54, 72, 57, 0.52)';
  ctx.fillText(`通风 ${Math.round(game.settings.ventilation)}%  ·  遮阳 ${Math.round(game.settings.shade)}%`, w * 0.945, h * 0.92);
  ctx.restore();
}

function drawColonyMini(ctx, w, h, game) {
  const ratio = clamp(game.colony / COLONY_START, 0, 1.08);
  const x = w * 0.055;
  const y = h * 0.89;
  ctx.save();
  ctx.fillStyle = 'rgba(26, 37, 29, 0.68)';
  roundedRect(ctx, x, y - 18, 126, 35, 9);
  ctx.fill();
  ctx.font = '600 8px "Noto Sans SC", "Avenir Next", sans-serif';
  ctx.fillStyle = 'rgba(255, 255, 245, 0.74)';
  ctx.fillText(`蜂群 ${Math.floor(game.colony)}`, x + 11, y - 5);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.11)';
  roundedRect(ctx, x + 53, y - 9, 61, 5, 3);
  ctx.fill();
  const color = game.colonyMinSeen < COLONY_MIN ? '#db6a4d' : '#dfb24f';
  ctx.fillStyle = color;
  roundedRect(ctx, x + 53, y - 9, 61 * ratio, 5, 3);
  ctx.fill();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.37)';
  ctx.font = '500 7px "Noto Sans SC", "Avenir Next", sans-serif';
  ctx.fillText(`下限 ${COLONY_MIN}`, x + 54, y + 12);
  ctx.restore();
}

export class GreenhouseRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.swarm = new SwarmVisual();
    this.width = 0;
    this.height = 0;
    this.dpr = 1;
    this.time = 0;
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const width = Math.max(320, Math.floor(rect.width));
    const height = Math.max(260, Math.floor(rect.height));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (width === this.width && height === this.height && dpr === this.dpr) return;
    this.width = width;
    this.height = height;
    this.dpr = dpr;
    this.canvas.width = Math.floor(width * dpr);
    this.canvas.height = Math.floor(height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  frame(game, dt) {
    this.resize();
    this.time += dt;
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    drawBackground(ctx, w, h, game);
    drawGreenhouse(ctx, w, h, game);
    drawSunbeams(ctx, w, h, game);
    drawShade(ctx, w, h, game);
    drawVentilation(ctx, w, h, game);
    drawHeatZones(ctx, w, h, game);
    drawFloor(ctx, w, h);
    drawCrops(ctx, w, h, game, this.time);
    drawHives(ctx, w, h, game);
    this.swarm.update(game, Math.min(dt, 0.05), {
      greenhouse: { x: 0, y: 0, w, h },
    });
    this.swarm.draw(ctx, game);
    drawCropLabels(ctx, w, h, game);
    drawSceneHud(ctx, w, h, game);
    drawColonyMini(ctx, w, h, game);
  }
}

export { drawCrops, drawGreenhouse, drawHives };
