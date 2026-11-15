import { Game, SIZES, CONFIG } from './engine.js';
import { SoundBoard } from './audio.js';

const canvas = document.getElementById('stage');
const ctx = canvas.getContext('2d');
const W = canvas.width;
const H = canvas.height;
const SIZE_CN = { small: '小', large: '大' };
const SIZE_COLOR = { small: '#6fc6ff', large: '#ffb35c' };

const game = new Game({ seed: (Math.random() * 0xffffffff) >>> 0 });
const sound = new SoundBoard();
let last = performance.now();
let alertUntil = 0;

const $ = (id) => document.getElementById(id);
const els = {
  banner: $('banner'), freq: $('freq'), freqVal: $('freq-val'),
  hs: $('hopper-small'), hl: $('hopper-large'), divert: $('divert'),
  clear: $('clear'), reject: $('reject'), restart: $('restart'), mute: $('mute'),
  good: $('st-good'), waste: $('st-waste'), div: $('st-div'), clr: $('st-clear'),
  batch: $('st-batch'), buf: $('st-buf'),
};

els.freq.addEventListener('input', () => {
  sound.ensure();
  game.setFrequency(Number(els.freq.value));
  els.freqVal.textContent = String(game.frequency);
});
els.hs.addEventListener('click', () => {
  sound.ensure();
  game.setPaused(SIZES.SMALL, !game.hoppers.small.paused);
});
els.hl.addEventListener('click', () => {
  sound.ensure();
  game.setPaused(SIZES.LARGE, !game.hoppers.large.paused);
});
els.divert.addEventListener('click', () => {
  sound.ensure();
  game.setDivert(!game.divert);
});
els.clear.addEventListener('click', () => {
  sound.ensure();
  sound.clear();
  game.clearBuffer();
});
els.reject.addEventListener('click', () => {
  sound.ensure();
  if (game.rejectBottle()) sound.rejectBottle();
});
els.restart.addEventListener('click', () => {
  game.reset();
  alertUntil = 0;
  els.banner.classList.remove('alert');
  syncControls();
});
els.mute.addEventListener('click', () => {
  sound.ensure();
  sound.setMuted(!sound.muted);
  els.mute.textContent = sound.muted ? '声音：关' : '声音：开';
});

function flash(msg, ms = 2600) {
  els.banner.textContent = msg;
  els.banner.classList.add('alert');
  alertUntil = performance.now() + ms;
}

function handleEvents() {
  for (const ev of game.drainEvents()) {
    switch (ev.type) {
      case 'divert': sound.divert(); flash(`剔除机构排走一枚${SIZE_CN[ev.size]}药片`); break;
      case 'fill': sound.fill(); break;
      case 'contaminate':
        flash(ev.kind === 'mixed_batch'
          ? '混批污染！上一批药片进入新瓶，必须剔除该瓶并清空缓存'
          : '错药进瓶！当前瓶已不良，请及时剔除');
        break;
      case 'bottle-good': flash(`第 ${ev.total} 瓶合格下线`); break;
      case 'bottle-reject': sound.rejectBottle(); flash(`不良瓶已剔除（废瓶计数 +1）`); break;
      case 'batch-change':
        sound.batch();
        flash('换批！请立刻清空缓存，否则上一批药片会污染新批次');
        break;
      case 'win': sound.win(); flash('成功：十二瓶全部合格，灌装线完工！', 1e9); break;
      case 'lose': sound.lose(); flash(`失败：${game.lossReason === 'waste_bottle_limit' ? '废瓶超过两瓶' : '未达目标'}`, 1e9); break;
      default: break;
    }
  }
  if (performance.now() > alertUntil && els.banner.classList.contains('alert')
      && game.status === 'running') {
    els.banner.classList.remove('alert');
    els.banner.textContent = `当前批次要求：${SIZE_CN[game.requiredSize]}药片`;
  }
}

function syncControls() {
  els.freq.value = String(game.frequency);
  els.freqVal.textContent = String(game.frequency);
  els.hs.textContent = `小药片料斗：${game.hoppers.small.paused ? '已暂停' : '运行'}`;
  els.hl.textContent = `大药片料斗：${game.hoppers.large.paused ? '已暂停' : '运行'}`;
  els.hs.classList.toggle('on', !game.hoppers.small.paused);
  els.hl.classList.toggle('on', !game.hoppers.large.paused);
  els.divert.textContent = `剔除机构：${game.divert ? '开（药片进废槽）' : '关'}`;
  els.divert.classList.toggle('on', game.divert);
  els.reject.disabled = !(game.activeBottle && game.activeBottle.bad);
  els.good.textContent = `${game.goodBottles} / ${CONFIG.TARGET_BOTTLES}`;
  els.waste.textContent = `${game.wasteBottles} / ${CONFIG.MAX_WASTE_BOTTLES}`;
  els.div.textContent = String(game.divertedPills);
  els.clr.textContent = String(game.clearActions);
  els.buf.textContent = `${game.buffer.length} / ${CONFIG.BUFFER_CAPACITY}`;
  const req = SIZE_CN[game.requiredSize];
  els.batch.textContent = `${game.batchIndex + 1} / ${CONFIG.BATCH_ORDER.length}（${req}）`;
}

