import { expect, test } from "@playwright/test";

async function pointFor(page, target) {
  return page.evaluate((key) => window.__YARD_TEST__.getPoint(key), target);
}

async function clickTarget(page, target) {
  const point = await pointFor(page, target);
  const box = await page.locator("#gameCanvas").boundingBox();
  await page.mouse.click(box.x + (point.x / 1180) * box.width, box.y + (point.y / 760) * box.height);
}

async function settleCrane(page) {
  await page.waitForFunction(() => !window.__YARD_TEST__.isBusy());
  await page.waitForTimeout(35);
}

test("complete a real shift and reject a heavy-on-light stack", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/?test=1");
  await page.waitForFunction(() => Boolean(window.__YARD_TEST__));
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator("#completedStat")).toHaveText("0");
  await page.screenshot({ path: "artifacts/yard-initial.png", fullPage: true });

  await clickTarget(page, "stack:A");
  const shipPoint = await pointFor(page, "ship:star");
  const box = await page.locator("#gameCanvas").boundingBox();
  await page.mouse.move(
    box.x + (shipPoint.x / 1180) * box.width,
    box.y + (shipPoint.y / 760) * box.height
  );
  await page.screenshot({ path: "artifacts/yard-crane-path.png", fullPage: true });
  await clickTarget(page, "stack:B");
  const violation = await page.evaluate(() => {
    const state = window.__YARD_TEST__.getState();
    return {
      code: state.violations[0]?.code,
      stacks: state.stacks,
      laneClear: state.laneClear,
      summary: window.__YARD_TEST__.getSummary()
    };
  });
  expect(violation.code).toBe("HEAVY_ON_LIGHT");
  expect(violation.stacks.A).toEqual(["C6", "C1"]);
  expect(violation.stacks.B).toEqual(["C5", "C4"]);
  expect(violation.laneClear).toBe(true);
  expect(violation.summary.violations).toBe(1);
  await expect(page.locator("#toast")).toContainText("重箱不能压在");
  await page.screenshot({ path: "artifacts/yard-violation.png", fullPage: true });

  await page.locator("#newGameButton").click();
  await expect(page.locator("#completedStat")).toHaveText("0");
  expect(await page.evaluate(() => window.__YARD_TEST__.getState().violations.length)).toBe(0);

  await clickTarget(page, "stack:A");
  await clickTarget(page, "ship:star");
  const audio24 = await page.evaluate(() => window.__YARD_TEST__.getAudio());
  expect(audio24.active).toBe(true);
  expect(audio24.loadWeight).toBe(24);
  await settleCrane(page);

  await clickTarget(page, "stack:C");
  await clickTarget(page, "stack:D");
  await settleCrane(page);
  await clickTarget(page, "stack:C");
  await clickTarget(page, "ship:star");
  await settleCrane(page);

  await clickTarget(page, "stack:B");
  await clickTarget(page, "ship:wind");
  const audio12 = await page.evaluate(() => window.__YARD_TEST__.getAudio());
  expect(audio12.active).toBe(true);
  expect(audio12.loadWeight).toBe(12);
  expect(audio12.hz).toBeGreaterThan(audio24.hz);
  await settleCrane(page);

  await clickTarget(page, "stack:D");
  await clickTarget(page, "ship:wind");
  await settleCrane(page);
  await clickTarget(page, "stack:B");
  await clickTarget(page, "ship:horizon");
  await settleCrane(page);
  await clickTarget(page, "stack:A");
  await clickTarget(page, "ship:horizon");
  await settleCrane(page);

  await expect(page.locator("#resultCard")).toBeVisible();
  await expect(page.locator("#resultTitle")).toHaveText("六箱全装 · 满分");
  const finished = await page.evaluate(() => window.__YARD_TEST__.getSummary());
  expect(finished.completed).toBe(6);
  expect(finished.missed).toBe(0);
  expect(finished.violations).toBe(0);
  expect(finished.laneClear).toBe(true);
  expect(finished.phase).toBe("won");
  expect(errors).toEqual([]);
  await page.screenshot({ path: "artifacts/yard-complete.png", fullPage: true });
});
