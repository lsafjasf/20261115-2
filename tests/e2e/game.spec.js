import { test, expect } from "@playwright/test";

test("Canvas 场景可加载并完成默认成功局", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("canvas#map-canvas")).toBeVisible();
  const canvasSize = await page.locator("canvas#map-canvas").evaluate((canvas) => ({
    width: canvas.width,
    height: canvas.height,
  }));
  expect(canvasSize.width).toBeGreaterThan(500);
  expect(canvasSize.height).toBeGreaterThan(300);
  await expect(page.locator("#primary-label")).toHaveText("开始运输");

  const result = await page.evaluate(() => {
    window.__polarFreight.start();
    return window.__polarFreight.fastForward(80).result;
  });

  expect(result.success).toBe(true);
  expect(result.onTime).toBeGreaterThanOrEqual(2);
  expect(result.unsafe).toHaveLength(0);
  await expect(page.locator("#result-overlay")).toBeVisible();
  await expect(page.locator("#result-title")).toHaveText("药品安全抵达");
});

test("低电量走中线触发断电与货温超限", async ({ page }) => {
  await page.goto("/");
  const truckCard = page.locator('[data-truck-id="T-01"]');
  await truckCard.locator('[data-action="route"][data-value="direct"]').click();
  await truckCard.locator('[data-action="cooling"][data-value="max"]').click();
  await expect(
    truckCard.locator('[data-action="route"][data-value="direct"]'),
  ).toHaveClass(/active/);
  await expect(
    truckCard.locator('[data-action="cooling"][data-value="max"]'),
  ).toHaveClass(/active/);
  await page.locator("#primary-action").click();
  const result = await page.evaluate(() =>
    window.__polarFreight.fastForward(80).result,
  );

  expect(result.success).toBe(false);
  expect(result.outcome).toBe("cold-chain-breach");
  expect(result.powerRelatedBreach).toBe(true);
  expect(result.powerFailure).toContain("T-01");
  expect(result.unsafe).toContain("T-01");
  expect(result.trucks.find((truck) => truck.id === "T-01").temperature).toBeGreaterThan(8);
  await expect(page.locator("#result-overlay")).toBeVisible();
  await expect(page.locator("#result-title")).toHaveText("货温超限，药品拦截");
  await expect(page.locator("#result-stats")).toContainText("2/3");
});
