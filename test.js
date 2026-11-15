// 固定数据测试：1) 脚本策略通关一局 2) 滤芯过载行为
var Sim = require("./sim.js");

var failures = 0;
function check(name, cond, detail) {
  if (cond) {
    console.log("PASS  " + name + (detail ? "  (" + detail + ")" : ""));
  } else {
    failures++;
    console.log("FAIL  " + name + (detail ? "  (" + detail + ")" : ""));
  }
}

// ---------- 测试 1：固定数据完成一局 ----------
(function playthrough() {
  var s = Sim.createState();
  // 固定操作策略：高风量、低旁路，滤芯负载 >80% 时切换
  for (var i = 0; i < 3; i++) {
    Sim.setAirflow(s, i, 0.9);
    Sim.setBypass(s, i, 0.02);
  }
  var switches = 0;
  while (s.status === "running") {
    for (var k = 0; k < 3; k++) {
      var tw = s.towers[k];
      if (tw.filters[tw.activeFilter].load > Sim.FILTER_CAPACITY * 0.8) {
        Sim.switchFilter(s, k);
        switches++;
      }
    }
    Sim.step(s);
  }
  check("通关一局：30 分钟内成功", s.status === "success",
    "status=" + s.status + " t=" + s.t + "s");
  check("通关一局：用时不超过 1800s", s.t <= Sim.SIM_DURATION, "t=" + s.t);
  check("通关一局：发生了滤芯切换", switches > 0, "switches=" + switches);
  var finalOk = s.monitors.every(function (m) { return m.value <= Sim.LIMIT; });
  check("通关一局：结束时全部监测点达标", finalOk,
    "final=[" + s.monitors.map(function (m) { return m.value.toFixed(1); }).join(",") + "]");
})();

// ---------- 测试 2：滤芯过载 ----------
(function overload() {
  var s = Sim.createState();
  // 2号塔（源强最大）满风量、零旁路、永不切换 -> 必然过载
  Sim.setAirflow(s, 1, 1.0);
  Sim.setBypass(s, 1, 0.0);
  Sim.setAirflow(s, 0, 0.9); Sim.setBypass(s, 0, 0.02);
  Sim.setAirflow(s, 2, 0.9); Sim.setBypass(s, 2, 0.02);

  var tw = s.towers[1];
  var etaBefore = null, emissionBefore = null;
  var overloadAt = -1;
  var etaAfter = null, emissionAfter = null;
  for (var i = 0; i < 1800; i++) {
    Sim.step(s);
    if (s.status !== "running") s.status = "running"; // 锁定以便持续观察
    var active = tw.filters[tw.activeFilter];
    if (!active.overloaded) {
      etaBefore = tw.eta;
      emissionBefore = tw.emission;
    } else {
      if (overloadAt < 0) overloadAt = s.t;
      etaAfter = tw.eta;
      emissionAfter = tw.emission;
    }
  }
  check("过载：滤芯发生过载", overloadAt > 0, "t=" + overloadAt + "s");
  check("过载：效率从 0.95 降至 0.35",
    etaBefore === Sim.FILTER_ETA_FRESH && etaAfter === Sim.FILTER_ETA_OVERLOAD,
    etaBefore + " -> " + etaAfter);
  check("过载：排放量上升", emissionAfter > emissionBefore,
    emissionBefore && emissionAfter
      ? emissionBefore.toFixed(2) + " -> " + emissionAfter.toFixed(2) : "");

  // 切换滤芯后效率恢复
  Sim.switchFilter(s, 1);
  Sim.step(s);
  check("过载：切换滤芯后效率恢复", s.towers[1].eta === Sim.FILTER_ETA_FRESH,
    "eta=" + s.towers[1].eta);
})();

// ---------- 测试 3：旁路过多导致局部超标 ----------
(function bypassSpike() {
  var s = Sim.createState();
  // 先以良好工况运行至厂界东达标
  for (var k = 0; k < 3; k++) { Sim.setAirflow(s, k, 0.9); Sim.setBypass(s, k, 0.02); }
  var compliant = false;
  for (var i = 0; i < 900; i++) {
    Sim.step(s);
    if (s.status !== "running") s.status = "running";
    if (!s.monitors[2].exceed) { compliant = true; break; }
  }
  check("旁路：前置工况下厂界东可达标", compliant,
    "value=" + s.monitors[2].value.toFixed(1));
  // 旁路全开 -> 应快速再次超标
  Sim.setBypass(s, 1, 0.9);
  var exceeded = false;
  for (var j = 0; j < 180; j++) {
    Sim.step(s);
    if (s.status !== "running") s.status = "running";
    if (s.monitors[2].exceed) { exceeded = true; break; } // 厂界东
  }
  check("旁路：高旁路导致厂界快速超标", exceeded,
    "value=" + s.monitors[2].value.toFixed(1));
})();

console.log(failures === 0 ? "\n全部测试通过" : "\n有 " + failures + " 项失败");
process.exit(failures === 0 ? 0 : 1);
