/* 黑白线稿描摹为 SVG：阈值二值化 + marching squares 轮廓 + DP 简化 + Catmull-Rom 平滑 */
"use strict";

const W = 480, H = 360;

/* ---------- 1. 程序生成含粗细线的样例 ---------- */
function generateSample(seed) {
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const ctx = cv.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "#000";
  ctx.lineCap = "round";

  let s = seed;
  const rand = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

  // 粗直线
  ctx.lineWidth = 14;
  ctx.beginPath();
  ctx.moveTo(30, 40 + rand() * 20);
  ctx.lineTo(220, 90 + rand() * 30);
  ctx.stroke();

  // 细正弦曲线
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let x = 20; x <= 300; x += 4) {
    const y = 160 + Math.sin(x / 28) * 26;
    x === 20 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.stroke();

  // 粗圆环 + 细圆环
  ctx.lineWidth = 10;
  ctx.beginPath(); ctx.arc(360, 90, 52, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(360, 90, 76, 0, Math.PI * 2); ctx.stroke();

  // 中等粗细折线
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(60, 250);
  ctx.lineTo(140, 210 + rand() * 20);
  ctx.lineTo(220, 270);
  ctx.lineTo(300, 230);
  ctx.stroke();

  // 细矩形框
  ctx.lineWidth = 3;
  ctx.strokeRect(340, 210, 110, 80);

  // 小噪点（演示最小区域过滤）
  ctx.fillStyle = "#000";
  for (let i = 0; i < 24; i++) {
    const r = 1 + rand() * 2.2;
    ctx.beginPath();
    ctx.arc(20 + rand() * (W - 40), 300 + rand() * 50, r, 0, Math.PI * 2);
    ctx.fill();
  }
  return ctx.getImageData(0, 0, W, H);
}

/* ---------- 2. 灰度提取 + 阈值二值化 ---------- */
function toGray(imageData) {
  const d = imageData.data;
  const gray = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) {
    gray[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
  }
  return gray;
}

/* ---------- 3. Marching Squares 轮廓提取（亚像素插值） ---------- */
// 边 key：水平边 "h,x,y" 表示 (x,y)-(x+1,y)，垂直边 "v,x,y" 表示 (x,y)-(x,y+1)
function traceContours(gray, threshold) {
  const inside = (x, y) => gray[y * W + x] < threshold;
  // 边上插值交点坐标缓存
  const hPt = new Map(), vPt = new Map();
  const cross = (a, b) => {
    const t = (threshold - a) / (b - a);
    return Math.min(1, Math.max(0, isFinite(t) ? t : 0.5));
  };
  const getH = (x, y) => {
    const k = "h," + x + "," + y;
    if (!hPt.has(k)) hPt.set(k, [x + cross(gray[y * W + x], gray[y * W + x + 1]), y]);
    return k;
  };
  const getV = (x, y) => {
    const k = "v," + x + "," + y;
    if (!vPt.has(k)) vPt.set(k, [x, y + cross(gray[y * W + x], gray[(y + 1) * W + x])]);
    return k;
  };

  // 每个单元生成线段（端点为边 key）
  const segs = []; // [keyA, keyB]
  for (let y = 0; y < H - 1; y++) {
    for (let x = 0; x < W - 1; x++) {
      const idx = (inside(x, y) ? 8 : 0) | (inside(x + 1, y) ? 4 : 0) |
                  (inside(x + 1, y + 1) ? 2 : 0) | (inside(x, y + 1) ? 1 : 0);
      if (idx === 0 || idx === 15) continue;
      const T = () => getH(x, y), B = () => getH(x, y + 1);
      const L = () => getV(x, y), R = () => getV(x + 1, y);
      switch (idx) {
        case 1: segs.push([L(), B()]); break;
        case 2: segs.push([B(), R()]); break;
        case 3: segs.push([L(), R()]); break;
        case 4: segs.push([R(), T()]); break;
        case 5: segs.push([L(), T()], [B(), R()]); break;
        case 6: segs.push([B(), T()]); break;
        case 7: segs.push([L(), T()]); break;
        case 8: segs.push([T(), L()]); break;
        case 9: segs.push([T(), B()]); break;
        case 10: segs.push([T(), R()], [B(), L()]); break;
        case 11: segs.push([T(), R()]); break;
        case 12: segs.push([R(), L()]); break;
        case 13: segs.push([R(), B()]); break;
        case 14: segs.push([B(), L()]); break;
      }
    }
  }

  // 按端点把线段串成闭合环
  const adj = new Map(); // key -> [segIndex]
  segs.forEach((sg, i) => {
    for (const k of sg) {
      if (!adj.has(k)) adj.set(k, []);
      adj.get(k).push(i);
    }
  });
  const used = new Uint8Array(segs.length);
  const loops = [];
  for (let i = 0; i < segs.length; i++) {
    if (used[i]) continue;
    const loop = [];
    let segIdx = i, curKey = segs[i][0];
    while (true) {
      used[segIdx] = 1;
      const [a, b] = segs[segIdx];
      const nextKey = a === curKey ? b : a;
      const ptMap = nextKey[0] === "h" ? hPt : vPt;
      loop.push(ptMap.get(nextKey));
      curKey = nextKey;
      const candidates = adj.get(curKey).filter(j => !used[j]);
      if (candidates.length === 0) break;
      segIdx = candidates[0];
    }
    if (loop.length >= 3) loops.push(loop);
  }
  return loops;
}

function loopArea(loop) {
  let a = 0;
  for (let i = 0; i < loop.length; i++) {
    const [x1, y1] = loop[i], [x2, y2] = loop[(i + 1) % loop.length];
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
}

/* ---------- 4. 多边形简化（Douglas-Peucker） ---------- */
function douglasPeucker(pts, epsilon) {
  const n = pts.length;
  if (n < 4 || epsilon <= 0) return pts.slice();
  // 闭合环：以最远点对拆成两段开放折线分别简化
  let far = 0, maxD = -1;
  for (let i = 1; i < n; i++) {
    const d = (pts[i][0] - pts[0][0]) ** 2 + (pts[i][1] - pts[0][1]) ** 2;
    if (d > maxD) { maxD = d; far = i; }
  }
  const half1 = dpOpen(pts.slice(0, far + 1), epsilon);
  const half2 = dpOpen(pts.slice(far).concat([pts[0]]), epsilon);
  return half1.slice(0, -1).concat(half2.slice(0, -1));
}

function dpOpen(pts, epsilon) {
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [i0, i1] = stack.pop();
    if (i1 <= i0 + 1) continue;
    const [x1, y1] = pts[i0], [x2, y2] = pts[i1];
    const dx = x2 - x1, dy = y2 - y1;
    const len2 = dx * dx + dy * dy;
    let maxD = -1, idx = -1;
    for (let i = i0 + 1; i < i1; i++) {
      let d;
      if (len2 === 0) d = Math.hypot(pts[i][0] - x1, pts[i][1] - y1);
      else {
        const t = ((pts[i][0] - x1) * dx + (pts[i][1] - y1) * dy) / len2;
        const tc = Math.min(1, Math.max(0, t));
        d = Math.hypot(pts[i][0] - (x1 + tc * dx), pts[i][1] - (y1 + tc * dy));
      }
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD > epsilon) {
      keep[idx] = 1;
      stack.push([i0, idx], [idx, i1]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

/* ---------- 5. Catmull-Rom → 三次贝塞尔 SVG 路径 ---------- */
function smoothPath(pts, tension) {
  const n = pts.length;
  if (n < 3) return "";
  const r = v => Math.round(v * 100) / 100;
  let d = `M${r(pts[0][0])},${r(pts[0][1])}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i];
    const p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    const c1x = p1[0] + (p2[0] - p0[0]) * tension / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) * tension / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) * tension / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) * tension / 6;
    d += `C${r(c1x)},${r(c1y)} ${r(c2x)},${r(c2y)} ${r(p2[0])},${r(p2[1])}`;
  }
  return d + "Z";
}

/* ---------- 6. 描摹流水线 ---------- */
function trace(gray, { threshold, smoothing, minArea }) {
  const loops = traceContours(gray, threshold);
  const epsilon = smoothing * 0.5;          // 简化容差
  const tension = 1 + smoothing * 0.08;     // 曲线张力
  const paths = [];
  let nodeCount = 0;
  for (const loop of loops) {
    if (Math.abs(loopArea(loop)) < minArea) continue;
    const simplified = douglasPeucker(loop, epsilon);
    if (simplified.length < 3) continue;
    nodeCount += simplified.length;
    paths.push(smoothPath(simplified, tension));
  }
  return { paths, nodeCount };
}

function buildSvg(paths) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">` +
    `<path d="${paths.join("")}" fill="#000" fill-rule="evenodd"/></svg>`;
}

/* ---------- 7. UI 绑定 ---------- */
const NODE_WARN_LIMIT = 3000;

if (typeof document !== "undefined") {
  const $ = id => document.getElementById(id);
  const preview = $("preview");
  const pctx = preview.getContext("2d");
  let seed = 7;
  let imageData = generateSample(seed);
  let gray = toGray(imageData);
  let currentPaths = [];

  function params() {
    return {
      threshold: +$("threshold").value,
      smoothing: +$("smoothing").value,
      minArea: +$("minArea").value,
    };
  }

  function render() {
    const p = params();
    $("thresholdVal").textContent = p.threshold;
    $("smoothingVal").textContent = p.smoothing;
    $("minAreaVal").textContent = p.minArea;

    const { paths, nodeCount } = trace(gray, p);
    currentPaths = paths;

    // Canvas：栅格 + 曲线叠加
    pctx.clearRect(0, 0, W, H);
    if ($("showRaster").checked) pctx.putImageData(imageData, 0, 0);
    else { pctx.fillStyle = "#fff"; pctx.fillRect(0, 0, W, H); }
    if ($("showVector").checked) {
      pctx.strokeStyle = "rgba(220,30,30,0.85)";
      pctx.lineWidth = 1;
      for (const d of paths) pctx.stroke(new Path2D(d));
    }

    $("stats").textContent =
      `轮廓路径 ${paths.length} 条，矢量节点 ${nodeCount} 个`;
    const warn = $("warn");
    if (nodeCount > NODE_WARN_LIMIT) {
      warn.style.display = "block";
      warn.textContent = `⚠ 复杂度过高：${nodeCount} 个节点（>${NODE_WARN_LIMIT}），` +
        `建议提高平滑度或最小区域，否则导出的 SVG 难以编辑。`;
    } else {
      warn.style.display = "none";
    }
    renderCompare();
  }

  function renderCompare() {
    const p = params();
    for (const [id, cap, sm] of [["svgA", "capA", 1], ["svgB", "capB", 8]]) {
      const { paths, nodeCount } = trace(gray, { ...p, smoothing: sm });
      document.getElementById(cap).textContent =
        `平滑度 ${sm} — ${nodeCount} 节点`;
      document.getElementById(id).innerHTML =
        `<div class="zoom"><svg viewBox="150 40 120 90" width="360" height="270">` +
        `<path d="${paths.join("")}" fill="#000" fill-rule="evenodd"/></svg></div>` +
        buildSvg(paths).replace(`width="${W}" height="${H}"`, `width="360" height="270"`);
    }
  }

  function exportSvg() {
    const blob = new Blob([buildSvg(currentPaths)], { type: "image/svg+xml" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "traced.svg";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  for (const id of ["threshold", "smoothing", "minArea", "showRaster", "showVector"])
    $(id).addEventListener("input", render);
  $("regen").addEventListener("click", () => {
    seed = (seed * 31 + 17) & 0xffff;
    imageData = generateSample(seed);
    gray = toGray(imageData);
    render();
  });
  $("export").addEventListener("click", exportSvg);
  render();
}

if (typeof module !== "undefined") {
  module.exports = { traceContours, loopArea, douglasPeucker, smoothPath, trace, buildSvg };
}
