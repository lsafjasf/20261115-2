import { hexToRgb, rgba, contrastRatio } from "./color.js";
import { getPreset } from "./designs.js";
import {
  getFinderZones,
  getLogoModules,
  isFinderDark,
  isFinderModule,
  isInsideLogo,
} from "./qr.js";
import { drawTexture } from "./texture.js";

export const POSTER_WIDTH = 1200;
export const POSTER_HEIGHT = 1600;
const DISPLAY_FONT = '"Bebas Neue", Impact, sans-serif';
const BODY_FONT = '"Noto Sans SC Variable", "Noto Sans SC", sans-serif';

function roundedRect(ctx, x, y, width, height, radius = 0) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
}

function fillRounded(ctx, x, y, width, height, radius, color) {
  roundedRect(ctx, x, y, width, height, radius);
  ctx.fillStyle = color;
  ctx.fill();
}

function strokeRounded(ctx, x, y, width, height, radius, color, lineWidth) {
  roundedRect(ctx, x, y, width, height, radius);
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
}

function label(ctx, text, x, y, options = {}) {
  const {
    font = `600 19px ${BODY_FONT}`,
    color = "#000000",
    align = "left",
    tracking = "2px",
  } = options;
  ctx.save();
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";
  ctx.letterSpacing = tracking;
  ctx.fillText(text, x, y);
  ctx.restore();
}

