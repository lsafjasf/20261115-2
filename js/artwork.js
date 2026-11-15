export const PANEL_COUNT = 4;
export const PANEL_WIDTH = 512;
export const PANEL_HEIGHT = 1100;
export const ART_WIDTH = PANEL_WIDTH * PANEL_COUNT;
export const ART_HEIGHT = PANEL_HEIGHT;

const COLORS = {
  paper: "#f1ede2",
  paperDeep: "#e7e1d3",
  ink: "#1b1b18",
  red: "#d94f35",
  green: "#253530",
  lime: "#dce378",
  cream: "#f3eedf",
  gray: "#77756c",
};

function font(size, weight = 400, family = "sans") {
  const stack =
    family === "serif"
      ? '"Iowan Old Style", Baskerville, "Times New Roman", serif'
      : '"Noto Sans SC Local", "Noto Sans SC", sans-serif';
  return `${weight} ${size}px ${stack}`;
}

function drawTrackedText(ctx, text, x, y, options = {}) {
  const {
    size = 12,
    weight = 400,
    family = "sans",
    color = COLORS.ink,
    spacing = 0,
    align = "left",
    alpha = 1,
  } = options;

  ctx.save();
  ctx.font = font(size, weight, family);
  ctx.fillStyle = color;
  ctx.globalAlpha = alpha;
  ctx.textBaseline = "alphabetic";

  const chars = Array.from(text);
  const widths = chars.map((char) => ctx.measureText(char).width);
  const total = widths.reduce((sum, width) => sum + width, 0) + spacing * (chars.length - 1);
  let cursor = align === "center" ? x - total / 2 : align === "right" ? x - total : x;

  chars.forEach((char, index) => {
    ctx.fillText(char, cursor, y);
    cursor += widths[index] + spacing;
  });

  ctx.restore();
  return total;
}

function drawText(ctx, text, x, y, options = {}) {
  const {
    size = 16,
    weight = 400,
    family = "sans",
    color = COLORS.ink,
    align = "left",
    alpha = 1,
    baseline = "alphabetic",
  } = options;

  ctx.save();
  ctx.font = font(size, weight, family);
  ctx.fillStyle = color;
  ctx.globalAlpha = alpha;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  ctx.fillText(text, x, y);
  ctx.restore();
}

function drawLine(ctx, x1, y1, x2, y2, color = COLORS.ink, width = 1, alpha = 1) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.strokeStyle = color;
  ctx.globalAlpha = alpha;
  ctx.lineWidth = width;
  ctx.stroke();
  ctx.restore();
}

function drawPaperGrain(ctx, panelIndex, color = "17,17,14") {
  let seed = 1907 + panelIndex * 977;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  ctx.save();
  for (let i = 0; i < 2600; i += 1) {
    const x = random() * PANEL_WIDTH;
    const y = random() * PANEL_HEIGHT;
    const size = random() * 1.15 + 0.2;
    ctx.fillStyle = `rgba(${color},${0.018 + random() * 0.03})`;
    ctx.fillRect(x, y, size, size);
  }
  ctx.restore();
}

function trackedWidth(ctx, text, size, weight = 400, spacing = 0, family = "sans") {
  ctx.save();
  ctx.font = font(size, weight, family);
  const widths = Array.from(text).map((char) => ctx.measureText(char).width);
  const total = widths.reduce((sum, width) => sum + width, 0) + spacing * (widths.length - 1);
  ctx.restore();
  return total;
}

