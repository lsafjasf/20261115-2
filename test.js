/*
 * Node 测试：
 * 1) 稳态调节：简单调节策略在 10 分钟内保持压力低于上限且平均功率达标 → 成功。
 * 2) 忽略压力：固定负荷、不泄压、不注水 → 压力越限并触发自动停机。
 * 3) 物理健全性：注水过快暂时降低蒸汽量；泄压损失输出。
 */
const { createSim } = require('./sim');

let failures = 0;
function check(name, cond, detail) {
  const ok = !!cond;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
  if (!ok) failures++;
}

const DT = 0.25;

function run(sim, controller) {
  let maxP = 0;
  let shutdownT = null;
  while (!sim.state.finished && !sim.state.shutdown) {
    controller(sim.state, sim);
    sim.step(DT);
    maxP = Math.max(maxP, sim.state.P);
  }
  if (sim.state.shutdown) shutdownT = sim.state.t;
  // 停机后也让它走到结束，确认状态稳定
  let guard = 0;
  while (!sim.state.finished && guard++ < 60000) sim.step(DT);
  return { maxP, shutdownT };
}

// ---------- 场景 1：稳态调节 ----------
function steadyController(state, sim) {
  // 目标压力 9.5 MPa：优先调涡轮负荷保发电，压力偏高再泄压，逼近上限才注水
  const c = { ...sim.state.target };
  c.load = Math.min(1, Math.max(0.3, c.load + 0.02 * (state.P - 9.5)));
  if (state.P > 11.0) c.relief = Math.min(0.6, (state.P - 11.0) * 0.5);
  else c.relief = Math.max(0, c.relief - 0.05);
  c.injection = state.P > 11.5 ? 0.3 : 0;
  sim.setControls(c);
}

const simA = createSim();
let adjustTick = 0;
const { maxP: maxPA } = run(simA, (s, sim) => {
  if (adjustTick++ % 8 === 0) steadyController(s, sim); // 每 2 秒调节一次
});
const a = simA.state;
console.log(`[稳态] t=${a.t.toFixed(0)}s 峰值压力=${maxPA.toFixed(2)}MPa 平均功率=${a.avgPower.toFixed(2)}MW 累计=${a.energy.toFixed(2)}MWh`);
check('稳态：未触发停机', !a.shutdown);
check('稳态：峰值压力低于上限', maxPA < simA.cfg.pLimit, `峰值 ${maxPA.toFixed(2)} < ${simA.cfg.pLimit}`);
check('稳态：平均功率达标', a.avgPower >= simA.cfg.powerSuccessAvg, `${a.avgPower.toFixed(2)} >= ${simA.cfg.powerSuccessAvg}`);
check('稳态：判定成功', a.success === true);

// ---------- 场景 2：忽略压力 → 自动停机 ----------
const simB = createSim();
simB.setControls({ load: 0.8, relief: 0, injection: 0 });
const { maxP: maxPB, shutdownT } = run(simB, () => {});
const b = simB.state;
console.log(`[忽略] 停机于 t=${shutdownT === null ? '未停机' : shutdownT.toFixed(0) + 's'} 峰值压力=${maxPB.toFixed(2)}MPa 原因=${b.shutdownReason}`);
check('忽略：发生自动停机', b.shutdown === true);
check('忽略：停机原因为超压', b.shutdownReason === 'overpressure');
check('忽略：停机前压力越限', maxPB > simB.cfg.pLimit, `峰值 ${maxPB.toFixed(2)} > ${simB.cfg.pLimit}`);
check('忽略：停机发生在时限内', shutdownT !== null && shutdownT < simB.cfg.duration,
  `t=${shutdownT === null ? '-' : shutdownT.toFixed(0)}s`);
check('忽略：判定失败', b.success === false);
check('忽略：停机后功率归零', b.power === 0);

// ---------- 场景 3：物理健全性 ----------
// 注水过快 → 蒸汽量暂时下降
const simC = createSim({ seed: 1 });
for (let i = 0; i < 400; i++) simC.step(DT); // 稳定 100s
const qBefore = simC.state.flows.qIn;
simC.setControls({ injection: 0.9 });
for (let i = 0; i < 40; i++) simC.step(DT); // 10s 后
const qAfter = simC.state.flows.qIn;
check('物理：注水过快暂时降低蒸汽量', qAfter < qBefore - 2, `${qBefore.toFixed(1)} → ${qAfter.toFixed(1)}`);

// 泄压 → 输出损失（对照：同种子同操作，开泄压阀的功率更低）
const simD1 = createSim({ seed: 2 });
const simD2 = createSim({ seed: 2 });
for (let i = 0; i < 400; i++) { simD1.step(DT); simD2.step(DT); }
simD2.setControls({ relief: 0.5 });
for (let i = 0; i < 200; i++) { simD1.step(DT); simD2.step(DT); }
check('物理：泄压损失输出', simD2.state.power < simD1.state.power - 1,
  `对照 ${simD1.state.power.toFixed(2)}MW → 泄压 ${simD2.state.power.toFixed(2)}MW`);

// 压力/温度延迟：阶跃注水后温度不是瞬时变化
const simE = createSim({ seed: 3 });
for (let i = 0; i < 400; i++) simE.step(DT);
const t0 = simE.state.T;
simE.setControls({ injection: 1 });
simE.step(DT);
const t1 = simE.state.T;
check('物理：温度具有延迟（非瞬时跳变）', Math.abs(t1 - t0) < 1.0, `一步变化 ${(t1 - t0).toFixed(3)}°C`);

console.log(failures === 0 ? '\n全部测试通过' : `\n${failures} 项失败`);
process.exit(failures === 0 ? 0 : 1);
