import {
  ANOMALY_THRESHOLD,
  formatDay,
  formatTime,
  isAnomaly,
  stations,
  tideData,
  timeTickIndexes,
} from "./data.js";

const COLORS = {
  bg: "#06151b",
  panel: "#081c24",
  text: "#d9e9e9",
  muted: "#78939b",
  faint: "#49656d",
  grid: "rgba(160, 198, 202, 0.10)",
  gridStrong: "rgba(160, 198, 202, 0.19)",
  aqua: "#70e0d2",
  aquaSoft: "rgba(112, 224, 210, 0.10)",
  alert: "#ff7650",
  alertSoft: "rgba(255, 118, 80, 0.13)",
};

const NORMAL_STOPS = [
  [0, "#082b43"],
  [0.28, "#0c4c63"],
  [0.52, "#117988"],
  [0.74, "#48b7ae"],
  [0.9, "#a9d4ba"],
  [1, "#e3dfa8"],
];

const ALERT_STOPS = [
  [0, "#ff9a62"],
  [0.48, "#ff6844"],
  [1, "#d72c55"],
];

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const lerp = (start, end, amount) => start + (end - start) * amount;

function hexToRgb(hex) {
  const value = Number.parseInt(hex.slice(1), 16);
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
}

function rampColor(stops, amount) {
  const value = clamp(amount, 0, 1);
  for (let index = 0; index < stops.length - 1; index += 1) {
    const [start, startHex] = stops[index];
    const [end, endHex] = stops[index + 1];
    if (value <= end) {
      const ratio = (value - start) / (end - start || 1);
      const a = hexToRgb(startHex);
      const b = hexToRgb(endHex);
      return `rgb(${Math.round(lerp(a.r, b.r, ratio))}, ${Math.round(lerp(a.g, b.g, ratio))}, ${Math.round(lerp(a.b, b.b, ratio))})`;
    }
  }
  return stops[stops.length - 1][1];
}

export function tideColor(height) {
  if (isAnomaly(height)) {
    return rampColor(ALERT_STOPS, (height - ANOMALY_THRESHOLD) / 0.6);
  }
  return rampColor(NORMAL_STOPS, (height - 0.3) / (ANOMALY_THRESHOLD - 0.3));
}

function roundedRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, r);
}

function setFont(ctx, size, weight = 400, mono = false) {
  ctx.font = `${weight} ${size}px ${mono ? '"SFMono-Regular", "Cascadia Code", "Tide Sans", monospace' : '"Avenir Next", "Segoe UI", "Tide Sans", "PingFang SC", sans-serif'}`;
}

