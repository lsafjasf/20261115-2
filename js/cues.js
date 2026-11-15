// 十条含中文、英文、数字与标点的示例字幕
// 每条 4 秒，间隔 0.5 秒，总时长 45 秒

export const RAW_CUES = [
  '自动字幕经常在词语中间断行，用户可以通过规则编辑器设置中文避头尾。',
  'English words like synchronization and internationalization must never break in the middle.',
  '混合场景：iPhone 16 Pro 支持 4K 120fps 视频录制，售价 7999 元起。',
  '会议将在 15:30 开始，预计耗时 40ms 的接口响应需要优化到 20ms 以内。',
  '第 3 季度营收增长 23.5%，海外市场（含北美与欧洲）贡献超过 60%。',
  'The quick brown fox jumps over the lazy dog，而敏捷的棕色狐狸跳过了懒狗。',
  '请访问 https://example.com/docs/v2 查看 API 文档，或拨打 400-800-1234 咨询。',
  '温度从 -5°C 升到 28°C，温差达到 33°C，记得添衣保暖！',
  '版本 v2.4.1 已发布：修复 12 个问题，性能提升约 2 倍，下载量突破 100000 次。',
  '字幕安全区（Safe Area）以内显示，最大行宽 900px，超出部分会自动标红提示。'
];

export const CUE_GAP = 0.5;
export const CUE_DURATION = 4;
export const TOTAL_DURATION = CUE_GAP + RAW_CUES.length * CUE_DURATION +
  (RAW_CUES.length - 1) * CUE_GAP;

export function buildCues() {
  return RAW_CUES.map((text, index) => {
    const start = CUE_GAP + index * (CUE_DURATION + CUE_GAP);
    return { id: index + 1, start, end: start + CUE_DURATION, text };
  });
}

export function formatVttTime(seconds) {
  const ms = Math.round(seconds * 1000);
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const milli = ms % 1000;
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}.${pad(milli, 3)}`;
}

export function formatClock(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
