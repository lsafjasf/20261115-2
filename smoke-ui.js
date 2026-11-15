// 冒烟测试：用 jsdom 加载页面，跑若干帧，验证 UI 与模拟联动
const fs = require("fs");
const path = require("path");
const { JSDOM } = require(path.join("/tmp/uismoke", "node_modules", "jsdom"));

const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
const simSrc = fs.readFileSync(path.join(__dirname, "sim.js"), "utf8");
const uiSrc = fs.readFileSync(path.join(__dirname, "ui.js"), "utf8");

const frames = 120; // 跑 120 帧（约 2 秒真实时间，~16 模拟秒）
let rafCount = 0;

const dom = new JSDOM(html, { runScripts: "outside-only", pretendToBeVisual: true });
const { window } = dom;

// canvas 2d 上下文桩（jsdom 无 canvas 实现）
window.HTMLCanvasElement.prototype.getContext = function () {
  const noop = () => {};
  return {
    clearRect: noop, drawImage: noop, putImageData: noop,
    beginPath: noop, moveTo: noop, lineTo: noop, stroke: noop,
    arc: noop, fill: noop, closePath: noop, fillText: noop,
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
    set fillStyle(v) {}, get fillStyle() { return ""; },
    set strokeStyle(v) {}, get strokeStyle() { return ""; },
    set lineWidth(v) {}, get lineWidth() { return 1; },
    set font(v) {}, get font() { return ""; },
    set textAlign(v) {}, get textAlign() { return ""; },
    set imageSmoothingEnabled(v) {}, get imageSmoothingEnabled() { return true; },
  };
};
window.requestAnimationFrame = function (cb) {
  if (rafCount++ < frames) setTimeout(cb, 0);
  return rafCount;
};

window.eval(simSrc);
window.eval(uiSrc);

setTimeout(() => {
  const doc = window.document;
  const timer = doc.getElementById("timer").textContent;
  const mons = [...doc.querySelectorAll("#monitors .mon b")].map((b) => b.textContent);
  const towers = doc.querySelectorAll("#towers .card").length;
  const filterBars = doc.querySelectorAll("#towers .filter i").length;

  let pass = true;
  function check(name, cond, detail) {
    console.log((cond ? "PASS  " : "FAIL  ") + name + (detail ? "  (" + detail + ")" : ""));
    if (!cond) pass = false;
  }
  check("UI：渲染了 3 座塔控制卡", towers === 3, "towers=" + towers);
  check("UI：渲染了 6 条滤芯负载条", filterBars === 6, "bars=" + filterBars);
  check("UI：计时器在走", timer !== "30:00" && timer !== "00:00", "timer=" + timer);
  check("UI：监测点有读数", mons.length === 3 && mons.every((m) => m !== "--"),
    "mons=[" + mons.join(",") + "]");

  // 模拟用户操作：把 1 号塔风量拉到 100
  const slider = doc.querySelector("#towers .card input[data-k=airflow]");
  slider.value = "100";
  slider.dispatchEvent(new window.Event("input", { bubbles: true }));
  const out = slider.parentElement.querySelector("output").textContent;
  check("UI：滑块联动输出", out === "100%", "output=" + out);

  // 切换滤芯按钮
  const btn = doc.querySelector("#towers .card button");
  btn.dispatchEvent(new window.Event("click", { bubbles: true }));
  check("UI：切换滤芯不报错", true);

  console.log(pass ? "\nUI 冒烟测试通过" : "\nUI 冒烟测试失败");
  process.exit(pass ? 0 : 1);
}, 500);
