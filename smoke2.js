// 演示按钮：0.2s 猛关阀 B -> 水锤爆管
const fs = require('fs');
function makeCtx() {
  const noop = () => {};
  return new Proxy({}, { get: (t, k) =>
    k === 'createLinearGradient' ? () => ({ addColorStop: noop }) : noop, set: () => true });
}
const elements = {};
function el(id) {
  if (!elements[id]) {
    const listeners = {};
    elements[id] = {
      id, textContent: '', innerHTML: '', value: '6', style: {}, disabled: false,
      width: 760, height: 460, scrollTop: 0,
      getContext: makeCtx,
      addEventListener: (ev, fn) => { listeners[ev] = fn; },
      _fire: (ev) => listeners[ev] && listeners[ev](),
      appendChild: () => {},
    };
  }
  return elements[id];
}
global.window = global;
global.addEventListener = () => {};
global.document = { getElementById: el, createElement: () => ({ className: '', textContent: '' }) };
let rafQueue = [];
global.requestAnimationFrame = fn => rafQueue.push(fn);
global.performance = { now: () => simTime };
let simTime = 0;
class AudioStub {
  constructor() { this.currentTime = 0; this.sampleRate = 44100; this.destination = {}; }
  createGain() { return { gain: { value: 0, setValueAtTime(){}, exponentialRampToValueAtTime(){} }, connect: x => x }; }
  createBuffer() { return { getChannelData: () => new Float32Array(16) }; }
  createBufferSource() { return { buffer: null, loop: false, connect: x => x, start(){}, stop(){} }; }
  createBiquadFilter() { return { type: '', frequency: { value: 0 }, connect: x => x }; }
  createOscillator() { return { type: '', frequency: { setValueAtTime(){}, exponentialRampToValueAtTime(){} }, connect: x => x, start(){}, stop(){} }; }
}
global.AudioContext = AudioStub;
global.PipeSim = require('./sim.js');
eval(fs.readFileSync('./game.js', 'utf8'));
function frames(n, stepMs = 50) {
  for (let i = 0; i < n; i++) {
    simTime += stepMs;
    const q = rafQueue; rafQueue = [];
    q.forEach(fn => fn(simTime));
  }
}
frames(5);
el('btnDemo')._fire('click');
frames(60);
const st = el('status').textContent;
console.log('演示后状态:', st);
console.log(st.includes('失败') && st.includes('爆管') ? 'DEMO PASS' : 'DEMO FAIL');
