import { CONFIG, MicrogridSimulation } from "./simulation.js";

const $ = (id) => document.getElementById(id);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const lerp = (a, b, t) => a + (b - a) * t;
const pad = (value) => String(Math.floor(value)).padStart(2, "0");
const clock = (seconds) => `${pad(Math.min(seconds, 600) / 60)}:${pad(seconds % 60)}`;
const mw = (value) => Number(value || 0).toFixed(1);
const SANS = '"Noto Sans SC", "Segoe UI", sans-serif';
const MONO = '"SFMono-Regular", "Noto Sans SC", monospace';

const refs = {
  startButton: $("startButton"),
  pauseButton: $("pauseButton"),
  restartButton: $("restartButton"),
  audioButton: $("audioButton"),
  audioIcon: $("audioIcon"),
  soundBars: $("soundBars"),
  freqHero: $("freqHero"),
  freqValue: $("freqValue"),
  freqState: $("freqState"),
  clock: $("clockValue"),
  missionText: $("missionText"),
  dispatchStatus: $("dispatchStatus"),
  balanceValue: $("balanceValue"),
  balanceNeedle: $("balanceNeedle"),
  supplyValue: $("supplyValue"),
  demandValue: $("demandValue"),
  batteryActual: $("batteryActual"),
  batteryTarget: $("batteryTarget"),
  batteryRampBar: $("batteryRampBar"),
  batteryRampState: $("batteryRampState"),
  batteryWear: $("batteryWear"),
  gasActual: $("gasActual"),
  gasTarget: $("gasTarget"),
  gasRampBar: $("gasRampBar"),
  gasRampState: $("gasRampState"),
  gasWear: $("gasWear"),
  loadControls: $("loadControls"),
  energyMode: $("energyMode"),
  energyFrequency: $("energyFrequency"),
  maxDeviation: $("maxDeviation"),
  violationTime: $("violationTime"),
  eventLog: $("eventLog"),
  resultOverlay: $("resultOverlay"),
  resultCard: document.querySelector(".result-card"),
  resultKicker: $("resultKicker"),
  resultEmblem: $("resultEmblem"),
  resultTitle: $("resultTitle"),
  resultMessage: $("resultMessage"),
  resultDeviation: $("resultDeviation"),
  resultViolation: $("resultViolation"),
  resultWear: $("resultWear"),
  toast: $("toast"),
};

const LOAD_ORDER = ["industrial", "commercial", "residential"];
refs.loadControls.innerHTML = LOAD_ORDER.map(
  (id, index) => `
    <div class="load-row" data-load-row="${id}">
      <div class="load-name">
        <strong>${{ industrial: "工业产线", commercial: "商业园区", residential: "居民社区" }[id]}</strong>
        <span id="load-${id}-mw">0.0 / ${{ industrial: 6, commercial: 5, residential: 4.5 }[id]} MW</span>
        <div class="load-meter"><i id="load-${id}-bar" style="width:100%"></i></div>
      </div>
      <div class="load-output" id="load-${id}-pct">100%</div>
      <button class="load-toggle" data-load="${id}" type="button">削减</button>
    </div>`,
).join("");

class GridAudio {
  constructor() {
    this.context = null;
    this.master = null;
    this.hum = null;
    this.humGain = null;
    this.whine = null;
    this.whineGain = null;
    this.enabled = true;
    this.lastAlarm = 0;
  }

  init() {
    if (this.context || !window.AudioContext) return;
    this.context = new AudioContext();
    this.master = this.context.createGain();
    this.master.gain.value = this.enabled ? 0.28 : 0;
    this.master.connect(this.context.destination);

    this.hum = this.context.createOscillator();
    this.hum.type = "triangle";
    this.hum.frequency.value = 52;
    this.humGain = this.context.createGain();
    this.humGain.gain.value = 0.12;
    this.hum.connect(this.humGain).connect(this.master);

    this.whine = this.context.createOscillator();
    this.whine.type = "sine";
    this.whine.frequency.value = 104;
    this.whineGain = this.context.createGain();
    this.whineGain.gain.value = 0.015;
    this.whine.connect(this.whineGain).connect(this.master);

    this.hum.start();
    this.whine.start();
  }

  update(state, now) {
    if (!this.context) return;
    const loadRatio = clamp(state.demand / 22, 0.35, 1.2);
    const freqOffset = clamp((state.frequency - CONFIG.nominalHz) / 0.7, -1, 1);
    const danger = state.frequency < CONFIG.safeMin || state.frequency > CONFIG.safeMax;
    this.hum.frequency.setTargetAtTime(46 + loadRatio * 13 + freqOffset * 6, this.context.currentTime, 0.15);
    this.humGain.gain.setTargetAtTime(0.05 + loadRatio * 0.12, this.context.currentTime, 0.2);
    this.whineGain.gain.setTargetAtTime(0.008 + loadRatio * 0.018, this.context.currentTime, 0.2);

    const bars = [...refs.soundBars.children];
    bars.forEach((bar, index) => {
      const wave = 0.55 + 0.45 * Math.abs(Math.sin(now / 220 + index * 0.8));
      const level = 4 + loadRatio * 8 * wave;
      bar.style.height = `${clamp(level, 3, 14)}px`;
      bar.style.background = danger ? "var(--red)" : "var(--cyan)";
    });

    if (danger && state.status === "running" && now - this.lastAlarm > 680) {
      this.lastAlarm = now;
      this.beep(760, 0.07, 0.2);
      setTimeout(() => this.beep(610, 0.08, 0.18), 115);
    }
  }

