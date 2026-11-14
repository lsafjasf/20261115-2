import { test, expect } from "@playwright/test";
import path from "node:path";

const snapshot = (page) => page.evaluate(() => window.__DUAL_SYNC__.snapshot());

async function tuneToStage(page, state) {
  const center = Math.round((state.frequencyTarget[0] + state.frequencyTarget[1]) / 2);
  const difference = center - state.frequency;
  const presses = Math.max(1, Math.round(Math.abs(difference) / 1.5));
  const key = difference >= 0 ? "KeyD" : "KeyA";
  for (let index = 0; index < presses; index += 1) await page.keyboard.press(key);
}

async function waitForTargetWindow(page) {
  await page.waitForFunction(
    () => {
      const state = window.__DUAL_SYNC__.snapshot();
      const target = state.nextTarget;
      if (!target || state.paused) return false;
      const distance = target.time - state.audio.currentTime;
      return distance <= 0.1 && distance >= -0.18;
    },
    null,
    { timeout: 7_000, polling: 25 },
  );
  return snapshot(page);
}

async function triggerBothPlayers(page, target) {
  const lampKey = String(target.lamp + 1);
  await Promise.all([
    page.keyboard.press("Space"),
    page.keyboard.press(lampKey),
  ]);
}

test("two operators lock three movements and pause freezes audio and light", async ({ page }, testInfo) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto("/");
  await expect(page.locator("#intro")).toBeVisible();
  await page.screenshot({ path: path.join("artifacts", "dual-sync-intro.png"), fullPage: true });

  await page.locator("#start-button").click();
  await expect.poll(async () => (await snapshot(page)).audio.state, { timeout: 3_000 }).toBe("running");

  let stageSeen = -1;
  let pauseVerified = false;
  let firstPair = null;
  let pausedCanvas = null;

  for (let guard = 0; guard < 40; guard += 1) {
    let state = await snapshot(page);
    if (state.phase === "complete") break;

    if (state.stageIndex !== stageSeen) {
      stageSeen = state.stageIndex;
      await tuneToStage(page, state);
      state = await snapshot(page);
      expect(state.tuningValid).toBe(true);
    }

    if (!state.nextTarget) {
      await page.waitForFunction(
        () => {
          const current = window.__DUAL_SYNC__.snapshot();
          return current.phase === "complete" || Boolean(current.nextTarget);
        },
        null,
        { timeout: 9_000, polling: 50 },
      );
      continue;
    }

    state = await waitForTargetWindow(page);
    const target = state.nextTarget;
    await triggerBothPlayers(page, target);

    await page.waitForFunction(
      (targetIndex) => {
        const current = window.__DUAL_SYNC__.snapshot();
        const targetState = current.targets.find((item) => item.index === targetIndex);
        return targetState?.status !== "pending" || current.phase !== "playing";
      },
      target.index,
      { timeout: 2_000, polling: 25 },
    );

    state = await snapshot(page);
    const beat = state.targets.find((item) => item.index === target.index);
    expect(beat.status, `stage ${state.stageIndex + 1}, beat ${target.index + 1}`).toBe("hit");

    if (!firstPair && state.lastLock) {
      firstPair = state.lastLock;
      expect(state.lastLock.aAt).not.toBeNull();
      expect(state.lastLock.bAt).not.toBeNull();
      expect(state.lastLock.difference).toBeLessThanOrEqual(0.180);
      await page.screenshot({ path: path.join("artifacts", "dual-sync-live.png"), fullPage: true });

      await page.keyboard.press("KeyP");
      await expect
        .poll(async () => {
          const paused = await snapshot(page);
          return `${paused.audio.state}:${paused.audio.masterGain}`;
        }, { timeout: 2_000 })
        .toBe("suspended:0");

      const pausedAt = await snapshot(page);
      pausedCanvas = await page.evaluate(() => window.__DUAL_SYNC__.canvasDataUrl());
      await page.waitForTimeout(650);
      const pausedLater = await snapshot(page);
      const laterCanvas = await page.evaluate(() => window.__DUAL_SYNC__.canvasDataUrl());

      expect(pausedAt.paused).toBe(true);
      expect(pausedAt.audio.currentTime).toBeCloseTo(pausedLater.audio.currentTime, 6);
      expect(pausedAt.lastLock.at).toBeCloseTo(pausedLater.lastLock.at, 6);
      expect(laterCanvas).toBe(pausedCanvas);
      await page.screenshot({ path: path.join("artifacts", "dual-sync-paused.png"), fullPage: true });

      await page.keyboard.press("KeyP");
      await expect.poll(async () => (await snapshot(page)).audio.state, { timeout: 2_000 }).toBe("running");
      const resumed = await snapshot(page);
      expect(resumed.audio.currentTime).toBeGreaterThan(pausedLater.audio.currentTime);
      expect(await page.evaluate(() => window.__DUAL_SYNC__.canvasDataUrl())).not.toBe(pausedCanvas);
      pauseVerified = true;
    }
  }

  await expect(page.locator("#result-screen")).toBeVisible({ timeout: 3_000 });
  await expect(page.locator("#result-title")).toContainText("三段同频");
  const finalState = await snapshot(page);
  expect(finalState.phase).toBe("complete");
  expect(finalState.completionStats.hits).toBeGreaterThanOrEqual(15);
  expect(finalState.totalAlarms).toBe(0);
  expect(errors).toEqual([]);
  expect(pauseVerified).toBe(true);
  expect(firstPair.difference).toBeLessThanOrEqual(0.180);

  await testInfo.attach("final-result.png", {
    body: await page.screenshot({ path: path.join("artifacts", "dual-sync-complete.png"), fullPage: true }),
    contentType: "image/png",
  });
});
