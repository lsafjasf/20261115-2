import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateFacade } from '../src/layout.js';
import { buildScene } from '../src/scene.js';
import { checkFacade } from '../src/check.js';
import { renderSvg } from '../src/render-svg.js';
import { rasterize } from '../src/raster-node.js';

const PRESET_MATRIX = [
  { seed: 1, floors: 2, bays: 3, paneRatio: 1.0, sunshades: 'none', sign: 'none' },
  { seed: 7, floors: 4, bays: 6, paneRatio: 1.5, sunshades: 'some', sign: 'parapet' },
  { seed: 23, floors: 4, bays: 6, paneRatio: 1.5, sunshades: 'some', sign: 'parapet' },
  { seed: 99, floors: 6, bays: 8, paneRatio: 2.2, sunshades: 'all', sign: 'above-door' },
  { seed: 42, floors: 8, bays: 9, paneRatio: 0.8, sunshades: 'all', sign: 'side-wall' },
  { seed: 314, floors: 3, bays: 4, paneRatio: 1.8, sunshades: 'none', sign: 'parapet' }
];

for (const preset of PRESET_MATRIX) {
  test(`geometry checks pass for seed ${preset.seed}`, () => {
    const model = generateFacade(preset);
    const report = checkFacade(model);
    assert.deepEqual(report.violations, [], report.violations.join('; '));
    assert.equal(report.ok, true);
  });
}

test('different seeds change window count but keep the building outline', () => {
  const a = generateFacade({ seed: 7 });
  const b = generateFacade({ seed: 23 });
  assert.notEqual(a.windows.length, b.windows.length);
  assert.deepEqual(a.facade, b.facade);
  assert.deepEqual(a.canvas, b.canvas);
  assert.equal(a.columns.length, b.columns.length);
  assert.equal(a.beams.length, b.beams.length);
});

test('same seed is deterministic', () => {
  const a = generateFacade({ seed: 7 });
  const b = generateFacade({ seed: 7 });
  assert.deepEqual(a.windows, b.windows);
  assert.deepEqual(a.door, b.door);
});

test('no window intersects any column or beam', () => {
  for (const preset of PRESET_MATRIX) {
    const model = generateFacade(preset);
    for (const win of model.windows) {
      for (const member of [...model.columns, ...model.beams]) {
        assert.equal(intersects(win, member), false,
          `seed ${preset.seed}: window ${win.cellFloor}/${win.cellBay} hits a member`);
      }
    }
  }
});

test('ground-floor windows never cross the door opening', () => {
  for (const preset of PRESET_MATRIX) {
    const model = generateFacade(preset);
    const door = model.door;
    for (const win of model.windows.filter((w) => w.cellFloor === 0)) {
      assert.notEqual(win.cellBay, door.cellBay);
      assert.equal(intersects(win, door, 2), false);
      assert.ok(win.y + win.height <= model.groundLineY);
    }
    assert.ok(door.y + door.height <= model.groundLineY + 1);
  }
});

test('every window stays inside its structural cell', () => {
  const model = generateFacade({ seed: 23, floors: 5, bays: 7 });
  for (const win of model.windows) {
    const cell = model.cells.find((c) => c.floor === win.cellFloor && c.bay === win.cellBay);
    assert.ok(cell);
    assert.ok(win.x >= cell.x && win.y >= cell.y);
    assert.ok(win.x + win.width <= cell.x + cell.width);
    assert.ok(win.y + win.height <= cell.y + cell.height);
  }
});

test('sunshades never overlap columns', () => {
  const model = generateFacade({ seed: 99, sunshades: 'all' });
  for (const shade of model.sunshades) {
    for (const col of model.columns) {
      assert.equal(intersects(shade, col), false);
    }
  }
});

test('SVG export is well-formed and contains every window', () => {
  const model = generateFacade({ seed: 7 });
  const svg = renderSvg(buildScene(model), model.canvas);
  assert.match(svg, /^<\?xml/);
  assert.match(svg, new RegExp(`<svg[^>]*width="${model.canvas.width}"`));
  const rectCount = (svg.match(/<rect /g) || []).length;
  assert.ok(rectCount > model.windows.length * 2);
});

test('PNG export returns a valid encoded buffer at the requested scale', () => {
  const model = generateFacade({ seed: 7 });
  const png = rasterize(buildScene(model), model.canvas.width, model.canvas.height, 2);
  assert.deepEqual(png.subarray(0, 8), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  assert.deepEqual(png.subarray(12, 16), Buffer.from('IHDR'));
  assert.ok(png.length > 1000);
});

test('toggling sunshades and signs updates the model', () => {
  const bare = generateFacade({ seed: 7, sunshades: 'none', sign: 'none' });
  assert.equal(bare.sunshades.length, 0);
  assert.equal(bare.sign, null);
  const full = generateFacade({ seed: 7, sunshades: 'all', sign: 'above-door' });
  assert.equal(full.sunshades.length, full.windows.length);
  assert.equal(full.sign.kind, 'above-door');
});

function intersects(a, b, pad = 0) {
  return (
    a.x < b.x + b.width + pad &&
    a.x + a.width + pad > b.x &&
    a.y < b.y + b.height + pad &&
    a.y + a.height + pad > b.y
  );
}
