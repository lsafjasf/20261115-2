// Stamp composition engine. Produces a deterministic SVG document from a
// validated config. The same SVG is rendered to PNG in Node and embedded
// live in the browser preview.

import { lighten, darken, isLight, withAlpha } from './color.mjs';
import { makeRng } from './rng.mjs';
import { PATTERNS } from './geometry.mjs';
import { STAMP, perforationHoles, contentBands, validateLayout } from './layout.mjs';
import { textToPath, fitFontSize } from './text.mjs';

function esc(text) {
  return String(text).replace(/[&<>"]/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]
  ));
}

function buildPalette(theme) {
  const paper = isLight(theme) ? lighten(theme, 0.88) : darken(theme, 0.82);
  return {
    theme,
    paper,
    ink: isLight(theme) ? darken(theme, 0.35) : lighten(theme, 0.32),
    accent: isLight(theme) ? lighten(theme, 0.25) : lighten(theme, 0.55),
    muted: withAlpha(theme, isLight(theme) ? 0.22 : 0.4),
    frame: isLight(theme) ? darken(theme, 0.25) : lighten(theme, 0.4),
    text: isLight(paper) ? darken(theme, 0.55) : lighten(theme, 0.75),
  };
}

function paperWithPerforations(palette) {
  const { width, height, holeRadius } = STAMP;
  const holes = perforationHoles();
  let d = `M0,0 H${width} V${height} H0 Z `;
  for (const hole of holes) {
    // Even-odd circle path punched out of the paper rectangle.
    d += `M${(hole.x - hole.r).toFixed(2)},${hole.y.toFixed(2)} `
      + `a${holeRadius},${holeRadius} 0 1,0 ${holeRadius * 2},0 `
      + `a${holeRadius},${holeRadius} 0 1,0 ${-holeRadius * 2},0 Z `;
  }
  return `<path d="${d}" fill-rule="evenodd" fill="${palette.paper}"/>`;
}

function frame(palette) {
  const { frameOuter, frameInner, width, height } = STAMP;
  const line = (inset) => {
    const x = inset;
    const y = inset;
    return `<rect x="${x}" y="${y}" width="${width - inset * 2}" `
      + `height="${height - inset * 2}" fill="none" stroke="${palette.frame}" `
      + `stroke-width="4"/>`;
  };
  const corner = (cx, cy, sx, sy) => {
    const len = 46;
    return `<path d="M${cx},${cy + sy * len} V${cy} H${cx + sx * len}" fill="none" `
      + `stroke="${palette.accent}" stroke-width="7" stroke-linecap="square"/>`;
  };
  const pad = frameInner + 10;
  return [
    line(frameOuter),
    line(frameInner),
    corner(pad, pad, 1, 1),
    corner(width - pad, pad, -1, 1),
    corner(pad, height - pad, 1, -1),
    corner(width - pad, height - pad, -1, -1),
  ].join('');
}

function bandClip(id, box) {
  return `<clipPath id="${id}"><rect x="${box.x}" y="${box.y}" `
    + `width="${box.width}" height="${box.height}"/></clipPath>`;
}

