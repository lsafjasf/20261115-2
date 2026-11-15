// Node CLI: generates facades, writes SVG/PNG artifacts and runs the
// geometric verification report.
//
// Usage:
//   node scripts/render.js                 # render the two task seeds
//   node scripts/render.js --seed 42 --floors 5 --png --svg
//   node scripts/render.js --check-only    # verify only, no files
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateFacade } from '../src/layout.js';
import { buildScene } from '../src/scene.js';
import { renderSvg } from '../src/render-svg.js';
import { rasterize } from '../src/raster-node.js';
import { checkFacade } from '../src/check.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = parseArgs(process.argv.slice(2));

function parseArgs(argv) {
  const out = { seeds: [], checkOnly: false, png: true, svg: true };
  const valueFlags = new Set(['--seeds', '--seed', '--floors', '--bays', '--pane-ratio', '--sunshades', '--sunshade-depth', '--sign']);
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--check-only') out.checkOnly = true;
    else if (a === '--no-png') out.png = false;
    else if (a === '--no-svg') out.svg = false;
    else if (a === '--seeds') out.seeds.push(...argv[++i].split(',').map(Number));
    else if (a === '--seed') out.seeds.push(Number(argv[++i]));
    else if (valueFlags.has(a)) out[camel(a.slice(2))] = coerce(argv[++i]);
  }
  return out;
}

function camel(name) {
  return name.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

function coerce(value) {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  return value;
}

const seeds = args.seeds.length ? args.seeds : [7, 23];
const reports = [];

for (const seed of seeds) {
  const params = { seed };
  for (const key of ['floors', 'bays', 'paneRatio', 'sunshades', 'sunshadeDepth', 'sign', 'constructionLines']) {
    if (args[key] !== undefined) params[key] = args[key];
  }
  const model = generateFacade(params);
  const scene = buildScene(model);
  const report = checkFacade(model);
  reports.push({ seed, report });

  console.log(`\nseed ${seed}:`);
  console.log(JSON.stringify(report.stats, null, 2));
  if (report.ok) console.log('  checks: PASS (no window/beam/column overlap; door bay has no window)');
  else report.violations.forEach((v) => console.log(`  FAIL: ${v}`));

  if (!args.checkOnly) {
    const outDir = join(root, 'artifacts');
    mkdirSync(outDir, { recursive: true });
    if (args.svg) {
      const svg = renderSvg(scene, model.canvas);
      const svgPath = join(outDir, `facade-seed${seed}.svg`);
      writeFileSync(svgPath, svg);
      console.log(`  wrote ${svgPath}`);
    }
    if (args.png) {
      const png = rasterize(scene, model.canvas.width, model.canvas.height, 2);
      const pngPath = join(outDir, `facade-seed${seed}.png`);
      writeFileSync(pngPath, png);
      console.log(`  wrote ${pngPath} (${png.length} bytes)`);
    }
  }
}

const failed = reports.filter((r) => !r.report.ok);
if (failed.length) {
  console.error(`\n${failed.length} facade(s) failed geometric checks`);
  process.exit(1);
}
console.log('\nAll facade checks passed.');
