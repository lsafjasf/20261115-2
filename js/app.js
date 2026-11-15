import { LakeAudioEngine } from './engine.js';
import {
  buildWorld, SOURCE_TYPES, DIRECTIONS, WORLD, relativeGeometry, reflectionPath,
} from './world.js';

const world = buildWorld();
let engine = null;
let listening = false;

const els = {
  start: document.getElementById('start-btn'),
  replay: document.getElementById('replay-btn'),
  slider: document.getElementById('listener-x'),
  pos: document.getElementById('listener-pos'),
  form: document.getElementById('answer-form'),
  result: document.getElementById('result'),
  canvas: document.getElementById('measure-canvas'),
  orderSlot: document.querySelectorAll('.order-slot'),
};

els.slider.min = WORLD.listenerMinX;
els.slider.max = WORLD.listenerMaxX;

function buildForm() {
  const dirSelects = document.getElementById('dir-selects');
  for (const type of SOURCE_TYPES) {
    const row = document.createElement('div');
    row.className = 'answer-row';
    const label = document.createElement('span');
    label.className = 'answer-label';
    label.textContent = `${type.label}声来自`;
    const select = document.createElement('select');
    select.dataset.type = type.id;
    select.innerHTML = '<option value="">请选择方向…</option>'
      + DIRECTIONS.map((d) => `<option value="${d.id}">${d.label}</option>`).join('');
    row.append(label, select);
    dirSelects.append(row);
  }
  for (const slot of els.orderSlot) {
    slot.innerHTML = '<option value="">选择水声…</option>'
      + SOURCE_TYPES.map((t) => `<option value="${t.id}">${t.label}</option>`).join('');
  }
}

async function startListening() {
  if (listening) return;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  const ctx = new Ctx();
  await ctx.resume();
  engine = new LakeAudioEngine(ctx, world);
  engine.setListenerX(Number(els.slider.value));
  engine.startEvents();
  listening = true;
  els.start.disabled = true;
  els.replay.disabled = false;
  els.result.textContent = '监听中：拖动滑块沿湖岸移动，仔细分辨左右、前后与发生先后。';
  els.result.className = 'result';
}

async function replay() {
  if (!listening) return;
  // 重新排程一轮：重建引擎，画布保持隐藏直到再次提交
  const old = engine;
  engine = null;
  await old.stop();
  const Ctx = window.AudioContext || window.webkitAudioContext;
  const ctx = new Ctx();
  engine = new LakeAudioEngine(ctx, world);
  engine.setListenerX(Number(els.slider.value));
  engine.startEvents();
  els.canvas.classList.add('hidden');
  els.result.textContent = '已重新播放，再听一次。';
  els.result.className = 'result';
}

function collectAnswers() {
  const directions = {};
  document.querySelectorAll('#dir-selects select').forEach((select) => {
    directions[select.dataset.type] = select.value;
  });
  const order = Array.from(els.orderSlot).map((slot) => slot.value);
  return { directions, order };
}

function grade(answers) {
  const correctDirections = {};
  for (const source of world.sources) {
    correctDirections[source.id] = relativeGeometry(source, { x: WORLD.startListenerX, y: 0 }).directionId;
  }
  const directionOk = SOURCE_TYPES.every((t) => answers.directions[t.id] === correctDirections[t.id]);
  const orderFilled = answers.order.every(Boolean) && new Set(answers.order).size === 3;
  const orderOk = orderFilled && answers.order.every((id, i) => id === world.order[i]);
  return { directionOk, orderOk, correctDirections, pass: directionOk && orderOk };
}

