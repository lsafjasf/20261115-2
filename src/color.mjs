// Pure color helpers with no DOM dependency.

export function hexToRgb(hex) {
  const clean = hex.replace('#', '');
  const full = clean.length === 3
    ? clean.split('').map((c) => c + c).join('')
    : clean;
  const value = Number.parseInt(full, 16);
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
}

export function rgbToHex({ r, g, b }) {
  const to = (v) => Math.round(Math.max(0, Math.min(255, v)))
    .toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

export function mix(a, b, t) {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  return rgbToHex({
    r: ca.r + (cb.r - ca.r) * t,
    g: ca.g + (cb.g - ca.g) * t,
    b: ca.b + (cb.b - ca.b) * t,
  });
}

export function lighten(hex, amount) {
  return mix(hex, '#ffffff', amount);
}

export function darken(hex, amount) {
  return mix(hex, '#000000', amount);
}

// Relative luminance; used to pick readable text color.
export function isLight(hex) {
  const { r, g, b } = hexToRgb(hex);
  const channel = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b) > 0.42;
}

export function withAlpha(hex, alpha) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

// A fixed curated theme palette offered in the UI.
export const THEME_PRESETS = [
  { id: 'vermilion', name: '朱砂红', hex: '#c0392b' },
  { id: 'indigo', name: '黛青蓝', hex: '#1f4e8c' },
  { id: 'pine', name: '松针绿', hex: '#1f7a4d' },
  { id: 'amber', name: '赭石黄', hex: '#c8860d' },
  { id: 'plum', name: '紫梅', hex: '#7b3f8f' },
  { id: 'teal', name: '孔雀青', hex: '#0e7c86' },
];
