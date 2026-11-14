#!/usr/bin/env node
/* Headless generator: write stone/wood/fabric 512x512 PNGs and seam report.
 * Usage: node tools/export.js [outDir]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const TexEngine = require('../src/engine.js');
const TexPNG = require('../src/png.js');
const TexSeam = require('../src/seam.js');

const N = TexEngine.SIZE;
const outDir = path.resolve(process.argv[2] || path.join(__dirname, '..', 'artifacts'));
fs.mkdirSync(outDir, { recursive: true });

const presets = [
  { type: 'stone', seed: 20261115, scale: 5, angleDeg: 30, contrast: 1.15 },
  { type: 'wood', seed: 20261115, scale: 6, angleDeg: 75, contrast: 1.35 },
  { type: 'fabric', seed: 20261115, scale: 4, angleDeg: 0, contrast: 1.1 },
];

const report = [];
for (const preset of presets) {
  const t0 = Date.now();
  const { rgb } = TexEngine.generate(N, preset);
  const ms = Date.now() - t0;
  const png = TexPNG.encode(rgb, N, N, false);
  const file = path.join(outDir, `${preset.type}_512.png`);
  fs.writeFileSync(file, png);
  const stats = TexSeam.check(rgb, N);
  report.push({ preset, file, ms, bytes: png.length, stats });
}

for (const r of report) {
  const s = r.stats;
  console.log(
    '[' + r.preset.type.padEnd(6) + '] ' + path.basename(r.file) + ' ' + r.bytes + 'B  gen ' + r.ms + 'ms'
  );
  console.log(
    '  wrap seam  X=' + s.seamX.toFixed(3) + ' (ratio ' + s.seamRatioX.toFixed(3) +
    ', max ' + s.maxX.toFixed(1) + ')  Y=' + s.seamY.toFixed(3) +
    ' (ratio ' + s.seamRatioY.toFixed(3) + ', max ' + s.maxY.toFixed(1) + ')'
  );
  console.log(
    '  2x2 cross  boundary=' + s.crossBoundary.toFixed(3) + ' interior=' + s.interiorStep.toFixed(3) +
    ' ratio=' + s.ratio.toFixed(3) + '  => ' + (s.passed ? 'PASS' : 'FAIL')
  );
}

fs.writeFileSync(path.join(outDir, 'seam_report.json'), JSON.stringify(
  report.map(r => ({ ...r, file: path.basename(r.file) })), null, 2));
const allPass = report.every(r => r.stats.passed);
console.log('\nOverall: ' + (allPass ? 'ALL PASS' : 'SOME FAIL') + ' (' + report.length + ' textures, ' + N + 'x' + N + ' PNG)');
process.exit(allPass ? 0 : 1);
