const SANS = '"Ubuntu Sans", "Helvetica Neue", Arial, sans-serif';
const DISPLAY = '"Iowan Old Style", "Bodoni 72", Didot, Georgia, "DejaVu Serif", serif';
const MONO = '"Ubuntu Mono", "SFMono-Regular", Consolas, monospace';

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function fract(value) {
  return value - Math.floor(value);
}

function wave(time, speed, phase = 0) {
  return Math.sin(time * speed + phase);
}

function drawGrain(ctx, width, height, time, color = "255,255,255", count = 85) {
  ctx.save();
  ctx.fillStyle = `rgba(${color},0.055)`;
  for (let index = 0; index < count; index += 1) {
    const x = fract(index * 0.618033 + time * 0.0037) * width;
    const y = fract(index * 0.754877 + time * 0.0021) * height;
    const size = 0.5 + fract(index * 0.381966) * 1.2;
    ctx.fillRect(x, y, size, size);
  }
  ctx.restore();
}

function drawEdgeFrame(ctx, width, height, color) {
  const margin = Math.round(width * 0.037);
  const length = Math.round(width * 0.032);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(margin, margin + length);
  ctx.lineTo(margin, margin);
  ctx.lineTo(margin + length, margin);
  ctx.moveTo(width - margin - length, height - margin);
  ctx.lineTo(width - margin, height - margin);
  ctx.lineTo(width - margin, height - margin - length);
  ctx.stroke();
  ctx.restore();
}

