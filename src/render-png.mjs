// Node renderer: SVG -> high-resolution PNG via sharp.
// The seed is embedded as PNG tEXt metadata so a file can be audited later.

import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import opentype from 'opentype.js';
import { renderStampSvg } from './stamp.mjs';
import { normalizeConfig, validateConfig } from './config.mjs';
import { STAMP } from './layout.mjs';
import { addTextChunks } from './png-meta.mjs';

const FONT_DIR = path.resolve('fonts');

export async function loadFonts() {
  const read = async (file) => {
    const buffer = await fs.readFile(path.join(FONT_DIR, file));
    return opentype.parse(buffer.buffer.slice(
      buffer.byteOffset, buffer.byteOffset + buffer.byteLength,
    ));
  };
  const [regular, bold] = await Promise.all([
    read('NotoSansCJKsc-Regular.otf'),
    read('NotoSansCJKsc-Bold.otf'),
  ]);
  return { regular, bold };
}

export async function renderConfig(config, { scale = 2 } = {}) {
  const normalized = normalizeConfig(config);
  const check = validateConfig(normalized);
  if (!check.ok) {
    throw new Error(`invalid config: ${check.errors.join('; ')}`);
  }
  const fonts = await loadFonts();
  const { svg } = renderStampSvg(normalized, fonts);
  const png = await sharp(Buffer.from(svg), { density: 96 })
    .resize(STAMP.width * scale, STAMP.height * scale, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png({
      compressionLevel: 9,
      resolution: 300,
      resolutionUnit: 'inch',
    })
    .toBuffer();
  const at300 = await sharp(png)
    .withMetadata({ density: 300 })
    .png({ compressionLevel: 9, resolution: 300, resolutionUnit: 'inch' })
    .toBuffer();
  const tagged = addTextChunks(at300, [
    ['seed', normalized.seed],
    ['title', normalized.title],
    ['generator', 'programmatic-stamp/1.0'],
  ]);
  return { png: tagged, svg, normalized, check };
}

export async function renderProjectFile(projectPath, outputPath, options = {}) {
  const raw = JSON.parse(await fs.readFile(projectPath, 'utf8'));
  const { png, normalized } = await renderConfig(raw, options);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, png);
  return { outputPath, seed: normalized.seed, bytes: png.length };
}

// CLI: node src/render-png.mjs projects/x.json artifacts/x.png [scale]
if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , projectPath, outputPath, scaleArg] = process.argv;
  if (!projectPath || !outputPath) {
    console.error('usage: node src/render-png.mjs <project.json> <out.png> [scale]');
    process.exit(2);
  }
  const result = await renderProjectFile(
    projectPath, outputPath, { scale: Number(scaleArg) || 2 },
  );
  console.log(JSON.stringify(result, null, 2));
}
