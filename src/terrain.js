export const MASTER = { width: 1160, height: 620 };
export const TILE_SIZE = { width: 440, height: 620 };
export const CONTENT_BOUNDS = { x: 60, y: 55, width: 1160, height: 620 };

export const TILES = [
  {
    id: 'A',
    name: '西岭',
    code: 'W-01',
    accent: '#d9aa62',
    region: { x: 0, y: 0 },
    base: { x: 60, y: 55, rotation: 0 },
    grade: { brightness: 1.025, saturate: 1.04, hue: 3 },
  },
  {
    id: 'B',
    name: '中脊',
    code: 'W-02',
    accent: '#64b9aa',
    region: { x: 360, y: 0 },
    base: { x: 420, y: 55, rotation: 0 },
    grade: { brightness: 0.915, saturate: 0.86, hue: -5 },
  },
  {
    id: 'C',
    name: '东麓',
    code: 'W-03',
    accent: '#c27592',
    region: { x: 720, y: 0 },
    base: { x: 780, y: 55, rotation: 0 },
    grade: { brightness: 1.075, saturate: 1.09, hue: 7 },
  },
];

export const SEAM_THRESHOLD = 3.2;

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (edge0, edge1, value) => {
  const t = clamp((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};

function hash2(x, y, seed) {
  let h = x * 374761393 + y * 668265263 + seed * 1013904223;
  h = (h ^ (h >>> 13)) * 1274126177;
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

function valueNoise(x, y, seed) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const n00 = hash2(ix, iy, seed);
  const n10 = hash2(ix + 1, iy, seed);
  const n01 = hash2(ix, iy + 1, seed);
  const n11 = hash2(ix + 1, iy + 1, seed);
  return lerp(lerp(n00, n10, ux), lerp(n01, n11, ux), uy);
}

function fbm(x, y, octaves, seed) {
  let sum = 0;
  let amplitude = 0.5;
  let total = 0;
  let frequency = 1;
  for (let i = 0; i < octaves; i += 1) {
    sum += valueNoise(x * frequency, y * frequency, seed + i * 17) * amplitude;
    total += amplitude;
    amplitude *= 0.5;
    frequency *= 2.03;
  }
  return sum / total;
}

function elevationAt(x, y) {
  const broad = fbm(x * 0.0042, y * 0.0042, 5, 41);
  const detail = fbm(x * 0.017, y * 0.017, 3, 73);
  const ridgeSource = fbm(x * 0.0105 + 20, y * 0.0105 - 8, 4, 19);
  const ridge = 1 - Math.abs(ridgeSource * 2 - 1);
  const lake = Math.exp(-(
    ((x - 790) / 270) ** 2 +
    ((y - 390) / 175) ** 2
  ));
  const basin = Math.exp(-(
    ((x - 420) / 175) ** 2 +
    ((y - 535) / 120) ** 2
  ));
  const edgeFade = smoothstep(0, 90, x) * smoothstep(0, 80, y);
  let height = 0.34 + broad * 0.42 + ridge * 0.23 + detail * 0.055;
  height -= lake * 0.095 + basin * 0.055;
  height = height * (0.88 + edgeFade * 0.12);
  return clamp(height);
}

function terrainColor(height, slope, fine) {
  if (height < 0.305) return [14, 43, 51];
  if (height < 0.355) return [25, 65, 70];
  if (height < 0.392) return [48, 89, 84];
  if (height < 0.422) return [105, 119, 94];
  if (height < 0.475) return [135, 132, 96];
  if (height < 0.555) return [102, 122, 82];
  if (height < 0.635) return [68, 94, 68];
  if (height < 0.705) return [87, 93, 75];
  if (height < 0.775) return [118, 112, 94];
  return [151, 146, 128];
}

function blendColor(top, bottom, amount) {
  return [
    lerp(top[0], bottom[0], amount),
    lerp(top[1], bottom[1], amount),
    lerp(top[2], bottom[2], amount),
  ];
}

function makeTerrain() {
  const { width, height } = MASTER;
  const masterCanvas = document.createElement('canvas');
  masterCanvas.width = width;
  masterCanvas.height = height;
  const ctx = masterCanvas.getContext('2d');
  const image = ctx.createImageData(width, height);
  const elevation = new Float32Array(width * height);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      elevation[y * width + x] = elevationAt(x, y);
    }
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const h = elevation[index];
      const hx = elevation[y * width + Math.min(width - 1, x + 1)] - elevation[y * width + Math.max(0, x - 1)];
      const hy = elevation[Math.min(height - 1, y + 1) * width + x] - elevation[Math.max(0, y - 1) * width + x];
      const slope = Math.sqrt(hx * hx + hy * hy) * 34;
      const light = clamp(0.92 - hx * 10 + hy * 7, 0.55, 1.25);
      const grain = valueNoise(x * 0.42, y * 0.42, 91) - 0.5;
      const fine = valueNoise(x * 0.08, y * 0.08, 113);
      let color = terrainColor(h, slope, fine);

      if (h > 0.305 && h < 0.77) {
        const primary = terrainColor(h + 0.018, slope, fine);
        color = blendColor(color, primary, 0.15 + fine * 0.22);
      }

      const band = h * 29;
      const bandDistance = Math.abs(band - Math.round(band));
      const contour = h > 0.39 && h < 0.79 && bandDistance < 0.033;
      const waterContour = h < 0.355 && Math.abs(h * 75 - Math.round(h * 75)) < 0.045;

      const p = index * 4;
      let r = color[0] * light + grain * 6;
      let g = color[1] * light + grain * 5;
      let b = color[2] * light + grain * 4;
      if (contour) {
        r += 17;
        g += 19;
        b += 12;
      }
      if (waterContour) {
        r += 7;
        g += 12;
        b += 14;
      }
      if (h > 0.77) {
        r += slope * 9;
        g += slope * 8;
        b += slope * 6;
      }

      image.data[p] = clamp(r, 0, 255);
      image.data[p + 1] = clamp(g, 0, 255);
      image.data[p + 2] = clamp(b, 0, 255);
      image.data[p + 3] = 255;
    }
  }

  ctx.putImageData(image, 0, 0);
  const tiles = TILES.map((tile) => {
    const canvas = document.createElement('canvas');
    canvas.width = TILE_SIZE.width;
    canvas.height = TILE_SIZE.height;
    const tileCtx = canvas.getContext('2d');
    tileCtx.drawImage(
      masterCanvas,
      tile.region.x,
      tile.region.y,
      TILE_SIZE.width,
      TILE_SIZE.height,
      0,
      0,
      TILE_SIZE.width,
      TILE_SIZE.height,
    );
    const thumb = document.createElement('canvas');
    thumb.width = 148;
    thumb.height = 104;
    const thumbCtx = thumb.getContext('2d');
    const sourceWidth = TILE_SIZE.width * 0.62;
    const sourceHeight = TILE_SIZE.height * 0.48;
    thumbCtx.drawImage(
      canvas,
      (TILE_SIZE.width - sourceWidth) / 2,
      (TILE_SIZE.height - sourceHeight) / 2,
      sourceWidth,
      sourceHeight,
      0,
      0,
      thumb.width,
      thumb.height,
    );
    return { ...tile, canvas, thumbnail: thumb.toDataURL('image/jpeg', 0.82) };
  });

  return { masterCanvas, elevation, tiles };
}

let cachedTerrain;

export function getTerrain() {
  if (!cachedTerrain) cachedTerrain = makeTerrain();
  return cachedTerrain;
}

export function masterElevationAt(elevation, x, y) {
  const px = Math.max(0, Math.min(MASTER.width - 1, Math.round(x)));
  const py = Math.max(0, Math.min(MASTER.height - 1, Math.round(y)));
  return elevation[py * MASTER.width + px];
}