function drawPill(x, y, size, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  const r = size === SIZES.SMALL ? 9 : 14;
  ctx.fillStyle = SIZE_COLOR[size];
  ctx.strokeStyle = 'rgba(0,0,0,.45)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(x, y, r * 1.5, r, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,.55)';
  ctx.beginPath();
  ctx.moveTo(x - r * 0.7, y);
  ctx.lineTo(x + r * 0.7, y);
  ctx.stroke();
  ctx.restore();
}

function drawHopper(x, size, h) {
  const paused = h.paused;
  ctx.save();
  const shake = paused ? 0 : (game.frequency - 1) * 0.9;
  const sx = x + (Math.sin(performance.now() / 28) * shake);
  ctx.translate(sx, 0);
  ctx.fillStyle = paused ? '#3a3f47' : '#2c3746';
  ctx.strokeStyle = '#4d5c72';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x - 55, 60);
  ctx.lineTo(x + 55, 60);
  ctx.lineTo(x + 26, 150);
  ctx.lineTo(x - 26, 150);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#9fb4cc';
  ctx.font = '13px system-ui';
  ctx.textAlign = 'center';
  ctx.fillText(`${SIZE_CN[size]}药片料斗`, x, 42);
  // 料斗内可见药片
  for (let i = 0; i < 4; i++) drawPill(x - 24 + i * 16, 95 + (i % 2) * 14, size);
  if (paused) {
    ctx.fillStyle = '#ff8a8a';
    ctx.font = 'bold 15px system-ui';
    ctx.fillText('⏸ 已暂停', x, 182);
  }
  ctx.restore();
  ctx.textAlign = 'left';
}

function drawBottle(x, y, bottle, active) {
  const c = CONFIG;
  ctx.save();
  ctx.strokeStyle = bottle && bottle.bad ? '#ff6b6b' : active ? '#8fd6a5' : '#6b7a8d';
  ctx.fillStyle = 'rgba(255,255,255,.04)';
  ctx.lineWidth = active ? 3 : 2;
  // 瓶身
  ctx.beginPath();
  ctx.moveTo(x - 20, y - 58);
  ctx.lineTo(x - 20, y + 34);
  ctx.quadraticCurveTo(x, y + 46, x + 20, y + 34);
  ctx.lineTo(x + 20, y - 58);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // 瓶口
  ctx.strokeRect(x - 12, y - 70, 24, 12);
  // 已装药片（从瓶底向上叠）
  if (bottle) {
    for (let i = 0; i < bottle.pills.length; i++) {
      const py = y + 22 - i * 16;
      drawPill(x, py, bottle.pills[i].size, 0.95);
    }
    ctx.fillStyle = '#c7d2df';
    ctx.font = '12px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(`${bottle.pills.length}/${c.PILLS_PER_BOTTLE}`, x, y + 64);
    if (bottle.bad) {
      ctx.fillStyle = '#ff6b6b';
      ctx.font = 'bold 13px system-ui';
      ctx.fillText(bottle.reason === 'mixed_batch' ? '混批' : '不良', x, y - 84);
    }
  }
  ctx.restore();
  ctx.textAlign = 'left';
}

