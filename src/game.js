import {
  WORLD,
  createFlight,
  dropBallast,
  flightSummary,
  groundY,
  stepFlight,
  windAt,
} from "./physics.js";
import { createPilot, pilotInput } from "./pilot.js";

const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d", { alpha: false });
const dom = {
  startOverlay: document.querySelector("#startOverlay"),
  resultOverlay: document.querySelector("#resultOverlay"),
  helpOverlay: document.querySelector("#helpOverlay"),
  resultCard: document.querySelector(".result-card"),
  resultKicker: document.querySelector("#resultKicker"),
  resultTitle: document.querySelector("#resultTitle"),
  resultCopy: document.querySelector("#resultCopy"),
  resultTime: document.querySelector("#resultTime"),
  resultBallast: document.querySelector("#resultBallast"),
  resultSpeed: document.querySelector("#resultSpeed"),
  watchAgainButton: document.querySelector("#watchAgainButton"),
  objective1: document.querySelector("#objective1"),
  objective2: document.querySelector("#objective2"),
  objective3: document.querySelector("#objective3"),
  progress: document.querySelector("#progressFill"),
  tempValue: document.querySelector("#tempValue"),
  heatFill: document.querySelector("#heatFill"),
  heatMarker: document.querySelector("#heatMarker"),
  climbState: document.querySelector("#climbState"),
  verticalSpeed: document.querySelector("#verticalSpeed"),
  ballastBags: document.querySelector("#ballastBags"),
  ballastCount: document.querySelector("#ballastCount"),
  windArrow: document.querySelector("#windArrow"),
  windSpeed: document.querySelector("#windSpeed"),
  windNote: document.querySelector("#windNote"),
  altitudeCallout: document.querySelector("#altitudeCallout"),
  toast: document.querySelector("#toast"),
  demoBanner: document.querySelector("#demoBanner"),
  audioButton: document.querySelector("#audioButton"),
  audioLabel: document.querySelector("#audioLabel"),
};

const game = {
  mode: "menu",
  flight: createFlight(),
  pilot: createPilot(),
  autoPilot: false,
  paused: false,
  cameraX: -24,
  resultShownAt: 0,
  lastFrame: performance.now(),
  fixedAccumulator: 0,
  keyBurn: false,
  keyVent: false,
  touchBurn: false,
  touchVent: false,
  toastTimer: 0,
  calloutTimer: 0,
  lastCallout: "",
  eventCursor: 0,
};

const visuals = {
  stars: Array.from({ length: 88 }, (_, index) => ({
    x: ((index * 193 + 47) % 1700) / 1700,
    y: ((index * 89 + 31) % 100) / 100,
    radius: 0.5 + (index % 4) * 0.28,
    speed: 0.35 + (index % 7) * 0.05,
  })),
  windLines: [],
  embers: [],
  smoke: [],
  lastSpawn: 0,
};

for (let index = 0; index < 26; index += 1) {
  visuals.windLines.push({
    x: Math.random() * 900,
    y: 90 + Math.random() * 400,
    length: 30 + Math.random() * 90,
    speed: 14 + Math.random() * 30,
    alpha: 0.18 + Math.random() * 0.28,
  });
}

class Soundscape {
  constructor() {
    this.context = null;
    this.master = null;
    this.windGain = null;
    this.windFilter = null;
    this.burnerGain = null;
    this.burnerFilter = null;
    this.enabled = true;
    this.started = false;
  }

  ensure() {
    if (this.context) {
      if (this.context.state === "suspended") this.context.resume();
      return;
    }
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    this.context = new AudioContext();
    this.master = this.context.createGain();
    this.master.gain.value = this.enabled ? 0.85 : 0;
    this.master.connect(this.context.destination);

    const windSource = this.context.createBufferSource();
    windSource.buffer = this.makeNoise(3.5);
    windSource.loop = true;
    this.windFilter = this.context.createBiquadFilter();
    this.windFilter.type = "bandpass";
    this.windFilter.frequency.value = 620;
    this.windFilter.Q.value = 0.55;
    this.windGain = this.context.createGain();
    this.windGain.gain.value = 0.035;
    windSource.connect(this.windFilter).connect(this.windGain).connect(this.master);
    windSource.start();

    const burnerSource = this.context.createBufferSource();
    burnerSource.buffer = this.makeNoise(2.2);
    burnerSource.loop = true;
    this.burnerFilter = this.context.createBiquadFilter();
    this.burnerFilter.type = "lowpass";
    this.burnerFilter.frequency.value = 430;
    this.burnerFilter.Q.value = 0.8;
    this.burnerGain = this.context.createGain();
    this.burnerGain.gain.value = 0;
    burnerSource.connect(this.burnerFilter).connect(this.burnerGain).connect(this.master);
    burnerSource.start();

    const rumble = this.context.createOscillator();
    const rumbleGain = this.context.createGain();
    rumble.type = "triangle";
    rumble.frequency.value = 42;
    rumbleGain.gain.value = 0.055;
    rumble.connect(rumbleGain).connect(this.master);
    rumble.start();
    this.started = true;
  }