function drawOrbitScene(ctx, scene, time, width, height) {
  const background = ctx.createLinearGradient(0, 0, width, height);
  background.addColorStop(0, "#111828");
  background.addColorStop(0.42, "#273247");
  background.addColorStop(0.73, "#694b46");
  background.addColorStop(1, "#d47b50");
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);

  const sunX = width * 0.688;
  const sunY = height * 0.475;
  const sunRadius = width * 0.128;
  const breathe = 1 + wave(time, 0.65) * 0.018;

  const atmosphere = ctx.createRadialGradient(
    sunX,
    sunY,
    sunRadius * 0.2,
    sunX,
    sunY,
    sunRadius * 2.35
  );
  atmosphere.addColorStop(0, "rgba(255,211,162,0.54)");
  atmosphere.addColorStop(0.31, "rgba(255,139,83,0.24)");
  atmosphere.addColorStop(0.68, "rgba(255,109,68,0.08)");
  atmosphere.addColorStop(1, "rgba(255,109,68,0)");
  ctx.fillStyle = atmosphere;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.translate(sunX, sunY);
  ctx.rotate(-0.26);
  const orbits = [
    { rx: width * 0.245, ry: height * 0.152, speed: 0.46, offset: 1.4, size: 5.5 },
    { rx: width * 0.34, ry: height * 0.215, speed: -0.31, offset: 3.2, size: 3.2 },
    { rx: width * 0.41, ry: height * 0.275, speed: 0.2, offset: 0.7, size: 2.1 }
  ];

  for (const orbit of orbits) {
    ctx.strokeStyle = "rgba(255,238,211,0.21)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(0, 0, orbit.rx, orbit.ry, 0, 0, Math.PI * 2);
    ctx.stroke();

    const angle = time * orbit.speed + orbit.offset;
    const x = Math.cos(angle) * orbit.rx;
    const y = Math.sin(angle) * orbit.ry;
    const glow = ctx.createRadialGradient(x, y, 0, x, y, orbit.size * 5);
    glow.addColorStop(0, "rgba(255,242,214,0.95)");
    glow.addColorStop(0.3, "rgba(255,165,101,0.45)");
    glow.addColorStop(1, "rgba(255,120,73,0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, orbit.size * 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff3db";
    ctx.beginPath();
    ctx.arc(x, y, orbit.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  const sun = ctx.createRadialGradient(
    sunX - sunRadius * 0.35,
    sunY - sunRadius * 0.34,
    0,
    sunX,
    sunY,
    sunRadius * breathe
  );
  sun.addColorStop(0, "#fff8dd");
  sun.addColorStop(0.2, "#ffd89f");
  sun.addColorStop(0.66, "#ff915d");
  sun.addColorStop(1, "#d35f49");
  ctx.save();
  ctx.shadowBlur = 54;
  ctx.shadowColor = "rgba(255,144,88,0.8)";
  ctx.fillStyle = sun;
  ctx.beginPath();
  ctx.arc(sunX, sunY, sunRadius * breathe, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = "rgba(255,224,188,0.46)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(sunX, sunY, sunRadius * 1.27, Math.PI * 0.16, Math.PI * 0.86);
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = "rgba(255,236,210,0.24)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(width * 0.77, height * 0.075);
  ctx.lineTo(width * 0.77, height * 0.45);
  ctx.lineTo(width * 0.945, height * 0.45);
  ctx.stroke();
  ctx.fillStyle = "rgba(255,235,210,0.72)";
  ctx.fillRect(width * 0.942, height * 0.443, 9, 9);
  ctx.restore();

  ctx.save();
  ctx.fillStyle = "rgba(255,235,214,0.68)";
  ctx.font = `500 ${Math.round(width * 0.009)}px ${MONO}`;
  ctx.letterSpacing = `${width * 0.0025}px`;
  ctx.fillText("SCENE 01 / FIRST LIGHT", width * 0.074, height * 0.102);
  ctx.fillStyle = "rgba(255,243,221,0.42)";
  ctx.fillText("ORBITAL DAWN — 04:12:26", width * 0.074, height * 0.128);
  ctx.restore();

  const titleY = height * 0.775;
  ctx.save();
  ctx.fillStyle = "#fff0d2";
  ctx.font = `400 ${Math.round(width * 0.101)}px ${DISPLAY}`;
  ctx.letterSpacing = `${-width * 0.003}px`;
  ctx.fillText("First", width * 0.068, titleY);
  const kick = wave(time, 0.7) * width * 0.004;
  ctx.fillStyle = "#ece0ca";
  ctx.font = `italic 400 ${Math.round(width * 0.101)}px ${DISPLAY}`;
  ctx.fillText("Light", width * 0.265 + kick, titleY + height * 0.074);
  ctx.restore();

  ctx.save();
  ctx.font = `500 ${Math.round(width * 0.0076)}px ${MONO}`;
  ctx.letterSpacing = `${width * 0.0015}px`;
  ctx.fillStyle = "rgba(255,241,218,0.68)";
  ctx.fillText("MOTION / CONTINUOUS", width * 0.072, height * 0.891);
  ctx.fillText("FRAME 01", width * 0.852, height * 0.891);
  ctx.restore();

  drawEdgeFrame(ctx, width, height, "rgba(255,245,224,0.38)");
  drawGrain(ctx, width, height, time, "255,244,222");
}

function drawTideScene(ctx, scene, time, width, height) {
  const background = ctx.createLinearGradient(0, 0, width, height);
  background.addColorStop(0, "#082b2d");
  background.addColorStop(0.46, "#0c4f4d");
  background.addColorStop(0.8, "#176966");
  background.addColorStop(1, "#0b2b2b");
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);

  const bloom = ctx.createRadialGradient(
    width * 0.18,
    height * 0.86,
    0,
    width * 0.18,
    height * 0.86,
    width * 0.72
  );
  bloom.addColorStop(0, "rgba(142,255,207,0.18)");
  bloom.addColorStop(0.4, "rgba(57,210,178,0.09)");
  bloom.addColorStop(1, "rgba(6,27,28,0)");
  ctx.fillStyle = bloom;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.translate(-width * 0.045, height * 1.075);
  ctx.lineCap = "round";
  for (let index = 0; index < 27; index += 1) {
    const pulse = wave(time * 0.9 + index * 0.12, 0.55) * height * 0.006;
    const rx = width * 0.085 + index * width * 0.052 + pulse;
    const ry = height * 0.036 + index * height * 0.039 + pulse * 0.5;
    ctx.strokeStyle =
      index % 5 === 0
        ? "rgba(217,255,107,0.53)"
        : `rgba(168,236,214,${0.14 + (index % 4) * 0.035})`;
    ctx.lineWidth = index % 5 === 0 ? 1.6 : 1;
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, -0.07, Math.PI, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();

  const beaconX = width * 0.78;
  const beaconY = height * 0.34;
  const beaconR = width * 0.148;
  ctx.save();
  ctx.translate(beaconX, beaconY);
  const coreGlow = ctx.createRadialGradient(0, 0, 0, 0, 0, beaconR * 1.7);
  coreGlow.addColorStop(0, "rgba(215,255,106,0.23)");
  coreGlow.addColorStop(0.5, "rgba(138,233,199,0.08)");
  coreGlow.addColorStop(1, "rgba(80,200,178,0)");
  ctx.fillStyle = coreGlow;
  ctx.beginPath();
  ctx.arc(0, 0, beaconR * 1.7, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(220,255,207,0.18)";
  ctx.lineWidth = 1;
  for (let ring = 0; ring < 3; ring += 1) {
    ctx.save();
    ctx.rotate(time * (ring % 2 === 0 ? 0.08 : -0.06) + ring * 0.34);
    ctx.setLineDash(ring === 1 ? [4, 14] : []);
    ctx.beginPath();
    ctx.arc(0, 0, beaconR * (0.6 + ring * 0.28), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  ctx.rotate(time * 0.18);
  ctx.strokeStyle = "rgba(215,255,106,0.9)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, beaconR, -0.48, 1.1);
  ctx.stroke();
  ctx.strokeStyle = "rgba(215,255,106,0.34)";
  ctx.beginPath();
  ctx.arc(0, 0, beaconR * 0.74, 2.28, 4.2);
  ctx.stroke();
  ctx.fillStyle = "#d7ff6a";
  ctx.beginPath();
  ctx.arc(
    Math.cos(1.1) * beaconR,
    Math.sin(1.1) * beaconR,
    width * 0.006,
    0,
    Math.PI * 2
  );
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.translate(beaconX, beaconY);
  ctx.fillStyle = "#e9f4d3";
  ctx.textAlign = "center";
  ctx.font = `500 ${Math.round(width * 0.0075)}px ${MONO}`;
  ctx.letterSpacing = `${width * 0.0016}px`;
  ctx.fillText("SIGNAL", 0, -height * 0.008);
  ctx.fillStyle = "#d7ff6a";
  ctx.font = `400 ${Math.round(width * 0.022)}px ${DISPLAY}`;
  ctx.letterSpacing = "0px";
  ctx.fillText("02", 0, height * 0.035);
  ctx.restore();

  const scan = fract(time * 0.15) * width;
  const scanGradient = ctx.createLinearGradient(scan - width * 0.12, 0, scan, 0);
  scanGradient.addColorStop(0, "rgba(215,255,106,0)");
  scanGradient.addColorStop(1, "rgba(215,255,106,0.12)");
  ctx.fillStyle = scanGradient;
  ctx.fillRect(scan - width * 0.12, 0, width * 0.12, height);
  ctx.fillStyle = "rgba(215,255,106,0.33)";
  ctx.fillRect(scan, 0, 1, height);

  ctx.save();
  ctx.fillStyle = "rgba(220,245,225,0.68)";
  ctx.font = `500 ${Math.round(width * 0.009)}px ${MONO}`;
  ctx.letterSpacing = `${width * 0.0025}px`;
  ctx.fillText("SCENE 02 / TIDE SIGNAL", width * 0.074, height * 0.102);
  ctx.fillStyle = "rgba(215,255,106,0.8)";
  ctx.fillText("◇ LIVE CURRENT", width * 0.746, height * 0.102);
  ctx.fillStyle = "rgba(220,245,225,0.4)";
  ctx.font = `400 ${Math.round(width * 0.0075)}px ${MONO}`;
  ctx.fillText("52.3676° N   04.9044° E", width * 0.074, height * 0.128);
  ctx.restore();

  const lineY = height * 0.17;
  ctx.save();
  ctx.strokeStyle = "rgba(220,255,220,0.15)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(width * 0.074, lineY);
  ctx.lineTo(width * 0.926, lineY);
  ctx.stroke();
  for (let index = 0; index < 13; index += 1) {
    const x = width * (0.074 + index * 0.071);
    ctx.fillStyle =
      index === 5 ? "rgba(215,255,106,0.9)" : "rgba(220,255,220,0.34)";
    ctx.fillRect(x, lineY - 2, 1, 5);
  }
  ctx.restore();

  ctx.save();
  ctx.fillStyle = "#e5edda";
  ctx.font = `700 ${Math.round(width * 0.135)}px ${SANS}`;
  ctx.letterSpacing = `${-width * 0.007}px`;
  ctx.fillText("TIDE", width * 0.068, height * 0.7);
  ctx.beginPath();
  ctx.strokeStyle = "rgba(229,237,218,0.7)";
  ctx.lineWidth = 1.5;
  ctx.font = `600 ${Math.round(width * 0.126)}px ${SANS}`;
  ctx.strokeText("SIGNAL", width * 0.183, height * 0.822);
  ctx.restore();

  ctx.save();
  ctx.fillStyle = "#d7ff6a";
  ctx.beginPath();
  ctx.arc(width * 0.077, height * 0.879, width * 0.006, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(227,241,216,0.68)";
  ctx.font = `500 ${Math.round(width * 0.0076)}px ${MONO}`;
  ctx.letterSpacing = `${width * 0.0011}px`;
  ctx.fillText("42.8 Hz / DEEP CURRENT", width * 0.094, height * 0.882);
  ctx.textAlign = "right";
  ctx.fillText("FRAME 02", width * 0.926, height * 0.882);
  ctx.restore();

  drawEdgeFrame(ctx, width, height, "rgba(228,246,218,0.34)");
  drawGrain(ctx, width, height, time, "224,251,226", 65);
}

function drawBloomScene(ctx, scene, time, width, height) {
  const background = ctx.createLinearGradient(0, 0, width, height);
  background.addColorStop(0, "#f0e8d9");
  background.addColorStop(0.52, "#e7ddce");
  background.addColorStop(1, "#d9cdc1");
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);

  const warmWash = ctx.createRadialGradient(
    width * 0.73,
    height * 0.25,
    0,
    width * 0.73,
    height * 0.25,
    width * 0.54
  );
  warmWash.addColorStop(0, "rgba(255,226,194,0.66)");
  warmWash.addColorStop(0.5, "rgba(229,180,169,0.18)");
  warmWash.addColorStop(1, "rgba(229,180,169,0)");
  ctx.fillStyle = warmWash;
  ctx.fillRect(0, 0, width, height);

  const centerX = width * 0.67;
  const centerY = height * 0.405;
  const radius = width * 0.225;
  const rotation = time * 0.075;
  const colors = [
    "rgba(198,69,118,0.54)",
    "rgba(238,143,114,0.42)",
    "rgba(105,92,192,0.45)",
    "rgba(226,106,155,0.4)"
  ];

  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.globalCompositeOperation = "multiply";
  for (let index = 0; index < 16; index += 1) {
    const angle = rotation + (index / 16) * Math.PI * 2;
    const stretch = 1 + wave(time * 0.45 + index * 0.4, 0.9) * 0.035;
    ctx.save();
    ctx.rotate(angle);
    ctx.fillStyle = colors[index % colors.length];
    ctx.beginPath();
    ctx.moveTo(0, radius * 0.04);
    ctx.bezierCurveTo(
      -radius * 0.24,
      -radius * 0.24,
      -radius * 0.23,
      -radius * 0.65 * stretch,
      0,
      -radius * 0.94 * stretch
    );
    ctx.bezierCurveTo(
      radius * 0.23,
      -radius * 0.65 * stretch,
      radius * 0.24,
      -radius * 0.24,
      0,
      radius * 0.04
    );
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();

  ctx.save();
  ctx.globalCompositeOperation = "multiply";
  ctx.strokeStyle = "rgba(35,29,30,0.17)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius * 0.93, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius * 0.42, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.rotate(-rotation * 1.8);
  ctx.strokeStyle = "rgba(246,241,225,0.8)";
  ctx.lineWidth = width * 0.0035;
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.58, -0.35, 0.82);
  ctx.stroke();
  ctx.strokeStyle = "rgba(55,46,71,0.5)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.92, 1.4, 2.8);
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = "#e7ddce";
  ctx.beginPath();
  ctx.arc(centerX, centerY, width * 0.023, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(43,35,35,0.6)";
  ctx.lineWidth = 1;
  ctx.stroke();

  const blueX = width * 0.855;
  const blueY = height * 0.2 + wave(time, 0.42) * height * 0.015;
  ctx.save();
  ctx.fillStyle = "rgba(84,90,189,0.82)";
  ctx.beginPath();
  ctx.arc(blueX, blueY, width * 0.044, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#f0e8d9";
  ctx.beginPath();
  ctx.arc(blueX - width * 0.012, blueY - width * 0.014, width * 0.018, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.translate(width * 0.12, height * 0.805);
  ctx.rotate(-0.02);
  ctx.fillStyle = "#282323";
  ctx.font = `400 ${Math.round(width * 0.108)}px ${DISPLAY}`;
  ctx.letterSpacing = `${-width * 0.005}px`;
  ctx.fillText("Soft", 0, 0);
  ctx.fillStyle = "#863e5d";
  ctx.font = `italic 400 ${Math.round(width * 0.108)}px ${DISPLAY}`;
  ctx.fillText("Geometry", width * 0.238, height * 0.087);
  ctx.restore();

  ctx.save();
  ctx.fillStyle = "rgba(43,36,35,0.68)";
  ctx.font = `500 ${Math.round(width * 0.009)}px ${MONO}`;
  ctx.letterSpacing = `${width * 0.0023}px`;
  ctx.fillText("SCENE 03 / SOFT GEOMETRY", width * 0.074, height * 0.102);
  ctx.fillStyle = "rgba(43,36,35,0.42)";
  ctx.fillText("PAPER BLOOM — CHROMATIC MOTION", width * 0.074, height * 0.128);
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = "rgba(43,37,36,0.25)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(width * 0.074, height * 0.16);
  ctx.lineTo(width * 0.926, height * 0.16);
  ctx.stroke();
  ctx.fillStyle = "#282323";
  ctx.font = `500 ${Math.round(width * 0.0076)}px ${MONO}`;
  ctx.letterSpacing = `${width * 0.0011}px`;
  ctx.fillText("ROTATION / +0.075 RAD", width * 0.074, height * 0.902);
  ctx.textAlign = "right";
  ctx.fillText("FRAME 03", width * 0.926, height * 0.902);
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = "rgba(44,37,36,0.42)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(width * 0.926, height * 0.185);
  ctx.lineTo(width * 0.926, height * 0.558);
  ctx.stroke();
  ctx.translate(width * 0.944, height * 0.185);
  ctx.rotate(Math.PI / 2);
  ctx.fillStyle = "rgba(44,37,36,0.6)";
  ctx.font = `500 ${Math.round(width * 0.0075)}px ${MONO}`;
  ctx.letterSpacing = `${width * 0.0015}px`;
  ctx.fillText("ANALOG BLOOM / 03", 0, 0);
  ctx.restore();

  drawEdgeFrame(ctx, width, height, "rgba(43,37,36,0.36)");
  drawGrain(ctx, width, height, time, "63,45,48", 55);
}

const RENDERERS = {
  orbit: drawOrbitScene,
  tide: drawTideScene,
  bloom: drawBloomScene
};

export function renderScene(ctx, scene, localTime, width, height) {
  const renderer = RENDERERS[scene.preset] || drawOrbitScene;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = scene.ink;
  ctx.fillRect(0, 0, width, height);
  renderer(ctx, scene, Math.max(0, localTime), width, height);
  ctx.restore();
}