export class TideChart {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.width = 0;
    this.height = 0;
    this.geometry = null;
    this.dpr = 1;
  }

  resize(forceWidth = null, forceHeight = null) {
    const rect = this.canvas.getBoundingClientRect();
    this.width = Math.max(280, Math.floor(forceWidth || rect.width || 900));
    this.height = Math.max(300, Math.floor(forceHeight || rect.height || 500));
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.floor(this.width * this.dpr);
    this.canvas.height = Math.floor(this.height * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  render(state, options = {}) {
    if (options.width || options.height) {
      this.resize(options.width, options.height);
    } else if (!this.width || Math.abs(this.width - this.canvas.getBoundingClientRect().width) > 1) {
      this.resize();
    }

    const ctx = this.ctx;
    this.state = state;
    ctx.clearRect(0, 0, this.width, this.height);
    this.drawCanvasBackground(options.exportMode);

    if (state.view === "line") this.drawLine(state, options);
    else if (state.view === "profile") this.drawProfile(state, options);
    else this.drawHeatmap(state, options);

    if (options.exportMode) this.drawExportFurniture(state);
  }

  drawCanvasBackground(exportMode = false) {
    const { ctx, width, height } = this;
    const background = ctx.createLinearGradient(0, 0, width, height);
    background.addColorStop(0, exportMode ? "#071a21" : "#07191f");
    background.addColorStop(1, "#061319");
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = "rgba(154, 196, 200, 0.035)";
    ctx.lineWidth = 1;
    for (let x = 0.5; x < width; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0.5; y < height; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
  }

  plotBox(kind, exportMode = false) {
    const narrow = this.width < 620;
    const top = exportMode ? 78 : 34;
    const bottom = exportMode ? 78 : 54;
    const left = kind === "heatmap" ? (narrow ? 82 : 112) : narrow ? 52 : 68;
    const right = narrow ? 16 : 30;
    return {
      left,
      top,
      right,
      bottom,
      width: this.width - left - right,
      height: this.height - top - bottom,
    };
  }

  drawAxisText(text, x, y, align = "left", color = COLORS.faint, size = 9) {
    const { ctx } = this;
    setFont(ctx, size, 400, true);
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = "middle";
    ctx.fillText(text, x, y);
  }

  drawYAxis(plot, maxValue = 3.5) {
    const { ctx } = this;
    ctx.save();
    ctx.lineWidth = 1;
    for (let value = 0; value <= maxValue; value += 0.5) {
      const y = plot.top + plot.height - (value / maxValue) * plot.height;
      ctx.strokeStyle = value === 0 ? COLORS.gridStrong : COLORS.grid;
      ctx.beginPath();
      ctx.moveTo(plot.left, y + 0.5);
      ctx.lineTo(plot.left + plot.width, y + 0.5);
      ctx.stroke();
      this.drawAxisText(`${value.toFixed(1)}`, plot.left - 12, y, "right");
    }
    ctx.restore();
  }

  drawThreshold(plot, maxValue = 3.5) {
    const { ctx } = this;
    const y = plot.top + plot.height - (ANOMALY_THRESHOLD / maxValue) * plot.height;
    ctx.save();
    ctx.strokeStyle = "rgba(255, 118, 80, 0.62)";
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(plot.left, y);
    ctx.lineTo(plot.left + plot.width, y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(255, 167, 129, 0.9)";
    setFont(ctx, 9, 500, true);
    ctx.textAlign = "right";
    ctx.textBaseline = "bottom";
    ctx.fillText("异常阈值 2.70 m", plot.left + plot.width, y - 6);
    ctx.restore();
  }

  drawCursor(plot, x, label, align = "center") {
    const { ctx } = this;
    setFont(ctx, 8, 500, true);
    const labelWidth = ctx.measureText(label).width + 12;
    const labelX = clamp(x - labelWidth / 2, plot.left, plot.left + plot.width - labelWidth);
    const labelY = plot.top + 7;
    ctx.save();
    ctx.strokeStyle = "rgba(207, 248, 240, 0.42)";
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 4]);
    ctx.beginPath();
    ctx.moveTo(x + 0.5, plot.top);
    ctx.lineTo(x + 0.5, plot.top + plot.height);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(112, 224, 210, 0.92)";
    ctx.beginPath();
    ctx.arc(x, plot.top, 2.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(7, 24, 30, 0.88)";
    roundedRect(ctx, labelX, labelY, labelWidth, 16, 4);
    ctx.fill();
    ctx.strokeStyle = "rgba(112, 224, 210, 0.2)";
    ctx.lineWidth = 0.8;
    ctx.stroke();
    ctx.fillStyle = "rgba(176, 236, 229, 0.94)";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, labelX + labelWidth / 2, labelY + 8);
    ctx.restore();
  }

  drawHeatmap(state, options = {}) {
    const { ctx } = this;
    const plot = this.plotBox("heatmap", options.exportMode);
    const count = state.endIndex - state.startIndex + 1;
    const rowHeight = plot.height / stations.length;
    const cellWidth = plot.width / count;
    const gap = Math.max(0.35, Math.min(1.8, cellWidth * 0.13));
    this.geometry = { kind: "heatmap", plot, count, rowHeight, cellWidth };

    ctx.fillStyle = "rgba(4, 17, 23, 0.66)";
    ctx.fillRect(plot.left, plot.top, plot.width, plot.height);

    const selectedY = plot.top + state.stationIndex * rowHeight;
    ctx.fillStyle = "rgba(112, 224, 210, 0.075)";
    ctx.fillRect(plot.left, selectedY, plot.width, rowHeight);

    for (let hour = state.startIndex; hour <= state.endIndex; hour += 1) {
      const localHour = hour - state.startIndex;
      const x = plot.left + localHour * cellWidth;
      for (let stationIndex = 0; stationIndex < stations.length; stationIndex += 1) {
        const height = tideData[hour][stationIndex];
        const y = plot.top + stationIndex * rowHeight;
        ctx.fillStyle = tideColor(height);
        ctx.fillRect(x + gap, y + gap, cellWidth - gap * 2, rowHeight - gap * 2);
      }
    }

    for (const tick of timeTickIndexes(state.startIndex, state.endIndex)) {
      const x = plot.left + ((tick - state.startIndex) / count) * plot.width;
      ctx.strokeStyle = "rgba(213, 241, 241, 0.16)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + 0.5, plot.top);
      ctx.lineTo(x + 0.5, plot.top + plot.height);
      ctx.stroke();
      ctx.fillStyle = "#9db4b8";
      setFont(ctx, this.width < 620 ? 8 : 9, 400, true);
      ctx.textAlign = tick === state.startIndex ? "left" : tick === state.endIndex ? "right" : "center";
      ctx.textBaseline = "top";
      ctx.fillText(formatDay(tick), x, plot.top + plot.height + 12);
    }

    ctx.strokeStyle = "rgba(112, 224, 210, 0.55)";
    ctx.lineWidth = 1;
    ctx.strokeRect(plot.left - 4.5, selectedY + 0.5, plot.width + 9, rowHeight - 1);
    ctx.fillStyle = COLORS.aqua;
    ctx.fillRect(plot.left - 8, selectedY + 4, 2.5, rowHeight - 8);

    const narrow = this.width < 620;
    stations.forEach((station, stationIndex) => {
      const y = plot.top + stationIndex * rowHeight + rowHeight / 2;
      const selected = stationIndex === state.stationIndex;
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      setFont(ctx, narrow ? 10 : 11, selected ? 600 : 400);
      ctx.fillStyle = selected ? COLORS.text : COLORS.muted;
      ctx.fillText(station.name, plot.left - 17, y - (narrow ? 4 : 6));
      setFont(ctx, 8, 500, true);
      ctx.fillStyle = selected ? COLORS.aqua : COLORS.faint;
      ctx.fillText(station.code, plot.left - 17, y + (narrow ? 8 : 9));
    });

    const cursorX =
      plot.left + ((state.cursorIndex - state.startIndex + 0.5) / count) * plot.width;
    if (cursorX > plot.left && cursorX < plot.left + plot.width) {
      this.drawCursor(plot, cursorX, formatTime(state.cursorIndex));
    }

    this.drawAxisText("07 STATIONS / 逐小时", plot.left, plot.top - 16, "left", COLORS.faint, 8);
    this.drawAxisText(
      `${formatTime(state.startIndex)}  →  ${formatTime(state.endIndex)}`,
      plot.left + plot.width,
      plot.top - 16,
      "right",
      COLORS.faint,
      8,
    );

    if (state.hover && !options.exportMode) {
      const hover = state.hover;
      if (
        hover.hourIndex >= state.startIndex &&
        hover.hourIndex <= state.endIndex
      ) {
        const x = plot.left + (hover.hourIndex - state.startIndex) * cellWidth;
        const y = plot.top + hover.stationIndex * rowHeight;
        ctx.strokeStyle = "rgba(240, 255, 252, 0.92)";
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x + 0.5, y + 0.5, Math.max(2, cellWidth - 1), rowHeight - 1);
      }
    }
  }

  drawLine(state, options = {}) {
    const { ctx } = this;
    const plot = this.plotBox("line", options.exportMode);
    const maxValue = 3.5;
    const count = state.endIndex - state.startIndex + 1;
    const station = stations[state.stationIndex];
    const baseY = plot.top + plot.height;
    const xFor = (hour) =>
      plot.left + ((hour - state.startIndex) / Math.max(1, count - 1)) * plot.width;
    const yFor = (height) => baseY - (clamp(height, 0, maxValue) / maxValue) * plot.height;
    this.geometry = { kind: "line", plot, count, xFor, yFor };

    ctx.fillStyle = "rgba(4, 17, 23, 0.45)";
    ctx.fillRect(plot.left, plot.top, plot.width, plot.height);
    this.drawYAxis(plot, maxValue);
    this.drawThreshold(plot, maxValue);

    for (const tick of timeTickIndexes(state.startIndex, state.endIndex)) {
      const x = xFor(tick);
      ctx.strokeStyle = "rgba(213, 241, 241, 0.10)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + 0.5, plot.top);
      ctx.lineTo(x + 0.5, plot.top + plot.height);
      ctx.stroke();
      ctx.fillStyle = "#8fa9ad";
      setFont(ctx, this.width < 620 ? 8 : 9, 400, true);
      ctx.textAlign = tick === state.startIndex ? "left" : tick === state.endIndex ? "right" : "center";
      ctx.textBaseline = "top";
      ctx.fillText(formatDay(tick), x, plot.top + plot.height + 13);
    }

    const points = [];
    for (let hour = state.startIndex; hour <= state.endIndex; hour += 1) {
      points.push({
        hour,
        height: tideData[hour][state.stationIndex],
        x: xFor(hour),
        y: yFor(tideData[hour][state.stationIndex]),
      });
    }

    const area = ctx.createLinearGradient(0, plot.top, 0, plot.top + plot.height);
    area.addColorStop(0, "rgba(112, 224, 210, 0.20)");
    area.addColorStop(0.65, "rgba(45, 155, 151, 0.06)");
    area.addColorStop(1, "rgba(16, 68, 76, 0)");
    ctx.beginPath();
    ctx.moveTo(points[0].x, baseY);
    points.forEach((point) => ctx.lineTo(point.x, point.y));
    ctx.lineTo(points[points.length - 1].x, baseY);
    ctx.fillStyle = area;
    ctx.fill();

    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    for (let index = 1; index < points.length; index += 1) {
      const previous = points[index - 1];
      const current = points[index];
      const anomalySegment =
        previous.height >= ANOMALY_THRESHOLD || current.height >= ANOMALY_THRESHOLD;
      ctx.strokeStyle = anomalySegment ? COLORS.alert : COLORS.aqua;
      ctx.lineWidth = anomalySegment ? 3 : 1.6;
      if (!anomalySegment) ctx.strokeStyle = "rgba(112, 224, 210, 0.82)";
      ctx.beginPath();
      ctx.moveTo(previous.x, previous.y);
      ctx.lineTo(current.x, current.y);
      ctx.stroke();
    }

    let peak = points[0];
    for (const point of points) if (point.height > peak.height) peak = point;
    for (const point of points) {
      if (point.height >= ANOMALY_THRESHOLD) {
        ctx.fillStyle = tideColor(point.height);
        ctx.beginPath();
        ctx.arc(point.x, point.y, 3.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(255, 224, 203, 0.8)";
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }
    }

    const cursorX = xFor(state.cursorIndex);
    this.drawCursor(plot, cursorX, formatTime(state.cursorIndex));

    const labelX = clamp(peak.x, plot.left + 34, plot.left + plot.width - 38);
    const labelY = Math.max(plot.top + 12, peak.y - 17);
    ctx.fillStyle = "rgba(7, 24, 30, 0.88)";
    roundedRect(ctx, labelX - 33, labelY - 9, 66, 18, 4);
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 177, 139, 0.34)";
    ctx.lineWidth = 0.8;
    ctx.stroke();
    setFont(ctx, 8, 500, true);
    ctx.fillStyle = isAnomaly(peak.height) ? COLORS.alert : COLORS.muted;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`峰值 ${peak.height.toFixed(2)} m`, labelX, labelY);

    const hover = state.hover;
    if (hover && !options.exportMode && hover.hourIndex >= state.startIndex && hover.hourIndex <= state.endIndex) {
      const point = points[hover.hourIndex - state.startIndex];
      ctx.strokeStyle = "rgba(225, 255, 249, 0.42)";
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(point.x + 0.5, plot.top);
      ctx.lineTo(point.x + 0.5, baseY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = tideColor(point.height);
      ctx.beginPath();
      ctx.arc(point.x, point.y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#effffb";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    this.drawAxisText(
      `HIGHLIGHTED STATION / ${station.name} · ${station.code}`,
      plot.left,
      plot.top - 16,
      "left",
      COLORS.aqua,
      9,
    );
    this.drawAxisText("潮高 / m", plot.left, plot.top - 30, "left", COLORS.faint, 8);
    this.drawAxisText(
      `${formatTime(state.startIndex)}  →  ${formatTime(state.endIndex)}`,
      plot.left + plot.width,
      plot.top - 16,
      "right",
      COLORS.faint,
      8,
    );
  }

  drawProfile(state, options = {}) {
    const { ctx } = this;
    const plot = this.plotBox("profile", options.exportMode);
    const maxValue = 3.5;
    const baseY = plot.top + plot.height;
    const slot = plot.width / stations.length;
    const xFor = (stationIndex) => plot.left + slot * (stationIndex + 0.5);
    const yFor = (height) => baseY - (clamp(height, 0, maxValue) / maxValue) * plot.height;
    this.geometry = { kind: "profile", plot, slot, xFor, yFor };

    ctx.fillStyle = "rgba(4, 17, 23, 0.45)";
    ctx.fillRect(plot.left, plot.top, plot.width, plot.height);
    this.drawYAxis(plot, maxValue);
    this.drawThreshold(plot, maxValue);

    const selectedX = xFor(state.stationIndex);
    const bandWidth = Math.min(slot, 86);
    const band = ctx.createLinearGradient(0, plot.top, 0, baseY);
    band.addColorStop(0, "rgba(112, 224, 210, 0.10)");
    band.addColorStop(1, "rgba(112, 224, 210, 0.015)");
    ctx.fillStyle = band;
    ctx.fillRect(selectedX - bandWidth / 2, plot.top, bandWidth, plot.height);
    ctx.strokeStyle = "rgba(112, 224, 210, 0.30)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(selectedX + 0.5, plot.top);
    ctx.lineTo(selectedX + 0.5, baseY);
    ctx.stroke();

    const values = tideData[state.cursorIndex];
    const points = stations.map((station, stationIndex) => ({
      stationIndex,
      height: values[stationIndex],
      x: xFor(stationIndex),
      y: yFor(values[stationIndex]),
    }));

    for (const point of points) {
      const barWidth = Math.min(28, slot * 0.34);
      const gradient = ctx.createLinearGradient(0, point.y, 0, baseY);
      if (isAnomaly(point.height)) {
        gradient.addColorStop(0, "rgba(255, 112, 76, 0.58)");
        gradient.addColorStop(1, "rgba(255, 112, 76, 0.03)");
      } else {
        gradient.addColorStop(0, "rgba(87, 195, 185, 0.33)");
        gradient.addColorStop(1, "rgba(87, 195, 185, 0.02)");
      }
      ctx.fillStyle = gradient;
      roundedRect(ctx, point.x - barWidth / 2, point.y, barWidth, baseY - point.y, 4);
      ctx.fill();
    }

    for (let index = 1; index < points.length; index += 1) {
      const previous = points[index - 1];
      const current = points[index];
      const anomalySegment =
        previous.height >= ANOMALY_THRESHOLD || current.height >= ANOMALY_THRESHOLD;
      ctx.strokeStyle = anomalySegment ? COLORS.alert : "rgba(112, 224, 210, 0.62)";
      ctx.lineWidth = anomalySegment ? 2.6 : 1.8;
      ctx.beginPath();
      ctx.moveTo(previous.x, previous.y);
      ctx.lineTo(current.x, current.y);
      ctx.stroke();
    }

    for (const point of points) {
      const selected = point.stationIndex === state.stationIndex;
      ctx.fillStyle = tideColor(point.height);
      ctx.beginPath();
      ctx.arc(point.x, point.y, selected ? 6 : isAnomaly(point.height) ? 4.5 : 3.6, 0, Math.PI * 2);
      ctx.fill();
      if (selected) {
        ctx.strokeStyle = "rgba(239, 255, 251, 0.94)";
        ctx.lineWidth = 1.8;
        ctx.stroke();
        ctx.strokeStyle = "rgba(112, 224, 210, 0.3)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(point.x, point.y, 11, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    const selectedPoint = points[state.stationIndex];
    const labelWidth = 116;
    const labelX = clamp(selectedPoint.x, plot.left + labelWidth / 2, plot.left + plot.width - labelWidth / 2);
    const labelY = Math.max(plot.top + 17, selectedPoint.y - 27);
    ctx.fillStyle = "rgba(7, 24, 30, 0.94)";
    roundedRect(ctx, labelX - labelWidth / 2, labelY - 12, labelWidth, 24, 5);
    ctx.fill();
    ctx.strokeStyle = "rgba(112, 224, 210, 0.35)";
    ctx.lineWidth = 1;
    ctx.stroke();
    setFont(ctx, 9, 500, true);
    ctx.fillStyle = COLORS.aqua;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(
      `${stations[state.stationIndex].code} · ${selectedPoint.height.toFixed(2)} m`,
      labelX,
      labelY,
    );

    const rotated = this.width < 760;
    stations.forEach((station, stationIndex) => {
      const x = xFor(stationIndex);
      const selected = stationIndex === state.stationIndex;
      ctx.save();
      if (rotated) {
        ctx.translate(x + 7, plot.top + plot.height + 14);
        ctx.rotate(-Math.PI / 3.6);
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
      } else {
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
      }
      setFont(ctx, this.width < 620 ? 8 : 10, selected ? 600 : 400);
      ctx.fillStyle = selected ? COLORS.aqua : COLORS.muted;
      ctx.fillText(station.name, rotated ? 0 : x, rotated ? 0 : plot.top + plot.height + 13);
      setFont(ctx, 8, 500, true);
      ctx.fillStyle = selected ? COLORS.aqua : COLORS.faint;
      ctx.fillText(station.code, rotated ? 0 : x, rotated ? 10 : plot.top + plot.height + 29);
      ctx.restore();
    });

    const hover = state.hover;
    if (hover && !options.exportMode) {
      const point = points[hover.stationIndex];
      ctx.strokeStyle = "rgba(112, 224, 210, 0.25)";
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(point.x + 0.5, plot.top);
      ctx.lineTo(point.x + 0.5, baseY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = tideColor(point.height);
      ctx.beginPath();
      ctx.arc(point.x, point.y, 6.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#effffb";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    this.drawAxisText("潮高 / m", plot.left, plot.top - 30, "left", COLORS.faint, 8);
    this.drawAxisText(
      `PROFILE AT / ${formatTime(state.cursorIndex)}`,
      plot.left,
      plot.top - 16,
      "left",
      COLORS.aqua,
      9,
    );
    this.drawAxisText(
      `HIGHLIGHTED STATION / ${stations[state.stationIndex].name}`,
      plot.left + plot.width,
      plot.top - 16,
      "right",
      COLORS.faint,
      8,
    );
  }

  drawExportFurniture(state) {
    const { ctx, width, height } = this;
    const titles = {
      heatmap: "HOURLY TIDE HEATMAP / 一周逐小时潮位热图",
      line: "TIDE SERIES / 站点潮位折线",
      profile: "STATION PROFILE / 站点剖面",
    };
    setFont(ctx, 15, 600);
    ctx.fillStyle = "#edf7f7";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(titles[state.view], 32, 30);

    setFont(ctx, 9, 400, true);
    ctx.fillStyle = COLORS.muted;
    ctx.textAlign = "right";
    ctx.fillText(
      `${formatTime(state.startIndex)} — ${formatTime(state.endIndex)}  ·  ${stations[state.stationIndex].name}  ·  UTC+8`,
      width - 32,
      31,
    );

    const y = height - 36;
    setFont(ctx, 8, 500, true);
    ctx.textAlign = "left";
    ctx.fillStyle = COLORS.faint;
    ctx.fillText("常规潮位", 32, y);
    const normalGradient = ctx.createLinearGradient(98, y, 238, y);
    normalGradient.addColorStop(0, "#082b43");
    normalGradient.addColorStop(0.5, "#147f8d");
    normalGradient.addColorStop(1, "#e3dfa8");
    ctx.fillStyle = normalGradient;
    ctx.fillRect(98, y - 3, 140, 6);
    ctx.fillStyle = COLORS.muted;
    ctx.fillText("0.30 — 2.70 m", 248, y);

    ctx.fillStyle = COLORS.alert;
    ctx.fillText("异常高水位", 382, y);
    const alertGradient = ctx.createLinearGradient(468, y, 568, y);
    alertGradient.addColorStop(0, "#ff9a62");
    alertGradient.addColorStop(1, "#d72c55");
    ctx.fillStyle = alertGradient;
    ctx.fillRect(468, y - 3, 100, 6);
    ctx.fillStyle = COLORS.muted;
    ctx.fillText("≥ 2.70 m", 578, y);

    ctx.textAlign = "right";
    ctx.fillStyle = COLORS.faint;
    ctx.fillText("SYNTHETIC DEMO DATA · TIDELENS", width - 32, y);
  }

  hitTest(x, y, state) {
    const geometry = this.geometry;
    if (!geometry) return null;
    const { plot } = geometry;
    if (
      x < plot.left ||
      x > plot.left + plot.width ||
      y < plot.top ||
      y > plot.top + plot.height
    ) {
      return null;
    }

    if (geometry.kind === "heatmap") {
      const hourOffset = Math.floor(((x - plot.left) / plot.width) * geometry.count);
      const hourIndex = clamp(state.startIndex + hourOffset, state.startIndex, state.endIndex);
      const stationIndex = clamp(
        Math.floor(((y - plot.top) / plot.height) * stations.length),
        0,
        stations.length - 1,
      );
      return { hourIndex, stationIndex };
    }

    if (geometry.kind === "line") {
      const ratio = clamp((x - plot.left) / plot.width, 0, 1);
      const hourIndex = clamp(
        state.startIndex + Math.round(ratio * (geometry.count - 1)),
        state.startIndex,
        state.endIndex,
      );
      return { hourIndex, stationIndex: state.stationIndex };
    }

    const stationIndex = clamp(
      Math.floor(((x - plot.left) / plot.width) * stations.length),
      0,
      stations.length - 1,
    );
    return { hourIndex: state.cursorIndex, stationIndex };
  }
}
