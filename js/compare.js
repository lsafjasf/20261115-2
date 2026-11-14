/* LUMA Color Room — 底部双底图 × 三预设对照条（纯程序生成缩略图） */
(function () {
  'use strict';
  const { applyImageData, PRESETS } = LUMA;
  const { W, H, build } = LUMABase;
  const BASES = [
    { id: 'coastline', label: 'A · COASTLINE', build: build.coastline },
    { id: 'duneGarden', label: 'B · DUNE GARDEN', build: build.duneGarden }
  ];

  function makeThumb(baseCanvas, params) {
    const tw = 236, th = 158;
    const c = document.createElement('canvas');
    c.width = tw; c.height = th;
    const cctx = c.getContext('2d');
    cctx.drawImage(baseCanvas, 0, 0, W, H, 0, 0, tw, th);
    const img = cctx.getImageData(0, 0, tw, th);
    applyImageData(img, params);
    cctx.putImageData(img, 0, 0);
    return c.toDataURL('image/png');
  }

  function init() {
    const grid = document.getElementById('compare-grid');
    BASES.forEach((baseInfo) => {
      const baseCanvas = baseInfo.build();
      PRESETS.forEach((preset, idx) => {
        const cell = document.createElement('button');
        cell.className = 'compare-cell';
        cell.innerHTML =
          `<img alt="${baseInfo.label} / ${preset.name}" src="${makeThumb(baseCanvas, preset.params)}">` +
          `<span class="cell-tag">${baseInfo.label}</span>` +
          `<span class="cell-name">${preset.name}</span>` +
          `<span class="cell-params mono">0${idx + 1} / ${preset.params.temperature}K</span>`;
        cell.addEventListener('click', () => {
          window.__LUMA__.loadBase(baseInfo.id);
          setTimeout(() => window.__LUMA__.applyPreset(preset.id), 30);
        });
        grid.appendChild(cell);
      });
    });
  }
  document.addEventListener('DOMContentLoaded', () => setTimeout(init, 60));
})();
