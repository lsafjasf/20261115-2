// Canvas 节点连线视图：绘制节点、端口、连线，支持拖拽连线与点击删除。

const NODE_W = 132;
const NODE_H = 64;

const LAYOUT = {
  kick: { x: 40, y: 40, label: "底鼓", color: "#e0655a" },
  snare: { x: 40, y: 140, label: "军鼓", color: "#e0a05a" },
  hihat: { x: 40, y: 240, label: "踩镲", color: "#5ab0e0" },
  clap: { x: 40, y: 340, label: "拍手", color: "#9a7ae0" },
  filter: { x: 360, y: 90, label: "滤波", color: "#4f8ef7" },
  delay: { x: 360, y: 260, label: "延迟", color: "#46c28a" },
  bus: { x: 700, y: 180, label: "总线增益", color: "#d0d5e0" },
};

export class GraphView {
  constructor(canvas, engine, onMessage) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.engine = engine;
    this.onMessage = onMessage;
    this.drag = null;
    this.hover = null;
    this.ports = { in: {}, out: {} };
    this._bind();
  }

  portPositions() {
    const ins = {};
    const outs = {};
    for (const [id, n] of Object.entries(LAYOUT)) {
      outs[id] = { x: n.x + NODE_W, y: n.y + NODE_H / 2 };
      ins[id] = { x: n.x, y: n.y + NODE_H / 2 };
    }
    return { in: ins, out: outs };
  }

  draw() {
    const { ctx, canvas } = this;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    this.ports = this.portPositions();

    // 连线
    for (const edge of this.engine.edges) {
      const a = this.ports.out[edge.src];
      const b = this.ports.in[edge.dst];
      if (!a || !b) continue;
      const cycle = this._isInDelayLoop(edge);
      this._drawCurve(a, b, cycle ? "#f2b950" : "#6f86c9");
    }

    // 拖拽中的临时连线
    if (this.drag) {
      this._drawCurve(this.ports.out[this.drag.src], this.drag, "#8fa8ff");
    }

    // 节点
    const swallowed = new Set(this.engine.swallowed || []);
    for (const [id, n] of Object.entries(LAYOUT)) {
      this._drawNode(id, n, swallowed.has(id));
    }
  }

  _isInDelayLoop(edge) {
    // 简单判断：边处于含 delay 的环上
    const e = this.engine;
    const hasPath = (from, to) => {
      const stack = [from];
      const seen = new Set();
      while (stack.length) {
        const id = stack.pop();
        if (id === to) return true;
        if (seen.has(id)) continue;
        seen.add(id);
        for (const ed of e.edges) if (ed.src === id) stack.push(ed.dst);
      }
      return false;
    };
    return hasPath(edge.dst, "delay") && hasPath("delay", edge.src);
  }

  _drawCurve(a, b, color) {
    const { ctx } = this;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    const cx = (a.x + b.x) / 2;
    ctx.bezierCurveTo(cx, a.y, cx, b.y, b.x, b.y);
    ctx.stroke();
  }

  _drawNode(id, n, swallowed) {
    const { ctx } = this;
    const bypassed = this.engine.isBypassed && this.engine.isBypassed(id);
    ctx.save();
    ctx.globalAlpha = swallowed ? 0.45 : 1;
    ctx.fillStyle = "#222633";
    ctx.strokeStyle = bypassed ? "#f2b950" : n.color;
    ctx.lineWidth = 2;
    roundRect(ctx, n.x, n.y, NODE_W, NODE_H, 10);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = n.color;
    ctx.font = "bold 14px sans-serif";
    ctx.fillText(n.label, n.x + 14, n.y + 26);

    ctx.font = "11px sans-serif";
    ctx.fillStyle = swallowed ? "#ff8f8f" : "#8b94a8";
    ctx.fillText(swallowed ? "⚠ 节拍被吞" : bypassed ? "旁路中" : id === "bus" ? "终点" : "声源/效果", n.x + 14, n.y + 48);

    // 端口
    if (id !== "bus") {
      this._drawPort(this.ports.out[id], n.color);
    }
    if (id !== "kick" && id !== "snare" && id !== "hihat" && id !== "clap") {
      this._drawPort(this.ports.in[id], "#aab4cc");
    }
    ctx.restore();
  }

  _drawPort(p, color) {
    const { ctx } = this;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = "#12141a";
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  _bind() {
    const pos = (ev) => {
      const r = this.canvas.getBoundingClientRect();
      return {
        x: (ev.clientX - r.left) * (this.canvas.width / r.width),
        y: (ev.clientY - r.top) * (this.canvas.height / r.height),
      };
    };
    const hitPort = (p, map) => {
      for (const [id, q] of Object.entries(map)) {
        if (Math.hypot(p.x - q.x, p.y - q.y) <= 9) return id;
      }
      return null;
    };

    this.canvas.addEventListener("mousedown", (ev) => {
      const p = pos(ev);
      const outId = hitPort(p, this.ports.out);
      if (outId) {
        this.drag = { ...p, src: outId };
        return;
      }
      const edge = this.engine.edgeAt(p.x, p.y, this.ports);
      if (edge) {
        const res = this.engine.removeEdge(edge.src, edge.dst);
        if (res.ok) {
          this.onMessage(`已删除连线 ${edge.src} → ${edge.dst}`, "ok");
          if (res.swallowed.length) {
            this.onMessage(`警告：${res.swallowed.join("、")} 的节拍无法到达总线`, "err");
          }
        }
        this.draw();
      }
    });

    this.canvas.addEventListener("mousemove", (ev) => {
      if (this.drag) this.drag = { ...pos(ev), src: this.drag.src };
      this.draw();
    });

    this.canvas.addEventListener("mouseup", (ev) => {
      if (!this.drag) return;
      const p = pos(ev);
      const inId = hitPort(p, this.ports.in);
      if (inId) {
        const res = this.engine.addEdge(this.drag.src, inId);
        if (!res.ok) this.onMessage(res.reason, "err");
        else if (res.warning) this.onMessage(res.warning, "err");
        else this.onMessage(`已连接 ${this.drag.src} → ${inId}`, "ok");
        if (res.ok && res.swallowed && res.swallowed.length) {
          this.onMessage(`警告：${res.swallowed.join("、")} 的节拍无法到达总线`, "err");
        }
      }
      this.drag = null;
      this.draw();
    });
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
