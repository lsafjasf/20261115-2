(function () {
  "use strict";

  const TAU = Math.PI * 2;
  const LOGICAL_SIZE = 1000;
  const STAMP_MM = 42;

  const DEFAULTS = {
    primaryText: "长安印社·纸上有光",
    dateText: "2026.11.14",
    arcDeg: 198,
    innerLines: 1,
    logo: "mountain",
    notchDepth: 14,
    notchCount: 14,
    wear: 44,
    ink: "#a93628",
  };

  function mulberry32(seed) {
    let value = Number(seed) >>> 0;
    return function () {
      value += 0x6d2b79f5;
      let t = value;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function colorWithAlpha(hex, alpha) {
    const clean = hex.replace("#", "");
    const expanded = clean.length === 3
      ? clean.split("").map((part) => part + part).join("")
      : clean;
    const red = parseInt(expanded.slice(0, 2), 16);
    const green = parseInt(expanded.slice(2, 4), 16);
    const blue = parseInt(expanded.slice(4, 6), 16);
    return `rgba(${red}, ${green}, ${blue}, ${clamp(alpha, 0, 1)})`;
  }

  function normalizeText(value, maxLength) {
    return Array.from(String(value || "").trim()).slice(0, maxLength);
  }

  function drawArcText(ctx, characters, config) {
    const { radius, span, startAngle, direction, fontSize, fontFamily, textBaseline } = config;
    const availableArc = radius * span * 0.965;
    const naturalWidths = characters.map((character) => {
      ctx.font = `600 ${fontSize}px ${fontFamily}`;
      return Math.max(ctx.measureText(character).width, fontSize * 0.18);
    });
    const naturalTotal = naturalWidths.reduce((sum, width) => sum + width, 0);
    const minimumGap = fontSize * 0.035;
    const neededWidth = naturalTotal + Math.max(characters.length - 1, 0) * minimumGap;
    const fittedFontSize = fontSize * Math.min(1, availableArc / Math.max(neededWidth, 1));
    const fittedWidths = characters.map((character) => {
      ctx.font = `600 ${fittedFontSize}px ${fontFamily}`;
      return Math.max(ctx.measureText(character).width, fittedFontSize * 0.18);
    });
    const totalWidth = fittedWidths.reduce((sum, width) => sum + width, 0);
    const gap = characters.length > 1
      ? Math.max(minimumGap, (availableArc - totalWidth) / (characters.length - 1))
      : 0;
    const occupiedArc = totalWidth + gap * Math.max(characters.length - 1, 0);
    const loneOffset = characters.length === 1 ? Math.max(0, (availableArc - totalWidth) / 2) : 0;
    let cursor = 0;

    ctx.save();
    ctx.fillStyle = config.fillStyle;
    ctx.textAlign = "center";
    ctx.textBaseline = textBaseline || "middle";

    fittedWidths.forEach((width, index) => {
      const distance = loneOffset + cursor + width / 2;
      const angularOffset = distance / radius;
      const angle = direction === "clockwise"
        ? startAngle + angularOffset
        : startAngle - angularOffset;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      const rotation = direction === "clockwise"
        ? angle + Math.PI / 2
        : angle - Math.PI / 2;

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rotation);
      ctx.font = `600 ${fittedFontSize}px ${fontFamily}`;
      ctx.fillText(characters[index], 0, 0);
      ctx.restore();
      cursor += width + gap;
    });

    ctx.restore();

    return {
      fontSize: fittedFontSize,
      gap,
      occupiedArc,
      availableArc,
      fillRatio: clamp(occupiedArc / (radius * span), 0, 1),
    };
  }

  function drawCircleStroke(ctx, radius, lineWidth, color, alpha) {
    ctx.save();
    ctx.strokeStyle = colorWithAlpha(color, alpha);
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }

  function distributeNotches(random, count, safeStart, safeEnd, notchHalfWidth) {
    if (count <= 0) return [];
    const safeSpan = safeEnd - safeStart;
    const usableSpan = Math.max(0, safeSpan - notchHalfWidth * 2.4);
    const positions = [];
    const seedPhase = random() * 0.8;

    for (let index = 0; index < count; index += 1) {
      const ratio = (index + 0.5 + seedPhase * 0.12) / count;
      const jitter = (random() - 0.5) * Math.min(0.06, usableSpan / count * 0.28);
      let angle = safeStart + notchHalfWidth * 1.2 + ratio * usableSpan + jitter;
      angle = ((angle % TAU) + TAU) % TAU;
      positions.push(angle);
    }
    return positions;
  }

  function cutOuterNotches(ctx, positions, depth, outerRadius, halfWidth) {
    if (!positions.length || depth <= 0) return;

    ctx.save();
    ctx.globalCompositeOperation = "destination-out";
    ctx.fillStyle = "#000";

    positions.forEach((angle) => {
      ctx.beginPath();
      ctx.arc(0, 0, outerRadius + 3, angle - halfWidth, angle + halfWidth);
      ctx.arc(0, 0, outerRadius - depth, angle + halfWidth, angle - halfWidth, true);
      ctx.closePath();
      ctx.fill();
    });

    ctx.restore();
  }

  function drawOuterMarks(ctx, random, color, wearAmount) {
    const marks = 18;
    ctx.save();
    ctx.strokeStyle = colorWithAlpha(color, 0.36 + wearAmount * 0.12);
    ctx.lineCap = "round";

    for (let index = 0; index < marks; index += 1) {
      const angle = random() * TAU;
      const radius = 407 + random() * 4;
      const length = 0.017 + random() * 0.035;
      ctx.lineWidth = 0.8 + random() * 1.1;
      ctx.beginPath();
      ctx.arc(0, 0, radius, angle, angle + length);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawCenterOrnament(ctx, type, color, random) {
    if (type === "none") return;

    const ink = colorWithAlpha(color, 0.96);
    const faintInk = colorWithAlpha(color, 0.45);
    ctx.save();
    ctx.translate(0, -4);
    ctx.strokeStyle = ink;
    ctx.fillStyle = ink;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    if (type === "mountain") {
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(0, -76, 25, 0, TAU);
      ctx.stroke();
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, -76, 16, 0, TAU);
      ctx.stroke();

      ctx.lineWidth = 2.8;
      ctx.beginPath();
      ctx.moveTo(-122, 51);
      ctx.lineTo(-63, -11);
      ctx.lineTo(-29, 20);
      ctx.lineTo(11, -50);
      ctx.lineTo(77, 22);
      ctx.lineTo(104, 2);
      ctx.lineTo(134, 51);
      ctx.closePath();
      ctx.fillStyle = colorWithAlpha(color, 0.18);
      ctx.fill();
      ctx.strokeStyle = ink;
      ctx.stroke();

      ctx.lineWidth = 4.3;
      ctx.beginPath();
      ctx.moveTo(-94, 78);
      ctx.lineTo(94, 78);
      ctx.stroke();
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-64, 92);
      ctx.lineTo(64, 92);
      ctx.strokeStyle = faintInk;
      ctx.stroke();
    }

    if (type === "sun") {
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(0, 0, 76, 0, TAU);
      ctx.stroke();
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, 0, 57, 0, TAU);
      ctx.stroke();
      ctx.fillStyle = colorWithAlpha(color, 0.19);
      ctx.beginPath();
      ctx.arc(0, 0, 38, 0, TAU);
      ctx.fill();
      ctx.stroke();

      for (let index = 0; index < 16; index += 1) {
        const angle = (index / 16) * TAU;
        const inner = 87 + (index % 2) * 4;
        const outer = inner + 19 + random() * 4;
        ctx.beginPath();
        ctx.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
        ctx.lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer);
        ctx.stroke();
      }
    }

    if (type === "diamond") {
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(0, -101);
      ctx.lineTo(101, 0);
      ctx.lineTo(0, 101);
      ctx.lineTo(-101, 0);
      ctx.closePath();
      ctx.stroke();
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(0, -69);
      ctx.lineTo(69, 0);
      ctx.lineTo(0, 69);
      ctx.lineTo(-69, 0);
      ctx.closePath();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, -37);
      ctx.lineTo(37, 0);
      ctx.lineTo(0, 37);
      ctx.lineTo(-37, 0);
      ctx.closePath();
      ctx.fillStyle = colorWithAlpha(color, 0.18);
      ctx.fill();
      ctx.stroke();

      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-95, 0);
      ctx.lineTo(-38, 0);
      ctx.moveTo(38, 0);
      ctx.lineTo(95, 0);
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawInnerDetails(ctx, options, color) {
    if (options.innerLines > 0) {
      drawCircleStroke(ctx, 286, 1.8, color, 0.84);
    }
    if (options.innerLines > 1) {
      drawCircleStroke(ctx, 272, 0.8, color, 0.48);
    }

    if (options.logo !== "none") {
      ctx.save();
      ctx.strokeStyle = colorWithAlpha(color, 0.42);
      ctx.lineWidth = 0.85;
      for (const direction of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(direction * 113, 153);
        ctx.lineTo(direction * 151, 119);
        ctx.moveTo(direction * 139, 153);
        ctx.lineTo(direction * 139, 153);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  function applyInkTexture(ctx, random, wear, ink, outerRadius) {
    const strength = wear / 100;
    if (strength <= 0) return;

    ctx.save();
    ctx.globalCompositeOperation = "source-atop";
    const cloudCount = Math.round(5 + strength * 16);
    for (let index = 0; index < cloudCount; index += 1) {
      const angle = random() * TAU;
      const radius = Math.sqrt(random()) * (outerRadius - 28);
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      ctx.fillStyle = random() > 0.48
        ? `rgba(255, 240, 214, ${0.018 + random() * strength * 0.065})`
        : colorWithAlpha(ink, 0.018 + random() * strength * 0.055);
      ctx.beginPath();
      ctx.ellipse(
        x,
        y,
        16 + random() * 62,
        9 + random() * 31,
        random() * TAU,
        0,
        TAU
      );
      ctx.fill();
    }

    const granuleCount = Math.round(180 + strength * 540);
    for (let index = 0; index < granuleCount; index += 1) {
      const angle = random() * TAU;
      const radius = Math.sqrt(random()) * (outerRadius - 4);
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      const granuleRadius = 0.35 + random() * 1.7;
      const light = random() > 0.64;
      ctx.fillStyle = light
        ? `rgba(255, 239, 213, ${0.025 + random() * strength * 0.08})`
        : colorWithAlpha(ink, 0.025 + random() * strength * 0.14);
      ctx.beginPath();
      ctx.arc(x, y, granuleRadius, 0, TAU);
      ctx.fill();
    }

    const fiberCount = Math.round(12 + strength * 32);
    ctx.lineCap = "round";
    for (let index = 0; index < fiberCount; index += 1) {
      const x = (random() - 0.5) * outerRadius * 1.72;
      const y = (random() - 0.5) * outerRadius * 1.72;
      ctx.strokeStyle = colorWithAlpha(ink, 0.04 + random() * strength * 0.09);
      ctx.lineWidth = 0.5 + random() * 1.2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (random() - 0.5) * 22, y + (random() - 0.5) * 9);
      ctx.stroke();
    }
    ctx.restore();
  }

  function applyWear(ctx, random, wear, outerRadius, dateRadius) {
    const strength = wear / 100;
    if (strength <= 0) return;

    ctx.save();
    ctx.globalCompositeOperation = "destination-out";
    ctx.fillStyle = "#000";

    const fleckCount = Math.round(strength * 740);
    for (let index = 0; index < fleckCount; index += 1) {
      const angle = random() * TAU;
      const radius = Math.sqrt(random()) * (outerRadius - 6);
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      const alpha = 0.08 + random() * strength * 0.38;
      const size = 0.4 + Math.pow(random(), 2.3) * 3.5;
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(x, y, size, 0, TAU);
      ctx.fill();
    }

    const blotchCount = Math.round(strength * 26);
    for (let index = 0; index < blotchCount; index += 1) {
      const angle = random() * TAU;
      const radius = Math.sqrt(random()) * (outerRadius - 22);
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      ctx.globalAlpha = 0.025 + random() * strength * 0.12;
      ctx.beginPath();
      ctx.ellipse(x, y, 2 + random() * 9, 1.5 + random() * 7, random() * TAU, 0, TAU);
      ctx.fill();
    }

    ctx.lineCap = "round";
    const scratchCount = Math.round(strength * 38);
    for (let index = 0; index < scratchCount; index += 1) {
      const angle = random() * TAU;
      const radius = 280 + random() * (outerRadius - 276);
      if (Math.abs(radius - dateRadius) < 40 && random() > 0.2) continue;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      ctx.globalAlpha = 0.06 + random() * strength * 0.22;
      ctx.strokeStyle = "#000";
      ctx.lineWidth = 0.4 + random() * 1.05;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (random() - 0.5) * 17, y + (random() - 0.5) * 6);
      ctx.stroke();
    }

    const edgeCount = Math.round(36 + strength * 135);
    for (let index = 0; index < edgeCount; index += 1) {
      const angle = random() * TAU;
      const radius = outerRadius - random() * 9;
      ctx.globalAlpha = 0.08 + random() * strength * 0.45;
      ctx.beginPath();
      ctx.arc(
        Math.cos(angle) * radius,
        Math.sin(angle) * radius,
        0.45 + random() * 2.8,
        0,
        TAU
      );
      ctx.fill();
    }

    ctx.restore();
  }

  function drawSeal(ctx, size, options, seed) {
    const settings = Object.assign({}, DEFAULTS, options || {});
    const random = mulberry32(seed);
    const scale = size / LOGICAL_SIZE;
    const outerRadius = 428;
    const textRadius = 361;
    const dateRadius = 348;
    const dateSpan = clamp((settings.arcDeg * Math.PI / 180) * 0.34, 0.9, 1.32);
    const arcSpan = settings.arcDeg * Math.PI / 180;
    const fontFamily = '"Noto Serif SC", "Songti SC", serif';
    const mainCharacters = normalizeText(settings.primaryText, 18);
    const dateCharacters = normalizeText(settings.dateText, 12);
    const safeMain = mainCharacters.length ? mainCharacters : ["印"];
    const safeDate = dateCharacters.length ? dateCharacters : ["无期"];
    const protection = {
      halfSpan: dateSpan / 2 + 0.19,
      outerRadius: dateRadius + 17,
      startAngle: Math.PI / 2 + dateSpan / 2,
      endAngle: Math.PI / 2 - dateSpan / 2,
    };
    const notchHalfWidth = clamp(0.35 / Math.max(settings.notchCount, 1), 0.012, 0.032);
    const safeStart = protection.startAngle + 0.17;
    const safeEnd = protection.endAngle + TAU - 0.17;
    const notches = distributeNotches(
      random,
      settings.notchCount,
      safeStart,
      safeEnd,
      notchHalfWidth
    );
    const maxSafeDepth = outerRadius - protection.outerRadius - 11;
    const actualNotchDepth = clamp(settings.notchDepth, 0, Math.max(0, maxSafeDepth));

    ctx.save();
    ctx.clearRect(0, 0, size, size);
    ctx.scale(scale, scale);
    ctx.translate(LOGICAL_SIZE / 2, LOGICAL_SIZE / 2);

    const ink = settings.ink;
    drawCircleStroke(ctx, outerRadius, 8.2, ink, 0.96);
    drawCircleStroke(ctx, 404, 1.25, ink, 0.52);
    cutOuterNotches(ctx, notches, actualNotchDepth, outerRadius, notchHalfWidth);
    drawOuterMarks(ctx, random, ink, settings.wear / 100);
    drawInnerDetails(ctx, settings, ink);
    drawCenterOrnament(ctx, settings.logo, ink, random);

    applyInkTexture(ctx, random, settings.wear, ink, outerRadius);
    applyWear(ctx, random, settings.wear, outerRadius, dateRadius);

    const mainLayout = drawArcText(ctx, safeMain, {
      radius: textRadius,
      span: arcSpan,
      startAngle: -Math.PI / 2 - arcSpan / 2,
      direction: "clockwise",
      fontSize: 62,
      fontFamily,
      fillStyle: colorWithAlpha(ink, 0.98),
    });

    const dateLayout = drawArcText(ctx, safeDate, {
      radius: dateRadius,
      span: dateSpan,
      startAngle: Math.PI / 2 + dateSpan / 2,
      direction: "counterclockwise",
      fontSize: 29,
      fontFamily,
      fillStyle: colorWithAlpha(ink, 0.94),
    });

    ctx.save();
    ctx.globalCompositeOperation = "source-atop";
    for (let index = 0; index < 90; index += 1) {
      const x = (random() - 0.5) * 760;
      const y = (random() - 0.5) * 760;
      ctx.fillStyle = random() > 0.5
        ? `rgba(255, 237, 210, ${0.025 + random() * 0.055})`
        : colorWithAlpha(ink, 0.03 + random() * 0.065);
      ctx.beginPath();
      ctx.arc(x, y, 0.4 + random() * 1.5, 0, TAU);
      ctx.fill();
    }
    ctx.restore();

    ctx.restore();

    return {
      seed: Number(seed),
      settings,
      mainLayout: {
        fontSize: mainLayout.fontSize,
        gap: mainLayout.gap,
        fillRatio: mainLayout.fillRatio,
      },
      dateLayout: {
        fontSize: dateLayout.fontSize,
        gap: dateLayout.gap,
        radius: dateRadius,
        span: dateSpan,
      },
      protection: {
        startAngle: protection.startAngle,
        endAngle: protection.endAngle,
        outerRadius: protection.outerRadius,
        safeGap: Math.max(0, outerRadius - actualNotchDepth - protection.outerRadius),
      },
      geometry: {
        outerRadius,
        textRadius,
        dateRadius,
        notchDepth: actualNotchDepth,
        notchCount: notches.length,
      },
    };
  }

  window.SealRenderer = {
    DEFAULTS,
    STAMP_MM,
    draw(ctx, size, options, seed) {
      return drawSeal(ctx, size, options, seed);
    },
    render(canvas, size, options, seed) {
      if (canvas.width !== size) canvas.width = size;
      if (canvas.height !== size) canvas.height = size;
      const context = canvas.getContext("2d");
      return drawSeal(context, size, options, seed);
    },
    toDataUrl(size, options, seed) {
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      drawSeal(canvas.getContext("2d"), size, options, seed);
      return canvas.toDataURL("image/png");
    },
  };
})();
