/* Node 仿真：加载 game.js，用比例控制器模拟两名维修员按键，
 * 实际完成一次桥板对接更换，验证游戏逻辑闭环。 */
'use strict';
const fs = require('fs');

/* ---- 浏览器环境桩 ---- */
const ctxStub = new Proxy({}, {
  get: (t, k) => {
    if (k === 'createLinearGradient') return () => ({ addColorStop() {} });
    if (typeof k === 'string') return t[k] !== undefined ? t[k] : (() => {});
    return () => {};
  },
  set: (t, k, v) => (t[k] = v, true),
});
const mkEl = () => ({
  textContent: '', width: 0, height: 0, clientWidth: 1280, clientHeight: 720,
  classList: { add() {}, remove() {} },
  style: {},
  addEventListener() {},
  getContext: () => ctxStub,
  parentElement: { getBoundingClientRect: () => ({ width: 1280, height: 720 }) },
});
const els = {};
globalThis.document = { getElementById: id => (els[id] ||= mkEl()) };
globalThis.devicePixelRatio = 1;

const keyHandlers = { keydown: [], keyup: [] };
globalThis.addEventListener = (type, fn) => {
  if (keyHandlers[type]) keyHandlers[type].push(fn);
};
const fireKey = (type, code) =>
  keyHandlers[type].forEach(fn => fn({ code, preventDefault() {} }));

let rafCb = null;
globalThis.requestAnimationFrame = cb => { rafCb = cb; };

const audioNode = () => ({
  type: '', pan: { value: 0 },
  frequency: { value: 0, setValueAtTime() {}, setTargetAtTime() {}, exponentialRampToValueAtTime() {} },
  gain: { value: 0, setValueAtTime() {}, setTargetAtTime() {}, exponentialRampToValueAtTime() {} },
  connect: x => x, start() {}, stop() {},
});
globalThis.window = {
  AudioContext: class {
    constructor() { this.state = 'running'; this.destination = {}; }
    resume() {}
    get currentTime() { return simTime; }
    createOscillator() { return audioNode(); }
    createGain() { return audioNode(); }
    createStereoPanner() { return audioNode(); }
  },
};

/* ---- 加载游戏 ---- */
let simTime = 0;
const code = fs.readFileSync('game.js', 'utf8');
eval(code + '\n;globalThis.__G = G; globalThis.__PLATES = PLATES;'
        + 'globalThis.__keys = keys; globalThis.__reset = resetGame;');
const G = globalThis.__G, PLATES = globalThis.__PLATES, keys = globalThis.__keys;

/* 点击“开始作业” */
const btn = els['btn-start'];
// game.js 里 btn 通过 addEventListener 注册，但我们的 mkEl.addEventListener 是空实现，
// 改为直接调用 resetGame 等价路径：触发一次 keydown 以初始化音频，再手动复位。
fireKey('keydown', 'KeyW'); fireKey('keyup', 'KeyW');
globalThis.__reset(); // 直接复位开局（等价于点击按钮）

/* ---- 双人比例控制器（shutdown 模式下故意失控） ---- */
const MODE = process.argv[2] || 'one';
function pilot() {
  if (MODE === 'shutdown') { // A 猛升、B 放空 -> 扭转超限
    keys.KeyW = true; keys.KeyS = false;
    keys.ArrowUp = false; keys.ArrowDown = true;
    return;
  }
  // 维修员A：追踪目标位置
  keys.KeyW = G.lift < G.targetLift - 1.2;
  keys.KeyS = G.lift > G.targetLift + 1.2;
  // 维修员B：追踪目标张力
  keys.ArrowUp = G.tension < G.targetTension - 1.0;
  keys.ArrowDown = G.tension > G.targetTension + 1.0;
}

/* ---- 主循环：16ms 步进 ---- */
let t = 0, lastLog = -1;
const dtMs = 16;
const goal = MODE === 'all' ? () => G.won : () => PLATES[0].done;
console.log(`目标：桥板1  位置≈${G.targetLift.toFixed(0)}  张力≈${G.targetTension.toFixed(0)}`);
while (!goal() && t < 300) {
  simTime = t;
  pilot();
  const cb = rafCb; rafCb = null;
  cb(t * 1000);
  t += dtMs / 1000;
  const sec = Math.floor(t);
  if (sec !== lastLog && sec % 2 === 0) {
    lastLog = sec;
    console.log(
      `t=${sec}s  位置=${G.lift.toFixed(1)}/${G.targetLift.toFixed(1)}` +
      `  张力=${G.tension.toFixed(1)}/${G.targetTension.toFixed(1)}` +
      `  应力=${G.stress.toFixed(0)}%  对接=${(G.dockProgress * 100).toFixed(0)}%`);
  }
  if (G.shutdown) {
    console.log(`!! t=${t.toFixed(1)}s 应力超限，吊桥关闭（扭转=${G.twist.toFixed(2)}）`);
    process.exit(MODE === 'shutdown' ? 0 : 1);
  }
}

if (MODE === 'shutdown') { console.log('未触发关闭？'); process.exit(1); }

if (G.won) {
  console.log(`\n✔✔✔ t=${t.toFixed(1)}s 三块桥板全部更换完成，游戏通关！`);
} else if (PLATES[0].done) {
  console.log(`\n✔ t=${t.toFixed(1)}s 桥板1对接完成，已更换！`);
  console.log(`  完成时应力=${G.stress.toFixed(0)}%，当前进度：桥板 ${G.plateIndex + 1}/3`);
  console.log(`  桥面状态：弯曲sag=${G.sag.toFixed(2)} 扭转twist=${G.twist.toFixed(3)}`);
} else {
  console.log('超时未完成对接');
  process.exit(1);
}
