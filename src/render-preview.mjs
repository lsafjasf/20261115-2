// Renders the browser-style preview (dashed outer frame + safe-area guide)
// to a PNG so the guide overlay can be inspected without a browser.

import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { normalizeConfig } from './config.mjs';
import { loadFonts } from './render-png.mjs';
import { composePreviewSvg } from './stamp.mjs';
import { addTextChunks } from './png-meta.mjs';

const [, , projectPath, outputPath] = process.argv;
if (!projectPath || !outputPath) {
  console.error('usage: node src/render-preview.mjs <project.json> <out.png>');
  process.exit(2);
}

const config = normalizeConfig(JSON.parse(await fs.readFile(projectPath, 'utf8')));
const fonts = await loadFonts();
const svg = composePreviewSvg(config, fonts);
const png = await sharp(Buffer.from(svg))
  .png({ compressionLevel: 9 })
  .toBuffer();
const tagged = addTextChunks(png, [
  ['seed', config.seed],
  ['title', config.title],
  ['generator', 'programmatic-stamp-preview/1.0'],
]);
await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, tagged);
console.log(`preview written: ${outputPath} (${tagged.length} bytes)`);