  makeNoise(seconds) {
    const length = Math.floor(this.context.sampleRate * seconds);
    const buffer = this.context.createBuffer(1, length, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    let brown = 0;
    for (let index = 0; index < length; index += 1) {
      const white = Math.random() * 2 - 1;
      brown = (brown + 0.018 * white) / 1.018;
      data[index] = brown * 2.4;
    }
    return buffer;
  }

  updateWind(speed, height) {
    if (!this.started || !this.enabled) return;
    const time = this.context.currentTime;
    const gust = Math.max(0, Math.min(1, (speed - 18) / 30));
    this.windGain.gain.setTargetAtTime(0.035 + gust * 0.045, time, 0.25);
    this.windFilter.frequency.setTargetAtTime(450 + height * 1.8 + gust * 280, time, 0.4);
  }

  updateBurner(active) {
    if (!this.started) return;
    const time = this.context.currentTime;
    this.burnerGain.gain.setTargetAtTime(active ? 0.17 : 0.015, time, active ? 0.08 : 0.35);
    this.burnerFilter.frequency.setTargetAtTime(active ? 720 : 280, time, 0.2);
  }

  note(frequency, length, volume = 0.05, delay = 0) {
    if (!this.started || !this.enabled) return;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    const start = this.context.currentTime + delay;
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(volume, start + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
    oscillator.connect(gain).connect(this.master);
    oscillator.start(start);
    oscillator.stop(start + length + 0.05);
  }

  drop() {
    if (!this.started || !this.enabled) return;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    const now = this.context.currentTime;
    oscillator.type = "square";
    oscillator.frequency.setValueAtTime(120, now);
    oscillator.frequency.exponentialRampToValueAtTime(45, now + 0.18);
    gain.gain.setValueAtTime(0.07, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
    oscillator.connect(gain).connect(this.master);
    oscillator.start(now);
    oscillator.stop(now + 0.25);
  }

  ridge(index) {
    this.note(392 + index * 55, 0.85, 0.035);
    this.note(523 + index * 65, 0.65, 0.022, 0.08);
  }

  success() {
    [261.6, 329.6, 392, 523.3].forEach((note, index) => {
      this.note(note, 1.8, 0.038, index * 0.12);
    });
  }

  failure() {
    this.note(180, 0.7, 0.05);
    this.note(112, 1.1, 0.06, 0.16);
  }

  toggle() {
    this.enabled = !this.enabled;
    if (this.master) this.master.gain.setTargetAtTime(this.enabled ? 0.85 : 0, this.context.currentTime, 0.1);
    return this.enabled;
  }
}

const audio = new Soundscape();

const view = {
  width: 0,
  height: 0,
  dpr: 1,
  scale: 1,
  groundScreenY: 0,
};

function resizeCanvas() {
  view.width = canvas.clientWidth;
  view.height = canvas.clientHeight;
  view.dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(view.width * view.dpr);
  canvas.height = Math.round(view.height * view.dpr);
  view.scale = Math.max(0.58, Math.min(1.45, view.height / 720));
  view.groundScreenY = WORLD.baseY * view.scale;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(from, to, amount) {
  return from + (to - from) * amount;
}

function rgba(red, green, blue, alpha) {
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function drawSky(time) {
  const horizon = view.groundScreenY;
  const sky = ctx.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, "#0d1418");
  sky.addColorStop(0.36, "#1c292d");
  sky.addColorStop(0.7, "#3d4039");
  sky.addColorStop(0.9, "#8b5839");
  sky.addColorStop(1, "#bc7145");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, view.width, view.height);

  const glow = ctx.createRadialGradient(
    view.width * 0.26,
    horizon * 0.84,
    0,
    view.width * 0.26,
    horizon * 0.84,
    view.width * 0.5,
  );
  glow.addColorStop(0, "rgba(255, 146, 76, 0.28)");
  glow.addColorStop(0.38, "rgba(222, 108, 60, 0.11)");
  glow.addColorStop(1, "rgba(100, 50, 36, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, view.width, horizon);

  ctx.fillStyle = "#f2c099";
  ctx.beginPath();
  ctx.arc(view.width * 0.27, horizon * 0.8, 3.4, 0, Math.PI * 2);
  ctx.fill();

  for (const star of visuals.stars) {
    const flicker = 0.35 + 0.25 * Math.sin(time * star.speed + star.x * 19);
    ctx.fillStyle = rgba(230, 235, 216, flicker);
    ctx.beginPath();
    ctx.arc(star.x * view.width, star.y * horizon * 0.66, star.radius, 0, Math.PI * 2);
    ctx.fill();
  }

  const haze = ctx.createLinearGradient(0, horizon * 0.45, 0, horizon);
  haze.addColorStop(0, "rgba(89, 101, 91, 0)");
  haze.addColorStop(0.72, "rgba(112, 112, 91, 0.11)");
  haze.addColorStop(1, "rgba(191, 106, 62, 0.2)");
  ctx.fillStyle = haze;
  ctx.fillRect(0, horizon * 0.45, view.width, horizon * 0.55);
}

function drawDistantRidge(offsetFactor, base, amplitude, color, phase) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(-50, view.groundScreenY);
  for (let screenX = -50; screenX <= view.width + 50; screenX += 14) {
    const nx = (screenX + game.cameraX * view.scale * offsetFactor) / view.width;
    const ridge =
      Math.sin(nx * 8.2 + phase) * amplitude +
      Math.sin(nx * 17.3 + phase * 2.1) * amplitude * 0.32;
    ctx.lineTo(screenX, base - ridge);
  }
  ctx.lineTo(view.width + 50, view.groundScreenY);
  ctx.fill();
  ctx.restore();
}

function drawBackdrop(time) {
  drawDistantRidge(0.12, view.groundScreenY * 0.62, 22 * view.scale, "#202b2c", 0.7);
  drawDistantRidge(0.24, view.groundScreenY * 0.72, 31 * view.scale, "#1b2728", 1.9);
  drawDistantRidge(0.42, view.groundScreenY * 0.81, 38 * view.scale, "#172223", 3.2);

  ctx.strokeStyle = "rgba(238, 236, 211, 0.09)";
  ctx.lineWidth = 1;
  for (const line of visuals.windLines) {
    const x = (line.x + time * line.speed) % (view.width + 160) - 80;
    const y = line.y * (view.groundScreenY / 720);
    ctx.globalAlpha = line.alpha;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(
      x + line.length * 0.34,
      y - 5,
      x + line.length * 0.7,
      y + 4,
      x + line.length,
      y,
    );
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function randomFor(index, salt = 0) {
  const value = Math.sin(index * 127.1 + salt * 311.7) * 43758.5453;
  return value - Math.floor(value);
}

function terrainPath(startX, endX) {
  ctx.beginPath();
  ctx.moveTo(startX, groundY(startX));
  for (let x = startX; x <= endX; x += 5) {
    ctx.lineTo(x, groundY(x));
  }
  ctx.lineTo(endX, groundY(endX));
}

function drawFireLine(time) {
  const cameraRight = game.cameraX + view.width / view.scale;
  const fireWorldX = Math.max(game.flight.fireX, game.cameraX - 35);
  if (fireWorldX > cameraRight + 120) return;
  const floor = groundY(fireWorldX + 20);

  const glow = ctx.createRadialGradient(fireWorldX, floor - 20, 0, fireWorldX, floor - 20, 220);
  glow.addColorStop(0, "rgba(255, 108, 44, 0.44)");
  glow.addColorStop(0.3, "rgba(231, 82, 37, 0.2)");
  glow.addColorStop(1, "rgba(142, 48, 28, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(fireWorldX - 230, floor - 240, 460, 270);

  for (let index = 0; index < 20; index += 1) {
    const offset = randomFor(index, 2) * 90 - 20;
    const x = fireWorldX + offset;
    const base = groundY(x);
    const height = 12 + randomFor(index, 4) * 38;
    const sway = Math.sin(time * 5 + index * 1.9) * 7;
    const flame = ctx.createLinearGradient(x, base, x, base - height);
    flame.addColorStop(0, "rgba(255, 205, 85, 0.9)");
    flame.addColorStop(0.45, "rgba(255, 108, 42, 0.8)");
    flame.addColorStop(1, "rgba(156, 45, 26, 0)");
    ctx.fillStyle = flame;
    ctx.beginPath();
    ctx.moveTo(x - 7, base + 2);
    ctx.quadraticCurveTo(x - 2, base - height * 0.5, x + sway, base - height);
    ctx.quadraticCurveTo(x + 8, base - height * 0.32, x + 7, base + 2);
    ctx.fill();
  }

  for (let index = 0; index < 7; index += 1) {
    const drift = (time * (10 + index * 2) + index * 47) % 120;
    const x = fireWorldX - 48 + randomFor(index, 7) * 100 + drift * 0.28;
    const y = floor - 48 - drift * 0.9 - randomFor(index, 8) * 30;
    const radius = 13 + index * 2.4;
    ctx.fillStyle = rgba(35, 39, 37, 0.08 + index * 0.006);
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawTerrain(time) {
  const startX = game.cameraX - 100;
  const endX = game.cameraX + view.width / view.scale + 100;
  const bottom = view.height / view.scale + 20;

  terrainPath(startX, endX);
  ctx.lineTo(endX, bottom);
  ctx.lineTo(startX, bottom);
  ctx.closePath();
  const earth = ctx.createLinearGradient(0, 430, 0, bottom);
  earth.addColorStop(0, "#1d2b2b");
  earth.addColorStop(0.52, "#152221");
  earth.addColorStop(1, "#0d1717");
  ctx.fillStyle = earth;
  ctx.fill();

  ctx.save();
  ctx.globalAlpha = 0.24;
  for (let layer = 1; layer <= 3; layer += 1) {
    terrainPath(startX, endX);
    ctx.strokeStyle = layer === 1 ? "rgba(196, 205, 183, 0.33)" : "rgba(114, 151, 126, 0.17)";
    ctx.lineWidth = layer === 1 ? 1.1 : 0.7;
    ctx.translate(0, layer * 17);
    ctx.stroke();
    ctx.translate(0, -layer * 17);
  }
  ctx.restore();

  terrainPath(startX, endX);
  ctx.strokeStyle = "rgba(210, 218, 189, 0.52)";
  ctx.lineWidth = 1.2;
  ctx.stroke();

  drawTrees(startX, endX);

  ctx.save();
  ctx.font = "600 9px Avenir Next, sans-serif";
  ctx.letterSpacing = "2px";
  ctx.fillStyle = "rgba(202, 214, 190, 0.42)";
  ctx.textAlign = "center";
  ctx.fillText("山脊 Ⅰ", WORLD.ridge1.x, groundY(WORLD.ridge1.x) - 13);
  ctx.fillText("山脊 Ⅱ", WORLD.ridge2.x, groundY(WORLD.ridge2.x) - 13);
  ctx.restore();

  drawLandingZone(time);
  drawFireLine(time);
}

function drawTrees(startX, endX) {
  ctx.fillStyle = "rgba(8, 18, 17, 0.9)";
  for (let x = Math.ceil(startX / 18) * 18; x < endX; x += 18) {
    const chance = randomFor(x, 13);
    if (chance < 0.33) continue;
    const y = groundY(x) + 1;
    const height = 7 + randomFor(x, 15) * 15;
    const width = height * 0.23;
    ctx.beginPath();
    ctx.moveTo(x, y - height);
    ctx.lineTo(x - width, y);
    ctx.lineTo(x + width, y);
    ctx.closePath();
    ctx.fill();
  }
}

function drawLandingZone(time) {
  const x = WORLD.finishX + 75;
  const floor = groundY(x);
  const pulse = 0.55 + Math.sin(time * 2.2) * 0.18;
  const beam = ctx.createLinearGradient(x, floor - 190, x, floor);
  beam.addColorStop(0, "rgba(168, 217, 180, 0)");
  beam.addColorStop(1, `rgba(168, 217, 180, ${0.1 * pulse})`);
  ctx.fillStyle = beam;
  ctx.beginPath();
  ctx.moveTo(x - 28, floor);
  ctx.lineTo(x - 8, floor - 190);
  ctx.lineTo(x + 8, floor - 190);
  ctx.lineTo(x + 28, floor);
  ctx.fill();

  ctx.strokeStyle = `rgba(168, 217, 180, ${0.55 + pulse * 0.3})`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(x, floor + 2, 48, 9, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(x, floor + 2, 26 + pulse * 8, 5 + pulse * 2, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "rgba(168, 217, 180, 0.76)";
  ctx.font = "700 9px Avenir Next, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("东侧接应高地", x, floor - 22);
}

function envelopePath() {
  ctx.beginPath();
  ctx.moveTo(0, -27);
  ctx.bezierCurveTo(-15, -48, -61, -72, -63, -111);
  ctx.bezierCurveTo(-65, -153, -30, -184, 0, -184);
  ctx.bezierCurveTo(30, -184, 65, -153, 63, -111);
  ctx.bezierCurveTo(61, -72, 15, -48, 0, -27);
  ctx.closePath();
}

function drawBalloon(flight, time) {
  const ground = groundY(flight.x);
  ctx.save();
  ctx.globalAlpha = flight.phase === "landed" ? 0.34 : 0.19;
  ctx.fillStyle = "#030909";
  ctx.beginPath();
  ctx.ellipse(flight.x + 28, ground + 3, 48, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.translate(flight.x, flight.y);
  const tilt = clamp((flight.vx - 27) * 0.0018, -0.055, 0.075);
  const bob = Math.sin(time * 1.1) * 1.2;
  ctx.rotate(tilt + Math.sin(time * 0.63) * 0.009);
  ctx.translate(0, bob);

  ctx.strokeStyle = "rgba(24, 27, 24, 0.78)";
  ctx.lineWidth = 1;
  for (const x of [-13, -4, 5, 14]) {
    ctx.beginPath();
    ctx.moveTo(x * 0.92, -30);
    ctx.lineTo(x * 1.25, -8);
    ctx.stroke();
  }

  envelopePath();
  const envelope = ctx.createLinearGradient(-64, -150, 64, -65);
  envelope.addColorStop(0, "#b95f43");
  envelope.addColorStop(0.35, "#e0a878");
  envelope.addColorStop(0.67, "#f2d4aa");
  envelope.addColorStop(1, "#a94e3b");
  ctx.fillStyle = envelope;
  ctx.fill();

  ctx.save();
  envelopePath();
  ctx.clip();
  ctx.fillStyle = "rgba(99, 45, 38, 0.42)";
  ctx.beginPath();
  ctx.moveTo(-29, -190);
  ctx.bezierCurveTo(-15, -130, -25, -74, -6, -23);
  ctx.lineTo(9, -23);
  ctx.bezierCurveTo(-3, -80, 9, -132, 3, -190);
  ctx.fill();
  ctx.fillStyle = "rgba(236, 188, 119, 0.58)";
  ctx.beginPath();
  ctx.moveTo(24, -190);
  ctx.bezierCurveTo(16, -128, 35, -67, 12, -23);
  ctx.lineTo(18, -23);
  ctx.bezierCurveTo(43, -72, 28, -133, 33, -190);
  ctx.fill();

  const shade = ctx.createLinearGradient(-64, 0, 64, 0);
  shade.addColorStop(0, "rgba(58, 30, 25, 0.16)");
  shade.addColorStop(0.22, "rgba(255, 246, 214, 0.15)");
  shade.addColorStop(0.74, "rgba(255, 239, 204, 0.08)");
  shade.addColorStop(1, "rgba(49, 26, 23, 0.3)");
  ctx.fillStyle = shade;
  ctx.fillRect(-70, -190, 140, 170);
  ctx.restore();

  envelopePath();
  ctx.strokeStyle = "rgba(72, 43, 34, 0.55)";
  ctx.lineWidth = 0.9;
  ctx.stroke();

  ctx.strokeStyle = "rgba(86, 48, 35, 0.38)";
  ctx.lineWidth = 0.65;
  for (const x of [-43, -19, 19, 43]) {
    ctx.beginPath();
    ctx.moveTo(x * 0.13, -184);
    ctx.bezierCurveTo(x * 0.92, -150, x, -84, x * 0.19, -31);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(-61, -120);
  ctx.quadraticCurveTo(0, -107, 61, -120);
  ctx.stroke();

  ctx.fillStyle = "rgba(252, 238, 202, 0.35)";
  ctx.beginPath();
  ctx.ellipse(-28, -143, 16, 8, -0.45, 0, Math.PI * 2);
  ctx.fill();

  const burning = isBurning();
  if (burning) {
    const glow = ctx.createRadialGradient(0, -25, 0, 0, -25, 32);
    glow.addColorStop(0, "rgba(255, 229, 154, 0.85)");
    glow.addColorStop(0.4, "rgba(255, 137, 59, 0.33)");
    glow.addColorStop(1, "rgba(255, 95, 38, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(-35, -58, 70, 62);
    ctx.fillStyle = "#ffd37d";
    ctx.beginPath();
    const jump = Math.sin(time * 23) * 4;
    ctx.moveTo(-6, -9);
    ctx.quadraticCurveTo(-8, -25, jump, -44 - Math.abs(jump) * 0.45);
    ctx.quadraticCurveTo(7, -27, 6, -9);
    ctx.fill();
    ctx.fillStyle = "rgba(255, 112, 43, 0.78)";
    ctx.beginPath();
    ctx.moveTo(-10, -9);
    ctx.quadraticCurveTo(-7, -23, 0, -34 + jump);
    ctx.quadraticCurveTo(8, -21, 10, -9);
    ctx.fill();
  }

  ctx.fillStyle = "#5e3d26";
  ctx.fillRect(-18, -8, 36, 31);
  ctx.strokeStyle = "rgba(238, 198, 132, 0.56)";
  ctx.lineWidth = 0.8;
  for (let row = 0; row < 3; row += 1) {
    ctx.beginPath();
    ctx.moveTo(-18, 1 + row * 8);
    ctx.lineTo(18, 1 + row * 8);
    ctx.stroke();
  }
  ctx.strokeRect(-18, -8, 36, 31);

  ctx.strokeStyle = "rgba(32, 29, 22, 0.9)";
  ctx.beginPath();
  ctx.moveTo(-15, -28);
  ctx.lineTo(-18, -8);
  ctx.moveTo(15, -28);
  ctx.lineTo(18, -8);
  ctx.stroke();

  ctx.fillStyle = "#171b19";
  for (const x of [-9, 0, 9]) {
    ctx.beginPath();
    ctx.arc(x, -1, 3.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "#c2b290";
  ctx.beginPath();
  ctx.arc(-9, -2.5, 1.3, 0, Math.PI * 2);
  ctx.arc(0, -2.5, 1.3, 0, Math.PI * 2);
  ctx.arc(9, -2.5, 1.3, 0, Math.PI * 2);
  ctx.fill();

  for (let index = 0; index < flight.ballast; index += 1) {
    const side = index % 2 === 0 ? -1 : 1;
    const slot = Math.floor(index / 2);
    ctx.fillStyle = "#9b704b";
    ctx.beginPath();
    ctx.arc(side * (23 + slot * 3), 10 + slot * 8, 4.4, 0, Math.PI * 2);
    ctx.fill();
  }

  if (flight.phase === "flying") {
    ctx.strokeStyle = "rgba(255, 240, 211, 0.22)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-22, 20);
    ctx.quadraticCurveTo(-48, 31, -77, 23);
    ctx.stroke();
  }
  ctx.restore();
}

function updateParticles(dt, time) {
  const fireWorldX = Math.max(game.flight.fireX, game.cameraX - 20);
  if (time - visuals.lastSpawn > 0.11) {
    visuals.lastSpawn = time;
    const x = fireWorldX - 20 + Math.random() * 130;
    const floor = groundY(x);
    visuals.embers.push({
      x,
      y: floor - 10 - Math.random() * 30,
      vx: 8 + Math.random() * 18,
      vy: -12 - Math.random() * 24,
      life: 1.3 + Math.random() * 1.5,
      age: 0,
      size: 0.7 + Math.random() * 1.6,
    });
  }
  for (const ember of visuals.embers) {
    ember.x += (ember.vx + windAt(time, ember.y) * 0.2) * dt;
    ember.y += ember.vy * dt;
    ember.vy += 1.8 * dt;
    ember.age += dt;
  }
  visuals.embers = visuals.embers.filter((ember) => ember.age < ember.life);
}

function drawParticles() {
  for (const ember of visuals.embers) {
    const life = 1 - ember.age / ember.life;
    ctx.fillStyle = `rgba(255, ${130 + Math.floor(70 * life)}, 72, ${life * 0.86})`;
    ctx.beginPath();
    ctx.arc(ember.x, ember.y, ember.size * life, 0, Math.PI * 2);
    ctx.fill();
  }
}

function updateCamera(dt) {
  const worldViewWidth = view.width / view.scale;
  const target = game.flight.x - worldViewWidth * 0.38;
  const maxCamera = Math.max(-42, WORLD.width - worldViewWidth + 28);
  const targetClamped = clamp(target, -42, maxCamera);
  game.cameraX = lerp(game.cameraX, targetClamped, 1 - Math.exp(-dt * 2.4));
}

function drawScene(time) {
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  ctx.clearRect(0, 0, view.width, view.height);
  drawSky(time);
  drawBackdrop(time);

  ctx.save();
  ctx.scale(view.scale, view.scale);
  ctx.translate(-game.cameraX, 0);
  drawTerrain(time);
  drawParticles();
  drawBalloon(game.flight, time);
  ctx.restore();

  const vignette = ctx.createRadialGradient(
    view.width * 0.5,
    view.height * 0.52,
    view.height * 0.12,
    view.width * 0.5,
    view.height * 0.52,
    view.height * 0.75,
  );
  vignette.addColorStop(0, "rgba(5, 9, 10, 0)");
  vignette.addColorStop(1, "rgba(5, 9, 10, 0.52)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, view.width, view.height);
}

function isBurning() {
  return (
    game.mode === "playing" &&
    !game.paused &&
    Boolean(game.lastInput?.burn) &&
    game.flight.phase === "flying"
  );
}

function isVenting() {
  return (
    game.mode === "playing" &&
    !game.paused &&
    Boolean(game.lastInput?.vent) &&
    game.flight.phase === "flying"
  );
}

function setObjective(element, done, active) {
  element.classList.toggle("is-done", done);
  element.classList.toggle("is-active", active && !done);
}

function updateHud() {
  const flight = game.flight;
  setObjective(dom.objective1, flight.ridge1Passed, !flight.ridge1Passed);
  setObjective(dom.objective2, flight.ridge2Passed, flight.ridge1Passed && !flight.ridge2Passed);
  setObjective(
    dom.objective3,
    flight.outcome === "success",
    flight.ridge2Passed && flight.outcome !== "success",
  );

  const progress = clamp((flight.x - WORLD.startX) / (WORLD.finishX - WORLD.startX), 0, 1);
  dom.progress.style.width = `${progress * 100}%`;
  dom.tempValue.textContent = `${Math.round(flight.temp * 100)}°`;
  dom.heatFill.style.width = `${flight.temp * 100}%`;
  dom.heatMarker.style.left = `${flight.temp * 100}%`;
  dom.verticalSpeed.textContent = `${(-flight.vy * 0.13).toFixed(1)} m/s`;
  dom.climbState.textContent =
    flight.vy < -3 ? "正在上升" : flight.vy > 3 ? "正在下降" : "接近悬停";

  const wind = windAt(flight.time, flight.y);
  dom.windSpeed.textContent = Math.round(wind * 1.08);
  dom.windArrow.style.transform = `rotate(${clamp((wind - 25) * 0.8, -8, 16)}deg)`;
  dom.windNote.textContent =
    wind > 39 ? "强阵风 · 高处漂移更快" : "向东南吹 · 顺风前进";

  dom.ballastCount.textContent = `${flight.ballast} 袋`;
  for (let index = 0; index < dom.ballastBags.children.length; index += 1) {
    dom.ballastBags.children[index].classList.toggle("is-empty", index >= flight.ballast);
  }
  updateAltitudeCallout();
}

function updateAltitudeCallout() {
  const flight = game.flight;
  if (game.mode !== "playing" || flight.phase !== "flying") {
    dom.altitudeCallout.classList.remove("is-visible", "is-danger");
    return;
  }

  const bottom = flight.y + WORLD.basketRadius;
  const clearance = groundY(flight.x) - bottom;
  const ahead1 = WORLD.ridge1.x - flight.x;
  const ahead2 = WORLD.ridge2.x - flight.x;
  const approachingRidge =
    (ahead1 > -15 && ahead1 < 195) || (ahead2 > -15 && ahead2 < 210);
  let message = "";
  let danger = false;

  if (approachingRidge && clearance < 76) {
    message = `拉升 · 篮底距山脊 ${Math.max(0, Math.round(clearance))} m`;
    danger = clearance < 42;
  } else if (flight.x > WORLD.finishX - 30 && clearance < 116 && flight.vy > -3) {
    message = "接应区就在下方 · 按住 S 放气缓降";
    danger = false;
  } else if (flight.x > WORLD.ridge2.x + 35 && flight.x < WORLD.finishX - 20 && flight.y < 430) {
    message = "越过第二道山脊 · 准备下降";
  }

  if (!message) {
    dom.altitudeCallout.classList.remove("is-visible", "is-danger");
    game.lastCallout = "";
    return;
  }
  dom.altitudeCallout.textContent = message;
  dom.altitudeCallout.classList.add("is-visible");
  dom.altitudeCallout.classList.toggle("is-danger", danger);
  game.lastCallout = message;
}

function showToast(message, duration = 2200) {
  dom.toast.textContent = message;
  dom.toast.classList.add("is-visible");
  clearTimeout(game.toastTimer);
  game.toastTimer = window.setTimeout(() => {
    dom.toast.classList.remove("is-visible");
  }, duration);
}

function handleEvents() {
  const flight = game.flight;
  while (game.eventCursor < flight.events.length) {
    const event = flight.events[game.eventCursor];
    game.eventCursor += 1;
    if (event.type === "ballast") {
      audio.drop();
      showToast(`压舱物已投放 · 还可投放 ${flight.ballast} 袋`);
    } else if (event.type === "ridge") {
      audio.ridge(event.index);
      showToast(
        event.index === 1 ? "第一道山脊已越过 · 风向未变" : "两道山脊都已越过 · 准备落地",
      );
    } else if (event.type === "touchdown") {
      if (event.outcome === "success") {
        audio.success();
        game.resultShownAt = performance.now();
      } else {
        audio.failure();
        game.resultShownAt = performance.now();
      }
    }
  }
}

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60);
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

function clearOverlay(overlay) {
  overlay.classList.remove("is-visible");
}

function startFlight(autoPilot = false) {
  audio.ensure();
  game.flight = createFlight();
  game.pilot = createPilot();
  game.mode = "playing";
  game.autoPilot = autoPilot;
  game.paused = false;
  game.resultShownAt = 0;
  game.resultShown = false;
  game.eventCursor = 0;
  game.lastInput = null;
  game.keyBurn = false;
  game.keyVent = false;
  game.touchBurn = false;
  game.touchVent = false;
  visuals.embers = [];
  visuals.lastSpawn = 0;
  game.cameraX = -42;
  clearOverlay(dom.startOverlay);
  clearOverlay(dom.resultOverlay);
  clearOverlay(dom.helpOverlay);
  dom.demoBanner.classList.toggle("is-visible", autoPilot);
  if (!autoPilot) {
    showToast("按住 W 点火 · 越过两道山脊后缓降", 3200);
  }
  updateHud();
}

function resultContent(flight) {
  if (flight.outcome === "success") {
    return {
      kicker: "撤离完成 · 火线已甩在身后",
      title: "三个人，<br />都到了。",
      copy: "东侧高地已经接应。三名乘客全部越过山脊，气球也完整落地。山谷里的火光终于被留在身后。",
    };
  }
  if (flight.outcome === "terrain") {
    return {
      kicker: "撤离失败 · 山脊撞击",
      title: "篮底还是<br />碰到了山。",
      copy: "气球在越过山脊前触地。下一次要更早预热，在山脊前留出足够的高度余量。",
    };
  }
  if (flight.outcome === "hard-landing") {
    return {
      kicker: "撤离失败 · 落地过重",
      title: "落地速度<br />太危险了。",
      copy: "三人都越过了山脊，但触地冲击过大。接近接应区时按住 S 放气，把下降速度压下来。",
    };
  }
  if (flight.outcome === "too-late") {
    return {
      kicker: "撤离失败 · 火线封谷",
      title: "风还在，<br />时间没了。",
      copy: "气球错过了接应窗口。火线已经封住山谷，下一次要更果断地借风前进并及时下降。",
    };
  }
  return {
    kicker: "撤离失败 · 航线不完整",
    title: "还没飞完<br />这段山谷。",
    copy: "气球落在了山脊之前。利用顺风和高处更快的风，让气球继续向东南漂移。",
  };
}

function showResult() {
  if (game.resultShown) return;
  game.resultShown = true;
  const flight = game.flight;
  const success = flight.outcome === "success";
  const content = resultContent(flight);
  dom.resultKicker.textContent = content.kicker;
  dom.resultTitle.innerHTML = content.title;
  dom.resultCopy.textContent = content.copy;
  dom.resultTime.textContent = formatTime(flight.time);
  dom.resultBallast.textContent = `${flight.ballast} 袋`;
  dom.resultSpeed.textContent = `${flight.landingSpeed.toFixed(1)} m/s`;
  dom.resultCard.classList.toggle("is-failure", !success);
  dom.watchAgainButton.style.display = success ? "" : "none";
  dom.resultOverlay.classList.add("is-visible");
  dom.demoBanner.classList.remove("is-visible");
  game.mode = "result";
  game.paused = false;
}

function takeOver() {
  if (!game.autoPilot || game.mode !== "playing") return;
  game.autoPilot = false;
  game.lastInput = null;
  dom.demoBanner.classList.remove("is-visible");
  showToast("已接管 · 自动演示关闭", 1800);
}

function manualInput() {
  return {
    burn: game.keyBurn || game.touchBurn,
    vent: game.keyVent || game.touchVent,
  };
}

function handleBallast() {
  if (game.mode !== "playing" || game.paused || game.flight.phase !== "flying") return;
  takeOver();
  if (game.flight.ballast <= 0) {
    showToast("压舱物已经用完");
    return;
  }
  dropBallast(game.flight);
  handleEvents();
  updateHud();
}

function openHelp() {
  if (game.mode === "playing") game.paused = true;
  dom.helpOverlay.classList.add("is-visible");
}

function closeHelp() {
  dom.helpOverlay.classList.remove("is-visible");
  if (game.mode === "playing") game.paused = false;
}

function bindControls() {
  document.querySelector("#startButton").addEventListener("click", () => startFlight(false));
  document.querySelector("#demoButton").addEventListener("click", () => startFlight(true));
  document.querySelector("#againButton").addEventListener("click", () => startFlight(false));
  document.querySelector("#watchAgainButton").addEventListener("click", () => startFlight(true));
  document.querySelector("#restartButton").addEventListener("click", () => startFlight(false));
  document.querySelector("#helpButton").addEventListener("click", openHelp);
  document.querySelector("#closeHelpButton").addEventListener("click", closeHelp);
  document.querySelector("#resumeButton").addEventListener("click", closeHelp);

  dom.audioButton.addEventListener("click", () => {
    audio.ensure();
    const enabled = audio.toggle();
    dom.audioButton.setAttribute("aria-pressed", String(enabled));
    dom.audioLabel.textContent = enabled ? "声音开" : "声音关";
    if (enabled) audio.ridge(1);
  });

  window.addEventListener("keydown", (event) => {
    const burnKey = ["KeyW", "ArrowUp", "Space"];
    const ventKey = ["KeyS", "ArrowDown"];
    if (burnKey.includes(event.code) || ventKey.includes(event.code)) {
      event.preventDefault();
    }
    if (event.code === "Escape" && dom.helpOverlay.classList.contains("is-visible")) {
      closeHelp();
      return;
    }
    if (game.mode === "menu" && event.code === "Enter") {
      startFlight(false);
      return;
    }
    if (game.mode !== "playing" || game.paused) return;
    if (burnKey.includes(event.code)) {
      takeOver();
      game.keyBurn = true;
    } else if (ventKey.includes(event.code)) {
      takeOver();
      game.keyVent = true;
    } else if (event.code === "KeyB" && !event.repeat) {
      handleBallast();
    }
  });

  window.addEventListener("keyup", (event) => {
    if (["KeyW", "ArrowUp", "Space"].includes(event.code)) game.keyBurn = false;
    if (["KeyS", "ArrowDown"].includes(event.code)) game.keyVent = false;
  });

  for (const button of document.querySelectorAll("[data-control]")) {
    const control = button.dataset.control;
    if (control === "ballast") {
      button.addEventListener("click", handleBallast);
      continue;
    }
    const start = (event) => {
      event.preventDefault();
      takeOver();
      if (control === "burn") game.touchBurn = true;
      if (control === "vent") game.touchVent = true;
      button.classList.add("is-held");
      button.setPointerCapture?.(event.pointerId);
    };
    const stop = () => {
      if (control === "burn") game.touchBurn = false;
      if (control === "vent") game.touchVent = false;
      button.classList.remove("is-held");
    };
    button.addEventListener("pointerdown", start);
    button.addEventListener("pointerup", stop);
    button.addEventListener("pointercancel", stop);
    button.addEventListener("lostpointercapture", stop);
  }

  canvas.addEventListener("pointerdown", (event) => {
    if (game.mode !== "playing" || game.paused || event.pointerType === "mouse") return;
    game.touchBurn = true;
    takeOver();
  });
  window.addEventListener("pointerup", () => {
    game.touchBurn = false;
    game.touchVent = false;
    for (const button of document.querySelectorAll(".is-held")) button.classList.remove("is-held");
  });
  window.addEventListener("blur", () => {
    game.keyBurn = false;
    game.keyVent = false;
    game.touchBurn = false;
    game.touchVent = false;
  });
}

function advanceSimulation(seconds) {
  if (game.mode !== "playing") return flightSummary(game.flight);
  const step = 1 / 120;
  let remaining = seconds;
  while (remaining > 0 && game.flight.phase === "flying") {
    const input = game.autoPilot
      ? pilotInput(game.flight, game.pilot, step)
      : manualInput();
    game.lastInput = input;
    stepFlight(game.flight, input, step);
    handleEvents();
    updateCamera(step);
    remaining -= step;
  }
  if (game.flight.phase === "landed" && !game.resultShown) showResult();
  updateHud();
  return flightSummary(game.flight);
}

function frame(now) {
  const delta = Math.min(0.05, (now - game.lastFrame) / 1000);
  game.lastFrame = now;
  const time = now / 1000;
  const step = 1 / 120;

  if (game.mode === "playing" && !game.paused) {
    game.fixedAccumulator += delta;
    let guard = 0;
    while (
      game.fixedAccumulator >= step &&
      game.flight.phase === "flying" &&
      guard < 8
    ) {
      const input = game.autoPilot
        ? pilotInput(game.flight, game.pilot, step)
        : manualInput();
      game.lastInput = input;
      stepFlight(game.flight, input, step);
      handleEvents();
      game.fixedAccumulator -= step;
      guard += 1;
    }
    updateCamera(delta);
  } else {
    game.lastInput = null;
    updateCamera(delta);
  }

  if (
    game.mode === "playing" &&
    game.flight.phase === "landed" &&
    game.resultShownAt &&
    now - game.resultShownAt > 1200
  ) {
    showResult();
  }

  updateParticles(delta, time);
  audio.updateWind(windAt(game.flight.time, game.flight.y), Math.round(game.flight.y));
  audio.updateBurner(isBurning());
  updateHud();
  drawScene(time);
  requestAnimationFrame(frame);
}

function initialize() {
  resizeCanvas();
  for (let index = 0; index < WORLD.totalBallast; index += 1) {
    const bag = document.createElement("i");
    dom.ballastBags.append(bag);
  }
  bindControls();
  window.addEventListener("resize", resizeCanvas);
  updateHud();
  drawScene(performance.now() / 1000);
  requestAnimationFrame((now) => {
    game.lastFrame = now;
    frame(now);
  });
}

window.__balloonGame = {
  start: () => startFlight(false),
  startDemo: () => startFlight(true),
  advance: (seconds) => advanceSimulation(seconds),
  runDemo: () => {
    startFlight(true);
    return advanceSimulation(70);
  },
  getState: () => flightSummary(game.flight),
  getMode: () => game.mode,
  isBurning,
  isVenting,
};

initialize();
