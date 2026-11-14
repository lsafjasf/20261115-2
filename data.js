/*
 * 合成颗粒物（PM2.5）浓度场，不加载任何真实地图。
 * 网格 16 x 16 x 8（X, Y, Z），Z 为离地高度层。
 */
(function (global) {
  "use strict";

  var NX = 16;
  var NY = 16;
  var NZ = 8;
  var HEIGHTS = [10, 25, 50, 75, 100, 150, 200, 300];

  // 城市中心区域（含中心商务区）与郊区判定
  function isUrban(x, y) {
    return x >= 5 && x <= 10 && y >= 5 && y <= 10;
  }

  function gauss(x, y, cx, cy, sx, sy) {
    var dx = x - cx;
    var dy = y - cy;
    return Math.exp(-(dx * dx / (2 * sx * sx) + dy * dy / (2 * sy * sy)));
  }

  // 确定性伪随机，保证每次运行数据完全一致
  function noise2(x, y, t) {
    var n = Math.sin(x * 127.1 + y * 311.7 + t * 74.7) * 43758.5453;
    return n - Math.floor(n);
  }

  /*
   * 单格浓度（μg/m³）：
   * - 城市中心基线 + 早晚高峰
   * - 两个随时间漂移的工业烟羽
   * - 随高度指数衰减
   */
  function pm25(x, y, z, hour) {
    var h = HEIGHTS[z];
    var urban = isUrban(x, y) ? 22 : 6;

    // 昼夜变化：早 8 点 / 晚 20 点两个高峰
    var diurnal =
      1 +
      0.55 * Math.exp(-Math.pow((hour - 8) / 2.2, 2)) +
      0.45 * Math.exp(-Math.pow((hour - 20) / 2.4, 2)) -
      0.25 * Math.exp(-Math.pow((hour - 14) / 3.0, 2));

    // 工业源 A：城市西南，烟羽随风向缓慢漂移
    var ax = 3 + 2.2 * Math.cos(hour / 24 * Math.PI * 2 - 0.6);
    var ay = 3 + 1.8 * Math.sin(hour / 24 * Math.PI * 2 - 0.6);
    var plumeA = 52 * gauss(x, y, ax, ay, 2.1, 2.1);

    // 工业源 B：城市东北，强度夜间更高
    var bStrength = 34 * (1 + 0.35 * Math.cos((hour - 2) / 24 * Math.PI * 2));
    var plumeB = bStrength * gauss(x, y, 12.5, 13.0, 1.7, 1.7);

    // 中心商务区高峰排放
    var cbd = 18 * diurnal * gauss(x, y, 7.5, 7.5, 2.6, 2.6);

    var surface = urban * diurnal + plumeA + plumeB + cbd +
      2.5 * (noise2(x, y, hour) - 0.5);

    // 垂直扩散：高度越高浓度越低
    var vertical = Math.exp(-h / 160);
    var value = 8 + surface * vertical + 3 * (h / 300);
    return Math.max(1, value);
  }

  // 颜色标尺：深蓝 -> 青 -> 绿 -> 黄 -> 橙 -> 红
  var COLOR_STOPS = [
    [0.00, [28, 47, 110]],
    [0.20, [33, 102, 172]],
    [0.40, [42, 176, 168]],
    [0.60, [96, 192, 92]],
    [0.78, [238, 201, 72]],
    [0.90, [233, 127, 51]],
    [1.00, [205, 48, 45]]
  ];

  function lerp(a, b, t) { return a + (b - a) * t; }

  function colorRgb(t) {
    t = Math.max(0, Math.min(1, t));
    for (var i = 1; i < COLOR_STOPS.length; i++) {
      if (t <= COLOR_STOPS[i][0]) {
        var lo = COLOR_STOPS[i - 1];
        var hi = COLOR_STOPS[i];
        var f = (t - lo[0]) / (hi[0] - lo[0]);
        return [
          Math.round(lerp(lo[1][0], hi[1][0], f)),
          Math.round(lerp(lo[1][1], hi[1][1], f)),
          Math.round(lerp(lo[1][2], hi[1][2], f))
        ];
      }
    }
    return COLOR_STOPS[COLOR_STOPS.length - 1][1].slice();
  }

  function colorCss(t) {
    var c = colorRgb(t);
    return "rgb(" + c[0] + "," + c[1] + "," + c[2] + ")";
  }

  function DataModel() {
    // field[hour][z][y][x]
    this.field = [];
    this.domains = [];
    for (var t = 0; t < 24; t++) {
      var layer = [];
      var min = Infinity;
      var max = -Infinity;
      for (var z = 0; z < NZ; z++) {
        var plane = [];
        for (var y = 0; y < NY; y++) {
          var row = [];
          for (var x = 0; x < NX; x++) {
            var v = pm25(x, y, z, t);
            row.push(v);
            if (v < min) min = v;
            if (v > max) max = v;
          }
          plane.push(row);
        }
        layer.push(plane);
      }
      this.field.push(layer);
      // 域范围按该小时真实 min/max 取整，保证颜色标尺随时间变化
      this.domains.push([Math.floor(min), Math.ceil(max)]);
    }
  }

  DataModel.prototype.valueAt = function (hour, x, y, z) {
    return this.field[hour][z][y][x];
  };

  // 水平切片：固定高度 z，返回 NX x NY 矩阵（按 y 行存储）
  DataModel.prototype.horizontalSlice = function (hour, z) {
    return this.field[hour][z].map(function (row) { return row.slice(); });
  };

  // 垂直切片：固定 y 行，返回 NZ x NX 矩阵（按 z 行存储）
  DataModel.prototype.verticalSlice = function (hour, y) {
    var out = [];
    for (var z = 0; z < NZ; z++) {
      out.push(this.field[hour][z][y].slice());
    }
    return out;
  };

  global.PMModel = {
    NX: NX,
    NY: NY,
    NZ: NZ,
    HEIGHTS: HEIGHTS,
    isUrban: isUrban,
    colorCss: colorCss,
    colorRgb: colorRgb,
    DataModel: DataModel
  };
})(window);
