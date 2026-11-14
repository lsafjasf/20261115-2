(() => {
  "use strict";

  const WORLD = { width: 1000, height: 620, metersPerPixel: 0.5 };
  const THRESHOLDS = { day: 70, night: 55 };
  const PERIOD_NAMES = { day: "昼间", night: "夜间" };

  const SAMPLES = [
    { id: "W01", name: "东纬路北口", x: 128, y: 110, day: 68.4, night: 54.8 },
    { id: "W02", name: "榆林道街角", x: 258, y: 100, day: 72.6, night: 58.9 },
    { id: "W03", name: "梧桐里东门", x: 360, y: 92, day: 65.2, night: 51.2 },
    { id: "W04", name: "社区公园南", x: 460, y: 125, day: 61.3, night: 47.6 },
    { id: "W05", name: "榆林道中段", x: 610, y: 98, day: 69.5, night: 55.6 },
    { id: "W06", name: "地铁梧桐里", x: 758, y: 105, day: 74.8, night: 61.2 },
    { id: "W07", name: "东纬路东口", x: 882, y: 120, day: 66.9, night: 53.2 },
    { id: "W08", name: "槐安弄北段", x: 125, y: 232, day: 61.8, night: 48.6 },
    { id: "W09", name: "梧桐路西口", x: 258, y: 220, day: 67.4, night: 55.8 },
    { id: "W10", name: "梧桐路中段", x: 388, y: 245, day: 58.9, night: 46.7 },
    { id: "W11", name: "社区中心", x: 520, y: 225, day: 64.1, night: 52.4 },
    { id: "W12", name: "榆林道南口", x: 648, y: 255, day: 71.2, night: 57.4 },
    { id: "W13", name: "梧桐里广场", x: 785, y: 233, day: 60.3, night: 48.9 },
    { id: "W14", name: "东纬路南段", x: 884, y: 230, day: 70.8, night: 56.7 },
    { id: "W15", name: "滨水步道北", x: 122, y: 367, day: 59.7, night: 47.2 },
    { id: "W16", name: "槐安弄南口", x: 252, y: 380, day: 66.5, night: 53.9 },
    { id: "W17", name: "梧桐公园西门", x: 365, y: 350, day: 62.4, night: 50.8 },
    { id: "W18", name: "梧桐路南口", x: 500, y: 372, day: 68.9, night: 56.1 },
    { id: "W19", name: "社区小学东", x: 622, y: 405, day: 65.1, night: 51.7 },
    { id: "W20", name: "榆林道市场", x: 755, y: 365, day: 73.7, night: 59.8 },
    { id: "W21", name: "东纬路南口", x: 880, y: 390, day: 64.8, night: 50.6 },
    { id: "W22", name: "滨水步道中", x: 145, y: 515, day: 67.2, night: 54.3 },
    { id: "W23", name: "梧桐公园东门", x: 330, y: 525, day: 61.1, night: 49.2 },
    { id: "W24", name: "梧桐路南段", x: 452, y: 532, day: 70.2, night: 55.9 },
    { id: "W25", name: "滨水步道南", x: 612, y: 528, day: 58.6, night: 47.1 },
    { id: "W26", name: "东纬路立交", x: 770, y: 518, day: 69.8, night: 56.8 },
  ];

  const LEVELS = [
    { key: "quiet", label: "舒适", description: "低于标准 10 dB 以上", color: "#527fb6", rgb: [82, 127, 182] },
    { key: "good", label: "良好", description: "低于标准 5–10 dB", color: "#4ba79e", rgb: [75, 167, 158] },
    { key: "near", label: "临界", description: "低于标准 5 dB 以内", color: "#a0bd68", rgb: [160, 189, 104] },
    { key: "slight", label: "轻度超标", description: "高于标准 0–5 dB", color: "#ddb348", rgb: [221, 179, 72] },
    { key: "high", label: "明显超标", description: "高于标准 5 dB 以上", color: "#d76144", rgb: [215, 97, 68] },
  ];

  const H_ROADS = [
    { y: 112, label: "东纬路", main: true },
    { y: 240, label: "梧桐路", main: true },
    { y: 382, label: "榆林道", main: false },
    { y: 525, label: "滨河路", main: false },
  ];

  const V_ROADS = [
    { x: 120, label: "槐安弄", main: false },
    { x: 255, label: "梧桐里", main: true },
    { x: 375, label: "福安巷", main: false },
    { x: 505, label: "社区路", main: true },
    { x: 635, label: "榆林巷", main: false },
    { x: 765, label: "公园路", main: true },
    { x: 888, label: "东纬支路", main: false },
  ];

  const BLOCKS = [
    { x: 30, y: 32, w: 78, h: 66, tone: "warm" },
    { x: 136, y: 32, w: 105, h: 66, tone: "light" },
    { x: 270, y: 32, w: 90, h: 66, tone: "warm" },
    { x: 390, y: 32, w: 100, h: 66, tone: "light" },
    { x: 520, y: 32, w: 100, h: 66, tone: "warm" },
    { x: 650, y: 32, w: 100, h: 66, tone: "light" },
    { x: 780, y: 32, w: 94, h: 66, tone: "warm" },
    { x: 30, y: 130, w: 76, h: 94, tone: "light" },
    { x: 136, y: 130, w: 105, h: 94, tone: "warm" },
    { x: 270, y: 130, w: 90, h: 94, tone: "light" },
    { x: 390, y: 130, w: 100, h: 94, tone: "warm" },
    { x: 520, y: 130, w: 100, h: 94, tone: "light" },
    { x: 650, y: 130, w: 100, h: 94, tone: "warm" },
    { x: 780, y: 130, w: 94, h: 94, tone: "light" },
    { x: 30, y: 258, w: 76, h: 104, tone: "warm" },
    { x: 390, y: 258, w: 100, h: 104, tone: "park" },
    { x: 520, y: 258, w: 100, h: 104, tone: "civic" },
    { x: 650, y: 258, w: 0, h: 0, tone: "light" },
    { x: 780, y: 258, w: 94, h: 104, tone: "park" },
    { x: 30, y: 400, w: 76, h: 104, tone: "light" },
    { x: 136, y: 400, w: 105, h: 104, tone: "warm" },
    { x: 270, y: 400, w: 90, h: 104, tone: "park" },
    { x: 390, y: 400, w: 100, h: 104, tone: "light" },
    { x: 520, y: 400, w: 100, h: 104, tone: "warm" },
    { x: 650, y: 400, w: 100, h: 104, tone: "light" },
    { x: 780, y: 400, w: 94, h: 104, tone: "warm" },
  ].filter((block) => block.w > 0);

  const state = {
    period: "day",
    filter: "all",
    selection: null,
    hoverId: null,
    dragging: null,
  };

  const dom = {
    canvas: document.querySelector("#noise-map"),
    canvasWrap: document.querySelector("#canvas-wrap"),
    tooltip: document.querySelector("#map-tooltip"),
    hint: document.querySelector("#canvas-hint"),
    clearButton: document.querySelector("#clear-selection"),
    modeBadge: document.querySelector("#map-mode-badge"),
    thresholdValue: document.querySelector("#threshold-value"),
    thresholdTag: document.querySelector("#threshold-tag"),
    selectionState: document.querySelector("#selection-state"),
    selectionAverage: document.querySelector("#selection-average"),
    selectionUnit: document.querySelector("#selection-unit"),
    selectionCaption: document.querySelector("#selection-caption"),
    selectionCount: document.querySelector("#selection-count"),
    selectionPosition: document.querySelector("#selection-position"),
    selectionOver: document.querySelector("#selection-over"),
    selectionArea: document.querySelector("#selection-area"),
    overallAverage: document.querySelector("#overall-average"),
    overallMax: document.querySelector("#overall-max"),
    legendList: document.querySelector("#legend-list"),
    legendTotal: document.querySelector("#legend-total"),
    legendSubtitle: document.querySelector("#legend-subtitle"),
    visiblePointLabel: document.querySelector("#visible-point-label"),
    headSampleCount: document.querySelector("#head-sample-count"),
    filterCounts: {
      all: document.querySelector("#filter-count-all"),
      over: document.querySelector("#filter-count-over"),
      safe: document.querySelector("#filter-count-safe"),
    },
    periodButtons: [...document.querySelectorAll(".period-btn")],
    filterButtons: [...document.querySelectorAll(".filter-btn")],
  };

  const ctx = dom.canvas.getContext("2d");
  const heatCanvas = document.createElement("canvas");
  const heatCtx = heatCanvas.getContext("2d");
  const view = { width: 0, height: 0, dpr: 1 };
  let heatDirty = true;

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const average = (items) => items.reduce((sum, item) => sum + item, 0) / items.length;
  const currentThreshold = () => THRESHOLDS[state.period];
  const sampleValue = (sample) => sample[state.period];
  const isOver = (sample) => sampleValue(sample) > currentThreshold();
  const byId = new Map(SAMPLES.map((sample) => [sample.id, sample]));

  function levelFor(value) {
    const delta = value - currentThreshold();
    if (delta <= -10) return LEVELS[0];
    if (delta <= -5) return LEVELS[1];
    if (delta < 0) return LEVELS[2];
    if (delta <= 5) return LEVELS[3];
    return LEVELS[4];
  }

  function filteredSamples() {
    if (state.filter === "over") return SAMPLES.filter(isOver);
    if (state.filter === "safe") return SAMPLES.filter((sample) => !isOver(sample));
    return SAMPLES;
  }

  function pointsInSelection() {
    if (!state.selection) return [];
    const { x1, y1, x2, y2 } = state.selection;
    return filteredSamples().filter(
      (sample) => sample.x >= x1 && sample.x <= x2 && sample.y >= y1 && sample.y <= y2,
    );
  }

  function formatArea(squareMeters) {
    if (squareMeters >= 10000) return `${(squareMeters / 10000).toFixed(1)} 万m²`;
    return `${Math.round(squareMeters).toLocaleString("zh-CN")} m²`;
  }

  function colorWithAlpha(rgb, alpha) {
    return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
  }

  function roundedRect(context, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    context.beginPath();
    context.roundRect(x, y, width, height, r);
    context.closePath();
  }

  function drawBaseMap() {
    ctx.fillStyle = "#e8e6dd";
    ctx.fillRect(0, 0, WORLD.width, WORLD.height);

    const landGradient = ctx.createLinearGradient(0, 0, WORLD.width, WORLD.height);
    landGradient.addColorStop(0, "rgba(255, 255, 255, 0.16)");
    landGradient.addColorStop(0.55, "rgba(255, 255, 255, 0)");
    landGradient.addColorStop(1, "rgba(83, 109, 94, 0.07)");
    ctx.fillStyle = landGradient;
    ctx.fillRect(0, 0, WORLD.width, 555);

    BLOCKS.forEach((block) => {
      const fills = {
        warm: "#dedbd0",
        light: "#e5e2d8",
        park: "#d2deca",
        civic: "#e1d8ca",
      };
      roundedRect(ctx, block.x, block.y, block.w, block.h, 9);
      ctx.fillStyle = fills[block.tone];
      ctx.fill();
      ctx.strokeStyle = "rgba(112, 119, 108, 0.2)";
      ctx.lineWidth = 1;
      ctx.stroke();

      if (block.tone === "park") {
        drawPark(block);
      } else if (block.tone === "civic") {
        drawCivicBlock(block);
      } else {
        drawBuildingHints(block);
      }
    });

    const water = ctx.createLinearGradient(0, 548, 0, WORLD.height);
    water.addColorStop(0, "#cbdadc");
    water.addColorStop(1, "#bdcdd1");
    ctx.fillStyle = water;
    ctx.fillRect(0, 550, WORLD.width, WORLD.height - 550);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.42)";
    ctx.lineWidth = 1.2;
    for (let y = 566; y < 612; y += 15) {
      ctx.beginPath();
      for (let x = 12; x < WORLD.width; x += 26) {
        ctx.moveTo(x, y);
        ctx.bezierCurveTo(x + 6, y - 2, x + 13, y + 2, x + 20, y);
      }
      ctx.stroke();
    }
  }

  function drawBuildingHints(block) {
    const inset = 12;
    const count = block.w > 92 ? 2 : 1;
    const gap = 8;
    const buildingWidth = (block.w - inset * 2 - gap * (count - 1)) / count;
    for (let index = 0; index < count; index += 1) {
      const x = block.x + inset + index * (buildingWidth + gap);
      const y = block.y + 13;
      roundedRect(ctx, x, y, buildingWidth, block.h - 26, 4);
      ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
      ctx.fill();
      ctx.strokeStyle = "rgba(113, 118, 108, 0.14)";
      ctx.lineWidth = 0.8;
      ctx.stroke();

      ctx.strokeStyle = "rgba(113, 118, 108, 0.14)";
      for (let lineY = y + 13; lineY < y + block.h - 31; lineY += 12) {
        ctx.beginPath();
        ctx.moveTo(x + 5, lineY);
        ctx.lineTo(x + buildingWidth - 5, lineY);
        ctx.stroke();
      }
    }
  }

  function drawPark(block) {
    ctx.fillStyle = "rgba(78, 125, 83, 0.12)";
    roundedRect(ctx, block.x + 6, block.y + 6, block.w - 12, block.h - 12, 6);
    ctx.fill();

    const treeSpots = [
      [0.22, 0.24],
      [0.61, 0.19],
      [0.46, 0.51],
      [0.78, 0.45],
      [0.28, 0.74],
      [0.66, 0.79],
    ];
    treeSpots.forEach(([px, py], index) => {
      const x = block.x + block.w * px;
      const y = block.y + block.h * py;
      const radius = 6 + (index % 3) * 1.8;
      ctx.beginPath();
      ctx.arc(x, y, radius + 2.5, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255, 255, 255, 0.24)";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fillStyle = index % 2 ? "rgba(73, 124, 83, 0.42)" : "rgba(86, 134, 88, 0.34)";
      ctx.fill();
    });

    ctx.fillStyle = "rgba(54, 94, 65, 0.7)";
    ctx.font = '600 9px "Soundscape Sans", "PingFang SC", sans-serif';
    ctx.textAlign = "center";
    ctx.fillText("梧 桐 公 园", block.x + block.w / 2, block.y + block.h / 2 + 17);
  }

  function drawCivicBlock(block) {
    roundedRect(ctx, block.x + 20, block.y + 21, block.w - 40, 42, 5);
    ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
    ctx.fill();
    ctx.strokeStyle = "rgba(113, 108, 96, 0.2)";
    ctx.stroke();
    ctx.fillStyle = "rgba(67, 74, 68, 0.68)";
    ctx.font = '600 8px "Soundscape Sans", "PingFang SC", sans-serif';
    ctx.textAlign = "center";
    ctx.fillText("社区文化活动中心", block.x + block.w / 2, block.y + 47);
  }

  function drawRoads() {
    const roads = [
      ...H_ROADS.map((road) => ({ ...road, direction: "h" })),
      ...V_ROADS.map((road) => ({ ...road, direction: "v" })),
    ];

    roads.forEach((road) => {
      const width = road.main ? 22 : 17;
      ctx.beginPath();
      if (road.direction === "h") {
        ctx.moveTo(0, road.y);
        ctx.lineTo(WORLD.width, road.y);
      } else {
        ctx.moveTo(road.x, 0);
        ctx.lineTo(road.x, 550);
      }
      ctx.strokeStyle = "rgba(128, 128, 118, 0.24)";
      ctx.lineWidth = width + 7;
      ctx.stroke();

      ctx.beginPath();
      if (road.direction === "h") {
        ctx.moveTo(0, road.y);
        ctx.lineTo(WORLD.width, road.y);
      } else {
        ctx.moveTo(road.x, 0);
        ctx.lineTo(road.x, 550);
      }
      ctx.strokeStyle = "#f8f6ef";
      ctx.lineWidth = width;
      ctx.stroke();
    });

    roads.forEach((road) => {
      if (!road.main) return;
      ctx.beginPath();
      if (road.direction === "h") {
        ctx.moveTo(0, road.y);
        ctx.lineTo(WORLD.width, road.y);
      } else {
        ctx.moveTo(road.x, 0);
        ctx.lineTo(road.x, 550);
      }
      ctx.setLineDash([13, 10]);
      ctx.strokeStyle = "rgba(161, 153, 131, 0.34)";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.setLineDash([]);
    });

    drawStreetLabels();
  }

  function drawStreetLabels() {
    ctx.font = '500 9px "Soundscape Sans", "PingFang SC", sans-serif';
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    const labels = [
      { text: "东 纬 路", x: 542, y: 111, rotation: 0 },
      { text: "梧 桐 路", x: 688, y: 239, rotation: 0 },
      { text: "榆 林 道", x: 304, y: 381, rotation: 0 },
      { text: "滨 河 路", x: 476, y: 524, rotation: 0 },
      { text: "槐 安 弄", x: 121, y: 456, rotation: -Math.PI / 2 },
      { text: "梧 桐 里", x: 256, y: 185, rotation: -Math.PI / 2 },
      { text: "福 安 巷", x: 376, y: 316, rotation: -Math.PI / 2 },
      { text: "社 区 路", x: 506, y: 185, rotation: -Math.PI / 2 },
      { text: "榆 林 巷", x: 636, y: 322, rotation: -Math.PI / 2 },
      { text: "公 园 路", x: 766, y: 185, rotation: -Math.PI / 2 },
      { text: "东 纬 支 路", x: 889, y: 470, rotation: -Math.PI / 2 },
    ];

    labels.forEach((label) => {
      ctx.save();
      ctx.translate(label.x, label.y);
      ctx.rotate(label.rotation);
      ctx.fillStyle = "rgba(81, 87, 80, 0.72)";
      ctx.fillText(label.text, 0, -9);
      ctx.restore();
    });
  }

  function buildHeatmap() {
    const samples = filteredSamples();
    const width = 168;
    const height = 104;
    heatCanvas.width = width;
    heatCanvas.height = height;

    if (!samples.length) {
      heatCtx.clearRect(0, 0, width, height);
      heatDirty = false;
      return;
    }

    const image = heatCtx.createImageData(width, height);
    const pixels = image.data;
    const levelPixels = LEVELS.map((level) => [...level.rgb, 150]);

    for (let row = 0; row < height; row += 1) {
      for (let column = 0; column < width; column += 1) {
        const x = ((column + 0.5) / width) * WORLD.width;
        const y = ((row + 0.5) / height) * WORLD.height;
        let weightedValue = 0;
        let weightTotal = 0;

        for (const sample of samples) {
          const dx = x - sample.x;
          const dy = y - sample.y;
          const distanceSquared = dx * dx + dy * dy;
          const weight = 1 / (distanceSquared + 900);
          weightedValue += sampleValue(sample) * weight;
          weightTotal += weight;
        }

        const value = weightedValue / weightTotal;
        const levelIndex = Math.max(0, LEVELS.indexOf(levelFor(value)));
        const rgba = levelPixels[levelIndex];
        const pixelIndex = (row * width + column) * 4;
        pixels[pixelIndex] = rgba[0];
        pixels[pixelIndex + 1] = rgba[1];
        pixels[pixelIndex + 2] = rgba[2];
        pixels[pixelIndex + 3] = rgba[3];
      }
    }

    heatCtx.putImageData(image, 0, 0);
    heatDirty = false;
  }

  function drawHeatmap() {
    if (heatDirty) buildHeatmap();
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, WORLD.width, 549);
    ctx.clip();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(heatCanvas, 0, 0, WORLD.width, WORLD.height);
    ctx.restore();
  }

  function drawMapAnnotations() {
    ctx.save();
    ctx.strokeStyle = "rgba(61, 105, 83, 0.38)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 5]);
    roundedRect(ctx, 16, 16, 968, 537, 11);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = "rgba(45, 54, 49, 0.56)";
    ctx.font = '500 8px "Soundscape Sans", "PingFang SC", sans-serif';
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText("梧桐街区 · 社区声环境采样范围", 31, 38);

    drawSubwayMark(758, 105);

    ctx.fillStyle = "rgba(68, 92, 81, 0.57)";
    ctx.font = 'italic 8px Georgia, serif';
    ctx.textAlign = "left";
    ctx.fillText("滨 河 生 态 廊 道", 408, 580);

    ctx.save();
    ctx.translate(950, 54);
    ctx.strokeStyle = "rgba(44, 54, 48, 0.52)";
    ctx.fillStyle = "rgba(44, 54, 48, 0.66)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, -14);
    ctx.lineTo(5, 4);
    ctx.lineTo(0, 0);
    ctx.lineTo(-5, 4);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, 0, 11, 0, Math.PI * 2);
    ctx.stroke();
    ctx.font = '600 7px Georgia, serif';
    ctx.textAlign = "center";
    ctx.fillText("N", 0, -16);
    ctx.restore();

    drawScale();
    ctx.restore();
  }

  function drawSubwayMark(x, y) {
    const markerX = x + 48;
    const markerY = y + 26;
    ctx.save();
    ctx.translate(markerX, markerY);
    ctx.fillStyle = "rgba(43, 91, 116, 0.9)";
    roundedRect(ctx, -22, -8, 44, 16, 8);
    ctx.fill();
    ctx.fillStyle = "#f8f6ef";
    ctx.font = '600 7px "Soundscape Sans", "PingFang SC", sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("地铁 · 梧桐里", 0, 0.5);
    ctx.restore();
  }

  function drawScale() {
    const x = 32;
    const y = 585;
    const barWidth = 200;
    ctx.save();
    roundedRect(ctx, x - 9, y - 23, barWidth + 18, 40, 6);
    ctx.fillStyle = "rgba(249, 247, 241, 0.78)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.48)";
    ctx.stroke();

    ctx.strokeStyle = "rgba(36, 47, 41, 0.74)";
    ctx.fillStyle = "rgba(36, 47, 41, 0.74)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + barWidth, y);
    ctx.moveTo(x, y - 4);
    ctx.lineTo(x, y + 4);
    ctx.moveTo(x + barWidth / 2, y - 3);
    ctx.lineTo(x + barWidth / 2, y + 3);
    ctx.moveTo(x + barWidth, y - 4);
    ctx.lineTo(x + barWidth, y + 4);
    ctx.stroke();

    ctx.font = '500 7px "Soundscape Sans", "PingFang SC", sans-serif';
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText("0", x - 1, y + 13);
    ctx.textAlign = "center";
    ctx.fillText("50", x + barWidth / 2, y + 13);
    ctx.textAlign = "right";
    ctx.fillText("100 m", x + barWidth + 1, y + 13);
    ctx.restore();
  }

  function drawSelection() {
    if (!state.selection) return;
    const { x1, y1, x2, y2 } = state.selection;
    const width = x2 - x1;
    const height = y2 - y1;

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, WORLD.width, WORLD.height);
    ctx.rect(x1, y1, width, height);
    ctx.fillStyle = "rgba(19, 29, 24, 0.17)";
    ctx.fill("evenodd");

    ctx.fillStyle = "rgba(255, 255, 255, 0.075)";
    ctx.fillRect(x1, y1, width, height);
    ctx.strokeStyle = "rgba(250, 248, 241, 0.98)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([7, 5]);
    ctx.strokeRect(x1 + 0.75, y1 + 0.75, width - 1.5, height - 1.5);
    ctx.setLineDash([]);

    const cornerSize = 7;
    [
      [x1, y1],
      [x2, y1],
      [x1, y2],
      [x2, y2],
    ].forEach(([x, y]) => {
      ctx.fillStyle = "#fbf8ef";
      ctx.fillRect(x - cornerSize / 2, y - cornerSize / 2, cornerSize, cornerSize);
      ctx.strokeStyle = "rgba(35, 45, 40, 0.82)";
      ctx.lineWidth = 1;
      ctx.strokeRect(x - cornerSize / 2, y - cornerSize / 2, cornerSize, cornerSize);
    });

    ctx.fillStyle = "rgba(29, 39, 34, 0.88)";
    roundedRect(ctx, x1, Math.max(24, y1 - 23), 112, 18, 5);
    ctx.fill();
    ctx.fillStyle = "#f9f7f1";
    ctx.font = '500 8px "Soundscape Sans", "PingFang SC", sans-serif';
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(
      `${Math.round(width * WORLD.metersPerPixel)} × ${Math.round(height * WORLD.metersPerPixel)} m`,
      x1 + 8,
      Math.max(33, y1 - 14),
    );
    ctx.restore();
  }

  function drawMarkers() {
    const samples = filteredSamples();
    const selectionPoints = new Set(pointsInSelection().map((sample) => sample.id));

    samples.forEach((sample) => {
      const over = isOver(sample);
      const level = levelFor(sampleValue(sample));
      const hovered = state.hoverId === sample.id;
      const selected = selectionPoints.has(sample.id);
      const radius = over ? 10 : 4.2;

      if (selected) {
        ctx.beginPath();
        ctx.arc(sample.x, sample.y, radius + 5, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
        ctx.fill();
        ctx.strokeStyle = "rgba(255, 255, 255, 0.94)";
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }

      if (hovered) {
        ctx.beginPath();
        ctx.arc(sample.x, sample.y, radius + 5, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(28, 36, 32, 0.16)";
        ctx.fill();
      }

      ctx.beginPath();
      ctx.arc(sample.x, sample.y, radius + (hovered ? 1 : 0), 0, Math.PI * 2);
      ctx.fillStyle = over ? level.color : "#284b3f";
      ctx.fill();
      ctx.strokeStyle = over ? "rgba(255, 255, 255, 0.94)" : "rgba(255, 255, 255, 0.82)";
      ctx.lineWidth = over ? 1.6 : 1.2;
      ctx.stroke();

      if (over) {
        ctx.fillStyle = "#fffdf6";
        ctx.font = '700 8px "Soundscape Sans", "PingFang SC", sans-serif';
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(sample.id.slice(1), sample.x, sample.y + 0.6);
      }
    });
  }

  function applyCanvasTransform() {
    ctx.setTransform(
      view.width / WORLD.width,
      0,
      0,
      view.height / WORLD.height,
      0,
      0,
    );
  }

  function render() {
    if (!view.width || !view.height) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, view.width, view.height);
    applyCanvasTransform();
    drawBaseMap();
    drawHeatmap();
    drawRoads();
    drawMapAnnotations();
    drawSelection();
    drawMarkers();
  }

  function levelRangeLabel(index) {
    const threshold = currentThreshold();
    if (index === 0) return `< ${threshold - 10}`;
    if (index === 1) return `${threshold - 10}–${threshold - 5}`;
    if (index === 2) return `${threshold - 5}–${threshold}`;
    if (index === 3) return `${threshold}–${threshold + 5}`;
    return `≥ ${threshold + 5}`;
  }

  function renderLegend() {
    const visible = filteredSamples();
    const counts = LEVELS.map(() => 0);
    visible.forEach((sample) => {
      const index = LEVELS.indexOf(levelFor(sampleValue(sample)));
      counts[index] += 1;
    });

    dom.legendList.innerHTML = LEVELS.map(
      (level, index) => `
        <div class="legend-row">
          <span class="legend-swatch" style="--swatch:${level.color}"></span>
          <span class="legend-label">${level.label}<small>${levelRangeLabel(index)} dB</small></span>
          <span class="legend-count">${counts[index]}</span>
        </div>
      `,
    ).join("");
    dom.legendTotal.textContent = `${visible.length} 个点位`;
    dom.legendSubtitle.textContent = `${PERIOD_NAMES[state.period]} · 相对 ${currentThreshold()} dB 标准`;
    dom.visiblePointLabel.textContent = `${visible.length} 个点位参与计算`;
  }

  function renderStats() {
    const visible = filteredSamples();
    const threshold = currentThreshold();
    const overallMean = visible.length ? average(visible.map(sampleValue)) : null;
    const max = visible.length ? Math.max(...visible.map(sampleValue)) : null;

    dom.overallAverage.textContent = overallMean === null ? "— dB" : `${overallMean.toFixed(1)} dB`;
    dom.overallMax.textContent = max === null ? "— dB" : `${max.toFixed(1)} dB`;
    const allOver = SAMPLES.filter(isOver).length;
    dom.filterCounts.over.textContent = `${allOver}`;
    dom.filterCounts.safe.textContent = `${SAMPLES.length - allOver}`;
    dom.filterCounts.all.textContent = `${SAMPLES.length}`;

    const inside = pointsInSelection();
    const overInside = inside.filter(isOver).length;
    const selected = state.selection;
    dom.clearButton.disabled = !selected;

    if (!selected) {
      dom.selectionState.textContent = "尚未框选";
      dom.selectionState.classList.remove("has-selection");
      dom.selectionAverage.textContent = "—";
      dom.selectionUnit.textContent = "dB(A)";
      dom.selectionCaption.textContent = "框选区域内全部采样点的算术平均声压";
      dom.selectionCount.textContent = "—";
      dom.selectionPosition.textContent = "等待框选";
      dom.selectionPosition.classList.remove("is-alert");
      dom.selectionOver.textContent = "—";
      dom.selectionOver.classList.remove("is-alert");
      dom.selectionArea.textContent = "—";
      return;
    }

    dom.selectionState.textContent = "已框选";
    dom.selectionState.classList.add("has-selection");
    if (inside.length) {
      const mean = average(inside.map(sampleValue));
      dom.selectionAverage.textContent = mean.toFixed(1);
      dom.selectionUnit.textContent = `dB(A) · ${PERIOD_NAMES[state.period]}标准 ${threshold}`;
      dom.selectionCaption.textContent = `${inside.length} 个采样点的算术平均声压`;
    } else {
      dom.selectionAverage.textContent = "—";
      dom.selectionUnit.textContent = "dB(A)";
      dom.selectionCaption.textContent = "框选范围内没有当前筛选条件下的采样点";
    }

    dom.selectionCount.textContent = `${inside.length}`;
    dom.selectionPosition.textContent = `${inside.length} / ${visible.length} 可见点`;
    dom.selectionOver.textContent = `${overInside}`;
    dom.selectionOver.classList.toggle("is-alert", overInside > 0);
    const area = (selected.x2 - selected.x1) * (selected.y2 - selected.y1) *
      WORLD.metersPerPixel * WORLD.metersPerPixel;
    dom.selectionArea.textContent = formatArea(area);
  }

  function syncControls() {
    dom.periodButtons.forEach((button) => {
      const active = button.dataset.period === state.period;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    dom.filterButtons.forEach((button) => {
      const active = button.dataset.filter === state.filter;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });

    const threshold = currentThreshold();
    dom.modeBadge.textContent = `${PERIOD_NAMES[state.period]} · ${threshold} dB`;
    dom.thresholdValue.textContent = `${threshold} dB(A)`;
    dom.thresholdTag.textContent = `${PERIOD_NAMES[state.period]}二类声环境`;
    document.body.dataset.period = state.period;
  }

  function updateAll({ rebuildHeat = false } = {}) {
    if (rebuildHeat) heatDirty = true;
    syncControls();
    renderLegend();
    renderStats();
    render();
  }

  function hideTooltip() {
    dom.tooltip.hidden = true;
  }

  function showTooltip(sample, clientX, clientY) {
    const value = sampleValue(sample);
    const threshold = currentThreshold();
    const delta = value - threshold;
    const statusClass = delta > 5 ? "high" : delta > 0 ? "over" : "safe";
    const status = delta > 0
      ? `超标准 ${delta.toFixed(1)} dB`
      : `低于标准 ${Math.abs(delta).toFixed(1)} dB`;

    dom.tooltip.innerHTML = `
      <div class="tooltip-head">
        <span class="tooltip-id">${sample.id}</span>
        <strong>${sample.name}</strong>
      </div>
      <div class="tooltip-values">
        <span>昼 <b>${sample.day.toFixed(1)}</b></span>
        <span>夜 <b>${sample.night.toFixed(1)}</b></span>
      </div>
      <div class="tooltip-status ${statusClass}">
        ${PERIOD_NAMES[state.period]} ${value.toFixed(1)} dB · ${status}
      </div>
    `;
    dom.tooltip.hidden = false;

    const wrapRect = dom.canvasWrap.getBoundingClientRect();
    const tooltipRect = dom.tooltip.getBoundingClientRect();
    let left = clientX - wrapRect.left + 15;
    let top = clientY - wrapRect.top - tooltipRect.height - 12;
    if (left + tooltipRect.width > wrapRect.width - 10) {
      left = clientX - wrapRect.left - tooltipRect.width - 15;
    }
    if (top < 10) top = clientY - wrapRect.top + 18;
    dom.tooltip.style.left = `${clamp(left, 8, wrapRect.width - tooltipRect.width - 8)}px`;
    dom.tooltip.style.top = `${clamp(top, 8, wrapRect.height - tooltipRect.height - 8)}px`;
  }

  function eventToWorld(event) {
    const rect = dom.canvas.getBoundingClientRect();
    return {
      x: clamp(((event.clientX - rect.left) / rect.width) * WORLD.width, 0, WORLD.width),
      y: clamp(((event.clientY - rect.top) / rect.height) * WORLD.height, 0, WORLD.height),
    };
  }

  function selectionFromPoints(start, end) {
    return {
      x1: Math.min(start.x, end.x),
      y1: Math.min(start.y, end.y),
      x2: Math.max(start.x, end.x),
      y2: Math.max(start.y, end.y),
    };
  }

  function findHoveredSample(point) {
    let closest = null;
    let closestDistance = 16;
    filteredSamples().forEach((sample) => {
      const distance = Math.hypot(sample.x - point.x, sample.y - point.y);
      if (distance < closestDistance) {
        closest = sample;
        closestDistance = distance;
      }
    });
    return closest;
  }

  function resizeCanvas() {
    const rect = dom.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const pixelWidth = Math.max(1, Math.round(rect.width * dpr));
    const pixelHeight = Math.max(1, Math.round(rect.height * dpr));
    if (pixelWidth === view.width && pixelHeight === view.height) return;
    view.width = pixelWidth;
    view.height = pixelHeight;
    view.dpr = dpr;
    dom.canvas.width = pixelWidth;
    dom.canvas.height = pixelHeight;
    render();
  }

  function handlePointerDown(event) {
    if (event.button !== 0) return;
    event.preventDefault();
    hideTooltip();
    const start = eventToWorld(event);
    state.dragging = {
      pointerId: event.pointerId,
      start,
      current: start,
    };
    state.hoverId = null;
    state.selection = selectionFromPoints(start, start);
    dom.canvas.setPointerCapture(event.pointerId);
    dom.hint.classList.add("is-hidden");
    renderStats();
    render();
  }

  function handlePointerMove(event) {
    const point = eventToWorld(event);
    if (state.dragging) {
      state.dragging.current = point;
      state.selection = selectionFromPoints(state.dragging.start, point);
      renderStats();
      render();
      return;
    }

    const hovered = findHoveredSample(point);
    const nextHoverId = hovered ? hovered.id : null;
    if (nextHoverId !== state.hoverId) {
      state.hoverId = nextHoverId;
      render();
    }
    if (hovered) {
      showTooltip(hovered, event.clientX, event.clientY);
    } else {
      hideTooltip();
    }
  }

  function finishSelection(event) {
    if (!state.dragging) return;
    const selection = state.selection;
    state.dragging = null;
    if (dom.canvas.hasPointerCapture(event.pointerId)) {
      dom.canvas.releasePointerCapture(event.pointerId);
    }

    const width = selection ? selection.x2 - selection.x1 : 0;
    const height = selection ? selection.y2 - selection.y1 : 0;
    if (width < 9 || height < 9) {
      state.selection = null;
      dom.hint.classList.remove("is-hidden");
    }
    dom.hint.classList.toggle("is-hidden", Boolean(state.selection));
    renderStats();
    render();
  }

  function handlePointerLeave() {
    if (state.dragging) return;
    if (state.hoverId) {
      state.hoverId = null;
      render();
    }
    hideTooltip();
  }

  dom.periodButtons.forEach((button) => {
    button.addEventListener("click", () => {
      if (state.period === button.dataset.period) return;
      state.period = button.dataset.period;
      state.hoverId = null;
      hideTooltip();
      updateAll({ rebuildHeat: true });
    });
  });

  dom.filterButtons.forEach((button) => {
    button.addEventListener("click", () => {
      if (state.filter === button.dataset.filter) return;
      state.filter = button.dataset.filter;
      state.hoverId = null;
      hideTooltip();
      updateAll({ rebuildHeat: true });
    });
  });

  dom.clearButton.addEventListener("click", () => {
    state.selection = null;
    state.dragging = null;
    hideTooltip();
    dom.hint.classList.remove("is-hidden");
    renderStats();
    render();
  });

  dom.canvas.addEventListener("pointerdown", handlePointerDown);
  dom.canvas.addEventListener("pointermove", handlePointerMove);
  dom.canvas.addEventListener("pointerup", finishSelection);
  dom.canvas.addEventListener("pointercancel", finishSelection);
  dom.canvas.addEventListener("pointerleave", handlePointerLeave);

  const resizeObserver = new ResizeObserver(() => {
    window.requestAnimationFrame(resizeCanvas);
  });
  resizeObserver.observe(dom.canvasWrap);
  window.addEventListener("resize", resizeCanvas);
  document.fonts?.ready.then(render);

  resizeCanvas();
  updateAll({ rebuildHeat: true });
})();
