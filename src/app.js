// Browser controller: binds the control panel to the shared layout engine and
// renders the elevation on a Canvas2D surface with live geometric checks.
import { generateFacade } from './layout.js';
import { buildScene } from './scene.js';
import { renderToCanvas } from './render-canvas.js';
import { renderSvg } from './render-svg.js';
import { rasterizePngBlob } from './raster-browser.js';
import { checkFacade } from './check.js';

const $ = (id) => document.getElementById(id);
const canvas = $('canvas');

function readParams() {
  return {
    seed: Number($('seed').value) || 1,
    floors: Number($('floors').value),
    bays: Number($('bays').value),
    paneRatio: Number($('paneRatio').value),
    sunshades: $('sunshades').value,
    sunshadeDepth: Number($('sunshadeDepth').value),
    sign: $('sign').value,
    constructionLines: $('constructionLines').checked
  };
}

let current = null;

export function redraw() {
  const params = readParams();
  const model = generateFacade(params);
  const scene = buildScene(model);
  current = { model, scene };

  canvas.width = model.canvas.width;
  canvas.height = model.canvas.height;
  renderToCanvas(scene, canvas);

  const report = checkFacade(model);
  $('report').textContent =
    `${report.ok ? '✅ 校验通过' : '❌ 存在冲突'}\n` +
    `窗户 ${report.stats.windowCount} 个（一层 ${report.stats.groundWindowCount}）\n` +
    `门洞位于 ${report.stats.doorBay + 1} 号开间 · 遮阳板 ${report.stats.sunshadeCount} 块\n` +
    report.violations.map((v) => `- ${v}`).join('\n');
}

function download(filename, blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function bindRange(id, valueId) {
  $(id).addEventListener('input', () => {
    $(valueId).textContent = $(id).value;
    redraw();
  });
}

bindRange('floors', 'floorsValue');
bindRange('bays', 'baysValue');
bindRange('paneRatio', 'paneValue');
bindRange('sunshadeDepth', 'depthValue');
for (const id of ['seed', 'sunshades', 'sign', 'constructionLines']) {
  $(id).addEventListener('input', redraw);
}

$('reroll').addEventListener('click', () => {
  $('seed').value = Math.floor(Math.random() * 9999) + 1;
  redraw();
});

$('exportSvg').addEventListener('click', () => {
  const svg = renderSvg(current.scene, current.model.canvas);
  download(`facade-seed${current.model.params.seed}.svg`, new Blob([svg], { type: 'image/svg+xml' }));
});

$('exportPng').addEventListener('click', () => {
  const blob = rasterizePngBlob(current.scene, current.model.canvas.width, current.model.canvas.height, 2);
  download(`facade-seed${current.model.params.seed}.png`, blob);
});

redraw();
