// 实际跑一局双人同步排水，再跑一局单人兼任，输出完整时间线到 artifacts。
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runDriver } from './drivers.js';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, '../artifacts');
mkdirSync(outDir, { recursive: true });

function summarize(label, { engine, milestones }) {
  const line = [
    `[${label}]`,
    `结果=${engine.success ? '成功' : '失败'}`,
    `用时=${engine.timeUsed.toFixed(1)}s`,
    `水位=${engine.level.toFixed(1)}`,
    `热量=${engine.heat.toFixed(0)}`,
    `行程=${engine.strokeCount}`,
    `有效=${engine.routedCount}`,
    `错阀=${engine.wrongCount}`,
    `过热=${engine.seizureCount}`,
    `池A=${engine.pools[0].level.toFixed(1)}`,
    `池B=${engine.pools[1].level.toFixed(1)}`,
  ].join(' ');
  console.log(line);
  for (const m of milestones) {
    console.log(
      `  t=${m.t}s 水位=${m.level.toFixed(1)} 热量=${m.heat.toFixed(0)} ` +
      `阀门=${m.valve} A=${m.A.toFixed(1)} B=${m.B.toFixed(1)} ` +
      `行程=${m.strokes} 错阀=${m.wrong} 过热=${m.seized}`,
    );
  }
  return { label, ...engine, milestones };
}

const duo = runDriver('duo', { log: true });
const solo = runDriver('solo', { log: true });
const duoSummary = summarize('双人', duo);
const soloSummary = summarize('单人', solo);

writeFileSync(
  resolve(outDir, 'drainage-run.json'),
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      duo: duoSummary,
      solo: soloSummary,
    },
    null,
    2,
  ),
);
console.log(`时间线已写入 ${resolve(outDir, 'drainage-run.json')}`);

if (!duo.engine.success || solo.engine.success) process.exitCode = 1;
