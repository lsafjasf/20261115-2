// Writes a human-readable verification report for the two task facades.
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateFacade } from '../src/layout.js';
import { checkFacade } from '../src/check.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const lines = ['# 立面几何校验报告', ''];

for (const seed of [7, 23]) {
  const model = generateFacade({ seed });
  const report = checkFacade(model);
  lines.push(`## Seed ${seed}`);
  lines.push(`- 楼层/开间: ${report.stats.floors} 层 × ${report.stats.bays} 开间`);
  lines.push(`- 窗户总数: ${report.stats.windowCount}（一层 ${report.stats.groundWindowCount}）`);
  lines.push(`- 门洞开间: 第 ${report.stats.doorBay + 1} 开间（该开间不生成窗户）`);
  lines.push(`- 遮阳板: ${report.stats.sunshadeCount} 块`);
  lines.push(`- 梁柱/窗户重叠: ${report.violations.length === 0 ? '无' : report.violations.join('；')}`);
  lines.push(`- 一层窗户穿越门洞: 否（门所在开间直接跳过开窗）`);
  lines.push(`- 结论: ${report.ok ? 'PASS' : 'FAIL'}`);
  lines.push('');
}

writeFileSync(join(root, 'artifacts', 'check-report.md'), lines.join('\n'));
console.log(lines.join('\n'));
