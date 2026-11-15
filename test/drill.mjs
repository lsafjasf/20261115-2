// End-to-end defense drill: run the full ten-minute storm twice with the
// same deterministic seed, once with the correct deployment and once with
// the fans pointed the wrong way, then compare the outcomes.
import { Simulation, goodFans, badFans } from "../src/simulation.js";

function row(label, res) {
  const a = res.houses[0];
  const b = res.houses[1];
  console.log(
    `${label.padEnd(12)} A效率=${(a.efficiency * 100)
      .toFixed(1)
      .padStart(5)}%  B效率=${(b.efficiency * 100)
      .toFixed(1)
      .padStart(5)}%  沉积=${String(res.deposited).padStart(5)}  ` +
      `逃逸=${String(res.escaped).padStart(5)}  结果=${res.success ? "成功" : "失败"}`
  );
}

console.log("=== 沙尘暴防护演练（10 分钟完整模拟，种子 42）===");
const good = new Simulation({ seed: 42, fans: goodFans() }).run();
row("正确防护", good);
const bad = new Simulation({ seed: 42, fans: badFans() }).run();
row("方向错误", bad);

console.log("\n结论：");
console.log(
  good.success
    ? "- 正确方向：两台风机把沙流抬过 A、压到 B 下方，两座温室均保持洁净。"
    : "- 正确方向未达成目标，需要重新标定。"
);
console.log(
  !bad.success
    ? "- 方向错误：水平射流把沙尘直接加速打进两座进风口，效率归零。"
    : "- 错误方向意外通过，需要重新标定。"
);

if (!(good.success && !bad.success)) process.exit(1);
