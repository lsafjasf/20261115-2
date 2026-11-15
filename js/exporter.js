import { buildTimeline, resolvePlaybackState } from "./model.js";
import { renderComposition } from "./transitions.js";

const MIME_CANDIDATES = [
  "video/webm;codecs=vp9",
  "video/webm;codecs=vp8",
  "video/webm"
];

function chooseMimeType() {
  if (typeof MediaRecorder === "undefined") {
    throw new Error("当前浏览器不支持 MediaRecorder");
  }
  return (
    MIME_CANDIDATES.find((mimeType) => MediaRecorder.isTypeSupported(mimeType)) ||
    ""
  );
}

function waitForPaint() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });
}

function stopRecorder(recorder) {
  return new Promise((resolve, reject) => {
    recorder.addEventListener("stop", resolve, { once: true });
    recorder.addEventListener(
      "error",
      () => reject(recorder.error || new Error("视频编码失败")),
      { once: true }
    );
    recorder.stop();
  });
}

export async function exportProjectWebM({
  project,
  width = 1280,
  height = 720,
  fps = 30,
  onProgress = () => {}
}) {
  const mimeType = chooseMimeType();
  const timeline = buildTimeline(project);
  const total = timeline.total;
  const totalFrames = Math.ceil(total * fps);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { alpha: false });

  const renderAt = (time) => {
    const state = resolvePlaybackState(timeline, Math.min(time, total));
    renderComposition(context, width, height, state);
  };

  renderAt(0);
  await waitForPaint();
  renderAt(0);

  const stream = canvas.captureStream(fps);
  const videoTrack = stream.getVideoTracks()[0];
  if (videoTrack && "contentHint" in videoTrack) {
    videoTrack.contentHint = "motion";
  }

  const recorderOptions = {
    videoBitsPerSecond: Math.round(width * height * fps * 0.22)
  };
  if (mimeType) recorderOptions.mimeType = mimeType;

  const recorder = new MediaRecorder(stream, recorderOptions);
  const chunks = [];
  recorder.addEventListener("dataavailable", (event) => {
    if (event.data && event.data.size > 0) chunks.push(event.data);
  });

  await waitForPaint();
  renderAt(0);
  recorder.start(100);
  await new Promise((resolve) => setTimeout(resolve, 120));

  const playbackStart = performance.now();
  await new Promise((resolve) => {
    let lastReportedFrame = -1;

    function frame(now) {
      const elapsed = (now - playbackStart) / 1000;
      const time = Math.min(total, elapsed);
      renderAt(time);

      const currentFrame = Math.min(totalFrames, Math.floor(elapsed * fps));
      if (currentFrame !== lastReportedFrame || elapsed >= total) {
        lastReportedFrame = currentFrame;
        onProgress({
          time,
          total,
          frame: currentFrame,
          totalFrames,
          progress: time / total
        });
      }

      if (elapsed < total) {
        requestAnimationFrame(frame);
      } else {
        renderAt(total);
        setTimeout(resolve, 180);
      }
    }

    requestAnimationFrame(frame);
  });

  renderAt(total);
  await new Promise((resolve) => setTimeout(resolve, 100));
  await stopRecorder(recorder);
  videoTrack?.stop();

  const actualMime = recorder.mimeType || mimeType || "video/webm";
  const blob = new Blob(chunks, { type: actualMime });
  if (!blob.size) throw new Error("录制结果为空");

  return {
    blob,
    mimeType: actualMime,
    duration: total,
    totalFrames,
    width,
    height,
    fps
  };
}
