// 用最小 Canvas 2D 桩在 Node 中跑通 Renderer.draw 的全部绘制路径
globalThis.window = { devicePixelRatio: 1 };
const noop = () => {};
const ctx2d = new Proxy({}, {
  get(t, prop) {
    if (prop === 'createRadialGradient' || prop === 'createLinearGradient') {
      return () => ({ addColorStop: noop });
    }
    if (prop === 'measureText') return () => ({ width: 10 });
    return typeof prop === 'string' ? noop : undefined;
  },
  set() { return true; },
});
const canvas = {
  getContext: () => ctx2d,
  getBoundingClientRect: () => ({ width: 800, height: 800 }),
  width: 0, height: 0,
};
const { createState } = await import('../js/engine.js');
const { Autopilot } = await import('../js/autopilot.js');
const { Renderer } = await import('../js/renderer.js');
const state = createState();
const pilot = new Autopilot(state);
const renderer = new Renderer(canvas);
renderer.resize();
for (let i = 0; i < 600 && state.status === 'running'; i++) {
  const { step } = await import('../js/engine.js');
  step(state, pilot.computeInput(state));
  renderer.draw(state, pilot);
}
console.log('rendered frames OK, final status =', state.status, 'scenes =', state.sceneIndex);
