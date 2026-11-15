// Browser application: binds controls to the shared stamp engine, keeps the
// live project in localStorage, renders the preview and exports PNG/JSON.

import { THEME_PRESETS } from '../src/color.mjs';
import { PATTERNS } from '../src/geometry.mjs';
import {
  DEFAULT_CONFIG, normalizeConfig, validateConfig, randomSeed, PATTERN_SLOTS,
} from '../src/config.mjs';
import { loadFont } from '../src/text.mjs';
import { renderStampSvg, composePreviewSvg } from '../src/stamp.mjs';
import { addTextChunks } from '../src/png-meta.mjs';
import { STAMP } from '../src/layout.mjs';

const STORAGE_KEY = 'programmatic-stamp-project-v1';
const FONT_REGULAR = new URL('../fonts/NotoSansCJKsc-Regular.otf', import.meta.url);
const FONT_BOLD = new URL('../fonts/NotoSansCJKsc-Bold.otf', import.meta.url);

const $ = (id) => document.getElementById(id);

let fonts = null;
let config = loadProject();
let renderTimer = 0;

function loadProject() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return normalizeConfig(JSON.parse(saved));
  } catch {
    // Corrupt storage falls back to defaults.
  }
  return normalizeConfig(DEFAULT_CONFIG);
}

function persistProject() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

function buildSwatches() {
  const host = $('theme-presets');
  host.innerHTML = '';
  for (const preset of THEME_PRESETS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'swatch';
    button.style.background = preset.hex;
    button.title = preset.name;
    button.dataset.hex = preset.hex;
    button.addEventListener('click', () => {
      config.theme = preset.hex;
      syncControls();
      scheduleRender();
    });
    host.appendChild(button);
  }
}

function buildPatternSelects() {
  for (const slot of PATTERN_SLOTS) {
    const select = $(`pattern-${slot.key}`);
    select.innerHTML = '';
    for (const pattern of Object.values(PATTERNS)) {
      if (pattern.medallion !== slot.medallion) continue;
      const option = document.createElement('option');
      option.value = pattern.id;
      option.textContent = pattern.name;
      select.appendChild(option);
    }
    select.addEventListener('change', () => {
      config.patterns[slot.key] = select.value;
      scheduleRender();
    });
  }
}

function syncControls() {
  $('title').value = config.title;
  $('subtitle').value = config.subtitle;
  $('denomination').value = config.denomination;
  $('currency').value = config.currency;
  $('unit').value = config.unit;
  $('seed').value = config.seed;
  $('theme-custom').value = config.theme;
  $('theme-hex').textContent = config.theme;
  document.querySelectorAll('.swatch').forEach((button) => {
    button.classList.toggle('selected', button.dataset.hex === config.theme);
  });
  for (const slot of PATTERN_SLOTS) {
    $(`pattern-${slot.key}`).value = config.patterns[slot.key];
  }
}

function bindInputs() {
  const textBindings = [
    ['title', 'title'], ['subtitle', 'subtitle'], ['denomination', 'denomination'],
    ['currency', 'currency'], ['unit', 'unit'], ['seed', 'seed'],
  ];
  for (const [id, key] of textBindings) {
    $(id).addEventListener('input', () => {
      config[key] = $(id).value;
      scheduleRender();
    });
  }
  $('theme-custom').addEventListener('input', () => {
    config.theme = $('theme-custom').value;
    syncControls();
    scheduleRender();
  });
  $('seed-shuffle').addEventListener('click', () => {
    config.seed = randomSeed();
    syncControls();
    scheduleRender();
  });
  $('show-guides').addEventListener('change', renderNow);
  $('export-png').addEventListener('click', exportPng);
  $('export-project').addEventListener('click', downloadProject);
  $('reload-project').addEventListener('click', () => $('project-file').click());
  $('project-file').addEventListener('change', importProject);
}

function scheduleRender() {
  persistProject();
  clearTimeout(renderTimer);
  renderTimer = setTimeout(renderNow, 120);
}

function renderNow() {
  persistProject();
  const check = validateConfig(config);
  const validation = $('validation');
  validation.className = `validation ${check.ok ? 'ok' : ''}`;
  validation.textContent = check.ok
    ? `配置有效 · ${new Date().toLocaleTimeString()} 已保存到工程`
    : check.errors.join('；');
  if (!check.ok || !fonts) return;

  const showGuides = $('show-guides').checked;
  const svg = showGuides
    ? composePreviewSvg(config, fonts)
    : renderStampSvg(config, fonts).svg;
  $('preview').innerHTML = svg;
  $('preview-seed').textContent = `seed: ${config.seed}`;
  $('preview-size').textContent = `${STAMP.width} × ${STAMP.height} · 导出 2400 × 3000 @300DPI`;
}

async function exportPng() {
  const check = validateConfig(config);
  if (!check.ok) {
    $('validation').textContent = `无法导出：${check.errors.join('；')}`;
    return;
  }
  const scale = 2;
  const svg = renderStampSvg(config, fonts).svg;
  const blob = new Blob([svg], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const image = new Image();
  await new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = reject;
    image.src = url;
  });
  const canvas = document.createElement('canvas');
  canvas.width = STAMP.width * scale;
  canvas.height = STAMP.height * scale;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  URL.revokeObjectURL(url);
  const pngBlob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  // Embed the same tEXt/iTXt metadata the Node renderer writes.
  const tagged = addTextChunks(new Uint8Array(await pngBlob.arrayBuffer()), [
    ['seed', config.seed],
    ['title', config.title],
    ['generator', 'programmatic-stamp/1.0'],
  ]);
  download(new Blob([tagged], { type: 'image/png' }), `${config.seed}.png`);
}

function downloadProject() {
  persistProject();
  download(new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' }),
    `${config.seed}.json`);
}

async function importProject(event) {
  const file = event.target.files[0];
  if (!file) return;
  config = normalizeConfig(JSON.parse(await file.text()));
  syncControls();
  scheduleRender();
}

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function boot() {
  buildSwatches();
  buildPatternSelects();
  bindInputs();
  syncControls();
  $('preview').textContent = '正在加载字体…';
  const [regular, bold] = await Promise.all([
    loadFont(FONT_REGULAR.href),
    loadFont(FONT_BOLD.href),
  ]);
  fonts = { regular, bold };
  renderNow();
}

boot().catch((error) => {
  $('preview').textContent = `初始化失败：${error.message}`;
  console.error(error);
});