function render() {
  ctx.clearRect(0, 0, W, H);
  const c = CONFIG;

  // 批次横幅
  ctx.fillStyle = '#1c2735';
  ctx.fillRect(0, 0, W, 30);
  ctx.fillStyle = '#cfe0f5';
  ctx.font = 'bold 15px system-ui';
  ctx.textAlign = 'left';
  const cleared = game.batchCleared[game.batchIndex];
  ctx.fillText(
    `第 ${game.batchIndex + 1}/${c.BATCH_ORDER.length} 批 · 要求：${SIZE_CN[game.requiredSize]}药片`
    + ` · 每批 ${c.BATCH_SIZES[game.batchIndex]} 瓶 · 缓存状态：${cleared ? '已清空' : '未清空 ⚠'}`, 14, 20);

  // 料斗
  drawHopper(180, SIZES.SMALL, game.hoppers.small);
  drawHopper(400, SIZES.LARGE, game.hoppers.large);

  // 滑道
  ctx.strokeStyle = '#44526a';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(180, 152); ctx.lineTo(290, 250);
  ctx.moveTo(400, 152); ctx.lineTo(290, 250);
  ctx.moveTo(290, 250); ctx.lineTo(290, 300);
  ctx.stroke();

  // 缓存区（8 格 FIFO 队列）
  const cap = c.BUFFER_CAPACITY;
  const slotW = 52;
  const startX = 120;
  const bufY = 300;
  ctx.fillStyle = '#11161d';
  ctx.strokeStyle = '#39465a';
  ctx.lineWidth = 1.5;
  ctx.fillRect(startX - 14, bufY - 26, cap * slotW + 28, 52);
  ctx.strokeRect(startX - 14, bufY - 26, cap * slotW + 28, 52);
  ctx.fillStyle = '#9fb4cc';
  ctx.font = '12px system-ui';
  ctx.fillText('缓存（FIFO，容量 8）→ 队首', startX - 14, bufY - 34);
  for (let i = 0; i < cap; i++) {
    const x = startX + i * slotW + slotW / 2;
    ctx.strokeStyle = '#2a3545';
    ctx.strokeRect(x - slotW / 2 + 2, bufY - 20, slotW - 4, 40);
    if (game.buffer[i]) drawPill(x, bufY, game.buffer[i].size);
  }

  // 灌装位与剔除机构
  const gateX = startX + cap * slotW + 60;
  const gateY = bufY;
  ctx.strokeStyle = game.divert ? '#ff9f43' : '#7fb5ff';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(gateX - 18, gateY - 16);
  ctx.lineTo(gateX + 18, gateY + (game.divert ? 26 : -16));
  ctx.stroke();
  ctx.fillStyle = game.divert ? '#ff9f43' : '#7fb5ff';
  ctx.font = '12px system-ui';
  ctx.fillText(game.divert ? '剔除：开→废槽' : '剔除：关→瓶', gateX - 40, gateY + 58);
  if (game.divert) {
    ctx.strokeStyle = '#5a4632';
    ctx.beginPath();
    ctx.moveTo(gateX + 20, gateY + 20);
    ctx.lineTo(gateX + 90, gateY + 60);
    ctx.stroke();
    ctx.fillStyle = '#c98a4b';
    ctx.fillText('废槽', gateX + 92, gateY + 66);
  }

  // 当前灌装瓶
  const bottleX = gateX + 130;
  drawBottle(bottleX, gateY + 30, game.activeBottle, true);

  // 合格瓶位（最多 12 格）
  const rackY = 500;
  ctx.fillStyle = '#9fb4cc';
  ctx.font = '13px system-ui';
  ctx.fillText('合格瓶位', 40, rackY - 78);
  const goodEntries = game.bottleLog.filter((b) => b.good);
  for (let i = 0; i < c.TARGET_BOTTLES; i++) {
    const x = 60 + i * 72;
    ctx.strokeStyle = i < goodEntries.length ? '#2ea56a' : '#33404f';
    ctx.lineWidth = 2;
    ctx.strokeRect(x - 22, rackY - 60, 44, 78);
    if (i < goodEntries.length) {
      ctx.fillStyle = 'rgba(46,165,106,.18)';
      ctx.fillRect(x - 20, rackY - 58, 40, 74);
      ctx.fillStyle = '#7fe0b4';
      ctx.font = '12px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(`#${goodEntries[i].id}`, x, rackY + 32);
      ctx.textAlign = 'left';
    }
  }

  // 废瓶槽
  ctx.fillStyle = '#5c3030';
  ctx.fillRect(W - 150, rackY - 60, 120, 70);
  ctx.strokeStyle = '#a05252';
  ctx.strokeRect(W - 150, rackY - 60, 120, 70);
  ctx.fillStyle = '#ffb3b3';
  ctx.font = '13px system-ui';
  ctx.textAlign = 'center';
  ctx.fillText(`废瓶槽 ${game.wasteBottles}/${c.MAX_WASTE_BOTTLES}`, W - 90, rackY - 20);
  ctx.textAlign = 'left';

  // 结束遮罩
  if (game.status !== 'running') {
    ctx.fillStyle = 'rgba(8,11,15,.72)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = game.status === 'won' ? '#7fe0b4' : '#ff8a8a';
    ctx.font = 'bold 42px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(game.status === 'won' ? '灌装成功' : '灌装失败', W / 2, H / 2 - 10);
    ctx.font = '18px system-ui';
    ctx.fillStyle = '#d7dde5';
    const detail = game.status === 'won'
      ? `合格 ${game.goodBottles} 瓶 · 废瓶 ${game.wasteBottles} 瓶`
      : `废瓶 ${game.wasteBottles} 瓶超过上限 ${c.MAX_WASTE_BOTTLES}`;
    ctx.fillText(detail, W / 2, H / 2 + 28);
    ctx.textAlign = 'left';
  }
}

function loop(now) {
  const dt = Math.min(100, now - last);
  last = now;
  game.update(dt);
  handleEvents();
  syncControls();
  const running = (game.hoppers.small.paused ? 0 : 1) + (game.hoppers.large.paused ? 0 : 1);
  sound.updateHum(game.frequency, game.status === 'running' ? running : 0);
  render();
  requestAnimationFrame(loop);
}

syncControls();
requestAnimationFrame(loop);
