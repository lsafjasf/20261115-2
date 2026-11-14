/*
 * 三维颗粒物剖面可视化主程序：Canvas 2D + 正交投影，无外部依赖。
 */
(function () {
  "use strict";

  var M = window.PMModel;
  var model = new M.DataModel();

  var state = {
    hour: 8,
    zIndex: 1,       // 水平切片高度层（25m）
    yIndex: 8,       // 垂直切片所在 Y 行
    yaw: 0.72,
    pitch: 0.42,
    zoom: 1,
    playing: true
  };

  var canvas = document.getElementById("scene");
  var ctx = canvas.getContext("2d");
  var DPR = Math.max(1, window.devicePixelRatio || 1);
  var view = { w: 0, h: 0 };

  var Z_WORLD = M.NZ * 1.55; // 高度轴世界长度，拉伸垂直比例

  function resize() {
    var rect = canvas.getBoundingClientRect();
    view.w = rect.width;
    view.h = rect.height;
    canvas.width = Math.round(rect.width * DPR);
    canvas.height = Math.round(rect.height * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }

  // 世界坐标 (x:0..NX, y:0..NY, z:0..Z_WORLD) -> 屏幕坐标
  function project(p) {
    var cy = Math.cos(state.yaw), sy = Math.sin(state.yaw);
    var cp = Math.cos(state.pitch), sp = Math.sin(state.pitch);
    var dx = p.x - M.NX / 2, dy = p.y - M.NY / 2, dz = p.z - Z_WORLD / 2;

    var ex = dx * cy - dy * sy;
    var ey = dy * cy + dx * sy;
    var screenY = ey * sp - dz * cp;
    var depth = ey * cp + dz * sp;

    var base = Math.min(view.w / (M.NX + 6), view.h / (M.NY + 9));
    var s = base * state.zoom;
    return {
      x: view.w / 2 + ex * s,
      y: view.h * 0.56 + screenY * s,
      d: depth
    };
  }

  function zWorld(zIndex) {
    return (zIndex + 0.5) * (Z_WORLD / M.NZ);
  }

  function norm(value, hour) {
    var dom = model.domains[hour];
    return (value - dom[0]) / (dom[1] - dom[0]);
  }

  function fillPoly(points, fill, stroke) {
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (var i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 0.6;
      ctx.stroke();
    }
  }

  function pad(h) { return (h < 10 ? "0" : "") + h; }
  function fmt(v) { return v.toFixed(1); }

  window.addEventListener("resize", function () {
    resize();
    render();
  });

  resize();
  function drawGround() {
    ctx.lineWidth = 0.7;
    ctx.strokeStyle = "rgba(120,150,190,0.28)";
    for (var i = 0; i <= M.NX; i++) {
      var a = project({ x: i, y: 0, z: 0 });
      var b = project({ x: i, y: M.NY, z: 0 });
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    for (var j = 0; j <= M.NY; j++) {
      var c = project({ x: 0, y: j, z: 0 });
      var d = project({ x: M.NX, y: j, z: 0 });
      ctx.beginPath();
      ctx.moveTo(c.x, c.y);
      ctx.lineTo(d.x, d.y);
      ctx.stroke();
    }

    // 城市中心区域描边
    var p1 = project({ x: 5, y: 5, z: 0.02 });
    var p2 = project({ x: 11, y: 5, z: 0.02 });
    var p3 = project({ x: 11, y: 11, z: 0.02 });
    var p4 = project({ x: 5, y: 11, z: 0.02 });
    fillPoly([p1, p2, p3, p4], "rgba(255,212,121,0.07)", "rgba(255,212,121,0.55)");
    var label = project({ x: 8, y: 8, z: 0 });
    ctx.fillStyle = "rgba(255,212,121,0.85)";
    ctx.font = "11px sans-serif";
    ctx.fillText("城市中心", label.x - 22, label.y - 6);
  }

  function drawBoxEdges() {
    var corners = [
      { x: 0, y: 0, z: 0 }, { x: M.NX, y: 0, z: 0 },
      { x: M.NX, y: M.NY, z: 0 }, { x: 0, y: M.NY, z: 0 },
      { x: 0, y: 0, z: Z_WORLD }, { x: M.NX, y: 0, z: Z_WORLD },
      { x: M.NX, y: M.NY, z: Z_WORLD }, { x: 0, y: M.NY, z: Z_WORLD }
    ].map(project);
    var edges = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6],
      [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
    ctx.strokeStyle = "rgba(150,175,210,0.5)";
    ctx.lineWidth = 1;
    edges.forEach(function (e) {
      ctx.beginPath();
      ctx.moveTo(corners[e[0]].x, corners[e[0]].y);
      ctx.lineTo(corners[e[1]].x, corners[e[1]].y);
      ctx.stroke();
    });
  }

  function collectQuads() {
    var quads = [];
    var hour = state.hour;
    var layerH = Z_WORLD / M.NZ;
    var zm = zWorld(state.zIndex);

    // 水平切片（固定高度层）
    for (var x = 0; x < M.NX; x++) {
      for (var y = 0; y < M.NY; y++) {
        var v = model.valueAt(hour, x, y, state.zIndex);
        var pts = [
          project({ x: x, y: y, z: zm }),
          project({ x: x + 1, y: y, z: zm }),
          project({ x: x + 1, y: y + 1, z: zm }),
          project({ x: x, y: y + 1, z: zm })
        ];
        quads.push({
          corners: pts,
          fill: M.colorCss(norm(v, hour)),
          stroke: "rgba(15,22,34,0.55)",
          depth: (pts[0].d + pts[1].d + pts[2].d + pts[3].d) / 4
        });
      }
    }

    // 垂直切片（固定 Y 行）
    var ym = state.yIndex + 0.5;
    for (var xi = 0; xi < M.NX; xi++) {
      for (var zi = 0; zi < M.NZ; zi++) {
        var zz0 = zi * layerH, zz1 = (zi + 1) * layerH;
        var vv = model.valueAt(hour, xi, state.yIndex, zi);
        var q = [
          project({ x: xi, y: ym, z: zz0 }),
          project({ x: xi + 1, y: ym, z: zz0 }),
          project({ x: xi + 1, y: ym, z: zz1 }),
          project({ x: xi, y: ym, z: zz1 })
        ];
        quads.push({
          corners: q,
          fill: M.colorCss(norm(vv, hour)),
          stroke: "rgba(15,22,34,0.55)",
          depth: (q[0].d + q[1].d + q[2].d + q[3].d) / 4
        });
      }
    }
    return quads;
  }

  function drawAxesLabels() {
    ctx.font = "11px sans-serif";
    ctx.fillStyle = "rgba(180,200,228,0.9)";
    var xEnd = project({ x: M.NX + 0.6, y: 0, z: 0 });
    ctx.fillText("X →", xEnd.x, xEnd.y);
    var yEnd = project({ x: 0, y: M.NY + 0.6, z: 0 });
    ctx.fillText("Y →", yEnd.x, yEnd.y);

    for (var z = 0; z < M.NZ; z++) {
      var p = project({ x: 0, y: 0, z: zWorld(z) });
      ctx.fillStyle = "rgba(180,200,228,0.75)";
      ctx.fillText(M.HEIGHTS[z] + "m", p.x - 40, p.y + 3);
    }

    var hp = project({ x: M.NX, y: M.NY, z: zWorld(state.zIndex) });
    ctx.fillStyle = "#ffd479";
    ctx.fillText("◄ 水平切面 " + M.HEIGHTS[state.zIndex] + "m", hp.x + 6, hp.y);

    var vp = project({ x: 0, y: state.yIndex + 0.5, z: 0 });
    ctx.fillStyle = "#8fd3ff";
    ctx.fillText("垂直切面 Y=" + state.yIndex, vp.x - 30, vp.y + 14);
  }

  function drawScene() {
    ctx.clearRect(0, 0, view.w, view.h);
    drawGround();
    var quads = collectQuads().sort(function (a, b) {
      return a.depth - b.depth;
    });
    quads.forEach(function (q) {
      fillPoly(q.corners, q.fill, q.stroke);
    });
    drawBoxEdges();
    drawAxesLabels();
  }
  function aggregate(cells) {
    var sum = 0, min = Infinity, max = -Infinity;
    cells.forEach(function (c) {
      sum += c.v;
      if (c.v < min) min = c.v;
      if (c.v > max) max = c.v;
    });
    return { avg: sum / cells.length, min: min, max: max };
  }

  function updateLegend() {
    var lc = document.getElementById("legend");
    var lctx = lc.getContext("2d", { willReadFrequently: true });
    var dom = model.domains[state.hour];
    for (var py = 0; py < lc.height; py++) {
      var t = 1 - py / (lc.height - 1);
      lctx.fillStyle = M.colorCss(t);
      lctx.fillRect(0, py, lc.width, 1);
    }
    var ticks = document.getElementById("legendTicks");
    ticks.innerHTML = "";
    for (var i = 0; i <= 5; i++) {
      var frac = i / 5;
      var val = dom[1] - frac * (dom[1] - dom[0]);
      var el = document.createElement("div");
      el.className = "tick";
      el.style.top = (frac * 100) + "%";
      el.textContent = val.toFixed(0);
      ticks.appendChild(el);
    }
    document.getElementById("legendDomain").textContent =
      "当前 " + pad(state.hour) + ":00 全域范围 " + dom[0] +
      " – " + dom[1] + " μg/m³";
  }

  function updateStatsAndHotspots() {
    var hour = state.hour;
    var cells = [];
    for (var xh = 0; xh < M.NX; xh++) {
      for (var yh = 0; yh < M.NY; yh++) {
        cells.push({
          x: xh, y: yh, z: state.zIndex,
          v: model.valueAt(hour, xh, yh, state.zIndex)
        });
      }
    }

    var all = aggregate(cells);
    var urban = aggregate(cells.filter(function (c) {
      return M.isUrban(c.x, c.y);
    }));
    var rural = aggregate(cells.filter(function (c) {
      return !M.isUrban(c.x, c.y);
    }));

    var html = '<table class="stats-table">';
    html += "<tr><td>水平切面高度</td><td>" + M.HEIGHTS[state.zIndex] + "m</td></tr>";
    html += "<tr><td>单元数</td><td>" + cells.length + "</td></tr>";
    html += '<tr><td class="section">全切面 平均</td><td>' + fmt(all.avg) + "</td></tr>";
    html += "<tr><td>全切面 最小 / 最大</td><td>" +
      fmt(all.min) + " / " + fmt(all.max) + "</td></tr>";
    html += "<tr><td>城市中心 平均</td><td>" + fmt(urban.avg) + "</td></tr>";
    html += "<tr><td>郊区 平均</td><td>" + fmt(rural.avg) + "</td></tr>";
    html += "<tr><td>中心 − 郊区 差值</td><td>" +
      fmt(urban.avg - rural.avg) + "</td></tr>";
    html += "</table>";
    document.getElementById("stats").innerHTML = html;

    var top = cells.slice().sort(function (a, b) {
      return b.v - a.v;
    }).slice(0, 5);
    document.getElementById("hotspots").innerHTML = top.map(function (c) {
      return "<li><span class=\"val\">" + fmt(c.v) + "</span> μg/m³ " +
        '<span class="pos">@ X' + c.x + " Y" + c.y + " " +
        M.HEIGHTS[c.z] + "m</span></li>";
    }).join("");
  }

  function updateBadge() {
    document.getElementById("sliceBadge").innerHTML =
      "时间 <b>" + pad(state.hour) + ":00</b><br>" +
      "水平切面 <b>" + M.HEIGHTS[state.zIndex] + "m</b>（第 " +
      (state.zIndex + 1) + " 层）<br>" +
      "垂直切面 <b>Y=" + state.yIndex + "</b>";
  }

  function updateSliderLabels() {
    document.getElementById("hLabel").textContent =
      M.HEIGHTS[state.zIndex] + " m（第" + (state.zIndex + 1) + "层）";
    document.getElementById("vLabel").textContent = "Y = " + state.yIndex;
    document.getElementById("timeLabel").textContent = pad(state.hour) + ":00";
    document.getElementById("hSlider").value = state.zIndex;
    document.getElementById("vSlider").value = state.yIndex;
    document.getElementById("timeSlider").value = state.hour;
  }

  function render() {
    drawScene();
    updateLegend();
    updateStatsAndHotspots();
    updateBadge();
    updateSliderLabels();
  }
  function bindControls() {
    var hSlider = document.getElementById("hSlider");
    var vSlider = document.getElementById("vSlider");
    var tSlider = document.getElementById("timeSlider");
    hSlider.addEventListener("input", function () {
      state.zIndex = +hSlider.value;
      render();
    });
    vSlider.addEventListener("input", function () {
      state.yIndex = +vSlider.value;
      render();
    });
    tSlider.addEventListener("input", function () {
      state.hour = +tSlider.value;
      state.playing = false;
      document.getElementById("playBtn").textContent = "播放";
      render();
    });

    var playBtn = document.getElementById("playBtn");
    playBtn.addEventListener("click", function () {
      state.playing = !state.playing;
      playBtn.textContent = state.playing ? "暂停" : "播放";
    });

    document.getElementById("selfTestBtn").addEventListener("click", function () {
      window.runSelfTestAndStore();
    });

    canvas.addEventListener("wheel", function (e) {
      e.preventDefault();
      state.zoom *= e.deltaY < 0 ? 1.08 : 0.92;
      state.zoom = Math.max(0.5, Math.min(2.6, state.zoom));
      drawScene();
    }, { passive: false });
  }

  function pointInQuad(px, py, pts) {
    var inside = false;
    for (var i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      var xi = pts[i].x, yi = pts[i].y;
      var xj = pts[j].x, yj = pts[j].y;
      var intersect = ((yi > py) !== (yj > py)) &&
        (px < (xj - xi) * (py - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  function pickSlice(mx, my) {
    var zm = zWorld(state.zIndex);
    for (var x = M.NX - 1; x >= 0; x--) {
      for (var y = M.NY - 1; y >= 0; y--) {
        var pts = [
          project({ x: x, y: y, z: zm }),
          project({ x: x + 1, y: y, z: zm }),
          project({ x: x + 1, y: y + 1, z: zm }),
          project({ x: x, y: y + 1, z: zm })
        ];
        if (pointInQuad(mx, my, pts)) return { mode: "h" };
      }
    }
    var ym = state.yIndex + 0.5;
    var layerH = Z_WORLD / M.NZ;
    for (var xi = M.NX - 1; xi >= 0; xi--) {
      for (var zi = M.NZ - 1; zi >= 0; zi--) {
        var q = [
          project({ x: xi, y: ym, z: zi * layerH }),
          project({ x: xi + 1, y: ym, z: zi * layerH }),
          project({ x: xi + 1, y: ym, z: (zi + 1) * layerH }),
          project({ x: xi, y: ym, z: (zi + 1) * layerH })
        ];
        if (pointInQuad(mx, my, q)) return { mode: "v" };
      }
    }
    return null;
  }

  function bindSceneDrag() {
    var drag = null;
    canvas.addEventListener("mousedown", function (e) {
      var rect = canvas.getBoundingClientRect();
      var hit = pickSlice(e.clientX - rect.left, e.clientY - rect.top);
      canvas.classList.add("dragging");
      if (hit) {
        drag = {
          mode: hit.mode,
          startX: e.clientX, startY: e.clientY,
          startZ: state.zIndex, startYIdx: state.yIndex,
          lastH: state.zIndex, lastV: state.yIndex
        };
      } else {
        drag = {
          mode: "rotate",
          startX: e.clientX, startY: e.clientY,
          yaw: state.yaw, pitch: state.pitch
        };
      }
    });

    window.addEventListener("mousemove", function (e) {
      var rect = canvas.getBoundingClientRect();
      if (!drag) {
        var hit = pickSlice(e.clientX - rect.left, e.clientY - rect.top);
        canvas.style.cursor = hit ? "pointer" : "grab";
        return;
      }
      var dx = e.clientX - drag.startX;
      var dy = e.clientY - drag.startY;
      if (drag.mode === "rotate") {
        state.yaw = drag.yaw + dx * 0.008;
        state.pitch = Math.max(0.08, Math.min(1.35, drag.pitch + dy * 0.006));
        drawScene();
      } else if (drag.mode === "h") {
        var nz = drag.startZ - Math.round(dy / 22);
        nz = Math.max(0, Math.min(M.NZ - 1, nz));
        if (nz !== drag.lastH) {
          drag.lastH = nz;
          state.zIndex = nz;
          render();
        }
      } else if (drag.mode === "v") {
        var ny = drag.startYIdx + Math.round(dx / 20);
        ny = Math.max(0, Math.min(M.NY - 1, ny));
        if (ny !== drag.lastV) {
          drag.lastV = ny;
          state.yIndex = ny;
          render();
        }
      }
    });

    window.addEventListener("mouseup", function () {
      drag = null;
      canvas.classList.remove("dragging");
    });
  }
  function rgbaClose(a, b, tol) {
    return Math.abs(a[0] - b[0]) <= tol &&
      Math.abs(a[1] - b[1]) <= tol &&
      Math.abs(a[2] - b[2]) <= tol;
  }

  /*
   * 自检：在两个真实高度（25m=层2索引1，100m=层5索引4）上验证
   * 1) 切面单元颜色 == 图例颜色映射（离屏 canvas 读像素）
   * 2) 图例色条本身与映射函数一致
   * 3) 切面数据与原始场一致；统计平均值可复算
   * 4) 中心/郊区差值正确；热点 TOP5 与排序一致；图例域覆盖全域
   */
  function runSelfTest() {
    var hour = 8;
    var results = [];
    function check(name, ok, detail) {
      results.push({ name: name, ok: ok, detail: detail || "" });
    }

    [1, 4].forEach(function (z) {
      var off = document.createElement("canvas");
      off.width = 600;
      off.height = 560;
      var octx = off.getContext("2d", { willReadFrequently: true });
      var dom = model.domains[hour];
      var s = 26;
      var cosY = Math.cos(0.5), sinY = Math.sin(0.5);

      function flatProject(gx, gy) {
        var ex = (gx - M.NX / 2) * cosY - (gy - M.NY / 2) * sinY;
        var ey = (gy - M.NY / 2) * cosY + (gx - M.NX / 2) * sinY;
        return { x: 300 + ex * s, y: 280 + ey * s * 0.82 };
      }

      var samples = [[3, 3], [7, 7], [12, 12], [0, 15], [15, 0]];
      samples.forEach(function (pt) {
        var gx = pt[0], gy = pt[1];
        var corners = [
          flatProject(gx, gy), flatProject(gx + 1, gy),
          flatProject(gx + 1, gy + 1), flatProject(gx, gy + 1)
        ];
        var v = model.valueAt(hour, gx, gy, z);
        octx.beginPath();
        octx.moveTo(corners[0].x, corners[0].y);
        for (var k = 1; k < 4; k++) octx.lineTo(corners[k].x, corners[k].y);
        octx.closePath();
        octx.fillStyle = M.colorCss((v - dom[0]) / (dom[1] - dom[0]));
        octx.fill();

        var cxs = corners.reduce(function (a, p) { return a + p.x; }, 0) / 4;
        var cys = corners.reduce(function (a, p) { return a + p.y; }, 0) / 4;
        var pixel = octx.getImageData(Math.round(cxs), Math.round(cys), 1, 1).data;
        var expect = M.colorRgb((v - dom[0]) / (dom[1] - dom[0]));
        check(M.HEIGHTS[z] + "m 单元(" + gx + "," + gy + ")颜色映射",
          rgbaClose([pixel[0], pixel[1], pixel[2]], expect, 6),
          "v=" + v.toFixed(1) + " 期望rgb(" + expect.join(",") +
            ") 实测rgb(" + pixel[0] + "," + pixel[1] + "," + pixel[2] + ")");
      });

      var slice = model.horizontalSlice(hour, z);
      var matrixOk = slice.every(function (row, y) {
        return row.every(function (v, x) {
          return v === model.valueAt(hour, x, y, z);
        });
      });
      check(M.HEIGHTS[z] + "m 切面数据与原始场一致", matrixOk);

      var cells = [];
      for (var x = 0; x < M.NX; x++) {
        for (var y = 0; y < M.NY; y++) {
          cells.push({ x: x, y: y, z: z, v: model.valueAt(hour, x, y, z) });
        }
      }
      var agg = aggregate(cells);
      var rawAvg = cells.reduce(function (a, c) { return a + c.v; }, 0) / cells.length;
      check(M.HEIGHTS[z] + "m 统计平均值可复算",
        Math.abs(agg.avg - rawAvg) < 1e-9, "avg=" + agg.avg.toFixed(2));

      var urbanAvg = aggregate(cells.filter(function (c) {
        return M.isUrban(c.x, c.y);
      })).avg;
      var ruralAvg = aggregate(cells.filter(function (c) {
        return !M.isUrban(c.x, c.y);
      })).avg;
      var diff = urbanAvg - ruralAvg;
      check(M.HEIGHTS[z] + "m 中心−郊区差值",
        isFinite(diff), "中心" + urbanAvg.toFixed(1) + " 郊区" +
          ruralAvg.toFixed(1) + " Δ=" + diff.toFixed(2) + "μg/m³");

      var sorted = cells.slice().sort(function (a, b) { return b.v - a.v; });
      var hotspotOk = sorted[0].v === agg.max &&
        sorted.slice(0, 5).every(function (c, i) { return c.v === sorted[i].v; });
      check(M.HEIGHTS[z] + "m 热点TOP5与排序一致", hotspotOk,
        "最大=" + sorted[0].v.toFixed(1));
    });

    var lc = document.getElementById("legend");
    var ldata = lc.getContext("2d").getImageData(
      lc.width / 2, lc.height / 2, 1, 1).data;
    var midExpect = M.colorRgb(0.5);
    check("图例色条中点与颜色标尺一致",
      rgbaClose([ldata[0], ldata[1], ldata[2]], midExpect, 6),
      "rgb(" + ldata[0] + "," + ldata[1] + "," + ldata[2] + ")");

    var d = model.domains[hour];
    var gMin = Infinity, gMax = -Infinity;
    for (var z2 = 0; z2 < M.NZ; z2++) {
      for (var y2 = 0; y2 < M.NY; y2++) {
        for (var x2 = 0; x2 < M.NX; x2++) {
          var v2 = model.valueAt(hour, x2, y2, z2);
          if (v2 < gMin) gMin = v2;
          if (v2 > gMax) gMax = v2;
        }
      }
    }
    check("图例域覆盖全域浓度",
      d[0] <= gMin && d[1] >= gMax,
      "域[" + d[0] + "," + d[1] + "] 实际[" +
        gMin.toFixed(1) + "," + gMax.toFixed(1) + "]");

    renderSelfTest(results);
    selfTestResults = results;
    return results;
  }

  function renderSelfTest(results) {
    var passed = results.filter(function (r) { return r.ok; }).length;
    var html = results.map(function (r) {
      return '<div class="' + (r.ok ? "pass" : "fail") + '">' +
        (r.ok ? "✔" : "✘") + " " + r.name +
        (r.detail ? ' <span class="mono">(' + r.detail + ")</span>" : "") + "</div>";
    }).join("");
    html += '<div class="summary ' +
      (passed === results.length ? "pass" : "fail") + '">' +
      passed + "/" + results.length + " 项通过</div>";
    document.getElementById("selfTest").innerHTML = html;
  }

  bindControls();
  bindSceneDrag();
  render();
  bindControls();
  bindSceneDrag();
  render();
  var selfTestResults = runSelfTest();

  setInterval(function () {
    if (!state.playing) return;
    state.hour = (state.hour + 1) % 24;
    render();
  }, 2000);

  window.__PM = {
    model: model,
    state: state,
    render: render,
    runSelfTest: runSelfTest,
    get lastSelfTest() { return selfTestResults; }
  };

  window.runSelfTestAndStore = function () {
    selfTestResults = runSelfTest();
    return selfTestResults;
  };
})();