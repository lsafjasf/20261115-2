/* Node 冒烟测试：以最小 DOM 桩加载 app.js，模拟真实用户操作流程。 */
'use strict';
var fs = require('fs');
var path = require('path');

function makeCtx() {
  return new Proxy({}, {
    get: function (t, k) {
      if (k === 'canvas') return {};
      return function () {};
    },
    set: function () { return true; }
  });
}

function makeEl(id) {
  var handlers = {};
  var el = {
    id: id,
    textContent: '', innerHTML: '', className: '', value: '15',
    disabled: false, scrollTop: 0, scrollHeight: 0,
    clientWidth: 800, clientHeight: 200, width: 800, height: 200,
    style: {},
    getContext: function () { return makeCtx(); },
    addEventListener: function (ev, fn) { (handlers[ev] = handlers[ev] || []).push(fn); },
    click: function () { (handlers.click || []).forEach(function (f) { f(); }); },
    _fire: function (ev) { (handlers[ev] || []).forEach(function (f) { f(); }); }
  };
  return el;
}

var ids = ['clock', 'stLevel', 'stIn', 'stOut', 'stGate', 'stPend', 'alertBox',
  'gateSlider', 'gateVal', 'logList', 'btnPlay', 'btnStep', 'btnReset',
  'btnReplay', 'btnExport', 'btnSound',
  'damCanvas', 'inflowCanvas', 'outflowCanvas', 'levelCanvas'];
var els = {};
ids.forEach(function (id) { els[id] = makeEl(id); });

var anchor = makeEl('a');
global.window = {
  devicePixelRatio: 1,
  addEventListener: function () {},
  AudioContext: undefined,
  Sim: require('./sim.js')
};
global.document = {
  getElementById: function (id) { return els[id]; },
  createElement: function () { return anchor; }
};
global.Blob = function () {};
global.URL = { createObjectURL: function () { return 'blob:x'; }, revokeObjectURL: function () {} };

// 加载 app.js（IIFE，引用全局 window/document）
var code = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
eval(code);

var failures = 0;
function check(name, cond, detail) {
  console.log((cond ? '  PASS ' : '  FAIL ') + name + (detail ? '  [' + detail + ']' : ''));
  if (!cond) failures++;
}

console.log('UI 冒烟测试');

// 1. 初始渲染
check('初始水位显示 150.00 m', els.stLevel.textContent.indexOf('150.00') === 0, els.stLevel.textContent);

// 2. 单步推进 8 步（2 小时）
for (var i = 0; i < 8; i++) els.btnStep.click();
check('单步推进 8 次后时钟为 02:00', els.clock.textContent.indexOf('02:00') === 0, els.clock.textContent);

// 3. 拖动闸门到 60%
els.gateSlider.value = '60';
els.gateSlider._fire('input');
check('拖动后开度显示 60%', els.gateVal.textContent === '60%');
check('调节记录已写入', els.logList.innerHTML.indexOf('60%') >= 0);
check('待生效开度显示延迟信息', els.stPend.textContent.indexOf('生效') >= 0, els.stPend.textContent);

// 4. 延迟生效验证：再走 2 步后生效开度变为 60%
els.btnStep.click(); els.btnStep.click();
check('30 分钟延迟后开度生效', els.stGate.textContent === '60%', els.stGate.textContent);

// 5. 快进到结束（剩余 ~86 步）
for (var j = 0; j < 90; j++) els.btnStep.click();
check('24 小时运行结束', els.clock.textContent.indexOf('结束') >= 0, els.clock.textContent);
check('结束后来步按钮禁用', els.btnStep.disabled === true);

// 6. 恢复初始状态
els.btnReset.click();
check('重置后水位回到 150.00 m', els.stLevel.textContent.indexOf('150.00') === 0, els.stLevel.textContent);
check('重置后回放按钮可用（保留上次记录）', els.btnReplay.disabled === false);

// 7. 回放调度
els.btnReplay.click();
check('回放模式启动（播放中）', els.btnPlay.textContent.indexOf('暂停') >= 0, els.btnPlay.textContent);

// 8. 导出
els.btnReset.click();
for (var k = 0; k < 4; k++) els.btnStep.click();
els.btnExport.click();
check('导出触发下载', anchor.href === 'blob:x');

console.log(failures === 0 ? '\nUI 冒烟测试全部通过 ✔' : '\n存在 ' + failures + ' 项失败 ✘');
process.exit(failures === 0 ? 0 : 1);
