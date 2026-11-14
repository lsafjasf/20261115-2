// 确定性测试驱动器：以 0.1 秒为 tick 驱动纯引擎，模拟两名人类玩家。
import { createEngine, start, step, crank, setValve } from '../js/engine.js';

export function runDriver(mode, { log = false } = {}) {
  const engine = createEngine();
  start(engine);
  const TICK = 0.1;

  let nextCrank = 0;
  let restUntil = 0;
  let nextSoloDecision = 0;
  const milestones = [];
  const marks = [120, 240, 360, 480];

  function chooseValve() {
    const cur = engine.pools[engine.valve];
    const other = engine.pools[1 - engine.valve];
    // 池子接近满就切换，留安全裕量避免错阀回灌。
    if (cur.level > 82 && other.level < 92) setValve(engine, 1 - engine.valve);
  }

  while (!engine.finished) {
    if (mode === 'duo') {
      // 玩家2 每 tick 都可独立看阀门；玩家1 独立掌握摇杆节奏。
      chooseValve();
      if (!engine.seized && engine.t >= nextCrank && engine.t >= restUntil) {
        if (engine.heat > 78) {
          // 主动休息冷却，把平均速度压在安全线 1.2 次/秒附近。
          restUntil = engine.t + 1.2;
        } else {
          crank(engine);
          nextCrank = engine.t + 0.92;
        }
      }
    } else {
      // 单人：注意力要在「监视阀门」和「摇泵节奏」之间切换，
      // 每 0.6 秒有一个决策 tick 用于切阀门而不摇泵，节奏间隔更慢；
      // 每 20 秒还要分神 2 秒重新观察池况，期间只能慢速摇泵。
      const decisionTick = engine.t >= nextSoloDecision;
      if (decisionTick) {
        nextSoloDecision = engine.t + 0.3;
        chooseValve();
      }
      // 每 10 秒分神 4 秒重新观察两个池子，期间无法保持摇泵节奏。
      const attentionBreak = engine.t % 10 < 4;
      const crankGap = attentionBreak ? 1.6 : 1.2;
      if (!decisionTick && !engine.seized && engine.t >= nextCrank && engine.heat <= 76) {
        crank(engine);
        nextCrank = engine.t + crankGap;
      }
    }

    step(engine, TICK);

    if (log) {
      const hit = marks.find((m) => engine.t >= m - 1e-9 && engine.t < m + TICK);
      if (hit !== undefined && !milestones.some((item) => item.t === hit)) {
        milestones.push({
          t: hit,
          level: engine.level,
          heat: engine.heat,
          A: engine.pools[0].level,
          B: engine.pools[1].level,
          valve: engine.valve === 0 ? 'A' : 'B',
          strokes: engine.strokeCount,
          wrong: engine.wrongCount,
          seized: engine.seizureCount,
        });
      }
    }
  }

  return { engine, milestones };
}
