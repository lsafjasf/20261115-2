import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { extname, join, normalize } from "node:path";

if (
  process.platform === "linux" &&
  readFileSync("/etc/os-release", "utf8").includes('VERSION_ID="26.04"')
) {
  process.env.PLAYWRIGHT_HOST_PLATFORM_OVERRIDE ||= "ubuntu24.04-x64";
}
const { chromium } = await import("playwright");

const ROOT = process.cwd();
const ARTIFACTS = join(ROOT, "artifacts");
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".json": "application/json"
};

function staticServer() {
  return createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
      const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
      const filePath = normalize(join(ROOT, relative));
      if (!filePath.startsWith(ROOT)) throw new Error("forbidden");
      const body = await readFile(filePath);
      response.writeHead(200, {
        "Content-Type": MIME[extname(filePath)] || "application/octet-stream",
        "Cache-Control": "no-store"
      });
      response.end(body);
    } catch {
      response.writeHead(404);
      response.end("Not found");
    }
  });
}

function contentSignature(elements) {
  return elements.map(({ id, type, text, src, name }) => ({
    id,
    type,
    text,
    src,
    name
  }));
}

function assertSnapped(state) {
  const anchorsX = state.grid.xAnchors;
  const anchorsY = state.grid.yAnchors;
  const closeTo = (value, anchors) =>
    anchors.some((anchor) => Math.abs(anchor - value) < 0.01);
  for (const element of state.elements) {
    assert.ok(closeTo(element.x, anchorsX), `${element.id} x edge is not on a column`);
    assert.ok(
      closeTo(element.x + element.width, anchorsX),
      `${element.id} right edge is not on a column`
    );
    assert.ok(closeTo(element.y, anchorsY), `${element.id} y is not on a baseline`);
    assert.ok(
      closeTo(element.y + element.height, anchorsY),
      `${element.id} bottom is not on a baseline`
    );
    assert.ok(element.width > 0 && element.height > 0, `${element.id} lost its dimensions`);
  }
}

await mkdir(ARTIFACTS, { recursive: true });
const server = staticServer();
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address();
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
const consoleErrors = [];
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});
page.on("pageerror", (error) => consoleErrors.push(error.stack || error.message));

