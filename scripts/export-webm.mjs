import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launchBrowser } from "./browser.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const artifactPath = join(root, "artifacts", "transition-player.webm");

function startServer() {
  const child = spawn(process.execPath, ["scripts/serve.mjs"], {
    cwd: root,
    env: { ...process.env, PORT: "0" },
    stdio: ["ignore", "pipe", "pipe"]
  });
  const ready = new Promise((resolveReady, rejectReady) => {
    const timer = setTimeout(
      () => rejectReady(new Error("本地服务启动超时")),
      10000
    );
    child.stdout.on("data", (chunk) => {
      const match = /running at (http:\/\/[^\s]+)/.exec(chunk.toString());
      if (match) {
        clearTimeout(timer);
        resolveReady(match[1]);
      }
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      rejectReady(new Error(`本地服务退出，代码 ${code}`));
    });
  });
  return { child, ready };
}

async function main() {
  await mkdir(dirname(artifactPath), { recursive: true });
  const { child, ready } = startServer();
  let browser = null;

  try {
    const baseUrl = await ready;
    browser = await launchBrowser();
    const page = await browser.newPage({
      viewport: { width: 1500, height: 980 },
      deviceScaleFactor: 1
    });
    const consoleErrors = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => consoleErrors.push(error.message));

    await page.goto(baseUrl, {
      waitUntil: "networkidle"
    });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(1200);

    const summary = await page.evaluate(() => window.CutLoop.getSummary());
    const stage = page.locator("#previewCanvas");
    await page.screenshot({
      path: join(root, "artifacts", "player-interface.png"),
      fullPage: true
    });
    await stage.screenshot({
      path: join(root, "artifacts", "player-stage.png")
    });

    const downloadPromise = page.waitForEvent("download", { timeout: 90000 });
    await page.click("#exportButton");
    const download = await downloadPromise;
    await download.saveAs(artifactPath);
    await page.waitForTimeout(1000);

    const exportMeta = await page.evaluate(
      () => window.__CUTLOOP_LAST_EXPORT__ || null
    );
    const result = {
      generatedAt: new Date().toISOString(),
      artifact: "artifacts/transition-player.webm",
      suggestedFilename: download.suggestedFilename(),
      project: summary,
      exportMeta,
      consoleErrors
    };
    await writeFile(
      join(root, "artifacts", "export-summary.json"),
      JSON.stringify(result, null, 2)
    );
    console.log(JSON.stringify(result, null, 2));
  } finally {
    if (browser) await browser.close();
    child.kill("SIGTERM");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