  beep(frequency = 500, duration = 0.035, volume = 0.1) {
    if (!this.context || !this.enabled) return;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(volume, this.context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, this.context.currentTime + duration);
    oscillator.connect(gain).connect(this.master);
    oscillator.start();
    oscillator.stop(this.context.currentTime + duration);
  }

  click() {
    this.beep(420, 0.025, 0.08);
  }

  toggle() {
    this.enabled = !this.enabled;
    if (this.master) this.master.gain.setTargetAtTime(this.enabled ? 0.28 : 0, this.context.currentTime, 0.08);
    refs.audioIcon.textContent = this.enabled ? "◖" : "◌";
    refs.audioButton.title = this.enabled ? "关闭声音" : "开启声音";
    if (this.enabled) this.beep(480, 0.05, 0.12);
  }
}

const audio = new GridAudio();

class CanvasSurface {
  constructor(id) {
    this.canvas = $(id);
    this.ctx = this.canvas.getContext("2d");
    this.width = 1;
    this.height = 1;
    this.dpr = 1;
  }

  fit() {
    const rect = this.canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (width === this.width && height === this.height && dpr === this.dpr) return false;
    this.width = width;
    this.height = height;
    this.dpr = dpr;
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return true;
  }

  clear() {
    this.ctx.clearRect(0, 0, this.width, this.height);
  }

  roundRect(x, y, width, height, radius) {
    const ctx = this.ctx;
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
  }
}

class EnergyRenderer extends CanvasSurface {
  draw(state, now) {
    this.fit();
    this.clear();
    const { ctx, width: w, height: h } = this;
    const danger = state.frequency < CONFIG.safeMin || state.frequency > CONFIG.safeMax;
    const busX = w * 0.47;
    const sourceX = Math.max(8, w * 0.012);
    const sourceW = clamp(w * 0.165, 82, 104);
    const sourceH = 60;
    const loadW = clamp(w * 0.21, 116, 142);
    const loadX = w - loadW - 8;
    const sourceYs = [h * 0.16, h * 0.48, h * 0.8];
    const loadTops = state.loads.map((_, index) => 19 + index * ((h - 42) / 4));

    const bg = ctx.createRadialGradient(busX, h * 0.5, 10, busX, h * 0.5, w * 0.55);
    bg.addColorStop(0, danger ? "rgba(255,101,116,0.055)" : "rgba(85,216,255,0.035)");
    bg.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    this.drawGrid();

    ctx.strokeStyle = danger ? "rgba(255,101,116,0.2)" : "rgba(127,255,196,0.17)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(busX, 28);
    ctx.lineTo(busX, h - 28);
    ctx.stroke();
    ctx.strokeStyle = danger ? "rgba(255,101,116,0.55)" : "rgba(127,255,196,0.56)";
    ctx.lineWidth = 2;
    ctx.shadowColor = danger ? "rgba(255,101,116,0.5)" : "rgba(127,255,196,0.45)";
    ctx.shadowBlur = 15;
    ctx.beginPath();
    ctx.moveTo(busX, 34);
    ctx.lineTo(busX, h - 34);
    ctx.stroke();
    ctx.shadowBlur = 0;

    const sources = [
      { id: "pv", name: "光伏阵列", value: state.pvPower, color: "#ffc45e", max: 18.5 },
      { id: "battery", name: "储能", value: state.battery.actual, color: "#7fffc4", max: 6 },
      { id: "gas", name: "燃气机组", value: state.gas.actual, color: "#ff9e62", max: 10 },
    ];

    sources.forEach((source, index) => {
      const cy = sourceYs[index];
      const cardY = cy - sourceH / 2;
      this.drawSource(source, sourceX, cardY, sourceW, sourceH, now);
      this.drawFlow(
        sourceX + sourceW + 4,
        cy,
        busX - 4,
        cy,
        source.value,
        source.max,
        source.color,
        now,
        index,
      );
    });

    state.loads.forEach((load, index) => {
      const top = loadTops[index];
      const cy = top + 18;
      this.drawFlow(busX + 3, cy, loadX - 4, cy, load.actual, load.mw, load.color, now, index + 3);
      this.drawLoad(load, loadX, top, loadW, 36);
    });

    this.drawBusCore(busX, h * 0.5, state, danger);
  }

