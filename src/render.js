// Canvas 渲染：海岸线、双路线轨道、潮位、信号机与列车
import { PATH, SEGMENTS, SEGMENT_IDS, pathLength, TRAIN_COUNT } from './engine.js';

export const LAYOUT = {
  width: 1000,
  height: 460,
  marginX: 70,
  coastalY: 170,
  bypassY: 310,
  seaY: 96,
};

const ROUTE_Y = { coastal: LAYOUT.coastalY, bypass: LAYOUT.bypassY };

// 预计算每段在画布上的横向像素区间（按各自路线里程线性映射）
function segmentPixels(route) {
  const total = pathLength(route);
  const span = LAYOUT.width - LAYOUT.marginX * 2;
  const map = new Map();
  for (const node of PATH[route]) {
    map.set(node.id, {
      x1: LAYOUT.marginX + (node.start / total) * span,
      x2: LAYOUT.marginX + (node.end / total) * span,
      y: ROUTE_Y[route],
      node,
    });
  }
  return map;
}

const PIXELS = {
  coastal: segmentPixels('coastal'),
  bypass: segmentPixels('bypass'),
};

function trainXY(train) {
  const total = pathLength(train.route);
  const span = LAYOUT.width - LAYOUT.marginX * 2;
  const x = LAYOUT.marginX + (train.position / total) * span;
  return { x, y: ROUTE_Y[train.route] };
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function drawScene(ctx, game) {
  const { width, height, seaY, marginX, coastalY, bypassY } = LAYOUT;
  ctx.clearRect(0, 0, width, height);

  drawSkyAndSea(ctx, game);
  drawRoute(ctx, 'coastal', game, true);
  drawRoute(ctx, 'bypass', game, false);
  drawJunctions(ctx);
  drawSignals(ctx, game);
  for (const train of game.trains) drawTrain(ctx, train, game);
  drawLabels(ctx);
}

function drawSkyAndSea(ctx, game) {
  const { width, seaY, marginX, coastalY } = LAYOUT;
  // 天空
  const sky = ctx.createLinearGradient(0, 0, 0, seaY);
  sky.addColorStop(0, '#cfe8ff');
  sky.addColorStop(1, '#eaf6ff');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, seaY - 8);

  // 陆地（先铺底，海水在其上方漫上沿海路基）
  ctx.fillStyle = '#d9c79a';
  ctx.fillRect(0, coastalY + 14, width, LAYOUT.height - coastalY);

  // 海面（高度随潮位，延伸覆盖到沿海路基下方）
  const level = game.waterLevel;
  const waterTop = seaY - level * 22;
  const sea = ctx.createLinearGradient(0, waterTop, 0, coastalY + 14);
  sea.addColorStop(0, 'rgba(38,110,176,0.85)');
  sea.addColorStop(1, 'rgba(18,60,110,0.95)');
  ctx.fillStyle = sea;
  ctx.beginPath();
  ctx.moveTo(0, waterTop);
  for (let x = 0; x <= width; x += 12) {
    const wave = Math.sin(x * 0.05 + game.t * 0.08) * 2.2 + Math.sin(x * 0.13 - game.t * 0.05) * 1.2;
    ctx.lineTo(x, waterTop + wave);
  }
  ctx.lineTo(width, coastalY + 14);
  ctx.lineTo(0, coastalY + 14);
  ctx.closePath();
  ctx.fill();

  // 水线刻度
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(marginX - 34, waterTop);
  ctx.lineTo(marginX - 12, waterTop);
  ctx.stroke();
  ctx.fillStyle = '#0f3a63';
  ctx.font = '11px sans-serif';
  ctx.fillText(`${level.toFixed(2)}m`, marginX - 52, waterTop + 4);
}

function drawRoute(ctx, route, game, isCoastal) {
  const pixels = PIXELS[route];
  const y = ROUTE_Y[route];
  for (const id of SEGMENT_IDS) {
    const box = pixels.get(id);
    if (!box) continue;
    const seg = box.node.seg;
    const flooded = game.flooded.has(id);

    // 路基
    ctx.fillStyle = flooded ? 'rgba(120,150,170,0.55)' : isCoastal ? '#b59a6b' : '#a7b38a';
    roundRect(ctx, box.x1, y - 11, box.x2 - box.x1 + 1, 22, 5);
    ctx.fill();

    // 轨道（双轨）
    ctx.strokeStyle = flooded ? '#7fd4ff' : '#3d3a34';
    ctx.lineWidth = 2;
    for (const dy of [-5, 5]) {
      ctx.beginPath();
      ctx.moveTo(box.x1, y + dy);
      ctx.lineTo(box.x2, y + dy);
      ctx.stroke();
    }

    // 枕木
    ctx.strokeStyle = flooded ? 'rgba(220,240,255,0.7)' : '#6b5d44';
    ctx.lineWidth = 1;
    for (let x = box.x1 + 4; x < box.x2; x += 12) {
      ctx.beginPath();
      ctx.moveTo(x, y - 7);
      ctx.lineTo(x, y + 7);
      ctx.stroke();
    }

    if (flooded) {
      ctx.fillStyle = 'rgba(80,170,230,0.35)';
      ctx.fillRect(box.x1, y - 11, box.x2 - box.x1, 22);
      // 封锁叉
      ctx.strokeStyle = '#ff5a5f';
      ctx.lineWidth = 2.5;
      const cx = (box.x1 + box.x2) / 2;
      ctx.beginPath();
      ctx.moveTo(cx - 7, y - 8);
      ctx.lineTo(cx + 7, y + 8);
      ctx.moveTo(cx + 7, y - 8);
      ctx.lineTo(cx - 7, y + 8);
      ctx.stroke();
    }

    if (seg.station) drawStation(ctx, box, seg, y);
  }
}

