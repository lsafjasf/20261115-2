// End-to-end verification: build the procedural six-color pattern, validate
// the stitch rules, export SVG/PNG with a standards-compliant engine, and prove
// the four edges tile seamlessly with no gaps.

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {
  GRID_SIZE, validateStitches, wrapSegments, toSVG,
  MAX_STITCH_LENGTH, MAX_COLOR_SWITCH_RATIO, COLORS,
} from '../src/core.js';
import { generatePattern } from '../src/pattern.js';
import {
  renderPattern, renderCanonical, renderCanonicalTiled, savePNG, isBackground,
} from './rasterize.js';

const OUT = 'artifacts';
const TILE_PX = 960;
const TILING = 3;
const BG_RGB = [251, 247, 238];
const failures = [];
const check = (name, condition, detail = '') => {
  if (condition) console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ''}`);
  else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
};

const inkDelta = (data, idx) =>
  Math.abs(data[idx] - BG_RGB[0]) + Math.abs(data[idx + 1] - BG_RGB[1]) + Math.abs(data[idx + 2] - BG_RGB[2]);

console.log('1) 生成并校验纹样规则');
const stitches = generatePattern();
const report = validateStitches(stitches);
check('六色全部使用', report.stats.colorsUsed.length === COLORS.length,
  `colors=${JSON.stringify(report.stats.colorsUsed)}`);
check('无超长针脚', report.lengthIssues.length === 0,
  `max=${report.stats.maxLength}, limit=${MAX_STITCH_LENGTH}`);
check('换色比不超限', report.switchIssues.length === 0, `limit=${MAX_COLOR_SWITCH_RATIO}`);
check('整体校验 ok', report.ok);

console.log('2) 四边环面结构：跨边针脚分段且全部落在 [0,n] 内');
const edgeHits = { x: 0, y: 0 };
let outOfBounds = 0;
for (const stitch of stitches) {
  for (const seg of wrapSegments(stitch)) {
    if (seg.wrap.includes('x')) edgeHits.x += 1;
    if (seg.wrap.includes('y')) edgeHits.y += 1;
    const coords = [seg.x1, seg.y1, seg.x2, seg.y2];
    if (coords.some((v) => v < -1e-9 || v > GRID_SIZE + 1e-9)) outOfBounds += 1;
  }
}
check('存在左右跨边针脚', edgeHits.x > 0, `segments=${edgeHits.x}`);
check('存在上下跨边针脚', edgeHits.y > 0, `segments=${edgeHits.y}`);
check('所有分段在界内', outOfBounds === 0, `outOfBounds=${outOfBounds}`);

console.log('3) 标准引擎导出 SVG 与 PNG（resvg，与浏览器 Canvas 同一类抗锯齿）');
await mkdir(OUT, { recursive: true });
const svg = toSVG(stitches);
await writeFile(path.join(OUT, 'embroidery-pattern.svg'), svg);
const canonical = await renderCanonical(stitches, TILE_PX);
const canonicalTiled = await renderCanonicalTiled(stitches, TILE_PX, TILING);
await savePNG({ size: TILE_PX, data: canonical.data }, path.join(OUT, 'embroidery-pattern.png'));
await savePNG({ size: canonicalTiled.info.width, data: canonicalTiled.data },
  path.join(OUT, 'embroidery-3x3.png'));

console.log('4) 3×3 平铺逐像素一致：九切片与单块完全相同');
let tileMismatch = 0;
for (let ty = 0; ty < TILING; ty += 1) {
  for (let tx = 0; tx < TILING; tx += 1) {
    for (let y = 0; y < TILE_PX; y += 1) {
      for (let x = 0; x < TILE_PX; x += 1) {
        const a = (y * TILE_PX + x) * 4;
        const b = ((ty * TILE_PX + y) * canonicalTiled.info.width + tx * TILE_PX + x) * 4;
        for (let c = 0; c < 4; c += 1) {
          if (Math.abs(canonical.data[a + c] - canonicalTiled.data[b + c]) > 2) tileMismatch += 1;
        }
      }
    }
  }
}
check('九切片与单块逐像素一致', tileMismatch === 0, `mismatched channels=${tileMismatch}`);

console.log('5) 接缝无漏边：接缝两侧像素等于单块对边的环面回绕值');
const seam = { vertical: 0, horizontal: 0 };
const px = (data, width, x, y) => {
  const i = (y * width + x) * 4;
  return [data[i], data[i + 1], data[i + 2], data[i + 3]];
};
const close = (a, b) => a.every((v, i) => Math.abs(v - b[i]) <= 2);
for (let row = 0; row < TILING; row += 1) {
  for (let y = 0; y < TILE_PX; y += 1) {
    const gy = row * TILE_PX + y;
    if (!close(px(canonicalTiled.data, canonicalTiled.info.width, TILE_PX - 1, gy),
      px(canonical.data, TILE_PX, TILE_PX - 1, y))) seam.vertical += 1;
    if (!close(px(canonicalTiled.data, canonicalTiled.info.width, TILE_PX, gy),
      px(canonical.data, TILE_PX, 0, y))) seam.vertical += 1;
  }
}
for (let col = 0; col < TILING; col += 1) {
  for (let x = 0; x < TILE_PX; x += 1) {
    const gx = col * TILE_PX + x;
    if (!close(px(canonicalTiled.data, canonicalTiled.info.width, gx, TILE_PX - 1),
      px(canonical.data, TILE_PX, x, TILE_PX - 1))) seam.horizontal += 1;
    if (!close(px(canonicalTiled.data, canonicalTiled.info.width, gx, TILE_PX),
      px(canonical.data, TILE_PX, x, 0))) seam.horizontal += 1;
  }
}
check('垂直接缝连续', seam.vertical === 0, `diffs=${seam.vertical}`);
check('水平接缝连续', seam.horizontal === 0, `diffs=${seam.horizontal}`);

console.log('6) 单块四边承载真实针迹（证明跨边针脚可见，非整圈背景）');
let edgeInk = 0;
const singleBuf = { size: TILE_PX, data: canonical.data };
for (let i = 0; i < TILE_PX; i += 1) {
  if (!isBackground(singleBuf, i, 0) || !isBackground(singleBuf, i, TILE_PX - 1)
    || !isBackground(singleBuf, 0, i) || !isBackground(singleBuf, TILE_PX - 1, i)) edgeInk += 1;
}
check('四边存在针迹像素', edgeInk > 100, `edge ink pixels=${edgeInk}`);

console.log('7) 针迹几何采样：每条针脚中点在标准 PNG 与自研渲染中都被正确着色');
const topology = renderPattern(stitches, { size: TILE_PX, tiles: 1 });
const scale = TILE_PX / GRID_SIZE;
const hexToRgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
let sampled = 0;
let canonHits = 0;
let topoHits = 0;
let colorHits = 0;
let colorSampled = 0;
const neighborhoodHasColor = (data, cx, cy, target, ux, uy) => {
  // A pixel belongs to the target thread if it is closer to that thread color
  // than to the cream background (robust under antialiasing/blending).
  const dist2 = (a, b) => a.reduce((sum, v, i) => sum + (v - b[i]) ** 2, 0);
  // Sample perpendicular and along the segment so a crossing cannot hide the
  // thread's own color within the local neighborhood.
  const px = -uy;
  const py = ux;
  for (const along of [-3, -1.5, 0, 1.5, 3]) {
    for (const perp of [-1, 0, 1]) {
      const x = Math.round(cx + ux * along + px * perp);
      const y = Math.round(cy + uy * along + py * perp);
      if (x < 0 || y < 0 || x >= TILE_PX || y >= TILE_PX) continue;
      const i = (y * TILE_PX + x) * 4;
      const pixel = [data[i], data[i + 1], data[i + 2]];
      if (inkDelta(data, i) > 40 && dist2(pixel, target) < dist2(pixel, BG_RGB)) {
        return true;
      }
    }
  }
  return false;
};
// Geometric segment intersection (torus segments are already inside [0,n]).
const segmentsIntersect = (a, b) => {
  const d = (p1, p2, p3) => (p2.x - p1.x) * (p3.y - p1.y) - (p2.y - p1.y) * (p3.x - p1.x);
  const A = { x: a.x1, y: a.y1 };
  const B = { x: a.x2, y: a.y2 };
  const C = { x: b.x1, y: b.y1 };
  const D = { x: b.x2, y: b.y2 };
  const d1 = d(C, D, A);
  const d2 = d(C, D, B);
  const d3 = d(A, B, C);
  const d4 = d(A, B, D);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0))
    && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
};
const allSegments = stitches.flatMap((stitch) =>
  wrapSegments(stitch).map((seg) => ({ seg, colorIndex: stitch.colorIndex })));
for (const stitch of stitches) {
  const target = hexToRgb(COLORS[stitch.colorIndex].hex);
  for (const seg of wrapSegments(stitch)) {
    const mx = Math.round(((seg.x1 + seg.x2) / 2) * scale);
    const my = Math.round(((seg.y1 + seg.y2) / 2) * scale);
    const len = Math.hypot(seg.x2 - seg.x1, seg.y2 - seg.y1) || 1;
    const ux = ((seg.x2 - seg.x1) / len);
    const uy = ((seg.y2 - seg.y1) / len);
    if (mx < 0 || my < 0 || mx >= TILE_PX || my >= TILE_PX) continue;
    sampled += 1;
    const idx = (my * TILE_PX + mx) * 4;
    const isInk = (data) => inkDelta(data, idx) > 30;
    if (isInk(canonical.data)) canonHits += 1;
    if (isInk(topology.data)) topoHits += 1;
    const crossing = allSegments.some((other) =>
      other.colorIndex !== stitch.colorIndex && segmentsIntersect(seg, other.seg));
    if (!crossing) {
      colorSampled += 1;
      if (neighborhoodHasColor(canonical.data, mx, my, target, ux, uy)) colorHits += 1;
    }
  }
}
check('标准 PNG 在所有针脚中点着色', canonHits === sampled, `${canonHits}/${sampled}`);
check('自研渲染在所有针脚中点着色', topoHits === sampled, `${topoHits}/${sampled}`);
check('非交叉针段颜色与线色一致', colorHits === colorSampled, `${colorHits}/${colorSampled}`);

console.log('8) 导出文件可被图像库重新打开且尺寸正确');
const metaPng = await sharp(path.join(OUT, 'embroidery-pattern.png')).metadata();
const metaSvg = await sharp(path.join(OUT, 'embroidery-pattern.svg')).metadata();
check('PNG 尺寸正确', metaPng.width === TILE_PX && metaPng.height === TILE_PX,
  `${metaPng.width}x${metaPng.height}`);
check('SVG 可解析', metaSvg.format === 'svg', `viewBox ${metaSvg.width}x${metaSvg.height}`);

await writeFile(path.join(OUT, 'verification-report.json'), JSON.stringify({
  pattern: report,
  edgeCrossingSegments: edgeHits,
  tilePixelMismatch: tileMismatch,
  seamMismatch: seam,
  edgeInkPixels: edgeInk,
  topology: { sampled, canonHits, topoHits, colorHits, colorSampled },
  failures,
  generatedAt: new Date().toISOString(),
}, null, 2));

console.log(`\n结果：${failures.length === 0 ? '全部通过 ✅' : `${failures.length} 项失败 ❌ ${failures.join(', ')}`}`);
process.exit(failures.length === 0 ? 0 : 1);
