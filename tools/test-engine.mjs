import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const LUMA = require('../js/engine.cjs');

function fakeImage(w, h, fill) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const c = fill(i, w, h);
    data[i * 4] = c[0]; data[i * 4 + 1] = c[1]; data[i * 4 + 2] = c[2];
    data[i * 4 + 3] = 255;
  }
  return { data, width: w, height: h };
}

test('默认参数为恒等管线（8-bit 容差内）', () => {
  const img = fakeImage(16, 16, (i) => [(i * 37) % 256, (i * 91) % 256, (i * 173) % 256]);
  const before = Uint8ClampedArray.from(img.data);
  LUMA.applyImageData(img, LUMA.DEFAULTS);
  let maxDiff = 0;
  for (let i = 0; i < before.length; i++) maxDiff = Math.max(maxDiff, Math.abs(before[i] - img.data[i]));
  assert.ok(maxDiff <= 2, `identity drift too large: ${maxDiff}`);
});

test('正曝光整体提亮，负曝光压暗', () => {
  const mk = () => fakeImage(8, 8, () => [128, 128, 128]);
  const bright = mk(), dark = mk();
  LUMA.applyImageData(bright, { exposure: 1 });
  LUMA.applyImageData(dark, { exposure: -1 });
  assert.ok(bright.data[0] > 160, `+1EV should brighten, got ${bright.data[0]}`);
  assert.ok(dark.data[0] < 100, `-1EV should darken, got ${dark.data[0]}`);
});

test('高色温偏暖（R 升 B 降），低色温偏冷', () => {
  const mk = () => fakeImage(4, 4, () => [170, 170, 170]);
  const warm = mk(), cool = mk();
  LUMA.applyImageData(warm, { temperature: 8000 });
  LUMA.applyImageData(cool, { temperature: 3200 });
  assert.ok(warm.data[0] > warm.data[2], 'warm: R > B');
  assert.ok(cool.data[2] > cool.data[0], 'cool: B > R');
});

test('正对比度拉开中灰与黑白差距', () => {
  const img = fakeImage(4, 4, () => [128, 128, 128]);
  LUMA.applyImageData(img, { contrast: 100 });
  // 对比度在 sRGB 空间围绕中灰 128 枢轴展开，中灰保持不变
  assert.ok(Math.abs(img.data[0] - 128) <= 1, 'mid-gray stays at pivot');
  const light = fakeImage(4, 4, () => [200, 200, 200]);
  LUMA.applyImageData(light, { contrast: 100 });
  assert.ok(light.data[0] >= 245, 'highlight pushed toward 255');
  const shade = fakeImage(4, 4, () => [60, 60, 60]);
  LUMA.applyImageData(shade, { contrast: 100 });
  assert.ok(shade.data[0] <= 12, 'shadow pushed toward 0');
});

test('分离色调只影响对应影调区域', () => {
  const shadow = fakeImage(2, 1, () => [24, 24, 24]);
  LUMA.applyImageData(shadow, { shadowHue: 220, shadowSat: 100 });
  assert.ok(shadow.data[2] > shadow.data[0], 'blue tint: B > R in shadow');
  const high = fakeImage(2, 1, () => [235, 235, 235]);
  LUMA.applyImageData(high, { highHue: 30, highSat: 100 });
  assert.ok(high.data[0] > high.data[2], 'amber tint: R > B in highlight');
});

test('三套预设互不相同且参数均合法', () => {
  assert.equal(LUMA.PRESETS.length, 3);
  const sig = LUMA.PRESETS.map((p) => JSON.stringify(p.params));
  assert.equal(new Set(sig).size, 3);
  for (const preset of LUMA.PRESETS) {
    const p = LUMA.normalizeParams(preset.params);
    assert.ok(p.exposure >= -2 && p.exposure <= 2);
    assert.ok(p.temperature >= 3200 && p.temperature <= 8000);
    assert.ok(p.contrast >= -100 && p.contrast <= 100);
    for (const k of ['shadowHue', 'highHue']) assert.ok(p[k] >= 0 && p[k] <= 360);
    for (const k of ['shadowSat', 'highSat']) assert.ok(p[k] >= 0 && p[k] <= 100);
  }
});

test('同底图下三预设输出两两不同，且全部像素在 0-255', () => {
  const frames = LUMA.PRESETS.map((preset) => {
    const img = fakeImage(24, 24, (i) => [(i * 37) % 256, (i * 91) % 256, (i * 173) % 256]);
    LUMA.applyImageData(img, preset.params);
    return Array.from(img.data);
  });
  for (let a = 0; a < 3; a++)
    for (let b = a + 1; b < 3; b++)
      assert.notDeepEqual(frames[a], frames[b]);
  for (const f of frames)
    for (const v of f) assert.ok(Number.isInteger(v) && v >= 0 && v <= 255);
});

test('直方图统计与像素总数一致', () => {
  const img = fakeImage(10, 10, (i) => [i * 8 % 256, i * 13 % 256, i * 21 % 256]);
  const h = LUMA.computeHistogram(img.data);
  const sum = (arr) => arr.reduce((a, b) => a + b, 0);
  assert.equal(sum(h.r), 100);
  assert.equal(sum(h.g), 100);
  assert.equal(sum(h.b), 100);
  assert.equal(sum(h.lum), 100);
});

test('结果确定性：相同参数两次处理完全一致', () => {
  const mk = () => fakeImage(12, 12, (i) => [(i * 37) % 256, (i * 91) % 256, (i * 173) % 256]);
  const a = mk(), b = mk();
  LUMA.applyImageData(a, LUMA.PRESETS[1].params);
  LUMA.applyImageData(b, LUMA.PRESETS[1].params);
  assert.deepEqual(Array.from(a.data), Array.from(b.data));
});