export function drawArtwork() {
  const canvas = document.createElement("canvas");
  canvas.width = ART_WIDTH;
  canvas.height = ART_HEIGHT;
  const ctx = canvas.getContext("2d");
  const boxes = [];
  const foldGuides = [];

  const text = (panel, value, x, y, options = {}) => {
    drawText(ctx, value, x, y, options);
    const size = options.size || 16;
    const weight = options.weight || 400;
    const family = options.family || "sans";
    ctx.save();
    ctx.font = font(size, weight, family);
    const measured = ctx.measureText(value).width;
    ctx.restore();
    const align = options.align || "left";
    const left = align === "center" ? x - measured / 2 : align === "right" ? x - measured : x;
    boxes.push({
      panel,
      text: value,
      x: left,
      y: y - size * 0.86,
      width: measured,
      height: size * 1.08,
    });
  };

  const tracked = (panel, value, x, y, options = {}) => {
    const size = options.size || 12;
    const total = trackedWidth(
      ctx,
      value,
      size,
      options.weight,
      options.spacing || 0,
      options.family,
    );
    drawTrackedText(ctx, value, x, y, options);
    const align = options.align || "left";
    const left = align === "center" ? x - total / 2 : align === "right" ? x - total : x;
    boxes.push({
      panel,
      text: value,
      x: left,
      y: y - size * 0.86,
      width: total,
      height: size * 1.08,
    });
  };

  for (let panel = 0; panel < PANEL_COUNT; panel += 1) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(panel * PANEL_WIDTH, 0, PANEL_WIDTH, PANEL_HEIGHT);
    ctx.clip();
    ctx.translate(panel * PANEL_WIDTH, 0);

    if (panel === 0) drawCover(ctx, text, tracked);
    if (panel === 1) drawForm(ctx, text, tracked);
    if (panel === 2) drawLight(ctx, text, tracked);
    if (panel === 3) drawBack(ctx, text, tracked);

    drawPaperGrain(ctx, panel, panel === 1 ? "255,244,225" : "17,17,14");
    ctx.restore();
  }

  for (let fold = 1; fold < PANEL_COUNT; fold += 1) {
    const x = fold * PANEL_WIDTH;
    foldGuides.push({ x, y: 0, height: PANEL_HEIGHT });
    ctx.save();
    ctx.setLineDash([3, 9]);
    ctx.strokeStyle = "rgba(17,17,14,.18)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, PANEL_HEIGHT);
    ctx.stroke();
    ctx.restore();
  }

  return { canvas, boxes, foldGuides, colors: COLORS };
}

