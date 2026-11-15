// Canvas 渲染：色卡总览与模拟界面。所有绘制函数只依赖传入的 ctx，
// 便于在 Node 中用桩件做冒烟测试。

import { contrastRatio, wcagLevel } from "./color.js";

function setupContext(canvas, cssWidth, cssHeight) {
  const dpr = Math.min(canvas.ownerDocument?.defaultView?.devicePixelRatio ?? 1, 2);
  canvas.width = Math.round(cssWidth * dpr);
  canvas.height = Math.round(cssHeight * dpr);
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssHeight}px`;
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

function roundRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

export function drawSwatchCard(canvas, palette) {
  const width = 960;
  const height = 300;
  const ctx = setupContext(canvas, width, height);
  ctx.clearRect(0, 0, width, height);

  const margin = 24;
  const gap = 14;
  const cardWidth = (width - margin * 2 - gap * (palette.length - 1)) / palette.length;
  const cardHeight = height - margin * 2;

  ctx.font = "600 15px system-ui, sans-serif";
  ctx.textBaseline = "middle";

  palette.forEach((swatch, index) => {
    const x = margin + index * (cardWidth + gap);
    const y = margin;

    ctx.save();
    ctx.shadowColor = "rgba(20, 26, 38, 0.18)";
    ctx.shadowBlur = 14;
    ctx.shadowOffsetY = 5;
    roundRect(ctx, x, y, cardWidth, cardHeight, 16);
    ctx.fillStyle = swatch.hex;
    ctx.fill();
    ctx.restore();

    if (swatch.locked) {
      roundRect(ctx, x + 10, y + 10, 54, 24, 12);
      ctx.fillStyle = "rgba(20, 24, 32, 0.62)";
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.font = "600 12px system-ui, sans-serif";
      ctx.fillText("🔒 锁定", x + 18, y + 22);
    }

    ctx.fillStyle = swatch.foreground;
    ctx.font = "700 20px system-ui, sans-serif";
    ctx.fillText(swatch.hex.toUpperCase(), x + 16, y + cardHeight - 62);
    ctx.font = "500 13px system-ui, sans-serif";
    ctx.fillText(swatch.hsl, x + 16, y + cardHeight - 36);
    ctx.fillText(
      `文字 ${swatch.textContrast.toFixed(2)}:1 · ${wcagLevel(swatch.textContrast)}`,
      x + 16,
      y + cardHeight - 16,
    );
  });
}

function drawPill(ctx, x, y, width, height, fill, label, foreground) {
  roundRect(ctx, x, y, width, height, height / 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.fillStyle = foreground;
  ctx.font = "600 13px system-ui, sans-serif";
  ctx.textBaseline = "middle";
  ctx.fillText(label, x + 16, y + height / 2);
}

// 模拟界面：顶部导航、主视觉、卡片网格，全部使用当前五色与自动前景色。
export function drawMockInterface(canvas, palette) {
  const width = 960;
  const height = 420;
  const ctx = setupContext(canvas, width, height);
  const [primary, secondary, accent, support, neutral] = palette;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#f6f7fb";
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = neutral.hex;
  ctx.fillRect(0, 0, width, 58);
  ctx.fillStyle = neutral.foreground;
  ctx.font = "700 16px system-ui, sans-serif";
  ctx.textBaseline = "middle";
  ctx.fillText("NOISE PALETTE STUDIO", 24, 29);
  drawPill(ctx, width - 138, 14, 114, 30, primary.hex, "立即体验", primary.foreground);

  roundRect(ctx, 24, 82, width - 48, 118, 18);
  ctx.fillStyle = primary.hex;
  ctx.fill();
  ctx.fillStyle = primary.foreground;
  ctx.font = "700 26px system-ui, sans-serif";
  ctx.fillText("噪声生成的五色设计系统", 48, 120);
  ctx.font = "400 15px system-ui, sans-serif";
  ctx.fillText(
    `主色前景对比度 ${primary.textContrast.toFixed(2)}:1（${wcagLevel(primary.textContrast)}）`,
    48,
    152,
  );
  drawPill(ctx, 48, 164, 118, 32, "#ffffff", "主按钮", primary.hex);
  drawPill(ctx, 178, 164, 118, 32, "rgba(255,255,255,0.24)", "次按钮", "#ffffff");

  const cardY = 222;
  const cardHeight = 174;
  const gap = 16;
  const cardWidth = (width - 48 - gap * 2) / 3;
  const cards = [secondary, accent, support];
  cards.forEach((swatch, index) => {
    const x = 24 + index * (cardWidth + gap);
    roundRect(ctx, x, cardY, cardWidth, cardHeight, 16);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    roundRect(ctx, x, cardY, cardWidth, 64, 16);
    ctx.fillStyle = swatch.hex;
    ctx.fill();
    ctx.fillRect(x, cardY + 48, cardWidth, 16);

    ctx.fillStyle = "#1f2430";
    ctx.font = "700 15px system-ui, sans-serif";
    ctx.fillText(`卡片 ${index + 1} · ${swatch.hex.toUpperCase()}`, x + 16, cardY + 92);
    ctx.font = "400 12px system-ui, sans-serif";
    const ratio = contrastRatio(swatch.hex, swatch.foreground);
    ctx.fillStyle = "#5a6270";
    ctx.fillText(`色块上 ${swatch.foregroundLabel} ${ratio.toFixed(2)}:1`, x + 16, cardY + 116);
    drawPill(ctx, x + 16, cardY + 132, 96, 28, swatch.hex, "操作按钮", swatch.foreground);
  });
}
