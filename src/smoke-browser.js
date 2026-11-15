'use strict';

// 模拟浏览器环境加载 app 依赖的纯逻辑模块，走一遍“自动校准”按钮流程
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const sandbox = { globalThis: {}, window: {}, console, Math, Date, performance: { now: () => Date.now() } };
sandbox.globalThis.MET = undefined;
vm.createContext(sandbox);

for (const f of ['metronome.js', 'calibrator-browser.js']) {
  const code = fs.readFileSync(path.join(__dirname, f), 'utf8');
  vm.runInContext(code, sandbox, { filename: f });
}

const { Metronome } = sandbox.globalThis.MET;
const Calibrator = sandbox.globalThis.Calibrator;

const m = new Metronome({ seed: 99, length: 0.09, tension: 0.25, damping: 0.05 });
let due = 3.5;
const log = [];
while (m.t < 60) {
  m.run(0.1);
  m.flushEvents();
  if (m.t >= due) {
    const adj = Calibrator.nextAdjustment(m, 3);
    if (adj) {
      m.setParams(adj.changes);
      log.push(adj.rationale[0]);
    } else {
      log.push(`参数收敛 @ ${m.t.toFixed(1)}s`);
      break;
    }
    due = m.t + 3.5;
  }
}

m.reset();
m.run(44);
const s = m.getStatus();
console.log('调整轨迹:');
log.forEach((l, i) => console.log(`  ${i + 1}. ${l}`));
console.log('最终状态:', {
  bpm: s.bpm == null ? null : Number(s.bpm.toFixed(2)),
  amp: Number(s.amp.toFixed(3)),
  miss: s.missCount,
  squeal: s.squealCount,
  stableFor: Number(s.stableFor.toFixed(1)),
  succeeded: s.succeeded,
});

if (!s.succeeded) {
  console.error('SMOKE FAIL: 浏览器流程未达成 20s 稳定');
  process.exit(1);
}
console.log('SMOKE OK: 浏览器自动校准流程可达成稳定成功');
