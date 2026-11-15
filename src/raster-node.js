// Node PNG export: rasterize to a raw RGBA buffer, then encode via zlib.
import { encodePng } from './png.js';
import { rasterizeToBuffer } from './raster-core.js';

export function rasterize(cmds, width, height, scale = 2) {
  const { buffer, width: W, height: H } = rasterizeToBuffer(cmds, width, height, scale);
  return encodePng(buffer, W, H);
}
