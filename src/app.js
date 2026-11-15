import { Simulation, goodFans, badFans, DURATION } from "./simulation.js";
import { Renderer } from "./render.js";
import { AudioEngine } from "./audio.js";

const canvas = document.getElementById("field");
const renderer = new Renderer(canvas);
const audio = new AudioEngine();

let sim = new Simulation({ seed: 42, fans: goodFans() });
let selectedFan = sim.fans[0];
let running = false;
let speed = 1; // simulated seconds per real second multiplier
let last = performance.now();
let acc = 0;

const $ = (id) => document.getElementById(id);

function makeOverdriveFans() {
  const fans = goodFans();
  // Redirect the top fan downward at full power: it pushes captured sand
  // across into greenhouse B instead of lifting it over A.
  fans[0] = { ...fans[0], angle: 0.5, power: 1 };
  return fans;
}

function reset(fans, seed = 42) {
  const wasRunning = running;
  sim = new Simulation({ seed, fans });
  selectedFan = sim.fans[0];
  running = wasRunning;
  acc = 0;
  syncControls();
  updateHud();
}

function syncControls() {
  $("fanAngle").value = (selectedFan.angle * 180) / Math.PI;
  $("fanPower").value = Math.round(selectedFan.power * 100);
  $("angleVal").textContent = `${((selectedFan.angle * 180) / Math.PI).toFixed(0)}°`;
  $("powerVal").textContent = `${Math.round(selectedFan.power * 100)}%`;
}

function updateHud() {
  const res = sim.result();
  const remain = Math.max(0, DURATION - sim.t);
  const mm = String(Math.floor(remain / 60)).padStart(2, "0");
  const ss = String(Math.floor(remain % 60)).padStart(2, "0");
  $("timer").textContent = `${mm}:${ss}`;
  $("storm").textContent = `${(sim.stormLevel() * 100).toFixed(0)}%`;
  $("houseA").textContent = `${(res.houses[0].efficiency * 100).toFixed(0)}%`;
  $("houseB").textContent = `${(res.houses[1].efficiency * 100).toFixed(0)}%`;
  $("status").textContent = res.finished
    ? res.success
      ? "防护成功：两座温室保持洁净"
      : "防护失败：进风口被沙尘堵塞"
    : running
      ? "沙尘暴进行中…"
      : "已暂停";
  $("status").className = res.finished ? (res.success ? "ok" : "bad") : "";

  const warnings = sim.analyzeOverdrive();
  const od = $("overdrive");
  if (warnings.length) {
    od.textContent =
      "过度送风警告：风机 " +
      warnings.map((w) => `${w.fanId + 1}→温室${w.target}`).join("，");
    od.className = "bad";
  } else {
    od.textContent = "送风状态正常";
    od.className = "ok";
  }
}

// ---- Pointer interaction: select/drag fans, drag nozzle to rotate ----
function fanAt(mx, my) {
  const rect = canvas.getBoundingClientRect();
  const sx = canvas.width / rect.width;
  const sy = canvas.height / rect.height;
  const fx = (mx - rect.left) * sx;
  const fy = (my - rect.top) * sy;
  for (const fan of sim.fans) {
    const [x, y] = renderer.toScreen(fan.x, fan.y);
    if (Math.hypot(x - fx, y - fy) < 22) return fan;
  }
  return null;
}

let dragging = false;
let rotating = false;

canvas.addEventListener("pointerdown", (e) => {
  const fan = fanAt(e.clientX, e.clientY);
  if (!fan) return;
  selectedFan = fan;
  syncControls();
  const rect = canvas.getBoundingClientRect();
  const sx = canvas.width / rect.width;
  const sy = canvas.height / rect.height;
  const mx = (e.clientX - rect.left) * sx;
  const my = (e.clientY - rect.top) * sy;
  const [bx, by] = renderer.toScreen(fan.x, fan.y);
  // Clicking the nozzle side starts a rotation gesture.
  const dx = (mx - bx) / sx;
  rotating = Math.cos(fan.angle) * dx + Math.sin(fan.angle) * ((my - by) / sy) > 12;
  dragging = !rotating;
  canvas.setPointerCapture(e.pointerId);
});

canvas.addEventListener("pointermove", (e) => {
  if (!dragging && !rotating) return;
  const rect = canvas.getBoundingClientRect();
  const wx = ((e.clientX - rect.left) / rect.width) * 1000;
  const wy = ((e.clientY - rect.top) / rect.height) * 600;
  if (dragging) {
    selectedFan.x = Math.max(60, Math.min(760, wx));
    selectedFan.y = Math.max(40, Math.min(560, wy));
  } else {
    selectedFan.angle = Math.atan2(wy - selectedFan.y, wx - selectedFan.x);
    syncControls();
  }
});

window.addEventListener("pointerup", () => {
  dragging = false;
  rotating = false;
});

$("fanAngle").addEventListener("input", (e) => {
  selectedFan.angle = (Number(e.target.value) * Math.PI) / 180;
  syncControls();
});
$("fanPower").addEventListener("input", (e) => {
  selectedFan.power = Number(e.target.value) / 100;
  syncControls();
});

$("start").addEventListener("click", () => {
  audio.start();
  if (sim.t >= DURATION) reset(sim.fans.map((f) => ({ ...f })));
  running = true;
});
$("pause").addEventListener("click", () => (running = false));
$("reset").addEventListener("click", () => reset(goodFans()));
$("speed").addEventListener("change", (e) => (speed = Number(e.target.value)));
$("presetGood").addEventListener("click", () => reset(goodFans()));
$("presetBad").addEventListener("click", () => reset(badFans()));
$("presetOver").addEventListener("click", () => reset(makeOverdriveFans()));

// ---- Main loop with fixed-timestep accumulation ----
function frame(now) {
  const realDt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (running && sim.t < DURATION) {
    acc += realDt * speed;
    const fixed = 1 / 30;
    let guard = 0;
    while (acc >= fixed && guard < 600) {
      sim.step(fixed);
      acc -= fixed;
      guard++;
    }
  }
  renderer.render({ sim, selectedFan });
  updateHud();
  const res = sim.result();
  audio.update({
    storm: sim.stormLevel(),
    fans: sim.fans,
    minEfficiency: Math.min(...res.houses.map((h) => h.efficiency)),
    time: sim.t,
  });
  requestAnimationFrame(frame);
}

syncControls();
updateHud();
requestAnimationFrame(frame);
