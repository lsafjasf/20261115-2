import { RATIOS, FPS, drawCroppedFrame, getCrop } from "./scene.js";
import { createExportAudioTrack } from "./audio.js";

function waitForEvent(target, eventName, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for ${eventName}`));
    }, timeout);
    const onEvent = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("The exported WebM could not be decoded."));
    };
    const cleanup = () => {
      window.clearTimeout(timer);
      target.removeEventListener(eventName, onEvent);
      target.removeEventListener("error", onError);
    };
    target.addEventListener(eventName, onEvent, { once: true });
    target.addEventListener("error", onError, { once: true });
  });
}

function supportedMimeType() {
  const candidates = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

function makeFileName(clip) {
  const slug = clip.name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
  return `offbeat_${String(clip.id).padStart(2, "0")}_${slug}_${clip.ratio.replace(":", "x")}.webm`;
}

export async function recordClip(clip, options = {}) {
  const {
    subtitles = true,
    smart = true,
    tracking = true,
    onProgress = () => {},
  } = options;
  const ratio = RATIOS[clip.ratio];
  const canvas = document.createElement("canvas");
  canvas.width = ratio.width;
  canvas.height = ratio.height;
  const context = canvas.getContext("2d", { alpha: false });
  const duration = clip.out - clip.in;
  const firstCrop = getCrop(clip.ratio, clip.in, { smart, tracking });
  drawCroppedFrame(context, clip.in, firstCrop, { subtitles });

  const stream = canvas.captureStream(FPS);
  const audio = await createExportAudioTrack(clip.in, duration);
  for (const track of audio.stream.getAudioTracks()) {
    stream.addTrack(track);
  }

  const mimeType = supportedMimeType();
  const recorder = new MediaRecorder(
    stream,
    mimeType
      ? { mimeType, videoBitsPerSecond: 4_500_000, audioBitsPerSecond: 128_000 }
      : { videoBitsPerSecond: 4_500_000, audioBitsPerSecond: 128_000 },
  );
  const chunks = [];
  recorder.addEventListener("dataavailable", (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  });
  const stopped = new Promise((resolve) => {
    recorder.addEventListener("stop", resolve, { once: true });
  });

  recorder.start(250);
  audio.start();
  const startedAt = performance.now();

  await new Promise((resolve) => {
    const tick = () => {
      const elapsed = (performance.now() - startedAt) / 1000;
      const localTime = Math.min(duration, elapsed);
      const time = clip.in + localTime;
      const crop = getCrop(clip.ratio, time, { smart, tracking });
      drawCroppedFrame(context, time, crop, { subtitles });
      onProgress(Math.min(1, elapsed / duration), clip, canvas);
      if (elapsed >= duration) {
        if (recorder.state !== "inactive") recorder.stop();
        resolve();
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  await stopped;
  audio.stop();
  stream.getTracks().forEach((track) => track.stop());
  const blob = new Blob(chunks, { type: mimeType || "video/webm" });
  return {
    blob,
    fileName: makeFileName(clip),
    mimeType: blob.type,
    hasAudio: audio.stream.getAudioTracks().length > 0,
    expectedDuration: duration,
    captureDuration: (performance.now() - startedAt) / 1000,
  };
}

export async function verifyPlayback(recorded, options = {}) {
  const { fullPlayback = true, tolerance = 0.36 } = options;
  const url = URL.createObjectURL(recorded.blob);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "metadata";
  video.src = url;
  video.style.cssText =
    "position:fixed;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none";
  document.body.append(video);

  try {
    await waitForEvent(video, "loadedmetadata", 7000);
    let duration = video.duration;

    if (!Number.isFinite(duration) || duration <= 0) {
      const durationChanged = waitForEvent(video, "durationchange", 5000);
      video.currentTime = 1e9;
      await durationChanged;
      duration = video.duration;
      video.currentTime = 0;
    }

    let playedDuration = null;
    let playbackError = null;
    if (fullPlayback) {
      try {
        video.currentTime = 0;
        await waitForEvent(video, "seeked", 3000);
        const playStarted = performance.now();
        await video.play();
        await waitForEvent(video, "ended", Math.max(8000, duration * 1000 + 2500));
        playedDuration = (performance.now() - playStarted) / 1000;
      } catch (error) {
        playbackError = error.message;
      }
    }

    const delta = Math.abs((Number.isFinite(duration) ? duration : 0) - recorded.expectedDuration);
    return {
      fileName: recorded.fileName,
      width: video.videoWidth,
      height: video.videoHeight,
      expectedDuration: Number(recorded.expectedDuration.toFixed(3)),
      duration: Number.isFinite(duration) ? Number(duration.toFixed(3)) : null,
      playedDuration: playedDuration === null ? null : Number(playedDuration.toFixed(3)),
      delta: Number(delta.toFixed(3)),
      passed: Number.isFinite(duration) && delta <= tolerance,
      playbackError,
      size: recorded.blob.size,
      mimeType: recorded.mimeType,
    };
  } finally {
    video.pause();
    video.removeAttribute("src");
    video.load();
    video.remove();
    URL.revokeObjectURL(url);
  }
}

export function downloadRecording(recorded) {
  const url = URL.createObjectURL(recorded.blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = recorded.fileName;
  anchor.style.display = "none";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1200);
  return url;
}
