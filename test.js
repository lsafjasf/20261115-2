/* 实际运行三种起终点的双算法对比，并测试一条线路停运后的绕行与断开节点 */
const assert = require('assert');
const S = require('./subway-data');

const nameOf = (sid) => `${S.stations[sid].name}(${sid})`;
const lineName = (id) => S.lineById(id).name;

function printPlan(label, plan) {
  if (!plan) {
    console.log(`  ${label}: 不可达`);
    return;
  }
  const ride = plan.segments
    .map((g) => `${lineName(g.line)} ${nameOf(g.from)}→${nameOf(g.to)}`)
    .join('；换乘 ');
  console.log(
    `  ${label}: ${plan.totalMinutes} 分钟 / 换乘 ${plan.transfers} 次` +
    `\n    路线: ${ride}` +
    `\n    经停: ${plan.stops.map(nameOf).join(' → ')}`
  );
}

function compare(title, start, end, closed = []) {
  console.log(`\n=== ${title}: ${nameOf(start)} → ${nameOf(end)}` +
    `${closed.length ? `（停运 ${closed.map(lineName).join('、')}）` : ''} ===`);
  const r = S.findRoutes(start, end, closed);
  if (!r.reachable) {
    console.log(`  不可达！断开节点: ${r.disconnectedStations.map(nameOf).join('、') || '无'}`);
    return r;
  }
  printPlan('最短时间', r.shortestTime);
  printPlan('最少换乘', r.fewestTransfers);
  if (r.disconnectedStations.length) {
    console.log(`  网络中的断开节点: ${r.disconnectedStations.map(nameOf).join('、')}`);
  }
  return r;
}

let passed = 0;
function check(desc, fn) {
  fn();
  passed++;
  console.log(`  ✓ ${desc}`);
}

console.log('########## 一、正常运营：三种起终点路线对比 ##########');

// 1) 机场 → 东站：3号线直达但站间慢；换两次走快线更快
const q1 = compare('路线一', 'C0', 'A4');
check('Q1 最短时间 = 22 分钟、换乘 2 次（快线绕行方案）', () => {
  assert.strictEqual(q1.shortestTime.totalMinutes, 22);
  assert.strictEqual(q1.shortestTime.transfers, 2);
  assert.deepStrictEqual(
    q1.shortestTime.segments.map((g) => g.line), ['L3', 'L2', 'L1']
  );
});
check('Q1 最少换乘 = 0 次（3号线直达）、30 分钟', () => {
  assert.strictEqual(q1.fewestTransfers.transfers, 0);
  assert.strictEqual(q1.fewestTransfers.totalMinutes, 30);
  assert.deepStrictEqual(q1.fewestTransfers.segments.map((g) => g.line), ['L3']);
});
check('Q1 两种算法给出不同方案', () => {
  assert.notDeepStrictEqual(
    q1.shortestTime.stops, q1.fewestTransfers.stops
  );
});

// 2) 南站 → 机场：2号线直达需 3 段；在南湖站换 3号线只要 2 段
const q2 = compare('路线二', 'B0', 'C0');
check('Q2 两种算法一致：17 分钟、换乘 1 次（南湖站换乘）', () => {
  assert.strictEqual(q2.shortestTime.totalMinutes, 17);
  assert.strictEqual(q2.fewestTransfers.totalMinutes, 17);
  assert.strictEqual(q2.shortestTime.transfers, 1);
  assert.deepStrictEqual(q2.shortestTime.stops, ['B0', 'B1', 'B2', 'C1', 'C0']);
});

// 3) 西站 → 东站：1号线全程直达，两算法都应选同一条
const q3 = compare('路线三', 'A0', 'A4');
check('Q3 两种算法一致：8 分钟、0 换乘', () => {
  assert.strictEqual(q3.shortestTime.totalMinutes, 8);
  assert.strictEqual(q3.fewestTransfers.transfers, 0);
  assert.deepStrictEqual(q3.shortestTime.stops, ['A0', 'A1', 'A2', 'A3', 'A4']);
});

console.log('\n########## 二、1号线临时停运：绕行与断开节点 ##########');

// 4) 机场 → 东站：原快线方案失效，被迫绕行 3 号线直达
const q4 = compare('停运绕行', 'C0', 'A4', ['L1']);
check('停运后最短时间改走 3 号线直达（30 分钟、0 换乘）', () => {
  assert.ok(q4.reachable);
  assert.strictEqual(q4.shortestTime.totalMinutes, 30);
  assert.deepStrictEqual(q4.shortestTime.segments.map((g) => g.line), ['L3']);
});
check('两算法在停运后收敛为同一绕行方案', () => {
  assert.deepStrictEqual(q4.shortestTime.stops, q4.fewestTransfers.stops);
});
check('停运 1 号线后 A0/A1 成为断开节点（A4 由 3 号线覆盖，仍可达）', () => {
  assert.deepStrictEqual(q4.disconnectedStations, ['A0', 'A1']);
});

// 5) 终点本身在停运线路上且无其他线路经过 → 不可达
const q5 = compare('无法到达', 'C0', 'A4', ['L1', 'L3']);
check('多线停运时正确判定不可达并列出全部断开节点', () => {
  assert.strictEqual(q5.reachable, false);
  assert.deepStrictEqual(q5.disconnectedStations,
    ['A0', 'A1', 'A3', 'A4', 'C0', 'C1', 'C2']);
});

console.log(`\n全部 ${passed} 项断言通过 ✔`);
