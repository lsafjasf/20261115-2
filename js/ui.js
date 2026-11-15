/* ui.js — 时间线编辑、Canvas 可视化、导出与一致性自检 */
(function () {
  'use strict';
  const { DURATION, PARAMS, defaultKeyframes, paramSampler, generateEvents } = window.Scape;
  const { renderOffline, renderSegmented, compareBuffers, encodeWav } = window.Render;

  const keyframes = defaultKeyframes();
  const sample = paramSampler(keyframes);
  const events = generateEvents(sample);
  let live = null;

  const $ = id => document.getElementById(id);
  const lanesEl = $('lanes'), rulerEl = $('ruler');

  function fmt(t) {
    const m = Math.floor(t / 60), s = (t % 60).toFixed(1).padStart(4, '0');
    return m + ':' + s;
  }

  // —— 标尺 ——
  function buildRuler() {
    rulerEl.innerHTML = '';
    for (let t = 0; t <= DURATION; t += 15) {
      const tick = document.createElement('div');
      tick.className = 'tick';
      tick.style.left = (t / DURATION * 100) + '%';
      tick.textContent = fmt(t);
      rulerEl.appendChild(tick);
    }
    const head = document.createElement('div');
    head.className = 'playhead';
    head.id = 'playheadRuler';
    head.style.left = '0%';
    rulerEl.appendChild(head);
  }

  // —— 参数轨道 ——
  function buildLanes() {
    lanesEl.innerHTML = '';
    for (const p of PARAMS) {
      const row = document.createElement('div');
      row.className = 'lane-row';
      const label = document.createElement('div');
      label.className = 'lane-label';
      label.innerHTML = p.group + ' · ' + p.name + '<small>' + p.id + '</small>';
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'lane-svg');
      svg.dataset.param = p.id;
      svg.setAttribute('preserveAspectRatio', 'none');
      row.appendChild(label);
      row.appendChild(svg);
      lanesEl.appendChild(row);
      drawLane(p, svg);
      svg.addEventListener('click', e => onLaneClick(e, p, svg));
    }
  }

  function drawLane(p, svg) {
    svg = svg || lanesEl.querySelector('[data-param="' + p.id + '"]');
    const w = svg.clientWidth || 600, h = svg.clientHeight || 58;
    svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
    svg.innerHTML = '';
    const NS = 'http://www.w3.org/2000/svg';
    const x = t => (t / DURATION) * w;
    const y = v => h - 6 - v * (h - 14);

    const grid = document.createElementNS(NS, 'path');
    grid.setAttribute('d', 'M0 ' + (h / 2) + ' H' + w);
    grid.setAttribute('stroke', '#222b38'); grid.setAttribute('stroke-width', '1');
    svg.appendChild(grid);

    const kf = keyframes[p.id].slice().sort((a, b) => a.time - b.time);
    const d = kf.map((k, i) => (i ? 'L' : 'M') + x(k.time) + ' ' + y(k.value)).join(' ');
    const seg = document.createElementNS(NS, 'path');
    seg.setAttribute('class', 'seg');
    seg.setAttribute('d', d);
    seg.setAttribute('stroke', p.color);
    svg.appendChild(seg);

    kf.forEach((k, idx) => {
      const c = document.createElementNS(NS, 'circle');
      c.setAttribute('class', 'kf');
      c.setAttribute('cx', x(k.time)); c.setAttribute('cy', y(k.value));
      c.setAttribute('r', '5');
      c.setAttribute('fill', p.color);
      c.setAttribute('stroke', '#0d1118'); c.setAttribute('stroke-width', '1.5');
      c.dataset.idx = idx;
      c.addEventListener('mousedown', e => startDrag(e, p, svg, k, c));
      c.addEventListener('dblclick', e => {
        e.stopPropagation();
        if (keyframes[p.id].length <= 2) return;
        keyframes[p.id] = keyframes[p.id].filter(q => q !== k);
        drawLane(p);
      });
      svg.appendChild(c);
    });
  }

  function onLaneClick(e, p, svg) {
    if (e.target.classList.contains('kf')) return;
    const rect = svg.getBoundingClientRect();
    const t = Math.round(((e.clientX - rect.left) / rect.width) * DURATION * 10) / 10;
    const v = Math.round((1 - (e.clientY - rect.top) / rect.height) * 100) / 100;
    if (t < 0 || t > DURATION) return;
    keyframes[p.id].push({ time: Math.min(DURATION, Math.max(0, t)),
      value: Math.min(1, Math.max(0, v)) });
    keyframes[p.id].sort((a, b) => a.time - b.time);
    drawLane(p);
  }

  function startDrag(e, p, svg, kf, circle) {
    e.preventDefault(); e.stopPropagation();
    const rect = svg.getBoundingClientRect();
    const move = ev => {
      const t = ((ev.clientX - rect.left) / rect.width) * DURATION;
      const v = 1 - (ev.clientY - rect.top) / rect.height;
      kf.time = Math.min(DURATION, Math.max(0, Math.round(t * 10) / 10));
      kf.value = Math.min(1, Math.max(0, Math.round(v * 100) / 100));
      keyframes[p.id].sort((a, b) => a.time - b.time);
      drawLane(p);
    };
    const up = () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      circle.setAttribute('r', '5');
    };
    circle.setAttribute('r', '7');
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  }

  window.addEventListener('resize', () => PARAMS.forEach(p => drawLane(p)));

  buildRuler();
  buildLanes();

  // —— 播放控制 ——
  function ensureEngine() {
    if (!live) live = new window.LiveEngine(sample, events);
    live.loop = $('chkLoop').checked;
    return live;
  }

  $('btnPlay').addEventListener('click', () => ensureEngine().play());
  $('btnPause').addEventListener('click', () => ensureEngine().pause());
  $('btnStop').addEventListener('click', async () => {
    if (live) await live.stop();
    $('clockNow').textContent = fmt(0);
  });
  $('chkLoop').addEventListener('change', e => { if (live) live.loop = e.target.checked; });

  // —— Canvas：声源地图 ——
  const mapCv = $('mapCanvas'), mapCtx = mapCv.getContext('2d');
  function drawMap(t) {
    const w = mapCv.width, h = mapCv.height;
    mapCtx.clearRect(0, 0, w, h);
    mapCtx.fillStyle = '#121722'; mapCtx.fillRect(0, 0, w, h);
    // 道路
    mapCtx.strokeStyle = '#2b3648'; mapCtx.lineWidth = 26;
    mapCtx.beginPath(); mapCtx.moveTo(0, h * 0.72); mapCtx.lineTo(w, h * 0.40); mapCtx.stroke();
    mapCtx.strokeStyle = '#243040'; mapCtx.lineWidth = 16;
    mapCtx.beginPath(); mapCtx.moveTo(w * 0.18, 0); mapCtx.lineTo(w * 0.62, h); mapCtx.stroke();
    mapCtx.strokeStyle = '#3a4658'; mapCtx.setLineDash([10, 12]); mapCtx.lineWidth = 2;
    mapCtx.beginPath(); mapCtx.moveTo(0, h * 0.72); mapCtx.lineTo(w, h * 0.40); mapCtx.stroke();
    mapCtx.setLineDash([]);
    // 施工区（固定声源）
    const cLevel = sample(t).constructionLevel;
    if (cLevel > 0.02) {
      mapCtx.fillStyle = 'rgba(245,166,35,' + (0.25 + cLevel * 0.5) + ')';
      mapCtx.beginPath(); mapCtx.arc(w * 0.72, h * 0.66, 22 + cLevel * 14, 0, 7); mapCtx.fill();
      mapCtx.fillStyle = '#f5a623'; mapCtx.font = '11px sans-serif';
      mapCtx.fillText('施工', w * 0.72 - 12, h * 0.66 + 4);
    }
    // 人群区
    const pLevel = sample(t).crowdLevel;
    if (pLevel > 0.02) {
      mapCtx.fillStyle = 'rgba(217,108,209,' + (0.18 + pLevel * 0.4) + ')';
      mapCtx.beginPath(); mapCtx.arc(w * 0.28, h * 0.28, 26 + pLevel * 12, 0, 7); mapCtx.fill();
      mapCtx.fillStyle = '#d96cd1'; mapCtx.font = '11px sans-serif';
      mapCtx.fillText('人群', w * 0.28 - 12, h * 0.28 + 4);
    }
    // 移动车辆
    for (const c of events.cars) {
      const k = (t - c.t) / c.dur;
      if (k < 0 || k > 1) continue;
      const x = k * w, y = h * 0.72 + (h * 0.40 - h * 0.72) * k + c.pan * 18;
      mapCtx.fillStyle = '#4a90e2';
      mapCtx.beginPath(); mapCtx.arc(x, y, 4, 0, 7); mapCtx.fill();
    }
    // 风（箭头）
    const wg = sample(t).windGust;
    if (wg > 0.05) {
      mapCtx.strokeStyle = 'rgba(126,214,194,' + (0.3 + wg * 0.6) + ')';
      mapCtx.lineWidth = 1.5;
      for (let i = 0; i < 4; i++) {
        const yy = 30 + i * 26 + ((t * 30 * (0.5 + wg)) % 26);
        const xx = (t * 40 * (0.5 + wg) + i * 90) % (w + 60) - 30;
        mapCtx.beginPath(); mapCtx.moveTo(xx, yy); mapCtx.lineTo(xx + 22, yy); mapCtx.stroke();
      }
    }
  }

  // —— Canvas：波形 ——
  const waveCv = $('waveCanvas'), waveCtx = waveCv.getContext('2d');
  function drawWave() {
    const w = waveCv.width, h = waveCv.height;
    waveCtx.fillStyle = '#0d1118'; waveCtx.fillRect(0, 0, w, h);
    const data = live && live.analyser ? live.getLevels() : null;
    waveCtx.strokeStyle = '#67e8f9'; waveCtx.lineWidth = 1.5;
    waveCtx.beginPath();
    if (data) {
      for (let i = 0; i < data.length; i++) {
        const x = i / (data.length - 1) * w;
        const y = (data[i] - 128) / 128 * h * 0.45 + h / 2;
        i ? waveCtx.lineTo(x, y) : waveCtx.moveTo(x, y);
      }
    } else {
      waveCtx.moveTo(0, h / 2); waveCtx.lineTo(w, h / 2);
    }
    waveCtx.stroke();
  }

  // —— Canvas：事件带 ——
  const evCv = $('eventCanvas'), evCtx = evCv.getContext('2d');
  const eventRows = [
    ['cars', '#4a90e2'], ['strikes', '#f5a623'],
    ['gusts', '#7ed6c2'], ['syllables', '#d96cd1']
  ];
  function drawEvents(t) {
    const w = evCv.width, h = evCv.height, rowH = h / eventRows.length;
    evCtx.fillStyle = '#0d1118'; evCtx.fillRect(0, 0, w, h);
    eventRows.forEach(([key, color], r) => {
      evCtx.fillStyle = '#1a2230'; evCtx.fillRect(0, r * rowH, w, 1);
      evCtx.fillStyle = color; evCtx.font = '10px sans-serif';
      evCtx.fillText(key, 4, r * rowH + 12);
      for (const ev of events[key]) {
        const x = ev.t / DURATION * w;
        const dw = (ev.dur || 0.1) / DURATION * w;
        evCtx.fillStyle = color;
        evCtx.globalAlpha = key === 'strikes' || key === 'cars' ? 0.85 : 0.45;
        evCtx.fillRect(x, r * rowH + 16, Math.max(1.5, dw), rowH - 20);
      }
      evCtx.globalAlpha = 1;
    });
    const px = t / DURATION * w;
    evCtx.strokeStyle = '#ff5d5d'; evCtx.lineWidth = 1.5;
    evCtx.beginPath(); evCtx.moveTo(px, 0); evCtx.lineTo(px, h); evCtx.stroke();
  }

  // —— 主循环 ——
  function frame() {
    const t = live ? live.getVirtualTime() : 0;
    drawMap(t);
    drawWave();
    drawEvents(t);
    $('clockNow').textContent = fmt(t);
    $('playheadRuler').style.left = (t / DURATION * 100) + '%';
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  window.__scape = { get keyframes() { return keyframes; }, get events() { return events; }, sample };

  // —— 一致性检查：整段离线 vs 分段（模拟暂停点）离线 ——
  async function runCheck() {
    const report = $('report');
    const sr = 48000;
    report.textContent = '正在离线渲染整段（180s @ ' + sr + ' Hz）…';
    const t0 = performance.now();
    const full = await renderOffline(sample, events, sr);
    report.textContent += '\n正在分段渲染（在 27.4s / 63.0s / 101.7s / 142.3s 模拟暂停）…';
    const seg = await renderSegmented(sample, events, sr, [27.4, 63.0, 101.7, 142.3], 0.15);
    const cmp = compareBuffers(full, seg);
    let peak = 0;
    for (let ch = 0; ch < full.numberOfChannels; ch++) {
      const data = full.getChannelData(ch);
      for (let i = 0; i < data.length; i += 37) peak = Math.max(peak, Math.abs(data[i]));
    }
    const lines = [
      '检查时间: ' + new Date().toLocaleString(),
      '采样率: ' + sr + ' Hz · 样本数: ' + cmp.samples + ' · 渲染耗时: ' +
        Math.round(performance.now() - t0) + ' ms',
      '分段方案: 5 段，暂停点 27.4 / 63.0 / 101.7 / 142.3 秒，每段前置 150ms margin',
      '逐样本最大差异 |full - segmented|: ' + cmp.maxDiff.toExponential(3),
      '逐样本 RMS 差异: ' + cmp.rms.toExponential(3),
      '最大差异出现位置: ' + cmp.atTime.toFixed(3) + ' s',
      '主输出峰值估计: ' + peak.toFixed(4) + '（软限幅 tanh，无削顶爆音）',
      cmp.maxDiff < 1e-6
        ? '结论: 通过 ✅ 暂停后续播与一次离线导出逐样本一致。'
        : '结论: 存在差异 ⚠️ 请检查 margin 与事件边界。'
    ];
    report.textContent = lines.join('\n');
    return { full, seg, cmp };
  }

  $('btnCheck').addEventListener('click', () => runCheck().catch(err => {
    $('report').textContent = '检查失败: ' + err.message;
  }));

  $('btnExport').addEventListener('click', async () => {
    const btn = $('btnExport');
    btn.disabled = true; btn.textContent = '渲染中…';
    try {
      const result = await runCheck();
      const blob = encodeWav(result.full);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'city-soundscape-3min.wav';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      $('report').textContent += '\n已导出 WAV: city-soundscape-3min.wav（16-bit 立体声, ' +
        Math.round(blob.size / 1024) + ' KB）';
    } catch (err) {
      $('report').textContent = '导出失败: ' + err.message;
    } finally {
      btn.disabled = false; btn.textContent = '⬇ 导出 WAV';
    }
  });

  window.__scape = { get keyframes() { return keyframes; }, get events() { return events; }, sample };
})();
