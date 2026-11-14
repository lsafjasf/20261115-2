/* 地铁图 Canvas 渲染 + 点击选站 + 双路径高亮 + 停运绕行 */
(function () {
  'use strict';
  var S = window.Subway;
  var canvas = document.getElementById('map');
  var ctx = canvas.getContext('2d');
  var W = canvas.width, H = canvas.height;

  var state = { start: null, end: null, closed: {}, routes: null };

  function isClosed(lineId) { return !!state.closed[lineId]; }

  function drawLine(line) {
    var pts = line.stations.map(function (id) { return S.stations[id]; });
    ctx.save();
    ctx.lineWidth = 7;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    if (isClosed(line.id)) {
      ctx.strokeStyle = '#9aa5b1';
      ctx.setLineDash([10, 8]);
    } else {
      ctx.strokeStyle = line.color;
    }
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.fillStyle = isClosed(line.id) ? '#9aa5b1' : line.color;
    ctx.font = "bold 12px 'Noto Sans CJK SC', sans-serif";
    var anchor = line.id === 'L3'
      ? { x: pts[1].x - 10, y: pts[1].y + 28 }
      : (function () {
          if (line.id === 'L1') return { x: pts[1].x + 40, y: pts[1].y - 16 };
          var m = pts[Math.floor(pts.length / 2)];
          return { x: m.x + 16, y: m.y - 16 };
        })();
    var name = line.name + (isClosed(line.id) ? '（停运）' : '');
    var nw = ctx.measureText(name).width;
    ctx.fillStyle = 'rgba(251,252,254,.85)';
    ctx.fillRect(anchor.x - 2, anchor.y - 12, nw + 4, 15);
    ctx.fillStyle = isClosed(line.id) ? '#9aa5b1' : line.color;
    ctx.fillText(name, anchor.x, anchor.y);
    ctx.restore();
  }

  function drawSelectionRings() {
    [['start', '#16a34a'], ['end', '#dc2626']].forEach(function (pair) {
      var sid = state[pair[0]];
      if (!sid) return;
      var p = S.stations[sid];
      ctx.save();
      ctx.strokeStyle = pair[1];
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 13, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = pair[1];
      ctx.font = "bold 12px 'Noto Sans CJK SC', sans-serif";
      ctx.fillText(pair[0] === 'start' ? '起点' : '终点', p.x - 8, p.y + 24);
      ctx.restore();
    });
  }

  function render() {
    ctx.clearRect(0, 0, W, H);
    S.lines.forEach(drawLine);
    drawEdgeMinutes();
    if (state.routes && state.routes.reachable) {
      strokeRoute(state.routes.fewestTransfers, '#7c3aed', 9);
      strokeRoute(state.routes.shortestTime, '#f59e0b', 5);
    }
    Object.keys(S.stations).forEach(drawStation);
    drawSelectionRings();
  }

  function stationAt(mx, my) {
    var hit = null;
    Object.keys(S.stations).forEach(function (sid) {
      var p = S.stations[sid];
      if (Math.abs(mx - p.x) <= 12 && Math.abs(my - p.y) <= 12) hit = sid;
    });
    return hit;
  }

  function closedList() {
    return S.lines.filter(function (l) { return state.closed[l.id]; })
      .map(function (l) { return l.id; });
  }

  function recompute() {
    if (state.start && state.end) {
      state.routes = S.findRoutes(state.start, state.end, closedList());
    } else {
      state.routes = null;
    }
    render();
    renderPanel();
    renderSelection();
  }

  function sName(sid) {
    return S.stations[sid].name + '(' + sid + ')';
  }

  function planHtml(cls, title, plan) {
    if (!plan) return '';
    var rides = plan.segments.map(function (seg) {
      var line = S.lineById(seg.line);
      return '<span class="tag" style="background:' + line.color + '">' +
        line.name + '</span> ' + sName(seg.from) + ' → ' + sName(seg.to);
    }).join('<br>换乘 ');
    return '<div class="plan ' + cls + '"><h3>' + title + '</h3>' +
      '<div><strong>' + plan.totalMinutes + '</strong> 分钟，换乘 <strong>' +
      plan.transfers + '</strong> 次</div>' +
      '<div class="muted" style="margin-top:4px">' + rides + '</div></div>';
  }

  function renderPanel() {
    var box = document.getElementById('result');
    if (!state.routes) {
      box.innerHTML = '<span class="muted">请先在地图上点击起点与终点。</span>';
      return;
    }
    var r = state.routes;
    if (!r.reachable) {
      var nodes = r.disconnectedStations.map(sName).join('、') || '无';
      var brokenStart = S.stationLines[r.start].every(isClosed) ? sName(r.start) : null;
      var brokenEnd = S.stationLines[r.end].every(isClosed) ? sName(r.end) : null;
      var point = brokenStart && brokenEnd
        ? '起点 ' + brokenStart + ' 与终点 ' + brokenEnd + ' 所在线路均已停运。'
        : (brokenStart
            ? '起点 ' + brokenStart + ' 所在线路已停运，该节点与网络断开。'
            : '终点 ' + brokenEnd + ' 所在线路已停运，该节点与网络断开。');
      box.innerHTML = '<p class="danger">✕ 无法到达：起点或终点所在线路已停运。</p>' +
        '<p>' + point + '</p>' +
        '<p>当前网络中的断开节点：<br>' + nodes + '</p>';
      return;
    }
    var same = r.shortestTime.stops.join() === r.fewestTransfers.stops.join();
    box.innerHTML =
      planHtml('time', '🟠 最短时间方案', r.shortestTime) +
      planHtml('transfer', '🟣 最少换乘方案', r.fewestTransfers) +
      '<p class="muted">' + (same
        ? '两种算法在此条件下给出相同路径。'
        : '两种算法给出不同路径：橙色省时但换乘多，紫色换乘少但耗时更长。') +
      '</p>';
  }

  function renderSelection() {
    document.getElementById('selection').innerHTML =
      '起点：<strong>' + (state.start ? sName(state.start) : '未选择') + '</strong><br>' +
      '终点：<strong>' + (state.end ? sName(state.end) : '未选择') + '</strong>';
  }

  canvas.addEventListener('click', function (ev) {
    var rect = canvas.getBoundingClientRect();
    var scaleX = canvas.width / rect.width;
    var scaleY = canvas.height / rect.height;
    var sid = stationAt((ev.clientX - rect.left) * scaleX,
                        (ev.clientY - rect.top) * scaleY);
    if (!sid) return;
    if (!state.start || (state.start && state.end)) {
      state.start = sid;
      state.end = null;
    } else {
      state.end = sid;
    }
    recompute();
  });

  function buildLineControls() {
    var box = document.getElementById('lineControls');
    box.innerHTML = '';
    S.lines.forEach(function (line) {
      var label = document.createElement('label');
      label.className = 'line-chip';
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = false;
      cb.addEventListener('change', function () {
        if (cb.checked) state.closed[line.id] = true;
        else delete state.closed[line.id];
        recompute();
      });
      var dot = document.createElement('i');
      dot.className = 'dot';
      dot.style.background = line.color;
      label.appendChild(cb);
      label.appendChild(dot);
      label.appendChild(document.createTextNode(line.name + ' 停运'));
      box.appendChild(label);
    });
  }

  document.querySelectorAll('button[data-q]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var pair = btn.getAttribute('data-q').split(',');
      state.start = pair[0];
      state.end = pair[1];
      recompute();
    });
  });

  document.getElementById('reset').addEventListener('click', function () {
    state.start = null;
    state.end = null;
    state.routes = null;
    render();
    renderPanel();
    renderSelection();
  });

  buildLineControls();
  renderSelection();
  render();

  function drawStation(sid) {
    var p = S.stations[sid];
    var interchange = S.stationLines[sid].length > 1;
    var isolated = S.stationLines[sid].every(isClosed);
    ctx.save();
    if (isolated) {
      ctx.strokeStyle = '#c0392b';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(p.x - 9, p.y - 9); ctx.lineTo(p.x + 9, p.y + 9);
      ctx.moveTo(p.x + 9, p.y - 9); ctx.lineTo(p.x - 9, p.y + 9);
      ctx.stroke();
    } else if (interchange) {
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = '#1f2933';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 5.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.fillStyle = isolated ? '#c0392b' : '#334155';
    ctx.font = "12px 'Noto Sans CJK SC', sans-serif";
    var label = p.name + ' ' + sid;
    var lx = p.x + 10, ly = p.y - 9;
    if (['B0', 'B1', 'B2', 'B3'].indexOf(sid) >= 0) {
      lx = p.x + 12; ly = p.y + 4;
    }
    if (sid === 'A2') { lx = p.x - 70; ly = p.y - 12; }
    var w = ctx.measureText(label).width;
    ctx.fillStyle = 'rgba(251,252,254,.85)';
    ctx.fillRect(lx - 2, ly - 11, w + 4, 15);
    ctx.fillStyle = isolated ? '#c0392b' : '#334155';
    ctx.fillText(label, lx, ly);
    ctx.restore();
  }

  function strokeRoute(plan, color, width) {
    if (!plan) return;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    plan.segments.forEach(function (seg) {
      var seq = S.lineById(seg.line).stations;
      var i = seq.indexOf(seg.from), j = seq.indexOf(seg.to);
      var lo = Math.min(i, j), hi = Math.max(i, j);
      ctx.beginPath();
      for (var k = lo; k <= hi; k++) {
        var p = S.stations[seq[k]];
        if (k === lo) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
    });
    ctx.restore();
  }

  function drawEdgeMinutes() {
    ctx.save();
    ctx.font = "10px 'Noto Sans CJK SC', sans-serif";
    S.lines.forEach(function (line) {
      if (isClosed(line.id)) return;
      // 3 号线与其他线共走廊的边不重复标时间
      if (line.id === 'L3') return;
      for (var i = 0; i < line.stations.length - 1; i++) {
        var a = S.stations[line.stations[i]];
        var b = S.stations[line.stations[i + 1]];
        var mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        ctx.fillStyle = 'rgba(255,255,255,.85)';
        ctx.fillRect(mx - 12, my - 8, 24, 14);
        ctx.fillStyle = '#52606d';
        ctx.fillText(line.minutes + '分', mx - 10, my + 3);
      }
    });
    ctx.restore();
  }
})();