export function renderStampSvg(config, fonts) {
  const layoutCheck = validateLayout();
  if (!layoutCheck.ok) {
    throw new Error(`layout validation failed: ${layoutCheck.errors.join('; ')}`);
  }
  const rng = makeRng(config.seed);
  const palette = buildPalette(config.theme);
  const bands = contentBands();
  const body = [];

  body.push(paperWithPerforations(palette));
  body.push(frame(palette));

  // Subtle paper grain, restricted to the paper margin between the outer
  // frame and the safe area so speckles can never sit on text.
  const grain = [];
  for (let i = 0; i < 140; i += 1) {
    const edge = rng.int(0, 3);
    let gx;
    let gy;
    if (edge === 0) {
      gx = rng.range(STAMP.frameInner + 6, STAMP.width - STAMP.frameInner - 6);
      gy = rng.range(STAMP.frameInner + 6, STAMP.safeInset - 8);
    } else if (edge === 1) {
      gx = rng.range(STAMP.frameInner + 6, STAMP.width - STAMP.frameInner - 6);
      gy = rng.range(STAMP.height - STAMP.safeInset + 8, STAMP.height - STAMP.frameInner - 6);
    } else if (edge === 2) {
      gx = rng.range(STAMP.frameInner + 6, STAMP.safeInset - 8);
      gy = rng.range(STAMP.safeInset, STAMP.height - STAMP.safeInset);
    } else {
      gx = rng.range(STAMP.width - STAMP.safeInset + 8, STAMP.width - STAMP.frameInner - 6);
      gy = rng.range(STAMP.safeInset, STAMP.height - STAMP.safeInset);
    }
    grain.push(`<circle cx="${gx.toFixed(1)}" cy="${gy.toFixed(1)}" r="${rng.range(0.8, 2.2).toFixed(1)}" `
      + `fill="${palette.theme}" opacity="0.05"/>`);
  }
  body.push(`<g>${grain.join('')}</g>`);

  const topPattern = PATTERNS[config.patterns.top];
  const bottomPattern = PATTERNS[config.patterns.bottom];
  const medallionPattern = PATTERNS[config.patterns.medallion];

  body.push(`<defs>${bandClip('clip-top', bands.topFrieze)}${bandClip('clip-bottom', bands.bottomFrieze)}</defs>`);
  body.push(`<g clip-path="url(#clip-top)">`
    + `<g transform="translate(${bands.topFrieze.x},${bands.topFrieze.y})">`
    + topPattern.build(bands.topFrieze.width, bands.topFrieze.height, palette, rng)
    + `</g></g>`);
  body.push(`<g clip-path="url(#clip-bottom)">`
    + `<g transform="translate(${bands.bottomFrieze.x},${bands.bottomFrieze.y})">`
    + bottomPattern.build(bands.bottomFrieze.width, bands.bottomFrieze.height, palette, rng)
    + `</g></g>`);

  // Central medallion: backing disc + generated ornament.
  const m = bands.medallion;
  const cx = m.x + m.size / 2;
  const cy = m.y + m.size / 2;
  body.push(`<circle cx="${cx}" cy="${cy}" r="${m.size / 2}" fill="${withAlpha(palette.theme, 0.1)}" `
    + `stroke="${palette.frame}" stroke-width="6"/>`);
  body.push(`<circle cx="${cx}" cy="${cy}" r="${m.size / 2 - 18}" fill="none" `
    + `stroke="${palette.accent}" stroke-width="2" stroke-dasharray="4 10"/>`);
  body.push(`<g transform="translate(${m.x + 26},${m.y + 26})">`
    + medallionPattern.build(m.size - 52, palette, rng) + `</g>`);

  const { regular, bold } = fonts;
  const safeCenter = STAMP.safe.x + STAMP.safe.width / 2;

  // Title, auto-fit to the safe width. Baseline keeps it inside the band.
  const titleMax = bands.header.width;
  const titleSize = fitFontSize(bold, config.title, titleMax, 118, 40, 4);
  const titleY = bands.header.y + titleSize * 0.92;
  body.push(textToPath(bold, config.title, titleSize, safeCenter, titleY, {
    fill: palette.text, align: 'center', tracking: 4, id: 'stamp-title',
  }));

  // Caption under the medallion.
  const captionSize = fitFontSize(regular, config.subtitle, bands.caption.width, 44, 18, 2);
  body.push(textToPath(regular, config.subtitle, captionSize, safeCenter,
    bands.caption.y + captionSize * 0.9, {
      fill: palette.ink, align: 'center', tracking: 2,
    }));

  // Denomination line, e.g. "¥ 1.20 元".
  const denomText = `${config.currency} ${config.denomination} ${config.unit}`;
  const denomSize = fitFontSize(bold, denomText, bands.denomination.width * 0.72, 120, 48, 2);
  body.push(textToPath(bold, denomText, denomSize, safeCenter,
    bands.denomination.y + denomSize * 0.95, {
      fill: palette.text, align: 'center', tracking: 2,
    }));

  // Country / issuing line along the bottom frieze top edge, inside safe area.
  const issuer = 'CHINA POST 中国邮政';
  const issuerSize = fitFontSize(regular, issuer, STAMP.safe.width, 34, 16, 1);
  body.push(textToPath(regular, issuer, issuerSize, safeCenter,
    bands.bottomFrieze.y - 8, { fill: palette.ink, align: 'center', tracking: 1 }));

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${STAMP.width}" `
    + `height="${STAMP.height}" viewBox="0 0 ${STAMP.width} ${STAMP.height}">`
    + `<title>${esc(config.title)}</title>`
    + `<desc>seed=${esc(config.seed)}</desc>`
    + body.join('')
    + `</svg>`;
  return { svg, body, palette, bands, rng };
}

// Preview frame shown only in the browser (a dashed guide + safe-area box).
export function previewGuidesSvg() {
  const { safe } = STAMP;
  return [
    `<rect x="2" y="2" width="${STAMP.width - 4}" height="${STAMP.height - 4}" `
    + `fill="none" stroke="#3b82f6" stroke-width="3" stroke-dasharray="14 10"/>`,
    `<rect x="${safe.x}" y="${safe.y}" width="${safe.width}" height="${safe.height}" `
    + `fill="none" stroke="#22c55e" stroke-width="2" stroke-dasharray="8 8" opacity="0.8"/>`,
  ].join('');
}

export function composePreviewSvg(config, fonts) {
  const rendered = renderStampSvg(config, fonts);
  return rendered.svg.replace('</svg>', `${previewGuidesSvg()}</svg>`);
}
