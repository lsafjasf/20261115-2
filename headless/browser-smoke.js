/* jsdom smoke test: loads index.html, stubs canvas/audio, runs a full clean. */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('/tmp/jsdom-test/node_modules/jsdom');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

const dom = new JSDOM(html, {
  url: 'http://localhost/',
  runScripts: 'outside-only',
  pretendToBeVisual: true
});
const { window } = dom;

// Minimal Canvas 2D stub — we only check that calls don't throw.
function makeCtx() {
  return new Proxy({}, {
    get(target, prop) {
      if (prop === 'measureText') return () => ({ width: 40 });
      if (prop === 'createLinearGradient') return () => ({ addColorStop() {} });
      return typeof prop === 'string' ? function () {} : undefined;
    },
    set() { return true; }
  });
}
window.HTMLCanvasElement.prototype.getContext = function () { return makeCtx(); };

// requestAnimationFrame: drive a handful of frames manually.
let rafQueue = [];
window.requestAnimationFrame = function (cb) { rafQueue.push(cb); return rafQueue.length; };

// AudioContext stub.
function Param(v) { return { value: v, setTargetAtTime() {} }; }
function GainNode() { return { gain: Param(0), connect() { return this; } }; }
window.AudioContext = function () {
  return {
    state: 'running',
    currentTime: 0,
    sampleRate: 44100,
    destination: {},
    createGain: () => new GainNode(),
    createBiquadFilter: () => ({ type: '', frequency: Param(0), connect() { return this; } }),
    createBuffer: (ch, len) => ({ getChannelData: () => new Float32Array(len) }),
    createBufferSource: () => ({ buffer: null, loop: false, connect() { return this; }, start() {} }),
    createOscillator: () => ({ type: '', frequency: Param(0), connect() { return this; }, start() {} }),
    resume() {}
  };
};

function load(script) {
  const code = fs.readFileSync(path.join(root, script), 'utf8');
  window.eval(code);
}
load('js/simulation.js');
load('js/audio.js');
load('js/renderer.js');
load('js/main.js');

const doc = window.document;
function fire(el, type) { el.dispatchEvent(new window.Event(type, { bubbles: true })); }

// Initial HUD state.
console.log('initial HUD:', doc.getElementById('hud-water').textContent, '|',
  doc.getElementById('val-speed').textContent);

// Change a slider and confirm label syncs.
const speed = doc.getElementById('in-speed');
speed.value = '0.8';
fire(speed, 'input');
console.log('after slider:', doc.getElementById('val-speed').textContent);

// Apply a preset, then switch to the balanced one for a successful run.
doc.querySelector('[data-preset="greedy"]').click();
console.log('greedy preset flow:', doc.getElementById('val-flow').textContent);
doc.querySelector('[data-preset="balanced"]').click();
console.log('balanced preset flow:', doc.getElementById('val-flow').textContent);

// Start and pump frames until the run finishes (or guard trips).
doc.getElementById('btn-start').click();
let frames = 0;
while (frames < 400) {
  const q = rafQueue;
  rafQueue = [];
  q.forEach(function (cb) {
    cb(frames * 50); // 50ms per frame
  });
  frames++;
  const result = doc.getElementById('hud-result').textContent;
  if (result.indexOf('成功') !== -1 || result.indexOf('未达标') !== -1) break;
}

console.log('frames driven:', frames);
console.log('result HUD:', doc.getElementById('hud-result').textContent);
console.log('water HUD:', doc.getElementById('hud-water').textContent);
console.log('tank HUD:', doc.getElementById('hud-tank').textContent);
console.log('power HUD:', doc.getElementById('hud-power').textContent);
console.log('target rows:', doc.getElementById('target-list').children.length);

// Reset should return to a fresh state.
doc.getElementById('btn-reset').click();
console.log('after reset:', doc.getElementById('hud-water').textContent,
  doc.getElementById('hud-result').textContent);

const ok = doc.getElementById('hud-result').textContent.indexOf('待运行') !== -1;
console.log(ok ? 'SMOKE PASS' : 'SMOKE FAIL');
process.exit(ok ? 0 : 1);
