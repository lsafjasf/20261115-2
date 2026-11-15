// 导出：WebVTT、当前帧 PNG、十条字幕检查图 PNG

import { formatVttTime } from './cues.js';
import { buildContactSheet } from './render.js';

export function buildVtt(cues) {
  const body = cues.map((cue) => {
    const range = `${formatVttTime(cue.start)} --> ${formatVttTime(cue.end)}` +
      ' align:center position:50%';
    return `${cue.id}\n${range}\n${cue.text}`;
  }).join('\n\n');
  return `WEBVTT\n\n${body}\n`;
}

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportVtt(cues) {
  const blob = new Blob([buildVtt(cues)], { type: 'text/vtt;charset=utf-8' });
  download(blob, 'subtitles.vtt');
}

export function exportCurrentFrame(canvas) {
  canvas.toBlob((blob) => {
    if (blob) download(blob, 'subtitle-frame.png');
  }, 'image/png');
}

export function exportContactSheet(canvas, cues, layouts, opts) {
  const sheet = buildContactSheet(canvas, cues, layouts, opts);
  sheet.toBlob((blob) => {
    if (blob) download(blob, 'subtitle-checksheet.png');
  }, 'image/png');
}
