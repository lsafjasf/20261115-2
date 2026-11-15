import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { drawMockInterface, drawSwatchCard } from "../core/canvas-view.js";
import { generatePalette } from "../core/palette.js";
import { DEFAULT_PARAMS } from "../core/palette.js";

function createStubCanvas() {
  const calls = [];
  const ctx = {
    calls,
    setTransform(...args) {
      calls.push(["setTransform", ...args]);
    },
    clearRect(...args) {
      calls.push(["clearRect", ...args]);
    },
    fillRect(...args) {
      calls.push(["fillRect", ...args]);
    },
    beginPath() {
      calls.push(["beginPath"]);
    },
    closePath() {
      calls.push(["closePath"]);
    },
    moveTo(...args) {
      calls.push(["moveTo", ...args]);
    },
    arcTo(...args) {
      calls.push(["arcTo", ...args]);
    },
    fill() {
      calls.push(["fill"]);
    },
    fillText(...args) {
      calls.push(["fillText", ...args]);
    },
    save() {
      calls.push(["save"]);
    },
    restore() {
      calls.push(["restore"]);
    },
  };
  return {
    width: 0,
    height: 0,
    style: {},
    ownerDocument: { defaultView: { devicePixelRatio: 2 } },
    getContext: () => ctx,
  };
}

describe("Canvas 绘制", () => {
  const palette = generatePalette(DEFAULT_PARAMS).map((swatch, index) =>
    index === 2 ? { ...swatch, locked: true } : swatch,
  );

  it("色卡按高 DPI 初始化并绘制五个色块", () => {
    const canvas = createStubCanvas();
    drawSwatchCard(canvas, palette);
    assert.equal(canvas.width, 1920);
    assert.equal(canvas.height, 600);
    const ctx = canvas.getContext("2d");
    assert.ok(ctx.calls.some(([name]) => name === "setTransform"));
    const fillCalls = ctx.calls.filter(([name]) => name === "fill").length;
    assert.ok(fillCalls >= 6, "至少包含五个色块与一个锁定徽标");
    const hexText = ctx.calls.find(
      ([name, text]) => name === "fillText" && typeof text === "string" && text.startsWith("#"),
    );
    assert.ok(hexText, "应在卡片上绘制 HEX 文本");
  });

  it("模拟界面绘制导航、主视觉与三张卡片", () => {
    const canvas = createStubCanvas();
    drawMockInterface(canvas, palette);
    assert.equal(canvas.width, 1920);
    assert.equal(canvas.height, 840);
    const ctx = canvas.getContext("2d");
    const labels = ctx.calls
      .filter(([name]) => name === "fillText")
      .map(([, text]) => text);
    assert.ok(labels.includes("NOISE PALETTE STUDIO"));
    assert.ok(labels.some((text) => text.includes("噪声生成的五色设计系统")));
    assert.ok(labels.some((text) => text.includes("卡片 1")));
  });
});
