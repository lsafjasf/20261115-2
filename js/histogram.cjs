/* LUMA Color Room — RGB 直方图绘制（纯 Canvas，无依赖） */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LUMAHisto = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function draw(canvas, hist) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#10140f';
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = 'rgba(230,226,205,0.08)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      const x = Math.round((w / 4) * i) + 0.5;
      ctx.beginPath(); ctx.moveTo(x, 4); ctx.lineTo(x, h - 16); ctx.stroke();
    }

    const channels = [
      { arr: hist.r, color: '232,92,82' },
      { arr: hist.g, color: '122,200,140' },
      { arr: hist.b, color: '104,158,224' }
    ];
    let max = 1;
    for (const ch of channels)
      for (let i = 0; i < 256; i++) max = Math.max(max, ch.arr[i]);
    const top = h - 18;
    for (const ch of channels) {
      ctx.beginPath();
      ctx.moveTo(0, top);
      for (let x = 0; x < w; x++) {
        const bin = Math.min(255, Math.floor((x / w) * 256));
        const v = Math.pow(ch.arr[bin] / max, 0.55);
        ctx.lineTo(x, top - v * (top - 6));
      }
      ctx.lineTo(w, top); ctx.closePath();
      ctx.fillStyle = `rgba(${ch.color},0.20)`;
      ctx.fill();
      ctx.strokeStyle = `rgba(${ch.color},0.95)`;
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(230,226,205,0.55)';
    ctx.font = '9px ui-monospace, monospace';
    ctx.fillText('0', 2, h - 5);
    ctx.fillText('255', w - 22, h - 5);
    ctx.fillStyle = 'rgba(232,92,82,0.95)'; ctx.fillText('R', 4, 11);
    ctx.fillStyle = 'rgba(122,200,140,0.95)'; ctx.fillText('G', 13, 11);
    ctx.fillStyle = 'rgba(104,158,224,0.95)'; ctx.fillText('B', 22, 11);
  }

  return { draw };
});
