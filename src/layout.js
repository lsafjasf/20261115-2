(function(){
// Column flow engine: shapes, pinning, widow/orphan and overflow checks.

const tokenizerApi = typeof require !== "undefined" ? require("./tokenizer") : window.TypesetterTokenizer;
const breakerApi = typeof require !== "undefined" ? require("./linebreaker") : window.TypesetterLinebreaker;
const geometryApi = typeof require !== "undefined" ? require("./geometry") : window.TypesetterGeometry;
const { tokenizeParagraph, splitParagraphs } = tokenizerApi;
const { breakParagraph, isBreakableBefore, lineWidthOf, trimSpaces } = breakerApi;
const { buildColumns, usableSegments, pointInShape } = geometryApi;

function createDocument(rawText, options) {
  const paragraphs = splitParagraphs(rawText).map((text, index) => ({
    id: index,
    text,
    tokens: tokenizeParagraph(text),
    pinned: null, // {colIndex, x, y, width, height} when fixed
  }));
  return paragraphs;
}

// Build the full exclusion list: user shapes + pinned paragraph boxes.
function buildExclusions(shapes, paragraphs, cols) {
  const list = shapes.map((s) => ({ ...s, source: "shape" }));
  for (const p of paragraphs) {
    if (!p.pinned) continue;
    const col = cols[p.pinned.colIndex];
    const box = {
      kind: "rect",
      x: col.x + p.pinned.dx,
      y: col.y + p.pinned.dy,
      width: p.pinned.width,
      height: p.pinned.height,
      source: "pin",
      paragraphId: p.id,
    };
    p.pinned.box = box;
    list.push(box);
  }
  return list;
}

function lineSegmentsAt(exclusions, col, yTop, lineHeight, padding) {
  return usableSegments(exclusions, col, yTop, yTop + lineHeight, padding || 0);
}

// Find the next line box at/after y whose widest segment can accept content,
// skipping rows fully covered by exclusions.
function nextLineBox(col, y, exclusions, lh, padding) {
  let cursor = y;
  while (cursor + lh <= col.y + col.height + 0.5) {
    const segs = lineSegmentsAt(exclusions, col, cursor, lh, padding);
    if (segs.length) return { y: cursor, segs };
    cursor += lh;
  }
  return null;
}

// Greedily consume tokens into one line of the given width, honoring kinsoku.
function fillLine(tokens, start, availableWidth, measurer) {
  let end = start;
  let bestBreak = -1;
  let firstContent = start;
  while (firstContent < tokens.length && tokens[firstContent].kind === "space") firstContent++;

  while (end < tokens.length) {
    const [ts, te] = trimSpaces(tokens, start, end + 1);
    const width = lineWidthOf(tokens, ts, te, measurer);
    if (width <= availableWidth) {
      end++;
      if (end < tokens.length && isBreakableBefore(tokens[end], tokens[end - 1])) {
        bestBreak = end;
      }
      continue;
    }
    break;
  }
  if (end >= tokens.length) {
    const [ts, te] = trimSpaces(tokens, start, tokens.length);
    return { end: tokens.length, tokens: tokens.slice(ts, te), overrun: false };
  }
  if (bestBreak > start) end = bestBreak;
  else end = start + 1; // unbreakable unit: force it and flag overrun

  let [ls, le] = trimSpaces(tokens, start, end);

  // Kinsoku push-out: opening/middle punctuation must not end a line. If the
  // first content token itself is such a mark and nothing else fits, leave the
  // whole line to start at that token on the next line box.
  if (
    le - ls === 1 &&
    tokens[ls].kind === "punct" &&
    (tokens[ls].kinsoku === "open" || tokens[ls].kinsoku === "middle")
  ) {
    return { end: ls, tokens: [], defer: true };
  }
  while (le - ls > 1) {
    const tail = tokens[le - 1];
    if (tail.kind === "punct" && (tail.kinsoku === "open" || tail.kinsoku === "middle")) {
      le -= 1;
    } else break;
  }

  // Kinsoku pull-in: closing/middle punctuation must never start the next
  // line. Pull it onto this line even if slightly over width.
  if (end < tokens.length) {
    const nextTok = tokens[end];
    if (nextTok.kind === "punct" && (nextTok.kinsoku === "close" || nextTok.kinsoku === "middle")) {
      le += 1;
    }
  }
  const lineTokens = tokens.slice(ls, le);
  const width = lineWidthOf(tokens, ls, le, measurer);
  return { end: le, tokens: lineTokens, overrun: width > availableWidth + 0.5, width: Math.round(width) };
}

// Line-by-line flow: recompute usable width at every real line position so
// shape-induced vertical skips are handled correctly.
function flowParagraph(para, col, startY, exclusions, measurer, padding) {
  const lh = measurer.metrics().lineHeight;
  const placed = [];
  const diagnostics = [];
  let cursor = startY;
  let tokenCursor = 0;
  const tokens = para.tokens;

  while (tokenCursor < tokens.length) {
    const box = nextLineBox(col, cursor, exclusions, lh, padding);
    if (!box) {
      return { complete: false, placed, nextY: col.y + col.height, lineDiagnostics: diagnostics };
    }
    const seg = box.segs.sort((a, b) => (b.right - b.left) - (a.right - a.left))[0];
    const available = seg.right - seg.left;
    const filled = fillLine(tokens, tokenCursor, available, measurer);
    if (filled.defer) {
      cursor = box.y + lh;
      continue;
    }
    const realWidth = lineWidthOf(filled.tokens, 0, filled.tokens.length, measurer);
    if (filled.overrun) {
      diagnostics.push({
        type: "overrun",
        line: placed.length,
        width: Math.round(realWidth),
        available: Math.round(available),
        by: Math.round(realWidth - available),
      });
    }
    const first = filled.tokens[0];
    const last = filled.tokens[filled.tokens.length - 1];
    if (first && first.kind === "punct" && (first.kinsoku === "close" || first.kinsoku === "middle")) {
      diagnostics.push({ type: "kinsoku-line-start", line: placed.length, char: first.text });
    }
    if (last && last.kind === "punct" && (last.kinsoku === "open" || last.kinsoku === "middle")) {
      diagnostics.push({ type: "kinsoku-line-end", line: placed.length, char: last.text });
    }
    placed.push({
      paragraphId: para.id,
      x: seg.left,
      y: box.y,
      width: Math.round(realWidth),
      available: Math.round(available),
      tokens: filled.tokens,
      segment: seg,
    });
    tokenCursor = filled.end;
    cursor = box.y + lh;
  }
  return { complete: true, placed, nextY: cursor, lineDiagnostics: diagnostics };
}

function checkWidowsOrphans(paragraphs, placedLines) {
  const issues = [];
  const byPara = new Map();
  for (const ln of placedLines) {
    if (!byPara.has(ln.paragraphId)) byPara.set(ln.paragraphId, []);
    byPara.get(ln.paragraphId).push(ln);
  }
  for (const [pid, lines] of byPara) {
    const para = paragraphs[pid];
    if (lines.length === 1) continue;
    const colOf = (l) => l.columnIndex;
    const firstCol = colOf(lines[0]);
    const lastCol = colOf(lines[lines.length - 1]);
    // orphan: first line alone in its column
    const firstGroup = lines.filter((l) => colOf(l) === firstCol);
    if (firstGroup.length === 1 && lines.length > 1) {
      issues.push({ type: "orphan", paragraphId: pid, line: 0 });
    }
    // widow: last line alone in its column
    const lastGroup = lines.filter((l) => colOf(l) === lastCol);
    if (lastGroup.length === 1 && lines.length > 1 && firstCol !== lastCol) {
      issues.push({ type: "widow", paragraphId: pid, line: lines.length - 1 });
    }
  }
  return issues;
}

function layout(rawText, options) {
  const {
    page,
    shapes = [],
    measurer,
    pins = {}, // { [paragraphId]: { colIndex, dx, dy } }
    paragraphGap = 10,
    wrapPadding = 0,
  } = options;
  layoutOptions = { wrapPadding };

  const paragraphs = createDocument(rawText, options);
  const cols = buildColumns(page);
  Object.entries(pins).forEach(([pid, pin]) => {
    const para = paragraphs[Number(pid)];
    const lh = measurer.metrics().lineHeight;
    const col = cols[pin.colIndex];
    const width = pin.width || col.width;
    const height = pin.height || lh * 2;
    para.pinned = { colIndex: pin.colIndex, dx: pin.dx || 0, dy: pin.dy || 0, width, height };
  });

  const exclusions = buildExclusions(shapes, paragraphs, cols);
  const diagnostics = [];
  const placedLines = [];
  const pinnedBoxes = [];

  // 1) Place pinned paragraphs (re-break inside their own fixed width).
  for (const para of paragraphs) {
    if (!para.pinned) continue;
    const pin = para.pinned;
    const col = cols[pin.colIndex];
    const x0 = col.x + pin.dx;
    const widthFn = () => pin.width;
    const { lines, diagnostics: ld } = breakParagraph(para.tokens, widthFn, measurer);
    ld.forEach((d) => diagnostics.push({ ...d, paragraphId: para.id, scope: "pinned" }));
    const lh = measurer.metrics().lineHeight;
    lines.forEach((line, i) => {
      placedLines.push({
        paragraphId: para.id,
        x: x0,
        y: col.y + pin.dy + i * lh,
        width: line.width,
        available: pin.width,
        tokens: line.tokens,
        columnIndex: pin.colIndex,
        pinned: true,
        segment: { left: x0, right: x0 + pin.width },
      });
    });
    pin.height = lines.length * lh;
    pin.box = {
      kind: "rect",
      x: x0,
      y: col.y + pin.dy,
      width: pin.width,
      height: pin.height,
      source: "pin",
      paragraphId: para.id,
    };
    pinnedBoxes.push(pin.box);
  }

  // Rebuild exclusions now that pinned heights are known.
  const allExclusions = buildExclusions(shapes, paragraphs, cols);

  // 2) Flow the remaining paragraphs across columns.
  const lhFlow = measurer.metrics().lineHeight;
  let colIndex = 0;
  let cursorY = cols[0].y;
  for (const para of paragraphs) {
    if (para.pinned) continue;
    let remaining = true;
    while (remaining) {
      if (colIndex >= cols.length) {
        diagnostics.push({ type: "page-overflow", paragraphId: para.id });
        remaining = false;
        break;
      }
      const col = cols[colIndex];
      cursorY = Math.max(cursorY, col.y);

      // Orphan guard: if fewer than two line boxes remain in this column,
      // push the whole paragraph to the next column instead of stranding
      // a single first line here.
      const room = Math.floor((col.y + col.height - cursorY) / lhFlow);
      if (room < 2 && colIndex + 1 < cols.length) {
        colIndex += 1;
        cursorY = cols[colIndex].y;
        continue;
      }

      const result = flowParagraph(para, col, cursorY, allExclusions, measurer, wrapPadding);
      result.placed.forEach((l) => {
        l.columnIndex = colIndex;
        placedLines.push(l);
      });
      result.lineDiagnostics.forEach((d) =>
        diagnostics.push({ ...d, paragraphId: para.id, scope: "flow" })
      );
      cursorY = result.nextY + (result.complete ? paragraphGap : 0);
      if (result.complete) {
        remaining = false;
      } else {
        colIndex += 1;
        cursorY = colIndex < cols.length ? cols[colIndex].y : 0;
      }
    }
  }

  // 3) Geometry checks: any flow line overlapping a shape or pin box.
  for (const line of placedLines) {
    if (line.pinned) continue;
    for (const shape of allExclusions) {
      const midY = line.y + measurer.metrics().lineHeight / 2;
      if (pointInShape(shape, line.x + Math.min(4, line.width), midY)) {
        diagnostics.push({
          type: "shape-collision",
          paragraphId: line.paragraphId,
          shape: shape.source,
        });
      }
    }
  }

  // 4) Widow / orphan check.
  checkWidowsOrphans(paragraphs, placedLines).forEach((d) => diagnostics.push(d));

  // 5) Content outside content box.
  const lh = measurer.metrics().lineHeight;
  for (const line of placedLines) {
    if (line.y + lh > page.contentY + page.contentHeight + 0.5) {
      diagnostics.push({ type: "out-of-frame", paragraphId: line.paragraphId, y: Math.round(line.y) });
    }
  }

  return {
    columns: cols,
    paragraphs,
    lines: placedLines,
    shapes,
    exclusions: allExclusions,
    pinnedBoxes,
    diagnostics,
  };
}

const api = { layout, createDocument, buildExclusions, checkWidowsOrphans };
if (typeof module !== "undefined" && module.exports) module.exports = api;
if (typeof window !== "undefined") window.TypesetterLayout = api;

})();
