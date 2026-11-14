/* 水库泄洪调度仿真核心：纯逻辑，无 DOM 依赖，可在浏览器与 Node 中运行。 */
(function (global) {
  'use strict';

  var STEP_MIN = 15;            // 每 15 分钟更新一次
  var STEPS_PER_DAY = 96;       // 24 小时
  var DELAY_STEPS = 2;          // 闸门操作延迟 30 分钟生效（水位响应延迟）

  var WARN_LEVEL = 155.0;       // 警戒水位 (m)
  var DOWNSTREAM_LIMIT = 1200;  // 下游流量上限 (m3/s)
  var DEAD_LEVEL = 140.0;       // 死水位
  var INIT_LEVEL = 150.0;       // 初始水位

  // 库容曲线：水位(m) -> 库容(百万 m3)，线性插值
  var LV_TABLE = [
    [140, 110], [145, 170], [148, 215], [150, 240],
    [152, 262], [155, 300], [158, 345], [160, 380]
  ];

  function levelToStorage(level) {
    return interp(LV_TABLE, level);
  }

  function storageToLevel(storage) {
    var inv = LV_TABLE.map(function (p) { return [p[1], p[0]]; });
    return interp(inv, storage);
  }

  function interp(table, x) {
    if (x <= table[0][0]) return table[0][1];
    for (var i = 1; i < table.length; i++) {
      if (x <= table[i][0]) {
        var a = table[i - 1], b = table[i];
        return a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]);
      }
    }
    return table[table.length - 1][1];
  }

  // 入库洪水过程线（一场先涨后落的洪水，第 12 小时左右洪峰）
  function inflowAt(hour) {
    var base = 300;
    var peak = 2600;
    var rise = gauss(hour, 12.5, 3.2);
    var shoulder = gauss(hour, 8.0, 2.0) * 0.25;
    return Math.round(base + peak * (rise + shoulder));
  }

  function gauss(x, mu, sigma) {
    var d = (x - mu) / sigma;
    return Math.exp(-0.5 * d * d);
  }

  // 出库流量：闸孔自由出流，按开度与水头缩放
  function outflowCapacity(gateOpen, level) {
    var head = Math.max(0, level - DEAD_LEVEL - 2);
    var maxQ = 2600; // 全开、最大水头时的泄流能力
    return maxQ * gateOpen * Math.sqrt(head / 18);
  }

  function createState() {
    return {
      step: 0,                       // 当前步数（0..96）
      level: INIT_LEVEL,
      storage: levelToStorage(INIT_LEVEL),
      gateOpen: 0.15,                // 当前闸门开度 0..1
      pendingGate: [],               // 延迟队列 [{applyStep, value}]
      inflow: inflowAt(0),
      outflow: 0,
      alerts: [],                    // 当前激活的告警
      history: [],                   // 每步记录
      opLog: [],                     // 调节记录（闸门操作）
      finished: false
    };
  }

  function fmtTime(step) {
    var h = Math.floor(step * STEP_MIN / 60);
    var m = (step * STEP_MIN) % 60;
    return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
  }

  // 用户设定闸门开度：进入延迟队列，并写入调节记录
  function setGate(state, value) {
    value = Math.min(1, Math.max(0, value));
    state.pendingGate.push({ applyStep: state.step + DELAY_STEPS, value: value });
    state.opLog.push({
      step: state.step,
      time: fmtTime(state.step),
      action: 'setGate',
      value: Math.round(value * 100) / 100,
      level: Math.round(state.level * 100) / 100
    });
  }

  // 推进一个 15 分钟步长
  function tick(state) {
    if (state.finished) return state;

    while (state.pendingGate.length && state.pendingGate[0].applyStep <= state.step) {
      state.gateOpen = state.pendingGate.shift().value;
    }

    var hour = state.step * STEP_MIN / 60;
    state.inflow = inflowAt(hour);
    state.outflow = Math.round(outflowCapacity(state.gateOpen, state.level));

    // 水量平衡：dS = (Qin - Qout) * dt
    var dt = STEP_MIN * 60;
    state.storage += (state.inflow - state.outflow) * dt / 1e6; // 百万 m3
    state.storage = Math.max(LV_TABLE[0][1], state.storage);
    state.level = Math.round(storageToLevel(state.storage) * 100) / 100;

    state.alerts = [];
    if (state.level >= WARN_LEVEL) {
      state.alerts.push({ type: 'level', text: '水位 ' + state.level.toFixed(2) + ' m 超过警戒水位 ' + WARN_LEVEL + ' m！' });
    }
    if (state.outflow > DOWNSTREAM_LIMIT) {
      state.alerts.push({ type: 'flow', text: '出库 ' + state.outflow + ' m³/s 超过下游安全流量 ' + DOWNSTREAM_LIMIT + ' m³/s！' });
    }

    state.history.push({
      step: state.step,
      time: fmtTime(state.step),
      inflow: state.inflow,
      outflow: state.outflow,
      level: state.level,
      gate: state.gateOpen,
      alerts: state.alerts.map(function (a) { return a.text; })
    });

    state.step += 1;
    if (state.step >= STEPS_PER_DAY) state.finished = true;

    // 到达生效时刻的闸门操作立即生效（保证“02:30 生效”在 02:30 即体现）
    while (state.pendingGate.length && state.pendingGate[0].applyStep <= state.step) {
      state.gateOpen = state.pendingGate.shift().value;
    }
    return state;
  }

  // 回放：按操作记录从头确定性重演
  function replay(opLog) {
    var state = createState();
    var ops = opLog.slice().sort(function (a, b) { return a.step - b.step; });
    var idx = 0;
    while (!state.finished) {
      while (idx < ops.length && ops[idx].step === state.step) {
        setGate(state, ops[idx].value);
        idx++;
      }
      tick(state);
    }
    return state;
  }

  // 导出调节记录为 CSV 文本
  function exportCSV(state) {
    var lines = ['step,time,action,value,level'];
    state.opLog.forEach(function (op) {
      lines.push([op.step, op.time, op.action, op.value, op.level].join(','));
    });
    lines.push('');
    lines.push('step,time,inflow,outflow,level,gate,alerts');
    state.history.forEach(function (h) {
      lines.push([h.step, h.time, h.inflow, h.outflow, h.level, h.gate, '"' + h.alerts.join('; ') + '"'].join(','));
    });
    return lines.join('\n');
  }

  var Sim = {
    STEP_MIN: STEP_MIN,
    STEPS_PER_DAY: STEPS_PER_DAY,
    DELAY_STEPS: DELAY_STEPS,
    WARN_LEVEL: WARN_LEVEL,
    DOWNSTREAM_LIMIT: DOWNSTREAM_LIMIT,
    DEAD_LEVEL: DEAD_LEVEL,
    INIT_LEVEL: INIT_LEVEL,
    inflowAt: inflowAt,
    createState: createState,
    setGate: setGate,
    tick: tick,
    replay: replay,
    exportCSV: exportCSV,
    fmtTime: fmtTime
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Sim;
  else global.Sim = Sim;
})(typeof window !== 'undefined' ? window : this);
