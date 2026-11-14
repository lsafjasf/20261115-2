const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { tokenizeParagraph, splitParagraphs } = require("../src/tokenizer");
const { breakParagraph } = require("../src/linebreaker");
const { layout, checkWidowsOrphans } = require("../src/layout");
const { createEstimateMeasurer } = require("../src/measurer");
const { toSvg } = require("../src/render");

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

const measurer = createEstimateMeasurer(15, 22);
const sample = fs.readFileSync(path.join(__dirname, "../assets/sample.txt"), "utf8");
const page = { contentX: 40, contentY: 40, contentWidth: 520, contentHeight: 720, columnCount: 3, gutter: 18 };

console.log("tokenizer:");
test("splits CJK chars and keeps latin words whole", () => {
  const toks = tokenizeParagraph("中文 word 123");
  assert.deepStrictEqual(toks.map((t) => t.kind), ["cjk", "cjk", "space", "word", "space", "word"]);
  assert.strictEqual(toks[3].text, "word");
});

test("marks kinsoku punctuation classes", () => {
  const toks = tokenizeParagraph("（测试）。");
  assert.strictEqual(toks[0].kinsoku, "open");
  assert.strictEqual(toks.at(-1).kinsoku, "close");
});

test("splits paragraphs on blank lines", () => {
  assert.strictEqual(splitParagraphs(sample).length >= 6, true);
});

console.log("line breaker:");
test("never places closing punctuation at line start", () => {
  const toks = tokenizeParagraph("行首禁则测试，闭合标点。不能出现在一行的开头位置啊");
  const r = breakParagraph(toks, () => 60, measurer);
  for (const line of r.lines) {
    const first = line.tokens[0];
    assert.ok(!(first.kind === "punct" && first.kinsoku === "close"), `bad start: ${first.text}`);
  }
});

test("never places opening punctuation at line end", () => {
  const toks = tokenizeParagraph("开放标点（如括号）不能出现在一行的结尾位置上哦真的");
  const r = breakParagraph(toks, () => 75, measurer);
  for (const line of r.lines) {
    const last = line.tokens.at(-1);
    assert.ok(!(last.kind === "punct" && last.kinsoku === "open"), `bad end: ${last.text}`);
  }
});

test("reports overrun when an unbreakable word exceeds width", () => {
  const toks = tokenizeParagraph("supercalifragilistic");
  const r = breakParagraph(toks, () => 40, measurer);
  assert.ok(r.diagnostics.some((d) => d.type === "overrun" && d.by > 0));
});

test("fits normal mixed text without diagnostics", () => {
  const toks = tokenizeParagraph("中英混排 mixed layout 自动断行测试。");
  const r = breakParagraph(toks, () => 200, measurer);
  assert.strictEqual(r.diagnostics.length, 0);
});

console.log("layout engine:");
const shapes = [
  { kind: "rect", x: 120, y: 120, width: 140, height: 110, name: "photo" },
  { kind: "ellipse", x: 420, y: 360, width: 120, height: 120, name: "badge" },
];

test("flows text into all columns", () => {
  const r = layout(sample, { page, shapes, measurer, paragraphGap: 10, wrapPadding: 8 });
  const cols = new Set(r.lines.map((l) => l.columnIndex));
  assert.ok(cols.size >= 2, `expected multi-column flow, got ${cols.size}`);
});

test("lines narrow their available width inside a shape band", () => {
  const r = layout(sample, { page, shapes, measurer, paragraphGap: 10, wrapPadding: 8 });
  const occluded = r.lines.filter(
    (l) => l.columnIndex === 0 && l.y >= 120 && l.y < 230
  );
  assert.ok(occluded.length > 0);
  assert.ok(occluded.every((l) => l.available < r.columns[0].width - 1));
});

