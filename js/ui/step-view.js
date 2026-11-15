// Canvas 步进格：4 行 × 16 步，点击切换，播放列高亮。

const ROWS = [
  { id: "kick", label: "底鼓", color: "#e0655a" },
  { id: "snare", label: "军鼓", color: "#e0a05a" },
  { id: "hihat", label: "踩镲", color: "#5ab0e0" },
  { id: "clap", label: "拍手", color: "#9a7ae0" },
];

const MARGIN_L = 70;
const MARGIN_T = 26;
const CELL_H = 44;

export class StepView {
  constructor(canvas, engine) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.engine = engine;
    this.currentStep = -1;
    this._bind();
  }

  cellSize() {
    return (this.canvas.width - MARGIN_L) / 16;
  }

  draw() {
    const { ctx, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const cw = this.cellSize();

    ctx.font = "11px sans-serif";
    ctx.fillStyle = "#8b94a8";
    for (let s = 0; s < 16; s++) {
      ctx.fillText(String(s + 1), MARGIN_L + s * cw + cw / 2 - 5, 16);
    }

    ROWS.forEach((row, r) => {
      const y = MARGIN_T + r * CELL_H;
      ctx.fillStyle = row.color;
      ctx.font = "bold 13px sans-serif";
      ctx.fillText(row.label, 12, y + CELL_H / 2 + 5);

      for (let s = 0; s < 16; s++) {
        const x = MARGIN_L + s * cw;
        const on = this.engine.pattern[row.id][s];
        const playing = s === this.currentStep;
        const beat = s % 4 === 0;

        ctx.fillStyle = playing ? "#2c3550" : beat ? "#1a1e29" : "#161922";
        ctx.strokeStyle = beat ? "#39415a" : "#262b39";
        ctx.lineWidth = 1;
        roundRect(ctx, x + 2, y + 2, cw - 4, CELL_H - 4, 6);
        ctx.fill();
        ctx.stroke();

        if (on) {
          ctx.fillStyle = row.color;
          ctx.beginPath();
          ctx.arc(x + cw / 2, y + CELL_H / 2, 9, 0, Math.PI * 2);
          ctx.fill();
        }
        if (playing) {
          ctx.strokeStyle = "#8fa8ff";
          ctx.lineWidth = 2;
          roundRect(ctx, x + 2, y + 2, cw - 4, CELL_H - 4, 6);
          ctx.stroke();
        }
      }
    });
  }

  _bind() {
    this.canvas.addEventListener("click", (ev) => {
      const rect = this.canvas.getBoundingClientRect();
      const x = (ev.clientX - rect.left) * (this.canvas.width / rect.width);
      const y = (ev.clientY - rect.top) * (this.canvas.height / rect.height);
      const cw = this.cellSize();
      const col = Math.floor((x - MARGIN_L) / cw);
      const row = Math.floor((y - MARGIN_T) / CELL_H);
      if (col < 0 || col > 15 || row < 0 || row > 3) return;
      this.engine.toggleStep(ROWS[row].id, col);
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
