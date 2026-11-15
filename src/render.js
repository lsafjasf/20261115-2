import { CONTAINERS, SHIPS, STACK_IDS, getStackHeight } from "./game.js";

export const CANVAS_WIDTH = 1180;
export const CANVAS_HEIGHT = 760;

export const STACK_RECTS = {
  A: { x: 38, y: 112, w: 312, h: 174 },
  B: { x: 38, y: 378, w: 312, h: 174 },
  C: { x: 378, y: 112, w: 312, h: 174 },
  D: { x: 378, y: 378, w: 312, h: 174 }
};

export const LANE_RECT = { x: 714, y: 60, w: 194, h: 644 };

export const SHIP_RECTS = {
  star: { x: 934, y: 92, w: 214, h: 148 },
  wind: { x: 934, y: 306, w: 214, h: 148 },
  horizon: { x: 934, y: 520, w: 214, h: 148 }
};

const FONT_SANS = '"Yard Sans", "Aptos", "Segoe UI", "Noto Sans SC", "Microsoft YaHei", sans-serif';
const FONT_COND = '"Yard Sans", "Bahnschrift", "Arial Narrow", "Noto Sans SC", sans-serif';
const FONT_SERIF = '"Yard Sans", "Iowan Old Style", "Songti SC", "Noto Serif SC", Georgia, serif';

