// 冒烟测试:用最小 DOM/Canvas 桩在 Node 中运行 app.js,验证渲染流程无异常
const handlers = {};

function makeCtx() {
  const noop = () => {};
  return new Proxy(
    {},
    {
      get: (t, p) => (typeof t[p] !== "undefined" ? t[p] : noop),
      set: () => true,
    }
  );
}

function makeEl(id) {
  return {
    id,
    value: "#1eec28",
    textContent: "",
    dataset: { view: "deuteranopia" },
    classList: { toggle: () => {} },
    setAttribute: () => {},
    addEventListener: (ev, fn) => {
      handlers[id + ":" + ev] = fn;
    },
    getContext: () => makeCtx(),
    width: 640,
    height: 320,
    click: () => {},
  };
}

const els = {};
const viewBtns = ["normal", "deuteranopia", "tritanopia"].map((v) => {
  const el = makeEl("view-" + v);
  el.dataset.view = v;
  return el;
});

global.document = {
  getElementById: (id) => els[id] || (els[id] = makeEl(id)),
  querySelectorAll: () => viewBtns,
  createElement: () => makeEl("a"),
  body: { appendChild: () => {}, removeChild: () => {} },
};
global.window = global;
global.URL.createObjectURL = () => "blob:mock";
global.URL.revokeObjectURL = () => {};
global.Blob = class Blob {};

global.ColorCheck = require("../color.js");
require("../app.js");

// 模拟:切换视图按钮点击 + 颜色输入 + 导出点击
for (const btn of viewBtns) {
  handlers[btn.id + ":click"]();
}
handlers["bgColor:input"]();
handlers["titleColor:input"]();
handlers["buttonColor:input"]();
handlers["exportBtn:click"]();

console.log("app.js 冒烟测试通过:初始渲染、视图切换、颜色输入、导出均无异常");
