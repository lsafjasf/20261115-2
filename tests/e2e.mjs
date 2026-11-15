import assert from "node:assert/strict";
import { createServer } from "node:http";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const exportDir = path.join(root, "exports");
const reportDir = path.join(root, "artifacts", "export-check");
rmSync(exportDir, { recursive: true, force: true });
mkdirSync(exportDir, { recursive: true });
mkdirSync(reportDir, { recursive: true });

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webm": "video/webm",
};

const server = createServer((request, response) => {
  const url = new URL(request.url, "http://127.0.0.1");
  const relative = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const file = path.resolve(root, `.${relative}`);
  if (!file.startsWith(root)) {
    response.writeHead(403).end("Forbidden");
    return;
  }
  try {
    const content = readFileSync(file);
    response.writeHead(200, {
      "Content-Type": mimeTypes[path.extname(file)] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    response.end(content);
  } catch {
    response.writeHead(404).end("Not found");
  }
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const baseUrl = `http://127.0.0.1:${server.address().port}`;

function findChromium() {
  const candidates = [
    process.env.CHROMIUM_PATH,
    chromium.executablePath(),
    "/home/hj/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome",
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  const cacheRoot = path.join(process.env.HOME || "", ".cache", "ms-playwright");
  if (existsSync(cacheRoot)) {
    const builds = readdirSync(cacheRoot)
      .filter((entry) => entry.startsWith("chromium-"))
      .sort()
      .reverse();
    for (const build of builds) {
      const executable = path.join(cacheRoot, build, "chrome-linux64", "chrome");
      if (existsSync(executable)) return executable;
    }
  }
  return undefined;
}

const executablePath = findChromium();
const browser = await chromium.launch({
  headless: true,
  executablePath,
  args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  acceptDownloads: true,
});
const page = await context.newPage();
const pageErrors = [];
const downloadedFiles = new Map();

page.on("pageerror", (error) => pageErrors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error") pageErrors.push(message.text());
});
page.on("download", async (download) => {
  const name = download.suggestedFilename();
  const target = path.join(exportDir, name);
  await download.saveAs(target);
  downloadedFiles.set(name, target);
});

function log(step, detail = "") {
  console.log(`[e2e] ${step}${detail ? ` — ${detail}` : ""}`);
}

try {
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean(window.cropStudio));
  await page.waitForTimeout(500);
  log("page ready", baseUrl);

  const initialState = await page.evaluate(() => ({
    clips: window.cropStudio.clips.map((clip) => ({
      id: clip.id,
      ratio: clip.ratio,
      in: clip.in,
      out: clip.out,
    })),
    rows: document.querySelectorAll(".clip-row").length,
    output: [
      document.querySelector("#outputCanvas").width,
      document.querySelector("#outputCanvas").height,
    ],
  }));
  assert.equal(initialState.clips.length, 3);
  assert.deepEqual(
    initialState.clips.map((clip) => clip.ratio),
    ["16:9", "1:1", "9:16"],
  );
  assert.equal(initialState.rows, 3);
  assert.deepEqual(initialState.output, [960, 540]);
  log("three ratio clips present", initialState.clips.map((clip) => clip.ratio).join(" / "));

  await page.click('.ratio-card[data-ratio="9:16"]');
  await page.waitForTimeout(250);
  const portraitSwitch = await page.evaluate(() => ({
    ratio: window.cropStudio.clips[0].ratio,
    crop: window.cropStudio.getCurrentCrop(),
    output: [
      document.querySelector("#outputCanvas").width,
      document.querySelector("#outputCanvas").height,
    ],
  }));
  assert.equal(portraitSwitch.ratio, "9:16");
  assert.equal(portraitSwitch.crop.w, 405);
  assert.deepEqual(portraitSwitch.output, [540, 960]);
  await page.click('.ratio-card[data-ratio="16:9"]');
  log("ratio switch", "portrait 540×960 then restored");

  await page.locator('.clip-row[data-clip-index="1"]').click();
  const timelineBox = await page.locator("#timelineCanvas").boundingBox();
  const geometry = await page.evaluate(() => window.cropStudio.getTimelineGeometry());
  const xAt = (time) =>
    timelineBox.x + geometry.left + (time / 20) * (geometry.width - geometry.left - geometry.right);
  const laneCenterY = timelineBox.y + geometry.top + geometry.laneHeight * 1.5;
  await page.mouse.move(xAt(12.8), laneCenterY);
  await page.mouse.down();
  await page.mouse.move(xAt(12.6), laneCenterY, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(200);
  const trimmedOut = await page.evaluate(() => window.cropStudio.clips[1].out);
  assert.ok(Math.abs(trimmedOut - 12.6) < 0.03);
  assert.equal(
    await page.locator("#outField").inputValue(),
    "00:12.60",
  );
  await page.locator("#outField").evaluate((input) => {
    input.value = "00:12.80";
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.waitForTimeout(120);
  assert.equal(await page.evaluate(() => window.cropStudio.clips[1].out), 12.8);
  log("timeline trim", "out handle dragged to 12.60s and restored");

  await page.locator('.clip-row[data-clip-index="2"]').click();
  await page.click('.ratio-card[data-ratio="9:16"]');
  await page.waitForTimeout(150);
  await page.locator('.clip-row[data-clip-index="0"]').click();

  await page.click("#playButton");
  await page.waitForTimeout(1400);
  const playbackState = await page.evaluate(() => ({
    time: window.cropStudio.state.time,
    playing: window.cropStudio.state.playing,
    audioPlaying: document.querySelector("#beatBars").classList.contains("is-playing"),
  }));
  assert.ok(playbackState.time > 1.7, "Playback should advance the clip clock.");
  assert.equal(playbackState.playing, true);
  assert.equal(playbackState.audioPlaying, true);
  await page.click("#playButton");
  log("live playback", `clock advanced to ${playbackState.time.toFixed(2)}s with beat meter`);

  const framingAudit = await page.evaluate(() => window.cropStudio.auditFraming());
  assert.equal(framingAudit.length, 3);
  for (const audit of framingAudit) {
    assert.equal(audit.subjectSafe, true, `Subject escaped safe frame in ${audit.ratio}.`);
    assert.equal(audit.captionsInBounds, true, `Caption escaped ${audit.ratio} crop.`);
    assert.ok(audit.sampleCount > 40);
  }
  log(
    "safe-frame audit",
    framingAudit
      .map((audit) => `${audit.ratio}: ${audit.subjectSafe && audit.captionsInBounds ? "PASS" : "FAIL"}`)
      .join(" / "),
  );

  await page.click("#openExportButton");
  await page.waitForSelector(".export-row");
  await page.screenshot({ path: path.join(reportDir, "e2e-queue.png"), fullPage: true });
  await page.click("#confirmExportButton");
  const exportStarted = Date.now();
  await page.waitForFunction(
    () => document.querySelectorAll(".export-row.is-done").length === 3,
    null,
    { timeout: 90_000 },
  );
  const exports = await page.evaluate(() => window.cropStudio.getExports());
  assert.equal(exports.length, 3);
  const expectedDimensions = [
    [960, 540],
    [720, 720],
    [540, 960],
  ];
  for (let index = 0; index < exports.length; index += 1) {
    const verification = exports[index];
    assert.equal(verification.passed, true, `${verification.fileName} failed duration check.`);
    assert.equal(verification.hasAudio, true, `${verification.fileName} has no audio track.`);
    assert.deepEqual(
      [verification.width, verification.height],
      expectedDimensions[index],
      `${verification.fileName} has the wrong dimensions.`,
    );
    assert.ok(verification.delta <= 0.42);
    assert.ok(verification.playedDuration !== null);
  }

  await page.waitForTimeout(1000);
  assert.equal(downloadedFiles.size, 3);
  for (const verification of exports) {
    const file = path.join(exportDir, verification.fileName);
    assert.equal(existsSync(file), true);
    const bytes = readFileSync(file);
    assert.ok(bytes.length > 500_000, "WebM export is unexpectedly small.");
    assert.equal(bytes.subarray(0, 4).toString("hex"), "1a45dfa3");
  }
  await page.screenshot({ path: path.join(reportDir, "e2e-verified.png"), fullPage: true });
  log(
    "three exports verified",
    exports
      .map(
        (result) =>
          `${result.ratio} ${result.width}×${result.height} ${result.duration.toFixed(2)}s`,
      )
      .join(" / "),
  );

  const report = {
    generatedAt: new Date().toISOString(),
    elapsedSeconds: Number(((Date.now() - exportStarted) / 1000).toFixed(2)),
    sourceDuration: 20,
    framingAudit,
    exports,
    downloadedFiles: [...downloadedFiles.keys()],
    pageErrors,
  };
  writeFileSync(
    path.join(reportDir, "verification.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  assert.deepEqual(pageErrors, []);
  log("report written", "artifacts/export-check/verification.json");
} catch (error) {
  console.error(`[e2e] FAILED — ${error.message}`);
  try {
    await page.screenshot({
      path: path.join(reportDir, "e2e-failed.png"),
      fullPage: true,
    });
  } catch {
    // The page can be unavailable when startup itself failed.
  }
  process.exitCode = 1;
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
