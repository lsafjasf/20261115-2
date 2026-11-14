// 冒烟测试：用 DOM 桩在 Node 中运行 game.js 若干帧，捕捉运行时错误。
const fs = require("fs");

function makeCtx() {
  const gradient = { addColorStop() {} };
  return new Proxy({}, {
    get(t, prop) {
      if (prop === "createLinearGradient") return () => gradient;
      if (!(prop in t)) t[prop] = function () {};
      return t[prop];
    },
    set(t, prop, v) { t[prop] = v; return true; },
  });
}

function makeEl() {
  return {
    textContent: "", innerHTML: "", style: {},
    classList: { add() {}, remove() {} },
    appendChild() {}, addEventListener() {},
    width: 960, height: 540,
    getContext: () => makeCtx(),
  };
}

const els = {};
const listeners = {};
let frames = 0;

global.window = {
  addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
  AudioContext: function () {
    return {
      state: "running", currentTime: 0, sampleRate: 44100, destination: {},
      resume() {},
      createOscillator: () => ({ type: "", frequency: {}, connect: (n) => n, start() {}, stop() {} }),
      createGain: () => ({ gain: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect: (n) => n }),
      createBuffer: (ch, len) => ({ getChannelData: () => new Float32Array(len) }),
      createBufferSource: () => ({ buffer: null, connect: (n) => n, start() {} }),
      createBiquadFilter: () => ({ type: "", frequency: { value: 0 }, connect: (n) => n }),
    };
  },
};
global.document = {
  getElementById(id) { return (els[id] = els[id] || makeEl()); },
  createElement: () => makeEl(),
};
global.self = global.window;
global.performance = { now: () => frames * 16.7 };
global.requestAnimationFrame = function (fn) {
  if (frames++ < 600) fn(frames * 16.7); // 模拟约 10 秒
};

global.window.CameraLogic = require("./logic.js");
eval(fs.readFileSync("game.js", "utf8"));

// 模拟按键：右玩家调光圈/快门并拍一张
function key(k, type) { for (const fn of listeners[type] || []) fn({ key: k, preventDefault() {}, repeat: false }); }
key("ArrowUp", "keydown");
key("ArrowRight", "keydown");
key(" ", "keydown");
key("w", "keydown");
key("w", "keyup");

console.log("冒烟测试通过：渲染 " + frames + " 帧无异常 ✓");
