import test from 'node:test';
import assert from 'node:assert/strict';

import { createCue, createInitialState } from '../js/core.js';
import { drawFrame, FRAME_WIDTH, FRAME_HEIGHT } from '../js/render.js';

class MockGradient {
  constructor() {
    this.stops = [];
  }
  addColorStop(offset, color) {
    this.stops.push([offset, color]);
  }
}

function createMockCtx() {
  const calls = [];
  return {
    calls,
    canvas: { width: FRAME_WIDTH, height: FRAME_HEIGHT },
    fillStyle: '',
    strokeStyle: '',
    font: '',
    globalAlpha: 1,
    lineWidth: 0,
    lineJoin: '',
    textAlign: '',
    textBaseline: '',
    createLinearGradient() {
      return new MockGradient();
    },
    fillRect(...args) {
      calls.push(['fillRect', ...args]);
    },
    fillText(text, x, y) {
      calls.push(['fillText', text, x, y]);
    },
    strokeText(text, x, y) {
      calls.push(['strokeText', text, x, y]);
    },
    measureText(text) {
      return { width: String(text).length * 24 };
    },
    beginPath() {
      calls.push(['beginPath']);
    },
    closePath() {
      calls.push(['closePath']);
    },
    moveTo() {},
    arcTo() {},
    fill() {
      calls.push(['fill']);
    },
    save() {
      calls.push(['save']);
    },
    restore() {
      calls.push(['restore']);
    },
    translate() {},
    scale() {},
  };
}

function drawnTexts(ctx) {
  return ctx.calls.filter(([op]) => op === 'fillText').map(([, text]) => text);
}

test('时间码始终烧录在画面上，且与当前时间一致', () => {
  const ctx = createMockCtx();
  drawFrame(ctx, [], 7.5);
  const texts = drawnTexts(ctx);
  assert.ok(texts.some((t) => t.startsWith('00:00:07:')));
});

test('只绘制当前时间轴上处于可见区间的字幕', () => {
  const { cues } = createInitialState();
  const ctxAt1 = createMockCtx();
  drawFrame(ctxAt1, cues, 1);
  assert.ok(drawnTexts(ctxAt1).includes(cues[0].text));

  const ctxAt7 = createMockCtx();
  drawFrame(ctxAt7, cues, 7);
  assert.ok(drawnTexts(ctxAt7).includes(cues[1].text));
  assert.ok(!drawnTexts(ctxAt7).includes(cues[0].text));

  const ctxGap = createMockCtx();
  drawFrame(ctxGap, cues, 4.8);
  assert.deepEqual(drawnTexts(ctxGap).filter((t) => !t.startsWith('00:')), []);
});

test('打字机字幕在入场中途只绘制部分字符', () => {
  const cue = createCue({ start: 0, end: 4, entrance: 'typewriter', text: '一二三四五六七八' });
  const ctx = createMockCtx();
  drawFrame(ctx, [cue], 0.45);
  const partial = drawnTexts(ctx).find((t) => t !== undefined && cue.text.startsWith(t) && t.length > 0);
  assert.ok(partial, '应当绘制打字机部分文本');
  assert.ok(partial.length < cue.text.length);
});

test('背景框与描边按设置决定是否调用对应绘制操作', () => {
  const withBox = createCue({ start: 0, end: 2, text: '带框' });
  const ctxBox = createMockCtx();
  drawFrame(ctxBox, [withBox], 1);
  assert.ok(ctxBox.calls.some(([op]) => op === 'fill'));

  const noBox = createCue({ start: 0, end: 2, text: '无框' });
  noBox.box.enabled = false;
  noBox.stroke.enabled = false;
  const ctxPlain = createMockCtx();
  drawFrame(ctxPlain, [noBox], 1);
  assert.ok(!ctxPlain.calls.some(([op]) => op === 'strokeText'));

  const ctxStroke = createMockCtx();
  drawFrame(ctxStroke, [withBox], 1);
  assert.ok(ctxStroke.calls.some(([op]) => op === 'strokeText') === withBox.stroke.enabled);
});
