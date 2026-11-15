import { useCallback, useEffect, useRef, useState } from 'react';
import { MASTER, SEAM_THRESHOLD, TILE_SIZE, TILES } from './terrain.js';
import {
  localToWorld,
  normalizeAngle,
  paintComposition,
  pointInsideTile,
  tileCorners,
  worldToLocal,
} from './stitching.js';

const STAGE = { width: MASTER.width + 120, height: MASTER.height + 110 };
const HIT_RADIUS = 17;

function pathPoints(ctx, points, scale, offset) {
  points.forEach((point, index) => {
    const x = point.x * scale + offset.x;
    const y = point.y * scale + offset.y;
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
}

function roundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
}

function verticalSpan(points, x) {
  const ys = [];
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    if ((a.x <= x && b.x >= x) || (b.x <= x && a.x >= x)) {
      if (Math.abs(b.x - a.x) < 0.0001) {
        ys.push(a.y, b.y);
      } else {
        const t = (x - a.x) / (b.x - a.x);
        ys.push(a.y + (b.y - a.y) * t);
      }
    }
  }
  return ys.length ? [Math.min(...ys), Math.max(...ys)] : null;
}

function drawStageGrid(ctx, scale, offset, cssWidth, cssHeight, zoom) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const background = ctx.createRadialGradient(
    cssWidth * 0.46,
    cssHeight * 0.4,
    20,
    cssWidth * 0.5,
    cssHeight * 0.5,
    cssWidth * 0.78,
  );
  background.addColorStop(0, '#122224');
  background.addColorStop(0.62, '#0d181a');
  background.addColorStop(1, '#091214');
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, cssWidth, cssHeight);

  ctx.strokeStyle = 'rgba(140, 180, 174, 0.09)';
  ctx.lineWidth = 1;
  for (let x = 0; x <= STAGE.width; x += 40) {
    const px = x * scale + offset.x;
    ctx.beginPath();
    ctx.moveTo(px, 0);
    ctx.lineTo(px, cssHeight);
    ctx.stroke();
  }
  for (let y = 0; y <= STAGE.height; y += 40) {
    const py = y * scale + offset.y;
    ctx.beginPath();
    ctx.moveTo(0, py);
    ctx.lineTo(cssWidth, py);
    ctx.stroke();
  }

  ctx.strokeStyle = 'rgba(220, 236, 229, 0.2)';
  ctx.lineWidth = 1;
  for (let x = 0; x <= STAGE.width; x += 160) {
    const px = x * scale + offset.x;
    ctx.beginPath();
    ctx.moveTo(px, 0);
    ctx.lineTo(px, 12);
    ctx.stroke();
  }
  for (let y = 0; y <= STAGE.height; y += 160) {
    const py = y * scale + offset.y;
    ctx.beginPath();
    ctx.moveTo(0, py);
    ctx.lineTo(12, py);
    ctx.stroke();
  }

  ctx.fillStyle = 'rgba(188, 212, 202, 0.34)';
  ctx.font = '500 9px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.fillText(`FIELD GRID / ${Math.round(zoom * 100)}%`, 17, cssHeight - 15);
}

