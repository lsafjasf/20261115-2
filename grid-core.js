(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.PosterGrid = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function uniqueSorted(values) {
    return [...new Set(values.map((value) => Math.round(value * 1000) / 1000))].sort(
      (a, b) => a - b
    );
  }

  function nearest(value, anchors) {
    if (!anchors.length) return value;
    return anchors.reduce((best, anchor) =>
      Math.abs(anchor - value) < Math.abs(best - value) ? anchor : best
    );
  }

  function computeGrid(config) {
    const width = Number(config.width) || 1080;
    const height = Number(config.height) || 1350;
    const columns = clamp(Math.round(Number(config.columns) || 3), 1, 12);
    const gutter = clamp(Number(config.gutter) || 0, 0, width / 4);
    const safeMargin = clamp(Number(config.safeMargin) || 0, 0, Math.min(width, height) / 3);
    const baseline = clamp(Number(config.baseline) || 8, 2, height / 4);
    const contentLeft = safeMargin;
    const contentTop = safeMargin;
    const contentRight = width - safeMargin;
    const contentBottom = height - safeMargin;
    const contentWidth = contentRight - contentLeft;
    const columnWidth = Math.max(1, (contentWidth - gutter * (columns - 1)) / columns);

    const columnRects = Array.from({ length: columns }, (_, index) => {
      const x = contentLeft + index * (columnWidth + gutter);
      return {
        index,
        x: Math.round(x * 1000) / 1000,
        y: contentTop,
        width: Math.round(columnWidth * 1000) / 1000,
        height: contentBottom - contentTop,
        right: Math.round((x + columnWidth) * 1000) / 1000
      };
    });

    const xAnchors = uniqueSorted(
      columnRects.flatMap((rect) => [rect.x, rect.right]).concat([contentRight])
    );

    const yAnchors = [contentTop];
    for (let y = contentTop + baseline; y < contentBottom - 0.5; y += baseline) {
      yAnchors.push(Math.round(y * 1000) / 1000);
    }
    yAnchors.push(contentBottom);

    const baselineLines = [];
    for (let index = 0; contentTop + index * baseline <= contentBottom + 0.01; index += 1) {
      baselineLines.push(Math.round((contentTop + index * baseline) * 1000) / 1000);
    }

    return {
      width,
      height,
      columns,
      gutter,
      baseline,
      safeMargin,
      contentLeft,
      contentTop,
      contentRight,
      contentBottom,
      contentWidth,
      columnWidth,
      columnRects,
      xAnchors,
      yAnchors,
      baselineLines,
      safeRect: {
        x: contentLeft,
        y: contentTop,
        width: contentWidth,
        height: contentBottom - contentTop
      }
    };
  }

  function rectForSpan(startIndex, span, grid) {
    const start = clamp(Math.round(startIndex), 0, grid.columns - 1);
    const count = clamp(Math.round(span), 1, grid.columns - start);
    const first = grid.columnRects[start];
    const last = grid.columnRects[start + count - 1];
    return {
      x: first.x,
      y: grid.contentTop,
      width: last.right - first.x,
      height: grid.contentBottom - grid.contentTop,
      start,
      span: count
    };
  }

  function columnAtX(x, grid) {
    let bestIndex = 0;
    let bestDistance = Infinity;
    grid.columnRects.forEach((rect) => {
      const distance = Math.abs(x - rect.x);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = rect.index;
      }
    });
    return bestIndex;
  }

  function spanForWidth(width, grid) {
    let bestSpan = 1;
    let bestDistance = Infinity;
    for (let span = 1; span <= grid.columns; span += 1) {
      const candidate = rectForSpan(0, span, grid).width;
      const distance = Math.abs(candidate - width);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestSpan = span;
      }
    }
    return bestSpan;
  }

  function snapY(y, grid) {
    return nearest(y, grid.yAnchors);
  }

  function snapHeight(height, grid) {
    const steps = Math.max(1, Math.round(height / grid.baseline));
    return steps * grid.baseline;
  }

  function snapBox(box, grid, options) {
    const settings = options || {};
    const start = columnAtX(box.x, grid);
    const requestedSpan = spanForWidth(box.width, grid);
    const span = clamp(requestedSpan, 1, grid.columns - start);
    const area = rectForSpan(start, span, grid);
    return {
      ...box,
      x: area.x,
      y: snapY(box.y, grid),
      width: Math.round(area.width * 1000) / 1000,
      height: Math.max(
        settings.minHeight || grid.baseline,
        snapHeight(box.height, grid)
      )
    };
  }

  function inferSpan(box, grid) {
    const start = columnAtX(box.x, grid);
    const span = clamp(spanForWidth(box.width, grid), 1, grid.columns - start);
    return { start, span };
  }

  function remapBox(box, oldGrid, newGrid) {
    const source = inferSpan(box, oldGrid);
    const startRatio = oldGrid.columns > 1 ? source.start / (oldGrid.columns - 1) : 0;
    const spanRatio = source.span / oldGrid.columns;
    let start = clamp(
      Math.round(startRatio * (newGrid.columns - 1)),
      0,
      newGrid.columns - 1
    );
    let span = clamp(Math.round(spanRatio * newGrid.columns), 1, newGrid.columns - start);

    if (source.start === 0 && source.span === oldGrid.columns) {
      start = 0;
      span = newGrid.columns;
    }

    const area = rectForSpan(start, span, newGrid);
    const topRatio = Math.max(0, box.y - oldGrid.contentTop) / Math.max(1, oldGrid.contentHeight || oldGrid.contentBottom - oldGrid.contentTop);
    const proportionalTop =
      newGrid.contentTop + topRatio * (newGrid.contentBottom - newGrid.contentTop);
    const y = snapY(proportionalTop, newGrid);
    const height = Math.max(newGrid.baseline, snapHeight(box.height, newGrid));

    return {
      ...box,
      x: area.x,
      y,
      width: Math.round(area.width * 1000) / 1000,
      height
    };
  }

  function remapElements(elements, oldGrid, newGrid) {
    return elements.map((element) => remapBox(element, oldGrid, newGrid));
  }

  function overflowSides(box, safeRect, tolerance) {
    const epsilon = Number(tolerance) || 0.5;
    return {
      left: box.x < safeRect.x - epsilon,
      top: box.y < safeRect.y - epsilon,
      right: box.x + box.width > safeRect.x + safeRect.width + epsilon,
      bottom: box.y + box.height > safeRect.y + safeRect.height + epsilon
    };
  }

  function isInsideSafe(box, safeRect, tolerance) {
    const sides = overflowSides(box, safeRect, tolerance);
    return !sides.left && !sides.top && !sides.right && !sides.bottom;
  }

  function describeOverflow(box, safeRect) {
    const sides = overflowSides(box, safeRect);
    const labels = [];
    if (sides.left) labels.push("左侧");
    if (sides.right) labels.push("右侧");
    if (sides.top) labels.push("顶部");
    if (sides.bottom) labels.push("底部");
    return labels;
  }

  function formatGridSummary(grid) {
    const width = Math.round(grid.columnWidth * 10) / 10;
    return `${grid.columns} 栏 · ${grid.gutter}px 栏距 · 单栏 ${width}px`;
  }

  function serializeGrid(grid) {
    return {
      width: grid.width,
      height: grid.height,
      columns: grid.columns,
      gutter: grid.gutter,
      baseline: grid.baseline,
      safeMargin: grid.safeMargin,
      contentRect: { ...grid.safeRect },
      columnRects: grid.columnRects.map((rect) => ({
        index: rect.index,
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height
      })),
      xAnchors: [...grid.xAnchors],
      yAnchors: [...grid.yAnchors]
    };
  }

  return {
    clamp,
    nearest,
    computeGrid,
    rectForSpan,
    columnAtX,
    spanForWidth,
    snapY,
    snapHeight,
    snapBox,
    inferSpan,
    remapBox,
    remapElements,
    overflowSides,
    isInsideSafe,
    describeOverflow,
    formatGridSummary,
    serializeGrid
  };
});