function drawCover(ctx, text, tracked) {
  const C = COLORS;
  ctx.fillStyle = C.paper;
  ctx.fillRect(0, 0, PANEL_WIDTH, PANEL_HEIGHT);

  tracked(0, "FOLD / STUDIES", 40, 55, { size: 10, weight: 700, spacing: 2.1 });
  tracked(0, "04", 472, 55, { size: 10, weight: 700, spacing: 1, align: "right" });
  drawLine(ctx, 40, 68, 472, 68, C.ink, 1, 0.55);

  ctx.fillStyle = C.red;
  ctx.fillRect(40, 88, 8, 58);
  tracked(0, "PAPER MATTER / 2026", 61, 108, {
    size: 10,
    weight: 500,
    spacing: 1.6,
  });
  text(0, "一张纸的观看练习", 61, 132, { size: 20, color: C.gray });

  text(0, "折页", 38, 245, { size: 116, weight: 500 });
  text(0, "之间", 38, 368, { size: 104, weight: 500 });
  tracked(0, "FOLDING / BETWEEN", 42, 418, {
    size: 9,
    weight: 700,
    spacing: 2.4,
    color: C.red,
  });

  ctx.save();
  ctx.translate(260, 604);
  ctx.strokeStyle = "rgba(27,27,24,.28)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(0, 0, 145, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, 119, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = C.red;
  ctx.beginPath();
  ctx.arc(34, -22, 91, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = C.paper;
  ctx.beginPath();
  ctx.arc(-28, 44, 53, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = C.ink;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-176, 122);
  ctx.lineTo(176, -116);
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = C.ink;
  ctx.fillRect(40, 798, 432, 1);
  text(0, "一张纸，四种观看。", 40, 870, { size: 28, weight: 500 });
  text(0, "四种叙事，无限种空间。", 40, 934, { size: 21, color: C.gray });

  ctx.fillStyle = C.red;
  ctx.beginPath();
  ctx.arc(446, 866, 5, 0, Math.PI * 2);
  ctx.fill();

  tracked(0, "PROMOTIONAL BROCHURE", 40, 1048, {
    size: 9,
    weight: 700,
    spacing: 1.3,
    color: C.gray,
  });
  tracked(0, "302 × 640 MM", 472, 1048, {
    size: 9,
    spacing: 1.2,
    color: C.gray,
    align: "right",
  });
}

function drawForm(ctx, text, tracked) {
  const C = COLORS;
  ctx.fillStyle = C.red;
  ctx.fillRect(0, 0, PANEL_WIDTH, PANEL_HEIGHT);

  tracked(1, "FORM / 形态", 40, 55, {
    size: 10,
    weight: 700,
    spacing: 1.8,
    color: C.cream,
  });
  tracked(1, "01—04", 472, 55, {
    size: 10,
    weight: 700,
    spacing: 1.2,
    color: C.cream,
    align: "right",
  });
  drawLine(ctx, 40, 68, 472, 68, C.cream, 1, 0.5);

  text(1, "一", 256, 326, {
    size: 260,
    weight: 700,
    align: "center",
    color: C.cream,
  });
  text(1, "纸 / 四景", 256, 470, {
    size: 70,
    weight: 500,
    align: "center",
    color: C.cream,
  });

  ctx.save();
  ctx.translate(256, 640);
  ctx.strokeStyle = "rgba(243,238,223,.84)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, 0, 166, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 0.3;
  for (let i = 0; i < 32; i += 1) {
    const angle = (i / 32) * Math.PI * 2;
    const inner = i % 2 ? 43 : 67;
    ctx.beginPath();
    ctx.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
    ctx.lineTo(Math.cos(angle) * 152, Math.sin(angle) * 152);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = C.lime;
  ctx.beginPath();
  ctx.arc(0, 0, 47, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = C.ink;
  ctx.beginPath();
  ctx.arc(0, 0, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  drawLine(ctx, 40, 842, 472, 842, C.cream, 1, 0.5);
  text(1, "一种材料，", 40, 894, { size: 31, weight: 500, color: C.cream });
  text(1, "无限种表达。", 40, 931, {
    size: 31,
    weight: 500,
    color: C.cream,
  });
  text(1, "折痕重新定义阅读的顺序，", 40, 980, {
    size: 22,
    color: "rgba(243,238,223,.78)",
  });
  text(1, "也让每一次转身成为新的版面。", 40, 1008, {
    size: 22,
    color: "rgba(243,238,223,.78)",
  });
  tracked(1, "PANEL 02 / EDITORIAL", 40, 1048, {
    size: 9,
    spacing: 1.2,
    color: "rgba(243,238,223,.64)",
  });
}

function drawLight(ctx, text, tracked) {
  const C = COLORS;
  ctx.fillStyle = C.green;
  ctx.fillRect(0, 0, PANEL_WIDTH, PANEL_HEIGHT);

  tracked(2, "LIGHT / 光照", 40, 55, {
    size: 10,
    weight: 700,
    spacing: 1.8,
    color: C.cream,
  });
  tracked(2, "02", 472, 55, {
    size: 10,
    weight: 700,
    spacing: 1.2,
    color: C.cream,
    align: "right",
  });
  drawLine(ctx, 40, 68, 472, 68, C.cream, 1, 0.38);

  text(2, "光，沿", 40, 184, { size: 64, weight: 500, color: C.cream });
  text(2, "折线", 40, 258, { size: 64, weight: 500, color: C.cream });
  text(2, "行走。", 40, 332, { size: 64, weight: 500, color: C.cream });

  text(2, "折面不是背景，", 40, 400, {
    size: 20,
    color: "rgba(243,238,223,.82)",
  });
  text(2, "它决定阴影落在哪里。", 40, 428, {
    size: 20,
    color: "rgba(243,238,223,.82)",
  });

  const gradient = ctx.createLinearGradient(40, 0, 472, 0);
  gradient.addColorStop(0, "rgba(220,227,120,.06)");
  gradient.addColorStop(0.48, "rgba(220,227,120,.62)");
  gradient.addColorStop(1, "rgba(220,227,120,.03)");
  ctx.fillStyle = gradient;
  ctx.fillRect(40, 535, 432, 144);
  drawLine(ctx, 40, 535, 472, 535, "rgba(243,238,223,.28)", 1);
  drawLine(ctx, 40, 679, 472, 679, "rgba(243,238,223,.28)", 1);

  ctx.save();
  ctx.translate(256, 607);
  ctx.strokeStyle = "rgba(243,238,223,.42)";
  ctx.lineWidth = 1;
  for (let i = -2; i <= 2; i += 1) {
    ctx.beginPath();
    ctx.moveTo(i * 48 - 40, -66);
    ctx.lineTo(i * 48 + 24, 66);
    ctx.stroke();
  }
  ctx.fillStyle = C.lime;
  ctx.beginPath();
  ctx.arc(54, 0, 34, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  tracked(2, "AZIMUTH 35°", 40, 716, {
    size: 9,
    spacing: 1.1,
    color: "rgba(243,238,223,.58)",
  });
  tracked(2, "ELEVATION 60°", 472, 716, {
    size: 9,
    spacing: 1.1,
    color: "rgba(243,238,223,.58)",
    align: "right",
  });

  text(2, "每一次翻折，", 40, 782, {
    size: 28,
    weight: 500,
    color: C.cream,
  });
  text(2, "都让光重新排版。", 40, 819, {
    size: 28,
    weight: 500,
    color: C.cream,
  });
  text(2, "拖动画布，观察折面与阴影共同移动。", 40, 868, {
    size: 20,
    color: "rgba(243,238,223,.7)",
  });

  drawLine(ctx, 40, 920, 472, 920, C.cream, 1, 0.28);
  text(2, "纸没有变。", 40, 966, { size: 22, color: C.cream });
  text(2, "改变的是观看。", 40, 993, { size: 22, color: C.cream });
  tracked(2, "PANEL 03 / PERSPECTIVE", 40, 1048, {
    size: 9,
    spacing: 1.2,
    color: "rgba(243,238,223,.58)",
  });
}

function drawBack(ctx, text, tracked) {
  const C = COLORS;
  ctx.fillStyle = C.paper;
  ctx.fillRect(0, 0, PANEL_WIDTH, PANEL_HEIGHT);

  tracked(3, "BACK / 致观看者", 40, 55, {
    size: 10,
    weight: 700,
    spacing: 1.8,
  });
  tracked(3, "04", 472, 55, {
    size: 10,
    weight: 700,
    spacing: 1.2,
    align: "right",
  });
  drawLine(ctx, 40, 68, 472, 68, C.ink, 1, 0.5);

  text(3, "展开，", 40, 190, { size: 68, weight: 500 });
  text(3, "再折起。", 40, 267, { size: 68, weight: 500 });
  tracked(3, "UNFOLD / REFOLD / REPEAT", 42, 310, {
    size: 9,
    weight: 700,
    spacing: 1.9,
    color: C.red,
  });

  text(3, "平面是一个答案，", 40, 372, {
    size: 24,
    color: C.ink,
  });
  text(3, "折起之后，空间成为另一个。", 40, 402, {
    size: 24,
    color: C.ink,
  });
  text(3, "保留每一次转弯的边界，", 40, 450, { size: 20, color: C.gray });
  text(3, "让文字在各自的折面上完整发生。", 40, 478, {
    size: 20,
    color: C.gray,
  });

  drawLine(ctx, 40, 520, 472, 520, C.ink, 1, 0.5);
  tracked(3, "A STUDY BY / ARC EDITIONS", 40, 558, {
    size: 9,
    weight: 700,
    spacing: 1.5,
  });
  text(3, "hello@foldstudies.cn", 40, 592, { size: 18, color: C.ink });
  text(3, "Shanghai · China", 40, 617, { size: 12, color: C.gray });

  text(3, "扫码获取完整案例", 40, 710, { size: 18, color: C.ink });
  text(3, "SCAN FOR THE FULL STORY", 40, 731, {
    size: 8,
    color: C.gray,
  });

  ctx.save();
  ctx.translate(352, 750);
  ctx.strokeStyle = C.ink;
  ctx.lineWidth = 1;
  ctx.strokeRect(-86, -86, 172, 172);
  ctx.fillStyle = C.ink;
  const modules = 11;
  const cell = 12;
  for (let row = 0; row < modules; row += 1) {
    for (let col = 0; col < modules; col += 1) {
      if ((row * 7 + col * 3 + row * col) % 5 < 2) {
        ctx.fillRect(-66 + col * cell, -66 + row * cell, cell - 3, cell - 3);
      }
    }
  }
  ctx.fillStyle = C.red;
  ctx.fillRect(-24, 52, 28, 28);
  ctx.restore();

  ctx.fillStyle = C.red;
  ctx.beginPath();
  ctx.arc(88, 814, 42, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = C.paper;
  ctx.beginPath();
  ctx.arc(101, 801, 13, 0, Math.PI * 2);
  ctx.fill();
  text(3, "F", 88, 826, {
    size: 28,
    weight: 700,
    family: "serif",
    align: "center",
    color: C.paper,
  });

  drawLine(ctx, 40, 946, 472, 946, C.ink, 1, 0.35);
  text(3, "把内容留在纸上，", 40, 988, { size: 22, color: C.ink });
  text(3, "把观看交给空间。", 40, 1015, { size: 22, color: C.ink });
  tracked(3, "FOLD STUDIES / ISSUE 04", 40, 1054, {
    size: 9,
    spacing: 1.2,
    color: C.gray,
  });
  tracked(3, "2026", 472, 1054, {
    size: 9,
    spacing: 1.2,
    color: C.gray,
    align: "right",
  });
}