  drawGrid() {
    const { ctx, width: w, height: h } = this;
    ctx.strokeStyle = "rgba(136,201,193,0.045)";
    ctx.lineWidth = 1;
    for (let x = 18; x < w; x += 34) {
      for (let y = 18; y < h; y += 34) {
        ctx.beginPath();
        ctx.arc(x, y, 0.9, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(136,201,193,0.16)";
        ctx.fill();
      }
    }
  }

  drawSource(source, x, y, width, height, now) {
    const { ctx } = this;
    this.roundRect(x, y, width, height, 6);
    ctx.fillStyle = "rgba(5,18,21,0.9)";
    ctx.fill();
    ctx.strokeStyle = `${source.color}40`;
    ctx.stroke();
    ctx.fillStyle = source.color;
    ctx.shadowColor = source.color;
    ctx.shadowBlur = source.value > 0.3 ? 8 : 0;
    this.drawSourceIcon(source.id, x + 9, y + 9, source.color);
    ctx.shadowBlur = 0;

    ctx.fillStyle = "rgba(230,242,236,0.86)";
    ctx.font = `600 9px ${SANS}`;
    ctx.textAlign = "left";
    ctx.fillText(source.name, x + 30, y + 17);
    ctx.fillStyle = source.color;
    ctx.font = `500 14px ${MONO}`;
    ctx.fillText(source.value.toFixed(1), x + 9, y + 44);
    ctx.fillStyle = "rgba(120,147,141,0.8)";
    ctx.font = `500 8px ${MONO}`;
    ctx.fillText("MW", x + 38, y + 43);

    const pulse = 0.4 + Math.sin(now / 600 + x) * 0.2;
    ctx.fillStyle = source.color;
    ctx.globalAlpha = source.value > 0.3 ? pulse : 0.15;
    ctx.beginPath();
    ctx.arc(x + width - 10, y + 11, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  drawSourceIcon(id, x, y, color) {
    const { ctx } = this;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 1.2;
    if (id === "pv") {
      ctx.strokeRect(x, y + 1, 16, 11);
      ctx.beginPath();
      ctx.moveTo(x + 5, y + 1);
      ctx.lineTo(x + 5, y + 12);
      ctx.moveTo(x + 11, y + 1);
      ctx.lineTo(x + 11, y + 12);
      ctx.moveTo(x, y + 6);
      ctx.lineTo(x + 16, y + 6);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + 8, y + 12);
      ctx.lineTo(x + 8, y + 15);
      ctx.stroke();
    } else if (id === "battery") {
      ctx.strokeRect(x + 2, y + 2, 12, 10);
      ctx.fillRect(x + 14, y + 5, 2, 4);
      ctx.fillRect(x + 4, y + 4, 3, 6);
      ctx.fillRect(x + 8, y + 4, 3, 6);
    } else {
      ctx.beginPath();
      ctx.moveTo(x + 8, y);
      ctx.bezierCurveTo(x + 1, y + 7, x + 5, y + 12, x + 8, y + 15);
      ctx.bezierCurveTo(x + 12, y + 11, x + 14, y + 7, x + 8, y);
      ctx.fill();
    }
    ctx.restore();
  }

  drawFlow(x1, y1, x2, y2, value, max, color, now, phaseIndex) {
    const { ctx } = this;
    const active = value > 0.025;
    const normalized = clamp(value / Math.max(max, 0.1), 0, 1);
    ctx.save();
    ctx.strokeStyle = color;
    ctx.globalAlpha = active ? 0.18 + normalized * 0.34 : 0.08;
    ctx.lineWidth = active ? 0.8 + normalized * 2.2 : 0.7;
    if (!active) ctx.setLineDash([2, 5]);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.setLineDash([]);

    if (active) {
      const speed = 0.00004 + normalized * 0.00011;
      for (let dot = 0; dot < 2; dot += 1) {
        const progress = (now * speed + phaseIndex * 0.17 + dot * 0.48) % 1;
        const x = lerp(x1, x2, progress);
        const y = lerp(y1, y2, progress);
        const glow = ctx.createRadialGradient(x, y, 0, x, y, 8);
        glow.addColorStop(0, color);
        glow.addColorStop(1, "rgba(0,0,0,0)");
        ctx.globalAlpha = 0.12 + normalized * 0.22;
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(x, y, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.72;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, 1.6 + normalized * 0.8, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  drawLoad(load, x, y, width, height) {
    const { ctx } = this;
    const off = load.fraction < 0.03;
    const ramping = load.ramping;
    this.roundRect(x, y, width, height, 5);
    ctx.fillStyle = off ? "rgba(5,14,17,0.55)" : "rgba(5,18,21,0.9)";
    ctx.fill();
    ctx.strokeStyle = off ? "rgba(120,147,141,0.15)" : `${load.color}38`;
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = load.color;
    ctx.globalAlpha = off ? 0.25 : 0.8;
    this.roundRect(x, y + 5, 2, height - 10, 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.textAlign = "left";
    ctx.fillStyle = off ? "rgba(120,147,141,0.55)" : "rgba(230,242,236,0.9)";
    ctx.font = `600 9px ${SANS}`;
    ctx.fillText(load.name, x + 10, y + 15);
    ctx.fillStyle = load.color;
    ctx.globalAlpha = off ? 0.3 : 0.9;
    ctx.font = `500 8px ${MONO}`;
    ctx.fillText(`${load.actual.toFixed(1)} MW`, x + 10, y + 27);
    ctx.globalAlpha = 1;

    ctx.textAlign = "right";
    if (load.critical) {
      ctx.fillStyle = load.color;
      ctx.font = `600 7px ${SANS}`;
      ctx.fillText("◆ 保供", x + width - 9, y + 14);
      ctx.fillStyle = "rgba(120,147,141,0.8)";
      ctx.font = `500 7px ${MONO}`;
      ctx.fillText("不可中断", x + width - 9, y + 25);
    } else if (off) {
      ctx.fillStyle = "rgba(255,184,92,0.8)";
      ctx.font = `600 7px ${SANS}`;
      ctx.fillText("已削减", x + width - 9, y + 20);
    } else if (ramping) {
      ctx.fillStyle = "rgba(255,184,92,0.85)";
      ctx.font = `500 7px ${MONO}`;
      ctx.fillText("RAMPING", x + width - 9, y + 20);
    } else {
      ctx.fillStyle = "rgba(120,147,141,0.65)";
      ctx.font = `500 7px ${MONO}`;
      ctx.fillText("ONLINE", x + width - 9, y + 20);
    }
  }

  drawBusCore(x, y, state, danger) {
    const { ctx } = this;
    const color = danger ? "#ff6574" : "#7fffc4";
    ctx.save();
    ctx.fillStyle = "rgba(5,17,20,0.96)";
    ctx.strokeStyle = `${color}90`;
    ctx.lineWidth = 1;
    this.roundRect(x - 33, y - 18, 66, 36, 7);
    ctx.fill();
    ctx.stroke();
    ctx.textAlign = "center";
    ctx.fillStyle = color;
    ctx.font = `600 12px ${MONO}`;
    ctx.fillText(state.frequency.toFixed(2), x, y + 2);
    ctx.fillStyle = "rgba(120,147,141,0.9)";
    ctx.font = `600 7px ${MONO}`;
    ctx.fillText("AC BUS / Hz", x, y + 12);
    ctx.restore();
  }
}

const energyRenderer = new EnergyRenderer("energyCanvas");

class FrequencyRenderer extends CanvasSurface {
  draw(state) {
    this.fit();
    this.clear();
    const { ctx, width: w, height: h } = this;
    const margin = { top: 14, right: 10, bottom: 25, left: 39 };
    const plotW = w - margin.left - margin.right;
    const plotH = h - margin.top - margin.bottom;
    const yMin = 49.12;
    const yMax = 50.88;
    const xFor = (seconds) => margin.left + clamp(seconds / CONFIG.duration, 0, 1) * plotW;
    const yFor = (hz) => margin.top + (1 - (hz - yMin) / (yMax - yMin)) * plotH;

    const bg = ctx.createLinearGradient(0, margin.top, 0, h - margin.bottom);
    bg.addColorStop(0, "rgba(8,30,33,0.45)");
    bg.addColorStop(1, "rgba(2,10,12,0.2)");
    ctx.fillStyle = bg;
    ctx.fillRect(margin.left, margin.top, plotW, plotH);

    const safeTop = yFor(CONFIG.safeMax);
    const safeBottom = yFor(CONFIG.safeMin);
    const safeGradient = ctx.createLinearGradient(0, safeTop, 0, safeBottom);
    safeGradient.addColorStop(0, "rgba(127,255,196,0.075)");
    safeGradient.addColorStop(0.5, "rgba(127,255,196,0.025)");
    safeGradient.addColorStop(1, "rgba(127,255,196,0.075)");
    ctx.fillStyle = safeGradient;
    ctx.fillRect(margin.left, safeTop, plotW, safeBottom - safeTop);

    ctx.strokeStyle = "rgba(127,255,196,0.3)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(margin.left, safeTop);
    ctx.lineTo(w - margin.right, safeTop);
    ctx.moveTo(margin.left, safeBottom);
    ctx.lineTo(w - margin.right, safeBottom);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.font = `500 8px ${MONO}`;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    [50.5, 50, 49.5].forEach((hz) => {
      ctx.fillStyle = hz === 50 ? "rgba(120,147,141,0.65)" : "rgba(127,255,196,0.6)";
      ctx.fillText(hz.toFixed(2), margin.left - 6, yFor(hz));
    });

    ctx.strokeStyle = "rgba(136,201,193,0.09)";
    ctx.lineWidth = 1;
    for (let hz = 49.5; hz <= 50.5; hz += 0.25) {
      ctx.beginPath();
      ctx.moveTo(margin.left, yFor(hz));
      ctx.lineTo(w - margin.right, yFor(hz));
      ctx.stroke();
    }

    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.font = `500 8px ${MONO}`;
    for (let minute = 0; minute <= 10; minute += 2) {
      const x = xFor(minute * 60);
      ctx.fillStyle = "rgba(120,147,141,0.55)";
      ctx.fillText(minute === 10 ? "10:00" : `0${minute}:00`, x, h - margin.bottom + 6);
      if (minute > 0) {
        ctx.strokeStyle = "rgba(136,201,193,0.065)";
        ctx.beginPath();
        ctx.moveTo(x, margin.top);
        ctx.lineTo(x, h - margin.bottom);
        ctx.stroke();
      }
    }

    if (state.faultTriggered) {
      const faultX = xFor(CONFIG.faultAt);
      ctx.strokeStyle = "rgba(255,101,116,0.38)";
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(faultX, margin.top);
      ctx.lineTo(faultX, h - margin.bottom);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(255,101,116,0.78)";
      ctx.font = `600 7px ${SANS}`;
      ctx.textAlign = "left";
      ctx.fillText("PV DROP", faultX + 4, margin.top + 4);
    }

    if (state.recoveryAchieved) {
      const recoveryX = xFor(state.recoveryAt);
      ctx.strokeStyle = "rgba(127,255,196,0.4)";
      ctx.beginPath();
      ctx.moveTo(recoveryX, margin.top);
      ctx.lineTo(recoveryX, h - margin.bottom);
      ctx.stroke();
      ctx.fillStyle = "rgba(127,255,196,0.8)";
      ctx.font = `600 7px ${SANS}`;
      ctx.textAlign = "right";
      ctx.fillText("STABLE", recoveryX - 4, margin.top + 15);
    }

    const points = state.history.slice();
    if (!points.length || state.time - points[points.length - 1].t > 0.4) {
      points.push({ t: state.time, hz: state.frequency });
    }
    if (points.length === 1) {
      const point = points[0];
      ctx.strokeStyle = "rgba(127,255,196,0.8)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(xFor(0), yFor(point.hz));
      ctx.lineTo(Math.max(xFor(state.time || 0.1), xFor(0) + 2), yFor(point.hz));
      ctx.stroke();
    } else {
      ctx.strokeStyle = state.frequency < CONFIG.safeMin || state.frequency > CONFIG.safeMax ? "#ff6574" : "#7fffc4";
      ctx.lineWidth = 2;
      ctx.shadowColor = ctx.strokeStyle;
      ctx.shadowBlur = 9;
      ctx.beginPath();
      points.forEach((point, index) => {
        const x = xFor(point.t);
        const y = yFor(point.hz);
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    const currentX = xFor(state.time);
    const currentY = yFor(state.frequency);
    const danger = state.frequency < CONFIG.safeMin || state.frequency > CONFIG.safeMax;
    const currentColor = danger ? "#ff6574" : "#7fffc4";
    ctx.fillStyle = currentColor;
    ctx.shadowColor = currentColor;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(currentX, currentY, 2.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.textAlign = "left";
    ctx.font = `600 8px ${MONO}`;
    ctx.fillStyle = currentColor;
    const labelX = currentX > w - 80 ? currentX - 48 : currentX + 7;
    ctx.fillText(state.frequency.toFixed(2), labelX, currentY - 11);
  }
}

const frequencyRenderer = new FrequencyRenderer("frequencyCanvas");

class DeviceRenderer extends CanvasSurface {
  draw(state) {
    this.fit();
    this.clear();
    const { ctx, width: w, height: h } = this;
    const rows = [
      {
        name: "光伏阵列",
        actual: state.pvPower,
        target: state.pvPower,
        max: 18.5,
        wear: 0,
        ramp: 0,
        source: true,
        color: "#ffc45e",
      },
      {
        name: "储能",
        actual: state.battery.actual,
        target: state.battery.target,
        max: 6,
        wear: state.battery.wear,
        ramp: Math.abs(state.battery.target - state.battery.actual) / CONFIG.batteryRamp + state.battery.delayLeft,
        color: "#7fffc4",
      },
      {
        name: "燃气机组",
        actual: state.gas.actual,
        target: state.gas.target,
        max: 10,
        wear: state.gas.wear,
        ramp: Math.abs(state.gas.target - state.gas.actual) / CONFIG.gasRamp + state.gas.delayLeft,
        color: "#ff9e62",
      },
      ...state.loads
        .filter((load) => !load.critical)
        .map((load) => ({
          name: load.name,
          actual: load.actual,
          target: load.targetFraction * load.mw,
          max: load.mw,
          wear: load.wear,
          ramp: Math.abs(load.targetFraction - load.fraction) / 0.25,
          color: load.color,
        })),
    ];
    const rowHeight = (h - 8) / rows.length;
    const barX = 82;
    const barW = Math.max(130, w * 0.38);
    const numX = barX + barW + 8;
    const rampX = numX + 48;
    const wearX = rampX + 58;
    const wearW = Math.max(46, w - wearX - 12);

    ctx.textBaseline = "middle";
    rows.forEach((row, index) => {
      const cy = 4 + rowHeight * index + rowHeight / 2;
      const trackY = cy + 4;
      if (index > 0) {
        ctx.strokeStyle = "rgba(136,201,193,0.06)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, cy - rowHeight / 2);
        ctx.lineTo(w, cy - rowHeight / 2);
        ctx.stroke();
      }

      const faulted = row.name === "光伏阵列" && state.faultTriggered;
      ctx.textAlign = "left";
      ctx.fillStyle = faulted ? "#ff6574" : "rgba(230,242,236,0.82)";
      ctx.font = `600 9px ${SANS}`;
      ctx.fillText(row.name, 6, cy - 3);
      if (faulted) {
        ctx.fillStyle = "rgba(255,101,116,0.8)";
        ctx.font = `600 7px ${MONO}`;
        ctx.fillText("DEGRADED", 6, cy + 8);
      }

      ctx.fillStyle = "rgba(255,255,255,0.055)";
      this.roundRect(barX, trackY - 2, barW, 5, 3);
      ctx.fill();
      const ratio = clamp(row.actual / Math.max(row.max, 0.1), 0, 1);
      const targetRatio = clamp(row.target / Math.max(row.max, 0.1), 0, 1);
      const gradient = ctx.createLinearGradient(barX, 0, barX + barW, 0);
      gradient.addColorStop(0, `${row.color}66`);
      gradient.addColorStop(1, row.color);
      ctx.fillStyle = gradient;
      this.roundRect(barX, trackY - 2, Math.max(2, barW * ratio), 5, 3);
      ctx.fill();

      ctx.strokeStyle = row.color;
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(barX + barW * targetRatio, trackY - 7);
      ctx.lineTo(barX + barW * targetRatio, trackY + 7);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = row.color;
      ctx.beginPath();
      ctx.moveTo(barX + barW * targetRatio, trackY - 7);
      ctx.lineTo(barX + barW * targetRatio - 3, trackY - 11);
      ctx.lineTo(barX + barW * targetRatio + 3, trackY - 11);
      ctx.fill();

      ctx.textAlign = "left";
      ctx.fillStyle = "rgba(230,242,236,0.8)";
      ctx.font = `500 9px ${MONO}`;
      ctx.fillText(row.actual.toFixed(1), numX, cy);
      ctx.fillStyle = "rgba(120,147,141,0.65)";
      ctx.font = `500 7px ${MONO}`;
      ctx.fillText(`/ ${row.max.toFixed(0)}`, numX + 15, cy + 1);

      if (row.ramp > 0.1 && !row.source) {
        ctx.fillStyle = "#ffb85c";
        ctx.font = `500 8px ${MONO}`;
        ctx.fillText(`爬坡 ${Math.ceil(row.ramp)}s`, rampX, cy);
      } else {
        ctx.fillStyle = "rgba(120,147,141,0.5)";
        ctx.font = `500 7px ${MONO}`;
        ctx.fillText(row.source ? "SOURCE" : "READY", rampX, cy);
      }

      if (wearW > 52) {
        ctx.fillStyle = "rgba(120,147,141,0.6)";
        ctx.font = `500 7px ${MONO}`;
        ctx.fillText("磨损", wearX, cy);
        ctx.fillStyle = "rgba(255,255,255,0.05)";
        this.roundRect(wearX + 26, trackY - 1.5, wearW - 46, 3, 2);
        ctx.fill();
        const wearColor = row.wear > 60 ? "#ff6574" : row.wear > 30 ? "#ffb85c" : "#c891ff";
        ctx.fillStyle = wearColor;
        this.roundRect(wearX + 26, trackY - 1.5, Math.max(1, (wearW - 46) * row.wear / 100), 3, 2);
        ctx.fill();
        ctx.textAlign = "right";
        ctx.fillStyle = "rgba(230,242,236,0.65)";
        ctx.font = `500 7px ${MONO}`;
        ctx.fillText(`${row.wear.toFixed(0)}%`, w - 5, cy);
      }
    });
  }
}

const deviceRenderer = new DeviceRenderer("deviceCanvas");

let simulation = new MicrogridSimulation({ autoStart: false });
let active = false;
let paused = false;
let speed = 1;
let lastFrame = performance.now();
let resultShown = false;
let eventSignature = "";
let toastTimer = 0;

function showToast(message, duration = 2600) {
  refs.toast.textContent = message;
  refs.toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => refs.toast.classList.remove("show"), duration);
}

function commandDevice(key, delta) {
  if (!active || paused || simulation.status !== "running") {
    showToast("演练尚未运行。先启动十分钟孤网演练。");
    return;
  }
  const state = simulation.snapshot();
  const device = key === "battery" ? state.battery : state.gas;
  const min = key === "battery" ? 0 : CONFIG.gasMin;
  const max = key === "battery" ? CONFIG.batteryMax : CONFIG.gasMax;
  const target = clamp(device.target + delta, min, max);
  const changed = simulation.commandDevice(key, target);
  if (changed) {
    audio.click();
    if (device.rapidCycles >= 2) showToast("调节间隔过短，设备磨损正在快速累积。");
  }
}

function startRun() {
  simulation = new MicrogridSimulation({ autoStart: true });
  active = true;
  paused = false;
  resultShown = false;
  eventSignature = "";
  lastFrame = performance.now();
  refs.resultOverlay.hidden = true;
  refs.resultCard.classList.remove("failure");
  refs.startButton.disabled = true;
  refs.startButton.textContent = "演练运行中";
  refs.pauseButton.disabled = false;
  refs.pauseButton.textContent = "暂停";
  audio.init();
  audio.click();
  showToast("演练开始：先保持观察，光伏故障可能在 35 秒后发生。", 3200);
}

function togglePause() {
  if (!active || simulation.status !== "running") return;
  paused = !paused;
  refs.pauseButton.textContent = paused ? "继续" : "暂停";
  showToast(paused ? "仿真已暂停。规划好一次连续调节，避免反复切换。" : "仿真继续。");
  audio.click();
}

function presentResult(state) {
  resultShown = true;
  refs.toast.classList.remove("show");
  const success = state.status === "success";
  refs.resultCard.classList.toggle("failure", !success);
  refs.resultKicker.textContent = success ? "DRILL COMPLETE / SAFE" : "PROTECTION TRIP / FAILED";
  refs.resultEmblem.textContent = success ? "✓" : "!";
  refs.resultTitle.textContent = success ? "孤网守住了" : "频率保护跳闸";
  refs.resultMessage.textContent = success
    ? `十分钟内频率未越限，最大偏差 ${state.maxDeviation.toFixed(3)} Hz。${state.recoveryAchieved ? `故障后于 ${clock(state.recoveryAt)} 恢复稳定。` : ""}`
    : `${state.failureReason}。快速或反复切换会叠加执行机构磨损与功率振荡；应一次规划好储能、燃气和可中断负荷。`;
  refs.resultDeviation.textContent = `${state.maxDeviation.toFixed(3)} Hz`;
  refs.resultViolation.textContent = `${state.violationSeconds.toFixed(2)} s`;
  refs.resultWear.textContent = `${Math.round(state.maxWear)}%`;
  refs.resultOverlay.hidden = false;
}

function updateEvents(state) {
  const signature = `${state.events.length}:${state.events[0]?.t}:${state.events[0]?.message}`;
  if (signature === eventSignature) return;
  eventSignature = signature;
  refs.eventLog.innerHTML = state.events
    .slice(0, 6)
    .map(
      (event) => `
        <div class="event-item ${event.type}">
          <time>${clock(event.t)}</time><i></i><p title="${event.message}">${event.message}</p>
        </div>`,
    )
    .join("");
}

function updateControlState(state, running) {
  ["battery", "gas"].forEach((key) => {
    const device = state[key];
    const max = key === "battery" ? CONFIG.batteryMax : CONFIG.gasMax;
    const card = refs[key === "battery" ? "batteryActual" : "gasActual"].closest(".device-control");
    card.classList.toggle("ramping", device.ramping);
    card.classList.toggle("hot", device.wear > 55);
    refs[`${key}Actual`].textContent = mw(device.actual);
    refs[`${key}Target`].textContent = mw(device.target);
    refs[`${key}Wear`].textContent = `${Math.round(device.wear)}%`;
    refs[`${key}RampBar`].style.width = `${clamp((device.actual / max) * 100, 0, 100)}%`;
    refs[`${key}RampState`].textContent = device.ramping
      ? `${device.delayLeft > 0 ? `延时 ${device.delayLeft.toFixed(1)}s` : `爬坡 → ${mw(device.target)} MW`}`
      : "输出稳定";
  });

  document.querySelectorAll("[data-step]").forEach((button) => {
    const [key, direction] = button.dataset.step.split(":");
    const device = state[key];
    const min = key === "battery" ? 0 : CONFIG.gasMin;
    const max = key === "battery" ? CONFIG.batteryMax : CONFIG.gasMax;
    button.disabled = !running || (Number(direction) < 0 ? device.target <= min : device.target >= max);
  });

  state.loads
    .filter((load) => !load.critical)
    .forEach((load) => {
      const row = document.querySelector(`[data-load-row="${load.id}"]`);
      const button = row.querySelector(".load-toggle");
      row.classList.toggle("shedding", load.targetFraction === 0);
      button.classList.toggle("off", load.targetFraction === 0);
      button.textContent = load.targetFraction === 0 ? "投入" : "削减";
      button.disabled = !running;
      $(`load-${load.id}-mw`).textContent = `${load.actual.toFixed(1)} / ${load.mw.toFixed(1)} MW`;
      $(`load-${load.id}-pct`).textContent = `${Math.round(load.fraction * 100)}%`;
      $(`load-${load.id}-bar`).style.width = `${load.fraction * 100}%`;
      row.title = load.rapidCycles ? `快速切换 ${load.rapidCycles} 次，磨损 ${Math.round(load.wear)}%` : "";
    });
}

function updateInterface(state) {
  const running = state.status === "running";
  const inBand = state.frequency >= CONFIG.safeMin && state.frequency <= CONFIG.safeMax;
  const nearEdge = !inBand || Math.abs(state.frequency - CONFIG.nominalHz) > 0.36;
  const danger = !inBand;
  const shortfall = state.demand - state.supply;

  refs.freqHero.classList.toggle("warning", nearEdge && !danger && state.status !== "failed");
  refs.freqHero.classList.toggle("danger", danger || state.status === "failed");
  refs.freqValue.textContent = state.frequency.toFixed(2);
  refs.freqState.textContent =
    state.status === "failed"
      ? "保护跳闸"
      : state.status === "success"
        ? "安全通过"
        : danger
          ? "越限告警"
          : nearEdge
            ? "接近边界"
            : state.recoveryAchieved
              ? "已恢复"
              : "稳定";
  refs.clock.textContent = clock(state.time);

  refs.dispatchStatus.textContent =
    state.status === "failed"
      ? "已跳闸"
      : state.status === "success"
        ? "已完成"
        : paused
          ? "已暂停"
          : state.status === "running"
            ? state.faultTriggered
              ? "故障处置"
              : "监视中"
            : "待命";
  refs.dispatchStatus.classList.toggle("live", running && !paused);
  refs.dispatchStatus.classList.toggle("danger", state.status === "failed" || danger);

  refs.balanceValue.innerHTML = `${Math.abs(shortfall).toFixed(1)} <small>MW</small>`;
  refs.balanceNeedle.style.left = `${50 + clamp(state.balance / 12, -1, 1) * 47}%`;
  refs.balanceNeedle.style.background = shortfall > 0.4 ? "var(--red)" : "var(--mint)";
  refs.supplyValue.textContent = state.supply.toFixed(1);
  refs.demandValue.textContent = state.demand.toFixed(1);

  refs.maxDeviation.innerHTML = `${state.maxDeviation.toFixed(2)} <small>Hz</small>`;
  refs.violationTime.innerHTML = `${state.violationSeconds.toFixed(2)} <small>s</small>`;
  refs.energyFrequency.textContent = `${state.frequency.toFixed(2)} Hz`;

  if (state.status === "failed") {
    refs.energyMode.textContent = "保护跳闸";
  } else if (state.status === "success") {
    refs.energyMode.textContent = "演练完成";
  } else if (danger) {
    refs.energyMode.textContent = "频率越限";
  } else if (state.faultTriggered && !state.recoveryAchieved) {
    refs.energyMode.textContent = "故障处置中";
  } else if (state.recoveryAchieved) {
    refs.energyMode.textContent = "应急稳定";
  } else {
    refs.energyMode.textContent = "并网稳定";
  }

  if (!active) {
    refs.missionText.textContent = "光伏阵列遥测正常。点击「启动演练」，在十分钟内守住 49.50–50.50 Hz。";
  } else if (state.status === "failed") {
    refs.missionText.textContent = "保护已动作。重新演练时，先削减可中断负荷，再平滑爬升储能与燃气。";
  } else if (state.status === "success") {
    refs.missionText.textContent = "十分钟频率全程安全。关键负荷保供正常，演练成功。";
  } else if (state.recoveryAchieved) {
    refs.missionText.textContent = "频率已恢复稳定。不要反复切换负荷，守住剩余时间。";
  } else if (state.faultTriggered) {
    refs.missionText.textContent = danger
      ? "频率越限！立即一次削减工业负荷，并平滑提高储能与燃气出力。"
      : "光伏骤降。优先保障医院与通信站，协调储能、燃气和可中断负荷。";
  } else {
    refs.missionText.textContent = "光伏阵列遥测正常。故障随时可能发生，提前观察功率余量。";
  }

  updateControlState(state, running && !paused);
  updateEvents(state);
  refs.pauseButton.disabled = !running || state.status !== "running";
  refs.pauseButton.textContent = paused ? "继续" : "暂停";

  if ((state.status === "success" || state.status === "failed") && !resultShown) {
    presentResult(state);
  }
}

function render() {
  const now = performance.now();
  const elapsed = Math.min((now - lastFrame) / 1000, 0.12);
  lastFrame = now;
  if (active && !paused && simulation.status === "running") {
    simulation.tick(elapsed * speed);
  }
  const state = simulation.snapshot();
  updateInterface(state);
  energyRenderer.draw(state, now);
  frequencyRenderer.draw(state);
  deviceRenderer.draw(state);
  if (audio.context) audio.update(state, now);
  requestAnimationFrame(render);
}

refs.startButton.addEventListener("click", startRun);
refs.restartButton.addEventListener("click", startRun);
refs.pauseButton.addEventListener("click", togglePause);
refs.audioButton.addEventListener("click", () => {
  audio.init();
  audio.toggle();
});

document.querySelector(".control-panel").addEventListener("click", (event) => {
  const stepButton = event.target.closest("[data-step]");
  if (stepButton) {
    const [key, direction] = stepButton.dataset.step.split(":");
    commandDevice(key, Number(direction));
    return;
  }
  const loadButton = event.target.closest("[data-load]");
  if (loadButton) {
    if (!active || paused || simulation.status !== "running") {
      showToast("演练尚未运行。先启动十分钟孤网演练。");
      return;
    }
    const id = loadButton.dataset.load;
    const load = simulation.snapshot().loads.find((item) => item.id === id);
    if (simulation.toggleLoad(id)) {
      audio.click();
      if (load.rapidCycles >= 2) showToast("该负荷切换过于频繁，已产生额外磨损与频率扰动。");
    }
  }
});

document.querySelectorAll(".speed-button").forEach((button) => {
  button.addEventListener("click", () => {
    speed = Number(button.dataset.speed);
    document.querySelectorAll(".speed-button").forEach((item) => item.classList.toggle("active", item === button));
    showToast(`时间倍率已设为 ${speed}×。`);
  });
});

window.gridGame = {
  getSimulation: () => simulation,
  start: startRun,
  commandDevice,
  toggleLoad: (id) => simulation.toggleLoad(id),
  setSpeed: (value) => {
    speed = clamp(Number(value), 1, 10);
  },
};

requestAnimationFrame(render);