test("no flow line geometrically overlaps any shape", () => {
  const { pointInShape } = require("../src/geometry");
  const r = layout(sample, { page, shapes, measurer, paragraphGap: 10, wrapPadding: 8 });
  for (const line of r.lines) {
    for (const shape of r.shapes) {
      const midY = line.y + 11;
      assert.ok(
        !pointInShape(shape, line.x + 2, midY),
        `line at ${line.x},${line.y} hits ${shape.name}`
      );
    }
  }
});

test("pinned paragraph keeps identical position across re-layouts", () => {
  const pins = { 1: { colIndex: 2, dx: 6, dy: 40, width: 150 } };
  const r1 = layout(sample, { page, shapes, measurer, pins, paragraphGap: 10, wrapPadding: 8 });
  const changedShapes = [{ kind: "rect", x: 60, y: 220, width: 120, height: 170 }];
  const r2 = layout(sample, { page, shapes: changedShapes, measurer, pins, paragraphGap: 10, wrapPadding: 8 });
  const pick = (r) =>
    r.lines
      .filter((l) => l.paragraphId === 1)
      .map((l) => `${l.x}|${l.y}|${l.tokens.map((t) => t.text).join("")}`);
  assert.deepStrictEqual(pick(r1), pick(r2));
});

test("other paragraphs do move when shapes change", () => {
  const pins = { 1: { colIndex: 2, dx: 6, dy: 40, width: 150 } };
  const r1 = layout(sample, { page, shapes, measurer, pins, paragraphGap: 10, wrapPadding: 8 });
  const r2 = layout(
    sample,
    { page, shapes: [{ kind: "rect", x: 60, y: 220, width: 120, height: 170 }], measurer, pins, paragraphGap: 10, wrapPadding: 8 }
  );
  const sig = (r, id) => r.lines.filter((l) => l.paragraphId === id).map((l) => `${l.x},${l.y}`).join(";");
  assert.notStrictEqual(sig(r1, 2), sig(r2, 2));
});

test("pinned box becomes an exclusion for surrounding flow", () => {
  const pins = { 3: { colIndex: 1, dx: 10, dy: 60, width: 140 } };
  const r = layout(sample, { page, shapes: [], measurer, pins, paragraphGap: 10, wrapPadding: 8 });
  assert.strictEqual(r.pinnedBoxes.length, 1);
  assert.ok(r.exclusions.some((e) => e.source === "pin"));
});

test("detects page overflow on an undersized page", () => {
  const tiny = { contentX: 20, contentY: 20, contentWidth: 300, contentHeight: 200, columnCount: 2, gutter: 12 };
  const r = layout(sample, { page: tiny, shapes: [], measurer, paragraphGap: 8 });
  assert.ok(r.diagnostics.some((d) => d.type === "page-overflow"));
});

test("widow/orphan detector flags stranded single lines", () => {
  const paragraphs = [{ id: 0 }, { id: 1 }];
  const lines = [
    { paragraphId: 0, columnIndex: 0 }, { paragraphId: 0, columnIndex: 1 }, { paragraphId: 0, columnIndex: 1 },
    { paragraphId: 1, columnIndex: 0 }, { paragraphId: 1, columnIndex: 0 }, { paragraphId: 1, columnIndex: 1 },
  ];
  const issues = checkWidowsOrphans(paragraphs, lines);
  assert.ok(issues.some((d) => d.type === "orphan"));
  assert.ok(issues.some((d) => d.type === "widow"));
});

test("emits well-formed SVG containing every line", () => {
  const r = layout(sample, { page, shapes, measurer, paragraphGap: 10, wrapPadding: 8 });
  const svg = toSvg(r, page, {
    fontSize: 15,
    fontFamily: "'Noto Sans SC', sans-serif",
    pageWidth: 600,
    pageHeight: 800,
    measurer,
  });
  assert.ok(svg.startsWith("<svg"));
  assert.ok(svg.endsWith("</svg>"));
  const textCount = (svg.match(/<text /g) || []).length;
  const tokenCount = r.lines.reduce((sum, l) => sum + l.tokens.length, 0);
  assert.strictEqual(textCount, tokenCount);
});

console.log(`\n${passed} tests passed`);
