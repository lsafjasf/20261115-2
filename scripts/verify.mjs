import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import jsQR from "jsqr";
import { PNG } from "pngjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifacts = path.join(root, "artifacts");
const port = await new Promise((resolve, reject) => {
  const probe = net.createServer();
  probe.once("error", reject);
  probe.listen(0, "127.0.0.1", () => {
    const assignedPort = probe.address().port;
    probe.close(() => resolve(assignedPort));
  });
});
const baseUrl = `http://127.0.0.1:${port}`;

fs.mkdirSync(artifacts, { recursive: true });

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function decodeDataUrl(dataUrl) {
  const png = PNG.sync.read(Buffer.from(dataUrl.split(",")[1], "base64"));
  const result = jsQR(
    new Uint8ClampedArray(png.data),
    png.width,
    png.height,
    { inversionAttempts: "attemptBoth" },
  );
  return { png, result };
}

function saveDataUrl(dataUrl, filename) {
  fs.writeFileSync(
    path.join(artifacts, filename),
    Buffer.from(dataUrl.split(",")[1], "base64"),
  );
}

async function waitForServer() {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(baseUrl);
      if (response.ok) {
        return;
      }
    } catch {
      // The dev server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error("Vite server did not start in time");
}

const server = spawn(
  process.execPath,
  [
    path.join(root, "node_modules/vite/bin/vite.js"),
    "--host",
    "127.0.0.1",
    "--port",
    String(port),
    "--strictPort",
  ],
  { cwd: root, stdio: ["ignore", "pipe", "pipe"] },
);

let browser;
try {
  await waitForServer();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 980 },
    deviceScaleFactor: 1,
  });
  const consoleErrors = [];
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });

  await page.goto(baseUrl, { waitUntil: "networkidle" });
  assert(
    (await page.title()).startsWith("SCANFRAME"),
    "Verification server responded with the wrong application",
  );
  await page.waitForFunction(
    () => window.scanframe && document.body.dataset.ready === "true",
  );

  const designs = await page.evaluate(() => window.scanframe.buildDesigns());
  assert(designs.length === 2, "Expected exactly two generated designs");

  const designReport = [];
  for (const [index, design] of designs.entries()) {
    const order = String(index + 1).padStart(2, "0");
    saveDataUrl(design.posterDataUrl, `design-${order}-${design.id}.png`);
    saveDataUrl(
      design.cleanDataUrl,
      `design-${order}-${design.id}-original.png`,
    );

    const poster = decodeDataUrl(design.posterDataUrl);
    const original = decodeDataUrl(design.cleanDataUrl);
    assert(
      poster.result?.data === design.destination,
      `${design.id}: full poster did not decode to its destination`,
    );
    assert(
      original.result?.data === design.destination,
      `${design.id}: original QR did not decode to its destination`,
    );
    assert(
      poster.png.width === 1200 && poster.png.height === 1600,
      `${design.id}: poster dimensions are not 1200 × 1600`,
    );
    assert(
      design.finderAudit.length === 3 &&
        design.finderAudit.every((finder) => finder.ok && finder.matched === 49),
      `${design.id}: one or more finder patterns are incomplete`,
    );

    designReport.push({
      id: design.id,
      decoded: poster.result.data,
      posterSize: [poster.png.width, poster.png.height],
      finderAudit: design.finderAudit,
      contrast: Number(design.analysis.p10.toFixed(2)),
      level: design.analysis.level,
    });
  }

  const risky = await page.evaluate(() =>
    window.scanframe.setState({
      foreground: "#B1A68F",
      background: "#F0E5CF",
      texture: "dots",
      textureStrength: 55,
    }),
  );
  assert(risky.analysis.level === "critical", "Low contrast was not flagged");
  assert(
    risky.analysis.criticalCount > 0 && risky.analysis.riskZones.length > 0,
    "Risk zones were not calculated",
  );
  assert(
    risky.finderAudit.every((finder) => finder.ok),
    "Finder patterns were damaged in the risky state",
  );

  await page.locator("#heatmapToggle").click();
  assert(
    (await page.locator("#heatmapToggle").getAttribute("aria-pressed")) ===
      "true",
    "Heatmap toggle did not activate",
  );
  assert(
    (await page.locator("#riskBadge").innerText()) === "高风险",
    "Risk badge did not show the high-risk state",
  );
  assert(
    (await page.locator("#riskZones").innerText()).includes("模块"),
    "High-risk areas were not exposed in the UI",
  );
  await page.screenshot({ path: path.join(artifacts, "ui-risk.png") });

  await page.locator('[data-preset="tide"]').click();
  await page.waitForTimeout(200);
  await page.evaluate(() => window.scanframe.setHeatmap(true));

  const posterDownloadPromise = page.waitForEvent("download");
  await page.locator("#exportTop").click();
  const posterDownload = await posterDownloadPromise;
  assert(
    posterDownload.suggestedFilename().includes("finders-3of3"),
    "Poster filename does not include the finder audit result",
  );
  const exportedPosterPath = path.join(artifacts, "export-poster.png");
  await posterDownload.saveAs(exportedPosterPath);
  const exportedPng = PNG.sync.read(fs.readFileSync(exportedPosterPath));
  const exportedDecode = jsQR(
    new Uint8ClampedArray(exportedPng.data),
    exportedPng.width,
    exportedPng.height,
    { inversionAttempts: "attemptBoth" },
  );
  assert(
    exportedDecode?.data === "https://scanframe.studio/tide-archive",
    "Downloaded poster PNG did not decode",
  );
  assert(
    exportedPng.width === 1200 && exportedPng.height === 1600,
    "Downloaded poster has the wrong dimensions",
  );

  const rawDownloadPromise = page.waitForEvent("download");
  await page.locator("#downloadRaw").click();
  const rawDownload = await rawDownloadPromise;
  const exportedRawPath = path.join(artifacts, "export-original-qr.png");
  await rawDownload.saveAs(exportedRawPath);
  const exportedRawPng = PNG.sync.read(fs.readFileSync(exportedRawPath));
  const exportedRawDecode = jsQR(
    new Uint8ClampedArray(exportedRawPng.data),
    exportedRawPng.width,
    exportedRawPng.height,
    { inversionAttempts: "attemptBoth" },
  );
  assert(
    exportedRawDecode?.data === "https://scanframe.studio/tide-archive",
    "Downloaded original QR did not decode",
  );

  await page.evaluate(() => window.scanframe.setHeatmap(false));
  await page.waitForTimeout(2300);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.locator(".control-panel").evaluate((element) => {
    element.scrollTop = 0;
  });
  await page.screenshot({ path: path.join(artifacts, "ui-final.png") });
  await page.locator(".control-panel").evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await page.screenshot({ path: path.join(artifacts, "ui-risk-report.png") });

  assert(consoleErrors.length === 0, `Console errors: ${consoleErrors.join("; ")}`);

  const report = {
    generatedDesigns: designReport,
    riskyState: {
      contrast: Number(risky.analysis.p10.toFixed(2)),
      level: risky.analysis.level,
      criticalModules: risky.analysis.criticalCount,
      zones: risky.analysis.riskZones,
      findersIntact: risky.finderAudit.every((finder) => finder.ok),
    },
    exports: {
      poster: {
        size: [exportedPng.width, exportedPng.height],
        decoded: exportedDecode.data,
      },
      originalQR: {
        size: [exportedRawPng.width, exportedRawPng.height],
        decoded: exportedRawDecode.data,
      },
    },
    consoleErrors,
  };

  fs.writeFileSync(
    path.join(artifacts, "verification.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}
