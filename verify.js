// 验证脚本：实际筛选一条线路，检查重复记录被正确去重
// 运行: node verify.js
"use strict";
const assert = require("assert");
const { BUS_RECORDS } = require("./bus-data.js");
const Core = require("./bus-core.js");

const ROUTE = "12路";
const WIN_START = Core.timeToMinutes("07:00");
const WIN_END = Core.timeToMinutes("09:30");

// 1. 全量数据中存在重复记录
const allKeys = BUS_RECORDS.map(Core.recordKey);
const allDupCount = allKeys.length - new Set(allKeys).size;
assert(allDupCount > 0, "测试数据应包含重复记录");
console.log("全量记录:", BUS_RECORDS.length, "条，其中重复", allDupCount, "条");

// 2. 去重
const { unique, duplicates } = Core.dedupRecords(BUS_RECORDS);
assert.strictEqual(unique.length + duplicates.length, BUS_RECORDS.length);
assert.strictEqual(new Set(unique.map(Core.recordKey)).size, unique.length,
  "去重后不应存在相同键的记录");

// 3. 筛选 12路 + 时间窗口
const filtered = Core.filterRecords(unique, ROUTE, WIN_START, WIN_END);
assert(filtered.every((r) => r.route === ROUTE), "筛选结果应全部属于 " + ROUTE);
assert(filtered.every((r) => {
  const t = Core.timeToMinutes(r.time);
  return t >= WIN_START && t <= WIN_END;
}), "筛选结果应全部落在时间窗口内");
const filteredKeys = filtered.map(Core.recordKey);
assert.strictEqual(new Set(filteredKeys).size, filteredKeys.length,
  "筛选后的记录不应包含重复");

// 4. 具体核对：12路 有 3 条重复（火车站07:25、人民广场07:58、体育馆08:52）
const routeDups = duplicates.filter((d) => d.route === ROUTE);
assert.strictEqual(routeDups.length, 3, ROUTE + " 应有 3 条重复记录被移除");
const rawRouteCount = BUS_RECORDS.filter((r) => r.route === ROUTE).length;
assert.strictEqual(filtered.length, rawRouteCount - 3,
  "筛选后记录数 = 原始线路记录数 - 重复数");

// 5. 间隔计算：无零长间隔（重复记录若未去除会产生 0 分钟间隔）
const intervals = Core.buildIntervals(filtered);
assert(intervals.length > 0, "应计算出间隔");
assert(intervals.every((i) => i.wait > 0), "所有间隔应大于 0 分钟");
assert(intervals.every((i) => i.from.route === ROUTE && i.to.route === ROUTE));

// 6. 统计
const stats = Core.computeStats(filtered, intervals, routeDups.length);
assert.strictEqual(stats.recordCount, filtered.length);
assert.strictEqual(stats.dupRemoved, 3);
assert(stats.avgWait > 0 && stats.maxWait >= stats.minWait);

console.log("筛选线路:", ROUTE, "时间窗口: 07:00-09:30");
console.log("筛选后记录:", stats.recordCount, "条（去除重复", stats.dupRemoved, "条）");
console.log("间隔数量:", stats.intervalCount,
  "| 平均等待", stats.avgWait.toFixed(1), "分钟",
  "| 最长", stats.maxWait, "分钟 | 最短", stats.minWait, "分钟");
console.log("被移除的重复记录:");
routeDups.forEach((d) =>
  console.log("  -", d.route, d.stop, d.time, d.vehicle));
console.log("\n✔ 全部断言通过：重复记录已被正确去重");
