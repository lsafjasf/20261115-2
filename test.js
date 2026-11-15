/*
 * test.js — 配色检查器核心逻辑测试(Node 直接运行: node test.js)
 *
 * 实测三组配色:
 *   1. 安全组     —— 三种视图均应安全
 *   2. 红绿陷阱组 —— 仅红绿色弱视图应判不安全
 *   3. 蓝黄陷阱组 —— 仅蓝黄色弱视图应判不安全
 * 并验证两种色弱视图的判定结果确实不同。
 */
const C = require("./color.js");

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    passed++;
    console.log("  ✓ " + msg);
  } else {
    failed++;
    console.error("  ✗ " + msg);
  }
}

const VIEWS = ["normal", "deuteranopia", "tritanopia"];

function report(name, scheme) {
  console.log("\n== " + name + " " + JSON.stringify(scheme));
  const results = {};
  for (const v of VIEWS) {
    const r = C.evaluateScheme(scheme, v);
    results[v] = r;
    console.log(
      "   " +
        r.viewLabel.padEnd(6, "　") +
        " 标题 " +
        String(r.title.contrast).padStart(5) +
        ":1 / " +
        String(r.title.score).padStart(3) +
        "分 " +
        (r.title.safe ? "安全" : "【标红】") +
        " | 按钮 " +
        String(r.button.contrast).padStart(5) +
        ":1 / " +
        String(r.button.score).padStart(3) +
        "分 " +
        (r.button.safe ? "安全" : "【标红】")
    );
  }
  return results;
}

// ---------- 第 1 组:安全配色 ----------
const safe = report("第1组 · 安全配色", {
  background: "#ffffff",
  title: "#1a1a2e",
  button: "#2f6fdb",
});
for (const v of VIEWS) {
  assert(safe[v].safe, "安全组在「" + safe[v].viewLabel + "」整体判定为安全");
}

// ---------- 第 2 组:红绿陷阱 ----------
const rg = report("第2组 · 红绿陷阱(绿底深红字)", {
  background: "#1eec28",
  title: "#a00028",
  button: "#a00028",
});
assert(rg.normal.safe, "红绿陷阱组在普通视图判定为安全");
assert(!rg.deuteranopia.safe, "红绿陷阱组在红绿色弱视图判定为不安全(标红)");
assert(rg.tritanopia.safe, "红绿陷阱组在蓝黄色弱视图判定为安全");

// ---------- 第 3 组:蓝黄陷阱 ----------
const by = report("第3组 · 蓝黄陷阱(蓝底黄字)", {
  background: "#0f3c8a",
  title: "#e6aa1e",
  button: "#e6aa1e",
});
assert(by.normal.safe, "蓝黄陷阱组在普通视图判定为安全");
assert(by.deuteranopia.safe, "蓝黄陷阱组在红绿色弱视图判定为安全");
assert(!by.tritanopia.safe, "蓝黄陷阱组在蓝黄色弱视图判定为不安全(标红)");

// ---------- 关键验证:两种色弱视图判定有所区别 ----------
console.log("\n== 两种色弱视图判定差异验证");
assert(
  rg.deuteranopia.safe !== rg.tritanopia.safe,
  "红绿陷阱组:红绿色弱与蓝黄色弱视图的整体判定不同"
);
assert(
  by.deuteranopia.safe !== by.tritanopia.safe,
  "蓝黄陷阱组:红绿色弱与蓝黄色弱视图的整体判定不同"
);
assert(
  rg.deuteranopia.title.score !== rg.tritanopia.title.score &&
    by.deuteranopia.title.score !== by.tritanopia.title.score,
  "两组配色的可辨识度评分在两种色弱视图下均不同"
);

// 模拟后的颜色本身也应不同
const simD = C.simulate(C.hexToRgb("#a00028"), "deuteranopia");
const simT = C.simulate(C.hexToRgb("#a00028"), "tritanopia");
assert(
  simD.r !== simT.r || simD.g !== simT.g || simD.b !== simT.b,
  "同一颜色经两种色弱模拟后得到不同结果 " +
    JSON.stringify(simD) +
    " vs " +
    JSON.stringify(simT)
);

// ---------- 导出建议:只建议,不修改用户颜色 ----------
console.log("\n== 导出建议行为验证");
const scheme = { background: "#1eec28", title: "#a00028", button: "#a00028" };
const snapshot = JSON.stringify(scheme);
const text = C.buildSuggestions(scheme);
assert(JSON.stringify(scheme) === snapshot, "生成建议后用户配色对象未被修改");
assert(/不会自动替换/.test(text), "建议报告明确声明不自动替换颜色");
assert(/红绿色弱视图/.test(text) && /超出安全范围/.test(text), "报告包含红绿色弱视图的超标项");
assert(
  /#[0-9a-f]{6}/i.test(text),
  "报告给出具体的参考颜色建议(仅文本,由用户手动采纳)"
);

console.log("\n结果: " + passed + " 通过, " + failed + " 失败");
process.exit(failed === 0 ? 0 : 1);