function drawTileOverlays(ctx, states, selectedId, scale, offset, metrics) {
  const badPairs = new Set(
    metrics.pairs.filter((pair) => pair.error > SEAM_THRESHOLD).map((pair) => pair.label),
  );

  metrics.pairs.forEach((pair) => {
    if (!pair.overlapPoly.length) return;
    const isBad = badPairs.has(pair.label);
    ctx.save();
    ctx.fillStyle = isBad ? 'rgba(255, 94, 72, 0.1)' : 'rgba(87, 198, 179, 0.055)';
    ctx.strokeStyle = isBad ? 'rgba(255, 108, 85, 0.72)' : 'rgba(92, 205, 186, 0.36)';
    ctx.lineWidth = isBad ? 1.4 : 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    pathPoints(ctx, pair.overlapPoly, scale, offset);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);

    if (pair.center) {
      const span = verticalSpan(pair.overlapPoly, pair.center.x);
      const px = pair.center.x * scale + offset.x;
      if (span) {
        ctx.strokeStyle = isBad ? '#ff705d' : '#5dd6c2';
        ctx.lineWidth = isBad ? 2.5 : 1.5;
        ctx.setLineDash(isBad ? [5, 3] : [7, 5]);
        ctx.beginPath();
        ctx.moveTo(px, span[0] * scale + offset.y);
        ctx.lineTo(px, span[1] * scale + offset.y);
        ctx.stroke();
        ctx.setLineDash([]);

        const labelY = span[0] * scale + offset.y + 44;
        const label = `${pair.label}  ${pair.error.toFixed(1)} px`;
        ctx.font = '600 10px ui-monospace, SFMono-Regular, Menlo, monospace';
        const width = ctx.measureText(label).width + 16;
        roundedRect(ctx, px - width / 2, labelY, width, 22, 6);
        ctx.fillStyle = isBad ? 'rgba(81, 26, 22, 0.94)' : 'rgba(12, 36, 34, 0.94)';
        ctx.fill();
        ctx.strokeStyle = isBad ? 'rgba(255, 113, 91, 0.84)' : 'rgba(92, 211, 190, 0.7)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = isBad ? '#ffb9ad' : '#b7efe5';
        ctx.fillText(label, px - width / 2 + 8, labelY + 14.5);
      }
    }
    ctx.restore();
  });

  TILES.forEach((tile) => {
    const state = states[tile.id];
    const corners = tileCorners(state);
    const selected = selectedId === tile.id;
    ctx.save();
    ctx.strokeStyle = selected ? 'rgba(242, 239, 220, 0.96)' : `${tile.accent}aa`;
    ctx.lineWidth = selected ? 2 : 1;
    ctx.setLineDash(selected ? [] : [9, 5]);
    ctx.beginPath();
    pathPoints(ctx, corners, scale, offset);
    ctx.closePath();
    ctx.stroke();
    ctx.setLineDash([]);

    const labelPoint = localToWorld(state, 14, 14);
    const lx = labelPoint.x * scale + offset.x;
    const ly = labelPoint.y * scale + offset.y;
    ctx.fillStyle = selected ? '#f1ead6' : 'rgba(11, 25, 26, 0.86)';
    ctx.strokeStyle = tile.accent;
    roundedRect(ctx, lx, ly, 42, 24, 5);
    ctx.fill();
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.fillStyle = selected ? '#132022' : tile.accent;
    ctx.font = '700 12px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillText(tile.id, lx + 10, ly + 16);
    ctx.font = '500 8px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillText(tile.name, lx + 24, ly + 15);

    if (selected) {
      const handle = localToWorld(state, TILE_SIZE.width / 2, -34);
      const hx = handle.x * scale + offset.x;
      const hy = handle.y * scale + offset.y;
      const anchor = localToWorld(state, TILE_SIZE.width / 2, 0);
      const ax = anchor.x * scale + offset.x;
      const ay = anchor.y * scale + offset.y;
      ctx.strokeStyle = 'rgba(243, 226, 184, 0.58)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(hx, hy);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(hx, hy, 6, 0, Math.PI * 2);
      ctx.fillStyle = '#f0dfb4';
      ctx.fill();
      ctx.strokeStyle = '#253333';
      ctx.stroke();
    }
    ctx.restore();
  });
}

