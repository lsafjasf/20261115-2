// 无头实操：自动操作员真实调用引擎 API 完成一局，并复现未清缓存混批。
import { Game, SIZES } from '../src/engine.js';

const SIZE_CN = { small: '小', large: '大' };

function autopilot(game, { clearOnBatch }) {
  const req0 = game.requiredSize;
  game.setPaused(SIZES.SMALL, req0 !== SIZES.SMALL);
  game.setPaused(SIZES.LARGE, req0 !== SIZES.LARGE);
  let seen = game.batchIndex;
  let steps = 0;
  while (game.status === 'running' && steps < 6000) {
    steps++;
    if (game.batchIndex !== seen) {
      seen = game.batchIndex;
      const req = game.requiredSize;
      game.setPaused(SIZES.SMALL, req !== SIZES.SMALL);
      game.setPaused(SIZES.LARGE, req !== SIZES.LARGE);
      if (clearOnBatch) game.clearBuffer();
    }
    const front = game.buffer[0];
    game.setDivert(Boolean(front && front.size !== game.requiredSize));
    if (game.activeBottle && game.activeBottle.bad) game.rejectBottle();
    game.update(100);
  }
}

console.log('===== 场景一：完整一局（规范操作：单料斗、清缓存、剔除错药）=====');
const g1 = new Game({ seed: 20261115 });
autopilot(g1, { clearOnBatch: true });
console.log('结果:', g1.status === 'won' ? '成功 ✅' : '失败 ❌');
console.log(`合格瓶 ${g1.goodBottles}/12，废瓶 ${g1.wasteBottles}/2，`
  + `剔除药片 ${g1.divertedPills} 枚，清缓存 ${g1.clearActions} 次，混批污染 ${g1.mixedBatchContaminations} 次`);
console.log('小料斗产料:', g1.hoppers.small.spawned, '大料斗产料:', g1.hoppers.large.spawned,
  '（误料分别', g1.hoppers.small.misfeed, '/', g1.hoppers.large.misfeed, '）');
console.log('用时(模拟秒):', (g1.time / 1000).toFixed(1));

console.log('\n===== 场景二：换批未清缓存的混批实验 =====');
const g2 = new Game({ seed: 20261115 });
let steps = 0;
while (g2.batchIndex === 0 && g2.status === 'running' && steps < 6000) {
  const front = g2.buffer[0];
  g2.setDivert(Boolean(front && front.size !== g2.requiredSize));
  g2.update(100);
  steps++;
}
console.log(`第 3 瓶下线触发换批：小药片 → 大药片；此刻缓存残留 ${g2.buffer.length} 枚药片:`,
  g2.buffer.map((p) => SIZE_CN[p.size]).join('、'));
console.log('操作员未清缓存、未停料斗、未开剔除……');
let polluted = false;
for (let i = 0; i < 60 && !polluted; i++) {
  g2.setDivert(false);
  g2.update(100);
  polluted = Boolean(g2.activeBottle && g2.activeBottle.bad);
}
console.log(`污染判定: ${polluted ? '发生 ❌' : '未发生'}，原因=${g2.activeBottle?.reason}，`
  + `瓶内药片=${g2.activeBottle.pills.map((p) => SIZE_CN[p.size]).join('、')}`);

console.log('\n补救：剔除不良瓶 → 清空缓存 → 切大料斗，继续生产');
g2.rejectBottle();
g2.clearBuffer();
autopilot(g2, { clearOnBatch: true });
console.log('最终结果:', g2.status === 'won' ? '成功 ✅（仅 1 只废瓶，未超上限）' : '失败 ❌');
console.log(`合格瓶 ${g2.goodBottles}/12，废瓶 ${g2.wasteBottles}/2，混批污染 ${g2.mixedBatchContaminations} 次`);
const mixedBottle = g2.bottleLog.find((b) => !b.good && b.reason === 'mixed_batch');
console.log('废瓶记录:', mixedBottle ? `瓶 #${mixedBottle.id} 原因 mixed_batch` : '无');
