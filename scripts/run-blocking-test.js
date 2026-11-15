import fs from "node:fs";
import path from "node:path";
import { runBlockingTest } from "../src/simulation.js";

const report = runBlockingTest();
const output = {
  generatedAt: new Date().toISOString(),
  scenario: report.scenario,
  pass: report.pass,
  conflictEdge: report.conflictEdgeLabel,
  waitedPodId: report.waitedPodId,
  waitSeconds: report.waitSeconds == null ? null : Number(report.waitSeconds.toFixed(2)),
  headOnHolds: report.headOnHolds,
  maxOccupancyPerEdge: report.maxOccupancyPerEdge,
  allCompleted: report.allCompleted,
  elapsed: Number(report.elapsed.toFixed(2)),
  assertions: report.assertions,
};

const reportPath = path.resolve("artifacts/blocking-test-report.json");
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(output, null, 2)}\n`);

console.log("错误线路阻塞测试");
console.log(`- 场景：${report.scenario}`);
console.log(`- 冲突区间：${report.conflictEdgeLabel}`);
console.log(`- 低优先级等待：${output.waitSeconds}s`);
console.log(`- 交会闭锁触发：${report.headOnHolds}（正面相遇 0）`);
console.log(`- 单区间重复占用：${Math.max(0, report.maxOccupancyPerEdge - 1)}`);
console.log(`- 四舱完成：${report.allCompleted ? "是" : "否"}`);
console.log(`- 结论：${report.pass ? "通过" : "未通过"}`);
console.log(`- 报告：${reportPath}`);

if (!report.pass) process.exitCode = 1;
