/* Canvas 渲染：月球基地剖面、四层井道、货梯、气闸压力与低重力标识。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MoonLiftRenderer = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function createRenderer(canvas, engine) {
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;
    const SHAFT = { left: 96, right: 236, top: 40, bottom: H - 48 };
    const PANEL = { left: 264, right: W - 20, top: 40, bottom: H - 48 };

    function yToPixel(y) {
      const maxY = engine.FLOORS[3];
      return SHAFT.bottom - (y / maxY) * (SHAFT.bottom - SHAFT.top);
    }

    function clear() {
      ctx.fillStyle = '#070b14';
      ctx.fillRect(0, 0, W, H);
      drawStars();
    }

    function drawStars() {
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      for (let i = 0; i < 60; i += 1) {
        const x = (i * 137.5) % W;
        const y = (i * 89.3) % (H - 90);
        const r = (i % 3) * 0.5 + 0.4;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    function drawShaft() {
      // 月壤剖面
      ctx.fillStyle = '#1b1f2a';
      ctx.fillRect(SHAFT.left - 34, SHAFT.top, 34, SHAFT.bottom - SHAFT.top);
      ctx.fillRect(SHAFT.right, SHAFT.top, 34, SHAFT.bottom - SHAFT.top);
      ctx.strokeStyle = '#3a4254';
      ctx.lineWidth = 2;
      ctx.strokeRect(SHAFT.left, SHAFT.top,
        SHAFT.right - SHAFT.left, SHAFT.bottom - SHAFT.top);

      engine.FLOORS.forEach((fy, i) => {
        const py = yToPixel(fy);
        ctx.strokeStyle = i === 0 ? '#6b7689' : '#465063';
        ctx.lineWidth = i === 0 ? 3 : 2;
        ctx.beginPath();
        ctx.moveTo(SHAFT.left - 30, py);
        ctx.lineTo(SHAFT.right + 30, py);
        ctx.stroke();

        ctx.fillStyle = '#9fb0c9';
        ctx.font = '13px monospace';
        ctx.textAlign = 'right';
        ctx.fillText(i === 0 ? 'B1 底层' : `F${i} ${fy}m`, SHAFT.left - 40, py + 4);
      });

      // 导轨
      ctx.strokeStyle = '#2c3444';
      ctx.lineWidth = 1;
      [SHAFT.left + 14, SHAFT.right - 14].forEach((x) => {
        ctx.beginPath();
        ctx.moveTo(x, SHAFT.top);
        ctx.lineTo(x, SHAFT.bottom);
        ctx.stroke();
      });
    }

    function drawEnvironment() {
      // 月面地表线与基地穹顶
      const surfaceY = SHAFT.top - 6;
      ctx.strokeStyle = '#6b7689';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(20, surfaceY);
      ctx.lineTo(SHAFT.right + 40, surfaceY);
      ctx.stroke();

      ctx.fillStyle = '#232a38';
      ctx.beginPath();
      ctx.arc(SHAFT.left - 8, surfaceY, 18, Math.PI, 0);
      ctx.fill();
      ctx.strokeStyle = '#5b86c0';
      ctx.stroke();

      // 低重力箭头标识：g = 1.62 m/s²
      const gx = 30;
      const gy = SHAFT.top + 18;
      ctx.strokeStyle = '#9fc0ee';
      ctx.fillStyle = '#9fc0ee';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(gx, gy);
      ctx.lineTo(gx, gy + 34);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(gx - 5, gy + 28);
      ctx.lineTo(gx, gy + 36);
      ctx.lineTo(gx + 5, gy + 28);
      ctx.fill();
      ctx.font = '12px monospace';
      ctx.textAlign = 'left';
      ctx.fillText('g=1.62', gx - 4, gy + 52);
      ctx.fillStyle = '#7f8da3';
      ctx.fillText('月面 1/6g', gx - 4, gy + 68);
    }

    function drawDoor(floorIndex, game) {
      const fy = engine.FLOORS[floorIndex];
      const py = yToPixel(fy);
      const pressure = game.doors.pressure[floorIndex];
      const balanced = pressure >= engine.PRESSURE_TIME;
      const atThisFloor = game.car.y === fy && game.car.status === 'idle';
      const open = atThisFloor && game.doors.open;

      const doorW = 26;
      const doorH = 34;
      const cx = SHAFT.right + 6;
      ctx.fillStyle = open ? '#16351f' : '#222a38';
      ctx.fillRect(cx, py - doorH, doorW, doorH);
      ctx.strokeStyle = balanced ? '#46d17a' : '#e0b34a';
      ctx.lineWidth = 2;
      ctx.strokeRect(cx, py - doorH, doorW, doorH);

      // 压力条
      const ratio = Math.min(1, pressure / engine.PRESSURE_TIME);
      ctx.fillStyle = '#11161f';
      ctx.fillRect(cx + doorW + 6, py - doorH, 8, doorH);
      ctx.fillStyle = balanced ? '#46d17a' : '#e0b34a';
      ctx.fillRect(cx + doorW + 6, py - doorH * ratio, 8, doorH * ratio);
    }

    function drawCar(game) {
      const py = yToPixel(game.car.y);
      const carW = SHAFT.right - SHAFT.left - 24;
      const carH = 38;
      const x = SHAFT.left + 12;
      const y = py - carH;

      const color = {
        idle: '#3d6ea6', accelerating: '#4f93d6', cruising: '#57b8c9',
        braking: '#d68a4f', impact: '#d6534f', undershoot: '#b8862f',
      }[game.car.status] || '#3d6ea6';

      ctx.fillStyle = color;
      ctx.fillRect(x, y, carW, carH);
      ctx.strokeStyle = '#cfe0f5';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x, y, carW, carH);

      // 钢缆
      ctx.strokeStyle = '#8592a6';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + carW / 2, SHAFT.top);
      ctx.lineTo(x + carW / 2, y);
      ctx.stroke();

      // 缓冲器（画在轿厢底部）
      ctx.fillStyle = engine.BUFFERS[game.car.buffer].id === 'magnetic'
        ? '#8f7ad6' : engine.BUFFERS[game.car.buffer].id === 'hydraulic'
          ? '#46d17a' : '#e0b34a';
      for (let i = 0; i < 3; i += 1) {
        ctx.fillRect(x + 8 + i * 30, py - 4, 18, 4);
      }

      // 载货
      ctx.fillStyle = '#f2e9c9';
      ctx.font = '11px monospace';
      ctx.textAlign = 'center';
      const labels = game.cargo.map((id) => engine.EQUIPMENT[id].name);
      labels.forEach((label, i) => {
        ctx.fillText(label, x + carW / 2, y + 15 + i * 12);
      });

      ctx.fillStyle = '#dfe9f7';
      ctx.textAlign = 'left';
      ctx.fillText(`${Math.abs(game.car.velocity).toFixed(1)}m/s`, x + 4, y - 5);
    }

    function drawHud(game) {
      const p = PANEL;
      ctx.fillStyle = '#0e1420';
      ctx.fillRect(p.left, p.top, p.right - p.left, p.bottom - p.top);
      ctx.strokeStyle = '#2a3344';
      ctx.strokeRect(p.left, p.top, p.right - p.left, p.bottom - p.top);

      ctx.textAlign = 'left';
      ctx.fillStyle = '#8fb4e6';
      ctx.font = 'bold 15px monospace';
      ctx.fillText('月面基地货梯控制', p.left + 14, p.top + 24);

      const weight = engine.totalCargoWeight(game);
      const brake = engine.brakingDistance(game);
      const floor = (() => {
        const idx = engine.nearestFloorIndex(game);
        return idx === 0 ? 'B1' : `F${idx}`;
      })();
      const rows = [
        `重力 g = ${engine.G.toFixed(2)} m/s² (1/6 地球)`,
        `缓冲器 = ${engine.BUFFERS[game.car.buffer].name}`,
        `位置 = ${game.car.y.toFixed(1)}m  最近层 ${floor}`,
        `状态 = ${game.car.status}`,
        `载重 = ${weight} kg`,
        `制动距离 = ${brake.toFixed(2)} m`,
        `结构完整度 = ${game.hull}%`,
        `提前开门违规 = ${game.violations}`,
        `已交付 = ${game.delivered.length}/${engine.EQUIP_IDS.length}`,
      ];
      ctx.font = '13px monospace';
      rows.forEach((row, i) => {
        ctx.fillStyle = i === 5 ? '#e0b34a' : '#c7d4e6';
        ctx.fillText(row, p.left + 14, p.top + 52 + i * 22);
      });

      // 停靠计划
      ctx.fillStyle = '#8fb4e6';
      ctx.fillText(`停靠顺序: ${game.plan.map((f) => `F${f}`).join(' → ') || '未设置'}`,
        p.left + 14, p.top + 52 + rows.length * 22 + 8);

      drawLog(game, p.top + 52 + (rows.length + 2) * 22);
    }

    function drawLog(game, startY) {
      ctx.font = '11px monospace';
      const recent = game.log.slice(-8);
      recent.forEach((e, i) => {
        ctx.fillStyle = e.type === 'early-open-blocked' || e.type === 'impact'
          ? '#e07a6f' : e.type === 'win' ? '#46d17a' : '#7f8da3';
        ctx.fillText(`[${e.t.toFixed(1)}s] ${labelFor(e)}`, PANEL.left + 14, startY + i * 15);
      });
    }

    function labelFor(e) {
      switch (e.type) {
        case 'early-open-blocked': return '✖ 气压未平衡，开门被锁';
        case 'pressure-start': return `气闸平衡中 F${e.floor}`;
        case 'pressure-ready': return `气闸平衡完成 F${e.floor}`;
        case 'door-open': return `开门 F${e.floor}`;
        case 'delivered': return `交付 ${engine.EQUIPMENT[e.equipment].name}`;
        case 'impact': return `缓冲碰撞 损伤-${e.damage}`;
        case 'win': return '★ 全部交付，任务成功';
        case 'load': return `装载 ${engine.EQUIPMENT[e.equipment].name}`;
        case 'brake-on': return '制动器启动';
        default: return e.type;
      }
    }

    function render(game) {
      clear();
      drawEnvironment();
      drawShaft();
      engine.FLOORS.forEach((_, i) => drawDoor(i, game));
      drawCar(game);
      drawHud(game);
      if (game.status !== 'running') drawBanner(game);
    }

    function drawBanner(game) {
      ctx.fillStyle = game.status === 'won'
        ? 'rgba(40,140,80,0.85)' : 'rgba(160,50,45,0.85)';
      ctx.fillRect(SHAFT.left, SHAFT.top + 120,
        SHAFT.right - SHAFT.left, 70);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 20px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(game.status === 'won' ? '任务成功' : '任务失败',
        (SHAFT.left + SHAFT.right) / 2, SHAFT.top + 162);
      ctx.textAlign = 'left';
    }

    return {
      ctx, SHAFT, PANEL, yToPixel,
      clear, drawStars, drawShaft, drawDoor, drawCar,
      drawHud, render,
      width: W, height: H,
    };
  }

  return { createRenderer };
});
