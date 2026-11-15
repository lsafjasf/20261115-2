const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const assert = require('node:assert');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true });
const { window } = dom;

function noop() {}
const grad = { addColorStop: noop };
const ctxStub = {
  canvas: { width: 1000, height: 720 },
  clearRect: noop, fillRect: noop, strokeRect: noop, beginPath: noop,
  closePath: noop, moveTo: noop, lineTo: noop, arc: noop, ellipse: noop,
  fill: noop, stroke: noop, save: noop, restore: noop, translate: noop,
  fillText: noop, setLineDash: noop, createLinearGradient: () => grad,
  fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: '',
  globalAlpha: 1, lineCap: ''
};
window.HTMLCanvasElement.prototype.getContext = () => ctxStub;
window.requestAnimationFrame = cb => setTimeout(() => cb(performance.now()), 16);
window.cancelAnimationFrame = id => clearTimeout(id);
class AudioStub {
  constructor() { this.currentTime = 0; this.state = 'running'; this.sampleRate = 8000; this.destination = {}; }
  _param(v) { return { value: v, setTargetAtTime: noop, setValueAtTime: noop, exponentialRampToValueAtTime: noop }; }
  _node(extra) { const n = Object.assign({ exponentialRampToValueAtTime: noop, setValueAtTime: noop }, extra); n.connect = () => n; return n; }
  createGain() { return this._node({ gain: this._param(0) }); }
  createBiquadFilter() { return this._node({ type: '', frequency: this._param(0), Q: this._param(0) }); }
  createOscillator() { return this._node({ type: '', frequency: this._param(0), start: noop, stop: noop }); }
  createBuffer(ch, len) { return { getChannelData: () => new Float32Array(len) }; }
  createBufferSource() { return this._node({ buffer: null, loop: false, start: noop }); }
  resume() {}
}
window.AudioContext = AudioStub;
window.performance = { now: () => Date.now() };

for (const f of ['src/physics.js', 'src/audio.js', 'src/renderer.js', 'src/app.js']) {
  window.eval(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'));
}
const $ = id => window.document.getElementById(id);
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  await sleep(50);
  assert.equal($('crateControls').children.length, 4, '四张物资控制卡');
  assert.equal($('pointStatus').children.length, 3, '三个救援点状态');

  console.log('阶段1：点击「开始投放」并等待整轮结束');
  $('btnLaunch').click();
  await sleep(300);
  assert.ok($('hudStatus').textContent.startsWith('投放中'), 'HUD 显示投放中');
  for (let i = 0; i < 40 && $('hudStatus').textContent.startsWith('投放中'); i++) await sleep(2000);
  const runLog = $('log').textContent;
  assert.ok(/投放/.test(runLog) && /开伞/.test(runLog), '含投放与开伞事件');
  assert.ok(/送达|飘离|损坏/.test(runLog), '含落地结果');
  console.log('  本轮日志条数:', $('log').children.length, '| 最新:', $('log').children[0].textContent);

  console.log('阶段2：自动演示（成功 + 飘远 + 损坏）');
  const snapshots = [];
  $('btnDemo').click();
  for (let i = 0; i < 60; i++) {
    await sleep(2000);
    snapshots.push($('log').textContent);
    if (/自动演示结束/.test($('log').textContent)) break;
  }
  const demoText = snapshots.join('\n');
  assert.ok(/自动演示结束/.test($('log').textContent), '演示完整跑完');
  assert.ok(/成功投放/.test(demoText), '演示含成功投放');
  assert.ok(/飘远|飘离/.test(demoText), '演示含飘远失败');
  assert.ok(/损坏/.test(demoText), '演示含损坏失败');
  console.log('  演示日志快照累计长度:', demoText.length);

  console.log('阶段3：静音与重置');
  $('btnMute').click();
  assert.equal($('btnMute').getAttribute('aria-pressed'), 'true');
  $('btnReset').click();
  assert.equal($('hudStatus').textContent, '待命');
  assert.equal($('pointStatus').querySelectorAll('.done').length, 0);

  console.log('\nDOM 集成测试全部通过 ✓');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
