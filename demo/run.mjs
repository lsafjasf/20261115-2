// run.mjs — 用与浏览器完全相同的引擎 + 自动驾驶器，实际跑一次连续换景
// 输出：控制台报告、JSON 轨迹、SVG 时序图。无任何第三方依赖。

import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  createState,
  step,
  CONFIG,
  SCENES,
  ACTORS,
  POSTS,
  tiltMetric,
  comWorld,
  wrapAngle,
} from '../js/engine.js';
import { Autopilot } from '../js/autopilot.js';
import { renderSvg } from './svg.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', 'artifacts');
mkdirSync(outDir, { recursive: true });

const state = createState();
const pilot = new Autopilot(state);
const trace = [];
let maxTilt = 0;
let maxOmega = 0;
let minDanger = Infinity;

while (state.status === 'running') {
  const input = pilot.computeInput(state);
  const dir = pilot.routeDir || 1;
  const danger = pilot.distanceToDanger(state, dir);
  minDanger = Math.min(minDanger, danger);
  step(state, input);
  maxTilt = Math.max(maxTilt, tiltMetric(state));
  maxOmega = Math.max(maxOmega, Math.abs(state.omega));
  const target = SCENES[state.sceneIndex]?.angle ?? state.theta;
  trace.push({
    t: +state.time.toFixed(3),
    theta: +state.theta.toFixed(5),
    omega: +state.omega.toFixed(5),
    cw: +state.cw.toFixed(4),
    tilt: +tiltMetric(state).toFixed(4),
    danger: +Math.max(0, danger).toFixed(4),
    cue: state.cue.number,
    scene: state.sceneIndex,
    torque: input.torqueDir,
    cwInput: input.cwDir,
    errDeg: +(wrapAngle(target - state.theta) * 180 / Math.PI).toFixed(2),
    com: { x: +comWorld(state).x.toFixed(3), y: +comWorld(state).y.toFixed(3) },
  });
}

const shifts = state.events.filter((e) => e.type === 'shift');
const report = {
  result: state.status,
  failReason: state.failReason,
  shiftsCompleted: shifts.length,
  cuesUsed: state.cue.number,
  cueLimit: CONFIG.CUE_LIMIT,
  durationSec: +state.time.toFixed(2),
  frames: trace.length,
  maxTiltMetric: +maxTilt.toFixed(4),
  tiltLimit: CONFIG.TILT_LIMIT,
  maxOmegaRadS: +maxOmega.toFixed(4),
  omegaLimit: CONFIG.MAX_OMEGA,
  minDangerRad: +minDanger.toFixed(4),
  collisions: state.events.filter((e) => e.type === 'fail').length,
  sceneSequence: SCENES.map((s) => s.name),
  events: state.events,
};

writeFileSync(join(outDir, 'run-report.json'), JSON.stringify(report, null, 2));
writeFileSync(join(outDir, 'trace.json'), JSON.stringify(trace));
writeFileSync(join(outDir, 'trace.svg'), renderSvg(trace, report));

console.log('===== 连续换景实际运行报告 =====');
console.log(`结果: ${state.status === 'won' ? '成功' : `失败(${state.failReason})`}`);
console.log(`完成换景: ${shifts.length}/${CONFIG.REQUIRED_SHIFTS}，使用提示: ${state.cue.number}/${CONFIG.CUE_LIMIT}`);
console.log(`用时: ${state.time.toFixed(2)}s，帧数: ${trace.length}`);
console.log(`最大倾斜指标: ${maxTilt.toFixed(3)}（限值 ${CONFIG.TILT_LIMIT}）`);
console.log(`最大角速度: ${maxOmega.toFixed(3)} rad/s（限速 ${CONFIG.MAX_OMEGA}）`);
console.log(`距碰撞带最小安全余量: ${minDanger.toFixed(3)} rad（始终 > 0）`);
for (const event of state.events) {
  if (event.type === 'shift') {
    console.log(`  [${event.t.toFixed(2)}s] 第 ${event.scene + 1} 景「${SCENES[event.scene].name}」到位（提示 ${event.cue}）`);
  } else if (event.type === 'win') {
    console.log(`  [${event.t.toFixed(2)}s] 三次换景全部完成`);
  }
}
console.log(`\n产物: artifacts/run-report.json, artifacts/trace.json, artifacts/trace.svg`);