function roundedRect(ctx, x, y, w, h, radius = 4) {
  const r = Math.min(radius, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function pointOnQuadratic(from, control, to, t) {
  const inverse = 1 - t;
  return {
    x: inverse * inverse * from.x + 2 * inverse * t * control.x + t * t * to.x,
    y: inverse * inverse * from.y + 2 * inverse * t * control.y + t * t * to.y
  };
}

function bezierControl(from, to) {
  if (from.x < LANE_RECT.x && to.x > LANE_RECT.x + LANE_RECT.w) {
    return { x: LANE_RECT.x + LANE_RECT.w / 2, y: Math.min(from.y, to.y) - 86 };
  }
  if (from.x > LANE_RECT.x && to.x < LANE_RECT.x) {
    return { x: LANE_RECT.x + LANE_RECT.w / 2, y: Math.min(from.y, to.y) - 86 };
  }
  return { x: (from.x + to.x) / 2, y: Math.min(from.y, to.y) - 46 };
}

export function getStackTopCenter(stackId, count = 2) {
  const rect = STACK_RECTS[stackId];
  const shift = Math.max(0, count - 1);
  return {
    x: rect.x + rect.w / 2 + shift * 4,
    y: rect.y + 178 - shift * 15
  };
}

export function getShipCenter(shipId) {
  const rect = SHIP_RECTS[shipId];
  return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
}

export function getTestPoint(target) {
  if (target.startsWith("stack:")) {
    const stackId = target.split(":")[1];
    const rect = STACK_RECTS[stackId];
    return { x: rect.x + rect.w / 2, y: rect.y + 104 };
  }
  if (target.startsWith("ship:")) {
    return getShipCenter(target.split(":")[1]);
  }
  if (target === "lane") {
    return { x: LANE_RECT.x + LANE_RECT.w / 2, y: 632 };
  }
  return { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2 };
}

export function hitTest(x, y) {
  for (const stackId of STACK_IDS) {
    const rect = STACK_RECTS[stackId];
    if (x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h) {
      return { type: "stack", stackId };
    }
  }
  for (const ship of SHIPS) {
    const rect = SHIP_RECTS[ship.id];
    if (x >= rect.x - 12 && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h) {
      return { type: "ship", shipId: ship.id };
    }
  }
  const lane = LANE_RECT;
  if (x >= lane.x && x <= lane.x + lane.w && y >= lane.y && y <= lane.y + lane.h) {
    return { type: "lane" };
  }
  return null;
}

export class YardRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.dpr = 1;
    this.speckles = this.makeSpeckles();
    this.waterLines = this.makeWaterLines();
    this.resize();
  }

  makeSpeckles() {
    const random = mulberry32(70718);
    return Array.from({ length: 190 }, () => ({
      x: 12 + random() * 890,
      y: 55 + random() * 665,
      r: random() * 1.2 + 0.25,
      a: 0.025 + random() * 0.06
    }));
  }

  makeWaterLines() {
    const random = mulberry32(2231);
    return Array.from({ length: 34 }, (_, index) => ({
      x: 910 + random() * 240,
      y: 72 + random() * 650,
      w: 18 + random() * 46,
      phase: random() * Math.PI * 2,
      speed: 0.2 + random() * 0.4,
      index
    }));
  }

  resize() {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = CANVAS_WIDTH * this.dpr;
    this.canvas.height = CANVAS_HEIGHT * this.dpr;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  render(state, view) {
    const ctx = this.ctx;
    ctx.save();
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    this.drawBackground(state, view);
    this.drawYard(state, view);
    this.drawLane(state, view);
    this.drawStacks(state, view);
    this.drawShips(state, view);
    this.drawRoute(state, view);
    this.drawCrane(state, view);
    this.drawHoverCard(state, view);
    this.drawFooterMarks(state, view);
    ctx.restore();
  }

  drawBackground(state, view) {
    const ctx = this.ctx;
    const t = view.time / 1000;
    const water = ctx.createLinearGradient(900, 0, 1180, 760);
    water.addColorStop(0, "#0a2228");
    water.addColorStop(0.55, "#082128");
    water.addColorStop(1, "#05161c");
    ctx.fillStyle = water;
    ctx.fillRect(894, 0, 286, 760);

    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.strokeStyle = "#68aab4";
    ctx.lineWidth = 0.8;
    for (const line of this.waterLines) {
      const offset = Math.sin(t * line.speed + line.phase) * 8;
      ctx.beginPath();
      ctx.moveTo(line.x + offset, line.y);
      ctx.quadraticCurveTo(
        line.x + offset + line.w / 2,
        line.y - 2.2,
        line.x + offset + line.w,
        line.y
      );
      ctx.stroke();
    }
    ctx.restore();

    const ground = ctx.createLinearGradient(0, 0, 740, 760);
    ground.addColorStop(0, "#1b292b");
    ground.addColorStop(0.5, "#172527");
    ground.addColorStop(1, "#132022");
    ctx.fillStyle = ground;
    ctx.fillRect(0, 52, 894, 708);

    ctx.save();
    ctx.strokeStyle = "rgba(183, 207, 198, 0.07)";
    ctx.lineWidth = 1;
    for (let x = 18; x < 890; x += 58) {
      ctx.beginPath();
      ctx.moveTo(x, 52);
      ctx.lineTo(x, 760);
      ctx.stroke();
    }
    for (let y = 66; y < 760; y += 58) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(894, y);
      ctx.stroke();
    }
    for (const fleck of this.speckles) {
      ctx.fillStyle = `rgba(211, 226, 216, ${fleck.a})`;
      ctx.beginPath();
      ctx.arc(fleck.x, fleck.y, fleck.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    ctx.fillStyle = "rgba(3, 9, 11, 0.34)";
    ctx.fillRect(0, 52, 894, 20);
    ctx.strokeStyle = "rgba(190, 211, 202, 0.16)";
    ctx.beginPath();
    ctx.moveTo(0, 52.5);
    ctx.lineTo(894, 52.5);
    ctx.stroke();

    ctx.fillStyle = "rgba(7, 18, 20, 0.54)";
    ctx.fillRect(894, 0, 12, 760);
    ctx.fillStyle = "rgba(232, 197, 104, 0.5)";
    for (let y = 72; y < 750; y += 28) {
      ctx.fillRect(897, y, 5, 10);
    }

    ctx.save();
    ctx.translate(1164, 34);
    ctx.rotate(Math.PI / 2);
    ctx.fillStyle = "rgba(212, 226, 218, 0.23)";
    ctx.font = `600 8px ${FONT_COND}`;
    ctx.fillText("BERTH 01 — 03   /   TIDAL BASIN", 0, 0);
    ctx.restore();
  }

  drawYard(state, view) {
    const ctx = this.ctx;
    ctx.save();
    for (const stackId of STACK_IDS) {
      const rect = STACK_RECTS[stackId];
      const limited = stackId === "A";
      const hovered =
        view.hover?.type === "stack" &&
        view.hover.stackId === stackId &&
        Boolean(view.selection);
      const preview = hovered ? view.preview : null;

      ctx.fillStyle = "rgba(4, 12, 14, 0.26)";
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
      ctx.strokeStyle = hovered && preview?.ok
        ? "rgba(105, 215, 173, 0.8)"
        : hovered
          ? "rgba(238, 117, 106, 0.75)"
          : "rgba(185, 207, 198, 0.16)";
      ctx.lineWidth = hovered ? 1.5 : 1;
      ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.w - 1, rect.h - 1);

      ctx.fillStyle = "rgba(208, 223, 214, 0.55)";
      ctx.font = `700 9px ${FONT_COND}`;
      ctx.fillText(`BAY ${stackId}`, rect.x + 12, rect.y + 16);
      ctx.fillStyle = limited ? "rgba(232, 197, 104, 0.85)" : "rgba(139, 160, 152, 0.66)";
      ctx.font = `600 8px ${FONT_SANS}`;
      ctx.fillText(limited ? "限高排 · 禁 9'6 高箱" : `${stackId} 排 · 可叠放`, rect.x + 62, rect.y + 16);

      ctx.strokeStyle = limited
        ? "rgba(232, 197, 104, 0.22)"
        : "rgba(183, 207, 198, 0.1)";
      ctx.beginPath();
      ctx.moveTo(rect.x + 10, rect.y + 23.5);
      ctx.lineTo(rect.x + rect.w - 10, rect.y + 23.5);
      ctx.stroke();

      if (limited) {
        ctx.save();
        ctx.globalAlpha = 0.45;
        for (let offset = 0; offset < rect.w; offset += 16) {
          ctx.fillStyle = "#d3b65f";
          ctx.beginPath();
          ctx.moveTo(rect.x + offset, rect.y + rect.h - 5);
          ctx.lineTo(rect.x + offset + 7, rect.y + rect.h - 5);
          ctx.lineTo(rect.x + offset + 3, rect.y + rect.h - 1);
          ctx.lineTo(rect.x + offset - 4, rect.y + rect.h - 1);
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
      }

      const count = getStackHeight(state, stackId);
      ctx.fillStyle = "rgba(224, 235, 228, 0.34)";
      ctx.font = `500 8px ${FONT_COND}`;
      ctx.textAlign = "right";
      ctx.fillText(`${count} / 3 LAYERS`, rect.x + rect.w - 10, rect.y + 16);
      ctx.textAlign = "left";

      if (!count) this.drawEmptyBay(rect);
    }

    ctx.strokeStyle = "rgba(232, 197, 104, 0.2)";
    ctx.setLineDash([5, 9]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(352, 88);
    ctx.lineTo(352, 710);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = "rgba(186, 205, 196, 0.3)";
    ctx.font = `600 8px ${FONT_COND}`;
    ctx.fillText("STACK BLOCK 01", 20, 746);
    ctx.strokeStyle = "rgba(186, 205, 196, 0.14)";
    ctx.beginPath();
    ctx.moveTo(118, 743);
    ctx.lineTo(318, 743);
    ctx.stroke();
    ctx.fillStyle = "rgba(186, 205, 196, 0.25)";
    ctx.fillText("40' DRY / HC", 326, 746);
    ctx.restore();
  }

  drawEmptyBay(rect) {
    const ctx = this.ctx;
    ctx.strokeStyle = "rgba(178, 202, 193, 0.24)";
    ctx.setLineDash([4, 6]);
    ctx.strokeRect(rect.x + 26, rect.y + 53, rect.w - 57, 104);
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(178, 202, 193, 0.32)";
    ctx.font = `500 9px ${FONT_COND}`;
    ctx.textAlign = "center";
    ctx.fillText("EMPTY BAY / 空垛", rect.x + rect.w / 2, rect.y + 105);
    ctx.font = `400 18px ${FONT_SANS}`;
    ctx.fillText("+", rect.x + rect.w / 2, rect.y + 88);
    ctx.textAlign = "left";
  }

  drawLane(state, view) {
    const ctx = this.ctx;
    const lane = LANE_RECT;
    const laneHover = view.hover?.type === "lane";

    ctx.save();
    const asphalt = ctx.createLinearGradient(lane.x, 0, lane.x + lane.w, 0);
    asphalt.addColorStop(0, "#0e1b1e");
    asphalt.addColorStop(0.5, "#18272a");
    asphalt.addColorStop(1, "#0d191c");
    ctx.fillStyle = asphalt;
    ctx.fillRect(lane.x, lane.y, lane.w, lane.h);

    ctx.fillStyle = "rgba(232, 197, 104, 0.62)";
    ctx.fillRect(lane.x + 5, lane.y, 3, lane.h);
    ctx.fillRect(lane.x + lane.w - 8, lane.y, 3, lane.h);
    ctx.fillStyle = "rgba(232, 197, 104, 0.18)";
    ctx.fillRect(lane.x, lane.y, 3, lane.h);
    ctx.fillRect(lane.x + lane.w - 3, lane.y, 3, lane.h);

    ctx.setLineDash([11, 12]);
    ctx.lineDashOffset = -(view.time / 55) % 23;
    ctx.strokeStyle = "rgba(226, 235, 228, 0.24)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(lane.x + lane.w / 2, lane.y + 24);
    ctx.lineTo(lane.x + lane.w / 2, lane.y + lane.h - 24);
    ctx.stroke();
    ctx.setLineDash([]);

    for (let y = lane.y + 70; y < lane.y + lane.h - 70; y += 92) {
      ctx.strokeStyle = "rgba(232, 197, 104, 0.13)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(lane.x + 18, y + 16);
      ctx.lineTo(lane.x + lane.w / 2, y);
      ctx.lineTo(lane.x + lane.w - 18, y + 16);
      ctx.stroke();
    }

    ctx.save();
    ctx.translate(lane.x + 20, lane.y + lane.h / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = "rgba(220, 231, 224, 0.44)";
    ctx.font = `700 9px ${FONT_COND}`;
    ctx.textAlign = "center";
    ctx.fillText("SINGLE LOADING LANE  ·  KEEP CLEAR", 0, 0);
    ctx.restore();

    ctx.fillStyle = "rgba(6, 15, 17, 0.78)";
    ctx.fillRect(lane.x + 20, lane.y + lane.h - 76, lane.w - 40, 48);
    ctx.strokeStyle = "rgba(105, 215, 173, 0.34)";
    ctx.strokeRect(lane.x + 20, lane.y + lane.h - 76, lane.w - 40, 48);
    ctx.fillStyle = "#69d7ad";
    ctx.beginPath();
    ctx.arc(lane.x + 35, lane.y + lane.h - 52, 3.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = `600 8px ${FONT_COND}`;
    ctx.fillText("通道畅通", lane.x + 45, lane.y + lane.h - 48);
    ctx.fillStyle = "rgba(205, 221, 213, 0.37)";
    ctx.font = `500 7px ${FONT_COND}`;
    ctx.fillText("NO DROP ZONE", lane.x + 45, lane.y + lane.h - 36);

    if (laneHover && view.selection) {
      ctx.fillStyle = "rgba(238, 117, 106, 0.18)";
      ctx.fillRect(lane.x + 3, lane.y + 3, lane.w - 6, lane.h - 6);
      ctx.strokeStyle = "rgba(238, 117, 106, 0.55)";
      ctx.lineWidth = 1;
      for (let offset = -lane.h; offset < lane.w + lane.h; offset += 26) {
        ctx.beginPath();
        ctx.moveTo(lane.x + Math.max(0, offset), lane.y + Math.max(0, -offset));
        ctx.lineTo(
          lane.x + Math.min(lane.w, offset + lane.h),
          lane.y + Math.min(lane.h, lane.h - Math.max(0, -offset))
        );
        ctx.stroke();
      }
      this.drawNoDrop(lane.x + lane.w / 2, lane.y + lane.h / 2);
    }
    ctx.restore();
  }

  drawNoDrop(x, y) {
    const ctx = this.ctx;
    ctx.fillStyle = "rgba(7, 17, 19, 0.9)";
    ctx.beginPath();
    ctx.arc(x, y, 24, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(238, 117, 106, 0.8)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, 24, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x - 10, y - 10);
    ctx.lineTo(x + 10, y + 10);
    ctx.moveTo(x + 10, y - 10);
    ctx.lineTo(x - 10, y + 10);
    ctx.stroke();
    ctx.fillStyle = "#ffc5be";
    ctx.font = `600 8px ${FONT_SANS}`;
    ctx.textAlign = "center";
    ctx.fillText("禁止落箱", x, y + 42);
    ctx.textAlign = "left";
  }

  drawStacks(state, view) {
    for (const stackId of STACK_IDS) {
      const rect = STACK_RECTS[stackId];
      const containerIds = state.stacks[stackId];
      const boxW = 250;
      const boxH = 100;
      const baseX = rect.x + (rect.w - boxW) / 2 - 4;
      const baseY = rect.y + 128;

      for (let index = 0; index < containerIds.length; index += 1) {
        const container = CONTAINERS[containerIds[index]];
        const layerOffset = index * 15;
        const isTop = index === containerIds.length - 1;
        if (
          isTop &&
          view.anim?.destinationStack === stackId &&
          view.anim.containerId === container.id
        ) {
          continue;
        }
        const selected =
          isTop &&
          view.selection?.type === "stack" &&
          view.selection.stackId === stackId;
        this.drawContainer(container, {
          x: baseX + index * 5,
          y: baseY - layerOffset,
          w: boxW,
          h: boxH,
          top: isTop,
          selected,
          layer: index + 1,
          dimmed: state.missed.includes(container.id)
        });
      }

      if (
        view.hover?.type === "stack" &&
        view.hover.stackId === stackId &&
        view.selection &&
        view.selection.stackId !== stackId
      ) {
        const valid = view.preview?.ok;
        ctxDropGuard(this.ctx, rect, valid);
      }
    }
  }

  drawContainer(container, options) {
    const ctx = this.ctx;
    let { x, y, w, h } = options;
    const { top, selected, layer, dimmed } = options;
    const tallExtra = container.tall ? 3 : 0;
    const depth = top ? 7 + tallExtra : 4 + tallExtra;

    ctx.save();
    if (!top) ctx.globalAlpha = 0.82;
    if (dimmed) ctx.globalAlpha *= 0.46;

    ctx.fillStyle = "rgba(0, 0, 0, 0.34)";
    roundedRect(ctx, x + 8, y + 11, w, h + depth, 5);
    ctx.fill();

    ctx.fillStyle = shadeColor(container.color, -0.34);
    roundedRect(ctx, x, y + 5, w, h + depth + 2, 4);
    ctx.fill();

    const gradient = ctx.createLinearGradient(x, y, x, y + h);
    gradient.addColorStop(0, shadeColor(container.color, top ? 0.2 : 0.02));
    gradient.addColorStop(0.52, shadeColor(container.color, top ? -0.02 : -0.16));
    gradient.addColorStop(1, shadeColor(container.color, top ? -0.2 : -0.32));
    ctx.fillStyle = gradient;
    roundedRect(ctx, x, y, w, h, 4);
    ctx.fill();

    ctx.strokeStyle = top
      ? "rgba(255, 255, 255, 0.27)"
      : "rgba(255, 255, 255, 0.12)";
    ctx.lineWidth = 1;
    roundedRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, 4);
    ctx.stroke();

    ctx.strokeStyle = "rgba(0, 0, 0, 0.17)";
    ctx.lineWidth = 1;
    for (let lineX = x + 18; lineX < x + w - 13; lineX += 12) {
      ctx.beginPath();
      ctx.moveTo(lineX, y + 13);
      ctx.lineTo(lineX, y + h - 13);
      ctx.stroke();
    }

    ctx.fillStyle = shadeColor(container.color, -0.25);
    ctx.fillRect(x + 5, y + 5, w - 10, 3);
    ctx.fillStyle = "rgba(255, 255, 255, 0.11)";
    ctx.fillRect(x + 5, y + h - 6, w - 10, 2);

    this.drawCastings(x, y, w, h);

    if (top) {
      this.drawContainerLabels(container, x, y, w, h, layer);
    } else {
      ctx.fillStyle = "rgba(255, 255, 255, 0.38)";
      ctx.font = `600 8px ${FONT_COND}`;
      ctx.fillText(`${layer}F  ${container.short}`, x + 12, y + h - 3);
    }

    if (selected) {
      ctx.shadowColor = "rgba(244, 212, 126, 0.55)";
      ctx.shadowBlur = 20;
      ctx.strokeStyle = "#f4d47e";
      ctx.lineWidth = 2;
      roundedRect(ctx, x - 3, y - 3, w + 6, h + 6, 6);
      ctx.stroke();
      ctx.shadowBlur = 0;
      this.drawCornerBrackets(x - 8, y - 8, w + 16, h + 16);
    }
    ctx.restore();
  }

  drawCastings(x, y, w, h) {
    const ctx = this.ctx;
    ctx.fillStyle = "rgba(18, 25, 26, 0.64)";
    const size = 11;
    const positions = [
      [x + 3, y + 3],
      [x + w - size - 3, y + 3],
      [x + 3, y + h - size - 3],
      [x + w - size - 3, y + h - size - 3]
    ];
    for (const [left, top] of positions) {
      ctx.fillRect(left, top, size, size);
      ctx.strokeStyle = "rgba(255, 255, 255, 0.16)";
      ctx.strokeRect(left + 0.5, top + 0.5, size - 1, size - 1);
    }
  }

  drawContainerLabels(container, x, y, w, h, layer) {
    const ctx = this.ctx;
    ctx.fillStyle = container.ink;
    ctx.font = `700 24px ${FONT_COND}`;
    ctx.fillText(container.short, x + 19, y + 36);
    ctx.fillStyle = withAlpha(container.ink, 0.58);
    ctx.font = `600 8px ${FONT_COND}`;
    ctx.fillText(container.serial, x + 20, y + 50);

    ctx.fillStyle = withAlpha(container.ink, 0.36);
    ctx.font = `600 7px ${FONT_COND}`;
    ctx.fillText(`LAYER ${layer}`, x + 20, y + h - 17);

    ctx.fillStyle = withAlpha(container.ink, 0.08);
    roundedRect(ctx, x + w - 81, y + 17, 62, 26, 2);
    ctx.fill();
    ctx.strokeStyle = withAlpha(container.ink, 0.2);
    ctx.stroke();
    ctx.fillStyle = container.ink;
    ctx.font = `700 14px ${FONT_COND}`;
    ctx.textAlign = "right";
    ctx.fillText(`${container.weight}`, x + w - 39, y + 36);
    ctx.font = `500 7px ${FONT_COND}`;
    ctx.fillText("TON", x + w - 22, y + 36);
    ctx.textAlign = "left";

    ctx.fillStyle = container.tall ? "#f0d478" : withAlpha(container.ink, 0.75);
    ctx.font = `650 8px ${FONT_COND}`;
    ctx.textAlign = "right";
    ctx.fillText(`${container.height}${container.tall ? "  HIGH CUBE" : "  STANDARD"}`, x + w - 19, y + h - 16);
    ctx.textAlign = "left";

    const ship = SHIPS.find((item) => item.id === container.shipId);
    ctx.fillStyle = ship?.color ?? "#fff";
    ctx.beginPath();
    ctx.arc(x + w - 89, y + h - 19, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = withAlpha(container.ink, 0.55);
    ctx.font = `600 7px ${FONT_SANS}`;
    ctx.fillText(ship?.name ?? "", x + w - 82, y + h - 16);
  }

  drawCornerBrackets(x, y, w, h) {
    const ctx = this.ctx;
    const length = 13;
    ctx.strokeStyle = "#f4d47e";
    ctx.lineWidth = 2;
    const corners = [
      [x, y, 1, 1],
      [x + w, y, -1, 1],
      [x, y + h, 1, -1],
      [x + w, y + h, -1, -1]
    ];
    for (const [cx, cy, dx, dy] of corners) {
      ctx.beginPath();
      ctx.moveTo(cx, cy + dy * length);
      ctx.lineTo(cx, cy);
      ctx.lineTo(cx + dx * length, cy);
      ctx.stroke();
    }
  }

  drawShips(state, view) {
    const ctx = this.ctx;
    ctx.save();
    for (let index = 0; index < SHIPS.length; index += 1) {
      const definition = SHIPS[index];
      const ship = state.ships[definition.id];
      const rect = SHIP_RECTS[definition.id];
      const hovered =
        view.hover?.type === "ship" &&
        view.hover.shipId === definition.id &&
        Boolean(view.selection);
      const preview = hovered ? view.preview : null;
      const departed = ship.status === "departed";
      const remaining = Math.max(0, ship.deadline - state.elapsed);
      const urgent = !departed && remaining <= 12;
      const completed = ship.loaded.length;

      ctx.save();
      if (departed) ctx.globalAlpha = 0.42;

      ctx.fillStyle = "rgba(2, 8, 10, 0.42)";
      roundedRect(ctx, rect.x + 8, rect.y + 12, rect.w, rect.h, 18);
      ctx.fill();

      const hullGradient = ctx.createLinearGradient(rect.x, rect.y, rect.x + rect.w, rect.y);
      hullGradient.addColorStop(0, "#30464a");
      hullGradient.addColorStop(0.45, "#25383c");
      hullGradient.addColorStop(1, "#182a2e");
      ctx.fillStyle = hullGradient;
      ctx.beginPath();
      ctx.moveTo(rect.x + 28, rect.y + 7);
      ctx.bezierCurveTo(rect.x + 8, rect.y + 27, rect.x + 5, rect.y + 48, rect.x, rect.y + rect.h / 2);
      ctx.bezierCurveTo(rect.x + 5, rect.y + rect.h - 48, rect.x + 8, rect.y + rect.h - 27, rect.x + 28, rect.y + rect.h - 7);
      ctx.lineTo(rect.x + rect.w - 19, rect.y + rect.h - 8);
      ctx.quadraticCurveTo(rect.x + rect.w, rect.y + rect.h - 8, rect.x + rect.w - 7, rect.y + rect.h - 24);
      ctx.lineTo(rect.x + rect.w - 7, rect.y + 24);
      ctx.quadraticCurveTo(rect.x + rect.w, rect.y + 8, rect.x + rect.w - 19, rect.y + 8);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = withAlpha(definition.color, hovered ? 0.8 : 0.3);
      ctx.lineWidth = hovered ? 1.6 : 1;
      ctx.stroke();

      ctx.strokeStyle = "rgba(223, 234, 228, 0.14)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(rect.x + 9, rect.y + rect.h / 2);
      ctx.lineTo(rect.x + rect.w - 15, rect.y + rect.h / 2);
      ctx.stroke();

      ctx.fillStyle = "rgba(6, 16, 19, 0.44)";
      roundedRect(ctx, rect.x + 22, rect.y + 25, rect.w - 48, rect.h - 50, 3);
      ctx.fill();
      ctx.strokeStyle = "rgba(220, 231, 225, 0.12)";
      ctx.stroke();

      ctx.fillStyle = definition.color;
      ctx.fillRect(rect.x + 22, rect.y + 25, 3, rect.h - 50);
      ctx.fillStyle = "rgba(6, 16, 19, 0.74)";
      ctx.fillRect(rect.x + 29, rect.y + 33, 40, 14);
      ctx.fillStyle = withAlpha(definition.color, 0.8);
      ctx.font = `700 7px ${FONT_COND}`;
      ctx.fillText(`BERTH ${definition.berth}`, rect.x + 34, rect.y + 43);

      ctx.fillStyle = "#e6eee8";
      ctx.font = `650 15px ${FONT_SANS}`;
      ctx.fillText(definition.name, rect.x + 32, rect.y + 68);
      ctx.fillStyle = "rgba(212, 225, 217, 0.34)";
      ctx.font = `600 7px ${FONT_COND}`;
      ctx.fillText(definition.english, rect.x + 32, rect.y + 79);

      const plaqueX = rect.x + rect.w - 86;
      const plaqueY = rect.y + 31;
      ctx.fillStyle = urgent ? "rgba(76, 26, 25, 0.92)" : "rgba(7, 17, 19, 0.86)";
      roundedRect(ctx, plaqueX, plaqueY, 66, 41, 2);
      ctx.fill();
      ctx.strokeStyle = urgent
        ? "rgba(238, 117, 106, 0.55)"
        : withAlpha(definition.color, 0.32);
      ctx.stroke();
      ctx.fillStyle = urgent ? "#ff9489" : definition.color;
      ctx.font = `600 13px ${FONT_COND}`;
      ctx.textAlign = "right";
      ctx.fillText(clockLabel(remaining), plaqueX + 57, plaqueY + 21);
      ctx.fillStyle = "rgba(212, 225, 217, 0.4)";
      ctx.font = `600 6px ${FONT_COND}`;
      ctx.fillText(urgent ? "CLOSING" : "TO DEPART", plaqueX + 57, plaqueY + 33);
      ctx.textAlign = "left";

      this.drawShipCargo(definition, ship, rect);

      ctx.fillStyle = "rgba(216, 229, 221, 0.36)";
      ctx.font = `550 7px ${FONT_COND}`;
      ctx.fillText(`${completed} / ${definition.manifest.length} LOADED`, rect.x + 32, rect.y + rect.h - 19);
      ctx.textAlign = "right";
      ctx.fillStyle = hovered && preview?.ok
        ? "#88edc2"
        : hovered
          ? "#ff968b"
          : withAlpha(definition.color, 0.5);
      ctx.font = `650 7px ${FONT_COND}`;
      ctx.fillText(hovered ? (preview?.ok ? "可装船" : "不可装船") : "点击装载", rect.x + rect.w - 19, rect.y + rect.h - 19);
      ctx.textAlign = "left";

      if (departed) {
        ctx.fillStyle = "rgba(7, 15, 17, 0.55)";
        ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
        ctx.fillStyle = "rgba(224, 233, 227, 0.56)";
        ctx.font = `700 10px ${FONT_COND}`;
        ctx.textAlign = "center";
        ctx.fillText("已离港 / DEPARTED", rect.x + rect.w / 2, rect.y + rect.h / 2 + 4);
        ctx.textAlign = "left";
      }
      ctx.restore();
    }

    ctx.fillStyle = "rgba(232, 197, 104, 0.46)";
    for (let y = 70; y < 740; y += 42) {
      ctx.fillRect(905, y, 8, 15);
      ctx.fillStyle = "rgba(232, 197, 104, 0.13)";
      ctx.beginPath();
      ctx.arc(909, y + 7.5, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(232, 197, 104, 0.46)";
    }
    ctx.restore();
  }

  drawShipCargo(definition, ship, rect) {
    const ctx = this.ctx;
    const cargoWidth = 39;
    const cargoHeight = 22;
    const startX = rect.x + 33;
    const y = rect.y + 92;
    for (let index = 0; index < definition.manifest.length; index += 1) {
      const containerId = definition.manifest[index];
      const container = CONTAINERS[containerId];
      const loaded = ship.loaded.includes(containerId);
      const missed = ship.status === "departed" && !loaded;
      const x = startX + index * (cargoWidth + 6);
      ctx.fillStyle = loaded
        ? withAlpha(container.color, 0.88)
        : missed
          ? "rgba(91, 43, 42, 0.64)"
          : withAlpha(container.color, 0.22);
      roundedRect(ctx, x, y, cargoWidth, cargoHeight, 2);
      ctx.fill();
      ctx.strokeStyle = loaded ? withAlpha(container.color, 0.95) : "rgba(220, 232, 224, 0.13)";
      ctx.stroke();
      ctx.fillStyle = loaded ? container.ink : "rgba(222, 232, 226, 0.48)";
      ctx.font = `600 7px ${FONT_COND}`;
      ctx.fillText(container.short, x + 4, y + 13);
      if (missed) {
        ctx.strokeStyle = "rgba(238, 117, 106, 0.75)";
        ctx.beginPath();
        ctx.moveTo(x + 4, y + 4);
        ctx.lineTo(x + cargoWidth - 4, y + cargoHeight - 4);
        ctx.moveTo(x + cargoWidth - 4, y + 4);
        ctx.lineTo(x + 4, y + cargoHeight - 4);
        ctx.stroke();
      }
    }
  }

  drawRoute(state, view) {
    const ctx = this.ctx;
    let from = null;
    let to = null;
    let preview = null;
    let active = false;

    if (view.anim) {
      const anim = view.anim;
      from = anim.from;
      to = anim.to;
      preview = { ok: true, reason: anim.reason };
      active = true;
    } else if (view.selection) {
      const rect = STACK_RECTS[view.selection.stackId];
      from = getStackTopCenter(view.selection.stackId, getStackHeight(state, view.selection.stackId));
      if (view.hover) {
        if (view.hover.type === "stack") {
          to = getStackTopCenter(
            view.hover.stackId,
            getStackHeight(state, view.hover.stackId) + 1
          );
        } else if (view.hover.type === "ship") {
          to = getShipCenter(view.hover.shipId);
        } else if (view.hover.type === "lane") {
          to = { x: LANE_RECT.x + LANE_RECT.w / 2, y: view.pointer.y };
        }
      }
      preview = view.preview;
      active = true;
      if (!to) {
        to = {
          x: rect.x + rect.w / 2 + 80,
          y: rect.y + 75
        };
      }
    }

    if (!from || !to || !active) return;

    const control = bezierControl(from, to);
    const valid = preview ? preview.ok : true;
    const color = valid ? "#e8c568" : "#e87368";

    ctx.save();
    ctx.setLineDash([4, 8]);
    ctx.lineDashOffset = -(view.time / 30) % 12;
    ctx.strokeStyle = withAlpha(color, 0.66);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.quadraticCurveTo(control.x, control.y, to.x, to.y);
    ctx.stroke();
    ctx.setLineDash([]);

    for (const t of [0.18, 0.36, 0.54, 0.72]) {
      const point = pointOnQuadratic(from, control, to, t);
      ctx.fillStyle = withAlpha(color, 0.5);
      ctx.beginPath();
      ctx.arc(point.x, point.y, 1.4, 0, Math.PI * 2);
      ctx.fill();
    }

    const arrowPoint = pointOnQuadratic(from, control, to, 0.78);
    const arrowBefore = pointOnQuadratic(from, control, to, 0.74);
    const angle = Math.atan2(arrowPoint.y - arrowBefore.y, arrowPoint.x - arrowBefore.x);
    ctx.save();
    ctx.translate(arrowPoint.x, arrowPoint.y);
    ctx.rotate(angle);
    ctx.fillStyle = withAlpha(color, 0.8);
    ctx.beginPath();
    ctx.moveTo(7, 0);
    ctx.lineTo(-3, -4);
    ctx.lineTo(-1, 0);
    ctx.lineTo(-3, 4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.strokeStyle = withAlpha(color, 0.75);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(from.x, from.y, 17, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(from.x - 22, from.y);
    ctx.lineTo(from.x - 12, from.y);
    ctx.moveTo(from.x + 12, from.y);
    ctx.lineTo(from.x + 22, from.y);
    ctx.moveTo(from.x, from.y - 22);
    ctx.lineTo(from.x, from.y - 12);
    ctx.moveTo(from.x, from.y + 12);
    ctx.lineTo(from.x, from.y + 22);
    ctx.stroke();
    ctx.restore();
  }

  drawCrane(state, view) {
    const ctx = this.ctx;
    if (view.anim) {
      const anim = view.anim;
      const progress = clamp01((view.time - anim.startedAt) / anim.duration);
      const control = bezierControl(anim.from, anim.to);
      const point = pointOnQuadratic(anim.from, control, anim.to, progress);
      const container = CONTAINERS[anim.containerId];
      const lift = Math.sin(progress * Math.PI);
      const scale = 0.76 + lift * 0.03;
      const w = 190 * scale;
      const h = 74 * scale;

      ctx.save();
      ctx.fillStyle = `rgba(0, 0, 0, ${0.18 + lift * 0.2})`;
      ctx.beginPath();
      ctx.ellipse(point.x + 18, point.y + 26 + lift * 10, w * 0.44, h * 0.38, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = "rgba(232, 197, 104, 0.72)";
      ctx.lineWidth = 1;
      const hubY = point.y - 63;
      ctx.beginPath();
      ctx.moveTo(point.x - w * 0.4, point.y - h * 0.35);
      ctx.lineTo(point.x, hubY);
      ctx.lineTo(point.x + w * 0.4, point.y - h * 0.35);
      ctx.stroke();
      ctx.fillStyle = "#e8c568";
      ctx.fillRect(point.x - w * 0.48, point.y - h * 0.44, w * 0.96, 5);
      ctx.fillStyle = "#202b2c";
      ctx.fillRect(point.x - w * 0.48, point.y - h * 0.44, w * 0.96, 2);

      ctx.fillStyle = "rgba(7, 17, 19, 0.92)";
      roundedRect(ctx, point.x - 23, hubY - 12, 46, 24, 3);
      ctx.fill();
      ctx.strokeStyle = "rgba(232, 197, 104, 0.7)";
      ctx.stroke();
      ctx.fillStyle = "#e8c568";
      ctx.font = `700 8px ${FONT_COND}`;
      ctx.textAlign = "center";
      ctx.fillText(`${container.weight} T`, point.x, hubY + 3);
      ctx.textAlign = "left";

      this.drawContainer(container, {
        x: point.x - w / 2,
        y: point.y - h / 2,
        w,
        h,
        top: true,
        selected: false,
        layer: 1
      });

      ctx.strokeStyle = "rgba(232, 197, 104, 0.32)";
      ctx.setLineDash([3, 5]);
      ctx.beginPath();
      ctx.moveTo(anim.from.x, anim.from.y);
      ctx.quadraticCurveTo(control.x, control.y, point.x, point.y);
      ctx.stroke();
      ctx.restore();
    } else if (view.selection) {
      const point = getStackTopCenter(
        view.selection.stackId,
        getStackHeight(state, view.selection.stackId)
      );
      const height = getStackHeight(state, view.selection.stackId);
      const container = CONTAINERS[state.stacks[view.selection.stackId].at(-1)];
      const y = point.y - 69 - (height - 1) * 15;
      const pulse = 0.8 + Math.sin(view.time / 260) * 0.2;
      ctx.save();
      ctx.strokeStyle = `rgba(232, 197, 104, ${pulse})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(point.x - 23, y + 11);
      ctx.lineTo(point.x, y - 9);
      ctx.lineTo(point.x + 23, y + 11);
      ctx.stroke();
      ctx.fillStyle = "rgba(7, 17, 19, 0.88)";
      roundedRect(ctx, point.x - 28, y - 36, 56, 22, 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(232, 197, 104, 0.5)";
      ctx.stroke();
      ctx.fillStyle = "#e8c568";
      ctx.font = `700 8px ${FONT_COND}`;
      ctx.textAlign = "center";
      ctx.fillText(`${container.weight} T · ${container.height}`, point.x, y - 22);
      ctx.textAlign = "left";
      ctx.restore();
    }
  }

  drawHoverCard(state, view) {
    if (!view.hover || view.anim) return;
    const ctx = this.ctx;
    let x;
    let y;
    let title;
    let subtitle;
    let accent = "#e8c568";

    if (view.hover.type === "lane") {
      x = view.pointer.x;
      y = view.pointer.y - 62;
      title = "装卸通道 / NO DROP";
      subtitle = "任何货柜不得落入通道";
      accent = "#ee756a";
    } else if (view.hover.type === "stack") {
      const rect = STACK_RECTS[view.hover.stackId];
      x = rect.x + rect.w / 2;
      y = rect.y - 9;
      title = `${view.hover.stackId} 排 · ${getStackHeight(state, view.hover.stackId)} / 3 层`;
      if (view.selection) {
        subtitle = view.preview?.ok ? "绿色落点 · 可安全叠放" : view.preview?.reason;
        accent = view.preview?.ok ? "#69d7ad" : "#ee756a";
      } else {
        subtitle = "点击抓取垛顶货柜";
      }
    } else {
      const ship = state.ships[view.hover.shipId];
      const rect = SHIP_RECTS[view.hover.shipId];
      x = rect.x + rect.w / 2;
      y = rect.y - 9;
      title = `${ship.name} · ${ship.loaded.length}/${ship.manifest.length}`;
      if (ship.status === "departed") {
        subtitle = "船舶已离港";
        accent = "#ee756a";
      } else if (view.selection) {
        subtitle = view.preview?.ok ? "匹配船期 · 点击装船" : view.preview?.reason;
        accent = view.preview?.ok ? "#69d7ad" : "#ee756a";
      } else {
        subtitle = "先抓取货柜再装船";
      }
    }

    const width = 184;
    const boxX = Math.max(12, Math.min(CANVAS_WIDTH - width - 12, x - width / 2));
    const boxY = Math.max(58, Math.min(CANVAS_HEIGHT - 60, y - 48));
    ctx.save();
    ctx.fillStyle = "rgba(5, 13, 15, 0.94)";
    roundedRect(ctx, boxX, boxY, width, 40, 2);
    ctx.fill();
    ctx.strokeStyle = withAlpha(accent, 0.58);
    ctx.stroke();
    ctx.fillStyle = accent;
    ctx.fillRect(boxX, boxY, 2, 40);
    ctx.fillStyle = "#e7eee8";
    ctx.font = `600 9px ${FONT_SANS}`;
    ctx.fillText(title, boxX + 10, boxY + 16);
    ctx.fillStyle = withAlpha(accent, 0.83);
    ctx.font = `500 7px ${FONT_SANS}`;
    ctx.fillText(truncate(subtitle, 34), boxX + 10, boxY + 29);
    ctx.restore();
  }

  drawFooterMarks(state, view) {
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = "rgba(206, 220, 212, 0.22)";
    ctx.fillStyle = "rgba(206, 220, 212, 0.35)";
    ctx.font = `500 7px ${FONT_COND}`;
    ctx.fillText("0", 907, 742);
    ctx.fillText("50 m", 952, 742);
    ctx.beginPath();
    ctx.moveTo(918, 735);
    ctx.lineTo(918, 738);
    ctx.moveTo(918, 736.5);
    ctx.lineTo(958, 736.5);
    ctx.moveTo(958, 735);
    ctx.lineTo(958, 738);
    ctx.stroke();

    ctx.fillStyle = "rgba(212, 226, 218, 0.25)";
    ctx.font = `600 8px ${FONT_COND}`;
    ctx.fillText("CH 07", 1084, 744);
    ctx.textAlign = "right";
    ctx.fillText("UTC+08  /  01:18", 1160, 744);
    ctx.textAlign = "left";

    if (state.phase === "playing" && state.elapsed === 0) {
      ctx.fillStyle = "rgba(232, 197, 104, 0.72)";
      ctx.font = `600 8px ${FONT_SANS}`;
      ctx.fillText("点击任意垛顶货柜开始计时", 24, 72);
    }
    ctx.restore();
  }
}

function ctxDropGuard(ctx, rect, valid) {
  ctx.save();
  ctx.strokeStyle = valid ? "rgba(105, 215, 173, 0.72)" : "rgba(238, 117, 106, 0.72)";
  ctx.fillStyle = valid ? "rgba(105, 215, 173, 0.055)" : "rgba(238, 117, 106, 0.055)";
  ctx.lineWidth = 1;
  ctx.fillRect(rect.x + 3, rect.y + 3, rect.w - 6, rect.h - 6);
  ctx.setLineDash([5, 5]);
  ctx.strokeRect(rect.x + 7, rect.y + 7, rect.w - 14, rect.h - 14);
  ctx.setLineDash([]);
  ctx.restore();
}

function shadeColor(hex, amount) {
  const clean = hex.replace("#", "");
  const value = parseInt(clean, 16);
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  const mix = amount < 0 ? 0 : 255;
  const ratio = Math.abs(amount);
  const r = Math.round(red + (mix - red) * ratio);
  const g = Math.round(green + (mix - green) * ratio);
  const b = Math.round(blue + (mix - blue) * ratio);
  return `rgb(${r}, ${g}, ${b})`;
}

function withAlpha(hex, alpha) {
  const clean = hex.replace("#", "");
  const value = parseInt(clean, 16);
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
}

function clockLabel(seconds) {
  const value = Math.max(0, Math.ceil(seconds));
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

function truncate(text, length) {
  if (!text) return "";
  return text.length > length ? `${text.slice(0, length - 1)}…` : text;
}
