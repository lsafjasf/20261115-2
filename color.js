/*
 * color.js — 配色检查核心逻辑(纯函数,浏览器与 Node 通用)
 *
 *  - sRGB 解析 / 相对亮度 / WCAG 对比度
 *  - Machado et al. (2009) 色弱模拟矩阵(红绿色弱=deuteranopia,蓝黄色弱=tritanopia)
 *  - 可辨识度评分与安全范围判定
 *  - 优化建议生成(仅建议,不自动替换)
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.ColorCheck = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // Machado et al. (2009), severity = 1.0(完全二色视)
  var CVD_MATRICES = {
    normal: null,
    deuteranopia: [
      // 红绿色弱(绿色弱)
      [0.367322, 0.860646, -0.227968],
      [0.280085, 0.672501, 0.047413],
      [-0.01182, 0.04294, 0.968881],
    ],
    tritanopia: [
      // 蓝黄色弱
      [1.255528, -0.076749, -0.178779],
      [-0.078411, 0.930809, 0.147602],
      [0.004733, 0.691367, 0.3039],
    ],
  };

  var VIEW_LABELS = {
    normal: "普通视图",
    deuteranopia: "红绿色弱视图",
    tritanopia: "蓝黄色弱视图",
  };

  function clamp01(v) {
    return v < 0 ? 0 : v > 1 ? 1 : v;
  }

  function hexToRgb(hex) {
    var h = String(hex).trim().replace(/^#/, "");
    if (h.length === 3) {
      h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    }
    if (!/^[0-9a-fA-F]{6}$/.test(h)) {
      throw new Error("非法颜色值: " + hex);
    }
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
    };
  }

  function rgbToHex(rgb) {
    function to2(v) {
      var s = Math.round(clamp01(v / 255) * 255).toString(16);
      return s.length === 1 ? "0" + s : s;
    }
    return "#" + to2(rgb.r) + to2(rgb.g) + to2(rgb.b);
  }

  function srgbToLinear(c) {
    c = c / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }

  function linearToSrgb(c) {
    c = clamp01(c);
    var v = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
    return Math.round(v * 255);
  }

  // WCAG 相对亮度
  function relativeLuminance(rgb) {
    return (
      0.2126 * srgbToLinear(rgb.r) +
      0.7152 * srgbToLinear(rgb.g) +
      0.0722 * srgbToLinear(rgb.b)
    );
  }

  // WCAG 对比度 (1..21)
  function contrastRatio(rgbA, rgbB) {
    var l1 = relativeLuminance(rgbA);
    var l2 = relativeLuminance(rgbB);
    var hi = Math.max(l1, l2);
    var lo = Math.min(l1, l2);
    return (hi + 0.05) / (lo + 0.05);
  }

  // 对 sRGB 颜色做色弱模拟(在线性光空间应用 Machado 矩阵)
  function simulate(rgb, view) {
    var m = CVD_MATRICES[view];
    if (!m) return { r: rgb.r, g: rgb.g, b: rgb.b };
    var lr = srgbToLinear(rgb.r);
    var lg = srgbToLinear(rgb.g);
    var lb = srgbToLinear(rgb.b);
    return {
      r: linearToSrgb(m[0][0] * lr + m[0][1] * lg + m[0][2] * lb),
      g: linearToSrgb(m[1][0] * lr + m[1][1] * lg + m[1][2] * lb),
      b: linearToSrgb(m[2][0] * lr + m[2][1] * lg + m[2][2] * lb),
    };
  }

  // 模拟后两色在 sRGB 空间的欧氏距离(0..~441)
  function simulatedDistance(rgbA, rgbB, view) {
    var a = simulate(rgbA, view);
    var b = simulate(rgbB, view);
    var dr = a.r - b.r;
    var dg = a.g - b.g;
    var db = a.b - b.b;
    return Math.sqrt(dr * dr + dg * dg + db * db);
  }

  // 可辨识度评分 0..100:对比度与色向距离各占一半
  function distinguishabilityScore(rgbA, rgbB, view) {
    var a = simulate(rgbA, view);
    var b = simulate(rgbB, view);
    var ratio = contrastRatio(a, b);
    var contrastPart = Math.min(ratio / 7, 1); // 7:1 视为满分
    var distPart = Math.min(simulatedDistance(rgbA, rgbB, view) / 255, 1);
    return Math.round((contrastPart * 0.5 + distPart * 0.5) * 100);
  }

  // 安全阈值
  var THRESHOLDS = {
    titleContrast: 4.5, // 标题文字 WCAG AA
    buttonContrast: 3.0, // 大控件/图形 WCAG AA
    score: 50, // 可辨识度评分下限
  };

  // 评估一对颜色在指定视图下是否安全
  function evaluatePair(rgbFg, rgbBg, view, minContrast) {
    var simFg = simulate(rgbFg, view);
    var simBg = simulate(rgbBg, view);
    var ratio = contrastRatio(simFg, simBg);
    var score = distinguishabilityScore(rgbFg, rgbBg, view);
    var safe = ratio >= minContrast && score >= THRESHOLDS.score;
    return {
      view: view,
      contrast: Math.round(ratio * 100) / 100,
      score: score,
      minContrast: minContrast,
      safe: safe,
    };
  }

  // 评估整组配色(背景/标题/按钮)在指定视图下的结果
  function evaluateScheme(scheme, view) {
    var bg = hexToRgb(scheme.background);
    var title = hexToRgb(scheme.title);
    var button = hexToRgb(scheme.button);
    var titleRes = evaluatePair(title, bg, view, THRESHOLDS.titleContrast);
    var buttonRes = evaluatePair(button, bg, view, THRESHOLDS.buttonContrast);
    return {
      view: view,
      viewLabel: VIEW_LABELS[view],
      title: titleRes,
      button: buttonRes,
      safe: titleRes.safe && buttonRes.safe,
    };
  }

  // 沿明度方向搜索一个能在指定视图下达到目标对比度的参考色(保持色相,仅作建议)
  function suggestColor(fg, bg, target, view) {
    var best = null;
    var bestDiff = Infinity;
    for (var t = 0.02; t <= 1.0001; t += 0.02) {
      var darker = {
        r: Math.round(fg.r * (1 - t)),
        g: Math.round(fg.g * (1 - t)),
        b: Math.round(fg.b * (1 - t)),
      };
      var lighter = {
        r: Math.round(fg.r + (255 - fg.r) * t),
        g: Math.round(fg.g + (255 - fg.g) * t),
        b: Math.round(fg.b + (255 - fg.b) * t),
      };
      [darker, lighter].forEach(function (c) {
        var ratio = contrastRatio(simulate(c, view), simulate(bg, view));
        if (ratio >= target) {
          var diff =
            Math.abs(c.r - fg.r) + Math.abs(c.g - fg.g) + Math.abs(c.b - fg.b);
          if (diff < bestDiff) {
            bestDiff = diff;
            best = c;
          }
        }
      });
    }
    return best ? rgbToHex(best) : "(未找到,请手动调整明度)";
  }

  // 生成优化建议报告(纯文本建议,绝不自动替换用户颜色)
  function buildSuggestions(scheme) {
    var views = ["normal", "deuteranopia", "tritanopia"];
    var lines = [];
    lines.push("配色优化建议报告");
    lines.push("生成时间: " + new Date().toISOString());
    lines.push(
      "当前配色: 背景 " +
        scheme.background +
        " / 标题 " +
        scheme.title +
        " / 按钮 " +
        scheme.button
    );
    lines.push("");

    var problems = [];
    views.forEach(function (view) {
      var r = evaluateScheme(scheme, view);
      lines.push("【" + r.viewLabel + "】");
      lines.push(
        "  标题/背景: 对比度 " +
          r.title.contrast +
          ":1(要求 ≥ " +
          r.title.minContrast +
          ":1),可辨识度 " +
          r.title.score +
          "/100 → " +
          (r.title.safe ? "安全" : "超出安全范围")
      );
      lines.push(
        "  按钮/背景: 对比度 " +
          r.button.contrast +
          ":1(要求 ≥ " +
          r.button.minContrast +
          ":1),可辨识度 " +
          r.button.score +
          "/100 → " +
          (r.button.safe ? "安全" : "超出安全范围")
      );
      if (!r.title.safe) {
        problems.push({ view: view, viewLabel: r.viewLabel, pair: "标题/背景", res: r.title, role: "title" });
      }
      if (!r.button.safe) {
        problems.push({ view: view, viewLabel: r.viewLabel, pair: "按钮/背景", res: r.button, role: "button" });
      }
    });

    lines.push("");
    if (problems.length === 0) {
      lines.push("结论: 三种视图下均在安全范围内,无需调整。");
    } else {
      lines.push(
        "结论: 发现 " +
          problems.length +
          " 处超出安全范围。以下为参考建议,请手动挑选采纳 —— 工具不会自动替换您的任何颜色:"
      );
      problems.forEach(function (p, i) {
        var suggestion = suggestColor(
          hexToRgb(scheme[p.role]),
          hexToRgb(scheme.background),
          p.res.minContrast,
          p.view
        );
        lines.push(
          "  " +
            (i + 1) +
            ". [" +
            p.viewLabel +
            " · " +
            p.pair +
            "] 当前对比度 " +
            p.res.contrast +
            ":1。可尝试将" +
            (p.role === "title" ? "标题色" : "按钮色") +
            "调整为 " +
            suggestion +
            " 附近(保持色相、拉开明度差),或反向调整背景色。"
        );
      });
      lines.push("");
      lines.push(
        "提示: 红绿色弱用户难以分辨红/绿,蓝黄色弱用户难以分辨蓝/黄;除色相外,请同时保证足够的明度差。"
      );
    }
    return lines.join("\n");
  }

  return {
    CVD_MATRICES: CVD_MATRICES,
    VIEW_LABELS: VIEW_LABELS,
    THRESHOLDS: THRESHOLDS,
    hexToRgb: hexToRgb,
    rgbToHex: rgbToHex,
    relativeLuminance: relativeLuminance,
    contrastRatio: contrastRatio,
    simulate: simulate,
    simulatedDistance: simulatedDistance,
    distinguishabilityScore: distinguishabilityScore,
    evaluatePair: evaluatePair,
    evaluateScheme: evaluateScheme,
    buildSuggestions: buildSuggestions,
    suggestColor: suggestColor,
  };
});
