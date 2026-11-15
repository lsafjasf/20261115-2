// SVG renderer: serializes the neutral command list to a standalone SVG string.
function esc(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function renderSvg(cmds, { width, height }) {
  const body = cmds.map(serialize).join('\n  ');
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `  ${body}`,
    `</svg>`,
    ''
  ].join('\n');
}

function serialize(cmd) {
  if (cmd.type === 'rect') {
    const attrs = [
      `x="${cmd.x}"`, `y="${cmd.y}"`,
      `width="${cmd.width}"`, `height="${cmd.height}"`,
      `fill="${cmd.fill}"`
    ];
    return `<rect ${attrs.join(' ')} />`;
  }
  if (cmd.type === 'line') {
    const attrs = [
      `x1="${cmd.x1}"`, `y1="${cmd.y1}"`,
      `x2="${cmd.x2}"`, `y2="${cmd.y2}"`,
      `stroke="${cmd.stroke}"`, `stroke-width="${cmd.width ?? 1}"`
    ];
    if (cmd.dashed) attrs.push('stroke-dasharray="5,4"');
    return `<line ${attrs.join(' ')} />`;
  }
  if (cmd.type === 'text') {
    const transform = cmd.rotate
      ? ` transform="rotate(${cmd.rotate} ${cmd.x} ${cmd.y})"`
      : '';
    return `<text x="${cmd.x}" y="${cmd.y}" font-family="sans-serif" font="${esc(cmd.font)}" fill="${cmd.fill}" text-anchor="middle" dominant-baseline="central"${transform}>${esc(cmd.text)}</text>`;
  }
  return '';
}
