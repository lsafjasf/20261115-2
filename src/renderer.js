import {
  EDGES,
  EDGE_BY_ID,
  JUNCTIONS,
  NODES,
  NODE_BY_ID,
  STATIONS,
  WORLD,
  findPath,
  getNode,
} from "./graph.js";

const FONT_SANS = '"Noto Sans SC", sans-serif';
const FONT_MONO = '"Noto Sans SC", monospace';

function roundRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, r);
}

function seeded(index) {
  return (Math.sin(index * 12.9898 + 78.233) * 43758.5453) % 1;
}

function positiveSeeded(index) {
  return Math.abs(seeded(index));
}

export class TunnelRenderer {
  constructor(canvas, simulation) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.simulation = simulation;
    this.selectedPodId = simulation.pods[0]?.id ?? null;
    this.width = 0;
    this.height = 0;
    this.dpr = 1;
    this.lastFrame = 0;
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();
  }

  setSimulation(simulation) {
    this.simulation = simulation;
    this.selectedPodId = simulation.pods[0]?.id ?? null;
  }

  setSelectedPod(podId) {
    this.selectedPodId = podId;
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = Math.max(1, Math.round(rect.width));
    this.height = Math.max(1, Math.round(rect.height));
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
  }

  transform() {
    const paddingX = 18;
    const paddingTop = 18;
    const paddingBottom = 8;
    const scale = Math.min(
      (this.width - paddingX * 2) / WORLD.width,
      (this.height - paddingTop - paddingBottom) / WORLD.height,
    );
    const offsetX = (this.width - WORLD.width * scale) / 2;
    const offsetY = paddingTop + (this.height - paddingTop - paddingBottom - WORLD.height * scale) / 2;
    return { scale, offsetX, offsetY };
  }

  render(time) {
    const ctx = this.ctx;
    const dpr = this.dpr;
    const dt = this.lastFrame ? Math.min(0.05, (time - this.lastFrame) / 1000) : 0.016;
    this.lastFrame = time;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);

    this.drawBackground(ctx, time);
    const transform = this.transform();
    ctx.save();
    ctx.translate(transform.offsetX, transform.offsetY);
    ctx.scale(transform.scale, transform.scale);

    this.drawDepthScale(ctx);
    this.drawTunnelNetwork(ctx, time, dt);
    this.drawRoutePreview(ctx, time);
    this.drawOccupancy(ctx, time);
    this.drawNodes(ctx, time);
    this.drawPods(ctx, time);

    ctx.restore();
  }

  drawBackground(ctx, time) {
    const gradient = ctx.createLinearGradient(0, 0, 0, this.height);
    gradient.addColorStop(0, "#091310");
    gradient.addColorStop(0.5, "#08110f");
    gradient.addColorStop(1, "#060d0b");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, this.width, this.height);

    ctx.save();
    ctx.strokeStyle = "rgba(145, 186, 168, 0.033)";
    ctx.lineWidth = 1;
    for (let y = 16; y < this.height; y += 42) {
      ctx.beginPath();
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(this.width, y + 0.5);
      ctx.stroke();
    }
    for (let x = 20; x < this.width; x += 54) {
      ctx.beginPath();
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, this.height);
      ctx.stroke();
    }

    const horizon = this.height * 0.27;
    for (let layer = 0; layer < 7; layer += 1) {
      ctx.beginPath();
      for (let x = 0; x <= this.width; x += 18) {
        const y =
          horizon + layer * 34 +
          Math.sin(x * 0.011 + layer * 2.1) * (6 + layer) +
          Math.sin(x * 0.003 + layer) * 8;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = `rgba(111, 147, 128, ${0.018 + layer * 0.005})`;
      ctx.stroke();
    }
    ctx.restore();

    const glow = ctx.createRadialGradient(
      this.width * 0.5,
      this.height * 0.52,
      20,
      this.width * 0.5,
      this.height * 0.52,
      this.width * 0.55,
    );
    glow.addColorStop(0, "rgba(79, 158, 127, 0.075)");
    glow.addColorStop(1, "rgba(79, 158, 127, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, this.width, this.height);

    ctx.fillStyle = "rgba(135, 173, 156, 0.16)";
    ctx.font = `8px ${FONT_MONO}`;
    ctx.fillText("STRATUM 03 / CLAY + ANCHOR ROCK", 27, this.height - 17);
    ctx.fillText("CUTAWAY VIEW — NOT TO SCALE", this.width - 180, this.height - 17);
  }

  drawDepthScale(ctx) {
    ctx.save();
    ctx.strokeStyle = "rgba(141, 178, 160, 0.13)";
    ctx.fillStyle = "rgba(118, 150, 135, 0.45)";
    ctx.lineWidth = 1;
    ctx.font = `7px ${FONT_MONO}`;
    const x = WORLD.width - 9;
    ctx.beginPath();
    ctx.moveTo(x, 70);
    ctx.lineTo(x, WORLD.height - 38);
    ctx.stroke();
    for (let y = 70; y <= WORLD.height - 38; y += 26) {
      ctx.beginPath();
      ctx.moveTo(x - 6, y + 0.5);
      ctx.lineTo(x + 3, y + 0.5);
      ctx.stroke();
      if (y % 104 === 70) {
        ctx.fillText(`-${Math.round((y - 40) / 2)}m`, x - 31, y + 2.5);
      }
    }
    ctx.restore();
  }

  edgePath(ctx, edge) {
    const from = NODE_BY_ID[edge.a];
    const to = NODE_BY_ID[edge.b];
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.quadraticCurveTo(edge.control.x, edge.control.y, to.x, to.y);
  }

  edgePoint(edge, t) {
    const from = NODE_BY_ID[edge.a];
    const to = NODE_BY_ID[edge.b];
    const inverse = 1 - t;
    return {
      x:
        inverse * inverse * from.x +
        2 * inverse * t * edge.control.x +
        t * t * to.x,
      y:
        inverse * inverse * from.y +
        2 * inverse * t * edge.control.y +
        t * t * to.y,
    };
  }

  edgeAngle(edge, t) {
    const from = NODE_BY_ID[edge.a];
    const to = NODE_BY_ID[edge.b];
    return Math.atan2(
      2 * (1 - t) * (edge.control.y - from.y) + 2 * t * (to.y - edge.control.y),
      2 * (1 - t) * (edge.control.x - from.x) + 2 * t * (to.x - edge.control.x),
    );
  }

  drawTunnelNetwork(ctx, time, dt) {
    for (const edge of EDGES) {
      this.edgePath(ctx, edge);
      ctx.lineCap = "round";
      ctx.strokeStyle = "#030706";
      ctx.lineWidth = 43;
      ctx.stroke();

      this.edgePath(ctx, edge);
      ctx.strokeStyle = "#15241f";
      ctx.lineWidth = 34;
      ctx.stroke();

      this.edgePath(ctx, edge);
      ctx.strokeStyle = "#243d34";
      ctx.lineWidth = 25;
      ctx.stroke();

      this.edgePath(ctx, edge);
      ctx.strokeStyle = "rgba(5, 13, 11, 0.95)";
      ctx.lineWidth = 17;
      ctx.stroke();

      this.edgePath(ctx, edge);
      ctx.strokeStyle = "rgba(109, 194, 158, 0.16)";
      ctx.lineWidth = 11;
      ctx.stroke();

      this.edgePath(ctx, edge);
      ctx.setLineDash([2, 13]);
      ctx.lineDashOffset = -time * 0.015;
      ctx.strokeStyle = "rgba(143, 240, 199, 0.18)";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.setLineDash([]);

      this.drawTunnelSeams(ctx, edge);
      this.drawTunnelParticles(ctx, edge, time);
    }
  }

  drawTunnelSeams(ctx, edge) {
    for (let index = 1; index < 5; index += 1) {
      const t = index / 5;
      const point = this.edgePoint(edge, t);
      const angle = this.edgeAngle(edge, t);
      ctx.save();
      ctx.translate(point.x, point.y);
      ctx.rotate(angle);
      ctx.strokeStyle = "rgba(140, 174, 157, 0.13)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, -15);
      ctx.lineTo(0, 15);
      ctx.stroke();
      ctx.restore();
    }
  }

  drawTunnelParticles(ctx, edge, time) {
    const active =
      this.simulation.running &&
      this.simulation.occupancy.has(edge.id) &&
      !this.simulation.blockedEdges.has(edge.id);
    if (!active) return;
    ctx.save();
    for (let index = 0; index < 5; index += 1) {
      const offset = positiveSeeded(index + EDGES.indexOf(edge));
      const t = (time * 0.00012 + offset) % 1;
      const point = this.edgePoint(edge, t);
      ctx.fillStyle = `rgba(143, 240, 199, ${0.08 + (index % 2) * 0.05})`;
      ctx.beginPath();
      ctx.arc(point.x, point.y, 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  drawOccupancy(ctx, time) {
    for (const [edgeId, podId] of this.simulation.occupancy) {
      const edge = EDGE_BY_ID[edgeId];
      const pod = this.simulation.podById.get(podId);
      if (!edge || !pod) continue;
      const faulted = this.simulation.blockedEdges.has(edgeId);
      const color = faulted ? "#ff6f69" : pod.color;

      this.edgePath(ctx, edge);
      ctx.lineCap = "round";
      ctx.strokeStyle = color;
      ctx.globalAlpha = faulted ? 0.18 + Math.sin(time * 0.008) * 0.06 : 0.1;
      ctx.lineWidth = 31;
      ctx.stroke();
      ctx.globalAlpha = 1;

      this.edgePath(ctx, edge);
      ctx.setLineDash(faulted ? [5, 4] : [15, 7]);
      ctx.lineDashOffset = faulted ? time * 0.02 : -time * 0.008;
      ctx.strokeStyle = color;
      ctx.globalAlpha = faulted ? 0.95 : 0.5;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;

      this.drawOccupancyTag(ctx, edge, pod, faulted, time);
    }
  }

  drawOccupancyTag(ctx, edge, pod, faulted, time) {
    const point = this.edgePoint(edge, 0.5);
    const pulse = faulted ? 0.72 + Math.sin(time * 0.01) * 0.2 : 0.7;
    const label = faulted ? "闭锁" : "占用";
    ctx.save();
    ctx.translate(point.x, point.y - 24);
    ctx.globalAlpha = pulse;
    roundRect(ctx, -16, -7, 32, 13, 2);
    ctx.fillStyle = "rgba(8, 13, 12, 0.88)";
    ctx.fill();
    ctx.strokeStyle = faulted ? "rgba(255, 111, 105, 0.5)" : `${pod.color}88`;
    ctx.lineWidth = 0.7;
    ctx.stroke();
    ctx.fillStyle = faulted ? "#ff9d98" : pod.color;
    ctx.font = `6px ${FONT_SANS}`;
    ctx.textAlign = "center";
    ctx.fillText(label, 0, 2.1);
    ctx.restore();
  }

  drawRoutePreview(ctx, time) {
    const pod = this.simulation.podById.get(this.selectedPodId);
    if (!pod || pod.state === "complete" || pod.state === "faulted") return;
    if (!pod.legNodes.length) return;

    ctx.save();
    ctx.strokeStyle = pod.color;
    ctx.globalAlpha = 0.4;
    ctx.lineWidth = 1.2;
    ctx.setLineDash([5, 6]);
    ctx.lineDashOffset = -time * 0.012;

    for (let index = 0; index < pod.legNodes.length - 1; index += 1) {
      const edge = EDGE_BY_ID[pod.legEdges[index]];
      if (!edge) continue;
      const a = pod.legNodes[index];
      this.edgePath(ctx, edge.a === a ? edge : { ...edge, a: edge.b, b: edge.a, control: edge.control });
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.restore();
  }

  drawNodes(ctx, time) {
    for (const junction of JUNCTIONS) {
      this.drawJunction(ctx, junction, time);
    }
    for (const station of STATIONS) {
      this.drawStation(ctx, station, time);
    }
  }

  drawStation(ctx, node, time) {
    const pod = this.simulation.pods.find(
      (candidate) =>
        candidate.currentNode === node.id &&
        ["waiting", "dwelling", "ready", "complete"].includes(candidate.state),
    );
    const selected = pod && this.simulation.pods.filter((p) => p.currentNode === node.id).length;
    const active = this.simulation.pods.some(
      (candidate) =>
        candidate.currentNode === node.id || candidate.nextNode === node.id,
    );

    ctx.save();
    ctx.translate(node.x, node.y);
    ctx.fillStyle = "rgba(7, 13, 11, 0.94)";
    roundRect(ctx, -38, -24, 76, 48, 7);
    ctx.fill();
    ctx.strokeStyle = active ? "rgba(143, 240, 199, 0.26)" : "rgba(130, 163, 146, 0.2)";
    ctx.lineWidth = 1;
    ctx.stroke();

    roundRect(ctx, -31, -17, 62, 34, 4);
    ctx.fillStyle = "#0d1815";
    ctx.fill();
    ctx.strokeStyle = "rgba(137, 180, 157, 0.11)";
    ctx.stroke();

    ctx.fillStyle = "rgba(143, 240, 199, 0.7)";
    ctx.fillRect(-24, -17, 1, 5);
    ctx.fillRect(23, 12, 1, 5);

    ctx.fillStyle = "#bacbc4";
    ctx.font = `9px ${FONT_SANS}`;
    ctx.textAlign = "center";
    ctx.fillText(node.name, 0, 2);

    ctx.fillStyle = "rgba(110, 142, 127, 0.7)";
    ctx.font = `6px ${FONT_MONO}`;
    ctx.fillText(node.code, 0, 14);

    if (pod) {
      ctx.beginPath();
      ctx.arc(28, -15, 3, 0, Math.PI * 2);
      ctx.fillStyle = pod.color;
      ctx.globalAlpha = 0.65 + Math.sin(time * 0.006) * 0.2;
      ctx.fill();
      ctx.globalAlpha = 1;
      if (selected > 1) {
        ctx.fillStyle = "#ffc36c";
        ctx.font = `6px ${FONT_MONO}`;
        ctx.fillText(`×${selected}`, 28, -10);
      }
    }
    ctx.restore();
  }

  drawJunction(ctx, node, time) {
    const occupied = this.simulation.pods.some(
      (pod) =>
        (pod.currentNode === node.id || pod.nextNode === node.id) &&
        pod.state !== "complete",
    );
    ctx.save();
    ctx.translate(node.x, node.y);

    ctx.beginPath();
    for (let side = 0; side < 6; side += 1) {
      const angle = Math.PI / 6 + (side * Math.PI) / 3;
      const x = Math.cos(angle) * 23;
      const y = Math.sin(angle) * 23;
      if (side === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = "#07110e";
    ctx.fill();
    ctx.strokeStyle = occupied ? "rgba(255, 195, 108, 0.55)" : "rgba(133, 172, 152, 0.26)";
    ctx.lineWidth = 1.2;
    ctx.stroke();

    ctx.rotate(time * 0.00018);
    ctx.strokeStyle = "rgba(143, 240, 199, 0.26)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-8, 0);
    ctx.lineTo(8, 0);
    ctx.moveTo(0, -8);
    ctx.lineTo(0, 8);
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.translate(node.x, node.y + 32);
    ctx.fillStyle = "rgba(110, 137, 125, 0.74)";
    ctx.font = `6px ${FONT_MONO}`;
    ctx.textAlign = "center";
    ctx.fillText(node.code, 0, 0);
    ctx.restore();
  }

  drawPods(ctx, time) {
    const nodeCounts = new Map();
    for (const pod of this.simulation.pods) {
      if (pod.currentEdge) {
        this.drawMovingPod(ctx, pod, time);
        continue;
      }
      const count = nodeCounts.get(pod.currentNode) ?? 0;
      nodeCounts.set(pod.currentNode, count + 1);
      this.drawStationaryPod(ctx, pod, count, time);
    }
  }

  podTransform(pod) {
    if (!pod.currentEdge) return null;
    const edge = EDGE_BY_ID[pod.currentEdge];
    if (!edge) return null;
    const t = pod.currentNode === edge.a ? pod.progress : 1 - pod.progress;
    const point = this.edgePoint(edge, t);
    const angle =
      pod.currentNode === edge.a ? this.edgeAngle(edge, t) : this.edgeAngle(edge, t) + Math.PI;
    return { point, angle, edge };
  }

  drawMovingPod(ctx, pod, time) {
    const transform = this.podTransform(pod);
    if (!transform) return;
    const { point, angle } = transform;
    const selected = pod.id === this.selectedPodId;
    const faulted = pod.state === "faulted";

    ctx.save();
    ctx.translate(point.x, point.y);
    ctx.rotate(angle);

    if (faulted) {
      const alarm = 0.55 + Math.sin(time * 0.018) * 0.25;
      ctx.strokeStyle = `rgba(255, 111, 105, ${alarm})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(-3, 0, 20 + Math.sin(time * 0.011) * 3, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.shadowColor = faulted ? "#ff6f69" : pod.color;
    ctx.shadowBlur = selected ? 20 : 10;
    roundRect(ctx, -21, -8, 42, 16, 8);
    ctx.fillStyle = "#0b1412";
    ctx.fill();
    ctx.shadowBlur = 0;

    const body = ctx.createLinearGradient(-18, -8, 18, 8);
    body.addColorStop(0, "#26352f");
    body.addColorStop(0.52, "#16231f");
    body.addColorStop(1, "#2e433b");
    roundRect(ctx, -19, -7, 38, 14, 7);
    ctx.fillStyle = body;
    ctx.fill();
    ctx.strokeStyle = faulted ? "rgba(255, 111, 105, 0.85)" : `${pod.color}bb`;
    ctx.lineWidth = 1;
    ctx.stroke();

    roundRect(ctx, -12, -4.2, 17, 8.4, 3.5);
    ctx.fillStyle = faulted ? "rgba(255, 111, 105, 0.2)" : `${pod.color}24`;
    ctx.fill();
    ctx.strokeStyle = faulted ? "rgba(255, 111, 105, 0.65)" : `${pod.color}80`;
    ctx.lineWidth = 0.6;
    ctx.stroke();

    ctx.fillStyle = faulted ? "#ff6f69" : pod.color;
    ctx.globalAlpha = 0.8;
    ctx.fillRect(10, -5, 4, 10);
    ctx.globalAlpha = 1;

    for (let led = 0; led < 3; led += 1) {
      ctx.beginPath();
      ctx.arc(21 + led * 3, -2.5 + led * 2.5, 0.8, 0, Math.PI * 2);
      ctx.fillStyle = faulted ? "#ff6f69" : pod.color;
      ctx.fill();
    }
    ctx.restore();

    ctx.save();
    ctx.translate(point.x, point.y);
    ctx.fillStyle = "rgba(5, 9, 8, 0.8)";
    roundRect(ctx, -18, -24, 36, 10, 2);
    ctx.fill();
    ctx.fillStyle = faulted ? "#ff9d98" : pod.color;
    ctx.font = `5.7px ${FONT_MONO}`;
    ctx.textAlign = "center";
    ctx.fillText(faulted ? "FAULT" : pod.name.split("-")[0], 0, -16.8);
    ctx.restore();
  }

  drawStationaryPod(ctx, pod, offset, time) {
    if (pod.state === "complete") return;
    const node = getNode(pod.currentNode);
    if (!node) return;
    const selected = pod.id === this.selectedPodId;
    const faulted = pod.state === "faulted";
    const x = node.x + (offset - 0.5) * 19;
    const y = node.y + 30 + (offset % 2) * 6;

    ctx.save();
    ctx.translate(x, y);
    if (selected) {
      ctx.strokeStyle = `${pod.color}55`;
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.arc(0, 0, 13 + Math.sin(time * 0.004) * 1.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.shadowColor = faulted ? "#ff6f69" : pod.color;
    ctx.shadowBlur = 9;
    roundRect(ctx, -14, -4, 28, 8, 4);
    ctx.fillStyle = "#14201d";
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = faulted ? "rgba(255, 111, 105, 0.8)" : `${pod.color}aa`;
    ctx.lineWidth = 0.8;
    ctx.stroke();
    ctx.fillStyle = faulted ? "#ff6f69" : pod.color;
    ctx.fillRect(-9, -2.2, 8, 4.4);
    ctx.restore();
  }
}
