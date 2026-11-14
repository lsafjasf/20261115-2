const test = require("node:test");
const assert = require("node:assert/strict");
const G = require("../grid-core.js");

const base = { width: 1080, height: 1350, gutter: 24, safeMargin: 64, baseline: 18 };
const three = G.computeGrid({ ...base, columns: 3 });
const four = G.computeGrid({ ...base, columns: 4 });

test("three and four column grids use the same safe content width", () => {
  assert.equal(three.contentWidth, 952);
  assert.equal(four.contentWidth, 952);
  assert.equal(three.columnRects.length, 3);
  assert.equal(four.columnRects.length, 4);
  assert.ok(Math.abs(three.columnRects[2].right - four.contentRight) < 0.001);
  assert.ok(Math.abs(three.columnRects[0].width - (952 - 48) / 3) < 0.001);
  assert.ok(Math.abs(four.columnRects[0].width - (952 - 72) / 4) < 0.001);
});

test("snapBox aligns position, width and height to anchors", () => {
  const box = G.snapBox({ x: 92, y: 99, width: 601, height: 501 }, three);
  assert.ok(three.xAnchors.includes(box.x));
  assert.ok(three.xAnchors.includes(box.x + box.width));
  assert.ok(three.yAnchors.includes(box.y));
  assert.equal(box.height % three.baseline, 0);
});

test("switching three to four columns remaps spans without changing content", () => {
  const elements = [
    { id: "title", type: "text", text: "周六\n引力场", ...G.rectForSpan(0, 3, three), height: 252 },
    { id: "image", type: "image", src: "./art.svg", ...G.rectForSpan(0, 2, three), height: 504 },
    { id: "aside", type: "text", text: "把周末变成一场引力实验。", ...G.rectForSpan(2, 1, three), height: 504 }
  ];
  const remapped = G.remapElements(elements, three, four);
  const title = G.inferSpan(remapped[0], four);
  const image = G.inferSpan(remapped[1], four);
  const aside = G.inferSpan(remapped[2], four);

  assert.deepEqual(title, { start: 0, span: 4 });
  assert.deepEqual(image, { start: 0, span: 3 });
  assert.deepEqual(aside, { start: 3, span: 1 });
  assert.deepEqual(
    remapped.map(({ id, type, text, src }) => ({ id, type, text, src })),
    elements.map(({ id, type, text, src }) => ({ id, type, text, src }))
  );
  remapped.forEach((element) => {
    assert.ok(four.xAnchors.includes(element.x));
    assert.ok(four.xAnchors.includes(element.x + element.width));
    assert.ok(four.yAnchors.includes(element.y));
  });
});

test("round-tripping the grid restores proportional column spans", () => {
  const element = {
    id: "image",
    type: "image",
    src: "art.svg",
    ...G.rectForSpan(0, 2, three),
    height: 504
  };
  const onFour = G.remapBox(element, three, four);
  const backOnThree = G.remapBox(onFour, four, three);
  assert.deepEqual(G.inferSpan(backOnThree, three), { start: 0, span: 2 });
  assert.equal(backOnThree.src, element.src);
});

test("safe-margin detection reports every overflow side", () => {
  const box = { x: 30, y: 20, width: 1100, height: 1400 };
  const sides = G.overflowSides(box, three.safeRect);
  assert.deepEqual(sides, { left: true, top: true, right: true, bottom: true });
  assert.equal(G.isInsideSafe({ x: 64, y: 64, width: 952, height: 1222 }, three.safeRect), true);
  assert.deepEqual(G.describeOverflow(box, three.safeRect), ["左侧", "右侧", "顶部", "底部"]);
});
