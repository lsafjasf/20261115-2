// Headless unit checks for the pure layout engine using a stub 2D context.
import assert from 'node:assert/strict';
import { VIEW, safeRect, fitText, layoutPanel, clampToSafe, tokenize } from './layout.js';

const stubCtx = {
  font: '',
  measureText(text) {
    // Rough approximation: CJK ~ font size, latin ~ 0.55 * font size per char.
    const px = Number(this.font.match(/(\d+)px/)?.[1] || 16);
    let units = 0;
    for (const ch of text) {
      units += /[\u3000-\u9fff\uff00-\uffef]/.test(ch) ? 1 : 0.55;
    }
    return { width: units * px };
  },
};

const tokens = tokenize('智能 Aurora 香薰机');
assert.ok(tokens.includes('Aurora'), 'latin word kept whole');
assert.ok(tokens.includes('智'), 'CJK split per character');

const fitted = fitText(stubCtx, '超長文字'.repeat(40), {
  maxWidth: VIEW.innerW, maxHeight: 300, startSize: 16, minSize: 9, weight: 400, lineHeightRatio: 1.4,
});
assert.ok(fitted.size <= 16 && fitted.size >= 9, 'font shrinks within bounds');
assert.ok(fitted.height <= 300, 'block height within maxHeight');
assert.ok(Math.max(...fitted.lines.map((l) => l.width)) <= VIEW.innerW, 'every line fits width');

const blocks = [
  { id: 't1', type: 'title', text: '封面标题' },
  { id: 'b1', type: 'body', text: '说明文字'.repeat(30) },
  { id: 'i1', type: 'image', h: 180 },
];
const laid = layoutPanel(stubCtx, 0, blocks);
const safe = safeRect(0);
for (const b of laid.blocks) {
  const r = b.rect;
  assert.ok(r.x >= safe.x && r.y >= safe.y, 'block starts inside safe box');
  assert.ok(r.x + r.w <= safe.x + safe.w && r.y + r.h <= safe.y + safe.h, 'block ends inside safe box');
}

// Clamp keeps an out-of-range rect inside the safe box.
const clamped = clampToSafe(1, { x: -999, y: 9999, w: 200, h: 150 });
const safe1 = safeRect(1);
assert.ok(clamped.x >= safe1.x && clamped.y + clamped.h <= safe1.y + safe1.h, 'clamped within safe box');

console.log('layout unit tests: all assertions passed');
