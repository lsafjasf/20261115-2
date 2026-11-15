// 逐音符分析冷/热两版 WAV 的基频，输出温度改变音高的量化报告。
import { readWavMono, estimatePitch } from './pitch.mjs';
import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';

const OUT = join(import.meta.dirname, '..', 'artifacts');
const NOTE_GAP = 0.45;
const NOTES = ['E4', 'E4', 'F4', 'G4', 'G4', 'F4', 'E4', 'D4', 'C4', 'C4', 'D4', 'E4'];

async function analyze(file) {
  const { rate, samples } = await readWavMono(file);
  return NOTES.map((note, i) => {
    const start = Math.floor((i * NOTE_GAP + 0.12) * rate);
    const win = samples.slice(start, start + Math.floor(0.16 * rate));
    return { note, freq: estimatePitch(win, rate) };
  });
}

const cold = await analyze(join(OUT, 'melody-cold.wav'));
const hot = await analyze(join(OUT, 'melody-heated.wav'));

const lines = ['# 温度对音高影响的音频分析报告', ''];
lines.push('| # | 音符 | 冷态基频 (Hz) | 热态基频 (Hz) | 偏差 (cent) |');
lines.push('|---|------|--------------|--------------|------------|');
cold.forEach((c, i) => {
  const cents = 1200 * Math.log2(hot[i].freq / c.freq);
  lines.push(
    `| ${i + 1} | ${c.note} | ${c.freq.toFixed(2)} | ${hot[i].freq.toFixed(2)} | ${cents.toFixed(1)} |`);
});
const firstShift = 1200 * Math.log2(hot[0].freq / cold[0].freq);
lines.push('');
lines.push(`首音 (E4) 冷态 ${cold[0].freq.toFixed(2)} Hz → 热态 ${hot[0].freq.toFixed(2)} Hz，`
  + `偏移 ${firstShift.toFixed(1)} cent（负值表示加热后音高降低）。`);

const report = lines.join('\n');
await writeFile(join(OUT, 'pitch-report.md'), report + '\n');
console.log(report);
