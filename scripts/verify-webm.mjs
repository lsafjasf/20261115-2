import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { launchBrowser } from "./browser.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const targetArg = process.argv[2];
const targetPath = targetArg
  ? resolve(targetArg)
  : join(root, "artifacts", "transition-player.webm");
const relativeTarget = targetPath.slice(root.length + 1).replaceAll("\\", "/");

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
  const fileInfo = await stat(targetPath);
  const { child, ready } = startServer();
  let browser = null;

  try {
    const baseUrl = await ready;
    browser = await launchBrowser();
    const page = await browser.newPage();
    await page.goto(baseUrl, {
      waitUntil: "domcontentloaded"
    });

    const analysis = await page.evaluate(async ({ videoPath }) => {
      const video = document.createElement("video");
      video.muted = true;
      video.playsInline = true;
      video.preload = "auto";
      video.crossOrigin = "anonymous";
      video.src = videoPath;
      document.body.appendChild(video);
      video.style.position = "fixed";
      video.style.left = "-9999px";

      await new Promise((resolveLoad, rejectLoad) => {
        video.addEventListener("loadeddata", resolveLoad, { once: true });
        video.addEventListener(
          "error",
          () => rejectLoad(new Error(`视频解码失败 ${video.error?.message || ""}`)),
          { once: true }
        );
        video.load();
      });

      if (!Number.isFinite(video.duration)) {
        await new Promise((resolveSeek) => {
          const timeout = setTimeout(resolveSeek, 2200);
          video.addEventListener(
            "seeked",
            () => {
              clearTimeout(timeout);
              resolveSeek();
            },
            { once: true }
          );
          video.currentTime = 1e9;
        });
      }

      const duration = Number.isFinite(video.duration)
        ? video.duration
        : 0;
      if (!duration) throw new Error("无法读取视频时长");

      const sampleWidth = 320;
      const sampleHeight = Math.round(
        (video.videoHeight / video.videoWidth) * sampleWidth
      );
      const canvas = document.createElement("canvas");
      canvas.width = sampleWidth;
      canvas.height = sampleHeight;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      const fps = 30;
      const sampleCount = Math.max(1, Math.floor(duration * fps) + 1);
      const frames = [];

      async function seek(time) {
        if (Math.abs(video.currentTime - time) < 0.0005) {
          await new Promise((resolveFrame) => requestAnimationFrame(resolveFrame));
          return;
        }
        await new Promise((resolveSeek, rejectSeek) => {
          const timeout = setTimeout(
            () => rejectSeek(new Error(`跳转到 ${time.toFixed(3)}s 超时`)),
            4000
          );
          video.addEventListener(
            "seeked",
            () => {
              clearTimeout(timeout);
              resolveSeek();
            },
            { once: true }
          );
          video.currentTime = time;
        });
      }

      for (let index = 0; index < sampleCount; index += 1) {
        const time = Math.min(duration - 0.0005, index / fps);
        await seek(Math.max(0, time));
        context.drawImage(video, 0, 0, sampleWidth, sampleHeight);
        const pixels = context.getImageData(
          0,
          0,
          sampleWidth,
          sampleHeight
        ).data;
        let lumaSum = 0;
        let maxLuma = 0;
        let minLuma = 255;
        let darkPixels = 0;
        for (let pixel = 0; pixel < pixels.length; pixel += 4) {
          const luma =
            pixels[pixel] * 0.2126 +
            pixels[pixel + 1] * 0.7152 +
            pixels[pixel + 2] * 0.0722;
          lumaSum += luma;
          if (luma > maxLuma) maxLuma = luma;
          if (luma < minLuma) minLuma = luma;
          if (luma < 8) darkPixels += 1;
        }
        const pixelCount = pixels.length / 4;
        const meanLuma = lumaSum / pixelCount;
        frames.push({
          index,
          time,
          meanLuma,
          minLuma,
          maxLuma,
          darkRatio: darkPixels / pixelCount
        });
      }

      const blackFrames = frames.filter(
        (frame) => frame.meanLuma < 10 && frame.maxLuma < 24
      );
      const nearBlackFrames = frames.filter(
        (frame) => frame.meanLuma < 16 && frame.maxLuma < 32
      );
      const means = frames.map((frame) => frame.meanLuma);
      return {
        duration,
        width: video.videoWidth,
        height: video.videoHeight,
        fps,
        sampleCount,
        threshold: "meanLuma < 10 && maxLuma < 24",
        blackFrameCount: blackFrames.length,
        blackFrames,
        nearBlackFrameCount: nearBlackFrames.length,
        nearBlackFrames,
        minMeanLuma: Math.min(...means),
        maxMeanLuma: Math.max(...means),
        minFrameMean: frames.reduce((lowest, frame) =>
          frame.meanLuma < lowest.meanLuma ? frame : lowest
        ),
        firstFrame: frames[0],
        lastFrame: frames[frames.length - 1]
      };
    }, { videoPath: `/${relativeTarget}` });

    const fileBuffer = await readFile(targetPath);
    const sha256 = createHash("sha256").update(fileBuffer).digest("hex");
    const report = {
      generatedAt: new Date().toISOString(),
      file: relativeTarget,
      sizeBytes: fileInfo.size,
      sha256,
      passed:
        analysis.blackFrameCount === 0 &&
        analysis.firstFrame.meanLuma >= 10 &&
        analysis.duration > 9.5,
      ...analysis
    };
    await writeFile(
      join(root, "artifacts", "export-verification.json"),
      JSON.stringify(report, null, 2)
    );
    console.log(JSON.stringify(report, null, 2));
    if (!report.passed) process.exitCode = 2;
  } finally {
    if (browser) await browser.close();
    child.kill("SIGTERM");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