function drawStation(ctx, box, seg, y) {
  const cx = (box.x1 + box.x2) / 2;
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#444';
  ctx.lineWidth = 1.5;
  ctx.fillRect(cx - 4, y - 26, 8, 10);
  ctx.strokeRect(cx - 4, y - 26, 8, 10);
  ctx.fillStyle = '#333';
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(seg.name, cx, y - 30);
  ctx.textAlign = 'start';
}

function drawJunctions(ctx) {
  // s1 分流、s6 合流的道岔连线
  const s1c = PIXELS.coastal.get('s1');
  const s1b = PIXELS.bypass.get('s1');
  const s6c = PIXELS.coastal.get('s6');
  const s6b = PIXELS.bypass.get('s6');
  ctx.strokeStyle = '#3d3a34';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(s1c.x2, s1c.y);
  ctx.lineTo(s1b.x2, s1b.y);
  ctx.moveTo(s6c.x1, s6c.y);
  ctx.lineTo(s6b.x1, s6b.y);
  ctx.stroke();
}

function drawSignals(ctx, game) {
  for (const train of game.trains) {
    const node = PATH[train.route].find((n) => n.id === train.segmentId);
    const box = PIXELS[train.route].get(node.id);
    if (!box) continue;
    const color = train.lastAspect === 'red' ? '#ff4444' : train.lastAspect === 'yellow' ? '#ffb020' : '#37d67a';
    const sx = box.x1 - 8;
    const sy = box.y - 20;
    ctx.fillStyle = '#222';
    ctx.fillRect(sx - 2, sy - 2, 6, 6);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(sx + 1, sy + 1, 3.4, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawTrain(ctx, train, game) {
  const { x, y } = trainXY(train);
  const crashed = train.status === 'crashed';
  ctx.save();
  // 车身
  ctx.fillStyle = crashed ? '#5a5a5a' : train.color;
  roundRect(ctx, x - 16, y - 9, 32, 18, 4);
  ctx.fill();
  // 车窗
  ctx.fillStyle = crashed ? '#888' : '#dff2ff';
  for (let i = -1; i <= 1; i++) ctx.fillRect(x + i * 9 - 2, y - 5, 5, 5);
  // 车名
  ctx.fillStyle = '#222';
  ctx.font = 'bold 10px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(train.name, x, y - 14);
  ctx.textAlign = 'start';
  if (crashed) {
    ctx.fillStyle = '#ff3b3b';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText('💥 涉水事故', x, y + 26);
  }
  ctx.restore();
}

function drawLabels(ctx) {
  ctx.font = 'bold 12px sans-serif';
  ctx.fillStyle = '#1f4e79';
  ctx.fillText('沿海线（低潮位路基，涨潮封锁）', LAYOUT.marginX, LAYOUT.coastalY - 42);
  ctx.fillStyle = '#3f5a2c';
  ctx.fillText('内陆绕行线（高路基，全程安全）', LAYOUT.marginX, LAYOUT.bypassY - 42);
  ctx.fillStyle = '#555';
  ctx.font = '11px sans-serif';
  ctx.fillText('车辆段', LAYOUT.marginX - 8, LAYOUT.coastalY + 34);
  ctx.fillText('终点', LAYOUT.width - LAYOUT.marginX - 26, LAYOUT.coastalY + 34);
}

// 右侧潮汐曲线图
export function drawTideChart(canvas, game) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#0e2236';
  ctx.fillRect(0, 0, w, h);

  const pad = 26;
  const maxH = 3.2;
  const xOf = (t) => pad + (t / 1800) * (w - pad * 2);
  const yOf = (lv) => h - pad - (lv / maxH) * (h - pad * 2);

  // 网格 + 路基高程线
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 1;
  for (const seg of SEGMENTS.filter((s) => s.route === 'coastal')) {
    ctx.beginPath();
    ctx.moveTo(pad, yOf(seg.elevation));
    ctx.lineTo(w - pad, yOf(seg.elevation));
    ctx.stroke();
  }

  // 潮汐曲线
  ctx.strokeStyle = '#56b4f0';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let t = 0; t <= 1800; t += 10) {
    const x = xOf(t);
    const y = yOf(game.tideAt(t));
    if (t === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // 当前时刻游标
  ctx.strokeStyle = '#ffd166';
  ctx.lineWidth = 1.5;
  const cx = xOf(Math.min(game.t, 1800));
  ctx.beginPath();
  ctx.moveTo(cx, pad - 6);
  ctx.lineTo(cx, h - pad + 6);
  ctx.stroke();
  ctx.fillStyle = '#ffd166';
  ctx.font = '10px sans-serif';
  ctx.fillText(`${game.t.toFixed(0)}s`, cx - 10, pad - 10);
}
