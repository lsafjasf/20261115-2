(function(){
// Renderers for layout results: pure SVG string and Canvas 2D preview/PNG.

function escapeXml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function shapeSvg(shape) {
  if (shape.kind === "ellipse") {
    return `<ellipse cx="${(shape.x + shape.width / 2).toFixed(1)}" cy="${(
      shape.y +
      shape.height / 2
    ).toFixed(1)}" rx="${(shape.width / 2).toFixed(1)}" ry="${(
      shape.height / 2
    ).toFixed(1)}" class="shape"/>`;
  }
  return `<rect x="${shape.x}" y="${shape.y}" width="${shape.width}" height="${shape.height}" rx="6" class="shape"/>`;
}

function toSvg(result, page, options = {}) {
  const { fontSize, fontFamily, pageWidth, pageHeight, measurer } = options;
  const parts = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${pageWidth}" height="${pageHeight}" viewBox="0 0 ${pageWidth} ${pageHeight}">`
  );
  parts.push(
    `<style>.text{font:${fontSize}px ${fontFamily};fill:#1a1a1a}.shape{fill:#dfe7f3;stroke:#7d96bd;stroke-width:1.5}.pin{fill:none;stroke:#d2691e;stroke-width:1.5;stroke-dasharray:6 4}.frame{fill:none;stroke:#ccc;stroke-width:1}</style>`
  );
  parts.push(`<rect width="100%" height="100%" fill="#ffffff"/>`);
  parts.push(
    `<rect class="frame" x="${page.contentX}" y="${page.contentY}" width="${page.contentWidth}" height="${page.contentHeight}"/>`
  );
  result.shapes.forEach((s) => parts.push(shapeSvg(s)));
  for (const box of result.pinnedBoxes) {
    parts.push(
      `<rect class="pin" x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" rx="4"/>`
    );
  }
  for (const line of result.lines) {
    const y = line.y + Math.round(fontSize * 1.15);
    let x = line.x;
    for (const token of line.tokens) {
      parts.push(
        `<text class="text" x="${x.toFixed(1)}" y="${y}">${escapeXml(token.text)}</text>`
      );
      x += measurer ? measurer.measure(token.text) : token.text.length * fontSize;
    }
  }
  parts.push(`</svg>`);
  return parts.join("\n");
}

function drawToCanvas(ctx, result, page, options = {}) {
  const { fontSize, fontFamily, pageWidth, pageHeight, measurer } = options;
  ctx.clearRect(0, 0, pageWidth, pageHeight);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, pageWidth, pageHeight);
  ctx.font = `${fontSize}px ${fontFamily}`;
  ctx.textBaseline = "top";

  ctx.strokeStyle = "#cccccc";
  ctx.strokeRect(page.contentX, page.contentY, page.contentWidth, page.contentHeight);

  for (const shape of result.shapes) {
    ctx.fillStyle = "#dfe7f3";
    ctx.strokeStyle = "#7d96bd";
    if (shape.kind === "ellipse") {
      ctx.beginPath();
      ctx.ellipse(
        shape.x + shape.width / 2,
        shape.y + shape.height / 2,
        shape.width / 2,
        shape.height / 2,
        0,
        0,
        Math.PI * 2
      );
      ctx.fill();
      ctx.stroke();
    } else {
      roundedRect(ctx, shape.x, shape.y, shape.width, shape.height, 6);
      ctx.fill();
      ctx.stroke();
    }
  }

  for (const box of result.pinnedBoxes) {
    ctx.strokeStyle = "#d2691e";
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(box.x, box.y, box.width, box.height);
    ctx.setLineDash([]);
  }

  ctx.fillStyle = "#1a1a1a";
  for (const line of result.lines) {
    let x = line.x;
    for (const token of line.tokens) {
      ctx.fillText(token.text, x, line.y);
      x += measurer ? measurer.measure(token.text) : ctx.measureText(token.text).width;
    }
  }
}

function roundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const api = { toSvg, drawToCanvas, escapeXml };
if (typeof module !== "undefined" && module.exports) module.exports = api;
if (typeof window !== "undefined") window.TypesetterRender = api;

})();
