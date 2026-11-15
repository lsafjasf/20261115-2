(() => {
  "use strict";

  const WIDTH = 1600;
  const HEIGHT = 900;
  const PAN_LIMIT = 420;
  const CACHE_MARGIN = PAN_LIMIT;
  const CACHE_WIDTH = WIDTH + CACHE_MARGIN * 2;
  const EXPORT_SECONDS = 10;
  const FPS = 30;
  const FONT = '"Noto Sans SC", "Helvetica Neue", "PingFang SC", "Microsoft YaHei", sans-serif';

  const LAYER_DEFS = [
    {
      id: "sky",
      name: "天光",
      en: "SKY",
      role: "BACKDROP",
      color: "#91bac1",
      depth: 5,
      blur: 0,
    },
    {
      id: "far",
      name: "远楼",
      en: "DISTANT",
      role: "LOW",
      color: "#8a9da0",
      depth: 22,
      blur: 4,
    },
    {
      id: "near",
      name: "近楼",
      en: "FOREGROUND",
      role: "MID",
      color: "#c06a4c",
      depth: 56,
      blur: 0.6,
    },
    {
      id: "trees",
      name: "树木",
      en: "CANOPY",
      role: "HIGH",
      color: "#557b4f",
      depth: 82,
      blur: 0.2,
    },
    {
      id: "road",
      name: "路面",
      en: "STREET",
      role: "TOP",
      color: "#555a54",
      depth: 100,
      blur: 1.2,
    },
  ];

  const PALETTES = {
    day: {
      skyTop: "#79a8b6",
      skyMid: "#b6d1cd",
      horizon: "#efd6b9",
      haze: "rgba(244, 222, 197, 0.42)",
      sun: "#fff4cd",
      sunGlow: "rgba(255, 230, 174, 0.38)",
      cloud: "rgba(246, 243, 231, 0.55)",
      cloudShade: "rgba(165, 187, 189, 0.22)",
      star: "rgba(255, 244, 203, 0)",
      farA: "#84979d",
      farB: "#9ba9a9",
      farC: "#74888f",
      farWindow: "rgba(220, 228, 219, 0.44)",
      farHaze: "rgba(236, 222, 200, 0.44)",
      bridge: "#697d82",
      nearA: "#b95f46",
      nearB: "#d18b63",
      nearC: "#8f5142",
      nearShadow: "#743d34",
      nearLight: "#edc98e",
      nearWindow: "#53696b",
      trim: "#ecd2a4",
      awning: "#eee4cc",
      awningAlt: "#cb6147",
      sign: "#272f2d",
      treeDark: "#315844",
      treeMid: "#49734d",
      treeLight: "#719358",
      treeEdge: "#254538",
      trunk: "#5d4b3d",
      trunkLight: "#8c7153",
      road: "#555952",
      roadLight: "#666a62",
      roadDark: "#414640",
      sidewalk: "#aaa496",
      sidewalkLight: "#c2bcad",
      lane: "rgba(239, 228, 200, 0.7)",
      lamp: "#3d4640",
      lampGlow: "rgba(255, 221, 151, 0.08)",
      windowGlow: "rgba(255, 221, 150, 0.04)",
      signGlow: "rgba(239, 102, 62, 0.07)",
      contactShadow: "rgba(39, 42, 34, 0.16)",
      nightVeil: 0,
      lampStrength: 0,
    },
    night: {
      skyTop: "#091426",
      skyMid: "#17263b",
      horizon: "#37435a",
      haze: "rgba(47, 63, 83, 0.25)",
      sun: "#f3dcae",
      sunGlow: "rgba(220, 225, 229, 0.2)",
      cloud: "rgba(110, 129, 147, 0.2)",
      cloudShade: "rgba(8, 18, 32, 0.3)",
      star: "rgba(246, 233, 198, 0.78)",
      farA: "#253042",
      farB: "#2c384a",
      farC: "#1d293a",
      farWindow: "rgba(242, 187, 110, 0.65)",
      farHaze: "rgba(67, 75, 89, 0.2)",
      bridge: "#1a2534",
      nearA: "#633c3b",
      nearB: "#75554c",
      nearC: "#4b3437",
      nearShadow: "#2b242d",
      nearLight: "#96775d",
      nearWindow: "#15242d",
      trim: "#8c7861",
      awning: "#746d61",
      awningAlt: "#794039",
      sign: "#e7c69c",
      treeDark: "#132c2a",
      treeMid: "#1d3b31",
      treeLight: "#315041",
      treeEdge: "#0d2222",
      trunk: "#322b28",
      trunkLight: "#554538",
      road: "#171c1d",
      roadLight: "#23282a",
      roadDark: "#101416",
      sidewalk: "#3b3e3b",
      sidewalkLight: "#4f514b",
      lane: "rgba(188, 168, 127, 0.28)",
      lamp: "#303b39",
      lampGlow: "rgba(255, 201, 117, 0.42)",
      windowGlow: "rgba(255, 201, 117, 0.6)",
      signGlow: "rgba(242, 89, 56, 0.8)",
      contactShadow: "rgba(5, 8, 10, 0.42)",
      nightVeil: 0.08,
      lampStrength: 1,
    },
  };

  const state = {
    mode: "day",
    camera: 0,
    targetCamera: 0,
    dragging: false,
    pointerId: null,
    dragStartX: 0,
    cameraStart: 0,
    hasDragged: false,
    recording: false,
    audioEnabled: false,
    audioContext: null,
    masterGain: null,
    mediaDestination: null,
    ambienceStarted: false,
    lastExportBlob: null,
    lastExportReport: null,
    exportStartedAt: 0,
    layers: LAYER_DEFS.map((layer) => ({ ...layer })),
  };

  const refs = {
    canvas: document.getElementById("streetCanvas"),
    stageFrame: document.getElementById("stageFrame"),
    sceneTag: document.getElementById("sceneTag"),
    cameraReadout: document.getElementById("cameraReadout"),
    parallaxDelta: document.getElementById("parallaxDelta"),
    dragHint: document.getElementById("dragHint"),
    layerList: document.getElementById("layerList"),
    depthNote: document.getElementById("depthNote"),
    resetButton: document.getElementById("resetButton"),
    soundButton: document.getElementById("soundButton"),
    soundLabel: document.getElementById("soundLabel"),
    exportButton: document.getElementById("exportButton"),
    exportOverlay: document.getElementById("exportOverlay"),
    exportProgress: document.getElementById("exportProgress"),
    progressLabel: document.getElementById("progressLabel"),
    toast: document.getElementById("toast"),
  };

  const ctx = refs.canvas.getContext("2d", { alpha: false });
  ctx.imageSmoothingEnabled = true;

  const buffers = new Map(
    state.layers.map((layer) => {
      const canvas = document.createElement("canvas");
      canvas.width = CACHE_WIDTH;
      canvas.height = HEIGHT;
      const blurCanvas = document.createElement("canvas");
      blurCanvas.width = CACHE_WIDTH;
      blurCanvas.height = HEIGHT;
      return [
        layer.id,
        {
          canvas,
          ctx: canvas.getContext("2d"),
          blurCanvas,
          blurCtx: blurCanvas.getContext("2d"),
          cacheMode: null,
          cacheBlur: null,
        },
      ];
    })
  );

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const lerp = (start, end, amount) => start + (end - start) * amount;
  const easeInOut = (value) =>
    value < 0.5
      ? 4 * value * value * value
      : 1 - Math.pow(-2 * value + 2, 3) / 2;
  const wrap = (value, period) => ((value % period) + period) % period;

  function layerById(id) {
    return state.layers.find((layer) => layer.id === id);
  }

  function palette() {
    return PALETTES[state.mode];
  }

  function offsetFor(layer, camera = state.camera) {
    return -camera * (layer.depth / 100);
  }

  function currentOffsets(camera = state.camera) {
    return Object.fromEntries(
      state.layers.map((layer) => [layer.id, offsetFor(layer, camera)])
    );
  }

  function roundedRect(context, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    context.beginPath();
    context.moveTo(x + r, y);
    context.lineTo(x + width - r, y);
    context.quadraticCurveTo(x + width, y, x + width, y + r);
    context.lineTo(x + width, y + height - r);
    context.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    context.lineTo(x + r, y + height);
    context.quadraticCurveTo(x, y + height, x, y + height - r);
    context.lineTo(x, y + r);
    context.quadraticCurveTo(x, y, x + r, y);
    context.closePath();
  }

  function showToast(message, duration = 3200) {
    refs.toast.textContent = message;
    refs.toast.classList.add("is-visible");
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => {
      refs.toast.classList.remove("is-visible");
    }, duration);
  }

  function updateRangeFill(input) {
    const min = Number(input.min || 0);
    const max = Number(input.max || 100);
    const value = Number(input.value);
    const fill = ((value - min) / (max - min)) * 100;
    input.style.setProperty("--fill", `${fill}%`);
  }

  function buildLayerControls() {
    refs.layerList.innerHTML = "";

    state.layers.forEach((layer, index) => {
      const row = document.createElement("article");
      row.className = "layer-row";
      row.dataset.layer = layer.id;
      row.style.setProperty("--layer-color", layer.color);

      row.innerHTML = `
        <div class="layer-head">
          <span class="layer-index">0${index + 1}</span>
          <span class="layer-swatch" aria-hidden="true"></span>
          <span class="layer-title">
            <strong>${layer.name}</strong>
            <small>${layer.en}</small>
          </span>
          <span class="layer-role">${layer.role}</span>
        </div>
        <div class="layer-controls">
          <label class="control-group">
            <span class="control-label">深度 <output data-output="depth">${layer.depth}</output></span>
            <input type="range" min="0" max="100" step="1" value="${layer.depth}"
              data-control="depth" aria-label="${layer.name}深度" />
          </label>
          <label class="control-group">
            <span class="control-label">模糊 <output data-output="blur">${layer.blur.toFixed(1)} px</output></span>
            <input type="range" min="0" max="14" step="0.2" value="${layer.blur}"
              data-control="blur" aria-label="${layer.name}模糊" />
          </label>
        </div>
      `;

      const depthInput = row.querySelector('[data-control="depth"]');
      const blurInput = row.querySelector('[data-control="blur"]');
      const depthOutput = row.querySelector('[data-output="depth"]');
      const blurOutput = row.querySelector('[data-output="blur"]');

      updateRangeFill(depthInput);
      updateRangeFill(blurInput);

      depthInput.addEventListener("input", () => {
        if (state.recording) return;
        layer.depth = Number(depthInput.value);
        depthOutput.value = layer.depth;
        depthOutput.textContent = layer.depth;
        updateRangeFill(depthInput);
        updateDepthNote();
        draw();
      });

      blurInput.addEventListener("input", () => {
        if (state.recording) return;
        layer.blur = Number(blurInput.value);
        blurOutput.value = layer.blur.toFixed(1);
        blurOutput.textContent = `${layer.blur.toFixed(1)} px`;
        updateRangeFill(blurInput);
        draw();
      });

      refs.layerList.appendChild(row);
    });
  }

  function updateDepthNote() {
    const lowest = [...state.layers].sort((a, b) => a.depth - b.depth)[0];
    const highest = [...state.layers].sort((a, b) => b.depth - a.depth)[0];
    refs.depthNote.textContent =
      `${lowest.name}深度最低，移动幅度最小；${highest.name}深度最高，移动幅度最大。拖动画面即可观察位移差异。`;
  }

  function updateReadouts() {
    const panNormalized = state.camera / PAN_LIMIT;
    const sign = panNormalized >= 0 ? "+" : "";
    refs.cameraReadout.textContent = `${sign}${panNormalized.toFixed(2)}`;

    const far = layerById("far");
    const near = layerById("near");
    const delta = Math.abs(offsetFor(far) - offsetFor(near));
    refs.parallaxDelta.textContent = `Δ ${Math.round(delta)} px`;
    refs.sceneTag.textContent =
      state.mode === "day" ? "DAY / 14:32" : "NIGHT / 22:08";
  }

  function draw() {
    paintStreet(ctx, state.mode, state.camera, state.layers);
    updateReadouts();
  }

  function paintSkyBase(context, p) {
    const gradient = context.createLinearGradient(0, 0, 0, HEIGHT * 0.76);
    gradient.addColorStop(0, p.skyTop);
    gradient.addColorStop(0.52, p.skyMid);
    gradient.addColorStop(0.82, p.horizon);
    gradient.addColorStop(1, p.haze);
    context.fillStyle = gradient;
    context.fillRect(0, 0, WIDTH, HEIGHT);
  }

  function drawCloud(context, x, y, scale, p) {
    context.save();
    context.translate(x, y);
    context.scale(scale, scale);

    context.fillStyle = p.cloudShade;
    context.beginPath();
    context.ellipse(-86, 14, 112, 27, 0, 0, Math.PI * 2);
    context.ellipse(48, 17, 130, 31, 0, 0, Math.PI * 2);
    context.fill();

    context.fillStyle = p.cloud;
    context.beginPath();
    context.ellipse(-90, -2, 79, 34, -0.1, 0, Math.PI * 2);
    context.ellipse(6, -10, 96, 49, 0.08, 0, Math.PI * 2);
    context.ellipse(91, 6, 73, 31, 0.13, 0, Math.PI * 2);
    context.ellipse(142, 15, 47, 23, 0.16, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  function drawStars(context, shiftX) {
    const p = palette();
    if (state.mode === "night") {
      const stars = [
        [74, 78, 2.2], [139, 153, 1.2], [248, 54, 1.5], [322, 198, 1],
        [416, 107, 1.8], [502, 34, 1.1], [613, 172, 1.4], [704, 77, 1],
        [792, 232, 1.6], [885, 119, 1.2], [968, 42, 2.1], [1035, 186, 1],
        [1108, 89, 1.5], [1214, 41, 1], [1294, 169, 2], [1381, 96, 1.2],
        [1466, 208, 1.4], [1548, 58, 1.1], [287, 282, 1.1], [559, 258, 1],
      ];
      context.save();
      context.translate(shiftX * 0.25, 0);
      stars.forEach(([x, y, radius], index) => {
        context.fillStyle = index % 4 === 0 ? p.star : `rgba(246, 233, 198, ${0.38 + (index % 3) * 0.13})`;
        context.beginPath();
        context.arc(x, y, radius, 0, Math.PI * 2);
        context.fill();
      });
      context.restore();
    }
  }

  function paintSky(layerCtx, p, shift = offsetFor(layerById("sky"))) {

    const sunX = 1188;
    const sunY = 196;
    const glow = layerCtx.createRadialGradient(sunX, sunY, 12, sunX, sunY, 195);
    glow.addColorStop(0, p.sunGlow);
    glow.addColorStop(0.42, p.sunGlow.replace(/[\d.]+\)$/, "0.12)"));
    glow.addColorStop(1, "rgba(255, 230, 174, 0)");
    layerCtx.fillStyle = glow;
    layerCtx.fillRect(-CACHE_MARGIN, 0, CACHE_WIDTH, 560);

    layerCtx.fillStyle = p.sun;
    layerCtx.beginPath();
    layerCtx.arc(sunX, sunY, 48, 0, Math.PI * 2);
    layerCtx.fill();

    drawStars(layerCtx, shift);

    const clouds = [
      [-36, 222, 1.2], [624, 143, 0.94], [1240, 310, 0.72],
      [1760, 128, 0.88], [2180, 250, 1.05],
    ];
    clouds.forEach(([x, y, scale]) => {
      drawCloud(layerCtx, x + shift * 0.72, y, scale, p);
    });

    const horizonHaze = layerCtx.createLinearGradient(0, 375, 0, 595);
    horizonHaze.addColorStop(0, "rgba(255, 255, 255, 0)");
    horizonHaze.addColorStop(0.72, p.haze);
    horizonHaze.addColorStop(1, "rgba(255, 255, 255, 0)");
    layerCtx.fillStyle = horizonHaze;
    layerCtx.fillRect(-CACHE_MARGIN, 350, CACHE_WIDTH, 260);
  }

  const FAR_BLOCKS = [
    { x: -290, w: 118, h: 98, type: 0 },
    { x: -168, w: 82, h: 158, type: 1 },
    { x: -74, w: 156, h: 134, type: 2 },
    { x: 100, w: 120, h: 192, type: 0 },
    { x: 238, w: 74, h: 112, type: 1 },
    { x: 329, w: 142, h: 174, type: 2 },
    { x: 486, w: 97, h: 326, type: 0 },
    { x: 598, w: 132, h: 146, type: 1 },
    { x: 746, w: 86, h: 208, type: 2 },
    { x: 852, w: 152, h: 126, type: 0 },
    { x: 1017, w: 94, h: 276, type: 1 },
    { x: 1128, w: 140, h: 158, type: 2 },
    { x: 1284, w: 114, h: 220, type: 0 },
    { x: 1412, w: 88, h: 118, type: 1 },
    { x: 1514, w: 166, h: 175, type: 2 },
    { x: 1694, w: 106, h: 142, type: 0 },
  ];

  function drawFarBuilding(layerCtx, block, p, index) {
    const baseY = 566;
    const top = baseY - block.h;
    const colors = [p.farA, p.farB, p.farC];
    const fill = colors[block.type];

    layerCtx.fillStyle = fill;
    layerCtx.fillRect(block.x, top, block.w, block.h);

    layerCtx.fillStyle = "rgba(255,255,255,0.06)";
    layerCtx.fillRect(block.x + block.w - 12, top, 12, block.h);

    if (index % 3 === 0) {
      layerCtx.fillStyle = fill;
      layerCtx.fillRect(block.x + block.w * 0.22, top - 18, 8, 19);
      layerCtx.beginPath();
      layerCtx.moveTo(block.x + block.w * 0.22 - 8, top - 18);
      layerCtx.lineTo(block.x + block.w * 0.22 + 4, top - 37);
      layerCtx.lineTo(block.x + block.w * 0.22 + 16, top - 18);
      layerCtx.fill();
    }

    const cols = Math.max(2, Math.floor(block.w / 25));
    const rows = Math.max(3, Math.floor(block.h / 31));
    const cellW = block.w / cols;
    const cellH = block.h / rows;
    layerCtx.fillStyle = p.farWindow;
    for (let row = 1; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        if ((row * 3 + col * 5 + index) % 7 === 0) continue;
        const light = state.mode === "night" && (row * cols + col + index) % 5 < 2;
        layerCtx.fillStyle = light ? "rgba(255, 205, 130, 0.86)" : p.farWindow;
        layerCtx.fillRect(
          block.x + col * cellW + cellW * 0.34,
          top + row * cellH + 2,
          Math.max(3, cellW * 0.24),
          Math.max(4, cellH * 0.32)
        );
      }
    }
  }

  function paintFar(layerCtx, p, shift = offsetFor(layerById("far"))) {
    const period = 1980;

    layerCtx.save();
    layerCtx.translate(shift, 0);

    layerCtx.fillStyle = p.bridge;
    layerCtx.fillRect(-CACHE_MARGIN, 535, CACHE_WIDTH, 7);
    for (let x = 30; x < period; x += 112) {
      layerCtx.fillRect(x, 535, 5, 31);
    }

    FAR_BLOCKS.forEach((block, index) => {
      drawFarBuilding(layerCtx, block, p, index);
    });

    const haze = layerCtx.createLinearGradient(0, 420, 0, 615);
    haze.addColorStop(0, "rgba(255,255,255,0)");
    haze.addColorStop(0.75, p.farHaze);
    haze.addColorStop(1, "rgba(255,255,255,0)");
    layerCtx.fillStyle = haze;
    layerCtx.fillRect(-CACHE_MARGIN, 400, CACHE_WIDTH, 230);
    layerCtx.restore();
  }

  const NEAR_BLOCKS = [
    { x: -340, w: 416, h: 397, tone: 0, sign: "街角", accent: "CORNER 05" },
    { x: 154, w: 316, h: 342, tone: 1, sign: "面包", accent: "BAKERY" },
    { x: 576, w: 416, h: 370, tone: 2, sign: "北街", accent: "NORTH ST." },
    { x: 1080, w: 338, h: 414, tone: 0, sign: "咖啡", accent: "CAFÉ 24" },
    { x: 1462, w: 358, h: 348, tone: 1, sign: "书店", accent: "BOOKS & CO." },
    { x: 1870, w: 362, h: 392, tone: 2, sign: "花店", accent: "FLOWERS" },
  ];

  function drawWindow(layerCtx, x, y, width, height, p, lit) {
    layerCtx.fillStyle = p.nearWindow;
    layerCtx.fillRect(x, y, width, height);
    layerCtx.strokeStyle = "rgba(27, 32, 30, 0.3)";
    layerCtx.lineWidth = 2;
    layerCtx.strokeRect(x + 1, y + 1, width - 2, height - 2);

    layerCtx.fillStyle = lit ? p.windowGlow : "rgba(255,255,255,0.05)";
    layerCtx.fillRect(x + 4, y + 4, width - 8, Math.max(3, height * 0.45));

    layerCtx.strokeStyle = p.nearShadow;
    layerCtx.lineWidth = 2;
    layerCtx.beginPath();
    layerCtx.moveTo(x + width / 2, y + 2);
    layerCtx.lineTo(x + width / 2, y + height - 2);
    layerCtx.moveTo(x + 2, y + height * 0.62);
    layerCtx.lineTo(x + width - 2, y + height * 0.62);
    layerCtx.stroke();

    if (state.mode === "night" && lit) {
      const glow = layerCtx.createRadialGradient(
        x + width / 2, y + height / 2, 2,
        x + width / 2, y + height / 2, width * 1.3
      );
      glow.addColorStop(0, "rgba(255, 205, 128, 0.32)");
      glow.addColorStop(1, "rgba(255, 205, 128, 0)");
      layerCtx.fillStyle = glow;
      layerCtx.fillRect(x - width, y - height, width * 3, height * 3);
    }
  }

  function drawAwning(layerCtx, x, y, width, p, alt) {
    const base = alt ? p.awningAlt : p.awning;
    layerCtx.fillStyle = "rgba(20, 28, 25, 0.22)";
    layerCtx.fillRect(x + 5, y + 8, width, 16);

    const stripeWidth = 42;
    for (let stripeX = x; stripeX < x + width; stripeX += stripeWidth) {
      layerCtx.fillStyle = p.trim;
      layerCtx.beginPath();
      layerCtx.moveTo(stripeX, y);
      layerCtx.lineTo(Math.min(stripeX + stripeWidth, x + width), y);
      layerCtx.lineTo(Math.min(stripeX + stripeWidth - 8, x + width), y + 26);
      layerCtx.lineTo(stripeX - 8, y + 26);
      layerCtx.closePath();
      layerCtx.fill();
      layerCtx.fillStyle = base;
      layerCtx.beginPath();
      layerCtx.moveTo(stripeX + stripeWidth / 2, y);
      layerCtx.lineTo(Math.min(stripeX + stripeWidth, x + width), y);
      layerCtx.lineTo(Math.min(stripeX + stripeWidth - 8, x + width), y + 26);
      layerCtx.lineTo(stripeX + stripeWidth / 2 - 8, y + 26);
      layerCtx.closePath();
      layerCtx.fill();
    }
    layerCtx.fillStyle = p.nearShadow;
    layerCtx.fillRect(x - 8, y + 25, width + 16, 5);
  }

  function drawNearBuilding(layerCtx, block, p, index) {
    const baseY = 772;
    const top = baseY - block.h;
    const colors = [p.nearA, p.nearB, p.nearC];
    const body = colors[block.tone];

    layerCtx.fillStyle = "rgba(18, 24, 23, 0.22)";
    layerCtx.fillRect(block.x + 18, top + 12, block.w, block.h);

    layerCtx.fillStyle = body;
    layerCtx.fillRect(block.x, top, block.w, block.h);

    layerCtx.fillStyle = "rgba(255, 239, 206, 0.12)";
    layerCtx.fillRect(block.x + block.w - 26, top, 26, block.h);
    layerCtx.fillStyle = p.nearShadow;
    layerCtx.fillRect(block.x, top, 15, block.h);

    layerCtx.fillStyle = p.trim;
    layerCtx.fillRect(block.x - 10, top - 3, block.w + 20, 13);
    layerCtx.fillStyle = p.nearShadow;
    layerCtx.fillRect(block.x - 5, top + 10, block.w + 10, 5);

    layerCtx.fillStyle = "rgba(255,255,255,0.06)";
    layerCtx.fillRect(block.x + 32, top + 58, block.w - 64, 2);

    const windowTop = top + 91;
    const windowRows = block.h > 370 ? 3 : 2;
    const windowW = 44;
    const windowH = 64;
    const columns = Math.max(2, Math.floor((block.w - 64) / 74));
    const gap = (block.w - 52 - columns * windowW) / Math.max(1, columns - 1);

    for (let row = 0; row < windowRows; row += 1) {
      for (let col = 0; col < columns; col += 1) {
        const x = block.x + 26 + col * (windowW + gap);
        const y = windowTop + row * 88;
        drawWindow(
          layerCtx, x, y, windowW, windowH, p,
          (row + col + index) % 4 !== 1
        );
      }
    }

    const storeY = top + block.h - 152;
    layerCtx.fillStyle = p.nearShadow;
    layerCtx.fillRect(block.x + 14, storeY, block.w - 28, 6);
    layerCtx.fillStyle = "rgba(24, 29, 27, 0.24)";
    layerCtx.fillRect(block.x + 34, storeY + 48, block.w - 68, 100);
    drawAwning(layerCtx, block.x + 34, storeY + 32, block.w - 68, p, index % 2 === 1);

    layerCtx.fillStyle = "rgba(255, 230, 177, 0.12)";
    layerCtx.fillRect(block.x + 47, storeY + 78, block.w - 94, 68);
    layerCtx.strokeStyle = p.trim;
    layerCtx.lineWidth = 4;
    layerCtx.strokeRect(block.x + 47, storeY + 78, block.w - 94, 68);

    if (state.mode === "night") {
      layerCtx.shadowColor = "rgba(255, 194, 112, 0.46)";
      layerCtx.shadowBlur = 28;
      layerCtx.fillStyle = "rgba(255, 202, 124, 0.48)";
      layerCtx.fillRect(block.x + 52, storeY + 83, block.w - 104, 58);
      layerCtx.shadowBlur = 0;
      layerCtx.shadowColor = "transparent";
    }

    layerCtx.fillStyle = p.nearShadow;
    layerCtx.fillRect(block.x + block.w - 100, storeY + 76, 42, 70);
    layerCtx.fillStyle = p.trim;
    layerCtx.fillRect(block.x + block.w - 96, storeY + 83, 34, 6);

    const signX = block.x + block.w - Math.min(190, block.w * 0.5);
    layerCtx.fillStyle = p.sign;
    roundedRect(layerCtx, signX, top + 30, 126, 46, 5);
    layerCtx.fill();
    layerCtx.fillStyle = p.trim;
    layerCtx.font = `600 19px ${FONT}`;
    layerCtx.textBaseline = "middle";
    layerCtx.fillText(block.sign, signX + 16, top + 53);
    layerCtx.fillStyle = p.nearLight;
    layerCtx.font = `8px "Courier New", monospace`;
    layerCtx.fillText(block.accent, signX + 76, top + 54);

    if (state.mode === "night") {
      layerCtx.shadowColor = p.signGlow;
      layerCtx.shadowBlur = 24;
      layerCtx.fillStyle = "rgba(239, 91, 54, 0.55)";
      layerCtx.beginPath();
      layerCtx.arc(block.x + 35, top + 42, 4, 0, Math.PI * 2);
      layerCtx.fill();
      layerCtx.shadowBlur = 0;
      layerCtx.shadowColor = "transparent";
    }
  }

  function paintNear(layerCtx, p, shift = offsetFor(layerById("near"))) {
    const period = 2232;
    layerCtx.save();
    layerCtx.translate(shift, 0);
    NEAR_BLOCKS.forEach((block, index) => drawNearBuilding(layerCtx, block, p, index));
    layerCtx.fillStyle = p.nearShadow;
    layerCtx.fillRect(0, 766, period, 8);
    layerCtx.restore();
  }

  const TREES = [
    { x: 14, baseY: 792, scale: 0.78, lean: -0.06, seed: 2 },
    { x: 416, baseY: 808, scale: 0.68, lean: 0.08, seed: 5 },
    { x: 908, baseY: 820, scale: 0.76, lean: -0.03, seed: 8 },
    { x: 1372, baseY: 804, scale: 0.66, lean: 0.04, seed: 11 },
    { x: 1738, baseY: 812, scale: 0.71, lean: -0.07, seed: 14 },
  ];

  function drawTree(layerCtx, tree, p, index) {
    const s = tree.scale;
    const baseX = tree.x;
    const baseY = tree.baseY;
    const trunkTop = baseY - 276 * s;
    const crownX = baseX + tree.lean * 132;
    const crownY = baseY - 360 * s;

    layerCtx.fillStyle = "rgba(19, 28, 24, 0.24)";
    layerCtx.beginPath();
    layerCtx.ellipse(baseX + 32, baseY + 6, 82 * s, 13 * s, 0, 0, Math.PI * 2);
    layerCtx.fill();

    layerCtx.strokeStyle = p.trunk;
    layerCtx.lineCap = "round";
    layerCtx.lineWidth = 25 * s;
    layerCtx.beginPath();
    layerCtx.moveTo(baseX - 3 * s, baseY);
    layerCtx.bezierCurveTo(
      baseX + 5 * s, baseY - 104 * s,
      crownX - 23 * s, trunkTop + 82 * s,
      crownX, trunkTop
    );
    layerCtx.stroke();

    layerCtx.strokeStyle = p.trunkLight;
    layerCtx.lineWidth = 6 * s;
    layerCtx.beginPath();
    layerCtx.moveTo(baseX + 1 * s, baseY);
    layerCtx.bezierCurveTo(
      baseX + 10 * s, baseY - 102 * s,
      crownX - 14 * s, trunkTop + 92 * s,
      crownX + 3 * s, trunkTop + 22 * s
    );
    layerCtx.stroke();

    const branches = [
      [-112, 18, -74, -74],
      [118, 20, 86, -68],
      [-48, -55, -38, -118],
      [42, -61, 44, -122],
    ];
    layerCtx.strokeStyle = p.trunk;
    layerCtx.lineWidth = 10 * s;
    branches.forEach(([ex, ey, cx, cy]) => {
      layerCtx.beginPath();
      layerCtx.moveTo(crownX + ex * 0.24 * s, trunkTop + 16 * s);
      layerCtx.quadraticCurveTo(
        crownX + ex * 0.64 * s, crownY + cy * s,
        crownX + ex * s, crownY + ey * s
      );
      layerCtx.stroke();
    });

    const lobes = [
      [-126, 20, 97, 77], [-55, -31, 108, 91], [42, -14, 122, 104],
      [123, 30, 93, 78], [-16, 73, 124, 101], [75, 81, 100, 84],
      [-93, 76, 76, 70],
    ];
    for (let layer = 0; layer < 3; layer += 1) {
      const colors = [p.treeEdge, p.treeDark, p.treeMid];
      lobes.forEach(([dx, dy, rx, ry], lobeIndex) => {
        if (layer === 1 && lobeIndex % 4 === 0) return;
        const wobble = Math.sin((tree.seed + lobeIndex) * 1.8) * 7;
        layerCtx.fillStyle = colors[layer];
        layerCtx.beginPath();
        layerCtx.ellipse(
          crownX + (dx + wobble) * s,
          crownY + dy * s,
          rx * s * (1 - layer * 0.11),
          ry * s * (1 - layer * 0.1),
          (lobeIndex - 2) * 0.13,
          0,
          Math.PI * 2
        );
        layerCtx.fill();
      });
    }

    const highlights = [
      [-64, -52, 43, 25], [18, -61, 56, 29], [98, -9, 38, 20],
      [-80, 35, 34, 19], [15, 18, 47, 22],
    ];
    layerCtx.fillStyle = state.mode === "day"
      ? "rgba(174, 196, 119, 0.28)"
      : "rgba(97, 125, 93, 0.14)";
    highlights.forEach(([dx, dy, rx, ry], i) => {
      layerCtx.beginPath();
      layerCtx.ellipse(
        crownX + dx * s, crownY + dy * s, rx * s, ry * s,
        (i - 2) * 0.24, 0, Math.PI * 2
      );
      layerCtx.fill();
    });

    if (state.mode === "night") {
      const rim = layerCtx.createLinearGradient(
        crownX - 150 * s, crownY - 140 * s,
        crownX + 190 * s, crownY + 130 * s
      );
      rim.addColorStop(0, "rgba(114, 149, 121, 0.28)");
      rim.addColorStop(0.4, "rgba(114, 149, 121, 0)");
      rim.addColorStop(1, "rgba(15, 33, 28, 0.2)");
      layerCtx.fillStyle = rim;
      layerCtx.beginPath();
      layerCtx.ellipse(crownX, crownY, 220 * s, 164 * s, 0, 0, Math.PI * 2);
      layerCtx.fill();
    }

    if (index % 2 === 0) {
      layerCtx.fillStyle = p.treeDark;
      layerCtx.beginPath();
      layerCtx.ellipse(baseX - 50 * s, baseY - 3, 42 * s, 8 * s, 0.1, 0, Math.PI * 2);
      layerCtx.fill();
    }
  }

  function paintTrees(layerCtx, p, shift = offsetFor(layerById("trees"))) {
    const period = 1912;
    layerCtx.save();
    layerCtx.translate(shift, 0);

    TREES.forEach((tree, index) => drawTree(layerCtx, tree, p, index));

    const branchShadows = [
      [100, 688, 240, 18, -0.13],
      [500, 706, 185, 13, 0.1],
      [1010, 718, 255, 17, -0.07],
    ];
    layerCtx.fillStyle = p.contactShadow;
    branchShadows.forEach(([x, y, w, h, rotation]) => {
      layerCtx.save();
      layerCtx.translate(x, y);
      layerCtx.rotate(rotation);
      layerCtx.beginPath();
      layerCtx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
      layerCtx.fill();
      layerCtx.restore();
    });
    layerCtx.restore();
  }

  const LAMPS = [
    { x: -24, direction: 1 },
    { x: 714, direction: -1 },
    { x: 1436, direction: 1 },
    { x: 2100, direction: -1 },
  ];

  function drawLamp(layerCtx, lamp, p, index) {
    const poleTop = 332;
    const armLength = 116;
    const headX = lamp.x + armLength * lamp.direction;
    const headY = poleTop + 2;

    layerCtx.fillStyle = "rgba(20, 26, 23, 0.2)";
    layerCtx.fillRect(lamp.x + 13, poleTop + 72, 13, 385);

    layerCtx.strokeStyle = p.lamp;
    layerCtx.lineCap = "round";
    layerCtx.lineWidth = 13;
    layerCtx.beginPath();
    layerCtx.moveTo(lamp.x, 723);
    layerCtx.lineTo(lamp.x, poleTop + 52);
    layerCtx.stroke();

    layerCtx.lineWidth = 11;
    layerCtx.beginPath();
    layerCtx.moveTo(lamp.x, poleTop + 55);
    layerCtx.quadraticCurveTo(
      lamp.x, poleTop + 8,
      headX, poleTop + 8
    );
    layerCtx.stroke();

    layerCtx.fillStyle = p.lamp;
    layerCtx.beginPath();
    layerCtx.moveTo(headX - 20, headY);
    layerCtx.lineTo(headX + 18, headY);
    layerCtx.lineTo(headX + 28, headY + 22);
    layerCtx.lineTo(headX - 28, headY + 22);
    layerCtx.closePath();
    layerCtx.fill();

    layerCtx.fillStyle = state.mode === "night" ? "#ffd58c" : "#727c72";
    layerCtx.beginPath();
    layerCtx.ellipse(headX, headY + 22, 24, 6, 0, 0, Math.PI * 2);
    layerCtx.fill();

    layerCtx.fillStyle = p.lamp;
    layerCtx.fillRect(lamp.x - 10, 704, 20, 39);
    layerCtx.fillStyle = p.sidewalkLight;
    layerCtx.fillRect(lamp.x - 7, 706, 14, 5);

    if (state.mode === "night") {
      const halo = layerCtx.createRadialGradient(
        headX, headY + 22, 5,
        headX, headY + 22, 170
      );
      halo.addColorStop(0, "rgba(255, 216, 142, 0.62)");
      halo.addColorStop(0.24, "rgba(255, 196, 106, 0.2)");
      halo.addColorStop(1, "rgba(255, 196, 106, 0)");
      layerCtx.fillStyle = halo;
      layerCtx.fillRect(headX - 180, headY - 160, 360, 380);

      const pool = layerCtx.createRadialGradient(
        headX, 836, 8,
        headX, 836, 265
      );
      pool.addColorStop(0, "rgba(255, 193, 103, 0.34)");
      pool.addColorStop(0.5, "rgba(255, 184, 92, 0.11)");
      pool.addColorStop(1, "rgba(255, 184, 92, 0)");
      layerCtx.save();
      layerCtx.globalCompositeOperation = "screen";
      layerCtx.fillStyle = pool;
      layerCtx.translate(headX, 835);
      layerCtx.scale(1, 0.38);
      layerCtx.fillRect(-270, -270, 540, 540);
      layerCtx.restore();

      layerCtx.save();
      layerCtx.globalCompositeOperation = "screen";
      const streak = layerCtx.createLinearGradient(0, 775, 0, 890);
      streak.addColorStop(0, "rgba(255, 197, 111, 0.02)");
      streak.addColorStop(0.5, "rgba(255, 197, 111, 0.19)");
      streak.addColorStop(1, "rgba(255, 197, 111, 0)");
      layerCtx.fillStyle = streak;
      layerCtx.fillRect(headX - 24, 775, 48, 115);
      layerCtx.restore();
    }
  }

  function paintRoad(layerCtx, p, shift = offsetFor(layerById("road"))) {

    const sidewalk = layerCtx.createLinearGradient(0, 688, 0, 766);
    sidewalk.addColorStop(0, p.sidewalk);
    sidewalk.addColorStop(0.62, p.sidewalkLight);
    sidewalk.addColorStop(1, p.sidewalk);
    layerCtx.fillStyle = sidewalk;
    layerCtx.fillRect(-CACHE_MARGIN, 690, CACHE_WIDTH, 76);

    layerCtx.save();
    layerCtx.translate(shift, 0);

    layerCtx.strokeStyle = "rgba(47, 50, 44, 0.23)";
    layerCtx.lineWidth = 2;
    for (let x = -CACHE_MARGIN; x < CACHE_WIDTH; x += 96) {
      layerCtx.beginPath();
      layerCtx.moveTo(x + 24, 698);
      layerCtx.lineTo(x, 758);
      layerCtx.stroke();
    }
    layerCtx.strokeStyle = "rgba(255, 255, 255, 0.12)";
    layerCtx.beginPath();
    layerCtx.moveTo(0, 737);
    layerCtx.lineTo(CACHE_WIDTH, 737);
    layerCtx.stroke();

    const asphalt = layerCtx.createLinearGradient(0, 754, 0, 900);
    asphalt.addColorStop(0, p.roadLight);
    asphalt.addColorStop(0.32, p.road);
    asphalt.addColorStop(1, p.roadDark);
    layerCtx.fillStyle = asphalt;
    layerCtx.fillRect(-450, 758, WIDTH + 900, 150);

    layerCtx.fillStyle = p.sidewalkLight;
    layerCtx.fillRect(-450, 751, WIDTH + 900, 10);
    layerCtx.fillStyle = p.sidewalk;
    layerCtx.fillRect(-450, 758, WIDTH + 900, 7);
    layerCtx.fillStyle = p.contactShadow;
    layerCtx.fillRect(-450, 754, WIDTH + 900, 5);

    const crossingStart = 305;
    for (let stripe = 0; stripe < 9; stripe += 1) {
      const x = crossingStart + stripe * 103;
      layerCtx.fillStyle = p.lane;
      layerCtx.beginPath();
      layerCtx.moveTo(x, 799);
      layerCtx.lineTo(x + 51, 799);
      layerCtx.lineTo(x + 91, 900);
      layerCtx.lineTo(x - 18, 900);
      layerCtx.closePath();
      layerCtx.fill();
    }

    layerCtx.fillStyle = "rgba(239, 230, 205, 0.34)";
    layerCtx.fillRect(1265, 788, 165, 5);
    layerCtx.fillRect(1400, 794, 96, 4);

    layerCtx.strokeStyle = "rgba(12, 16, 15, 0.2)";
    layerCtx.lineWidth = 2;
    layerCtx.beginPath();
    layerCtx.moveTo(120, 867);
    layerCtx.bezierCurveTo(157, 849, 184, 879, 221, 858);
    layerCtx.stroke();
    layerCtx.beginPath();
    layerCtx.moveTo(1010, 806);
    layerCtx.bezierCurveTo(1036, 820, 1061, 801, 1090, 818);
    layerCtx.stroke();

    if (state.mode === "night") {
      layerCtx.save();
      layerCtx.globalCompositeOperation = "screen";
      const wetRoad = layerCtx.createLinearGradient(0, 820, 0, 900);
      wetRoad.addColorStop(0, "rgba(77, 104, 116, 0)");
      wetRoad.addColorStop(0.6, "rgba(73, 89, 103, 0.14)");
      wetRoad.addColorStop(1, "rgba(117, 132, 132, 0.06)");
      layerCtx.fillStyle = wetRoad;
      layerCtx.fillRect(-450, 815, WIDTH + 900, 85);
      layerCtx.restore();
    }
    layerCtx.restore();

    LAMPS.forEach((lamp, index) => drawLamp(layerCtx, lamp, p, index));
  }

  const LAYER_PAINTERS = {
    sky: paintSky,
    far: paintFar,
    near: paintNear,
    trees: paintTrees,
    road: paintRoad,
  };

  function prepareLayerTexture(layer, p) {
    const buffer = buffers.get(layer.id);
    const painter = LAYER_PAINTERS[layer.id];
    const layerCtx = buffer.ctx;

    layerCtx.clearRect(0, 0, CACHE_WIDTH, HEIGHT);
    layerCtx.save();
    layerCtx.translate(CACHE_MARGIN, 0);
    painter(layerCtx, p, 0);
    layerCtx.restore();

    if (layer.blur > 0) {
      buffer.blurCtx.clearRect(0, 0, CACHE_WIDTH, HEIGHT);
      buffer.blurCtx.save();
      buffer.blurCtx.filter = `blur(${layer.blur}px)`;
      buffer.blurCtx.drawImage(buffer.canvas, 0, 0);
      buffer.blurCtx.restore();
    }

    buffer.cacheMode = state.mode;
    buffer.cacheBlur = layer.blur;
  }

  function invalidateLayerTextures() {
    buffers.forEach((buffer) => {
      buffer.cacheMode = null;
      buffer.cacheBlur = null;
    });
  }

  function paintStreet(context, mode, camera, layers) {
    const p = PALETTES[mode];
    context.save();
    context.globalAlpha = 1;
    context.globalCompositeOperation = "source-over";
    context.clearRect(0, 0, WIDTH, HEIGHT);
    paintSkyBase(context, p);

    layers.forEach((layer) => {
      const buffer = buffers.get(layer.id);
      if (buffer.cacheMode !== mode || buffer.cacheBlur !== layer.blur) {
        prepareLayerTexture(layer, p);
      }
      const texture = layer.blur > 0 ? buffer.blurCanvas : buffer.canvas;
      const offset = offsetFor(layer, camera);
      const sourceX = CACHE_MARGIN - offset;
      context.drawImage(
        texture,
        sourceX, 0, WIDTH, HEIGHT,
        0, 0, WIDTH, HEIGHT
      );
    });

    if (mode === "night") {
      const veil = context.createLinearGradient(0, 0, 0, HEIGHT);
      veil.addColorStop(0, "rgba(13, 25, 45, 0.08)");
      veil.addColorStop(0.55, "rgba(16, 25, 35, 0)");
      veil.addColorStop(1, "rgba(4, 9, 11, 0.1)");
      context.fillStyle = veil;
      context.fillRect(0, 0, WIDTH, HEIGHT);
    }
    context.restore();
  }

  buildLayerControls();
  updateReadouts();

  function setCamera(value, immediate = false) {
    state.targetCamera = clamp(value, -PAN_LIMIT, PAN_LIMIT);
    if (immediate) state.camera = state.targetCamera;
    updateReadouts();
  }

  function onPointerDown(event) {
    if (state.recording || event.button > 0) return;
    state.dragging = true;
    state.pointerId = event.pointerId;
    state.dragStartX = event.clientX;
    state.cameraStart = state.camera;
    refs.canvas.classList.add("is-dragging");
    refs.canvas.setPointerCapture(event.pointerId);
    if (state.audioEnabled) ensureAudio();
  }

  function onPointerMove(event) {
    if (!state.dragging || event.pointerId !== state.pointerId) return;
    const rect = refs.canvas.getBoundingClientRect();
    const delta = ((event.clientX - state.dragStartX) / rect.width) * 1240;
    setCamera(state.cameraStart + delta, true);
    if (!state.hasDragged && Math.abs(delta) > 3) {
      state.hasDragged = true;
      refs.stageFrame.classList.add("has-dragged");
    }
    draw();
  }

  function endDrag(event) {
    if (!state.dragging || event.pointerId !== state.pointerId) return;
    state.dragging = false;
    state.pointerId = null;
    refs.canvas.classList.remove("is-dragging");
  }

  refs.canvas.addEventListener("pointerdown", onPointerDown);
  refs.canvas.addEventListener("pointermove", onPointerMove);
  refs.canvas.addEventListener("pointerup", endDrag);
  refs.canvas.addEventListener("pointercancel", endDrag);

  window.addEventListener("keydown", (event) => {
    if (state.recording) return;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      const direction = event.key === "ArrowLeft" ? -1 : 1;
      setCamera(state.camera + direction * 34);
      event.preventDefault();
    }
  });

  document.querySelectorAll(".day-choice").forEach((button) => {
    button.addEventListener("click", () => {
      if (state.recording) return;
      state.mode = button.dataset.mode;
      document.querySelectorAll(".day-choice").forEach((choice) => {
        const active = choice === button;
        choice.classList.toggle("is-active", active);
        choice.setAttribute("aria-pressed", String(active));
      });
      draw();
      if (state.audioContext) setAmbienceMode();
    });
  });

  refs.resetButton.addEventListener("click", () => {
    if (state.recording) return;
    state.layers.forEach((layer, index) => {
      layer.depth = LAYER_DEFS[index].depth;
      layer.blur = LAYER_DEFS[index].blur;
    });
    buildLayerControls();
    setCamera(0, true);
    updateDepthNote();
    draw();
    showToast("深度、模糊与视角已重置");
  });

  let lastFrameTime = performance.now();
  function animationFrame(now) {
    const dt = Math.min(64, now - lastFrameTime);
    lastFrameTime = now;

    if (state.recording && exportRun) {
      updateRecording(now);
    } else if (!state.dragging) {
      const difference = state.targetCamera - state.camera;
      if (Math.abs(difference) > 0.02) {
        state.camera += difference * Math.min(1, dt / 95);
      }
    }

    draw();
    if (
      state.recording &&
      exportRun &&
      !exportRun.referenceCanvas &&
      exportRun.progress >= 0.5
    ) {
      captureReferenceFrame();
    }
    requestAnimationFrame(animationFrame);
  }

  draw();
  requestAnimationFrame(animationFrame);
  document.fonts.ready.then(() => {
    invalidateLayerTextures();
    draw();
  });

  const audioNodes = {};

  function createNoiseBuffer(context, seconds) {
    const length = Math.floor(context.sampleRate * seconds);
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    let smoothed = 0;
    for (let index = 0; index < length; index += 1) {
      const white = Math.random() * 2 - 1;
      smoothed = (smoothed + 0.018 * white) / 1.018;
      data[index] = smoothed * 3.4;
    }
    return buffer;
  }

  function createAmbientAudio() {
    const context = state.audioContext;
    const ambientBus = context.createGain();
    const monitorGain = context.createGain();
    const exportGain = context.createGain();
    const mediaDestination = context.createMediaStreamDestination();

    monitorGain.gain.value = state.audioEnabled ? 0.42 : 0;
    exportGain.gain.value = 0.82;
    ambientBus.connect(monitorGain);
    ambientBus.connect(exportGain);
    monitorGain.connect(context.destination);
    exportGain.connect(mediaDestination);

    const dayBus = context.createGain();
    const nightBus = context.createGain();
    dayBus.gain.value = state.mode === "day" ? 1 : 0;
    nightBus.gain.value = state.mode === "night" ? 1 : 0;
    dayBus.connect(ambientBus);
    nightBus.connect(ambientBus);

    const rumbleSource = context.createBufferSource();
    rumbleSource.buffer = createNoiseBuffer(context, 4.5);
    rumbleSource.loop = true;
    const rumbleFilter = context.createBiquadFilter();
    rumbleFilter.type = "lowpass";
    rumbleFilter.frequency.value = 210;
    rumbleFilter.Q.value = 0.7;
    const rumbleGain = context.createGain();
    rumbleGain.gain.value = 0.16;
    rumbleSource.connect(rumbleFilter).connect(rumbleGain).connect(ambientBus);

    const airSource = context.createBufferSource();
    airSource.buffer = createNoiseBuffer(context, 3.8);
    airSource.loop = true;
    const airFilter = context.createBiquadFilter();
    airFilter.type = "bandpass";
    airFilter.frequency.value = 1250;
    airFilter.Q.value = 0.42;
    const airGain = context.createGain();
    airGain.gain.value = 0.022;
    airSource.connect(airFilter).connect(airGain).connect(ambientBus);

    const humGain = context.createGain();
    humGain.gain.value = 0.018;
    humGain.connect(ambientBus);
    [49, 98].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      oscillator.type = index === 0 ? "sine" : "triangle";
      oscillator.frequency.value = frequency;
      const gain = context.createGain();
      gain.gain.value = index === 0 ? 1 : 0.34;
      oscillator.connect(gain).connect(humGain);
      oscillator.start();
    });

    const slowPulse = context.createOscillator();
    slowPulse.type = "sine";
    slowPulse.frequency.value = 0.075;
    const pulseDepth = context.createGain();
    pulseDepth.gain.value = 0.055;
    slowPulse.connect(pulseDepth).connect(rumbleGain.gain);
    slowPulse.start();

    rumbleSource.start();
    airSource.start();

    Object.assign(audioNodes, {
      ambientBus,
      monitorGain,
      exportGain,
      dayBus,
      nightBus,
    });
    state.mediaDestination = mediaDestination;
  }

  function setAmbienceMode() {
    if (!state.audioContext || !audioNodes.dayBus) return;
    const now = state.audioContext.currentTime;
    audioNodes.dayBus.gain.setTargetAtTime(state.mode === "day" ? 1 : 0, now, 0.25);
    audioNodes.nightBus.gain.setTargetAtTime(state.mode === "night" ? 1 : 0, now, 0.25);
  }

  async function ensureAudio() {
    if (!state.audioContext) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return null;
      state.audioContext = new AudioContextClass();
      createAmbientAudio();
    }
    if (state.audioContext.state === "suspended") {
      try {
        await state.audioContext.resume();
      } catch (error) {
        console.warn("Audio context could not resume", error);
      }
    }
    if (audioNodes.monitorGain) {
      const target = state.audioEnabled ? 0.42 : 0;
      audioNodes.monitorGain.gain.setTargetAtTime(
        target,
        state.audioContext.currentTime,
        0.08
      );
    }
    return state.audioContext;
  }

  function playBird() {
    const context = state.audioContext;
    if (!context || state.mode !== "day" || !audioNodes.dayBus) return;
    const start = context.currentTime + 0.02;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(1420, start);
    oscillator.frequency.exponentialRampToValueAtTime(2050, start + 0.12);
    oscillator.frequency.exponentialRampToValueAtTime(1240, start + 0.27);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.04, start + 0.035);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.32);
    oscillator.connect(gain).connect(audioNodes.dayBus);
    oscillator.start(start);
    oscillator.stop(start + 0.35);
  }

  function playCricket() {
    const context = state.audioContext;
    if (!context || state.mode !== "night" || !audioNodes.nightBus) return;
    const start = context.currentTime + 0.02;
    for (let pulse = 0; pulse < 3; pulse += 1) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = 3250;
      const offset = start + pulse * 0.095;
      gain.gain.setValueAtTime(0.0001, offset);
      gain.gain.exponentialRampToValueAtTime(0.012, offset + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, offset + 0.055);
      oscillator.connect(gain).connect(audioNodes.nightBus);
      oscillator.start(offset);
      oscillator.stop(offset + 0.065);
    }
  }

  refs.soundButton.addEventListener("click", async () => {
    state.audioEnabled = !state.audioEnabled;
    refs.soundButton.setAttribute("aria-pressed", String(state.audioEnabled));
    refs.soundLabel.textContent = state.audioEnabled ? "环境声" : "环境声";
    refs.soundButton.title = state.audioEnabled ? "关闭环境声" : "开启环境声";
    await ensureAudio();
    if (state.audioEnabled) {
      showToast("环境声已开启：低频城市底噪、微风与鸟鸣");
    } else {
      showToast("预览已静音，导出视频仍保留环境声音轨");
    }
  });

  setInterval(() => {
    if (!state.audioContext) return;
    const cue = Math.random();
    if (state.mode === "day" && cue > 0.22) playBird();
    if (state.mode === "night" && cue > 0.3) playCricket();
  }, 4600);

  let exportRun = null;

  function pickRecorderMime() {
    if (typeof MediaRecorder === "undefined") return "";
    const candidates = [
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm;codecs=vp9",
      "video/webm;codecs=vp8",
      "video/webm",
    ];
    return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || "";
  }

  function captureReferenceFrame() {
    if (!exportRun) return;
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 360;
    const referenceContext = canvas.getContext("2d", { willReadFrequently: true });
    referenceContext.drawImage(refs.canvas, 0, 0, canvas.width, canvas.height);
    exportRun.referenceCanvas = canvas;
    exportRun.referenceCamera = state.camera;
  }

  function updateRecording(now) {
    if (!exportRun || exportRun.stopping) return;
    const elapsed = Math.max(0, now - exportRun.startedAt);
    const progress = clamp(elapsed / (EXPORT_SECONDS * 1000), 0, 1);
    exportRun.progress = progress;

    state.camera = lerp(exportRun.startCamera, exportRun.endCamera, easeInOut(progress));
    state.targetCamera = state.camera;
    const seconds = Math.min(EXPORT_SECONDS, elapsed / 1000);
    exportRun.recordingDurationMs = Math.min(EXPORT_SECONDS * 1000, elapsed);
    refs.exportProgress.style.width = `${progress * 100}%`;
    refs.progressLabel.textContent =
      `${seconds.toFixed(1).padStart(4, "0")} / ${EXPORT_SECONDS.toFixed(1)} s`;

    if (progress >= 1) finishExportRecording();
  }

  function downloadExport(blob) {
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, "-")
      .slice(0, 19);
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `parallax-street-${state.mode}-${timestamp}.webm`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 60000);
  }

  function finishExportRecording() {
    if (!exportRun || exportRun.stopping) return;
    exportRun.stopping = true;
    refs.progressLabel.textContent = "正在封装视频…";
    refs.exportProgress.style.width = "100%";
    try {
      exportRun.recorder.stop();
    } catch (error) {
      failExport(error);
    }
  }

  async function finalizeExport(blob) {
    const run = exportRun;
    if (!run) return;
    state.lastExportBlob = blob;
    downloadExport(blob);
    refs.progressLabel.textContent = "正在校验五层顺序…";

    let report;
    try {
      report = await analyzeExportedVideo(blob, run);
    } catch (error) {
      console.warn("Export verification failed", error);
      report = {
        passed: false,
        error: error instanceof Error ? error.message : String(error),
        expectedOrder: state.layers.map((layer) => layer.id),
        renderedOrder: state.layers.map((layer) => layer.id),
        verticalFlip: null,
        frameMae: null,
      };
    }

    state.lastExportReport = report;
    state.recording = false;
    state.camera = run.previousCamera;
    state.targetCamera = run.previousTarget;
    refs.exportOverlay.hidden = true;
    refs.exportButton.disabled = false;

    if (report.passed) {
      showToast(
        `导出完成 · 五层顺序正常 · 视频/参考帧 MAE ${report.frameMae.toFixed(2)}`,
        5000
      );
    } else {
      showToast(`导出完成，但层序校验未通过：${report.error || "请检查控制台"}`, 6000);
    }

    if (run.resolve) run.resolve(report);
    exportRun = null;
  }

  function failExport(error) {
    console.error(error);
    state.recording = false;
    refs.exportOverlay.hidden = true;
    refs.exportButton.disabled = false;
    showToast(`导出失败：${error instanceof Error ? error.message : error}`);
    if (exportRun && exportRun.reject) exportRun.reject(error);
    exportRun = null;
  }

  async function startExport() {
    if (state.recording) return null;
    const mimeType = pickRecorderMime();
    if (!mimeType) {
      showToast("当前浏览器不支持 MediaRecorder WebM 录制");
      return null;
    }

    await ensureAudio();
    let stream;
    try {
      stream = refs.canvas.captureStream(FPS);
      const audioTrack = state.mediaDestination?.stream?.getAudioTracks?.()[0];
      if (audioTrack) stream.addTrack(audioTrack);
    } catch (error) {
      failExport(error);
      return null;
    }

    const chunks = [];
    let recorder;
    try {
      recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: 8_000_000,
        audioBitsPerSecond: 128_000,
      });
    } catch (error) {
      failExport(error);
      return null;
    }

    refs.exportOverlay.hidden = false;
    refs.exportProgress.style.width = "0%";
    refs.progressLabel.textContent = `00.0 / ${EXPORT_SECONDS.toFixed(1)} s`;
    refs.exportButton.disabled = true;

    const run = {
      recorder,
      chunks,
      stream,
      previousCamera: state.camera,
      previousTarget: state.targetCamera,
      previousMode: state.mode,
      startCamera: -PAN_LIMIT * 0.79,
      endCamera: PAN_LIMIT * 0.79,
      startedAt: 0,
      stopping: false,
      progress: 0,
      referenceCanvas: null,
      referenceCamera: 0,
      resolve: null,
      reject: null,
    };
    exportRun = run;

    const resultPromise = new Promise((resolve, reject) => {
      run.resolve = resolve;
      run.reject = reject;
    });

    recorder.addEventListener("dataavailable", (event) => {
      if (event.data && event.data.size > 0) chunks.push(event.data);
    });
    recorder.addEventListener("error", (event) => {
      failExport(event.error || new Error("MediaRecorder error"));
    });
    recorder.addEventListener("stop", () => {
      const blob = new Blob(chunks, { type: mimeType.split(";")[0] });
      stream.getVideoTracks().forEach((track) => track.stop());
      finalizeExport(blob).catch(failExport);
    });

    state.recording = true;
    state.camera = run.startCamera;
    state.targetCamera = run.startCamera;
    run.startedAt = performance.now();
    recorder.start(250);
    return resultPromise;
  }

  refs.exportButton.addEventListener("click", () => {
    startExport().catch(failExport);
  });

  function waitForMediaEvent(target, eventName, timeout = 7000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(`Timed out waiting for ${eventName}`));
      }, timeout);
      function cleanup() {
        clearTimeout(timer);
        target.removeEventListener(eventName, onEvent);
      }
      function onEvent() {
        cleanup();
        resolve();
      }
      target.addEventListener(eventName, onEvent, { once: true });
    });
  }

  async function grabVideoFrame(blob, referenceCanvas) {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    const url = URL.createObjectURL(blob);
    video.src = url;

    await waitForMediaEvent(video, "loadeddata");
    const finiteDuration = Number.isFinite(video.duration) ? video.duration : EXPORT_SECONDS;
    const targetTime = clamp(Math.min(EXPORT_SECONDS * 0.5, finiteDuration - 0.03), 0.02, finiteDuration);
    if (Math.abs(video.currentTime - targetTime) > 0.02) {
      video.currentTime = targetTime;
      await waitForMediaEvent(video, "seeked");
      await new Promise((resolve) => setTimeout(resolve, 80));
    }

    const canvas = document.createElement("canvas");
    canvas.width = referenceCanvas.width;
    canvas.height = referenceCanvas.height;
    const sampleContext = canvas.getContext("2d", { willReadFrequently: true });
    sampleContext.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = sampleContext.getImageData(0, 0, canvas.width, canvas.height);

    const result = {
      canvas,
      imageData,
      duration: video.duration,
      width: video.videoWidth,
      height: video.videoHeight,
    };
    URL.revokeObjectURL(url);
    video.removeAttribute("src");
    video.load();
    return result;
  }

  function imageMae(source, target, width, height, getTargetIndex) {
    let difference = 0;
    let samples = 0;
    for (let y = 0; y < height; y += 4) {
      for (let x = 0; x < width; x += 4) {
        const sourceIndex = (y * width + x) * 4;
        const targetIndex = getTargetIndex(x, y) * 4;
        difference += Math.abs(source[sourceIndex] - target[targetIndex]);
        difference += Math.abs(source[sourceIndex + 1] - target[targetIndex + 1]);
        difference += Math.abs(source[sourceIndex + 2] - target[targetIndex + 2]);
        samples += 3;
      }
    }
    return difference / samples;
  }

  function bandMae(reference, videoPixels, width, height) {
    const bands = [];
    for (let band = 0; band < 5; band += 1) {
      const startY = Math.floor((height * band) / 5);
      const endY = Math.floor((height * (band + 1)) / 5);
      let difference = 0;
      let samples = 0;
      for (let y = startY; y < endY; y += 4) {
        for (let x = 0; x < width; x += 4) {
          const index = (y * width + x) * 4;
          difference += Math.abs(reference[index] - videoPixels[index]);
          difference += Math.abs(reference[index + 1] - videoPixels[index + 1]);
          difference += Math.abs(reference[index + 2] - videoPixels[index + 2]);
          samples += 3;
        }
      }
      bands.push(difference / Math.max(1, samples));
    }
    return bands;
  }

  async function analyzeExportedVideo(blob, run) {
    if (!run.referenceCanvas) {
      throw new Error("Export verification reference frame was not captured");
    }
    const frame = await grabVideoFrame(blob, run.referenceCanvas);
    const width = run.referenceCanvas.width;
    const height = run.referenceCanvas.height;
    const referenceContext = run.referenceCanvas.getContext("2d", { willReadFrequently: true });
    const reference = referenceContext.getImageData(0, 0, width, height).data;
    const exported = frame.imageData.data;

    const normalMae = imageMae(reference, exported, width, height, (x, y) => y * width + x);
    const verticalMae = imageMae(
      reference, exported, width, height,
      (x, y) => (height - 1 - y) * width + x
    );
    const horizontalMae = imageMae(
      reference, exported, width, height,
      (x, y) => y * width + (width - 1 - x)
    );
    const bands = bandMae(reference, exported, width, height);
    const renderedOrder = state.layers.map((layer) => layer.id);
    const expectedOrder = ["sky", "far", "near", "trees", "road"];
    const orderMatches = expectedOrder.every((id, index) => renderedOrder[index] === id);
    const notVerticallyFlipped =
      normalMae + 7 < verticalMae && normalMae + 7 < horizontalMae;
    const passed = orderMatches && notVerticallyFlipped && normalMae < 28;
    const audioTrackCount = run.stream.getAudioTracks().length;

    return {
      passed,
      expectedOrder,
      renderedOrder,
      orderMatches,
      notVerticallyFlipped,
      verticalFlipMae: verticalMae,
      horizontalFlipMae: horizontalMae,
      frameMae: normalMae,
      bandMae: bands,
      duration: frame.duration,
      videoWidth: frame.width,
      videoHeight: frame.height,
      mimeType: blob.type,
      sizeBytes: blob.size,
      audioExpected: true,
      audioTrackCount,
      recordingDurationMs: run.recordingDurationMs,
      referenceCamera: run.referenceCamera,
      checkedAt: new Date().toISOString(),
    };
  }

  function measureParallax(from = -PAN_LIMIT * 0.6, to = PAN_LIMIT * 0.6) {
    return state.layers.map((layer) => {
      const startOffset = offsetFor(layer, from);
      const endOffset = offsetFor(layer, to);
      return {
        id: layer.id,
        name: layer.name,
        depth: layer.depth,
        blur: layer.blur,
        startOffset,
        endOffset,
        delta: endOffset - startOffset,
        absoluteDelta: Math.abs(endOffset - startOffset),
      };
    });
  }

  window.__street = {
    get state() {
      return {
        mode: state.mode,
        camera: state.camera,
        targetCamera: state.targetCamera,
        recording: state.recording,
        audioEnabled: state.audioEnabled,
      };
    },
    getLayers() {
      return state.layers.map((layer) => ({
        id: layer.id,
        name: layer.name,
        depth: layer.depth,
        blur: layer.blur,
      }));
    },
    getLayerOrder() {
      return state.layers.map((layer) => layer.id);
    },
    getOffsets(camera = state.camera) {
      return currentOffsets(camera);
    },
    measureParallax,
    setCamera(value) {
      if (state.recording) return false;
      setCamera(Number(value), true);
      draw();
      return state.camera;
    },
    setMode(mode) {
      if (state.recording || !["day", "night"].includes(mode)) return false;
      state.mode = mode;
      document.querySelectorAll(".day-choice").forEach((choice) => {
        const active = choice.dataset.mode === mode;
        choice.classList.toggle("is-active", active);
        choice.setAttribute("aria-pressed", String(active));
      });
      draw();
      setAmbienceMode();
      return state.mode;
    },
    async exportVideo() {
      return startExport();
    },
    getLastExport() {
      return state.lastExportReport;
    },
    getAudioInfo() {
      return {
        contextState: state.audioContext?.state || "not-created",
        monitorEnabled: state.audioEnabled,
        mediaTrackCount: state.mediaDestination?.stream?.getAudioTracks?.().length || 0,
      };
    },
  };

  // Export analysis and the public verification API end here.
})();
