// 无浏览器冒烟测试：DOM 打桩后驱动 game.js 主循环
const fs = require('fs');

function makeCtx() {
  const noop = () => {};
  return new Proxy({}, { get: (t, k) => {
    if (k === 'createLinearGradient') return () => ({ addColorStop: noop });
    return noop;
  }, set: () => true });
}
const elements = {};
function el(id) {
  if (!elements[id]) {
    const listeners = {};
    elements[id] = {
      id, textContent: '', innerHTML: '', value: '6', style: {},
      className: '', disabled: false, scrollTop: 0,
      width: 760, height: 460,
      getContext: makeCtx,
      addEventListener: (ev, fn) => { listeners[ev] = fn; },
      _fire: (ev) => listeners[ev] && listeners[ev](),
      appendChild: (c) => {},
    };
  }
  return elements[id];
}

global.window = global;
global.addEventListener = () => {};
global.document = {
  getElementById: el,
  createElement: () => ({ className: '', textContent: '' }),
};
let rafQueue = [];
global.requestAnimationFrame = fn => rafQueue.push(fn);
global.performance = { now: () => simTime };
let simTime = 0;

const S = require('./sim.js');
global.PipeSim = S;
class AudioStub {
  constructor() {
    this.currentTime = 0; this.sampleRate = 44100;
    this.destination = {};
  }
  createGain() { return { gain: { value: 0, setValueAtTime(){}, exponentialRampToValueAtTime(){} }, connect: x => x }; }
  createBuffer() { return { getChannelData: () => new Float32Array(16) }; }
  createBufferSource() { return { buffer: null, loop: false, connect: x => x, start(){}, stop(){} }; }
  createBiquadFilter() { return { type: '', frequency: { value: 0 }, connect: x => x }; }
  createOscillator() { return { type: '', frequency: { setValueAtTime(){}, exponentialRampToValueAtTime(){} }, connect: x => x, start(){}, stop(){} }; }
}
global.AudioContext = AudioStub;

eval(fs.readFileSync('./game.js', 'utf8'));

function frames(n, stepMs = 50) {
  for (let i = 0; i < n; i++) {
    simTime += stepMs;
    const q = rafQueue; rafQueue = [];
    q.forEach(fn => fn(simTime));
  }
}
const sim = () => S.createSim; // placeholder

frames(5);
console.log('主循环启动 OK, status =', el('status').textContent);

// 走一遍成功流程（通过按钮）
el('btnCloseA')._fire('click'); frames(140);          // 6s 关 A
el('btnCloseB')._fire('click'); frames(140);          // 6s 关 B
el('btnDig')._fire('click');
el('btnShore')._fire('click'); el('btnShore')._fire('click');
el('btnShore')._fire('click'); el('btnShore')._fire('click');
el('btnDrain')._fire('click'); frames(450);           // 排水 ~20s
el('btnInstall')._fire && el('btnInstall')._fire('mousedown');
// install 需要按住：直接调 mousedown 监听器
// game.js 用 addEventListener('mousedown')，我们的桩统一存 listeners
elements['btnInstall']._fire('mousedown');
frames(200);                                          // 按住安装 ~6s+
window.dispatchEvent && 0;
el('btnRestore')._fire('click');
el('btnOpenB')._fire('click'); frames(200);
el('btnOpenA')._fire('click'); frames(400);

// 从 game.js 内部状态读不到 sim（eval 作用域），用 status 文本判断
const st = el('status').textContent;
console.log('最终状态:', st);
console.log(st.includes('成功') ? 'SMOKE PASS' : 'SMOKE FAIL（可能安装或开阀未完成）');