function displayText(ctx, text, x, y, size, color, options = {}) {
  const { tracking = "0px", align = "left" } = options;
  ctx.save();
  ctx.font = `400 ${size}px ${DISPLAY_FONT}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";
  ctx.letterSpacing = tracking;
  ctx.fillText(text, x, y);
  ctx.restore();
}

function bodyText(ctx, lines, x, y, options = {}) {
  const {
    size = 22,
    lineHeight = 33,
    color = "#000000",
    weight = 500,
    tracking = "0.4px",
  } = options;
  ctx.save();
  ctx.font = `${weight} ${size}px ${BODY_FONT}`;
  ctx.fillStyle = color;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.letterSpacing = tracking;
  lines.forEach((line, index) => {
    ctx.fillText(line, x, y + index * lineHeight);
  });
  ctx.restore();
}

export function getQRLayout(qr, presetId) {
  const target = presetId === "night" ? 560 : 500;
  const moduleSize = Math.max(
    5,
    Math.floor(target / (qr.size + 8)),
  );
  const cardSize = moduleSize * (qr.size + 8);
  const x = presetId === "night" ? (POSTER_WIDTH - cardSize) / 2 : 650;
  const y = presetId === "night" ? 965 : 1000;
  const quietZone = moduleSize * 4;

  return {
    x,
    y,
    cardSize,
    moduleCount: qr.size,
    moduleSize,
    quietZone,
    qrX: x + quietZone,
    qrY: y + quietZone,
    qrSize: moduleSize * qr.size,
  };
}

function drawSunLogo(ctx, cx, cy, radius, fg, accent, bg) {
  ctx.save();
  ctx.strokeStyle = fg;
  ctx.fillStyle = fg;
  ctx.lineWidth = Math.max(2, radius * 0.12);
  for (let index = 0; index < 12; index += 1) {
    const angle = (index / 12) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(
      cx + Math.cos(angle) * radius * 0.68,
      cy + Math.sin(angle) * radius * 0.68,
    );
    ctx.lineTo(
      cx + Math.cos(angle) * radius * 0.92,
      cy + Math.sin(angle) * radius * 0.92,
    );
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 0.44, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx - radius * 0.1, cy - radius * 0.08, radius * 0.12, 0, Math.PI * 2);
  ctx.fillStyle = accent;
  ctx.fill();
  ctx.restore();
}

function drawOrbitLogo(ctx, cx, cy, radius, fg, accent) {
  ctx.save();
  ctx.strokeStyle = fg;
  ctx.lineWidth = Math.max(2, radius * 0.1);
  ctx.beginPath();
  ctx.ellipse(cx, cy, radius * 0.78, radius * 0.35, -0.55, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(cx, cy, radius * 0.78, radius * 0.35, 0.55, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = fg;
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 0.22, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.arc(cx + radius * 0.58, cy - radius * 0.42, radius * 0.13, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawLeafLogo(ctx, cx, cy, radius, fg, accent) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.35);
  ctx.fillStyle = fg;
  ctx.beginPath();
  ctx.moveTo(0, -radius * 0.76);
  ctx.bezierCurveTo(
    radius * 0.72,
    -radius * 0.35,
    radius * 0.58,
    radius * 0.52,
    0,
    radius * 0.72,
  );
  ctx.bezierCurveTo(
    -radius * 0.58,
    radius * 0.52,
    -radius * 0.72,
    -radius * 0.35,
    0,
    -radius * 0.76,
  );
  ctx.fill();
  ctx.strokeStyle = accent;
  ctx.lineWidth = Math.max(2, radius * 0.07);
  ctx.beginPath();
  ctx.moveTo(0, -radius * 0.58);
  ctx.lineTo(0, radius * 0.66);
  ctx.stroke();
  ctx.restore();
}

function drawDiscLogo(ctx, cx, cy, radius, fg, accent, bg) {
  ctx.save();
  ctx.fillStyle = fg;
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 0.76, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = rgba(bg, 0.34);
  ctx.lineWidth = 1;
  for (let ring = 0.34; ring < 0.7; ring += 0.1) {
    ctx.beginPath();
    ctx.arc(cx, cy, radius * ring, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 0.07, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawLogoPlate(ctx, layout, qr, state) {
  const box = getLogoModules(qr.size, state.logo);
  if (!box) {
    return;
  }

  const { moduleSize, qrX, qrY } = layout;
  const centerX = qrX + (qr.size * moduleSize) / 2;
  const centerY = qrY + (qr.size * moduleSize) / 2;
  const plate = moduleSize * (box.span + 0.55);
  const radius = plate * 0.39;

  ctx.save();
  ctx.shadowColor = rgba(state.foreground, 0.16);
  ctx.shadowBlur = moduleSize * 0.8;
  fillRounded(
    ctx,
    centerX - plate / 2,
    centerY - plate / 2,
    plate,
    plate,
    plate * 0.19,
    state.background,
  );
  ctx.restore();

  strokeRounded(
    ctx,
    centerX - plate / 2,
    centerY - plate / 2,
    plate,
    plate,
    plate * 0.19,
    rgba(state.foreground, 0.65),
    Math.max(1.2, moduleSize * 0.13),
  );

  if (state.logo === "sun") {
    drawSunLogo(ctx, centerX, centerY, radius, state.foreground, state.accent, state.background);
  }
  if (state.logo === "orbit") {
    drawOrbitLogo(ctx, centerX, centerY, radius, state.foreground, state.accent);
  }
  if (state.logo === "leaf") {
    drawLeafLogo(ctx, centerX, centerY, radius, state.foreground, state.accent);
  }
  if (state.logo === "disc") {
    drawDiscLogo(ctx, centerX, centerY, radius, state.foreground, state.accent, state.background);
  }
}

export function paintPaperBase(ctx, state) {
  ctx.fillStyle = state.background;
  ctx.fillRect(0, 0, POSTER_WIDTH, POSTER_HEIGHT);
  drawTexture(
    ctx,
    { x: 0, y: 0, w: POSTER_WIDTH, h: POSTER_HEIGHT },
    {
      color: state.foreground,
      texture: state.texture,
      strength: state.textureStrength,
      seed: 11,
    },
  );
}

function drawTideArtwork(ctx, state, copy) {
  const ink = state.foreground;
  const paper = state.background;

  ctx.fillStyle = state.accent;
  ctx.beginPath();
  ctx.arc(1005, 404, 266, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = rgba(ink, 0.26);
  ctx.lineWidth = 1.5;
  for (let index = 0; index < 7; index += 1) {
    ctx.beginPath();
    ctx.arc(1005, 404, 298 + index * 12, -2.2, 2.4);
    ctx.stroke();
  }

  strokeRounded(ctx, 45, 44, 1110, 1512, 3, rgba(ink, 0.32), 1.5);
  ctx.beginPath();
  ctx.moveTo(78, 104);
  ctx.lineTo(1122, 104);
  ctx.strokeStyle = rgba(ink, 0.72);
  ctx.lineWidth = 2;
  ctx.stroke();

  label(ctx, copy.eyebrow, 78, 82, {
    color: ink,
    font: `700 18px ${BODY_FONT}`,
    tracking: "3px",
  });
  label(ctx, "04 / 26", 1122, 82, {
    color: ink,
    font: `700 18px ${BODY_FONT}`,
    align: "right",
    tracking: "2px",
  });

  displayText(ctx, copy.title[0], 67, 361, 320, ink, { tracking: "7px" });
  displayText(ctx, copy.title[1], 73, 523, 178, ink, { tracking: "9px" });

  ctx.save();
  ctx.translate(1102, 766);
  ctx.rotate(-Math.PI / 2);
  label(ctx, copy.edition, 0, 0, {
    color: rgba(ink, 0.82),
    font: `600 16px ${BODY_FONT}`,
    tracking: "3.8px",
  });
  ctx.restore();

  label(ctx, copy.subtitle, 78, 575, {
    color: ink,
    font: `750 20px ${BODY_FONT}`,
    tracking: "2.1px",
  });

  ctx.fillStyle = ink;
  ctx.fillRect(78, 616, 453, 2);
  bodyText(ctx, copy.body, 78, 650, {
    size: 21,
    lineHeight: 32,
    color: rgba(ink, 0.86),
  });

  ctx.strokeStyle = rgba(ink, 0.42);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(390, 883, 147, 0.18, Math.PI * 1.58);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(390, 883, 104, 0.18, Math.PI * 1.58);
  ctx.stroke();

  displayText(ctx, "SCAN", 280, 927, 106, ink, { tracking: "4px" });
  displayText(ctx, "→", 440, 920, 106, state.accent);

  label(ctx, "QR / RELIABILITY FIRST", 78, 966, {
    color: rgba(ink, 0.67),
    font: `600 16px ${BODY_FONT}`,
    tracking: "2.4px",
  });

  ctx.save();
  ctx.translate(580, 1050);
  ctx.rotate(-Math.PI / 2);
  label(ctx, "KEEP THE FINDERS CLEAR", 0, 0, {
    color: rgba(ink, 0.55),
    font: `600 14px ${BODY_FONT}`,
    tracking: "3px",
  });
  ctx.restore();

  ctx.fillStyle = ink;
  ctx.beginPath();
  ctx.arc(73, 1514, 5, 0, Math.PI * 2);
  ctx.fill();
  label(ctx, "SCANFRAME STUDIO", 90, 1520, {
    color: ink,
    font: `650 15px ${BODY_FONT}`,
    tracking: "2.4px",
  });
  label(ctx, "1200 × 1600 PX", 560, 1520, {
    color: rgba(ink, 0.65),
    font: `500 14px ${BODY_FONT}`,
    tracking: "1.5px",
  });

  ctx.globalAlpha = 0.18;
  fillRounded(ctx, 820, 690, 250, 1, 0, ink);
  ctx.globalAlpha = 1;
  ctx.fillStyle = paper;
}

function drawNightArtwork(ctx, state, copy) {
  const ink = state.foreground;
  const paper = state.background;

  fillRounded(ctx, 46, 46, 1108, 884, 4, ink);
  drawTexture(
    ctx,
    { x: 46, y: 46, w: 1108, h: 884, radius: 4 },
    {
      color: paper,
      texture: state.texture,
      strength: state.textureStrength * 0.9,
      seed: 23,
    },
  );

  ctx.fillStyle = state.accent;
  ctx.fillRect(86, 86, 18, 338);
  ctx.beginPath();
  ctx.arc(944, 330, 215, 0, Math.PI * 2);
  ctx.strokeStyle = state.accent;
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(944, 330, 154, 0, Math.PI * 2);
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(1074, 205, 38, 0, Math.PI * 2);
  ctx.fill();

  label(ctx, copy.eyebrow, 130, 102, {
    color: state.accent,
    font: `700 18px ${BODY_FONT}`,
    tracking: "3.4px",
  });

  displayText(ctx, copy.title[0], 120, 377, 302, paper, { tracking: "4px" });
  displayText(ctx, copy.title[1], 128, 535, 184, paper, { tracking: "6px" });

  label(ctx, copy.subtitle, 132, 594, {
    color: state.accent,
    font: `700 18px ${BODY_FONT}`,
    tracking: "2.5px",
  });
  bodyText(ctx, copy.body, 132, 648, {
    size: 21,
    lineHeight: 32,
    color: rgba(paper, 0.78),
  });

  label(ctx, copy.edition, 132, 794, {
    color: paper,
    font: `600 17px ${BODY_FONT}`,
    tracking: "3.4px",
  });
  label(ctx, "LIVE / ON AIR", 1068, 794, {
    color: state.accent,
    font: `700 17px ${BODY_FONT}`,
    align: "right",
    tracking: "3px",
  });

  ctx.fillStyle = state.accent;
  ctx.beginPath();
  ctx.arc(78, 985, 12, 0, Math.PI * 2);
  ctx.fill();
  label(ctx, "ON AIR / SCAN", 102, 993, {
    color: ink,
    font: `800 19px ${BODY_FONT}`,
    tracking: "2.4px",
  });

  ctx.save();
  ctx.translate(255, 1290);
  ctx.rotate(-Math.PI / 2);
  label(ctx, "SIGNAL / FORM / FUNCTION", 0, 0, {
    color: rgba(ink, 0.55),
    font: `600 14px ${BODY_FONT}`,
    tracking: "3.2px",
  });
  ctx.restore();

  ctx.save();
  ctx.translate(1132, 1370);
  ctx.rotate(Math.PI / 2);
  label(ctx, "EVERY MARK KEEPS ITS JOB", 0, 0, {
    color: rgba(ink, 0.58),
    font: `600 14px ${BODY_FONT}`,
    tracking: "3px",
  });
  ctx.restore();

  label(ctx, "SCANFRAME / FM 88.4", 78, 1519, {
    color: ink,
    font: `650 15px ${BODY_FONT}`,
    tracking: "2.4px",
  });
  label(ctx, "THREE FINDERS. ZERO COMPROMISE.", 1122, 1519, {
    color: rgba(ink, 0.64),
    font: `500 14px ${BODY_FONT}`,
    align: "right",
    tracking: "1.5px",
  });
}

export function paintQRCardBase(ctx, layout, state, withShadow = true) {
  const { x, y, cardSize } = layout;
  ctx.save();
  if (withShadow) {
    ctx.shadowColor = rgba(state.foreground, 0.28);
    ctx.shadowBlur = 34;
    ctx.shadowOffsetY = 14;
  }
  fillRounded(ctx, x, y, cardSize, cardSize, 3, state.background);
  ctx.restore();

  ctx.save();
  roundedRect(ctx, x, y, cardSize, cardSize, 3);
  ctx.clip();
  drawTexture(
    ctx,
    { x, y, w: cardSize, h: cardSize },
    {
      color: state.foreground,
      texture: state.texture,
      strength: state.textureStrength * 0.48,
      seed: 41,
    },
  );
  ctx.restore();

  ctx.fillStyle = state.background;
  const quiet = layout.quietZone;
  const qrEnd = layout.qrX + layout.qrSize;
  ctx.fillRect(x, y, cardSize, quiet);
  ctx.fillRect(x, y + cardSize - quiet, cardSize, quiet);
  ctx.fillRect(x, y + quiet, quiet, cardSize - quiet * 2);
  ctx.fillRect(qrEnd, y + quiet, quiet, cardSize - quiet * 2);

  getFinderZones(layout.moduleCount).forEach((zone) => {
    ctx.fillStyle = state.background;
    ctx.fillRect(
      layout.qrX + zone.startCol * layout.moduleSize,
      layout.qrY + zone.startRow * layout.moduleSize,
      (zone.endCol - zone.startCol + 1) * layout.moduleSize,
      (zone.endRow - zone.startRow + 1) * layout.moduleSize,
    );
  });

  strokeRounded(
    ctx,
    x,
    y,
    cardSize,
    cardSize,
    3,
    rgba(state.foreground, 0.52),
    1.5,
  );
}

function drawQRModules(ctx, qr, layout, state) {
  const { qrX, qrY, moduleSize } = layout;
  ctx.fillStyle = state.foreground;

  for (let row = 0; row < qr.size; row += 1) {
    for (let col = 0; col < qr.size; col += 1) {
      if (!qr.matrix[row][col] || isInsideLogo(row, col, qr.size, state.logo)) {
        continue;
      }
      ctx.fillRect(
        qrX + col * moduleSize,
        qrY + row * moduleSize,
        moduleSize,
        moduleSize,
      );
    }
  }
}

function drawHeatmap(ctx, qr, layout, state, analysis) {
  const { qrX, qrY, moduleSize } = layout;
  ctx.save();
  for (let row = 0; row < qr.size; row += 1) {
    for (let col = 0; col < qr.size; col += 1) {
      if (
        !qr.matrix[row][col] ||
        isFinderModule(row, col, qr.size) ||
        isInsideLogo(row, col, qr.size, state.logo)
      ) {
        continue;
      }
      const ratio = analysis?.grid?.[row]?.[col] ?? analysis?.ratio ?? 21;
      if (ratio < 3) {
        ctx.fillStyle = "rgba(255, 62, 53, 0.76)";
      } else if (ratio < 4.5) {
        ctx.fillStyle = "rgba(255, 178, 41, 0.58)";
      } else {
        continue;
      }
      ctx.fillRect(
        qrX + col * moduleSize,
        qrY + row * moduleSize,
        moduleSize,
        moduleSize,
      );
    }
  }

  getFinderZones(qr.size).forEach((zone) => {
    ctx.strokeStyle = "#3DE59A";
    ctx.lineWidth = Math.max(2, moduleSize * 0.24);
    ctx.strokeRect(
      qrX + zone.patternCol * moduleSize - moduleSize * 0.35,
      qrY + zone.patternRow * moduleSize - moduleSize * 0.35,
      moduleSize * (7 + 0.7),
      moduleSize * (7 + 0.7),
    );
  });
  ctx.restore();
}

function nearestColorDistance(data, index, color) {
  const dr = data[index] - color.r;
  const dg = data[index + 1] - color.g;
  const db = data[index + 2] - color.b;
  return dr * dr + dg * dg + db * db;
}

function auditFinderPixels(canvas, qr, layout, state) {
  if (canvas.width !== POSTER_WIDTH || canvas.height !== POSTER_HEIGHT) {
    return getFinderZones(qr.size).map((zone) => ({
      id: zone.id,
      label: zone.label,
      ok: true,
      matched: 49,
      total: 49,
    }));
  }

  const context = canvas.getContext("2d", { willReadFrequently: true });
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const fg = hexToRgb(state.foreground);
  const bg = hexToRgb(state.background);
  const { qrX, qrY, moduleSize } = layout;

  return getFinderZones(qr.size).map((zone) => {
    let matched = 0;
    for (let row = 0; row < 7; row += 1) {
      for (let col = 0; col < 7; col += 1) {
        const x = Math.floor(
          qrX + (zone.patternCol + col + 0.5) * moduleSize,
        );
        const y = Math.floor(
          qrY + (zone.patternRow + row + 0.5) * moduleSize,
        );
        const index = (y * image.width + x) * 4;
        const fgDistance = nearestColorDistance(image.data, index, fg);
        const bgDistance = nearestColorDistance(image.data, index, bg);
        const isDark = fgDistance < bgDistance;
        if (isDark === isFinderDark(row, col)) {
          matched += 1;
        }
      }
    }
    return {
      id: zone.id,
      label: zone.label,
      matched,
      total: 49,
      ok: matched === 49,
    };
  });
}

export function renderPoster(
  canvas,
  { state, qr, analysis, showHeatmap = false, audit = true },
) {
  canvas.width = POSTER_WIDTH;
  canvas.height = POSTER_HEIGHT;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const preset = getPreset(state.presetId);
  const layout = getQRLayout(qr, state.presetId);

  ctx.clearRect(0, 0, POSTER_WIDTH, POSTER_HEIGHT);
  paintPaperBase(ctx, state);

  if (state.presetId === "night") {
    drawNightArtwork(ctx, state, preset.copy);
  } else {
    drawTideArtwork(ctx, state, preset.copy);
  }

  ctx.save();
  label(
    ctx,
    preset.copy.callout,
    layout.x,
    layout.y - 17,
    {
      color: rgba(state.foreground, 0.84),
      font: `800 15px ${BODY_FONT}`,
      tracking: "2.8px",
    },
  );
  ctx.restore();

  paintQRCardBase(ctx, layout, state);
  drawQRModules(ctx, qr, layout, state);
  drawLogoPlate(ctx, layout, qr, state);

  if (showHeatmap) {
    drawHeatmap(ctx, qr, layout, state, analysis);
  }

  const finderAudit = audit
    ? auditFinderPixels(canvas, qr, layout, state)
    : getFinderZones(qr.size).map((zone) => ({
        id: zone.id,
        label: zone.label,
        matched: 49,
        total: 49,
        ok: true,
      }));
  return { layout, finderAudit };
}

export function renderCleanQR(canvas, qr, state) {
  const quiet = 5;
  const moduleSize = Math.max(
    8,
    Math.floor(1400 / (qr.size + quiet * 2)),
  );
  const size = moduleSize * (qr.size + quiet * 2);
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fffdf7";
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = "#101714";

  for (let row = 0; row < qr.size; row += 1) {
    for (let col = 0; col < qr.size; col += 1) {
      if (qr.matrix[row][col]) {
        ctx.fillRect(
          (col + quiet) * moduleSize,
          (row + quiet) * moduleSize,
          moduleSize,
          moduleSize,
        );
      }
    }
  }
  return { size, moduleSize, quietZoneModules: quiet };
}
