const { test, expect } = require("@playwright/test");

const BASE_URL = process.env.GREENHOUSE_URL || "http://127.0.0.1:4199";

test.use({ viewport: { width: 1440, height: 1040 } });

test("renders the greenhouse without runtime errors", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(BASE_URL, { waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean(window.moonGame));

  await expect(page.locator("#greenhouseCanvas")).toBeVisible();
  await expect(page.locator("#primaryLabel")).toContainText("播种第 1 批");
  const canvasPixels = await page.locator("#greenhouseCanvas").evaluate((canvas) => {
    const ctx = canvas.getContext("2d");
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let lit = 0;
    for (let i = 0; i < data.length; i += 400) {
      if (data[i] + data[i + 1] + data[i + 2] > 24) lit += 1;
    }
    return lit;
  });
  expect(canvasPixels).toBeGreaterThan(500);
  expect(errors).toEqual([]);
  await page.screenshot({ path: "artifacts/greenhouse-initial.png", fullPage: true });
});

test("harvests three batches and carries seed stock each round", async ({ page }) => {
  await page.goto(BASE_URL, { waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean(window.moonGame));

  for (let round = 1; round <= 3; round += 1) {
    expect(await page.evaluate(() => window.moonGame.sim.state.phase)).toBe(
      round === 1 ? "idle" : "interplant",
    );
    expect(await page.evaluate(() => window.moonGame.sim.state.seedStock)).toBe(1);
    await page.click("#primaryBtn");
    await page.evaluate(() => window.moonGame.advance(90));
    expect(await page.evaluate(() => window.moonGame.sim.state.phase)).toBe("ready");
    expect(await page.evaluate(() => window.moonGame.sim.state.growth)).toBe(100);
    await expect(page.locator("#primaryLabel")).toContainText("收获");
    await page.click("#primaryBtn");
    expect(await page.evaluate(() => window.moonGame.sim.state.harvests.length)).toBe(round);
    expect(await page.evaluate(() => window.moonGame.sim.state.seedStock)).toBe(1);
  }

  expect(await page.evaluate(() => window.moonGame.sim.state.phase)).toBe("complete");
  expect(await page.evaluate(() => window.moonGame.summary.rounds)).toBe(3);
  expect(await page.evaluate(() => window.moonGame.summary.seedStock)).toBe(1);
  await expect(page.locator("#completionOverlay")).toHaveClass(/visible/);
  await expect(page.locator("#completionStats")).toContainText("3 / 3");
  await page.waitForTimeout(450);
  await page.screenshot({ path: "artifacts/greenhouse-complete.png", fullPage: true });
});

test("drives the crop into a recoverable overheat event", async ({ page }) => {
  await page.goto(BASE_URL, { waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean(window.moonGame));
  await page.click("#primaryBtn");

  await page.locator("#tempControl").evaluate((input) => {
    input.value = "36";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.locator("#lightControl").evaluate((input) => {
    input.value = "21";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.click("#pumpBtn");
  await page.evaluate(() => window.moonGame.advance(55));

  const hot = await page.evaluate(() => ({
    temp: window.moonGame.sim.state.tempC,
    alerts: window.moonGame.sim.state.overheatAlerts,
    pumpOn: window.moonGame.sim.state.pumpOn,
    heatStress: window.moonGame.sim.state.heatStress,
  }));
  expect(hot.temp).toBeGreaterThanOrEqual(32);
  expect(hot.alerts).toBeGreaterThanOrEqual(1);
  expect(hot.pumpOn).toBe(false);
  await expect(page.locator(".metric.heat")).toHaveClass(/hot/);
  await expect(page.locator("#heatTrend")).toContainText("热区告警");
  await page.waitForTimeout(450);
  await page.screenshot({ path: "artifacts/greenhouse-overheat.png", fullPage: true });

  await page.locator("#tempControl").evaluate((input) => {
    input.value = "20";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.click("#pumpBtn");
  await page.evaluate(() => window.moonGame.advance(45));
  expect(await page.evaluate(() => window.moonGame.sim.state.tempC)).toBeLessThan(32);
  expect(await page.evaluate(() => window.moonGame.sim.state.pumpOn)).toBe(true);
});