try {
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.posterApp && window.posterApp.getState);
  await page.waitForTimeout(350);

  const before = await page.evaluate(() => window.posterApp.getState());
  assert.equal(before.settings.columns, 3);
  assert.equal(before.elements.length, 7);
  assertSnapped(before);
  await page.screenshot({ path: join(ARTIFACTS, "three-columns.png") });

  await page.locator('button[data-columns="4"]').click();
  await page.waitForTimeout(250);
  const after = await page.evaluate(() => window.posterApp.getState());

  assert.equal(after.settings.columns, 4);
  assert.equal(after.elements.length, before.elements.length);
  assert.deepEqual(contentSignature(after.elements), contentSignature(before.elements));
  assertSnapped(after);
  assert.equal(await page.locator("#layerCount").textContent(), "7");
  assert.equal(await page.locator('button[data-columns="4"]').getAttribute("aria-pressed"), "true");

  const oldSpans = before.elements.map((element) => {
    const start = before.grid.columnRects.findIndex((rect) => Math.abs(rect.x - element.x) < 0.01);
    return `${element.id}:${start + 1}/${before.settings.columns}`;
  });
  const newSpans = after.elements.map((element) => {
    const start = after.grid.columnRects.findIndex((rect) => Math.abs(rect.x - element.x) < 0.01);
    const end = after.grid.columnRects.findIndex(
      (rect) => Math.abs(rect.x + rect.width - (element.x + element.width)) < 0.01
    );
    return `${element.id}:${start + 1}-${end + 1}/${after.settings.columns}`;
  });
  await page.screenshot({ path: join(ARTIFACTS, "four-columns.png") });

  await page.locator("#undoButton").click();
  await page.waitForTimeout(150);
  const undone = await page.evaluate(() => window.posterApp.getState());
  assert.equal(undone.settings.columns, 3);
  assert.deepEqual(contentSignature(undone.elements), contentSignature(before.elements));

  await page.locator("#redoButton").click();
  await page.waitForTimeout(150);
  const redone = await page.evaluate(() => window.posterApp.getState());
  assert.equal(redone.settings.columns, 4);

  await page.locator("#gutterRange").evaluate((input) => {
    input.value = "48";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  const widerGutter = await page.evaluate(() => window.posterApp.getState());
  assert.equal(widerGutter.settings.gutter, 48);
  assertSnapped(widerGutter);
  await page.locator("#undoButton").click();
  assert.equal((await page.evaluate(() => window.posterApp.getState())).settings.gutter, 24);

  await page.locator("#baselineRange").evaluate((input) => {
    input.value = "24";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  const widerBaseline = await page.evaluate(() => window.posterApp.getState());
  assert.equal(widerBaseline.settings.baseline, 24);
  assertSnapped(widerBaseline);
  await page.locator("#undoButton").click();
  assert.equal((await page.evaluate(() => window.posterApp.getState())).settings.baseline, 18);

  await page.locator("label.switch-control", { hasText: "自动吸附" }).click();
  const canvasBox = await page.locator("#posterCanvas").boundingBox();
  const toScreen = (x, y) => ({
    x: canvasBox.x + (x / 1080) * canvasBox.width,
    y: canvasBox.y + (y / 1350) * canvasBox.height
  });
  const dragFrom = toScreen(500, 250);
  const dragTo = toScreen(390, 200);
  await page.mouse.move(dragFrom.x, dragFrom.y);
  await page.mouse.down();
  await page.mouse.move(dragTo.x, dragTo.y, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(100);
  const overflowState = await page.evaluate(() => window.posterApp.getState());
  assert.equal(overflowState.settings.snap, false);
  assert.ok(overflowState.elements.some((element) => element.x < 64));
  assert.equal(await page.locator("#safetyAlert").isVisible(), true);
  assert.ok((await page.locator("#safetyAlertText").textContent()).includes("安全区"));
  await page.screenshot({ path: join(ARTIFACTS, "safe-margin-warning.png") });

  await page.locator("#undoButton").click();
  await page.locator("#undoButton").click();
  const restoredAfterWarning = await page.evaluate(() => window.posterApp.getState());
  assert.equal(restoredAfterWarning.settings.snap, true);
  assert.equal(await page.locator("#safetyAlert").isVisible(), false);

  const jsonDownload = page.waitForEvent("download");
  await page.locator("#exportJsonButton").click();
  const jsonFile = join(ARTIFACTS, "layout-export.json");
  await (await jsonDownload).saveAs(jsonFile);
  const layout = JSON.parse(await readFile(jsonFile, "utf8"));
  assert.equal(layout.grid.columns, 4);
  assert.equal(layout.elements.length, 7);
  assert.equal(layout.elements.find((element) => element.id === "title").text, "周六\n引力场");

  const pngDownload = page.waitForEvent("download", { timeout: 20000 });
  await page.locator("#exportPngButton").click();
  const pngFile = join(ARTIFACTS, "poster-export.png");
  await (await pngDownload).saveAs(pngFile);
  const png = await readFile(pngFile);
  assert.equal(png.subarray(1, 4).toString(), "PNG");
  assert.ok(png.length > 100_000, "PNG export is unexpectedly small");

  assert.deepEqual(consoleErrors, []);
  console.log(
    JSON.stringify(
      {
        verified: true,
        before: { columns: 3, elements: before.elements.length, spans: oldSpans },
        after: { columns: 4, elements: after.elements.length, spans: newSpans },
        contentPreserved: true,
        undoRestoredColumns: undone.settings.columns,
        gutterUndoVerified: true,
        baselineUndoVerified: true,
        safeMarginWarningVerified: true,
        pngBytes: png.length,
        jsonBytes: (await readFile(jsonFile)).length,
        screenshots: ["three-columns.png", "four-columns.png", "safe-margin-warning.png"]
      },
      null,
      2
    )
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
