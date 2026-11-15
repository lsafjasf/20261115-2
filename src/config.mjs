// Stamp project configuration: schema, defaults, validation and persistence.

import { THEME_PRESETS } from './color.mjs';
import { PATTERNS } from './geometry.mjs';

export const SCHEMA_VERSION = 1;

export const PATTERN_SLOTS = [
  { key: 'top', label: '顶部纹样', medallion: false },
  { key: 'medallion', label: '中心纹样', medallion: true },
  { key: 'bottom', label: '底部纹样', medallion: false },
];

export const DEFAULT_CONFIG = Object.freeze({
  schemaVersion: SCHEMA_VERSION,
  title: '山河同庆',
  subtitle: 'COMMEMORATIVE STAMP',
  denomination: '1.20',
  currency: '¥',
  unit: '元',
  theme: THEME_PRESETS[0].hex,
  patterns: {
    top: 'diamondLattice',
    medallion: 'concentricRings',
    bottom: 'waveBand',
  },
  seed: 'stamp-2026-a01',
});

export function normalizeConfig(input = {}) {
  const merged = { ...DEFAULT_CONFIG, ...input };
  merged.patterns = { ...DEFAULT_CONFIG.patterns, ...(input.patterns || {}) };
  return merged;
}

export function validateConfig(config) {
  const errors = [];
  if (!config || typeof config !== 'object') {
    return { ok: false, errors: ['config must be an object'] };
  }
  if (typeof config.title !== 'string' || config.title.trim().length === 0) {
    errors.push('title is required');
  } else if ([...config.title].length > 12) {
    errors.push('title must be at most 12 characters');
  }
  if (typeof config.denomination !== 'string'
    || !/^\d{1,4}(\.\d{1,2})?$/.test(config.denomination)) {
    errors.push('denomination must look like 1.20');
  }
  if (!/^#[0-9a-fA-F]{6}$/.test(config.theme || '')) {
    errors.push('theme must be a #rrggbb color');
  }
  if (typeof config.seed !== 'string' || config.seed.length === 0) {
    errors.push('seed is required');
  }
  for (const slot of PATTERN_SLOTS) {
    const id = config.patterns?.[slot.key];
    const pattern = PATTERNS[id];
    if (!pattern) {
      errors.push(`pattern for ${slot.key} is unknown: ${id}`);
    } else if (pattern.medallion !== slot.medallion) {
      errors.push(
        `pattern ${id} is ${pattern.medallion ? 'medallion' : 'band'} but slot ${slot.key} needs the opposite kind`,
      );
    }
  }
  return { ok: errors.length === 0, errors };
}

export function randomSeed(prefix = 'stamp') {
  const suffix = Array.from({ length: 6 }, () =>
    'abcdefghjkmnpqrstuvwxyz23456789'[Math.floor(Math.random() * 32)]).join('');
  return `${prefix}-${Date.now().toString(36)}-${suffix}`;
}
