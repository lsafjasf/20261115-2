const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function createElement(id) {
  const listeners = {};
  return {
    id,
    value: '50',
    checked: true,
    innerHTML: '',
    textContent: '',
    className: '',
    width: 1000,
    height: 420,
    getContext: () => new Proxy({}, {
      get: (target, property) => {
        if (property === 'createLinearGradient') {
          return () => ({ addColorStop() {} });
        }
        return () => {};
      }
    }),
    addEventListener: (name, handler) => { listeners[name] = handler; },
    dispatch: (name) => listeners[name] && listeners[name]({ target: { checked: true } })
  };
}

const ids = [
  'scene', 'chart', 'timePill', 'tempPill', 'pipePill', 'resultPill',
  'canalGate', 'outletGate', 'pumpSpeed', 'canalValue', 'outletValue', 'pumpValue',
  'reservoirMetric', 'inflowMetric', 'pumpMetric', 'failureMetric', 'snowMetric',
  'shortageMetric', 'villageList', 'eventLog', 'playBtn', 'pauseBtn', 'stepBtn',
  'autoBtn', 'resetBtn', 'blockTestBtn', 'soundToggle'
];
const elements = Object.fromEntries(ids.map((id) => [id, createElement(id)]));

const sandbox = {
  console,
  setInterval: (callback, intervalMs) => {
    if (intervalMs === 750) {
      const timer = { cleared: false };
      sandbox.__blockTimer = timer;
      for (let steps = 0; steps < 20 && !timer.cleared; steps += 1) callback();
      return timer;
    }
    return { id: Math.random() };
  },
  clearInterval: (timer) => {
    if (timer && typeof timer === 'object') timer.cleared = true;
  },
  AudioContext: function () {
    return {
      state: 'running',
      currentTime: 0,
      sampleRate: 8000,
      destination: {},
      resume() {},
      createGain: () => ({ gain: { value: 1, setTargetAtTime() {} }, connect() {} }),
      createBiquadFilter: () => ({ type: '', frequency: { value: 0, setTargetAtTime() {} }, connect() {} }),
      createBuffer: (channels, length) => ({ getChannelData: () => new Float32Array(length) }),
      createBufferSource: () => ({ buffer: null, loop: false, connect() {}, start() {} }),
      createOscillator: () => ({ type: '', frequency: { value: 0, setTargetAtTime() {} }, connect() {}, start() {} })
    };
  }
};
sandbox.window = sandbox;
sandbox.document = {
  getElementById: (id) => elements[id],
  createElement: () => createElement('dynamic')
};
vm.createContext(sandbox);

function load(file) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', file), 'utf8'), sandbox, { filename: file });
}

load('simulation.js');
load('audio.js');
load('app.js');

assert.ok(elements.timePill.textContent.includes('0 / 48'));
assert.strictEqual(elements.pipePill.textContent, '结冰度 0%');

elements.autoBtn.dispatch('click');
assert.ok(elements.timePill.textContent.includes('0 / 48'));

for (let i = 0; i < 48; i += 1) elements.stepBtn.dispatch('click');
assert.ok(elements.timePill.textContent.includes('48 / 48'));
assert.strictEqual(elements.failureMetric.textContent, '0 次');

elements.blockTestBtn.dispatch('click');
assert.ok(elements.pipePill.textContent.includes('冰堵'), '堵塞测试按钮应切换为冰堵状态');
assert.ok(elements.resultPill.textContent.includes('堵塞测试'));

elements.resetBtn.dispatch('click');
assert.strictEqual(elements.pipePill.className, 'pill-ok');
console.log('✓ 页面初始化、自动调度与堵塞测试交互正常');
console.log('全部浏览器逻辑测试通过');
