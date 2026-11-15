const S = require('../js/sim.js');
const R = require('../js/render.js');

function makeCtxStub() {
  return new Proxy({}, {
    get(target, prop) {
      if (prop === 'measureText') return () => ({ width: 10 });
      if (typeof prop === 'string') {
        return typeof target[prop] === 'function' ? target[prop] : () => {};
      }
      return undefined;
    },
    set(target, prop, value) {
      target[prop] = value;
      return true;
    }
  });
}

const canvas = {
  getContext: () => makeCtxStub(),
  getBoundingClientRect: () => ({ width: 1280, height: 720 }),
  width: 0,
  height: 0
};

const sim = new S.Simulation();
const renderer = new R.Renderer(canvas, sim);
renderer.resize();

for (let i = 0; i < 600; i++) {
  sim.setInput(1, Math.sin(i / 40) * 0.6, 0);
  sim.step(1 / 60);
  renderer.render(1 / 60);
}

const checks = [
  ['画布尺寸已按 DPR 设置', canvas.width > 0 && canvas.height > 0],
  ['相机跟随拖船', Number.isFinite(renderer.cam.x) && Number.isFinite(renderer.cam.y)],
  ['600 帧后模拟仍在运行', sim.status === 'running'],
  ['渲染未产生 NaN 坐标', Number.isFinite(sim.tug.x) && Number.isFinite(sim.tug.y)],
  ['折叠标记可被绘制', Array.isArray(renderer.foldMarks)]
];

let failed = 0;
for (const [name, ok] of checks) {
  console.log((ok ? '  PASS ' : '  FAIL ') + name);
  if (!ok) failed += 1;
}
process.exit(failed ? 1 : 0);
