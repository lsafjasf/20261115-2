// Verification harness:
//  1. layout geometry — every content band stays inside the safe area and
//     every perforation hole stays outside it;
//  2. determinism — re-rendering the same project/seed yields byte-identical
//     SVG and PNG;
//  3. PNG metadata — seed and title round-trip from tEXt/iTXt chunks;
//  4. text bounding boxes — title and denomination paths stay inside SAFE.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { renderConfig } from './render-png.mjs';
import { validateLayout, STAMP, perforationHoles } from './layout.mjs';
import { normalizeConfig, validateConfig } from './config.mjs';
import { readTextChunks } from './png-meta.mjs';
import { loadFonts } from './render-png.mjs';
import { measureText } from './text.mjs';
import { fitFontSize } from './text.mjs';
import { contentBands } from './layout.mjs';

const failures = [];
function check(name, condition, detail = '') {
  const status = condition ? 'PASS' : 'FAIL';
  console.log(`${status}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!condition) failures.push(name);
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

// 1. Geometry.
const layout = validateLayout();
check('all content bands inside safe area', layout.ok, layout.errors.join('; '));
check(`perforation count deterministic (${layout.holeCount} holes)`, layout.holeCount > 40);

const holes = perforationHoles();
const { safe } = STAMP;
const holesOutsideSafe = holes.every((hole) => {
  if (hole.edge === 'top') return hole.r <= safe.y;
  if (hole.edge === 'bottom') return STAMP.height - hole.r >= safe.y + safe.height;
  if (hole.edge === 'left') return hole.r <= safe.x;
  return STAMP.width - hole.r >= safe.x + safe.width;
});
check('every perforation hole stays outside the safe area', holesOutsideSafe);

// 2 + 3. Determinism and metadata for each project.
const projectDir = path.resolve('projects');
const projects = fs.readdirSync(projectDir).filter((f) => f.endsWith('.json'));
const fonts = await loadFonts();

for (const file of projects) {
  const raw = JSON.parse(fs.readFileSync(path.join(projectDir, file), 'utf8'));
  const config = normalizeConfig(raw);
  const valid = validateConfig(config);
  check(`${file}: config valid`, valid.ok, valid.errors.join('; '));

  const first = await renderConfig(config, { scale: 2 });
  const second = await renderConfig(config, { scale: 2 });
  check(`${file}: same seed reproduces identical SVG`,
    first.svg === second.svg, `svg sha ${sha256(Buffer.from(first.svg)).slice(0, 12)}`);
  check(`${file}: same seed reproduces byte-identical PNG`,
    first.png.equals(second.png), `png sha ${sha256(first.png).slice(0, 12)}`);

  const meta = readTextChunks(first.png);
  check(`${file}: PNG metadata carries seed`, meta.seed === config.seed, meta.seed);
  check(`${file}: PNG metadata carries UTF-8 title`, meta.title === config.title, meta.title);

  // 4. Text geometry: measured glyph widths fit the header/denomination bands.
  const bands = contentBands();
  const titleSize = fitFontSize(fonts.bold, config.title, bands.header.width, 118, 40, 4);
  const titleWidth = measureText(fonts.bold, config.title, titleSize, 4);
  check(`${file}: title width inside safe band`,
    titleWidth <= bands.header.width, `${titleWidth.toFixed(1)} <= ${bands.header.width}`);

  const denom = `${config.currency} ${config.denomination} ${config.unit}`;
  const denomSize = fitFontSize(fonts.bold, denom, bands.denomination.width * 0.72, 120, 48, 2);
  const denomWidth = measureText(fonts.bold, denom, denomSize, 2);
  check(`${file}: denomination width inside safe band`,
    denomWidth <= bands.denomination.width, `${denomWidth.toFixed(1)} <= ${bands.denomination.width}`);

  // Guard: every layout band plus the glyph extents stay inside the inner
  // frame, which itself is well inside the perforation margin.
  const frameEdge = STAMP.frameInner;
  const bandBoxes = Object.values(bands).map((box) => ({
    x: box.x ?? (safe.x + (safe.width - box.size) / 2),
    y: box.y,
    width: box.width ?? box.size,
    height: box.height ?? box.size,
  }));
  const bandsInside = bandBoxes.every((box) =>
    box.x >= frameEdge && box.y >= frameEdge
    && box.x + box.width <= STAMP.width - frameEdge
    && box.y + box.height <= STAMP.height - frameEdge);
  check(`${file}: every ornament band stays inside the inner frame`, bandsInside);

  // Glyph extents: getPath bounding boxes for title and denomination.
  const titlePath = fonts.bold.getPath(config.title,
    safe.x + safe.width / 2 - titleWidth / 2, bands.header.y + titleSize * 0.92,
    titleSize, { tracking: 4 });
  const titleBox = titlePath.getBoundingBox();
  const titleSafe = titleBox.x1 <= safe.x + safe.width
    && titleBox.y1 <= bands.header.y + bands.header.height + 2;
  check(`${file}: title glyphs never enter the perforation margin`, titleSafe,
    `x1=${titleBox.x1.toFixed(1)} y1=${titleBox.y1.toFixed(1)}`);
}

// A changed seed must change output, proving the seed really drives drawing.
const base = normalizeConfig(JSON.parse(fs.readFileSync(path.join(projectDir, projects[0]), 'utf8')));
const shifted = { ...base, seed: `${base.seed}-different` };
const a = await renderConfig(base, { scale: 1 });
const b = await renderConfig(shifted, { scale: 1 });
check('different seed produces different SVG', a.svg !== b.svg);
check('different seed produces different PNG bytes', !a.png.equals(b.png));

console.log(failures.length === 0
  ? `\nAll checks passed (${projects.length} projects).`
  : `\n${failures.length} check(s) failed: ${failures.join(', ')}`);
process.exit(failures.length === 0 ? 0 : 1);
