// Canvas2D renderer for the browser. Consumes the same neutral command list
// produced by buildScene(), guaranteeing parity with SVG/PNG exports.
export function renderToCanvas(cmds, canvas, scale = 1) {
  const ctx = canvas.getContext('2d');
  ctx.save();
  ctx.scale(scale, scale);
  for (const cmd of cmds) {
    if (cmd.type === 'rect') {
      ctx.fillStyle = cmd.fill;
      ctx.fillRect(cmd.x, cmd.y, cmd.width, cmd.height);
    } else if (cmd.type === 'line') {
      ctx.strokeStyle = cmd.stroke;
      ctx.lineWidth = cmd.width ?? 1;
      ctx.setLineDash(cmd.dashed ? [5, 4] : []);
      ctx.beginPath();
      ctx.moveTo(cmd.x1, cmd.y1);
      ctx.lineTo(cmd.x2, cmd.y2);
      ctx.stroke();
    } else if (cmd.type === 'text') {
      ctx.fillStyle = cmd.fill;
      ctx.font = cmd.font;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if (cmd.rotate) {
        ctx.save();
        ctx.translate(cmd.x, cmd.y);
        ctx.rotate((cmd.rotate * Math.PI) / 180);
        ctx.fillText(cmd.text, 0, 0);
        ctx.restore();
      } else {
        ctx.fillText(cmd.text, cmd.x, cmd.y);
      }
    }
  }
  ctx.setLineDash([]);
  ctx.restore();
}
