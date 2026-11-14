/* global Pose */
import { GIFEncoder, quantize, applyPalette } from './vendor/gifenc.esm.js';

const W = 480, H = 480, GROUND_Y = 408;
const PAPER = '#f7f3e8', INK = '#2b2b2b', ONION = 'rgba(43,43,43,0.18)';

let frames = Pose.makeWaveFrames(12);
let current = 0;
let fps = 12;
let playing = false;
let playTimer = null;
let stepCount = 0;

const mainCanvas = document.getElementById('main');
const mainCtx = mainCanvas.getContext('2d');
const stripEl = document.getElementById('strip');
const statusEl = document.getElementById('status');

// ---------- 手绘风格渲染 ----------

// 确定性伪随机：同一帧同一笔画抖动一致，避免播放时线条闪烁
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function wobblyLine(ctx, x1, y1, x2, y2, rand) {
  const mx = (x1 + x2) / 2 + (rand() - 0.5) * 3;
  const my = (y1 + y2) / 2 + (rand() - 0.5) * 3;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.quadraticCurveTo(mx, my, x2, y2);
  ctx.stroke();
}

function drawFigure(ctx, pose, seed, color, scale) {
  const rand = mulberry32(seed * 7919 + 13);
  const geo = Pose.strokes(pose);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 3.5 * scale;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const line of geo.lines) {
    for (let i = 0; i < line.length - 1; i++) {
      wobblyLine(ctx, line[i].x, line[i].y, line[i + 1].x, line[i + 1].y, rand);
    }
  }
  // 头部：略微不规则的圆
  const { center, radius } = geo.head;
  ctx.beginPath();
  const wob = (rand() - 0.5) * 2;
  ctx.ellipse(center.x, center.y, radius + wob, radius - wob, (rand() - 0.5) * 0.1, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawScene(ctx, pose, opts) {
  const { seed = 0, color = INK, scale = 1, onionPose = null, showJoints = false } = opts || {};
  ctx.save();
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.scale(scale, scale);
  // 地面
  ctx.strokeStyle = 'rgba(43,43,43,0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(30, GROUND_Y);
  ctx.lineTo(W - 30, GROUND_Y);
  ctx.stroke();
  if (onionPose) drawFigure(ctx, onionPose, seed - 1, ONION, 1);
  drawFigure(ctx, pose, seed, color, 1);
  if (showJoints) {
    ctx.fillStyle = '#d0553a';
    for (const j of Pose.JOINTS) {
      ctx.beginPath();
      ctx.arc(pose[j].x, pose[j].y, Pose.ROOT_JOINTS.includes(j) ? 6 : 4.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function renderMain() {
  const onion = current > 0 ? frames[current - 1] : null;
  drawScene(mainCtx, frames[current], {
    seed: current,
    scale: 1,
    onionPose: playing ? null : onion,
    showJoints: !playing,
  });
}

// ---------- 帧条 ----------

function renderStrip() {
  stripEl.innerHTML = '';
  frames.forEach((pose, i) => {
    const wrap = document.createElement('div');
    wrap.className = 'thumb' + (i === current ? ' selected' : '');
    const cv = document.createElement('canvas');
    cv.width = 96; cv.height = 96;
    drawScene(cv.getContext('2d'), pose, { seed: i, scale: 96 / W });
    const num = document.createElement('span');
    num.className = 'num';
    num.textContent = i + 1;
    wrap.appendChild(cv);
    wrap.appendChild(num);
    wrap.addEventListener('click', () => selectFrame(i));
    stripEl.appendChild(wrap);
  });
}

function selectFrame(i) {
  current = Math.max(0, Math.min(i, frames.length - 1));
  renderMain();
  renderStrip();
}

function refreshAll() {
  renderMain();
  renderStrip();
  document.getElementById('btn-delete').disabled = frames.length <= 1;
}

// ---------- 逐帧拖拽编辑 ----------

let dragJoint = null;

function canvasPos(evt) {
  const rect = mainCanvas.getBoundingClientRect();
  return {
    x: (evt.clientX - rect.left) * (W / rect.width),
    y: (evt.clientY - rect.top) * (H / rect.height),
  };
}

mainCanvas.addEventListener('pointerdown', (evt) => {
  if (playing) return;
  const pos = canvasPos(evt);
  const pose = frames[current];
  let best = null, bestDist = 16;
  for (const j of Pose.JOINTS) {
    const d = Math.hypot(pose[j].x - pos.x, pose[j].y - pos.y);
    if (d < bestDist) { bestDist = d; best = j; }
  }
  if (best) {
    dragJoint = best;
    mainCanvas.setPointerCapture(evt.pointerId);
  }
});

mainCanvas.addEventListener('pointermove', (evt) => {
  if (!dragJoint) return;
  const pos = canvasPos(evt);
  const pose = frames[current];
  if (Pose.ROOT_JOINTS.includes(dragJoint)) {
    // 拖动躯干：整体平移
    const dx = pos.x - pose[dragJoint].x;
    const dy = pos.y - pose[dragJoint].y;
    for (const j of Pose.JOINTS) { pose[j].x += dx; pose[j].y += dy; }
  } else {
    pose[dragJoint].x = pos.x;
    pose[dragJoint].y = pos.y;
  }
  renderMain();
});

mainCanvas.addEventListener('pointerup', () => {
  if (dragJoint) { dragJoint = null; renderStrip(); }
});

// ---------- Web Audio 脚步声 ----------

let audioCtx = null;
let noiseBuffer = null;

function ensureAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    noiseBuffer = audioCtx.createBuffer(1, audioCtx.sampleRate * 0.12, audioCtx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (data.length * 0.25));
    }
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
}

// 脚步：短噪声脉冲过低通，左右脚交替声像与音高
function playStep(stepIndex) {
  ensureAudio();
  const t = audioCtx.currentTime;
  const left = stepIndex % 2 === 0;
  const src = audioCtx.createBufferSource();
  src.buffer = noiseBuffer;
  src.playbackRate.value = left ? 0.9 : 1.1;
  const filter = audioCtx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = left ? 420 : 520;
  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(0.5, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
  const pan = audioCtx.createStereoPanner();
  pan.pan.value = left ? -0.35 : 0.35;
  src.connect(filter).connect(gain).connect(pan).connect(audioCtx.destination);
  src.start(t);
  src.stop(t + 0.12);
}

// ---------- 播放 ----------

// 每 3 帧一步：节拍随帧率同步变化（8fps→2.7步/秒，12→4，24→8）
const STEP_EVERY = 3;

function tick() {
  current = (current + 1) % frames.length;
  if (current % STEP_EVERY === 0) {
    stepCount += 1;
    playStep(stepCount);
  }
  renderMain();
  renderStrip();
}

function setPlaying(next) {
  playing = next;
  document.getElementById('btn-play').textContent = playing ? '⏸ 暂停' : '▶ 播放';
  clearInterval(playTimer);
  if (playing) {
    ensureAudio();
    playTimer = setInterval(tick, 1000 / fps);
  }
  renderMain();
}

function setFps(next) {
  fps = next;
  if (playing) {
    // 重建定时器，脚步节拍随新帧率同步变化
    clearInterval(playTimer);
    playTimer = setInterval(tick, 1000 / fps);
  }
  setStatus(`帧率 ${fps} fps · 脚步每 ${STEP_EVERY} 帧一步（${(fps / STEP_EVERY).toFixed(1)} 步/秒）`);
}

// ---------- 帧操作 ----------

function setStatus(msg) {
  statusEl.textContent = msg;
}

document.getElementById('btn-play').addEventListener('click', () => setPlaying(!playing));

document.getElementById('fps-group').addEventListener('change', (evt) => {
  if (evt.target.name === 'fps') setFps(Number(evt.target.value));
});

document.getElementById('btn-copy-prev').addEventListener('click', () => {
  const prev = (current - 1 + frames.length) % frames.length;
  frames[current] = Pose.clonePose(frames[prev]);
  refreshAll();
  setStatus(`已把第 ${prev + 1} 帧复制到第 ${current + 1} 帧`);
});

document.getElementById('btn-add').addEventListener('click', () => {
  frames.splice(current + 1, 0, Pose.clonePose(frames[current]));
  selectFrame(current + 1);
  refreshAll();
  setStatus(`已在第 ${current + 1} 帧插入（共 ${frames.length} 帧）`);
});

document.getElementById('btn-delete').addEventListener('click', () => {
  if (frames.length <= 1) return;
  const removed = current;
  frames.splice(current, 1);
  selectFrame(Math.min(removed, frames.length - 1));
  refreshAll();
  setStatus(`已删除第 ${removed + 1} 帧（剩 ${frames.length} 帧）`);
});

document.getElementById('btn-reset').addEventListener('click', () => {
  frames = Pose.makeWaveFrames(12);
  selectFrame(0);
  refreshAll();
  setStatus('已重置为 12 帧挥手动画');
});

document.addEventListener('keydown', (evt) => {
  if (evt.code === 'Space') { evt.preventDefault(); setPlaying(!playing); }
  if (evt.code === 'ArrowLeft') selectFrame(current - 1);
  if (evt.code === 'ArrowRight') selectFrame(current + 1);
});

// ---------- 导出 ----------

function download(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

// 离屏渲染一帧为 RGBA 像素
function rasterizeFrame(pose, seed) {
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  drawScene(cv.getContext('2d'), pose, { seed, scale: 1 });
  return cv.getContext('2d').getImageData(0, 0, W, H).data;
}

function exportGif() {
  setPlaying(false);
  setStatus('正在编码 GIF…');
  const gif = GIFEncoder();
  const delay = Math.round(1000 / fps);
  for (let i = 0; i < frames.length; i++) {
    const data = rasterizeFrame(frames[i], i);
    const palette = quantize(data, 256);
    const index = applyPalette(data, palette);
    gif.writeFrame(index, W, H, { palette, delay, repeat: i === 0 ? 0 : undefined });
  }
  gif.finish();
  const bytes = gif.bytes();
  download(new Blob([bytes], { type: 'image/gif' }), `wave-${fps}fps.gif`);
  setStatus(`GIF 已导出（${frames.length} 帧 @ ${fps} fps）`);
}

function exportWebm() {
  setPlaying(false);
  const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
    ? 'video/webm;codecs=vp9' : 'video/webm';
  // 优先手动逐帧推流（Chrome），不支持 requestFrame 时退回自动帧率采集
  const manual = typeof CanvasCaptureMediaStreamTrack !== 'undefined'
    && 'requestFrame' in CanvasCaptureMediaStreamTrack.prototype;
  const stream = manual ? mainCanvas.captureStream(0) : mainCanvas.captureStream(fps);
  const track = stream.getVideoTracks()[0];
  const rec = new MediaRecorder(stream, { mimeType: mime });
  const chunks = [];
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  rec.onstop = () => {
    download(new Blob(chunks, { type: 'video/webm' }), `wave-${fps}fps.webm`);
    setStatus(`WebM 已导出（${frames.length} 帧 @ ${fps} fps）`);
    renderMain();
  };
  setStatus('正在录制 WebM…');
  rec.start();
  let i = 0;
  const step = () => {
    drawScene(mainCtx, frames[i], { seed: i, scale: 1 });
    if (manual) track.requestFrame();
    i += 1;
    if (i < frames.length) setTimeout(step, 1000 / fps);
    else setTimeout(() => rec.stop(), 1000 / fps);
  };
  step();
}

document.getElementById('btn-gif').addEventListener('click', exportGif);
document.getElementById('btn-webm').addEventListener('click', exportWebm);

// ---------- 初始化 ----------

refreshAll();
setFps(fps);
