import { expect, test } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";

const EXPECTED_WINDOW = {
  startIndex: 66,
  endIndex: 105,
  windowStart: "11/10 18:00",
  windowEnd: "11/12 09:00",
};

async function setWindowWithControls(page) {
  await page.evaluate(() => {
    const start = document.querySelector("#startRange");
    start.value = "66";
    start.dispatchEvent(new Event("input", { bubbles: true }));
    const end = document.querySelector("#endRange");
    end.value = "105";
    end.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function readState(page) {
  return page.evaluate(() => window.__tidelens.getState());
}

test("time window and highlighted station persist across all three views", async ({ page }) => {
  mkdirSync("artifacts/verification", { recursive: true });
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);

  await page.locator(".station-chip").filter({ hasText: "深圳蛇口" }).click();
  await setWindowWithControls(page);

  await expect(page.locator("#windowStartLabel")).toHaveText(EXPECTED_WINDOW.windowStart);
  await expect(page.locator("#windowEndLabel")).toHaveText(EXPECTED_WINDOW.windowEnd);
  await expect(page.locator("#windowDuration")).toHaveText("40 H");
  await expect(page.locator("#activeStationName")).toHaveText("深圳蛇口");

  const views = ["heatmap", "line", "profile"];
  for (const view of views) {
    await page.locator(`#tab-${view}`).click();
    await expect(page.locator(`#tab-${view}`)).toHaveAttribute("aria-selected", "true");

    const state = await readState(page);
    expect(state.view).toBe(view);
    expect(state.startIndex).toBe(EXPECTED_WINDOW.startIndex);
    expect(state.endIndex).toBe(EXPECTED_WINDOW.endIndex);
    expect(state.windowStart).toBe(EXPECTED_WINDOW.windowStart);
    expect(state.windowEnd).toBe(EXPECTED_WINDOW.windowEnd);
    expect(state.stationIndex).toBe(4);
    expect(state.highlightedStation).toBe("深圳蛇口");

    const dataset = await page.locator("#tideCanvas").evaluate((canvas) => ({ ...canvas.dataset }));
    expect(dataset).toMatchObject({
      view,
      windowStart: EXPECTED_WINDOW.windowStart,
      windowEnd: EXPECTED_WINDOW.windowEnd,
      highlightedStation: "深圳蛇口",
    });
    await page.screenshot({
      path: `artifacts/verification/${view}.png`,
      fullPage: true,
    });
  }
});

test("hover tooltip reports time, station and height in every view", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
  await page.locator(".station-chip").filter({ hasText: "深圳蛇口" }).click();
  await setWindowWithControls(page);

  const canvas = page.locator("#tideCanvas");
  const box = await canvas.boundingBox();

  for (const view of ["heatmap", "line", "profile"]) {
    await page.locator(`#tab-${view}`).click();
    const point =
      view === "heatmap"
        ? { x: box.x + box.width * 0.55, y: box.y + box.height * 0.62 }
        : view === "line"
          ? { x: box.x + box.width * 0.6, y: box.y + box.height * 0.5 }
          : { x: box.x + box.width * 0.69, y: box.y + box.height * 0.55 };
    await page.mouse.move(point.x, point.y);
    const tooltip = page.locator("#tooltip");
    await expect(tooltip).toHaveClass(/is-visible/);
    await expect(tooltip).toContainText("深圳蛇口");
    await expect(tooltip).toContainText("潮位");
    await expect(tooltip).toContainText(" m");
    await expect(tooltip).toContainText(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}/);
    await page.mouse.move(10, 10);
  }
});

test("exports the current canvas view as a PNG", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
  await page.locator("#tab-profile").click();

  const downloadPromise = page.waitForEvent("download");
  await page.locator("#exportButton").click();
  const download = await downloadPromise;
  const path = await download.path();
  const bytes = readFileSync(path);

  expect(download.suggestedFilename()).toMatch(/^tidelens-profile-\d{3}-\d{3}\.png$/);
  expect(bytes.subarray(1, 4).toString()).toBe("PNG");
  expect(bytes.readUInt32BE(16)).toBeGreaterThan(1000);
  expect(bytes.readUInt32BE(20)).toBeGreaterThan(500);
});
