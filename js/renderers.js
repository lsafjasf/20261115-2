import { SURVEY_SPEC } from "./sonar-core.js";

const MONO = '"SFMono-Regular", "Cascadia Mono", Menlo, Consolas, monospace';

function setupCanvas(canvas) {
  const context = canvas.getContext("2d");
  const resize = () => {
    const devicePixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, canvas.clientWidth);
    const height = Math.max(1, canvas.clientHeight);
    canvas.width = Math.floor(width * devicePixelRatio);
    canvas.height = Math.floor(height * devicePixelRatio);
    context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    canvas.dataset.width = width;
    canvas.dataset.height = height;
  };
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  resize();
  return { context, observer };
}

function polarPoint(centerX, centerY, radius, bearingDeg) {
  const radians = (bearingDeg - 90) * Math.PI / 180;
  return {
    x: centerX + Math.cos(radians) * radius,
    y: centerY + Math.sin(radians) * radius
  };
}

function rgba(hex, alpha) {
  const value = hex.replace("#", "");
  const red = parseInt(value.slice(0, 2), 16);
  const green = parseInt(value.slice(2, 4), 16);
  const blue = parseInt(value.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

export class ScopeRenderer {
  constructor(canvas) {
    const { context } = setupCanvas(canvas);
    this.canvas = canvas;
    this.context = context;
  }

  get size() {
    return {
      width: Number(this.canvas.dataset.width),
      height: Number(this.canvas.dataset.height)
    };
  }

  draw(state) {
    const { width, height } = this.size;
    const context = this.context;
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) * 0.405;
    const now = performance.now();
    context.clearRect(0, 0, width, height);

    const background = context.createRadialGradient(centerX, centerY, 2, centerX, centerY, radius * 1.45);
    background.addColorStop(0, "rgba(21, 62, 51, .3)");
    background.addColorStop(0.58, "rgba(6, 21, 18, .22)");
    background.addColorStop(1, "rgba(1, 7, 6, .6)");
    context.fillStyle = background;
    context.fillRect(0, 0, width, height);

    this.drawPolarGrid(centerX, centerY, radius);
    this.drawBeam(centerX, centerY, radius, state.angle, state.scanning);
    this.drawSweep(centerX, centerY, radius, state.lastPingAt, now);
    this.drawTraces(centerX, centerY, radius, state.markers, state.listener);
    this.drawHydrophone(centerX, centerY, state.angle, state.overheated);
    this.drawHover(centerX, centerY, radius, state.hover);

    if (state.overheated) {
      context.fillStyle = "rgba(120, 20, 10, .08)";
      context.fillRect(0, 0, width, height);
    }
  }

  drawPolarGrid(centerX, centerY, radius) {
    const context = this.context;
    context.lineWidth = 1;

    for (let bearing = 0; bearing < 360; bearing += 10) {
      const major = bearing % 30 === 0;
      const inner = bearing % 30 === 0 ? radius * 0.955 : radius * 0.975;
      const start = polarPoint(centerX, centerY, inner, bearing);
      const end = polarPoint(centerX, centerY, radius, bearing);
      context.strokeStyle = major ? rgba("#8be1c3", 0.27) : rgba("#8be1c3", 0.09);
      context.beginPath();
      context.moveTo(start.x, start.y);
      context.lineTo(end.x, end.y);
      context.stroke();
    }

    for (let index = 1; index <= 4; index += 1) {
      const ringRadius = radius * index / 4;
      context.strokeStyle = index === 4 ? rgba("#8be1c3", 0.32) : rgba("#8be1c3", 0.13);
      context.beginPath();
      context.arc(centerX, centerY, ringRadius, 0, Math.PI * 2);
      context.stroke();
      context.fillStyle = rgba("#8be1c3", 0.34);
      context.font = `500 7px ${MONO}`;
      context.textAlign = "left";
      context.fillText(String(index * 12), centerX + 5, centerY - ringRadius + 11);
    }

    context.strokeStyle = rgba("#8be1c3", 0.12);
    context.beginPath();
    context.moveTo(centerX - radius, centerY);
    context.lineTo(centerX + radius, centerY);
    context.moveTo(centerX, centerY - radius);
    context.lineTo(centerX, centerY + radius);
    context.stroke();

    ["N", "E", "S", "W"].forEach((label, index) => {
      const point = polarPoint(centerX, centerY, radius + 17, index * 90);
      context.fillStyle = label === "N" ? rgba("#c4ffe8", 0.75) : rgba("#6f8e83", 0.6);
      context.font = `500 8px ${MONO}`;
      context.textAlign = "center";
      context.fillText(label, point.x, point.y + 3);
    });

    for (let bearing = 0; bearing < 360; bearing += 30) {
      const point = polarPoint(centerX, centerY, radius * 0.87, bearing);
      context.fillStyle = rgba("#6f8e83", 0.28);
      context.font = `400 7px ${MONO}`;
      context.textAlign = "center";
      context.fillText(String(bearing).padStart(3, "0"), point.x, point.y + 2);
    }
  }

  drawBeam(centerX, centerY, radius, angle, scanning) {
    const context = this.context;
    const half = SURVEY_SPEC.beamHalfDeg;
    const start = (angle - half - 90) * Math.PI / 180;
    const end = (angle + half - 90) * Math.PI / 180;
    const beamGradient = context.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
    beamGradient.addColorStop(0, scanning ? "rgba(140, 227, 196, .16)" : "rgba(140, 227, 196, .09)");
    beamGradient.addColorStop(0.55, "rgba(100, 196, 160, .055)");
    beamGradient.addColorStop(1, "rgba(62, 146, 116, 0)");
    context.fillStyle = beamGradient;
    context.beginPath();
    context.moveTo(centerX, centerY);
    context.arc(centerX, centerY, radius, start, end);
    context.closePath();
    context.fill();

    const edge = polarPoint(centerX, centerY, radius, angle);
    context.strokeStyle = rgba("#b9ffe5", scanning ? 0.9 : 0.55);
    context.lineWidth = scanning ? 1.5 : 1;
    context.shadowColor = "#8ce3c4";
    context.shadowBlur = scanning ? 16 : 7;
    context.beginPath();
    context.moveTo(centerX, centerY);
    context.lineTo(edge.x, edge.y);
    context.stroke();
    context.shadowBlur = 0;
  }

  drawSweep(centerX, centerY, radius, lastPingAt, now) {
    if (!lastPingAt) return;
    const age = (now - lastPingAt) / 1000;
    if (age < 0 || age > 2.2) return;
    const context = this.context;
    const eased = 1 - Math.pow(1 - Math.min(1, age / 2.1), 2.2);
    for (let offset = 0; offset < 2; offset += 1) {
      const progress = Math.max(0, eased - offset * 0.23);
      if (progress <= 0) continue;
      context.strokeStyle = rgba("#8ce3c4", (1 - progress) * 0.28 * (1 - offset * 0.35));
      context.lineWidth = 1;
      context.beginPath();
      context.arc(centerX, centerY, progress * radius, 0, Math.PI * 2);
      context.stroke();
    }
  }

  drawTraces(centerX, centerY, radius, markers, listener) {
    const context = this.context;
    const scale = radius / SURVEY_SPEC.rangeMax;
    markers.forEach((marker, index) => {
      const x = centerX + (marker.x - listener.x) * scale;
      const y = centerY + (marker.y - listener.y) * scale;
      const originX = centerX + (marker.origin.x - listener.x) * scale;
      const originY = centerY + (marker.origin.y - listener.y) * scale;
      const confirmed = marker.status === "confirmed";
      const color = confirmed
        ? marker.kind === "beacon" ? "#a7ffe8" : "#e0b86e"
        : "#df745f";

      context.save();
      context.setLineDash(confirmed ? [] : [3, 5]);
      context.strokeStyle = rgba(color, confirmed ? 0.62 : 0.7);
      context.lineWidth = confirmed ? 1.1 : 1;
      context.shadowColor = rgba(color, 0.5);
      context.shadowBlur = confirmed ? 7 : 4;
      context.beginPath();
      context.moveTo(originX, originY);
      context.lineTo(x, y);
      context.stroke();
      context.restore();

      context.strokeStyle = rgba(color, 0.9);
      context.fillStyle = "rgba(3, 13, 11, .9)";
      context.lineWidth = 1;
      context.beginPath();
      context.arc(x, y, confirmed ? 4.1 : 3.4, 0, Math.PI * 2);
      context.fill();
      context.stroke();
      context.strokeStyle = rgba(color, 0.32);
      context.beginPath();
      context.arc(x, y, 9, 0, Math.PI * 2);
      context.stroke();

      if (confirmed) {
        const label = marker.kind === "beacon" ? "BEACON" : `OBST ${String(index + 1).padStart(2, "0")}`;
        context.font = `500 7px ${MONO}`;
        const textWidth = context.measureText(label).width;
        const boxX = x + 12;
        const boxY = y - 15;
        context.fillStyle = "rgba(4, 17, 14, .86)";
        context.fillRect(boxX, boxY, textWidth + 8, 13);
        context.strokeStyle = rgba(color, 0.32);
        context.strokeRect(boxX + 0.5, boxY + 0.5, textWidth + 7, 12);
        context.fillStyle = rgba(color, 0.9);
        context.textAlign = "left";
        context.fillText(label, boxX + 4, boxY + 9);
      } else {
        context.strokeStyle = rgba(color, 0.9);
        context.beginPath();
        context.moveTo(x - 3, y - 3);
        context.lineTo(x + 3, y + 3);
        context.moveTo(x + 3, y - 3);
        context.lineTo(x - 3, y + 3);
        context.stroke();
      }
    });
  }

  drawHydrophone(centerX, centerY, angle, overheated) {
    const context = this.context;
    const point = polarPoint(centerX, centerY, 18, angle);
    context.fillStyle = "rgba(4, 15, 12, .95)";
    context.strokeStyle = overheated ? "#df745f" : rgba("#8ce3c4", 0.8);
    context.lineWidth = 1;
    context.beginPath();
    context.arc(centerX, centerY, 7, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    context.fillStyle = overheated ? "#df745f" : "#c4ffe8";
    context.beginPath();
    context.arc(centerX, centerY, 2, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = rgba("#8ce3c4", 0.22);
    context.beginPath();
    context.moveTo(centerX, centerY);
    context.lineTo(point.x, point.y);
    context.stroke();
    context.fillStyle = rgba("#c4ffe8", 0.9);
    context.beginPath();
    context.moveTo(point.x, point.y);
    context.lineTo(point.x - 3, point.y + 6);
    context.lineTo(point.x + 3, point.y + 6);
    context.closePath();
    context.fill();
  }

  drawHover(centerX, centerY, radius, hover) {
    if (!hover) return;
    const context = this.context;
    const scale = radius / SURVEY_SPEC.rangeMax;
    const x = centerX + hover.x * scale;
    const y = centerY + hover.y * scale;
    if (Math.hypot(x - centerX, y - centerY) > radius) return;
    context.save();
    context.setLineDash([2, 5]);
    context.strokeStyle = rgba("#c4ffe8", 0.3);
    context.lineWidth = 1;
    context.beginPath();
    context.arc(x, y, 8, 0, Math.PI * 2);
    context.moveTo(x - 12, y);
    context.lineTo(x + 12, y);
    context.moveTo(x, y - 12);
    context.lineTo(x, y + 12);
    context.stroke();
    context.restore();
  }
}

export class WaveRenderer {
  constructor(canvas) {
    const { context } = setupCanvas(canvas);
    this.canvas = canvas;
    this.context = context;
  }

  get size() {
    return {
      width: Number(this.canvas.dataset.width),
      height: Number(this.canvas.dataset.height)
    };
  }

  draw(state) {
    const { width, height } = this.size;
    const context = this.context;
    const now = performance.now();
    context.clearRect(0, 0, width, height);

    context.fillStyle = "rgba(3, 12, 10, .55)";
    context.fillRect(0, 0, width, height);
    context.strokeStyle = rgba("#8be1c3", 0.08);
    context.lineWidth = 1;
    for (let index = 0; index <= 8; index += 1) {
      const x = Math.round(index * width / 8) + 0.5;
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, height);
      context.stroke();
    }
    for (let index = 0; index <= 4; index += 1) {
      const y = Math.round(index * height / 4) + 0.5;
      context.strokeStyle = rgba("#8be1c3", index === 2 ? 0.19 : 0.07);
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(width, y);
      context.stroke();
    }

    const centerY = height * 0.53;
    if (!state.pings.length) {
      this.drawNoise(centerY, width, 0.055, now);
      context.fillStyle = rgba("#8be1c3", 0.22);
      context.font = `500 7px ${MONO}`;
      context.textAlign = "center";
      context.fillText("NO RETURN", width / 2, height * 0.32);
      return;
    }

    const latest = state.pings[state.pings.length - 1];
    const elapsed = (now - latest.startedAt) / 1000;
    const windowSeconds = 4;
    context.save();
    context.beginPath();
    context.rect(0, 0, width, height);
    context.clip();
    this.drawNoise(centerY, width, 0.035 + Math.max(0, 0.035 - elapsed * 0.012), now);
    this.drawPulsePacket(width * 0.035, centerY, 18, 0.11, now, "#8ce3c4");

    latest.echoes.forEach((echo) => {
      if (elapsed < echo.delay - 0.06) return;
      const x = width * (echo.delay / windowSeconds);
      const color = echo.kind === "beacon" ? "#a7ffe8" : "#e0b86e";
      const age = Math.max(0, elapsed - echo.delay);
      if (age > 1.2) return;
      const amplitude = (echo.kind === "beacon" ? 17 : 13) * echo.strength * (1 - age / 1.2);
      const cycles = echo.kind === "beacon" ? 22 : 8;
      this.drawPulsePacket(x, centerY, amplitude, 0.15, now, color, cycles);
      context.fillStyle = rgba(color, 0.72);
      context.font = `500 6px ${MONO}`;
      context.textAlign = "center";
      context.fillText(echo.kind === "beacon" ? "BEACON" : "HARD", x, centerY - amplitude - 8);
    });
    context.restore();

    if (elapsed <= windowSeconds) {
      const cursorX = width * elapsed / windowSeconds;
      context.strokeStyle = rgba("#8ce3c4", 0.24);
      context.beginPath();
      context.moveTo(cursorX, 4);
      context.lineTo(cursorX, height - 4);
      context.stroke();
    }
  }

  drawNoise(centerY, width, amplitude, now) {
    const context = this.context;
    context.beginPath();
    context.strokeStyle = rgba("#8be1c3", 0.2);
    context.lineWidth = 1;
    for (let x = 0; x <= width; x += 2) {
      const wave = Math.sin(x * 0.31 + now * 0.006) * 0.45
        + Math.sin(x * 0.97 + now * 0.01) * 0.25
        + Math.sin(x * 2.13 - now * 0.014) * 0.12;
      const y = centerY + wave * amplitude * 11;
      if (x === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.stroke();
  }

  drawPulsePacket(x, centerY, amplitude, duration, now, color, cycles = 14) {
    const context = this.context;
    const halfWidth = this.size.width * duration / 8;
    context.beginPath();
    context.strokeStyle = rgba(color, 0.8);
    context.lineWidth = 1;
    for (let index = 0; index <= 30; index += 1) {
      const ratio = index / 30;
      const offsetX = x - halfWidth + ratio * halfWidth * 2;
      const envelope = Math.sin(ratio * Math.PI);
      const carrier = Math.sin(ratio * Math.PI * 2 * cycles + now * 0.002);
      const y = centerY + carrier * amplitude * envelope;
      if (index === 0) context.moveTo(offsetX, y);
      else context.lineTo(offsetX, y);
    }
    context.stroke();
  }
}
