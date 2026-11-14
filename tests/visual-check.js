const { chromium } = require("/home/hj/userfeedback/uid245/node_modules/playwright");

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: "/home/hj/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome"
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    acceptDownloads: true
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.stack || error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  await page.goto("http://127.0.0.1:5187/", { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  await page.screenshot({ path: "artifacts/open.png", fullPage: true });

  const initial = await page.evaluate(() => {
    if (!window.paperfold) return { missing: true };
    return {
      state: window.paperfold.getState(),
      validation: window.paperfold.validate(),
      metrics: window.paperfold.metrics()
    };
  }).catch((error) => ({ evaluateError: error.message }));

  let mid = null;
  if (!initial.missing && !initial.evaluateError) {
    await page.evaluate(() => window.paperfold.setTime(1.32));
    await page.waitForTimeout(120);
    await page.screenshot({ path: "artifacts/perspective-fold.png", fullPage: true });
    mid = await page.evaluate(() => window.paperfold.metrics());
    mid.perspective = await page.evaluate(() => {
      const state = window.paperfold.getState();
      const cover = window.paperfold.renderer
        .buildPanels(1.32, state.folds)
        .find((panel) => panel.id === "cover");
      const corners = cover.corners;
      const leftHeight = Math.hypot(corners[3].x - corners[0].x, corners[3].y - corners[0].y);
      const rightHeight = Math.hypot(corners[2].x - corners[1].x, corners[2].y - corners[1].y);
      return {
        leftEdgeHeight: leftHeight,
        rightEdgeHeight: rightHeight,
        heightRatio: Math.min(leftHeight, rightHeight) / Math.max(leftHeight, rightHeight),
        angle: window.paperfold.metrics(1.32).angle.cover
      };
    });
    await page.evaluate(() => window.paperfold.setTime(0));
    await page.waitForTimeout(80);
    await page.screenshot({ path: "artifacts/closed.png", fullPage: true });

    const foldCheck = page.evaluate(() => window.paperfold.runFoldCheck());
    await page.waitForTimeout(1250);
    await page.screenshot({ path: "artifacts/check-unfold.png", fullPage: true });
    await page.waitForTimeout(2600);
    await page.screenshot({ path: "artifacts/check-refold.png", fullPage: true });
    const checkReport = await foldCheck;
    const finalState = await page.evaluate(() => window.paperfold.getState());
    mid.checkReport = checkReport;
    mid.finalState = finalState;

    await page.locator("#coverStart").evaluate((input) => {
      input.value = "1.2";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.click("[data-fold='cover'] [data-direction='away']");
    const edited = await page.evaluate(() => window.paperfold.getState());
    const editedValidation = await page.evaluate(() => window.paperfold.validate());
    await page.click("[data-preset='sequence']");

    await page.locator("#scrubber").evaluate((input) => {
      input.value = "3.4";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.waitForTimeout(80);
    const scrubbed = await page.evaluate(() => window.paperfold.metrics());
    mid.editedState = edited;
    mid.editedValidation = editedValidation;
    mid.scrubbed = scrubbed;

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.waitForTimeout(180);
    await page.screenshot({ path: "artifacts/layout-1280.png", fullPage: true });
  }

  console.log(JSON.stringify({ errors, initial, mid }, null, 2));
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
