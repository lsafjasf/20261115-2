// Lightweight invariant tests for the shared embroidery core (no DOM needed).

import assert from 'node:assert/strict';
import {
  GRID_SIZE, torusDelta, stitchLength, wrapSegments, validateStitches, toSVG,
  MAX_STITCH_LENGTH, MAX_COLOR_SWITCH_RATIO,
} from '../src/core.js';
import { generatePattern } from '../src/pattern.js';

let passed = 0;
const test = (name, fn) => {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
};

test('torusDelta picks the shortest signed wrap', () => {
  assert.equal(torusDelta(1, 31), -2);
  assert.equal(torusDelta(31, 1), 2);
  assert.equal(torusDelta(5, 8), 3);
});

test('stitchLength uses toroidal distance', () => {
  const len = stitchLength({ x1: 2, y1: 0, x2: 2, y2: 31 });
  assert.ok(Math.abs(len - 1) < 1e-9);
});

test('wrapSegments keeps every folded segment inside the tile', () => {
  const s = { x1: 1, y1: 1, x2: 30, y2: 31, colorIndex: 0, runId: 'r' };
  for (const seg of wrapSegments(s)) {
    for (const v of [seg.x1, seg.y1, seg.x2, seg.y2]) {
      assert.ok(v >= -1e-9 && v <= GRID_SIZE + 1e-9);
    }
    assert.equal(typeof seg.rawX1, 'number');
  }
});

test('validator flags overlong legs and frequent color switches', () => {
  const bad = [
    { x1: 0, y1: 0, x2: 20, y2: 20, colorIndex: 0, runId: 'a' },
    { x1: 0, y1: 0, x2: 1, y2: 0, colorIndex: 1, runId: 'b' },
    { x1: 1, y1: 0, x2: 2, y2: 0, colorIndex: 0, runId: 'b' },
    { x1: 2, y1: 0, x2: 3, y2: 0, colorIndex: 1, runId: 'b' },
  ];
  const report = validateStitches(bad);
  assert.equal(report.lengthIssues.length, 1);
  assert.ok(report.lengthIssues[0].length > MAX_STITCH_LENGTH);
  assert.ok(report.switchIssues[0].ratio > MAX_COLOR_SWITCH_RATIO);
});

test('generated pattern passes every rule and uses all six colors', () => {
  const report = validateStitches(generatePattern());
  assert.equal(report.ok, true);
  assert.equal(report.stats.colorsUsed.length, 6);
  assert.ok(report.stats.maxLength <= MAX_STITCH_LENGTH);
});

test('seamless SVG emits nine translated tile copies', () => {
  const svg = toSVG(generatePattern());
  const translates = svg.match(/translate\(/g) || [];
  assert.equal(translates.length, 9);
  assert.ok(svg.includes('viewBox="0 0 32 32"'));
});

test('non-wrap SVG is a plain single tile', () => {
  const svg = toSVG(generatePattern(), { seamWrap: false });
  assert.equal((svg.match(/translate\(/g) || []).length, 0);
});

console.log(`\n${passed} 个单元测试全部通过 ✅`);
