/* 浏览器集成冒烟：mock DOM/Audio，加载 engine+render+main 的逻辑并跑自动演示。 */
const fs = require('fs');
const path = require('path');

function makeEl() {
  const el = {
    style: {},
    classList: { add() {}, remove() {}, toggle() {} },
    addEventListener() {},
    getContext: () => ({
      setTransform() {}, fillRect() {}, fillText() {}, beginPath() {},
      moveTo() {}, lineTo() {}, quadraticCurveTo() {}, stroke() {}, fill() {},
      arc() {}, save() {}, restore() {}, translate() {}, rotate() {},
      closePath() {}, strokeRect() {}, createLinearGradient: () => ({ addColorStop() {} })
    }),
    clientWidth: 900, clientHeight: 440, width: 0, height: 0,
    textContent: ''
  };
  return el;
}

const elements = {};
const checked = { value: 'A' };
global.window = {
  devicePixelRatio: 1,
  AudioContext: function () {
    return {
      state: 'running', currentTime: 0, sampleRate: 44100, destination: {},
      createGain: () => ({ gain: { value: 0, setValueAtTime() {}, setTargetAtTime() {},
        cancelScheduledValues() {}, exponentialRampToValueAtTime() {} }, connect() {} }),
      createOscillator: () => ({ type: '', frequency: { value: 0, setValueAtTime() {},
        setTargetAtTime() {}, cancelScheduledValues() {}, exponentialRampToValueAtTime() {} },
        connect() {}, start() {}, stop() {} }),
      createBiquadFilter: () => ({ type: '', frequency: { value: 0, setTargetAtTime() {} },
        Q: { value: 0 }, connect() {} }),
      createBuffer: () => ({ getChannelData: () => new Float32Array(10) }),
      createBufferSource: () => ({ buffer: null, loop: false, connect() {}, start() {} }),
      resume() {}
    };
  },
  addEventListener() {},
  requestAnimationFrame: () => 0
};
global.document = {
  getElementById: id => (elements[id] || (elements[id] = makeEl())),
  querySelector: () => checked
};
global.performance = { now: () => Date.now() };
global.requestAnimationFrame = () => 0;
global.window.requestAnimationFrame = global.requestAnimationFrame;

const root = path.join(__dirname, '..', 'js');
global.window.BridgeEngine = require(path.join(root, 'engine.js'));
loadGlobal(path.join(root, 'audio.js'));
loadGlobal(path.join(root, 'render.js'));
loadGlobal(path.join(root, 'main.js'));

function loadGlobal(file) {
  let src = fs.readFileSync(file, 'utf8');
  src = src.replace(/\(function \((?:root)?\)\s*\{/, '(function (root) {');
  src = src.replace(/\}\)\(window\);?\s*$/, '})(global.window);');
  eval.call(global, src + '\n//# sourceURL=' + path.basename(file));
}

const E = global.window.BridgeEngine;
// 冒烟用无风确定性环境验证调度策略；阵风由 playthrough 的有风整局覆盖
const g = E.createGame({ gusts: false });
// 复刻自动演示的完整脚本，验证浏览器侧策略可达成胜利
const { advance } = require('./sim.js');
const { CFG, loadCargo, unloadCargo, atStation } = E;
function drive(target) {
  let guard = 0;
  while (g.status === 'running' && guard < 60000) {
    if (E.reachedStation(g, target)) { g.input.dir = 0; break; }
    g.input.dir = g.s < target ? 1 : -1;
    E.step(g, CFG.FIXED_DT);
    guard++;
  }
  g.input.dir = 0;
}
advance(g, 2.5);
for (let i = 0; i < 6; i++) loadCargo(g, 'A', 1);
for (let i = 0; i < 4; i++) loadCargo(g, 'C', 1);
drive(1); unloadCargo(g, 10);
for (let i = 0; i < 5; i++) loadCargo(g, 'B', 1);
drive(0); unloadCargo(g, 5);
for (let i = 0; i < 5; i++) loadCargo(g, 'C', 1);
drive(0.5); unloadCargo(g, 5);
for (let i = 0; i < 5; i++) loadCargo(g, 'C', 1);
drive(1); unloadCargo(g, 5);

const assert = require('assert');
assert.strictEqual(g.status, 'won', '自动演示应胜利，实际 ' + g.status);
assert.strictEqual(g.trips, 3);
assert.deepStrictEqual(g.delivered, { A: 6, B: 5, C: 9 });
assert.ok(atStation(g) === 'right');
console.log('✔ 浏览器集成冒烟通过：自动演示胜利，3 班次，交付', JSON.stringify(g.delivered));
console.log('✔ 峰值应力比', g.peakStress.toFixed(3), '最大下垂', g.maxSag.toFixed(2) + 'm');
