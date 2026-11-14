import { chromium } from '/home/hj/userfeedback/uid220/node_modules/playwright/index.mjs';
import { writeFile } from 'node:fs/promises';

const ROOT = new URL('../', import.meta.url).pathname;
const browser = await chromium.launch({
  executablePath: '/home/hj/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome',
  args: ['--no-sandbox', '--force-color-profile=srgb']
});
const page = await browser.newPage({ viewport: { width: 1500, height: 1050 } });
await page.goto('http://127.0.0.1:8823/index.html', { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__LUMA__);

const dataUrl = await page.evaluate(async () => {
  const L = window.__LUMA__;
  const { applyImageData, PRESETS } = LUMA;
  const { W, H, build } = LUMABase;
  const bases = [
    { id: 'coastline', label: 'A 海岸公路 COASTLINE', build: build.coastline },
    { id: 'duneGarden', label: 'B 沙丘花园 DUNE GARDEN', build: build.duneGarden }
  ];
  const cellW = 460, cellH = 307, headH = 46, pad = 28, labelH = 34;
  const sheet = document.createElement('canvas');
  sheet.width = pad * 2 + cellW * 3 + 24 * 2;
  sheet.height = pad * 2 + 90 + (cellH + headH + labelH) * 2 + 24;
  const sctx = sheet.getContext('2d');
  sctx.fillStyle = '#0e120e';
  sctx.fillRect(0, 0, sheet.width, sheet.height);
  sctx.fillStyle = '#d8a866';
  sctx.font = '600 22px "Microsoft YaHei", sans-serif';
  sctx.fillText('LUMA 双底图 × 三预设 逐像素对照', pad, pad + 8);
  sctx.fillStyle = '#8b9384';
  sctx.font = '13px "Microsoft YaHei", sans-serif';
  sctx.fillText('同一调色引擎（曝光 / 色温 / 对比度 / 分离色调），960×640 程序生成底图，无外部图片', pad, pad + 34);

  bases.forEach((baseInfo, row) => {
    const baseCanvas = baseInfo.build();
    PRESETS.forEach((preset, col) => {
      const x = pad + col * (cellW + 24);
      const y = pad + 76 + row * (cellH + headH + labelH + 24);
      sctx.fillStyle = '#141a14';
      sctx.strokeStyle = '#283128';
      sctx.beginPath(); sctx.roundRect(x, y, cellW, cellH + headH + labelH, 10);
      sctx.fill(); sctx.stroke();

      sctx.fillStyle = '#e8e4d4';
      sctx.font = '600 16px "Microsoft YaHei", sans-serif';
      sctx.fillText(`${preset.name}  ·  ${preset.subtitle}`, x + 14, y + 22);
      sctx.fillStyle = '#8b9384';
      sctx.font = '11px ui-monospace, monospace';
      const p = preset.params;
      sctx.fillText(`EV ${p.exposure >= 0 ? '+' : ''}${p.exposure}  ${p.temperature}K  C ${p.contrast >= 0 ? '+' : ''}${p.contrast}  split ${p.shadowHue}°/${p.highHue}°`,
                    x + 14, y + 40);

      const c = document.createElement('canvas');
      c.width = cellW - 20; c.height = cellH;
      const cctx = c.getContext('2d');
      cctx.drawImage(baseCanvas, 0, 0, W, H, 0, 0, c.width, c.height);
      const img = cctx.getImageData(0, 0, c.width, c.height);
      applyImageData(img, p);
      cctx.putImageData(img, 0, 0);
      sctx.drawImage(c, x + 10, y + headH);

      sctx.fillStyle = '#d8a866';
      sctx.font = '12px "Microsoft YaHei", sans-serif';
      sctx.fillText(baseInfo.label, x + 14, y + headH + cellH + 22);
    });
  });
  return sheet.toDataURL('image/png');
});

const buf = Buffer.from(dataUrl.split(',')[1], 'base64');
await writeFile(ROOT + 'artifacts/comparison/contact-sheet.png', buf);
console.log('contact sheet written:', buf.length, 'bytes');
await browser.close();
