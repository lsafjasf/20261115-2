/* 验证脚本（Node）：
 * 1. 情景 A：闸门保持 15% 不动 —— 应触发超警戒水位告警；
 * 2. 情景 B：执行一次完整泄洪调度（预泄 + 削峰 + 退水恢复）；
 * 3. 用调节记录回放，验证与实时运行结果完全一致；
 * 4. 情景 C：闸门全开 —— 应触发下游流量超限告警。
 */
'use strict';
var S = require('./sim.js');

var failures = 0;
function check(name, cond, detail) {
  console.log((cond ? '  PASS ' : '  FAIL ') + name + (detail ? '  [' + detail + ']' : ''));
  if (!cond) failures++;
}

// ---------- 情景 A：不调度，应超警戒 ----------
console.log('情景 A：闸门固定 15%，不调度');
var a = S.createState();
while (!a.finished) S.tick(a);
var aMaxLevel = Math.max.apply(null, a.history.map(function (h) { return h.level; }));
var aLevelAlerts = a.history.filter(function (h) {
  return h.alerts.some(function (t) { return t.indexOf('警戒') >= 0; });
}).length;
check('最高水位超过警戒 155m', aMaxLevel > S.WARN_LEVEL, 'max=' + aMaxLevel.toFixed(2) + 'm');
check('触发超警戒水位告警', aLevelAlerts > 0, aLevelAlerts + ' 个时段告警');

// ---------- 情景 B：实际泄洪调度 ----------
console.log('情景 B：执行泄洪调度（预泄 -> 削峰 -> 恢复）');
var b = S.createState();
var currentGate = 0.15;
var SAFE_RELEASE = 1050; // 留足安全裕度，覆盖延迟期内水位上涨带来的泄流增加

// 由目标泄流量反算闸门开度（泄流公式反演）
function gateForOutflow(q, level) {
  var head = Math.max(0.1, level + 0.3 - S.DEAD_LEVEL - 2); // 预留延迟期水位上涨
  return q / (2600 * Math.sqrt(head / 18));
}
function setGate(v) {
  v = Math.min(1, Math.max(0, Math.round(v * 100) / 100));
  if (Math.abs(v - currentGate) >= 0.03) {
    S.setGate(b, v);
    currentGate = v;
  }
}
while (!b.finished) {
  var hour = b.step * S.STEP_MIN / 60;
  var qin = S.inflowAt(hour);
  var qdes;
  if (b.level > 154.0) {
    qdes = SAFE_RELEASE;                    // 高水位：全力安全泄流
  } else if (b.level > 152.0) {
    qdes = Math.min(qin, SAFE_RELEASE);     // 削峰：泄量≈入库，稳住水位
  } else if (hour >= 4 && qin > 500 && b.level > 149.5) {
    qdes = Math.min(qin + 200, SAFE_RELEASE); // 预泄：峰前腾库
  } else if (qin < 500 && b.level < 150.5) {
    qdes = Math.max(qin, 250);              // 退水：恢复正常下泄
  } else {
    qdes = Math.min(qin, SAFE_RELEASE);     // 平水：进出平衡
  }
  setGate(gateForOutflow(qdes, b.level));
  S.tick(b);
}
var bMaxLevel = Math.max.apply(null, b.history.map(function (h) { return h.level; }));
var bMaxOut = Math.max.apply(null, b.history.map(function (h) { return h.outflow; }));
var bAlerts = b.history.filter(function (h) { return h.alerts.length > 0; }).length;
console.log('  调度操作 ' + b.opLog.length + ' 次：');
b.opLog.forEach(function (op) {
  console.log('    [' + op.time + '] 开度 -> ' + Math.round(op.value * 100) + '%（水位 ' + op.level + 'm）');
});
check('调度后最高水位低于警戒', bMaxLevel < S.WARN_LEVEL, 'max=' + bMaxLevel.toFixed(2) + 'm');
check('调度后出库不超下游上限', bMaxOut <= S.DOWNSTREAM_LIMIT, 'max=' + bMaxOut + ' m³/s');
check('调度全程无告警', bAlerts === 0, bAlerts + ' 个时段告警');
check('调节记录非空', b.opLog.length >= 3, b.opLog.length + ' 次操作');

// ---------- 回放验证 ----------
console.log('回放验证：按调节记录重演 24 小时');
var r = S.replay(b.opLog);
var sameHistory = JSON.stringify(r.history) === JSON.stringify(b.history);
check('回放历史与实时运行完全一致', sameHistory,
  '终态水位 ' + r.history[r.history.length - 1].level + 'm vs ' + b.history[b.history.length - 1].level + 'm');
check('回放终态水位一致', r.level === b.level, r.level + ' vs ' + b.level);
check('回放终态库容一致', r.storage === b.storage);

// ---------- 情景 C：全开泄流，应超下游上限 ----------
console.log('情景 C：闸门全开，应触发下游超限告警');
var c = S.createState();
S.setGate(c, 1.0);
while (!c.finished) S.tick(c);
var cFlowAlerts = c.history.filter(function (h) {
  return h.alerts.some(function (t) { return t.indexOf('下游') >= 0; });
}).length;
check('触发下游流量超限告警', cFlowAlerts > 0, cFlowAlerts + ' 个时段告警');

// ---------- 导出 ----------
var csv = S.exportCSV(b);
check('CSV 导出包含操作与逐时记录', csv.split('\n').length > S.STEPS_PER_DAY,
  csv.split('\n').length + ' 行');

console.log(failures === 0 ? '\n全部验证通过 ✔' : '\n存在 ' + failures + ' 项失败 ✘');
process.exit(failures === 0 ? 0 : 1);
