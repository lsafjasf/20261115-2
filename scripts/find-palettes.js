// 临时脚本:搜索满足特定视图安全组合的测试配色
const C = require("../color.js");

function safeIn(s, v, role) {
  return C.evaluateScheme(s, v)[role].safe;
}

function search(fgGen, bgGen, safeViews, unsafeView) {
  for (let bi = 0; bi <= 255; bi += 8) {
    for (let fi = 0; fi <= 255; fi += 8) {
      const bg = bgGen(bi);
      const fg = fgGen(fi);
      const s = { background: bg, title: fg, button: fg };
      if (safeViews.every((v) => safeIn(s, v, "title")) && !safeIn(s, unsafeView, "title")) {
        return { bg, fg };
      }
    }
  }
  return null;
}

// 红绿陷阱:普通+蓝黄色弱安全,红绿色弱不安全
const trapRG = search(
  (v) => C.rgbToHex({ r: 160 + Math.floor(v / 3), g: Math.floor(v / 4), b: 40 }),
  (v) => C.rgbToHex({ r: 30, g: 60 + v, b: 40 }),
  ["normal", "tritanopia"],
  "deuteranopia"
);

// 蓝黄陷阱:普通+红绿色弱安全,蓝黄色弱不安全
const trapBY = search(
  (v) => C.rgbToHex({ r: 230, g: 170 + Math.floor(v / 4), b: 30 }),
  (v) => C.rgbToHex({ r: 15, g: 60, b: 90 + v }),
  ["normal", "deuteranopia"],
  "tritanopia"
);

console.log("红绿陷阱(仅红绿色弱视图不安全):", JSON.stringify(trapRG));
console.log("蓝黄陷阱(仅蓝黄色弱视图不安全):", JSON.stringify(trapBY));

for (const [name, p] of [["红绿陷阱", trapRG], ["蓝黄陷阱", trapBY]]) {
  if (!p) continue;
  const s = { background: p.bg, title: p.fg, button: p.fg };
  console.log("==", name, JSON.stringify(s));
  for (const v of ["normal", "deuteranopia", "tritanopia"]) {
    const r = C.evaluateScheme(s, v);
    console.log(
      "  ",
      v,
      "title:",
      r.title.contrast + ":1",
      "score",
      r.title.score,
      r.title.safe ? "safe" : "UNSAFE"
    );
  }
}
