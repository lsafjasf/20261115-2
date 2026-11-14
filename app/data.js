/* 18 秒素材：12 次闪光（视频轨）与 12 次节拍（音频轨，原始时刻）。
 * 节拍整体比闪光晚 320ms，因此 -320ms 的音频偏移可使二者完全对齐。 */
window.SYNC_DATA = {
  durationSec: 18,
  defaultToleranceMs: 80,
  flashTimesSec: [
    0.8, 2.3, 3.7, 5.2, 6.6, 8.1,
    9.5, 11.0, 12.4, 13.9, 15.3, 16.8
  ],
  beatTimesSec: [
    1.12, 2.62, 4.02, 5.52, 6.92, 8.42,
    9.82, 11.32, 12.72, 14.22, 15.62, 17.12
  ],
  storageKey: "av-sync-tool:audioOffsetMs"
};
