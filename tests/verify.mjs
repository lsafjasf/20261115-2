import { createServer } from "node:http";
import { readFile, stat, mkdir, writeFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { chromium } from "playwright";

const root = normalize(join(import.meta.dirname, ".."));
const artifacts = join(root, "artifacts");
const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".ttf": "font/ttf",
  ".png": "image/png",
};

function startServer() {
  const server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, "http://local").pathname);
      const target = pathname === "/" ? join(root, "index.html") : join(root, pathname);
      if (!target.startsWith(root) || !(await stat(target)).isFile()) {
        response.writeHead(404).end("Not found");
        return;
      }
      const data = await readFile(target);
      response.writeHead(200, {
        "Content-Type": mime[extname(target)] || "application/octet-stream",
      });
      response.end(data);
    } catch {
      response.writeHead(404).end("Not found");
    }
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve({ server, port: server.address().port });
    });
  });
}

async function pngSize(path) {
  const data = await readFile(path);
  const signature = data.subarray(0, 8).toString("hex");
  if (signature !== "89504e470d0a1a0a") throw new Error(`${path} is not a PNG`);
  return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
}

async function saveDownload(page, selector, target) {
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.click(selector),
  ]);
  await download.saveAs(target);
  return pngSize(target);
}

await mkdir(artifacts, { recursive: true });
const { server, port } = await startServer();
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
  acceptDownloads: true,
});
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});

try {
  await page.goto(`http://127.0.0.1:${port}`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.foldReady === true);
  await page.evaluate(() => document.fonts.ready);

  const results = [];
  for (const [name, file] of [
    ["front", "view-a-front.png"],
    ["side", "view-b-side.png"],
  ]) {
    await page.evaluate((view) => window.foldApp.setView(view), name);
    await page.waitForTimeout(900);
    const audit = await page.evaluate(() => window.foldApp.audit());
    const screenshot = join(artifacts, file);
    await page.screenshot({ path: screenshot, fullPage: true });
    results.push({ name, file, audit });
  }

  await page.evaluate(() => window.foldApp.setView("front"));
  await page.waitForTimeout(800);
  const lightA = await page.evaluate(() => {
    window.foldApp.setLight(48, 55);
    return window.foldApp.audit();
  });
  await page.evaluate(() => window.foldApp.setLight(140, 55));
  await page.waitForTimeout(120);
  const lightB = await page.evaluate(() => window.foldApp.audit());
  await page.screenshot({
    path: join(artifacts, "light-from-other-side.png"),
    fullPage: true,
  });
  await page.evaluate(() => window.foldApp.setLight(48, 55));
  const flat = await saveDownload(page, "#exportFlat", join(artifacts, "export-flat.png"));
  const view = await saveDownload(page, "#exportView", join(artifacts, "export-view-front.png"));

  const before = await page.evaluate(() => ({
    yaw: window.foldApp.state.yaw,
    pitch: window.foldApp.state.pitch,
  }));
  const box = await page.locator("#canvasWrap").boundingBox();
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.48);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.66, box.y + box.height * 0.39, {
    steps: 12,
  });
  await page.mouse.up();
  await page.waitForTimeout(700);
  const after = await page.evaluate(() => ({
    yaw: window.foldApp.state.yaw,
    pitch: window.foldApp.state.pitch,
  }));

  const report = {
    views: results,
    exports: { flat, view },
    light: { from48: lightA.lighting, from140: lightB.lighting },
    drag: { before, after },
    errors,
    checks: {
      noOverlap: results.every(({ audit }) => audit.overlaps.length === 0),
      insidePanels: results.every(({ audit }) => audit.outside.length === 0),
      anglesDiffer:
        Math.abs(
          results[0].audit.view.degrees - results[1].audit.view.degrees,
        ) >= 15,
      flatDimensions: flat.width === 2048 && flat.height === 1100,
      lightChangesShading: JSON.stringify(lightA.lighting) !== JSON.stringify(lightB.lighting),
      readablePanels: results.every(({ audit }) =>
        audit.scaled20pxCopy.every((size) => size >= 6.5),
      ),
      dragChangedView:
        Math.abs(after.yaw - before.yaw) > 0.02 ||
        Math.abs(after.pitch - before.pitch) > 0.02,
      noRuntimeErrors: errors.length === 0,
    },
  };
  await writeFile(join(artifacts, "verification.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (!Object.values(report.checks).every(Boolean)) process.exitCode = 1;
} finally {
  await browser.close();
  server.close();
}
