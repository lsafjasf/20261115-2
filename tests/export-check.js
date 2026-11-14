const fs = require("fs");
const { chromium } = require("/home/hj/userfeedback/uid245/node_modules/playwright");

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: "/home/hj/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome"
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    acceptDownloads: true
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.stack || error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().includes("404")) errors.push(message.text());
  });

  await page.goto("http://127.0.0.1:5187/", { waitUntil: "networkidle" });
  await page.waitForTimeout(300);

  const downloadPromise = page.waitForEvent("download", { timeout: 20000 });
  await page.click("#exportButton");
  await page.waitForTimeout(1100);
  await page.screenshot({ path: "artifacts/export-progress.png", fullPage: true });

  const download = await downloadPromise;
  const outputPath = "artifacts/paperfold_10s.webm";
  await download.saveAs(outputPath);
  await page.waitForTimeout(500);

  const exportResult = await page.evaluate(async () => {
    const result = window.paperfold.lastExport;
    const video = document.createElement("video");
    const metadata = await new Promise((resolve) => {
      video.addEventListener("loadedmetadata", () => resolve({
        duration: video.duration,
        width: video.videoWidth,
        height: video.videoHeight
      }), { once: true });
      video.addEventListener("error", () => resolve({ error: "Could not load WebM" }), { once: true });
      video.src = result.url;
    });
    return {
      filename: result.filename,
      mimeType: result.mimeType,
      size: result.size,
      declarativeDuration: result.duration,
      videoMetadata: metadata
    };
  });

  const file = fs.readFileSync(outputPath);
  const result = {
    errors,
    suggestedFilename: download.suggestedFilename(),
    fileSize: file.length,
    ebmlHeader: file.subarray(0, 4).toString("hex"),
    hasVpCodec: file.includes(Buffer.from("V_VP")),
    hasOpusCodec: file.includes(Buffer.from("A_OPUS")),
    exportResult
  };
  console.log(JSON.stringify(result, null, 2));
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
