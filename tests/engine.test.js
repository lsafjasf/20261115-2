import test from "node:test";
import assert from "node:assert/strict";
import {
  CONFIG,
  anchorQuality,
  createEngine,
  deployAnchor,
  setControls,
  step,
} from "../app/js/engine.js";
import { runRecovery, runWrongAnchor } from "./drivers.js";

test("未固定地锚时不能形成有效牵引", () => {
  const engine = createEngine();
  setControls(engine, { winch: 60 });
  for (let i = 0; i < 40; i += 1) step(engine, CONFIG.tick);
  assert.ok(engine.front.x < CONFIG.frontStart.x + 3);
  assert.equal(engine.anchor.deployed, false);
});

test("安全锚点角度优于偏离受力线的角度", () => {
  assert.ok(anchorQuality(67) > 0.98);
  assert.ok(anchorQuality(29) < 0.05);
  assert.ok(anchorQuality(55) > anchorQuality(43));
});

test("拖索持续过紧会断裂并判负", () => {
  const engine = createEngine();
  setControls(engine, { angle: 67 });
  deployAnchor(engine);
  setControls(engine, { winch: 100, steer: 0 });
  for (let i = 0; i < 100 && engine.status === "running"; i += 1) {
    step(engine, CONFIG.tick);
  }
  assert.equal(engine.status, "lost");
  assert.equal(engine.finishReason, "rope-break");
});

test("错误锚点造成救援车侧滑", () => {
  const { engine } = runWrongAnchor();
  assert.ok(engine.rescue.slip >= 22, `期望出现明显侧滑，实际 ${engine.rescue.slip}`);
  assert.ok(engine.rescue.x < CONFIG.rescueBase.x - 12);
  assert.ok(engine.rescue.tilt > -1);
});

test("正确操作完成双车救援", () => {
  const { engine } = runRecovery();
  assert.equal(engine.status, "won", engine.alert);
  assert.equal(engine.front.safe, true);
  assert.equal(engine.rear.safe, true);
  assert.ok(engine.rescue.slip < 12);
  assert.ok(engine.time < 50);
});
