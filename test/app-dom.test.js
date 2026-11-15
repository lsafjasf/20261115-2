// 轻量 DOM 桩件集成测试：不引入 jsdom，只实现 app.js 用到的接口。
import assert from "node:assert/strict";
import { describe, it } from "node:test";

const listeners = new Map();

function createElementStub(tag) {
  const element = {
    tag,
    children: [],
    style: {},
    className: "",
    innerHTML: "",
    textContent: "",
    value: "",
    type: "",
    attributes: {},
    setAttribute(name, value) {
      this.attributes[name] = value;
    },
    append(...children) {
      this.children.push(...children);
    },
    replaceChildren(...children) {
      this.children = children;
    },
    querySelector() {
      const button = createElementStub("button");
      return button;
    },
    addEventListener(event, handler) {
      listeners.get(this).set(event, handler);
    },
    click() {
      listeners.get(this).get("click")();
    },
  };
  listeners.set(element, new Map());
  return element;
}

function createCanvasStub() {
  const canvas = createElementStub("canvas");
  canvas.ownerDocument = { defaultView: { devicePixelRatio: 1 } };
  canvas.getContext = () => ({
    setTransform() {},
    clearRect() {},
    fillRect() {},
    beginPath() {},
    closePath() {},
    moveTo() {},
    arcTo() {},
    fill() {},
    fillText() {},
    save() {},
    restore() {},
  });
  return canvas;
}

const elements = new Map();
const grid = createElementStub("div");
const cssOutput = createElementStub("pre");
const swatchCanvas = createCanvasStub();
const interfaceCanvas = createCanvasStub();

function makeInput(id, initialValue) {
  const input = createElementStub("input");
  input.value = String(initialValue);
  elements.set(id, input);
  return input;
}

[
  ["base-hue", 210],
  ["hue-spread", 48],
  ["sat-min", 42],
  ["sat-max", 78],
  ["light-min", 32],
  ["light-max", 78],
  ["seed", 20261115],
].forEach(([id, value]) => makeInput(id, value));

["regenerate-btn", "random-seed-btn", "copy-css-btn", "download-css-btn"].forEach(
  (id) => {
    const button = createElementStub("button");
    elements.set(id, button);
  },
);

globalThis.document = {
  createElement: createElementStub,
  querySelector(selector) {
    const id = selector.replace("#", "");
    if (id === "swatch-grid") return grid;
    if (id === "css-output") return cssOutput;
    if (id === "swatch-canvas") return swatchCanvas;
    if (id === "interface-canvas") return interfaceCanvas;
    if (id === "lock-summary" || id === "export-status" || id === "seed-value") {
      return createElementStub("span");
    }
    if (selector.endsWith("-value")) return createElementStub("output");
    return elements.get(id) ?? createElementStub("input");
  },
  createRange: () => ({ selectNodeContents() {} }),
};

globalThis.window = { getSelection: () => ({ removeAllRanges() {}, addRange() {} }) };
globalThis.navigator.clipboard = { writeText: async () => {} };
globalThis.Blob = class Blob {
  constructor(parts) {
    this.parts = parts;
  }
};
globalThis.URL = { createObjectURL: () => "blob:stub", revokeObjectURL() {} };

await import("../app.js");

describe("app.js DOM 集成（锁定 + 三次再生成）", () => {
  it("初始渲染五张卡片与 CSS 变量", () => {
    assert.equal(grid.children.length, 5);
    assert.match(cssOutput.textContent, /--color-1: #/);
    assert.match(cssOutput.textContent, /--color-5-on: #/);
  });

  it("锁定第 2、4 色后再生成三次，卡片 HEX 与锁定状态保持", () => {
    const findHex = (card) =>
      card.children
        .find((child) => child.className === "swatch-meta")
        .children.find((child) => child.className === "swatch-hex").textContent;
    const findLockButton = (card) =>
      card.children
        .find((child) => child.className === "swatch-hero")
        .children.find((child) => child.tag === "button");
    const lockButtons = grid.children.map(findLockButton);
    lockButtons[1].click();
    lockButtons[3].click();

    const lockedHex = [grid.children[1], grid.children[3]].map(findHex);

    const regenerate = elements.get("regenerate-btn");
    for (let round = 0; round < 3; round += 1) {
      regenerate.click();
      assert.equal(grid.children.length, 5);
      const currentLocked = [grid.children[1], grid.children[3]].map(findHex);
      assert.deepEqual(currentLocked, lockedHex);
      assert.ok(grid.children[1].className.includes("is-locked"));
      assert.ok(grid.children[3].className.includes("is-locked"));
    }

    const unlockedHex = [0, 2, 4].map((index) =>
      grid.children[index]
        .children.find((child) => child.className === "swatch-meta")
        .children.find((child) => child.className === "swatch-hex").textContent,
    );
    assert.ok(unlockedHex.every((hex) => /^#[0-9A-F]{6}$/.test(hex)));
  });
});
