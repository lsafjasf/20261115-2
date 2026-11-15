/* app.js — 页面交互与 Canvas 渲染(依赖 color.js 的 ColorCheck) */
(function () {
  "use strict";
  var C = window.ColorCheck;

  var els = {
    bg: document.getElementById("bgColor"),
    title: document.getElementById("titleColor"),
    button: document.getElementById("buttonColor"),
    bgHex: document.getElementById("bgHex"),
    titleHex: document.getElementById("titleHex"),
    buttonHex: document.getElementById("buttonHex"),
    viewLabel: document.getElementById("viewLabel"),
    preview: document.getElementById("previewCanvas"),
    swatches: document.getElementById("swatchCanvas"),
    exportBtn: document.getElementById("exportBtn"),
  };

  var currentView = "normal";

  function getScheme() {
    return {
      background: els.bg.value,
      title: els.title.value,
      button: els.button.value,
    };
  }

  function hex(rgb) {
    return C.rgbToHex(rgb);
  }

  // 预览画布:模拟当前视图下的页面效果(背景 + 标题文字 + 按钮)
  function drawPreview(scheme, view) {
    var ctx = els.preview.getContext("2d");
    var W = els.preview.width;
    var H = els.preview.height;
    var bg = C.simulate(C.hexToRgb(scheme.background), view);
    var title = C.simulate(C.hexToRgb(scheme.title), view);
    var button = C.simulate(C.hexToRgb(scheme.button), view);

    ctx.fillStyle = hex(bg);
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = hex(title);
    ctx.font = "bold 34px 'PingFang SC', 'Microsoft YaHei', sans-serif";
    ctx.textBaseline = "alphabetic";
    ctx.fillText("页面标题示例 Title", 32, 78);

    ctx.font = "16px sans-serif";
    ctx.fillText("这是一段正文示意,用于观察标题与背景在该视图下的实际观感。", 32, 116);

    // 按钮
    var bx = 32, by = 160, bw = 180, bh = 52, r = 10;
    ctx.fillStyle = hex(button);
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(bx, by, bw, bh, r);
    } else {
      ctx.rect(bx, by, bw, bh);
    }
    ctx.fill();
    // 按钮文字:取按钮色的对比色(黑/白)
    var btnLum = C.relativeLuminance(button);
    ctx.fillStyle = btnLum > 0.35 ? "#1a1a1a" : "#ffffff";
    ctx.font = "bold 18px sans-serif";
    ctx.fillText("主要按钮", bx + 48, by + 33);

    // 视图标注
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.font = "13px sans-serif";
    ctx.fillText("模拟视图:" + C.VIEW_LABELS[view], W - 160, H - 16);
  }

  // 色块画布:上行原始三色,下行当前视图模拟三色
  function drawSwatches(scheme, view) {
    var ctx = els.swatches.getContext("2d");
    var W = els.swatches.width;
    var H = els.swatches.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, H);

    var roles = [
      { key: "background", label: "背景" },
      { key: "title", label: "标题" },
      { key: "button", label: "按钮" },
    ];
    var colW = (W - 40) / 3;
    var rows = [
      { label: "原始", view: "normal", y: 34 },
      { label: C.VIEW_LABELS[view], view: view, y: 118 },
    ];

    ctx.fillStyle = "#333";
    ctx.font = "13px sans-serif";
    rows.forEach(function (row) {
      ctx.fillStyle = "#333";
      ctx.fillText(row.label, 6, row.y + 44);
      roles.forEach(function (role, i) {
        var rgb = C.simulate(C.hexToRgb(scheme[role.key]), row.view);
        var x = 60 + i * colW;
        ctx.fillStyle = hex(rgb);
        ctx.fillRect(x, row.y, colW - 16, 56);
        ctx.strokeStyle = "#c8cfd9";
        ctx.strokeRect(x + 0.5, row.y + 0.5, colW - 17, 55);
        ctx.fillStyle = "#555";
        ctx.fillText(role.label + " " + hex(rgb), x, row.y + 72);
      });
    });
  }

  function setCard(prefix, res) {
    var card = document.getElementById(prefix + "Card");
    document.getElementById(prefix + "Contrast").textContent = res.contrast;
    document.getElementById(prefix + "Score").textContent = res.score;
    var verdict = document.getElementById(prefix + "Verdict");
    card.classList.toggle("unsafe", !res.safe);
    card.classList.toggle("safe", res.safe);
    verdict.textContent = res.safe ? "✓ 安全" : "✗ 超出安全范围";
  }

  function render() {
    var scheme = getScheme();
    els.bgHex.textContent = scheme.background;
    els.titleHex.textContent = scheme.title;
    els.buttonHex.textContent = scheme.button;
    els.viewLabel.textContent = C.VIEW_LABELS[currentView];

    var result = C.evaluateScheme(scheme, currentView);
    setCard("title", result.title);
    setCard("button", result.button);
    drawPreview(scheme, currentView);
    drawSwatches(scheme, currentView);
  }

  ["bg", "title", "button"].forEach(function (k) {
    els[k].addEventListener("input", render);
  });

  document.querySelectorAll(".view-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      currentView = btn.dataset.view;
      document.querySelectorAll(".view-btn").forEach(function (b) {
        var active = b === btn;
        b.classList.toggle("active", active);
        b.setAttribute("aria-selected", active ? "true" : "false");
      });
      render();
    });
  });

  // 导出建议:只生成文本下载,绝不修改当前颜色
  els.exportBtn.addEventListener("click", function () {
    var scheme = getScheme();
    var text = C.buildSuggestions(scheme);
    var blob = new Blob(["﻿" + text], { type: "text/plain;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "配色优化建议.txt";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () {
      URL.revokeObjectURL(a.href);
    }, 1000);
  });

  render();
})();
