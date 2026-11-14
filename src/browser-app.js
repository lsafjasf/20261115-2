const { createCanvasMeasurer } = window.TypesetterMeasurer;
const { layout } = window.TypesetterLayout;
const { drawToCanvas, toSvg } = window.TypesetterRender;

const FONT_FAMILY = "'Noto Sans SC','PingFang SC',sans-serif";
const PAGE = { contentX: 40, contentY: 40, contentWidth: 520, contentHeight: 720, gutter: 18 };
const PAGE_W = 600;
const PAGE_H = 800;

const SHAPE_SETS = [
  [
    { kind: "rect", x: 120, y: 120, width: 140, height: 110, name: "photo" },
    { kind: "ellipse", x: 420, y: 360, width: 120, height: 120, name: "badge" },
  ],
  [{ kind: "rect", x: 60, y: 220, width: 120, height: 170, name: "photo-moved" }],
];

const canvas = document.getElementById("view");
const ctx = canvas.getContext("2d");
const sourceEl = document.getElementById("source");
const diagEl = document.getElementById("diag");
const unpinBtn = document.getElementById("unpin");

let shapeSetIndex = 0;
let pins = {};
let currentResult = null;
let currentMeasurer = null;
let currentPage = null;
let currentFontSize = 15;

function readOptions() {
  const fontSize = Number(document.getElementById("fontSize").value);
  const columnCount = Number(document.getElementById("columns").value);
  const lineHeight = Math.round(fontSize * 1.47);
  currentMeasurer = createCanvasMeasurer(
    ctx,
    `${fontSize}px ${FONT_FAMILY}`,
    lineHeight
  );
  return {
    fontSize,
    page: { ...PAGE, columnCount },
    shapes: SHAPE_SETS[shapeSetIndex],
  };
}

function runLayout() {
  const { fontSize, page, shapes } = readOptions();
  currentPage = page;
  currentFontSize = fontSize;
  currentResult = layout(sourceEl.value, {
    page,
    shapes,
    measurer: currentMeasurer,
    pins,
    paragraphGap: 10,
    wrapPadding: 8,
  });
  drawToCanvas(ctx, currentResult, page, {
    fontSize,
    fontFamily: FONT_FAMILY,
    pageWidth: PAGE_W,
    pageHeight: PAGE_H,
    measurer: currentMeasurer,
  });
  renderDiagnostics(currentResult);
  unpinBtn.disabled = Object.keys(pins).length === 0;
}

function renderDiagnostics(result) {
  if (!result.diagnostics.length) {
    diagEl.innerHTML = '<span class="ok">✓ 无违规：行首行尾禁则、孤行、超框全部通过</span>';
    return;
  }
  const groups = {};
  for (const d of result.diagnostics) groups[d.type] = (groups[d.type] || 0) + 1;
  diagEl.innerHTML = Object.entries(groups)
    .map(([type, n]) => `<span class="warn">⚠ ${type} × ${n}</span>`)
    .join("\n");
}

function paragraphAt(mx, my) {
  const lh = currentMeasurer.metrics().lineHeight;
  for (const line of currentResult.lines) {
    if (my >= line.y && my <= line.y + lh && mx >= line.x && mx <= line.x + line.available) {
      return line.paragraphId;
    }
  }
  return null;
}

canvas.addEventListener("click", (event) => {
  const rect = canvas.getBoundingClientRect();
  const mx = event.clientX - rect.left;
  const my = event.clientY - rect.top;
  const pid = paragraphAt(mx, my);
  if (pid === null) return;
  if (pins[pid]) {
    delete pins[pid];
  } else {
    const anyLine = currentResult.lines.find((l) => l.paragraphId === pid);
    const colIndex = anyLine.columnIndex;
    const col = currentResult.columns[colIndex];
    pins[pid] = {
      colIndex,
      dx: Math.round(anyLine.x - col.x),
      dy: Math.round(anyLine.y - col.y),
      width: Math.round(col.width),
    };
  }
  runLayout();
});

document.getElementById("relayout").addEventListener("click", runLayout);
document.getElementById("toggleShape").addEventListener("click", () => {
  shapeSetIndex = (shapeSetIndex + 1) % SHAPE_SETS.length;
  runLayout();
});
document.getElementById("unpin").addEventListener("click", () => {
  pins = {};
  runLayout();
});
document.getElementById("exportSvg").addEventListener("click", () => {
  const svg = toSvg(currentResult, currentPage, {
    fontSize: currentFontSize,
    fontFamily: FONT_FAMILY,
    pageWidth: PAGE_W,
    pageHeight: PAGE_H,
  });
  downloadBlob(new Blob([svg], { type: "image/svg+xml" }), "layout.svg");
});
document.getElementById("exportPng").addEventListener("click", () => {
  canvas.toBlob((blob) => downloadBlob(blob, "layout.png"), "image/png");
});

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

window.__typesetter = {
  runLayout,
  get state() {
    return {
      pins,
      result: currentResult,
      shapes: SHAPE_SETS[shapeSetIndex],
      measurer: currentMeasurer,
      fontSize: currentFontSize,
    };
  },
  setPins(next) {
    pins = next;
    runLayout();
  },
  toggleShapes() {
    shapeSetIndex = (shapeSetIndex + 1) % SHAPE_SETS.length;
    runLayout();
  },
};

fetch("assets/sample.txt")
  .then((r) => r.text())
  .then((text) => {
    sourceEl.value = text;
    runLayout();
  });
