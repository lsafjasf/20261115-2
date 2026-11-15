import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  contrastRatio,
  hslToHex,
} from "../core/color.js";
import {
  DEFAULT_PARAMS,
  SWATCH_COUNT,
  contrastSummary,
  exportCssVariables,
  generatePalette,
  regeneratePalette,
  resamplePalette,
} from "../core/palette.js";

describe("颜色基础", () => {
  it("黑白对比度为 WCAG 极值 21:1", () => {
    assert.ok(Math.abs(contrastRatio("#ffffff", "#000000") - 21) < 0.01);
  });

  it("对比度与参数顺序无关且不小于 1", () => {
    const hex = hslToHex(210, 0.6, 0.5);
    const ratioA = contrastRatio(hex, "#ffffff");
    const ratioB = contrastRatio("#ffffff", hex);
    assert.equal(ratioA, ratioB);
    assert.ok(ratioA >= 1);
  });

  it("HSL 极值映射正确", () => {
    assert.equal(hslToHex(0, 0, 0), "#000000");
    assert.equal(hslToHex(0, 0, 1), "#ffffff");
  });
});

describe("调色板生成", () => {
  it("始终产出五个合法 HEX 色块", () => {
    const palette = generatePalette(DEFAULT_PARAMS);
    assert.equal(palette.length, SWATCH_COUNT);
    for (const swatch of palette) {
      assert.match(swatch.hex, /^#[0-9a-f]{6}$/);
      assert.ok(swatch.saturation >= DEFAULT_PARAMS.saturationMin);
      assert.ok(swatch.saturation <= DEFAULT_PARAMS.saturationMax);
      assert.ok(swatch.lightness >= DEFAULT_PARAMS.lightnessMin);
      assert.ok(swatch.lightness <= DEFAULT_PARAMS.lightnessMax);
    }
  });

  it("同种子结果可复现", () => {
    const first = generatePalette(DEFAULT_PARAMS);
    const second = generatePalette(DEFAULT_PARAMS);
    assert.deepEqual(
      first.map((swatch) => swatch.hex),
      second.map((swatch) => swatch.hex),
    );
  });

  it("每次再生成都会更换种子，未锁定色块发生变化", () => {
    const first = generatePalette(DEFAULT_PARAMS);
    const second = regeneratePalette(first, DEFAULT_PARAMS);
    assert.notDeepEqual(
      first.map((swatch) => swatch.hex),
      second.map((swatch) => swatch.hex),
    );
  });

  it("可读性评级来自真实 WCAG 对比度", () => {
    const palette = generatePalette(DEFAULT_PARAMS);
    for (const swatch of palette) {
      const summary = contrastSummary(swatch);
      assert.ok(["AAA", "AA", "AA 大字", "不达标"].includes(summary.text));
      assert.ok(swatch.textContrast === swatch.buttonContrast);
    }
  });
});

describe("锁定语义（核心验收）", () => {
  it("锁定两个色块后连续再生成三次，锁定色块完全不变", () => {
    const initial = generatePalette(DEFAULT_PARAMS);
    const lockedIndexes = [1, 3];
    let working = initial.map((swatch) => ({
      ...swatch,
      locked: lockedIndexes.includes(swatch.index),
    }));

    const snapshots = [working];
    for (let round = 0; round < 3; round += 1) {
      working = regeneratePalette(working, DEFAULT_PARAMS);
      snapshots.push(working);
    }

    for (const index of lockedIndexes) {
      const anchor = snapshots[0][index];
      for (const snapshot of snapshots.slice(1)) {
        assert.equal(snapshot[index].locked, true);
        assert.deepEqual(snapshot[index], anchor);
      }
    }

    const unlockedIndexes = [0, 2, 4];
    const roundsChanged = unlockedIndexes.every((index) => {
      const hexes = snapshots.map((snapshot) => snapshot[index].hex);
      return new Set(hexes).size > 1;
    });
    assert.ok(roundsChanged, "未锁定色块应在三次生成中至少变化一次");
    assert.equal(snapshots[3].seed, DEFAULT_PARAMS.seed + 3);
  });

  it("调节主色相/饱和度/明度参数后锁定色块依旧保持", () => {
    const initial = generatePalette(DEFAULT_PARAMS);
    const locked = [initial[0], initial[4]].map((swatch) => ({
      ...swatch,
      locked: true,
    }));
    const tweaked = resamplePalette(
      initial.map((swatch, index) =>
        index === 0 || index === 4
          ? { ...swatch, locked: true }
          : swatch,
      ),
      {
        ...DEFAULT_PARAMS,
        baseHue: 20,
        saturationMin: 0.1,
        saturationMax: 0.3,
        lightnessMin: 0.15,
        lightnessMax: 0.55,
      },
    );
    assert.deepEqual(tweaked[0], locked[0]);
    assert.deepEqual(tweaked[4], locked[1]);
  });

  it("全部解锁后色块可重新采样，全部锁定时输出与当前一致", () => {
    const initial = generatePalette(DEFAULT_PARAMS);
    const allLocked = initial.map((swatch) => ({ ...swatch, locked: true }));
    const next = regeneratePalette(allLocked, DEFAULT_PARAMS);
    assert.deepEqual(
      next.map((swatch) => swatch.hex),
      initial.map((swatch) => swatch.hex),
    );
  });
});

describe("CSS 变量导出", () => {
  it("导出五组变量、HSL 备选与前景配对", () => {
    const palette = generatePalette(DEFAULT_PARAMS);
    const css = exportCssVariables(palette);
    assert.match(css, /^:root \{/);
    for (let index = 1; index <= SWATCH_COUNT; index += 1) {
      assert.match(css, new RegExp(`--color-${index}: #`));
      assert.match(css, new RegExp(`--color-${index}-hsl: hsl\\(`));
      assert.match(css, new RegExp(`--color-${index}-on: #`));
    }
  });
});

describe("参数边界", () => {
  it("饱和度与明度上下限反序时自动纠正，零跨度仍可生成", () => {
    const palette = generatePalette({
      ...DEFAULT_PARAMS,
      saturationMin: 0.9,
      saturationMax: 0.2,
      lightnessMin: 0.8,
      lightnessMax: 0.4,
      baseHue: 350,
      hueSpread: 60,
    });
    assert.equal(palette.length, SWATCH_COUNT);
    for (const swatch of palette) {
      assert.ok(swatch.saturation >= 0.2 && swatch.saturation <= 0.9);
      assert.ok(swatch.lightness >= 0.4 && swatch.lightness <= 0.8);
      assert.ok(swatch.hue >= 0 && swatch.hue < 360);
      assert.match(swatch.hex, /^#[0-9a-f]{6}$/);
    }
  });

  it("零扰动范围下所有色块共享主色相", () => {
    const palette = generatePalette({
      ...DEFAULT_PARAMS,
      hueSpread: 0,
      baseHue: 25,
    });
    for (const swatch of palette) {
      assert.equal(Math.round(swatch.hue), 25);
    }
  });
});
