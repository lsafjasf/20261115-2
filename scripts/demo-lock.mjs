// 验收演示：锁定第 2、4 两个色块，连续再生成三次，打印锁定保持证据。

import { DEFAULT_PARAMS, generatePalette, regeneratePalette } from "../core/palette.js";

const LOCKED_INDEXES = [1, 3];

let palette = generatePalette(DEFAULT_PARAMS).map((swatch) => ({
  ...swatch,
  locked: LOCKED_INDEXES.includes(swatch.index),
}));

const rounds = [palette];
for (let round = 0; round < 3; round += 1) {
  palette = regeneratePalette(palette, DEFAULT_PARAMS);
  rounds.push(palette);
}

const labels = ["初始", "再生成 1", "再生成 2", "再生成 3"];
console.log("锁定位置：第 2、4 色（索引 1、3）\n");
for (let round = 0; round < rounds.length; round += 1) {
  const cells = rounds[round]
    .map((swatch) => `${swatch.hex}${swatch.locked ? " 🔒" : "   "}`)
    .join(" | ");
  console.log(`${labels[round].padEnd(7, "　")} ${cells}`);
}

let verified = true;
for (const index of LOCKED_INDEXES) {
  const anchor = rounds[0][index];
  for (const round of rounds.slice(1)) {
    const current = round[index];
    const unchanged =
      current.hex === anchor.hex &&
      current.hsl === anchor.hsl &&
      current.locked === true;
    if (!unchanged) verified = false;
  }
}

const unlockedMoved = [0, 2, 4].some((index) => {
  const hexes = rounds.map((round) => round[index].hex);
  return new Set(hexes).size > 1;
});

console.log("\n断言结果：");
console.log(`- 两个锁定色块在三次再生成后完全不变：${verified ? "通过 ✅" : "失败 ❌"}`);
console.log(`- 未锁定色块确实重新采样：${unlockedMoved ? "通过 ✅" : "失败 ❌"}`);
if (!verified || !unlockedMoved) process.exit(1);
