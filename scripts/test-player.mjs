import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launchBrowser } from "./browser.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const assertions = [];
const screenshots = join(root, "artifacts");

function assert(condition, label, detail = "") {
  assertions.push({ label, passed: Boolean(condition), detail });
  if (!condition) throw new Error(`断言失败：${label}${detail ? ` — ${detail}` : ""}`);
}

function startServer() {
  const child = spawn(process.execPath, ["scripts/serve.mjs"], {
    cwd: root,
    env: { ...process.env, PORT: "0" },
    stdio: ["ignore", "pipe", "pipe"]
  });
  const ready = new Promise((resolveReady, rejectReady) => {
    const timer = setTimeout(
      () => rejectReady(new Error("本地服务启动超时")),
      10000
    );
    child.stdout.on("data", (chunk) => {
      const match = /running at (http:\/\/[^\s]+)/.exec(chunk.toString());
      if (match) {
        clearTimeout(timer);
        resolveReady(match[1]);
      }
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      rejectReady(new Error(`本地服务退出，代码 ${code}`));
    });
  });
  return { child, ready };
}

async function sampleCanvas(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector("#previewCanvas");
    const context = canvas.getContext("2d");
    const image = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let sum = 0;
    let max = 0;
    let dark = 0;
    for (let index = 0; index < image.length; index += 4) {
      const luma =
        image[index] * 0.2126 +
        image[index + 1] * 0.7152 +
        image[index + 2] * 0.0722;
      sum += luma;
      if (luma > max) max = luma;
      if (luma < 8) dark += 1;
    }
    const count = image.length / 4;
    return { mean: sum / count, max, darkRatio: dark / count };
  });
}

async function main() {
  await mkdir(screenshots, { recursive: true });
  const { child, ready } = startServer();
  let browser = null;

  try {
    const baseUrl = await ready;
    browser = await launchBrowser();
    const page = await browser.newPage({
      viewport: { width: 1500, height: 980 },
      deviceScaleFactor: 1
    });
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);

    const summary = await page.evaluate(() => window.CutLoop.getSummary());
    assert(summary.sceneOrder.length === 3, "工程包含三个场景");
    assert(summary.transitions.length === 2, "工程包含两段转场");
    assert(
      Math.abs(summary.total - 10.25) < 0.001,
      "默认工程总时长为 10.25 秒"
    );
    assert(
      summary.transitions[0].type === "push" &&
        summary.transitions[1].type === "mask",
      "默认转场为推移与遮罩"
    );

    const tr1 = summary.transitionWindows[0];
    const startState = await page.evaluate(
      (time) => window.CutLoop.inspectAt(time),
      tr1.start
    );
    const middleState = await page.evaluate(
      (time) => window.CutLoop.inspectAt(time),
      tr1.start + (tr1.end - tr1.start) / 2
    );
    const endState = await page.evaluate(
      (time) => window.CutLoop.inspectAt(time),
      tr1.end - 0.001
    );
    assert(startState.kind === "transition", "转场起点解析为双场景合成");
    assert(
      middleState.fromLocalTime > startState.fromLocalTime &&
        endState.fromLocalTime > middleState.fromLocalTime,
      "转场期间前一个场景时间持续前进，没有提前归零",
      `${startState.fromLocalTime} → ${middleState.fromLocalTime} → ${endState.fromLocalTime}`
    );
    assert(
      middleState.toLocalTime > 0 &&
        endState.toLocalTime > middleState.toLocalTime,
      "转场期间后一个场景时间同步前进"
    );
    assert(
      Math.abs(middleState.progress - 0.5) < 0.01,
      "转场进度与时间轴计算一致"
    );

    await page.evaluate((time) => window.CutLoop.seek(time), tr1.start + 0.55);
    await page.locator(".stage-canvas-wrap").screenshot({
      path: join(screenshots, "transition-push.png")
    });
    await page.evaluate(
      (time) => window.CutLoop.seek(time),
      summary.transitionWindows[1].start + 0.62
    );
    await page.locator(".stage-canvas-wrap").screenshot({
      path: join(screenshots, "transition-mask.png")
    });

    const lumaByType = {};
    for (const type of ["push", "dissolve", "mask", "flash"]) {
      await page.click(`[data-transition-index="0"][data-type="${type}"]`);
      const current = await page.evaluate(() => window.CutLoop.getSummary());
      const transition = current.transitionWindows[0];
      const state = await page.evaluate(
        (time) => window.CutLoop.inspectAt(time),
        transition.start + (transition.end - transition.start) / 2
      );
      const luma = await sampleCanvas(page);
      lumaByType[type] = luma;
      assert(state.transitionType === type, `可选择转场类型：${type}`);
      assert(
        luma.mean > 10 && luma.max > 24,
        `${type} 转场中间帧不是黑帧`,
        JSON.stringify(luma)
      );
    }

    await page.click(`[data-transition-index="0"][data-type="flash"]`);
    await page.locator(".stage-canvas-wrap").screenshot({
      path: join(screenshots, "transition-flash.png")
    });
    await page.click(`[data-transition-index="0"][data-type="dissolve"]`);
    await page.locator(".stage-canvas-wrap").screenshot({
      path: join(screenshots, "transition-dissolve.png")
    });

    await page.evaluate(() => {
      const slider = document.querySelector('[data-duration-index="0"]');
      slider.value = "1.35";
      slider.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const afterDuration = await page.evaluate(() => window.CutLoop.getSummary());
    assert(
      Math.abs(afterDuration.transitions[0].duration - 1.35) < 0.001,
      "转场时长可以调整"
    );

    await page.click('[data-scene-index="1"] [data-move="-1"]');
    await page.click('[data-transition-index="0"][data-type="flash"]');
    await page.evaluate(() => {
      const slider = document.querySelector('[data-duration-index="1"]');
      slider.value = "0.9";
      slider.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.click("#saveButton");
    await page.waitForTimeout(450);
    const saved = await page.evaluate(() => window.CutLoop.getSummary());
    assert(
      saved.sceneOrder.join(",") === "tide-signal,first-light,soft-geometry",
      "场景顺序可以调整"
    );

    await page.reload({ waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    const restored = await page.evaluate(() => window.CutLoop.getSummary());
    assert(
      restored.sceneOrder.join(",") === saved.sceneOrder.join(","),
      "重载后恢复场景顺序",
      `${restored.sceneOrder.join(",")}`
    );
    assert(
      restored.transitions[0].type === "flash" &&
        Math.abs(restored.transitions[1].duration - 0.9) < 0.001,
      "重载后恢复转场类型与时长"
    );

    const report = {
      generatedAt: new Date().toISOString(),
      passed: assertions.every((item) => item.passed),
      assertions,
      lumaByType,
      restoredProject: restored
    };
    await writeFile(
      join(screenshots, "player-test-report.json"),
      JSON.stringify(report, null, 2)
    );
    console.log(JSON.stringify(report, null, 2));
  } finally {
    if (browser) await browser.close();
    child.kill("SIGTERM");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