function drawMeasurements() {
  // 仅在提交后显示：测量图（声像/亮度/距离/反射延迟/发生时刻）
  const canvas = els.canvas;
  canvas.classList.remove('hidden');
  const dpr = window.devicePixelRatio || 1;
  const w = 760, h = 420;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.fillStyle = '#0e1722';
  ctx.fillRect(0, 0, w, h);

  const listener = { x: Number(els.slider.value), y: 0 };
  const colors = { reed: '#7bd88f', shoal: '#6fc3df', dock: '#e0a25c' };
  // 上半：湖岸俯视图
  ctx.strokeStyle = '#33414f';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(40, 210);
  ctx.lineTo(w - 30, 210);
  ctx.stroke();
  ctx.fillStyle = '#9fb2c4';
  ctx.font = '12px sans-serif';
  ctx.fillText('岸（后）', 44, 200);
  ctx.fillText('湖（前）', 44, 228);
  const mapX = (x) => 60 + ((x + 60) / 120) * (w - 110);
  const mapY = (y) => 210 - y * 3.4;
  for (const source of world.sources) {
    const geo = relativeGeometry(source, listener);
    ctx.strokeStyle = colors[source.id];
    ctx.fillStyle = colors[source.id];
    ctx.globalAlpha = 0.45;
    ctx.beginPath();
    ctx.moveTo(mapX(listener.x), mapY(0));
    ctx.lineTo(mapX(source.x), mapY(source.y));
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(mapX(source.x), mapY(source.y), 6, 0, Math.PI * 2);
    ctx.fill();
    const labelAbove = source.y > 24;
    ctx.fillText(
      `${source.label} d=${geo.distance.toFixed(0)}m`,
      mapX(source.x) + 9,
      mapY(source.y) + (labelAbove ? -8 : 14),
    );
  }
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(mapX(listener.x), mapY(0), 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillText('监听点', mapX(listener.x) - 14, mapY(0) - 12);

  // 下半：测量数据表
  ctx.fillStyle = '#cfe0ee';
  ctx.font = '13px sans-serif';
  let y = 262;
  ctx.fillText('提交后测量值（当前监听点）', 44, y);
  y += 28;
  for (const source of world.sources) {
    const geo = relativeGeometry(source, listener);
    const refl = reflectionPath(source, listener);
    const pan = Math.sin(geo.azimuth);
    const brightness = geo.behind ? '低（后方低通）' : '高';
    ctx.fillStyle = colors[source.id];
    ctx.fillText(
      `${source.label}：声像 ${pan.toFixed(2)}（${pan < 0 ? '左' : '右'}），${brightness}，`
        + `距离 ${geo.distance.toFixed(1)}m，反射延迟 ${(18 + refl.delay * 1000).toFixed(0)}ms，发生 t=${source.onset.toFixed(1)}s`,
      44, y,
    );
    y += 30;
  }
}

function submit(e) {
  e.preventDefault();
  const answers = collectAnswers();
  if (Object.values(answers.directions).some((v) => !v) || answers.order.some((v) => !v)) {
    els.result.textContent = '请填满三个方向和完整的发生顺序后再提交。';
    els.result.className = 'result fail';
    return;
  }
  if (new Set(answers.order).size !== 3) {
    els.result.textContent = '发生顺序里每个水声只能出现一次。';
    els.result.className = 'result fail';
    return;
  }
  const g = grade(answers);
  drawMeasurements();
  if (g.pass) {
    els.result.textContent = '通关！三个方向与发生顺序全部正确。';
    els.result.className = 'result pass';
  } else {
    const parts = [];
    if (!g.directionOk) parts.push('方向判断有误');
    if (!g.orderOk) parts.push('发生顺序有误');
    els.result.textContent = `未通关：${parts.join('；')}。测量图已展开，可对照后重听再提交。`;
    els.result.className = 'result fail';
  }
}

buildForm();
els.start.addEventListener('click', startListening);
els.replay.addEventListener('click', replay);
els.slider.addEventListener('input', () => {
  els.pos.textContent = `${els.slider.value} m`;
  if (engine) engine.setListenerX(Number(els.slider.value));
});
els.form.addEventListener('submit', submit);
