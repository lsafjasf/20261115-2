// svg.mjs — 把运行轨迹渲染成多面板 SVG 时序图（无依赖）

const W = 900;
const PANEL_H = 130;
const PAD_L = 64;
const PAD_R = 24;
const PAD_T = 28;

function polyline(points) {
  return points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
}

function panel(trace, key, opts) {
  const { title, color, min, max, unit } = opts;
  const plotW = W - PAD_L - PAD_R;
  const tMax = trace[trace.length - 1].t;
  const toX = (t) => PAD_L + (t / tMax) * plotW;
  const toY = (v) => PAD_T + PANEL_H - 24 - ((v - min) / (max - min)) * (PANEL_H - 44);
  const pts = trace.map((row) => [toX(row.t), toY(row[key])]);
  const gridY = [min, (min + max) / 2, max]
    .map((v) => `<line x1="${PAD_L}" y1="${toY(v)}" x2="${W - PAD_R}" y2="${toY(v)}" stroke="#26314a" stroke-width="1"/>
      <text x="${PAD_L - 8}" y="${toY(v) + 4}" fill="#8fa3c8" font-size="11" text-anchor="end">${v.toFixed(2)}</text>`)
    .join('');
  const shiftMarks = trace
    .filter((row, i) => i > 0 && row.scene !== trace[i - 1].scene)
    .map((row) => `<line x1="${toX(row.t)}" y1="${PAD_T}" x2="${toX(row.t)}" y2="${PAD_T + PANEL_H - 24}" stroke="#46d39a" stroke-width="1.4" stroke-dasharray="5 4"/>`)
    .join('');
  return `<g>
    <text x="${PAD_L}" y="18" fill="#e8eefc" font-size="13" font-weight="600">${title}${unit ? ` (${unit})` : ''}</text>
    ${gridY}
    ${shiftMarks}
    <polyline points="${polyline(pts)}" fill="none" stroke="${color}" stroke-width="2"/>
  </g>`;
}

export function renderSvg(trace, report) {
  const panels = [
    panel(trace, 'theta', { title: '布景角度 θ', color: '#7aa2ff', min: -3.2, max: 3.2, unit: 'rad' }),
    panel(trace, 'omega', { title: '底座角速度 ω', color: '#f5b85a', min: -1, max: 1, unit: 'rad/s' }),
    panel(trace, 'cw', { title: '配重位置（右玩家）', color: '#c792ea', min: -2.6, max: 1.4, unit: 'm' }),
    panel(trace, 'tilt', { title: '倾斜指标', color: '#ff7a90', min: 0, max: 1, unit: '比值' }),
    panel(trace, 'danger', { title: '距碰撞带安全余量', color: '#46d39a', min: 0, max: 3.2, unit: 'rad' }),
  ];
  const height = PAD_T + PANEL_H * panels.length + 20;
  const body = panels
    .map((svg, i) => `<g transform="translate(0,${i * PANEL_H})">${svg}</g>`)
    .join('\n');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${height}" viewBox="0 0 ${W} ${height}" font-family="system-ui, sans-serif">
  <rect width="100%" height="100%" fill="#101626"/>
  <text x="${W - PAD_R}" y="18" fill="#8fa3c8" font-size="12" text-anchor="end">
    ${report.result === 'won' ? '成功' : '失败'} · ${report.shiftsCompleted} 次换景 · ${report.cuesUsed}/${report.cueLimit} 提示 · ${report.durationSec}s
  </text>
  ${body}
</svg>`;
}
