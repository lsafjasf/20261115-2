(function(){
// Page/column geometry and shape exclusions.
//
// Coordinate space: page content box, origin at its top-left.
// Shape kinds: rect | ellipse. Each shape is absolute on the page.

function buildColumns(page) {
  const cols = [];
  const usable =
    page.contentWidth - page.gutter * (page.columnCount - 1);
  const columnWidth = usable / page.columnCount;
  for (let i = 0; i < page.columnCount; i++) {
    cols.push({
      index: i,
      x: page.contentX + i * (columnWidth + page.gutter),
      y: page.contentY,
      width: columnWidth,
      height: page.contentHeight,
    });
  }
  return cols;
}

// Horizontal intersection of a shape with a column at a given vertical band.
// Returns the un-occluded horizontal segments (at most two).
function shapeOcclusion(shape, col, yTop, yBottom, padding = 0) {
  const sx = shape.x - padding;
  const sy = shape.y - padding;
  const sw = shape.width + padding * 2;
  const sh = shape.height + padding * 2;
  if (
    yBottom <= sy ||
    yTop >= sy + sh ||
    col.x + col.width <= sx ||
    col.x >= sx + sw
  ) {
    return null;
  }
  let left = shape.x;
  let right = shape.x + shape.width;
  if (shape.kind === "ellipse") {
    const cy = sy + sh / 2;
    const ry = sh / 2;
    const midY = (yTop + yBottom) / 2;
    const dy = Math.min(Math.abs(midY - cy), ry);
    const k = Math.sqrt(Math.max(0, 1 - (dy * dy) / (ry * ry)));
    const half = (sw / 2) * k;
    const cx = sx + sw / 2;
    left = cx - half;
    right = cx + half;
  } else {
    left = sx;
    right = sx + sw;
  }
  const oLeft = Math.max(left, col.x);
  const oRight = Math.min(right, col.x + col.width);
  if (oRight <= oLeft) return null;
  return { left: oLeft, right: oRight };
}

// Usable horizontal segments inside a column for one text line box.
// When a shape splits a column we keep the wider side (documented trade-off,
// matches many single-threaded magazine flow engines).
function usableSegments(shapeList, col, yTop, yBottom, padding = 0) {
  let segments = [{ left: col.x, right: col.x + col.width }];
  for (const shape of shapeList) {
    const occ = shapeOcclusion(shape, col, yTop, yBottom, padding);
    if (!occ) continue;
    const next = [];
    for (const seg of segments) {
      if (occ.right <= seg.left || occ.left >= seg.right) {
        next.push(seg);
        continue;
      }
      const a = { left: seg.left, right: Math.min(seg.right, occ.left) };
      const b = { left: Math.max(seg.left, occ.right), right: seg.right };
      const wa = a.right - a.left;
      const wb = b.right - b.left;
      if (wa >= wb && wa > 0) next.push(a);
      else if (wb > 0) next.push(b);
      else if (wa > 0) next.push(a);
    }
    segments = next;
  }
  return segments.filter((s) => s.right - s.left > 0.5);
}

function pointInShape(shape, x, y) {
  if (x < shape.x || x > shape.x + shape.width || y < shape.y || y > shape.y + shape.height) {
    return false;
  }
  if (shape.kind === "rect") return true;
  const nx = (x - (shape.x + shape.width / 2)) / (shape.width / 2);
  const ny = (y - (shape.y + shape.height / 2)) / (shape.height / 2);
  return nx * nx + ny * ny <= 1;
}

const api = { buildColumns, shapeOcclusion, usableSegments, pointInShape };
if (typeof module !== "undefined" && module.exports) module.exports = api;
if (typeof window !== "undefined") window.TypesetterGeometry = api;

})();
