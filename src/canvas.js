import { temperatureColor, ROUTES } from "./sim.js";

const MONO = '"JetBrains Mono Variable", "JetBrains Mono", monospace';
const SANS = '"Noto Sans SC Variable", "Noto Sans SC", sans-serif';

const SOURCE = { x: 0.075, y: 0.52 };
const AIRPORT = { x: 0.93, y: 0.51 };
const NORTH_STATION = { x: 0.59, y: 0.22 };
const SOUTH_STATION = { x: 0.47, y: 0.82 };

const PATH_DEFINITIONS = {
  north: {
    split: ROUTES.north.stationAt,
    segments: [
      [SOURCE, { x: 0.19, y: 0.35 }, { x: 0.41, y: 0.18 }, NORTH_STATION],
      [NORTH_STATION, { x: 0.73, y: 0.26 }, { x: 0.84, y: 0.36 }, AIRPORT],
    ],
  },
  direct: {
    split: 1,
    segments: [
      [SOURCE, { x: 0.28, y: 0.36 }, { x: 0.64, y: 0.61 }, AIRPORT],
    ],
  },
  south: {
    split: ROUTES.south.stationAt,
    segments: [
      [SOURCE, { x: 0.19, y: 0.65 }, { x: 0.33, y: 0.79 }, SOUTH_STATION],
      [SOUTH_STATION, { x: 0.65, y: 0.84 }, { x: 0.8, y: 0.67 }, AIRPORT],
    ],
  },
};

function cubicPoint(p0, p1, p2, p3, t) {
  const inv = 1 - t;
  return {
    x:
      inv * inv * inv * p0.x +
      3 * inv * inv * t * p1.x +
      3 * inv * t * t * p2.x +
      t * t * t * p3.x,
    y:
      inv * inv * inv * p0.y +
      3 * inv * inv * t * p1.y +
      3 * inv * t * t * p2.y +
      t * t * t * p3.y,
  };
}

function cubicDerivative(p0, p1, p2, p3, t) {
  const inv = 1 - t;
  return {
    x:
      3 * inv * inv * (p1.x - p0.x) +
      6 * inv * t * (p2.x - p1.x) +
      3 * t * t * (p3.x - p2.x),
    y:
      3 * inv * inv * (p1.y - p0.y) +
      6 * inv * t * (p2.y - p1.y) +
      3 * t * t * (p3.y - p2.y),
  };
}

function roundedRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function hexPath(ctx, x, y, radius) {
  ctx.beginPath();
  for (let index = 0; index < 6; index += 1) {
    const angle = Math.PI / 3 * index - Math.PI / 2;
    const px = x + Math.cos(angle) * radius;
    const py = y + Math.sin(angle) * radius;
    if (index === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

export class MapRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.width = 0;
    this.height = 0;
    this.dpr = 1;
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = Math.max(1, rect.width);
    this.height = Math.max(1, rect.height);
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.drawStaticBase();
  }

  project(point) {
    const horizontalPadding = this.width < 650 ? 58 : 25;
    return {
      x: horizontalPadding + point.x * (this.width - horizontalPadding * 2),
      y: this.height * 0.09 + point.y * this.height * 0.82,
    };
  }

  pointAt(routeId, progress) {
    const definition = PATH_DEFINITIONS[routeId];
    const clamped = Math.min(1, Math.max(0, progress));
    const firstSegment = definition.segments[0];
    const split = definition.split;

    if (clamped <= split || definition.segments.length === 1) {
      const t = split === 1 ? clamped : clamped / split;
      const [p0, p1, p2, p3] = firstSegment.map((point) => this.project(point));
      return {
        point: cubicPoint(p0, p1, p2, p3, t),
        tangent: cubicDerivative(p0, p1, p2, p3, t),
      };
    }

    const secondSegment = definition.segments[1];
    const t = (clamped - split) / (1 - split);
    const [p0, p1, p2, p3] = secondSegment.map((point) => this.project(point));
    return {
      point: cubicPoint(p0, p1, p2, p3, t),
      tangent: cubicDerivative(p0, p1, p2, p3, t),
    };
  }

  pathForSegment(segment) {
    const points = segment.map((point) => this.project(point));
    const path = new Path2D();
    path.moveTo(points[0].x, points[0].y);
    path.bezierCurveTo(
      points[1].x,
      points[1].y,
      points[2].x,
      points[2].y,
      points[3].x,
      points[3].y,
    );
    return path;
  }

  drawStaticBase() {
    if (!this.width || !this.height) return;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);

    const backdrop = ctx.createLinearGradient(0, 0, this.width, this.height);
    backdrop.addColorStop(0, "#081c24");
    backdrop.addColorStop(0.52, "#071920");
    backdrop.addColorStop(1, "#06151b");
    ctx.fillStyle = backdrop;
    ctx.fillRect(0, 0, this.width, this.height);

    this.drawGrid(ctx);
    this.drawContours(ctx);
  }

  drawGrid(ctx) {
    const spacing = Math.max(36, this.width / 23);
    ctx.save();
    ctx.strokeStyle = "rgba(104, 159, 167, 0.052)";
    ctx.lineWidth = 1;
    ctx.setLineDash([1, 4]);
    for (let x = 0; x < this.width; x += spacing) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, this.height);
      ctx.stroke();
    }
    for (let y = 0; y < this.height; y += spacing) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(this.width, y);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    const centerY = this.height * 0.52;
    ctx.strokeStyle = "rgba(92, 154, 163, 0.08)";
    ctx.beginPath();
    ctx.moveTo(0, centerY);
    ctx.lineTo(this.width, centerY);
    ctx.stroke();
    ctx.fillStyle = "rgba(103, 160, 168, 0.19)";
    ctx.font = `500 7px ${MONO}`;
    ctx.letterSpacing = "1px";
    ctx.fillText("AIR CORRIDOR 04", this.width * 0.1, centerY - 51);
    ctx.fillText("SECTOR G-12", this.width * 0.73, centerY + 61);
    ctx.restore();
  }

  drawContours(ctx) {
    ctx.save();
    ctx.strokeStyle = "rgba(54, 118, 127, 0.09)";
    ctx.lineWidth = 1;
    const rings = [
      [0.18, 0.24, 0.12, 0.19],
      [0.32, 0.67, 0.18, 0.17],
      [0.72, 0.39, 0.24, 0.27],
      [0.84, 0.79, 0.12, 0.1],
    ];
    for (const [x, y, rx, ry] of rings) {
      ctx.beginPath();
      ctx.ellipse(
        this.width * x,
        this.height * y,
        this.width * rx,
        this.height * ry,
        0.2,
        0,
        Math.PI * 2,
      );
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(
        this.width * x,
        this.height * y,
        this.width * rx * 0.91,
        this.height * ry * 0.84,
        -0.18,
        0,
        Math.PI * 2,
      );
      ctx.stroke();
    }
    ctx.restore();
  }

  render(snapshot, timestamp = 0) {
    if (!snapshot) return;
    this.drawStaticBase();
    const ctx = this.ctx;
    this.drawRoads(ctx);
    this.drawLandmarks(ctx, snapshot, timestamp);
    this.drawTrucks(ctx, snapshot, timestamp);
  }

  drawRoads(ctx) {
    const routeIds = ["north", "direct", "south"];
    for (const routeId of routeIds) {
      const definition = PATH_DEFINITIONS[routeId];
      const route = ROUTES[routeId];
      for (const segment of definition.segments) {
        const path = this.pathForSegment(segment);
        ctx.save();
        ctx.lineCap = "round";
        ctx.strokeStyle = "rgba(0, 7, 11, 0.58)";
        ctx.lineWidth = 20;
        ctx.stroke(path);
        ctx.strokeStyle = "#0d303a";
        ctx.lineWidth = 13;
        ctx.stroke(path);
        ctx.strokeStyle = "#194750";
        ctx.lineWidth = 7;
        ctx.stroke(path);
        ctx.strokeStyle = `${route.color}38`;
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 7]);
        ctx.stroke(path);
        ctx.restore();
      }
    }

    ctx.save();
    ctx.font = `500 7px ${MONO}`;
    ctx.textAlign = "center";
    const samples = {
      north: { progress: 0.31, offsetY: -14, label: "NORTH / 31.6 KM" },
      direct: { progress: 0.25, offsetY: 13, label: "CENTER / 24.2 KM" },
      south: { progress: 0.28, offsetY: 15, label: "SOUTH / 34.1 KM" },
    };
    for (const routeId of routeIds) {
      const sample = samples[routeId];
      const { point } = this.pointAt(routeId, sample.progress);
      ctx.fillStyle = `${ROUTES[routeId].color}75`;
      ctx.fillText(sample.label, point.x, point.y + sample.offsetY);
    }
    ctx.restore();
  }

  drawLandmarks(ctx, snapshot, timestamp) {
    const source = this.project(SOURCE);
    const airport = this.project(AIRPORT);
    const north = this.project(NORTH_STATION);
    const south = this.project(SOUTH_STATION);
    this.drawSource(ctx, source);
    this.drawAirport(ctx, airport, snapshot);
    this.drawSwapStation(
      ctx,
      north,
      snapshot.stations.north,
      timestamp,
      -1,
    );
    this.drawSwapStation(
      ctx,
      south,
      snapshot.stations.south,
      timestamp,
      1,
    );
  }

  drawSource(ctx, source) {
    ctx.save();
    ctx.translate(source.x, source.y);
    ctx.shadowColor = "rgba(82, 226, 222, 0.32)";
    ctx.shadowBlur = 24;
    ctx.fillStyle = "rgba(8, 31, 38, 0.9)";
    ctx.strokeStyle = "rgba(105, 223, 220, 0.45)";
    ctx.lineWidth = 1;
    roundedRect(ctx, -35, -25, 54, 48, 8);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.fillStyle = "rgba(87, 222, 219, 0.09)";
    roundedRect(ctx, -30, -20, 44, 30, 4);
    ctx.fill();
    ctx.strokeStyle = "rgba(126, 238, 232, 0.7)";
    ctx.lineWidth = 1.1;
    for (let index = 0; index < 3; index += 1) {
      const angle = (Math.PI / 3) * index;
      ctx.beginPath();
      ctx.moveTo(
        -8 - Math.cos(angle) * 8,
        -5 - Math.sin(angle) * 8,
      );
      ctx.lineTo(
        -8 + Math.cos(angle) * 8,
        -5 + Math.sin(angle) * 8,
      );
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(-8, -5, 2.1, 0, Math.PI * 2);
    ctx.fillStyle = "#9ef1e9";
    ctx.fill();

    ctx.font = `600 9px ${MONO}`;
    ctx.fillStyle = "#b7d4d5";
    ctx.textAlign = "center";
    ctx.fillText("冷库 01", 0, 46);
    ctx.font = `500 6px ${MONO}`;
    ctx.fillStyle = "#5f858b";
    ctx.fillText("COLD STORE / 2–8°C", 0, 56);
    ctx.restore();
  }

  drawAirport(ctx, airport, snapshot) {
    ctx.save();
    ctx.translate(airport.x, airport.y);
    ctx.rotate(-0.18);
    ctx.shadowColor = "rgba(91, 210, 212, 0.25)";
    ctx.shadowBlur = 22;
    ctx.fillStyle = "rgba(12, 38, 46, 0.9)";
    ctx.strokeStyle = "rgba(124, 207, 210, 0.38)";
    ctx.lineWidth = 1;
    roundedRect(ctx, -35, -23, 60, 52, 8);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "rgba(139, 223, 222, 0.5)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(-25, 0);
    ctx.lineTo(15, 0);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(92, 213, 213, 0.22)";
    roundedRect(ctx, -18, -16, 30, 9, 3);
    ctx.fill();
    ctx.strokeStyle = "rgba(141, 228, 225, 0.4)";
    ctx.stroke();
    ctx.rotate(0.18);

    const arrived = snapshot.trucks.filter((truck) => truck.state === "arrived").length;
    ctx.font = `600 9px ${MONO}`;
    ctx.fillStyle = "#bfdcde";
    ctx.textAlign = "center";
    ctx.fillText("机场 C-04", 4, 48);
    ctx.font = `500 6px ${MONO}`;
    ctx.fillStyle = "#63878d";
    ctx.fillText(`CARGO GATE · ${arrived}/3`, 4, 58);
    ctx.restore();
  }

  drawSwapStation(ctx, point, station, timestamp, labelSide) {
    const pulse = 0.5 + Math.sin(timestamp / 720) * 0.5;
    const isActive = Boolean(station.active) || station.queue.length > 0;
    ctx.save();
    ctx.translate(point.x, point.y);

    ctx.strokeStyle = isActive
      ? `rgba(115, 234, 225, ${0.26 + pulse * 0.14})`
      : "rgba(98, 170, 176, 0.12)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, 34 + pulse * 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([2, 5]);
    ctx.beginPath();
    ctx.arc(0, 0, 27, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.shadowColor = isActive
      ? "rgba(79, 229, 220, 0.5)"
      : "rgba(71, 148, 153, 0.22)";
    ctx.shadowBlur = 18;
    hexPath(ctx, 0, 0, 18);
    ctx.fillStyle = isActive ? "#102f38" : "#0c252d";
    ctx.fill();
    ctx.strokeStyle = isActive
      ? "rgba(131, 240, 231, 0.7)"
      : "rgba(99, 171, 176, 0.36)";
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = isActive ? "#8cece4" : "#6fafb4";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(3, -10);
    ctx.lineTo(-4, 1);
    ctx.lineTo(2, 1);
    ctx.lineTo(-2, 10);
    ctx.lineTo(6, -3);
    ctx.lineTo(0, -3);
    ctx.closePath();
    ctx.stroke();

    const queueCount = station.display.length;
    if (queueCount) {
      ctx.fillStyle = "#83e7df";
      ctx.beginPath();
      ctx.arc(18, -16, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#062127";
      ctx.font = `600 7px ${MONO}`;
      ctx.textAlign = "center";
      ctx.fillText(String(queueCount), 18, -13.5);
    }

    ctx.textAlign = "center";
    ctx.fillStyle = "#78999e";
    ctx.font = `500 6.5px ${MONO}`;
    const labelY = labelSide > 0 ? 37 : -27;
    ctx.fillText(station.code, 0, labelY);
    ctx.fillStyle = "#a9c7c9";
    ctx.font = `500 7.5px ${SANS}`;
    ctx.fillText(station.label, 0, labelY + 10 * labelSide);
    ctx.restore();
  }

  drawTrucks(ctx, snapshot, timestamp) {
    for (const truck of snapshot.trucks) {
      this.drawTrail(ctx, truck);
    }
    snapshot.trucks.forEach((truck, index) => {
      this.drawTruck(ctx, truck, index, snapshot, timestamp);
    });
  }

  drawTrail(ctx, truck) {
    if (truck.progress <= 0.005) return;
    const start = this.pointAt(truck.route, 0).point;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    const steps = Math.max(8, Math.ceil(truck.progress * 56));
    for (let step = 1; step <= steps; step += 1) {
      const progress = (step / steps) * truck.progress;
      const { point } = this.pointAt(truck.route, progress);
      ctx.lineTo(point.x, point.y);
    }
    ctx.strokeStyle = `${truck.color}32`;
    ctx.lineWidth = 7;
    ctx.lineCap = "round";
    ctx.shadowColor = `${truck.color}2f`;
    ctx.shadowBlur = 12;
    ctx.stroke();
    ctx.strokeStyle = `${truck.color}90`;
    ctx.lineWidth = 1.6;
    ctx.setLineDash([3, 5]);
    ctx.stroke();
    ctx.restore();
  }

  drawTruck(ctx, truck, index, snapshot, timestamp) {
    let position = this.pointAt(truck.route, truck.progress).point;
    let tangent = this.pointAt(truck.route, Math.max(0.01, truck.progress)).tangent;
    let laneOffset = 0;

    if (truck.state === "idle") {
      laneOffset = (index - 1) * 11;
      const start = this.pointAt(truck.route, 0).point;
      position = { x: start.x + index * 3, y: start.y + laneOffset };
    }
    if (truck.state === "arrived") {
      const parked = this.pointAt(truck.route, 0.955).point;
      const parkedTangent = this.pointAt(truck.route, 0.955).tangent;
      const angle = Math.atan2(parkedTangent.y, parkedTangent.x);
      position = {
        x: parked.x + Math.cos(angle + Math.PI / 2) * (index - 1) * 13,
        y: parked.y + Math.sin(angle + Math.PI / 2) * (index - 1) * 13,
      };
    }

    const angle = Math.atan2(tangent.y, tangent.x);
    const tempColor = temperatureColor(
      truck.finalTemp ?? truck.temperature,
    );
    const pulse = 0.5 + Math.sin(timestamp / 330 + index) * 0.5;
    ctx.save();
    ctx.translate(position.x, position.y);
    ctx.rotate(angle);

    if (truck.state === "moving" || truck.state === "queued" || truck.state === "swapping") {
      ctx.fillStyle = `${tempColor}${Math.round(20 + pulse * 15).toString(16).padStart(2, "0")}`;
      ctx.beginPath();
      ctx.arc(0, 0, 20, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = "rgba(0, 5, 8, 0.74)";
    roundedRect(ctx, -18, -8, 34, 16, 5);
    ctx.fill();
    ctx.fillStyle = truck.state === "idle" ? "#8faeb2" : "#d9eeee";
    ctx.strokeStyle = `${truck.color}aa`;
    ctx.lineWidth = 1;
    roundedRect(ctx, -17, -6.5, 24, 13, 3.5);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#17343d";
    roundedRect(ctx, -12, -4.5, 16, 9, 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(224, 248, 245, 0.7)";
    ctx.beginPath();
    ctx.moveTo(-10, 0);
    ctx.lineTo(1, 0);
    ctx.stroke();

    ctx.fillStyle = truck.color;
    roundedRect(ctx, 8, -6, 8, 12, 2);
    ctx.fill();
    ctx.fillStyle = "#07191f";
    roundedRect(ctx, 11, -3, 3, 4, 1);
    ctx.fill();
    ctx.fillStyle = "#071217";
    ctx.beginPath();
    ctx.arc(-11, 7, 2.2, 0, Math.PI * 2);
    ctx.arc(7, 7, 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    this.drawTruckTag(ctx, truck, position, tempColor, index);
  }

  drawTruckTag(ctx, truck, position, tempColor, index) {
    const measured = truck.finalTemp ?? truck.temperature;
    const width = 99;
    const height = 31;
    const above = truck.route !== "direct";
    const stackOffset = index === 1 ? 0 : index === 0 ? -9 : 9;
    const x = position.x - width / 2;
    const y = above
      ? position.y - 47 + stackOffset
      : position.y + 20 + stackOffset;
    const status =
      truck.state === "swapping"
        ? "SWAP"
        : truck.state === "queued"
          ? "QUEUE"
          : truck.battery <= 0
            ? "POWER LOST"
            : truck.state === "arrived"
              ? "ARRIVED"
              : truck.routeInfo.label;
    const border =
      truck.temperatureState === "breach" ? "#ff6d65" : `${tempColor}70`;

    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, 0.3)";
    ctx.shadowBlur = 8;
    ctx.fillStyle = "rgba(5, 17, 22, 0.88)";
    roundedRect(ctx, x, y, width, height, 4);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = border;
    ctx.lineWidth = 0.8;
    ctx.stroke();

    ctx.font = `600 7px ${MONO}`;
    ctx.textAlign = "left";
    ctx.fillStyle = truck.color;
    ctx.fillText(truck.id, x + 6, y + 9);
    ctx.font = `500 6px ${MONO}`;
    ctx.fillStyle = "#65858b";
    ctx.fillText(status, x + 27, y + 9);

    ctx.textAlign = "right";
    ctx.font = `600 9px ${MONO}`;
    ctx.fillStyle = tempColor;
    ctx.fillText(`${measured.toFixed(1)}°`, x + width - 6, y + 10);

    ctx.textAlign = "left";
    ctx.font = `500 6px ${MONO}`;
    ctx.fillStyle = "#708e94";
    ctx.fillText("BAT", x + 6, y + 18);
    ctx.fillStyle = "rgba(99, 141, 149, 0.2)";
    roundedRect(ctx, x + 22, y + 15, 23, 3, 1.5);
    ctx.fill();
    ctx.fillStyle = truck.battery <= 18 ? "#ff6d65" : "#91ece4";
    roundedRect(
      ctx,
      x + 22,
      y + 15,
      Math.max(1, 23 * (truck.battery / 100)),
      3,
      1.5,
    );
    ctx.fill();
    ctx.textAlign = "right";
    ctx.fillStyle = truck.battery <= 18 ? "#ff8b84" : "#8ba7ac";
    ctx.fillText(`${Math.round(truck.battery)}%`, x + width - 6, y + 19);

    const bandX = x + 6;
    const bandY = y + 24;
    const bandWidth = width - 12;
    const gradient = ctx.createLinearGradient(bandX, 0, bandX + bandWidth, 0);
    gradient.addColorStop(0, "#45cee1");
    gradient.addColorStop(0.4, "#8ae3bd");
    gradient.addColorStop(0.63, "#bde76a");
    gradient.addColorStop(0.78, "#f0b664");
    gradient.addColorStop(1, "#ff6d65");
    ctx.fillStyle = gradient;
    roundedRect(ctx, bandX, bandY, bandWidth, 3, 1.5);
    ctx.fill();
    const markerX = bandX + Math.max(0, Math.min(1, (measured - 2) / 8)) * bandWidth;
    ctx.fillStyle = "#eefcfa";
    ctx.beginPath();
    ctx.arc(markerX, bandY + 1.5, 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#082027";
    ctx.lineWidth = 0.8;
    ctx.stroke();
    ctx.restore();
  }
}
