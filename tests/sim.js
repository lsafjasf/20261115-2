/* 无头仿真工具：以固定 1/120 子步推进，自动停靠站点。node 内部 require 使用。 */
const E = require('../js/engine.js');
const { CFG } = E;

function advance(g, seconds) {
  const steps = Math.round(seconds / CFG.FIXED_DT);
  for (let i = 0; i < steps && g.status === 'running'; i++) E.step(g, CFG.FIXED_DT);
  return g;
}

function driveTo(g, targetS) {
  let guard = 0;
  while (g.status === 'running' && guard < 20000) {
    if (E.reachedStation(g, targetS)) {
      g.input.dir = 0;
      advance(g, 0.05);
      if (E.reachedStation(g, targetS)) break;
    }
    g.input.dir = g.s < targetS ? 1 : -1;
    advance(g, CFG.FIXED_DT);
    guard++;
  }
  g.input.dir = 0;
  return g;
}

function settle(g, seconds) {
  return advance(g, seconds == null ? 1.2 : seconds);
}

module.exports = { E, advance, driveTo, settle };
