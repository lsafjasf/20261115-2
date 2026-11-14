(function () {
  "use strict";

  const G = window.PosterGrid;
  const POSTER = { width: 1080, height: 1350 };
  const FONT_STACKS = {
    sans: '"Helvetica Neue", "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", "WQY MicroHei", Arial, sans-serif',
    display:
      '"Arial Black", "Helvetica Neue", "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", "WQY MicroHei", sans-serif',
    serif: 'Georgia, "Songti SC", "SimSun", "WQY MicroHei", serif',
    mono: '"SFMono-Regular", "Roboto Mono", "DejaVu Sans Mono", "WQY MicroHei", monospace'
  };
  const PALETTE = {
    ink: "#1d1e18",
    paper: "#f3efe3",
    coral: "#e95435",
    lime: "#d9ef7a",
    blue: "#3258f5"
  };
  const HANDLES = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
  const HANDLE_SIZE = 11;
  const HISTORY_LIMIT = 60;

  const $ = (selector, parent) => (parent || document).querySelector(selector);
  const $$ = (selector, parent) => [...(parent || document).querySelectorAll(selector)];

  const dom = {
    canvas: $("#posterCanvas"),
    canvasShell: $("#canvasShell"),
    canvasStage: $("#canvasStage"),
    layerList: $("#layerList"),
    layerCount: $("#layerCount"),
    propertiesPanel: $("#propertiesPanel"),
    selectionType: $("#selectionType"),
    columnSelector: $("#columnSelector"),
    columnHint: $("#columnHint"),
    gutterRange: $("#gutterRange"),
    gutterValue: $("#gutterValue"),
    baselineRange: $("#baselineRange"),
    baselineValue: $("#baselineValue"),
    safeMarginRange: $("#safeMarginRange"),
    safeMarginValue: $("#safeMarginValue"),
    gridToggle: $("#gridToggle"),
    snapToggle: $("#snapToggle"),
    undoButton: $("#undoButton"),
    redoButton: $("#redoButton"),
    resetButton: $("#resetButton"),
    exportJsonButton: $("#exportJsonButton"),
    exportPngButton: $("#exportPngButton"),
    addTitleButton: $("#addTitleButton"),
    addTextButton: $("#addTextButton"),
    addImageButton: $("#addImageButton"),
    imageInput: $("#imageInput"),
    safetyAlert: $("#safetyAlert"),
    safetyAlertText: $("#safetyAlertText"),
    safeStatus: $("#safeStatus"),
    safeStatusDetail: $("#safeStatusDetail"),
    columnStatus: $("#columnStatus"),
    columnGeometry: $("#columnGeometry"),
    snapStatus: $("#snapStatus"),
    gridSummary: $("#gridSummary"),
    zoomLabel: $("#zoomLabel"),
    toast: $("#toast")
  };

  const ctx = dom.canvas.getContext("2d");
  const imageCache = new Map();
  const view = { scale: 1, dpr: 1 };
  let grid = G.computeGrid({ ...POSTER, ...createInitialSettings() });
  let dragState = null;
  let rangeBase = null;
  let editorSnapshot = null;
  let history = [];
  let redoStack = [];
  let guideState = null;
  let toastTimer = null;
  let exportBusy = false;
  let uploadTargetId = null;

  function createInitialSettings() {
    return {
      columns: 3,
      gutter: 24,
      baseline: 18,
      safeMargin: 64,
      showGrid: true,
      snap: true
    };
  }

  function createDefaultElements(layoutGrid) {
    const span = (start, count, top, height) => {
      const area = G.rectForSpan(start, count, layoutGrid);
      return { x: area.x, y: top, width: area.width, height };
    };
    return [
      {
        id: "kicker",
        name: "活动标识",
        type: "text",
        ...span(0, 3, 82, 36),
        text: "WEEKEND ASSEMBLY / VOL. 06",
        fontSize: 26,
        fontFamily: "sans",
        fontWeight: 750,
        lineHeight: 1.15,
        letterSpacing: 3.4,
        color: PALETTE.coral,
        align: "left",
        verticalAlign: "center"
      },
      {
        id: "title",
        name: "主标题",
        type: "text",
        ...span(0, 3, 136, 252),
        text: "周六\n引力场",
        fontSize: 150,
        fontFamily: "display",
        fontWeight: 900,
        lineHeight: 0.9,
        letterSpacing: -3,
        color: PALETTE.ink,
        align: "left",
        verticalAlign: "top"
      },
      {
        id: "hero-image",
        name: "主视觉",
        type: "image",
        ...span(0, 2, 424, 504),
        src: "./assets/poster-art.svg",
        fit: "cover",
        radius: 0,
        opacity: 1,
        alt: "珊瑚色太阳、轨道与荧光球体组成的活动主视觉"
      },
      {
        id: "manifesto",
        name: "活动宣言",
        type: "text",
        ...span(2, 1, 424, 504),
        text: "把周末\n变成一场\n引力实验。",
        fontSize: 43,
        fontFamily: "display",
        fontWeight: 750,
        lineHeight: 1.3,
        letterSpacing: -0.4,
        color: PALETTE.ink,
        align: "left",
        verticalAlign: "center"
      },
      {
        id: "details",
        name: "时间地点",
        type: "text",
        ...span(0, 2, 964, 126),
        text: "11.15 SAT / 14:00—22:00\n东岸仓库 · 城市共振计划",
        fontSize: 27,
        fontFamily: "sans",
        fontWeight: 600,
        lineHeight: 1.55,
        letterSpacing: 0.2,
        color: PALETTE.ink,
        align: "left",
        verticalAlign: "center"
      },
      {
        id: "cta",
        name: "参与入口",
        type: "text",
        ...span(2, 1, 964, 126),
        text: "立即加入\nRESERVE A SPOT ↗",
        fontSize: 22,
        fontFamily: "sans",
        fontWeight: 700,
        lineHeight: 1.5,
        letterSpacing: 0.5,
        color: "#f7f1e3",
        background: PALETTE.ink,
        padding: 22,
        align: "left",
        verticalAlign: "center"
      },
      {
        id: "footer",
        name: "页脚信息",
        type: "text",
        ...span(0, 3, 1198, 54),
        text: "免费入场 · 凭海报签到    /    @GRAVITYFIELD",
        fontSize: 17,
        fontFamily: "sans",
        fontWeight: 600,
        lineHeight: 1.4,
        letterSpacing: 2,
        color: "#5d5d51",
        align: "left",
        verticalAlign: "center"
      }
    ];
  }

  const state = {
    settings: createInitialSettings(),
    elements: [],
    selectedId: "title"
  };
  state.elements = createDefaultElements(grid);

  function uid(prefix) {
    return `${prefix || "el"}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function round(value, precision) {
    const factor = 10 ** (precision || 0);
    return Math.round(value * factor) / factor;
  }

  function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function getElement(id) {
    return state.elements.find((element) => element.id === id) || null;
  }

  function getSelected() {
    return getElement(state.selectedId);
  }

  function captureDocument() {
    return {
      settings: deepClone(state.settings),
      elements: deepClone(state.elements)
    };
  }

  function restoreDocument(snapshot) {
    state.settings = deepClone(snapshot.settings);
    state.elements = deepClone(snapshot.elements);
    if (!getElement(state.selectedId)) {
      state.selectedId = state.elements.at(-1)?.id || null;
    }
    grid = G.computeGrid({ ...POSTER, ...state.settings });
    syncAll();
  }

  function documentsEqual(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
  }

  function pushHistory(before, label) {
    if (!before || documentsEqual(before, captureDocument())) return false;
    history.push({ snapshot: before, label });
    if (history.length > HISTORY_LIMIT) history.shift();
    redoStack = [];
    updateHistoryButtons();
    return true;
  }

  function beginEdit() {
    if (!editorSnapshot) editorSnapshot = captureDocument();
  }

  function endEdit(label) {
    if (!editorSnapshot) return false;
    const before = editorSnapshot;
    editorSnapshot = null;
    return pushHistory(before, label || "调整版式");
  }

  function runEdit(mutator, label) {
    if (editorSnapshot) endEdit(label);
    const before = captureDocument();
    mutator();
    grid = G.computeGrid({ ...POSTER, ...state.settings });
    syncAll();
    return pushHistory(before, label);
  }

  function undo() {
    if (dragState) return;
    if (editorSnapshot) endEdit();
    if (!history.length) {
      showToast("没有可撤销的操作");
      return;
    }
    const entry = history.pop();
    redoStack.push({ snapshot: captureDocument(), label: entry.label });
    restoreDocument(entry.snapshot);
    updateHistoryButtons();
    showToast(`已撤销：${entry.label}`);
  }

  function redo() {
    if (dragState) return;
    if (editorSnapshot) endEdit();
    if (!redoStack.length) {
      showToast("没有可重做的操作");
      return;
    }
    const entry = redoStack.pop();
    history.push({ snapshot: captureDocument(), label: entry.label });
    restoreDocument(entry.snapshot);
    updateHistoryButtons();
    showToast(`已重做：${entry.label}`);
  }

  function updateHistoryButtons() {
    dom.undoButton.disabled = history.length === 0;
    dom.redoButton.disabled = redoStack.length === 0;
    dom.undoButton.title = history.length
      ? `撤销：${history.at(-1).label} (Ctrl+Z)`
      : "撤销 (Ctrl+Z)";
    dom.redoButton.title = redoStack.length
      ? `重做：${redoStack.at(-1).label} (Ctrl+Shift+Z)`
      : "重做 (Ctrl+Shift+Z)";
  }

  let toastAnimation = 0;
  function showToast(message, options) {
    const settings = options || {};
    clearTimeout(toastTimer);
    toastAnimation += 1;
    dom.toast.textContent = message;
    dom.toast.classList.toggle("is-error", Boolean(settings.error));
    dom.toast.classList.add("is-visible");
    toastTimer = setTimeout(() => {
      dom.toast.classList.remove("is-visible");
    }, settings.duration || 2600);
  }

  window.posterApp = {
    getState() {
      return {
        settings: deepClone(state.settings),
        elements: deepClone(state.elements),
        grid: G.serializeGrid(grid),
        selectedId: state.selectedId,
        historyDepth: history.length,
        toastAnimation
      };
    },
    undo,
    redo
  };

  function fontString(element) {
    const family = FONT_STACKS[element.fontFamily] || FONT_STACKS.sans;
    return `${element.fontWeight || 500} ${Math.max(8, element.fontSize || 24)}px ${family}`;
  }

  function getImageEntry(src) {
    if (!src) return null;
    if (imageCache.has(src)) return imageCache.get(src);
    const image = new Image();
    const entry = { image, ready: false, failed: false, promise: null };
    entry.promise = new Promise((resolve) => {
      image.onload = () => {
        entry.ready = true;
        resolve(entry);
        if (!exportBusy) drawCanvas();
      };
      image.onerror = () => {
        entry.failed = true;
        resolve(entry);
        if (!exportBusy) drawCanvas();
      };
    });
    image.decoding = "async";
    image.src = src;
    imageCache.set(src, entry);
    return entry;
  }

  async function ensureImagesReady(elements) {
    const sources = elements.filter((element) => element.type === "image").map((element) => element.src);
    await Promise.all(sources.map((src) => getImageEntry(src)?.promise));
  }

  function roundedPath(context, x, y, width, height, radius) {
    const r = clamp(Number(radius) || 0, 0, Math.min(width, height) / 2);
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

  function drawImageCover(context, image, element) {
    const sourceWidth = image.naturalWidth || image.width;
    const sourceHeight = image.naturalHeight || image.height;
    if (!sourceWidth || !sourceHeight) return;
    const targetRatio = element.width / element.height;
    const sourceRatio = sourceWidth / sourceHeight;
    let sx = 0;
    let sy = 0;
    let sw = sourceWidth;
    let sh = sourceHeight;

    if (element.fit === "contain") {
      const scale = Math.min(element.width / sourceWidth, element.height / sourceHeight);
      const width = sourceWidth * scale;
      const height = sourceHeight * scale;
      context.drawImage(
        image,
        element.x + (element.width - width) / 2,
        element.y + (element.height - height) / 2,
        width,
        height
      );
      return;
    }

    if (sourceRatio > targetRatio) {
      sw = sourceHeight * targetRatio;
      sx = (sourceWidth - sw) / 2;
    } else {
      sh = sourceWidth / targetRatio;
      sy = (sourceHeight - sh) / 2;
    }
    context.drawImage(image, sx, sy, sw, sh, element.x, element.y, element.width, element.height);
  }

  function drawImageElement(context, element) {
    const entry = getImageEntry(element.src);
    context.save();
    context.globalAlpha = clamp(element.opacity ?? 1, 0, 1);
    roundedPath(context, element.x, element.y, element.width, element.height, element.radius);
    context.clip();
    if (entry?.ready) {
      drawImageCover(context, entry.image, element);
    } else {
      const gradient = context.createLinearGradient(
        element.x,
        element.y,
        element.x + element.width,
        element.y + element.height
      );
      gradient.addColorStop(0, "#252a20");
      gradient.addColorStop(0.6, "#5c6447");
      gradient.addColorStop(1, "#e95435");
      context.fillStyle = gradient;
      context.fillRect(element.x, element.y, element.width, element.height);
      context.fillStyle = "rgba(247,241,227,.74)";
      context.font = `600 18px ${FONT_STACKS.sans}`;
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(entry?.failed ? "IMAGE UNAVAILABLE" : "LOADING IMAGE", element.x + element.width / 2, element.y + element.height / 2);
    }
    context.restore();
  }

  function wrapParagraph(context, paragraph, maxWidth) {
    if (!paragraph) return [""];
    const lines = [];
    let line = "";
    for (const character of paragraph) {
      const candidate = line + character;
      if (line && context.measureText(candidate).width > maxWidth) {
        lines.push(line.trimEnd());
        line = character.trimStart();
      } else {
        line = candidate;
      }
    }
    if (line) lines.push(line.trimEnd());
    return lines.length ? lines : [""];
  }

  function measureBlock(context, text, maxWidth) {
    return text.split("\n").flatMap((paragraph) => wrapParagraph(context, paragraph, maxWidth));
  }

  function fitTextBlock(context, element) {
    const padding = Number(element.padding) || 0;
    const availableWidth = Math.max(12, element.width - padding * 2);
    const availableHeight = Math.max(12, element.height - padding * 2);
    let fontSize = Math.max(8, Number(element.fontSize) || 24);
    const minimum = Math.max(8, fontSize * 0.48);
    let lines = [];
    let lineHeight = 1;

    while (fontSize >= minimum) {
      context.font = fontString({ ...element, fontSize });
      context.letterSpacing = `${Number(element.letterSpacing) || 0}px`;
      lineHeight = fontSize * (Number(element.lineHeight) || 1.2);
      lines = measureBlock(context, String(element.text ?? ""), availableWidth);
      const maxLines = Math.max(1, Math.floor(availableHeight / lineHeight + 0.15));
      if (lines.length <= maxLines) break;
      fontSize = Math.max(minimum, fontSize - Math.max(1, fontSize * 0.035));
      if (fontSize === minimum) break;
    }

    context.font = fontString({ ...element, fontSize });
    context.letterSpacing = `${Number(element.letterSpacing) || 0}px`;
    return { fontSize, lineHeight, lines, padding, availableHeight };
  }

  function drawTextElement(context, element) {
    if (element.background) {
      roundedPath(context, element.x, element.y, element.width, element.height, element.radius);
      context.fillStyle = element.background;
      context.fill();
    }
    if (element.borderColor) {
      roundedPath(context, element.x, element.y, element.width, element.height, element.radius);
      context.strokeStyle = element.borderColor;
      context.lineWidth = 1;
      context.stroke();
    }

    const layout = fitTextBlock(context, element);
    const textHeight = layout.lines.length * layout.lineHeight;
    const verticalOffset =
      element.verticalAlign === "center"
        ? (element.height - textHeight) / 2
        : element.verticalAlign === "bottom"
          ? element.height - textHeight - layout.padding
          : layout.padding;
    const textX =
      element.align === "center"
        ? element.x + element.width / 2
        : element.align === "right"
          ? element.x + element.width - layout.padding
          : element.x + layout.padding;
    context.save();
    context.fillStyle = element.color || PALETTE.ink;
    context.textBaseline = "top";
    context.textAlign = element.align || "left";
    const baselineNudge = layout.fontSize * 0.1;
    layout.lines.forEach((line, index) => {
      context.fillText(
        line,
        textX,
        element.y + verticalOffset + index * layout.lineHeight + baselineNudge
      );
    });
    context.restore();
  }

  function drawElement(context, element) {
    if (element.type === "image") {
      drawImageElement(context, element);
    } else {
      drawTextElement(context, element);
    }
  }

  function drawPaper(context) {
    const gradient = context.createLinearGradient(0, 0, POSTER.width, POSTER.height);
    gradient.addColorStop(0, "#f7f2e7");
    gradient.addColorStop(1, "#eee8d9");
    context.fillStyle = gradient;
    context.fillRect(0, 0, POSTER.width, POSTER.height);

    context.save();
    context.fillStyle = "rgba(29,30,24,.055)";
    context.font = `600 10px ${FONT_STACKS.sans}`;
    context.letterSpacing = "1.4px";
    context.textAlign = "left";
    context.fillText("GRAVITY FIELD No.06", 64, 45);
    context.textAlign = "right";
    context.fillText("1080 × 1350 / CMYK READY", POSTER.width - 64, 45);
    context.restore();
  }

  function drawGridOverlay(context) {
    if (!state.settings.showGrid) return;
    context.save();

    context.fillStyle = "rgba(233,84,53,.026)";
    context.beginPath();
    context.rect(0, 0, POSTER.width, POSTER.height);
    context.rect(
      grid.safeRect.x,
      grid.safeRect.y,
      grid.safeRect.width,
      grid.safeRect.height
    );
    context.fill("evenodd");

    grid.columnRects.forEach((column) => {
      context.fillStyle = "rgba(233,84,53,.018)";
      context.fillRect(column.x, column.y, column.width, column.height);
    });

    context.lineWidth = 0.8;
    grid.baselineLines.forEach((y, index) => {
      context.strokeStyle =
        index % 4 === 0 ? "rgba(50,88,245,.13)" : "rgba(50,88,245,.065)";
      context.beginPath();
      context.moveTo(grid.contentLeft, y);
      context.lineTo(grid.contentRight, y);
      context.stroke();
    });

    grid.columnRects.forEach((column) => {
      context.strokeStyle = "rgba(233,84,53,.38)";
      context.lineWidth = 1;
      context.setLineDash([7, 7]);
      context.beginPath();
      context.moveTo(column.x, grid.contentTop);
      context.lineTo(column.x, grid.contentBottom);
      context.stroke();
      context.setLineDash([]);

      context.fillStyle = "rgba(139,56,36,.74)";
      context.font = `700 10px ${FONT_STACKS.sans}`;
      context.letterSpacing = "1.5px";
      context.textAlign = "left";
      context.textBaseline = "alphabetic";
      context.fillText(String(column.index + 1).padStart(2, "0"), column.x + 3, grid.contentTop - 10);
    });
    context.restore();
  }

  function drawCornerMark(context, x, y, sx, sy) {
    const length = 15;
    context.beginPath();
    context.moveTo(x, y + sy * length);
    context.lineTo(x, y);
    context.lineTo(x + sx * length, y);
    context.stroke();
  }

  function drawSafeArea(context) {
    context.save();
    context.strokeStyle = "rgba(233,84,53,.76)";
    context.lineWidth = 1.25;
    context.setLineDash([10, 8]);
    context.strokeRect(
      grid.safeRect.x,
      grid.safeRect.y,
      grid.safeRect.width,
      grid.safeRect.height
    );
    context.setLineDash([]);
    context.strokeStyle = "rgba(233,84,53,.95)";
    drawCornerMark(context, grid.contentLeft, grid.contentTop, 1, 1);
    drawCornerMark(context, grid.contentRight, grid.contentTop, -1, 1);
    drawCornerMark(context, grid.contentLeft, grid.contentBottom, 1, -1);
    drawCornerMark(context, grid.contentRight, grid.contentBottom, -1, -1);

    context.fillStyle = "rgba(139,56,36,.68)";
    context.font = `650 9px ${FONT_STACKS.sans}`;
    context.letterSpacing = "1.1px";
    context.textAlign = "left";
    context.textBaseline = "bottom";
    context.fillText(`${state.settings.safeMargin}px SAFE MARGIN`, grid.contentLeft, grid.contentTop - 5);
    context.restore();
  }

  function drawGuideLabel(context, text, x, y) {
    context.save();
    context.font = `700 10px ${FONT_STACKS.sans}`;
    const width = context.measureText(text).width + 12;
    context.fillStyle = "rgba(29,30,24,.9)";
    context.fillRect(x - width / 2, y - 19, width, 15);
    context.fillStyle = "#f5efe0";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(text, x, y - 11);
    context.restore();
  }

  function drawDragGuides(context) {
    if (!guideState) return;
    context.save();
    context.strokeStyle = "rgba(233,84,53,.9)";
    context.lineWidth = 1.2;
    context.setLineDash([4, 5]);
    (guideState.x || []).forEach((x) => {
      context.beginPath();
      context.moveTo(x, grid.contentTop);
      context.lineTo(x, grid.contentBottom);
      context.stroke();
    });
    context.strokeStyle = "rgba(50,88,245,.9)";
    (guideState.y || []).forEach((y) => {
      context.beginPath();
      context.moveTo(grid.contentLeft, y);
      context.lineTo(grid.contentRight, y);
      context.stroke();
    });
    context.setLineDash([]);
    if (guideState.x?.length) {
      drawGuideLabel(context, `${round(guideState.x[0])} px`, guideState.x[0], grid.contentTop + 22);
    }
    if (guideState.y?.length) {
      drawGuideLabel(context, `${round(guideState.y[0])} px`, grid.contentLeft + 30, guideState.y[0]);
    }
    context.restore();
  }

  function handleCenters(element) {
    const x = element.x;
    const y = element.y;
    const width = element.width;
    const height = element.height;
    return {
      nw: { x, y },
      n: { x: x + width / 2, y },
      ne: { x: x + width, y },
      e: { x: x + width, y: y + height / 2 },
      se: { x: x + width, y: y + height },
      s: { x: x + width / 2, y: y + height },
      sw: { x, y: y + height },
      w: { x, y: y + height / 2 }
    };
  }

  function drawSelection(context, editor) {
    const selected = getSelected();
    if (!selected) return;

    const overflow = !G.isInsideSafe(selected, grid.safeRect, 0.6);
    context.save();
    context.strokeStyle = overflow ? "rgba(184,53,28,.95)" : "rgba(50,88,245,.92)";
    context.lineWidth = 1.8;
    context.setLineDash(overflow ? [6, 4] : []);
    context.strokeRect(selected.x, selected.y, selected.width, selected.height);
    context.setLineDash([]);

    if (editor) {
      const centers = handleCenters(selected);
      HANDLES.forEach((key) => {
        const point = centers[key];
        context.fillStyle = "#ffffff";
        context.strokeStyle = overflow ? PALETTE.coral : PALETTE.blue;
        context.lineWidth = 1.8;
        context.beginPath();
        context.rect(
          point.x - HANDLE_SIZE / 2,
          point.y - HANDLE_SIZE / 2,
          HANDLE_SIZE,
          HANDLE_SIZE
        );
        context.fill();
        context.stroke();
      });

      context.font = `650 9px ${FONT_STACKS.sans}`;
      const label = `${selected.name || "对象"} · ${round(selected.width)} × ${round(selected.height)}`;
      const labelWidth = context.measureText(label).width;
      context.fillStyle = overflow ? "rgba(184,53,28,.94)" : "rgba(50,88,245,.92)";
      context.fillRect(selected.x, Math.max(18, selected.y - 17), labelWidth + 18, 16);
      context.fillStyle = "#fff";
      context.textAlign = "left";
      context.textBaseline = "middle";
      context.fillText(label, selected.x + 9, Math.max(18, selected.y - 9));
    }

    if (overflow) {
      const sideLabels = G.describeOverflow(selected, grid.safeRect).join("、");
      drawGuideLabel(context, `超出安全区：${sideLabels}`, selected.x + selected.width / 2, selected.y + 1);
    }
    context.restore();
  }

  function paintScene(context, options) {
    const settings = options || {};
    context.clearRect(0, 0, POSTER.width, POSTER.height);
    drawPaper(context);
    state.elements.forEach((element) => drawElement(context, element));
    if (settings.editor) {
      drawGridOverlay(context);
      drawSafeArea(context);
      if (state.settings.snap) drawDragGuides(context);
      state.elements.forEach((element) => {
        if (!G.isInsideSafe(element, grid.safeRect, 0.6)) drawOverflowMarker(context, element);
      });
      drawSelection(context, settings.editor);
    }
  }

  function drawOverflowMarker(context, element) {
    context.save();
    context.strokeStyle = "rgba(184,53,28,.7)";
    context.lineWidth = 1.4;
    context.setLineDash([4, 4]);
    context.strokeRect(element.x, element.y, element.width, element.height);
    context.setLineDash([]);
    context.fillStyle = "rgba(184,53,28,.9)";
    const x = clamp(element.x + element.width - 13, 8, POSTER.width - 20);
    const y = clamp(element.y + 14, 18, POSTER.height - 10);
    context.beginPath();
    context.moveTo(x, y - 8);
    context.lineTo(x + 7, y + 4);
    context.lineTo(x - 7, y + 4);
    context.closePath();
    context.fill();
    context.fillStyle = "#fff";
    context.font = `800 9px ${FONT_STACKS.sans}`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText("!", x, y);
    context.restore();
  }

  function drawCanvas() {
    if (!dom.canvas.width || !dom.canvas.height) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, dom.canvas.width, dom.canvas.height);
    ctx.setTransform(
      dom.canvas.width / POSTER.width,
      0,
      0,
      dom.canvas.height / POSTER.height,
      0,
      0
    );
    paintScene(ctx, { editor: true });
  }

  function setRangeFill(input) {
    const min = Number(input.min);
    const max = Number(input.max);
    const value = Number(input.value);
    const percent = ((value - min) / Math.max(1, max - min)) * 100;
    input.style.setProperty("--range-fill", `${clamp(percent, 0, 100)}%`);
  }

  function selectionSpan(element) {
    return G.inferSpan(element, grid);
  }

  function syncGridChrome() {
    dom.gutterRange.value = state.settings.gutter;
    dom.baselineRange.value = state.settings.baseline;
    dom.safeMarginRange.value = state.settings.safeMargin;
    dom.gutterValue.textContent = `${state.settings.gutter} px`;
    dom.baselineValue.textContent = `${state.settings.baseline} px`;
    dom.safeMarginValue.textContent = `${state.settings.safeMargin} px`;
    setRangeFill(dom.gutterRange);
    setRangeFill(dom.baselineRange);
    setRangeFill(dom.safeMarginRange);
    dom.gridToggle.checked = state.settings.showGrid;
    dom.snapToggle.checked = state.settings.snap;

    $$("button", dom.columnSelector).forEach((button) => {
      const active = Number(button.dataset.columns) === state.settings.columns;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    dom.columnHint.textContent =
      state.settings.columns === 3 ? "内容区三等分" : "内容区四等分";
    dom.columnStatus.textContent = `${state.settings.columns} 栏`;
    dom.columnGeometry.textContent = `单栏 ${round(grid.columnWidth, 1)} px / 高 ${round(
      grid.contentBottom - grid.contentTop
    )} px`;
    dom.snapStatus.textContent = state.settings.snap ? "开启" : "关闭";
    dom.gridSummary.textContent = `${state.settings.columns} 栏 · ${state.settings.gutter} px 栏距`;
    dom.safeStatusDetail.textContent = `${state.settings.safeMargin} px 内边距 · ${state.settings.baseline} px 基线`;
  }

  function updateSafety() {
    const overflow = state.elements.filter(
      (element) => !G.isInsideSafe(element, grid.safeRect, 0.6)
    );
    dom.safetyAlert.hidden = overflow.length === 0;
    dom.safeStatus.classList.toggle("has-warning", overflow.length > 0);
    if (overflow.length) {
      const names = overflow.map((element) => element.name || element.id).join("、");
      dom.safetyAlertText.textContent = `${names} 需要回到 ${state.settings.safeMargin}px 安全区内`;
      const strong = $("strong", dom.safeStatus);
      strong.textContent = `${overflow.length} 个元素越界`;
      dom.safeStatusDetail.textContent = names;
    } else {
      const strong = $("strong", dom.safeStatus);
      strong.textContent = "全部内容在安全区内";
      dom.safeStatusDetail.textContent = `${state.settings.safeMargin} px 内边距 · ${state.settings.baseline} px 基线`;
    }
  }

  function displayElementName(element) {
    if (element.type === "image") return element.name || "图片";
    const firstLine = String(element.text || "").split("\n")[0].trim();
    return element.name || firstLine || "文本";
  }

  function renderLayers() {
    dom.layerCount.textContent = state.elements.length;
    if (!state.elements.length) {
      dom.layerList.innerHTML = '<p class="helper-text">还没有内容，使用快捷添加开始排版。</p>';
      return;
    }
    dom.layerList.innerHTML = [...state.elements]
      .reverse()
      .map((element) => {
        const span = selectionSpan(element);
        const selected = element.id === state.selectedId;
        const name = escapeHtml(displayElementName(element));
        const subtitle = element.type === "image" ? "图片" : `${element.fontSize || 24}px 文本`;
        const thumb =
          element.type === "image"
            ? `<span class="layer-thumb is-image" aria-hidden="true">
                <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"></rect><circle cx="9" cy="10" r="2"></circle><path d="m4 18 5-5 4 4 3-3 4 4"></path></svg>
              </span>`
            : `<span class="layer-thumb" style="--thumb-bg:${escapeHtml(
                element.background || "#e9e2d1"
              )}" aria-hidden="true">T</span>`;
        return `<button class="layer-item ${
          selected ? "is-selected" : ""
        }" type="button" data-id="${escapeHtml(element.id)}" aria-pressed="${selected}">
          ${thumb}
          <span class="layer-copy">
            <strong>${name}</strong>
            <span>${escapeHtml(subtitle)}</span>
          </span>
          <span class="layer-grid-mark">${span.start + 1}·${span.span}</span>
        </button>`;
      })
      .join("");
  }

  function renderInspector() {
    const selected = getSelected();
    if (!selected) {
      dom.selectionType.textContent = "未选择";
      dom.propertiesPanel.innerHTML = `<div class="empty-inspector">
        <span class="empty-mark">+</span>
        <p>在画布或图层列表中选择一个对象</p>
      </div>`;
      return;
    }

    dom.selectionType.textContent = selected.type === "image" ? "图片" : "文字";
    const span = selectionSpan(selected);
    const isOverflow = !G.isInsideSafe(selected, grid.safeRect, 0.6);
    const commonInfo = `<div class="inspector-row three-up">
      <div class="mini-field"><label>栏位</label><output>${span.start + 1} / ${grid.columns}</output></div>
      <div class="mini-field"><label>跨栏</label><output>${span.span} 栏</output></div>
      <div class="mini-field"><label>基线行</label><output>${Math.round(
        (selected.y - grid.contentTop) / grid.baseline
      )}</output></div>
    </div>
    <div class="snap-legend">
      <span class="snap-chip">栏边界吸附</span>
      <span class="snap-chip is-blue">基线吸附</span>
    </div>
    ${isOverflow ? `<div class="inspector-notice">⚠<div><strong>超出安全边距</strong>${escapeHtml(
      G.describeOverflow(selected, grid.safeRect).join("、")
    )}越界，请将对象移回虚线安全区。</div></div>` : ""}`;

    const textFields = `<div class="inspector-field">
      <label for="contentText">内容</label>
      <textarea id="contentText" data-prop="text">${escapeHtml(selected.text || "")}</textarea>
    </div>
    <div class="inspector-row">
      <div class="inspector-field">
        <label for="fontSizeInput">字号</label>
        <input id="fontSizeInput" type="number" min="10" max="220" step="1" data-prop="fontSize" data-numeric="true" value="${Number(
          selected.fontSize || 24
        )}" />
      </div>
      <div class="inspector-field">
        <label for="fontColorInput">颜色</label>
        <input id="fontColorInput" type="color" data-prop="color" value="${escapeHtml(
          selected.color || PALETTE.ink
        )}" />
      </div>
    </div>
    <div class="inspector-row">
      <div class="inspector-field">
        <label for="alignSelect">对齐</label>
        <select id="alignSelect" data-prop="align">
          <option value="left" ${selected.align === "left" ? "selected" : ""}>左对齐</option>
          <option value="center" ${selected.align === "center" ? "selected" : ""}>居中</option>
          <option value="right" ${selected.align === "right" ? "selected" : ""}>右对齐</option>
        </select>
      </div>
      <div class="inspector-field">
        <label for="weightSelect">字重</label>
        <select id="weightSelect" data-prop="fontWeight" data-numeric="true">
          ${[500, 600, 700, 750, 800, 900]
            .map(
              (weight) =>
                `<option value="${weight}" ${
                  Number(selected.fontWeight) === weight ? "selected" : ""
                }>${weight}</option>`
            )
            .join("")}
        </select>
      </div>
    </div>`;

    const imageFields = `<div class="image-preview">
      <img src="${escapeHtml(selected.src)}" alt="${escapeHtml(selected.alt || selected.name || "图片")}" />
      <button type="button" data-action="replace-image">替换图片</button>
    </div>
    <div class="inspector-row">
      <div class="inspector-field">
        <label for="imageFitSelect">裁切方式</label>
        <select id="imageFitSelect" data-prop="fit">
          <option value="cover" ${selected.fit === "cover" ? "selected" : ""}>填满裁切</option>
          <option value="contain" ${selected.fit === "contain" ? "selected" : ""}>完整显示</option>
        </select>
      </div>
      <div class="inspector-field">
        <label for="imageOpacity">不透明度</label>
        <input id="imageOpacity" type="number" min="10" max="100" step="5" data-prop="opacity" data-scale="0.01" value="${Math.round(
          (selected.opacity ?? 1) * 100
        )}" />
      </div>
    </div>`;

    dom.propertiesPanel.innerHTML = `<div class="inspector-form">
      <div class="inspector-field">
        <label for="layerNameInput">图层名称</label>
        <input id="layerNameInput" type="text" data-prop="name" value="${escapeHtml(
          selected.name || ""
        )}" />
      </div>
      ${selected.type === "image" ? imageFields : textFields}
      ${commonInfo}
      <div class="inspector-row">
        <button class="button button-quiet" type="button" data-action="duplicate">
          复制对象
        </button>
        <button class="button button-quiet" type="button" data-action="delete">
          删除对象
        </button>
      </div>
    </div>`;
  }

  function syncAll() {
    syncGridChrome();
    renderLayers();
    renderInspector();
    updateSafety();
    updateHistoryButtons();
    drawCanvas();
  }

  function resizeCanvas() {
    const rect = dom.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.round(rect.width * dpr);
    const height = Math.round(rect.height * dpr);
    if (dom.canvas.width !== width || dom.canvas.height !== height) {
      dom.canvas.width = width;
      dom.canvas.height = height;
    }
    view.dpr = dpr;
    view.scale = rect.width / POSTER.width;
    dom.zoomLabel.textContent = `${Math.round(view.scale * 100)}% · 适应窗口`;
    drawCanvas();
  }

  function setColumns(nextColumns) {
    const columns = clamp(Number(nextColumns), 3, 4);
    if (columns === state.settings.columns) return;
    if (editorSnapshot) endEdit();
    const before = captureDocument();
    const previousGrid = grid;
    const previousCount = state.elements.length;
    state.settings.columns = columns;
    const nextGrid = G.computeGrid({ ...POSTER, ...state.settings });
    state.elements = G.remapElements(state.elements, previousGrid, nextGrid);
    grid = nextGrid;
    syncAll();
    pushHistory(before, `切换为${columns}栏`);
    showToast(
      `已切换为${columns}栏：${previousCount} 个内容图层全部保留并重新吸附`
    );
  }

  function rangeLabel(property) {
    return {
      gutter: "调整栏距",
      baseline: "调整基线",
      safeMargin: "调整安全边距"
    }[property] || "调整网格";
  }

  function beginRangeEdit(property) {
    if (rangeBase) return;
    rangeBase = {
      property,
      settings: deepClone(state.settings),
      elements: deepClone(state.elements),
      grid
    };
    beginEdit();
  }

  function applyRangeSetting(property, value) {
    beginRangeEdit(property);
    const nextSettings = { ...rangeBase.settings, [property]: Number(value) };
    const nextGrid = G.computeGrid({ ...POSTER, ...nextSettings });
    state.settings = nextSettings;
    state.elements = G.remapElements(rangeBase.elements, rangeBase.grid, nextGrid);
    grid = nextGrid;
    syncGridChrome();
    renderLayers();
    updateSafety();
    drawCanvas();
  }

  function finishRangeEdit() {
    if (!rangeBase) return;
    const label = rangeLabel(rangeBase.property);
    rangeBase = null;
    endEdit(label);
    syncAll();
  }

  function suggestedPlacement(height, desiredSpan) {
    const selected = getSelected();
    const span = clamp(Number(desiredSpan) || 2, 1, state.settings.columns);
    const start = selected ? selectionSpan(selected).start : 0;
    const proposedTop = selected
      ? selected.y + selected.height + grid.baseline
      : grid.contentTop + grid.baseline * 6;
    const y = G.snapY(proposedTop, grid);
    const safeBottom = grid.contentBottom;
    const finalY =
      y + height > safeBottom ? G.snapY(grid.contentTop + grid.baseline * 4, grid) : y;
    const area = G.rectForSpan(clamp(start, 0, state.settings.columns - span), span, grid);
    return { x: area.x, y: finalY, width: area.width, height };
  }

  function addTextElement(kind) {
    const isTitle = kind === "title";
    const height = grid.baseline * (isTitle ? 5 : 3);
    const placement = suggestedPlacement(height, isTitle ? 2 : 1);
    const element = {
      id: uid("text"),
      name: isTitle ? "新标题" : "新正文",
      type: "text",
      ...placement,
      text: isTitle ? "新标题\nNEW TITLE" : "在这里写下活动说明。",
      fontSize: isTitle ? clamp(grid.columnWidth / 5.2, 36, 82) : 18,
      fontFamily: isTitle ? "display" : "sans",
      fontWeight: isTitle ? 800 : 600,
      lineHeight: isTitle ? 1.05 : 1.5,
      letterSpacing: 0,
      color: PALETTE.ink,
      align: "left",
      verticalAlign: "center"
    };
    runEdit(() => {
      state.elements.push(element);
      state.selectedId = element.id;
    }, isTitle ? "添加标题" : "添加正文");
    showToast("新内容已吸附到当前网格");
  }

  function duplicateSelected() {
    const selected = getSelected();
    if (!selected) return;
    const clone = deepClone(selected);
    clone.id = uid(selected.type);
    clone.name = `${selected.name || "对象"} 副本`;
    clone.y = G.snapY(clone.y + grid.baseline, grid);
    runEdit(() => {
      const index = state.elements.findIndex((element) => element.id === selected.id);
      state.elements.splice(index + 1, 0, clone);
      state.selectedId = clone.id;
    }, "复制对象");
    showToast("已复制选中对象");
  }

  function deleteSelected() {
    const selected = getSelected();
    if (!selected) return;
    runEdit(() => {
      const index = state.elements.findIndex((element) => element.id === selected.id);
      state.elements.splice(index, 1);
      state.selectedId = state.elements[Math.max(0, index - 1)]?.id || state.elements[0]?.id || null;
    }, "删除对象");
    showToast("对象已删除，可使用撤销恢复");
  }

  function selectElement(id) {
    if (!getElement(id)) return;
    state.selectedId = id;
    renderLayers();
    renderInspector();
    drawCanvas();
  }

  function updateFromInspector(target) {
    const selected = getSelected();
    if (!selected) return;
    const property = target.dataset.prop;
    if (!property) return;
    let value = target.value;
    if (target.dataset.numeric === "true") value = Number(value);
    if (target.dataset.scale) value = Number(value) * Number(target.dataset.scale);
    if (property === "fontSize") value = clamp(Number(value), 10, 220);
    if (property === "opacity") value = clamp(Number(value), 0, 1);
    selected[property] = value;
    if (property === "name") {
      renderLayers();
    }
    updateSafety();
    drawCanvas();
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error || new Error("无法读取图片"));
      reader.readAsDataURL(file);
    });
  }

  function imageDimensions(src) {
    return new Promise((resolve) => {
      const image = new Image();
      image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
      image.onerror = () => resolve({ width: 1, height: 1 });
      image.src = src;
    });
  }

  async function handleImageFile(file) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      showToast("请选择图片文件", { error: true });
      return;
    }
    try {
      if (editorSnapshot) endEdit();
      const src = await readFileAsDataUrl(file);
      const dimensions = await imageDimensions(src);
      const replaceId = uploadTargetId;
      uploadTargetId = null;
      const before = captureDocument();
      if (replaceId && getElement(replaceId)) {
        const imageElement = getElement(replaceId);
        imageElement.src = src;
        imageElement.alt = file.name;
        imageElement.name = file.name.replace(/\.[^.]+$/, "");
        state.selectedId = replaceId;
        syncAll();
        pushHistory(before, "替换图片");
        showToast("图片已替换，当前网格位置保持不变");
        return;
      }

      const span = Math.min(2, state.settings.columns);
      const height = Math.max(grid.baseline * 8, grid.baseline * Math.round(240 / grid.baseline));
      const placement = suggestedPlacement(height, span);
      const aspectHeight = (placement.width / Math.max(1, dimensions.width)) * dimensions.height;
      const snappedHeight = Math.max(grid.baseline * 4, G.snapHeight(aspectHeight, grid));
      const element = {
        id: uid("image"),
        name: file.name.replace(/\.[^.]+$/, "") || "新图片",
        type: "image",
        x: placement.x,
        y: placement.y,
        width: placement.width,
        height: Math.min(snappedHeight, grid.contentBottom - placement.y),
        src,
        fit: "cover",
        radius: 0,
        opacity: 1,
        alt: file.name
      };
      state.elements.push(element);
      state.selectedId = element.id;
      syncAll();
      pushHistory(before, "添加图片");
      showToast("图片已添加并吸附到栏边界");
    } catch (error) {
      showToast(error.message || "图片处理失败", { error: true });
    } finally {
      dom.imageInput.value = "";
    }
  }

  function pointFromEvent(event) {
    const rect = dom.canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * POSTER.width,
      y: ((event.clientY - rect.top) / rect.height) * POSTER.height
    };
  }

  function hitElement(point) {
    for (let index = state.elements.length - 1; index >= 0; index -= 1) {
      const element = state.elements[index];
      if (
        point.x >= element.x &&
        point.x <= element.x + element.width &&
        point.y >= element.y &&
        point.y <= element.y + element.height
      ) {
        return element;
      }
    }
    return null;
  }

  function hitHandle(point) {
    const selected = getSelected();
    if (!selected) return null;
    const centers = handleCenters(selected);
    const threshold = Math.max(14, HANDLE_SIZE * 1.5);
    for (const key of HANDLES) {
      const center = centers[key];
      if (Math.abs(point.x - center.x) <= threshold && Math.abs(point.y - center.y) <= threshold) {
        return key;
      }
    }
    return null;
  }

  function handleCursor(handle) {
    if (!handle) return "default";
    if (handle === "n" || handle === "s") return "ns-resize";
    if (handle === "e" || handle === "w") return "ew-resize";
    if (handle === "nw" || handle === "se") return "nwse-resize";
    return "nesw-resize";
  }

  function resizeElement(initial, handle, dx, dy) {
    let left = initial.x;
    let top = initial.y;
    let right = initial.x + initial.width;
    let bottom = initial.y + initial.height;

    if (handle.includes("w")) left += dx;
    if (handle.includes("e")) right += dx;
    if (handle.includes("n")) top += dy;
    if (handle.includes("s")) bottom += dy;

    if (state.settings.snap) {
      if (handle.includes("w")) left = G.nearest(left, grid.xAnchors);
      if (handle.includes("e")) right = G.nearest(right, grid.xAnchors);
      if (handle.includes("n")) top = G.nearest(top, grid.yAnchors);
      if (handle.includes("s")) bottom = G.nearest(bottom, grid.yAnchors);
    }

    const minimumWidth = Math.min(grid.columnWidth, 44);
    const minimumHeight = grid.baseline;
    if (right - left < minimumWidth) {
      if (handle.includes("w")) {
        left = right - minimumWidth;
      } else {
        right = left + minimumWidth;
      }
    }
    if (bottom - top < minimumHeight) {
      if (handle.includes("n")) {
        top = bottom - minimumHeight;
      } else {
        bottom = top + minimumHeight;
      }
    }

    return {
      ...initial,
      x: Math.round(left),
      y: Math.round(top),
      width: Math.round(right - left),
      height: Math.round(bottom - top)
    };
  }

  function updateDraggedElement(point) {
    if (!dragState) return;
    const selected = getElement(dragState.id);
    if (!selected) return;
    const dx = point.x - dragState.start.x;
    const dy = point.y - dragState.start.y;
    if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) dragState.moved = true;

    let next;
    if (dragState.mode === "move") {
      const raw = {
        ...dragState.initial,
        x: dragState.initial.x + dx,
        y: dragState.initial.y + dy
      };
      next = state.settings.snap ? G.snapBox(raw, grid) : raw;
    } else {
      next = resizeElement(dragState.initial, dragState.handle, dx, dy);
    }
    Object.assign(selected, next);
    if (state.settings.snap) {
      guideState = {
        x: [round(selected.x), round(selected.x + selected.width)],
        y: [round(selected.y), round(selected.y + selected.height)]
      };
    } else {
      guideState = null;
    }
    updateSafety();
    drawCanvas();
  }

  function onCanvasPointerDown(event) {
    if (event.button !== undefined && event.button !== 0) return;
    event.preventDefault();
    dom.canvas.focus({ preventScroll: true });
    const point = pointFromEvent(event);
    const selected = getSelected();
    const handle = hitHandle(point);

    if (selected && handle) {
      beginEdit();
      dragState = {
        mode: "resize",
        id: selected.id,
        handle,
        start: point,
        initial: deepClone(selected),
        moved: false
      };
    } else {
      const target = hitElement(point);
      if (!target) {
        state.selectedId = null;
        renderLayers();
        renderInspector();
        drawCanvas();
        return;
      }
      if (state.selectedId !== target.id) {
        selectElement(target.id);
      }
      beginEdit();
      dragState = {
        mode: "move",
        id: target.id,
        start: point,
        initial: deepClone(target),
        moved: false
      };
    }

    dom.canvas.classList.add("is-dragging");
    dom.canvas.style.cursor = dragState.mode === "move" ? "grabbing" : handleCursor(dragState.handle);
    dom.canvas.setPointerCapture?.(event.pointerId);
  }

  function onCanvasPointerMove(event) {
    const point = pointFromEvent(event);
    if (dragState) {
      updateDraggedElement(point);
      return;
    }
    const handle = hitHandle(point);
    const target = handle ? null : hitElement(point);
    dom.canvas.style.cursor = handle ? handleCursor(handle) : target ? "grab" : "default";
  }

  function onCanvasPointerUp(event) {
    if (!dragState) return;
    const label = dragState.mode === "move" ? "拖动元素" : "缩放元素";
    const wasMoved = dragState.moved;
    dragState = null;
    guideState = null;
    dom.canvas.classList.remove("is-dragging");
    dom.canvas.style.cursor = "default";
    if (dom.canvas.hasPointerCapture?.(event.pointerId)) {
      dom.canvas.releasePointerCapture(event.pointerId);
    }
    endEdit(label);
    syncAll();
    if (!wasMoved) drawCanvas();
  }

  function nudgeSelected(direction) {
    const selected = getSelected();
    if (!selected) return;
    const before = captureDocument();
    const horizontal = direction === "left" || direction === "right";
    const anchors = horizontal ? grid.xAnchors : grid.yAnchors;
    const current = horizontal ? selected.x : selected.y;
    let index = anchors.reduce(
      (best, anchor, anchorIndex) =>
        Math.abs(anchor - current) < Math.abs(anchors[best] - current) ? anchorIndex : best,
      0
    );
    if (state.settings.snap) {
      index += direction === "left" || direction === "up" ? -1 : 1;
      index = clamp(index, 0, anchors.length - 1);
      if (horizontal) selected.x = anchors[index];
      else selected.y = anchors[index];
    } else {
      selected.x += direction === "left" ? -1 : direction === "right" ? 1 : 0;
      selected.y += direction === "up" ? -1 : direction === "down" ? 1 : 0;
    }
    syncAll();
    pushHistory(before, "微调位置");
  }

  function isTypingTarget(target) {
    return (
      target instanceof HTMLElement &&
      (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable)
    );
  }

  function onKeyDown(event) {
    const command = event.ctrlKey || event.metaKey;
    if (command && event.key.toLowerCase() === "z") {
      if (isTypingTarget(event.target)) return;
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
      return;
    }
    if (command && event.key.toLowerCase() === "y") {
      if (isTypingTarget(event.target)) return;
      event.preventDefault();
      redo();
      return;
    }
    if (isTypingTarget(event.target)) return;

    if (event.key === "Delete" || event.key === "Backspace") {
      if (!getSelected()) return;
      event.preventDefault();
      deleteSelected();
      return;
    }
    if (event.key === "Escape") {
      state.selectedId = null;
      renderLayers();
      renderInspector();
      drawCanvas();
      return;
    }
    const direction = {
      ArrowLeft: "left",
      ArrowRight: "right",
      ArrowUp: "up",
      ArrowDown: "down"
    }[event.key];
    if (direction && getSelected()) {
      event.preventDefault();
      nudgeSelected(direction);
    }
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  function buildLayoutJson() {
    return {
      schemaVersion: 1,
      document: "周六引力场",
      exportedAt: new Date().toISOString(),
      poster: {
        width: POSTER.width,
        height: POSTER.height,
        unit: "px"
      },
      grid: G.serializeGrid(grid),
      elements: state.elements.map((element, index) => {
        const span = selectionSpan(element);
        return {
          ...deepClone(element),
          order: index,
          gridPlacement: {
            columnStart: span.start + 1,
            columnSpan: span.span,
            baselineRow: Math.round((element.y - grid.contentTop) / grid.baseline)
          },
          insideSafeArea: G.isInsideSafe(element, grid.safeRect, 0.6)
        };
      }),
      safety: {
        safeMargin: state.settings.safeMargin,
        overflowing: state.elements
          .filter((element) => !G.isInsideSafe(element, grid.safeRect, 0.6))
          .map((element) => ({
            id: element.id,
            name: element.name,
            sides: G.describeOverflow(element, grid.safeRect)
          }))
      }
    };
  }

  function exportJson() {
    const json = JSON.stringify(buildLayoutJson(), null, 2);
    downloadBlob(new Blob([json], { type: "application/json;charset=utf-8" }), "gravity-field-layout.json");
    showToast("版式 JSON 已导出，包含网格、图层与安全区信息");
  }

  async function buildExportCanvas() {
    await document.fonts.ready;
    await ensureImagesReady(state.elements);
    const scale = 2;
    const canvas = document.createElement("canvas");
    canvas.width = POSTER.width * scale;
    canvas.height = POSTER.height * scale;
    const exportContext = canvas.getContext("2d");
    exportContext.setTransform(scale, 0, 0, scale, 0, 0);
    paintScene(exportContext, { editor: false });
    return canvas;
  }

  async function exportPng() {
    if (exportBusy) return;
    exportBusy = true;
    const originalLabel = dom.exportPngButton.innerHTML;
    dom.exportPngButton.disabled = true;
    dom.exportPngButton.textContent = "正在生成…";
    try {
      const canvas = await buildExportCanvas();
      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob((result) => {
          if (result) resolve(result);
          else reject(new Error("PNG 生成失败"));
        }, "image/png");
      });
      downloadBlob(blob, "gravity-field-poster@2x.png");
      showToast("PNG 已导出：2160 × 2700 px，隐藏网格与参考线");
    } catch (error) {
      showToast(error.message || "导出失败，请重试", { error: true });
    } finally {
      exportBusy = false;
      dom.exportPngButton.disabled = false;
      dom.exportPngButton.innerHTML = originalLabel;
    }
  }

  function resetDocument() {
    if (editorSnapshot) endEdit();
    const before = captureDocument();
    state.settings = createInitialSettings();
    grid = G.computeGrid({ ...POSTER, ...state.settings });
    state.elements = createDefaultElements(grid);
    state.selectedId = "title";
    syncAll();
    pushHistory(before, "重置版式");
    showToast("已恢复初始设计，可使用撤销找回修改");
  }

  function wireEvents() {
    dom.undoButton.addEventListener("click", undo);
    dom.redoButton.addEventListener("click", redo);
    dom.resetButton.addEventListener("click", resetDocument);
    dom.exportJsonButton.addEventListener("click", exportJson);
    dom.exportPngButton.addEventListener("click", exportPng);

    dom.columnSelector.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-columns]");
      if (button) setColumns(Number(button.dataset.columns));
    });

    const ranges = [
      [dom.gutterRange, "gutter"],
      [dom.baselineRange, "baseline"],
      [dom.safeMarginRange, "safeMargin"]
    ];
    ranges.forEach(([input, property]) => {
      input.addEventListener("pointerdown", () => beginRangeEdit(property));
      input.addEventListener("focus", () => beginRangeEdit(property));
      input.addEventListener("input", () => applyRangeSetting(property, input.value));
      input.addEventListener("change", finishRangeEdit);
      input.addEventListener("blur", finishRangeEdit);
    });
    window.addEventListener("pointerup", () => {
      if (rangeBase) finishRangeEdit();
    });

    dom.gridToggle.addEventListener("change", () => {
      runEdit(() => {
        state.settings.showGrid = dom.gridToggle.checked;
      }, dom.gridToggle.checked ? "显示网格" : "隐藏网格");
    });
    dom.snapToggle.addEventListener("change", () => {
      runEdit(() => {
        state.settings.snap = dom.snapToggle.checked;
      }, dom.snapToggle.checked ? "开启吸附" : "关闭吸附");
      showToast(state.settings.snap ? "自动吸附已开启" : "自动吸附已关闭");
    });

    dom.layerList.addEventListener("click", (event) => {
      const item = event.target.closest(".layer-item");
      if (item) selectElement(item.dataset.id);
    });
    dom.addTitleButton.addEventListener("click", () => addTextElement("title"));
    dom.addTextButton.addEventListener("click", () => addTextElement("text"));
    dom.addImageButton.addEventListener("click", () => {
      uploadTargetId = null;
      dom.imageInput.click();
    });
    dom.imageInput.addEventListener("change", () => handleImageFile(dom.imageInput.files?.[0]));

    dom.propertiesPanel.addEventListener("focusin", (event) => {
      if (event.target.closest("[data-prop]")) beginEdit();
    });
    dom.propertiesPanel.addEventListener("input", (event) => {
      if (event.target.matches("[data-prop]")) updateFromInspector(event.target);
    });
    dom.propertiesPanel.addEventListener("change", (event) => {
      const target = event.target;
      if (target.matches("select[data-prop], input[type='color'][data-prop]")) {
        endEdit("修改对象属性");
      }
    });
    dom.propertiesPanel.addEventListener("focusout", () => {
      setTimeout(() => {
        if (!dom.propertiesPanel.contains(document.activeElement)) endEdit("修改对象属性");
      }, 0);
    });
    dom.propertiesPanel.addEventListener("click", (event) => {
      const button = event.target.closest("[data-action]");
      if (!button) return;
      const action = button.dataset.action;
      if (action === "duplicate") duplicateSelected();
      if (action === "delete") deleteSelected();
      if (action === "replace-image") {
        uploadTargetId = state.selectedId;
        dom.imageInput.click();
      }
    });

    dom.canvas.addEventListener("pointerdown", onCanvasPointerDown);
    dom.canvas.addEventListener("pointermove", onCanvasPointerMove);
    dom.canvas.addEventListener("pointerup", onCanvasPointerUp);
    dom.canvas.addEventListener("pointercancel", onCanvasPointerUp);
    dom.canvas.addEventListener("pointerleave", () => {
      if (!dragState) dom.canvas.style.cursor = "default";
    });
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("beforeunload", () => {
      if (editorSnapshot) endEdit();
    });

    if ("ResizeObserver" in window) {
      new ResizeObserver(resizeCanvas).observe(dom.canvasShell);
    }
    window.addEventListener("resize", resizeCanvas);
  }

  wireEvents();
  syncAll();
  requestAnimationFrame(resizeCanvas);
  document.fonts?.ready.then(drawCanvas);
})();