function drawMagnifier(ctx, canvas, metrics, scale, offset, radius) {
  const worstPair = metrics.pairs.reduce(
    (worst, pair) => (pair.error > (worst?.error ?? -1) ? pair : worst),
    null,
  );
  if (!worstPair?.center) return;

  const isBad = worstPair.error > SEAM_THRESHOLD;
  const centerX = worstPair.center.x * scale + offset.x;
  const centerY = worstPair.center.y * scale + offset.y;
  const rect = canvas.getBoundingClientRect();
  const lensX = rect.width - radius - 34;
  const lensY = rect.height - radius - 30;
  const sampleRadius = radius / 2.65;
  const dpr = canvas.width / canvas.getBoundingClientRect().width;

  ctx.save();
  ctx.setLineDash([5, 5]);
  ctx.strokeStyle = isBad ? 'rgba(255, 112, 92, 0.55)' : 'rgba(100, 212, 193, 0.42)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(centerX, centerY);
  ctx.lineTo(lensX + radius * 0.35, lensY + radius * 0.58);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.arc(centerX, centerY, 4, 0, Math.PI * 2);
  ctx.fillStyle = isBad ? '#ff705c' : '#63d6c2';
  ctx.fill();

  ctx.beginPath();
  ctx.arc(lensX, lensY, radius, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = '#081113';
  ctx.fillRect(lensX - radius, lensY - radius, radius * 2, radius * 2);
  ctx.drawImage(
    canvas,
    Math.max(0, (centerX - sampleRadius) * dpr),
    Math.max(0, (centerY - sampleRadius) * dpr),
    sampleRadius * 2 * dpr,
    sampleRadius * 2 * dpr,
    lensX - radius,
    lensY - radius,
    radius * 2,
    radius * 2,
  );
  const vignette = ctx.createRadialGradient(
    lensX,
    lensY,
    radius * 0.45,
    lensX,
    lensY,
    radius,
  );
  vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
  vignette.addColorStop(1, 'rgba(0, 0, 0, 0.44)');
  ctx.fillStyle = vignette;
  ctx.fillRect(lensX - radius, lensY - radius, radius * 2, radius * 2);
  ctx.strokeStyle = isBad ? 'rgba(255, 126, 104, 0.74)' : 'rgba(155, 222, 208, 0.64)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(lensX - 13, lensY);
  ctx.lineTo(lensX + 13, lensY);
  ctx.moveTo(lensX, lensY - 13);
  ctx.lineTo(lensX, lensY + 13);
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.arc(lensX, lensY, radius + 2, 0, Math.PI * 2);
  ctx.strokeStyle = isBad ? '#ff705c' : '#9edbd1';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(lensX, lensY, radius + 5, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(226, 240, 234, 0.18)';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.font = '600 9px ui-monospace, SFMono-Regular, Menlo, monospace';
  const sourceLabel = 'SEAM ×2.65';
  const sourceWidth = ctx.measureText(sourceLabel).width + 14;
  roundedRect(ctx, lensX - sourceWidth / 2, lensY - radius - 10, sourceWidth, 19, 9);
  ctx.fillStyle = 'rgba(9, 22, 23, 0.9)';
  ctx.fill();
  ctx.fillStyle = isBad ? '#ffb2a6' : '#c8eee7';
  ctx.fillText(sourceLabel, lensX - sourceWidth / 2 + 7, lensY - radius + 3);
  ctx.restore();
}

export default function TerrainCanvas({
  states,
  terrain,
  selectedId,
  metrics,
  options,
  tool,
  viewZoom,
  onSelect,
  onTransform,
  onViewZoom,
}) {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const viewRef = useRef({ scale: 1, offsetX: 0, offsetY: 0, width: 0, height: 0 });
  const dragRef = useRef(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  const getWorldPoint = useCallback((event) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const view = viewRef.current;
    return {
      x: (event.clientX - rect.left - view.offsetX) / view.scale,
      y: (event.clientY - rect.top - view.offsetY) / view.scale,
      screenX: event.clientX - rect.left,
      screenY: event.clientY - rect.top,
    };
  }, []);

  useEffect(() => {
    const element = wrapRef.current;
    if (!element) return undefined;
    const observer = new ResizeObserver(([entry]) => {
      const rect = entry.contentRect;
      setSize({ width: rect.width, height: rect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !size.width || !size.height) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const physicalWidth = Math.round(size.width * dpr);
    const physicalHeight = Math.round(size.height * dpr);
    if (canvas.width !== physicalWidth || canvas.height !== physicalHeight) {
      canvas.width = physicalWidth;
      canvas.height = physicalHeight;
    }

    const fitScale = Math.min(size.width / STAGE.width, size.height / STAGE.height) * 0.955;
    const scale = fitScale * viewZoom;
    const offset = {
      x: (size.width - STAGE.width * scale) / 2,
      y: (size.height - STAGE.height * scale) / 2,
    };
    viewRef.current = {
      scale,
      offsetX: offset.x,
      offsetY: offset.y,
      width: size.width,
      height: size.height,
    };
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawStageGrid(ctx, scale, offset, size.width, size.height, viewZoom);

    ctx.save();
    ctx.translate(offset.x, offset.y);
    paintComposition({
      ctx,
      states,
      terrain,
      options,
      scale,
      includeBackground: false,
    });
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = 'rgba(210, 232, 224, 0.2)';
    ctx.lineWidth = 1;
    ctx.strokeRect(
      offset.x + 1,
      offset.y + 1,
      STAGE.width * scale - 2,
      STAGE.height * scale - 2,
    );
    ctx.restore();

    drawTileOverlays(ctx, states, selectedId, scale, offset, metrics);
    const lensRadius = Math.max(48, Math.min(68, size.width * 0.072));
    drawMagnifier(ctx, canvas, metrics, scale, offset, lensRadius);
  }, [states, terrain, selectedId, metrics, options, size, viewZoom]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const handleWheel = (event) => {
      event.preventDefault();
      const next = Math.max(0.72, Math.min(1.55, viewZoom - event.deltaY * 0.0012));
      onViewZoom(next);
    };
    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', handleWheel);
  }, [viewZoom, onViewZoom]);

  const onPointerDown = (event) => {
    if (event.button !== 0) return;
    const point = getWorldPoint(event);
    let tileId = selectedId;

    if (selectedId) {
      const state = states[selectedId];
      const handle = localToWorld(state, TILE_SIZE.width / 2, -34);
      const view = viewRef.current;
      const handleX = handle.x * view.scale + view.offsetX;
      const handleY = handle.y * view.scale + view.offsetY;
      const handleHit = Math.hypot(point.screenX - handleX, point.screenY - handleY) < HIT_RADIUS;
      if (handleHit) {
        const center = {
          x: state.x + TILE_SIZE.width / 2,
          y: state.y + TILE_SIZE.height / 2,
        };
        dragRef.current = {
          mode: 'rotate',
          tileId: selectedId,
          startAngle: Math.atan2(point.y - center.y, point.x - center.x),
          startRotation: state.rotation,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
        return;
      }
    }

    for (let i = TILES.length - 1; i >= 0; i -= 1) {
      const tile = TILES[i];
      if (pointInsideTile(states[tile.id], point.x, point.y)) {
        tileId = tile.id;
        break;
      }
    }
    if (!tileId) return;
    onSelect(tileId);
    const state = states[tileId];
    if (tool === 'rotate') {
      const center = {
        x: state.x + TILE_SIZE.width / 2,
        y: state.y + TILE_SIZE.height / 2,
      };
      dragRef.current = {
        mode: 'rotate',
        tileId,
        startAngle: Math.atan2(point.y - center.y, point.x - center.x),
        startRotation: state.rotation,
      };
    } else {
      dragRef.current = {
        mode: 'move',
        tileId,
        startX: point.x,
        startY: point.y,
        startState: { ...state },
      };
    }
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event) => {
    const drag = dragRef.current;
    if (!drag) return;
    const point = getWorldPoint(event);
    const state = states[drag.tileId];
    if (drag.mode === 'rotate') {
      const center = {
        x: state.x + TILE_SIZE.width / 2,
        y: state.y + TILE_SIZE.height / 2,
      };
      const angle = Math.atan2(point.y - center.y, point.x - center.x);
      onTransform(drag.tileId, {
        rotation: normalizeAngle(drag.startRotation + angle - drag.startAngle),
      });
    } else {
      let dx = point.x - drag.startX;
      let dy = point.y - drag.startY;
      if (event.shiftKey) {
        if (Math.abs(dx) > Math.abs(dy)) dy = 0;
        else dx = 0;
      }
      onTransform(drag.tileId, {
        x: Math.round(drag.startState.x + dx),
        y: Math.round(drag.startState.y + dy),
      });
    }
  };

  const stopDrag = (event) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <div className="canvas-wrap" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        className={`terrain-canvas tool-${tool}`}
        aria-label="三幅地形图拼接画布，显示图幅轮廓、重叠区、拼接线和接缝放大镜"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={stopDrag}
        onPointerCancel={stopDrag}
      />
      <div className="canvas-corner canvas-corner-left">
        <span className="corner-dot" />
        LIVE COMPOSITE
        <span className="corner-separator">/</span>
        3 LAYERS
      </div>
      <div className="canvas-corner canvas-corner-right">
        {tool === 'move' ? '拖动图幅平移 · Shift 轴向锁定' : '拖动图幅或手柄旋转'}
      </div>
      <div className="canvas-scale-bar">
        <span />
        <b>100 px</b>
      </div>
    </div>
  );
}
